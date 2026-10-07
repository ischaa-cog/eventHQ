import type { Express } from "express";
import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import { db } from "./storage";
import { getGoogleCalendarClient } from "./googleCalendar";
import { netSaleContribution } from "./sales-math";
import { BULK_TRAINING_MAX_ROWS } from "@shared/training-bulk";
import {
  trainingResources, trainingModules, trainingVideos, clientCalendarConnections, clients,
  salesSources, sales, calendarEntries, eventPerformance, projections,
  type User,
} from "@shared/schema";

const admin = (u?: User) => !!u && (u.role === "owner" || u.role === "agency_admin");
const idOf = (v: any) => Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : NaN;
const url = z.string().url().max(2048).refine(value => /^https?:\/\//i.test(value), "Use an HTTP(S) resource URL");
const resourceInput = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().max(5000).nullable().optional(),
  category: z.enum(["challenge", "webinar", "summit", "marketing", "masterclass", "bonus_training", "partner_sop"]),
  resourceType: z.enum(["video", "document"]), url,
  orderIndex: z.number().int().min(0).max(100000).optional(),
  visibleClientIds: z.array(z.number().int().positive()).max(1000).optional(),
  isGlobal: z.boolean().optional(),
});
const projectionInput = z.object({
  title: z.string().trim().min(1).max(200), adSpend: z.coerce.number().finite().min(0),
  expectedRegistrations: z.coerce.number().int().min(0),
  showUpRate: z.coerce.number().finite().min(0).max(100),
  conversionRate: z.coerce.number().finite().min(0).max(100),
  averageSaleValue: z.coerce.number().finite().min(0),
});
// Accepts a raw Calendar ID, a Google Calendar embed/public URL, or the full <iframe> snippet.
const normalizeCalendarId = (input: string) => {
  let value = input.trim();
  const src = value.match(/[?&](?:src|cid)=([^&"'\s>]+)/);
  if (src) {
    try { value = decodeURIComponent(src[1]); } catch { return null; }
  }
  value = value.trim();
  // "Get shareable link" URLs carry the ID base64-encoded in cid=.
  if (src && !value.includes("@")) {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (/^[^\s@]+@[^\s@]+$/.test(decoded)) value = decoded;
  }
  return value && value.length <= 500 && !/[\s<>"']/.test(value) ? value : null;
};
const fail = (res: any, code: number, message: string) => res.status(code).json({ error: message });
const validDate = (s: any) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? undefined : d; };
const can = async (req: any, clientId: number, getUser: any, access: any) => {
  const u = await getUser(req); return { user: u, allowed: await access(u, clientId) };
};

export function registerPortalRoutes(
  app: Express,
  getRequestUser: (req: any) => Promise<User | undefined>,
  canAccessClient: (user: User | undefined, clientId: number) => Promise<boolean>,
) {
  const guard = async (req: any, res: any, clientId: number) => {
    const user = await getRequestUser(req);
    if (!Number.isInteger(clientId) || !(await canAccessClient(user, clientId))) {
      fail(res, 403, "Forbidden"); return false;
    }
    if (user?.role === "agency_client" || req.user?.demoLogin) {
      const path = (req.originalUrl || req.path).split("?")[0];
      const allowed = (req.method === "GET" && new RegExp(
        `^/api/clients/${clientId}/(?:training/resources|calendar/connection|sales/sources|portal-summary|projections)/?$`,
      ).test(path)) ||
        (req.method === "POST" && new RegExp(`^/api/clients/${clientId}/projections/?$`).test(path)) ||
        ((req.method === "PATCH" || req.method === "DELETE") && /^\/api\/projections\/\d+\/?$/.test(path));
      if (!allowed) {
        fail(res, 403, "Forbidden"); return false;
      }
    }
    return true;
  };
  app.get("/api/clients/:id/training/resources", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return;
    try {
      const demo = !!req.user?.demoLogin;
      const [custom, modules] = await Promise.all([
        db.select().from(trainingResources).orderBy(asc(trainingResources.orderIndex), asc(trainingResources.id)),
        demo ? Promise.resolve([]) : db.select().from(trainingModules).orderBy(asc(trainingModules.orderIndex)),
      ]);
      const visible = custom.filter(r => !r.archived &&
        ((r.visibleClientIds || []).includes(clientId) ||
          (r.isGlobal && (!demo || r.seedKey?.startsWith("client-trainings-vimeo-")))));
      const legacy = [];
      for (const m of modules) {
        const videos = await db.select().from(trainingVideos).where(eq(trainingVideos.moduleId, m.id)).orderBy(asc(trainingVideos.orderIndex));
        for (const v of videos) legacy.push({ id: `legacy-${v.id}`, title: v.title, description: v.description, category: "partner_sop", resourceType: "video", url: v.vimeoUrl, orderIndex: v.orderIndex, legacy: true, module: m.name });
      }
      res.json([...legacy, ...visible]);
    } catch { fail(res, 500, "Failed to fetch training resources"); }
  });
  // Who may see new resources: shared (owner only) or a client list that includes the
  // target workspace and stays inside the admin's tenant. Returns an error or the ids.
  const resolveVisibility = async (u: User, clientId: number, isGlobal: boolean | undefined, requested: number[] | undefined):
    Promise<{ status: number; error: string } | { ids: number[] }> => {
    if (isGlobal && u.role !== "owner") return { status: 403, error: "Only the owner can publish shared resources" };
    if (isGlobal && requested?.length) return { status: 400, error: "Shared resources cannot have a client list" };
    const ids = isGlobal ? [] : requested || [];
    if (!isGlobal && !ids.includes(clientId)) return { status: 400, error: "Resource must include the target client" };
    if (u.role !== "owner") for (const id of ids) if (!(await canAccessClient(u, id))) return { status: 403, error: "A resource cannot be assigned outside your tenant" };
    return { ids };
  };
  app.post("/api/clients/:id/training/resources", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return;
    const u = await getRequestUser(req); if (!admin(u) || !u) return fail(res, 403, "Admin access required");
    const parsed = resourceInput.safeParse({ ...req.body, visibleClientIds: req.body?.visibleClientIds ?? (req.body?.isGlobal ? [] : [clientId]) });
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    const visibility = await resolveVisibility(u, clientId, parsed.data.isGlobal, parsed.data.visibleClientIds);
    if ("error" in visibility) return fail(res, visibility.status, visibility.error);
    try { res.status(201).json((await db.insert(trainingResources).values({ ...parsed.data, visibleClientIds: visibility.ids }).returning())[0]); } catch { fail(res, 400, "Failed to create resource"); }
  });
  // Bulk upload: every row is validated first and all rows are saved together, or none are.
  app.post("/api/clients/:id/training/resources/bulk", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return;
    const u = await getRequestUser(req); if (!admin(u) || !u) return fail(res, 403, "Admin access required");
    const rows = req.body?.resources;
    if (!Array.isArray(rows) || rows.length === 0) return fail(res, 400, "Add at least one lesson");
    if (rows.length > BULK_TRAINING_MAX_ROWS) return fail(res, 400, `Upload at most ${BULK_TRAINING_MAX_ROWS} lessons at a time`);
    const isGlobal = req.body?.isGlobal === true;
    const visibility = await resolveVisibility(u, clientId, isGlobal, isGlobal ? req.body?.visibleClientIds : (req.body?.visibleClientIds ?? [clientId]));
    if ("error" in visibility) return fail(res, visibility.status, visibility.error);
    const shape = resourceInput.pick({ title: true, description: true, category: true, resourceType: true, url: true });
    const valid = [];
    for (let i = 0; i < rows.length; i++) {
      const parsed = shape.safeParse(rows[i]);
      if (!parsed.success) return fail(res, 400, `Row ${i + 1}: ${parsed.error.issues[0].message}`);
      valid.push(parsed.data);
    }
    // Append after the lessons already in each category.
    const existing = await db.select({ category: trainingResources.category, orderIndex: trainingResources.orderIndex }).from(trainingResources);
    const next = new Map<string, number>();
    for (const r of existing) next.set(r.category, Math.max(next.get(r.category) ?? 0, r.orderIndex + 10));
    const values = valid.map(row => {
      const orderIndex = next.get(row.category) ?? 0;
      next.set(row.category, orderIndex + 10);
      return { ...row, description: row.description || null, orderIndex, isGlobal, visibleClientIds: visibility.ids };
    });
    try {
      // One multi-row insert, so a failure leaves nothing half-imported.
      const created = await db.insert(trainingResources).values(values).returning();
      res.status(201).json({ created: created.length });
    } catch { fail(res, 400, "Failed to save the lessons. Nothing was added."); }
  });
  app.patch("/api/training/resources/:id", isAuthenticated, async (req: any, res) => {
    const u = await getRequestUser(req); if (!admin(u) || !u) return fail(res, 403, "Admin access required");
    const existing = (await db.select().from(trainingResources).where(eq(trainingResources.id, idOf(req.params.id))))[0];
    if (!existing || existing.archived) return fail(res, 404, "Resource not found");
    if (u.role !== "owner" && (existing.isGlobal || !(existing.visibleClientIds || []).length ||
        !(await Promise.all((existing.visibleClientIds || []).map(id => canAccessClient(u, id)))).every(Boolean))) return fail(res, 403, "Shared resource is outside your tenant");
    const parsed = resourceInput.partial().safeParse(req.body); if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    if (parsed.data.isGlobal === true && u.role !== "owner") return fail(res, 403, "Only the owner can publish shared resources");
    const nextGlobal = parsed.data.isGlobal ?? existing.isGlobal;
    const nextIds = parsed.data.visibleClientIds ?? existing.visibleClientIds;
    if (nextGlobal && nextIds.length) return fail(res, 400, "Shared resources cannot have a client list");
    if (!nextGlobal && !nextIds.length) return fail(res, 400, "At least one visible client is required");
    if (parsed.data.visibleClientIds) {
      if (u.role !== "owner") for (const id of parsed.data.visibleClientIds) if (!(await canAccessClient(u, id))) return fail(res, 403, "A resource cannot be assigned outside your tenant");
    }
    try { const rows = await db.update(trainingResources).set({ ...parsed.data, updatedAt: new Date() }).where(eq(trainingResources.id, idOf(req.params.id))).returning(); res.json(rows[0]); } catch { fail(res, 400, "Failed to update resource"); }
  });
  app.delete("/api/training/resources/:id", isAuthenticated, async (req: any, res) => {
    const u = await getRequestUser(req); if (!admin(u) || !u) return fail(res, 403, "Admin access required");
    const existing = (await db.select().from(trainingResources).where(eq(trainingResources.id, idOf(req.params.id))))[0];
    if (!existing || existing.archived) return fail(res, 404, "Resource not found");
    if (u.role !== "owner" && (existing.isGlobal || !(existing.visibleClientIds || []).length ||
        !(await Promise.all((existing.visibleClientIds || []).map(id => canAccessClient(u, id)))).every(Boolean))) return fail(res, 403, "Shared resource is outside your tenant");
    if (existing.seedKey) await db.update(trainingResources).set({ archived: true, updatedAt: new Date() }).where(eq(trainingResources.id, existing.id));
    else await db.delete(trainingResources).where(eq(trainingResources.id, existing.id));
    res.json({ success: true });
  });

  app.get("/api/clients/:id/calendar/connection", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return;
    const row = (await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, clientId)))[0];
    if (!row) return res.json({ calendarId: null, lastSuccessfulSync: null, error: null, connected: false });
    // The API connector only exists on Replit; elsewhere the calendar is shown via Google's embed.
    if (!process.env.REPLIT_CONNECTORS_HOSTNAME) return res.json({ calendarId: row.calendarId, lastSuccessfulSync: row.lastSuccessfulSync, error: null, connected: false });
    let connected = false;
    try {
      const calendar = await getGoogleCalendarClient();
      await calendar.calendars.get({ calendarId: row.calendarId });
      connected = true;
      if (row.error) {
        if (!(req.user as any)?.demoLogin) await db.update(clientCalendarConnections).set({ error: null }).where(eq(clientCalendarConnections.clientId, clientId));
        row.error = null;
      }
    } catch (e: any) {
      const error = e?.message || "Google Calendar is not connected";
      if (row.error !== error && !(req.user as any)?.demoLogin) await db.update(clientCalendarConnections).set({ error }).where(eq(clientCalendarConnections.clientId, clientId));
      row.error = error;
    }
    res.json({ calendarId: row.calendarId, lastSuccessfulSync: row.lastSuccessfulSync, error: row.error, connected });
  });
  app.patch("/api/clients/:id/calendar/connection", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return;
    if (!admin(await getRequestUser(req))) return fail(res, 403, "Admin access required");
    const parsed = z.object({ calendarId: z.string().trim().max(4000).nullable() }).safeParse(req.body); if (!parsed.success) return fail(res, 400, "Valid calendarId required");
    if (parsed.data.calendarId) {
      const calendarId = normalizeCalendarId(parsed.data.calendarId);
      if (!calendarId) return fail(res, 400, "Paste a Google Calendar ID or embed link");
      parsed.data.calendarId = calendarId;
    }
    if (!parsed.data.calendarId) {
      await db.delete(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, clientId));
      return res.json({ calendarId: null, connected: false, lastSuccessfulSync: null, error: null });
    }
    const row = (await db.insert(clientCalendarConnections).values({ clientId, calendarId: parsed.data.calendarId }).onConflictDoUpdate({ target: clientCalendarConnections.clientId, set: { calendarId: parsed.data.calendarId, error: null, lastSuccessfulSync: null } }).returning())[0];
    res.json({ calendarId: row.calendarId, lastSuccessfulSync: row.lastSuccessfulSync, error: row.error, connected: false });
  });
  app.post("/api/clients/:id/calendar/sync", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return;
    if ((await getRequestUser(req))?.role !== "owner") return fail(res, 403, "Only the owner can synchronize the shared Google Calendar connector");
    const connection = (await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, clientId)))[0];
    if (!connection) return fail(res, 409, "Calendar is not configured");
    try {
      const calendar = await getGoogleCalendarClient(); const now = new Date(); const from = new Date(now); from.setDate(from.getDate() - 30); const to = new Date(now); to.setDate(to.getDate() + 180);
      let pageToken: string | undefined;
      do {
        const result = await calendar.events.list({ calendarId: connection.calendarId, timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, showDeleted: true, orderBy: "startTime", maxResults: 250, pageToken });
        for (const e of result.data.items || []) {
        if (!e.id) continue;
        const syncKey = `${connection.calendarId}:${e.id}`;
        if (e.status === "cancelled") {
          await db.delete(calendarEntries).where(and(eq(calendarEntries.clientId, clientId), eq(calendarEntries.googleSyncKey, syncKey)));
          continue;
        }
        const start = e.start?.dateTime || e.start?.date; const end = e.end?.dateTime || e.end?.date; const eventDate = validDate(start); if (!eventDate) continue;
        const data: any = { clientId, title: e.summary || "(untitled)", eventDate, endDate: validDate(end), timezone: e.start?.timeZone || "UTC", eventLink: e.htmlLink || null, description: e.description || null, attendeeEmails: (e.attendees || []).map(a => a.email).filter(Boolean), googleEventId: e.id, googleCalendarId: connection.calendarId, googleSyncKey: `${connection.calendarId}:${e.id}` };
        await db.insert(calendarEntries).values(data).onConflictDoUpdate({ target: [calendarEntries.clientId, calendarEntries.googleSyncKey], set: { ...data, updatedAt: new Date() } });
        }
        pageToken = result.data.nextPageToken || undefined;
      } while (pageToken);
      await db.update(clientCalendarConnections).set({ lastSuccessfulSync: new Date(), error: null }).where(eq(clientCalendarConnections.clientId, clientId)); res.json({ success: true, lastSuccessfulSync: new Date() });
    } catch (e: any) { const message = e?.message || "Google Calendar is not connected"; await db.update(clientCalendarConnections).set({ error: message }).where(eq(clientCalendarConnections.clientId, clientId)); fail(res, 502, message); }
  });

  app.get("/api/clients/:id/sales/sources", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return;
    const rows = await db.select().from(salesSources).where(eq(salesSources.clientId, clientId)); res.json(rows.map(({ processor, configured, verified, lastSync, error }) => ({ processor, configured, verified, lastSync, error })));
  });
  app.post("/api/clients/:id/sales/sources", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return; if (!admin(await getRequestUser(req))) return fail(res, 403, "Admin access required");
    const parsed = z.object({ processor: z.string().trim().min(1).max(80) }).safeParse(req.body); if (!parsed.success) return fail(res, 400, "Valid processor required");
    const row = (await db.insert(salesSources).values({ clientId, processor: parsed.data.processor, configured: false, verified: false }).onConflictDoUpdate({ target: [salesSources.clientId, salesSources.processor], set: { configured: false, verified: false, error: null } }).returning())[0];
    res.status(201).json({ processor: row.processor, configured: row.configured, verified: row.verified, lastSync: row.lastSync, error: row.error });
  });
  app.post("/api/clients/:id/sales/import", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return; if (!admin(await getRequestUser(req))) return fail(res, 403, "Admin access required");
    const rowSchema = z.object({ amount: z.coerce.number().finite().min(0), saleDate: z.string().optional(), productName: z.string().max(500).optional(), customerEmail: z.string().email().optional(), customerName: z.string().max(300).optional(), source: z.string().trim().min(1).max(80), externalId: z.string().trim().min(1).max(300).optional(), status: z.enum(["paid", "completed", "refunded", "failed", "pending"]).default("paid"), currency: z.string().toUpperCase().pipe(z.literal("USD")).default("USD"), reference: z.string().max(300).optional(), refundAmount: z.coerce.number().min(0).default(0), dedupeKey: z.string().trim().min(1).max(500).optional(), eventPerformanceId: z.coerce.number().int().positive().optional() }).superRefine((t, ctx) => { if (!t.externalId && !t.dedupeKey) ctx.addIssue({ code: "custom", message: "externalId or dedupeKey is required", path: ["dedupeKey"] }); if (t.saleDate && !validDate(t.saleDate)) ctx.addIssue({ code: "custom", message: "Invalid saleDate", path: ["saleDate"] }); });
    if (!Array.isArray(req.body?.transactions) || req.body.transactions.length > 1000) return fail(res, 400, "transactions must be an array of at most 1000 rows");
    const parsed = z.array(rowSchema).safeParse(req.body.transactions); if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    try {
      const attributionIds = Array.from(new Set(parsed.data.map((t: any) => t.eventPerformanceId).filter(Boolean)));
      if (attributionIds.length) {
        const found = await db.select({ id: eventPerformance.id }).from(eventPerformance).where(and(eq(eventPerformance.clientId, clientId), sql`${eventPerformance.id} IN (${sql.join(attributionIds.map(id => sql`${id}`), sql`, `)})`));
        if (found.length !== attributionIds.length) return fail(res, 400, "eventPerformanceId must belong to this client");
      }
      const rows: any[] = [];
      await db.transaction(async tx => {
        for (const t of parsed.data) {
          const status = t.status === "completed" ? "paid" : t.status;
          const dedupeKey = t.dedupeKey || `${t.source}:${t.externalId}`;
          const value: any = { clientId, amount: t.amount, saleDate: t.saleDate ? validDate(t.saleDate) : new Date(), productName: t.productName, customerEmail: t.customerEmail, customerName: t.customerName, source: t.source, externalId: t.externalId, status, currency: t.currency.toUpperCase(), reference: t.reference, eventPerformanceId: t.eventPerformanceId, dedupeKey, metadata: { refundAmount: t.refundAmount } };
          const result = await tx.insert(sales).values(value).onConflictDoUpdate({ target: [sales.clientId, sales.dedupeKey], set: value }).returning();
          rows.push(result[0]);
        }
        for (const processor of Array.from(new Set(parsed.data.map(t => t.source)))) {
          await tx.insert(salesSources).values({ clientId, processor, configured: false, verified: false }).onConflictDoNothing();
        }
      });
      res.status(201).json({ imported: rows.length, sales: rows });
    } catch { fail(res, 400, "Failed to import transactions"); }
  });

  app.get("/api/clients/:id/portal-summary", isAuthenticated, async (req: any, res) => {
    const clientId = idOf(req.params.id); if (!(await guard(req, res, clientId))) return;
    const start = req.query.startDate ? validDate(req.query.startDate) : new Date(Date.now() - 30 * 86400000); const end = req.query.endDate ? validDate(req.query.endDate) : new Date(); if (!start || !end || start > end || end.getTime() - start.getTime() > 366 * 86400000) return fail(res, 400, "Select a valid range of at most one year");
    const period = and(eq(sales.clientId, clientId), gte(sales.saleDate, start), lte(sales.saleDate, end));
    const [saleRows, upcoming, events, conn, sources, client] = await Promise.all([db.select().from(sales).where(period).orderBy(desc(sales.saleDate)), db.select().from(calendarEntries).where(and(eq(calendarEntries.clientId, clientId), gte(calendarEntries.eventDate, new Date()))).orderBy(asc(calendarEntries.eventDate)).limit(10), db.select().from(eventPerformance).where(eq(eventPerformance.clientId, clientId)).orderBy(desc(eventPerformance.startDate)).limit(10), db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, clientId)), db.select().from(salesSources).where(eq(salesSources.clientId, clientId)), db.select({ googleDriveFolderId: clients.googleDriveFolderId }).from(clients).where(eq(clients.id, clientId))]);
    const revenue = saleRows.reduce((n, s) => n + netSaleContribution(s), 0);
    const trend: Record<string, number> = {}; saleRows.forEach(s => { const contribution = netSaleContribution(s); if (contribution) { const d = s.saleDate.toISOString().slice(0, 10); trend[d] = (trend[d] || 0) + contribution; } });
    const folderId = client[0]?.googleDriveFolderId;
    res.json({ saleCount: saleRows.length, netRevenue: revenue, revenueTrend: Object.entries(trend).map(([date, netRevenue]) => ({ date, netRevenue })), recentSales: saleRows.slice(0, 10), upcomingCalendar: upcoming, recentEvents: events, driveUrl: folderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}` : null, configuredSources: sources.map(s => ({ processor: s.processor, configured: s.configured, verified: s.verified, lastSync: s.lastSync, error: s.error })), calendarStatus: conn[0] ? { lastSuccessfulSync: conn[0].lastSuccessfulSync, error: conn[0].error, connected: !!conn[0].lastSuccessfulSync && !conn[0].error } : { lastSuccessfulSync: null, error: "not configured", connected: false } });
  });

  app.get("/api/clients/:id/projections", isAuthenticated, async (req: any, res) => { const c = idOf(req.params.id); if (!(await guard(req, res, c))) return; res.json(await db.select().from(projections).where(eq(projections.clientId, c)).orderBy(desc(projections.createdAt))); });
  app.post("/api/clients/:id/projections", isAuthenticated, async (req: any, res) => { const c = idOf(req.params.id); if (!(await guard(req, res, c))) return; const p = projectionInput.safeParse(req.body); if (!p.success) return fail(res, 400, p.error.issues[0].message); res.status(201).json((await db.insert(projections).values({ ...p.data, clientId: c } as any).returning())[0]); });
  app.patch("/api/projections/:id", isAuthenticated, async (req: any, res) => { const old = (await db.select().from(projections).where(eq(projections.id, idOf(req.params.id))))[0]; if (!old) return fail(res, 404, "Projection not found"); if (!(await guard(req, res, old.clientId))) return; const p = projectionInput.partial().safeParse(req.body); if (!p.success) return fail(res, 400, p.error.issues[0].message); res.json((await db.update(projections).set(p.data as any).where(eq(projections.id, old.id)).returning())[0]); });
  app.delete("/api/projections/:id", isAuthenticated, async (req: any, res) => { const old = (await db.select().from(projections).where(eq(projections.id, idOf(req.params.id))))[0]; if (!old) return fail(res, 404, "Projection not found"); if (!(await guard(req, res, old.clientId))) return; await db.delete(projections).where(eq(projections.id, old.id)); res.json({ success: true }); });
}