// Revenue and ad spend for the dashboard, computed in one place on the server.
// Revenue is net of refunds (same rule as sales-math.ts). Ad spend comes from synced ad platforms.
// Events get money through event_attribution_rules; an event with no linked products or campaigns
// falls back to the numbers typed into Event Tracker, and says so.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { adSpendDaily, eventPerformance, integrationConnections, sales, type User } from "@shared/schema";
import { db } from "./storage";
import { isAuthenticated } from "./auth";
import { eventReports } from "./registry/metrics";
import { syncConnection, syncStale } from "./integrations/sync";
import { internalToken, kickSync, MAX_HOPS } from "./integrations/kick";
import { timingSafeEqual } from "crypto";
import { appUrl } from "./config";

// Signs internal calls from the cron fan-out to the per-connection sync.

type GetUser = (req: any) => Promise<User | undefined>;

// Net revenue of one sales row, mirroring netSaleContribution().
const NET = sql`(case
  when ${sales.status} = 'refunded' then -abs(coalesce(nullif((${sales.metadata}->>'refundAmount')::numeric, 0), ${sales.amount}))
  when ${sales.status} in ('paid', 'completed') or ${sales.status} is null
    then ${sales.amount} - greatest(0, coalesce((${sales.metadata}->>'refundAmount')::numeric, 0))
  else 0 end)`;

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tz: z.string().max(64).optional(),
});

function validTimezone(tz: string | undefined): string {
  if (!tz) return "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "America/New_York";
  }
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const round2 = (v: number) => Math.round(v * 100) / 100;
const roas = (revenue: number, spend: number) => (spend > 0 ? round2(revenue / spend) : null);

function previousRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  const length = end - start + 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(start - length), to: iso(start - 86_400_000) };
}

// The sale's calendar day in the viewer's timezone. sale_date is stored as UTC without a zone.
const saleDay = (tz: string) => sql`((${sales.saleDate} at time zone 'UTC') at time zone ${tz})::date`;

async function totals(clientId: number, from: string, to: string, tz: string) {
  const [s] = await db.select({
    revenue: sql<string>`coalesce(sum(${NET}), 0)`,
    gross: sql<string>`coalesce(sum(case when ${sales.status} in ('paid','completed') or ${sales.status} is null then ${sales.amount} else 0 end), 0)`,
    refunds: sql<string>`coalesce(sum(case when ${sales.status} = 'refunded' then abs(coalesce(nullif((${sales.metadata}->>'refundAmount')::numeric, 0), ${sales.amount})) else greatest(0, coalesce((${sales.metadata}->>'refundAmount')::numeric, 0)) end), 0)`,
    orders: sql<string>`count(*) filter (where ${sales.status} in ('paid','completed') or ${sales.status} is null)`,
  }).from(sales).where(and(
    eq(sales.clientId, clientId),
    sql`${saleDay(tz)} between ${from}::date and ${to}::date`,
  ));
  const [a] = await db.select({
    spend: sql<string>`coalesce(sum(${adSpendDaily.spend}), 0)`,
    leads: sql<string>`coalesce(sum(${adSpendDaily.leads}), 0)`,
    clicks: sql<string>`coalesce(sum(${adSpendDaily.clicks}), 0)`,
    impressions: sql<string>`coalesce(sum(${adSpendDaily.impressions}), 0)`,
  }).from(adSpendDaily).where(and(
    eq(adSpendDaily.clientId, clientId),
    sql`${adSpendDaily.date} between ${from}::date and ${to}::date`,
  ));
  const revenue = round2(num(s.revenue));
  const adSpend = round2(num(a.spend));
  return {
    revenue, grossSales: round2(num(s.gross)), refunds: round2(num(s.refunds)), orders: num(s.orders),
    adSpend, profit: round2(revenue - adSpend), roas: roas(revenue, adSpend),
    leads: num(a.leads), clicks: num(a.clicks), impressions: num(a.impressions),
    costPerLead: num(a.leads) > 0 ? round2(adSpend / num(a.leads)) : null,
  };
}

