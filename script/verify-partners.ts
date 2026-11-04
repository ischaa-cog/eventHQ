// Checks that eventHQ holds exactly what each platform has, for every connected partner.
//
//   npx tsx script/verify-partners.ts --api https://www.mycogportal.com [--days 30]
//
// For the last N complete days (ending two days ago, so late changes have settled) it:
//   1. Re-downloads every partner's data straight from Meta, Whop, Stripe, Fanbasis and HighLevel
//      into a throwaway local database (--ref-db, default the local test Postgres), using the
//      keys in the credentials file and the same sync code eventHQ runs.
//   2. Fetches what the live app stored for the same connections (ids and amounts only).
//   3. Compares them record by record: missing or extra sales, refunds and opt-ins, amount or
//      status differences, and ad spend per day. Meta spend is also compared with Meta's own
//      account total for the period.
// It prints one line per partner and account and saves the details to ~/.eventhq/. Nothing on
// the live site is changed. The local copy is deleted at the end.
process.env.TZ = "UTC"; // the live app runs in UTC; keep local timestamps comparable

import { createHmac } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { apiClient, apiSession } from "./api-session";
import { loadPlan, value, type Planned } from "./partner-plan";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const money = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isPaid = (status: string | null) => !status || status === "paid" || status === "completed";

type Sale = [string, number, string, string]; // dedupe key, amount, status, ISO time
type Records = { sales: Sale[]; spendByDay: Record<string, number>; optIns: Array<[string, string]> };

