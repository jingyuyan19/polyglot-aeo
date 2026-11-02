#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_TODAY = ".tmp/framer-today.json";
const DEFAULT_WEEKLY = ".tmp/framer-portfolio-weekly-report.json";
const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_CONFIRMATION_QUEUE = ".tmp/framer-confirmation-queue.json";
const DEFAULT_PROOF_GAPS = ".tmp/framer-proof-gap-queue.json";
const DEFAULT_OUTPUT = ".tmp/framer-portfolio-ops-run.md";
const DEFAULT_JSON = ".tmp/framer-portfolio-ops-run.json";

const CORE_STEPS = [
  {
    id: "checkout_origin",
    title: "Checkout origin readiness",
    script: "lead-checkout-origin-readiness.mjs",
    outputs: [".tmp/framer-checkout-origin-readiness.md", ".tmp/framer-checkout-origin-readiness.json"],
  },
  {
    id: "public_health",
    title: "Public health",
    script: "lead-public-health.mjs",
    outputs: [".tmp/framer-public-health.md", ".tmp/framer-public-health.json"],
  },
  {
    id: "loka_checkout",
    title: "Loka checkout inventory",
    script: "lead-loka-checkout-inventory.mjs",
    outputs: [".tmp/loka-checkout-origin-inventory.md", ".tmp/loka-checkout-origin-inventory.json"],
  },
  {
    id: "portfolio",
    title: "Portfolio dashboard",
    script: "lead-portfolio-dashboard.mjs",
    outputs: [".tmp/framer-portfolio-growth-dashboard.md", ".tmp/framer-portfolio-growth-dashboard.json"],
  },
  {
    id: "portfolio_experiments",
    title: "Portfolio experiments",
    script: "lead-portfolio-experiments.mjs",
    outputs: [".tmp/framer-portfolio-experiments.md", ".tmp/framer-portfolio-experiments.json"],
  },
  {
    id: "asset_kits",
    title: "Plugin asset kits",
    script: "lead-plugin-asset-kits.mjs",
    outputs: [".tmp/framer-plugin-asset-kits.md", ".tmp/framer-plugin-asset-kits.json"],
  },
  {
    id: "landing_baseline",
    title: "Landing and tracking baseline",
    script: "lead-landing-baseline.mjs",
    outputs: [".tmp/framer-landing-baseline.md", ".tmp/framer-landing-baseline.json"],
  },
  {
    id: "landing_target_decision",
    title: "Landing target decision brief",
    script: "lead-landing-target-decision.mjs",
    outputs: [".tmp/framer-landing-target-decision.md", ".tmp/framer-landing-target-decision.json"],
  },
  {
    id: "asset_coverage",
    title: "Plugin asset coverage",
    script: "lead-asset-coverage.mjs",
    outputs: [".tmp/framer-asset-coverage.md", ".tmp/framer-asset-coverage.json"],
  },
  {
    id: "landing_baseline_brief",
    title: "Landing baseline confirmation brief",
    script: "lead-landing-baseline-brief.mjs",
    outputs: [".tmp/framer-landing-baseline-brief.md", ".tmp/framer-landing-baseline-brief.json"],
  },
  {
    id: "owned_sites",
    title: "Owned site audit",
    script: "lead-owned-site-audit.mjs",
    outputs: [".tmp/framer-owned-site-audit.md", ".tmp/framer-owned-site-audit.json"],
  },
  {
    id: "creem_links",
    title: "Creem link inventory",
    script: "lead-creem-link-inventory.mjs",
    outputs: [".tmp/framer-creem-link-inventory.md", ".tmp/framer-creem-link-inventory.json"],
  },
  {
    id: "creem_store_verification",
    title: "Creem store/domain verification brief",
    script: "lead-creem-store-verification-brief.mjs",
    outputs: [".tmp/framer-creem-store-verification-brief.md", ".tmp/framer-creem-store-verification-brief.json"],
  },
  {
    id: "creem_human_support",
    title: "Creem human-support brief",
    script: "lead-creem-human-support-brief.mjs",
    outputs: [".tmp/framer-creem-human-support-brief.md", ".tmp/framer-creem-human-support-brief.json"],
  },
  {
    id: "owned_site_cta",
    title: "Owned site CTA kit",
    script: "lead-owned-site-cta-kit.mjs",
    outputs: [".tmp/framer-owned-site-cta-kit.md", ".tmp/framer-owned-site-cta-kit.json"],
  },
  {
    id: "customer_feedback",
    title: "Customer feedback queue",
    script: "lead-customer-feedback-queue.mjs",
    outputs: [".tmp/framer-customer-feedback-queue.md", ".tmp/framer-customer-feedback-queue.json"],
  },
  {
    id: "customer_feedback_brief",
    title: "Customer feedback confirmation brief",
    script: "lead-customer-feedback-brief.mjs",
    outputs: [".tmp/framer-customer-feedback-brief.md", ".tmp/framer-customer-feedback-brief.json"],
  },
  {
    id: "customer_feedback_review",
    title: "Customer feedback review",
    script: "lead-customer-feedback-review.mjs",
    outputs: [".tmp/framer-customer-feedback-review.md", ".tmp/framer-customer-feedback-review.json"],
  },
  {
    id: "action_review",
    title: "Public action review",
    script: "lead-action-review.mjs",
    outputs: [".tmp/framer-action-review.md", ".tmp/framer-action-review.json"],
  },
  {
    id: "growth_gate",
    title: "Growth gate",
    script: "lead-growth-gate.mjs",
    outputs: [".tmp/framer-growth-gate.md", ".tmp/framer-growth-gate.json"],
  },
  {
    id: "channel_priority",
    title: "Channel priority",
    script: "lead-channel-priority.mjs",
    outputs: [".tmp/framer-channel-priority.md", ".tmp/framer-channel-priority.json"],
  },
  {
    id: "partners",
    title: "Partner log",
    script: "lead-partner-log.mjs",
    outputs: [".tmp/framer-partner-log.md", ".tmp/framer-partner-log.json"],
  },
  {
    id: "today",
    title: "Today plan",
    script: "lead-today.mjs",
    outputs: [".tmp/framer-today.md", ".tmp/framer-today.json"],
  },
  {
    id: "plugin_channel_fit",
    title: "Plugin channel fit",
    script: "lead-plugin-channel-fit.mjs",
    outputs: [".tmp/framer-plugin-channel-fit.md", ".tmp/framer-plugin-channel-fit.json"],
  },
  {
    id: "cross_promotion",
    title: "Cross-promotion matrix",
    script: "lead-cross-promotion-matrix.mjs",
    outputs: [".tmp/framer-cross-promotion-matrix.md", ".tmp/framer-cross-promotion-matrix.json"],
  },
  {
    id: "owned_site_implementation",
    title: "Owned site implementation brief",
    script: "lead-owned-site-implementation-brief.mjs",
    outputs: [".tmp/framer-owned-site-implementation-brief.md", ".tmp/framer-owned-site-implementation-brief.json"],
  },
  {
    id: "owned_site_drop_patch",
    title: "Owned site drop patch pack",
    script: "lead-owned-site-drop-patch.mjs",
    outputs: [".tmp/framer-owned-site-drop-patches.md", ".tmp/framer-owned-site-drop-patches.json"],
  },
  {
    id: "use_case_pages",
    title: "Use-case page brief",
    script: "lead-use-case-page-brief.mjs",
    outputs: [".tmp/framer-use-case-page-brief.md", ".tmp/framer-use-case-page-brief.json"],
  },
  {
    id: "use_case_page_package",
    title: "Use-case page local package",
    script: "lead-use-case-page-package.mjs",
    outputs: [".tmp/framer-use-case-page-packages.md", ".tmp/framer-use-case-page-packages.json"],
  },
  {
    id: "confirmation_queue",
    title: "Confirmation queue",
    script: "lead-confirmation-queue.mjs",
    outputs: [".tmp/framer-confirmation-queue.md", ".tmp/framer-confirmation-queue.json"],
  },
  {
    id: "publish_preflight",
    title: "Publish preflight",
    script: "lead-publish-preflight.mjs",
    outputs: [".tmp/framer-publish-preflight.md", ".tmp/framer-publish-preflight.json"],
  },
  {
    id: "blocker_queue",
    title: "Portfolio blocker queue",
    script: "lead-portfolio-blocker-queue.mjs",
    outputs: [".tmp/framer-portfolio-blocker-queue.md", ".tmp/framer-portfolio-blocker-queue.json"],
  },
  {
    id: "experiment_decisions",
    title: "Experiment decision brief",
    script: "lead-experiment-decision-brief.mjs",
    outputs: [".tmp/framer-experiment-decision-brief.md", ".tmp/framer-experiment-decision-brief.json"],
  },
  {
    id: "weekly",
    title: "Portfolio weekly report",
    script: "lead-portfolio-weekly-report.mjs",
    outputs: [".tmp/framer-portfolio-weekly-report.md", ".tmp/framer-portfolio-weekly-report.json"],
  },
  {
    id: "goal_coverage",
    title: "Growth goal coverage",
    script: "lead-growth-goal-coverage.mjs",
    outputs: [".tmp/framer-growth-goal-coverage.md", ".tmp/framer-growth-goal-coverage.json"],
  },
  {
    id: "proof_gaps",
    title: "Proof gap queue",
    script: "lead-proof-gap-queue.mjs",
    outputs: [".tmp/framer-proof-gap-queue.md", ".tmp/framer-proof-gap-queue.json"],
  },
  {
    id: "executive",
    title: "Growth executive brief",
    script: "lead-executive-brief.mjs",
    outputs: [".tmp/framer-growth-executive-brief.md", ".tmp/framer-growth-executive-brief.json"],
  },
  {
    id: "action_time_packet",
    title: "Action-time confirmation packet",
    script: "lead-action-time-packet.mjs",
    outputs: [".tmp/framer-action-time-packet.md", ".tmp/framer-action-time-packet.json"],
  },
  {
    id: "daily_action_consistency",
    title: "Daily action consistency",
    script: "lead-daily-action-consistency.mjs",
    outputs: [".tmp/framer-daily-action-consistency.md", ".tmp/framer-daily-action-consistency.json"],
  },
  {
    id: "plugin_growth_files",
    title: "Per-plugin growth files",
    script: "lead-plugin-growth-files.mjs",
    outputs: [".tmp/framer-plugin-growth-files.md", ".tmp/framer-plugin-growth-files.json"],
  },
  {
    id: "ops",
    title: "Growth ops dashboard",
    script: "lead-ops-dashboard.mjs",
    outputs: [".tmp/framer-growth-ops.md"],
  },
];

