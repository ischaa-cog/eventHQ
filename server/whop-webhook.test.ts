import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { agencies, clients, sales, salesSources } from "@shared/schema";
import { db } from "./storage";
import { registerWhopWebhook, whopEventToSale } from "./whop-webhook";
import { netSaleContribution } from "./sales-math";

const payment = (id: string, total: number) => ({
  id: `msg_${id}`, type: "payment.succeeded", timestamp: "2026-10-30T12:00:00Z",
  data: {
    id, total, currency: "usd", paid_at: "2026-10-30T11:59:00Z",
    user: { name: "Pat Buyer", username: "pat", email: "Pat@Example.com" }, product: { title: "Inner Circle" },
  },
});
const refund = (id: string, amount: number, status = "succeeded") => ({
  id: `msg_${id}`, type: "refund.created", data: { id, amount, currency: "usd", status, created_at: "2026-10-30T13:00:00Z" },
});

test("whopEventToSale maps payments and refunds and ignores everything else", () => {
  const sale = whopEventToSale(payment("pay_1", 49.5));
  assert.ok(sale && !("remove" in sale));
  assert.equal(sale.amount, 49.5);
  assert.equal(sale.status, "paid");
  assert.equal(sale.customerEmail, "pat@example.com");
  assert.equal(sale.productName, "Inner Circle");
  assert.equal(sale.dedupeKey, "whop:pay_1");

  const back = whopEventToSale(refund("rf_1", 20));
  assert.ok(back && !("remove" in back));
  assert.equal(back.status, "refunded");
  assert.equal(netSaleContribution({ amount: back.amount, status: back.status, metadata: { refundAmount: back.refundAmount } }), -20);

  assert.deepEqual(whopEventToSale(refund("rf_2", 20, "canceled")), { remove: "whop-refund:rf_2" });
  assert.equal(whopEventToSale(refund("rf_3", 20, "pending")), null);
  assert.equal(whopEventToSale({ type: "payment.failed", data: { id: "pay_2", total: 10 } }), null);
  assert.equal(whopEventToSale({ type: "membership.activated", data: { id: "mem_1" } }), null);
  assert.equal(whopEventToSale({}), null);

  // Whop's current API wraps money in objects and puts the buyer's email in customer_email.
  const money = (amount: string) => ({ currency: "usd", amount, decimals: 2 });
  const current = whopEventToSale({ type: "payment.succeeded", data: {
    id: "pay_obj", total: money("997.00"), subtotal: money("997.00"), currency: "usd",
    customer_email: "Buyer@Example.com", user: { name: null, username: "buyer", email: null }, paid_at: "2026-10-30T15:29:08Z",
    line_items: [{ product_title: "Relational Intelligence Academy" }],
  } });
  assert.ok(current && !("remove" in current));
  assert.equal(current.amount, 997);
  assert.equal(current.customerEmail, "buyer@example.com");
  assert.equal(current.productName, "Relational Intelligence Academy");
  const refunded = whopEventToSale({ type: "refund.created", data: { id: "rf_obj", status: "succeeded", amount: money("27.00") } });
  assert.ok(refunded && !("remove" in refunded));
  assert.equal(refunded.refundAmount, 27);
  // A 100%-off order is not revenue.
  assert.equal(whopEventToSale({ type: "payment.succeeded", data: { id: "pay_free", total: money("0.00"), subtotal: money("997.00") } }), null);
});

test("Whop webhook records sales once per payment, needs the workspace token, and handles refunds", async () => {
  const marker = randomUUID();
  const app = express();
  app.use(express.json());
  registerWhopWebhook(app);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const post = async (token: string | null, body: unknown) => {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/webhooks/whop${token ? `?token=${token}` : ""}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const [agency] = await db.insert(agencies).values({ name: `whop-${marker}` }).returning();
  const [client] = await db.insert(clients).values({ name: `whop-${marker}`, agencyId: agency.id }).returning();
  try {
    assert.ok(client.webhookToken);
    assert.equal((await post(null, payment("pay_x", 10))).status, 401);
    assert.equal((await post("wrong-token", payment("pay_x", 10))).status, 401);

    const pay = `pay_${marker}`;
    assert.equal((await post(client.webhookToken!, payment(pay, 100))).status, 200);
    // Whop retries deliveries; a repeat must not double-count.
    assert.equal((await post(client.webhookToken!, payment(pay, 100))).status, 200);
    assert.equal((await post(client.webhookToken!, { type: "membership.activated", data: { id: "mem_1" } })).body.ignored, true);

    const rf = `rf_${marker}`;
    assert.equal((await post(client.webhookToken!, refund(rf, 30))).status, 200);
    let rows = await db.select().from(sales).where(eq(sales.clientId, client.id));
    assert.equal(rows.length, 2);
    assert.equal(rows.reduce((sum, r) => sum + netSaleContribution(r), 0), 70);
    assert.ok(rows.every(r => r.source === "whop"));

    // A canceled refund drops back out of revenue.
    assert.equal((await post(client.webhookToken!, { ...refund(rf, 30, "canceled"), type: "refund.updated" })).body.removed, true);
    rows = await db.select().from(sales).where(eq(sales.clientId, client.id));
    assert.equal(rows.reduce((sum, r) => sum + netSaleContribution(r), 0), 100);

    const [source] = await db.select().from(salesSources).where(eq(salesSources.clientId, client.id));
    assert.equal(source.processor, "whop");
    assert.equal(source.verified, true);
  } finally {
    server.close();
    await db.delete(sales).where(eq(sales.clientId, client.id));
    await db.delete(salesSources).where(eq(salesSources.clientId, client.id));
    await db.delete(clients).where(eq(clients.id, client.id));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
