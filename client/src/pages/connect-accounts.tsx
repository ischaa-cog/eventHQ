// Connect Accounts: every workspace and its ad and sales accounts on one page, so one person with
// access to everything can connect them all in one sitting. Meta: one Facebook sign-in (through
// Composio) or the agency system user covers every ad account; Stripe: one-click sign-in;
// Whop, Fanbasis and HighLevel: a key that is checked before it is saved.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Check, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Provider = "meta" | "stripe" | "whop" | "fanbasis" | "highlevel";
type Connection = { id: number; provider: Provider; displayName: string | null; externalAccountId: string; status: string; lastSyncAt: string | null; lastError: string | null };
type HubClient = { id: number; name: string; isActive: boolean; connections: Connection[] };
type Grant = { id: number; provider: string; displayName: string | null; status: string; source: string; lastError: string | null };
type Hub = { composio: boolean; grants: Grant[]; clients: HubClient[] };
type Account = { id: string; name: string; detail: string | null; connectedTo: { clientId: number; clientName: string }[]; grantId: number };

const PROVIDERS: Array<{ id: Provider; name: string; kind: "ads" | "sales" | "optins" }> = [
  { id: "meta", name: "Meta Ads", kind: "ads" },
  { id: "stripe", name: "Stripe", kind: "sales" },
  { id: "whop", name: "Whop", kind: "sales" },
  { id: "fanbasis", name: "Fanbasis", kind: "sales" },
  { id: "highlevel", name: "HighLevel", kind: "optins" },
];
const KEY_HELP: Record<"whop" | "fanbasis" | "stripe" | "highlevel", { label: string; steps: string[]; placeholder?: string }> = {
  whop: { label: "Whop API key", steps: ["In Whop, open the client's business → Developer → API keys.", "Create a key with payment and refund read permissions.", "Paste it here."] },
  fanbasis: { label: "Fanbasis API key", steps: ["In the client's Fanbasis, open Settings → API.", "Copy the API key and paste it here."] },
  stripe: { label: "Stripe restricted key", placeholder: "rk_live_…", steps: ["In Stripe, open Developers → API keys → Create restricted key.", "Give read access to Charges, Refunds, Checkout Sessions and Invoices.", "Paste it here."] },
  highlevel: { label: "Private integration token", steps: ["In the client's HighLevel sub-account, open Settings → Private Integrations.", "Create one with forms read access and copy the token.", "Copy the Location ID from Settings → Business Profile."] },
};
const errorText = (e: unknown) => {
  const raw = (e instanceof Error ? e.message : String(e)).replace(/^\d+:\s*/, "");
  try { return JSON.parse(raw).error ?? raw; } catch { return raw; }
};

