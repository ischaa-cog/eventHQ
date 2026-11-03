// Admin page for one client: connect sales and ad accounts, and link products and campaigns to events.
// Secrets typed here go to the server once and are stored encrypted; the page only ever shows a
// masked hint ("rk_live_…a1b2") afterwards.
import { useMemo, useState } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Copy, Loader2, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Connection = {
  id: number; provider: string; externalAccountId: string; displayName: string | null; status: string;
  lastSyncAt: string | null; lastWebhookAt: string | null; lastError: string | null; hasWebhookSecret: boolean;
  credentialHints: Record<string, string>; webhookUrl: string | null;
};
type Attribution = {
  rules: Array<{ id: number; eventPerformanceId: number; kind: "product" | "campaign"; provider: string; matchValue: string; label: string | null }>;
  products: Array<{ provider: string; productId: string; productName: string | null; revenue: number; orders: number; lastSale: string }>;
  campaigns: Array<{ provider: string; campaignId: string; campaignName: string | null; spend: number; firstDay: string; lastDay: string }>;
};
type EventPerf = { id: number; title: string; eventType: string; startDate: string };

type Field = { key: string; label: string; placeholder?: string; secret?: boolean; required?: boolean; help?: string };
const PROVIDERS: Record<string, { name: string; blurb: string; account?: Field; fields: Field[]; webhookSecret?: Field }> = {
  meta: {
    name: "Meta Ads",
    blurb: "Daily spend, leads and purchases for each campaign.",
    account: { key: "externalAccountId", label: "Ad account ID", placeholder: "325842589618123", required: true, help: "The number after act_ in Ads Manager." },
    fields: [
      { key: "accessToken", label: "Access token", secret: true, required: true, help: "A system user token with ads_read. One token can cover every ad account." },
      { key: "appSecret", label: "App secret", secret: true, help: "Optional. Needed when the Meta app requires a secret proof." },
    ],
  },
  whop: {
    name: "Whop",
    blurb: "Payments and refunds. The API key needs payment and refund read permissions.",
    fields: [{ key: "apiKey", label: "Company API key", secret: true, required: true, help: "Whop → Developer → API keys. Turn on payment:basic:read." }],
    webhookSecret: { key: "webhookSecret", label: "Webhook signing secret", secret: true, help: "Optional. Adds instant updates; paste the URL shown after saving into Whop's webhook settings." },
  },
  stripe: {
    name: "Stripe",
    blurb: "Charges and refunds. HighLevel wallet recharges are left out automatically.",
    account: { key: "externalAccountId", label: "Label for this account", placeholder: "Main account", required: true, help: "Anything that tells two Stripe accounts apart." },
    fields: [{ key: "secretKey", label: "Restricted key", secret: true, required: true, placeholder: "rk_live_…", help: "Read access to Charges, Refunds, Checkout Sessions and Invoices is enough." }],
  },
  fanbasis: {
    name: "Fanbasis",
    blurb: "Transactions and refunds.",
    fields: [{ key: "apiKey", label: "API key", secret: true, required: true }],
  },
};

const ago = (v: string | null) => (v ? format(new Date(v), "MMM d, h:mm a") : "never");
const usd = (v: number) => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  const body = raw.replace(/^\d+:\s*/, "");
  try { return JSON.parse(body).error || body; } catch { return body; }
};

