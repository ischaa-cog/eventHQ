// Connects every partner's ad, sales and opt-in accounts to their eventHQ workspace in one go,
// using a mapping file and a credentials file. Keys are read from the credentials file and stored
// encrypted; they are never printed.
//
//   1. Check every key works (no database needed):
//        npx tsx script/connect-partners.ts --check --env ~/adflow-dashboard/.env --map partners.local.json
//   2. See what would be connected in the database DATABASE_URL points at:
//        DATABASE_URL=... SESSION_SECRET=... npx tsx script/connect-partners.ts --env ... --map ...
//   3. Connect, then run each first sync:
//        DATABASE_URL=... SESSION_SECRET=... npx tsx script/connect-partners.ts --env ... --map ... --apply --sync
//   Or, without database access, through the live app's own API with your eventHQ admin login:
//        npx tsx script/connect-partners.ts --api https://your-eventhq-domain.com            (dry run)
//        npx tsx script/connect-partners.ts --api https://your-eventhq-domain.com --apply    (connect + first syncs)
//      It asks for your email and password (or reads EVENTHQ_EMAIL / EVENTHQ_PASSWORD). Meta connects
//      through one agency login made from META_ACCESS_TOKEN; the app runs each first sync itself.
//
// SESSION_SECRET (or CREDENTIALS_KEY) must be the same value the deployed app uses, or the app
// cannot read the stored keys.
//
// partners.local.json: [{ "match": "Alicia", "meta": ["325842589618123"], "whop": "WHOP_API_KEY",
//   "stripe": [{ "label": "Main account", "key": "STRIPE_API_KEY_2" }], "fanbasis": "FANBASIS_API_KEY",
//   "highlevel": { "locationId": "Fk0B...", "key": "GHL_API_ALICIA" } }, ...]
// "match" is part of the workspace name in eventHQ (case-insensitive); it must match exactly one.
// Optional "code" sets the workspace's client code for Event IDs (e.g. "AL" gives AL-2610-MAIN).
import { readFileSync } from "fs";
import { homedir } from "os";

type Mapping = {
  match: string;
  code?: string;
  meta?: string[];
  whop?: string;
  stripe?: Array<{ label: string; key: string }>;
  fanbasis?: string;
  highlevel?: { locationId: string; key: string };
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const expand = (p: string) => p.replace(/^~(?=\/)/, homedir());

const envPath = expand(value("env") ?? "~/adflow-dashboard/.env");
const mapPath = expand(value("map") ?? "partners.local.json");

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnv(envPath);
const mappings: Mapping[] = JSON.parse(readFileSync(mapPath, "utf8"));
const need = (name: string | undefined) => (name ? env[name] || undefined : undefined);

type Planned = { partner: string; provider: string; externalAccountId: string; displayName: string; credentials: Record<string, string> };
const planned: Planned[] = [];
const problems: string[] = [];
for (const m of mappings) {
  for (const account of m.meta ?? []) {
    if (!env.META_ACCESS_TOKEN) problems.push(`${m.match}: META_ACCESS_TOKEN missing`);
    else planned.push({ partner: m.match, provider: "meta", externalAccountId: account.replace(/^act_/, ""), displayName: `Meta ${account}`,
      credentials: { accessToken: env.META_ACCESS_TOKEN, ...(env.META_APP_SECRET ? { appSecret: env.META_APP_SECRET } : {}) } });
  }
  if (m.whop) {
    const k = need(m.whop);
    if (!k) problems.push(`${m.match}: ${m.whop} missing`); else planned.push({ partner: m.match, provider: "whop", externalAccountId: "", displayName: "Whop", credentials: { apiKey: k } });
  }
  for (const s of m.stripe ?? []) {
    const k = need(s.key);
    if (!k) problems.push(`${m.match}: ${s.key} missing`); else planned.push({ partner: m.match, provider: "stripe", externalAccountId: s.label, displayName: `Stripe · ${s.label}`, credentials: { secretKey: k } });
  }
  if (m.fanbasis) {
    const k = need(m.fanbasis);
    if (!k) problems.push(`${m.match}: ${m.fanbasis} missing`); else planned.push({ partner: m.match, provider: "fanbasis", externalAccountId: "", displayName: "Fanbasis", credentials: { apiKey: k } });
  }
  if (m.highlevel) {
    const k = need(m.highlevel.key);
    if (!k || !m.highlevel.locationId) problems.push(`${m.match}: HighLevel key or location missing`);
    else planned.push({ partner: m.match, provider: "highlevel", externalAccountId: m.highlevel.locationId, displayName: "HighLevel opt-ins", credentials: { apiKey: k } });
  }
}

// One cheap read-only call per account, to prove the key works before anything is stored.
async function check(p: Planned): Promise<string> {
  const get = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers });
    if (res.ok) return "ok";
    const body = await res.text();
    let msg = body.slice(0, 160);
    try { const j = JSON.parse(body); msg = j?.error?.message ?? j?.message ?? msg; } catch { /* text */ }
    return `HTTP ${res.status}: ${msg}`;
  };
  if (p.provider === "meta") return get(`https://graph.facebook.com/v21.0/act_${p.externalAccountId}?fields=name`, { Authorization: `Bearer ${p.credentials.accessToken}` });
  if (p.provider === "whop") {
    const company = await fetch("https://api.whop.com/api/v5/company", { headers: { Authorization: `Bearer ${p.credentials.apiKey}` } });
    if (!company.ok) return `HTTP ${company.status} reading the company`;
    const { id } = await company.json();
    return get(`https://api.whop.com/api/v1/payments?company_id=${id}&first=1`, { Authorization: `Bearer ${p.credentials.apiKey}` });
  }
  if (p.provider === "stripe") return get("https://api.stripe.com/v1/charges?limit=1", { Authorization: `Bearer ${p.credentials.secretKey}` });
  if (p.provider === "fanbasis") return get("https://www.fanbasis.com/public-api/checkout-sessions/transactions?per_page=1", { "x-api-key": p.credentials.apiKey });
  if (p.provider === "highlevel") return get(`https://services.leadconnectorhq.com/forms/submissions?locationId=${p.externalAccountId}&limit=1`,
    { Authorization: `Bearer ${p.credentials.apiKey}`, Version: "2021-07-28", "User-Agent": "eventhq-sync/1.0" });
  return "unknown provider";
}

