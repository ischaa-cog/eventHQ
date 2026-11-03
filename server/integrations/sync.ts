// Pulls sales and ad spend from each client's connected providers into `sales` and `ad_spend_daily`.
// Every row has a stable key per provider record, so re-running a sync (or a webhook delivering the
// same payment) updates rows instead of adding duplicates. Sales are tagged with the event that sells
// their product, and spend with the event its campaign belongs to (event_attribution_rules).
import { createHmac } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adSpendDaily, eventAttributionRules, integrationConnections, sales, salesSources,
  type IntegrationConnection,
} from "@shared/schema";
import { db } from "../storage";
import { whopEventToSale } from "../whop-webhook";
import { credentialsOf, markFailed, markSynced } from "./connections";

export type SyncOptions = { days?: number; deadline?: number; fetchImpl?: typeof fetch };
export type SyncResult = { provider: string; sales: number; refunds: number; spendRows: number; complete: boolean };

const DAY_MS = 86_400_000;
const MAX_DAYS = 400;

// The sale shape every provider maps into.
export type SaleRecord = {
  dedupeKey: string;
  externalId: string;
  amount: number; // in major units (dollars)
  currency: string;
  status: "paid" | "refunded";
  refundAmount: number;
  productId: string | null;
  productIds?: string[]; // all ids that may match an event rule, most specific first
  productName: string | null;
  customerEmail: string | null;
  customerName: string | null;
  saleDate: Date;
};

const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const email = (v: unknown) => {
  const e = str(v, 320);
  return e && /^[^\s@]+@[^\s@]+$/.test(e) ? e.toLowerCase() : null;
};

class DeadlineReached extends Error {}

function guard(deadline?: number) {
  if (deadline && Date.now() > deadline) throw new DeadlineReached();
}

async function getJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, label: string) {
  const res = await fetchImpl(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      const body = JSON.parse(text);
      message = body?.error?.message ?? body?.message ?? message;
    } catch { /* not json */ }
    throw new Error(`${label} ${res.status}: ${message}`);
  }
  return JSON.parse(text);
}

// ---------- Saving ----------

async function productRules(clientId: number, provider: string): Promise<Map<string, number>> {
  const rows = await db.select().from(eventAttributionRules).where(and(
    eq(eventAttributionRules.clientId, clientId),
    eq(eventAttributionRules.kind, "product"),
    eq(eventAttributionRules.provider, provider),
  ));
  return new Map(rows.map((r) => [r.matchValue, r.eventPerformanceId]));
}

