// Event Registry API. Staff edit; client logins can read their own workspace's registry and
// event numbers. Every change re-runs the matcher for that client, so numbers update at once.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import {
  adSpendDaily, clients, eventOffers, eventPerformance, integrationConnections, optIns, productContractValues, sales, type User,
} from "@shared/schema";
import { db } from "../storage";
import { isAuthenticated } from "../auth";
import { rematchClient } from "./match";
import { eventReports } from "./metrics";
import { datesFromRules, rulesOf, spendSpan } from "./dates";
import { normalizeName, normalizeUrl, splitList, TIERS, type TierProducts } from "./normalize";

type GetUser = (req: any) => Promise<User | undefined>;
const isStaff = (u: User | undefined) => u?.role === "owner" || u?.role === "agency_admin" || u?.role === "team_member";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish();
const list = z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v === undefined ? undefined : splitList(v)));
const tierProducts = z.object(Object.fromEntries(TIERS.map((t) => [t, list])) as Record<typeof TIERS[number], typeof list>).partial();

const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  eventType: z.enum(["webinar", "challenge", "summit", "workshop", "other"]).default("webinar"),
  funnelRole: z.enum(["main", "mini"]),
  feedsIntoId: z.number().int().positive().nullish(),
  adsStart: day, eventStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), eventEnd: day,
  cartOpen: day, cartClose: day, postCartEnd: day,
  pageLinks: list, adCampaignIds: list,
  products: tierProducts.optional(),
  notes: z.string().max(2000).nullish(),
});

const offerSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200),
  productNames: list.refine((v) => !!v && v.length > 0, "List at least one product name"),
  priceText: z.string().max(200).nullish(),
  soldThrough: z.string().max(200).nullish(),
  sharePercent: z.coerce.number().min(0).max(100).default(100),
  notes: z.string().max(1000).nullish(),
});

const settingsSchema = z.object({
  eventCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/, "Use 1-8 letters or numbers").nullish(),
  defaultProducts: tierProducts.optional(),
  contractValues: z.array(z.object({ productName: z.string().trim().min(1), fullValue: z.coerce.number().positive() })).optional(),
  dateRules: z.object({
    cartDays: z.coerce.number().int().min(0).max(60),
    followUpDays: z.coerce.number().int().min(0).max(365),
    adsLookbackDays: z.coerce.number().int().min(7).max(180),
    countAllInWindow: z.boolean(),
  }).partial().optional(),
});

const suggestDatesSchema = z.object({
  eventStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Add the event start date first"),
  eventEnd: day,
  pageLinks: list, adCampaignIds: list,
});

const cleanProducts = (p: Record<string, string[] | undefined> | undefined): TierProducts =>
  Object.fromEntries(TIERS.map((t) => [t, p?.[t] ?? []]).filter(([, v]) => (v as string[]).length)) as TierProducts;

