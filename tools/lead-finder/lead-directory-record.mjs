#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_KIT = ".tmp/framer-directory-submit-kit.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-directory-record.md";
const DEFAULT_JSON = ".tmp/framer-directory-record.json";
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
  pnpm lead:directory-record -- --evidence <submission-confirmation-or-screenshot>
  pnpm lead:directory-record -- --campaign frameplate_resource --evidence <submission-confirmation-or-screenshot>

Options:
  --kit <file>          Directory kit JSON. Default: ${DEFAULT_KIT}
  --actions <file>      External action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>  Record date. Default: local date.
  --priority <number>   Target priority from the kit. Default: 1
  --id <id>             Select target by kit id instead of priority.
  --campaign <id>       Select target by campaign instead of priority.
  --evidence <text>     Submission confirmation, screenshot path, or accepted listing URL. Required.
  --note <text>         Extra note appended to the action log.
  --force               Allow recording a target that is not manual_confirmation_required.
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
    force: false,
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
    if (key === "--id") {
      args.id = value;
      index += 1;
      continue;
    }
    if (key === "--campaign") {
      args.campaign = value;
      index += 1;
      continue;
    }
    if (key === "--evidence") {
      args.evidence = value;
      index += 1;
      continue;
    }
    if (key === "--note") {
      args.note = value;
      index += 1;
      continue;
    }
    if (key === "--force") {
      args.force = true;
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

function validateEvidence(value) {
  const evidence = String(value || "").trim();
  if (!evidence) {
    throw new Error("--evidence is required after the directory action is actually submitted.");
  }
  if (/^https?:\/\//.test(evidence)) {
    try {
      return new URL(evidence).toString();
    } catch {
      throw new Error("--evidence starts with http(s) but is not a valid URL.");
    }
  }
  return evidence;
}

function selectTarget(kit, args) {
  const targets = Array.isArray(kit.targets) ? kit.targets : [];
  const target = args.campaign
    ? targets.find((item) => item.campaign === args.campaign)
    : args.id
      ? targets.find((item) => item.id === args.id)
      : targets.find((item) => Number(item.priority) === args.priority);

  if (!target) {
    const selector = args.campaign
      ? `campaign=${args.campaign}`
      : args.id
        ? `id=${args.id}`
        : `priority=${args.priority}`;
    throw new Error(`No directory target found for ${selector}. Run pnpm lead:directory first.`);
  }

  if (target.status !== "manual_confirmation_required" && !args.force) {
    throw new Error(
      `${target.name} has kit status ${target.status}. Use --force only after action-time confirmation.`,
    );
  }

  return target;
}

function actionFor({ target, evidence, args }) {
  return {
    date: args.today,
    type: "directory_submission",
    channel: target.channel,
    campaign: target.campaign,
    status: "done",
    target: target.name,
    evidence,
    note: [
      `submitted ${target.name} from directory kit`,
      target.action || "",
      args.note || "",
    ].filter(Boolean).join("; "),
  };
}

async function recordAction(file, action) {
  return withFileLock(file, async () => {
    const rows = await readRows(file);
    const matching = rows
      .map((row, index) => ({ row, index }))
      .reverse()
      .find(
        ({ row }) =>
          row.type === action.type &&
          row.channel === action.channel &&
          row.campaign === action.campaign &&
          row.target === action.target,
      );

    if (matching) {
      const existing = rows[matching.index];
      const unchanged =
        existing.status === action.status &&
        existing.evidence === action.evidence &&
        existing.note === action.note;
      if (unchanged) {
        return { mode: "duplicate_skipped", total: rows.length };
      }
      rows[matching.index] = {
        ...existing,
        ...action,
      };
      await writeRows(file, rows);
      return { mode: "updated", total: rows.length };
    }

    rows.push(action);
    await writeRows(file, rows);
    return { mode: "added", total: rows.length };
  });
}

function reviewCommands(args) {
  return [
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:directory-review",
    "pnpm lead:public-preflight",
    "pnpm lead:ops",
    `# 7d directory review: ${addDays(args.today, 7)}`,
    `# 14d directory review: ${addDays(args.today, 14)}`,
  ];
}

function renderMarkdown({ target, action, args, record }) {
  const lines = [
    "# Framer Directory Submission Record",
    "",
    `Date: ${args.today}`,
    `Target: ${target.name}`,
    `Channel: ${target.channel}`,
    `Campaign: ${target.campaign}`,
    `Submit URL: ${target.submit_url}`,
    `Evidence: ${action.evidence}`,
    `Action log: ${record.mode} (${record.total} rows)`,
    "",
    "## Review Schedule",
    "",
    `- 7d review: ${addDays(args.today, 7)}`,
    `- 14d review: ${addDays(args.today, 14)}`,
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

  const evidence = validateEvidence(args.evidence);
  const kit = await readJson(args.kit, { targets: [] });
  const target = selectTarget(kit, args);
  const action = actionFor({ target, evidence, args });
  const record = await recordAction(args.actions, action);
  const data = {
    generated_at: new Date().toISOString(),
    target,
    action,
    record,
    review_7d: addDays(args.today, 7),
    review_14d: addDays(args.today, 14),
    commands: reviewCommands(args),
  };

  await Promise.all([
    writeText(args.output, renderMarkdown({ target, action, args, record })),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Directory submission recorded: ${record.mode}\n`);
  process.stdout.write(`Target: ${target.name}\n`);
  process.stdout.write(`7d review: ${data.review_7d}\n`);
  process.stdout.write(`14d review: ${data.review_14d}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
