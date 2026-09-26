import { storage } from "./storage";

const META_API_VERSION = "v19.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

function getAppCredentials() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Meta App credentials not configured. Please set META_APP_ID and META_APP_SECRET.");
  }
  return { appId, appSecret };
}

export function getRedirectUri(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPL_SLUG
    ? `https://${process.env.REPL_SLUG}.replit.dev`
    : "http://localhost:5000";
  return `${domain}/api/clients/meta-ads/callback`;
}

export function getOAuthUrl(clientId: number, nonce: string): string {
  const { appId } = getAppCredentials();
  const redirectUri = encodeURIComponent(getRedirectUri());
  const scope = encodeURIComponent("ads_read");
  // State carries clientId + nonce; the nonce is the real security check
  // (verified against the server-side session in the callback)
  const state = encodeURIComponent(JSON.stringify({ clientId, nonce }));
  return `https://www.facebook.com/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&response_type=code`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const { appId, appSecret } = getAppCredentials();
  const redirectUri = getRedirectUri();

  // Exchange code for short-lived token
  const tokenRes = await fetch(
    `${META_GRAPH_URL}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
  );
  const tokenData = await tokenRes.json() as any;
  if (tokenData.error) throw new Error(tokenData.error.message);

  const shortToken = tokenData.access_token;

  // Exchange for long-lived token (~60 days)
  const longRes = await fetch(
    `${META_GRAPH_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
  );
  const longData = await longRes.json() as any;
  if (longData.error) throw new Error(longData.error.message);

  return longData.access_token;
}

export async function getAdAccounts(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(
    `${META_GRAPH_URL}/me/adaccounts?fields=id,name&access_token=${accessToken}`
  );
  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message);
  return data.data || [];
}

// Get date range for a given period
function getDateRange(period: string): { since: string; until: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  if (period === "today") {
    const today = fmt(now);
    return { since: today, until: today };
  }

  if (period === "mtd") {
    return { since: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), until: fmt(now) };
  }

  if (period === "qtd") {
    const q = Math.floor(now.getMonth() / 3);
    const qStart = new Date(now.getFullYear(), q * 3, 1);
    return { since: fmt(qStart), until: fmt(now) };
  }

  if (period === "ytd") {
    return { since: fmt(new Date(now.getFullYear(), 0, 1)), until: fmt(now) };
  }

  throw new Error(`Unknown period: ${period}`);
}

export async function fetchAdSpend(
  accessToken: string,
  accountId: string,
  period: string,
  customStart?: string,
  customEnd?: string
): Promise<number> {
  let since: string;
  let until: string;

  if (period === "custom" && customStart && customEnd) {
    since = customStart;
    until = customEnd;
  } else {
    ({ since, until } = getDateRange(period));
  }

  const url =
    `${META_GRAPH_URL}/${accountId}/insights?fields=spend&time_range={"since":"${since}","until":"${until}"}&access_token=${accessToken}`;

  const res = await fetch(url);
  const data = await res.json() as any;

  if (data.error) throw new Error(data.error.message);

  const insights = data.data || [];
  if (insights.length === 0) return 0;

  return parseFloat(insights[0].spend || "0");
}

export async function getClientMetaAdsStatus(clientId: number) {
  const client = await storage.getClient(clientId);
  if (!client) return { connected: false };

  const c = client as any;
  return {
    connected: !!c.metaAdsAccessToken,
    accountId: c.metaAdsAccountId || null,
    accountName: c.metaAdsAccountName || null,
    connectedAt: c.metaAdsConnectedAt || null,
  };
}
