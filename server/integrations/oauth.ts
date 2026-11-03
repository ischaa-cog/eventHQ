// Sign-in based connections, so nobody has to copy API keys around:
// - Agency logins (oauth_grants): one Meta login or system user token that sees every ad account
//   shared with the agency, and one HighLevel agency install that covers its sub-accounts. Client
//   connections made from a login borrow its token at sync time.
// - Stripe through Composio: Composio runs the Stripe sign-in with its own Stripe app and keeps the
//   token. We never hold it; Stripe requests go through Composio's proxy.
// - Signed state and connect-link tokens, so a client can connect accounts without logging in.
import { createHmac, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
import { oauthGrants, type IntegrationConnection, type OAuthGrant } from "@shared/schema";
import { db } from "../storage";
import { decryptJson, encryptJson } from "../credentials";
import { appUrl } from "../config";
import { credentialsOf, type ConnectionCredentials } from "./connections";

export const META_GRAPH = "https://graph.facebook.com/v21.0";
const HL_API = "https://services.leadconnectorhq.com";
const HL_HEADERS = { Version: "2021-07-28", Accept: "application/json", "User-Agent": "eventhq-sync/1.0" };
const COMPOSIO_API = "https://backend.composio.dev/api/v3.1";
// Forms (opt-ins), the sub-account list, and the agency-to-sub-account token exchange.
const HL_SCOPES = "forms.readonly locations.readonly oauth.readonly oauth.write";

export function oauthConfig() {
  return {
    meta: { configured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET) },
    highlevel: { configured: !!(process.env.HIGHLEVEL_CLIENT_ID && process.env.HIGHLEVEL_CLIENT_SECRET) },
    composio: { configured: !!process.env.COMPOSIO_API_KEY },
  };
}

export const metaRedirectUri = () => `${appUrl()}/api/oauth/meta/callback`;
export const highlevelRedirectUri = () => `${appUrl()}/api/oauth/highlevel/callback`;
export const composioCallbackUri = () => `${appUrl()}/api/oauth/composio/callback`;

// ---------- Signed tokens ----------

function signingKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update("eventhq-signed-token-v1").digest();
}

export function signToken(payload: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readToken<T extends Record<string, unknown>>(token: string, kind: string): (T & { exp: number }) | null {
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", signingKey()).update(body).digest("base64url");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString());
    if (value.k !== kind || typeof value.exp !== "number" || value.exp < Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

export const CONNECT_LINK_TTL = 14 * 24 * 60 * 60 * 1000;
export const connectLinkToken = (clientId: number) => signToken({ k: "connect", c: clientId }, CONNECT_LINK_TTL);
export function readConnectLink(token: string): { clientId: number; expiresAt: Date } | null {
  const value = readToken<{ c: number }>(token, "connect");
  return value && Number.isInteger(value.c) ? { clientId: value.c, expiresAt: new Date(value.exp) } : null;
}

// ---------- HTTP ----------

async function readJson(res: Response, label: string) {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const message = body?.error?.message ?? body?.error_description ?? body?.message ?? (typeof body?.error === "string" ? body.error : null) ?? text.slice(0, 200);
    throw new Error(`${label} ${res.status}: ${message}`);
  }
  return body;
}

const form = (values: Record<string, string>) => new URLSearchParams(values).toString();

// ---------- Agency logins ----------

type MetaGrantCreds = { accessToken: string; appSecret?: string };
type HighLevelGrantCreds = { accessToken: string; refreshToken: string; expiresAt: number; userType: string; companyId: string; locationId?: string };

export type PublicGrant = {
  id: number; provider: string; displayName: string | null; accountRef: string; status: string;
  expiresAt: Date | null; lastError: string | null; createdAt: Date; source: string;
};

export const grantToPublic = (g: OAuthGrant): PublicGrant => ({
  id: g.id, provider: g.provider, displayName: g.displayName, accountRef: g.accountRef, status: g.status,
  expiresAt: g.expiresAt, lastError: g.lastError, createdAt: g.createdAt, source: g.source,
});

export async function listGrants() {
  return db.select().from(oauthGrants).orderBy(oauthGrants.provider, oauthGrants.id);
}

export async function getGrant(id: number) {
  const [row] = await db.select().from(oauthGrants).where(eq(oauthGrants.id, id));
  return row;
}

async function saveGrant(input: {
  provider: "meta" | "highlevel"; accountRef: string; displayName: string | null; source: "oauth" | "token";
  credentials: unknown; expiresAt: Date | null; userId?: string | null;
}) {
  const values = {
    provider: input.provider, accountRef: input.accountRef, displayName: input.displayName, source: input.source,
    credentialsCiphertext: encryptJson(input.credentials), expiresAt: input.expiresAt, status: "active",
    lastError: null, updatedAt: new Date(), ...(input.userId ? { createdByUserId: input.userId } : {}),
  };
  const [row] = await db.insert(oauthGrants).values(values)
    .onConflictDoUpdate({ target: [oauthGrants.provider, oauthGrants.accountRef], set: values })
    .returning();
  return row;
}

async function markGrantFailed(id: number, error: string) {
  await db.update(oauthGrants).set({ status: "error", lastError: error.slice(0, 500), updatedAt: new Date() }).where(eq(oauthGrants.id, id));
}

// --- Meta ---

function metaApp() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID and META_APP_SECRET are not set.");
  return { appId, appSecret };
}

export function metaAuthorizeUrl(state: string) {
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", metaApp().appId);
  url.searchParams.set("redirect_uri", metaRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", process.env.META_OAUTH_SCOPES || "ads_read");
  return url.toString();
}

const proofFor = (token: string, secret?: string) => (secret ? createHmac("sha256", secret).update(token).digest("hex") : null);

async function metaGet(path: string, creds: MetaGrantCreds, params: Record<string, string> = {}, fetchImpl: typeof fetch = fetch) {
  const url = new URL(path.startsWith("http") ? path : `${META_GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const proof = proofFor(creds.accessToken, creds.appSecret);
  if (proof && !url.searchParams.has("appsecret_proof")) url.searchParams.set("appsecret_proof", proof);
  return readJson(await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${creds.accessToken}` } }), "Meta");
}

