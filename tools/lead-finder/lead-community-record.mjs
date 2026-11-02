#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_KIT = ".tmp/framer-community-feed-kit.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-community-record.md";
const DEFAULT_JSON = ".tmp/framer-community-record.json";
const HEADERS = [
  "date",
  "type",
  "channel",
  "campaign",
  "status",
  "target",
  "evidence",
  "note",
];

function usage() {
  return `
Usage:
  pnpm lead:community-record -- --url <published-framer-community-url>
  pnpm lead:community-record -- --priority 2 --url <published-framer-community-url>

Options:
  --kit <file>          Community kit JSON. Default: ${DEFAULT_KIT}
  --actions <file>      External action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>  Record date. Default: local date.
  --priority <number>   Post priority from the kit. Default: 1
  --campaign <id>       Select post by campaign instead of priority.
  --url <url>           Published Framer Community URL. Required.
  --note <text>         Extra note appended to the action log.
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    kit: DEFAULT_KIT,
    actions: DEFAULT_ACTIONS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
    priority: 1,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--kit") {
      args.kit = value;
      index += 1;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
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
    if (key === "--priority") {
      args.priority = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--campaign") {
      args.campaign = value;
      index += 1;
      continue;
    }
    if (key === "--url") {
      args.url = value;
      index += 1;
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

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
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

function addDays(date, days) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function readJson(file, fallback) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
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
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
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

function validateUrl(value) {
  if (!value) throw new Error("--url is required.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--url must be a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("--url must be an http(s) URL.");
  }
  if (!url.hostname.endsWith("framer.com")) {
    throw new Error("--url must be a framer.com Community URL.");
  }
  if (!url.pathname.includes("/community/")) {
    throw new Error("--url must point to a Framer Community page.");
  }
  return url.toString();
}

function selectPost(kit, args) {
  const posts = Array.isArray(kit.posts) ? kit.posts : [];
  const post = args.campaign
    ? posts.find((item) => item.campaign === args.campaign)
    : posts.find((item) => Number(item.priority) === args.priority);
  if (!post) {
    const selector = args.campaign ? `campaign=${args.campaign}` : `priority=${args.priority}`;
    throw new Error(`No Community post found for ${selector}. Run pnpm lead:community first.`);
  }
  return post;
}

function actionFor({ post, url, args }) {
  return {
    date: args.today,
    type: "post",
    channel: post.channel || "framer_community_feed",
    campaign: post.campaign,
    status: "done",
    target: post.title,
    evidence: url,
    note: [
      `published ${post.title} from Framer Community feed kit`,
      args.note || "",
    ].filter(Boolean).join("; "),
  };
}

function isDuplicate(rows, action) {
  return rows.some(
    (row) =>
      row.type === action.type &&
      row.channel === action.channel &&
      row.campaign === action.campaign &&
      row.target === action.target &&
      row.evidence === action.evidence &&
      row.status === action.status,
  );
}

async function recordAction(file, action) {
  return withFileLock(file, async () => {
    const rows = await readRows(file);
    const duplicate = isDuplicate(rows, action);
    if (!duplicate) {
      rows.push(action);
      await writeRows(file, rows);
    }
    return { duplicate, total: rows.length };
  });
}

function reviewCommands(args) {
  return [
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:marketplace-public -- --record",
    "pnpm lead:community-review",
    "pnpm lead:distribution-review",
    "pnpm lead:gate",
    "pnpm lead:ops",
    `pnpm lead:community-review -- --today ${addDays(args.today, 1)}`,
    `pnpm lead:community-review -- --today ${addDays(args.today, 2)}`,
    `pnpm lead:community-review -- --today ${addDays(args.today, 3)}`,
  ];
}

function renderMarkdown({ post, url, args, record }) {
  const review24h = addDays(args.today, 1);
  const review48h = addDays(args.today, 2);
  const review72h = addDays(args.today, 3);
  const lines = [
    "# Framer Community Post Record",
    "",
    `Date: ${args.today}`,
    `Post: ${post.title}`,
    `Campaign: ${post.campaign}`,
    `URL: ${url}`,
    `Action log: ${record.duplicate ? "duplicate skipped" : "recorded"}`,
    `Action count: ${record.total}`,
    "",
    "## Review Schedule",
    "",
    `- 24h review: ${review24h}`,
    `- 48h review: ${review48h}`,
    `- 72h decision review: ${review72h}`,
    "",
    "## Commands",
    "",
    "```bash",
    ...reviewCommands(args),
    "```",
    "",
  ];
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

  const url = validateUrl(args.url);
  const kit = await readJson(args.kit, { posts: [] });
  const post = selectPost(kit, args);
  const action = actionFor({ post, url, args });
  const record = await recordAction(args.actions, action);
  const data = {
    generated_at: new Date().toISOString(),
    post,
    url,
    action,
    record,
    review_24h: addDays(args.today, 1),
    review_48h: addDays(args.today, 2),
    review_72h: addDays(args.today, 3),
    commands: reviewCommands(args),
  };

  await Promise.all([
    writeText(args.output, renderMarkdown({ post, url, args, record })),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`${record.duplicate ? "Already recorded" : "Recorded"}: ${post.title}\n`);
  process.stdout.write(`24h review: ${data.review_24h}\n`);
  process.stdout.write(`48h review: ${data.review_48h}\n`);
  process.stdout.write(`72h decision review: ${data.review_72h}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
