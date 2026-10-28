import { and, eq, gte, isNotNull, like, lte, notInArray } from "drizzle-orm";
import { db } from "./storage";
import { describeGoogleCalendarError, getGoogleCalendarClient, isGoogleCalendarConfigured } from "./googleCalendar";
import { calendarEntries, clientCalendarConnections } from "@shared/schema";

// Pulls a client's Google Calendar into their Marketing Calendar: from 30 days ago to 180 days
// ahead. Events changed in Google are updated here, and events deleted in Google are removed.
const DAYS_BACK = 30;
const DAYS_AHEAD = 180;
// How old a sync can be before viewing the calendar triggers a fresh one.
export const CALENDAR_STALE_MS = 5 * 60 * 1000;

const validDate = (s: any) => { if (!s) return undefined; const d = new Date(s); return Number.isNaN(d.getTime()) ? undefined : d; };

type CalendarClient = Pick<Awaited<ReturnType<typeof getGoogleCalendarClient>>, "events">;

// `client` is only passed by tests; normally EventHQ's Google client is used.
export async function syncClientCalendar(clientId: number, client?: CalendarClient): Promise<{ synced: number; removed: number }> {
  const connection = (await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, clientId)))[0];
  if (!connection) throw new Error("Calendar is not configured");
  const calendarId = connection.calendarId;
  try {
    const calendar = client ?? await getGoogleCalendarClient();
    const from = new Date(); from.setDate(from.getDate() - DAYS_BACK);
    const to = new Date(); to.setDate(to.getDate() + DAYS_AHEAD);
    const seen: string[] = [];
    let synced = 0;
    let pageToken: string | undefined;
    do {
      const result = await calendar.events.list({
        calendarId, timeMin: from.toISOString(), timeMax: to.toISOString(),
        singleEvents: true, showDeleted: false, orderBy: "startTime", maxResults: 250, pageToken,
      });
      for (const e of result.data.items || []) {
        if (!e.id || e.status === "cancelled") continue;
        const eventDate = validDate(e.start?.dateTime || e.start?.date);
        if (!eventDate) continue;
        const syncKey = `${calendarId}:${e.id}`;
        seen.push(syncKey);
        const data = {
          clientId, title: e.summary || "(untitled)", eventDate, endDate: validDate(e.end?.dateTime || e.end?.date) ?? null,
          timezone: e.start?.timeZone || "UTC", eventLink: e.htmlLink || null, description: e.description || null,
          attendeeEmails: (e.attendees || []).map(a => a.email).filter((x): x is string => !!x),
          googleEventId: e.id, googleCalendarId: calendarId, googleSyncKey: syncKey,
        };
        await db.insert(calendarEntries).values(data)
          .onConflictDoUpdate({ target: [calendarEntries.clientId, calendarEntries.googleSyncKey], set: { ...data, updatedAt: new Date() } });
        synced++;
      }
      pageToken = result.data.nextPageToken || undefined;
    } while (pageToken);

    // Anything from this calendar in the synced window that Google no longer has was deleted there.
    const gone = await db.delete(calendarEntries).where(and(
      eq(calendarEntries.clientId, clientId),
      eq(calendarEntries.googleCalendarId, calendarId),
      isNotNull(calendarEntries.googleSyncKey),
      like(calendarEntries.googleSyncKey, `${calendarId.replace(/[\\%_]/g, "\\$&")}:%`),
      gte(calendarEntries.eventDate, from), lte(calendarEntries.eventDate, to),
      ...(seen.length ? [notInArray(calendarEntries.googleSyncKey, seen)] : []),
    )).returning({ id: calendarEntries.id });

    await db.update(clientCalendarConnections).set({ lastSuccessfulSync: new Date(), error: null })
      .where(eq(clientCalendarConnections.clientId, clientId));
    return { synced, removed: gone.length };
  } catch (error: any) {
    const message = error?.message === "Calendar is not configured" ? error.message : describeGoogleCalendarError(error);
    await db.update(clientCalendarConnections).set({ error: message }).where(eq(clientCalendarConnections.clientId, clientId));
    throw new Error(message);
  }
}

// Throttles automatic syncs per client within one server instance, so a failing calendar
// isn't retried on every page load.
const lastAttempt = new Map<number, number>();

// Syncs before the calendar is shown when the last sync is older than CALENDAR_STALE_MS.
// Never throws: on failure the error is stored on the connection and the saved entries are shown.
export async function refreshCalendarIfStale(clientId: number, timeoutMs = 8000): Promise<void> {
  if (!isGoogleCalendarConfigured()) return;
  try {
    const connection = (await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, clientId)))[0];
    if (!connection) return;
    const now = Date.now();
    if (connection.lastSuccessfulSync && now - new Date(connection.lastSuccessfulSync).getTime() < CALENDAR_STALE_MS) return;
    if (now - (lastAttempt.get(clientId) ?? 0) < CALENDAR_STALE_MS) return;
    lastAttempt.set(clientId, now);
    await Promise.race([
      syncClientCalendar(clientId),
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (error) {
    console.error(`Calendar auto-sync failed for client ${clientId}:`, (error as Error)?.message);
  }
}
