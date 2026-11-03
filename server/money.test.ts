import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { agencies, clients, eventPerformance, sales, users } from "@shared/schema";
import { db } from "./storage";
import { registerApiRoutes } from "./routes";

test("revenue summary and integrations stay inside each client's workspace", async () => {
  process.env.SESSION_SECRET ||= "test-session-secret";
  const marker = randomUUID();
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const id = req.header("x-test-user");
    req.isAuthenticated = () => Boolean(id);
    if (id) req.user = { claims: { sub: id }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
    next();
  });
  registerApiRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const call = async (user: string | null, path: string, method = "GET", body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method, headers: { ...(user ? { "x-test-user": user } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const [agency] = await db.insert(agencies).values({ name: `money-${marker}` }).returning();
  const [a] = await db.insert(clients).values({ name: `money-a-${marker}`, agencyId: agency.id }).returning();
  const [b] = await db.insert(clients).values({ name: `money-b-${marker}`, agencyId: agency.id }).returning();
  const owner = `money-owner-${marker}`;
  const clientA = `money-client-a-${marker}`;
  const staffB = `money-staff-b-${marker}`;
  await db.insert(users).values([
    { id: owner, role: "owner" },
    { id: clientA, role: "agency_client", agencyId: agency.id, clientAccess: [a.id] },
    { id: staffB, role: "team_member", agencyId: agency.id, clientAccess: [b.id] },
  ]);
  try {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const [event] = await db.insert(eventPerformance).values({ clientId: a.id, title: "Masterclass", eventType: "webinar", startDate: today }).returning();
    await db.insert(sales).values([
      { clientId: a.id, amount: "300.00", saleDate: today, source: "whop", status: "paid", productId: "prod_1", dedupeKey: `m1-${marker}`, metadata: { refundAmount: 0 } },
      { clientId: a.id, amount: "100.00", saleDate: today, source: "whop", status: "refunded", productId: "prod_1", dedupeKey: `m2-${marker}`, metadata: { refundAmount: 100 } },
      { clientId: b.id, amount: "999.00", saleDate: today, source: "stripe", status: "paid", dedupeKey: `m3-${marker}` },
    ]);
    const path = (id: number) => `/api/clients/${id}/money-summary?from=${iso}&to=${iso}&tz=UTC`;

    const own = await call(clientA, path(a.id));
    assert.equal(own.status, 200);
    assert.equal(own.body.totals.revenue, 200, "net of the refund");
    assert.equal(own.body.events[0].revenueSource, "manual");

    assert.equal((await call(clientA, path(b.id))).status, 403, "client cannot read another workspace");
    assert.equal((await call(staffB, path(a.id))).status, 403, "staff cannot read an unassigned workspace");
    assert.equal((await call(null, path(a.id))).status, 401);
    assert.equal((await call(clientA, `/api/clients/${a.id}/integrations`)).status, 403, "clients cannot see connections");
    assert.equal((await call(clientA, `/api/clients/${a.id}/attribution`)).status, 403, "clients cannot change event links");
    assert.equal((await call(staffB, `/api/clients/${a.id}/attribution`, "PUT", {
      eventPerformanceId: event.id, kind: "product", provider: "whop", matchValue: "prod_1",
    })).status, 403);

    // Linking the product moves its sales onto the event.
    const linked = await call(owner, `/api/clients/${a.id}/attribution`, "PUT", {
      eventPerformanceId: event.id, kind: "product", provider: "whop", matchValue: "prod_1", label: "VIP",
    });
    assert.equal(linked.status, 200);
    assert.equal(linked.body.retagged.sales, 2);
    const after = await call(owner, path(a.id));
    assert.equal(after.body.events[0].revenueSource, "synced");
    assert.equal(after.body.events[0].revenue, 200);
    // An event in another workspace cannot be linked.
    assert.equal((await call(owner, `/api/clients/${b.id}/attribution`, "PUT", {
      eventPerformanceId: event.id, kind: "product", provider: "whop", matchValue: "prod_x",
    })).status, 404);

    // Connections never echo secrets back.
    const saved = await call(owner, `/api/clients/${a.id}/integrations`, "PUT", {
      provider: "fanbasis", displayName: "Fanbasis", credentials: { apiKey: "fb_live_supersecretvalue1234" },
    });
    assert.equal(saved.status, 200);
    assert.ok(!JSON.stringify(saved.body).includes("supersecret"));
    assert.equal(saved.body.credentialHints.apiKey, "fb_live_…1234");
  } finally {
    server.close();
    await db.delete(clients).where(inArray(clients.id, [a.id, b.id]));
    await db.delete(users).where(inArray(users.id, [owner, clientA, staffB]));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
