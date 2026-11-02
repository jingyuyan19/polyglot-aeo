import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

export const REDDIT_ACTIVITY_HEADERS = [
  "date",
  "timestamp",
  "event_type",
  "subreddit",
  "plugin",
  "campaign",
  "status",
  "url",
  "post_id",
  "promotional",
  "disclosed",
  "flair",
  "topic",
  "category",
  "body_hash",
  "review_window",
  "views",
  "upvotes",
  "comments",
  "installs",
  "activations",
  "note",
  "evidence",
];

export async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

export async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

export async function readJson(file, fallback = null) {
  const text = await readText(file);
  return text.trim() ? JSON.parse(text) : fallback;
}

export function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
    );
}

export async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

export async function writeRows(file, rows, headers = REDDIT_ACTIVITY_HEADERS) {
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  await writeText(file, `${csv}\n`);
}

export async function mutateRows(file, callback, headers = REDDIT_ACTIVITY_HEADERS) {
  return withFileLock(file, async () => {
    const rows = await readRows(file);
    const result = await callback(rows);
    await writeRows(file, rows, headers);
    return result;
  });
}

export function todayLocal(timeZone = "Asia/Shanghai", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function addDays(date, days) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp + days * 86400000).toISOString().slice(0, 10);
}

export function dateInRange(date, start, end) {
  return Boolean(date && start && end && date >= start && date <= end);
}

export function hoursSince(value, now = new Date()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp) / 3600000);
}

export function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return /^(1|true|yes|y)$/i.test(String(value || "").trim());
}

export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function contentHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

export function pipe(value) {
  return String(value ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

export function extractTextBlock(markdown) {
  const matches = Array.from(markdown.matchAll(/```text\n([\s\S]*?)\n```/g));
  return matches.at(-1)?.[1]?.trim() || "";
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
