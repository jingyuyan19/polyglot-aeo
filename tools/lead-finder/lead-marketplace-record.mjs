#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_PLUGIN_ZIP = "plugin.zip";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_OUTPUT = ".tmp/framer-marketplace-record.md";
const DEFAULT_JSON = ".tmp/framer-marketplace-record.json";
const DEFAULT_EVIDENCE = ".tmp/framer-marketplace-update.md";
const SNAPSHOT_KEYS = ["users", "opens", "version", "updated"];
const INTERNAL_EVIDENCE_FILENAMES = new Set([
  "framer-marketplace-update.md",
  "framer-marketplace-preflight.md",
  "framer-marketplace-record.md",
  "framer-growth-ops.md",
  "framer-launch-console.html",
]);
const ACTION_HEADERS = [
  "date",
  "type",
  "channel",
  "campaign",
  "status",
  "target",
  "evidence",
  "note",
];
const SNAPSHOT_HEADERS = ["date", "plugin", "users", "opens", "version", "updated", "note"];
const TARGET = "Polyglot AEO New Version";

function usage() {
  return `
Usage:
  pnpm lead:marketplace-record -- --evidence "<framer-upload-confirmation-url-or-screenshot>"
  pnpm lead:marketplace-record -- --users 2 --opens 4 --version 2 --updated "just now"

Options:
  --actions <file>      External action log CSV. Default: ${DEFAULT_ACTIONS}
  --marketplace <file>  Marketplace snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --plugin-zip <file>   Uploaded plugin zip. Default: ${DEFAULT_PLUGIN_ZIP}
  --marketplace-preflight <file> Upload preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>  Record date. Default: local date.
  --evidence <text>     External upload evidence. Default: ${DEFAULT_EVIDENCE} (preparation only; rejected unless Creator Space snapshot values are provided)
  --note <text>         Extra action note.
  --users <number>      Optional Creator Space Users value for after-upload snapshot.
  --opens <number>      Optional Creator Space Opens value for after-upload snapshot.
  --version <number>    Optional Creator Space Version value for after-upload snapshot.
  --updated <text>      Optional Creator Space Updated value for after-upload snapshot.
  --allow-preflight-bypass Allow recording without upload_allowed preflight. Requires --note.
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    marketplace: DEFAULT_MARKETPLACE,
    pluginZip: DEFAULT_PLUGIN_ZIP,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
    evidence: DEFAULT_EVIDENCE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace") {
      args.marketplace = value;
      index += 1;
      continue;
    }
    if (key === "--plugin-zip") {
      args.pluginZip = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-preflight") {
      args.marketplacePreflight = value;
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
    if (key === "--allow-preflight-bypass") {
      args.allowPreflightBypass = true;
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

async function writeRows(file, headers, rows) {
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${csv}\n`, "utf8");
}

