// Normalizing rules from the Event Registry SOP. Both sides of every comparison go through these.

// lowercase; strip http(s)://, www., query string (UTMs), #fragment and trailing slashes.
export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  v = v.split("#")[0].split("?")[0];
  v = v.replace(/\/+$/, "");
  return v || null;
}

// Exact product name, case-insensitive, trimmed (inner runs of spaces collapse to one).
export function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().replace(/\s+/g, " ").toLowerCase();
  return v || null;
}

// Cells that hold several values separate them with ";". Arrays pass through.
export function splitList(value: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(value) ? value : (value ?? "").split(";");
  return parts.map((p) => p.trim()).filter(Boolean);
}

export const REGISTRY_TIMEZONE = process.env.REGISTRY_TIMEZONE || "America/New_York";

// Calendar day of a moment in the registry time zone, as YYYY-MM-DD.
export function dayIn(date: Date, timeZone = REGISTRY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const TIERS = ["vip", "platinum", "mainOffer", "postCart"] as const;
export type Tier = typeof TIERS[number];
export type TierProducts = Partial<Record<Tier, string[]>>;
