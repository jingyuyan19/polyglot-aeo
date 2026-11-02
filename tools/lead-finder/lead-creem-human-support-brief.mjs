#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_OUTPUT = ".tmp/framer-creem-human-support-brief.md";
const DEFAULT_JSON = ".tmp/framer-creem-human-support-brief.json";

const CONFIRMATION = "确认继续跟进 Loka Pro Creem human support";
const THREAD_ID = "19f1aca947cfe24d";
const LATEST_AUTO_REPLY_ID = "19f1bcacab7de53f";
const GMAIL_QUERY = 'newer_than:14d -in:spam -in:trash (from:creem.io OR from:creem.com OR from:support@creem.io OR from:compliance@creem.io OR Creem OR CREEM) (Loka OR "Loka Pro" OR getloka OR compliance OR unregistered OR origin OR referrer OR traffic OR "human support")';

function usage() {
  return `
Usage:
  pnpm lead:creem-human-support

Options:
  --actions <file>      Action log CSV. Default: ${DEFAULT_ACTIONS}
  --experiments <file>  Portfolio experiments JSON. Default: ${DEFAULT_EXPERIMENTS}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    experiments: DEFAULT_EXPERIMENTS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
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
      "--experiments": "experiments",
      "--output": "output",
      "--json": "json",
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

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function latestRow(rows, predicate) {
  return rows
    .filter(predicate)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.__index || 0) - Number(a.__index || 0))[0] || null;
}

function isOpen(row) {
  return !/done|resolved|closed|skipped|cancelled|canceled/i.test(row.status || "");
}

function addDays(date, days) {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed + days * 86400000).toISOString().slice(0, 10);
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

function experimentFor(experiments) {
  return (experiments?.experiments || []).find((row) => row.id === "loka_compliance_origin_recovery") || null;
}

function draftBody() {
  return `Hi Creem Support,

Human support, please.

Could a human support teammate confirm the exact website/origin/referrer that triggered the unregistered checkout traffic warning for the Loka Pro store?

Store: Loka Pro
Registered website: https://getloka.dev
Original warning: Regarding Loka Pro

I need to either register the correct source/store or remove unintended checkout traffic before the compliance deadline.

Thanks,
Jimmy`;
}

function build({ actionRows, experiments }) {
  const experiment = experimentFor(experiments);
  const latestReview = latestRow(actionRows, (row) =>
    row.type === "compliance_review" &&
    /loka_creem_origin_referrer_followup/i.test(row.campaign || "") &&
    isOpen(row)
  );
  const sentFollowup = latestRow(actionRows, (row) =>
    /email_send/i.test(row.type || "") &&
    /gmail/i.test(row.channel || "") &&
    /loka_creem_human_support_followup/i.test(row.campaign || "") &&
    !/blocked|failed|cancelled|canceled/i.test(row.status || "")
  );
  const resolvedWarning = latestRow(actionRows, (row) =>
    /compliance_warning/i.test(row.type || "") &&
    /creem/i.test(row.channel || "") &&
    /resolved|closed|done/i.test(row.status || "") &&
    /loka|unregistered|creem compliance/i.test(`${row.campaign || ""} ${row.target || ""} ${row.note || ""}`)
  );

  const hasAutoReplyEvidence = /auto|offline|human support|no origin\/referrer|no origin|no referrer/i.test(latestReview?.note || "");
  const status = resolvedWarning
    ? "resolved"
    : sentFollowup
      ? "waiting_provider"
      : hasAutoReplyEvidence
        ? "ready_confirmation_required"
        : "waiting_provider";
  const today = todayLocal();
  const reviews = [
    { label: "same-day", date: today },
    { label: "24h", date: addDays(today, 1) },
    { label: "48h", date: addDays(today, 2) },
    { label: "72h", date: addDays(today, 3) },
  ];
  const recordCommand = "pnpm lead:actions -- --add --type email_send --channel gmail --campaign 'loka_creem_human_support_followup' --status done --target 'Creem support / Loka Pro store' --evidence '<gmail-sent-message-id-or-thread-id>' --note 'Requested human support for exact Loka Pro unregistered checkout origin/referrer after Creemie auto reply; review same-day/24h/48h/72h.'";
  return {
    generated_at: new Date().toISOString(),
    status,
    plugin: "Loka - Localization Hub",
    thread_id: THREAD_ID,
    reply_message_id: LATEST_AUTO_REPLY_ID,
    gmail_query: GMAIL_QUERY,
    confirmation: CONFIRMATION,
    external_action: {
      action: "Reply to the Creem compliance thread requesting human support and the exact origin/referrer.",
      target: "Creem support / Loka Pro compliance thread",
      risk: "A repeated support message can create noise; keep it one short reply and stop if a human reply already exists.",
      expected_benefit: "Move Loka from compliance uncertainty to provider evidence, so the correct origin can be registered or removed before off-boarding risk escalates.",
      verification: "Gmail sent id after explicit confirmation, then human Creem reply naming the origin/referrer or dashboard/support evidence that the warning is closed.",
      confirmation: CONFIRMATION,
    },
    preconditions: [
      "Run the read-only Gmail query immediately before sending.",
      "Stop if Creem has already provided an origin/referrer, closure evidence, or a newer human reply.",
      "Reply in the existing thread; do not start a new email thread.",
      "Send only this one concise human-support request.",
      "Do not change Creem settings or scale Loka promotion until provider evidence is received.",
      `Use exact confirmation phrase: ${CONFIRMATION}`,
    ],
    draft: {
      to: "support@creem.io",
      subject: "Re: CREEM Compliance Review - Unregistered Traffic Detected",
      body: draftBody(),
      reply_message_id: LATEST_AUTO_REPLY_ID,
      thread_id: THREAD_ID,
    },
    record_command: recordCommand,
    reviews,
    evidence: {
      latest_review: latestReview ? {
        date: latestReview.date,
        status: latestReview.status,
        target: latestReview.target,
        evidence: latestReview.evidence,
        note: latestReview.note,
      } : null,
      sent_followup: sentFollowup ? {
        date: sentFollowup.date,
        status: sentFollowup.status,
        target: sentFollowup.target,
        evidence: sentFollowup.evidence,
        note: sentFollowup.note,
      } : null,
      resolved_warning: resolvedWarning ? {
        date: resolvedWarning.date,
        status: resolvedWarning.status,
        target: resolvedWarning.target,
        evidence: resolvedWarning.evidence,
        note: resolvedWarning.note,
      } : null,
      experiment_status: experiment?.status || "",
      experiment_confirmation: experiment?.confirmation || "",
    },
    recommendation: status === "ready_confirmation_required"
      ? `Ready to request Creem human support after exact confirmation: ${CONFIRMATION}.`
      : status === "waiting_provider"
        ? "Wait for Creem provider evidence before changing payment settings or scaling Loka promotion."
        : "Creem compliance appears resolved in action log evidence; rerun portfolio ops and close downstream blockers.",
    guardrails: [
      "This brief is local-only and does not create a Gmail draft or send email.",
      "Gmail send/draft/archive/delete/label actions still require explicit confirmation.",
      "Do not modify Creem stores, products, or checkout links from this brief alone.",
    ],
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Loka Creem Human Support Brief",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## External Action",
    "",
    `- Plugin: ${report.plugin}`,
    `- Action: ${report.external_action.action}`,
    `- Target: ${report.external_action.target}`,
    `- Risk: ${report.external_action.risk}`,
    `- Expected benefit: ${report.external_action.expected_benefit}`,
    `- Verification: ${report.external_action.verification}`,
    `- Confirmation: ${report.confirmation}`,
    "",
    "## Preconditions",
    "",
  ];
  for (const item of report.preconditions) lines.push(`- ${item}`);
  lines.push(
    "",
    "## Draft",
    "",
    `To: ${report.draft.to}`,
    `Subject: ${report.draft.subject}`,
    `Reply message id: ${report.draft.reply_message_id}`,
    `Thread id: ${report.draft.thread_id}`,
    "",
    "```text",
    report.draft.body,
    "```",
    "",
    "## Gmail Read-Only Query",
    "",
    "```text",
    report.gmail_query,
    "```",
    "",
    "## Record Command After Send",
    "",
    "```bash",
    report.record_command,
    "```",
    "",
    "## Evidence",
    "",
    `- Latest review: ${report.evidence.latest_review ? clean(`${report.evidence.latest_review.date} ${report.evidence.latest_review.status} ${report.evidence.latest_review.evidence}`) : "none"}`,
    `- Sent follow-up: ${report.evidence.sent_followup ? clean(`${report.evidence.sent_followup.date} ${report.evidence.sent_followup.evidence}`) : "none"}`,
    `- Resolved warning: ${report.evidence.resolved_warning ? clean(`${report.evidence.resolved_warning.date} ${report.evidence.resolved_warning.evidence}`) : "none"}`,
    "",
    "## Guardrails",
    "",
  );
  for (const item of report.guardrails) lines.push(`- ${item}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const [actionRows, experiments] = await Promise.all([
    readRows(args.actions),
    readJson(args.experiments, null),
  ]);
  const report = build({ actionRows, experiments });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Creem human support brief: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
