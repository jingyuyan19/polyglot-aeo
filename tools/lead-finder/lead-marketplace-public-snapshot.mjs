#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_URL = "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";
const DEFAULT_FILE = "tools/lead-finder/marketplace-public-snapshots.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-marketplace-public.md";
const DEFAULT_JSON = ".tmp/framer-marketplace-public.json";
const HEADERS = [
  "date",
  "fetched_at",
  "url",
  "http_status",
  "ok",
  "title",
  "description",
  "canonical",
  "slug",
  "author",
  "likes",
  "comments",
  "created_at",
  "updated_at",
  "published_at",
  "featured_at",
  "framer_plugin_id",
  "paid",
  "categories",
  "image_count",
  "note",
];

function usage() {
  return `
Usage:
  pnpm lead:marketplace-public
  pnpm lead:marketplace-public -- --record

Options:
  --url <url>          Marketplace listing URL. Default: ${DEFAULT_URL}
  --file <file>        Public snapshot CSV. Default: ${DEFAULT_FILE}
  --output <file>      Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>        JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD> Snapshot date. Default: local date.
  --record             Append the public snapshot to the local CSV if it is new.
  --note <text>        Short note when recording.
  --help               Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    file: DEFAULT_FILE,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
    record: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--url") {
      args.url = value;
      index += 1;
      continue;
    }
    if (key === "--file") {
      args.file = value;
      index += 1;
      continue;
    }
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--json") {
      args.json = value;
      index += 1;
      continue;
    }
    if (key === "--today") {
      args.today = value;
      index += 1;
      continue;
    }
    if (key === "--record") {
      args.record = true;
      continue;
    }
    if (key === "--note") {
      args.note = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(text) {
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
    .filter((values) => values.some((value) => value.trim()))
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

async function writeRows(file, rows) {
  const csv = [
    HEADERS.join(","),
    ...rows.map((row) => HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${csv}\n`, "utf8");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<meta\\s+${escaped}\\s+content="([^"]*)"`, "i"));
  return decodeHtml(match?.[1] || "");
}

function title(html) {
  return decodeHtml(html.match(/<title>([^<]*)<\/title>/i)?.[1] || "");
}

function canonical(html) {
  return decodeHtml(html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] || "");
}

function slugFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

function jsonLdProducts(html) {
  return Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))
    .map((match) => {
      try {
        return JSON.parse(decodeHtml(match[1]));
      } catch {
        return null;
      }
    })
    .filter((item) => item && item["@type"] === "Product");
}

function extractCategories(context) {
  const categoriesMatch = context.match(/"categories":\[(.*?)\]\s*\}\}/s);
  const source = categoriesMatch?.[1] || context;
  const categories = Array.from(source.matchAll(/"name":"([^"]+)","slug":"([^"]+)"/g)).map(
    (match) => `${match[1]}:${match[2]}`,
  );
  return Array.from(new Set(categories));
}

function listingReadable({ response, pageTitle, canonicalUrl, args, framerPluginId, product }) {
  const requestedSlug = slugFromUrl(args.url);
  const observedSlug = slugFromUrl(canonicalUrl);
  const marketplaceTitle = /Framer Marketplace/i.test(pageTitle);
  const pluginEvidence = Boolean(framerPluginId || product?.name || product?.description);

  return Boolean(response.ok && requestedSlug && requestedSlug === observedSlug && marketplaceTitle && pluginEvidence);
}

