// Central place for environment-derived settings, so features don't each guess at them.

// The app's public address, used to build OAuth redirect URIs and links back into the app.
// APP_URL wins when set. Otherwise Vercel's own system variables are used, which exist on every
// deployment without any dashboard setup: the production domain for production, the deployment
// URL for previews.
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return `http://localhost:${process.env.PORT || 5000}`;
}

export const isProduction = () => process.env.NODE_ENV === "production";

// Settings the app cannot run without. Checked once at startup so a missing value fails loudly
// with a clear message instead of as scattered 500s.
const REQUIRED = ["DATABASE_URL", "SESSION_SECRET"] as const;

export function checkConfig(): void {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  if (isProduction() && (process.env.SESSION_SECRET?.length ?? 0) < 32) {
    console.warn("[config] SESSION_SECRET is shorter than 32 characters; use a long random value.");
  }
}

export const neoForClients = () => !!process.env.OPENAI_API_KEY && process.env.NEO_FOR_CLIENTS === "1";

// Which optional features can actually work in this deployment. The UI hides what is off.
export function features() {
  const onVercel = !!process.env.VERCEL;
  return {
    // Generation runs after the response is sent; Vercel can stop the function mid-job, so it stays
    // off there until it moves to a durable queue. ENABLE_AI_GENERATION=1 overrides for testing.
    aiGeneration: !!process.env.OPENAI_API_KEY && (!onVercel || process.env.ENABLE_AI_GENERATION === "1"),
    neoChat: !!process.env.OPENAI_API_KEY,
    // Neo AI is hidden from client logins until it passes its test set; the agency team keeps it.
    // NEO_FOR_CLIENTS=1 shows it to clients again.
    neoForClients: neoForClients(),
    email: !!process.env.MAIL_FROM && (!!process.env.RESEND_API_KEY || !!process.env.REPLIT_CONNECTORS_HOSTNAME),
    googleDrive: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    metaOAuth: !!process.env.META_APP_ID && !!process.env.META_APP_SECRET,
  };
}
