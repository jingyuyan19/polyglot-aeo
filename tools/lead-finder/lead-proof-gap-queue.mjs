#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_GOAL = ".tmp/framer-growth-goal-coverage.json";
const DEFAULT_CONFIRMATIONS = ".tmp/framer-confirmation-queue.json";
const DEFAULT_BLOCKERS = ".tmp/framer-portfolio-blocker-queue.json";
const DEFAULT_ACTION_TIME = ".tmp/framer-action-time-packet.json";
const DEFAULT_OUTPUT = ".tmp/framer-proof-gap-queue.md";
const DEFAULT_JSON = ".tmp/framer-proof-gap-queue.json";

const REQUIREMENT_MATCHERS = {
  payment_compliance_evidence: /creem|compliance|checkout|payment|cloudflare|release_gate|human_support/i,
  owned_landing_tracking: /landing_baseline|owned_site|tracking|cta/i,
  searchable_use_case_pages: /use_case_page|owned_seo/i,
  real_growth_signals: /customer_feedback|creem_human_support|reply|customer|signal/i,
};

function usage() {
  return `
Usage:
  pnpm lead:proof-gaps

Options:
  --goal <file>            Growth goal coverage JSON. Default: ${DEFAULT_GOAL}
  --confirmations <file>   Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATIONS}
  --blockers <file>        Portfolio blocker queue JSON. Default: ${DEFAULT_BLOCKERS}
  --action-time <file>     Action-time packet JSON. Default: ${DEFAULT_ACTION_TIME}
  --output <file>          Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>            JSON output. Default: ${DEFAULT_JSON}
  --help                   Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    goal: DEFAULT_GOAL,
    confirmations: DEFAULT_CONFIRMATIONS,
    blockers: DEFAULT_BLOCKERS,
    actionTime: DEFAULT_ACTION_TIME,
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
      "--goal": "goal",
      "--confirmations": "confirmations",
      "--blockers": "blockers",
      "--action-time": "actionTime",
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
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function rowText(row) {
  return [
    row.plugin,
    row.kind,
    row.channel,
    row.action,
    row.target,
    row.risk,
    row.expected_benefit,
    row.confirmation,
    row.verification,
  ].join(" ");
}

function blockerText(row) {
  return [
    row.plugin,
    row.kind,
    row.title,
    row.reason,
    row.next_action,
    row.confirmation,
  ].join(" ");
}

function partialRequirements(goal) {
  const auditRows = goal?.completion_audit?.blocking_requirements;
  if (Array.isArray(auditRows) && auditRows.length) return auditRows;
  return (Array.isArray(goal?.requirements) ? goal.requirements : [])
    .filter((row) => row.status !== "proven")
    .map((row) => ({
      id: row.id,
      status: row.status,
      requirement: row.requirement,
      evidence: row.evidence,
      next_proof: row.next_proof,
      evidence_files: row.evidence_files || [],
    }));
}

function matcherFor(requirement) {
  return REQUIREMENT_MATCHERS[requirement.id] || new RegExp(requirement.id.replace(/_/g, "|"), "i");
}

function matchingConfirmations(requirement, confirmationQueue) {
  const matcher = matcherFor(requirement);
  return (Array.isArray(confirmationQueue?.rows) ? confirmationQueue.rows : [])
    .filter((row) => row.readiness === "ready_confirmation_required")
    .filter((row) => confirmationMatchesRequirement(requirement.id, row, matcher))
    .sort((a, b) =>
      (a.confirmation === confirmationQueue?.next_confirmation ? -1 : 0) -
        (b.confirmation === confirmationQueue?.next_confirmation ? -1 : 0) ||
      Number(a.priority || 99) - Number(b.priority || 99) ||
      String(a.plugin || "").localeCompare(String(b.plugin || "")),
    );
}

function confirmationMatchesRequirement(id, row, matcher) {
  const kind = String(row.kind || "");
  if (id === "owned_landing_tracking") return /landing_baseline|owned_site/.test(kind);
  if (id === "searchable_use_case_pages") return /use_case_page|owned_seo/.test(kind);
  if (id === "real_growth_signals") return /customer_feedback|creem_human_support/.test(kind);
  return matcher.test(rowText(row));
}

function matchingBlockers(requirement, blockers) {
  const matcher = matcherFor(requirement);
  return (Array.isArray(blockers?.root_blockers) ? blockers.root_blockers : [])
    .filter((row) => matcher.test(blockerText(row)))
    .sort((a, b) => {
      const rank = { ready_for_confirmation: 1, needs_action: 2, waiting_provider: 3, blocked: 4 };
      return (rank[a.readiness] || 9) - (rank[b.readiness] || 9) ||
        String(a.plugin || "").localeCompare(String(b.plugin || ""));
    });
}

function proofMode({ requirement, confirmations, blockers }) {
  if (confirmations.length && /provider evidence|human|origin|referrer|reply/i.test(requirement.next_proof || "")) {
    return "ready_confirmation_then_provider";
  }
  if (confirmations.length) return "ready_confirmation_required";
  if (blockers.some((row) => row.readiness === "waiting_provider")) return "waiting_provider";
  if (blockers.some((row) => row.readiness === "needs_action")) return "needs_action";
  if (blockers.length) return "blocked";
  return "needs_evidence";
}

function proofGapRow(requirement, confirmationQueue, blockers, actionTime) {
  const confirmations = matchingConfirmations(requirement, confirmationQueue);
  const blockerRows = matchingBlockers(requirement, blockers);
  const primary = confirmations[0] || null;
  const topConfirmation = actionTime?.next?.confirmation || confirmationQueue?.next_confirmation || "";
  return {
    requirement_id: requirement.id,
    requirement_status: requirement.status,
    proof_mode: proofMode({ requirement, confirmations, blockers: blockerRows }),
    requirement: requirement.requirement,
    evidence: requirement.evidence,
    next_proof: requirement.next_proof,
    evidence_files: requirement.evidence_files || [],
    primary_confirmation: primary ? {
      plugin: primary.plugin,
      kind: primary.kind,
      target: primary.target,
      confirmation: primary.confirmation,
      is_top_action: primary.confirmation === topConfirmation,
      verification: primary.verification || "",
      record_command: primary.record_command || "",
      safety_status: confirmationQueue?.safety_audit?.items?.find((item) => item.confirmation === primary.confirmation)?.status || "",
    } : null,
    candidate_confirmations: confirmations.map((row) => ({
      plugin: row.plugin,
      kind: row.kind,
      target: row.target,
      confirmation: row.confirmation,
      is_top_action: row.confirmation === topConfirmation,
      safety_status: confirmationQueue?.safety_audit?.items?.find((item) => item.confirmation === row.confirmation)?.status || "",
    })),
    blockers: blockerRows.map((row) => ({
      plugin: row.plugin,
      readiness: row.readiness,
      title: row.title,
      confirmation: row.confirmation || "",
      next_action: row.next_action || "",
    })),
    closure_condition: requirement.next_proof || primary?.verification || "Record proof evidence and rerun portfolio ops.",
  };
}

function recommendationFor(rows, actionTime) {
  const top = rows.find((row) => row.primary_confirmation?.is_top_action);
  if (top) {
    return `Close proof gap via current action-time confirmation: ${top.requirement_id} -> ${top.primary_confirmation.confirmation}.`;
  }
  const ready = rows.find((row) => row.primary_confirmation);
  if (ready) {
    return `Next proof gap has a ready confirmation: ${ready.requirement_id} -> ${ready.primary_confirmation.confirmation}.`;
  }
  const waiting = rows.find((row) => row.proof_mode === "waiting_provider");
  if (waiting) return `Next proof gap waits on provider evidence: ${waiting.requirement_id}.`;
  return actionTime?.recommendation || "No ready proof-gap action found; keep refreshing goal coverage and blockers.";
}

function build({ goal, confirmationQueue, blockers, actionTime }) {
  const requirements = partialRequirements(goal);
  const rows = requirements.map((requirement) => proofGapRow(requirement, confirmationQueue, blockers, actionTime));
  const counts = rows.reduce((acc, row) => {
    acc[row.proof_mode] = (acc[row.proof_mode] || 0) + 1;
    return acc;
  }, {});
  return {
    generated_at: new Date().toISOString(),
    status: rows.length ? "open_proof_gaps" : "complete",
    recommendation: recommendationFor(rows, actionTime),
    counts,
    rows,
    guardrails: [
      "This queue is local-only and does not send Gmail, publish pages, submit forms, upload Marketplace files, deploy, or modify payment settings.",
      "A proof gap is not closed by preparing assets; it closes only after the named proof evidence is recorded and portfolio ops refreshes cleanly.",
      "External actions still require the exact confirmation phrase shown in the matching confirmation row.",
    ],
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Proof Gap Queue",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Counts",
    "",
    "| Proof mode | Count |",
    "|---|---:|",
  ];
  for (const [mode, count] of Object.entries(report.counts)) lines.push(`| ${clean(mode)} | ${count} |`);
  if (!Object.keys(report.counts).length) lines.push("| none | 0 |");

  lines.push(
    "",
    "## Gaps",
    "",
    "| Requirement | Mode | Primary confirmation | Top action? | Closure condition | Blockers |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.rows) {
    lines.push(`| ${clean(row.requirement_id)} | ${clean(row.proof_mode)} | ${clean(row.primary_confirmation?.confirmation || "none")} | ${row.primary_confirmation?.is_top_action ? "yes" : "no"} | ${clean(short(row.closure_condition, 140))} | ${clean(row.blockers.map((item) => `${item.plugin}: ${item.readiness}`).join("; ") || "none")} |`);
  }
  if (!report.rows.length) lines.push("| none |  |  |  |  |  |");

  for (const row of report.rows) {
    lines.push("", `## ${row.requirement_id}`, "");
    lines.push(`- Status: ${row.requirement_status}`);
    lines.push(`- Proof mode: ${row.proof_mode}`);
    lines.push(`- Next proof: ${row.next_proof || "missing"}`);
    lines.push(`- Evidence files: ${(row.evidence_files || []).join("; ") || "missing"}`);
    if (row.candidate_confirmations.length) {
      lines.push("", "Candidate confirmations:", "", "| Plugin | Kind | Target | Confirmation | Safety | Top action? |", "|---|---|---|---|---|---|");
      for (const item of row.candidate_confirmations) {
        lines.push(`| ${clean(item.plugin)} | ${clean(item.kind)} | ${clean(item.target)} | ${clean(item.confirmation)} | ${clean(item.safety_status)} | ${item.is_top_action ? "yes" : "no"} |`);
      }
    }
    if (row.blockers.length) {
      lines.push("", "Related blockers:", "", "| Readiness | Plugin | Blocker | Next action | Confirmation |", "|---|---|---|---|---|");
      for (const item of row.blockers) {
        lines.push(`| ${clean(item.readiness)} | ${clean(item.plugin)} | ${clean(item.title)} | ${clean(short(item.next_action, 120))} | ${clean(item.confirmation)} |`);
      }
    }
    if (row.primary_confirmation?.record_command) {
      lines.push("", "Record command after proof action:", "", "```bash", row.primary_confirmation.record_command, "```");
    }
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
  const [goal, confirmationQueue, blockers, actionTime] = await Promise.all([
    readJson(args.goal, null),
    readJson(args.confirmations, null),
    readJson(args.blockers, null),
    readJson(args.actionTime, null),
  ]);
  const report = build({ goal, confirmationQueue, blockers, actionTime });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Proof gap queue: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
