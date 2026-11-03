// Revenue and ad spend for the dashboard, computed in one place on the server.
// Revenue is net of refunds (same rule as sales-math.ts). Ad spend comes from synced ad platforms.
// Events get money through event_attribution_rules; an event with no linked products or campaigns
// falls back to the numbers typed into Event Tracker, and says so.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import {
  adSpendDaily, eventAttributionRules, eventPerformance, integrationConnections, sales, type User,
} from "@shared/schema";
import { db } from "./storage";
import { isAuthenticated } from "./auth";
import { reapplyAttribution } from "./attribution";
import { syncStale } from "./integrations/sync";

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

// Events that start in the range (or are running during it), each with its full attributed totals.
async function eventBreakdown(clientId: number, from: string, to: string) {
  const events = await db.select().from(eventPerformance).where(and(
    eq(eventPerformance.clientId, clientId),
    sql`${eventPerformance.startDate}::date <= ${to}::date`,
    sql`coalesce(${eventPerformance.endDate}, ${eventPerformance.startDate})::date >= ${from}::date`,
  ));
  if (!events.length) return [];
  const ids = events.map((e) => e.id);
  const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  const salesByEvent = new Map((await db.select({
    eventId: sales.eventPerformanceId,
    revenue: sql<string>`sum(${NET})`,
    orders: sql<string>`count(*) filter (where ${sales.status} <> 'refunded')`,
  }).from(sales).where(and(eq(sales.clientId, clientId), sql`${sales.eventPerformanceId} in (${idList})`))
    .groupBy(sales.eventPerformanceId)).map((r) => [r.eventId, r]));
  const spendByEvent = new Map((await db.select({
    eventId: adSpendDaily.eventPerformanceId,
    spend: sql<string>`sum(${adSpendDaily.spend})`,
    leads: sql<string>`sum(${adSpendDaily.leads})`,
  }).from(adSpendDaily).where(and(eq(adSpendDaily.clientId, clientId), sql`${adSpendDaily.eventPerformanceId} in (${idList})`))
    .groupBy(adSpendDaily.eventPerformanceId)).map((r) => [r.eventId, r]));
  const ruleCounts = new Map((await db.select({
    eventId: eventAttributionRules.eventPerformanceId,
    products: sql<string>`count(*) filter (where ${eventAttributionRules.kind} = 'product')`,
    campaigns: sql<string>`count(*) filter (where ${eventAttributionRules.kind} = 'campaign')`,
  }).from(eventAttributionRules).where(sql`${eventAttributionRules.eventPerformanceId} in (${idList})`)
    .groupBy(eventAttributionRules.eventPerformanceId)).map((r) => [r.eventId, r]));

  return events.map((e) => {
    const s = salesByEvent.get(e.id);
    const a = spendByEvent.get(e.id);
    const rules = ruleCounts.get(e.id);
    const linkedProducts = num(rules?.products);
    const linkedCampaigns = num(rules?.campaigns);
    // Linked data wins; otherwise show what was typed into Event Tracker.
    const revenue = linkedProducts ? round2(num(s?.revenue)) : round2(num(e.totalRevenue));
    const adSpend = linkedCampaigns ? round2(num(a?.spend)) : round2(num(e.adSpend));
    const registrants = e.totalRegistrants ?? 0;
    const attendees = e.totalAttendees ?? 0;
    return {
      id: e.id, title: e.title, type: e.eventType, startDate: e.startDate, endDate: e.endDate,
      revenue, adSpend, profit: round2(revenue - adSpend), roas: roas(revenue, adSpend),
      orders: linkedProducts ? num(s?.orders) : null,
      revenueSource: linkedProducts ? "synced" : "manual",
      spendSource: linkedCampaigns ? "synced" : "manual",
      linkedProducts, linkedCampaigns,
      registrants, attendees, peopleAtPitch: e.peopleAtPitch ?? 0,
      showUpRate: registrants > 0 ? round2((attendees / registrants) * 100) : null,
      costPerRegistrant: registrants > 0 && adSpend > 0 ? round2(adSpend / registrants) : null,
      leads: linkedCampaigns ? num(a?.leads) : null,
    };
  }).sort((x, y) => new Date(y.startDate).getTime() - new Date(x.startDate).getTime());
}

async function sourceStatus(clientId: number) {
  const rows = await db.select().from(integrationConnections).where(eq(integrationConnections.clientId, clientId));
  return rows.map((r) => ({
    provider: r.provider, displayName: r.displayName, status: r.status,
    lastSyncAt: r.lastSyncAt, lastWebhookAt: r.lastWebhookAt, hasError: !!r.lastError,
  }));
}

