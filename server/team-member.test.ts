import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { agencies, calendarEntries, clients, eventPerformance, users, webinars } from "@shared/schema";
import { db } from "./storage";
import { registerApiRoutes } from "./routes";
import { getPostLoginRedirect, loginPortalMismatch } from "./auth";

test("team members work only in their assigned workspaces and cannot use admin actions", async () => {
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
  const request = async (user: string | null, path: string, method = "GET", body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(user ? { "x-test-user": user } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed };
  };

  try {
    const [agencyA] = await db.insert(agencies).values({ name: `team-a-${marker}` }).returning();
    const [agencyB] = await db.insert(agencies).values({ name: `team-b-${marker}` }).returning();
    agencyIds.push(agencyA.id, agencyB.id);
    const [assigned] = await db.insert(clients).values({ name: `team-assigned-${marker}`, agencyId: agencyA.id }).returning();
    const [unassigned] = await db.insert(clients).values({ name: `team-unassigned-${marker}`, agencyId: agencyA.id }).returning();
    const [otherAgency] = await db.insert(clients).values({ name: `team-other-${marker}`, agencyId: agencyB.id }).returning();
    clientIds.push(assigned.id, unassigned.id, otherAgency.id);
    const owner = `team-owner-${marker}`;
    const staleMember = `team-stale-${marker}`;
    await db.insert(users).values([
      { id: owner, role: "owner" },
      // A tampered row pointing at another agency's client must still be refused.
      { id: staleMember, role: "team_member", agencyId: agencyA.id, clientAccess: [otherAgency.id] },
    ]);
    userIds.push(owner, staleMember);

    // Only the owner creates team members, and only with workspaces in the chosen agency.
    const email = `team-member-${marker}@example.com`;
    assert.equal((await request(owner, "/api/users", "POST", {
      email, password: "long-enough-1", role: "team_member", agencyId: agencyA.id, clientAccess: [otherAgency.id],
    })).status, 400);
    const created = await request(owner, "/api/users", "POST", {
      email, password: "long-enough-1", role: "team_member", agencyId: agencyA.id, clientAccess: [assigned.id, assigned.id],
    });
    assert.equal(created.status, 201);
    const member = created.body.id as string;
    userIds.push(member);
    assert.equal(created.body.role, "team_member");
    assert.deepEqual(created.body.clientAccess, [assigned.id]);
    assert.equal((await request(member, "/api/users", "POST", {
      email: `x-${email}`, password: "long-enough-1", role: "team_member", agencyId: agencyA.id, clientAccess: [assigned.id],
    })).status, 403);

    // Staff sign in through the admin portal and land on the staff dashboard.
    assert.equal(getPostLoginRedirect({ role: "team_member", clientAccess: [assigned.id] }), "/");
    assert.equal(loginPortalMismatch("admin", "team_member"), false);
    assert.equal(loginPortalMismatch("client", "team_member"), true);

    // Workspace scope: assigned only.
    const list = await request(member, "/api/clients");
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map((c: any) => c.id), [assigned.id]);
    assert.equal((await request(member, `/api/clients/${assigned.id}`)).status, 200);
    assert.equal((await request(member, `/api/clients/${unassigned.id}`)).status, 403);
    assert.equal((await request(member, `/api/clients/${otherAgency.id}`)).status, 403);
    assert.equal((await request(staleMember, `/api/clients/${otherAgency.id}`)).status, 403);
    assert.deepEqual((await request(staleMember, "/api/clients")).body, []);

    // Day-to-day work is allowed.
    const profile = await request(member, `/api/clients/${assigned.id}`, "PATCH", { businessName: "Updated by team" });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.businessName, "Updated by team");
    const entry = await request(member, `/api/clients/${assigned.id}/calendar`, "POST", {
      title: "Launch email", eventDate: "2026-10-05T15:00:00Z",
    });
    assert.equal(entry.status, 201);
    assert.equal((await request(member, `/api/calendar/${entry.body.id}`, "PATCH", { title: "Launch email v2" })).status, 200);
    assert.equal((await request(member, `/api/calendar/${entry.body.id}`, "DELETE")).status, 200);
    assert.equal((await request(member, `/api/clients/${unassigned.id}/calendar`, "POST", {
      title: "Not mine", eventDate: "2026-10-05T15:00:00Z",
    })).status, 403);

    // Admin actions are not.
    assert.equal((await request(member, `/api/clients/${assigned.id}`, "PATCH", { name: "Renamed" })).status, 400);
    assert.equal((await request(member, `/api/clients/${assigned.id}/users`)).status, 403);
    assert.equal((await request(member, `/api/clients/${assigned.id}/webhook-token`)).status, 403);
    assert.equal((await request(member, `/api/clients/${assigned.id}/meta-ads/authorize`)).status, 403);
    assert.equal((await request(member, `/api/clients/${assigned.id}/meta-ads`, "DELETE")).status, 403);
    // Event Tracker: team members add events (with products and upsells) and update the numbers; delete stays admin-only.
    const tracked = await request(member, `/api/clients/${assigned.id}/event-performance`, "POST", {
      title: "Actuals", eventType: "challenge", startDate: "2026-10-01T00:00:00Z", totalRegistrants: 100,
      salesData: [{ name: "VIP", price: 297, quantity: 3 }], upsellData: [{ name: "Workbook", price: 47, quantity: 2 }],
    });
    assert.equal(tracked.status, 201);
    const updated = await request(member, `/api/event-performance/${tracked.body.id}`, "PATCH", {
      totalRegistrants: 150, totalAttendees: 60, upsellData: [{ name: "Workbook", price: 47, quantity: 5 }],
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.totalRegistrants, 150);
    assert.equal(updated.body.upsellData[0].quantity, 5);
    assert.equal((await request(member, `/api/event-performance/${tracked.body.id}`, "DELETE")).status, 403);
    assert.equal((await request(member, `/api/clients/${unassigned.id}/event-performance`, "POST", {
      title: "Not mine", eventType: "challenge", startDate: "2026-10-01T00:00:00Z",
    })).status, 403);
    assert.equal((await request(member, `/api/clients/${assigned.id}/event-goals`, "PATCH", { challengeGoal: 10 })).status, 403);
    assert.equal((await request(member, `/api/clients/${assigned.id}/active-status`, "PATCH", { isActive: false })).status, 403);
    assert.equal((await request(member, `/api/clients/${assigned.id}`, "DELETE")).status, 403);
    assert.equal((await request(member, "/api/users")).status, 403);

    // Internal notes reach staff but never the client portal.
    const portalClient = `team-portal-client-${marker}`;
    await db.insert(users).values({ id: portalClient, role: "agency_client", agencyId: agencyA.id, clientAccess: [assigned.id] });
    userIds.push(portalClient);
    const [performance] = await db.insert(eventPerformance).values({
      clientId: assigned.id, title: "Notes check", eventType: "challenge", startDate: new Date("2026-10-01T00:00:00Z"), notes: "Internal: renegotiate split",
    }).returning();
    await db.insert(webinars).values({ clientId: assigned.id, title: "Legacy masterclass", date: new Date("2026-09-01T00:00:00Z"), notes: "Internal: low show-up" });
    const staffList = await request(member, `/api/clients/${assigned.id}/event-performance`);
    assert.equal(staffList.body.find((e: any) => e.id === performance.id).notes, "Internal: renegotiate split");
    const clientList = await request(portalClient, `/api/clients/${assigned.id}/event-performance`);
    assert.equal(clientList.status, 200);
    assert.equal(clientList.body.find((e: any) => e.id === performance.id).notes, null);
    assert.equal((await request(portalClient, `/api/event-performance/${performance.id}`)).body.notes, null);
    assert.ok((await request(portalClient, `/api/clients/${assigned.id}/webinars`)).body.every((w: any) => w.notes === null));
    assert.ok((await request(member, `/api/clients/${assigned.id}/webinars`)).body.some((w: any) => w.notes === "Internal: low show-up"));

    // Role changes: team members keep their list; switching to admin clears it.
    const expanded = await request(owner, `/api/users/${member}/role`, "PATCH", {
      role: "team_member", agencyId: agencyA.id, clientAccess: [assigned.id, unassigned.id],
    });
    assert.equal(expanded.status, 200);
    assert.deepEqual([...expanded.body.clientAccess].sort(), [assigned.id, unassigned.id].sort());
    assert.equal((await request(member, `/api/clients/${unassigned.id}`)).status, 200);
    assert.equal((await request(owner, `/api/users/${member}/role`, "PATCH", {
      role: "team_member", agencyId: agencyA.id, clientAccess: [otherAgency.id],
    })).status, 400);
    const promoted = await request(owner, `/api/users/${member}/role`, "PATCH", { role: "agency_admin", agencyId: agencyA.id });
    assert.equal(promoted.status, 200);
    assert.deepEqual(promoted.body.clientAccess, []);
    assert.equal((await request(owner, `/api/users/${owner}/role`, "PATCH", {
      role: "team_member", agencyId: agencyA.id, clientAccess: [assigned.id],
    })).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (clientIds.length) await db.delete(calendarEntries).where(inArray(calendarEntries.clientId, clientIds));
    if (clientIds.length) await db.delete(eventPerformance).where(inArray(eventPerformance.clientId, clientIds));
    if (clientIds.length) await db.delete(webinars).where(inArray(webinars.clientId, clientIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (clientIds.length) await db.delete(clients).where(inArray(clients.id, clientIds));
    if (agencyIds.length) await db.delete(agencies).where(inArray(agencies.id, agencyIds));
  }
});

test("admins have the same full access as the owner, except the shared demo admin", async () => {
  const { hasFullAccess } = await import("@shared/roles");
  assert.equal(hasFullAccess({ id: "u1", role: "owner" }), true);
  assert.equal(hasFullAccess({ id: "u2", role: "agency_admin" }), true);
  assert.equal(hasFullAccess({ id: "demo-client:sample-admin", role: "agency_admin" }), false);
  assert.equal(hasFullAccess({ id: "u3", role: "team_member" }), false);
  assert.equal(hasFullAccess({ id: "u4", role: "agency_client" }), false);
  assert.equal(hasFullAccess(undefined), false);
});
