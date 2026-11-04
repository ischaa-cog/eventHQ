// The registry matcher. It assigns every payment, ad-day and opt-in of a client to exactly one
// event, or marks it unmatched, using only the registry: dates, page links, campaign IDs and exact
// product names. Nothing is matched by guessing from names.
//
// Rules (Event Registry SOP, section 2):
// - Ad spend: the ad's landing URL is one of the event's page links (or, when the event lists
//   campaign IDs, the campaign is one of them), and the day is between Ads Start and Cart Close.
// - Opt-ins: the page is one of the event's page links, between Ads Start and Cart Close.
// - Sales: the product name is one of the event's tier products or offer products, paid between
//   Cart Open and Post-Cart End. A plan installment after Post-Cart End from a buyer who bought
//   that product during the event still belongs to the event.
// - Refunds follow their original payment.
// - Overlaps go to the event with the latest Cart Open on or before the date, flagged "conflict".
// - Loose mode (the default, a per-client setting): anything left over that falls inside an event's
//   dates counts toward that event anyway, marked "window" (by date only), so no revenue is missed
//   while product lists and page links are still being filled in. Listed matches always win.
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { adSpendDaily, clients, eventOffers, eventPerformance, optIns, sales } from "@shared/schema";
import { db } from "../storage";
import { dayIn, normalizeName, normalizeUrl, TIERS, type Tier, type TierProducts } from "./normalize";
import { rulesOf } from "./dates";

export type RegistryEvent = {
  id: number;
  registryId: string | null;
  title: string;
  role: "main" | "mini";
  feedsIntoId: number | null;
  adsStart: string | null;
  cartOpen: string | null;
  cartClose: string | null;
  postCartEnd: string | null;
  pageLinks: Set<string>;
  campaignIds: Set<string>;
  tiers: Record<Tier, Set<string>>;
  offers: Array<{ id: number; name: string; products: Set<string>; share: number }>;
};

export type MatchOptions = { loose?: boolean };

export type Assignment = {
  eventId: number | null;
  status: "matched" | "unmatched" | "conflict" | "window";
  tier?: Tier | "offer" | null;
  offerId?: number | null;
  note?: string | null;
};

const within = (day: string, start: string | null, end: string | null) => !!start && !!end && day >= start && day <= end;

// Sales window: Cart Open .. Post-Cart End (Cart Close when there is no post-cart).
export const salesWindow = (e: RegistryEvent) => ({ start: e.cartOpen, end: e.postCartEnd ?? e.cartClose });
// Ads and opt-ins window: Ads Start .. Cart Close (Cart Open when ads start is missing).
export const adsWindow = (e: RegistryEvent) => ({ start: e.adsStart ?? e.cartOpen, end: e.cartClose });

function pick(candidates: RegistryEvent[], day: string): { event: RegistryEvent; conflict: boolean } {
  if (candidates.length === 1) return { event: candidates[0], conflict: false };
  const opened = candidates.filter((c) => c.cartOpen && c.cartOpen <= day)
    .sort((a, b) => (b.cartOpen! < a.cartOpen! ? -1 : b.cartOpen! > a.cartOpen! ? 1 : b.id - a.id));
  const event = opened[0] ?? [...candidates].sort((a, b) => (a.cartOpen ?? "9") < (b.cartOpen ?? "9") ? -1 : 1)[0];
  return { event, conflict: true };
}

const label = (e: RegistryEvent) => e.registryId ?? `#${e.id}`;

export type SaleInput = {
  id: number; dedupeKey: string | null; parentDedupeKey: string | null; productName: string | null;
  customerEmail: string | null; saleDate: Date; status: string;
};

