import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { agencies, assets, clients, events, invites, notificationRecipients, notifications, tuckChats, tuckMessages, users, webinarGoals, webinars } from "@shared/schema";
import { db } from "./storage";
import { registerApiRoutes } from "./routes";

test("API keeps invites and events inside the user's tenant and rejects invalid writes", async () => {
  const marker = randomUUID();
  const agencyIds: number[] = [];
  const clientIds: number[] = [];
  const userIds: string[] = [];
  const inviteIds: number[] = [];
  const eventIds: number[] = [];
  const assetIds: number[] = [];
  const webinarIds: number[] = [];
  const goalIds: number[] = [];
  const notificationIds: number[] = [];
  const recipientIds: number[] = [];
  const chatIds: number[] = [];
  const messageIds: number[] = [];

  const app = express();
  app.use(express.json({ limit: "10mb" }));
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
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };

  try {
    const [agencyA] = await db.insert(agencies).values({ name: `boundary-a-${marker}` }).returning();
    const [agencyB] = await db.insert(agencies).values({ name: `boundary-b-${marker}` }).returning();
    agencyIds.push(agencyA.id, agencyB.id);
    const [clientA] = await db.insert(clients).values({ name: `boundary-a-${marker}`, agencyId: agencyA.id }).returning();
    const [clientB] = await db.insert(clients).values({ name: `boundary-b-${marker}`, agencyId: agencyB.id }).returning();
    clientIds.push(clientA.id, clientB.id);
    const owner = `boundary-owner-${marker}`;
    const adminA = `boundary-admin-a-${marker}`;
    const adminB = `boundary-admin-b-${marker}`;
    const employeeA = `boundary-employee-a-${marker}`;
    const customerA = `boundary-customer-a-${marker}`;
    await db.insert(users).values([
      { id: owner, role: "owner" },
      { id: adminA, role: "agency_admin", agencyId: agencyA.id },
      { id: adminB, role: "agency_admin", agencyId: agencyB.id },
      { id: employeeA, role: "agency_employee", agencyId: agencyA.id, clientAccess: [clientA.id] },
      { id: customerA, role: "agency_client", agencyId: agencyA.id, clientAccess: [clientA.id] },
    ]);
    userIds.push(owner, adminA, adminB, employeeA, customerA);

    assert.equal((await request(null, "/api/convert-image", "POST", {
      imageData: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    })).status, 401);
    assert.equal((await request(`unknown-user-${marker}`, "/api/convert-image", "POST", {
      imageData: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    })).status, 403);
    assert.equal((await request(owner, "/api/convert-image", "POST", {
      imageData: "data:image/svg+xml;base64,PHN2Zy8+",
    })).status, 400);
    assert.equal((await request(owner, "/api/convert-image", "POST", {
      imageData: `data:image/gif;base64,${Buffer.alloc(6 * 1024 * 1024 + 1).toString("base64")}`,
    })).status, 413);
    const convertedImage = await request(owner, "/api/convert-image", "POST", {
      imageData: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    });
    assert.equal(convertedImage.status, 200);
    assert.match(convertedImage.body.imageData, /^data:image\/jpeg;base64,/);

    const [inviteA] = await db.insert(invites).values({
      token: randomUUID(), role: "agency_client", agencyId: agencyA.id, createdById: adminA,
    }).returning();
    const [inviteB] = await db.insert(invites).values({
      token: randomUUID(), role: "agency_client", agencyId: agencyB.id, createdById: adminB,
    }).returning();
    inviteIds.push(inviteA.id, inviteB.id);

    assert.equal((await request(null, "/api/invites")).status, 401);
    assert.equal((await request(adminA, "/api/invites", "POST", {
      role: "agency_employee", clientAccess: [clientB.id],
    })).status, 400);
    assert.equal((await request(adminA, "/api/invites", "POST", {
      role: "owner",
    })).status, 403);
    assert.equal((await request(customerA, "/api/invites")).status, 403);
    assert.equal((await request(employeeA, `/api/invites/${inviteA.id}`, "DELETE")).status, 403);
    assert.equal((await request(adminA, `/api/invites/${inviteB.id}`, "DELETE")).status, 403);
    assert.equal((await request(adminA, `/api/invites/not-an-id`, "DELETE")).status, 400);
    assert.equal((await request(adminA, "/api/invites")).body.length, 1);
    assert.equal((await request(adminA, `/api/invites/${inviteA.id}`, "DELETE")).status, 204);
    inviteIds.splice(inviteIds.indexOf(inviteA.id), 1);
    assert.equal((await request(owner, `/api/invites/${inviteB.id}`, "DELETE")).status, 204);
    inviteIds.splice(inviteIds.indexOf(inviteB.id), 1);

    assert.equal((await request(customerA, `/api/clients/${clientB.id}/events`)).status, 403);
    assert.equal((await request(null, `/api/clients/${clientA.id}/events`)).status, 401);
    const assignedClients = await request(customerA, "/api/clients");
    assert.equal(assignedClients.status, 200);
    assert.deepEqual(assignedClients.body.map((client: any) => client.id), [clientA.id]);
    assert.equal((await request(customerA, `/api/clients/${clientB.id}`)).status, 403);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/events`)).status, 200);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/event-performance`)).status, 200);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/projections`)).status, 200);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}`, "PATCH", {
      businessName: "Unauthorized profile change",
    })).status, 403);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/onboarding`, "POST", {})).status, 403);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/calendar`, "POST", {
      title: "Client calendar write",
      eventDate: "2026-09-24T12:00:00.000Z",
    })).status, 403);
    assert.equal((await request(customerA, "/api/calendar/1", "PATCH", { title: "Client calendar edit" })).status, 403);
    assert.equal((await request(customerA, "/api/calendar/1", "DELETE")).status, 403);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/calendar/connection`, "PATCH", {
      calendarId: "client-controlled-calendar",
    })).status, 403);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/calendar/sync`, "POST")).status, 403);
    const created = await request(employeeA, `/api/clients/${clientA.id}/events`, "POST", {
      name: `Boundary event ${marker}`, type: "webinar",
    });
    assert.equal(created.status, 201);
    eventIds.push(created.body.id);
    const eventPath = `/api/events/${created.body.id}`;
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/events`, "POST", {
      name: "Client Event Builder write", type: "webinar",
    })).status, 403);
    assert.equal((await request(customerA, `/api/events/${created.body.id}/generate`, "POST", {
      selectedAssetTypes: ["email_sequence"],
    })).status, 403);
    assert.equal((await request(customerA, `/api/events/${created.body.id}/available-templates`)).status, 403);
    assert.equal((await request(adminB, eventPath, "PATCH", { name: "Cross-tenant edit" })).status, 403);
    assert.equal((await request(employeeA, eventPath, "PATCH", { clientId: clientB.id })).status, 400);
    assert.equal((await request(owner, eventPath, "PATCH", { clientId: clientB.id })).status, 400);
    assert.equal((await request(customerA, eventPath, "PATCH", { id: created.body.id + 1 })).status, 403);
    assert.equal((await request(employeeA, eventPath, "PATCH", { name: "Renamed safely" })).status, 200);
    const [persisted] = await db.select().from(events).where(eq(events.id, created.body.id));
    assert.equal(persisted.clientId, clientA.id);
    assert.equal(persisted.name, "Renamed safely");

    const otherEvent = await request(adminB, `/api/clients/${clientB.id}/events`, "POST", {
      name: "Other tenant event", type: "webinar",
    });
    assert.equal(otherEvent.status, 201);
    eventIds.push(otherEvent.body.id);
    const createdAsset = await request(employeeA, `/api/events/${created.body.id}/assets`, "POST", {
      title: "Boundary asset", assetType: "email_sequence", content: "test",
    });
    assert.equal(createdAsset.status, 201);
    assetIds.push(createdAsset.body.id);
    assert.equal((await request(customerA, `/api/events/${created.body.id}/assets`, "POST", {
      title: "Client asset write", assetType: "email_sequence", content: "not allowed",
    })).status, 403);
    assert.equal((await request(customerA, "/api/asset-templates", "POST", {})).status, 403);
    assert.equal((await request(employeeA, `/api/assets/${createdAsset.body.id}`, "PATCH", {
      eventId: otherEvent.body.id, content: "injected",
    })).status, 400);
    assert.equal((await request(adminB, `/api/assets/${createdAsset.body.id}`, "PATCH", {
      content: "injected",
    })).status, 403);
    const [storedAsset] = await db.select().from(assets).where(eq(assets.id, createdAsset.body.id));
    assert.equal(storedAsset.eventId, created.body.id);
    assert.equal(storedAsset.content, "test");

    const createdWebinar = await request(employeeA, `/api/clients/${clientA.id}/webinars`, "POST", {
      title: "Boundary webinar", date: "2026-09-24T12:00:00.000Z",
    });
    assert.equal(createdWebinar.status, 201);
    webinarIds.push(createdWebinar.body.id);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/webinars`, "POST", {
      title: "Client webinar write", date: "2026-09-24T12:00:00.000Z",
    })).status, 403);
    assert.equal((await request(customerA, `/api/webinars/${createdWebinar.body.id}`, "PATCH", {
      title: "Client webinar edit",
    })).status, 403);
    assert.equal((await request(customerA, `/api/webinars/${createdWebinar.body.id}`, "DELETE")).status, 403);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/webinar-goals`, "POST", {
      targetRevenue: "100",
    })).status, 403);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/webinar-goals`, "PATCH", {
      targetRevenue: "100",
    })).status, 403);
    assert.equal((await request(employeeA, `/api/webinars/${createdWebinar.body.id}`, "PATCH", {
      clientId: clientB.id, title: "Moved",
    })).status, 400);
    assert.equal((await request(adminB, `/api/webinars/${createdWebinar.body.id}`, "PATCH", {
      title: "Moved",
    })).status, 403);
    const [storedWebinar] = await db.select().from(webinars).where(eq(webinars.id, createdWebinar.body.id));
    assert.equal(storedWebinar.clientId, clientA.id);

    const createdGoals = await request(employeeA, `/api/clients/${clientA.id}/webinar-goals`, "POST", {
      clientId: clientB.id, targetRevenue: "100",
    });
    assert.equal(createdGoals.status, 201);
    goalIds.push(createdGoals.body.id);
    assert.equal(createdGoals.body.clientId, clientA.id);
    assert.equal((await request(employeeA, `/api/clients/${clientB.id}/webinar-goals`)).status, 403);

    const [notification] = await db.insert(notifications).values({
      agencyId: agencyB.id, subject: "Private notice", body: "Another tenant",
    }).returning();
    notificationIds.push(notification.id);
    const [recipient] = await db.insert(notificationRecipients).values({
      notificationId: notification.id, clientId: clientB.id, recipientUserId: adminB,
    }).returning();
    recipientIds.push(recipient.id);
    assert.equal((await request(employeeA, `/api/notifications/${recipient.id}/read`, "POST")).status, 403);
    assert.equal((await request(owner, `/api/notifications/${recipient.id}/read`, "POST")).status, 403);
    assert.equal((await request(adminB, `/api/notifications/${recipient.id}/read`, "POST")).status, 200);
    assert.equal((await request(adminB, `/api/clients/${clientA.id}/sales/stats`)).status, 403);
    assert.equal((await request(customerA, `/api/clients/${clientA.id}/sales/stats`)).status, 200);

    const [chatB] = await db.insert(tuckChats).values({ clientId: clientB.id, title: "Private chat" }).returning();
    chatIds.push(chatB.id);
    const [messageB] = await db.insert(tuckMessages).values({ chatId: chatB.id, role: "user", content: "Private message" }).returning();
    messageIds.push(messageB.id);
    const disguisedPath = `/api/clients/${clientA.id}/tuck/chats/${chatB.id}`;
    assert.equal((await request(adminA, `${disguisedPath}/messages`)).status, 404);
    assert.equal((await request(customerA, `${disguisedPath}/messages`)).status, 404);
    assert.equal((await request(adminA, disguisedPath, "DELETE")).status, 404);
    assert.equal((await request(adminA, `${disguisedPath}/messages`, "POST", { content: "Hello" })).status, 404);
    const actualMessages = await request(adminB, `/api/clients/${clientB.id}/tuck/chats/${chatB.id}/messages`);
    assert.equal(actualMessages.status, 200);
    assert.equal(actualMessages.body[0].content, "Private message");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (recipientIds.length) await db.delete(notificationRecipients).where(inArray(notificationRecipients.id, recipientIds));
    if (messageIds.length) await db.delete(tuckMessages).where(inArray(tuckMessages.id, messageIds));
    if (chatIds.length) await db.delete(tuckChats).where(inArray(tuckChats.id, chatIds));
    if (notificationIds.length) await db.delete(notifications).where(inArray(notifications.id, notificationIds));
    if (goalIds.length) await db.delete(webinarGoals).where(inArray(webinarGoals.id, goalIds));
    if (webinarIds.length) await db.delete(webinars).where(inArray(webinars.id, webinarIds));
    if (assetIds.length) await db.delete(assets).where(inArray(assets.id, assetIds));
    if (eventIds.length) await db.delete(events).where(inArray(events.id, eventIds));
    if (inviteIds.length) await db.delete(invites).where(inArray(invites.id, inviteIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (clientIds.length) await db.delete(clients).where(inArray(clients.id, clientIds));
    if (agencyIds.length) await db.delete(agencies).where(inArray(agencies.id, agencyIds));
  }
});