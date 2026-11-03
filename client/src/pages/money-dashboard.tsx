// Revenue and ad spend at a glance, built for phones first.
// Top: one date control and four numbers (revenue, ad spend, ROAS, profit). Then the daily trend,
// then one card per event that opens to show its detail, then where the money came from.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, startOfYear, subDays, subMonths, endOfMonth } from "date-fns";
import {
  ArrowDownRight, ArrowUpRight, ChevronDown, Link2, Plug, RefreshCw, TriangleAlert,
} from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Totals = {
  revenue: number; grossSales: number; refunds: number; orders: number; adSpend: number; profit: number;
  roas: number | null; leads: number; clicks: number; impressions: number; costPerLead: number | null;
};
type EventRow = {
  id: number; title: string; type: string; startDate: string; endDate: string | null;
  revenue: number; adSpend: number; profit: number; roas: number | null; orders: number | null;
  revenueSource: "synced" | "manual"; spendSource: "synced" | "manual"; linkedProducts: number; linkedCampaigns: number;
  registrants: number; attendees: number; peopleAtPitch: number; showUpRate: number | null;
  costPerRegistrant: number | null; leads: number | null;
};
type Summary = {
  range: { from: string; to: string; previous: { from: string; to: string } };
  totals: Totals; previousTotals: Totals; comparable: { revenue: boolean; adSpend: boolean };
  daily: Array<{ date: string; revenue: number; adSpend: number }>;
  revenueBySource: Array<{ source: string; revenue: number; orders: number }>;
  spendByCampaign: Array<{ campaignId: string; campaignName: string | null; spend: number; leads: number; eventId: number | null }>;
  events: EventRow[];
  sources: Array<{ provider: string; displayName: string | null; status: string; lastSyncAt: string | null; lastWebhookAt: string | null; hasError: boolean }>;
};

const PRESETS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "mtd", label: "This month" },
  { id: "lm", label: "Last month" },
  { id: "90d", label: "90 days" },
  { id: "ytd", label: "This year" },
] as const;
type PresetId = typeof PRESETS[number]["id"];

function presetRange(id: PresetId, today = new Date()) {
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  switch (id) {
    case "7d": return { from: iso(subDays(today, 6)), to: iso(today) };
    case "30d": return { from: iso(subDays(today, 29)), to: iso(today) };
    case "mtd": return { from: iso(startOfMonth(today)), to: iso(today) };
    case "lm": {
      const last = subMonths(today, 1);
      return { from: iso(startOfMonth(last)), to: iso(endOfMonth(last)) };
    }
    case "90d": return { from: iso(subDays(today, 89)), to: iso(today) };
    case "ytd": return { from: iso(startOfYear(today)), to: iso(today) };
  }
}

const PROVIDER_LABEL: Record<string, string> = {
  stripe: "Stripe", whop: "Whop", fanbasis: "Fanbasis", highlevel: "HighLevel", meta: "Meta Ads", manual: "Manual", import: "Import",
};
const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

const EVENT_TYPE: Record<string, string> = { webinar: "Masterclass", challenge: "Challenge", summit: "Summit" };