// Assigns a client's sales in date order. Returns assignments by sale id.
export function matchSales(rows: SaleInput[], events: RegistryEvent[], opts: MatchOptions = {}): Map<number, Assignment> {
  const out = new Map<number, Assignment>();
  const byKey = new Map<string, Assignment>();
  // (buyer email | product) -> the event where the buyer first bought it, for later installments.
  const firstPurchase = new Map<string, Assignment>();
  const sorted = [...rows].sort((a, b) => a.saleDate.getTime() - b.saleDate.getTime() || a.id - b.id);
  const refunds: SaleInput[] = [];
  for (const row of sorted) {
    if (row.status === "refunded" && row.parentDedupeKey) { refunds.push(row); continue; }
    const result = matchOne(row, events, firstPurchase, opts);
    out.set(row.id, result);
    if (row.dedupeKey) byKey.set(row.dedupeKey, result);
    const name = normalizeName(row.productName);
    if (result.eventId && row.customerEmail && name && row.status !== "refunded") {
      const k = `${row.customerEmail.toLowerCase()}|${name}`;
      if (!firstPurchase.has(k)) firstPurchase.set(k, result);
    }
  }
  for (const row of refunds) {
    const parent = byKey.get(row.parentDedupeKey!);
    out.set(row.id, parent && parent.eventId
      ? { ...parent, note: "refund of a matched payment" }
      : matchOne(row, events, firstPurchase, opts));
  }
  return out;
}

// Loose mode: the event whose window holds this date, when nothing listed claimed it.
function byWindow(day: string, events: RegistryEvent[], windowOf: (e: RegistryEvent) => { start: string | null; end: string | null }, what: string): Assignment | null {
  const inside = events.filter((e) => { const w = windowOf(e); return within(day, w.start, w.end); });
  if (!inside.length) return null;
  const { event } = pick(inside, day);
  const others = inside.filter((e) => e !== event).map(label);
  return { eventId: event.id, status: "window", tier: null, offerId: null, note: `${what} not listed; counted by date${others.length ? `, also fits ${others.join(", ")}` : ""}` };
}

function matchOne(row: SaleInput, events: RegistryEvent[], firstPurchase: Map<string, Assignment>, opts: MatchOptions = {}): Assignment {
  const name = normalizeName(row.productName);
  const day = dayIn(row.saleDate);
  if (!name) return (opts.loose && byWindow(day, events, salesWindow, "product")) || { eventId: null, status: "unmatched", note: "no product name" };
  const hits: Array<{ event: RegistryEvent; tier: Tier | "offer"; offerId: number | null }> = [];
  for (const e of events) {
    const w = salesWindow(e);
    if (!within(day, w.start, w.end)) continue;
    const tier = TIERS.find((t) => e.tiers[t].has(name));
    if (tier) { hits.push({ event: e, tier, offerId: null }); continue; }
    const offer = e.offers.find((o) => o.products.has(name));
    if (offer) hits.push({ event: e, tier: "offer", offerId: offer.id });
  }
  if (!hits.length) {
    const prior = row.customerEmail ? firstPurchase.get(`${row.customerEmail.toLowerCase()}|${name}`) : undefined;
    if (prior?.eventId) {
      const e = events.find((x) => x.id === prior.eventId);
      const w = e ? salesWindow(e) : null;
      if (w?.end && day > w.end) return { ...prior, status: prior.status === "window" ? "window" : "matched", note: "plan installment after post-cart" };
    }
    return (opts.loose && byWindow(day, events, salesWindow, "product")) || { eventId: null, status: "unmatched", note: "no event sells this product on this date" };
  }
  const { event, conflict } = pick(hits.map((h) => h.event), day);
  const hit = hits.find((h) => h.event === event)!;
  return {
    eventId: event.id, status: conflict ? "conflict" : "matched", tier: hit.tier, offerId: hit.offerId,
    note: conflict ? `also fits ${hits.filter((h) => h.event !== event).map((h) => label(h.event)).join(", ")}` : null,
  };
}

