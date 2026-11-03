// Public page a client opens from a link their account manager sends. No login: the link itself
// is the permission, and it only lets them add accounts to their own workspace.
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, Loader2, LogIn, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LinkInfo = {
  clientName: string; expiresAt: string; stripeOAuth: boolean;
  connections: Array<{ provider: string; displayName: string | null; status: string; lastSyncAt: string | null }>;
};
type KeyProvider = "whop" | "fanbasis" | "stripe";

// Plain fetch so a 401 here never sends the visitor to a login screen.
async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method, credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || text || res.statusText), { status: res.status });
  return data as T;
}

const NAMES: Record<string, string> = { stripe: "Stripe", whop: "Whop", fanbasis: "Fanbasis" };

export default function ConnectLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => call<LinkInfo>("GET", `/api/connect/${token}`).then(setInfo, () => setFailed(true));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setNotice({ ok: true, text: `${NAMES[connected] ?? "Account"} is connected. Thank you.` });
    else if (error) setNotice({ ok: false, text: error });
    if (connected || error) window.history.replaceState(null, "", window.location.pathname);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-md space-y-4">
        {failed ? (
          <Card className="rounded-xl">
            <CardContent className="space-y-2 p-5">
              <p className="flex items-center gap-2 font-medium"><TriangleAlert className="h-5 w-5 text-amber-400" />Link not working</p>
              <p className="text-sm text-muted-foreground">This link has expired. Ask your account manager for a new one.</p>
            </CardContent>
          </Card>
        ) : !info ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <header className="space-y-1">
              <h1 className="font-heading text-2xl font-bold tracking-tight">Connect {info.clientName}'s accounts</h1>
              <p className="text-sm text-muted-foreground">
                This lets your dashboard show sales and refunds automatically. Read-only: nothing can be charged or changed.
              </p>
            </header>
            {notice && (
              <p className={`rounded-lg p-3 text-sm ${notice.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-200"}`}>{notice.text}</p>
            )}
            <StripeCard token={token!} info={info} onSaved={load} />
            <KeyCard
              token={token!} info={info} provider="whop" onSaved={load}
              label="Company API key"
              steps={["Open your Whop dashboard and go to Developer, then API keys.", "Create a key with payment and refund read permissions.", "Paste the key here."]}
            />
            <KeyCard
              token={token!} info={info} provider="fanbasis" onSaved={load}
              label="API key"
              steps={["In Fanbasis, open Settings, then API.", "Copy your API key and paste it here."]}
            />
            <p className="text-center text-xs text-muted-foreground">Skip anything you don't use.</p>
          </>
        )}
      </div>
    </div>
  );
}

function connectedOf(info: LinkInfo, provider: string) {
  return info.connections.filter((c) => c.provider === provider);
}

function Connected({ rows }: { rows: LinkInfo["connections"] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1">
      {rows.map((c, i) => (
        <p key={i} className="flex items-center gap-1.5 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="truncate">Connected{c.displayName ? `: ${c.displayName}` : ""}</span>
        </p>
      ))}
    </div>
  );
}

function StripeCard({ token, info, onSaved }: { token: string; info: LinkInfo; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(!info.stripeOAuth);
  const rows = connectedOf(info, "stripe");
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await call<{ url: string }>("POST", `/api/connect/${token}/stripe`);
      window.location.href = url;
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stripe</CardTitle>
        <CardDescription>Charges and refunds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Connected rows={rows} />
        {info.stripeOAuth && (
          <Button className="h-11 w-full" onClick={start} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
            {rows.length ? "Connect another Stripe account" : "Connect with Stripe"}
          </Button>
        )}
        {error && <p className="text-xs text-amber-200">{error}</p>}
        {info.stripeOAuth && !showKey ? (
          <Button variant="ghost" className="h-11 w-full" onClick={() => setShowKey(true)}>Paste a key instead</Button>
        ) : (
          <KeyForm
            token={token} provider="stripe" label="Restricted key" placeholder="rk_live_…" onSaved={onSaved}
            steps={[
              "In Stripe, open Developers, then API keys, then Create restricted key.",
              "Give Read access to Charges, Refunds, Checkout Sessions, Invoices and Products.",
              "Paste the rk_live_ key here.",
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

function KeyCard({ token, info, provider, label, steps, onSaved }: {
  token: string; info: LinkInfo; provider: KeyProvider; label: string; steps: string[]; onSaved: () => void;
}) {
  const rows = connectedOf(info, provider);
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{NAMES[provider]}</CardTitle>
        <CardDescription>Payments and refunds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Connected rows={rows} />
        <KeyForm token={token} provider={provider} label={label} steps={steps} onSaved={onSaved} />
      </CardContent>
    </Card>
  );
}

function KeyForm({ token, provider, label, placeholder, steps, onSaved }: {
  token: string; provider: KeyProvider; label: string; placeholder?: string; steps: string[]; onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const id = `connect-${provider}-key`;
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await call<{ ok: true; displayName: string | null }>("POST", `/api/connect/${token}/key`, { provider, apiKey: apiKey.trim() });
      setApiKey("");
      setMessage({ ok: true, text: `Connected${r.displayName ? `: ${r.displayName}` : ""}.` });
      onSaved();
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="space-y-3" autoComplete="off" onSubmit={(e) => { e.preventDefault(); if (apiKey.trim()) submit(); }}>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id} type="password" className="h-11" placeholder={placeholder} autoComplete="off" spellCheck={false}
          value={apiKey} onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={!apiKey.trim() || busy}>
        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking the key…</> : "Save key"}
      </Button>
      {message && <p className={`text-xs ${message.ok ? "text-emerald-300" : "text-amber-200"}`}>{message.text}</p>}
    </form>
  );
}
