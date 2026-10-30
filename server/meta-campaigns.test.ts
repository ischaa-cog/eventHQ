import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { activityLog, agencies, clients, metaAdCampaigns, users, vaultAssets } from "@shared/schema";
import { breakdownByGoal, parseMetaCampaignsCsv, resultLabel } from "@shared/meta-campaigns";
import { db } from "./storage";
import { registerApiRoutes } from "./routes";

// Made-up campaigns laid out exactly like an Ads Manager campaigns export.
const EXPORT = `"Reporting starts","Reporting ends","Campaign name","Campaign delivery","Attribution setting",Results,"Result indicator","Cost per results","Ad set budget","Ad set budget type","Amount spent (USD)",Impressions,Reach,Ends,"Results (initial)","Results (initial) indicator"
2025-01-01,2025-12-31,"Sample Course Sales",inactive,"7-day click or 1-day view",120,actions:offsite_conversion.fb_pixel_purchase,41.5,"Using ad set budget",0,4980.00,412000,96000,Ongoing,,
2025-01-01,2025-12-31,sample_launch_|_traffic,inactive,"7-day click or 1-day view",2500,actions:omni_landing_page_view,0.3,"Using ad set budget",0,750.00,98000,51000,2025-03-15,,
2025-01-01,2025-12-31,"Sample Summit Registrations",completed,"7-day click, 1-day view, or 1-day engaged-view",3000,actions:offsite_conversion.fb_pixel_complete_registration,1.25,5000,Lifetime,3750.00,300000,120000,2025-06-30,,
`;

test("reads a Meta Ads Manager campaigns export", () => {
  const { rows, errors } = parseMetaCampaignsCsv(EXPORT);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    campaignName: "Sample Course Sales", delivery: "inactive", resultType: "actions:offsite_conversion.fb_pixel_purchase",
    results: 120, costPerResult: 41.5, amountSpent: 4980, impressions: 412000, reach: 96000,
    budget: null, budgetType: null, endsOn: null, reportingStart: "2025-01-01", reportingEnd: "2025-12-31",
    attribution: "7-day click or 1-day view",
  });
  assert.equal(rows[2].budget, 5000);
  assert.equal(rows[2].budgetType, "Lifetime");
  assert.equal(rows[2].amountSpent, 3750);
  assert.equal(rows[2].endsOn, "2025-06-30");
  assert.equal(resultLabel(rows[0].resultType), "Purchases");
  assert.equal(resultLabel(rows[1].resultType), "Landing page views");
  assert.equal(resultLabel(rows[2].resultType), "Registrations");
  assert.match(parseMetaCampaignsCsv("title,url\nx,y").errors[0].message, /Meta Ads Manager/);
});

test("groups campaign stats by goal", () => {
  const goals = breakdownByGoal(parseMetaCampaignsCsv(EXPORT).rows);
  assert.deepEqual(goals.map(g => [g.goal, g.campaigns, g.spent, g.results]), [
    ["Purchases", 1, 4980, 120], ["Registrations", 1, 3750, 3000], ["Landing page views", 1, 750, 2500],
  ]);
  assert.equal(goals[0].costPerResult, 41.5);
  assert.equal(goals.reduce((sum, g) => sum + g.shareOfSpend, 0).toFixed(6), "1.000000");
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
    const newer = EXPORT.replace("4980.00", "5200.00");
    assert.equal((await request(admin, `${path}/import`, "POST", { csv: newer })).status, 200);
    const listed = await request(portal, path);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 3);
    assert.equal(listed.body[0].campaignName, "Sample Course Sales");
    assert.equal(listed.body[0].amountSpent, "5200.00");
    assert.equal((await request(rep, path)).status, 200);
    assert.equal((await request(outsider, path)).status, 403);

    // Without the campaigns table (the live database today), imports go to the Upload Vault and are read back from there.
    await db.execute(sql`ALTER TABLE meta_ad_campaigns RENAME TO meta_ad_campaigns_hidden`);
    try {
      const otherPath = `/api/clients/${other.id}/meta-campaigns`;
      assert.deepEqual((await request(admin, otherPath)).body, []);
      assert.equal((await request(admin, `${otherPath}/import`, "POST", { csv: EXPORT })).body.importedCampaigns, 3);
      const fromVault = await request(outsider, otherPath);
      assert.equal(fromVault.status, 200);
      assert.deepEqual(fromVault.body.map((c: any) => [c.campaignName, c.amountSpent]), [
        ["Sample Course Sales", "4980.00"], ["Sample Summit Registrations", "3750.00"], ["sample_launch_|_traffic", "750.00"],
      ]);
    } finally {
      await db.execute(sql`ALTER TABLE meta_ad_campaigns_hidden RENAME TO meta_ad_campaigns`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (userIds.length) await db.delete(activityLog).where(inArray(activityLog.userId, userIds));
    await db.delete(metaAdCampaigns).where(inArray(metaAdCampaigns.clientId, [client.id, other.id]));
    await db.delete(vaultAssets).where(inArray(vaultAssets.clientId, [client.id, other.id]));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(clients).where(inArray(clients.id, [client.id, other.id]));
    await db.delete(agencies).where(eq(agencies.id, agency.id));
  }
});
