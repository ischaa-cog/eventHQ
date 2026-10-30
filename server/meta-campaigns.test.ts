import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { activityLog, agencies, clients, metaAdCampaigns, users } from "@shared/schema";
import { parseMetaCampaignsCsv, resultLabel } from "@shared/meta-campaigns";
import { db } from "./storage";
import { registerApiRoutes } from "./routes";

// Rows copied from a real Ads Manager export.
const EXPORT = `"Reporting starts","Reporting ends","Campaign name","Campaign delivery","Attribution setting",Results,"Result indicator","Cost per results","Ad set budget","Ad set budget type","Amount spent (USD)",Impressions,Reach,Ends,"Results (initial)","Results (initial) indicator"
2023-09-30,2026-10-30,"AR_Bible U",inactive,"7-day click or 1-day view",155,actions:offsite_conversion.fb_pixel_purchase,149.17922581,"Using ad set budget",0,23122.78,2071147,328646,Ongoing,,
2023-09-30,2026-10-30,ar_elevate_|_traffic,inactive,"7-day click or 1-day view",3407,actions:omni_landing_page_view,0.26899031,"Using ad set budget",0,916.45,145066,71954,2024-02-02,,
2023-09-30,2026-10-30,"Art of Elevation April 2026",completed,"7-day click, 1-day view, or 1-day engaged-view",8462,actions:offsite_conversion.fb_pixel_complete_registration,1.17831127,10000,Lifetime,9970.87,800017,268512,2026-04-28,,
`;

test("reads a Meta Ads Manager campaigns export", () => {
  const { rows, errors } = parseMetaCampaignsCsv(EXPORT);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    campaignName: "AR_Bible U", delivery: "inactive", resultType: "actions:offsite_conversion.fb_pixel_purchase",
    results: 155, costPerResult: 149.17922581, amountSpent: 23122.78, impressions: 2071147, reach: 328646,
    budget: null, budgetType: null, endsOn: null, reportingStart: "2023-09-30", reportingEnd: "2026-10-30",
    attribution: "7-day click or 1-day view",
  });
  assert.equal(rows[2].budget, 10000);
  assert.equal(rows[2].budgetType, "Lifetime");
  assert.equal(rows[2].amountSpent, 9970.87);
  assert.equal(rows[2].endsOn, "2026-04-28");
  assert.equal(resultLabel(rows[0].resultType), "Purchases");
  assert.equal(resultLabel(rows[1].resultType), "Landing page views");
  assert.equal(resultLabel(rows[2].resultType), "Registrations");
  assert.match(parseMetaCampaignsCsv("title,url\nx,y").errors[0].message, /Meta Ads Manager/);
});

test("admins import campaigns; the workspace's client and team can read them", async () => {
  const marker = randomUUID();
  const userIds: string[] = [];
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
  const request = async (user: string, path: string, method = "GET", body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method, headers: { "x-test-user": user, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const [agency] = await db.insert(agencies).values({ name: `meta-${marker}` }).returning();
  const [client] = await db.insert(clients).values({ name: `meta-${marker}`, agencyId: agency.id }).returning();
  const [other] = await db.insert(clients).values({ name: `meta-other-${marker}`, agencyId: agency.id }).returning();
  try {
    const admin = `meta-admin-${marker}`, rep = `meta-rep-${marker}`, portal = `meta-client-${marker}`, outsider = `meta-outsider-${marker}`;
    await db.insert(users).values([
      { id: admin, role: "agency_admin", agencyId: agency.id },
      { id: rep, role: "team_member", agencyId: agency.id, clientAccess: [client.id] },
      { id: portal, role: "agency_client", agencyId: agency.id, clientAccess: [client.id] },
      { id: outsider, role: "agency_client", agencyId: agency.id, clientAccess: [other.id] },
    ]);
    userIds.push(admin, rep, portal, outsider);
    const path = `/api/clients/${client.id}/meta-campaigns`;

    assert.equal((await request(rep, `${path}/import`, "POST", { csv: EXPORT })).status, 403);
    assert.equal((await request(portal, `${path}/import`, "POST", { csv: EXPORT })).status, 403);
    assert.equal((await request(admin, `${path}/import`, "POST", { csv: "title,url\nx,y" })).status, 400);
    const imported = await request(admin, `${path}/import`, "POST", { csv: EXPORT });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.importedCampaigns, 3);

    // A newer export updates the same campaigns instead of adding copies.
    const newer = EXPORT.replace("23122.78", "24000.00");
    assert.equal((await request(admin, `${path}/import`, "POST", { csv: newer })).status, 200);
    const listed = await request(portal, path);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 3);
    assert.equal(listed.body[0].campaignName, "AR_Bible U");
    assert.equal(listed.body[0].amountSpent, "24000.00");
    assert.equal((await request(rep, path)).status, 200);
    assert.equal((await request(outsider, path)).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (userIds.length) await db.delete(activityLog).where(inArray(activityLog.userId, userIds));
    await db.delete(metaAdCampaigns).where(inArray(metaAdCampaigns.clientId, [client.id, other.id]));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(clients).where(inArray(clients.id, [client.id, other.id]));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
