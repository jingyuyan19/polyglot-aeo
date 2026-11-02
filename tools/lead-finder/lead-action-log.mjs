#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_FILE = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-action-log.md";
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
  pnpm lead:actions
  pnpm lead:actions -- --add --type post --channel linkedin --campaign framer_aeo_benchmark --status done --target "Framer AEO benchmark post" --evidence "<published-url>"
  pnpm lead:actions -- --update --type post --target "Framer AEO benchmark post" --status done --evidence "<published-url>"

Options:
  --file <file>       Action log CSV. Default: ${DEFAULT_FILE}
  --output <file>     Markdown summary. Default: ${DEFAULT_OUTPUT}
  --today <YYYY-MM-DD> Default action date. Default: local date.
  --add               Append a new action.
  --update            Update the newest matching action by --type and --target.
  --type <type>       Action type, e.g. marketplace_upload, post, email_send.
  --channel <name>    Channel, e.g. framer, linkedin, gmail.
  --campaign <name>   Campaign name.
  --status <status>   planned, pending, done, blocked, skipped. Default: planned.
  --target <text>     Target page/person/post.
  --evidence <text>   Link, file, or external id.
  --note <text>       Short note.
  --help              Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    file: DEFAULT_FILE,
    output: DEFAULT_OUTPUT,
    today: todayLocal(),
    add: false,
    update: false,
    status: "planned",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
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
    if (key === "--today") {
      args.today = value;
      index += 1;
      continue;
    }
    if (key === "--add") {
      args.add = true;
      continue;
    }
    if (key === "--update") {
      args.update = true;
      continue;
    }
    if (key === "--type") {
      args.type = value;
      index += 1;
      continue;
    }
    if (key === "--channel") {
      args.channel = value;
      index += 1;
      continue;
    }
    if (key === "--campaign") {
      args.campaign = value;
      index += 1;
      continue;
    }
    if (key === "--status") {
      args.status = value;
      index += 1;
      continue;
    }
    if (key === "--target") {
      args.target = value;
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
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

async function readRows(file) {
  const text = await readText(file);
  if (!text) return [];
  return parseCsv(text);
}

async function writeRows(file, rows) {
  const csv = [
    HEADERS.join(","),
    ...rows.map((row) => HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${csv}\n`, "utf8");
}

function actionFromArgs(args) {
  if (!args.type) throw new Error("--type is required with --add.");
  if (!args.channel) throw new Error("--channel is required with --add.");
  if (!args.target) throw new Error("--target is required with --add.");
  return {
    date: args.today,
    type: args.type,
    channel: args.channel,
    campaign: args.campaign || "",
    status: args.status || "planned",
    target: args.target,
    evidence: args.evidence || "",
    note: args.note || "",
  };
}

function updateRows(rows, args) {
  if (!args.type) throw new Error("--type is required with --update.");
  if (!args.target) throw new Error("--target is required with --update.");

  const index = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .reverse()
    .find(({ row }) => row.type === args.type && row.target === args.target)
    ?.rowIndex;

  if (index === undefined) {
    throw new Error(`No matching action found for type=${args.type} target=${args.target}`);
  }

  rows[index] = {
    ...rows[index],
    date: args.today || rows[index].date,
    channel: args.channel || rows[index].channel,
    campaign: args.campaign || rows[index].campaign,
    status: args.status || rows[index].status,
    evidence: args.evidence || rows[index].evidence,
    note: args.note || rows[index].note,
  };

  return rows[index];
}

function render(rows, file) {
  const sorted = [...rows].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || String(a.type).localeCompare(String(b.type)),
  );
  const lines = [
    "# Framer Growth Action Log",
    "",
    `CSV: ${file}`,
    `Actions: ${rows.length}`,
    "",
  ];

  if (!rows.length) {
    lines.push("No external actions recorded yet.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Date | Type | Channel | Campaign | Status | Target | Evidence |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const row of sorted.slice(0, 30)) {
    lines.push(
      `| ${row.date} | ${row.type} | ${row.channel} | ${row.campaign || ""} | ${row.status} | ${String(row.target || "").replace(/\|/g, "/")} | ${String(row.evidence || "").replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
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

  const rows = await withFileLock(args.file, async () => {
    const currentRows = await readRows(args.file);
    if (args.add) {
      currentRows.push(actionFromArgs(args));
      await writeRows(args.file, currentRows);
    }
    if (args.update) {
      updateRows(currentRows, args);
      await writeRows(args.file, currentRows);
    }
    return currentRows;
  });

  const markdown = render(rows, args.file);
  await writeText(args.output, markdown);
  process.stdout.write(markdown);
  process.stdout.write(`Action log written to ${args.output}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