// "CA-2611-MINI", plus "-2", "-3" ... when a client runs two Minis in one month.
async function nextRegistryId(clientId: number, code: string, eventStart: string, role: string, exceptId?: number) {
  const base = `${code}-${eventStart.slice(2, 4)}${eventStart.slice(5, 7)}-${role.toUpperCase()}`;
  const taken = new Set((await db.select({ id: eventPerformance.registryId }).from(eventPerformance)
    .where(and(eq(eventPerformance.clientId, clientId), sql`${eventPerformance.registryId} like ${base + "%"}`,
      ...(exceptId ? [ne(eventPerformance.id, exceptId)] : []))))
    .map((r) => r.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

type Problem = { eventId: number | null; level: "error" | "warning"; message: string };

async function problemsFor(clientId: number): Promise<Problem[]> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  const events = await db.select().from(eventPerformance)
    .where(and(eq(eventPerformance.clientId, clientId), sql`${eventPerformance.funnelRole} is not null`));
  const meta = await db.select({ id: integrationConnections.id }).from(integrationConnections)
    .where(and(eq(integrationConnections.clientId, clientId), eq(integrationConnections.provider, "meta")));
  const out: Problem[] = [];
  if (!client?.eventCode) out.push({ eventId: null, level: "warning", message: "Add a client code so events get readable Event IDs." });
  if (!meta.length) out.push({ eventId: null, level: "warning", message: "No Meta ad account is connected, so ad spend can't be matched." });
  const defaults = (client?.defaultProducts ?? {}) as TierProducts;
  for (const e of events) {
    const name = e.registryId ?? e.title;
    if (e.funnelRole === "mini" && !e.feedsIntoId) out.push({ eventId: e.id, level: "error", message: `${name}: a Mini event needs the Main event it feeds into.` });
    if (e.feedsIntoId) {
      const main = events.find((m) => m.id === e.feedsIntoId);
      if (!main || main.funnelRole !== "main") out.push({ eventId: e.id, level: "error", message: `${name}: "Feeds into" must be a Main event of this client.` });
    }
    if (e.cartOpen && e.cartClose && e.cartClose < e.cartOpen) out.push({ eventId: e.id, level: "error", message: `${name}: Cart Close is before Cart Open.` });
    if (e.cartClose && e.postCartEnd && e.postCartEnd < e.cartClose) out.push({ eventId: e.id, level: "error", message: `${name}: Post-Cart End is before Cart Close.` });
    if (e.adsStart && e.cartOpen && e.cartOpen < e.adsStart) out.push({ eventId: e.id, level: "warning", message: `${name}: Cart opens before ads start.` });
    if (!e.cartOpen || !e.cartClose) out.push({ eventId: e.id, level: "error", message: `${name}: add Cart Open and Cart Close, or no sales can match.` });
    if (!e.pageLinks?.length && !e.adCampaignIds?.length) out.push({ eventId: e.id, level: "warning", message: `${name}: no page link, so ad spend and opt-ins can't match.` });
    const own = (e.products ?? {}) as TierProducts;
    const anyProduct = TIERS.some((t) => (own[t]?.length ? own[t] : defaults[t])?.length);
    if (!anyProduct) out.push({ eventId: e.id, level: "warning", message: `${name}: no products, so only Event Offers can match sales.` });
  }
  return out;
}

export function registerRegistryRoutes(app: Express, getRequestUser: GetUser) {
  const clientIdOf = (req: Request) => Number(req.params.clientId);
  const staffOnly = async (req: Request, res: Response) => {
    if (isStaff(await getRequestUser(req))) return true;
    res.status(403).json({ error: "Only your team can change the registry." });
    return false;
  };
  const eventOf = async (clientId: number, id: number) =>
    (await db.select().from(eventPerformance).where(and(eq(eventPerformance.id, id), eq(eventPerformance.clientId, clientId))))[0];
  const rematch = (clientId: number) => rematchClient(clientId).catch((e) => {
    console.error("[registry] rematch failed:", e);
    return null;
  });

  // Everything the registry screen needs in one call.
  app.get("/api/clients/:clientId/registry", isAuthenticated, async (req, res) => {
    const clientId = clientIdOf(req);
    const [client] = await db.select({ eventCode: clients.eventCode, defaultProducts: clients.defaultProducts, dateRules: clients.registryDateRules }).from(clients).where(eq(clients.id, clientId));
    const events = await db.select().from(eventPerformance).where(eq(eventPerformance.clientId, clientId)).orderBy(desc(eventPerformance.startDate));
    const offers = await db.select().from(eventOffers).where(eq(eventOffers.clientId, clientId));
    const contractValues = await db.select().from(productContractValues).where(eq(productContractValues.clientId, clientId));
    const reports = await eventReports(clientId);
    const [counts] = await db.select({
      // Counted as groups (one per product name, page link or campaign), the way the Unmatched list shows them.
      sales: sql<string>`(select count(distinct (${sales.source}, ${sales.productName})) from ${sales} where ${sales.clientId} = ${clientId} and ${sales.matchStatus} = 'unmatched')`,
      spend: sql<string>`(select count(distinct (coalesce(${adSpendDaily.landingUrl}, ''), ${adSpendDaily.campaignId})) from ${adSpendDaily} where ${adSpendDaily.clientId} = ${clientId} and ${adSpendDaily.matchStatus} = 'unmatched' and ${adSpendDaily.spend} > 0)`,
      optIns: sql<string>`(select count(distinct coalesce(${optIns.pageUrl}, '')) from ${optIns} where ${optIns.clientId} = ${clientId} and ${optIns.matchStatus} = 'unmatched')`,
      byDate: sql<string>`(select count(distinct (${sales.source}, ${sales.productName})) from ${sales} where ${sales.clientId} = ${clientId} and ${sales.matchStatus} = 'window')`,
      conflicts: sql<string>`(select count(*) from ${sales} where ${sales.clientId} = ${clientId} and ${sales.matchStatus} = 'conflict')
        + (select count(*) from ${adSpendDaily} where ${adSpendDaily.clientId} = ${clientId} and ${adSpendDaily.matchStatus} = 'conflict')
        + (select count(*) from ${optIns} where ${optIns.clientId} = ${clientId} and ${optIns.matchStatus} = 'conflict')`,
    }).from(sql`(select 1) as one`);
    res.json({
      settings: { eventCode: client?.eventCode ?? null, defaultProducts: client?.defaultProducts ?? {}, contractValues, dateRules: rulesOf(client?.dateRules) },
      events: events.map((e) => ({
        id: e.id, registryId: e.registryId, title: e.title, eventType: e.eventType, funnelRole: e.funnelRole, feedsIntoId: e.feedsIntoId,
        eventStart: e.startDate.toISOString().slice(0, 10), eventEnd: e.endDate?.toISOString().slice(0, 10) ?? null,
        adsStart: e.adsStart, cartOpen: e.cartOpen, cartClose: e.cartClose, postCartEnd: e.postCartEnd,
        pageLinks: e.pageLinks ?? [], adCampaignIds: e.adCampaignIds ?? [], products: e.products ?? {}, notes: e.notes,
        offers: offers.filter((o) => o.eventPerformanceId === e.id),
      })),
      reports,
      problems: await problemsFor(clientId),
      unmatched: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, Number(v)])),
    });
  });

  // Names and links actually seen in the client's data, to pick from instead of typing.
  app.get("/api/clients/:clientId/registry/suggestions", isAuthenticated, async (req, res) => {
    if (!await staffOnly(req, res)) return;
    const clientId = clientIdOf(req);
    const products = await db.select({
      name: sales.productName, source: sales.source, n: sql<string>`count(*)`, last: sql<string>`max(${sales.saleDate})`,
    }).from(sales).where(and(eq(sales.clientId, clientId), sql`${sales.productName} is not null`, ne(sales.status, "refunded")))
      .groupBy(sales.productName, sales.source).orderBy(sql`max(${sales.saleDate}) desc`).limit(400);
    const pages = await db.select({ url: adSpendDaily.landingUrl, spend: sql<string>`sum(${adSpendDaily.spend})`, last: sql<string>`max(${adSpendDaily.date})::text` })
      .from(adSpendDaily).where(and(eq(adSpendDaily.clientId, clientId), sql`${adSpendDaily.landingUrl} is not null`))
      .groupBy(adSpendDaily.landingUrl).orderBy(sql`max(${adSpendDaily.date}) desc`).limit(200);
    const optInPages = await db.select({ url: optIns.pageUrl, n: sql<string>`count(*)`, last: sql<string>`max(${optIns.submittedAt})` })
      .from(optIns).where(and(eq(optIns.clientId, clientId), sql`${optIns.pageUrl} is not null`))
      .groupBy(optIns.pageUrl).orderBy(sql`max(${optIns.submittedAt}) desc`).limit(200);
    const campaigns = await db.select({ id: adSpendDaily.campaignId, name: sql<string>`max(${adSpendDaily.campaignName})`, spend: sql<string>`sum(${adSpendDaily.spend})` })
      .from(adSpendDaily).where(eq(adSpendDaily.clientId, clientId)).groupBy(adSpendDaily.campaignId).orderBy(sql`max(${adSpendDaily.date}) desc`).limit(200);
    const pageMap = new Map<string, { url: string; adSpend: number; optIns: number }>();
    for (const p of pages) pageMap.set(p.url!, { url: p.url!, adSpend: Number(p.spend), optIns: 0 });
    for (const p of optInPages) {
      const cur = pageMap.get(p.url!) ?? { url: p.url!, adSpend: 0, optIns: 0 };
      cur.optIns = Number(p.n); pageMap.set(p.url!, cur);
    }
    res.json({
      products: products.map((p) => ({ name: p.name, source: p.source, orders: Number(p.n), lastSale: p.last })),
      pages: Array.from(pageMap.values()),
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, spend: Number(c.spend) })),
    });
  });

  // Suggested windows for an event from when its ads ran (see registry/dates.ts). Saves nothing.
  app.post("/api/clients/:clientId/registry/suggest-dates", isAuthenticated, async (req, res) => {
    if (!await staffOnly(req, res)) return;
    const parsed = suggestDatesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid event" });
    const clientId = clientIdOf(req);
    const [client] = await db.select({ rules: clients.registryDateRules }).from(clients).where(eq(clients.id, clientId));
    const rules = rulesOf(client?.rules);
    const input = { eventStart: parsed.data.eventStart, eventEnd: parsed.data.eventEnd ?? null, pageLinks: parsed.data.pageLinks ?? [], adCampaignIds: parsed.data.adCampaignIds ?? [] };
    const span = await spendSpan(clientId, input, rules);
    res.json({ ...datesFromRules({ ...input, span }, rules), basis: span, rules });
  });

  app.put("/api/clients/:clientId/registry/settings", isAuthenticated, async (req, res) => {
    if (!await staffOnly(req, res)) return;
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" });
    const clientId = clientIdOf(req);
    const set: Record<string, unknown> = {};
    if (parsed.data.eventCode !== undefined) set.eventCode = parsed.data.eventCode;
    if (parsed.data.defaultProducts) set.defaultProducts = cleanProducts(parsed.data.defaultProducts);
    if (parsed.data.dateRules) {
      const [current] = await db.select({ rules: clients.registryDateRules }).from(clients).where(eq(clients.id, clientId));
      set.registryDateRules = rulesOf({ ...rulesOf(current?.rules), ...parsed.data.dateRules });
    }
    if (Object.keys(set).length) await db.update(clients).set(set).where(eq(clients.id, clientId));
    if (parsed.data.contractValues) {
      await db.transaction(async (tx) => {
        await tx.delete(productContractValues).where(eq(productContractValues.clientId, clientId));
        const rows = parsed.data.contractValues!.map((c) => ({ clientId, productName: normalizeName(c.productName)!, fullValue: c.fullValue.toFixed(2) }));
        const unique = Array.from(new Map(rows.map((r) => [r.productName, r])).values());
        if (unique.length) await tx.insert(productContractValues).values(unique);
      });
    }
    res.json({ success: true, rematched: await rematch(clientId) });
  });

  const saveEvent = async (req: Request, res: Response, existingId?: number) => {
    if (!await staffOnly(req, res)) return;
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid event" });
    const clientId = clientIdOf(req);
    const d = parsed.data;
    if (existingId && !await eventOf(clientId, existingId)) return res.status(404).json({ error: "Event not found" });
    if (d.feedsIntoId) {
      const main = await eventOf(clientId, d.feedsIntoId);
      if (!main || main.funnelRole !== "main") return res.status(400).json({ error: "Feeds into must be a Main event of this client." });
    }
    const [client] = await db.select({ code: clients.eventCode, name: clients.name }).from(clients).where(eq(clients.id, clientId));
    const code = client?.code || (client?.name ?? "EV").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "EV";
    const values = {
      clientId, title: d.title, eventType: d.eventType, funnelRole: d.funnelRole,
      feedsIntoId: d.funnelRole === "mini" ? d.feedsIntoId ?? null : null,
      startDate: new Date(`${d.eventStart}T12:00:00Z`), endDate: d.eventEnd ? new Date(`${d.eventEnd}T12:00:00Z`) : null,
      adsStart: d.adsStart ?? null, cartOpen: d.cartOpen ?? null, cartClose: d.cartClose ?? null, postCartEnd: d.postCartEnd ?? null,
      pageLinks: (d.pageLinks ?? []).map(normalizeUrl).filter((v): v is string => !!v),
      adCampaignIds: d.adCampaignIds ?? [],
      products: cleanProducts(d.products),
      notes: d.notes ?? null,
      registryId: await nextRegistryId(clientId, code, d.eventStart, d.funnelRole, existingId),
      updatedAt: new Date(),
    };
    const [row] = existingId
      ? await db.update(eventPerformance).set(values).where(eq(eventPerformance.id, existingId)).returning()
      : await db.insert(eventPerformance).values({ ...values, dataSource: "registry" }).returning();
    res.status(existingId ? 200 : 201).json({ id: row.id, registryId: row.registryId, rematched: await rematch(clientId) });
  };
  app.post("/api/clients/:clientId/registry/events", isAuthenticated, (req, res) => saveEvent(req, res));
  app.put("/api/clients/:clientId/registry/events/:eventId", isAuthenticated, (req, res) => saveEvent(req, res, Number(req.params.eventId)));

  // Takes an event out of the registry (its Event Tracker numbers stay).
  app.delete("/api/clients/:clientId/registry/events/:eventId", isAuthenticated, async (req, res) => {
    if (!await staffOnly(req, res)) return;
    const clientId = clientIdOf(req);
    const id = Number(req.params.eventId);
    if (!await eventOf(clientId, id)) return res.status(404).json({ error: "Event not found" });
    await db.update(eventPerformance).set({ funnelRole: null, feedsIntoId: null }).where(eq(eventPerformance.id, id));
    await db.update(eventPerformance).set({ feedsIntoId: null }).where(eq(eventPerformance.feedsIntoId, id));
    for (const table of [sales, adSpendDaily, optIns] as const) {
      await db.update(table).set({ eventPerformanceId: null, matchStatus: null, matchNote: null } as any)
        .where(and(eq((table as any).clientId, clientId), eq((table as any).eventPerformanceId, id)));
    }
    res.json({ success: true, rematched: await rematch(clientId) });
  });

  // Replaces the event's offers with the list sent.
  app.put("/api/clients/:clientId/registry/events/:eventId/offers", isAuthenticated, async (req, res) => {
    if (!await staffOnly(req, res)) return;
    const parsed = z.array(offerSchema).max(50).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid offers" });
    const clientId = clientIdOf(req);
    const eventId = Number(req.params.eventId);
    if (!await eventOf(clientId, eventId)) return res.status(404).json({ error: "Event not found" });
    await db.transaction(async (tx) => {
      const keep = parsed.data.filter((o) => o.id).map((o) => o.id!);
      await tx.delete(eventOffers).where(and(eq(eventOffers.eventPerformanceId, eventId),
        ...(keep.length ? [sql`${eventOffers.id} not in (${sql.join(keep.map((k) => sql`${k}`), sql`, `)})`] : [])));
      for (const o of parsed.data) {
        const values = {
          clientId, eventPerformanceId: eventId, name: o.name, productNames: o.productNames!, priceText: o.priceText ?? null,
          soldThrough: o.soldThrough ?? null, sharePercent: o.sharePercent.toFixed(2), notes: o.notes ?? null,
        };
        if (o.id) await tx.update(eventOffers).set(values).where(and(eq(eventOffers.id, o.id), eq(eventOffers.eventPerformanceId, eventId)));
        else await tx.insert(eventOffers).values(values);
      }
    });
    res.json({ success: true, rematched: await rematch(clientId) });
  });

  app.post("/api/clients/:clientId/registry/rematch", isAuthenticated, async (req, res) => {
    if (!await staffOnly(req, res)) return;
    res.json(await rematchClient(clientIdOf(req)));
  });

  // Unmatched and conflicting data, grouped by the raw name or link so one fix covers many rows.
  app.get("/api/clients/:clientId/registry/unmatched", isAuthenticated, async (req, res) => {
    if (!await staffOnly(req, res)) return;
    const clientId = clientIdOf(req);
    const status = req.query.status === "conflict" ? "conflict" : req.query.status === "window" ? "window" : "unmatched";
    const salesGroups = await db.select({
      name: sales.productName, source: sales.source, note: sql<string>`max(${sales.matchNote})`,
      count: sql<string>`count(*)`, amount: sql<string>`sum(case when ${sales.status} = 'refunded' then 0 else ${sales.amount} end)`,
      first: sql<string>`min(${sales.saleDate})`, last: sql<string>`max(${sales.saleDate})`,
      events: sql<number[]>`array_remove(array_agg(distinct ${sales.eventPerformanceId}), null)`,
    }).from(sales).where(and(eq(sales.clientId, clientId), eq(sales.matchStatus, status)))
      .groupBy(sales.productName, sales.source).orderBy(sql`sum(${sales.amount}) desc nulls last`).limit(300);
    const spendGroups = await db.select({
      url: adSpendDaily.landingUrl, campaignId: adSpendDaily.campaignId, campaignName: sql<string>`max(${adSpendDaily.campaignName})`,
      adName: sql<string>`max(${adSpendDaily.adName})`, note: sql<string>`max(${adSpendDaily.matchNote})`,
      amount: sql<string>`sum(${adSpendDaily.spend})`, first: sql<string>`min(${adSpendDaily.date})::text`, last: sql<string>`max(${adSpendDaily.date})::text`,
      events: sql<number[]>`array_remove(array_agg(distinct ${adSpendDaily.eventPerformanceId}), null)`,
    }).from(adSpendDaily).where(and(eq(adSpendDaily.clientId, clientId), eq(adSpendDaily.matchStatus, status), sql`${adSpendDaily.spend} > 0`))
      .groupBy(adSpendDaily.landingUrl, adSpendDaily.campaignId).orderBy(sql`sum(${adSpendDaily.spend}) desc`).limit(300);
    const optInGroups = await db.select({
      url: optIns.pageUrl, title: sql<string>`max(${optIns.pageTitle})`, note: sql<string>`max(${optIns.matchNote})`, count: sql<string>`count(*)`,
      first: sql<string>`min(${optIns.submittedAt})`, last: sql<string>`max(${optIns.submittedAt})`,
      events: sql<number[]>`array_remove(array_agg(distinct ${optIns.eventPerformanceId}), null)`,
    }).from(optIns).where(and(eq(optIns.clientId, clientId), eq(optIns.matchStatus, status)))
      .groupBy(optIns.pageUrl).orderBy(sql`count(*) desc`).limit(300);
    res.json({
      status,
      sales: salesGroups.map((g) => ({ ...g, count: Number(g.count), amount: Number(g.amount) })),
      spend: spendGroups.map((g) => ({ ...g, amount: Number(g.amount) })),
      optIns: optInGroups.map((g) => ({ ...g, count: Number(g.count) })),
    });
  });

  // One-tap fix from the Unmatched list: add the product, page link or campaign to an event.
  app.post("/api/clients/:clientId/registry/assign", isAuthenticated, async (req, res) => {
    if (!await staffOnly(req, res)) return;
    const parsed = z.object({
      eventId: z.number().int().positive(),
      kind: z.enum(["product", "page", "campaign"]),
      value: z.string().trim().min(1).max(1000),
      tier: z.enum(TIERS).optional(),
      offerId: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid fix" });
    const clientId = clientIdOf(req);
    const { eventId, kind, value, tier, offerId } = parsed.data;
    const event = await eventOf(clientId, eventId);
    if (!event || !event.funnelRole) return res.status(404).json({ error: "Event not found in the registry" });
    if (kind === "page") {
      const url = normalizeUrl(value)!;
      await db.update(eventPerformance).set({ pageLinks: Array.from(new Set([...(event.pageLinks ?? []), url])) }).where(eq(eventPerformance.id, eventId));
    } else if (kind === "campaign") {
      await db.update(eventPerformance).set({ adCampaignIds: Array.from(new Set([...(event.adCampaignIds ?? []), value])) }).where(eq(eventPerformance.id, eventId));
    } else if (offerId) {
      const [offer] = await db.select().from(eventOffers).where(and(eq(eventOffers.id, offerId), eq(eventOffers.eventPerformanceId, eventId)));
      if (!offer) return res.status(404).json({ error: "Offer not found on this event" });
      await db.update(eventOffers).set({ productNames: Array.from(new Set([...offer.productNames, value])) }).where(eq(eventOffers.id, offerId));
    } else {
      if (!tier) return res.status(400).json({ error: "Pick a tier or an offer" });
      // Adding to an event's own list replaces the client defaults for that tier, so start from them.
      const [client] = await db.select({ defaults: clients.defaultProducts }).from(clients).where(eq(clients.id, clientId));
      const own = (event.products ?? {}) as TierProducts;
      const base = own[tier]?.length ? own[tier]! : ((client?.defaults ?? {}) as TierProducts)[tier] ?? [];
      await db.update(eventPerformance).set({ products: { ...own, [tier]: Array.from(new Set([...base, value])) } }).where(eq(eventPerformance.id, eventId));
    }
    res.json({ success: true, rematched: await rematch(clientId) });
  });

  // Numbers for one event, with its Minis when it is a Main.
  app.get("/api/clients/:clientId/registry/events/:eventId/report", isAuthenticated, async (req, res) => {
    const clientId = clientIdOf(req);
    const id = Number(req.params.eventId);
    const reports = await eventReports(clientId, [id]);
    const report = reports.find((r) => r.id === id);
    if (!report) return res.status(404).json({ error: "Event not found in the registry" });
    res.json({ report, minis: reports.filter((r) => r.feedsIntoId === id) });
  });
}