export async function saveSales(connection: IntegrationConnection, records: SaleRecord[]): Promise<number> {
  if (!records.length) return 0;
  const rules = await productRules(connection.clientId, connection.provider);
  const rows = records.map((r) => {
    const ids = r.productIds?.length ? r.productIds : r.productId ? [r.productId] : [];
    const eventId = ids.map((id) => rules.get(id)).find((id) => id !== undefined) ?? null;
    return {
      clientId: connection.clientId,
      connectionId: connection.id,
      source: connection.provider,
      dedupeKey: r.dedupeKey,
      externalId: r.externalId,
      amount: r.amount.toFixed(2),
      currency: r.currency,
      status: r.status,
      metadata: { refundAmount: r.refundAmount },
      productId: r.productId,
      productName: r.productName,
      customerEmail: r.customerEmail,
      customerName: r.customerName,
      saleDate: r.saleDate,
      eventPerformanceId: eventId,
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(sales).values(rows.slice(i, i + 200)).onConflictDoUpdate({
      target: [sales.clientId, sales.dedupeKey],
      set: {
        amount: sql`excluded.amount`,
        currency: sql`excluded.currency`,
        status: sql`excluded.status`,
        metadata: sql`excluded.metadata`,
        productId: sql`excluded.product_id`,
        productName: sql`excluded.product_name`,
        customerEmail: sql`excluded.customer_email`,
        customerName: sql`excluded.customer_name`,
        saleDate: sql`excluded.sale_date`,
        connectionId: sql`excluded.connection_id`,
        // Keep an event someone assigned by hand when no rule matches.
        eventPerformanceId: sql`coalesce(excluded.event_performance_id, ${sales.eventPerformanceId})`,
      },
    });
  }
  return rows.length;
}

async function removeSales(clientId: number, dedupeKeys: string[]) {
  if (dedupeKeys.length) await db.delete(sales).where(and(eq(sales.clientId, clientId), inArray(sales.dedupeKey, dedupeKeys)));
}

async function markSourceHealthy(clientId: number, processor: string) {
  await db.insert(salesSources).values({ clientId, processor, configured: true, verified: true, lastSync: new Date(), error: null })
    .onConflictDoUpdate({
      target: [salesSources.clientId, salesSources.processor],
      set: { configured: true, verified: true, lastSync: new Date(), error: null },
    });
}

// ---------- Whop ----------
// Company API key with payment:basic:read (and refund read). Whop's v1 API lists newest first.

async function whopList(fetchImpl: typeof fetch, apiKey: string, companyId: string, resource: "payments" | "refunds", since: Date, deadline?: number) {
  const out: any[] = [];
  let after: string | undefined;
  for (let page = 0; page < 200; page++) {
    guard(deadline);
    const url = new URL(`https://api.whop.com/api/v1/${resource}`);
    url.searchParams.set("first", "100");
    url.searchParams.set("company_id", companyId);
    if (after) url.searchParams.set("after", after);
    const body = await getJson(fetchImpl, url.toString(), { Authorization: `Bearer ${apiKey}` }, `Whop ${resource}`);
    const rows: any[] = body.data ?? [];
    out.push(...rows);
    const oldest = rows[rows.length - 1]?.created_at;
    if (!body.page_info?.has_next_page || (oldest && new Date(oldest) < since)) break;
    after = body.page_info.end_cursor;
  }
  return out.filter((r) => !r.created_at || new Date(r.created_at) >= since);
}

export function whopRecords(payments: any[], refunds: any[]): { records: SaleRecord[]; remove: string[] } {
  const byId = new Map(payments.map((p) => [p.id, p]));
  const records: SaleRecord[] = [];
  const remove: string[] = [];
  const events = [
    ...payments.filter((p) => p.status === "paid").map((p) => ({ type: "payment.succeeded", data: p })),
    ...refunds.map((r) => ({ type: "refund.created", data: { ...r, payment: r.payment ?? byId.get(r.payment_id) } })),
  ];
  for (const event of events) {
    const sale = whopEventToSale(event);
    if (!sale) continue;
    if ("remove" in sale) { remove.push(sale.remove); continue; }
    records.push({
      dedupeKey: sale.dedupeKey, externalId: sale.externalId, amount: sale.amount, currency: sale.currency,
      status: sale.status, refundAmount: sale.refundAmount, productId: sale.productIds[0] ?? null,
      productIds: sale.productIds, productName: sale.productName, customerEmail: sale.customerEmail,
      customerName: sale.customerName, saleDate: sale.saleDate,
    });
  }
  return { records, remove };
}

async function syncWhop(connection: IntegrationConnection, since: Date, opts: SyncOptions) {
  const { apiKey } = credentialsOf(connection);
  if (!apiKey) throw new Error("Whop API key missing");
  const f = opts.fetchImpl ?? fetch;
  let companyId = connection.externalAccountId;
  if (!companyId) {
    companyId = (await getJson(f, "https://api.whop.com/api/v5/company", { Authorization: `Bearer ${apiKey}` }, "Whop company")).id;
    await db.update(integrationConnections).set({ externalAccountId: companyId }).where(eq(integrationConnections.id, connection.id));
  }
  const payments = await whopList(f, apiKey, companyId, "payments", since, opts.deadline);
  const refunds = await whopList(f, apiKey, companyId, "refunds", since, opts.deadline).catch((e) => {
    if (e instanceof DeadlineReached) throw e;
    // Some keys can read payments but not refunds; payments still count, refunds come by webhook.
    console.warn(`[sync] Whop refunds unavailable for connection ${connection.id}: ${e.message}`);
    return [];
  });
  const { records, remove } = whopRecords(payments, refunds);
  await saveSales(connection, records);
  await removeSales(connection.clientId, remove);
  return { sales: records.filter((r) => r.status === "paid").length, refunds: records.filter((r) => r.status === "refunded").length };
}

// ---------- Fanbasis ----------
// API key in x-api-key. Amounts are in dollars. Transactions list newest first, page-numbered.

export function fanbasisRecords(transactions: any[]): SaleRecord[] {
  const out: SaleRecord[] = [];
  for (const t of transactions) {
    const amount = Number(t.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const productId = t.product?.id != null ? String(t.product.id) : null;
    const productName = str(t.product?.title) ?? str(t.service?.title);
    const base = {
      currency: "USD", productId, productIds: productId ? [productId] : [], productName,
      customerEmail: email(t.fan?.email), customerName: str(t.fan?.name, 300),
    };
    out.push({
      ...base, dedupeKey: `fanbasis:${t.id}`, externalId: String(t.public_transaction_id ?? t.id),
      amount, status: "paid", refundAmount: 0, saleDate: new Date(t.transaction_date),
    });
    for (const r of t.refunds ?? []) {
      const refund = Number(r.amount);
      if (!Number.isFinite(refund) || refund <= 0) continue;
      out.push({
        ...base, dedupeKey: `fanbasis-refund:${r.id}`, externalId: String(r.id), amount: refund, status: "refunded",
        refundAmount: refund, saleDate: new Date(r.created_at ?? t.transaction_date),
      });
    }
  }
  return out;
}

async function syncFanbasis(connection: IntegrationConnection, since: Date, opts: SyncOptions) {
  const { apiKey } = credentialsOf(connection);
  if (!apiKey) throw new Error("Fanbasis API key missing");
  const f = opts.fetchImpl ?? fetch;
  const transactions: any[] = [];
  for (let page = 1; page <= 200; page++) {
    guard(opts.deadline);
    const body = await getJson(f, `https://www.fanbasis.com/public-api/checkout-sessions/transactions?per_page=100&page=${page}`,
      { "x-api-key": apiKey, Accept: "application/json" }, "Fanbasis transactions");
    const rows: any[] = body.data?.transactions ?? [];
    transactions.push(...rows);
    const oldest = rows[rows.length - 1]?.transaction_date;
    if (!body.data?.pagination?.has_more || !rows.length || (oldest && new Date(oldest) < since)) break;
  }
  // Refunds on older sales still count on the day they happened.
  const inWindow = transactions.filter((t) => new Date(t.transaction_date) >= since ||
    (t.refunds ?? []).some((r: any) => new Date(r.created_at) >= since));
  const records = fanbasisRecords(inWindow);
  await saveSales(connection, records);
  return { sales: records.filter((r) => r.status === "paid").length, refunds: records.filter((r) => r.status === "refunded").length };
}

// ---------- Stripe ----------
// Restricted key with read access to charges and checkout sessions. Amounts are in minor units.

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const major = (amount: number, currency: string) => (ZERO_DECIMAL.has(currency) ? amount : amount / 100);

async function stripeList(
  f: typeof fetch, key: string, path: string, params: Record<string, string>,
  from: Date, until: Date | null, deadline?: number,
) {
  const out: any[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 200; page++) {
    guard(deadline);
    const url = new URL(`https://api.stripe.com/v1/${path}`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("created[gte]", String(Math.floor(from.getTime() / 1000)));
    if (until) url.searchParams.set("created[lt]", String(Math.floor(until.getTime() / 1000)));
    for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);
    const body = await getJson(f, url.toString(), { Authorization: `Bearer ${key}` }, `Stripe ${path}`);
    out.push(...(body.data ?? []));
    if (!body.has_more || !body.data?.length) break;
    startingAfter = body.data[body.data.length - 1].id;
  }
  return out;
}

// HighLevel agency accounts bill sub-account wallets, phone numbers and card checks through the same
// Stripe account. Those are platform costs passed through, not sales, so they are skipped. A
// connection can add its own patterns in settings.excludeDescriptions.
export const DEFAULT_STRIPE_EXCLUDES = [
  "^Auto-Recharge for Sub-Account",
  "^Manual Recharge for Location Wallet",
  "^PhoneNumberPurchase",
  "3DS verification$",
];

export function stripeExcluder(settings: unknown): (description: string | null) => boolean {
  const extra = (settings as { excludeDescriptions?: unknown } | null)?.excludeDescriptions;
  const patterns = [...DEFAULT_STRIPE_EXCLUDES, ...(Array.isArray(extra) ? extra.filter((p) => typeof p === "string") : [])]
    .map((p) => { try { return new RegExp(p, "i"); } catch { return null; } })
    .filter((r): r is RegExp => !!r);
  return (description) => !!description && patterns.some((r) => r.test(description));
}

export function stripeRecords(charges: any[], sessions: any[], isExcluded: (d: string | null) => boolean = stripeExcluder(null)): { records: SaleRecord[]; skipped: number } {
  // Refunds are listed separately (stripeRefundRecords) so refunds of older charges are not missed.
  // Checkout sessions say what was bought; match them to charges through the payment intent.
  const productByIntent = new Map<string, { id: string | null; name: string | null }>();
  for (const s of sessions) {
    const item = s.line_items?.data?.[0];
    if (s.payment_intent && item) {
      const product = item.price?.product;
      productByIntent.set(String(s.payment_intent), {
        id: typeof product === "string" ? product : product?.id ?? null,
        name: str(item.description) ?? str(product?.name),
      });
    }
  }
  const records: SaleRecord[] = [];
  let skipped = 0;
  for (const c of charges) {
    if (c.status !== "succeeded" || !c.paid) continue;
    if (isExcluded(str(c.description))) { skipped++; continue; }
    const currency = String(c.currency ?? "usd").toUpperCase();
    const amount = major(Number(c.amount), currency);
    if (!(amount > 0)) continue;
    const intent = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
    const invoiceLine = typeof c.invoice === "object" ? c.invoice?.lines?.data?.[0] : undefined;
    const invoiceProduct = invoiceLine?.price?.product ?? invoiceLine?.pricing?.price_details?.product;
    const fromSession = intent ? productByIntent.get(intent) : undefined;
    // Charges made outside Stripe Checkout and invoices (e.g. HighLevel order forms) carry no product id;
    // their description names the product, so it stands in as the id for event linking.
    const description = str(c.description, 200);
    const productId = fromSession?.id ?? (typeof invoiceProduct === "string" ? invoiceProduct : invoiceProduct?.id) ??
      (description ? `desc:${description.toLowerCase()}` : null);
    const priceId = invoiceLine?.price?.id ?? null;
    const base = {
      currency, productId, productIds: [productId, priceId].filter((v): v is string => !!v),
      productName: fromSession?.name ?? str(invoiceLine?.description) ?? str(c.description),
      customerEmail: email(c.billing_details?.email ?? c.receipt_email), customerName: str(c.billing_details?.name, 300),
    };
    records.push({ ...base, dedupeKey: `stripe:${c.id}`, externalId: c.id, amount, status: "paid", refundAmount: 0, saleDate: new Date(c.created * 1000) });
  }
  return { records, skipped };
}

export function stripeRefundRecords(
  refunds: any[],
  chargeRows: Map<string, { productId: string | null; productName: string | null; customerEmail: string | null; customerName: string | null }>,
  isExcluded: (d: string | null) => boolean = stripeExcluder(null),
): SaleRecord[] {
  const out: SaleRecord[] = [];
  for (const r of refunds) {
    if (r.status !== "succeeded") continue;
    // Refunds of skipped charges (e.g. HighLevel wallet recharges) are skipped too.
    if (typeof r.charge === "object" && isExcluded(str(r.charge?.description))) continue;
    const currency = String(r.currency ?? "usd").toUpperCase();
    const amount = major(Number(r.amount), currency);
    if (!(amount > 0)) continue;
    const chargeId = typeof r.charge === "string" ? r.charge : r.charge?.id;
    const charge = chargeId ? chargeRows.get(chargeId) : undefined;
    // For a charge older than the sync window, fall back to the expanded charge itself.
    const expanded = typeof r.charge === "object" ? r.charge : undefined;
    const description = str(expanded?.description, 200);
    out.push({
      dedupeKey: `stripe-refund:${r.id}`, externalId: r.id, amount, currency, status: "refunded", refundAmount: amount,
      productId: charge?.productId ?? (description ? `desc:${description.toLowerCase()}` : null),
      productName: charge?.productName ?? description ?? "Stripe refund",
      customerEmail: charge?.customerEmail ?? email(expanded?.billing_details?.email ?? expanded?.receipt_email),
      customerName: charge?.customerName ?? str(expanded?.billing_details?.name, 300),
      saleDate: new Date(r.created * 1000),
    });
  }
  return out;
}

// Charges are pulled in 3-day chunks, oldest first, each saved before the next is fetched.
// lastSyncCursor holds the end of the last finished chunk, so a run cut off by the time limit
// resumes there. Each run also re-reads the last 2 days, and all refunds in the sync window.
async function syncStripe(connection: IntegrationConnection, since: Date, opts: SyncOptions) {
  const { secretKey } = credentialsOf(connection);
  if (!secretKey) throw new Error("Stripe key missing");
  const f = opts.fetchImpl ?? fetch;
  const CHUNK = 3 * DAY_MS;
  const cursor = connection.lastSyncCursor ? new Date(Number(connection.lastSyncCursor)) : null;
  let from = cursor && cursor > since ? new Date(cursor.getTime() - 2 * DAY_MS) : since;
  let salesCount = 0;
  let refundCount = 0;
  const isExcluded = stripeExcluder(connection.settings);
  const fetchChunk = async (start: Date, end: Date) => {
    const charges = await stripeList(f, secretKey, "charges", { "expand[]": "data.invoice" }, start, end, opts.deadline);
    // A checkout session is created shortly before its charge; look a day further back.
    const sessions = charges.length
      ? await stripeList(f, secretKey, "checkout/sessions", { "expand[]": "data.line_items", status: "complete" },
          new Date(start.getTime() - DAY_MS), end, opts.deadline).catch((e) => {
          if (e instanceof DeadlineReached) throw e;
          console.warn(`[sync] Stripe checkout sessions unavailable for connection ${connection.id}: ${e.message}`);
          return [];
        })
      : [];
    return stripeRecords(charges, sessions, isExcluded).records;
  };
  // Up to 5 chunks are fetched at once; the cursor only moves past chunks that are all saved.
  while (from.getTime() < Date.now()) {
    const windows: Array<[Date, Date]> = [];
    for (let i = 0, start = from; i < 5 && start.getTime() < Date.now(); i++) {
      const end = new Date(Math.min(start.getTime() + CHUNK, Date.now() + 60_000));
      windows.push([start, end]);
      start = end;
    }
    const batches = await Promise.all(windows.map(([a, b]) => fetchChunk(a, b)));
    for (const records of batches) salesCount += await saveSales(connection, records);
    const until = windows[windows.length - 1][1];
    await db.update(integrationConnections).set({ lastSyncCursor: String(until.getTime()) })
      .where(eq(integrationConnections.id, connection.id));
    from = until;
  }
  const refunds = await stripeList(f, secretKey, "refunds", { "expand[]": "data.charge" }, since, null, opts.deadline);
  if (refunds.length) {
    const chargeIds = refunds.map((r) => `stripe:${typeof r.charge === "string" ? r.charge : r.charge?.id}`);
    const known = await db.select({
      dedupeKey: sales.dedupeKey, productId: sales.productId, productName: sales.productName,
      customerEmail: sales.customerEmail, customerName: sales.customerName,
    }).from(sales).where(and(eq(sales.clientId, connection.clientId), inArray(sales.dedupeKey, chargeIds)));
    const byCharge = new Map(known.map((k) => [k.dedupeKey!.slice("stripe:".length), k]));
    const records = stripeRefundRecords(refunds, byCharge, isExcluded);
    refundCount = await saveSales(connection, records);
  }
  return { sales: salesCount, refunds: refundCount };
}

// ---------- Meta Ads ----------
// One access token (a system user token can cover every ad account) plus the ad account id.

const LEAD_ACTIONS = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
const PURCHASE_ACTIONS = ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"];

function actionTotal(list: any[] | undefined, types: string[]): number {
  // Meta reports the same conversion under several aliases; take the largest, never the sum.
  return Math.max(0, ...(list ?? []).filter((a) => types.includes(a.action_type)).map((a) => Number(a.value) || 0));
}

export function metaSpendRows(rows: any[]) {
  return rows.map((r) => ({
    campaignId: String(r.campaign_id),
    campaignName: str(r.campaign_name),
    date: String(r.date_start),
    spend: Number(r.spend) || 0,
    currency: String(r.account_currency ?? "USD").toUpperCase(),
    impressions: Math.round(Number(r.impressions) || 0),
    clicks: Math.round(Number(r.clicks) || 0),
    leads: Math.round(actionTotal(r.actions, LEAD_ACTIONS)),
    purchases: Math.round(actionTotal(r.actions, PURCHASE_ACTIONS)),
    purchaseValue: actionTotal(r.action_values, PURCHASE_ACTIONS),
  }));
}

async function syncMeta(connection: IntegrationConnection, since: Date, opts: SyncOptions) {
  const { accessToken, appSecret } = credentialsOf(connection);
  const accountId = connection.externalAccountId.replace(/^act_/, "");
  if (!accessToken || !accountId) throw new Error("Meta access token or ad account id missing");
  const f = opts.fetchImpl ?? fetch;
  const secret = appSecret || process.env.META_APP_SECRET;
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,account_currency",
    time_range: JSON.stringify({ since: since.toISOString().slice(0, 10), until: new Date().toISOString().slice(0, 10) }),
    limit: "500",
  });
  if (secret) params.set("appsecret_proof", createHmac("sha256", secret).update(accessToken).digest("hex"));
  let url: string | undefined = `https://graph.facebook.com/v21.0/act_${accountId}/insights?${params}`;
  const raw: any[] = [];
  for (let page = 0; url && page < 100; page++) {
    guard(opts.deadline);
    const body: any = await getJson(f, url, { Authorization: `Bearer ${accessToken}` }, "Meta insights");
    raw.push(...(body.data ?? []));
    url = body.paging?.next;
  }
  const campaignRules = new Map((await db.select().from(eventAttributionRules).where(and(
    eq(eventAttributionRules.clientId, connection.clientId),
    eq(eventAttributionRules.kind, "campaign"),
    eq(eventAttributionRules.provider, "meta"),
  ))).map((r) => [r.matchValue, r.eventPerformanceId]));
  const rows = metaSpendRows(raw).map((r) => ({
    ...r,
    spend: r.spend.toFixed(2),
    purchaseValue: r.purchaseValue.toFixed(2),
    clientId: connection.clientId,
    connectionId: connection.id,
    provider: "meta",
    accountId,
    eventPerformanceId: campaignRules.get(r.campaignId) ?? null,
    updatedAt: new Date(),
  }));
  for (let i = 0; i < rows.length; i += 300) {
    await db.insert(adSpendDaily).values(rows.slice(i, i + 300)).onConflictDoUpdate({
      target: [adSpendDaily.connectionId, adSpendDaily.campaignId, adSpendDaily.date],
      set: {
        campaignName: sql`excluded.campaign_name`,
        spend: sql`excluded.spend`,
        currency: sql`excluded.currency`,
        impressions: sql`excluded.impressions`,
        clicks: sql`excluded.clicks`,
        leads: sql`excluded.leads`,
        purchases: sql`excluded.purchases`,
        purchaseValue: sql`excluded.purchase_value`,
        eventPerformanceId: sql`coalesce(excluded.event_performance_id, ${adSpendDaily.eventPerformanceId})`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  }
  return { spendRows: rows.length };
}

// ---------- Entry points ----------

export async function syncConnection(connection: IntegrationConnection, opts: SyncOptions = {}): Promise<SyncResult> {
  // First sync looks back 90 days; later ones refresh the last 30 (refunds and late Meta attribution).
  const days = Math.min(MAX_DAYS, opts.days ?? (connection.lastSyncAt ? 30 : 90));
  const since = new Date(Date.now() - days * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);
  const result: SyncResult = { provider: connection.provider, sales: 0, refunds: 0, spendRows: 0, complete: true };
  try {
    if (connection.provider === "whop") Object.assign(result, await syncWhop(connection, since, opts));
    else if (connection.provider === "fanbasis") Object.assign(result, await syncFanbasis(connection, since, opts));
    else if (connection.provider === "stripe") Object.assign(result, await syncStripe(connection, since, opts));
    else if (connection.provider === "meta") Object.assign(result, await syncMeta(connection, since, opts));
    else throw new Error(`${connection.provider} has no API sync; it reports by webhook.`);
    await markSynced(connection.id);
    if (connection.provider !== "meta") await markSourceHealthy(connection.clientId, connection.provider);
  } catch (error: any) {
    if (error instanceof DeadlineReached) {
      // Whatever was fetched before the time limit was not saved; the next run tries again.
      result.complete = false;
      return result;
    }
    await markFailed(connection.id, error.message ?? String(error));
    throw error;
  }
  return result;
}

// Syncs every active connection not synced within `staleMinutes`, oldest first, within a time budget.
export async function syncStale(opts: { clientId?: number; staleMinutes?: number; budgetMs?: number } = {}) {
  const cutoff = new Date(Date.now() - (opts.staleMinutes ?? 60) * 60_000);
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const rows = await db.select().from(integrationConnections).where(eq(integrationConnections.status, "active"));
  const due = rows
    .filter((r) => (opts.clientId ? r.clientId === opts.clientId : true))
    .filter((r) => r.provider !== "highlevel" && (!r.lastSyncAt || r.lastSyncAt < cutoff))
    .sort((a, b) => (a.lastSyncAt?.getTime() ?? 0) - (b.lastSyncAt?.getTime() ?? 0));
  const results: Array<SyncResult | { provider: string; connectionId: number; error: string }> = [];
  for (const row of due) {
    if (Date.now() > deadline - 5_000) break;
    try {
      results.push(await syncConnection(row, { deadline }));
    } catch (error: any) {
      results.push({ provider: row.provider, connectionId: row.id, error: error.message });
    }
  }
  return { checked: due.length, results };
}
