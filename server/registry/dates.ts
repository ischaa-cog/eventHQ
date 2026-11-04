// "Fill dates from ads": an event's windows from when its ads ran, using the agency's rule of thumb.
// - Ads start: first day ads spent on the event's pages (or listed campaigns).
// - Cart open: the same day, so ticket and VIP sales during the ad run count toward the event.
//   If no ads are found, the first event day.
// - Cart close: last event day + cartDays (the open/close cart email sequence, usually 5-7 days).
// - Post-cart end: cart close + followUpDays (the sales team keeps calling leads and closing).
// The results are suggestions shown in the form; nothing is saved until someone saves the event.
import { and, eq, gte, lte } from "drizzle-orm";
import { adSpendDaily } from "@shared/schema";
import { db } from "../storage";
import { normalizeUrl } from "./normalize";

// countAllInWindow: loose matching (registry/match.ts). On unless a client turns it off.
export type DateRules = { cartDays: number; followUpDays: number; adsLookbackDays: number; countAllInWindow: boolean };
export const DEFAULT_DATE_RULES: DateRules = { cartDays: 7, followUpDays: 30, adsLookbackDays: 60, countAllInWindow: true };

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function rulesOf(value: unknown): DateRules {
  const v = (value ?? {}) as Partial<DateRules>;
  return {
    cartDays: clamp(v.cartDays, 0, 60, DEFAULT_DATE_RULES.cartDays),
    followUpDays: clamp(v.followUpDays, 0, 365, DEFAULT_DATE_RULES.followUpDays),
    adsLookbackDays: clamp(v.adsLookbackDays, 7, 180, DEFAULT_DATE_RULES.adsLookbackDays),
    countAllInWindow: typeof v.countAllInWindow === "boolean" ? v.countAllInWindow : DEFAULT_DATE_RULES.countAllInWindow,
  };
}

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type SpendSpan = { firstSpend: string | null; lastSpend: string | null; adSpend: number; alreadyRunning: boolean };

export function datesFromRules(input: { eventStart: string; eventEnd?: string | null; span: SpendSpan }, rules: DateRules) {
  const end = input.eventEnd && input.eventEnd > input.eventStart ? input.eventEnd : input.eventStart;
  const adsStart = input.span.firstSpend;
  const cartOpen = adsStart && adsStart < input.eventStart ? adsStart : input.eventStart;
  const cartClose = addDays(end, rules.cartDays);
  return { adsStart, cartOpen, cartClose, postCartEnd: addDays(cartClose, rules.followUpDays) };
}

// Days with ad spend on these pages or campaigns, from adsLookbackDays before the event to its last day.
export async function spendSpan(
  clientId: number, input: { eventStart: string; eventEnd?: string | null; pageLinks: string[]; adCampaignIds: string[] }, rules: DateRules,
): Promise<SpendSpan> {
  const from = addDays(input.eventStart, -rules.adsLookbackDays);
  const to = input.eventEnd && input.eventEnd > input.eventStart ? input.eventEnd : input.eventStart;
  const pages = new Set(input.pageLinks.map((u) => normalizeUrl(u)).filter(Boolean) as string[]);
  const campaigns = new Set(input.adCampaignIds.map((c) => c.trim()).filter(Boolean));
  if (!pages.size && !campaigns.size) return { firstSpend: null, lastSpend: null, adSpend: 0, alreadyRunning: false };
  const rows = await db.select({ date: adSpendDaily.date, url: adSpendDaily.landingUrl, campaignId: adSpendDaily.campaignId, spend: adSpendDaily.spend })
    .from(adSpendDaily)
    .where(and(eq(adSpendDaily.clientId, clientId), gte(adSpendDaily.date, from), lte(adSpendDaily.date, to)));
  let firstSpend: string | null = null;
  let lastSpend: string | null = null;
  let adSpend = 0;
  for (const r of rows) {
    const hit = campaigns.size ? campaigns.has(r.campaignId) : !!r.url && pages.has(normalizeUrl(r.url)!);
    if (!hit || Number(r.spend) <= 0) continue;
    const d = String(r.date).slice(0, 10);
    if (!firstSpend || d < firstSpend) firstSpend = d;
    if (!lastSpend || d > lastSpend) lastSpend = d;
    adSpend += Number(r.spend);
  }
  // Spend on the very first day of the lookback means the ads were probably running before it (evergreen).
  return { firstSpend, lastSpend, adSpend: Math.round(adSpend * 100) / 100, alreadyRunning: firstSpend === from };
}
