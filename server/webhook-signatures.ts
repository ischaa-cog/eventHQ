// Signature checks for incoming provider webhooks, so only the provider can post sales.
// Both compare against the exact raw request body captured in app.ts (req.rawBody).
import { createHmac, timingSafeEqual } from "crypto";

const TOLERANCE_SECONDS = 5 * 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function freshTimestamp(seconds: number, now = Date.now()): boolean {
  return Number.isFinite(seconds) && Math.abs(now / 1000 - seconds) <= TOLERANCE_SECONDS;
}

// Standard Webhooks (used by Whop): headers webhook-id, webhook-timestamp, webhook-signature
// ("v1,<base64>" entries separated by spaces). Signed content is "<id>.<timestamp>.<body>".
// Secrets come as "whsec_<base64 key>" or as a raw string; both forms are accepted.
export function verifyStandardWebhook(
  rawBody: Buffer | string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  now = Date.now(),
): boolean {
  const header = (name: string) => {
    const value = headers[name] ?? headers[name.replace(/^webhook-/, "svix-")];
    return Array.isArray(value) ? value[0] : value;
  };
  const id = header("webhook-id");
  const timestamp = header("webhook-timestamp");
  const signatures = header("webhook-signature");
  if (!id || !timestamp || !signatures || !freshTimestamp(Number(timestamp), now)) return false;

  const keys = secret.startsWith("whsec_")
    ? [Buffer.from(secret.slice(6), "base64")]
    : [Buffer.from(secret, "utf8"), Buffer.from(secret, "base64")];
  const content = `${id}.${timestamp}.${rawBody.toString()}`;
  const expected = keys.map((key) => createHmac("sha256", key).update(content).digest("base64"));
  return signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    return version === "v1" && !!signature && expected.some((e) => safeEqual(e, signature));
  });
}

// Stripe: header Stripe-Signature "t=<timestamp>,v1=<hex>[,v1=...]". Signed content is "<t>.<body>".
export function verifyStripeSignature(rawBody: Buffer | string, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || !signatures.length || !freshTimestamp(Number(timestamp), now)) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString()}`).digest("hex");
  return signatures.some((s) => safeEqual(expected, s));
}

// Test helpers: build valid signatures the way each provider does.
export function signStandardWebhook(body: string, secret: string, id: string, timestamp: number): string {
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}
export function signStripe(body: string, secret: string, timestamp: number): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}
