import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { neoKnowledge, neoKnowledgeChunks, trainingResources } from "@shared/schema";
import { db } from "./storage";
import { chunkText, cleanTranscript, knowledgePrompt, saveKnowledge, searchKnowledge, searchTerms, vimeoVideoId } from "./neo-knowledge";

test("cleanTranscript turns WebVTT and SRT captions into plain text", () => {
  const vtt = "WEBVTT\n\nNOTE made by Vimeo\nignored\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Neo>Welcome to the</v>\n\n2\n00:00:03.000 --> 00:00:05.000\nWelcome to the\nmasterclass &amp; more\n";
  assert.equal(cleanTranscript(vtt), "Welcome to the masterclass & more");
  const srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\nFirst line\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\nSecond line\r\n";
  assert.equal(cleanTranscript(srt), "First line Second line");
  assert.equal(cleanTranscript("Para one.\n\n\n\nPara two."), "Para one.\n\nPara two.");
});

test("chunkText covers the whole text in overlapping passages", () => {
  const text = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} about show-up rates.`).join(" ");
  const chunks = chunkText(text);
  assert.ok(chunks.length > 5);
  assert.ok(chunks.every(c => c.length <= 1800));
  assert.ok(chunks[0].startsWith("Sentence number 0 "));
  assert.ok(chunks.at(-1)!.endsWith("Sentence number 399 about show-up rates."));
  for (let i = 0; i < 400; i++) assert.ok(chunks.some(c => c.includes(`number ${i} `)), `sentence ${i} kept`);
  assert.deepEqual(chunkText("  "), []);
});

test("searchTerms only emits safe tsquery words", () => {
  assert.equal(searchTerms("How do I price my Masterclass?! (it's $997) & | !"), "how | price | masterclass | 997");
  assert.equal(searchTerms("a an"), "");
});

test("vimeoVideoId reads player and page links", () => {
  assert.equal(vimeoVideoId("https://player.vimeo.com/video/855573003"), "855573003");
  assert.equal(vimeoVideoId("https://vimeo.com/923148024?h=abc"), "923148024");
  assert.equal(vimeoVideoId("https://whop.com/x/lessons/1"), null);
});

test("knowledgePrompt lists lessons and puts core curriculum before Inner Circle", () => {
  const prompt = knowledgePrompt(
    [{ title: "Show-Up Processes", collection: "inner_circle", content: "Text the night before." }],
    [{ title: "Overview Of Masterclasses", category: "masterclass" }, { title: "Mindset Module", category: "inner_circle" }],
  );
  assert.match(prompt, /Masterclass: Overview Of Masterclasses/);
  assert.match(prompt, /Neo's Inner Circle \(older recordings\): Mindset Module/);
  assert.match(prompt, /point to the core curriculum first/);
  assert.match(prompt, /\[1\] Neo's Inner Circle \(older recording\): "Show-Up Processes"\nText the night before\./);
});

test("Neo only finds transcripts of lessons the client can see", async () => {
  const marker = `zq${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const otherClient = 900000001;
  const client = 900000002;
  const lessons = await db.insert(trainingResources).values([
    { title: `Shared ${marker}`, category: "masterclass", resourceType: "video", url: "https://example.com/a", isGlobal: true },
    { title: `Private ${marker}`, category: "inner_circle", resourceType: "video", url: "https://example.com/b", visibleClientIds: [otherClient] },
    { title: `Archived ${marker}`, category: "marketing", resourceType: "video", url: "https://example.com/c", isGlobal: true, archived: true },
  ]).returning();
  const ids: number[] = [];
  try {
    for (const lesson of lessons) {
      const saved = await saveKnowledge({ title: lesson.title, collection: "training_lab", trainingResourceId: lesson.id, content: `Neo says ${marker} matters for ${lesson.title}.`, source: "pasted" });
      ids.push(saved.id);
      assert.equal(saved.chunks, 1);
    }
    const doc = await saveKnowledge({ title: `Inner Circle doc ${marker}`, collection: "inner_circle", content: `The ${marker} framework.`, source: "pasted" });
    ids.push(doc.id);

    const titles = async (clientId: number | null) => (await searchKnowledge(`what about ${marker}?`, clientId)).map(p => p.title).sort();
    assert.deepEqual(await titles(client), [`Inner Circle doc ${marker}`, `Shared ${marker}`]);
    assert.deepEqual(await titles(otherClient), [`Inner Circle doc ${marker}`, `Private ${marker}`, `Shared ${marker}`]);
    assert.deepEqual(await titles(null), [`Inner Circle doc ${marker}`, `Private ${marker}`, `Shared ${marker}`]);
    // A transcript of a lesson in the Inner Circle module is labelled as Inner Circle.
    assert.equal((await searchKnowledge(marker, otherClient)).find(p => p.title.startsWith("Private"))?.collection, "inner_circle");

    // Re-saving a lesson's transcript replaces it rather than adding a second copy.
    const resaved = await saveKnowledge({ title: lessons[0].title, collection: "training_lab", trainingResourceId: lessons[0].id, content: "Replaced text only.", source: "pasted" });
    assert.equal(resaved.id, ids[0]);
    assert.equal((await db.select().from(neoKnowledge).where(eq(neoKnowledge.trainingResourceId, lessons[0].id))).length, 1);
    assert.deepEqual((await db.select().from(neoKnowledgeChunks).where(eq(neoKnowledgeChunks.knowledgeId, ids[0]))).map(c => c.content), ["Replaced text only."]);
  } finally {
    await db.delete(neoKnowledge).where(inArray(neoKnowledge.id, ids));
    await db.delete(trainingResources).where(inArray(trainingResources.id, lessons.map(l => l.id)));
    assert.equal((await db.select().from(neoKnowledgeChunks).where(eq(neoKnowledgeChunks.knowledgeId, ids[0]))).length, 0);
  }
});