export async function moneySummary(clientId: number, from: string, to: string, tz: string) {
  const prev = previousRange(from, to);
  const [current, previous] = await Promise.all([totals(clientId, from, to, tz), totals(clientId, prev.from, prev.to, tz)]);
  // A comparison only means something when data reaches back over the whole earlier period.
  // Right after a source is connected, only the last 30-90 days exist, and the earlier period
  // would look empty.
  const [coverage] = await db.select({
    firstSale: sql<string | null>`(select min(${saleDay(tz)})::text from ${sales} where ${sales.clientId} = ${clientId})`,
    firstSpend: sql<string | null>`(select min(${adSpendDaily.date})::text from ${adSpendDaily} where ${adSpendDaily.clientId} = ${clientId})`,
  }).from(sql`(select 1) as one`);
  const comparable = {
    revenue: !!coverage?.firstSale && coverage.firstSale <= prev.from,
    adSpend: !coverage?.firstSpend || coverage.firstSpend <= prev.from,
  };

  const dailySales = await db.select({
    date: sql<string>`${saleDay(tz)}::text`,
    revenue: sql<string>`sum(${NET})`,
  }).from(sales).where(and(eq(sales.clientId, clientId), sql`${saleDay(tz)} between ${from}::date and ${to}::date`))
    .groupBy(sql`1`);
  const dailySpend = await db.select({
    date: sql<string>`${adSpendDaily.date}::text`,
    spend: sql<string>`sum(${adSpendDaily.spend})`,
  }).from(adSpendDaily).where(and(eq(adSpendDaily.clientId, clientId), sql`${adSpendDaily.date} between ${from}::date and ${to}::date`))
    .groupBy(sql`1`);
  const byDay = new Map<string, { date: string; revenue: number; adSpend: number }>();
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, revenue: 0, adSpend: 0 });
  }
  for (const r of dailySales) if (byDay.has(r.date)) byDay.get(r.date)!.revenue = round2(num(r.revenue));
  for (const r of dailySpend) if (byDay.has(r.date)) byDay.get(r.date)!.adSpend = round2(num(r.spend));

  const revenueBySource = (await db.select({
    source: sql<string>`coalesce(${sales.source}, 'other')`,
    revenue: sql<string>`sum(${NET})`,
    orders: sql<string>`count(*) filter (where ${sales.status} <> 'refunded')`,
  }).from(sales).where(and(eq(sales.clientId, clientId), sql`${saleDay(tz)} between ${from}::date and ${to}::date`))
    .groupBy(sql`1`)).map((r) => ({ source: r.source, revenue: round2(num(r.revenue)), orders: num(r.orders) }))
    .sort((a, b) => b.revenue - a.revenue);

  const spendByCampaign = (await db.select({
    campaignId: adSpendDaily.campaignId,
    campaignName: sql<string>`max(${adSpendDaily.campaignName})`,
    spend: sql<string>`sum(${adSpendDaily.spend})`,
    leads: sql<string>`sum(${adSpendDaily.leads})`,
    purchases: sql<string>`sum(${adSpendDaily.purchases})`,
    eventId: sql<number | null>`max(${adSpendDaily.eventPerformanceId})`,
  }).from(adSpendDaily).where(and(eq(adSpendDaily.clientId, clientId), sql`${adSpendDaily.date} between ${from}::date and ${to}::date`))
    .groupBy(adSpendDaily.campaignId)).map((r) => ({
      campaignId: r.campaignId, campaignName: r.campaignName, spend: round2(num(r.spend)),
      leads: num(r.leads), purchases: num(r.purchases), eventId: r.eventId,
    })).filter((r) => r.spend > 0).sort((a, b) => b.spend - a.spend);

  return {
    range: { from, to, tz, previous: prev },
    currency: "USD",
    totals: current,
    previousTotals: previous,
    comparable,
    daily: Array.from(byDay.values()),
    revenueBySource,
    spendByCampaign,
    events: await eventBreakdown(clientId, from, to),
    sources: await sourceStatus(clientId),
  };
}

// Events running in the range, each with its full totals. Registry events get their numbers from
// the matcher (sales by product and date window, spend by landing page); a Main event also carries
// its total including the Minis that feed it. Events not in the registry show what was typed into
// Event Tracker, labeled as such.
async function eventBreakdown(clientId: number, from: string, to: string) {
  const events = await db.select().from(eventPerformance).where(and(
    eq(eventPerformance.clientId, clientId),
    sql`coalesce(${eventPerformance.adsStart}, ${eventPerformance.startDate}::date) <= ${to}::date`,
    sql`coalesce(${eventPerformance.postCartEnd}, ${eventPerformance.cartClose}, ${eventPerformance.endDate}::date, ${eventPerformance.startDate}::date) >= ${from}::date`,
  ));
  if (!events.length) return [];
  const registered = events.filter((e) => e.funnelRole);
  const reports = registered.length ? await eventReports(clientId, registered.map((e) => e.id)) : [];
  const byId = new Map(reports.map((r) => [r.id, r]));
  return events.map((e) => {
    const r = byId.get(e.id);
    const registrants = e.totalRegistrants ?? 0;
    const attendees = e.totalAttendees ?? 0;
    if (r) {
      const n = r.withMinis ?? r.own;
      return {
        id: e.id, registryId: r.registryId, title: e.title, type: e.eventType, role: r.role, feedsIntoId: r.feedsIntoId,
        startDate: e.startDate, endDate: e.endDate,
        revenue: n.netRevenue, adSpend: n.adSpend, profit: round2(n.netRevenue - n.adSpend), roas: n.roas,
        orders: n.orders, buyers: n.buyers, optIns: n.optIns, costPerOptIn: n.costPerOptIn,
        includesMinis: !!r.withMinis && r.miniIds.length > 0, miniCount: r.miniIds.length,
        revenueSource: "registry" as const, spendSource: "registry" as const,
        registrants, attendees, peopleAtPitch: e.peopleAtPitch ?? 0,
        showUpRate: registrants > 0 ? round2((attendees / registrants) * 100) : null,
        costPerRegistrant: registrants > 0 && n.adSpend > 0 ? round2(n.adSpend / registrants) : null,
        leads: n.adLeads,
      };
    }
    const revenue = round2(num(e.totalRevenue));
    const adSpend = round2(num(e.adSpend));
    return {
      id: e.id, registryId: null, title: e.title, type: e.eventType, role: null, feedsIntoId: null,
      startDate: e.startDate, endDate: e.endDate,
      revenue, adSpend, profit: round2(revenue - adSpend), roas: roas(revenue, adSpend),
      orders: null, buyers: null, optIns: null, costPerOptIn: null, includesMinis: false, miniCount: 0,
      revenueSource: "manual" as const, spendSource: "manual" as const,
      registrants, attendees, peopleAtPitch: e.peopleAtPitch ?? 0,
      showUpRate: registrants > 0 ? round2((attendees / registrants) * 100) : null,
      costPerRegistrant: registrants > 0 && adSpend > 0 ? round2(adSpend / registrants) : null,
      leads: null,
    };
  })
    // Minis show inside their Main's total; list them only when their Main is outside the range.
    .filter((e) => !(e.role === "mini" && e.feedsIntoId && events.some((m) => m.id === e.feedsIntoId)))
    .sort((x, y) => new Date(y.startDate).getTime() - new Date(x.startDate).getTime());
}

