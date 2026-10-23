import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { inArray } from "drizzle-orm";
import { activityLog, agencies, calendarEntries, clients, eventPerformance, users } from "@shared/schema";
import { db } from "./storage";
import { registerApiRoutes } from "./routes";
import { changedFields, matchActivity } from "./activity-log";

test("activity rules name the change and the client it belongs to", () => {
  assert.deepEqual(matchActivity("POST", "/api/clients/12/calendar"), { action: "Added calendar item", clientId: 12, id: undefined, lookup: undefined });
  assert.equal(matchActivity("DELETE", "/api/calendar/7")?.lookup, "calendar");
  assert.equal(matchActivity("PATCH", "/api/clients/12/users/abc/password")?.action, "Reset client login password");
  // Reads, sign-ins, Neo chats and lesson progress are not recorded.
  assert.equal(matchActivity("GET", "/api/clients/12/calendar"), undefined);
  assert.equal(matchActivity("POST", "/api/login"), undefined);
  assert.equal(matchActivity("POST", "/api/clients/12/tuck/chats/3/messages"), undefined);
  assert.equal(matchActivity("POST", "/api/training/videos/4/complete"), undefined);
  // Edits list the fields that changed, never passwords.
  assert.equal(changedFields({ totalRegistrants: 1, ad_spend: 2, clientId: 3 }), "Total registrants, Ad spend");
  assert.equal(changedFields({ password: "secret-value" }), "");
});

test("each change records who made it, and only admins can read the log", async () => {
  const marker = randomUUID();
  const agencyIds: number[] = [];
  const clientIds: number[] = [];
  const userIds: string[] = [];

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
  const base = `http://127.0.0.1:${address.port}`;
  const request = async (user: string, path: string, method = "GET", body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { "x-test-user": user, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  try {
    const [agency] = await db.insert(agencies).values({ name: `activity-${marker}` }).returning();
    agencyIds.push(agency.id);
    const [assigned] = await db.insert(clients).values({ name: `Activity client ${marker}`, agencyId: agency.id }).returning();
    const [other] = await db.insert(clients).values({ name: `Activity other ${marker}`, agencyId: agency.id }).returning();
    clientIds.push(assigned.id, other.id);
    const admin = `activity-admin-${marker}`;
    const rep = `activity-rep-${marker}`;
    await db.insert(users).values([
      { id: admin, role: "agency_admin", agencyId: agency.id, email: `admin-${marker}@example.com` },
      { id: rep, role: "team_member", agencyId: agency.id, clientAccess: [assigned.id], email: `rep-${marker}@example.com`, firstName: "Riley", lastName: "Rep" },
    ]);
    userIds.push(admin, rep);

    const entry = await request(rep, `/api/clients/${assigned.id}/calendar`, "POST", { title: "Launch email", eventDate: "2026-10-05T15:00:00Z" });
    assert.equal(entry.status, 201);
    assert.equal((await request(rep, `/api/calendar/${entry.body.id}`, "PATCH", { title: "Launch email v2" })).status, 200);
    assert.equal((await request(rep, `/api/calendar/${entry.body.id}`, "DELETE")).status, 200);
    const tracked = await request(rep, `/api/clients/${assigned.id}/event-performance`, "POST", {
      title: "Fall Challenge", eventType: "challenge", startDate: "2026-10-01T00:00:00Z", totalRegistrants: 100,
    });
    assert.equal(tracked.status, 201);
    // Refused changes are not recorded.
    assert.equal((await request(rep, `/api/clients/${other.id}/calendar`, "POST", { title: "Not mine", eventDate: "2026-10-05T15:00:00Z" })).status, 403);

    assert.equal((await request(rep, "/api/activity")).status, 403);
    const log = await request(admin, `/api/activity?userId=${rep}`);
    assert.equal(log.status, 200);
    const rows = log.body.entries.map((e: any) => [e.action, e.item, e.clientName, e.userName, e.userRole]);
    assert.deepEqual(rows, [
      ["Added Event Tracker event", "Fall Challenge", assigned.name, "Riley Rep", "team_member"],
      ["Deleted calendar item", "Launch email v2", assigned.name, "Riley Rep", "team_member"],
      ["Updated calendar item", "Launch email · Title", assigned.name, "Riley Rep", "team_member"],
      ["Added calendar item", "Launch email", assigned.name, "Riley Rep", "team_member"],
    ]);
    assert.ok(log.body.people.some((p: any) => p.userId === rep && p.userEmail === `rep-${marker}@example.com`));
    const byClient = await request(admin, `/api/activity?clientId=${other.id}`);
    assert.deepEqual(byClient.body.entries, []);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (userIds.length) await db.delete(activityLog).where(inArray(activityLog.userId, userIds));
    if (clientIds.length) await db.delete(calendarEntries).where(inArray(calendarEntries.clientId, clientIds));
    if (clientIds.length) await db.delete(eventPerformance).where(inArray(eventPerformance.clientId, clientIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (clientIds.length) await db.delete(clients).where(inArray(clients.id, clientIds));
    if (agencyIds.length) await db.delete(agencies).where(inArray(agencies.id, agencyIds));
  }
});
