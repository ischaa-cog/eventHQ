// Routes for signing in to Meta, HighLevel and Stripe instead of pasting keys, and the public
// connect link a client opens to connect their own accounts without an eventHQ login.
import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { clients, integrationConnections, oauthGrants, type User } from "@shared/schema";
import { db } from "../storage";
import { isAuthenticated } from "../auth";
import { appUrl } from "../config";
import { countAttempt } from "../rate-limit";
import { saveConnection, toPublic } from "./connections";
import { webhookUrlFor } from "./routes";
import { kickSync } from "./kick";
import {
  composioFinish, composioStripeLink, connectLinkToken, CONNECT_LINK_TTL, getGrant, grantAccounts, grantToPublic,
  highlevelAuthorizeUrl, highlevelGrantFromCode, listGrants, metaAuthorizeUrl, metaGrantFromCode, metaGrantFromToken,
  oauthConfig, readComposioState, readConnectLink,
} from "./oauth";

type GetUser = (req: any) => Promise<User | undefined>;
const isAdmin = (user: User | undefined) => user?.role === "owner" || user?.role === "agency_admin";

// Only same-site paths, so a crafted returnTo cannot send someone elsewhere.
const safePath = (value: unknown, fallback = "/") => {
  const v = String(value ?? "");
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : fallback;
};
const withQuery = (path: string, params: Record<string, string>) => {
  const url = new URL(path, "http://x");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.pathname + url.search;
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const saveSession = (req: any) => new Promise<void>((resolve, reject) => req.session.save((err: any) => (err ? reject(err) : resolve())));

async function testKey(provider: "whop" | "fanbasis" | "stripe", apiKey: string): Promise<{ externalAccountId: string; displayName: string | null; credentials: Record<string, string> }> {
  const get = async (url: string, headers: Record<string, string>, label: string) => {
    const res = await fetch(url, { headers });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 160);
      try { const j = JSON.parse(text); msg = j?.error?.message ?? j?.message ?? msg; } catch { /* text */ }
      throw new Error(`${label} said ${res.status}: ${msg}`);
    }
    try { return JSON.parse(text); } catch { return null; }
  };
  if (provider === "whop") {
    const company = await get("https://api.whop.com/api/v5/company", { Authorization: `Bearer ${apiKey}` }, "Whop");
    await get(`https://api.whop.com/api/v1/payments?company_id=${encodeURIComponent(company.id)}&first=1`, { Authorization: `Bearer ${apiKey}` },
      "Whop (the key needs payment read permission)");
    return { externalAccountId: String(company.id), displayName: (company.title ?? company.name ?? null) as string | null, credentials: { apiKey } };
  }
  if (provider === "fanbasis") {
    await get("https://www.fanbasis.com/public-api/checkout-sessions/transactions?per_page=1", { "x-api-key": apiKey, Accept: "application/json" }, "Fanbasis");
    return { externalAccountId: "", displayName: "Fanbasis", credentials: { apiKey } };
  }
  await get("https://api.stripe.com/v1/charges?limit=1", { Authorization: `Bearer ${apiKey}` }, "Stripe (the key needs read access to charges)");
  // Restricted keys often cannot read the account itself; fall back to a label from the key.
  const account = await get("https://api.stripe.com/v1/account", { Authorization: `Bearer ${apiKey}` }, "Stripe").catch(() => null);
  const name = account?.settings?.dashboard?.display_name || account?.business_profile?.name || null;
  return { externalAccountId: account?.id ? String(account.id) : `key-${apiKey.slice(-6)}`, displayName: name ?? "Stripe", credentials: { secretKey: apiKey } };
}