export async function metaGrantFromCode(code: string, userId?: string, fetchImpl: typeof fetch = fetch) {
  const { appId, appSecret } = metaApp();
  const short = await readJson(await fetchImpl(`${META_GRAPH}/oauth/access_token?${form({
    client_id: appId, client_secret: appSecret, redirect_uri: metaRedirectUri(), code,
  })}`), "Meta login");
  const long = await readJson(await fetchImpl(`${META_GRAPH}/oauth/access_token?${form({
    grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token,
  })}`), "Meta login");
  const creds: MetaGrantCreds = { accessToken: long.access_token, appSecret };
  const me = await metaGet("/me", creds, { fields: "id,name" }, fetchImpl);
  return saveGrant({
    provider: "meta", accountRef: String(me.id), displayName: me.name ?? null, source: "oauth",
    credentials: { accessToken: creds.accessToken }, userId,
    expiresAt: long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000) : null,
  });
}

// A pasted system user token (Business Settings > System users). Works without a Meta app here.
export async function metaGrantFromToken(accessToken: string, appSecret: string | undefined, userId?: string, fetchImpl: typeof fetch = fetch) {
  const creds: MetaGrantCreds = { accessToken, appSecret };
  const me = await metaGet("/me", creds, { fields: "id,name" }, fetchImpl);
  return saveGrant({
    provider: "meta", accountRef: String(me.id), displayName: me.name ?? null, source: "token",
    credentials: { accessToken, ...(appSecret ? { appSecret } : {}) }, expiresAt: null, userId,
  });
}

function metaGrantCreds(grant: OAuthGrant): MetaGrantCreds {
  const stored = decryptJson<MetaGrantCreds>(grant.credentialsCiphertext);
  if (!stored?.accessToken) throw new Error("Meta login is unreadable; reconnect it in Integrations.");
  // Tokens from our own login are signed with our app secret; pasted tokens bring their own (or none).
  const appSecret = grant.source === "oauth" ? process.env.META_APP_SECRET : stored.appSecret;
  return { accessToken: stored.accessToken, appSecret };
}

// --- HighLevel ---

