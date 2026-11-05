import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { agencies, clients, users } from "@shared/schema";
import { db } from "./storage";
import { registerApiRoutes } from "./routes";

test("the agency team sets a client's assets link and only that client can read it", async () => {
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
  const call = async (user: string, path: string, method = "GET", body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method, headers: { "x-test-user": user, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const [agency] = await db.insert(agencies).values({ name: `assets-${marker}` }).returning();
  const [a] = await db.insert(clients).values({ name: `assets-a-${marker}`, agencyId: agency.id }).returning();
  const [b] = await db.insert(clients).values({ name: `assets-b-${marker}`, agencyId: agency.id }).returning();
  const staffA = `assets-staff-${marker}`, clientA = `assets-client-a-${marker}`, clientB = `assets-client-b-${marker}`;
  await db.insert(users).values([
    { id: staffA, role: "team_member", agencyId: agency.id, clientAccess: [a.id] },
    { id: clientA, role: "agency_client", agencyId: agency.id, clientAccess: [a.id] },
    { id: clientB, role: "agency_client", agencyId: agency.id, clientAccess: [b.id] },
  ]);
  try {
    const link = "https://docs.google.com/document/d/abc123/edit";
    assert.equal((await call(clientA, `/api/clients/${a.id}/assets-url`, "PATCH", { assetsUrl: link })).status, 403, "clients can't change it");
    assert.equal((await call(staffA, `/api/clients/${b.id}/assets-url`, "PATCH", { assetsUrl: link })).status, 403, "staff only for assigned workspaces");
    assert.equal((await call(staffA, `/api/clients/${a.id}/assets-url`, "PATCH", { assetsUrl: "javascript:alert(1)" })).status, 400, "https links only");
    assert.equal((await call(staffA, `/api/clients/${a.id}/assets-url`, "PATCH", { assetsUrl: "http://example.com/x" })).status, 400);
    const saved = await call(staffA, `/api/clients/${a.id}/assets-url`, "PATCH", { assetsUrl: ` ${link} ` });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.assetsUrl, link);

    const own = await call(clientA, `/api/clients/${a.id}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.assetsUrl, link, "the client sees their link");
    assert.equal((await call(clientB, `/api/clients/${a.id}`)).status, 403, "other clients don't");

    assert.equal((await call(staffA, `/api/clients/${a.id}/assets-url`, "PATCH", { assetsUrl: null })).body.assetsUrl, null, "and it can be removed");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.delete(users).where(inArray(users.id, [staffA, clientA, clientB]));
    await db.delete(clients).where(inArray(clients.id, [a.id, b.id]));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
