import { ArrowRight, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import "./client-login.css";

export function ClientLogin() {
  return (
    <main className="client-login">
      <section className="login-visual" aria-label="EventHQ client workspace">
        <div className="visual-grid" />
        <div className="visual-orbit orbit-one" />
        <div className="visual-orbit orbit-two" />
        <div className="visual-copy">
          <div className="eyebrow"><span /> PRIVATE CLIENT WORKSPACE</div>
          <h1>Your events,<br /><em>in motion.</em></h1>
          <p>One clear place to plan smarter, move faster, and see what is working.</p>
        </div>
        <div className="orientation-card" aria-label="EventHQ workspace orientation">
          <div className="orientation-label">YOUR WORKSPACE</div>
          <div><span>01</span> Plan the experience</div>
          <div><span>02</span> Launch with confidence</div>
          <div><span>03</span> Learn and grow</div>
        </div>
        <div className="visual-footer"><span>EVENTHQ</span><span>BUILT FOR EVENT PROFESSIONALS</span></div>
      </section>

      <section className="login-panel">
        <div className="panel-inner">
          <header className="brand-lockup">
            <img src="/__mockup/images/eventhq-logo.png" alt="EventHQ" />
            <span className="brand-rule" />
            <span>Client access</span>
          </header>

          <div className="welcome">
            <div className="welcome-mark"><LockKeyhole size={17} strokeWidth={1.8} /></div>
            <p className="kicker">WELCOME TO EVENTHQ</p>
            <h2>Enter your<br /><span>workspace.</span></h2>
            <p className="intro">Your event plans, training, and performance are all in one private place. Sign in with the account your EventHQ team invited.</p>
          </div>

          <a className="continue-button" href="/api/login" data-testid="button-client-login">
            Continue to secure sign in <ArrowRight size={18} strokeWidth={2} />
          </a>

          <div className="assurance">
            <div className="assurance-icon"><ShieldCheck size={18} strokeWidth={1.7} /></div>
            <div>
              <strong>Invite-only access</strong>
              <p>Only the workspaces shared with your account will be available after you sign in.</p>
            </div>
          </div>

          <p className="help-row">Need access? Ask your EventHQ team for an invitation link.</p>

          <div className="panel-bottom">
            <span><Check size={13} /> Private client workspace</span>
            <span>EventHQ</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default ClientLogin;