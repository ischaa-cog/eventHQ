import type { Express } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import OpenAI from "openai";
import { isAuthenticated } from "./auth";
import { db } from "./storage";
import { hasFullAccess } from "@shared/roles";
import { neoKnowledge, neoKnowledgeChunks, trainingResources, type User } from "@shared/schema";

// Neo AI answers from the transcripts and documents stored here. Each Neo message searches
// the passages (Postgres full-text search) and the best matches go into Neo's prompt.

export const NEO_KNOWLEDGE_MAX_CHARS = 1_500_000;
const CHUNK_CHARS = 1800;
const CHUNK_OVERLAP = 200;

// Strips WebVTT/SRT timing, cue numbers and speaker tags so captions read as plain text.
export function cleanTranscript(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "").split("\n");
  const kept: string[] = [];
  let skipBlock = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) { skipBlock = false; kept.push(""); continue; }
    if (skipBlock) continue;
    if (/^WEBVTT\b/.test(t)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(t)) { skipBlock = true; continue; }
    if (/^\d+$/.test(t)) continue; // SRT cue number
    if (/-->/.test(t)) continue; // cue timing
    const text = t.replace(/<\/?[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
    // Captions often repeat the previous line while it scrolls.
    if (text && text !== kept.filter(Boolean).at(-1)) kept.push(text);
  }
  const isCaptions = /-->/.test(raw);
  // Caption lines are fragments of sentences; join them into flowing paragraphs.
  const text = isCaptions ? kept.filter(Boolean).join(" ") : kept.join("\n");
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// Splits text into overlapping passages of about CHUNK_CHARS, breaking at paragraph or sentence ends.
export function chunkText(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start + CHUNK_CHARS / 2, end);
      const para = window.lastIndexOf("\n\n");
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      const cut = para >= 0 ? para + 2 : sentence >= 0 ? sentence + 2 : window.lastIndexOf(" ") + 1;
      if (cut > 0) end = start + CHUNK_CHARS / 2 + cut;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    // Step back for overlap, then forward to a word boundary.
    let next = Math.max(end - CHUNK_OVERLAP, start + 1);
    const space = clean.indexOf(" ", next);
    if (space >= 0 && space < end) next = space + 1;
    start = next;
  }
  return chunks.filter(Boolean);
}

// Turns a question into an OR-of-words tsquery string. Only letters and digits survive,
// so the result is always valid to_tsquery input.
export function searchTerms(text: string): string {
  const words = (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => word.length >= 3);
  return Array.from(new Set(words)).slice(0, 40).join(" | ");
}

const countWords = (text: string) => (text.match(/\S+/g) || []).length;

export async function saveKnowledge(entry: {
  id?: number; title: string; collection: string; trainingResourceId?: number | null; content: string; source: string;
}) {
  const content = entry.content.trim();
  const chunks = chunkText(content);
  return db.transaction(async tx => {
    const values = {
      title: entry.title, collection: entry.collection, trainingResourceId: entry.trainingResourceId ?? null,
      content, source: entry.source, wordCount: countWords(content), updatedAt: new Date(),
    };
    const [row] = entry.id
      ? await tx.update(neoKnowledge).set(values).where(eq(neoKnowledge.id, entry.id)).returning()
      : entry.trainingResourceId
        ? await tx.insert(neoKnowledge).values(values)
            .onConflictDoUpdate({ target: neoKnowledge.trainingResourceId, set: values }).returning()
        : await tx.insert(neoKnowledge).values(values).returning();
    await tx.delete(neoKnowledgeChunks).where(eq(neoKnowledgeChunks.knowledgeId, row.id));
    for (let i = 0; i < chunks.length; i += 200) {
      await tx.insert(neoKnowledgeChunks).values(chunks.slice(i, i + 200).map((chunk, j) => ({
        knowledgeId: row.id, chunkIndex: i + j, content: chunk,
        search: sql`setweight(to_tsvector('english', ${row.title}), 'A') || to_tsvector('english', ${chunk})`,
      })));
    }
    return { ...row, chunks: chunks.length };
  });
}

