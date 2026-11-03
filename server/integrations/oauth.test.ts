import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { agencies, clients, integrationConnections, oauthGrants, users } from "@shared/schema";
import { db } from "../storage";
import { encryptJson } from "../credentials";
import {
  composioFetch, connectionAuth, grantAccounts, highlevelGrantFromCode, metaGrantFromToken, readConnectLink,
  readToken, signToken, connectLinkToken, readComposioState,
} from "./oauth";
import { saveConnection } from "./connections";

process.env.SESSION_SECRET ||= "test-session-secret";

type Call = { url: string; init?: RequestInit };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function fakeFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    return handler(new URL(url), init);
  }) as typeof fetch;
  return { f, calls };
}

test("signed tokens reject tampering, the wrong kind, and expiry", () => {
  const token = signToken({ k: "connect", c: 7 }, 60_000);
  assert.equal(readToken(token, "connect")?.c, 7);
  assert.equal(readToken(token, "composio"), null, "kind is checked");
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "connect", c: 8, exp: Date.now() + 60_000 })).toString("base64url");
  assert.equal(readToken(`${forged}.${sig}`, "connect"), null, "payload is signed");
  assert.equal(readToken(`${body}.x${sig.slice(1)}`, "connect"), null);
  assert.equal(readToken(signToken({ k: "connect", c: 7 }, -1), "connect"), null, "expired");
  assert.equal(readConnectLink(connectLinkToken(42))?.clientId, 42);
  assert.equal(readConnectLink("garbage"), null);
  assert.equal(readComposioState(signToken({ k: "composio", c: 3, r: "/connect/abc" }, 60_000))?.returnTo, "/connect/abc");
});

test("Stripe requests through Composio keep their query and return Stripe's body and status", async () => {
  process.env.COMPOSIO_API_KEY = "test-composio-key";
  const { f, calls } = fakeFetch(() => json({ status: 200, data: { data: [{ id: "ch_1" }], has_more: false }, headers: {} }));
  const res = await composioFetch("ca_123", f)("https://api.stripe.com/v1/charges?limit=100&expand%5B%5D=data.invoice&created%5Bgte%5D=1");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { data: [{ id: "ch_1" }], has_more: false });
  const sent = JSON.parse(String(calls[0].init?.body));
  assert.equal(calls[0].url, "https://backend.composio.dev/api/v3.1/tools/execute/proxy");
  assert.equal((calls[0].init?.headers as any)["x-api-key"], "test-composio-key");
  assert.equal(sent.connected_account_id, "ca_123");
  assert.equal(sent.endpoint, "https://api.stripe.com/v1/charges");
  assert.deepEqual(sent.parameters, [
    { name: "limit", value: "100", type: "query" },
    { name: "expand[]", value: "data.invoice", type: "query" },
    { name: "created[gte]", value: "1", type: "query" },
  ]);
  const denied = await composioFetch("ca_123", fakeFetch(() => json({ status: 403, data: { error: { message: "no" } } })).f)("https://api.stripe.com/v1/charges");
  assert.equal(denied.status, 403, "Stripe's own status comes through");
});

