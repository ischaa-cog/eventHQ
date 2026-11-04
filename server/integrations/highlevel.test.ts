import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { agencies, clients, integrationConnections, optIns } from "@shared/schema";
import { db } from "../storage";
import { saveConnection, getConnection } from "./connections";
import { parseHighLevelCursor, syncConnection } from "./sync";

process.env.SESSION_SECRET ||= "test-session-secret";

test("HighLevel cursor reads both the old day format and mid-day resume points", () => {
  assert.deepEqual(parseHighLevelCursor("1790000000000"), { day: 1790000000000 });
  assert.deepEqual(parseHighLevelCursor(JSON.stringify({ day: 1790000000000, page: 7 })), { day: 1790000000000, page: 7 });
  assert.equal(parseHighLevelCursor("nonsense"), null);
  assert.equal(parseHighLevelCursor(null), null);
});

test("a busy HighLevel day is read in full and a cut-off run resumes at the same page", async () => {
  const marker = randomUUID();
  const [agency] = await db.insert(agencies).values({ name: `hl-${marker}` }).returning();
  const [client] = await db.insert(clients).values({ name: `hl-${marker}`, agencyId: agency.id }).returning();
  try {
    const busyDay = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10);
    const PAGES = 150; // 15,000 submissions in one day: more than the old 10,000 cap
    let calls = 0;
    const fake = (async (input: any) => {
      calls++;
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page"));
      const busy = url.searchParams.get("startAt") === busyDay;
      const count = busy ? (page <= PAGES ? 100 : 0) : 0;
      const submissions = Array.from({ length: count }, (_, i) => ({
        id: `${marker}-${page}-${i}`, createdAt: `${busyDay}T12:00:00Z`, email: `a${page}x${i}@x.com`,
        others: { eventData: { url_params: {}, page: { url: "https://summit.example.com/join" } } },
      }));
      return new Response(JSON.stringify({ submissions, meta: { nextPage: busy && page < PAGES ? page + 1 : null } }), { status: 200 });
    }) as typeof fetch;
    let row = await saveConnection({ clientId: client.id, provider: "highlevel", externalAccountId: "loc-1", credentials: { apiKey: "pit-test" } });
    // First run stops partway through the busy day.
    let stopAfter = 60;
    const cutoff = (async (input: any, init?: any) => { if (--stopAfter < 0) throw Object.assign(new Error("cut off"), { cut: true }); return fake(input, init); }) as typeof fetch;
    await syncConnection(row, { days: 3, fetchImpl: cutoff }).catch(() => undefined);
    const midway = await getConnection(row.id);
    const cur = parseHighLevelCursor(midway!.lastSyncCursor);
    assert.ok(cur?.page && cur.page > 1, "saved a mid-day resume point");
    const count = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(optIns).where(eq(optIns.connectionId, row.id)))[0].n;
    const partial = await count();
    assert.ok(partial > 0, "pages read before the cut-off were saved");
    // Second run resumes and finishes the day.
    await db.update(integrationConnections).set({ status: "active", lastError: null }).where(eq(integrationConnections.id, row.id));
    row = (await getConnection(row.id))!;
    const r = await syncConnection(row, { days: 3, fetchImpl: fake });
    assert.equal(r.complete, true);
    assert.equal(await count(), PAGES * 100, "every submission of the busy day is stored, once");
    assert.ok(calls > PAGES);
  } finally {
    await db.delete(clients).where(eq(clients.id, client.id));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