export function registerOAuthRoutes(app: Express, getRequestUser: GetUser) {
  const requireAdmin = async (req: Request, res: Response) => {
    const user = await getRequestUser(req);
    if (!isAdmin(user)) {
      res.status(403).json({ error: "Only admins can manage integrations." });
      return undefined;
    }
    return user;
  };

  // ---------- Agency logins ----------

  app.get("/api/oauth/status", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    res.json({ ...oauthConfig(), grants: (await listGrants()).map(grantToPublic) });
  });

  for (const provider of ["meta", "highlevel"] as const) {
    app.get(`/api/oauth/${provider}/start`, isAuthenticated, async (req: any, res) => {
      const user = await getRequestUser(req);
      const returnTo = safePath(req.query.returnTo);
      if (!isAdmin(user)) return res.redirect(withQuery(returnTo, { oauth_error: "Only admins can connect agency logins." }));
      try {
        const nonce = randomUUID();
        req.session.oauthPending = { provider, nonce, returnTo, userId: user!.id, expiresAt: Date.now() + 15 * 60_000 };
        await saveSession(req);
        res.redirect(provider === "meta" ? metaAuthorizeUrl(nonce) : highlevelAuthorizeUrl(nonce));
      } catch (error) {
        res.redirect(withQuery(returnTo, { oauth_error: message(error) }));
      }
    });

    app.get(`/api/oauth/${provider}/callback`, isAuthenticated, async (req: any, res) => {
      const pending = req.session.oauthPending;
      delete req.session.oauthPending;
      await saveSession(req).catch(() => undefined);
      const returnTo = safePath(pending?.returnTo);
      const fail = (text: string) => res.redirect(withQuery(returnTo, { oauth_error: text }));
      if (req.query.error) return fail(String(req.query.error_description ?? req.query.error));
      if (!pending || pending.provider !== provider || pending.expiresAt < Date.now()) return fail("The login took too long or was started elsewhere. Try again.");
      // Meta always returns state; HighLevel may not, in which case the session alone ties it to this user.
      if ((provider === "meta" || req.query.state) && req.query.state !== pending.nonce) return fail("The login could not be verified. Try again.");
      const user = await getRequestUser(req);
      if (!isAdmin(user) || user!.id !== pending.userId) return fail("Only admins can connect agency logins.");
      if (!req.query.code) return fail("The login was cancelled.");
      try {
        if (provider === "meta") await metaGrantFromCode(String(req.query.code), user!.id);
        else await highlevelGrantFromCode(String(req.query.code), user!.id);
        res.redirect(withQuery(returnTo, { oauth: "connected", provider }));
      } catch (error) {
        fail(message(error));
      }
    });
  }

  app.post("/api/oauth/grants/meta-token", isAuthenticated, async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const parsed = z.object({ accessToken: z.string().trim().min(20).max(4000), appSecret: z.string().trim().max(200).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Paste the full access token." });
    try {
      res.json(grantToPublic(await metaGrantFromToken(parsed.data.accessToken, parsed.data.appSecret || undefined, user.id)));
    } catch (error) {
      res.status(400).json({ error: message(error) });
    }
  });

  app.delete("/api/oauth/grants/:id", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    // Connections that used this login stop syncing until they are given a key or another login.
    await db.update(integrationConnections).set({ status: "error", lastError: "Its agency login was removed.", updatedAt: new Date() })
      .where(eq(integrationConnections.grantId, id));
    const deleted = await db.delete(oauthGrants).where(eq(oauthGrants.id, id)).returning({ id: oauthGrants.id });
    if (!deleted.length) return res.status(404).json({ error: "Login not found" });
    res.json({ success: true });
  });

  app.get("/api/oauth/grants/:id/accounts", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const grant = await getGrant(Number(req.params.id));
    if (!grant) return res.status(404).json({ error: "Login not found" });
    try {
      const accounts = await grantAccounts(grant);
      const used = await db.select({ clientId: integrationConnections.clientId, externalAccountId: integrationConnections.externalAccountId, clientName: clients.name })
        .from(integrationConnections).innerJoin(clients, eq(clients.id, integrationConnections.clientId))
        .where(eq(integrationConnections.provider, grant.provider));
      res.json({
        accounts: accounts.map((a) => ({
          ...a,
          connectedTo: used.filter((u) => u.externalAccountId.replace(/^act_/, "") === a.id).map((u) => ({ clientId: u.clientId, clientName: u.clientName })),
        })),
      });
    } catch (error) {
      res.status(502).json({ error: message(error) });
    }
  });

  app.post("/api/clients/:clientId/integrations/from-grant", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const parsed = z.object({ grantId: z.number().int(), accountId: z.string().trim().min(1).max(200), accountName: z.string().trim().max(200).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Pick an account." });
    const grant = await getGrant(parsed.data.grantId);
    if (!grant) return res.status(404).json({ error: "Login not found" });
    try {
      // Only accounts this login can actually reach.
      const account = (await grantAccounts(grant)).find((a) => a.id === parsed.data.accountId);
      if (!account) return res.status(400).json({ error: "This login cannot see that account." });
      const row = await saveConnection({
        clientId: Number(req.params.clientId), provider: grant.provider as "meta" | "highlevel",
        externalAccountId: account.id, displayName: parsed.data.accountName || account.name, credentials: {}, grantId: grant.id,
      });
      await kickSync(row.id);
      res.json({ ...toPublic(row), webhookUrl: webhookUrlFor(row.provider, row.id) });
    } catch (error) {
      res.status(502).json({ error: message(error) });
    }
  });

  // ---------- Stripe through Composio ----------

  app.post("/api/clients/:clientId/integrations/stripe/oauth-start", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const clientId = Number(req.params.clientId);
    try {
      const { url } = await composioStripeLink(clientId, safePath(req.body?.returnTo, `/client/${clientId}/integrations`));
      res.json({ url });
    } catch (error) {
      res.status(502).json({ error: message(error) });
    }
  });

  // Composio sends people back here after the Stripe sign-in. Public: the signed state says which
  // workspace it is for, and Composio confirms the account belongs to that workspace.
  app.get("/api/oauth/composio/callback", async (req, res) => {
    const state = readComposioState(String(req.query.state ?? ""));
    if (!state) return res.redirect("/?oauth_error=" + encodeURIComponent("The Stripe sign-in link expired. Try again."));
    const returnTo = safePath(state.returnTo);
    const isConnectPage = returnTo.startsWith("/connect/");
    const fail = (text: string) => res.redirect(withQuery(returnTo, isConnectPage ? { error: text } : { oauth_error: text }));
    if (req.query.status && String(req.query.status).toLowerCase() !== "success") return fail("Stripe sign-in was cancelled.");
    try {
      const done = await composioFinish({
        clientId: state.clientId,
        connectedAccountId: (req.query.connected_account_id ?? req.query.connectedAccountId) as string | undefined,
        sessionUri: req.query.session_uri as string | undefined,
      });
      const row = await saveConnection({
        clientId: state.clientId, provider: "stripe", externalAccountId: done.stripeAccountId, displayName: done.displayName,
        credentials: { composioAccountId: done.composioAccountId }, grantId: null,
      });
      await kickSync(row.id);
      res.redirect(withQuery(returnTo, isConnectPage ? { connected: "stripe" } : { oauth: "connected", provider: "stripe" }));
    } catch (error) {
      fail(message(error));
    }
  });

  // ---------- Client connect link ----------

  app.get("/api/clients/:clientId/connect-link", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const clientId = Number(req.params.clientId);
    res.json({ url: `${appUrl()}/connect/${connectLinkToken(clientId)}`, expiresAt: new Date(Date.now() + CONNECT_LINK_TTL) });
  });

  const linkClient = async (req: Request, res: Response) => {
    const link = readConnectLink(String(req.params.token));
    if (!link) {
      res.status(404).json({ error: "This link has expired. Ask your account manager for a new one." });
      return undefined;
    }
    const [client] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, link.clientId));
    if (!client) {
      res.status(404).json({ error: "This link has expired. Ask your account manager for a new one." });
      return undefined;
    }
    return { ...client, expiresAt: link.expiresAt };
  };

  app.get("/api/connect/:token", async (req, res) => {
    const client = await linkClient(req, res);
    if (!client) return;
    const rows = await db.select().from(integrationConnections).where(eq(integrationConnections.clientId, client.id));
    res.json({
      clientName: client.name, expiresAt: client.expiresAt, stripeOAuth: oauthConfig().composio.configured,
      connections: rows.map((r) => ({ provider: r.provider, displayName: r.displayName, status: r.status, lastSyncAt: r.lastSyncAt })),
    });
  });

  app.post("/api/connect/:token/stripe", async (req, res) => {
    const client = await linkClient(req, res);
    if (!client) return;
    if (await countAttempt(`connect-stripe:${client.id}`, 15 * 60_000) > 20) {
      return res.status(429).json({ error: "Too many tries. Wait 15 minutes and try again." });
    }
    try {
      const { url } = await composioStripeLink(client.id, `/connect/${req.params.token}`);
      res.json({ url });
    } catch (error) {
      res.status(502).json({ error: message(error) });
    }
  });

  app.post("/api/connect/:token/key", async (req, res) => {
    const client = await linkClient(req, res);
    if (!client) return;
    // Each try calls the provider, so keep guessing slow.
    if (await countAttempt(`connect-key:${client.id}`, 15 * 60_000) > 20) {
      return res.status(429).json({ error: "Too many tries. Wait 15 minutes and try again." });
    }
    const parsed = z.object({ provider: z.enum(["whop", "fanbasis", "stripe"]), apiKey: z.string().trim().min(8).max(4000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Paste the full key." });
    try {
      const tested = await testKey(parsed.data.provider, parsed.data.apiKey);
      const row = await saveConnection({ clientId: client.id, provider: parsed.data.provider, ...tested, grantId: null });
      await kickSync(row.id);
      res.json({ ok: true, displayName: row.displayName });
    } catch (error) {
      res.status(400).json({ error: message(error) });
    }
  });
}
