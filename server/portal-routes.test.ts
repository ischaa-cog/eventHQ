import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq, inArray, like } from "drizzle-orm";
import { agencies, clients, users, trainingResources, eventPerformance } from "@shared/schema";
import { db } from "./storage";
import { registerPortalRoutes } from "./portal-routes";
import { netSaleContribution } from "./sales-math";
import { seedTrainingCatalog, starterTrainings } from "./training-catalog";

test("portal enforces client boundaries and keeps imported revenue idempotent", async () => {
  const marker = randomUUID();
  const createdAgencies: number[] = [];
  const createdClients: number[] = [];
  const createdUsers: string[] = [];
  const resourceIds: number[] = [];
  const app = express();
  app.use(express.json());
  app.use(async (req: any, _res, next) => {
    const id = req.header("x-test-user");
    req.isAuthenticated = () => Boolean(id);
    if (id) req.user = { claims: { sub: id }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
    next();
  });
  registerPortalRoutes(
    app,
    async req => (await db.select().from(users).where(eq(users.id, req.user?.claims?.sub ?? "")).limit(1))[0],
    async (user, id) => Boolean(user && (
      user.role === "owner" ||
      (user.role === "agency_admin" && (await db.select().from(clients).where(eq(clients.id, id)).limit(1))[0]?.agencyId === user.agencyId) ||
      (user.clientAccess ?? []).includes(id)
    )),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const base = `http://127.0.0.1:${address.port}`;

  const request = async (user: string, path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { "x-test-user": user, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const [a] = await db.insert(agencies).values({ name: `portal-test-a-${marker}` }).returning();
    const [b] = await db.insert(agencies).values({ name: `portal-test-b-${marker}` }).returning();
    createdAgencies.push(a.id, b.id);
    const [ca] = await db.insert(clients).values({ agencyId: a.id, name: `portal-test-a-${marker}` }).returning();
    const [cb] = await db.insert(clients).values({ agencyId: b.id, name: `portal-test-b-${marker}` }).returning();
    createdClients.push(ca.id, cb.id);
    const owner = `test-owner-${marker}`, adminA = `test-admin-a-${marker}`,
      adminB = `test-admin-b-${marker}`, clientA = `test-client-a-${marker}`,
      clientB = `test-client-b-${marker}`;
    await db.insert(users).values([
      { id: owner, role: "owner" },
      { id: adminA, role: "agency_admin", agencyId: a.id },
      { id: adminB, role: "agency_admin", agencyId: b.id },
      { id: clientA, role: "agency_client", agencyId: a.id, clientAccess: [ca.id] },
      { id: clientB, role: "agency_client", agencyId: b.id, clientAccess: [cb.id] },
    ]);
    createdUsers.push(owner, adminA, adminB, clientA, clientB);

    const pathA = `/api/clients/${ca.id}`;
    const resource = { title: "Test resource", category: "webinar", resourceType: "document", url: "https://example.com/doc" };
    assert.equal((await request(adminA, `${pathA}/training/resources`, "POST", { ...resource, visibleClientIds: [cb.id] })).status, 400);
    const added = await request(adminA, `${pathA}/training/resources`, "POST", resource);
    assert.equal(added.status, 201);
    resourceIds.push(added.body.id);
     assert.ok((await request(clientA, `${pathA}/training/resources`)).body.some((r: any) => r.id === added.body.id));
    assert.equal((await request(clientB, `${pathA}/training/resources`)).status, 403);
    assert.equal((await request(adminB, `/api/training/resources/${added.body.id}`, "DELETE")).status, 403);
    assert.equal((await request(clientA, `${pathA}/training/resources`, "POST", resource)).status, 403);
    const shared = await request(owner, `${pathA}/training/resources`, "POST", { ...resource, visibleClientIds: [ca.id, cb.id] });
    assert.equal(shared.status, 201);
    resourceIds.push(shared.body.id);
    assert.equal((await request(adminA, `/api/training/resources/${shared.body.id}`, "PATCH", { title: "Changed" })).status, 403);
    assert.equal((await request(adminB, `/api/training/resources/${shared.body.id}`, "DELETE")).status, 403);
     assert.ok((await request(clientB, `/api/clients/${cb.id}/training/resources`)).body.some((r: any) => r.id === shared.body.id));
     assert.equal((await request(adminA, `${pathA}/training/resources`, "POST", { ...resource, isGlobal: true, visibleClientIds: [] })).status, 403);
     const global = await request(owner, `${pathA}/training/resources`, "POST", { ...resource, title: "All clients", isGlobal: true });
     assert.equal(global.status, 201);
     resourceIds.push(global.body.id);
     assert.equal(global.body.isGlobal, true);
     assert.equal((await request(adminA, `/api/training/resources/${global.body.id}`, "PATCH", { title: "Hijacked" })).status, 403);
     assert.equal((await request(adminA, `/api/training/resources/${global.body.id}`, "DELETE")).status, 403);
     assert.equal((await request(adminA, `/api/training/resources/${added.body.id}`, "PATCH", { isGlobal: true, visibleClientIds: [] })).status, 403);
     assert.equal((await request(clientB, `/api/clients/${cb.id}/training/resources`)).body.some((r: any) => r.id === global.body.id), true);
     const [futureClient] = await db.insert(clients).values({ agencyId: b.id, name: `portal-test-future-${marker}` }).returning();
     createdClients.push(futureClient.id);
     const futureUser = `test-future-${marker}`;
     await db.insert(users).values({ id: futureUser, role: "agency_client", agencyId: b.id, clientAccess: [futureClient.id] });
     createdUsers.push(futureUser);
     const futureList = (await request(futureUser, `/api/clients/${futureClient.id}/training/resources`)).body;
     assert.equal(futureList.some((r: any) => r.id === global.body.id), true);
     assert.equal(futureList.some((r: any) => r.id === added.body.id || r.id === shared.body.id), false);
     assert.equal((await request(clientB, `${pathA}/training/resources`)).status, 403);
    assert.equal((await request(clientA, `${pathA}/calendar/connection`, "PATCH", { calendarId: "client-calendar" })).status, 403);
    assert.equal((await request(adminB, `${pathA}/calendar/connection`, "PATCH", { calendarId: "other-tenant-calendar" })).status, 403);
    assert.equal((await request(adminA, `${pathA}/calendar/connection`, "PATCH", { calendarId: "not valid <script>" })).status, 400);
    const embed = `<iframe src="https://calendar.google.com/calendar/embed?src=c_test%40group.calendar.google.com&amp;ctz=America%2FNew_York" frameborder="0"></iframe>`;
    const savedCalendar = await request(adminA, `${pathA}/calendar/connection`, "PATCH", { calendarId: embed });
    assert.equal(savedCalendar.status, 200);
    assert.equal(savedCalendar.body.calendarId, "c_test@group.calendar.google.com");
    const shareLink = `https://calendar.google.com/calendar/u/0?cid=${Buffer.from("c_share@group.calendar.google.com").toString("base64")}`;
    assert.equal((await request(adminA, `${pathA}/calendar/connection`, "PATCH", { calendarId: shareLink })).body.calendarId, "c_share@group.calendar.google.com");
    assert.equal((await request(owner, `${pathA}/calendar/connection`, "PATCH", { calendarId: "nonexistent-test-calendar" })).status, 200);
    const connection = await request(clientA, `${pathA}/calendar/connection`);
    assert.equal(connection.status, 200);
    assert.equal(connection.body.calendarId, "nonexistent-test-calendar");
    assert.equal(connection.body.connected, false);
    if (process.env.REPLIT_CONNECTORS_HOSTNAME) assert.ok(connection.body.error);
    else assert.equal(connection.body.error, null);
    assert.equal((await request(adminA, `${pathA}/calendar/sync`, "POST")).status, 403);
    assert.equal((await request(owner, `${pathA}/calendar/connection`, "PATCH", { calendarId: null })).status, 200);

    const transactions = [
      { externalId: "paid", source: "manual-test", amount: 100, status: "paid", saleDate: "2026-09-23T23:45:00Z" },
      { externalId: "refund", source: "manual-test", amount: 20, status: "refunded", saleDate: "2026-09-23T12:00:00Z" },
      { externalId: "partial-refund", source: "manual-test", amount: 100, refundAmount: 20, status: "refunded", saleDate: "2026-09-23T12:00:00Z" },
      { externalId: "failed", source: "manual-test", amount: 30, status: "failed", saleDate: "2026-09-23T12:00:00Z" },
    ];
    assert.equal((await request(clientA, `${pathA}/sales/import`, "POST", { transactions })).status, 403);
    const [otherEvent] = await db.insert(eventPerformance).values({
      clientId: cb.id, title: "Other client's event", eventType: "webinar", startDate: new Date("2026-09-23"),
    }).returning();
    assert.equal((await request(adminA, `${pathA}/sales/import`, "POST", {
      transactions: [{ ...transactions[0], externalId: "cross-tenant", eventPerformanceId: otherEvent.id }],
    })).status, 400);
    assert.equal((await request(adminA, `${pathA}/sales/import`, "POST", { transactions })).status, 201);
    assert.equal((await request(adminA, `${pathA}/sales/import`, "POST", { transactions })).status, 201);
    const summary = await request(clientA, `${pathA}/portal-summary?startDate=2026-09-01&endDate=2026-09-23T23:59:59.999Z`);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.saleCount, 4);
    assert.equal(summary.body.netRevenue, 60);
    assert.equal(netSaleContribution({ amount: "100", status: "refunded", metadata: { refundAmount: 20 } }), -20);
    assert.equal((await request(clientB, `${pathA}/portal-summary`)).status, 403);
    const projection = {
      title: "Not mine", adSpend: 100, expectedRegistrations: 100,
      showUpRate: 50, conversionRate: 10, averageSaleValue: 100,
    };
    assert.equal((await request(clientB, `${pathA}/projections`, "POST", projection)).status, 403);
    const saved = await request(clientA, `${pathA}/projections`, "POST", projection);
    assert.equal(saved.status, 201);
    assert.equal((await request(clientA, `/api/projections/${saved.body.id}`, "PATCH", {
      title: "Updated forecast",
    })).status, 200);
    assert.equal((await request(clientB, `/api/projections/${saved.body.id}`, "DELETE")).status, 403);
    assert.equal((await request(clientA, `${pathA}/projections`)).body.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (resourceIds.length) await db.delete(trainingResources).where(inArray(trainingResources.id, resourceIds));
    if (createdClients.length) await db.delete(clients).where(inArray(clients.id, createdClients));
    if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
    if (createdAgencies.length) await db.delete(agencies).where(inArray(agencies.id, createdAgencies));
  }
});

test("starter Vimeo catalog is idempotent and shared without adding missing lessons", async () => {
  await seedTrainingCatalog();
  await seedTrainingCatalog();
  const seeded = await db.select().from(trainingResources).where(like(trainingResources.seedKey, "client-trainings-vimeo-%"));
  assert.equal(seeded.length, 16);
  assert.equal(new Set(seeded.map(row => row.seedKey)).size, 16);
  assert.equal(starterTrainings.length, 16);
  assert.ok(seeded.every(row => row.isGlobal && row.url.startsWith("https://player.vimeo.com/video/")));
  assert.deepEqual(
    Object.fromEntries(["challenge", "marketing", "masterclass", "bonus_training", "webinar", "summit"].map(category => [category, seeded.filter(r => r.category === category).length])),
    { challenge: 11, marketing: 3, masterclass: 1, bonus_training: 1, webinar: 0, summit: 0 },
  );
});