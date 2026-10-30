import type { Express, RequestHandler } from "express";
import { and, desc, eq, lt } from "drizzle-orm";
import { isAuthenticated } from "./auth";
import { db } from "./storage";
import { hasFullAccess } from "@shared/roles";
import {
  activityLog, calendarEntries, clients, eventPerformance, events, projections, trainingResources,
  users, vaultAssets, webinars, type User,
} from "@shared/schema";

// Records who changed what. Every successful change made by a signed-in user through one of the
// routes below gets a row; reads, sign-ins, Neo chats and lesson progress are not recorded.

type Lookup = "calendar" | "eventPerformance" | "event" | "vault" | "projection" | "lesson" | "webinar" | "user";
type Rule = { method: string; pattern: RegExp; action: string; lookup?: Lookup };

const ID = "(?<id>[^/]+)";
const CLIENT = "/api/clients/(?<client>\\d+)";
const rule = (method: string, path: string, action: string, lookup?: Lookup): Rule =>
  ({ method, pattern: new RegExp(`^${path}/?$`), action, lookup });

export const ACTIVITY_RULES: Rule[] = [
  rule("POST", "/api/clients", "Added client"),
  rule("PATCH", CLIENT, "Updated client profile"),
  rule("DELETE", CLIENT, "Deleted client"),
  rule("PATCH", `${CLIENT}/active-status`, "Changed client status"),
  rule("POST", `${CLIENT}/onboarding`, "Saved onboarding details"),

  rule("POST", `${CLIENT}/calendar`, "Added calendar item"),
  rule("PATCH", `/api/calendar/${ID}`, "Updated calendar item", "calendar"),
  rule("DELETE", `/api/calendar/${ID}`, "Deleted calendar item", "calendar"),
  rule("PATCH", `${CLIENT}/calendar/connection`, "Changed Google Calendar link"),
  rule("POST", `${CLIENT}/calendar/sync`, "Synced Google Calendar"),

  rule("POST", `${CLIENT}/event-performance`, "Added Event Tracker event"),
  rule("PATCH", `/api/event-performance/${ID}`, "Updated Event Tracker event", "eventPerformance"),
  rule("DELETE", `/api/event-performance/${ID}`, "Deleted Event Tracker event", "eventPerformance"),
  rule("POST", `${CLIENT}/webinar-goals`, "Set masterclass goals"),
  rule("PATCH", `${CLIENT}/webinar-goals`, "Updated masterclass goals"),
  rule("PATCH", `${CLIENT}/event-goals`, "Updated event goals"),
  rule("POST", `${CLIENT}/webinars`, "Added masterclass report"),
  rule("PATCH", `/api/webinars/${ID}`, "Updated masterclass report", "webinar"),
  rule("DELETE", `/api/webinars/${ID}`, "Deleted masterclass report", "webinar"),
  rule("POST", `${CLIENT}/events`, "Added event plan"),
  rule("PATCH", `/api/events/${ID}`, "Updated event plan", "event"),
  rule("PATCH", `/api/assets/${ID}`, "Updated asset"),

  rule("POST", `${CLIENT}/vault-assets`, "Added vault asset"),
  rule("DELETE", `/api/vault-assets/${ID}`, "Deleted vault asset", "vault"),
  rule("POST", `${CLIENT}/projections`, "Saved projection"),
  rule("PATCH", `/api/projections/${ID}`, "Updated projection", "projection"),
  rule("DELETE", `/api/projections/${ID}`, "Deleted projection", "projection"),

  rule("POST", `${CLIENT}/training/resources`, "Added lesson"),
  rule("POST", `${CLIENT}/training/resources/bulk`, "Bulk uploaded lessons"),
  rule("PATCH", `/api/training/resources/${ID}`, "Updated lesson", "lesson"),
  rule("DELETE", `/api/training/resources/${ID}`, "Deleted lesson", "lesson"),

  rule("POST", `${CLIENT}/sales/import`, "Imported sales"),
  rule("POST", `${CLIENT}/meta-campaigns/import`, "Imported Meta ad campaigns"),
  rule("POST", `${CLIENT}/sales/sources`, "Added sales source"),
  rule("POST", `${CLIENT}/regenerate-webhook-token`, "Regenerated HighLevel webhook"),
  rule("PATCH", `${CLIENT}/google-drive/folder`, "Changed Drive folder link"),
  rule("DELETE", `${CLIENT}/google-drive`, "Disconnected Google Drive"),
  rule("DELETE", `${CLIENT}/meta-ads`, "Disconnected Meta Ads"),

  rule("POST", `${CLIENT}/users`, "Added client login"),
  rule("PATCH", `${CLIENT}/users/${ID}/password`, "Reset client login password", "user"),
  rule("DELETE", `${CLIENT}/users/${ID}`, "Removed client login", "user"),
  rule("POST", "/api/users", "Added user"),
  rule("PATCH", `/api/users/${ID}/role`, "Changed user access", "user"),
  rule("PATCH", `/api/users/${ID}/password`, "Reset user password", "user"),
  rule("DELETE", `/api/users/${ID}`, "Removed user", "user"),

  rule("POST", "/api/notifications", "Sent notification"),
  rule("POST", "/api/agencies", "Added agency"),
  rule("PATCH", `/api/agencies/${ID}`, "Updated agency"),
  rule("DELETE", `/api/agencies/${ID}`, "Deleted agency"),
  rule("POST", "/api/asset-templates", "Added prompt template"),
  rule("PATCH", `/api/asset-templates/${ID}`, "Updated prompt template"),
  rule("DELETE", `/api/asset-templates/${ID}`, "Deleted prompt template"),
  rule("POST", "/api/neo/knowledge/documents", "Added Neo Knowledge document"),
  rule("PUT", `/api/neo/knowledge/documents/${ID}`, "Updated Neo Knowledge document"),
  rule("DELETE", `/api/neo/knowledge/${ID}`, "Deleted Neo Knowledge document"),
  rule("PUT", `/api/neo/knowledge/lessons/${ID}`, "Updated lesson transcript", "lesson"),
  rule("POST", `/api/neo/knowledge/lessons/${ID}/vimeo`, "Imported lesson transcript", "lesson"),
  rule("POST", "/api/neo/knowledge/embed", "Built Neo search index"),
];

