// Parses a Training Lab bulk-upload CSV. Used by the admin dialog for previews;
// the server re-validates every row before saving.

export const TRAINING_CATEGORIES = ["marketing", "masterclass", "summit", "challenge", "bonus_training", "partner_sop"] as const;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];
export type BulkTrainingRow = {
  line: number;
  title: string;
  url: string;
  category: TrainingCategory;
  resourceType: "video" | "document";
  description: string | null;
};
export type BulkTrainingParse = { rows: BulkTrainingRow[]; errors: { line: number; message: string }[] };

export const BULK_TRAINING_MAX_ROWS = 200;
export const BULK_TRAINING_TEMPLATE =
  "title,url,category,type,description\n" +
  "Welcome to the program,https://vimeo.com/123456789,Marketing,video,Start here\n" +
  "Launch checklist,https://docs.google.com/document/d/your-doc-id,Five-Day Challenges,document,\n";

const CATEGORY_ALIASES: Record<string, TrainingCategory> = {
  marketing: "marketing",
  masterclass: "masterclass", masterclasses: "masterclass", webinar: "masterclass", webinars: "masterclass",
  summit: "summit", summits: "summit",
  challenge: "challenge", challenges: "challenge", "five day challenge": "challenge", "five day challenges": "challenge",
  "5 day challenge": "challenge", "5 day challenges": "challenge",
  bonus: "bonus_training", "bonus training": "bonus_training", "bonus_training": "bonus_training",
  "partner sop": "partner_sop", "partner sops": "partner_sop", "partner_sop": "partner_sop", sop: "partner_sop", sops: "partner_sop",
};
const HEADER_ALIASES: Record<string, keyof Omit<BulkTrainingRow, "line">> = {
  title: "title", name: "title", lesson: "title",
  url: "url", link: "url", "resource url": "url",
  category: "category", section: "category",
  type: "resourceType", "resource type": "resourceType", resourcetype: "resourceType",
  description: "description", notes: "description",
};

const VIDEO_HOSTS = /(^|\.)(vimeo\.com|youtube\.com|youtu\.be|loom\.com|wistia\.com|wistia\.net)$/i;
const VIDEO_FILES = /\.(mp4|mov|m4v|webm)$/i;

/** Video when the link points at a video host or video file; otherwise a document. */
export function guessResourceType(url: string): "video" | "document" {
  try {
    const u = new URL(url);
    return VIDEO_HOSTS.test(u.hostname) || VIDEO_FILES.test(u.pathname) ? "video" : "document";
  } catch {
    return "document";
  }
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");

export function parseTrainingCsv(text: string, defaultCategory?: TrainingCategory): BulkTrainingParse {
  const errors: BulkTrainingParse["errors"] = [];
  const rows: BulkTrainingRow[] = [];
  const table = splitCsv(text.replace(/^﻿/, ""));
  const headerIndex = table.findIndex(cells => cells.some(cell => cell.trim()));
  if (headerIndex < 0) return { rows, errors: [{ line: 1, message: "The file is empty." }] };

  const columns = table[headerIndex].map(cell => HEADER_ALIASES[normalize(cell)]);
  if (!columns.includes("title") || !columns.includes("url")) {
    return { rows, errors: [{ line: headerIndex + 1, message: "The first row must be a header with at least “title” and “url” columns." }] };
  }

  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i];
    if (!cells.some(cell => cell.trim())) continue;
    const line = i + 1;
    const value = (key: keyof Omit<BulkTrainingRow, "line">) => {
      const index = columns.indexOf(key);
      return index >= 0 ? (cells[index] ?? "").trim() : "";
    };
    const title = value("title");
    const url = value("url");
    const categoryText = value("category");
    const typeText = normalize(value("resourceType"));
    const category = categoryText ? CATEGORY_ALIASES[normalize(categoryText)] : defaultCategory;
    const problems: string[] = [];
    if (!title) problems.push("title is missing");
    else if (title.length > 200) problems.push("title is longer than 200 characters");
    if (!/^https?:\/\/\S+$/i.test(url)) problems.push("url must start with http:// or https://");
    if (!category) problems.push(categoryText ? `unknown category “${categoryText}”` : "category is missing");
    if (typeText && typeText !== "video" && typeText !== "document" && typeText !== "doc") problems.push(`type must be “video” or “document”`);
    if (problems.length) { errors.push({ line, message: problems.join("; ") }); continue; }
    rows.push({
      line, title, url, category: category!,
      resourceType: typeText === "video" ? "video" : typeText ? "document" : guessResourceType(url),
      description: value("description") || null,
    });
  }

  if (!rows.length && !errors.length) errors.push({ line: headerIndex + 2, message: "No lessons found below the header row." });
  if (rows.length + errors.length > BULK_TRAINING_MAX_ROWS) {
    errors.push({ line: headerIndex + 1, message: `Upload at most ${BULK_TRAINING_MAX_ROWS} lessons at a time.` });
  }
  return { rows, errors };
}
