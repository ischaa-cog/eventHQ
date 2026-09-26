import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { inArray } from "drizzle-orm";
import {
  agencies,
  clients,
  eventPerformance,
  users,
} from "@shared/schema";
import { db } from "./storage";
import { registerApiRoutes } from "./routes";

test("critical API workflows enforce tenant, role, metrics, and profile boundaries", async () => {
  const marker = randomUUID();
  const agencyIds: number[] = [];
  const clientIds: number[] = [];
  const eventIds: number[] = [];
  const userIds: string[] = [];

  const app = express();
  app.use(express.json());
  // Deliberately isolated auth fixture: routes still resolve the real user
  // record, but no passport/session or external identity provider is involved.
  app.use((req: any, _res, next) => {
    const id = req.header("x-test-user");
    req.isAuthenticated = () => Boolean(id);
    if (id) {
      req.user = {
        claims: { sub: id },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
    }
    next();
  });
  registerApiRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const base = `http://127.0.0.1:${address.port}`;
  const request = async (
    user: string | null,
    path: string,
    method = "GET",
    body?: unknown,
  ) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(user ? { "x-test-user": user } : {}),
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  };

  try {
    const [agencyA] = await db.insert(agencies).values({ name: `workflow-a-${marker}` }).returning();
    const [agencyB] = await db.insert(agencies).values({ name: `workflow-b-${marker}` }).returning();
    agencyIds.push(agencyA.id, agencyB.id);
    const [clientA] = await db.insert(clients).values({
      name: `workflow-client-a-${marker}`,
      agencyId: agencyA.id,
    }).returning();
    const [clientB] = await db.insert(clients).values({
      name: `workflow-client-b-${marker}`,
      agencyId: agencyB.id,
    }).returning();
    clientIds.push(clientA.id, clientB.id);

    const owner = `workflow-owner-${marker}`;
    const adminA = `workflow-admin-a-${marker}`;
    const adminB = `workflow-admin-b-${marker}`;
    const employeeA = `workflow-employee-a-${marker}`;
    const clientUserA = `workflow-client-user-a-${marker}`;
    await db.insert(users).values([
      { id: owner, role: "owner" },
      { id: adminA, role: "agency_admin", agencyId: agencyA.id },
      { id: adminB, role: "agency_admin", agencyId: agencyB.id },
      { id: employeeA, role: "agency_employee", agencyId: agencyA.id, clientAccess: [clientA.id] },
      { id: clientUserA, role: "agency_client", agencyId: agencyA.id, clientAccess: [clientA.id] },
    ]);
    userIds.push(owner, adminA, adminB, employeeA, clientUserA);

    // Webhook token access and rotation: only owner/admin may read or rotate,
    // and an agency admin cannot cross the agency boundary.
    assert.equal((await request(null, `/api/clients/${clientA.id}/webhook-token`)).status, 401);
    assert.equal((await request(owner, `/api/clients/${clientA.id}/webhook-token`)).status, 200);
    assert.equal((await request(adminA, `/api/clients/${clientA.id}/webhook-token`)).status, 200);
    assert.equal((await request(employeeA, `/api/clients/${clientA.id}/webhook-token`)).status, 403);
    assert.equal((await request(clientUserA, `/api/clients/${clientA.id}/webhook-token`)).status, 403);
    assert.equal((await request(adminB, `/api/clients/${clientA.id}/webhook-token`)).status, 403);
    const originalToken = (await request(adminA, `/api/clients/${clientA.id}/webhook-token`)).body.webhookToken;
    const rotated = await request(adminA, `/api/clients/${clientA.id}/regenerate-webhook-token`, "POST");
    assert.equal(rotated.status, 200);
    assert.ok(rotated.body.webhookToken);
    assert.notEqual(rotated.body.webhookToken, originalToken);
    assert.equal((await request(employeeA, `/api/clients/${clientA.id}/regenerate-webhook-token`, "POST")).status, 403);
    assert.equal((await request(adminB, `/api/clients/${clientA.id}/regenerate-webhook-token`, "POST")).status, 403);

    const performanceInput = {
      title: `Zero denominator event ${marker}`,
      eventType: "webinar",
      startDate: "2026-01-15T12:00:00.000Z",
      totalRegistrants: 0,
      totalAttendees: 0,
      adSpend: 0,
      salesData: [],
      upsellData: [],
    };
    assert.equal((await request(employeeA, `/api/clients/${clientA.id}/event-performance`, "POST", performanceInput)).status, 403);
    assert.equal((await request(adminB, `/api/clients/${clientA.id}/event-performance`, "POST", performanceInput)).status, 403);
    const created = await request(adminA, `/api/clients/${clientA.id}/event-performance`, "POST", performanceInput);
    assert.equal(created.status, 201);
    eventIds.push(created.body.id);
    assert.equal(created.body.totalRevenue, "0.00");
    assert.equal(created.body.profit, "0.00");
    assert.equal(created.body.roas, "0.00");

    const updated = await request(adminA, `/api/event-performance/${created.body.id}`, "PATCH", {
      totalRegistrants: 10,
      totalAttendees: 5,
      adSpend: 100,
      salesData: [{ name: "Ticket", price: 50, quantity: 2 }],
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.totalRevenue, "100.00");
    assert.equal(updated.body.profit, "0.00");
    assert.equal(updated.body.roas, "1.00");
    assert.equal((await request(adminA, `/api/event-performance/${created.body.id}`, "PATCH", {
      totalRegistrants: 1,
      totalAttendees: 2,
    })).status, 400);
    assert.equal((await request(adminA, `/api/clients/${clientA.id}/event-performance`, "POST", {
      ...performanceInput,
      title: "",
    })).status, 400);
    assert.equal((await request(adminA, `/api/clients/${clientA.id}/event-performance`, "POST", {
      ...performanceInput,
      adSpend: -1,
    })).status, 400);
    assert.equal((await request(adminB, `/api/event-performance/${created.body.id}`, "PATCH", {
      title: "Cross tenant edit",
    })).status, 403);

    // Former employees are disabled; admins can edit profile fields.
    assert.equal((await request(employeeA, `/api/clients/${clientA.id}`, "PATCH", {
      businessName: "Updated by employee",
    })).status, 403);
    assert.equal((await request(adminA, `/api/clients/${clientA.id}`, "PATCH", {
      phone: "555-0100",
    })).status, 200);
    assert.equal((await request(employeeA, `/api/clients/${clientA.id}`, "PATCH", {
      name: "Not allowed",
    })).status, 403);
    assert.equal((await request(adminB, `/api/clients/${clientA.id}`, "PATCH", {
      businessName: "Cross tenant edit",
    })).status, 403);
    assert.equal((await request(clientUserA, `/api/clients/${clientB.id}`, "PATCH", {
      phone: "cross-tenant",
    })).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (eventIds.length) await db.delete(eventPerformance).where(inArray(eventPerformance.id, eventIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (clientIds.length) await db.delete(clients).where(inArray(clients.id, clientIds));
    if (agencyIds.length) await db.delete(agencies).where(inArray(agencies.id, agencyIds));
  }
});