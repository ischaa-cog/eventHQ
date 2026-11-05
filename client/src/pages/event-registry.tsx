// Event Results: every event in the registry, Main events with the Minis that feed them,
// each with its numbers. Staff add and edit events and the client's usual products here.
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Plus, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  EventForm, ListInput, TIERS, TIER_LABEL, errorText, shortDate, toFormValue, toPayload, usd,
  type EventFormValue, type RegistryData, type RegistryEventRow, type Report, type Suggestions, type TierProducts,
} from "@/components/registry/shared";

export function useRegistry(clientId: string | undefined) {
  return useQuery<RegistryData>({ queryKey: [`/api/clients/${clientId}/registry`], enabled: !!clientId });
}

export function invalidateRegistry(queryClient: ReturnType<typeof useQueryClient>, clientId: string) {
  queryClient.invalidateQueries({ predicate: (q) => {
    const k = String(q.queryKey[0]);
    return k.startsWith(`/api/clients/${clientId}/registry`) || k.startsWith(`/api/clients/${clientId}/money-summary`);
  } });
}

export default function EventRegistryPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isStaff = user?.role === "owner" || user?.role === "agency_admin" || user?.role === "team_member";
  const { data, isLoading } = useRegistry(clientId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<RegistryEventRow | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const rematch = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/registry/rematch`)).json(),
    onSuccess: () => { invalidateRegistry(queryClient, clientId!); toast({ title: "Numbers updated" }); },
    onError: (e) => toast({ title: "Could not update", description: errorText(e), variant: "destructive" }),
  });

  const registered = (data?.events ?? []).filter((e) => e.funnelRole);
  const reports = new Map((data?.reports ?? []).map((r) => [r.id, r]));
  const mains = registered.filter((e) => e.funnelRole === "main");
  const orphans = registered.filter((e) => e.funnelRole === "mini" && !mains.some((m) => m.id === e.feedsIntoId));
  const unmatchedTotal = data ? data.unmatched.sales + data.unmatched.spend + data.unmatched.optIns : 0;
  const errors = (data?.problems ?? []).filter((p) => p.level === "error");

  return (
    <AppLayout mode="client" title="Event Results" pageContext="Event registry and per-event results">
      <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">Event Results</h1>
            <p className="text-sm text-muted-foreground">Ad spend, opt-ins and sales for each event, by its dates, pages and products.</p>
          </div>
          {isStaff && (
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => rematch.mutate()} disabled={rematch.isPending} aria-label="Re-match all data">
                <RefreshCw className={rematch.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              </Button>
              <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setSettingsOpen(true)} aria-label="Client code and usual products">
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </header>

        {isStaff && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11" onClick={() => setEditing("new")} data-testid="button-add-event"><Plus className="mr-2 h-4 w-4" />Add event</Button>
            <Button asChild variant="outline" className="h-11">
              <Link href={`/client/${clientId}/registry/unmatched`}>
                Unmatched{unmatchedTotal ? ` (${unmatchedTotal})` : ""}{data?.unmatched.conflicts ? ` · ${data.unmatched.conflicts} conflicts` : ""}{data?.unmatched.byDate ? ` · ${data.unmatched.byDate} by date` : ""}
              </Link>
            </Button>
          </div>
        )}

        {isStaff && (data?.problems.length ?? 0) > 0 && (
          <Card className={errors.length ? "border-amber-500/40" : ""}>
            <CardContent className="space-y-1.5 p-4 text-sm">
              <p className="flex items-center gap-2 font-medium"><TriangleAlert className="h-4 w-4 text-amber-400" />Needs attention</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {data!.problems.slice(0, 8).map((p, i) => <li key={i} className={p.level === "error" ? "text-amber-200" : ""}>{p.message}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : registered.length === 0 ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">
            No events in the registry yet. {isStaff ? "Add the next Main event and the Minis that feed it." : "Your team adds events here as they are booked."}
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {mains.map((m) => (
              <MainCard key={m.id} main={m} minis={registered.filter((e) => e.feedsIntoId === m.id)} reports={reports} clientId={clientId!} />
            ))}
            {orphans.length > 0 && (
              <Card className="rounded-xl">
                <CardHeader className="pb-2"><CardTitle className="text-base">Mini events without a Main</CardTitle></CardHeader>
                <CardContent className="space-y-2">{orphans.map((e) => <EventLine key={e.id} event={e} report={reports.get(e.id)} clientId={clientId!} />)}</CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {isStaff && data && (
        <>
          <EventSheet clientId={clientId!} data={data} editing={editing} onClose={() => setEditing(null)} />
          <SettingsSheet key={settingsOpen ? "open" : "closed"} clientId={clientId!} data={data} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </>
      )}
    </AppLayout>
  );
}

// ROAS is hidden for now; the server still works it out.
function Figures({ revenue, spend }: { revenue: number; spend: number }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[["Net revenue", usd(revenue)], ["Ad spend", usd(spend)]].map(([l, v]) => (
        <div key={l} className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p>
          <p className="truncate font-semibold tabular-nums">{v}</p>
        </div>
      ))}
    </div>
  );
}

function MainCard({ main, minis, reports, clientId }: { main: RegistryEventRow; minis: RegistryEventRow[]; reports: Map<number, Report>; clientId: string }) {
  const r = reports.get(main.id);
  const total = r?.withMinis ?? r?.own;
  return (
    <Card className="overflow-hidden rounded-xl" data-testid={`main-${main.id}`}>
      <Link href={`/client/${clientId}/registry/${main.id}`} className="block p-4 hover:bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Main</Badge>
              <span className="text-xs text-muted-foreground">{main.registryId}</span>
            </div>
            <p className="mt-1 truncate font-medium">{main.title}</p>
            <p className="text-xs text-muted-foreground">Cart {shortDate(main.cartOpen)} – {shortDate(main.cartClose)} · follow-up to {shortDate(main.postCartEnd)}</p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        {total && <div className="mt-3"><Figures revenue={total.netRevenue} spend={total.adSpend} /></div>}
        {minis.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Includes {minis.length} Mini event{minis.length === 1 ? "" : "s"}</p>}
      </Link>
      {minis.length > 0 && (
        <div className="space-y-2 border-t border-border bg-muted/10 p-3">
          {minis.map((e) => <EventLine key={e.id} event={e} report={reports.get(e.id)} clientId={clientId} />)}
        </div>
      )}
    </Card>
  );
}

function EventLine({ event: e, report: r, clientId }: { event: RegistryEventRow; report?: Report; clientId: string }) {
  return (
    <Link href={`/client/${clientId}/registry/${e.id}`} className="block rounded-lg border border-border bg-card p-3 hover:bg-muted/30">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium"><Badge variant="outline" className="mr-2">Mini</Badge>{e.title}</p>
          <p className="text-xs text-muted-foreground">{e.registryId} · cart {shortDate(e.cartOpen)} – {shortDate(e.cartClose)}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      {r && <div className="mt-2"><Figures revenue={r.own.netRevenue} spend={r.own.adSpend} /></div>}
    </Link>
  );
}

export function EventSheet({ clientId, data, editing, onClose }: {
  clientId: string; data: RegistryData; editing: RegistryEventRow | "new" | null; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [value, setValue] = useState<EventFormValue>(toFormValue());
  const [openedFor, setOpenedFor] = useState<unknown>(null);
  if (editing !== openedFor) {
    setOpenedFor(editing);
    setValue(toFormValue(editing && editing !== "new" ? editing : undefined));
  }
  const { data: suggestions } = useQuery<Suggestions>({ queryKey: [`/api/clients/${clientId}/registry/suggestions`], enabled: !!editing });
  const mains = data.events.filter((e) => e.funnelRole === "main" && (editing === "new" || e.id !== (editing as RegistryEventRow | null)?.id));
  const save = useMutation({
    mutationFn: async () => {
      const body = toPayload(value);
      const res = editing && editing !== "new"
        ? await apiRequest("PUT", `/api/clients/${clientId}/registry/events/${editing.id}`, body)
        : await apiRequest("POST", `/api/clients/${clientId}/registry/events`, body);
      return res.json();
    },
    onSuccess: (r: { registryId: string }) => {
      invalidateRegistry(queryClient, clientId);
      toast({ title: `Saved ${r.registryId}`, description: "Its numbers are updated." });
      onClose();
    },
    onError: (e) => toast({ title: "Could not save", description: errorText(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/clients/${clientId}/registry/events/${(editing as RegistryEventRow).id}`)).json(),
    onSuccess: () => { invalidateRegistry(queryClient, clientId); onClose(); },
  });
  const ready = value.title.trim() && value.eventStart;
  const [fillNote, setFillNote] = useState<string | null>(null);
  const fill = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/registry/suggest-dates`, {
      eventStart: value.eventStart, eventEnd: value.eventEnd || null, pageLinks: value.pageLinks, adCampaignIds: value.adCampaignIds,
    })).json(),
    onSuccess: (r: FilledDates) => {
      setValue({ ...value, adsStart: r.adsStart ?? value.adsStart, cartOpen: r.cartOpen, cartClose: r.cartClose, postCartEnd: r.postCartEnd });
      setFillNote(fillText(r));
    },
    onError: (e) => toast({ title: "Could not fill dates", description: errorText(e), variant: "destructive" }),
  });
  const fillButton = (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <Button type="button" variant="outline" className="h-11 w-full" disabled={!value.eventStart || fill.isPending} onClick={() => fill.mutate()}>
        {fill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Fill dates from ads
      </Button>
      <p className="text-xs text-muted-foreground">
        {fillNote ?? (value.eventStart
          ? "Uses the event dates and page links above: ads start when they began spending, the cart closes a week after the event, and the sales team's follow-up counts for a month after that. Check before saving."
          : "Add the event start date and page links first.")}
      </p>
    </div>
  );
  return (
    <Sheet open={!!editing} onOpenChange={(o) => { if (!o) { setFillNote(null); onClose(); } }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle>{editing === "new" ? "Add event" : `Edit ${(editing as RegistryEventRow | null)?.registryId ?? "event"}`}</SheetTitle>
          <SheetDescription>Dates, page links and products decide which ads, opt-ins and sales count.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <EventForm value={value} onChange={setValue} mains={mains} suggestions={suggestions} defaults={data.settings.defaultProducts} afterPages={fillButton} />
        </div>
        <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row">
          {editing && editing !== "new" && (
            <Button variant="ghost" className="h-11 text-muted-foreground sm:mr-auto"
              onClick={() => { if (window.confirm("Take this event out of the registry? Its Event Tracker numbers stay.")) remove.mutate(); }}>
              Remove from registry
            </Button>
          )}
          <Button className="h-11" onClick={() => save.mutate()} disabled={!ready || save.isPending} data-testid="button-save-event">
            {save.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save event"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SettingsSheet({ clientId, data, open, onClose }: { clientId: string; data: RegistryData; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [code, setCode] = useState(data.settings.eventCode ?? "");
  const [defaults, setDefaults] = useState<TierProducts>(data.settings.defaultProducts ?? {});
  const [values, setValues] = useState(data.settings.contractValues.map((c) => ({ productName: c.productName, fullValue: String(Number(c.fullValue)) })));
  const [rules, setRules] = useState({
    cartDays: String(data.settings.dateRules?.cartDays ?? 7),
    followUpDays: String(data.settings.dateRules?.followUpDays ?? 30),
    adsLookbackDays: String(data.settings.dateRules?.adsLookbackDays ?? 60),
  });
  const [loose, setLoose] = useState(data.settings.dateRules?.countAllInWindow ?? true);
  const { data: suggestions } = useQuery<Suggestions>({ queryKey: [`/api/clients/${clientId}/registry/suggestions`], enabled: open });
  const productOptions = useMemo(() => (suggestions?.products ?? []).map((p) => ({ value: p.name, hint: `${p.source} · ${p.orders} sales` })), [suggestions]);
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/clients/${clientId}/registry/settings`, {
      eventCode: code.trim() || null, defaultProducts: defaults,
      contractValues: values.filter((v) => v.productName.trim() && Number(v.fullValue) > 0),
      dateRules: { cartDays: Number(rules.cartDays) || 0, followUpDays: Number(rules.followUpDays) || 0, adsLookbackDays: Number(rules.adsLookbackDays) || 60, countAllInWindow: loose },
    })).json(),
    onSuccess: () => { invalidateRegistry(queryClient, clientId); toast({ title: "Saved" }); onClose(); },
    onError: (e) => toast({ title: "Could not save", description: errorText(e), variant: "destructive" }),
  });
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle>Client code, products and date rules</SheetTitle>
          <SheetDescription>Events use these unless they list their own.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label htmlFor="reg-code">Client code</Label>
            <Input id="reg-code" className="h-11 uppercase" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CA" />
            <p className="text-xs text-muted-foreground">Event IDs look like {code || "CA"}-2611-MINI.</p>
          </div>
          {TIERS.map((t) => (
            <ListInput key={t} label={`Usual ${TIER_LABEL[t]} product`} values={defaults[t] ?? []}
              onChange={(v) => setDefaults({ ...defaults, [t]: v })} suggestions={productOptions} placeholder="Exact product name" />
          ))}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Date rules</CardTitle>
              <CardDescription>What "Fill dates from ads" uses for this client's events.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="col-span-full flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" checked={loose} onChange={(e) => setLoose(e.target.checked)} data-testid="toggle-count-all" />
                <span className="text-sm">
                  <span className="font-medium">Count everything in an event's dates</span>
                  <span className="block text-xs text-muted-foreground">
                    Sales, ad spend and opt-ins inside an event's dates count toward it even when the product or page is not listed yet. Turn off once the lists are complete for exact numbers.
                  </span>
                </span>
              </label>
              {([
                ["cartDays", "Cart stays open", "days after the event"],
                ["followUpDays", "Sales team follow-up", "days after cart close"],
                ["adsLookbackDays", "Look for ads", "days before the event"],
              ] as const).map(([k, label, unit]) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`rule-${k}`}>{label}</Label>
                  <Input id={`rule-${k}`} className="h-11" inputMode="numeric" value={rules[k]}
                    onChange={(e) => setRules({ ...rules, [k]: e.target.value.replace(/[^0-9]/g, "") })} />
                  <p className="text-[11px] text-muted-foreground">{unit}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Full plan values</CardTitle>
              <CardDescription>For payment plans, the full amount a buyer commits to. Used for contracted revenue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {values.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Input className="h-11" list="plan-products" placeholder="AI Agents 6-Pay" value={v.productName}
                    onChange={(e) => setValues(values.map((x, j) => (j === i ? { ...x, productName: e.target.value } : x)))} />
                  <Input className="h-11 w-28" inputMode="decimal" placeholder="5000" value={v.fullValue}
                    onChange={(e) => setValues(values.map((x, j) => (j === i ? { ...x, fullValue: e.target.value } : x)))} />
                </div>
              ))}
              <datalist id="plan-products">{productOptions.map((o) => <option key={o.value} value={o.value} />)}</datalist>
              <Button variant="outline" className="h-11" onClick={() => setValues([...values, { productName: "", fullValue: "" }])}>
                <Plus className="mr-2 h-4 w-4" />Add plan
              </Button>
            </CardContent>
          </Card>
        </div>
        <SheetFooter className="border-t border-border p-4">
          <Button className="h-11 w-full sm:w-auto" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type FilledDates = {
  adsStart: string | null; cartOpen: string; cartClose: string; postCartEnd: string;
  basis: { firstSpend: string | null; lastSpend: string | null; adSpend: number; alreadyRunning: boolean };
  rules: { cartDays: number; followUpDays: number };
};

function fillText(r: FilledDates) {
  const after = `Cart closes ${r.rules.cartDays} days after the event; sales team follow-up counts ${r.rules.followUpDays} more days.`;
  if (!r.basis.firstSpend) return `No ad spend found on these pages, so the cart opens on the first event day. ${after} Check before saving.`;
  const ran = `Ads spent ${usd(r.basis.adSpend)} from ${shortDate(r.basis.firstSpend)} to ${shortDate(r.basis.lastSpend!)}.`;
  const evergreen = r.basis.alreadyRunning ? " They were already running at the start of the search window, so Ads start may need to be earlier." : "";
  return `${ran}${evergreen} ${after} Check before saving.`;
}
