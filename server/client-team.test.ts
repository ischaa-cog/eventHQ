import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { eq, inArray, like } from "drizzle-orm";
import { agencies, clients, invites, loginAttempts, passwordResetTokens, users } from "@shared/schema";
import { db, storage } from "./storage";
import { createApp } from "./app";

process.env.SESSION_SECRET ||= "test-session-secret";
const PASSWORD = "correct-horse-battery";

// A real app (sessions, login, every route) on a random port, with a tiny cookie jar per "browser".
async function startApp() {
  const { app } = await createApp();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { base: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}

function browser(base: string, ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) {
  let cookie = "";
  return {
    ip,
    async call(path: string, method = "GET", body?: unknown, baseOverride?: string) {
      const res = await fetch(`${baseOverride ?? base}${path}`, {
        method,
        headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json };
    },
    login(email: string, password = PASSWORD, portal = "client") {
      return this.call("/api/login", "POST", { email, password, portal });
    },
  };
}

async function fixture() {
  const marker = randomUUID().slice(0, 8);
  const [agency] = await db.insert(agencies).values({ name: `team-${marker}` }).returning();
  const [a] = await db.insert(clients).values({ name: `Team A ${marker}`, agencyId: agency.id, isActive: true }).returning();
  const [b] = await db.insert(clients).values({ name: `Team B ${marker}`, agencyId: agency.id, isActive: true }).returning();
  // A login made before roles existed: no clientRole, so it counts as the owner.
  const ownerA = await storage.createUserWithPassword({ email: `owner-a-${marker}@example.com`, role: "agency_client", agencyId: agency.id, clientAccess: [a.id] }, PASSWORD);
  const ownerB = await storage.createUserWithPassword({ email: `owner-b-${marker}@example.com`, role: "agency_client", agencyId: agency.id, clientAccess: [b.id], clientRole: "owner" }, PASSWORD);
  const cleanup = async () => {
    const teamUsers = await db.select({ id: users.id }).from(users).where(like(users.email, `%${marker}%`));
    for (const u of teamUsers) await storage.deleteUser(u.id);
    await db.delete(invites).where(eq(invites.agencyId, agency.id));
    await db.delete(clients).where(inArray(clients.id, [a.id, b.id]));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  };
  return { marker, agency, a, b, ownerA, ownerB, cleanup };
}

test("owners manage their team, members only look, and other workspaces are off limits", async () => {
  const app = await startApp();
  const f = await fixture();
  try {
    const owner = browser(app.base);
    assert.equal((await owner.login(f.ownerA.email!)).status, 200);

    const invite = await owner.call(`/api/clients/${f.a.id}/team`, "POST", { email: `member-${f.marker}@example.com`, clientRole: "member" });
    assert.equal(invite.status, 201);
    assert.match(invite.body.link, /\/accept-invite\/[A-Za-z0-9_-]{40,}$/);
    assert.equal(invite.body.emailed, false, "email is not configured in tests");
    const token = invite.body.link.split("/").pop();

    const listed = await owner.call(`/api/clients/${f.a.id}/team`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.canManage, true);
    assert.equal(listed.body.members[0].clientRole, "owner");
    assert.equal(listed.body.invites.length, 1);

    // Someone else's workspace.
    assert.equal((await owner.call(`/api/clients/${f.b.id}/team`)).status, 403);
    assert.equal((await owner.call(`/api/clients/${f.b.id}/team`, "POST", { email: `x-${f.marker}@example.com` })).status, 403);

    // The invited person opens the link and signs up.
    const guest = browser(app.base);
    const preview = await guest.call(`/api/invites/${token}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.status, "valid");
    assert.equal(preview.body.workspaceName, f.a.name);
    const accepted = await guest.call(`/api/invites/${token}/accept`, "POST", { firstName: "Mia", lastName: "Member", password: PASSWORD });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.redirect, `/client/${f.a.id}/dashboard`);
    // Signed in straight away, as a member.
    const mine = await guest.call(`/api/clients/${f.a.id}/team`);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.canManage, false);
    assert.deepEqual(mine.body.invites, [], "members don't see invite links");
    assert.equal((await guest.call(`/api/clients/${f.a.id}/money-summary?from=2026-11-01&to=2026-11-03`)).status, 200);
    const memberId = mine.body.members.find((m: any) => m.clientRole === "member").id;

    // Members cannot change the team.
    assert.equal((await guest.call(`/api/clients/${f.a.id}/team`, "POST", { email: `y-${f.marker}@example.com` })).status, 403);
    assert.equal((await guest.call(`/api/clients/${f.a.id}/team/${f.ownerA.id}`, "PATCH", { clientRole: "member" })).status, 403);
    assert.equal((await guest.call(`/api/clients/${f.a.id}/team/${f.ownerA.id}`, "DELETE")).status, 403);

    // The link works once.
    const again = await browser(app.base).call(`/api/invites/${token}/accept`, "POST", { firstName: "Again", password: PASSWORD });
    assert.equal(again.status, 410);

    // The last owner can't be demoted or removed.
    assert.equal((await owner.call(`/api/clients/${f.a.id}/team/${f.ownerA.id}`, "PATCH", { clientRole: "member" })).status, 400);
    assert.equal((await owner.call(`/api/clients/${f.a.id}/team/${f.ownerA.id}`, "DELETE")).status, 400);
    // Promote, then demote back.
    assert.equal((await owner.call(`/api/clients/${f.a.id}/team/${memberId}`, "PATCH", { clientRole: "owner" })).status, 200);
    assert.equal((await owner.call(`/api/clients/${f.a.id}/team/${memberId}`, "PATCH", { clientRole: "member" })).status, 200);

    // Removing a member ends their session.
    assert.equal((await owner.call(`/api/clients/${f.a.id}/team/${memberId}`, "DELETE")).status, 200);
    assert.equal((await guest.call(`/api/clients/${f.a.id}/team`)).status, 401);
    assert.equal(await storage.getUser(memberId), undefined);

    // Revoking a pending invite.
    const second = await owner.call(`/api/clients/${f.a.id}/team`, "POST", { email: `later-${f.marker}@example.com` });
    assert.equal((await owner.call(`/api/clients/${f.a.id}/team/invites/${second.body.invite.id}`, "DELETE")).status, 200);
    assert.equal((await browser(app.base).call(`/api/invites/${second.body.link.split("/").pop()}`)).status, 404);

    // An expired invite is refused.
    const third = await owner.call(`/api/clients/${f.a.id}/team`, "POST", { email: `expired-${f.marker}@example.com` });
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invites.id, third.body.invite.id));
    const expiredToken = third.body.link.split("/").pop();
    assert.equal((await browser(app.base).call(`/api/invites/${expiredToken}`)).body.status, "expired");
    assert.equal((await browser(app.base).call(`/api/invites/${expiredToken}/accept`, "POST", { firstName: "Late", password: PASSWORD })).status, 410);

    // An email that already has a login can't be invited again.
    assert.equal((await owner.call(`/api/clients/${f.a.id}/team`, "POST", { email: f.ownerB.email })).status, 409);
  } finally {
    app.close();
    await f.cleanup();
  }
});

test("password reset links work once, expire, and sign the account out everywhere", async () => {
  const app = await startApp();
  const f = await fixture();
  try {
    const unknown = await browser(app.base).call("/api/password/forgot", "POST", { email: `nobody-${f.marker}@example.com` });
    const known = await browser(app.base).call("/api/password/forgot", "POST", { email: f.ownerA.email });
    assert.equal(unknown.status, 200);
    assert.equal(known.status, 200);
    assert.deepEqual(unknown.body, known.body, "same answer whether or not the account exists");

    const signedIn = browser(app.base);
    assert.equal((await signedIn.login(f.ownerA.email!)).status, 200);

    // Email is off in tests, so plant a token the way the forgot route stores it (hash only).
    const token = `reset-${randomUUID()}`;
    const hash = createHash("sha256").update(token).digest("hex");
    await db.insert(passwordResetTokens).values({ userId: f.ownerA.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3600_000) });
    const resetter = browser(app.base);
    assert.equal((await resetter.call(`/api/password/reset/${token}`)).body.valid, true);
    assert.equal((await resetter.call("/api/password/reset", "POST", { token, password: "short" })).status, 400);
    assert.equal((await resetter.call("/api/password/reset", "POST", { token, password: "brand-new-password-1" })).status, 200);
    assert.equal((await resetter.call("/api/password/reset", "POST", { token, password: "brand-new-password-2" })).status, 400, "used once only");

    // The old session is gone, the old password fails, the new one works.
    assert.equal((await signedIn.call(`/api/clients/${f.a.id}/team`)).status, 401);
    assert.equal((await browser(app.base).login(f.ownerA.email!)).status, 401);
    assert.equal((await browser(app.base).login(f.ownerA.email!, "brand-new-password-1")).status, 200);

    // An expired link is refused.
    const old = `reset-${randomUUID()}`;
    await db.insert(passwordResetTokens).values({
      userId: f.ownerA.id, tokenHash: createHash("sha256").update(old).digest("hex"), expiresAt: new Date(Date.now() - 1000),
    });
    assert.equal((await browser(app.base).call("/api/password/reset", "POST", { token: old, password: "another-password-3" })).status, 400);
  } finally {
    app.close();
    await f.cleanup();
  }
});

test("login attempts are limited per IP across every server instance", async () => {
  const one = await startApp();
  const two = await startApp();
  const f = await fixture();
  const ip = `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  try {
    const guesser = browser(one.base, ip);
    // Five wrong guesses split between two instances...
    for (const base of [one.base, two.base, one.base, two.base, one.base]) {
      assert.equal((await guesser.call("/api/login", "POST", { email: f.ownerA.email, password: "wrong-password!", portal: "client" }, base)).status, 401);
    }
    // ...and the sixth is refused on either one, even with the right password.
    assert.equal((await guesser.call("/api/login", "POST", { email: f.ownerA.email, password: PASSWORD, portal: "client" }, two.base)).status, 429);
    // Another IP is unaffected.
    assert.equal((await browser(one.base).login(f.ownerA.email!)).status, 200);
  } finally {
    one.close();
    two.close();
    await db.delete(loginAttempts).where(eq(loginAttempts.key, `ip:${ip}`));
    await f.cleanup();
  }
});
