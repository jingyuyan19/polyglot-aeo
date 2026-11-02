#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_PARTNER_REVIEW = ".tmp/framer-partner-review.json";
const DEFAULT_PARTNERS = "tools/lead-finder/partners.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-partner-log.md";
const DEFAULT_JSON = ".tmp/framer-partner-log.json";

const PARTNER_TYPES = new Set(["email_send", "directory_submission", "platform_request"]);

function usage() {
  return `
Usage:
  pnpm lead:partners

Options:
  --actions <file>        Action log CSV. Default: ${DEFAULT_ACTIONS}
  --partner-review <file> Partner review JSON. Default: ${DEFAULT_PARTNER_REVIEW}
  --partners <file>       Partner log CSV to maintain. Default: ${DEFAULT_PARTNERS}
  --output <file>         Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>           JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>    Report date. Default: local date.
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    partnerReview: DEFAULT_PARTNER_REVIEW,
    partners: DEFAULT_PARTNERS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    const map = {
      "--actions": "actions",
      "--partner-review": "partnerReview",
      "--partners": "partners",
      "--output": "output",
      "--json": "json",
      "--today": "today",
    };
    if (map[key]) {
      args[map[key]] = value;
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

async function readJson(file, fallback = null) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
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
      } else if (char === '"') quoted = false;
      else cell += char;
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
    } else if (char !== "\r") cell += char;
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
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function renderCsv(rows) {
  const headers = [
    "partner_id",
    "first_seen",
    "last_action",
    "kind",
    "campaign",
    "target",
    "status",
    "next_review",
    "action_count",
    "signal_count",
    "evidence",
    "notes",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] || "")).join(",")),
  ].join("\n") + "\n";
}

function isPartnerAction(action) {
  const campaign = String(action.campaign || "");
  const target = String(action.target || "");
  if (campaign.startsWith("content_partner_")) return true;
  if (/directory|frameplate|frameplugins|hyperframer|all framer/i.test(campaign + " " + target)) return true;
  if (!PARTNER_TYPES.has(action.type)) return false;
  return action.channel === "gmail" || action.channel === "framer" || action.channel === "web";
}

function partnerKind(action) {
  const text = `${action.type || ""} ${action.channel || ""} ${action.campaign || ""} ${action.target || ""}`;
  if (/directory|frameplate|frameplugins|hyperframer|all framer/i.test(text)) return "directory";
  if (action.type === "platform_request" || /framer community|creator|marketplace/i.test(text)) return "platform";
  return "content_partner";
}

function partnerIdFor(action) {
  return slugify(`${partnerKind(action)}-${action.campaign || "campaign"}-${action.target || "target"}`).slice(0, 96);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "partner";
}

function actionHasSignal(action) {
  const text = `${action.status || ""} ${action.evidence || ""} ${action.note || ""}`;
  if (/no reply|no human|auto[- ]?reply|automated|sent resource|sent .*pitch|asked .*confirm|requires explicit confirmation|manual product submission path/i.test(text)) {
    return false;
  }
  return /reply received|human reply|listed|accepted|backlink live|included in|published listing|opportunity|revenue|customer reply|positive signal|form submission|cta event/i.test(text);
}

function reviewRowById(partnerReview, row) {
  const rows = Array.isArray(partnerReview?.rows) ? partnerReview.rows : [];
  return rows.find((item) => {
    const action = item.action || {};
    return (
      String(action.campaign || "") === row.campaign &&
      String(action.target || "") === row.target
    );
  }) || null;
}

function build({ actionRows, existingRows, partnerReview }) {
  const existingById = new Map(existingRows.map((row) => [row.partner_id, row]));
  const grouped = new Map();
  for (const action of actionRows.filter(isPartnerAction)) {
    const id = partnerIdFor(action);
    const group = grouped.get(id) || [];
    group.push(action);
    grouped.set(id, group);
  }

  const rows = [];
  for (const [partnerId, actions] of grouped.entries()) {
    actions.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.__index - b.__index);
    const first = actions[0];
    const last = actions[actions.length - 1];
    const existing = existingById.get(partnerId) || {};
    const reviewRow = reviewRowById(partnerReview, {
      campaign: first.campaign || "",
      target: first.target || "",
    });
    const signalCount = actions.filter(actionHasSignal).length + Number(isTrue(reviewRow?.has_signal) ? 1 : 0);
    const status = existing.status && existing.status !== "synced"
      ? existing.status
      : reviewRow?.status || last.status || "synced";
    rows.push({
      partner_id: partnerId,
      first_seen: existing.first_seen || first.date || "",
      last_action: last.date || existing.last_action || "",
      kind: existing.kind || partnerKind(first),
      campaign: first.campaign || existing.campaign || "",
      target: first.target || existing.target || "",
      status,
      next_review: reviewRow?.next_due_date || existing.next_review || "",
      action_count: String(actions.length),
      signal_count: String(signalCount),
      evidence: last.evidence || existing.evidence || "",
      notes: joinUniqueNotes(existing.notes, last.note),
    });
  }

  for (const existing of existingRows) {
    if (!grouped.has(existing.partner_id)) rows.push(existing);
  }

  rows.sort((a, b) =>
    String(b.last_action || b.first_seen).localeCompare(String(a.last_action || a.first_seen)) ||
    String(a.partner_id).localeCompare(String(b.partner_id)),
  );

  const due = rows.filter((row) => row.next_review && row.next_review <= todayLocal() && !/closed|stopped|listed|accepted/i.test(row.status));
  const signaled = rows.filter((row) => Number(row.signal_count || 0) > 0);
  return {
    generated_at: new Date().toISOString(),
    rows,
    total: rows.length,
    due_count: due.length,
    signal_count: signaled.length,
    recommendation: due.length
      ? `Review ${due.length} partner/directory item(s) due now before sending more partner outreach.`
      : signaled.length
        ? "Partner log has signal; turn replies/listings into proof assets before expanding."
        : "No partner signal yet; keep partner/directory expansion small and confirmation-gated.",
  };
}

function isTrue(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function joinUniqueNotes(...values) {
  const parts = [];
  for (const value of values) {
    for (const part of String(value || "").split(/\s+\|\s+/)) {
      const trimmed = part.trim();
      if (trimmed && !parts.includes(trimmed)) parts.push(trimmed);
    }
  }
  return parts.join(" | ");
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Partner Log",
    "",
    `Generated: ${report.generated_at}`,
    "",
    "## Summary",
    "",
    `- Partners/directories tracked: ${report.total}`,
    `- Due reviews: ${report.due_count}`,
    `- Rows with signal: ${report.signal_count}`,
    `- Recommendation: ${report.recommendation}`,
    "",
    "## Rows",
    "",
    "| Status | Next review | Kind | Campaign | Target | Actions | Signals |",
    "|---|---|---|---|---|---:|---:|",
  ];
  for (const row of report.rows.slice(0, 80)) {
    lines.push(`| ${pipe(row.status)} | ${row.next_review || ""} | ${pipe(row.kind)} | ${pipe(row.campaign)} | ${pipe(row.target)} | ${row.action_count || "0"} | ${row.signal_count || "0"} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
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

  const [actionRows, existingRows, partnerReview] = await Promise.all([
    readRows(args.actions),
    readRows(args.partners),
    readJson(args.partnerReview, null),
  ]);
  const report = build({ actionRows, existingRows, partnerReview });
  await Promise.all([
    writeText(args.partners, renderCsv(report.rows)),
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Partner log: ${args.partners}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