function highlevelApp() {
  const clientId = process.env.HIGHLEVEL_CLIENT_ID;
  const clientSecret = process.env.HIGHLEVEL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("HIGHLEVEL_CLIENT_ID and HIGHLEVEL_CLIENT_SECRET are not set.");
  // The marketplace app id is the part of the client id before the dash.
  return { clientId, clientSecret, appId: process.env.HIGHLEVEL_APP_ID || clientId.split("-")[0] };
}

export function highlevelAuthorizeUrl(state: string) {
  const url = new URL("https://marketplace.gohighlevel.com/oauth/chooselocation");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", highlevelApp().clientId);
  url.searchParams.set("redirect_uri", highlevelRedirectUri());
  url.searchParams.set("scope", HL_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

async function highlevelToken(values: Record<string, string>, fetchImpl: typeof fetch) {
  const { clientId, clientSecret } = highlevelApp();
  const body = await readJson(await fetchImpl(`${HL_API}/oauth/token`, {
    method: "POST",
    headers: { ...HL_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ client_id: clientId, client_secret: clientSecret, redirect_uri: highlevelRedirectUri(), ...values }),
  }), "HighLevel login");
  return body as { access_token: string; refresh_token: string; expires_in: number; userType?: string; companyId?: string; locationId?: string };
}

const hlCreds = (t: Awaited<ReturnType<typeof highlevelToken>>, prev?: HighLevelGrantCreds): HighLevelGrantCreds => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  expiresAt: Date.now() + Number(t.expires_in || 86_399) * 1000,
  userType: t.userType ?? prev?.userType ?? "Company",
  companyId: t.companyId ?? prev?.companyId ?? "",
  locationId: t.locationId ?? prev?.locationId,
});

export async function highlevelGrantFromCode(code: string, userId?: string, fetchImpl: typeof fetch = fetch) {
  const token = await highlevelToken({ grant_type: "authorization_code", code, user_type: "Company" }, fetchImpl);
  const creds = hlCreds(token);
  // Installed on a single sub-account instead of the agency: the login covers just that one.
  const accountRef = creds.userType === "Location" && creds.locationId ? `location:${creds.locationId}` : creds.companyId;
  if (!accountRef) throw new Error("HighLevel did not say which agency this login is for.");
  return saveGrant({
    provider: "highlevel", accountRef, displayName: creds.userType === "Location" ? "HighLevel sub-account" : "HighLevel agency",
    source: "oauth", credentials: creds, expiresAt: null, userId,
  });
}