const SIGNAL_STEPS = [
  {
    id: "forms",
    title: "Netlify form intake",
    script: "lead-form-intake.mjs",
    outputs: [".tmp/framer-form-intake.md", ".tmp/framer-form-intake.json"],
  },
  {
    id: "events",
    title: "CTA event intake",
    script: "lead-event-intake.mjs",
    outputs: [".tmp/framer-cta-events.md", ".tmp/framer-cta-events.json"],
  },
  {
    id: "marketplace_public",
    title: "Marketplace public snapshot",
    script: "lead-marketplace-public-snapshot.mjs",
    args: ["--record"],
    outputs: [".tmp/framer-marketplace-public.md", ".tmp/framer-marketplace-public.json"],
  },
  {
    id: "creem_store",
    title: "Creem store monitor",
    script: "lead-creem-store-monitor.mjs",
    outputs: [".tmp/framer-creem-store-monitor.md", ".tmp/framer-creem-store-monitor.json"],
  },
  {
    id: "signal_sweep",
    title: "Signal sweep",
    script: "lead-signal-sweep.mjs",
    outputs: [".tmp/framer-signal-sweep.md", ".tmp/framer-signal-sweep.json"],
  },
];

function usage() {
  return `
Usage:
  pnpm lead:portfolio-ops

Options:
  --skip-signals       Skip Netlify/Marketplace/Creem read refreshes.
  --fail-fast          Stop after the first failed step.
  --actions <file>     Action log CSV for Gmail freshness note. Default: ${DEFAULT_ACTIONS}
  --today-json <file>  Today plan JSON. Default: ${DEFAULT_TODAY}
  --weekly-json <file> Weekly report JSON. Default: ${DEFAULT_WEEKLY}
  --public-health-json <file> Public health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --confirmation-queue-json <file> Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATION_QUEUE}
  --proof-gaps-json <file> Proof gap queue JSON. Default: ${DEFAULT_PROOF_GAPS}
  --output <file>      Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>        JSON output. Default: ${DEFAULT_JSON}
  --help               Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    skipSignals: false,
    failFast: false,
    actions: DEFAULT_ACTIONS,
    todayJson: DEFAULT_TODAY,
    weeklyJson: DEFAULT_WEEKLY,
    publicHealthJson: DEFAULT_PUBLIC_HEALTH,
    confirmationQueueJson: DEFAULT_CONFIRMATION_QUEUE,
    proofGapsJson: DEFAULT_PROOF_GAPS,
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
    if (key === "--skip-signals") {
      args.skipSignals = true;
      continue;
    }
    if (key === "--fail-fast") {
      args.failFast = true;
      continue;
    }
    const map = {
      "--actions": "actions",
      "--today-json": "todayJson",
      "--weekly-json": "weeklyJson",
      "--public-health-json": "publicHealthJson",
      "--confirmation-queue-json": "confirmationQueueJson",
      "--proof-gaps-json": "proofGapsJson",
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

function scriptPath(script) {
  return path.join(dirname, script);
}

async function runStep(step) {
  const started = Date.now();
  const args = [scriptPath(step.script), ...(step.args || [])];
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      maxBuffer: 20 * 1024 * 1024,
    });
    return {
      ...step,
      command: `node ${path.relative(process.cwd(), args[0])}${args.slice(1).length ? ` ${args.slice(1).join(" ")}` : ""}`,
      status: "ok",
      exit_code: 0,
      duration_ms: Date.now() - started,
      stdout_tail: tail(stdout),
      stderr_tail: tail(stderr),
    };
  } catch (error) {
    return {
      ...step,
      command: `node ${path.relative(process.cwd(), args[0])}${args.slice(1).length ? ` ${args.slice(1).join(" ")}` : ""}`,
      status: "failed",
      exit_code: error?.code ?? 1,
      duration_ms: Date.now() - started,
      stdout_tail: tail(error?.stdout || ""),
      stderr_tail: tail(error?.stderr || error?.message || String(error)),
    };
  }
}

function tail(value, lines = 8) {
  return String(value || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-lines)
    .join("\n");
}

function latestGmailMonitor(rows) {
  return [...rows]
    .filter((row) => row.type === "email_monitor" && row.channel === "gmail")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.__index || 0) - (a.__index || 0))[0] || null;
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

function buildRecommendation({ confirmationQueue, todayPlan, weekly, publicHealth, gmailMonitor }) {
  const recommendations = [];
  if (todayPlan?.recommendation) recommendations.push(todayPlan.recommendation);
  if (confirmationQueue?.recommendation && !recommendations.includes(confirmationQueue.recommendation)) {
    recommendations.push(confirmationQueue.recommendation);
  }
  if (weekly?.recommendation && !recommendations.includes(weekly.recommendation)) {
    recommendations.push(weekly.recommendation);
  }
  const blocked = Array.isArray(publicHealth?.profiles)
    ? publicHealth.profiles.filter((profile) => profile.status === "blocked")
    : [];
  if (blocked.length) {
    recommendations.push(
      `Public health blocks ${blocked.map((profile) => profile.name).join(", ")}; do not scale promotion until those gates clear.`,
    );
  }
  if (!gmailMonitor || gmailMonitor.date !== todayLocal()) {
    recommendations.push("Run a same-day read-only Gmail sweep before any customer, partner, or follow-up decision.");
  }
  return recommendations[0] || "Portfolio ops refreshed. Keep the smallest measurable experiment running.";
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Portfolio Ops Run",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Recommendation: ${report.recommendation}`,
    "",
    "## Step Results",
    "",
    "| Step | Status | Duration | Outputs |",
    "|---|---|---:|---|",
  ];
  for (const step of report.steps) {
    lines.push(`| ${pipe(step.title)} | ${step.status} | ${step.duration_ms}ms | ${pipe((step.outputs || []).join("<br>"))} |`);
  }

  const failed = report.steps.filter((step) => step.status !== "ok");
  if (failed.length) {
    lines.push("", "## Failed Steps", "");
    for (const step of failed) {
      lines.push(`### ${step.title}`, "");
      lines.push(`Command: \`${step.command}\``);
      lines.push("");
      lines.push("```text");
      lines.push(step.stderr_tail || step.stdout_tail || "No output captured.");
      lines.push("```", "");
    }
  }

  lines.push(
    "",
    "## Current Readout",
    "",
    `- Confirmation queue recommendation: ${report.confirmation_queue_recommendation || "missing"}`,
    `- Proof gap recommendation: ${report.proof_gap_recommendation || "missing"}`,
    `- Next confirmation: ${report.next_confirmation || "missing"}`,
    `- Today recommendation: ${report.today_recommendation || "missing"}`,
    `- Weekly recommendation: ${report.weekly_recommendation || "missing"}`,
    `- Gmail freshness: ${report.gmail_monitor ? `${report.gmail_monitor.date} ${report.gmail_monitor.campaign}` : "missing"}`,
    `- Public health: ${report.public_health_summary}`,
    "",
    "## Next Commands",
    "",
    "```bash",
    "pnpm lead:portfolio-ops",
    "sed -n '1,180p' .tmp/framer-growth-executive-brief.md",
    "sed -n '1,180p' .tmp/framer-portfolio-ops-run.md",
    "sed -n '1,180p' .tmp/framer-today.md",
    "sed -n '1,180p' .tmp/framer-portfolio-weekly-report.md",
    "```",
    "",
    "## Safety",
    "",
    "- This runner only performs local writes and read-only public/API refreshes.",
    "- It does not send Gmail, publish Community posts, submit directories, upload Marketplace files, deploy, or modify Creem/payment settings.",
    "- External actions still require the exact confirmation phrase shown in the weekly/today reports.",
    "",
  );
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

  const steps = args.skipSignals ? CORE_STEPS : [...SIGNAL_STEPS, ...CORE_STEPS];
  const results = [];
  for (const step of steps) {
    process.stdout.write(`Running ${step.title}...\n`);
    const result = await runStep(step);
    results.push(result);
    process.stdout.write(`${result.status === "ok" ? "OK" : "FAILED"} ${step.title} (${result.duration_ms}ms)\n`);
    if (args.failFast && result.status !== "ok") break;
  }

  const [actionRows, todayPlan, weekly, publicHealth, confirmationQueue, proofGaps] = await Promise.all([
    readRows(args.actions),
    readJson(args.todayJson, null),
    readJson(args.weeklyJson, null),
    readJson(args.publicHealthJson, null),
    readJson(args.confirmationQueueJson, null),
    readJson(args.proofGapsJson, null),
  ]);
  const gmailMonitor = latestGmailMonitor(actionRows);
  const publicHealthProfiles = Array.isArray(publicHealth?.profiles) ? publicHealth.profiles : [];
  const report = {
    generated_at: new Date().toISOString(),
    status: results.every((step) => step.status === "ok") ? "ready" : "partial",
    recommendation: buildRecommendation({ confirmationQueue, todayPlan, weekly, publicHealth, gmailMonitor }),
    confirmation_queue_recommendation: confirmationQueue?.recommendation || "",
    proof_gap_recommendation: proofGaps?.recommendation || "",
    proof_gap_counts: proofGaps?.counts || {},
    next_confirmation: todayPlan?.next_confirmation || confirmationQueue?.next_confirmation || "",
    today_recommendation: todayPlan?.recommendation || "",
    weekly_recommendation: weekly?.recommendation || "",
    public_health_summary: publicHealthProfiles.length
      ? `${publicHealthProfiles.filter((profile) => profile.status === "blocked").length} blocked, ${publicHealthProfiles.filter((profile) => profile.status === "needs_tracking_or_landing_baseline").length} need landing/tracking baseline`
      : "missing",
    gmail_monitor: gmailMonitor,
    steps: results,
  };

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Portfolio ops run: ${args.output}\n`);
  process.stdout.write(`Status: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
