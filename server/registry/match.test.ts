// Tests use the example rows from Event_Registry.xlsx: Client A (code CA) with one Main event,
// one Mini that feeds it, and three Event Offers.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { agencies, adSpendDaily, clients, eventOffers, eventPerformance, integrationConnections, optIns, productContractValues, sales } from "@shared/schema";
import { db } from "../storage";
import { matchOptIn, matchSales, matchSpend, rematchClient, type RegistryEvent } from "./match";
import { eventReports } from "./metrics";
import { dayIn, normalizeName, normalizeUrl } from "./normalize";

const set = (...v: string[]) => new Set(v);
const defaults = { vip: set("vip upgrade 97"), platinum: set("plat pass"), mainOffer: set("3-day live ticket"), postCart: set("mastermind 12-pay") };
const MAIN: RegistryEvent = {
  id: 1, registryId: "CA-2701-MAIN", title: "Jan Main 3-Day Event", role: "main", feedsIntoId: null,
  adsStart: "2026-12-01", cartOpen: "2027-01-15", cartClose: "2027-01-20", postCartEnd: "2027-02-15",
  pageLinks: set("yourclient.com/3day-live", "yourclient.com/vip-upgrade"), campaignIds: set(), tiers: defaults,
  offers: [
    { id: 11, name: "AI Agents", products: set("ai agents program", "ai agents 6-pay"), share: 1 },
    { id: 12, name: "Experts", products: set("experts accelerator"), share: 1 },
    { id: 13, name: "Growth Hub", products: set("growthhub 365 annual"), share: 0.3 },
  ],
};
const MINI: RegistryEvent = {
  id: 2, registryId: "CA-2611-MINI", title: "Nov Masterclass", role: "mini", feedsIntoId: 1,
  adsStart: "2026-10-20", cartOpen: "2026-11-12", cartClose: "2026-11-16", postCartEnd: "2026-11-30",
  pageLinks: set("yourclient.com/masterclass"), campaignIds: set(), tiers: defaults, offers: [],
};
const at = (iso: string) => new Date(iso);
let nextId = 1;
const sale = (productName: string, iso: string, extra: Partial<{ email: string; status: string; dedupeKey: string; parent: string }> = {}) => ({
  id: nextId++, productName, saleDate: at(iso), customerEmail: extra.email ?? null, status: extra.status ?? "paid",
  dedupeKey: extra.dedupeKey ?? `k${nextId}`, parentDedupeKey: extra.parent ?? null,
});

test("URLs and product names normalize the way the SOP says", () => {
  assert.equal(normalizeUrl("HTTPS://www.YourClient.com/Masterclass/?utm_source=fb&x=1#top"), "yourclient.com/masterclass");
  assert.equal(normalizeUrl("http://yourclient.com/3day-live/"), "yourclient.com/3day-live");
  assert.equal(normalizeName("  VIP   Upgrade 97 "), "vip upgrade 97");
  // A payment at 10pm New York time on Jan 14 is still Jan 14 there.
  assert.equal(dayIn(at("2027-01-15T03:00:00Z")), "2027-01-14");
});

test("sales match by exact product name inside the event's sales window", () => {
  const rows = [
    sale("VIP Upgrade 97", "2026-11-13T17:00:00Z"), // Mini window
    sale("vip upgrade 97", "2027-01-16T17:00:00Z"), // Main window, case-insensitive
    sale("VIP Upgrade 97", "2027-01-15T03:00:00Z"), // Jan 14 in New York: before Main cart opens
    sale("VIP Upgrade", "2027-01-16T17:00:00Z"), // not the exact name
    sale("Experts Accelerator", "2027-01-17T17:00:00Z"),
  ];
  const out = matchSales(rows, [MAIN, MINI]);
  assert.deepEqual(rows.map((r) => [out.get(r.id)!.eventId, out.get(r.id)!.status, out.get(r.id)!.tier ?? null]), [
    [2, "matched", "vip"], [1, "matched", "vip"], [null, "unmatched", null], [null, "unmatched", null], [1, "matched", "offer"],
  ]);
  assert.equal(out.get(rows[4].id)!.offerId, 12);
});

