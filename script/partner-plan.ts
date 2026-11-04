// The partner plan shared by connect-partners.ts and verify-partners.ts: which accounts each
// partner workspace gets, with keys read from the credentials file (never printed).
import { readFileSync } from "fs";
import { homedir } from "os";

export type Mapping = {
  match: string;
  code?: string;
  meta?: string[];
  whop?: string;
  stripe?: Array<{ label: string; key: string }>;
  fanbasis?: string;
  highlevel?: { locationId: string; key: string };
};

export const args = process.argv.slice(2);
export const flag = (name: string) => args.includes(`--${name}`);
export const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const expand = (p: string) => p.replace(/^~(?=\/)/, homedir());

export function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export type Planned = { partner: string; provider: string; externalAccountId: string; displayName: string; credentials: Record<string, string> };

export function loadPlan() {
  const envPath = expand(value("env") ?? "~/adflow-dashboard/.env");
  const mapPath = expand(value("map") ?? "partners.local.json");


  const env = readEnv(envPath);
  const mappings: Mapping[] = JSON.parse(readFileSync(mapPath, "utf8"));
  const need = (name: string | undefined) => (name ? env[name] || undefined : undefined);

  const planned: Planned[] = [];
  const problems: string[] = [];
  for (const m of mappings) {
    for (const account of m.meta ?? []) {
      if (!env.META_ACCESS_TOKEN) problems.push(`${m.match}: META_ACCESS_TOKEN missing`);
      else planned.push({ partner: m.match, provider: "meta", externalAccountId: account.replace(/^act_/, ""), displayName: `Meta ${account}`,
        credentials: { accessToken: env.META_ACCESS_TOKEN, ...(env.META_APP_SECRET ? { appSecret: env.META_APP_SECRET } : {}) } });
    }
    if (m.whop) {
      const k = need(m.whop);
      if (!k) problems.push(`${m.match}: ${m.whop} missing`); else planned.push({ partner: m.match, provider: "whop", externalAccountId: "", displayName: "Whop", credentials: { apiKey: k } });
    }
    for (const s of m.stripe ?? []) {
      const k = need(s.key);
      if (!k) problems.push(`${m.match}: ${s.key} missing`); else planned.push({ partner: m.match, provider: "stripe", externalAccountId: s.label, displayName: `Stripe · ${s.label}`, credentials: { secretKey: k } });
    }
    if (m.fanbasis) {
      const k = need(m.fanbasis);
      if (!k) problems.push(`${m.match}: ${m.fanbasis} missing`); else planned.push({ partner: m.match, provider: "fanbasis", externalAccountId: "", displayName: "Fanbasis", credentials: { apiKey: k } });
    }
    if (m.highlevel) {
      const k = need(m.highlevel.key);
      if (!k || !m.highlevel.locationId) problems.push(`${m.match}: HighLevel key or location missing`);
      else planned.push({ partner: m.match, provider: "highlevel", externalAccountId: m.highlevel.locationId, displayName: "HighLevel opt-ins", credentials: { apiKey: k } });
    }
  }
  return { env, mappings, planned, problems };
}