async function zipInfo(file) {
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  return {
    path: path.resolve(file),
    size: info.size,
    modified: info.mtime.toISOString(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function snapshotArgsProvided(args) {
  return SNAPSHOT_KEYS.some((key) => args[key] !== undefined);
}

function snapshotArgsComplete(args) {
  return SNAPSHOT_KEYS.every((key) => args[key] !== undefined && String(args[key]).trim());
}

function snapshotFromArgs(args, zip) {
  if (!snapshotArgsProvided(args)) return null;
  for (const key of SNAPSHOT_KEYS) {
    if (args[key] === undefined || !String(args[key]).trim()) {
      throw new Error(`--${key} is required when recording an after-upload snapshot.`);
    }
  }
  return {
    date: args.today,
    plugin: "Polyglot AEO",
    users: args.users,
    opens: args.opens,
    version: args.version,
    updated: args.updated,
    note: `after plugin.zip upload sha ${zip.sha256}`,
  };
}

function evidenceText(value) {
  return String(value || "").trim();
}

function isPlaceholderEvidence(value) {
  const text = evidenceText(value);
  return /^<[^>]+>$/.test(text);
}

function isInternalPreparationEvidence(value) {
  const text = evidenceText(value);
  if (!text) return true;
  const normalized = text.replace(/\\/g, "/").toLowerCase();
  const filename = path.posix.basename(normalized);
  if (INTERNAL_EVIDENCE_FILENAMES.has(filename)) return true;
  return [...INTERNAL_EVIDENCE_FILENAMES].some((name) => normalized.includes(`/${name}`));
}

function creatorSpaceEvidence(args) {
  return [
    "Creator Space snapshot",
    `users=${args.users}`,
    `opens=${args.opens}`,
    `version=${args.version}`,
    `updated=${args.updated}`,
  ].join(" ");
}

function validateUploadEvidence(args) {
  if (snapshotArgsComplete(args)) {
    const evidence = isInternalPreparationEvidence(args.evidence) || isPlaceholderEvidence(args.evidence)
      ? creatorSpaceEvidence(args)
      : evidenceText(args.evidence);
    return {
      kind: "creator_space_snapshot",
      evidence,
      note: "record gate external proof provided by Creator Space snapshot",
    };
  }

  const evidence = evidenceText(args.evidence);
  if (evidence && !isInternalPreparationEvidence(evidence) && !isPlaceholderEvidence(evidence)) {
    return {
      kind: "upload_confirmation",
      evidence,
      note: "record gate external upload evidence provided",
    };
  }

  throw new Error(
    [
      "Marketplace upload record needs external upload evidence.",
      `${DEFAULT_EVIDENCE} and unreplaced <...> placeholders are preparation aids and cannot prove the Framer upload happened.`,
      "Provide --evidence '<Framer upload confirmation URL/screenshot/admin note>' after replacing the placeholder, or include all Creator Space snapshot values with --users --opens --version --updated.",
    ].join(" "),
  );
}

function actionFor(args, zip, recordGate) {
  return {
    date: args.today,
    type: "marketplace_upload",
    channel: "framer",
    campaign: "plugin_upgrade",
    status: "done",
    target: TARGET,
    evidence: recordGate?.evidence || args.evidence,
    note: [
      `uploaded plugin.zip sha ${zip.sha256}`,
      recordGate?.note || "",
      args.note || "",
    ].filter(Boolean).join("; "),
  };
}

async function uploadAlreadyRecorded(file) {
  const rows = await readRows(file);
  return rows.some(
    (row) =>
      row.type === "marketplace_upload" &&
      row.campaign === "plugin_upgrade" &&
      row.target === TARGET &&
      row.status === "done",
  );
}

async function validateRecordGate(args, zip) {
  const proof = validateUploadEvidence(args);

  if (await uploadAlreadyRecorded(args.actions)) {
    return {
      status: "existing_upload_done",
      evidence: proof.evidence,
      proof_kind: proof.kind,
      note: `${proof.note}; record gate existing upload done`,
    };
  }

  if (args.allowPreflightBypass) {
    if (!args.note) {
      throw new Error("--allow-preflight-bypass requires --note with the manual evidence/reason.");
    }
    return {
      status: "bypassed",
      evidence: proof.evidence,
      proof_kind: proof.kind,
      note: `${proof.note}; record gate preflight bypassed`,
    };
  }

  const preflight = await readJson(args.marketplacePreflight, null);
  const blockers = [];
  if (!preflight) {
    blockers.push(`missing ${args.marketplacePreflight}`);
  } else {
    if (preflight.verdict !== "ready_to_upload") {
      blockers.push(`preflight verdict is ${preflight.verdict || "unknown"}`);
    }
    if (preflight.upload_allowed !== true) {
      blockers.push("preflight upload_allowed is not true");
    }
    if (preflight.zip?.sha256 !== zip.sha256) {
      blockers.push(`preflight zip SHA ${preflight.zip?.sha256 || "missing"} does not match ${zip.sha256}`);
    }
  }

  if (blockers.length) {
    throw new Error(`Marketplace upload record blocked by preflight: ${blockers.join("; ")}. Run pnpm lead:marketplace-preflight before recording the upload.`);
  }

  return {
    status: "passed",
    evidence: proof.evidence,
    proof_kind: proof.kind,
    note: `${proof.note}; record gate preflight passed ${zip.sha256}`,
    preflight,
  };
}

async function recordAction(file, action) {
  return withFileLock(file, async () => {
    const rows = await readRows(file);
    const matching = rows
      .map((row, index) => ({ row, index }))
      .reverse()
      .find(({ row }) => row.type === action.type && row.target === action.target);

    if (matching) {
      rows[matching.index] = {
        ...rows[matching.index],
        ...action,
      };
      await writeRows(file, ACTION_HEADERS, rows);
      return { mode: "updated", total: rows.length };
    }

    rows.push(action);
    await writeRows(file, ACTION_HEADERS, rows);
    return { mode: "added", total: rows.length };
  });
}

async function recordSnapshot(file, snapshot) {
  if (!snapshot) return { mode: "skipped", total: null };
  return withFileLock(file, async () => {
    const rows = await readRows(file);
    const duplicate = rows.some(
      (row) =>
        row.date === snapshot.date &&
        row.plugin === snapshot.plugin &&
        row.users === snapshot.users &&
        row.opens === snapshot.opens &&
        row.version === snapshot.version &&
        row.updated === snapshot.updated,
    );
    if (!duplicate) {
      rows.push(snapshot);
      await writeRows(file, SNAPSHOT_HEADERS, rows);
    }
    return { mode: duplicate ? "duplicate_skipped" : "added", total: rows.length };
  });
}

function renderMarkdown({ args, zip, actionRecord, snapshot, snapshotRecord, recordGate }) {
  const lines = [
    "# Framer Marketplace Upload Record",
    "",
    `Date: ${args.today}`,
    `Plugin zip: ${zip.path}`,
    `SHA256: ${zip.sha256}`,
    `Modified: ${zip.modified}`,
    `Record gate: ${recordGate.status}`,
    `Evidence gate: ${recordGate.proof_kind}`,
    `Evidence: ${recordGate.evidence}`,
    `Action log: ${actionRecord.mode} (${actionRecord.total} rows)`,
    `Snapshot: ${snapshotRecord.mode}${snapshotRecord.total === null ? "" : ` (${snapshotRecord.total} rows)`}`,
    "",
    "## Next Commands",
    "",
    "```bash",
    "pnpm lead:marketplace-review",
    "pnpm lead:events && pnpm lead:forms",
    "pnpm lead:action-review && pnpm lead:channel-priority",
    "pnpm lead:ops && pnpm lead:report",
    "pnpm lead:public-preflight",
    "```",
    "",
    "## Review Windows",
    "",
    "- Same day: confirm the new version and record Creator Space users/opens/version/updated.",
    "- Evidence: keep the Framer upload confirmation URL/screenshot/admin note, or the Creator Space snapshot values used above.",
    "- 24h and 48h: compare users/opens plus CTA/form events before deciding whether to post in Community.",
    "- 7d: keep or drop Marketplace-led distribution based on real opens/users, checkout clicks, forms, or revenue.",
    "",
  ];

  if (snapshot) {
    lines.push("## Snapshot", "");
    lines.push(
      `- Users: ${snapshot.users}`,
      `- Opens: ${snapshot.opens}`,
      `- Version: ${snapshot.version}`,
      `- Updated: ${snapshot.updated}`,
      "",
    );
  } else {
    lines.push("## Snapshot", "", "No after-upload Creator Space snapshot values were provided.", "");
  }

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

  const zip = await zipInfo(args.pluginZip);
  const recordGate = await validateRecordGate(args, zip);
  const action = actionFor(args, zip, recordGate);
  const snapshot = snapshotFromArgs(args, zip);
  const [actionRecord, snapshotRecord] = await Promise.all([
    recordAction(args.actions, action),
    recordSnapshot(args.marketplace, snapshot),
  ]);
  const data = {
    generated_at: new Date().toISOString(),
    zip,
    record_gate: {
      status: recordGate.status,
      proof_kind: recordGate.proof_kind,
      evidence: recordGate.evidence,
      preflight_path: args.marketplacePreflight,
    },
    action,
    action_record: actionRecord,
    snapshot,
    snapshot_record: snapshotRecord,
  };

  await Promise.all([
    writeText(args.output, renderMarkdown({ args, zip, actionRecord, snapshot, snapshotRecord, recordGate })),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Marketplace upload recorded: ${actionRecord.mode}\n`);
  process.stdout.write(`Record gate: ${recordGate.status}\n`);
  process.stdout.write(`Snapshot: ${snapshotRecord.mode}\n`);
  process.stdout.write(`SHA256: ${zip.sha256}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
