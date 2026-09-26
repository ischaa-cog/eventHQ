import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import "./client-login.css";

export default function ClientLogin({ mode = "client" }: { mode?: "client" | "admin" }) {
  const { isAuthenticated, user } = useAuth();
  const wrongPortal = isAuthenticated && (
    mode === "client" ? user?.role !== "agency_client" : user?.role === "agency_client"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function signInDemo(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password, portal: mode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      window.location.assign(result.redirect);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
      setSubmitting(false);
    }
  }

  return (
    <main className="client-login">
      <section className="client-login-visual" aria-label="EventHQ client workspace">
        <div className="client-login-grid" />
        <div className="client-login-orbit client-login-orbit-one" />
        <div className="client-login-orbit client-login-orbit-two" />
        <div className="client-login-visual-copy">
          <p className="client-login-eyebrow"><span /> PRIVATE CLIENT WORKSPACE</p>
          <h1>Your events,<br /><em>in motion.</em></h1>
          <p>One clear place to plan, launch, and see what is working.</p>
        </div>
        <div className="client-login-steps" aria-hidden="true">
          <span>YOUR WORKSPACE</span>
          <div><span>01</span> Plan the experience</div>
          <div><span>02</span> Launch with confidence</div>
          <div><span>03</span> Learn and grow</div>
        </div>
        <div className="client-login-visual-footer"><span>EVENTHQ</span><span>BUILT FOR EVENT PROFESSIONALS</span></div>
      </section>

      <section className="client-login-panel">
        <div className="client-login-panel-inner">
          <header className="client-login-brand">
            <img src="/logo-light.png" alt="EventHQ" />
            <span className="client-login-brand-rule" />
            <span>{mode === "admin" ? "Admin access" : "Client access"}</span>
          </header>
          <div className="client-login-welcome">
            <div className="client-login-mark"><LockKeyhole size={18} strokeWidth={1.8} /></div>
            <p className="client-login-kicker">WELCOME TO EVENTHQ</p>
            <h2>Enter your<br /><span>workspace.</span></h2>
            <p className="client-login-intro">Sign in to plan, launch, and track your events—all in one place.</p>
          </div>
          {wrongPortal && (
            <div className="client-demo-access" role="alert">
              <div className="client-demo-heading">This is a {mode === "client" ? "staff" : "client"} account</div>
              <p>{mode === "client"
                ? "Your account has internal access, not a client-only workspace. Contact your agency administrator if this is incorrect."
                : "Your account has client access, not admin access."}</p>
              <a href="/" className="client-login-button">
                Open your assigned view <ArrowRight size={18} />
              </a>
              <a href="/api/logout" className="client-login-help">Sign out to use another account</a>
            </div>
          )}
          {!isAuthenticated && (
            <div className="client-demo-access">
              <div className="client-demo-heading">Sign in with email</div>
              <p>{mode === "admin"
                ? "Enter your admin account credentials to continue."
                : "Enter your client account credentials to continue."}</p>
              <form onSubmit={signInDemo} className="client-demo-form">
                <label htmlFor="demo-email">Email address</label>
                <input id="demo-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required />
                <label htmlFor="demo-password">Password</label>
                <div className="client-demo-password">
                  <input id="demo-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
                  <button
                    type="button"
                    className="client-demo-password-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(visible => !visible)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {error && <p role="alert" className="client-demo-error">{error}</p>}
                <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
              </form>
            </div>
          )}
          {!wrongPortal && (
            <a className="client-login-button" href={isAuthenticated ? "/" : `/api/login?portal=${mode}`} data-testid="button-client-login">
              {isAuthenticated ? "Open your workspace" : "Invited account? Sign in with Replit"}
              <ArrowRight size={18} />
            </a>
          )}
          <div className="client-login-assurance">
            <ShieldCheck size={19} strokeWidth={1.7} />
            <div>
              <strong>Your workspace, protected</strong>
              <p>Your account opens only the workspace and permissions assigned to you.</p>
            </div>
          </div>
          <p className="client-login-help">Have a Replit invitation? Use Replit sign-in. Otherwise, enter the email and password provided to you above.</p>
          <footer className="client-login-bottom">
            <span><Check size={14} /> Private client workspace</span>
            <span>EventHQ</span>
          </footer>
        </div>
      </section>
    </main>
  );
}