async function main() {
  const base = (value("api") ?? "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new Error("Pass --api https://your-eventhq-address");
  const days = Math.max(1, Math.min(85, Number(value("days") ?? 30)));
  const to = iso(Date.now() - 2 * DAY);
  const from = iso(Date.parse(to) - (days - 1) * DAY);
  const wideFrom = iso(Date.parse(from) - DAY), wideTo = iso(Date.parse(to) + DAY);
  const inWindow = (t: string) => t.slice(0, 10) >= from && t.slice(0, 10) <= to;

  const { env, mappings, planned } = loadPlan();
  const api = apiClient(base, await apiSession(base));
  const live: Array<{ id: number; name: string }> = await api("GET", "/api/clients");
  console.log(`Checking ${from} to ${to} (${days} days, UTC) against ${base}\n`);

  // The reference copy, synced locally with the same code the app runs.
  process.env.DATABASE_URL = value("ref-db") ?? "postgresql://postgres:test@localhost:5433/eventhq_verify";
  process.env.SESSION_SECRET ||= "verify-local-only";
  const { runMigrations } = await import("./migrate");
  await runMigrations(process.env.DATABASE_URL);
  const { db, pool } = await import("../server/storage");
  const { agencies, clients, sales, adSpendDaily, optIns } = await import("@shared/schema");
  const { saveConnection, getConnection } = await import("../server/integrations/connections");
  const { syncConnection } = await import("../server/integrations/sync");
  const { and, eq, sql } = await import("drizzle-orm");
  const [agency] = await db.insert(agencies).values({ name: `verify-${Date.now()}` }).returning();

  const refRecords = async (connectionId: number): Promise<Records> => {
    const s = await db.select({ key: sales.dedupeKey, amount: sales.amount, status: sales.status, at: sales.saleDate }).from(sales)
      .where(and(eq(sales.connectionId, connectionId), sql`${sales.saleDate} >= ${wideFrom}::timestamp and ${sales.saleDate} < (${wideTo}::date + 1)::timestamp`));
    const a = await db.select({ date: sql<string>`${adSpendDaily.date}::text`, spend: sql<string>`sum(${adSpendDaily.spend})` }).from(adSpendDaily)
      .where(and(eq(adSpendDaily.connectionId, connectionId), sql`${adSpendDaily.date} between ${from}::date and ${to}::date`)).groupBy(sql`1`);
    const o = await db.select({ id: optIns.externalId, at: optIns.submittedAt }).from(optIns)
      .where(and(eq(optIns.connectionId, connectionId), sql`${optIns.submittedAt} >= ${wideFrom}::timestamptz and ${optIns.submittedAt} < (${wideTo}::date + 1)::timestamptz`));
    return {
      sales: s.map((r) => [r.key ?? "", Number(r.amount), r.status ?? "", r.at.toISOString()]),
      spendByDay: Object.fromEntries(a.map((r) => [r.date, Math.round(Number(r.spend) * 100) / 100])),
      optIns: o.map((r) => [r.id, r.at.toISOString()]),
    };
  };

  const metaAccountSpend = async (accountId: string) => {
    const q = new URLSearchParams({ fields: "spend", time_range: JSON.stringify({ since: from, until: to }), level: "account", access_token: env.META_ACCESS_TOKEN });
    if (env.META_APP_SECRET) q.set("appsecret_proof", createHmac("sha256", env.META_APP_SECRET).update(env.META_ACCESS_TOKEN).digest("hex"));
    const body: any = await (await fetch(`https://graph.facebook.com/v21.0/act_${accountId}/insights?${q}`)).json();
    if (body.error) throw new Error(body.error.message);
    return Math.round(Number(body.data?.[0]?.spend ?? 0) * 100) / 100;
  };

  const results: any[] = [];
  let problems = 0;
  for (const m of mappings) {
    const hits = live.filter((c) => c.name.toLowerCase().includes(m.match.toLowerCase()));
    if (hits.length !== 1) { console.log(`?    ${m.match}: ${hits.length} live workspaces match; skipped`); problems++; continue; }
    const client = hits[0];
    const liveConns: any[] = await api("GET", `/api/clients/${client.id}/integrations`);
    const [refClient] = await db.insert(clients).values({ name: `verify ${m.match}`, agencyId: agency.id }).returning();
    for (const p of planned.filter((x) => x.partner === m.match)) {
      const label = `${m.match.padEnd(9)} ${p.displayName}`;
      const liveConn = matchConnection(p, liveConns);
      if (!liveConn) { console.log(`MISS ${label}: not connected on the live site`); problems++; results.push({ partner: m.match, account: p.displayName, status: "not connected" }); continue; }
      if (liveConn.lastError) console.log(`     ${label}: live sync error: ${liveConn.lastError}`);
      try {
        // Reference sync, with no time limit, resuming until complete.
        let row = await saveConnection({ clientId: refClient.id, provider: p.provider as any, externalAccountId: p.externalAccountId, displayName: p.displayName, credentials: p.credentials, ...(p.settings ? { settings: p.settings } : {}) });
        let r = await syncConnection(row, { days: days + 4 });
        while (!r.complete) { row = (await getConnection(row.id))!; r = await syncConnection(row, { days: days + 4 }); }
        const ref = await refRecords(row.id);
        const got: Records = await api("GET", `/api/clients/${client.id}/integrations/${liveConn.id}/records?from=${wideFrom}&to=${wideTo}`);
        const cmp = compare(ref, got, inWindow, from, to);
        if (p.provider === "meta" && !p.settings) cmp.metaAccountTotal = await metaAccountSpend(p.externalAccountId);
        const ok = cmp.missing.length === 0 && cmp.extra.length === 0 && cmp.changed.length === 0 && cmp.spendDays.length === 0 && cmp.optInsMissing === 0 && cmp.optInsExtra === 0
          && (cmp.metaAccountTotal === undefined || Math.abs(cmp.metaAccountTotal - cmp.liveSpend) < 0.01);
        if (!ok) problems++;
        console.log(`${ok ? "ok  " : "DIFF"} ${label}: ${summary(p.provider, cmp)}`);
        results.push({ partner: m.match, account: p.displayName, ok, ...cmp });
      } catch (e: any) {
        problems++;
        console.log(`ERR  ${label}: ${e.message}`);
        results.push({ partner: m.match, account: p.displayName, status: "error", error: e.message });
      }
    }
  }

  await db.delete(clients).where(eq(clients.agencyId, agency.id));
  await db.delete(agencies).where(eq(agencies.id, agency.id));
  await pool.end();
  const dir = `${homedir()}/.eventhq`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = `${dir}/verify-${to}.json`;
  writeFileSync(file, JSON.stringify({ base, from, to, results }, null, 2), { mode: 0o600 });
  console.log(`\n${problems ? `${problems} account(s) need a look.` : "Everything matches."} Details: ${file}`);
  process.exit(0);
}

function matchConnection(p: Planned, conns: any[]) {
  const same = conns.filter((c) => c.provider === p.provider);
  if (p.provider === "whop" || p.provider === "fanbasis") return same[0];
  return same.find((c) => String(c.externalAccountId).replace(/^act_/, "") === p.externalAccountId);
}

function compare(ref: Records, got: Records, inWindow: (t: string) => boolean, from: string, to: string) {
  const refMap = new Map(ref.sales.map((s) => [s[0], s]));
  const gotMap = new Map(got.sales.map((s) => [s[0], s]));
  const missing = ref.sales.filter((s) => inWindow(s[3]) && !gotMap.has(s[0]));
  const extra = got.sales.filter((s) => inWindow(s[3]) && !refMap.has(s[0]));
  const changed = ref.sales.filter((s) => inWindow(s[3]) && gotMap.has(s[0]))
    .filter((s) => { const g = gotMap.get(s[0])!; return Math.abs(g[1] - s[1]) > 0.005 || g[2] !== s[2]; })
    .map((s) => ({ key: s[0], platform: [s[1], s[2]], eventHQ: [gotMap.get(s[0])![1], gotMap.get(s[0])![2]] }));
  const sum = (list: Sale[], paid: boolean) => Math.round(list.filter((s) => inWindow(s[3]) && isPaid(s[2]) === paid).reduce((t, s) => t + s[1], 0) * 100) / 100;
  const spendDays: Array<{ date: string; platform: number; eventHQ: number }> = [];
  for (let d = Date.parse(from); d <= Date.parse(to); d += DAY) {
    const k = iso(d), a = ref.spendByDay[k] ?? 0, b = got.spendByDay[k] ?? 0;
    if (Math.abs(a - b) >= 0.01) spendDays.push({ date: k, platform: a, eventHQ: b });
  }
  const refOpt = new Set(ref.optIns.map((o) => o[0])), gotOpt = new Set(got.optIns.map((o) => o[0]));
  const total = (byDay: Record<string, number>) => Math.round(Object.entries(byDay).filter(([k]) => k >= from && k <= to).reduce((t, [, v]) => t + v, 0) * 100) / 100;
  return {
    salesPlatform: ref.sales.filter((s) => inWindow(s[3])).length, salesLive: got.sales.filter((s) => inWindow(s[3])).length,
    grossPlatform: sum(ref.sales, true), grossLive: sum(got.sales, true),
    refundsPlatform: sum(ref.sales, false), refundsLive: sum(got.sales, false),
    missing: missing.map((s) => ({ key: s[0], amount: s[1], status: s[2], at: s[3] })),
    extra: extra.map((s) => ({ key: s[0], amount: s[1], status: s[2], at: s[3] })),
    changed,
    platformSpend: total(ref.spendByDay), liveSpend: total(got.spendByDay), spendDays,
    optInsPlatform: ref.optIns.filter((o) => inWindow(o[1])).length, optInsLive: got.optIns.filter((o) => inWindow(o[1])).length,
    optInsMissing: ref.optIns.filter((o) => inWindow(o[1]) && !gotOpt.has(o[0])).length,
    optInsExtra: got.optIns.filter((o) => inWindow(o[1]) && !refOpt.has(o[0])).length,
    metaAccountTotal: undefined as number | undefined,
  };
}

function summary(provider: string, c: ReturnType<typeof compare>) {
  if (provider === "meta") {
    const vsMeta = c.metaAccountTotal === undefined ? "" : `, Meta's own total ${money(c.metaAccountTotal)}`;
    return `spend ${money(c.liveSpend)} (fresh download ${money(c.platformSpend)}${vsMeta})${c.spendDays.length ? `, ${c.spendDays.length} days differ` : ""}`;
  }
  if (provider === "highlevel") {
    return `${c.optInsLive} opt-ins (fresh download ${c.optInsPlatform})${c.optInsMissing ? `, ${c.optInsMissing} missing` : ""}${c.optInsExtra ? `, ${c.optInsExtra} extra` : ""}`;
  }
  const parts = [`${c.salesLive} records, sales ${money(c.grossLive)}, refunds ${money(c.refundsLive)}`];
  if (c.grossLive !== c.grossPlatform || c.refundsLive !== c.refundsPlatform) parts.push(`fresh download: sales ${money(c.grossPlatform)}, refunds ${money(c.refundsPlatform)}`);
  if (c.missing.length) parts.push(`${c.missing.length} missing (${money(c.missing.reduce((t, s) => t + s.amount, 0))})`);
  if (c.extra.length) parts.push(`${c.extra.length} extra`);
  if (c.changed.length) parts.push(`${c.changed.length} changed since sync`);
  return parts.join("; ");
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