function extractPublicSnapshot({ html, response, args }) {
  const product = jsonLdProducts(html)[0] || {};
  const canonicalUrl = canonical(html) || response.url || args.url;
  const pageTitle = title(html);
  const flight = html
    .replace(/\\"/g, '"')
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&");
  const markerIndex = flight.indexOf('"framerPluginId"');
  const context = markerIndex >= 0 ? flight.slice(Math.max(0, markerIndex - 1400), markerIndex + 2600) : flight;
  const likes = flight.match(/"likes":\{"count":(\d+)/)?.[1] || html.match(/aria-label="(\d+) likes?"/i)?.[1] || "0";
  const comments = flight.match(/"comments":\{"count":(\d+)/)?.[1] || html.match(/aria-label="(\d+) comments?"/i)?.[1] || "0";
  const framerPluginId = context.match(/"framerPluginId":"([^"]+)"/)?.[1] || "";
  const paidMatch = context.match(/"paid":(true|false)/);
  const categories = extractCategories(context);
  const images = Array.isArray(product.image) ? product.image : product.image ? [product.image] : [];

  return {
    date: args.today,
    fetched_at: new Date().toISOString(),
    url: args.url,
    http_status: response.status,
    ok: listingReadable({ response, pageTitle, canonicalUrl, args, framerPluginId, product }),
    title: pageTitle,
    description: meta(html, 'name="description"') || product.description || "",
    canonical: canonicalUrl,
    slug: slugFromUrl(canonicalUrl),
    author: product.offers?.seller?.name || title(html).match(/\bby\s+(.+?)\s+—/)?.[1] || "",
    likes,
    comments,
    created_at: context.match(/"createdAt":"([^"]+)"/)?.[1] || "",
    updated_at: context.match(/"updatedAt":"([^"]+)"/)?.[1] || "",
    published_at: context.match(/"publishedAt":"([^"]+)"/)?.[1] || "",
    featured_at: context.match(/"featuredAt":(?:"([^"]+)"|null)/)?.[1] || "",
    framer_plugin_id: framerPluginId,
    paid: paidMatch?.[1] || "",
    categories: categories.join(";"),
    image_count: images.length,
    note: args.note || "",
  };
}

