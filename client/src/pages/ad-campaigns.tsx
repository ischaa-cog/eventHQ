import { useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Megaphone, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { hasFullAccess } from "@shared/roles";
import { resultLabel, summarizeCampaigns } from "@shared/meta-campaigns";
import type { MetaAdCampaign } from "@shared/schema";

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (value: number | null) => value === null ? "—" : value.toLocaleString();
const day = (value: string | null) => value ? format(parseISO(value), "MMM d, yyyy") : null;

const errorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  const body = raw.replace(/^\d+:\s*/, "");
  try { return JSON.parse(body).error || body; } catch { return body; }
};

export default function AdCampaignsPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canImport = hasFullAccess(user);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);

  const campaigns = useQuery<MetaAdCampaign[]>({ queryKey: [`/api/clients/${clientId}/meta-campaigns`], enabled: !!clientId });
  const importCsv = useMutation({
    mutationFn: async (csv: string) => (await apiRequest("POST", `/api/clients/${clientId}/meta-campaigns/import`, { csv })).json(),
    onSuccess: (result: { importedCampaigns: number }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/meta-campaigns`] });
      toast({ title: "Campaigns imported", description: `${result.importedCampaigns} campaign${result.importedCampaigns === 1 ? "" : "s"} updated.` });
    },
    onError: error => toast({ title: "Import failed", description: errorMessage(error), variant: "destructive" }),
  });

  const rows = campaigns.data ?? [];
  const totals = useMemo(() => summarizeCampaigns(rows), [rows]);
  const period = rows.find(row => row.reportingStart && row.reportingEnd);
  const visible = showAll ? rows : rows.slice(0, 25);

  return <AppLayout mode="client"><div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ad Campaigns</h1>
        <p className="text-muted-foreground">
          Meta (Facebook and Instagram) campaign results
          {period ? `, ${day(period.reportingStart)} to ${day(period.reportingEnd)}` : ""}
        </p>
      </div>
      {canImport && <>
        <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" data-testid="input-meta-csv"
          onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) importCsv.mutate(await file.text()); }} />
        <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={importCsv.isPending} data-testid="button-import-meta">
          <Upload size={15} />{importCsv.isPending ? "Importing…" : "Import CSV"}
        </Button>
      </>}
    </div>

    {campaigns.isLoading ? <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      : campaigns.isError ? <p role="alert" className="text-sm text-destructive">Could not load ad campaigns. Please refresh the page.</p>
      : rows.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <Megaphone className="text-muted-foreground" />
          <p className="font-medium">No ad campaigns yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {canImport
              ? "In Meta Ads Manager, open Campaigns, choose Export table data → CSV, then click Import CSV here."
              : "Your team will add your Meta campaign results here."}
          </p>
        </CardContent></Card>
      : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Amount spent", value: money(totals.spent) },
            { label: "Purchases", value: count(totals.purchases), hint: totals.purchases ? `${money(totals.spent / totals.purchases)} per purchase overall` : undefined },
            { label: "Registrations", value: count(totals.registrations) },
            { label: "Impressions", value: count(totals.impressions) },
          ].map(stat => <Card key={stat.label}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
            {stat.hint && <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>}
          </CardContent></Card>)}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Campaigns ({rows.length})</CardTitle>
            <CardDescription>Totals for each campaign, highest spend first. Results are counted the way Meta counts them for that campaign.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Results</TableHead>
                  <TableHead className="text-right">Cost per result</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Reach</TableHead>
                </TableRow></TableHeader>
                <TableBody>{visible.map(row => <TableRow key={row.id} data-testid={`meta-campaign-${row.id}`}>
                  <TableCell className="min-w-[240px] align-top">
                    <div className="font-medium">{row.campaignName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {row.delivery && <Badge variant="outline" className="text-[10px] capitalize">{row.delivery}</Badge>}
                      {row.endsOn ? `Ended ${day(row.endsOn)}` : "Ongoing"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-top">{money(Number(row.amountSpent) || 0)}</TableCell>
                  <TableCell className="text-right align-top">
                    {count(row.results)}
                    <div className="text-xs text-muted-foreground">{resultLabel(row.resultType)}</div>
                  </TableCell>
                  <TableCell className="text-right align-top">{row.costPerResult === null ? "—" : money(Number(row.costPerResult))}</TableCell>
                  <TableCell className="text-right align-top">{count(row.impressions)}</TableCell>
                  <TableCell className="text-right align-top">{count(row.reach)}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>
            {rows.length > 25 && <div className="flex justify-center p-4">
              <Button variant="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${rows.length} campaigns`}</Button>
            </div>}
          </CardContent>
        </Card>
      </>}
  </div></AppLayout>;
}