test("plan installments after Post-Cart End stay with the event; refunds follow their payment", () => {
  const first = sale("AI Agents 6-Pay", "2027-01-18T17:00:00Z", { email: "pat@x.com", dedupeKey: "stripe:ch_1" });
  const later = sale("AI Agents 6-Pay", "2027-04-18T17:00:00Z", { email: "PAT@x.com" });
  const stranger = sale("AI Agents 6-Pay", "2027-04-18T17:00:00Z", { email: "sam@x.com" });
  const refund = sale("AI Agents 6-Pay", "2027-05-01T17:00:00Z", { status: "refunded", parent: "stripe:ch_1" });
  const out = matchSales([refund, stranger, later, first], [MAIN, MINI]);
  assert.equal(out.get(first.id)!.eventId, 1);
  assert.equal(out.get(later.id)!.eventId, 1);
  assert.match(out.get(later.id)!.note!, /installment/);
  assert.equal(out.get(stranger.id)!.status, "unmatched", "no earlier purchase by this buyer");
  assert.equal(out.get(refund.id)!.eventId, 1);
  assert.equal(out.get(refund.id)!.offerId, 11);
});

test("overlapping events: the latest Cart Open wins and the payment is flagged", () => {
  const overlap: RegistryEvent = { ...MINI, id: 3, registryId: "CA-2701-MINI", cartOpen: "2027-01-10", cartClose: "2027-01-12", postCartEnd: "2027-01-25" };
  const row = sale("VIP Upgrade 97", "2027-01-16T17:00:00Z");
  const a = matchSales([row], [MAIN, MINI, overlap]).get(row.id)!;
  assert.equal(a.eventId, 1);
  assert.equal(a.status, "conflict");
  assert.match(a.note!, /CA-2701-MINI/);
});

test("ad spend matches by landing page between Ads Start and Cart Close, or by campaign when listed", () => {
  assert.equal(matchSpend({ campaignId: "c1", landingUrl: "yourclient.com/masterclass", date: "2026-10-25" }, [MAIN, MINI]).eventId, 2);
  assert.equal(matchSpend({ campaignId: "c1", landingUrl: "yourclient.com/masterclass", date: "2026-11-20" }, [MAIN, MINI]).status, "unmatched", "after Mini cart close");
  assert.equal(matchSpend({ campaignId: "c2", landingUrl: "yourclient.com/3day-live", date: "2026-12-10" }, [MAIN, MINI]).eventId, 1);
  assert.equal(matchSpend({ campaignId: "c3", landingUrl: null, date: "2026-12-10" }, [MAIN, MINI]).note, "ad has no landing page");
  const byCampaign: RegistryEvent = { ...MAIN, campaignIds: set("120001") };
  assert.equal(matchSpend({ campaignId: "120001", landingUrl: "other.com/page", date: "2026-12-10" }, [byCampaign]).eventId, 1);
  assert.equal(matchSpend({ campaignId: "999", landingUrl: "yourclient.com/3day-live", date: "2026-12-10" }, [byCampaign]).status, "unmatched",
    "with campaigns listed, the page link no longer decides");
});

test("opt-ins match by page between Ads Start and Cart Close", () => {
  assert.equal(matchOptIn({ pageUrl: "yourclient.com/masterclass", submittedAt: at("2026-11-01T15:00:00Z") }, [MAIN, MINI]).eventId, 2);
  assert.equal(matchOptIn({ pageUrl: "yourclient.com/masterclass", submittedAt: at("2026-12-01T15:00:00Z") }, [MAIN, MINI]).status, "unmatched");
});

