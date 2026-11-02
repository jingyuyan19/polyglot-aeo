#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TODAY = ".tmp/framer-today.json";
const DEFAULT_EXECUTIVE = ".tmp/framer-growth-executive-brief.json";
const DEFAULT_WEEKLY = ".tmp/framer-portfolio-weekly-report.json";
const DEFAULT_ACTION_TIME = ".tmp/framer-action-time-packet.json";
const DEFAULT_CONFIRMATIONS = ".tmp/framer-confirmation-queue.json";
const DEFAULT_PROOF_GAPS = ".tmp/framer-proof-gap-queue.json";
const DEFAULT_EXPERIMENT_DECISION = ".tmp/framer-experiment-decision-brief.json";
const DEFAULT_OUTPUT = ".tmp/framer-daily-action-consistency.md";
const DEFAULT_JSON = ".tmp/framer-daily-action-consistency.json";

function usage() {
  return `
Usage:
  pnpm lead:daily-action-consistency

Options:
  --today <file>          Today plan JSON. Default: ${DEFAULT_TODAY}
  --executive <file>      Executive brief JSON. Default: ${DEFAULT_EXECUTIVE}
  --weekly <file>         Weekly report JSON. Default: ${DEFAULT_WEEKLY}
  --action-time <file>    Action-time packet JSON. Default: ${DEFAULT_ACTION_TIME}
  --confirmations <file>  Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATIONS}
  --proof-gaps <file>     Proof gap queue JSON. Default: ${DEFAULT_PROOF_GAPS}
  --experiment-decision <file> Experiment decision brief JSON. Default: ${DEFAULT_EXPERIMENT_DECISION}
  --output <file>         Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>           JSON output. Default: ${DEFAULT_JSON}
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    today: DEFAULT_TODAY,
    executive: DEFAULT_EXECUTIVE,
    weekly: DEFAULT_WEEKLY,
    actionTime: DEFAULT_ACTION_TIME,
    confirmations: DEFAULT_CONFIRMATIONS,
    proofGaps: DEFAULT_PROOF_GAPS,
    experimentDecision: DEFAULT_EXPERIMENT_DECISION,
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
      "--today": "today",
      "--executive": "executive",
      "--weekly": "weekly",
      "--action-time": "actionTime",
      "--confirmations": "confirmations",
      "--proof-gaps": "proofGaps",
      "--experiment-decision": "experimentDecision",
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

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function short(value, max = 180) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function inferPlugin(value) {
  const text = String(value || "");
  if (/polyglot|license\.polyglotaeo|cloudflare|worker custom domain/i.test(text)) return "Polyglot AEO";
  if (/ally/i.test(text)) return "Ally Auditor";
  if (/loka|getloka/i.test(text)) return "Loka - Localization Hub";
  if (/gaode|amap/i.test(text)) return "Gaode Maps";
  return "";
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayTop(today) {
  const row = Array.isArray(today?.needs_confirmation) ? today.needs_confirmation[0] : null;
  const text = `${row?.plugin || ""} ${row?.title || ""} ${row?.target || ""} ${row?.reason || ""} ${row?.confirmation || ""}`;
  return row
    ? {
        source: "today",
        status: "present",
        plugin: row.plugin || inferPlugin(text),
        action: row.title || "",
        confirmation: row.confirmation || today?.next_confirmation || "",
        target: row.target || "",
        reason: row.reason || "",
      }
    : {
        source: "today",
        status: "missing",
        plugin: "",
        action: "",
        confirmation: today?.next_confirmation || "",
        target: "",
        reason: today?.recommendation || "",
      };
}

function executiveTop(executive) {
  const row = executive?.top_action || null;
  const text = `${row?.plugin || ""} ${row?.title || ""} ${row?.target || ""} ${row?.reason || ""} ${row?.confirmation || ""}`;
  return row
    ? {
        source: "executive",
        status: "present",
        plugin: row.plugin || inferPlugin(text),
        action: row.title || "",
        confirmation: row.confirmation || "",
        target: row.target || "",
        reason: row.reason || "",
      }
    : {
        source: "executive",
        status: "missing",
        plugin: "",
        action: "",
        confirmation: "",
        target: "",
        reason: executive?.recommendation || "",
      };
}

function weeklyTop(weekly) {
  const row = Array.isArray(weekly?.next_actions) ? weekly.next_actions[0] : null;
  const text = `${row?.plugin || ""} ${row?.title || ""} ${row?.reason || ""} ${row?.confirmation || ""}`;
  return row
    ? {
        source: "weekly",
        status: "present",
        plugin: row.plugin || inferPlugin(text),
        action: row.title || "",
        confirmation: row.confirmation || weekly?.next_confirmation || "",
        target: "",
        reason: row.reason || weekly?.recommendation || "",
      }
    : {
        source: "weekly",
        status: "missing",
        plugin: "",
        action: "",
        confirmation: weekly?.next_confirmation || "",
        target: "",
        reason: weekly?.recommendation || "",
      };
}

function actionTimeTop(packet) {
  const row = packet?.next || null;
  const text = `${row?.plugin || ""} ${row?.action || ""} ${row?.target || ""} ${row?.confirmation || ""}`;
  return row
    ? {
        source: "action_time_packet",
        status: "present",
        plugin: row.plugin || inferPlugin(text),
        action: row.action || "",
        confirmation: row.confirmation || "",
        target: row.target || "",
        reason: row.expected_benefit || row.risk || "",
      }
    : {
        source: "action_time_packet",
        status: "missing",
        plugin: "",
        action: "",
        confirmation: "",
        target: "",
        reason: packet?.recommendation || "",
      };
}

function proofGapTop(proofGaps) {
  const rows = Array.isArray(proofGaps?.rows) ? proofGaps.rows : [];
  if (!rows.length && proofGaps?.status === "complete") {
    return {
      source: "proof_gaps",
      status: "not_applicable",
      plugin: "",
      action: "",
      confirmation: "",
      target: "",
      reason: "No open proof gaps.",
    };
  }
  const row = rows.find((item) => item?.primary_confirmation?.is_top_action) || null;
  if (!row) {
    return {
      source: "proof_gaps",
      status: "not_applicable",
      plugin: "",
      action: "",
      confirmation: "",
      target: "",
      reason: "Open proof gaps exist, but none is currently marked as the canonical top action.",
    };
  }
  const primary = row?.primary_confirmation || null;
  const text = `${primary?.plugin || ""} ${primary?.kind || ""} ${primary?.target || ""} ${primary?.confirmation || ""} ${row?.requirement_id || ""}`;
  return primary
    ? {
        source: "proof_gaps",
        status: "present",
        plugin: primary.plugin || inferPlugin(text),
        action: primary.kind || row.requirement_id || "",
        confirmation: primary.confirmation || "",
        target: primary.target || "",
        reason: row.next_proof || row.closure_condition || proofGaps?.recommendation || "",
      }
    : {
        source: "proof_gaps",
        status: "missing",
        plugin: "",
        action: "",
        confirmation: "",
        target: "",
        reason: proofGaps?.recommendation || "",
      };
}

function experimentDecisionTop(experimentDecision) {
  const row = experimentDecision?.next_decision || null;
  if (row?.decision === "review_due") {
    return {
      source: "experiment_decision",
      status: "not_applicable",
      plugin: "",
      action: "",
      confirmation: "",
      target: "",
      reason: "Experiment decision is a due local evidence review, not the canonical external action confirmation.",
    };
  }
  const text = `${row?.plugin || ""} ${row?.channel || ""} ${row?.target || ""} ${row?.confirmation || ""}`;
  return row
    ? {
        source: "experiment_decision",
        status: "present",
        plugin: row.plugin || inferPlugin(text),
        action: row.channel || row.id || "",
        confirmation: row.confirmation || experimentDecision?.canonical_confirmation || "",
        target: row.target || "",
        reason: row.reason || experimentDecision?.recommendation || "",
      }
    : {
        source: "experiment_decision",
        status: "missing",
        plugin: "",
        action: "",
        confirmation: experimentDecision?.canonical_confirmation || "",
        target: "",
        reason: experimentDecision?.recommendation || "",
      };
}

function confirmationRowFor(confirmations, confirmation) {
  return (Array.isArray(confirmations?.rows) ? confirmations.rows : []).find((row) => row.confirmation === confirmation) || null;
}

function build({ today, executive, weekly, actionTime, confirmations, proofGaps, experimentDecision }) {
  const rows = [
    todayTop(today),
    weeklyTop(weekly),
    executiveTop(executive),
    actionTimeTop(actionTime),
    proofGapTop(proofGaps),
    experimentDecisionTop(experimentDecision),
  ];
  const requiredRows = rows.filter((row) => row.status !== "not_applicable");
  const presentRows = requiredRows.filter((row) => row.status === "present");
  const confirmationsSeen = new Set(presentRows.map((row) => row.confirmation).filter(Boolean));
  const pluginsSeen = new Set(presentRows.map((row) => row.plugin).filter(Boolean));
  const canonicalConfirmation = today?.next_confirmation || presentRows[0]?.confirmation || "";
  const canonicalRow = confirmationRowFor(confirmations, canonicalConfirmation);
  const mismatches = [];
  if (presentRows.length !== requiredRows.length) {
    mismatches.push("One or more daily operator entrypoints is missing a top action.");
  }
  if (confirmationsSeen.size > 1) {
    mismatches.push(`Top confirmation phrases diverge: ${Array.from(confirmationsSeen).join(" / ")}.`);
  }
  if (pluginsSeen.size > 1) {
    mismatches.push(`Top plugins diverge: ${Array.from(pluginsSeen).join(" / ")}.`);
  }
  if (canonicalConfirmation && !canonicalRow) {
    mismatches.push("The canonical top confirmation is not present in the confirmation queue.");
  }
  if (canonicalRow && canonicalRow.readiness !== "ready_confirmation_required") {
    mismatches.push(`The canonical top confirmation is not ready; readiness=${canonicalRow.readiness || "missing"}.`);
  }
  const status = mismatches.length ? "mismatch" : "aligned";
  return {
    generated_at: new Date().toISOString(),
    status,
    recommendation: status === "aligned"
      ? `Daily operator entrypoints agree on: ${canonicalConfirmation || "no external confirmation available"}.`
      : `Fix daily top-action mismatch before executing any external action: ${mismatches[0]}`,
    canonical: {
      plugin: canonicalRow?.plugin || presentRows[0]?.plugin || "",
      action: canonicalRow?.action || presentRows[0]?.action || "",
      confirmation: canonicalConfirmation,
      readiness: canonicalRow?.readiness || "",
      verification: canonicalRow?.verification || presentRows[0]?.reason || "",
    },
    counts: {
      sources: rows.length,
      present: presentRows.length,
      not_applicable: rows.length - requiredRows.length,
      mismatches: mismatches.length,
    },
    rows,
    mismatches,
    guardrails: [
      "This check is local-only and does not execute Gmail, publishing, deploy, Marketplace, directory, or payment actions.",
      "If status is mismatch, do not execute any external action until today, weekly report, executive brief, action-time packet, proof-gap queue, and experiment decision brief agree.",
      "The canonical confirmation must be ready_confirmation_required in the confirmation queue.",
    ],
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Daily Action Consistency",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Canonical Action",
    "",
    `- Plugin: ${report.canonical.plugin || "n/a"}`,
    `- Action: ${report.canonical.action || "n/a"}`,
    `- Readiness: ${report.canonical.readiness || "n/a"}`,
    `- Confirmation: ${report.canonical.confirmation || "none"}`,
    `- Verification: ${short(report.canonical.verification || "n/a", 220)}`,
    "",
    "## Sources",
    "",
    "| Source | Status | Plugin | Action | Confirmation | Reason |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of report.rows) {
    lines.push(`| ${clean(row.source)} | ${clean(row.status)} | ${clean(row.plugin)} | ${clean(short(row.action, 120))} | ${clean(row.confirmation)} | ${clean(short(row.reason, 140))} |`);
  }
  lines.push("", "## Mismatches", "");
  if (report.mismatches.length) {
    for (const mismatch of report.mismatches) lines.push(`- ${mismatch}`);
  } else {
    lines.push("- none");
  }
  lines.push("", "## Guardrails", "");
  for (const rule of report.guardrails) lines.push(`- ${rule}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const [today, executive, weekly, actionTime, confirmations, proofGaps, experimentDecision] = await Promise.all([
    readJson(args.today, null),
    readJson(args.executive, null),
    readJson(args.weekly, null),
    readJson(args.actionTime, null),
    readJson(args.confirmations, null),
    readJson(args.proofGaps, null),
    readJson(args.experimentDecision, null),
  ]);
  const report = build({ today, executive, weekly, actionTime, confirmations, proofGaps, experimentDecision });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Daily action consistency: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  if (report.status !== "aligned") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