const usd = (v: number) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
const usdCents = (v: number) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactUsd = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 10_000 ? `${Math.round(a / 1000)}K` : a >= 1000 ? `${(a / 1000).toFixed(1)}K` : `${Math.round(a)}`;
  return `${v < 0 ? "-" : ""}$${s}`;
};
const roasText = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}x`);
const dayLabel = (d: string) => format(parseISO(d), "MMM d");

function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function readPreset(): PresetId {
  try {
    const saved = window.localStorage.getItem("eventhq.money.range");
    if (saved && PRESETS.some((p) => p.id === saved)) return saved as PresetId;
  } catch { /* storage unavailable */ }
  return "30d";
}

export default function MoneyDashboardPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isStaff = user?.role === "owner" || user?.role === "agency_admin" || user?.role === "team_member";
  const isAdmin = user?.role === "owner" || user?.role === "agency_admin";
  const [preset, setPreset] = useState<PresetId>(readPreset);
  const range = useMemo(() => presetRange(preset), [preset]);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const queryClient = useQueryClient();
  const summaryKey = [`/api/clients/${clientId}/money-summary?from=${range.from}&to=${range.to}&tz=${encodeURIComponent(tz)}`];

  useEffect(() => {
    try { window.localStorage.setItem("eventhq.money.range", preset); } catch { /* storage unavailable */ }
  }, [preset]);

  const summary = useQuery<Summary>({ queryKey: summaryKey, enabled: !!clientId });
  const { data: client } = useQuery<{ name: string }>({ queryKey: [`/api/clients/${clientId}`], enabled: !!clientId });

  const refresh = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/money-summary/refresh`)).json(),
    onSettled: () => queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith(`/api/clients/${clientId}/money-summary`),
    }),
  });

  // Pull fresh numbers once when the page opens; the server skips anything synced in the last 15 minutes.
  const refreshedOnce = useRef(false);
  useEffect(() => {
    if (clientId && !refreshedOnce.current) {
      refreshedOnce.current = true;
      refresh.mutate();
    }
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = summary.data;
  const lastSync = data?.sources
    .map((s) => s.lastSyncAt ?? s.lastWebhookAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  const brokenSources = data?.sources.filter((s) => s.hasError || s.status === "error") ?? [];

  return (
    <AppLayout mode="client" title="Revenue & Ad Spend" pageContext="Revenue and ad spend dashboard">
      <div className="mx-auto w-full max-w-5xl space-y-5 pb-24">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{client?.name ?? " "}</p>
            <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">Revenue &amp; Ad Spend</h1>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="text-last-sync">
              {refresh.isPending ? "Updating…" : lastSync ? `Updated ${format(new Date(lastSync), "MMM d, h:mm a")}` : "Not synced yet"}
            </p>
          </div>
          <Button
            variant="outline" size="icon" className="h-11 w-11 shrink-0"
            onClick={() => refresh.mutate()} disabled={refresh.isPending}
            aria-label="Refresh numbers" data-testid="button-refresh"
          >
            <RefreshCw className={cn("h-5 w-5", refresh.isPending && "animate-spin")} />
          </Button>
        </header>

        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" role="tablist" aria-label="Date range">
          <div className="flex w-max gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id} type="button" role="tab" aria-selected={preset === p.id}
                onClick={() => setPreset(p.id)} data-testid={`range-${p.id}`}
                className={cn(
                  "h-10 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors",
                  preset === p.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          {dayLabel(range.from)} – {dayLabel(range.to)}, compared with the {PRESETS.find((p) => p.id === preset)?.label.toLowerCase()} before
        </p>

        {brokenSources.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="font-medium">{brokenSources.map((s) => s.displayName || providerLabel(s.provider)).join(", ")} stopped syncing.</p>
              <p className="text-muted-foreground">
                Numbers from {brokenSources.length === 1 ? "it" : "them"} may be out of date.
                {isAdmin && <> <Link href={`/client/${clientId}/integrations`} className="underline">Check the connection</Link>.</>}
              </p>
            </div>
          </div>
        )}

        {summary.isLoading ? <LoadingState /> : summary.isError || !data ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Could not load revenue and ad spend. Try refreshing.</CardContent></Card>
        ) : (
          <>
            {data.sources.length === 0 && <NoSourcesNotice isAdmin={isAdmin} clientId={clientId!} />}
            <KpiGrid totals={data.totals} previous={data.previousTotals} comparable={data.comparable} />
            <MoreNumbers totals={data.totals} />
            <TrendCard daily={data.daily} />
            <EventsSection events={data.events} isStaff={isStaff} clientId={clientId!} />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 [&>*]:min-w-0">
              <SourcesCard rows={data.revenueBySource} total={data.totals.revenue} />
              <CampaignsCard rows={data.spendByCampaign} total={data.totals.adSpend} />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

function NoSourcesNotice({ isAdmin, clientId }: { isAdmin: boolean; clientId: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
      <Plug className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="space-y-1">
        <p className="font-medium">No sales or ad accounts are connected yet.</p>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Connect Meta, Whop, Stripe or Fanbasis to fill this page automatically."
            : "Your team is setting up the connections. Numbers typed into Event Tracker still show below."}
        </p>
        {isAdmin && (
          <Button asChild size="sm" className="mt-2 h-10">
            <Link href={`/client/${clientId}/integrations`}>Connect accounts</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function Delta({ value, goodWhenUp = true }: { value: number | null; goodWhenUp?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-xs text-muted-foreground">No earlier data</span>;
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-emerald-400" : "text-rose-400")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(value) >= 1000 ? ">999" : Math.abs(value).toFixed(0)}%
      <span className="sr-only">{up ? "up" : "down"} from the previous period</span>
    </span>
  );
}

function KpiGrid({ totals, previous, comparable }: { totals: Totals; previous: Totals; comparable: Summary["comparable"] }) {
  const both = comparable.revenue && comparable.adSpend;
  const tiles = [
    { label: "Revenue", value: usd(totals.revenue), delta: comparable.revenue ? change(totals.revenue, previous.revenue) : null, good: true, testid: "kpi-revenue" },
    { label: "Ad spend", value: usd(totals.adSpend), delta: comparable.adSpend ? change(totals.adSpend, previous.adSpend) : null, good: false, testid: "kpi-spend" },
    { label: "ROAS", value: roasText(totals.roas), delta: both ? change(totals.roas, previous.roas) : null, good: true, testid: "kpi-roas" },
    { label: "Profit", value: usd(totals.profit), delta: both ? change(totals.profit, previous.profit) : null, good: true, testid: "kpi-profit" },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Key numbers">
      {tiles.map((t) => (
        <Card key={t.label} className="rounded-xl" data-testid={t.testid}>
          <CardContent className="flex h-full flex-col gap-1 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</span>
            <span className="font-heading text-2xl font-bold tabular-nums leading-tight md:text-3xl">{t.value}</span>
            <Delta value={t.delta} goodWhenUp={t.good} />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function MoreNumbers({ totals }: { totals: Totals }) {
  const [open, setOpen] = useState(false);
  const rows = [
    ["Gross sales", usdCents(totals.grossSales)],
    ["Refunds", usdCents(totals.refunds)],
    ["Orders", totals.orders.toLocaleString()],
    ["Average order", totals.orders ? usdCents(totals.grossSales / totals.orders) : "—"],
    ["Leads from ads", totals.leads.toLocaleString()],
    ["Cost per lead", totals.costPerLead === null ? "—" : usdCents(totals.costPerLead)],
    ["Link clicks", totals.clicks.toLocaleString()],
    ["Impressions", totals.impressions.toLocaleString()],
  ];
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex h-11 w-full items-center justify-between rounded-lg border border-border bg-card px-4 text-sm font-medium" data-testid="button-more-numbers">
          {open ? "Fewer numbers" : "More numbers"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TrendCard({ daily }: { daily: Summary["daily"] }) {
  const hasData = daily.some((d) => d.revenue !== 0 || d.adSpend !== 0);
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Revenue vs ad spend by day</CardTitle>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-[hsl(var(--chart-1))]" />Revenue</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-[hsl(var(--chart-4))]" />Ad spend</span>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        {hasData ? (
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={compactUsd} width={48} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(d) => format(parseISO(String(d)), "EEE, MMM d")}
                  formatter={(v: number, name: string) => [usdCents(v), name === "revenue" ? "Revenue" : "Ad spend"]}
                />
                <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line dataKey="adSpend" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No sales or ad spend in this period.</p>
        )}
      </CardContent>
    </Card>
  );
}

function EventsSection({ events, isStaff, clientId }: { events: EventRow[]; isStaff: boolean; clientId: string }) {
  return (
    <section className="space-y-3" aria-labelledby="events-heading">
      <div className="flex items-end justify-between gap-2">
        <h2 id="events-heading" className="font-heading text-lg font-semibold">By event</h2>
        <Link href={`/client/${clientId}/events`} className="text-sm text-primary">All events</Link>
      </div>
      {events.length === 0 ? (
        <Card className="rounded-xl"><CardContent className="p-4 text-sm text-muted-foreground">No events in this period.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => <EventCard key={e.id} event={e} isStaff={isStaff} clientId={clientId} />)}
        </div>
      )}
    </section>
  );
}

function EventCard({ event: e, isStaff, clientId }: { event: EventRow; isStaff: boolean; clientId: string }) {
  const [open, setOpen] = useState(false);
  const dates = e.endDate && e.endDate.slice(0, 10) !== e.startDate.slice(0, 10)
    ? `${format(new Date(e.startDate), "MMM d")} – ${format(new Date(e.endDate), "MMM d, yyyy")}`
    : format(new Date(e.startDate), "MMM d, yyyy");
  const manual = e.revenueSource === "manual" || e.spendSource === "manual";
  const detail: Array<[string, string]> = [
    ["Profit", usd(e.profit)],
    ["Orders", e.orders === null ? "—" : e.orders.toLocaleString()],
    ["Registrants", e.registrants.toLocaleString()],
    ["Attended", e.attendees.toLocaleString()],
    ["Show-up rate", e.showUpRate === null ? "—" : `${e.showUpRate.toFixed(0)}%`],
    ["Cost per registrant", e.costPerRegistrant === null ? "—" : usdCents(e.costPerRegistrant)],
    ["Still there at the pitch", e.peopleAtPitch.toLocaleString()],
    ["Leads from ads", e.leads === null ? "—" : e.leads.toLocaleString()],
  ];
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden rounded-xl" data-testid={`event-${e.id}`}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full p-4 text-left" aria-label={`${e.title}: ${open ? "hide" : "show"} details`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">{EVENT_TYPE[e.type] ?? e.type} · {dates}</p>
              </div>
              <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Revenue" value={usd(e.revenue)} />
              <Stat label="Ad spend" value={usd(e.adSpend)} />
              <Stat label="ROAS" value={roasText(e.roas)} />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t border-border px-4 py-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {detail.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Revenue: {e.revenueSource === "synced" ? `${e.linkedProducts} linked product${e.linkedProducts === 1 ? "" : "s"}` : "typed in Event Tracker"}</Badge>
              <Badge variant="outline">Ad spend: {e.spendSource === "synced" ? `${e.linkedCampaigns} linked campaign${e.linkedCampaigns === 1 ? "" : "s"}` : "typed in Event Tracker"}</Badge>
            </div>
            {isStaff && manual && (
              <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                <Link href={`/client/${clientId}/integrations?tab=links&event=${e.id}`}>
                  <Link2 className="mr-2 h-4 w-4" />Link products and campaigns
                </Link>
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ShareBar({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }} />
    </div>
  );
}

function SourcesCard({ rows, total }: { rows: Summary["revenueBySource"]; total: number }) {
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by source</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No sales in this period.</p> : rows.map((r) => (
          <div key={r.source} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{providerLabel(r.source)}</span>
              <span className="tabular-nums">{usd(r.revenue)} <span className="text-xs text-muted-foreground">· {r.orders} orders</span></span>
            </div>
            <ShareBar share={total > 0 ? r.revenue / total : 0} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CampaignsCard({ rows, total }: { rows: Summary["spendByCampaign"]; total: number }) {
  const [all, setAll] = useState(false);
  const visible = all ? rows : rows.slice(0, 5);
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2"><CardTitle className="text-base">Ad spend by campaign</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No ad spend in this period.</p> : visible.map((r) => (
          <div key={r.campaignId} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium" title={r.campaignName ?? r.campaignId}>{r.campaignName ?? r.campaignId}</span>
              <span className="shrink-0 tabular-nums">{usd(r.spend)}</span>
            </div>
            <ShareBar share={total > 0 ? r.spend / total : 0} />
            <p className="text-xs text-muted-foreground">{r.leads.toLocaleString()} leads{r.leads > 0 ? ` · ${usdCents(r.spend / r.leads)} each` : ""}</p>
          </div>
        ))}
        {rows.length > 5 && (
          <Button variant="ghost" className="h-10 w-full" onClick={() => setAll(!all)}>
            {all ? "Show top 5" : `Show all ${rows.length} campaigns`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
