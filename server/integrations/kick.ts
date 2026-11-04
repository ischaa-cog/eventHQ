// Starts a connection's sync in the background. On Vercel it calls the signed sync-one endpoint, so
// the sync gets its own function call and time budget; a first sync that runs out of time calls the
// endpoint again to continue (up to MAX_HOPS). Locally it just runs in this process.
import { createHmac } from "crypto";
import { appUrl } from "../config";
import { getConnection } from "./connections";
import { syncConnection } from "./sync";

export const MAX_HOPS = 8;

export function internalToken(connectionId: number) {
  return createHmac("sha256", process.env.CRON_SECRET || process.env.SESSION_SECRET || "").update(`cron-sync-one:${connectionId}`).digest("hex");
}

export async function kickSync(connectionId: number, hop = 0): Promise<void> {
  if (hop >= MAX_HOPS) return;
  if (!process.env.VERCEL) {
    void (async () => {
      for (let n = hop; n < MAX_HOPS; n++) {
        const row = await getConnection(connectionId);
        if (!row || row.status === "disabled") return;
        const result = await syncConnection(row, { deadline: Date.now() + 50_000 });
        if (result.complete) return;
      }
    })().catch((e) => console.warn(`[sync] background sync of connection ${connectionId} failed: ${e.message}`));
    return;
  }
  // Only wait long enough for the request to leave; the called function keeps running on its own.
  await fetch(`${appUrl()}/api/cron/sync-one/${connectionId}?t=${internalToken(connectionId)}&hop=${hop}`, { signal: AbortSignal.timeout(1500) })
    .catch(() => undefined);
}
