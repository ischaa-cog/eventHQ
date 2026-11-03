// Forgot password, reset password and accept-invite pages. They share the sign-in page's look and
// work whether or not someone is signed in.
import { useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, KeyRound, MailCheck, UserPlus } from "lucide-react";
import "./client-login.css";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

function Shell({ icon, kicker, title, intro, children }: { icon: ReactNode; kicker: string; title: ReactNode; intro: string; children: ReactNode }) {
  return (
    <main className="client-login">
      <section className="client-login-visual" aria-hidden="true">
        <div className="client-login-grid" />
        <div className="client-login-orbit client-login-orbit-one" />
        <div className="client-login-orbit client-login-orbit-two" />
        <div className="client-login-visual-copy">
          <p className="client-login-eyebrow"><span /> PRIVATE CLIENT WORKSPACE</p>
          <h1>Your events,<br /><em>in motion.</em></h1>
          <p>One clear place to plan, launch, and see what is working.</p>
        </div>
        <div className="client-login-visual-footer"><span>EVENTHQ</span><span>BUILT FOR EVENT PROFESSIONALS</span></div>
      </section>
      <section className="client-login-panel">
        <div className="client-login-panel-inner">
          <header className="client-login-brand">
            <img src="/logo-light.png" alt="EventHQ" />
            <span className="client-login-brand-rule" />
            <span>Account</span>
          </header>
          <div className="client-login-welcome">
            <div className="client-login-mark">{icon}</div>
            <p className="client-login-kicker">{kicker}</p>
            <h2>{title}</h2>
            <p className="client-login-intro">{intro}</p>
          </div>
          {children}
          <p className="client-login-help"><a href="/client-login"><ArrowLeft size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> Back to sign in</a></p>
        </div>
      </section>
    </main>
  );
}

function PasswordInput({ id, value, onChange, autoComplete = "new-password" }: { id: string; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="client-demo-password">
      <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} minLength={8} value={value} onChange={(e) => onChange(e.target.value)} required />
      <button type="button" className="client-demo-password-toggle" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setSent((await postJson("/api/password/forgot", { email })).message);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell icon={<KeyRound size={18} strokeWidth={1.8} />} kicker="FORGOT PASSWORD" title={<>Reset your<br /><span>password.</span></>}
      intro="Enter the email you sign in with and we'll send a link to choose a new password.">
      <div className="client-demo-access">
        {sent ? (
          <>
            <div className="client-demo-heading"><MailCheck size={16} style={{ display: "inline", verticalAlign: "-3px" }} /> Check your email</div>
            <p data-testid="text-forgot-sent">{sent} The link works for one hour. If nothing arrives, ask your workspace owner or agency to reset it for you.</p>
          </>
        ) : (
          <form onSubmit={submit} className="client-demo-form">
            <label htmlFor="forgot-email">Email address</label>
            <input id="forgot-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {error && <p role="alert" className="client-demo-error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          </form>
        )}
      </div>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const check = useQuery<{ valid: boolean }>({ queryKey: [`/api/password/reset/${token}`], retry: false });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    setError("");
    setBusy(true);
    try {
      await postJson("/api/password/reset", { token, password });
      setDone(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell icon={<KeyRound size={18} strokeWidth={1.8} />} kicker="NEW PASSWORD" title={<>Choose a new<br /><span>password.</span></>}
      intro="Use at least 8 characters. Every device signed in to this account will be signed out.">
      <div className="client-demo-access">
        {done ? (
          <>
            <div className="client-demo-heading">Password changed</div>
            <p>You can sign in with your new password now.</p>
            <a href="/client-login" className="client-login-button">Sign in</a>
          </>
        ) : check.isLoading ? (
          <p>Checking your link…</p>
        ) : !check.data?.valid ? (
          <>
            <div className="client-demo-heading">This link has expired</div>
            <p>Reset links work once and for one hour. Ask for a new one.</p>
            <a href="/forgot-password" className="client-login-button">Send a new link</a>
          </>
        ) : (
          <form onSubmit={submit} className="client-demo-form">
            <label htmlFor="reset-password">New password</label>
            <PasswordInput id="reset-password" value={password} onChange={setPassword} />
            <label htmlFor="reset-confirm">Type it again</label>
            <PasswordInput id="reset-confirm" value={confirm} onChange={setConfirm} />
            {error && <p role="alert" className="client-demo-error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
          </form>
        )}
      </div>
    </Shell>
  );
}

type InvitePreview = { email: string | null; workspaceName: string; clientRole: "owner" | "member"; status: "valid" | "expired" | "used" };

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const invite = useQuery<InvitePreview>({ queryKey: [`/api/invites/${token}`], retry: false });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await postJson(`/api/invites/${token}/accept`, { firstName, lastName, password });
      window.location.assign(result.redirect);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  const data = invite.data;
  return (
    <Shell icon={<UserPlus size={18} strokeWidth={1.8} />} kicker="YOU'RE INVITED"
      title={<>Join<br /><span>{data?.workspaceName ?? "your workspace"}.</span></>}
      intro={data?.clientRole === "owner"
        ? "You'll be an owner: you can see everything and manage who else has access."
        : "You'll see the workspace's dashboard, events and results."}>
      <div className="client-demo-access">
        {invite.isLoading ? <p>Checking your invite…</p>
          : invite.isError || !data ? (
            <>
              <div className="client-demo-heading">This invite link isn't valid</div>
              <p>Ask whoever invited you to send a new link.</p>
            </>
          ) : data.status !== "valid" ? (
            <>
              <div className="client-demo-heading">{data.status === "used" ? "This invite was already used" : "This invite has expired"}</div>
              <p>{data.status === "used" ? "Sign in with the email and password you chose." : "Invites last 7 days. Ask for a new one."}</p>
              {data.status === "used" && <a href="/client-login" className="client-login-button">Sign in</a>}
            </>
          ) : (
            <form onSubmit={submit} className="client-demo-form">
              <label htmlFor="invite-email">Email address</label>
              <input id="invite-email" type="email" value={data.email ?? ""} readOnly autoComplete="username" />
              <label htmlFor="invite-first">First name</label>
              <input id="invite-first" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              <label htmlFor="invite-last">Last name</label>
              <input id="invite-last" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              <label htmlFor="invite-password">Choose a password</label>
              <PasswordInput id="invite-password" value={password} onChange={setPassword} />
              {error && <p role="alert" className="client-demo-error">{error}</p>}
              <button type="submit" disabled={busy}>{busy ? "Creating your login…" : "Join workspace"}</button>
            </form>
          )}
      </div>
    </Shell>
  );
}
