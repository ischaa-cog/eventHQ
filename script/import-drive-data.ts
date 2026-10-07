// One-time import of partner data collected from Google Drive.
// Dry run by default; pass --apply to write. Safe to re-run: existing values are kept,
// calendar entries are keyed by googleSyncKey, and vault/training rows are skipped by name or seedKey.
// Run: npx tsx --env-file=.env script/import-drive-data.ts <data-dir> --agency <id> [--apply]
//
// <data-dir>/roster.json:
//   { "sharedTraining": [{ "seedKey", "title", "description", "category", "resourceType", "url" }],
//     "clients": [{ "key", "name", "aliases"?: [...], "businessName", "active", "website"?, "headshot"?,
//                   "profile": { "niche"?, "primaryOffer"?, "brandVoiceDos"?, "styleGuide"? },
//                   "calendar": [{ "title", "start": "<ISO 8601 with offset>", "link"? }],
//                   "vault": [{ "name", "fileType", "content"?, "url"? }] }] }
// "headshot" is an image path relative to <data-dir>.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { calendarEntries, trainingResources } from "@shared/schema";
import { db, storage } from "../server/storage";

type CalendarItem = { title: string; start: string; link?: string };
type VaultItem = { name: string; fileType: string; content?: string; url?: string };
type RosterClient = {
  key: string; name: string; aliases?: string[]; businessName?: string; active: boolean; website?: string; headshot?: string;
  profile?: { niche?: string; primaryOffer?: string; brandVoiceDos?: string; styleGuide?: string };
  calendar?: CalendarItem[]; vault?: VaultItem[];
};
type SharedTraining = { seedKey: string; title: string; description?: string; category: string; resourceType: "video" | "document"; url: string };

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith("--"));
const apply = args.includes("--apply");
const agencyId = Number(args[args.indexOf("--agency") + 1]);
if (!dir || !Number.isSafeInteger(agencyId) || agencyId <= 0) {
  console.error("Usage: npx tsx --env-file=.env script/import-drive-data.ts <data-dir> --agency <id> [--apply]");
  process.exit(1);
}
if (!await storage.getAgency(agencyId)) {
  console.error(`No agency with id ${agencyId}`);
  process.exit(1);
}

const roster: { clients: RosterClient[]; sharedTraining?: SharedTraining[] } =
  JSON.parse(await readFile(path.join(dir, "roster.json"), "utf8"));
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const syncKey = (item: CalendarItem) =>
  `drive-import:${createHash("sha256").update(`${item.title}|${item.start}`).digest("hex").slice(0, 24)}`;
const tag = apply ? "" : "[dry run] ";

const existingClients = await storage.getClients(agencyId);
for (const entry of roster.clients) {
  const summary: string[] = [];
  // Match an existing workspace by name or any known alias so nothing is duplicated.
  const names = [entry.name, ...(entry.aliases ?? [])].map(normalize);
  let client = existingClients.find(c => names.includes(normalize(c.name)) ||
    (c.businessName && names.includes(normalize(c.businessName))));
  if (!client) {
    summary.push("workspace created");
    if (apply) {
      client = await storage.createClient({ agencyId, name: entry.name, businessName: entry.businessName ?? null } as any);
      if (!entry.active) await storage.updateClientActiveStatus(client.id, false);
    }
  } else if (!entry.active && client.isActive) {
    summary.push("set inactive (paused)");
    if (apply) await storage.updateClientActiveStatus(client.id, false);
  }

  // Profile: only fill fields that are still empty.
  const fill: Record<string, string> = {};
  const candidates = { ...entry.profile, website: entry.website, businessName: entry.businessName };
  for (const [field, value] of Object.entries(candidates)) {
    if (value && !(client as any)?.[field]) fill[field] = value;
  }
  if (Object.keys(fill).length) {
    summary.push(`profile filled: ${Object.keys(fill).join(", ")}`);
    if (apply && client) await storage.updateClient(client.id, fill);
  }

  if (entry.headshot && !client?.headshot) {
    const jpeg = await sharp(await readFile(path.join(dir, entry.headshot)), { limitInputPixels: 200_000_000 })
      .rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    summary.push(`headshot set (${Math.round(jpeg.length / 1024)} KB)`);
    if (apply && client) await storage.updateClient(client.id, { headshot: `data:image/jpeg;base64,${jpeg.toString("base64")}` });
  }

  let added = 0, skipped = 0;
  for (const item of entry.calendar ?? []) {
    const key = syncKey(item);
    const exists = client && (await db.select({ id: calendarEntries.id }).from(calendarEntries)
      .where(and(eq(calendarEntries.clientId, client.id), eq(calendarEntries.googleSyncKey, key))))[0];
    if (exists) { skipped++; continue; }
    added++;
    if (apply && client) {
      await storage.createCalendarEntry({
        clientId: client.id,
        title: item.title,
        eventDate: new Date(item.start),
        timezone: "America/New_York",
        eventLink: item.link ?? null,
        description: null,
        attendeeEmails: [],
        googleSyncKey: key,
      } as any);
    }
  }
  if (added || skipped) summary.push(`calendar: ${added} added, ${skipped} already there`);

  const vaultNames = new Set(client ? (await storage.getVaultAssets(client.id)).map(v => v.name) : []);
  const newVault = (entry.vault ?? []).filter(v => !vaultNames.has(v.name));
  if (newVault.length) {
    summary.push(`vault: ${newVault.length} added`);
    if (apply && client) {
      for (const v of newVault) {
        await storage.createVaultAsset({ clientId: client.id, name: v.name, fileType: v.fileType, content: v.content ?? null, url: v.url ?? null });
      }
    }
  }

  console.log(`${tag}${entry.name}${client ? ` (#${client.id})` : ""}: ${summary.length ? summary.join("; ") : "nothing new"}`);
}

for (const resource of roster.sharedTraining ?? []) {
  const exists = (await db.select({ id: trainingResources.id }).from(trainingResources)
    .where(eq(trainingResources.seedKey, resource.seedKey)))[0];
  if (exists) { console.log(`${tag}Training "${resource.title}": already there`); continue; }
  console.log(`${tag}Training "${resource.title}": added (${resource.category}, shared)`);
  if (apply) {
    await db.insert(trainingResources).values({
      seedKey: resource.seedKey, title: resource.title, description: resource.description ?? null,
      category: resource.category, resourceType: resource.resourceType, url: resource.url,
      isGlobal: true, visibleClientIds: [], orderIndex: 1000,
    });
  }
}

if (!apply) console.log("\nDry run only. Re-run with --apply to write these changes.");
process.exit(0);
