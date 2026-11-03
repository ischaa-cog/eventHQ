// Admin API for a client's integrations: list, connect/update, disconnect, and sync now.
// Client access is enforced centrally for /api/clients/:clientId (routes.ts); these routes add
// the admin-only check. Secrets are accepted here but never returned.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { INTEGRATION_PROVIDERS, integrationConnections, type User } from "@shared/schema";
import { db } from "../storage";
import { isAuthenticated } from "../auth";
import { appUrl } from "../config";
import { listConnections, saveConnection, toPublic } from "./connections";
import { syncConnection } from "./sync";

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
    const row = await saveConnection({ clientId: clientIdOf(req), ...parsed.data });
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

  app.post("/api/clients/:clientId/integrations/:id/sync", isAuthenticated, async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const rows = await listConnections(clientIdOf(req));
    const row = rows.find((r) => r.id === Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Connection not found" });
    try {
      res.json(await syncConnection(row, { days: Number(req.query.days) || undefined }));
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Sync failed" });
    }
  });
}
