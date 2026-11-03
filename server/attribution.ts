// Links money to events. A sale counts toward an event when its product is on that event's list
// (kind "product"); ad spend counts when its campaign is on the list (kind "campaign").
import { and, eq, inArray } from "drizzle-orm";
import { adSpendDaily, eventAttributionRules, sales } from "@shared/schema";
import { db } from "./storage";

export async function eventForProducts(clientId: number, provider: string, productIds: (string | null | undefined)[]) {
  const ids = productIds.filter((id): id is string => !!id);
  if (!ids.length) return null;
  const [rule] = await db.select({ eventId: eventAttributionRules.eventPerformanceId })
    .from(eventAttributionRules)
    .where(and(
      eq(eventAttributionRules.clientId, clientId),
      eq(eventAttributionRules.kind, "product"),
      eq(eventAttributionRules.provider, provider),
      inArray(eventAttributionRules.matchValue, ids),
    ))
    .limit(1);
  return rule?.eventId ?? null;
}

// After rules change, re-tag existing rows so past sales and spend move to the right event.
// Only rows carrying a matching product or campaign id are touched; sales assigned by hand
// (which have no product id) keep their event.
export async function reapplyAttribution(clientId: number): Promise<{ sales: number; spend: number }> {
  const rules = await db.select().from(eventAttributionRules).where(eq(eventAttributionRules.clientId, clientId));
  let salesTagged = 0;
  let spendTagged = 0;
  await db.transaction(async (tx) => {
    for (const rule of rules) {
      if (rule.kind === "product") {
        const rows = await tx.update(sales)
          .set({ eventPerformanceId: rule.eventPerformanceId })
          .where(and(eq(sales.clientId, clientId), eq(sales.source, rule.provider), eq(sales.productId, rule.matchValue)))
          .returning({ id: sales.id });
        salesTagged += rows.length;
      } else if (rule.kind === "campaign") {
        const rows = await tx.update(adSpendDaily)
          .set({ eventPerformanceId: rule.eventPerformanceId })
          .where(and(eq(adSpendDaily.clientId, clientId), eq(adSpendDaily.provider, rule.provider), eq(adSpendDaily.campaignId, rule.matchValue)))
          .returning({ id: adSpendDaily.id });
        spendTagged += rows.length;
      }
    }
  });
  return { sales: salesTagged, spend: spendTagged };
}

export async function eventForCampaign(clientId: number, provider: string, campaignId: string) {
  const [rule] = await db.select({ eventId: eventAttributionRules.eventPerformanceId })
    .from(eventAttributionRules)
    .where(and(
      eq(eventAttributionRules.clientId, clientId),
      eq(eventAttributionRules.kind, "campaign"),
      eq(eventAttributionRules.provider, provider),
      eq(eventAttributionRules.matchValue, campaignId),
    ))
    .limit(1);
  return rule?.eventId ?? null;
}
