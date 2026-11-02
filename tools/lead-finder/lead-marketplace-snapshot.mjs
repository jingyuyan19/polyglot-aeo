#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_FILE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-marketplace-snapshots.md";
const HEADERS = ["date", "plugin", "users", "opens", "version", "updated", "note"];

function usage() {
  return `
Usage:
  pnpm lead:marketplace
  pnpm lead:marketplace -- --add --users 1 --opens 1 --version 1 --updated "1d ago" --note "Creator Space dashboard"

Options:
  --file <file>       Snapshot CSV. Default: ${DEFAULT_FILE}
  --output <file>     Markdown output. Default: ${DEFAULT_OUTPUT}
  --today <YYYY-MM-DD> Default snapshot date. Default: local date.
  --add               Append a snapshot.
  --plugin <name>     Plugin name. Default: Polyglot AEO.
  --users <number>    Creator Space Users value.
  --opens <number>    Creator Space Opens value.
  --version <number>  Creator Space Version value.
  --updated <text>    Creator Space Updated value.
  --note <text>       Short note.
  --help              Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    file: DEFAULT_FILE,
    output: DEFAULT_OUTPUT,
    today: todayLocal(),
    plugin: "Polyglot AEO",
    add: false,
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
    if (key === "--plugin") {
      args.plugin = value;
      index += 1;
      continue;
    }
    if (key === "--users") {
      args.users = value;
      index += 1;
      continue;
    }
    if (key === "--opens") {
      args.opens = value;
      index += 1;
      continue;
    }
    if (key === "--version") {
      args.version = value;
      index += 1;
      continue;
    }
    if (key === "--updated") {
      args.updated = value;
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

function snapshotFromArgs(args) {
  for (const key of ["users", "opens", "version", "updated"]) {
    if (args[key] === undefined) throw new Error(`--${key} is required with --add.`);
  }
  return {
    date: args.today,
    plugin: args.plugin,
    users: args.users,
    opens: args.opens,
    version: args.version,
    updated: args.updated,
    note: args.note || "",
  };
}

function number(value) {
  return Number.parseInt(value || "0", 10) || 0;
}

function delta(current, previous, key) {
  if (!previous) return "";
  const change = number(current[key]) - number(previous[key]);
  if (change === 0) return "0";
  return change > 0 ? `+${change}` : String(change);
}

function render(rows, file) {
  const sorted = [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latest = sorted[0];
  const previous = sorted.slice(1).find((row) => row.plugin === latest?.plugin);
  const lines = [
    "# Framer Marketplace Snapshots",
    "",
    `CSV: ${file}`,
    `Snapshots: ${rows.length}`,
    "",
  ];

  if (!rows.length) {
    lines.push("No Marketplace snapshots recorded yet.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("## Latest", "");
  lines.push(`- Plugin: ${latest.plugin}`);
  lines.push(`- Users: ${latest.users}${previous ? ` (${delta(latest, previous, "users")})` : ""}`);
  lines.push(`- Opens: ${latest.opens}${previous ? ` (${delta(latest, previous, "opens")})` : ""}`);
  lines.push(`- Version: ${latest.version}${previous ? ` (${delta(latest, previous, "version")})` : ""}`);
  lines.push(`- Updated: ${latest.updated}`);
  lines.push("");
  lines.push("## History", "");
  lines.push("| Date | Plugin | Users | Opens | Version | Updated | Note |");
  lines.push("|---|---|---:|---:|---:|---|---|");
  for (const row of sorted.slice(0, 20)) {
    lines.push(`| ${row.date} | ${row.plugin} | ${row.users} | ${row.opens} | ${row.version} | ${row.updated} | ${String(row.note || "").replace(/\|/g, "/")} |`);
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

  const rows = await readRows(args.file);
  if (args.add) {
    rows.push(snapshotFromArgs(args));
    await writeRows(args.file, rows);
  }

  const markdown = render(rows, args.file);
  await writeText(args.output, markdown);
  process.stdout.write(markdown);
  process.stdout.write(`Marketplace snapshot written to ${args.output}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