// Saves, then indexes the document's passages for meaning search when OpenAI is configured. If
// that fails, they stay keyword-searchable and the admin page's "Build search index" picks them up.
async function saveAndEmbed(entry: Parameters<typeof saveKnowledge>[0]) {
  const saved = await saveKnowledge(entry);
  const embed = openAIEmbedder();
  if (embed) {
    try { await embedPendingChunks(embed, 1000, saved.id); } catch (error) { console.error("Neo embedding failed:", error); }
  }
  return saved;
}

export type NeoPassage = { title: string; collection: string; content: string };

// --- Meaning-based search (embeddings) ---
// Keyword search alone does badly on conversational podcast transcripts, so every passage also
// gets an embedding, and Neo searches by meaning and by keywords and merges the two rankings.
export type Embedder = (texts: string[]) => Promise<number[][]>;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

export function openAIEmbedder(): Embedder | null {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return async texts => {
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input: texts });
    return res.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
  };
}

const toVector = (values: number[]) => `[${values.join(",")}]`;

// Embeds up to `max` passages that don't have an embedding yet. Returns how many are still missing.
export async function embedPendingChunks(embed: Embedder, max = 300, knowledgeId?: number): Promise<{ embedded: number; remaining: number }> {
  const rows = (await db.execute(sql`
    select c.id, k.title, c.content from neo_knowledge_chunks c join neo_knowledge k on k.id = c.knowledge_id
    where c.embedding is null ${knowledgeId ? sql`and c.knowledge_id = ${knowledgeId}` : sql``} order by c.id limit ${max}`)).rows as { id: number; title: string; content: string }[];
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const vectors = await embed(batch.map(r => `${r.title}\n\n${r.content}`));
    await db.execute(sql`
      update neo_knowledge_chunks c set embedding = v.embedding::vector
      from (values ${sql.join(batch.map((r, j) => sql`(${r.id}::int, ${toVector(vectors[j])})`), sql`, `)}) as v(id, embedding)
      where c.id = v.id`);
  }
  const [{ remaining }] = (await db.execute(sql`select count(*)::int as remaining from neo_knowledge_chunks where embedding is null`)).rows as { remaining: number }[];
  return { embedded: rows.length, remaining };
}

export async function embeddingProgress(): Promise<{ total: number; embedded: number }> {
  const [row] = (await db.execute(sql`select count(*)::int as total, count(embedding)::int as embedded from neo_knowledge_chunks`)).rows as { total: number; embedded: number }[];
  return row;
}

type Hit = { chunkId: number; id: number; title: string; collection: string; category: string | null; content: string };

// Best-matching passages this client may see: standalone documents, plus transcripts of
// lessons that are shared with every client or assigned to this one (clientId null: every
// lesson, for the admin search test). At most 2 passages per source.
export async function searchKnowledge(question: string, clientId: number | null, limit = 6, embed: Embedder | null = openAIEmbedder()): Promise<NeoPassage[]> {
  const visible = sql`(k.training_resource_id is null
    or (not r.archived and ${clientId === null ? sql`true` : sql`(r.is_global or ${clientId} = any(r.visible_client_ids))`}))`;
  const select = sql`select c.id as "chunkId", k.id, k.title, k.collection, r.category, c.content
    from neo_knowledge_chunks c
    join neo_knowledge k on k.id = c.knowledge_id
    left join training_resources r on r.id = k.training_resource_id`;
  const terms = searchTerms(question);
  const byKeyword = async () => !terms ? [] : (await db.execute(sql`${select}
    cross join to_tsquery('english', ${terms}) q
    where c.search @@ q and ${visible}
    order by ts_rank(c.search, q, 1) desc limit ${limit * 4}`)).rows as Hit[];
  const byMeaning = async () => {
    if (!embed || !question.trim()) return [];
    try {
      const [vector] = await embed([question.slice(0, 8000)]);
      return (await db.execute(sql`${select}
        where c.embedding is not null and ${visible}
        order by c.embedding <=> ${toVector(vector)}::vector limit ${limit * 4}`)).rows as Hit[];
    } catch (error) {
      console.error("Neo meaning search failed; using keywords only:", error);
      return [];
    }
  };
  const [keywordHits, meaningHits] = await Promise.all([byKeyword(), byMeaning()]);

  // Reciprocal rank fusion: a passage high in either list ranks high; meaning counts a bit more.
  const scores = new Map<number, { hit: Hit; score: number }>();
  const add = (hits: Hit[], weight: number) => hits.forEach((hit, rank) => {
    const entry = scores.get(hit.chunkId) ?? { hit, score: 0 };
    entry.score += weight / (60 + rank);
    scores.set(hit.chunkId, entry);
  });
  add(meaningHits, 1);
  add(keywordHits, 0.7);
  const ranked = Array.from(scores.values()).sort((a, b) => b.score - a.score).map(e => e.hit);

  const perSource = new Map<number, number>();
  const passages: NeoPassage[] = [];
  for (const row of ranked) {
    const used = perSource.get(row.id) ?? 0;
    if (used >= 2) continue;
    perSource.set(row.id, used + 1);
    // Transcripts of lessons in the Training Lab's Inner Circle module count as Inner Circle material.
    passages.push({ title: row.title, collection: row.category === "inner_circle" ? "inner_circle" : row.collection, content: row.content });
    if (passages.length >= limit) break;
  }
  return passages;
}