export type ActivityMatch = { action: string; clientId?: number; id?: string; lookup?: Lookup };

export function matchActivity(method: string, path: string): ActivityMatch | undefined {
  for (const r of ACTIVITY_RULES) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(path);
    if (!m) continue;
    const client = m.groups?.client;
    return { action: r.action, clientId: client ? Number(client) : undefined, id: m.groups?.id, lookup: r.lookup };
  }
  return undefined;
}

type Found = { clientId?: number | null; item?: string | null };

// Read the record before the change, so a deleted item can still be named and tied to its client.
async function lookupRecord(lookup: Lookup, rawId: string): Promise<Found> {
  if (lookup === "user") {
    const [row] = await db.select({ item: users.email }).from(users).where(eq(users.id, rawId)).limit(1);
    return row ?? {};
  }
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) return {};
  const tables = {
    calendar: [calendarEntries, calendarEntries.title],
    eventPerformance: [eventPerformance, eventPerformance.title],
    event: [events, events.name],
    vault: [vaultAssets, vaultAssets.name],
    projection: [projections, projections.title],
    webinar: [webinars, webinars.title],
  } as const;
  if (lookup === "lesson") {
    const [row] = await db.select({ item: trainingResources.title }).from(trainingResources)
      .where(eq(trainingResources.id, id)).limit(1);
    return row ?? {};
  }
  const [table, title] = tables[lookup];
  const [row] = await db.select({ clientId: (table as any).clientId, item: title }).from(table as any)
    .where(eq((table as any).id, id)).limit(1);
  return row ?? {};
}

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : undefined;

function describeItem(found: Found, responseBody: any, requestBody: any): string | undefined {
  if (typeof responseBody?.created === "number") return `${responseBody.created} lesson${responseBody.created === 1 ? "" : "s"}`;
  if (typeof responseBody?.importedCampaigns === "number") return `${responseBody.importedCampaigns} campaign${responseBody.importedCampaigns === 1 ? "" : "s"}`;
  if (typeof responseBody?.imported === "number") return `${responseBody.imported} sale${responseBody.imported === 1 ? "" : "s"}`;
  return text(found.item) ?? text(responseBody?.title) ?? text(responseBody?.name) ?? text(responseBody?.email)
    ?? text(requestBody?.title) ?? text(requestBody?.subject) ?? text(requestBody?.name) ?? text(requestBody?.email);
}

