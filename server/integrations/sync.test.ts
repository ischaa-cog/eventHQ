import test from "node:test";
import assert from "node:assert/strict";
import { fanbasisRecords, metaSpendRows, stripeExcluder, stripeRecords, stripeRefundRecords, whopRecords } from "./sync";

test("Fanbasis transactions become sales and per-refund rows, in dollars", () => {
  const rows = fanbasisRecords([
    { id: 1, public_transaction_id: "ft_1", transaction_date: "2026-11-02T20:03:22Z", amount: 4997, fan: { email: "A@B.com", name: "Ann" },
      product: { id: "p1", title: "Mastermind" }, refunds: [{ id: 9, amount: 997, created_at: "2026-11-03T10:00:00Z" }] },
    { id: 2, transaction_date: "2026-11-02T20:03:22Z", amount: 0, product: { id: "p2" }, refunds: [] },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.dedupeKey, r.status, r.amount, r.productId]), [
    ["fanbasis:1", "paid", 4997, "p1"], ["fanbasis-refund:9", "refunded", 997, "p1"],
  ]);
  assert.equal(rows[0].customerEmail, "a@b.com");
});

test("Stripe charges skip HighLevel wallet billing and fall back to the description as product", () => {
  const charge = (id: string, description: string, extra: object = {}) => ({
    id, status: "succeeded", paid: true, amount: 3700, currency: "usd", created: 1_762_000_000, description, ...extra,
  });
  const { records, skipped } = stripeRecords([
    charge("ch_1", "Auto-Recharge for Sub-Account - Acme of USD 10"),
    charge("ch_2", "750 AI Super Prompts ($37)"),
    charge("ch_3", "Subscription update", { invoice: { lines: { data: [{ price: { id: "price_1", product: "prod_club" } }] } } }),
    charge("ch_4", "Checkout", { payment_intent: "pi_4" }),
    { ...charge("ch_5", "Failed"), status: "failed" },
  ], [{ payment_intent: "pi_4", line_items: { data: [{ description: "VIP Ticket", price: { product: "prod_vip" } }] } }]);
  assert.equal(skipped, 1);
  assert.deepEqual(records.map((r) => [r.externalId, r.amount, r.productId]), [
    ["ch_2", 37, "desc:750 ai super prompts ($37)"], ["ch_3", 37, "prod_club"], ["ch_4", 37, "prod_vip"],
  ]);
  assert.deepEqual(records[1].productIds, ["prod_club", "price_1"]);
  const custom = stripeExcluder({ excludeDescriptions: ["^GrowthHub"] });
  assert.equal(custom("GrowthHub365 AI - Annual"), true);
  assert.equal(custom("Masterclass"), false);
});

test("Stripe refunds are one row each and skip refunds of excluded charges", () => {
  const known = new Map([["ch_2", { productId: "desc:x", productName: "X", customerEmail: null, customerName: null }]]);
  const rows = stripeRefundRecords([
    { id: "re_1", status: "succeeded", amount: 1000, currency: "usd", created: 1_762_000_000, charge: "ch_2" },
    { id: "re_2", status: "succeeded", amount: 500, currency: "usd", created: 1_762_000_000, charge: { id: "ch_9", description: "Manual Recharge for Location Wallet" } },
    { id: "re_3", status: "pending", amount: 500, currency: "usd", created: 1_762_000_000, charge: "ch_2" },
  ], known);
  assert.deepEqual(rows.map((r) => [r.dedupeKey, r.amount, r.productId]), [["stripe-refund:re_1", 10, "desc:x"]]);
});

test("Meta rows take the largest of a conversion's aliases instead of adding them", () => {
  const [row] = metaSpendRows([{
    campaign_id: 123, campaign_name: "Masterclass", date_start: "2026-11-01", spend: "250.50", impressions: "1000", clicks: "40",
    account_currency: "usd",
    actions: [{ action_type: "lead", value: "12" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "12" }, { action_type: "link_click", value: "40" }],
    action_values: [{ action_type: "purchase", value: "997" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "997" }],
  }]);
  assert.deepEqual(row, {
    campaignId: "123", campaignName: "Masterclass", date: "2026-11-01", spend: 250.5, currency: "USD",
    impressions: 1000, clicks: 40, leads: 12, purchases: 0, purchaseValue: 997,
  });
});

test("Whop API payments and refunds map like webhook events", () => {
  const { records, remove } = whopRecords(
    [{ id: "pay_1", status: "paid", total: 297, currency: "usd", paid_at: "2026-11-01T00:00:00Z", product: { id: "prod_1", title: "VIP" }, plan: { id: "plan_1" } },
     { id: "pay_2", status: "open", total: 50 }],
    [{ id: "rf_1", status: "succeeded", amount: 100, payment_id: "pay_1" }, { id: "rf_2", status: "canceled", amount: 5 }],
  );
  assert.deepEqual(records.map((r) => [r.dedupeKey, r.amount, r.productId]), [["whop:pay_1", 297, "prod_1"], ["whop-refund:rf_1", 100, "prod_1"]]);
  assert.deepEqual(records[0].productIds, ["prod_1", "plan_1"]);
  assert.deepEqual(remove, ["whop-refund:rf_2"]);
});
