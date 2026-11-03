// What Neo knows about events: the registry and the computed numbers, never raw platform data.
import { eventReports, type EventNumbers } from "./metrics";

export const NEO_EVENT_RULES = `EVENT QUESTIONS
You answer questions about client events using the computed event tables only.
1. First resolve which event the user means using the Event Registry (client + event name or dates). Never search ads, funnels or products by name.
2. If more than one event could match, list them with their Event IDs and dates and ask which one.
3. State the Event ID and date window you used at the top of every answer.
4. Report: ad spend, opt-ins, opt-in rate, cost per opt-in, sales by tier (VIP, Platinum, main offer), sales by offer, contracted and collected revenue, refunds, ROAS.
5. For a Main event, give its own numbers and the total including its Mini events.
6. If the event has unmatched data in its date window, say so and how much.
If the event table below is empty or the event isn't in it, say the event isn't in the Event Registry yet instead of estimating.`;

const compact = (n: EventNumbers) => ({
  adSpend: n.adSpend, impressions: n.impressions, clicks: n.clicks, cpm: n.cpm, cpc: n.cpc,
  optIns: n.optIns, optInRatePct: n.optInRate, costPerOptIn: n.costPerOptIn,
  vip: n.tiers.vip, platinum: n.tiers.platinum, mainOffer: n.tiers.mainOffer, postCart: n.tiers.postCart,
  offers: n.offers.map((o) => ({ name: o.name, sold: o.count, gross: o.revenue, ourShare: o.share, ourRevenue: o.ourRevenue })),
  contracted: n.contracted, collected: n.collected, refunds: n.refunds, netRevenue: n.netRevenue, roas: n.roas,
  cartOpenRevenue: n.cartOpenRevenue, postCartRevenue: n.postCartRevenue, buyers: n.buyers,
});

// The newest 30 registry events with their numbers, as JSON Neo can quote from.
export async function neoEventContext(clientId: number): Promise<string> {
  const reports = (await eventReports(clientId))
    .sort((a, b) => (b.cartOpen ?? b.startDate).localeCompare(a.cartOpen ?? a.startDate))
    .slice(0, 30);
  const rows = reports.map((r) => ({
    eventId: r.registryId, name: r.title, type: r.role, feedsInto: reports.find((m) => m.id === r.feedsIntoId)?.registryId ?? null,
    adsStart: r.adsStart, cartOpen: r.cartOpen, cartClose: r.cartClose, postCartEnd: r.postCartEnd,
    ownNumbers: compact(r.own),
    totalWithMinis: r.withMinis ? compact(r.withMinis) : undefined,
    unmatchedInWindow: r.unmatchedInWindow,
    conflicts: r.conflicts,
  }));
  return `${NEO_EVENT_RULES}

EVENT TABLE (US dollars; dates are New York time; computed by EventHQ from the Event Registry)
${rows.length ? JSON.stringify(rows) : "[] (no events in the registry yet)"}`;
}
