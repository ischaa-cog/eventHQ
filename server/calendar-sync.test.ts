import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { agencies, calendarEntries, clientCalendarConnections, clients } from "@shared/schema";
import { db } from "./storage";
import { syncClientCalendar } from "./calendar-sync";
import { normalizeCalendarId } from "./portal-routes";

const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
// A stand-in for Google's events.list that serves whatever events the test sets.
const fakeGoogle = (events: () => any[]) => ({
  events: { list: async () => ({ data: { items: events(), nextPageToken: null } }) },
}) as any;

test("normalizeCalendarId reads settings links by their path, not a leftover cid", () => {
  const coachK = "c_cdffbabf33431d1f84b2406c277ed03d5d6fdd3ad4bff28632528964b949c219@group.calendar.google.com";
  const other = "c_5b4b85b0980e7a6fc1b413262f41b0f784707b6768b08b5d1191bb40381ed14d@group.calendar.google.com";
  const b64 = (s: string) => Buffer.from(s).toString("base64").replace(/=+$/, "");
  assert.equal(normalizeCalendarId(`https://calendar.google.com/calendar/u/0/r/settings/calendar/${b64(coachK)}?cid=${b64(other)}`), coachK);
  assert.equal(normalizeCalendarId(`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(other)}&ctz=UTC`), other);
  assert.equal(normalizeCalendarId(other), other);
});

test("Google Calendar sync adds, updates and removes events, and leaves EventHQ-only items alone", async () => {
  const marker = randomUUID();
  const calendarId = `test-${marker}@group.calendar.google.com`;
  const [agency] = await db.insert(agencies).values({ name: `calendar-sync-${marker}` }).returning();
  const [client] = await db.insert(clients).values({ agencyId: agency.id, name: `calendar-sync-${marker}` }).returning();
  try {
    await db.insert(clientCalendarConnections).values({ clientId: client.id, calendarId });
    const [local] = await db.insert(calendarEntries).values({ clientId: client.id, title: "Only in EventHQ", eventDate: new Date(day(3)), timezone: "UTC" }).returning();

    let events: any[] = [
      { id: "launch", summary: "Launch day", start: { dateTime: day(5), timeZone: "America/New_York" }, end: { dateTime: day(5.1) } },
      { id: "webinar", summary: "Webinar", start: { date: day(10).slice(0, 10) }, end: { date: day(11).slice(0, 10) } },
    ];
    const google = fakeGoogle(() => events);
    const titles = async () => (await db.select().from(calendarEntries).where(eq(calendarEntries.clientId, client.id))).map(e => e.title).sort();

    assert.deepEqual(await syncClientCalendar(client.id, google), { synced: 2, removed: 0 });
    assert.deepEqual(await titles(), ["Launch day", "Only in EventHQ", "Webinar"]);

    // Syncing again doesn't duplicate anything.
    await syncClientCalendar(client.id, google);
    assert.deepEqual(await titles(), ["Launch day", "Only in EventHQ", "Webinar"]);

    // Renamed in Google, and the webinar deleted in Google.
    events = [{ ...events[0], summary: "Launch day (moved)" }];
    assert.deepEqual(await syncClientCalendar(client.id, google), { synced: 1, removed: 1 });
    assert.deepEqual(await titles(), ["Launch day (moved)", "Only in EventHQ"]);
    assert.ok((await db.select().from(calendarEntries).where(eq(calendarEntries.id, local.id))).length === 1);

    const [conn] = await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, client.id));
    assert.ok(conn.lastSuccessfulSync);
    assert.equal(conn.error, null);

    // A Google failure is saved on the connection for admins to see.
    const broken = { events: { list: async () => { throw Object.assign(new Error("Not Found"), { code: 404 }); } } } as any;
    await assert.rejects(syncClientCalendar(client.id, broken), /can't open this calendar/);
    const [failed] = await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, client.id));
    assert.match(failed.error || "", /can't open this calendar/);
  } finally {
    await db.delete(clients).where(eq(clients.id, client.id));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
