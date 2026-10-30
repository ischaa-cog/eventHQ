import { splitCsv } from "./training-bulk";

// Reads a Meta Ads Manager "Campaigns" CSV export (File → Export table data → CSV).

export type MetaCampaignRow = {
  campaignName: string;
  delivery: string | null;
  resultType: string | null;
  results: number | null;
  costPerResult: number | null;
  amountSpent: number;
  impressions: number | null;
  reach: number | null;
  budget: number | null;
  budgetType: string | null;
  endsOn: string | null; // YYYY-MM-DD, or null when ongoing
  reportingStart: string | null;
  reportingEnd: string | null;
  attribution: string | null;
};
export type MetaCampaignParse = { rows: MetaCampaignRow[]; errors: { line: number; message: string }[] };

export const META_CAMPAIGNS_MAX_ROWS = 1000;

const COLUMNS: Record<string, keyof MetaCampaignRow> = {
  "campaign name": "campaignName",
  "campaign delivery": "delivery",
  "result indicator": "resultType",
  results: "results",
  "cost per results": "costPerResult",
  "cost per result": "costPerResult",
  "amount spent (usd)": "amountSpent",
  "amount spent": "amountSpent",
  impressions: "impressions",
  reach: "reach",
  "ad set budget": "budget",
  "campaign budget": "budget",
  "ad set budget type": "budgetType",
  "campaign budget type": "budgetType",
  ends: "endsOn",
  "reporting starts": "reportingStart",
  "reporting ends": "reportingEnd",
  "attribution setting": "attribution",
};

const RESULT_LABELS: [RegExp, string][] = [
  [/purchase/, "Purchases"],
  [/complete_registration|lead/, "Registrations"],
  [/landing_page_view/, "Landing page views"],
  [/link_click/, "Link clicks"],
  [/post_engagement/, "Post engagements"],
  [/video_view|thruplay/, "Video views"],
  [/reach/, "People reached"],
];

/** A readable name for Meta's result indicator, e.g. "actions:offsite_conversion.fb_pixel_purchase" → "Purchases". */
export function resultLabel(indicator: string | null | undefined): string {
  if (!indicator) return "Results";
  return RESULT_LABELS.find(([pattern]) => pattern.test(indicator))?.[1] ?? "Results";
}

const number = (value: string) => {
  const cleaned = value.replace(/[$,\s]/g, "");
  return cleaned === "" ? null : Number(cleaned);
};
const isoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;

export function parseMetaCampaignsCsv(text: string): MetaCampaignParse {
  const errors: MetaCampaignParse["errors"] = [];
  const [header = [], ...body] = splitCsv(text.replace(/^﻿/, ""));
  const fields = header.map(name => COLUMNS[name.trim().toLowerCase()]);
  if (!fields.includes("campaignName") || !fields.includes("amountSpent")) {
    return { rows: [], errors: [{ line: 1, message: "This doesn't look like a Meta Ads Manager campaigns export. It needs \"Campaign name\" and \"Amount spent (USD)\" columns." }] };
  }
  const rows: MetaCampaignRow[] = [];
  body.forEach((cells, index) => {
    const line = index + 2;
    if (cells.every(cell => !cell.trim())) return;
    const raw: Partial<Record<keyof MetaCampaignRow, string>> = {};
    fields.forEach((field, column) => { if (field && raw[field] === undefined) raw[field] = (cells[column] ?? "").trim(); });
    const campaignName = raw.campaignName ?? "";
    if (!campaignName) { errors.push({ line, message: "Campaign name is missing." }); return; }
    const numbers = {
      results: number(raw.results ?? ""), costPerResult: number(raw.costPerResult ?? ""), amountSpent: number(raw.amountSpent ?? ""),
      impressions: number(raw.impressions ?? ""), reach: number(raw.reach ?? ""),
    };
    // When the budget is set on the ad sets, Meta writes "Using ad set budget" here and 0 as the type.
    const budget = number(raw.budget ?? "");
    const bad = Object.entries(numbers).find(([, value]) => value !== null && (!Number.isFinite(value) || value < 0));
    if (bad) { errors.push({ line, message: `${campaignName}: "${bad[0]}" is not a valid number.` }); return; }
    rows.push({
      campaignName: campaignName.slice(0, 500),
      delivery: raw.delivery || null,
      resultType: raw.resultType || null,
      results: numbers.results === null ? null : Math.round(numbers.results),
      costPerResult: numbers.costPerResult,
      amountSpent: numbers.amountSpent ?? 0,
      impressions: numbers.impressions === null ? null : Math.round(numbers.impressions),
      reach: numbers.reach === null ? null : Math.round(numbers.reach),
      budget: budget !== null && Number.isFinite(budget) && budget > 0 ? budget : null,
      budgetType: raw.budgetType && raw.budgetType !== "0" ? raw.budgetType : null,
      endsOn: isoDate(raw.endsOn ?? ""),
      reportingStart: isoDate(raw.reportingStart ?? ""),
      reportingEnd: isoDate(raw.reportingEnd ?? ""),
      attribution: raw.attribution || null,
    });
  });
  if (rows.length > META_CAMPAIGNS_MAX_ROWS) {
    errors.push({ line: 1, message: `Import at most ${META_CAMPAIGNS_MAX_ROWS} campaigns at a time.` });
  }
  return { rows, errors };
}

export type CampaignTotals = { spent: number; impressions: number; purchases: number; registrations: number };

/** Totals across campaigns; purchases and registrations add up the campaigns optimised for them. */
export function summarizeCampaigns(rows: { amountSpent: string | number; impressions: number | null; results: number | null; resultType: string | null }[]): CampaignTotals {
  const totals: CampaignTotals = { spent: 0, impressions: 0, purchases: 0, registrations: 0 };
  for (const row of rows) {
    totals.spent += Number(row.amountSpent) || 0;
    totals.impressions += row.impressions ?? 0;
    const label = resultLabel(row.resultType);
    if (label === "Purchases") totals.purchases += row.results ?? 0;
    if (label === "Registrations") totals.registrations += row.results ?? 0;
  }
  return totals;
}

export type GoalBreakdown = { goal: string; campaigns: number; spent: number; results: number; costPerResult: number | null; shareOfSpend: number };

/** Spend and results grouped by what each campaign was optimised for, biggest spend first. */
export function breakdownByGoal(rows: { amountSpent: string | number; results: number | null; resultType: string | null }[]): GoalBreakdown[] {
  const groups = new Map<string, { campaigns: number; spent: number; results: number }>();
  let total = 0;
  for (const row of rows) {
    const goal = resultLabel(row.resultType);
    const spent = Number(row.amountSpent) || 0;
    total += spent;
    const group = groups.get(goal) ?? { campaigns: 0, spent: 0, results: 0 };
    group.campaigns++; group.spent += spent; group.results += row.results ?? 0;
    groups.set(goal, group);
  }
  return Array.from(groups, ([goal, g]) => ({
    goal, campaigns: g.campaigns, spent: g.spent, results: g.results,
    costPerResult: g.results ? g.spent / g.results : null,
    shareOfSpend: total ? g.spent / total : 0,
  })).sort((a, b) => b.spent - a.spent);
}
