// One event's results: ads, opt-ins, sales by tier and offer, revenue, and for a Main event its
// own numbers or the total including its Minis. Staff edit the event and its offers here.
import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ListInput, NumberGrid, TIERS, TIER_LABEL, errorText, pct, shortDate, usd, usdCents,
  type Numbers, type Offer, type Report, type Suggestions,
} from "@/components/registry/shared";
import { EventSheet, invalidateRegistry, useRegistry } from "./event-registry";

export default function EventDetailPage() {
  const { id: clientId, eventId } = useParams<{ id: string; eventId: string }>();
  const { user } = useAuth();
  const isStaff = user?.role === "owner" || user?.role === "agency_admin" || user?.role === "team_member";
  const registry = useRegistry(clientId);
  const { data, isLoading } = useQuery<{ report: Report; minis: Report[] }>({
    queryKey: [`/api/clients/${clientId}/registry/events/${eventId}/report`], enabled: !!clientId && !!eventId,
  });
  const [scope, setScope] = useState<"total" | "own">("total");
  const [editing, setEditing] = useState(false);
  const event = registry.data?.events.find((e) => e.id === Number(eventId));
  const r = data?.report;
  const isMain = r?.role === "main" && (r?.miniIds.length ?? 0) > 0;
  const n: Numbers | undefined = r ? (isMain && scope === "total" ? r.withMinis! : r.own) : undefined;
  const main = r?.feedsIntoId ? registry.data?.events.find((e) => e.id === r.feedsIntoId) : undefined;

  return (
    <AppLayout mode="client" title={r?.title ?? "Event"} pageContext={`Event results for ${r?.registryId ?? "an event"}`}>
      <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
        <Link href={`/client/${clientId}/registry`} className="inline-flex h-10 items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />All events
        </Link>
        {isLoading || !r || !n ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
          <>
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{r.role === "main" ? "Main" : "Mini"}</Badge>
                  <span className="text-xs text-muted-foreground">{r.registryId}</span>
                </div>
                <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight">{r.title}</h1>
                <p className="text-xs text-muted-foreground">
                  Ads {shortDate(r.adsStart)} · cart {shortDate(r.cartOpen)} – {shortDate(r.cartClose)} · follow-up to {shortDate(r.postCartEnd)}
                </p>
                {main && <p className="text-xs text-muted-foreground">Feeds into <Link href={`/client/${clientId}/registry/${main.id}`} className="underline">{main.registryId}</Link></p>}
              </div>
              {isStaff && event && (
                <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setEditing(true)} aria-label="Edit event">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </header>

            {isMain && (
              <div className="grid grid-cols-2 rounded-lg border border-border p-1" role="tablist">
                {([["total", `With ${r.miniIds.length} Mini${r.miniIds.length === 1 ? "" : "s"}`], ["own", "This event only"]] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => setScope(k)}
                    className={cn("h-10 rounded-md text-sm font-medium", scope === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[["Net revenue", usd(n.netRevenue)], ["Ad spend", usd(n.adSpend)], ["Orders", n.orders.toLocaleString()], ["Opt-ins", n.optIns.toLocaleString()]].map(([l, v]) => (
                <Card key={l} className="rounded-xl"><CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{l}</p>
                  <p className="font-heading text-2xl font-bold tabular-nums">{v}</p>
                </CardContent></Card>
              ))}
            </section>

            {(r.unmatchedInWindow.salesCount > 0 || r.unmatchedInWindow.adSpend > 0 || r.unmatchedInWindow.optIns > 0 || r.conflicts > 0) && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p>
                  During these dates the client also has unmatched data: {usd(r.unmatchedInWindow.sales)} in {r.unmatchedInWindow.salesCount} sales,
                  {" "}{usd(r.unmatchedInWindow.adSpend)} ad spend and {r.unmatchedInWindow.optIns} opt-ins.
                  {r.conflicts > 0 && ` ${r.conflicts} sales also fit another event.`}
                  {isStaff && <> <Link href={`/client/${clientId}/registry/unmatched`} className="underline">Review</Link>.</>}
                </p>
              </div>
            )}

            <Card className="rounded-xl"><CardHeader className="pb-2"><CardTitle className="text-base">Revenue</CardTitle></CardHeader>
              <CardContent><NumberGrid items={[
                ["Contracted", usdCents(n.contracted)], ["Collected", usdCents(n.collected)], ["Refunds", usdCents(n.refunds)],
                ["Net revenue", usdCents(n.netRevenue)], ["During launch", usdCents(n.cartOpenRevenue)], ["Sales team follow-up", usdCents(n.postCartRevenue)],
                ["Orders", n.orders.toLocaleString()], ["Buyers", n.buyers.toLocaleString()],
              ]} /></CardContent>
            </Card>

            <Card className="rounded-xl"><CardHeader className="pb-2"><CardTitle className="text-base">Sales by tier</CardTitle></CardHeader>
              <CardContent className="divide-y divide-border">
                {/* Until products are sorted into tiers, four $0 rows only add noise; show the tiers that sold. */}
                {TIERS.filter((t) => n.tiers[t].count > 0 || n.tiers[t].revenue !== 0 || TIERS.some((x) => n.tiers[x].count > 0) ).map((t) => (
                  <div key={t} className="flex items-baseline justify-between py-2.5 text-sm">
                    <span>{TIER_LABEL[t]}</span>
                    <span className="tabular-nums">{usd(n.tiers[t].revenue)} <span className="text-xs text-muted-foreground">· {n.tiers[t].count} sold</span></span>
                  </div>
                ))}
                {!!n.byDate?.count && (
                  <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">{TIERS.some((x) => n.tiers[x].count > 0) ? "Other sales in the event's dates" : "All sales in the event's dates"}<span className="block text-xs text-muted-foreground">Not split by tier yet</span></span>
                    <span className="shrink-0 tabular-nums">{usd(n.byDate.revenue)} <span className="text-xs text-muted-foreground">· {n.byDate.count} sold</span></span>
                  </div>
                )}
                {!TIERS.some((x) => n.tiers[x].count > 0) && !n.byDate?.count && n.offers.length === 0 && (
                  <p className="py-2.5 text-sm text-muted-foreground">No sales in this event's dates yet.</p>
                )}
                {n.offers.map((o) => (
                  <div key={o.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{o.name}{o.share < 1 && <span className="text-xs text-muted-foreground"> · our {Math.round(o.share * 100)}%</span>}</span>
                    <span className="shrink-0 tabular-nums">{usd(o.ourRevenue)} <span className="text-xs text-muted-foreground">· {o.count} sold</span></span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
              <Card className="rounded-xl"><CardHeader className="pb-2"><CardTitle className="text-base">Ads</CardTitle></CardHeader>
                <CardContent><NumberGrid items={[
                  ["Ad spend", usdCents(n.adSpend)], ["Impressions", n.impressions.toLocaleString()], ["Clicks", n.clicks.toLocaleString()],
                  ["CPM", usdCents(n.cpm)], ["CPC", usdCents(n.cpc)], ["Leads (Meta)", n.adLeads.toLocaleString()],
                ]} /></CardContent>
              </Card>
              <Card className="rounded-xl"><CardHeader className="pb-2"><CardTitle className="text-base">Opt-ins</CardTitle></CardHeader>
                <CardContent><NumberGrid items={[
                  ["Opt-ins", n.optIns.toLocaleString()], ["Opt-in rate", pct(n.optInRate)], ["Cost per opt-in", usdCents(n.costPerOptIn)],
                ]} />
                <p className="mt-3 text-xs text-muted-foreground">Opt-in rate is opt-ins per ad click.</p></CardContent>
              </Card>
            </div>

            {isMain && scope === "total" && data!.minis.length > 0 && (
              <Card className="rounded-xl"><CardHeader className="pb-2"><CardTitle className="text-base">Mini events in this total</CardTitle></CardHeader>
                <CardContent className="divide-y divide-border">
                  {data!.minis.map((m) => (
                    <Link key={m.id} href={`/client/${clientId}/registry/${m.id}`} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">{m.title} <span className="text-xs text-muted-foreground">{m.registryId}</span></span>
                      <span className="shrink-0 tabular-nums">{usd(m.own.netRevenue)} · {usd(m.own.adSpend)}</span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {isStaff && event && <OffersCard clientId={clientId!} eventId={event.id} offers={event.offers} />}
          </>
        )}
      </div>
      {isStaff && registry.data && event && (
        <EventSheet clientId={clientId!} data={registry.data} editing={editing ? event : null} onClose={() => setEditing(false)} />
      )}
    </AppLayout>
  );
}

type OfferDraft = { id?: number; name: string; productNames: string[]; priceText: string; soldThrough: string; sharePercent: string };

function OffersCard({ clientId, eventId, offers }: { clientId: string; eventId: number; offers: Offer[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<OfferDraft[] | null>(null);
  const { data: suggestions } = useQuery<Suggestions>({ queryKey: [`/api/clients/${clientId}/registry/suggestions`], enabled: !!drafts });
  const productOptions = (suggestions?.products ?? []).map((p) => ({ value: p.name, hint: `${p.source} · ${p.orders} sales` }));
  const start = () => setDrafts(offers.map((o) => ({
    id: o.id, name: o.name, productNames: o.productNames, priceText: o.priceText ?? "", soldThrough: o.soldThrough ?? "", sharePercent: String(Number(o.sharePercent)),
  })));
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/clients/${clientId}/registry/events/${eventId}/offers`,
      drafts!.filter((d) => d.name.trim() && d.productNames.length).map((d) => ({ ...d, sharePercent: Number(d.sharePercent) || 0 })))).json(),
    onSuccess: () => { invalidateRegistry(queryClient, clientId); setDrafts(null); toast({ title: "Offers saved" }); },
    onError: (e) => toast({ title: "Could not save offers", description: errorText(e), variant: "destructive" }),
  });
  const set = (i: number, patch: Partial<OfferDraft>) => setDrafts(drafts!.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Event offers</CardTitle>
        <CardDescription>Other things sold at this event. Their sales count toward it, times our share.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!drafts ? (
          <>
            {offers.length === 0 && <p className="text-sm text-muted-foreground">No offers yet.</p>}
            {offers.map((o) => (
              <div key={o.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{o.name} <span className="text-xs text-muted-foreground">· our {Number(o.sharePercent)}%</span></p>
                <p className="text-xs text-muted-foreground">{o.productNames.join("; ")}</p>
              </div>
            ))}
            <Button variant="outline" className="h-11" onClick={start}>Edit offers</Button>
          </>
        ) : (
          <>
            {drafts.map((d, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1"><Label>Offer name</Label>
                    <Input className="h-11" value={d.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="AI Agents" /></div>
                  <div className="w-24 space-y-1"><Label>Our %</Label>
                    <Input className="h-11" inputMode="decimal" value={d.sharePercent} onChange={(e) => set(i, { sharePercent: e.target.value })} /></div>
                </div>
                <ListInput label="Product names (exact)" values={d.productNames} onChange={(v) => set(i, { productNames: v })} suggestions={productOptions} placeholder="AI Agents 6-Pay" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Price / tiers</Label><Input className="h-11" value={d.priceText} onChange={(e) => set(i, { priceText: e.target.value })} placeholder="$5,000 / 6-pay" /></div>
                  <div className="space-y-1"><Label>Sold through</Label><Input className="h-11" value={d.soldThrough} onChange={(e) => set(i, { soldThrough: e.target.value })} placeholder="Stripe" /></div>
                </div>
                <Button variant="ghost" className="h-10 text-muted-foreground" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                  <Trash2 className="mr-2 h-4 w-4" />Remove offer
                </Button>
              </div>
            ))}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="h-11" onClick={() => setDrafts([...drafts, { name: "", productNames: [], priceText: "", soldThrough: "", sharePercent: "100" }])}>
                <Plus className="mr-2 h-4 w-4" />Add offer
              </Button>
              <Button className="h-11" onClick={() => save.mutate()} disabled={save.isPending}>Save offers</Button>
              <Button variant="ghost" className="h-11" onClick={() => setDrafts(null)}>Cancel</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