async function main() {
  for (const p of problems) console.log(`! ${p}`);
  if (value("api") && !flag("check")) return viaApi(value("api")!);
  if (flag("check")) {
    for (const p of planned) {
      const result = await check(p);
      console.log(`${result === "ok" ? "ok  " : "FAIL"} ${p.partner.padEnd(10)} ${p.displayName.padEnd(28)} ${result === "ok" ? "" : result}`);
    }
    return;
  }
  const { db } = await import("../server/storage");
  const { clients } = await import("@shared/schema");
  const { saveConnection, getConnection } = await import("../server/integrations/connections");
  const { syncConnection } = await import("../server/integrations/sync");
  const all = await db.select({ id: clients.id, name: clients.name }).from(clients);
  for (const m of mappings) {
    const hits = all.filter((c) => c.name.toLowerCase().includes(m.match.toLowerCase()));
    if (hits.length !== 1) { console.log(`! "${m.match}" matches ${hits.length} workspaces (${hits.map((h) => h.name).join(", ") || "none"}); skipped`); continue; }
    const client = hits[0];
    for (const p of planned.filter((x) => x.partner === m.match)) {
      if (!flag("apply")) { console.log(`would connect ${p.displayName} to "${client.name}"`); continue; }
      const row = await saveConnection({ clientId: client.id, provider: p.provider as any, externalAccountId: p.externalAccountId, displayName: p.displayName, credentials: p.credentials });
      console.log(`connected ${p.displayName} to "${client.name}"`);
      if (flag("sync")) {
        try {
          // Reload the connection before each run so a cut-off sync resumes from its saved cursor.
          let r = await syncConnection(row, { deadline: Date.now() + 120_000 });
          while (!r.complete) r = await syncConnection((await getConnection(row.id))!, { deadline: Date.now() + 120_000 });
          console.log(`   synced: ${r.sales} sales, ${r.refunds} refunds, ${r.spendRows} ad-days, ${r.optIns} opt-ins`);
        } catch (e: any) { console.log(`   sync failed: ${e.message}`); }
      }
    }
  }
  if (!flag("apply")) console.log("Dry run. Add --apply to connect.");
  process.exit(0);
}

// ---------- Through the live app's API ----------

