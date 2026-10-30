import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resultLabel, summarizeCampaigns } from "@shared/meta-campaigns";
import type { MetaAdCampaign } from "@shared/schema";

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Dashboard summary of imported Meta campaigns: totals and the five biggest campaigns by spend.
export function MetaCampaignsSummary({ clientId, campaigns }: { clientId: string; campaigns: MetaAdCampaign[] }) {
  const totals = summarizeCampaigns(campaigns);
  const period = campaigns.find(row => row.reportingStart && row.reportingEnd);
  const top = campaigns.slice(0, 5);
  return <Card data-testid="meta-campaigns-summary">
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>Meta campaigns</CardTitle>
        <CardDescription>
          {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
          {period ? `, ${format(parseISO(period.reportingStart!), "MMM d, yyyy")} to ${format(parseISO(period.reportingEnd!), "MMM d, yyyy")}` : ""}
        </CardDescription>
      </div>
      <Link href={`/client/${clientId}/ads`}>
        <Button variant="outline" size="sm" className="gap-1" data-testid="link-all-campaigns">All campaigns <ArrowRight className="h-3 w-3" /></Button>
      </Link>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Amount spent", value: money(totals.spent) },
          { label: "Purchases", value: totals.purchases.toLocaleString(), hint: totals.purchases ? `${money(totals.spent / totals.purchases)} per purchase overall` : undefined },
          { label: "Registrations", value: totals.registrations.toLocaleString() },
          { label: "Impressions", value: totals.impressions.toLocaleString() },
        ].map(stat => <div key={stat.label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="mt-1 text-xl font-semibold">{stat.value}</p>
          {stat.hint && <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>}
        </div>)}
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Top campaigns by spend</p>
        <div className="space-y-2">
          {top.map(row => <div key={row.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.campaignName}</p>
              <p className="text-xs text-muted-foreground">
                {(row.results ?? 0).toLocaleString()} {resultLabel(row.resultType).toLowerCase()}
                {row.costPerResult !== null ? ` · ${money(Number(row.costPerResult))} each` : ""}
              </p>
            </div>
            <span className="shrink-0 font-medium">{money(Number(row.amountSpent) || 0)}</span>
          </div>)}
        </div>
      </div>
    </CardContent>
  </Card>;
}