test("database round trip: offers share, contracted vs collected, refunds, and Main roll-up", async () => {
  process.env.SESSION_SECRET ||= "test-session-secret";
  const marker = randomUUID();
  const [agency] = await db.insert(agencies).values({ name: `reg-${marker}` }).returning();
  const [client] = await db.insert(clients).values({
    name: `EXAMPLE Client A ${marker}`, agencyId: agency.id, eventCode: "CA",
    defaultProducts: { vip: ["VIP Upgrade 97"], platinum: ["Plat Pass"], mainOffer: ["3-Day Live Ticket"], postCart: ["Mastermind 12-Pay"] },
  }).returning();
  try {
    const [main] = await db.insert(eventPerformance).values({
      clientId: client.id, title: "Jan Main 3-Day Event", eventType: "summit", funnelRole: "main", registryId: "CA-2701-MAIN",
      startDate: at("2027-01-15T12:00:00Z"), endDate: at("2027-01-17T12:00:00Z"),
      adsStart: "2026-12-01", cartOpen: "2027-01-15", cartClose: "2027-01-20", postCartEnd: "2027-02-15",
      pageLinks: ["yourclient.com/3day-live", "yourclient.com/vip-upgrade"],
    }).returning();
    const [mini] = await db.insert(eventPerformance).values({
      clientId: client.id, title: "Nov Masterclass", eventType: "webinar", funnelRole: "mini", feedsIntoId: main.id, registryId: "CA-2611-MINI",
      startDate: at("2026-11-12T12:00:00Z"), adsStart: "2026-10-20", cartOpen: "2026-11-12", cartClose: "2026-11-16", postCartEnd: "2026-11-30",
      pageLinks: ["yourclient.com/masterclass"],
    }).returning();
    const [agents] = await db.insert(eventOffers).values([
      { clientId: client.id, eventPerformanceId: main.id, name: "AI Agents", productNames: ["AI Agents Program", "AI Agents 6-Pay"], sharePercent: "100" },
      { clientId: client.id, eventPerformanceId: main.id, name: "Experts", productNames: ["Experts Accelerator"], sharePercent: "100" },
      { clientId: client.id, eventPerformanceId: main.id, name: "Growth Hub", productNames: ["GrowthHub 365 Annual"], sharePercent: "30" },
    ]).returning();
    await db.insert(productContractValues).values({ clientId: client.id, productName: "ai agents 6-pay", fullValue: "5000.00" });
    const [conn] = await db.insert(integrationConnections).values({ clientId: client.id, provider: "meta", externalAccountId: "act_1" }).returning();
    const s = (dedupeKey: string, productName: string, iso: string, amount: number, extra: object = {}) => ({
      clientId: client.id, dedupeKey, productName, saleDate: at(iso), amount: amount.toFixed(2), source: "stripe", status: "paid",
      metadata: { refundAmount: 0 }, ...extra,
    });
    await db.insert(sales).values([
      s(`${marker}-1`, "VIP Upgrade 97", "2026-11-13T17:00:00Z", 97, { customerEmail: "a@x.com" }), // Mini, cart open
      s(`${marker}-2`, "VIP Upgrade 97", "2026-11-25T17:00:00Z", 97, { customerEmail: "b@x.com" }), // Mini, post-cart
      s(`${marker}-3`, "3-Day Live Ticket", "2027-01-16T17:00:00Z", 497, { customerEmail: "a@x.com" }), // Main
      s(`${marker}-4`, "AI Agents 6-Pay", "2027-01-18T17:00:00Z", 833.33, { customerEmail: "c@x.com" }), // offer, plan
      s(`${marker}-5`, "AI Agents 6-Pay", "2027-03-18T17:00:00Z", 833.33, { customerEmail: "c@x.com" }), // installment
      s(`${marker}-6`, "GrowthHub 365 Annual", "2027-01-19T17:00:00Z", 997, { customerEmail: "d@x.com" }), // 30% share
      s(`${marker}-7`, "3-Day Live Ticket", "2027-01-20T17:00:00Z", 497, { status: "refunded", metadata: { refundAmount: 497 }, parentDedupeKey: `${marker}-3` }),
      s(`${marker}-8`, "Mystery Product", "2027-01-16T17:00:00Z", 50),
    ]);
    await db.insert(adSpendDaily).values([
      { clientId: client.id, connectionId: conn.id, provider: "meta", accountId: "1", campaignId: "c1", adId: "a1", landingUrl: "yourclient.com/masterclass", date: "2026-10-25", spend: "100.00", impressions: 10000, clicks: 200 },
      { clientId: client.id, connectionId: conn.id, provider: "meta", accountId: "1", campaignId: "c2", adId: "a2", landingUrl: "yourclient.com/3day-live", date: "2026-12-10", spend: "400.00", impressions: 20000, clicks: 300 },
      { clientId: client.id, connectionId: conn.id, provider: "meta", accountId: "1", campaignId: "c3", adId: "a3", landingUrl: "elsewhere.com/x", date: "2026-12-10", spend: "25.00" },
    ]);
    await db.insert(optIns).values([
      { clientId: client.id, connectionId: conn.id, provider: "highlevel", externalId: `${marker}-o1`, pageUrl: "yourclient.com/masterclass", submittedAt: at("2026-11-01T15:00:00Z"), email: "a@x.com" },
      { clientId: client.id, connectionId: conn.id, provider: "highlevel", externalId: `${marker}-o2`, pageUrl: "yourclient.com/masterclass", submittedAt: at("2026-11-02T15:00:00Z"), email: "e@x.com" },
    ]);

    await rematchClient(client.id);
    const reports = await eventReports(client.id);
    const m = reports.find((r) => r.id === main.id)!;
    const n = reports.find((r) => r.id === mini.id)!;

    assert.equal(n.own.tiers.vip.count, 2);
    assert.equal(n.own.cartOpenRevenue, 97);
    assert.equal(n.own.postCartRevenue, 97);
    assert.equal(n.own.adSpend, 100);
    assert.equal(n.own.optIns, 2);
    assert.equal(n.own.costPerOptIn, 50);
    assert.equal(n.own.optInRate, 1);

    assert.equal(m.own.tiers.mainOffer.count, 1);
    const agentsOffer = m.own.offers.find((o) => o.id === agents.id)!;
    assert.equal(agentsOffer.count, 2, "first payment and the later installment");
    const growth = m.own.offers.find((o) => o.name === "Growth Hub")!;
    assert.equal(growth.ourRevenue, 299.1, "30% of $997");
    assert.equal(m.own.refunds, 497);
    // collected: 497 + 833.33 + 833.33 + 997*0.3 = 2462.76; contracted: 497 + 5000 + 299.1 = 5796.1
    assert.equal(m.own.collected, 2462.76);
    assert.equal(m.own.contracted, 5796.1);
    assert.equal(m.own.netRevenue, 1965.76);
    assert.equal(m.own.adSpend, 400);
    assert.equal(m.own.roas, 4.91);
    assert.equal(m.unmatchedInWindow.salesCount, 1, "the mystery product");

    // Main roll-up = Main + its Mini.
    assert.ok(m.withMinis);
    assert.equal(m.withMinis!.adSpend, 500);
    assert.equal(m.withMinis!.collected, 2462.76 + 194);
    assert.equal(m.withMinis!.buyers, 4, "a@x.com bought at both events but counts once");
    assert.deepEqual(m.miniIds, [mini.id]);

    const [mystery] = await db.select().from(sales).where(eq(sales.dedupeKey, `${marker}-8`));
    assert.equal(mystery.matchStatus, "unmatched");
    const [stray] = await db.select().from(adSpendDaily).where(eq(adSpendDaily.adId, "a3"));
    assert.equal(stray.matchStatus, "unmatched");
  } finally {
    await db.delete(clients).where(eq(clients.id, client.id));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