// Lessons this client can see, for Neo to recommend by name.
export async function visibleLessonTitles(clientId: number): Promise<{ title: string; category: string }[]> {
  const rows = await db.select({
    title: trainingResources.title, category: trainingResources.category,
    archived: trainingResources.archived, isGlobal: trainingResources.isGlobal, visibleClientIds: trainingResources.visibleClientIds,
  }).from(trainingResources).orderBy(asc(trainingResources.category), asc(trainingResources.orderIndex));
  return rows.filter(r => !r.archived && (r.isGlobal || (r.visibleClientIds || []).includes(clientId)))
    .map(({ title, category }) => ({ title, category }));
}

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marketing", masterclass: "Masterclass", webinar: "Masterclass", summit: "Summits",
  challenge: "Five-Day Challenges", bonus_training: "Bonus Training", partner_sop: "Partner SOPs",
  inner_circle: "Neo's Inner Circle (older recordings)",
};
const COLLECTION_LABELS: Record<string, string> = {
  training_lab: "Training Lab lesson (core curriculum)", inner_circle: "Neo's Inner Circle (older recording)",
  writing: "Neo's writing (books, guides, emails, plans)", youtube: "Neo's YouTube video", instagram: "Neo's Instagram post",
  other: "Neo's material",
};
// Collections an admin can file a standalone document under (Training Lab transcripts are tied to a lesson).
export const DOCUMENT_COLLECTIONS = ["inner_circle", "writing", "youtube", "instagram", "other"] as const;