// Products and campaigns seen for a client, for the "link to event" screen.
async function attributionOptions(clientId: number) {
  const products = await db.select({
    provider: sql<string>`${sales.source}`,
    productId: sql<string>`${sales.productId}`,
    productName: sql<string>`max(${sales.productName})`,
    revenue: sql<string>`sum(${NET})`,
    orders: sql<string>`count(*)`,
    lastSale: sql<string>`max(${sales.saleDate})`,
  }).from(sales).where(and(eq(sales.clientId, clientId), sql`${sales.productId} is not null`))
    .groupBy(sales.source, sales.productId);
  const campaigns = await db.select({
    provider: adSpendDaily.provider,
    campaignId: adSpendDaily.campaignId,
    campaignName: sql<string>`max(${adSpendDaily.campaignName})`,
    spend: sql<string>`sum(${adSpendDaily.spend})`,
    firstDay: sql<string>`min(${adSpendDaily.date})::text`,
    lastDay: sql<string>`max(${adSpendDaily.date})::text`,
  }).from(adSpendDaily).where(eq(adSpendDaily.clientId, clientId))
    .groupBy(adSpendDaily.provider, adSpendDaily.campaignId);
  const rules = await db.select().from(eventAttributionRules).where(eq(eventAttributionRules.clientId, clientId));
  return {
    rules,
    products: products.map((p) => ({ ...p, revenue: round2(num(p.revenue)), orders: num(p.orders) }))
      .sort((a, b) => b.revenue - a.revenue),
    campaigns: campaigns.map((c) => ({ ...c, spend: round2(num(c.spend)) })).sort((a, b) => b.spend - a.spend),
  };
}

const ruleSchema = z.object({
  eventPerformanceId: z.number().int().positive(),
  kind: z.enum(["product", "campaign"]),
  provider: z.string().trim().min(1).max(40),
  matchValue: z.string().trim().min(1).max(300),
  label: z.string().trim().max(500).nullish(),
});

export function registerMoneyRoutes(app: Express, getRequestUser: GetUser) {
  const isStaff = (u: User | undefined) => u?.role === "owner" || u?.role === "agency_admin" || u?.role === "team_member";
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

  app.get("/api/clients/:clientId/attribution", isAuthenticated, async (req, res) => {
    if (!isStaff(await getRequestUser(req))) return res.status(403).json({ error: "Forbidden" });
    res.json(await attributionOptions(clientIdOf(req)));
  });

  // Links a product or campaign to an event. Linking something already linked moves it.
  app.put("/api/clients/:clientId/attribution", isAuthenticated, async (req, res) => {
    if (!isStaff(await getRequestUser(req))) return res.status(403).json({ error: "Forbidden" });
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid link" });
    const clientId = clientIdOf(req);
    const [event] = await db.select({ id: eventPerformance.id }).from(eventPerformance)
      .where(and(eq(eventPerformance.id, parsed.data.eventPerformanceId), eq(eventPerformance.clientId, clientId)));
    if (!event) return res.status(404).json({ error: "Event not found in this workspace" });
    const value = { clientId, ...parsed.data, label: parsed.data.label ?? null };
    const [rule] = await db.insert(eventAttributionRules).values(value)
      .onConflictDoUpdate({
        target: [eventAttributionRules.clientId, eventAttributionRules.kind, eventAttributionRules.provider, eventAttributionRules.matchValue],
        set: { eventPerformanceId: value.eventPerformanceId, label: value.label },
      }).returning();
    res.json({ rule, retagged: await reapplyAttribution(clientId) });
  });

  app.delete("/api/clients/:clientId/attribution/:id", isAuthenticated, async (req, res) => {
    if (!isStaff(await getRequestUser(req))) return res.status(403).json({ error: "Forbidden" });
    const clientId = clientIdOf(req);
    const [rule] = await db.delete(eventAttributionRules)
      .where(and(eq(eventAttributionRules.id, Number(req.params.id)), eq(eventAttributionRules.clientId, clientId)))
      .returning();
    if (!rule) return res.status(404).json({ error: "Link not found" });
    // Untag rows that were tagged through this link.
    if (rule.kind === "product") {
      await db.update(sales).set({ eventPerformanceId: null }).where(and(
        eq(sales.clientId, clientId), eq(sales.source, rule.provider), eq(sales.productId, rule.matchValue),
        eq(sales.eventPerformanceId, rule.eventPerformanceId),
      ));
    } else {
      await db.update(adSpendDaily).set({ eventPerformanceId: null }).where(and(
        eq(adSpendDaily.clientId, clientId), eq(adSpendDaily.provider, rule.provider), eq(adSpendDaily.campaignId, rule.matchValue),
        eq(adSpendDaily.eventPerformanceId, rule.eventPerformanceId),
      ));
    }
    res.json({ success: true });
  });

  // Daily scheduled sync (vercel.json / build output crons). With CRON_SECRET set, Vercel sends it
  // as a bearer token and nothing else may call this. Without it, calls are still harmless: syncs
  // are idempotent and connections synced in the last 30 minutes are skipped.
  app.get("/api/cron/sync", async (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
    try {
      res.json(await syncStale({ staleMinutes: 30, budgetMs: 50_000 }));
    } catch (error: any) {
      console.error("[cron] sync failed:", error);
      res.status(500).json({ error: "Sync failed" });
    }
  });
}
