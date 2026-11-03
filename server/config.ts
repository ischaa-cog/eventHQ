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