// Who Neo is and how he talks, drawn from his bios, Circle of Greatness core values and the
// instructions and voice rules of his "Neo Copywriter" custom GPT.
export const NEO_VOICE = `WHO NEO IS:
You are Neo AI, the AI coach built on the teaching of Nehemiah "Neo" Davis, CEO of Circle of Greatness and host of the Circle of Greatness podcast. Neo was born and raised in Philadelphia. His father went to prison when he was two; he was kicked out of high school, expelled from college and fired from ten jobs. At 21 he decided to stop surviving and start building: a fruit truck and a junk hauling business first, then digital businesses. He now runs an eight-figure digital company, has helped partners build eight-figure businesses, runs challenges, masterclasses, summits, masterminds and live events for coaches and entrepreneurs, has spoken at Funnel Hacking Live, and the street he grew up on is now Nehemiah Davis Way. He's a husband and father of four.
You speak in Neo's voice and can share his story and lessons as they appear in his material, but you are his AI coach, not Neo in person: if someone asks, say so plainly. Never invent experiences, results, numbers or opinions Neo hasn't shared.

HOW NEO TALKS:
- Energetic, direct and encouraging, like a mentor who believes in you and won't let you make excuses. Real talk, plain words, short sentences, a little Philly/urban flavor. Push toward the next action.
- Lead with the answer, then the steps. Use his stories and examples when they fit.
- His core values ("5 ingredients to greatness"), to use naturally, not in every message: "It has to work or it HAS to work." "Success loves speed." "We do everything in excellence." "Extreme ownership." "How you do anything is how you do everything." "Never settle." Also: "Believe in yourself and your goals."
- His sign-off is "To your greatness." Use it to close a pep talk now and then, and on emails written as Neo.
- Never use filler AI phrases such as: delve, dive into, embark, journey, tapestry, realm, landscape, navigate, elevate, unleash, unlock, harness, game changer, skyrocket, robust, cutting-edge, seamless, testament, vibrant, "in today's digital age", "in the world of", "when it comes to", "it's important to note", "it's worth noting", "in conclusion", "in summary", furthermore, moreover, additionally, notably, indeed, "my friend".

WRITING COPY FOR THE CLIENT (sales pages, emails, captions, video scripts, ads, webinar promos, nurture sequences):
Write like an elite direct-response copywriter in the tradition of Dan Kennedy, Gary Halbert, Joseph Sugarman and Frank Kern, using frameworks like AIDA, PAS and BAB. The goal: make people stop scrolling, think differently, believe it's possible and take action.
- Open with a strong hook: curiosity, emotion, a bold statement, a question or a story.
- Speak to the reader's frustrations, goals, fears and dreams. Use real stories to carry the lesson.
- Write punchy, quotable lines. Sell the benefits (how life or business gets better), not the features.
- Persuade ethically: real stories, proof and authority, and only genuine urgency. Never invent testimonials, results or deadlines; use placeholders like [testimonial] for anything the client must supply.
- End with one clear call to action.
Write in the client's name and voice unless they ask for it as Neo. For promotional emails use Neo's structure: subject line, preheader, personal greeting, a story or emotional hook, the problem and why it hurts, the offer as the solution, proof, urgency, one clear call to action repeated, sign-off, and a P.S. that adds urgency or a bonus.`;

// The part of Neo's system prompt that carries Neo's own teaching.
export function knowledgePrompt(passages: NeoPassage[], lessons: { title: string; category: string }[]): string {
  const parts = [`HOW TO USE NEO'S TRAINING:
Neo's own teaching is your primary source: Training Lab lessons, Inner Circle material, his writing (books, guides, emails, plans) and his YouTube and Instagram content. When the excerpts below cover the question, answer from them: use Neo's frameworks, stories, terminology, numbers and steps rather than generic marketing advice. Name the Training Lab lesson you drew from when there is one (e.g. "see the *Masterclass Show-Up Processes* lesson in the Training Lab"); for YouTube or Instagram you can mention the video by title. Many YouTube videos are Circle of Greatness podcast interviews where the guest does most of the talking: present a guest's story or advice as theirs ("on Neo's podcast, the guest explained…"), not as Neo's view. Offers, prices and dates in emails and sales copy are from past campaigns: never quote them as current. If the excerpts don't cover something, say so briefly and then give your best advice. Never invent quotes or claim a lesson says something it doesn't.
The core curriculum (every Training Lab module except Neo's Inner Circle) is what clients should watch first. Inner Circle recordings are older, supplementary material: when recommending lessons, point to the core curriculum first and suggest Inner Circle recordings only as extra depth, and if the two disagree, follow the core curriculum.`];
  if (lessons.length) {
    const byCategory = new Map<string, string[]>();
    for (const l of lessons) {
      const label = CATEGORY_LABELS[l.category] || l.category;
      byCategory.set(label, [...(byCategory.get(label) || []), l.title]);
    }
    parts.push(`TRAINING LAB LESSONS THIS CLIENT HAS (recommend the relevant ones by name):\n` +
      Array.from(byCategory, ([label, titles]) => `- ${label}: ${titles.join("; ")}`).join("\n"));
  }
  if (passages.length) {
    parts.push(`EXCERPTS FROM NEO'S TRAINING RELEVANT TO THIS MESSAGE:\n` + passages.map((p, i) =>
      `[${i + 1}] ${COLLECTION_LABELS[p.collection] || "Neo's material"}: "${p.title}"\n${p.content}`).join("\n\n"));
  } else {
    parts.push("No excerpt from Neo's training matched this message.");
  }
  return parts.join("\n\n");
}

