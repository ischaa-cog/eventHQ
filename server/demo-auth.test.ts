import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { agencies, clients, users } from "@shared/schema";
import { db } from "./storage";
import { enforceDemoReadOnly, isAuthenticated } from "./replitAuth";

function checkAccess(demoLogin: boolean, method: string, path: string) {
  let status: number | undefined;
  let nextCalled = false;
  const req = { user: { demoLogin }, method, path };
  const res = {
    status(code: number) { status = code; return this; },
    json(_body: unknown) { return this; },
  };
  enforceDemoReadOnly(req as any, res as any, () => { nextCalled = true; });
  return { status, nextCalled };
}

test("demo sessions can read their workspace, but cannot change data or start authorization", () => {
  assert.deepEqual(checkAccess(true, "GET", "/clients/73"), { status: undefined, nextCalled: true });
  assert.deepEqual(checkAccess(true, "POST", "/clients/73/events"), { status: 403, nextCalled: false });
  assert.deepEqual(checkAccess(true, "GET", "/clients/73/google-drive/authorize"), { status: 403, nextCalled: false });
  assert.deepEqual(checkAccess(true, "GET", "/clients/73/webhook-token"), { status: 403, nextCalled: false });
  assert.deepEqual(checkAccess(false, "POST", "/clients/73/events"), { status: undefined, nextCalled: true });
});

test("demo sessions are rejected if another client enters their sample agency", async () => {
  const id = `demo-client:test-${randomUUID()}`;
  const [agency] = await db.insert(agencies).values({ name: `demo-test-${id}` }).returning();
  let sampleId: number | undefined;
  let otherId: number | undefined;
  try {
    const [sample] = await db.insert(clients).values({ agencyId: agency.id, name: "Sample" }).returning();
    sampleId = sample.id;
    await db.insert(users).values({ id, role: "agency_admin", agencyId: agency.id, clientAccess: [sample.id] });
    const check = async () => {
      let code: number | undefined;
      let nextCalled = false;
      const req = { user: { claims: { sub: id }, expires_at: Math.floor(Date.now() / 1000) + 60, demoLogin: true }, isAuthenticated: () => true };
      const res = { status(status: number) { code = status; return this; }, json() { return this; } };
      await isAuthenticated(req as any, res as any, () => { nextCalled = true; });
      return { code, nextCalled };
    };
    assert.deepEqual(await check(), { code: undefined, nextCalled: true });
    const [other] = await db.insert(clients).values({ agencyId: agency.id, name: "Non-sample" }).returning();
    otherId = other.id;
    assert.deepEqual(await check(), { code: 403, nextCalled: false });
  } finally {
    await db.delete(users).where(eq(users.id, id));
    if (otherId) await db.delete(clients).where(eq(clients.id, otherId));
    if (sampleId) await db.delete(clients).where(eq(clients.id, sampleId));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});