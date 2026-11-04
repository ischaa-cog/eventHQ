// The VA's Monday list: every sale, ad and opt-in that matched no event (or more than one),
// grouped by its raw product name or page link. One tap adds the missing name or link to an event.
import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { TIERS, TIER_LABEL, errorText, shortDate, usd, type RegistryEventRow } from "@/components/registry/shared";
import { invalidateRegistry, useRegistry } from "./event-registry";

type Status = "unmatched" | "window" | "conflict";
type Groups = {
  status: Status;
  sales: Array<{ name: string | null; source: string; note: string | null; count: number; amount: number; first: string; last: string; events: number[] }>;
  spend: Array<{ url: string | null; campaignId: string; campaignName: string | null; adName: string | null; note: string | null; amount: number; first: string; last: string; events: number[] }>;
  optIns: Array<{ url: string | null; title: string | null; note: string | null; count: number; first: string; last: string; events: number[] }>;
};
type Fix = { kind: "product" | "page" | "campaign"; value: string; label: string };

export default function RegistryUnmatchedPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const [status, setStatus] = useState<Status>("unmatched");
  const { data, isLoading } = useQuery<Groups>({ queryKey: [`/api/clients/${clientId}/registry/unmatched?status=${status}`] });
  const registry = useRegistry(clientId);
  const [fix, setFix] = useState<Fix | null>(null);
  const events = (registry.data?.events ?? []).filter((e) => e.funnelRole);
  const name = (ids: number[]) => ids.map((id) => events.find((e) => e.id === id)?.registryId ?? `#${id}`).join(", ");

  return (
    <AppLayout mode="client" title="Unmatched" pageContext="Unmatched event data">
      <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
        <Link href={`/client/${clientId}/registry`} className="inline-flex h-10 items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />All events</Link>
        <header>
          <h1 className="font-heading text-2xl font-bold tracking-tight">{STATUS_LABEL[status]}</h1>
          <p className="text-sm text-muted-foreground">{STATUS_HELP[status]}</p>
        </header>
        <div className="grid grid-cols-3 rounded-lg border border-border p-1" role="tablist">
          {(["unmatched", "window", "conflict"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={status === k} onClick={() => setStatus(k)}
              className={cn("h-10 rounded-md text-sm font-medium", status === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {STATUS_LABEL[k]}
            </button>
          ))}
        </div>
        {isLoading || !data ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
          <Tabs defaultValue="sales">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sales" className="h-10">Sales ({data.sales.length})</TabsTrigger>
              <TabsTrigger value="spend" className="h-10">Ads ({data.spend.length})</TabsTrigger>
              <TabsTrigger value="optins" className="h-10">Opt-ins ({data.optIns.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="sales" className="mt-4 space-y-2">
              {data.sales.length === 0 && <Empty />}
              {data.sales.map((g, i) => (
                <Row key={i} title={g.name ?? "(no product name)"} amount={usd(g.amount)}
                  detail={`${g.source} · ${g.count} payment${g.count === 1 ? "" : "s"} · ${shortDate(g.first)} – ${shortDate(g.last)}`}
                  note={status !== "unmatched" ? `Went to ${name(g.events)} · ${g.note ?? ""}` : g.note}
                  action={g.name ? () => setFix({ kind: "product", value: g.name!, label: g.name! }) : undefined} actionLabel="Add product to an event" />
              ))}
            </TabsContent>
            <TabsContent value="spend" className="mt-4 space-y-2">
              {data.spend.length === 0 && <Empty />}
              {data.spend.map((g, i) => (
                <Row key={i} title={g.url ?? g.campaignName ?? g.campaignId} amount={usd(g.amount)}
                  detail={`${g.campaignName ?? g.campaignId} · ${shortDate(g.first)} – ${shortDate(g.last)}`}
                  note={status !== "unmatched" ? `Went to ${name(g.events)} · ${g.note ?? ""}` : g.note}
                  action={() => setFix(g.url ? { kind: "page", value: g.url, label: g.url } : { kind: "campaign", value: g.campaignId, label: g.campaignName ?? g.campaignId })}
                  actionLabel={g.url ? "Add page to an event" : "Add campaign to an event"} />
              ))}
            </TabsContent>
            <TabsContent value="optins" className="mt-4 space-y-2">
              {data.optIns.length === 0 && <Empty />}
              {data.optIns.map((g, i) => (
                <Row key={i} title={g.url ?? "(no page recorded)"} amount={`${g.count}`}
                  detail={`${g.title ?? "Opt-in page"} · ${shortDate(g.first)} – ${shortDate(g.last)}`}
                  note={status !== "unmatched" ? `Went to ${name(g.events)} · ${g.note ?? ""}` : g.note}
                  action={g.url ? () => setFix({ kind: "page", value: g.url!, label: g.url! }) : undefined} actionLabel="Add page to an event" />
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
      <FixDialog clientId={clientId!} fix={fix} events={events} onClose={() => setFix(null)} />
    </AppLayout>
  );
}

const STATUS_LABEL: Record<Status, string> = { unmatched: "Unmatched", window: "By date only", conflict: "Conflicts" };
const STATUS_HELP: Record<Status, string> = {
  unmatched: "Nothing here counts toward any event. Each line usually means a date is missing, or it falls outside every event's dates.",
  window: "These count toward the event whose dates they fall in, but their product or page is not on its list. Add them to the right list for exact tier numbers.",
  conflict: "These fit more than one event. They went to the event with the latest cart open; fix the dates if that's wrong.",
};

function Empty() {
  return <Card className="rounded-xl"><CardContent className="p-4 text-sm text-muted-foreground">Nothing here.</CardContent></Card>;
}

function Row({ title, amount, detail, note, action, actionLabel }: {
  title: string; amount: string; detail: string; note?: string | null; action?: () => void; actionLabel: string;
}) {
  return (
    <Card className="rounded-xl"><CardContent className="space-y-2 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 break-words text-sm font-medium">{title}</p>
        <p className="shrink-0 font-semibold tabular-nums">{amount}</p>
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {action && <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={action}>{actionLabel}</Button>}
    </CardContent></Card>
  );
}

function FixDialog({ clientId, fix, events, onClose }: { clientId: string; fix: Fix | null; events: RegistryEventRow[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [eventId, setEventId] = useState<string>("");
  const [target, setTarget] = useState<string>("vip");
  const event = events.find((e) => String(e.id) === eventId);
  const save = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/registry/assign`, {
      eventId: Number(eventId), kind: fix!.kind, value: fix!.value,
      ...(fix!.kind === "product" ? (target.startsWith("offer:") ? { offerId: Number(target.slice(6)) } : { tier: target }) : {}),
    })).json(),
    onSuccess: () => {
      invalidateRegistry(queryClient, clientId);
      toast({ title: "Added", description: "Everything matching it moved onto the event." });
      onClose();
    },
    onError: (e) => toast({ title: "Could not add", description: errorText(e), variant: "destructive" }),
  });
  return (
    <Dialog open={!!fix} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to an event</DialogTitle>
          <DialogDescription className="break-words">{fix?.label}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Event</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Pick an event" /></SelectTrigger>
              <SelectContent>
                {events.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.registryId} · {e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {fix?.kind === "product" && (
            <div className="space-y-1.5">
              <Label>Sold as</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>)}
                  {(event?.offers ?? []).map((o) => <SelectItem key={o.id} value={`offer:${o.id}`}>Offer: {o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button className="h-11 w-full sm:w-auto" disabled={!eventId || save.isPending} onClick={() => save.mutate()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
