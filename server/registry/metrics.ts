// Per-event numbers computed from what the matcher assigned. One function feeds the event pages,
// the dashboard and Neo, so every place reports the same figures.
import { and, eq, inArray, sql } from "drizzle-orm";
import { adSpendDaily, eventPerformance, optIns, productContractValues, sales } from "@shared/schema";
import { db } from "../storage";
import { netSaleContribution } from "../sales-math";
import { loadRegistry, salesWindow, adsWindow, type RegistryEvent } from "./match";
import { dayIn, normalizeName, TIERS, type Tier } from "./normalize";

type Money = { count: number; revenue: number };
export type EventNumbers = {
  adSpend: number; impressions: number; clicks: number; cpm: number | null; cpc: number | null; adLeads: number;
  optIns: number; optInRate: number | null; costPerOptIn: number | null;
  tiers: Record<Tier, Money>;
  byDate: Money; // sales counted by date only (loose mode): product not on any list yet
  offers: Array<{ id: number; name: string; share: number; count: number; revenue: number; ourRevenue: number }>;
  contracted: number; collected: number; refunds: number; netRevenue: number; roas: number | null;
  cartOpenRevenue: number; postCartRevenue: number; buyers: number; orders: number;
};
export type EventReport = {
  id: number; registryId: string | null; title: string; type: string; role: "main" | "mini"; feedsIntoId: number | null;
  startDate: string; endDate: string | null; adsStart: string | null; cartOpen: string | null; cartClose: string | null; postCartEnd: string | null;
  own: EventNumbers;
  withMinis: EventNumbers | null; // Main events only: own numbers plus every Mini that feeds it
  miniIds: number[];
  unmatchedInWindow: { sales: number; salesCount: number; adSpend: number; optIns: number };
  conflicts: number;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const div = (a: number, b: number) => (b > 0 ? round2(a / b) : null);

function empty() {
  return {
    adSpend: 0, impressions: 0, clicks: 0, adLeads: 0, optIns: 0,
    tiers: Object.fromEntries(TIERS.map((t) => [t, { count: 0, revenue: 0 }])) as Record<Tier, Money>,
    byDate: { count: 0, revenue: 0 } as Money,
    offers: new Map<number, { id: number; name: string; share: number; count: number; revenue: number; ourRevenue: number }>(),
    contracted: 0, collected: 0, refunds: 0, cartOpenRevenue: 0, postCartRevenue: 0, orders: 0,
    buyers: new Set<string>(), contractedKeys: new Set<string>(),
  };
}
type Acc = ReturnType<typeof empty>;

function finish(a: Acc): EventNumbers {
  const net = round2(a.collected - a.refunds);
  return {
    adSpend: round2(a.adSpend), impressions: a.impressions, clicks: a.clicks,
    cpm: a.impressions > 0 ? round2((a.adSpend / a.impressions) * 1000) : null, cpc: div(a.adSpend, a.clicks), adLeads: a.adLeads,
    optIns: a.optIns, optInRate: a.clicks > 0 ? round2((a.optIns / a.clicks) * 100) : null, costPerOptIn: div(a.adSpend, a.optIns),
    tiers: Object.fromEntries(TIERS.map((t) => [t, { count: a.tiers[t].count, revenue: round2(a.tiers[t].revenue) }])) as Record<Tier, Money>,
    byDate: { count: a.byDate.count, revenue: round2(a.byDate.revenue) },
    offers: Array.from(a.offers.values()).map((o) => ({ ...o, revenue: round2(o.revenue), ourRevenue: round2(o.ourRevenue) })),
    contracted: round2(a.contracted), collected: round2(a.collected), refunds: round2(a.refunds), netRevenue: net,
    roas: div(net, a.adSpend), cartOpenRevenue: round2(a.cartOpenRevenue), postCartRevenue: round2(a.postCartRevenue),
    buyers: a.buyers.size, orders: a.orders,
  };
}

function merge(into: Acc, from: Acc) {
  into.adSpend += from.adSpend; into.impressions += from.impressions; into.clicks += from.clicks; into.adLeads += from.adLeads;
  into.optIns += from.optIns; into.contracted += from.contracted; into.collected += from.collected; into.refunds += from.refunds;
  into.cartOpenRevenue += from.cartOpenRevenue; into.postCartRevenue += from.postCartRevenue; into.orders += from.orders;
  for (const t of TIERS) { into.tiers[t].count += from.tiers[t].count; into.tiers[t].revenue += from.tiers[t].revenue; }
  into.byDate.count += from.byDate.count; into.byDate.revenue += from.byDate.revenue;
  for (const [id, o] of Array.from(from.offers.entries())) {
    const cur = into.offers.get(id);
    if (cur) { cur.count += o.count; cur.revenue += o.revenue; cur.ourRevenue += o.ourRevenue; } else into.offers.set(id, { ...o });
  }
  from.buyers.forEach((b) => into.buyers.add(b));
}

export async function eventReports(clientId: number, onlyEventIds?: number[]): Promise<EventReport[]> {
  const events = await loadRegistry(clientId);
  if (!events.length) return [];
  const ids = events.map((e) => e.id);
  const meta = new Map((await db.select({
    id: eventPerformance.id, type: eventPerformance.eventType, startDate: eventPerformance.startDate, endDate: eventPerformance.endDate,
  }).from(eventPerformance).where(inArray(eventPerformance.id, ids))).map((r) => [r.id, r]));
  const contract = new Map((await db.select().from(productContractValues).where(eq(productContractValues.clientId, clientId)))
    .map((c) => [c.productName, Number(c.fullValue)]));

  const acc = new Map<number, Acc>(events.map((e) => [e.id, empty()]));
  const byId = new Map(events.map((e) => [e.id, e]));

  const saleRows = await db.select().from(sales)
    .where(and(eq(sales.clientId, clientId), inArray(sales.eventPerformanceId, ids)));
  saleRows.sort((a, b) => a.saleDate.getTime() - b.saleDate.getTime());
  for (const s of saleRows) {
    const e = byId.get(s.eventPerformanceId!)!;
    const a = acc.get(e.id)!;
    const offer = s.matchTier === "offer" && s.matchOfferId ? e.offers.find((o) => o.id === s.matchOfferId) : undefined;
    const share = offer ? offer.share : 1;
    const day = dayIn(s.saleDate);
    const net = netSaleContribution(s); // negative for refund rows
    const amount = Number(s.amount);
    if (s.status === "refunded") {
      a.refunds += Math.abs(net) * share;
      if (offer) { const o = a.offers.get(offer.id); if (o) o.ourRevenue += net * share; }
      continue;
    }
    if (s.status !== "paid" && s.status !== "completed" && s.status) continue;
    const partialRefund = Math.max(0, amount - net);
    a.collected += amount * share;
    a.refunds += partialRefund * share;
    a.orders += 1;
    if (day <= (e.cartClose ?? day)) a.cartOpenRevenue += amount * share; else a.postCartRevenue += amount * share;
    if (s.customerEmail) a.buyers.add(s.customerEmail.toLowerCase());
    if (offer) {
      const o = a.offers.get(offer.id) ?? { id: offer.id, name: offer.name, share: offer.share, count: 0, revenue: 0, ourRevenue: 0 };
      o.count += 1; o.revenue += amount; o.ourRevenue += net * share; a.offers.set(offer.id, o);
    } else if (s.matchTier && (TIERS as readonly string[]).includes(s.matchTier)) {
      a.tiers[s.matchTier as Tier].count += 1;
      a.tiers[s.matchTier as Tier].revenue += amount;
    } else if (s.matchStatus === "window") {
      a.byDate.count += 1;
      a.byDate.revenue += amount;
    }
    // Contracted: the full plan value once per buyer and product; later installments add nothing.
    const name = normalizeName(s.productName) ?? "";
    const key = `${(s.customerEmail ?? `sale:${s.id}`).toLowerCase()}|${name}`;
    if (!a.contractedKeys.has(key)) {
      a.contractedKeys.add(key);
      a.contracted += (contract.get(name) ?? amount) * share;
    }
  }

  const spend = await db.select({
    eventId: adSpendDaily.eventPerformanceId,
    spend: sql<string>`sum(${adSpendDaily.spend})`, impressions: sql<string>`sum(${adSpendDaily.impressions})`,
    clicks: sql<string>`sum(${adSpendDaily.clicks})`, leads: sql<string>`sum(${adSpendDaily.leads})`,
  }).from(adSpendDaily).where(and(eq(adSpendDaily.clientId, clientId), inArray(adSpendDaily.eventPerformanceId, ids)))
    .groupBy(adSpendDaily.eventPerformanceId);
  for (const r of spend) {
    const a = acc.get(r.eventId!)!;
    a.adSpend += Number(r.spend) || 0; a.impressions += Number(r.impressions) || 0;
    a.clicks += Number(r.clicks) || 0; a.adLeads += Number(r.leads) || 0;
  }
  const opt = await db.select({ eventId: optIns.eventPerformanceId, n: sql<string>`count(*)` })
    .from(optIns).where(and(eq(optIns.clientId, clientId), inArray(optIns.eventPerformanceId, ids))).groupBy(optIns.eventPerformanceId);
  for (const r of opt) acc.get(r.eventId!)!.optIns += Number(r.n) || 0;

  const conflicts = new Map<number, number>();
  for (const s of saleRows) if (s.matchStatus === "conflict") conflicts.set(s.eventPerformanceId!, (conflicts.get(s.eventPerformanceId!) ?? 0) + 1);

  const targets = onlyEventIds ? events.filter((e) => onlyEventIds.includes(e.id) || onlyEventIds.includes(e.feedsIntoId ?? -1)) : events;
  const reports: EventReport[] = [];
  for (const e of targets) {
    const m = meta.get(e.id)!;
    const minis = events.filter((x) => x.role === "mini" && x.feedsIntoId === e.id);
    let withMinis: EventNumbers | null = null;
    if (e.role === "main") {
      const total = empty();
      merge(total, acc.get(e.id)!);
      for (const mini of minis) merge(total, acc.get(mini.id)!);
      withMinis = finish(total);
    }
    reports.push({
      id: e.id, registryId: e.registryId, title: e.title, type: m.type, role: e.role, feedsIntoId: e.feedsIntoId,
      startDate: m.startDate.toISOString(), endDate: m.endDate?.toISOString() ?? null,
      adsStart: e.adsStart, cartOpen: e.cartOpen, cartClose: e.cartClose, postCartEnd: e.postCartEnd,
      own: finish(acc.get(e.id)!), withMinis, miniIds: minis.map((x) => x.id),
      unmatchedInWindow: await unmatchedInWindow(clientId, e),
      conflicts: conflicts.get(e.id) ?? 0,
    });
  }
  return reports;
}

// How much unmatched data falls inside an event's dates (Neo rule 6, and a hint on the event page).
async function unmatchedInWindow(clientId: number, e: RegistryEvent) {
  const sw = salesWindow(e);
  const aw = adsWindow(e);
  const [s] = sw.start && sw.end ? await db.select({
    total: sql<string>`coalesce(sum(${sales.amount}) filter (where ${sales.status} <> 'refunded'), 0)`, n: sql<string>`count(*)`,
  }).from(sales).where(and(eq(sales.clientId, clientId), eq(sales.matchStatus, "unmatched"),
    sql`${sales.saleDate}::date between ${sw.start}::date and ${sw.end}::date`)) : [{ total: "0", n: "0" }];
  const [a] = aw.start && aw.end ? await db.select({ total: sql<string>`coalesce(sum(${adSpendDaily.spend}), 0)` })
    .from(adSpendDaily).where(and(eq(adSpendDaily.clientId, clientId), eq(adSpendDaily.matchStatus, "unmatched"),
      sql`${adSpendDaily.date} between ${aw.start}::date and ${aw.end}::date`)) : [{ total: "0" }];
  const [o] = aw.start && aw.end ? await db.select({ n: sql<string>`count(*)` }).from(optIns)
    .where(and(eq(optIns.clientId, clientId), eq(optIns.matchStatus, "unmatched"),
      sql`${optIns.submittedAt}::date between ${aw.start}::date and ${aw.end}::date`)) : [{ n: "0" }];
  return { sales: round2(Number(s.total)), salesCount: Number(s.n), adSpend: round2(Number(a.total)), optIns: Number(o.n) };
}