async function sourceStatus(clientId: number) {
  const rows = await db.select().from(integrationConnections).where(eq(integrationConnections.clientId, clientId));
  return rows.map((r) => ({
    provider: r.provider, displayName: r.displayName, status: r.status,
    lastSyncAt: r.lastSyncAt, lastWebhookAt: r.lastWebhookAt, hasError: !!r.lastError,
  }));
}

export function registerMoneyRoutes(app: Express, getRequestUser: GetUser) {
  const clientIdOf = (req: Request) => Number(req.params.clientId);

  app.get("/api/clients/:clientId/money-summary", isAuthenticated, async (req, res) => {
    const parsed = rangeSchema.safeParse(req.query);
    if (!parsed.success || parsed.data.from > parsed.data.to) {
      return res.status(400).json({ error: "Pass from and to as YYYY-MM-DD." });
    }
    const days = (new Date(parsed.data.to).getTime() - new Date(parsed.data.from).getTime()) / 86_400_000;
    if (days > 800) return res.status(400).json({ error: "Pick a range under two years." });
    try {
      res.json(await moneySummary(clientIdOf(req), parsed.data.from, parsed.data.to, validTimezone(parsed.data.tz)));
    } catch (error) {
      console.error("[money] summary failed:", error);
      res.status(500).json({ error: "Could not load revenue and ad spend." });
    }
  });

  // Pulls fresh data for this client's connections that haven't synced in 15 minutes.
  app.post("/api/clients/:clientId/money-summary/refresh", isAuthenticated, async (req, res) => {
    try {
      res.json(await syncStale({ clientId: clientIdOf(req), staleMinutes: 15, budgetMs: 40_000 }));
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Refresh failed" });
    }
  });

  // Daily scheduled sync (vercel.json / build output crons). With CRON_SECRET set, Vercel sends it
  // as a bearer token and nothing else may call this. Without it, calls are still harmless: syncs
  // are idempotent and connections synced in the last 30 minutes are skipped.
  app.get("/api/cron/sync", async (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
    try {
      // On Vercel each connection syncs in its own function call, in parallel, so every account
      // gets a full time budget. Locally (or if fan-out fails) they run here one after another.
      const due = (await db.select().from(integrationConnections).where(eq(integrationConnections.status, "active")))
        .filter((c) => !c.lastSyncAt || c.lastSyncAt.getTime() < Date.now() - 30 * 60_000);
      if (process.env.VERCEL && due.length > 1) {
        const results = await Promise.allSettled(due.map((c) => fetch(`${appUrl()}/api/cron/sync-one/${c.id}?t=${internalToken(c.id)}`)
          .then((r) => r.json())));
        return res.json({ fannedOut: due.length, results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })) });
      }
      res.json(await syncStale({ staleMinutes: 30, budgetMs: 50_000 }));
    } catch (error: any) {
      console.error("[cron] sync failed:", error);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  // One connection's scheduled sync, called by the cron fan-out above with a signed token.
  app.get("/api/cron/sync-one/:id", async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const token = String(req.query.t ?? "");
    const expected = internalToken(id);
    if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const [row] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, id));
    if (!row || row.status !== "active") return res.status(404).json({ error: "Not found" });
    try {
      const result = await syncConnection(row, { deadline: Date.now() + 50_000 });
      // A long first sync stops at the time limit; carry on in a fresh call.
      const hop = Number(req.query.hop) || 0;
      if (!result.complete && hop + 1 < MAX_HOPS) await kickSync(id, hop + 1);
      res.json(result);
    } catch (error: any) {
      res.status(502).json({ connectionId: id, error: error.message });
    }
  });
}