// HighLevel refresh tokens are single use, so two syncs must not refresh the same login at once.
async function freshHighLevelCreds(grantId: number, fetchImpl: typeof fetch): Promise<HighLevelGrantCreds> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(727274200, ${grantId})`);
    const [grant] = await tx.select().from(oauthGrants).where(eq(oauthGrants.id, grantId));
    if (!grant) throw new Error("HighLevel login was removed; reconnect it in Integrations.");
    const creds = decryptJson<HighLevelGrantCreds>(grant.credentialsCiphertext);
    if (!creds?.refreshToken) throw new Error("HighLevel login is unreadable; reconnect it in Integrations.");
    if (creds.expiresAt - 5 * 60_000 > Date.now()) return creds;
    const next = hlCreds(await highlevelToken({ grant_type: "refresh_token", refresh_token: creds.refreshToken, user_type: creds.userType }, fetchImpl), creds);
    await tx.update(oauthGrants).set({ credentialsCiphertext: encryptJson(next), status: "active", lastError: null, updatedAt: new Date() })
      .where(eq(oauthGrants.id, grantId));
    return next;
  });
}

const locationTokens = new Map<string, { token: string; expiresAt: number }>();

async function highlevelLocationToken(grant: OAuthGrant, locationId: string, fetchImpl: typeof fetch): Promise<string> {
  const creds = await freshHighLevelCreds(grant.id, fetchImpl);
  if (creds.userType === "Location") {
    if (creds.locationId !== locationId) throw new Error("This HighLevel login only covers another sub-account.");
    return creds.accessToken;
  }
  const cacheKey = `${grant.id}:${locationId}`;
  const cached = locationTokens.get(cacheKey);
  if (cached && cached.expiresAt - 5 * 60_000 > Date.now()) return cached.token;
  const body = await readJson(await fetchImpl(`${HL_API}/oauth/locationToken`, {
    method: "POST",
    headers: { ...HL_HEADERS, Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ companyId: creds.companyId, locationId }),
  }), "HighLevel sub-account token");
  locationTokens.set(cacheKey, { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 86_399) * 1000 });
  return body.access_token;
}

// --- Accounts a login can reach ---

export type GrantAccount = { id: string; name: string; detail: string | null };

export async function grantAccounts(grant: OAuthGrant, fetchImpl: typeof fetch = fetch): Promise<GrantAccount[]> {
  try {
    if (grant.provider === "meta") {
      const creds = metaGrantCreds(grant);
      const out: GrantAccount[] = [];
      let next: string | undefined = undefined;
      // business_name needs no extra permission on most tokens; drop it if this token cannot read it.
      let body: any = await metaGet("/me/adaccounts", creds, { fields: "account_id,name,business_name,account_status", limit: "200" }, fetchImpl)
        .catch(() => metaGet("/me/adaccounts", creds, { fields: "account_id,name,account_status", limit: "200" }, fetchImpl));
      for (let page = 0; page < 20; page++) {
        for (const a of body.data ?? []) {
          out.push({ id: String(a.account_id), name: a.name ?? `act_${a.account_id}`, detail: [a.business_name, `act_${a.account_id}`, a.account_status === 1 ? null : "inactive"].filter(Boolean).join(" · ") });
        }
        next = body.paging?.next;
        if (!next) break;
        body = await metaGet(next, creds, {}, fetchImpl);
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (grant.provider === "highlevel") {
      const creds = await freshHighLevelCreds(grant.id, fetchImpl);
      if (creds.userType === "Location") return [{ id: creds.locationId!, name: "Sub-account", detail: creds.locationId! }];
      const { appId } = highlevelApp();
      const out: GrantAccount[] = [];
      for (let skip = 0; skip < 5000; skip += 100) {
        const url = new URL(`${HL_API}/oauth/installedLocations`);
        url.search = form({ companyId: creds.companyId, appId, isInstalled: "true", limit: "100", skip: String(skip) });
        const body = await readJson(await fetchImpl(url.toString(), { headers: { ...HL_HEADERS, Authorization: `Bearer ${creds.accessToken}` } }), "HighLevel sub-accounts");
        const rows: any[] = body.locations ?? [];
        for (const l of rows) out.push({ id: String(l._id ?? l.id), name: l.name ?? "Sub-account", detail: l.address ?? null });
        if (rows.length < 100) break;
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [];
  } catch (error: any) {
    await markGrantFailed(grant.id, error.message ?? String(error));
    throw error;
  }
}

// ---------- Stripe through Composio ----------

async function composio(path: string, init: { method?: string; body?: unknown } = {}, fetchImpl: typeof fetch = fetch) {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set.");
  return readJson(await fetchImpl(`${COMPOSIO_API}${path}`, {
    method: init.method ?? "GET",
    headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  }), "Composio");
}

let stripeAuthConfig: string | null = null;
async function stripeAuthConfigId(fetchImpl: typeof fetch) {
  if (process.env.COMPOSIO_STRIPE_AUTH_CONFIG_ID) return process.env.COMPOSIO_STRIPE_AUTH_CONFIG_ID;
  if (stripeAuthConfig) return stripeAuthConfig;
  const list = await composio(`/auth_configs?${form({ toolkit_slug: "stripe", is_composio_managed: "true" })}`, {}, fetchImpl);
  const existing = (list.items ?? []).find((c: any) => c.status !== "DISABLED");
  if (existing?.id) return (stripeAuthConfig = existing.id);
  const created = await composio("/auth_configs", { method: "POST", body: { toolkit: { slug: "stripe" }, auth_config: { type: "use_composio_managed_auth" } } }, fetchImpl);
  const id = created.auth_config?.id ?? created.id;
  if (!id) throw new Error("Composio did not return a Stripe auth config.");
  return (stripeAuthConfig = id);
}

export const composioUserId = (clientId: number) => `eventhq-client-${clientId}`;

// Starts a Stripe sign-in. `state` comes back on the callback so we know which workspace it is for.
export async function composioStripeLink(clientId: number, returnTo: string, fetchImpl: typeof fetch = fetch) {
  const state = signToken({ k: "composio", c: clientId, r: returnTo }, 30 * 60_000);
  const body = await composio("/connected_accounts/link", {
    method: "POST",
    body: { auth_config_id: await stripeAuthConfigId(fetchImpl), user_id: composioUserId(clientId), callback_url: `${composioCallbackUri()}?state=${encodeURIComponent(state)}` },
  }, fetchImpl);
  if (!body.redirect_url) throw new Error("Composio did not return a sign-in link.");
  return { url: body.redirect_url as string, connectedAccountId: body.connected_account_id as string };
}

export function readComposioState(state: string) {
  const value = readToken<{ c: number; r: string }>(state, "composio");
  return value && Number.isInteger(value.c) ? { clientId: value.c, returnTo: String(value.r || "/") } : null;
}

// Confirms a finished Stripe sign-in belongs to this workspace and is active.
export async function composioFinish(input: { clientId: number; connectedAccountId?: string; sessionUri?: string }, fetchImpl: typeof fetch = fetch) {
  let id = input.connectedAccountId;
  if (input.sessionUri) {
    const done = await composio("/connected_accounts/complete_auth", { method: "POST", body: { session_uri: input.sessionUri, user_id: composioUserId(input.clientId) } }, fetchImpl);
    id = done.connected_account_id;
  }
  if (!id) throw new Error("Stripe sign-in did not finish.");
  const account = await composio(`/connected_accounts/${encodeURIComponent(id)}`, {}, fetchImpl);
  if (account.user_id !== composioUserId(input.clientId)) throw new Error("This Stripe sign-in belongs to another workspace.");
  if (account.toolkit?.slug !== "stripe") throw new Error("This sign-in is not for Stripe.");
  if (account.status !== "ACTIVE") throw new Error(`Stripe sign-in is ${String(account.status || "not finished").toLowerCase()}.`);
  const stripe = await readJson(await composioFetch(id, fetchImpl)("https://api.stripe.com/v1/account"), "Stripe");
  const name = stripe.settings?.dashboard?.display_name || stripe.business_profile?.name || stripe.email || null;
  return { composioAccountId: id, stripeAccountId: String(stripe.id ?? id), displayName: name as string | null };
}

// A fetch() that sends Stripe GET requests through Composio, which adds the Stripe login.
export function composioFetch(connectedAccountId: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  return (async (input: any) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    const parameters = Array.from(url.searchParams.entries()).map(([name, value]) => ({ name, value, type: "query" }));
    const res = await fetchImpl(`${COMPOSIO_API}/tools/execute/proxy`, {
      method: "POST",
      headers: { "x-api-key": process.env.COMPOSIO_API_KEY ?? "", "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ connected_account_id: connectedAccountId, endpoint: `${url.origin}${url.pathname}`, method: "GET", parameters }),
    });
    if (!res.ok) return res;
    const body: any = await res.json();
    return new Response(JSON.stringify(body.data ?? null), { status: Number(body.status) || 502, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

// ---------- What a sync uses ----------

export type ConnectionAuth = { creds: ConnectionCredentials; fetchImpl?: typeof fetch };

export async function connectionAuth(connection: IntegrationConnection, fetchImpl: typeof fetch = fetch): Promise<ConnectionAuth> {
  if (connection.grantId) {
    const grant = await getGrant(connection.grantId);
    if (!grant) throw new Error("The agency login this connection used was removed; reconnect it in Integrations.");
    try {
      if (grant.provider === "meta") {
        if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) throw new Error("The Meta login expired; log in again in Integrations.");
        const { accessToken, appSecret } = metaGrantCreds(grant);
        return { creds: { accessToken, ...(appSecret ? { appSecret } : {}) } };
      }
      if (grant.provider === "highlevel") {
        return { creds: { apiKey: await highlevelLocationToken(grant, connection.externalAccountId, fetchImpl) } };
      }
    } catch (error: any) {
      await markGrantFailed(grant.id, error.message ?? String(error));
      throw error;
    }
    throw new Error(`Unknown agency login type ${grant.provider}`);
  }
  const creds = credentialsOf(connection);
  if (creds.composioAccountId) return { creds: { ...creds, secretKey: "composio" }, fetchImpl: composioFetch(creds.composioAccountId, fetchImpl) };
  return { creds };
}