async function fetchSnapshot(args) {
  const response = await fetch(args.url, {
    headers: {
      "user-agent": "PolyglotAEOLeadMonitor/1.0",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  const html = await response.text();
  return extractPublicSnapshot({ html, response, args });
}

function isDuplicate(rows, snapshot) {
  return rows.some(
    (row) =>
      row.date === snapshot.date &&
      row.url === snapshot.url &&
      row.likes === String(snapshot.likes) &&
      row.comments === String(snapshot.comments) &&
      row.updated_at === snapshot.updated_at &&
      row.http_status === String(snapshot.http_status),
  );
}

async function recordSnapshot(file, snapshot) {
  return withFileLock(file, async () => {
    const rows = await readRows(file);
    const duplicateIndex = rows.findIndex((row) => isDuplicate([row], snapshot));
    const snapshotRow = Object.fromEntries(HEADERS.map((header) => [header, snapshot[header] ?? ""]));

    if (duplicateIndex < 0) {
      rows.push(snapshotRow);
      await writeRows(file, rows);
      return {
        mode: "added",
        total: rows.length,
      };
    }

    const existing = rows[duplicateIndex];
    const changed = HEADERS.some((header) => String(existing[header] ?? "") !== String(snapshotRow[header] ?? ""));
    if (changed) {
      rows[duplicateIndex] = {
        ...snapshotRow,
        __index: existing.__index,
      };
      await writeRows(file, rows);
    }

    return {
      mode: changed ? "duplicate_updated" : "duplicate_skipped",
      total: rows.length,
    };
  });
}

function latestRows(rows) {
  return [...rows].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.fetched_at).localeCompare(String(a.fetched_at)) || b.__index - a.__index,
  );
}

function previousDifferent(rows, current) {
  return latestRows(rows).find(
    (row) =>
      row.url === current.url &&
      (row.updated_at !== current.updated_at ||
        row.likes !== String(current.likes) ||
        row.comments !== String(current.comments)),
  ) || null;
}

function number(value) {
  return Number.parseInt(value || "0", 10) || 0;
}

function recommendation(snapshot, previous) {
  if (!snapshot.ok) {
    return "Marketplace public listing is not confidently readable. Check the URL and page status before attributing public traffic.";
  }
  if (number(snapshot.comments) > 0) {
    return "Marketplace listing has public comments. Review and reply before starting another public action.";
  }
  if (number(snapshot.likes) > 0) {
    return "Marketplace listing has public likes. Pair this with Creator Space opens/users and CTA events to judge traction.";
  }
  if (previous && previous.updated_at !== snapshot.updated_at) {
    return "Marketplace public listing updated. Capture a Creator Space snapshot and compare opens/users before Community posting.";
  }
  return "Marketplace public listing is live but has no public engagement yet. Upload/record the current plugin package, then monitor opens/users, CTA events, likes, and comments.";
}

function renderMarkdown({ snapshot, previous, rows, record }) {
  const lines = [
    "# Framer Marketplace Public Snapshot",
    "",
    `Fetched: ${snapshot.fetched_at}`,
    `URL: ${snapshot.url}`,
    `HTTP status: ${snapshot.http_status}`,
    `Listing readable: ${snapshot.ok ? "yes" : "no"}`,
    record ? `Record: ${record.mode} (${record.total} rows)` : "Record: not requested",
    "",
    "## Public Listing",
    "",
    `- Title: ${snapshot.title || "unknown"}`,
    `- Description: ${snapshot.description || "unknown"}`,
    `- Author: ${snapshot.author || "unknown"}`,
    `- Slug: ${snapshot.slug || "unknown"}`,
    `- Likes: ${snapshot.likes}`,
    `- Comments: ${snapshot.comments}`,
    `- Created: ${snapshot.created_at || "unknown"}`,
    `- Updated: ${snapshot.updated_at || "unknown"}`,
    `- Published: ${snapshot.published_at || "unknown"}`,
    `- Featured: ${snapshot.featured_at || "no"}`,
    `- Framer plugin id: ${snapshot.framer_plugin_id || "unknown"}`,
    `- Paid: ${snapshot.paid || "unknown"}`,
    `- Categories: ${snapshot.categories || "unknown"}`,
    `- Images: ${snapshot.image_count}`,
    "",
    "## Recommendation",
    "",
    recommendation(snapshot, previous),
    "",
  ];

  if (previous) {
    lines.push(
      "## Previous Different Snapshot",
      "",
      `- Date: ${previous.date}`,
      `- Likes: ${previous.likes}`,
      `- Comments: ${previous.comments}`,
      `- Updated: ${previous.updated_at || "unknown"}`,
      "",
    );
  }

  if (rows.length) {
    lines.push("## Recent History", "");
    lines.push("| Date | Likes | Comments | Updated | Note |");
    lines.push("|---|---:|---:|---|---|");
    for (const row of latestRows(rows).slice(0, 10)) {
      lines.push(`| ${row.date} | ${row.likes} | ${row.comments} | ${row.updated_at || ""} | ${String(row.note || "").replace(/\|/g, "/")} |`);
    }
    lines.push("");
  }

  lines.push(
    "## Commands",
    "",
    "```bash",
    "pnpm lead:marketplace-public -- --record",
    "pnpm lead:marketplace-review",
    "pnpm lead:events && pnpm lead:forms && pnpm lead:ops",
    "```",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const snapshot = await fetchSnapshot(args);
  const beforeRows = await readRows(args.file);
  const previous = previousDifferent(beforeRows, snapshot);
  const record = args.record ? await recordSnapshot(args.file, snapshot) : null;
  const rows = args.record ? await readRows(args.file) : beforeRows;
  const data = {
    generated_at: new Date().toISOString(),
    file: args.file,
    snapshot,
    previous_different_snapshot: previous,
    record,
    history_count: rows.length,
    recommendation: recommendation(snapshot, previous),
  };

  await Promise.all([
    writeText(args.output, renderMarkdown({ snapshot, previous, rows, record })),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Marketplace public snapshot: ${snapshot.ok ? "live" : "not_readable"}\n`);
  process.stdout.write(`Likes/comments: ${snapshot.likes}/${snapshot.comments}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