export default function IntegrationsPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const search = new URLSearchParams(useSearch());
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "agency_admin";
  const [tab, setTab] = useState(search.get("tab") === "links" ? "links" : "connections");

  return (
    <AppLayout mode="client" title="Integrations" pageContext="Integrations">
      <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
        <header>
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">Integrations</h1>
          <p className="text-sm text-muted-foreground">Where this client's revenue and ad spend come from.</p>
        </header>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid">
            <TabsTrigger value="connections" className="h-10">Connections</TabsTrigger>
            <TabsTrigger value="links" className="h-10">Link to events</TabsTrigger>
          </TabsList>
          <TabsContent value="connections" className="mt-4">
            {isAdmin ? <Connections clientId={clientId!} /> : <p className="text-sm text-muted-foreground">Only admins can manage connections.</p>}
          </TabsContent>
          <TabsContent value="links" className="mt-4">
            <EventLinks clientId={clientId!} focusEventId={Number(search.get("event")) || null} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function Connections({ clientId }: { clientId: string }) {
  const key = [`/api/clients/${clientId}/integrations`];
  const { data: connections = [], isLoading } = useQuery<Connection[]>({ queryKey: key });
  const [adding, setAdding] = useState<string | null>(null);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-4">
      {Object.entries(PROVIDERS).map(([provider, info]) => {
        const rows = connections.filter((c) => c.provider === provider);
        return (
          <Card key={provider} className="rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{info.name}</CardTitle>
                  <CardDescription>{info.blurb}</CardDescription>
                </div>
                {rows.length > 0 && <Badge variant="outline" className="shrink-0">{rows.length} connected</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((c) => <ConnectionRow key={c.id} connection={c} clientId={clientId} />)}
              {adding === provider ? (
                <ConnectForm provider={provider} clientId={clientId} onDone={() => setAdding(null)} />
              ) : (
                <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={() => setAdding(provider)} data-testid={`button-add-${provider}`}>
                  <Plus className="mr-2 h-4 w-4" />{rows.length ? `Add another ${info.name} account` : `Connect ${info.name}`}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">
        HighLevel sales keep arriving through the workspace webhook in Client Profile. If those same sales also go
        through a Stripe account connected here, leave one of the two off so they are not counted twice.
      </p>
    </div>
  );
}

function ConnectionRow({ connection: c, clientId }: { connection: Connection; clientId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/integrations`] });
  const sync = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/integrations/${c.id}/sync`)).json(),
    onSuccess: (r: { sales: number; refunds: number; spendRows: number; complete: boolean }) => {
      toast({
        title: r.complete ? "Synced" : "Partly synced",
        description: c.provider === "meta"
          ? `${r.spendRows} campaign-days updated.`
          : `${r.sales} sales and ${r.refunds} refunds updated.${r.complete ? "" : " Sync again to finish."}`,
      });
    },
    onError: (e) => toast({ title: "Sync failed", description: errorText(e), variant: "destructive" }),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/clients/${clientId}/integrations/${c.id}`)).json(),
    onSuccess: invalidate,
  });
  const ok = c.status === "active" && !c.lastError;
  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid={`connection-${c.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <TriangleAlert className="h-4 w-4 text-amber-400" />}
            <span className="truncate">{c.displayName || c.externalAccountId || PROVIDERS[c.provider]?.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Last sync {ago(c.lastSyncAt)}{c.lastWebhookAt ? ` · last webhook ${ago(c.lastWebhookAt)}` : ""}
          </p>
          <p className="truncate text-xs text-muted-foreground">{Object.values(c.credentialHints).join(" · ")}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => sync.mutate()} disabled={sync.isPending} aria-label="Sync now">
            <RefreshCw className={sync.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label="Disconnect"
            onClick={() => { if (window.confirm("Disconnect this account? Sales already synced stay in the dashboard.")) remove.mutate(); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {c.lastError && <p className="rounded bg-amber-500/10 p-2 text-xs text-amber-200">{c.lastError}</p>}
      {c.webhookUrl && c.hasWebhookSecret && <CopyField label="Webhook URL for Whop" value={c.webhookUrl} />}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="h-11 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Copy"
          onClick={() => navigator.clipboard?.writeText(value).then(() => toast({ title: "Copied" }), () => undefined)}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ConnectForm({ provider, clientId, onDone }: { provider: string; clientId: string; onDone: () => void }) {
  const info = PROVIDERS[provider];
  const [values, setValues] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));
  const save = useMutation({
    mutationFn: async () => {
      const credentials = Object.fromEntries(info.fields.filter((f) => values[f.key]?.trim()).map((f) => [f.key, values[f.key].trim()]));
      const body: Record<string, unknown> = {
        provider,
        externalAccountId: info.account ? (values.externalAccountId ?? "").trim().replace(/^act_/, "") : "",
        displayName: values.displayName?.trim() || null,
        credentials,
      };
      if (info.webhookSecret && values.webhookSecret?.trim()) body.webhookSecret = values.webhookSecret.trim();
      const saved: Connection = await (await apiRequest("PUT", `/api/clients/${clientId}/integrations`, body)).json();
      // First sync right away so the dashboard fills in.
      await apiRequest("POST", `/api/clients/${clientId}/integrations/${saved.id}/sync`).catch(() => undefined);
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/integrations`] });
      toast({ title: `${info.name} connected`, description: "The first sync has run. Open the dashboard to see the numbers." });
      onDone();
    },
    onError: (e) => toast({ title: "Could not connect", description: errorText(e), variant: "destructive" }),
  });
  const fields = [
    ...(info.account ? [info.account] : []),
    { key: "displayName", label: "Name shown in the dashboard", placeholder: info.name },
    ...info.fields,
    ...(info.webhookSecret ? [info.webhookSecret] : []),
  ] as Field[];
  const missing = fields.some((f) => f.required && !values[f.key]?.trim());
  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(e) => { e.preventDefault(); if (!missing) save.mutate(); }}
      autoComplete="off"
    >
      {fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <Label htmlFor={`${provider}-${f.key}`}>{f.label}{f.required ? "" : " (optional)"}</Label>
          <Input
            id={`${provider}-${f.key}`} className="h-11" placeholder={f.placeholder}
            type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false}
            value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
          />
          {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
        </div>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="h-11" disabled={missing || save.isPending}>
          {save.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting and syncing…</> : "Save and sync"}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function EventLinks({ clientId, focusEventId }: { clientId: string; focusEventId: number | null }) {
  const key = [`/api/clients/${clientId}/attribution`];
  const { data, isLoading } = useQuery<Attribution>({ queryKey: key });
  const { data: events = [] } = useQuery<EventPerf[]>({ queryKey: [`/api/clients/${clientId}/event-performance`] });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(`/api/clients/${clientId}/money-summary`) });
  };
  const link = useMutation({
    mutationFn: async (body: { eventPerformanceId: number; kind: "product" | "campaign"; provider: string; matchValue: string; label: string | null }) =>
      (await apiRequest("PUT", `/api/clients/${clientId}/attribution`, body)).json(),
    onSuccess: invalidate,
    onError: (e) => toast({ title: "Could not link", description: errorText(e), variant: "destructive" }),
  });
  const unlink = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/clients/${clientId}/attribution/${id}`)).json(),
    onSuccess: invalidate,
  });

  const ruleFor = useMemo(() => {
    const m = new Map<string, Attribution["rules"][number]>();
    for (const r of data?.rules ?? []) m.set(`${r.kind}|${r.provider}|${r.matchValue}`, r);
    return m;
  }, [data]);
  const sortedEvents = [...events].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  const matches = (text: string | null) => !filter || (text ?? "").toLowerCase().includes(filter.toLowerCase());

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!events.length) {
    return (
      <Card className="rounded-xl"><CardContent className="p-4 text-sm text-muted-foreground">
        Add events in <Link href={`/client/${clientId}/events`} className="underline">Event Tracker</Link> first, then link what each one sells.
      </CardContent></Card>
    );
  }

  const picker = (kind: "product" | "campaign", provider: string, matchValue: string, label: string | null) => {
    const rule = ruleFor.get(`${kind}|${provider}|${matchValue}`);
    return (
      <Select
        value={rule ? String(rule.eventPerformanceId) : "none"}
        onValueChange={(v) => {
          if (v === "none") { if (rule) unlink.mutate(rule.id); return; }
          link.mutate({ eventPerformanceId: Number(v), kind, provider, matchValue, label });
        }}
      >
        <SelectTrigger className="h-11 w-full sm:w-64" aria-label={`Event for ${label ?? matchValue}`}>
          <SelectValue placeholder="Not linked" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not linked</SelectItem>
          {sortedEvents.map((e) => (
            <SelectItem key={e.id} value={String(e.id)}>{e.title} · {format(new Date(e.startDate), "MMM d, yyyy")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const focus = focusEventId ? events.find((e) => e.id === focusEventId) : undefined;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {focus ? <>Choose what <span className="font-medium text-foreground">{focus.title}</span> sold and which ads promoted it. </> : null}
        Each sale of a linked product, and each dollar spent on a linked campaign, counts toward that event. Past sales move over when you link.
      </p>
      <Input className="h-11" placeholder="Search products and campaigns" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <Card className="rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Products</CardTitle><CardDescription>From synced sales, highest revenue first.</CardDescription></CardHeader>
        <CardContent className="divide-y divide-border">
          {(data?.products ?? []).filter((p) => matches(p.productName) || matches(p.productId)).slice(0, 200).map((p) => (
            <div key={`${p.provider}|${p.productId}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.productName ?? p.productId}</p>
                <p className="text-xs text-muted-foreground">{p.provider} · {usd(p.revenue)} · {p.orders} orders · last {format(new Date(p.lastSale), "MMM d")}</p>
              </div>
              {picker("product", p.provider, p.productId, p.productName)}
            </div>
          ))}
          {!data?.products.length && <p className="py-3 text-sm text-muted-foreground">No synced products yet. Connect a sales account first.</p>}
        </CardContent>
      </Card>
      <Card className="rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Ad campaigns</CardTitle><CardDescription>From synced ad accounts, highest spend first.</CardDescription></CardHeader>
        <CardContent className="divide-y divide-border">
          {(data?.campaigns ?? []).filter((c) => matches(c.campaignName) || matches(c.campaignId)).slice(0, 200).map((c) => (
            <div key={`${c.provider}|${c.campaignId}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.campaignName ?? c.campaignId}</p>
                <p className="text-xs text-muted-foreground">{usd(c.spend)} · {format(new Date(c.firstDay), "MMM d")} – {format(new Date(c.lastDay), "MMM d")}</p>
              </div>
              {picker("campaign", c.provider, c.campaignId, c.campaignName)}
            </div>
          ))}
          {!data?.campaigns.length && <p className="py-3 text-sm text-muted-foreground">No synced campaigns yet. Connect Meta Ads first.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
