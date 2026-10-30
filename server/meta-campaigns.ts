import type { Express } from "express";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { isAuthenticated } from "./auth";
import { db } from "./storage";
import { hasFullAccess } from "@shared/roles";
import { metaAdCampaigns, vaultAssets, type MetaAdCampaign, type User } from "@shared/schema";
import { parseMetaCampaignsCsv } from "@shared/meta-campaigns";

// Until the meta_ad_campaigns table exists in the live database, an export is kept in the workspace's
// staff-only Upload Vault under this name, and the campaigns are read from the newest one.
export const VAULT_EXPORT_NAME = "Meta Ads campaigns export";
const missingTable = (error: any) => (error?.code ?? error?.cause?.code) === "42P01";

export function campaignsFromExport(clientId: number, csv: string, savedAt: Date): MetaAdCampaign[] {
  const byName = new Map(parseMetaCampaignsCsv(csv).rows.map(row => [row.campaignName, row]));
  return Array.from(byName.values())
    .map((row, index) => ({
      id: -(index + 1), clientId, ...row,
      costPerResult: row.costPerResult === null ? null : row.costPerResult.toFixed(4),
      amountSpent: row.amountSpent.toFixed(2),
      budget: row.budget === null ? null : row.budget.toFixed(2),
      updatedAt: savedAt,
    }))
    .sort((a, b) => Number(b.amountSpent) - Number(a.amountSpent));
}

async function campaignsFromVault(clientId: number): Promise<MetaAdCampaign[]> {
  const [saved] = await db.select().from(vaultAssets)
    .where(and(eq(vaultAssets.clientId, clientId), ilike(vaultAssets.name, `${VAULT_EXPORT_NAME}%`)))
    .orderBy(desc(vaultAssets.createdAt), desc(vaultAssets.id)).limit(1);
  return saved?.content ? campaignsFromExport(clientId, saved.content, saved.createdAt) : [];
}

// Meta ad campaign totals per workspace. Everyone with access to the workspace (the client included)
// can read them; only admins import a new Ads Manager export.
export function registerMetaCampaignRoutes(
  app: Express,
  getRequestUser: (req: any) => Promise<User | undefined>,
  canAccessClient: (user: User | undefined, clientId: number) => Promise<boolean>,
) {
  app.get("/api/clients/:clientId/meta-campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const clientId = Number(req.params.clientId);
      const user = await getRequestUser(req);
      if (!Number.isSafeInteger(clientId) || !await canAccessClient(user, clientId)) return res.status(403).json({ error: "Forbidden" });
      try {
        res.json(await db.select().from(metaAdCampaigns)
          .where(eq(metaAdCampaigns.clientId, clientId))
          .orderBy(desc(metaAdCampaigns.amountSpent)));
      } catch (error) {
        if (!missingTable(error)) throw error;
        res.json(await campaignsFromVault(clientId));
      }
    } catch (error) {
      console.error("Error loading Meta campaigns:", error);
      res.status(500).json({ error: "Could not load ad campaigns." });
    }
  });

  app.post("/api/clients/:clientId/meta-campaigns/import", isAuthenticated, async (req: any, res) => {
    try {
      const clientId = Number(req.params.clientId);
      const user = await getRequestUser(req);
      if (!hasFullAccess(user) || !Number.isSafeInteger(clientId) || !await canAccessClient(user, clientId)) {
        return res.status(403).json({ error: "Only admins can import ad campaigns." });
      }
      if (typeof req.body?.csv !== "string" || !req.body.csv.trim()) return res.status(400).json({ error: "Choose a CSV file to import." });
      const { rows, errors } = parseMetaCampaignsCsv(req.body.csv);
      if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
      if (!rows.length) return res.status(400).json({ error: "The file has no campaigns." });

      // A campaign listed twice keeps its last row, so one insert never touches the same campaign twice.
      const byName = new Map(rows.map(row => [row.campaignName, row]));
      const values = Array.from(byName.values()).map(row => ({
        clientId,
        campaignName: row.campaignName,
        delivery: row.delivery,
        resultType: row.resultType,
        results: row.results,
        costPerResult: row.costPerResult === null ? null : row.costPerResult.toFixed(4),
        amountSpent: row.amountSpent.toFixed(2),
        impressions: row.impressions,
        reach: row.reach,
        budget: row.budget === null ? null : row.budget.toFixed(2),
        budgetType: row.budgetType,
        endsOn: row.endsOn,
        reportingStart: row.reportingStart,
        reportingEnd: row.reportingEnd,
        attribution: row.attribution,
        updatedAt: new Date(),
      }));
      const excluded = (column: string) => sql.raw(`excluded.${column}`);
      try {
        await db.insert(metaAdCampaigns).values(values).onConflictDoUpdate({
          target: [metaAdCampaigns.clientId, metaAdCampaigns.campaignName],
          set: {
            delivery: excluded("delivery"), resultType: excluded("result_type"), results: excluded("results"),
            costPerResult: excluded("cost_per_result"), amountSpent: excluded("amount_spent"), impressions: excluded("impressions"),
            reach: excluded("reach"), budget: excluded("budget"), budgetType: excluded("budget_type"), endsOn: excluded("ends_on"),
            reportingStart: excluded("reporting_start"), reportingEnd: excluded("reporting_end"), attribution: excluded("attribution"),
            updatedAt: excluded("updated_at"),
          },
        });
      } catch (error) {
        if (!missingTable(error)) throw error;
        // No campaigns table yet: keep the export in the staff-only Upload Vault instead.
        await db.insert(vaultAssets).values({ clientId, name: VAULT_EXPORT_NAME, fileType: "csv", content: req.body.csv });
      }
      res.json({ importedCampaigns: values.length });
    } catch (error) {
      console.error("Error importing Meta campaigns:", error);
      res.status(500).json({ error: "Could not import the campaigns. Please try again." });
    }
  });
}