export function matchSpend(row: { campaignId: string; landingUrl: string | null; date: string }, events: RegistryEvent[], opts: MatchOptions = {}): Assignment {
  const candidates = events.filter((e) => {
    const w = adsWindow(e);
    if (!within(row.date, w.start, w.end)) return false;
    return e.campaignIds.size ? e.campaignIds.has(row.campaignId) : !!row.landingUrl && e.pageLinks.has(row.landingUrl);
  });
  if (!candidates.length) {
    return (opts.loose && byWindow(row.date, events, adsWindow, row.landingUrl ? "page" : "landing page"))
      || { eventId: null, status: "unmatched", note: row.landingUrl ? "no event uses this page on this date" : "ad has no landing page" };
  }
  const { event, conflict } = pick(candidates, row.date);
  return {
    eventId: event.id, status: conflict ? "conflict" : "matched",
    note: conflict ? `also fits ${candidates.filter((c) => c !== event).map(label).join(", ")}` : null,
  };
}

export function matchOptIn(row: { pageUrl: string | null; submittedAt: Date }, events: RegistryEvent[], opts: MatchOptions = {}): Assignment {
  const day = dayIn(row.submittedAt);
  const candidates = events.filter((e) => {
    const w = adsWindow(e);
    return !!row.pageUrl && e.pageLinks.has(row.pageUrl) && within(day, w.start, w.end);
  });
  if (!candidates.length) {
    return (opts.loose && byWindow(day, events, adsWindow, "page"))
      || { eventId: null, status: "unmatched", note: row.pageUrl ? "no event uses this page on this date" : "no page recorded" };
  }
  const { event, conflict } = pick(candidates, day);
  return {
    eventId: event.id, status: conflict ? "conflict" : "matched",
    note: conflict ? `also fits ${candidates.filter((c) => c !== event).map(label).join(", ")}` : null,
  };
}

// ---------- Loading the registry ----------

const toSet = (values: unknown, norm: (v: string) => string | null) =>
  new Set((Array.isArray(values) ? values : []).map((v) => norm(String(v))).filter((v): v is string => !!v));

export async function loadRegistry(clientId: number): Promise<RegistryEvent[]> {
  const [client] = await db.select({ defaults: clients.defaultProducts }).from(clients).where(eq(clients.id, clientId));
  const defaults = (client?.defaults ?? {}) as TierProducts;
  const rows = await db.select().from(eventPerformance)
    .where(and(eq(eventPerformance.clientId, clientId), isNotNull(eventPerformance.funnelRole)));
  const offers = rows.length ? await db.select().from(eventOffers).where(inArray(eventOffers.eventPerformanceId, rows.map((r) => r.id))) : [];
  return rows.map((r) => {
    const own = (r.products ?? {}) as TierProducts;
    const tiers = Object.fromEntries(TIERS.map((t) => [t, toSet(own[t]?.length ? own[t] : defaults[t], normalizeName)])) as Record<Tier, Set<string>>;
    return {
      id: r.id, registryId: r.registryId, title: r.title, role: r.funnelRole === "main" ? "main" : "mini",
      feedsIntoId: r.feedsIntoId, adsStart: r.adsStart, cartOpen: r.cartOpen, cartClose: r.cartClose, postCartEnd: r.postCartEnd,
      pageLinks: toSet(r.pageLinks, normalizeUrl), campaignIds: toSet(r.adCampaignIds, (v) => v.trim() || null), tiers,
      offers: offers.filter((o) => o.eventPerformanceId === r.id).map((o) => ({
        id: o.id, name: o.name, products: toSet(o.productNames, normalizeName), share: Number(o.sharePercent) / 100,
      })),
    };
  });
}

// ---------- Re-matching a client ----------

