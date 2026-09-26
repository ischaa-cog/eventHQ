import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText, CheckCircle2, AlertCircle, ArrowRight, DollarSign, TrendingUp, Award, Trophy, Star, Target, Play, CalendarPlus, GraduationCap, BarChart3, Palette, Rocket, Zap, Crown, Gem, Lock, Megaphone, ExternalLink, RefreshCw } from "lucide-react";
import { Link, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { endOfDay, format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface SalesStats {
  today: { total: number; count: number };
  mtd: { total: number; count: number };
  qtd: { total: number; count: number };
  ytd: { total: number; count: number };
  allTime: { total: number; count: number };
}

interface Client {
  id: number;
  name: string;
  webhookToken: string | null;
}

interface MetaAdsStatus {
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  connectedAt: string | null;
}

interface MetaAdsInsights {
  today: number;
  mtd: number;
  qtd: number;
  ytd: number;
  custom: number | null;
}

interface Event {
  id: number;
  name: string;
  type: string;
  status: string;
  startDate: string | null;
}

interface CalendarEntry {
  id: number;
  title: string;
  eventDate: string;
  endDate: string | null;
  description: string | null;
}

interface PortalSummary {
  saleCount: number;
  netRevenue: number;
  revenueTrend: { date: string; netRevenue: number }[];
  recentSales: { id: number; saleDate: string; amount: number; source: string; status: string }[];
  upcomingCalendar: { id: number; title: string; eventDate: string }[];
  recentEvents: { id: number; title: string; eventType: string; startDate: string; totalRegistrants: number; totalAttendees: number; adSpend: number; totalRevenue: number }[];
  driveUrl: string | null;
  configuredSources: { processor: string; configured: boolean; verified: boolean; error?: string | null }[];
}

const MILESTONES = [
  { id: "first_sale", label: "First Sale!", icon: Star, threshold: 1, type: "count" },
  { id: "1k_day", label: "$1K Day", icon: TrendingUp, threshold: 1000, type: "daily" },
  { id: "5k_day", label: "$5K Day", icon: TrendingUp, threshold: 5000, type: "daily" },
  { id: "10k_month", label: "$10K Month", icon: Award, threshold: 10000, type: "monthly" },
  { id: "25k_month", label: "$25K Month", icon: Award, threshold: 25000, type: "monthly" },
  { id: "50k_quarter", label: "$50K Quarter", icon: Trophy, threshold: 50000, type: "quarterly" },
  { id: "100k_year", label: "$100K Year", icon: Target, threshold: 100000, type: "yearly" },
];

export default function ClientDashboard() {
  const { user } = useAuth();
  const isAgencyClient = user?.role === "agency_client";
  const params = useParams();
  const clientId = params.id || "1";
  const queryClient = useQueryClient();
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [snapshotStart, setSnapshotStart] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [snapshotEnd, setSnapshotEnd] = useState<Date>(() => new Date());
  
  const { data: client } = useQuery<Client>({
    queryKey: [`/api/clients/${clientId}`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json();
    },
  });

  const summaryQuery = useQuery<PortalSummary>({
    queryKey: [`/api/clients/${clientId}/portal-summary`, snapshotStart, snapshotEnd],
    queryFn: async () => {
      const q = new URLSearchParams({ startDate: snapshotStart.toISOString(), endDate: endOfDay(snapshotEnd).toISOString() });
      const res = await fetch(`/api/clients/${clientId}/portal-summary?${q}`);
      if (!res.ok) throw new Error("Failed to fetch portal summary");
      return res.json();
    },
  });
  const summary = summaryQuery.data;
  const summaryMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

  const { data: stats } = useQuery<SalesStats>({
    queryKey: [`/api/clients/${clientId}/sales/stats`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/sales/stats`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const customDateQuery = customStartDate && customEndDate
    ? `?startDate=${customStartDate.toISOString()}&endDate=${endOfDay(customEndDate).toISOString()}`
    : "";

  const { data: customSummary } = useQuery<PortalSummary>({
    queryKey: [`/api/clients/${clientId}/portal-summary`, "custom", customStartDate, customEndDate],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/portal-summary${customDateQuery}`);
      if (!res.ok) throw new Error("Failed to fetch custom sales summary");
      return res.json();
    },
    enabled: !!customStartDate && !!customEndDate,
  });

  const customTotal = customSummary?.netRevenue ?? 0;

  // Meta Ads state
  const [adSpendCustomStart, setAdSpendCustomStart] = useState<Date | undefined>();
  const [adSpendCustomEnd, setAdSpendCustomEnd] = useState<Date | undefined>();

  const { data: metaAdsStatus } = useQuery<MetaAdsStatus>({
    queryKey: [`/api/clients/${clientId}/meta-ads/status`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/meta-ads/status`);
      if (!res.ok) throw new Error("Failed to fetch Meta Ads status");
      return res.json();
    },
  });

  const adSpendCustomQuery = adSpendCustomStart && adSpendCustomEnd
    ? `&customStart=${adSpendCustomStart.toISOString().split("T")[0]}&customEnd=${adSpendCustomEnd.toISOString().split("T")[0]}`
    : "";

  const { data: metaInsights, isLoading: insightsLoading } = useQuery<MetaAdsInsights>({
    queryKey: [`/api/clients/${clientId}/meta-ads/insights`, adSpendCustomStart, adSpendCustomEnd],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/meta-ads/insights?_=1${adSpendCustomQuery}`);
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
    enabled: !!metaAdsStatus?.connected,
    staleTime: 5 * 60 * 1000,
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: [`/api/clients/${clientId}/events`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/events`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const { data: calendarEntries = [] } = useQuery<CalendarEntry[]>({
    queryKey: [`/api/clients/${clientId}/calendar`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/calendar`);
      if (!res.ok) throw new Error("Failed to fetch calendar");
      return res.json();
    },
  });

  // Filter calendar entries to only show upcoming events (today or future)
  const upcomingCalendarEvents = calendarEntries
    .filter(entry => new Date(entry.eventDate) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

  // Calculate days until next event
  const getNextEventInfo = () => {
    if (upcomingCalendarEvents.length === 0) return null;
    const nextEvent = upcomingCalendarEvents[0];
    const daysUntil = Math.ceil((new Date(nextEvent.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { title: nextEvent.title, daysUntil };
  };

  const nextEventInfo = getNextEventInfo();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getEarnedMilestones = () => {
    if (!stats) return [];
    return MILESTONES.filter(m => {
      if (m.type === "count") return stats.allTime.count >= m.threshold;
      if (m.type === "daily") return stats.today.total >= m.threshold;
      if (m.type === "monthly") return stats.mtd.total >= m.threshold;
      if (m.type === "quarterly") return stats.qtd.total >= m.threshold;
      if (m.type === "yearly") return stats.ytd.total >= m.threshold;
      return false;
    });
  };

  const earnedMilestones = getEarnedMilestones();

  return (
    <AppLayout title={`${client?.name || "Client"} - Dashboard`} mode="client">
      <div className="space-y-8">
        {/* Truthful, date-bounded snapshot sourced from the portal summary contract */}
        <section className="space-y-4" data-testid="portal-summary">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto"><h2 className="text-xl font-bold">Business snapshot</h2><p className="text-sm text-muted-foreground">Net revenue and activity for the selected period</p></div>
            <Popover><PopoverTrigger asChild><Button variant="outline" size="sm">{format(snapshotStart, "MMM d, yyyy")}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><CalendarComponent mode="single" selected={snapshotStart} onSelect={d => d && setSnapshotStart(d)} /></PopoverContent></Popover>
            <span className="text-sm text-muted-foreground">to</span>
            <Popover><PopoverTrigger asChild><Button variant="outline" size="sm">{format(snapshotEnd, "MMM d, yyyy")}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><CalendarComponent mode="single" selected={snapshotEnd} onSelect={d => d && setSnapshotEnd(d)} /></PopoverContent></Popover>
          </div>
          {summaryQuery.isLoading ? <Card><CardContent className="py-8 text-center text-muted-foreground">Loading snapshot…</CardContent></Card> :
            summaryQuery.isError ? <Card><CardContent className="py-8 text-center text-destructive">Snapshot unavailable. Please try again.</CardContent></Card> :
            summary ? <><div className="grid gap-4 md:grid-cols-2"><Card className="border-primary/20 bg-primary/5"><CardHeader className="pb-2"><CardTitle className="text-sm">Net revenue</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-primary">{summaryMoney(summary.netRevenue)}</div><p className="text-xs text-muted-foreground">{summary.saleCount} recorded transactions (refunds and failures reflected in net)</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm">Sales source status</CardTitle></CardHeader><CardContent>{summary.configuredSources.length ? <div className="flex flex-wrap gap-2">{summary.configuredSources.map(s => <Badge key={s.processor} variant={s.configured && s.verified ? "secondary" : "outline"} title={s.error || undefined}>{s.processor} · {s.configured && s.verified ? "verified" : "not connected"}</Badge>)}</div> : <p className="text-sm text-muted-foreground">No sales sources configured yet.</p>}</CardContent></Card></div>
              <div className="grid gap-4 lg:grid-cols-3"><Card className="lg:col-span-2"><CardHeader><CardTitle>Revenue trend</CardTitle><CardDescription>Net revenue by day</CardDescription></CardHeader><CardContent>{summary.revenueTrend.length ? <div className="flex h-36 items-end gap-1">{summary.revenueTrend.map(point => { const max = Math.max(...summary.revenueTrend.map(p => Math.abs(p.netRevenue)), 1); return <div key={point.date} className="group flex h-full flex-1 flex-col justify-end" title={`${format(new Date(point.date), "MMM d")}: ${summaryMoney(point.netRevenue)}`}><div className={`min-h-1 rounded-t bg-primary ${point.netRevenue < 0 ? "bg-destructive" : ""}`} style={{ height: `${Math.max(3, Math.abs(point.netRevenue) / max * 100)}%` }} /></div> })}</div> : <p className="py-8 text-sm text-muted-foreground">No revenue recorded in this period.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Upcoming calendar</CardTitle></CardHeader><CardContent>{summary.upcomingCalendar.length ? <div className="space-y-3">{summary.upcomingCalendar.slice(0, 5).map(item => <div key={item.id}><p className="font-medium text-sm">{item.title}</p><p className="text-xs text-muted-foreground">{format(new Date(item.eventDate), "MMM d, yyyy")}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No upcoming calendar items.</p>}</CardContent></Card></div>
              <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Recent event performance</CardTitle><CardDescription>Actual event metrics, not projections</CardDescription></CardHeader><CardContent>{summary.recentEvents.length ? <div className="space-y-3">{summary.recentEvents.slice(0, 5).map(event => <div key={event.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"><div><p className="font-medium text-sm">{event.title}</p><p className="text-xs text-muted-foreground">{event.eventType === "webinar" ? "Masterclass" : event.eventType} · {event.totalRegistrants} registrants · {event.totalAttendees} attendees</p></div><span className="text-sm font-medium">{summaryMoney(event.totalRevenue)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No event performance data available.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Recent sales</CardTitle></CardHeader><CardContent>{summary.recentSales.length ? <div className="space-y-2">{summary.recentSales.slice(0, 5).map(sale => <div key={sale.id} className="flex justify-between text-sm"><span>{format(new Date(sale.saleDate), "MMM d")} · {sale.source} · <Badge variant={sale.status.toLowerCase().includes("refund") || sale.status.toLowerCase().includes("fail") ? "destructive" : "outline"}>{sale.status}</Badge></span><span className="font-medium">{summaryMoney(sale.amount)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No sales in this period.</p>}</CardContent></Card></div>
              <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">Client Drive</p><p className="text-sm text-muted-foreground">{summary.driveUrl ? "Open shared files and deliverables." : "No Drive folder has been connected."}</p></div>{summary.driveUrl && <a href={summary.driveUrl} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="gap-1">Open Drive <ExternalLink className="h-3 w-3" /></Button></a>}</CardContent></Card></> : null}
        </section>
        {/* Sales Stats Section */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-auto">
              <DollarSign className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold">Sales Stats</h2>
            </div>
            {earnedMilestones.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {earnedMilestones.slice(0, 2).map((milestone) => (
                  <Badge key={milestone.id} variant="secondary" className="gap-1 bg-amber-100 text-amber-800 border-amber-300 text-xs">
                    <milestone.icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{milestone.label}</span>
                    <span className="sm:hidden">{milestone.label.split(" ")[0]}</span>
                  </Badge>
                ))}
                {earnedMilestones.length > 2 && (
                  <Badge variant="outline" className="text-xs">+{earnedMilestones.length - 2}</Badge>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCurrency(stats?.today.total || 0)}</div>
                <p className="text-xs text-muted-foreground">{stats?.today.count || 0} sales</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Month to Date</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.mtd.total || 0)}</div>
                <p className="text-xs text-muted-foreground">{stats?.mtd.count || 0} sales</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Quarter to Date</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.qtd.total || 0)}</div>
                <p className="text-xs text-muted-foreground">{stats?.qtd.count || 0} sales</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Year to Date</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.ytd.total || 0)}</div>
                <p className="text-xs text-muted-foreground">{stats?.ytd.count || 0} sales</p>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Custom Range (Net)</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {customStartDate && customEndDate ? formatCurrency(customTotal) : "—"}
                </div>
                <div className="flex gap-1 mt-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" data-testid="button-custom-start">
                        {customStartDate ? format(customStartDate, "MMM d") : "Start"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customStartDate}
                        onSelect={setCustomStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-xs text-muted-foreground self-center">to</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" data-testid="button-custom-end">
                        {customEndDate ? format(customEndDate, "MMM d") : "End"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customEndDate}
                        onSelect={setCustomEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Milestones Display */}
          {earnedMilestones.length > 0 && (
            <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-600" />
                  Achievements Unlocked
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {earnedMilestones.map((milestone) => (
                    <div 
                      key={milestone.id}
                      className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 border border-amber-200 shadow-sm"
                    >
                      <milestone.icon className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">{milestone.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Ad Spend Section */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-auto">
              <Megaphone className="h-5 w-5 text-blue-500" />
              <h2 className="text-xl font-bold">Ad Spend</h2>
              {metaAdsStatus?.connected && metaAdsStatus.accountName && (
                <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  {metaAdsStatus.accountName}
                </Badge>
              )}
            </div>
            {metaAdsStatus?.connected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                data-testid="button-refresh-ad-spend"
                onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/meta-ads/insights`] })}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${insightsLoading ? "animate-spin" : ""}`} />
              </Button>
            )}
            {!metaAdsStatus?.connected && !isAgencyClient && (
              <Link href={`/client/${clientId}/workspace?tab=settings`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid="button-connect-meta-ads">
                  <ExternalLink className="h-3 w-3" />
                  Connect Meta Ads
                </Button>
              </Link>
            )}
          </div>

          {metaAdsStatus?.connected ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Today</CardTitle>
                  <Megaphone className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-700" data-testid="ad-spend-today">
                    {insightsLoading ? "…" : formatCurrency(metaInsights?.today ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Meta Ads spend</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Month to Date</CardTitle>
                  <Megaphone className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="ad-spend-mtd">
                    {insightsLoading ? "…" : formatCurrency(metaInsights?.mtd ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Meta Ads spend</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Quarter to Date</CardTitle>
                  <Megaphone className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="ad-spend-qtd">
                    {insightsLoading ? "…" : formatCurrency(metaInsights?.qtd ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Meta Ads spend</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Year to Date</CardTitle>
                  <Megaphone className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="ad-spend-ytd">
                    {insightsLoading ? "…" : formatCurrency(metaInsights?.ytd ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Meta Ads spend</p>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Custom Range</CardTitle>
                  <Megaphone className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="ad-spend-custom">
                    {adSpendCustomStart && adSpendCustomEnd
                      ? (insightsLoading ? "…" : formatCurrency(metaInsights?.custom ?? 0))
                      : "—"}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-6 text-xs px-2" data-testid="button-ad-spend-custom-start">
                          {adSpendCustomStart ? format(adSpendCustomStart, "MMM d") : "Start"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={adSpendCustomStart}
                          onSelect={setAdSpendCustomStart}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <span className="text-xs text-muted-foreground self-center">to</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-6 text-xs px-2" data-testid="button-ad-spend-custom-end">
                          {adSpendCustomEnd ? format(adSpendCustomEnd, "MMM d") : "End"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={adSpendCustomEnd}
                          onSelect={setAdSpendCustomEnd}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-dashed border-blue-200">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <Megaphone className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">Meta Ads not connected</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isAgencyClient
                      ? "Meta Ads spend is unavailable for this workspace."
                      : "Connect this client's Meta Ads account in Brand Workspace → Settings to see live spend data."}
                  </p>
                </div>
                {!isAgencyClient && (
                  <Link href={`/client/${clientId}/workspace?tab=settings`}>
                    <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-connect-meta-ads-empty">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Go to Settings
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Project & Marketing Overview Section */}
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Project & Marketing Overview</h2>
        </div>

        {/* Client Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingCalendarEvents.length}</div>
              <p className="text-xs text-muted-foreground">
                {nextEventInfo 
                  ? `Next: ${nextEventInfo.title} (${nextEventInfo.daysUntil === 0 ? 'Today' : nextEventInfo.daysUntil === 1 ? 'Tomorrow' : `${nextEventInfo.daysUntil} days`})`
                  : "No upcoming events"
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Client Active Projects */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>How to Navigate Your Event OS Dashboard</CardTitle>
              <CardDescription>Get started with a quick overview of what you can do here</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div 
                className="relative bg-muted rounded-lg aspect-video flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors border-2 border-dashed border-border"
                data-testid="video-placeholder"
              >
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Play className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground font-medium">Video Tutorial Coming Soon</p>
                  <p className="text-sm text-muted-foreground/70">Learn how to get the most out of your dashboard</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!isAgencyClient && (
                  <>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <CalendarPlus className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Event Builder</p>
                        <p className="text-xs text-muted-foreground">Create masterclasses, summits, and challenges</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <Calendar className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Marketing Calendar</p>
                        <p className="text-xs text-muted-foreground">View and manage your event schedule</p>
                      </div>
                    </div>
                  </>
                )}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <GraduationCap className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Training Lab</p>
                    <p className="text-xs text-muted-foreground">Access video tutorials and resources</p>
                  </div>
                </div>
                {!isAgencyClient && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Palette className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Brand Workspace</p>
                      <p className="text-xs text-muted-foreground">Set your voice, style, and assets</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {(() => {
            const TIERS = [
              { name: "Launchpad", threshold: 0, icon: Rocket, gradient: "from-slate-500 to-slate-600", glow: "shadow-slate-500/50" },
              { name: "Momentum Maker", threshold: 10000, icon: Zap, gradient: "from-blue-500 to-cyan-500", glow: "shadow-blue-500/50" },
              { name: "Scaling Master", threshold: 100000, icon: Target, gradient: "from-purple-500 to-pink-500", glow: "shadow-purple-500/50" },
              { name: "Digital Mogul", threshold: 500000, icon: Gem, gradient: "from-amber-500 to-orange-500", glow: "shadow-amber-500/50" },
              { name: "Industry Leader", threshold: 1000000, icon: Crown, gradient: "from-yellow-400 to-yellow-600", glow: "shadow-yellow-500/50" },
            ];
            
            const totalSales = stats?.allTime.total || 0;
            const currentTierIndex = TIERS.reduce((acc, tier, idx) => totalSales >= tier.threshold ? idx : acc, 0);
            const currentTier = TIERS[currentTierIndex];
            const nextTier = TIERS[currentTierIndex + 1];
            
            const progressToNext = nextTier 
              ? Math.min(100, ((totalSales - currentTier.threshold) / (nextTier.threshold - currentTier.threshold)) * 100)
              : 100;
            
            const amountToNext = nextTier ? nextTier.threshold - totalSales : 0;
            
            return (
              <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-background via-background to-primary/5" data-testid="progress-board">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Trophy className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Progress Board</CardTitle>
                      <p className="text-xs text-muted-foreground">Your journey to Industry Leader</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-r ${currentTier.gradient} text-white shadow-lg ${currentTier.glow}`} data-testid="current-tier-card">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                        <currentTier.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs opacity-80">Current Tier</p>
                        <p className="font-bold text-lg" data-testid="text-current-tier">{currentTier.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs opacity-80">Total Sales</p>
                        <p className="font-bold" data-testid="text-total-sales">{formatCurrency(totalSales)}</p>
                      </div>
                    </div>
                  </div>
                  
                  {nextTier && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Progress to {nextTier.name}</span>
                        <span className="font-medium" data-testid="text-progress-percent">{progressToNext.toFixed(0)}%</span>
                      </div>
                      <div className="h-3 rounded-full bg-muted overflow-hidden" data-testid="progress-bar-container">
                        <div 
                          className={`h-full rounded-full bg-gradient-to-r ${nextTier.gradient} transition-all duration-1000 ease-out`}
                          style={{ width: `${progressToNext}%` }}
                          data-testid="progress-bar-fill"
                        />
                      </div>
                      <p className="text-center text-sm" data-testid="text-next-tier-message">
                        <span className="text-muted-foreground">Only </span>
                        <span className="font-bold text-primary" data-testid="text-amount-to-next">{formatCurrency(amountToNext)}</span>
                        <span className="text-muted-foreground"> to become a </span>
                        <span className="font-bold bg-gradient-to-r from-yellow-500 to-amber-600 bg-clip-text text-transparent">{nextTier.name}</span>
                        <span className="text-muted-foreground">!</span>
                      </p>
                    </div>
                  )}
                  
                  {!nextTier && (
                    <div className="text-center py-2">
                      <p className="text-sm font-medium text-primary flex items-center justify-center gap-2">
                        <Crown className="h-4 w-4 text-yellow-500" />
                        You've reached the top! You're an Industry Leader!
                        <Crown className="h-4 w-4 text-yellow-500" />
                      </p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" data-testid="tier-ladder">
                    {TIERS.map((tier, idx) => {
                      const TierIcon = tier.icon;
                      const isCompleted = idx < currentTierIndex;
                      const isCurrent = idx === currentTierIndex;
                      const isLocked = idx > currentTierIndex;
                      
                      const formatTierThreshold = (threshold: number) => {
                        if (threshold === 0) return '$0';
                        if (threshold >= 1000000) return `$${threshold / 1000000}M`;
                        return `$${threshold / 1000}k`;
                      };
                      
                      return (
                        <div 
                          key={tier.name}
                          className={`relative flex flex-col items-center p-2 rounded-lg transition-all ${
                            isCurrent 
                              ? `bg-gradient-to-br ${tier.gradient} text-white shadow-md ${tier.glow}` 
                              : isCompleted 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                                : 'bg-muted/50 text-muted-foreground'
                          }`}
                          data-testid={`tier-${idx}`}
                        >
                          <div className={`h-7 w-7 sm:h-6 sm:w-6 rounded-full flex items-center justify-center ${
                            isCurrent ? 'bg-white/20' : isCompleted ? 'bg-green-200 dark:bg-green-800' : 'bg-muted'
                          }`}>
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                            ) : isLocked ? (
                              <Lock className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                            ) : (
                              <TierIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                            )}
                          </div>
                          <p className="text-[10px] sm:text-[9px] font-medium text-center mt-1 leading-tight">{tier.name}</p>
                          <p className="text-[9px] sm:text-[8px] opacity-70">{formatTierThreshold(tier.threshold)}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>
    </AppLayout>
  );
}
