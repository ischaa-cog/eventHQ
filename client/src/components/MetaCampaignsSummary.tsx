import { useState } from "react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { breakdownByGoal, resultLabel, summarizeCampaigns } from "@shared/meta-campaigns";
import type { MetaAdCampaign } from "@shared/schema";

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (value: number | null) => value === null ? "—" : value.toLocaleString();
const day = (value: string) => format(parseISO(value), "MMM d, yyyy");

// Dashboard view of imported Meta campaigns: totals, stats by campaign goal, then every campaign in detail.
export function MetaCampaignsSummary({ clientId, campaigns }: { clientId: string; campaigns: MetaAdCampaign[] }) {
  const [showAll, setShowAll] = useState(false);
  const totals = summarizeCampaigns(campaigns);
  const reach = campaigns.reduce((sum, row) => sum + (row.reach ?? 0), 0);
  const goals = breakdownByGoal(campaigns);
  const period = campaigns.find(row => row.reportingStart && row.reportingEnd);
  const visible = showAll ? campaigns : campaigns.slice(0, 10);

  return <Card data-testid="meta-campaigns-summary">
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>Meta campaigns</CardTitle>
        <CardDescription>
          {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
          {period ? `, ${day(period.reportingStart!)} to ${day(period.reportingEnd!)}` : ""}
        </CardDescription>
      </div>
      <Link href={`/client/${clientId}/ads`}>
        <Button variant="outline" size="sm" className="gap-1" data-testid="link-all-campaigns">Ad Campaigns page <ArrowRight className="h-3 w-3" /></Button>
      </Link>
    </CardHeader>
    <CardContent className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Amount spent", value: money(totals.spent) },
          { label: "Purchases", value: whole(totals.purchases), hint: totals.purchases ? `${money(totals.spent / totals.purchases)} per purchase overall` : undefined },
          { label: "Registrations", value: whole(totals.registrations) },
          { label: "Impressions", value: whole(totals.impressions), hint: totals.impressions ? `${money(totals.spent / totals.impressions * 1000)} per 1,000` : undefined },
          { label: "Reach", value: whole(reach), hint: "Added up across campaigns" },
        ].map(stat => <div key={stat.label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="mt-1 text-xl font-semibold">{stat.value}</p>
          {stat.hint && <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>}
        </div>)}
      </div>

      <section aria-labelledby="meta-goals-heading">
        <h3 id="meta-goals-heading" className="mb-1 text-sm font-semibold">Stats by campaign goal</h3>
        <p className="mb-3 text-xs text-muted-foreground">Campaigns grouped by the result Meta optimised them for.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {goals.map(goal => <div key={goal.goal} className="rounded-lg border p-3" data-testid={`meta-goal-${goal.goal}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">{goal.goal}</p>
              <p className="text-xs text-muted-foreground">{goal.campaigns} campaign{goal.campaigns === 1 ? "" : "s"}</p>
            </div>
            <p className="mt-2 text-lg font-semibold">{money(goal.spent)}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" title={`${Math.round(goal.shareOfSpend * 100)}% of spend`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, goal.shareOfSpend * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{Math.round(goal.shareOfSpend * 100)}% of spend</p>
            <div className="mt-2 flex justify-between text-sm">
              <span>{whole(goal.results)} {goal.goal.toLowerCase()}</span>
              <span className="text-muted-foreground">{goal.costPerResult === null ? "—" : `${money(goal.costPerResult)} each`}</span>
            </div>
          </div>)}
        </div>
      </section>

      <section aria-labelledby="meta-breakdown-heading">
        <h3 id="meta-breakdown-heading" className="mb-1 text-sm font-semibold">Campaign breakdown</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Every campaign, highest spend first. CPM is the cost per 1,000 impressions; frequency is how many times, on average, each person saw the ads.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Spent</TableHead>
              <TableHead className="text-right">Results</TableHead>
              <TableHead className="text-right">Cost / result</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Reach</TableHead>
              <TableHead className="text-right">CPM</TableHead>
              <TableHead className="text-right">Frequency</TableHead>
            </TableRow></TableHeader>
            <TableBody>{visible.map(row => {
              const spent = Number(row.amountSpent) || 0;
              return <TableRow key={row.id} data-testid={`meta-breakdown-${row.id}`}>
                <TableCell className="min-w-[220px] align-top">
                  <div className="font-medium">{row.campaignName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {row.delivery && <Badge variant="outline" className="text-[10px] capitalize">{row.delivery}</Badge>}
                    {row.endsOn ? `Ended ${day(row.endsOn)}` : "Ongoing"}
                    {row.budget !== null && <span>· {money(Number(row.budget))} {row.budgetType?.toLowerCase() ?? ""} budget</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right align-top">{money(spent)}</TableCell>
                <TableCell className="text-right align-top">
                  {whole(row.results)}
                  <div className="text-xs text-muted-foreground">{resultLabel(row.resultType)}</div>
                </TableCell>
                <TableCell className="text-right align-top">{row.costPerResult === null ? "—" : money(Number(row.costPerResult))}</TableCell>
                <TableCell className="text-right align-top">{whole(row.impressions)}</TableCell>
                <TableCell className="text-right align-top">{whole(row.reach)}</TableCell>
                <TableCell className="text-right align-top">{row.impressions ? money(spent / row.impressions * 1000) : "—"}</TableCell>
                <TableCell className="text-right align-top">{row.impressions && row.reach ? (row.impressions / row.reach).toFixed(1) : "—"}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </div>
        {campaigns.length > 10 && <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)} data-testid="button-toggle-campaigns">
            {showAll ? "Show top 10" : `Show all ${campaigns.length} campaigns`}
          </Button>
        </div>}
      </section>
    </CardContent>
  </Card>;
}