async function ask(question: string, hidden = false): Promise<string> {
  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const out = (rl as any).output;
    (rl as any)._writeToOutput = (text: string) => { out.write(text.startsWith(question) ? question : text.includes("\n") ? "\n" : "*"); };
  }
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer.trim()); }));
}

async function viaApi(base: string) {
  base = base.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new Error("--api needs the full address, like https://app.example.com");
  const email = process.env.EVENTHQ_EMAIL || await ask("eventHQ admin email: ");
  const password = process.env.EVENTHQ_PASSWORD || await ask("Password: ", true);
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, portal: "admin" }) });
  if (!login.ok) throw new Error(`Login failed (${login.status}): ${(await login.text()).slice(0, 200)}`);
  const cookies = ((login.headers as any).getSetCookie?.() ?? [login.headers.get("set-cookie") ?? ""]) as string[];
  const cookie = cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${json?.error ?? text.slice(0, 200)}`);
    return json;
  };
  console.log(`Signed in to ${base}.`);
  const all: Array<{ id: number; name: string }> = await api("GET", "/api/clients");
  const apply = flag("apply");

  // Meta: one agency login from the token, then each workspace picks its ad account from it.
  let grantId: number | null = null;
  const wantsMeta = planned.some((p) => p.provider === "meta");
  if (wantsMeta && apply) {
    const grant = await api("POST", "/api/oauth/grants/meta-token", { accessToken: env.META_ACCESS_TOKEN, ...(env.META_APP_SECRET ? { appSecret: env.META_APP_SECRET } : {}) });
    grantId = grant.id;
    console.log(`Meta agency login ready: ${grant.displayName ?? grant.accountRef}`);
  }

  const started: Array<{ clientId: number; clientName: string; id: number; label: string }> = [];
  for (const m of mappings) {
    const hits = all.filter((c) => c.name.toLowerCase().includes(m.match.toLowerCase()));
    if (hits.length !== 1) { console.log(`! "${m.match}" matches ${hits.length} workspaces (${hits.map((h) => h.name).join(", ") || "none"}); skipped`); continue; }
    const client = hits[0];
    if (m.code) {
      if (apply) await api("PUT", `/api/clients/${client.id}/registry/settings`, { eventCode: m.code });
      console.log(`${apply ? "set" : "would set"} client code ${m.code} on "${client.name}"`);
    }
    for (const p of planned.filter((x) => x.partner === m.match)) {
      if (!apply) { console.log(`would connect ${p.displayName} to "${client.name}"`); continue; }
      try {
        const row = p.provider === "meta"
          ? await api("POST", `/api/clients/${client.id}/integrations/from-grant`, { grantId, accountId: p.externalAccountId })
          : await api("PUT", `/api/clients/${client.id}/integrations`, { provider: p.provider, externalAccountId: p.externalAccountId, displayName: p.displayName, credentials: p.credentials });
        started.push({ clientId: client.id, clientName: client.name, id: row.id, label: p.displayName });
        console.log(`connected ${p.displayName} to "${client.name}"`);
      } catch (e: any) {
        console.log(`! ${p.displayName} on "${client.name}": ${e.message}`);
      }
    }
  }
  if (!apply) { console.log("Dry run. Add --apply to connect."); return; }

  // The app runs each first sync in the background; report as they finish (up to 15 minutes).
  console.log(`\nWaiting for ${started.length} first syncs...`);
  const done = new Map<number, string>();
  const until = Date.now() + 15 * 60_000;
  while (done.size < started.length && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 20_000));
    for (const clientId of Array.from(new Set(started.map((s) => s.clientId)))) {
      const rows: any[] = await api("GET", `/api/clients/${clientId}/integrations`).catch(() => []);
      for (const s of started.filter((x) => x.clientId === clientId && !done.has(x.id))) {
        const row = rows.find((r) => r.id === s.id);
        if (row?.lastError) { done.set(s.id, "error"); console.log(`FAIL ${s.clientName} · ${s.label}: ${row.lastError}`); }
        else if (row?.lastSyncAt) { done.set(s.id, "ok"); console.log(`ok   ${s.clientName} · ${s.label}`); }
      }
    }
  }
  const pending = started.filter((s) => !done.has(s.id));
  if (pending.length) console.log(`${pending.length} still syncing; they keep going on the server: ${pending.map((s) => `${s.clientName} · ${s.label}`).join(", ")}`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