export default function ConnectAccountsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const hub = useQuery<Hub>({ queryKey: ["/api/connect-hub"], refetchInterval: 30_000 });
  const [filter, setFilter] = useState<"gaps" | "all">("gaps");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState<{ client: HubClient; provider: Provider } | null>(null);

  // Back from a sign-in: say how it went, then tidy the address bar.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("oauth") === "connected") {
      toast({ title: q.get("provider") === "meta" ? "Facebook connected" : "Stripe connected", description: q.get("provider") === "meta" ? "Now add each client's ad accounts with + Meta Ads." : "The first sales arrive in a few minutes." });
    } else if (q.get("oauth_error")) {
      toast({ title: "Sign-in didn't finish", description: q.get("oauth_error") ?? "", variant: "destructive" });
    }
    if (q.has("oauth") || q.has("oauth_error")) setLocation("/connect-accounts", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clients = hub.data?.clients ?? [];
  const gapsOf = (c: HubClient) => {
    const live = c.connections.filter((x) => x.status !== "disabled");
    const out: string[] = [];
    if (!live.some((x) => x.provider === "meta")) out.push("No ad account");
    if (!live.some((x) => x.provider === "stripe" || x.provider === "whop" || x.provider === "fanbasis")) out.push("No sales account");
    const broken = live.filter((x) => x.status === "error" || x.lastError);
    if (broken.length) out.push(`${broken.length} not syncing`);
    return out;
  };
  const visible = useMemo(() => clients
    .filter((c) => showInactive || c.isActive)
    .filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((c) => filter === "all" || gapsOf(c).length > 0),
  [clients, filter, search, showInactive]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = clients.filter((c) => c.isActive);
  const done = active.filter((c) => gapsOf(c).length === 0).length;
  const inactiveCount = clients.length - active.length;
  const metaGrants = (hub.data?.grants ?? []).filter((g) => g.provider === "meta");

  const facebook = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/oauth/meta/composio-start", { returnTo: "/connect-accounts" })).json() as Promise<{ url: string }>,
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (e) => toast({ title: "Couldn't start the Facebook sign-in", description: errorText(e), variant: "destructive" }),
  });

  return (
    <AppLayout title="Connect Accounts" mode="agency">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-bold md:text-3xl">Connect Accounts</h1>
          <p className="text-sm text-muted-foreground">Each client's ad and sales accounts in one place. Numbers start filling in a few minutes after you connect.</p>
        </header>

        <Card className="rounded-xl">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="font-medium">Meta ad accounts</p>
              <p className="text-sm text-muted-foreground">
                One Facebook sign-in covers every ad account that person can see.
                {metaGrants.length > 0 && <> Connected: {metaGrants.map((g) => g.displayName ?? "Meta login").join(", ")}.</>}
              </p>
              {metaGrants.some((g) => g.status === "error") && (
                <p className="mt-1 text-sm text-destructive">A Meta login stopped working: {metaGrants.find((g) => g.status === "error")?.lastError}</p>
              )}
            </div>
            <Button className="h-11 shrink-0" onClick={() => facebook.mutate()} disabled={!hub.data?.composio || facebook.isPending} data-testid="button-facebook-signin">
              {facebook.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {metaGrants.some((g) => g.source === "composio") ? "Sign in with another Facebook" : "Sign in with Facebook"}
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2" role="tablist" aria-label="Show">
            {([["gaps", "Needs accounts"], ["all", "All clients"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                className={cn("h-9 rounded-full border px-4 text-sm font-medium", filter === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative md:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" placeholder="Find a client" aria-label="Find a client" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-9" />
          </div>
        </div>
        {hub.data && <p className="text-sm text-muted-foreground">{done} of {active.length} active clients have both an ad account and a sales account.</p>}

        {hub.isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/40" />)}</div>
        ) : hub.isError ? (
          <Card><CardContent className="p-6 text-sm text-destructive">{errorText(hub.error)}</CardContent></Card>
        ) : visible.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{filter === "gaps" ? "Every client has an ad account and a sales account." : "No clients match."}</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {visible.map((c) => (
              <ClientCard key={c.id} client={c} gaps={gapsOf(c)} onAdd={(provider) => setOpen({ client: c, provider })} onOpen={() => setLocation(`/client/${c.id}/integrations`)} />
            ))}
          </div>
        )}
        {inactiveCount > 0 && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide inactive clients" : `Show ${inactiveCount} inactive client${inactiveCount === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {open && (open.provider === "meta"
            ? <MetaPicker client={open.client} grants={metaGrants} composio={!!hub.data?.composio} onFacebook={() => facebook.mutate()} onDone={() => { setOpen(null); queryClient.invalidateQueries({ queryKey: ["/api/connect-hub"] }); }} />
            : <KeyOrSignIn client={open.client} provider={open.provider} composio={!!hub.data?.composio} onDone={() => { setOpen(null); queryClient.invalidateQueries({ queryKey: ["/api/connect-hub"] }); }} />)}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function ClientCard({ client, gaps, onAdd, onOpen }: { client: HubClient; gaps: string[]; onAdd: (p: Provider) => void; onOpen: () => void }) {
  return (
    <Card className={cn("rounded-xl", !client.isActive && "opacity-70")} data-testid={`hub-client-${client.id}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{client.name}{!client.isActive && <span className="ml-2 text-xs text-muted-foreground">inactive</span>}</p>
            {gaps.length > 0
              ? <p className="text-sm text-amber-400">{gaps.join(" · ")}</p>
              : <p className="text-sm text-muted-foreground">Ads and sales connected</p>}
          </div>
          <Button variant="ghost" size="sm" className="h-9 shrink-0 px-2 text-muted-foreground" onClick={onOpen} aria-label={`Open ${client.name}'s integrations`}>
            Details <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {PROVIDERS.map((p) => {
            const rows = client.connections.filter((x) => x.provider === p.id && x.status !== "disabled");
            return (
              <div key={p.id} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 lg:flex-col lg:items-start">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{p.name}</p>
                  {rows.length === 0 ? null : rows.map((r) => {
                    const bad = r.status === "error" || !!r.lastError;
                    return (
                      <p key={r.id} className={cn("flex items-center gap-1 truncate text-sm", bad && "text-destructive")} title={bad ? r.lastError ?? "Not syncing" : r.lastSyncAt ? `Synced ${format(new Date(r.lastSyncAt), "MMM d, h:mm a")}` : "First sync running"}>
                        {bad ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                        <span className="truncate">{r.displayName || r.externalAccountId || p.name}</span>
                      </p>
                    );
                  })}
                </div>
                <Button variant={rows.length ? "ghost" : "outline"} size="sm" className="h-9 shrink-0 px-3" onClick={() => onAdd(p.id)} data-testid={`add-${p.id}-${client.id}`}
                  aria-label={`${rows.length ? "Add another" : "Connect"} ${p.name} for ${client.name}`}>
                  <Plus className="h-4 w-4" />{rows.length ? null : <span className="ml-1">Connect</span>}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function MetaPicker({ client, grants, composio, onFacebook, onDone }: { client: HubClient; grants: Grant[]; composio: boolean; onFacebook: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const usable = grants.filter((g) => g.status !== "error");
  const accounts = useQuery<Account[]>({
    queryKey: ["hub-meta-accounts", usable.map((g) => g.id).join(",")],
    enabled: usable.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(usable.map(async (g) => {
        const r = await fetch(`/api/oauth/grants/${g.id}/accounts`, { credentials: "include" });
        if (!r.ok) return [];
        const body = await r.json();
        return (body.accounts ?? []).map((a: Omit<Account, "grantId">) => ({ ...a, grantId: g.id }));
      }));
      const seen = new Map<string, Account>();
      for (const a of lists.flat() as Account[]) if (!seen.has(a.id)) seen.set(a.id, a);
      return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const connect = useMutation({
    mutationFn: async (a: Account) => (await apiRequest("POST", `/api/clients/${client.id}/integrations/from-grant`, { grantId: a.grantId, accountId: a.id, accountName: a.name })).json(),
    onSuccess: (_d, a) => { toast({ title: `${a.name} connected to ${client.name}`, description: "Ad spend starts filling in within a few minutes." }); onDone(); },
    onError: (e) => toast({ title: "Couldn't connect that ad account", description: errorText(e), variant: "destructive" }),
  });
  const shown = (accounts.data ?? []).filter((a) => !search.trim() || `${a.name} ${a.detail ?? ""} ${a.id}`.toLowerCase().includes(search.trim().toLowerCase()));
  const sorted = [...shown].sort((a, b) => Number(a.connectedTo.length > 0) - Number(b.connectedTo.length > 0));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Meta ad account for {client.name}</DialogTitle>
        <DialogDescription>Pick the ad account that runs this client's ads. Accounts already used by another client are listed last.</DialogDescription>
      </DialogHeader>
      {usable.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No Meta login is connected yet. Sign in with a Facebook account that can see this client's ad account.</p>
          <Button className="h-11 w-full" onClick={onFacebook} disabled={!composio}>Sign in with Facebook</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus type="search" placeholder="Search ad accounts" aria-label="Search ad accounts" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 pl-9" />
          </div>
          {accounts.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading ad accounts…</div>
          ) : (
            <ul className="max-h-[50dvh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {sorted.length === 0 && <li className="p-4 text-sm text-muted-foreground">No ad accounts match.</li>}
              {sorted.map((a) => {
                const mine = a.connectedTo.some((c) => c.clientId === client.id);
                const others = a.connectedTo.filter((c) => c.clientId !== client.id);
                return (
                  <li key={a.id}>
                    <button type="button" disabled={mine || connect.isPending} onClick={() => {
                      if (others.length && !window.confirm(`${a.name} is already connected to ${others.map((o) => o.clientName).join(", ")}. Connect it here too? Only do this for a shared ad account, then set which websites belong to ${client.name} in its Integrations page.`)) return;
                      connect.mutate(a);
                    }} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/50 disabled:opacity-60">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[a.detail, others.length ? `On ${others.map((o) => o.clientName).join(", ")}` : null].filter(Boolean).join(" · ")}</span>
                      </span>
                      {mine ? <Badge variant="outline">Connected</Badge> : connect.isPending && connect.variables?.id === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Don't see it? <button type="button" className="underline" onClick={onFacebook} disabled={!composio}>Sign in with a Facebook account</button> that can see it, or share it with the eventHQ system user in Meta Business Settings.
          </p>
        </div>
      )}
    </>
  );
}

function KeyOrSignIn({ client, provider, composio, onDone }: { client: HubClient; provider: Exclude<Provider, "meta">; composio: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [showKey, setShowKey] = useState(provider !== "stripe" || !composio);
  const name = PROVIDERS.find((p) => p.id === provider)!.name;
  const help = KEY_HELP[provider];

  const stripeSignIn = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${client.id}/integrations/stripe/oauth-start`, { returnTo: "/connect-accounts" })).json() as Promise<{ url: string }>,
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (e) => toast({ title: "Couldn't start the Stripe sign-in", description: errorText(e), variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${client.id}/integrations/key`, { provider, apiKey: apiKey.trim(), accountId: accountId.trim() || undefined })).json(),
    onSuccess: () => { toast({ title: `${name} connected to ${client.name}`, description: "The first numbers arrive in a few minutes." }); onDone(); },
    onError: (e) => toast({ title: `That ${name} key didn't work`, description: errorText(e), variant: "destructive" }),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{name} for {client.name}</DialogTitle>
        <DialogDescription>{provider === "highlevel" ? "Opt-ins from the client's funnel pages." : "Sales and refunds start syncing as soon as it's connected."}</DialogDescription>
      </DialogHeader>
      {provider === "stripe" && composio && (
        <div className="space-y-2">
          <Button className="h-11 w-full" onClick={() => stripeSignIn.mutate()} disabled={stripeSignIn.isPending}>
            {stripeSignIn.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in with Stripe
          </Button>
          {!showKey && <button type="button" className="w-full text-center text-sm text-muted-foreground underline" onClick={() => setShowKey(true)}>Paste a restricted key instead</button>}
        </div>
      )}
      {showKey && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{help.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          {provider === "highlevel" && (
            <div className="space-y-1">
              <Label htmlFor="hub-location">Location ID</Label>
              <Input id="hub-location" className="h-11" value={accountId} onChange={(e) => setAccountId(e.target.value)} autoComplete="off" required />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="hub-key">{help.label}</Label>
            <Input id="hub-key" type="password" className="h-11" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={help.placeholder} autoComplete="off" required />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={save.isPending || apiKey.trim().length < 8}>
            {save.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking the key…</> : `Check and connect`}
          </Button>
        </form>
      )}
    </>
  );
}
