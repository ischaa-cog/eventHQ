// Admin API for a client's integrations: list, connect/update, disconnect, and sync now.
// Client access is enforced centrally for /api/clients/:clientId (routes.ts); these routes add
// the admin-only check. Secrets are accepted here but never returned.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { INTEGRATION_PROVIDERS, adSpendDaily, integrationConnections, optIns, sales, type User } from "@shared/schema";
import { db } from "../storage";
import { isAuthenticated } from "../auth";
import { appUrl } from "../config";
import { listConnections, saveConnection, toPublic } from "./connections";
import { syncConnection } from "./sync";
import { kickSync } from "./kick";

type GetUser = (req: any) => Promise<User | undefined>;

const isAdmin = (user: User | undefined) => user?.role === "owner" || user?.role === "agency_admin";

const connectSchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  externalAccountId: z.string().trim().max(200).default(""),
  displayName: z.string().trim().max(200).nullish(),
  // Replaces stored credentials when present. Values are API keys/tokens, e.g. { apiKey } or { accessToken }.
  credentials: z.record(z.string().trim().min(1).max(4000)).optional(),
  webhookSecret: z.string().trim().max(500).nullish(),
  settings: z.record(z.unknown()).optional(),
});

export function webhookUrlFor(provider: string, connectionId: number): string | null {
  if (provider === "whop") return `${appUrl()}/api/webhooks/whop/${connectionId}`;
  return null;
}

export function registerIntegrationRoutes(app: Express, getRequestUser: GetUser) {
  const requireAdmin = async (req: Request, res: Response) => {
    const user = await getRequestUser(req);
    if (!isAdmin(user)) {
      res.status(403).json({ error: "Only admins can manage integrations." });
      return undefined;
    }
    return user;
  };
  const clientIdOf = (req: Request) => Number(req.params.clientId);

  app.get("/api/clients/:clientId/integrations", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await listConnections(clientIdOf(req));
    res.json(rows.map((row) => ({ ...toPublic(row), webhookUrl: webhookUrlFor(row.provider, row.id) })));
  });

  app.put("/api/clients/:clientId/integrations", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid connection" });
    // A key typed here replaces any agency login the connection used before.
    const row = await saveConnection({ clientId: clientIdOf(req), ...parsed.data, ...(parsed.data.credentials ? { grantId: null } : {}) });
    // New or changed keys: start the sync right away instead of waiting for the daily run.
    if (parsed.data.credentials) await kickSync(row.id);
    res.json({ ...toPublic(row), webhookUrl: webhookUrlFor(row.provider, row.id) });
  });

  app.delete("/api/clients/:clientId/integrations/:id", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const deleted = await db.delete(integrationConnections)
      .where(and(eq(integrationConnections.id, Number(req.params.id)), eq(integrationConnections.clientId, clientIdOf(req))))
      .returning({ id: integrationConnections.id });
    if (!deleted.length) return res.status(404).json({ error: "Connection not found" });
    res.json({ success: true });
  });

  // Every record a connection stored for a date range (UTC days), for checking eventHQ against the
  // platform's own data (script/verify-partners.ts). Ids and amounts only; no customer details.
  app.get("/api/clients/:clientId/integrations/:id/records", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(req.query.from ?? ""), to = String(req.query.to ?? "");
    if (!day.test(from) || !day.test(to)) return res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
    const rows = await listConnections(clientIdOf(req));
    const row = rows.find((r) => r.id === Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Connection not found" });
    const salesRows = await db.select({ key: sales.dedupeKey, amount: sales.amount, status: sales.status, at: sales.saleDate })
      .from(sales).where(and(eq(sales.connectionId, row.id), sql`${sales.saleDate} >= ${from}::timestamp and ${sales.saleDate} < (${to}::date + 1)::timestamp`));
    const spendRows = await db.select({ date: sql<string>`${adSpendDaily.date}::text`, spend: sql<string>`sum(${adSpendDaily.spend})`, rows: sql<string>`count(*)` })
      .from(adSpendDaily).where(and(eq(adSpendDaily.connectionId, row.id), sql`${adSpendDaily.date} between ${from}::date and ${to}::date`))
      .groupBy(sql`1`);
    const optRows = await db.select({ id: optIns.externalId, at: optIns.submittedAt })
      .from(optIns).where(and(eq(optIns.connectionId, row.id), sql`${optIns.submittedAt} >= ${from}::timestamptz and ${optIns.submittedAt} < (${to}::date + 1)::timestamptz`));
    res.json({
      connection: { id: row.id, provider: row.provider, externalAccountId: row.externalAccountId, lastSyncAt: row.lastSyncAt, lastError: row.lastError },
      sales: salesRows.map((r) => [r.key, Number(r.amount), r.status, r.at.toISOString()]),
      spendByDay: Object.fromEntries(spendRows.map((r) => [r.date, Math.round(Number(r.spend) * 100) / 100])),
      optIns: optRows.map((r) => [r.id, r.at.toISOString()]),
    });
  });

  app.post("/api/clients/:clientId/integrations/:id/sync", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await listConnections(clientIdOf(req));
    const row = rows.find((r) => r.id === Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Connection not found" });
    try {
      // Stay inside the hosting time limit; a long sync carries on in the background.
      const result = await syncConnection(row, { days: Number(req.query.days) || undefined, deadline: Date.now() + 45_000 });
      if (!result.complete) await kickSync(row.id, 1);
      res.json(result);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Sync failed" });
    }
  });
}
