// Admin page for one client: connect sales and ad accounts, and link products and campaigns to events.
// Secrets typed here go to the server once and are stored encrypted; the page only ever shows a
// masked hint ("rk_live_…a1b2") afterwards.
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Copy, Loader2, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Connection = {
  id: number; provider: string; externalAccountId: string; displayName: string | null; status: string;
  lastSyncAt: string | null; lastWebhookAt: string | null; lastError: string | null; hasWebhookSecret: boolean;
  credentialHints: Record<string, string>; webhookUrl: string | null;
};

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
  highlevel: {
    name: "HighLevel opt-ins",
    blurb: "Form submissions from funnel pages, with the page each came from. Sales still arrive by the workspace webhook.",
    account: { key: "externalAccountId", label: "Location ID", placeholder: "Fk0BkQ526NRxmsgT6LhH", required: true, help: "Settings → Business Profile in the sub-account." },
    fields: [{ key: "apiKey", label: "Private integration token", secret: true, required: true, help: "Settings → Private Integrations. Needs forms read access." }],
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
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "agency_admin";

  return (
    <AppLayout mode="client" title="Integrations" pageContext="Integrations">
      <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
        <header>
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">Integrations</h1>
          <p className="text-sm text-muted-foreground">Where this client's revenue and ad spend come from.</p>
        </header>
        {isAdmin ? <Connections clientId={clientId!} /> : <p className="text-sm text-muted-foreground">Only admins can manage connections.</p>}
        <Card className="rounded-xl">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Which ads, opt-ins and sales belong to which event is set in Event Results, by dates, page links and product names.</p>
            <Button asChild variant="outline" className="h-11 shrink-0"><Link href={`/client/${clientId}/registry`}>Open Event Results</Link></Button>
          </CardContent>
        </Card>
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
    onSuccess: (r: { sales: number; refunds: number; spendRows: number; optIns: number; complete: boolean }) => {
      toast({
        title: r.complete ? "Synced" : "Partly synced",
        description: c.provider === "meta"
          ? `${r.spendRows} ad-days updated.`
          : c.provider === "highlevel"
          ? `${r.optIns} opt-ins updated.${r.complete ? "" : " Sync again to finish."}`
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