const displayName = (user: User) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Unknown user";

export function activityLogger(getRequestUser: (req: any) => Promise<User | undefined>): RequestHandler {
  return async (req: any, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || !req.user?.claims?.sub) return next();
    const path = String(req.originalUrl || req.url).split("?")[0];
    const match = matchActivity(req.method, path);
    if (!match) return next();

    let found: Found = {};
    if (match.lookup && match.id) found = await lookupRecord(match.lookup, match.id).catch(() => ({}));
    // Name the client now, in case this request deletes it.
    const clientNameBefore = match.clientId ? await clientName(match.clientId).catch(() => undefined) : undefined;

    let responseBody: any;
    const json = res.json.bind(res);
    res.json = (body: any) => { responseBody = body; return json(body); };

    // Write the entry before the response finishes: serverless hosts may stop work once it is sent.
    const end = res.end.bind(res) as (...args: any[]) => any;
    let recorded = false;
    (res as any).end = (...args: any[]) => {
      if (recorded || res.statusCode >= 400) return end(...args);
      recorded = true;
      record().catch(error => console.error("[activity] could not record:", error)).finally(() => end(...args));
      return res;
    };

    async function record() {
      const user = await getRequestUser(req);
      if (!user) return;
      const clientId = match!.clientId ?? found.clientId ?? numberOrUndefined(responseBody?.clientId) ?? numberOrUndefined(req.body?.clientId);
      const name = clientNameBefore ?? (clientId ? await clientName(clientId) : undefined) ?? null;
      let item = describeItem(found, responseBody, req.body);
      if (item && item === name) item = undefined;
      // For edits, say which fields changed (never their values, which can include passwords).
      const fields = req.method === "PATCH" || req.method === "PUT" ? changedFields(req.body) : "";
      if (fields) item = item ? `${item} · ${fields}` : fields;
      await db.insert(activityLog).values({
        userId: user.id,
        userEmail: user.email,
        userName: displayName(user),
        userRole: user.role,
        clientId: clientId ?? null,
        clientName: name,
        action: match!.action,
        item: item ?? null,
        method: req.method,
        path,
      });
    }

    next();
  };
}

const UNLISTED_FIELDS = new Set(["id", "clientId", "agencyId", "createdAt", "updatedAt", "password", "newPassword"]);
export function changedFields(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const names = Object.keys(body).filter(key => !UNLISTED_FIELDS.has(key)).map(key => {
    const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  });
  return names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more` : names.join(", ");
}

async function clientName(id: number): Promise<string | undefined> {
  const [row] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, id)).limit(1);
  return row?.name;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

export function registerActivityRoutes(app: Express, getRequestUser: (req: any) => Promise<User | undefined>) {
  app.get("/api/activity", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!hasFullAccess(user)) return res.status(403).json({ error: "Only admins can view the activity log." });
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      const filters = [];
      const clientId = Number(req.query.clientId);
      if (Number.isSafeInteger(clientId) && clientId > 0) filters.push(eq(activityLog.clientId, clientId));
      if (typeof req.query.userId === "string" && req.query.userId) filters.push(eq(activityLog.userId, req.query.userId));
      const before = Number(req.query.before);
      if (Number.isSafeInteger(before) && before > 0) filters.push(lt(activityLog.id, before));
      const entries = await db.select().from(activityLog)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(activityLog.id)).limit(limit);
      const people = await db.selectDistinct({ userId: activityLog.userId, userName: activityLog.userName, userEmail: activityLog.userEmail })
        .from(activityLog).orderBy(activityLog.userName);
      res.json({ entries, people, hasMore: entries.length === limit });
    } catch (error) {
      console.error("[activity] could not load:", error);
      res.status(500).json({ error: "Could not load the activity log." });
    }
  });
}
