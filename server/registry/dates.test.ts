import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { adSpendDaily, agencies, clients, integrationConnections } from "@shared/schema";
import { db } from "../storage";
import { addDays, datesFromRules, DEFAULT_DATE_RULES, rulesOf, spendSpan } from "./dates";

test("date rules: ads start opens the cart, cart closes a week after, follow-up runs a month", () => {
  const span = { firstSpend: "2026-09-10", lastSpend: "2026-09-30", adSpend: 5000, alreadyRunning: false };
  assert.deepEqual(datesFromRules({ eventStart: "2026-10-01", eventEnd: "2026-10-03", span }, DEFAULT_DATE_RULES), {
    adsStart: "2026-09-10", cartOpen: "2026-09-10", cartClose: "2026-10-10", postCartEnd: "2026-11-09",
  });
  // No ads found: the cart opens on the first event day.
  const none = { firstSpend: null, lastSpend: null, adSpend: 0, alreadyRunning: false };
  assert.deepEqual(datesFromRules({ eventStart: "2026-10-08", eventEnd: null, span: none }, rulesOf({ cartDays: 5, followUpDays: 14 })), {
    adsStart: null, cartOpen: "2026-10-08", cartClose: "2026-10-13", postCartEnd: "2026-10-27",
  });
  assert.deepEqual(rulesOf({ cartDays: "999", followUpDays: -4, adsLookbackDays: "x" }), { cartDays: 60, followUpDays: 0, adsLookbackDays: 60 });
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
});

test("spend span finds the ad run on the event's pages and ignores other pages", async () => {
  const marker = randomUUID();
  const [agency] = await db.insert(agencies).values({ name: `dates-${marker}` }).returning();
  const [client] = await db.insert(clients).values({ name: `dates-${marker}`, agencyId: agency.id }).returning();
  try {
    const [conn] = await db.insert(integrationConnections).values({ clientId: client.id, provider: "meta", externalAccountId: "act_9" }).returning();
    const row = (adId: string, url: string, date: string, spend: string, campaignId = "c1") =>
      ({ clientId: client.id, connectionId: conn.id, provider: "meta", accountId: "9", campaignId, adId, landingUrl: url, date, spend });
    await db.insert(adSpendDaily).values([
      row("a1", "https://www.summit.com/?utm_source=fb", "2026-09-12", "100.00"),
      row("a1", "https://www.summit.com/?utm_source=fb", "2026-09-29", "250.50"),
      row("a2", "summit.com/vip", "2026-09-20", "40.00"),
      row("a3", "other.com/masterclass", "2026-09-01", "999.00", "c9"),
      row("a1", "https://summit.com", "2026-10-20", "75.00"), // after the event: not part of this run
    ]);
    const rules = DEFAULT_DATE_RULES;
    const span = await spendSpan(client.id, { eventStart: "2026-10-01", eventEnd: "2026-10-03", pageLinks: ["summit.com"], adCampaignIds: [] }, rules);
    assert.deepEqual(span, { firstSpend: "2026-09-12", lastSpend: "2026-09-29", adSpend: 350.5, alreadyRunning: false });
    const byCampaign = await spendSpan(client.id, { eventStart: "2026-10-01", eventEnd: null, pageLinks: ["summit.com"], adCampaignIds: ["c9"] }, rules);
    assert.equal(byCampaign.firstSpend, "2026-09-01", "listed campaigns replace page links");
    const evergreen = await spendSpan(client.id, { eventStart: "2026-10-01", eventEnd: null, pageLinks: ["summit.com"], adCampaignIds: [] }, rulesOf({ adsLookbackDays: 19 }));
    assert.equal(evergreen.alreadyRunning, true, "spend on the first searched day means ads started earlier");
    const nothing = await spendSpan(client.id, { eventStart: "2026-10-01", eventEnd: null, pageLinks: [], adCampaignIds: [] }, rules);
    assert.equal(nothing.firstSpend, null);
  } finally {
    await db.delete(clients).where(eq(clients.id, client.id));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
