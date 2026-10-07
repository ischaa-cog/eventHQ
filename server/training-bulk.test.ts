import assert from "node:assert/strict";
import { test } from "node:test";
import { BULK_TRAINING_TEMPLATE, guessResourceType, parseTrainingCsv } from "@shared/training-bulk";

test("bulk training CSV parsing accepts friendly input and reports bad rows by line", () => {
  const template = parseTrainingCsv(BULK_TRAINING_TEMPLATE);
  assert.deepEqual(template.errors, []);
  assert.deepEqual(template.rows.map(r => [r.category, r.resourceType]), [["marketing", "video"], ["challenge", "document"]]);

  const csv = [
    "﻿Name,Link,Section,Notes",
    '"Day 1, kickoff",https://youtu.be/abc,5-Day Challenges,"Say ""hi"""',
    "Webinar deck,https://docs.google.com/presentation/d/x,Webinars,",
    "No category,https://example.com/file.mp4,,",
    "",
    ",https://example.com,Marketing,",
    "Bad link,example.com,Marketing,",
    "Bad category,https://example.com,Podcasts,",
  ].join("\r\n");
  const parsed = parseTrainingCsv(csv, "summit");
  assert.deepEqual(parsed.rows.map(r => ({ title: r.title, category: r.category, type: r.resourceType, line: r.line })), [
    { title: "Day 1, kickoff", category: "challenge", type: "video", line: 2 },
    { title: "Webinar deck", category: "masterclass", type: "document", line: 3 },
    { title: "No category", category: "summit", type: "video", line: 4 },
  ]);
  assert.equal(parsed.rows[0].description, 'Say "hi"');
  assert.deepEqual(parsed.errors.map(e => e.line), [6, 7, 8]);
  assert.match(parsed.errors[2].message, /unknown category/);

  assert.match(parseTrainingCsv("url\nhttps://x.com").errors[0].message, /title/);
  assert.match(parseTrainingCsv("title,url,type\nA,https://x.com,audio").errors[0].message, /video|document/);
  assert.match(parseTrainingCsv("title,url\n" + "A,https://x.com\n".repeat(201)).errors.at(-1)!.message, /at most 200/);
  assert.equal(guessResourceType("https://vimeo.com/1"), "video");
  assert.equal(guessResourceType("https://drive.google.com/file/d/x/view"), "document");
});