// --- Vimeo captions ---
export const vimeoVideoId = (url: string) => {
  try {
    const u = new URL(url);
    const match = u.hostname === "player.vimeo.com" ? /^\/video\/(\d+)/.exec(u.pathname)
      : /(^|\.)vimeo\.com$/.test(u.hostname) ? /^\/(\d+)/.exec(u.pathname) : null;
    return match ? match[1] : null;
  } catch { return null; }
};

// Downloads the best caption track for a Vimeo video (English first, then any language).
export async function fetchVimeoTranscript(videoId: string, token: string): Promise<string> {
  const headers = { Authorization: `bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" };
  const res = await fetch(`https://api.vimeo.com/videos/${videoId}/texttracks`, { headers });
  if (res.status === 401 || res.status === 403) throw new Error("Vimeo refused access. Check the token can read this video.");
  if (res.status === 404) throw new Error("Vimeo video not found for this token.");
  if (!res.ok) throw new Error(`Vimeo error ${res.status}`);
  const tracks: any[] = (await res.json()).data || [];
  if (!tracks.length) throw new Error("This video has no captions on Vimeo yet.");
  const score = (t: any) => (t.language?.startsWith("en") ? 2 : 0) + (t.active ? 1 : 0);
  const track = [...tracks].sort((a, b) => score(b) - score(a))[0];
  const vtt = await fetch(track.link);
  if (!vtt.ok) throw new Error(`Could not download captions (${vtt.status})`);
  const text = cleanTranscript(await vtt.text());
  if (!text) throw new Error("The captions were empty.");
  return text;
}

// --- Admin API ---
const fail = (res: any, code: number, message: string) => res.status(code).json({ error: message });
const idOf = (v: any) => Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : NaN;
const contentInput = z.string().max(NEO_KNOWLEDGE_MAX_CHARS, "That transcript is too long. Split it into parts.")
  .transform(cleanTranscript).refine(text => text.length > 0, "Add the transcript text");
const documentInput = z.object({
  title: z.string().trim().min(1).max(200),
  collection: z.enum(DOCUMENT_COLLECTIONS),
  content: contentInput,
  source: z.enum(["pasted", "file"]).default("pasted"),
});

export function registerNeoKnowledgeRoutes(app: Express, getRequestUser: (req: any) => Promise<User | undefined>) {
  // Knowledge is shared by every client's Neo, so only full-access admins manage it.
  const requireAdmin = async (req: any, res: any) => {
    const user = await getRequestUser(req);
    if (!hasFullAccess(user) || req.user?.demoLogin) { fail(res, 403, "Admin access required"); return false; }
    return true;
  };
  const vimeoToken = () => process.env.VIMEO_ACCESS_TOKEN || "";

  app.get("/api/neo/knowledge", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const [lessons, docs, chunkCounts] = await Promise.all([
        db.select({ id: trainingResources.id, title: trainingResources.title, category: trainingResources.category, url: trainingResources.url, resourceType: trainingResources.resourceType })
          .from(trainingResources).where(eq(trainingResources.archived, false)).orderBy(asc(trainingResources.category), asc(trainingResources.orderIndex)),
        db.select({ id: neoKnowledge.id, title: neoKnowledge.title, collection: neoKnowledge.collection, trainingResourceId: neoKnowledge.trainingResourceId, source: neoKnowledge.source, wordCount: neoKnowledge.wordCount, updatedAt: neoKnowledge.updatedAt })
          .from(neoKnowledge).orderBy(asc(neoKnowledge.title)),
        db.select({ knowledgeId: neoKnowledgeChunks.knowledgeId, n: sql<number>`count(*)::int` }).from(neoKnowledgeChunks).groupBy(neoKnowledgeChunks.knowledgeId),
      ]);
      const chunks = new Map(chunkCounts.map(c => [c.knowledgeId, c.n]));
      const withChunks = docs.map(d => ({ ...d, chunks: chunks.get(d.id) ?? 0 }));
      const byLesson = new Map(withChunks.filter(d => d.trainingResourceId).map(d => [d.trainingResourceId, d]));
      res.json({
        vimeoConfigured: !!vimeoToken(),
        searchIndex: { ...(await embeddingProgress()), configured: !!process.env.OPENAI_API_KEY },
        lessons: lessons.map(l => ({ ...l, vimeo: !!vimeoVideoId(l.url), knowledge: byLesson.get(l.id) || null })),
        documents: withChunks.filter(d => !d.trainingResourceId),
      });
    } catch { fail(res, 500, "Failed to load Neo's knowledge"); }
  });

  app.get("/api/neo/knowledge/:id", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const row = (await db.select().from(neoKnowledge).where(eq(neoKnowledge.id, idOf(req.params.id))))[0];
    row ? res.json(row) : fail(res, 404, "Not found");
  });

  // Save (or replace) the transcript of one Training Lab lesson.
  app.put("/api/neo/knowledge/lessons/:resourceId", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const lesson = (await db.select().from(trainingResources).where(eq(trainingResources.id, idOf(req.params.resourceId))))[0];
    if (!lesson || lesson.archived) return fail(res, 404, "Lesson not found");
    const parsed = z.object({ content: contentInput, source: z.enum(["pasted", "file"]).default("pasted") }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    try {
      res.json(await saveAndEmbed({ title: lesson.title, collection: "training_lab", trainingResourceId: lesson.id, ...parsed.data }));
    } catch { fail(res, 500, "Failed to save the transcript"); }
  });

  app.post("/api/neo/knowledge/lessons/:resourceId/vimeo", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!vimeoToken()) return fail(res, 400, "Vimeo isn't connected. Add VIMEO_ACCESS_TOKEN to the server settings.");
    const lesson = (await db.select().from(trainingResources).where(eq(trainingResources.id, idOf(req.params.resourceId))))[0];
    if (!lesson || lesson.archived) return fail(res, 404, "Lesson not found");
    const videoId = vimeoVideoId(lesson.url);
    if (!videoId) return fail(res, 400, "This lesson isn't a Vimeo video");
    try {
      const content = await fetchVimeoTranscript(videoId, vimeoToken());
      res.json(await saveAndEmbed({ title: lesson.title, collection: "training_lab", trainingResourceId: lesson.id, content, source: "vimeo" }));
    } catch (e: any) { fail(res, 502, e?.message || "Vimeo import failed"); }
  });

  app.post("/api/neo/knowledge/documents", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const parsed = documentInput.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    try { res.status(201).json(await saveAndEmbed(parsed.data)); } catch { fail(res, 500, "Failed to save the document"); }
  });

  app.put("/api/neo/knowledge/documents/:id", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const existing = (await db.select().from(neoKnowledge).where(eq(neoKnowledge.id, idOf(req.params.id))))[0];
    if (!existing || existing.trainingResourceId) return fail(res, 404, "Document not found");
    const parsed = documentInput.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    try { res.json(await saveAndEmbed({ id: existing.id, ...parsed.data })); } catch { fail(res, 500, "Failed to save the document"); }
  });

  app.delete("/api/neo/knowledge/:id", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    await db.delete(neoKnowledge).where(eq(neoKnowledge.id, idOf(req.params.id)));
    res.json({ success: true });
  });

  // Indexes the next batch of passages for meaning search; the admin page calls this until none remain.
  app.post("/api/neo/knowledge/embed", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const embed = openAIEmbedder();
    if (!embed) return fail(res, 400, "OpenAI isn't connected. Add OPENAI_API_KEY to the server settings.");
    try { res.json(await embedPendingChunks(embed, 500)); } catch (e: any) { fail(res, 502, e?.message || "Indexing failed"); }
  });

  // Shows which passages Neo would use for a question, as a given client would see them.
  app.post("/api/neo/knowledge/search", isAuthenticated, async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const parsed = z.object({ question: z.string().trim().min(1).max(2000), clientId: z.number().int().positive().optional() }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    try { res.json(await searchKnowledge(parsed.data.question, parsed.data.clientId ?? null)); } catch { fail(res, 500, "Search failed"); }
  });
}