test("agency logins: Meta token lists ad accounts, HighLevel refreshes once and hands out sub-account tokens", async () => {
  const marker = randomUUID();
  const [agency] = await db.insert(agencies).values({ name: `oauth-${marker}` }).returning();
  const [client] = await db.insert(clients).values({ name: `oauth-client-${marker}`, agencyId: agency.id }).returning();
  const grantIds: number[] = [];
  try {
    // Meta: a pasted system user token, two pages of ad accounts.
    const meta = fakeFetch((url) => {
      if (url.pathname.endsWith("/me")) return json({ id: `meta-${marker}`, name: "Agency System User" });
      if (url.searchParams.get("after") === "p2") return json({ data: [{ account_id: "222", name: "Bravo Ads", account_status: 2 }] });
      return json({ data: [{ account_id: "111", name: "Alpha Ads", account_status: 1, business_name: "Alpha LLC" }], paging: { next: "https://graph.facebook.com/v21.0/me/adaccounts?after=p2" } });
    });
    const metaGrant = await metaGrantFromToken("EAAB-system-user-token-0123456789", "pasted-secret", undefined, meta.f);
    grantIds.push(metaGrant.id);
    assert.equal(metaGrant.source, "token");
    assert.equal(metaGrant.expiresAt, null);
    const accounts = await grantAccounts(metaGrant, meta.f);
    assert.deepEqual(accounts.map((a) => [a.id, a.name, a.detail]), [["111", "Alpha Ads", "Alpha LLC · act_111"], ["222", "Bravo Ads", "act_222 · inactive"]]);
    assert.ok(meta.calls.every((c) => new URL(c.url).searchParams.get("appsecret_proof")), "pasted secret signs every call");
    const metaConn = await saveConnection({ clientId: client.id, provider: "meta", externalAccountId: "111", credentials: {}, grantId: metaGrant.id });
    const metaAuth = await connectionAuth(metaConn);
    assert.equal(metaAuth.creds.accessToken, "EAAB-system-user-token-0123456789");
    assert.equal(metaAuth.creds.appSecret, "pasted-secret");

    // HighLevel: agency install whose token is already due for refresh.
    process.env.HIGHLEVEL_CLIENT_ID = "app123-abc";
    process.env.HIGHLEVEL_CLIENT_SECRET = "hl-secret";
    let refreshes = 0;
    let locationTokens = 0;
    const hl = fakeFetch(async (url, init) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      if (url.pathname === "/oauth/token" && body.get("grant_type") === "authorization_code") {
        return json({ access_token: "agency-1", refresh_token: "refresh-1", expires_in: 1, userType: "Company", companyId: `co-${marker}` });
      }
      if (url.pathname === "/oauth/token" && body.get("grant_type") === "refresh_token") {
        refreshes++;
        assert.equal(body.get("refresh_token"), "refresh-1", "the stored refresh token is used once");
        await new Promise((r) => setTimeout(r, 50));
        return json({ access_token: "agency-2", refresh_token: "refresh-2", expires_in: 86399 });
      }
      if (url.pathname === "/oauth/locationToken") {
        locationTokens++;
        assert.equal((init?.headers as any).Authorization, "Bearer agency-2");
        assert.equal(body.get("locationId"), "loc-1");
        return json({ access_token: "location-token-1", expires_in: 86399 });
      }
      if (url.pathname === "/oauth/installedLocations") {
        assert.equal(url.searchParams.get("appId"), "app123");
        return json({ locations: [{ _id: "loc-1", name: "Zed Coaching" }, { _id: "loc-2", name: "Ace Events", address: "Miami" }] });
      }
      return json({ message: "unexpected" }, 500);
    });
    const hlGrant = await highlevelGrantFromCode("code-1", undefined, hl.f);
    grantIds.push(hlGrant.id);
    const hlConn = await saveConnection({ clientId: client.id, provider: "highlevel", externalAccountId: "loc-1", credentials: {}, grantId: hlGrant.id });
    const [one, two] = await Promise.all([connectionAuth(hlConn, hl.f), connectionAuth(hlConn, hl.f)]);
    assert.equal(refreshes, 1, "two syncs at once refresh only once");
    assert.equal(one.creds.apiKey, "location-token-1");
    assert.equal(two.creds.apiKey, "location-token-1");
    assert.ok(locationTokens <= 2);
    assert.deepEqual((await grantAccounts(hlGrant, hl.f)).map((a) => a.name), ["Ace Events", "Zed Coaching"]);

    // A removed login stops the connection with a clear message.
    await db.delete(oauthGrants).where(eq(oauthGrants.id, metaGrant.id));
    const [orphan] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, metaConn.id));
    assert.equal(orphan.grantId, null);
    const keyless = await connectionAuth(orphan);
    assert.equal(keyless.creds.accessToken, undefined, "no token once the login is gone");
  } finally {
    await db.delete(clients).where(eq(clients.id, client.id));
    if (grantIds.length) await db.delete(oauthGrants).where(inArray(oauthGrants.id, grantIds));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});

test("connect links: public page shows the workspace, bad links fail, admins only mint links", async () => {
  const { registerApiRoutes } = await import("../routes");
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
      method, redirect: "manual", headers: { ...(user ? { "x-test-user": user } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, location: res.headers.get("location"), body: await res.json().catch(() => null) };
  };
  const [agency] = await db.insert(agencies).values({ name: `link-${marker}` }).returning();
  const [client] = await db.insert(clients).values({ name: `Link Client ${marker}`, agencyId: agency.id }).returning();
  const owner = `link-owner-${marker}`;
  const clientUser = `link-client-${marker}`;
  await db.insert(users).values([
    { id: owner, role: "owner" },
    { id: clientUser, role: "agency_client", agencyId: agency.id, clientAccess: [client.id] },
  ]);
  try {
    assert.equal((await call(clientUser, `/api/clients/${client.id}/connect-link`)).status, 403, "clients cannot mint links");
    assert.equal((await call(clientUser, "/api/oauth/status")).status, 403);
    const minted = await call(owner, `/api/clients/${client.id}/connect-link`);
    assert.equal(minted.status, 200);
    const token = String(minted.body.url).split("/connect/")[1];
    await db.insert(integrationConnections).values({
      clientId: client.id, provider: "whop", externalAccountId: "biz_1", displayName: "Link Co", credentialsCiphertext: encryptJson({ apiKey: "apik_secret_value" }),
    });
    const page = await call(null, `/api/connect/${token}`);
    assert.equal(page.status, 200);
    assert.equal(page.body.clientName, client.name);
    assert.deepEqual(page.body.connections.map((c: any) => [c.provider, c.displayName]), [["whop", "Link Co"]]);
    assert.ok(!JSON.stringify(page.body).includes("apik_secret"), "no secrets on the public page");
    assert.equal((await call(null, `/api/connect/${token}x`)).status, 404);
    assert.equal((await call(null, `/api/connect/${token}/key`, "POST", { provider: "meta", apiKey: "12345678" })).status, 400, "only Whop, Fanbasis and Stripe keys");
    // Stripe sign-in callbacks need a valid signed state.
    const bad = await call(null, "/api/oauth/composio/callback?state=nope&connected_account_id=ca_1");
    assert.equal(bad.status, 302);
    assert.match(String(bad.location), /oauth_error=/);
    // Agency login start keeps returnTo on this site.
    const start = await call(owner, "/api/oauth/meta/start?returnTo=https://evil.example");
    assert.equal(start.status, 302);
    assert.ok(String(start.location).startsWith("/?") || String(start.location).startsWith("https://www.facebook.com/"), String(start.location));
  } finally {
    server.close();
    await db.delete(users).where(inArray(users.id, [owner, clientUser]));
    await db.delete(clients).where(eq(clients.id, client.id));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