async function writeBack(table: "sales" | "ad_spend_daily" | "opt_ins", updates: Array<{ id: number; a: Assignment }>) {
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const values = sql.join(chunk.map(({ id, a }) => sql`(${id}::int, ${a.eventId}::int, ${a.status}::text, ${a.note ?? null}::text, ${a.tier ?? null}::text, ${a.offerId ?? null}::int)`), sql`, `);
    if (table === "sales") {
      await db.execute(sql`update sales as s set event_performance_id = v.event_id, match_status = v.status, match_note = v.note,
        match_tier = v.tier, match_offer_id = v.offer_id
        from (values ${values}) as v(id, event_id, status, note, tier, offer_id) where s.id = v.id`);
    } else {
      await db.execute(sql`update ${sql.raw(table)} as t set event_performance_id = v.event_id, match_status = v.status, match_note = v.note
        from (values ${values}) as v(id, event_id, status, note, tier, offer_id) where t.id = v.id`);
    }
  }
}

// Recomputes every assignment for a client. Run after a sync and after any registry change.
// Clients with no registry events keep whatever event links they had (e.g. hand-entered).
export async function rematchClient(clientId: number) {
  const events = await loadRegistry(clientId);
  if (!events.length) return { events: 0, sales: 0, spend: 0, optIns: 0 };
  const [client] = await db.select({ rules: clients.registryDateRules }).from(clients).where(eq(clients.id, clientId));
  const opts: MatchOptions = { loose: rulesOf(client?.rules).countAllInWindow };

  const saleRows = await db.select({
    id: sales.id, dedupeKey: sales.dedupeKey, parentDedupeKey: sales.parentDedupeKey, productName: sales.productName,
    customerEmail: sales.customerEmail, saleDate: sales.saleDate, status: sales.status,
    eventId: sales.eventPerformanceId, matchStatus: sales.matchStatus, matchNote: sales.matchNote, matchTier: sales.matchTier, matchOfferId: sales.matchOfferId,
  }).from(sales).where(eq(sales.clientId, clientId));
  const saleAssignments = matchSales(saleRows, events, opts);
  const saleUpdates = saleRows.flatMap((r) => {
    const a = saleAssignments.get(r.id)!;
    const same = r.eventId === a.eventId && r.matchStatus === a.status && (r.matchNote ?? null) === (a.note ?? null) &&
      (r.matchTier ?? null) === (a.tier ?? null) && (r.matchOfferId ?? null) === (a.offerId ?? null);
    return same ? [] : [{ id: r.id, a }];
  });
  await writeBack("sales", saleUpdates);

  const spendRows = await db.select({
    id: adSpendDaily.id, campaignId: adSpendDaily.campaignId, landingUrl: adSpendDaily.landingUrl, date: adSpendDaily.date,
    eventId: adSpendDaily.eventPerformanceId, matchStatus: adSpendDaily.matchStatus, matchNote: adSpendDaily.matchNote,
  }).from(adSpendDaily).where(eq(adSpendDaily.clientId, clientId));
  const spendUpdates = spendRows.flatMap((r) => {
    const a = matchSpend(r, events, opts);
    return r.eventId === a.eventId && r.matchStatus === a.status && (r.matchNote ?? null) === (a.note ?? null) ? [] : [{ id: r.id, a }];
  });
  await writeBack("ad_spend_daily", spendUpdates);

  const optRows = await db.select({
    id: optIns.id, pageUrl: optIns.pageUrl, submittedAt: optIns.submittedAt,
    eventId: optIns.eventPerformanceId, matchStatus: optIns.matchStatus, matchNote: optIns.matchNote,
  }).from(optIns).where(eq(optIns.clientId, clientId));
  const optUpdates = optRows.flatMap((r) => {
    const a = matchOptIn(r, events, opts);
    return r.eventId === a.eventId && r.matchStatus === a.status && (r.matchNote ?? null) === (a.note ?? null) ? [] : [{ id: r.id, a }];
  });
  await writeBack("opt_ins", optUpdates);

  return { events: events.length, sales: saleUpdates.length, spend: spendUpdates.length, optIns: optUpdates.length };
}
