// Loads Neo's material into Neo AI's knowledge base (neo_knowledge).
// Usage: tsx --env-file=.env script/import-neo-content.ts <file.jsonl> [--dry-run]
// Each line: {"title": "...", "collection": "writing" | "youtube" | "instagram" | "inner_circle" | "other",
//             "source": "youtube" | "drive" | ..., "content": "..."}
// Re-running is safe: an entry with the same collection and title is replaced, not duplicated.
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "../server/storage";
import { cleanTranscript, saveKnowledge, DOCUMENT_COLLECTIONS, NEO_KNOWLEDGE_MAX_CHARS } from "../server/neo-knowledge";
import { neoKnowledge } from "@shared/schema";

type Entry = { title: string; collection: string; source: string; content: string };

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) throw new Error("Usage: import-neo-content.ts <file.jsonl> [--dry-run]");
  const dryRun = flag === "--dry-run";
  const entries: Entry[] = readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));

  let saved = 0, skipped = 0, words = 0;
  for (const entry of entries) {
    const title = entry.title?.trim().slice(0, 200);
    const content = cleanTranscript(entry.content || "");
    if (!title || !content || !(DOCUMENT_COLLECTIONS as readonly string[]).includes(entry.collection) || content.length > NEO_KNOWLEDGE_MAX_CHARS) {
      console.warn(`Skipped: ${title || "(no title)"}`);
      skipped++;
      continue;
    }
    words += (content.match(/\S+/g) || []).length;
    if (dryRun) { saved++; continue; }
    const existing = (await db.select({ id: neoKnowledge.id }).from(neoKnowledge)
      .where(and(eq(neoKnowledge.collection, entry.collection), eq(neoKnowledge.title, title))))[0];
    await saveKnowledge({ id: existing?.id, title, collection: entry.collection, content, source: entry.source });
    if (++saved % 50 === 0) console.log(`${saved} / ${entries.length}`);
  }
  console.log(`${dryRun ? "Would save" : "Saved"} ${saved}, skipped ${skipped}, ${words.toLocaleString()} words`);
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
