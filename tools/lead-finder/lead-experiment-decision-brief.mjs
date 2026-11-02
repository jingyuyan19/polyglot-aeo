#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_CONFIRMATION_QUEUE = ".tmp/framer-confirmation-queue.json";
const DEFAULT_ACTION_REVIEW = ".tmp/framer-action-review.json";
const DEFAULT_PLUGIN_CHANNEL_FIT = ".tmp/framer-plugin-channel-fit.json";
const DEFAULT_OUTPUT = ".tmp/framer-experiment-decision-brief.md";
const DEFAULT_JSON = ".tmp/framer-experiment-decision-brief.json";

function usage() {
  return `
Usage:
  pnpm lead:experiment-decisions

Options:
  --experiments <file>          Portfolio experiments JSON. Default: ${DEFAULT_EXPERIMENTS}
  --confirmation-queue <file>   Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATION_QUEUE}
  --action-review <file>        Public action review JSON. Default: ${DEFAULT_ACTION_REVIEW}
  --plugin-channel-fit <file>   Plugin/channel fit JSON. Default: ${DEFAULT_PLUGIN_CHANNEL_FIT}
  --output <file>               Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                 JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>          Decision date. Default: local date.
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    experiments: DEFAULT_EXPERIMENTS,
    confirmationQueue: DEFAULT_CONFIRMATION_QUEUE,
    actionReview: DEFAULT_ACTION_REVIEW,
    pluginChannelFit: DEFAULT_PLUGIN_CHANNEL_FIT,
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
      "--experiments": "experiments",
      "--confirmation-queue": "confirmationQueue",
      "--action-review": "actionReview",
      "--plugin-channel-fit": "pluginChannelFit",
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

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compareDate(left, right) {
  if (!left || !right) return 0;
  return String(left).localeCompare(String(right));
}

function matchConfirmation(row, queue) {
  const items = Array.isArray(queue?.rows) ? queue.rows : [];
  if (!items.length) return null;
  const byConfirmation = items.find((item) => row.confirmation && item.confirmation === row.confirmation);
  if (byConfirmation) return byConfirmation;

  const plugin = slug(row.plugin);
  const channel = slug(row.channel);
  return items.find((item) => {
    const samePlugin = slug(item.plugin) === plugin;
    const itemKind = slug(`${item.kind || ""} ${item.channel || ""}`);
    const itemText = slug(`${item.target || ""} ${item.action || ""} ${item.confirmation || ""}`);
    return samePlugin && (itemKind.includes(channel) || itemText.includes(channel) || channel.includes(itemKind));
  }) || null;
}

function topChannelFor(row, fit) {
  const plugins = Array.isArray(fit?.plugins) ? fit.plugins : [];
  const plugin = plugins.find((item) => item.plugin === row.plugin);
  if (!plugin) return null;
  const channels = Array.isArray(plugin.channels) ? plugin.channels : [];
  return channels.find((item) => item.channel === row.channel) || plugin.top_channel || null;
}

function actionReviewSignal(row, actionReview) {
  const rows = Array.isArray(actionReview?.rows) ? actionReview.rows : [];
  const terms = [row.id, row.plugin, row.channel].map((item) => String(item || "").toLowerCase()).filter(Boolean);
  return rows.find((item) => {
    const text = `${item.campaign || ""} ${item.target || ""} ${item.channel || ""} ${item.evidence || ""} ${item.note || ""}`.toLowerCase();
    return terms.some((term) => term && text.includes(term));
  }) || null;
}

function classify(row, confirmation, review, today) {
  if (row.next_review?.date && compareDate(row.next_review.date, today) <= 0 && row.action_evidence_count > 0 && !row.review_recorded) {
    return {
      decision: "review_due",
      rank: 5,
      reason: `Review window ${row.next_review.label || ""} is due on ${row.next_review.date}. Record evidence before starting a new external action.`,
    };
  }

  const readiness = confirmation?.readiness || "";
  if (readiness === "ready_confirmation_required") {
    return {
      decision: "ready_confirmation_required",
      rank: 10,
      reason: "The action pack is ready, but execution needs the exact confirmation phrase at action time.",
    };
  }
  if (readiness === "needs_decision") {
    return {
      decision: "needs_decision",
      rank: 20,
      reason: "Choose the concrete target, URL, or scope before preparing an external action.",
    };
  }
  if (readiness === "waiting_provider") {
    return {
      decision: "waiting_provider",
      rank: 30,
      reason: "A provider or platform reply is required before the next safe move.",
    };
  }
  if (readiness === "blocked") {
    return {
      decision: "blocked",
      rank: 40,
      reason: "A release, checkout, payment, or compliance gate blocks promotion.",
    };
  }

  const status = String(row.status || "");
  if (/blocked/i.test(status)) {
    return {
      decision: "blocked",
      rank: 40,
      reason: "Experiment status is blocked; do not create more traffic until the gate is cleared.",
    };
  }
  if (/waiting/i.test(status)) {
    return {
      decision: "waiting_provider",
      rank: 30,
      reason: "Experiment status is waiting; preserve evidence and avoid extra traffic.",
    };
  }
  if (review && /signal|positive|reply|revenue|published|listed/i.test(`${review.status || ""} ${review.outcome || ""} ${review.evidence || ""}`)) {
    return {
      decision: "scale_candidate",
      rank: 50,
      reason: "A recorded review appears to contain signal; consider a measured follow-up after recording the evidence.",
    };
  }
  if (row.next_review?.date && compareDate(row.next_review.date, today) < 0 && !row.action_evidence_count) {
    return {
      decision: "stop_or_rework",
      rank: 55,
      reason: "The review window has passed without action evidence; rework the experiment before spending external effort.",
    };
  }
  return {
    decision: "planned",
    rank: 60,
    reason: "Keep preparing locally until tracking, URL, and confirmation packet are concrete.",
  };
}

function classifyQueueItem(item) {
  const readiness = item.readiness || "";
  if (readiness === "ready_confirmation_required") {
    return {
      decision: "ready_confirmation_required",
      rank: 10,
      reason: "The confirmation queue says this external action is ready, but action-time confirmation is still required.",
    };
  }
  if (readiness === "needs_decision") {
    return {
      decision: "needs_decision",
      rank: 20,
      reason: "This queue item needs a concrete URL, target, owner, or scope before any external action.",
    };
  }
  if (readiness === "waiting_provider") {
    return {
      decision: "waiting_provider",
      rank: 30,
      reason: "A provider or platform response is required before a safe next action.",
    };
  }
  if (readiness === "blocked") {
    return {
      decision: "blocked",
      rank: 40,
      reason: "A blocker prevents this action from creating safe traffic or reliable evidence.",
    };
  }
  return {
    decision: readiness || "planned",
    rank: 60,
    reason: "Keep this queue item local until its action packet is concrete.",
  };
}

function rulesFor(row, decision) {
  const base = {
    continue_rule: "Continue only when the next action has a clear target, tracking/evidence path, and review window.",
    stop_rule: "Stop or rework if the review window passes with no reply, install/open lift, traffic evidence, or qualitative learning.",
    scale_rule: "Scale only after a concrete signal is logged and the next larger action has its own confirmation packet.",
  };

  if (row.id === "loka_compliance_origin_recovery") {
    return {
      continue_rule: "Continue only after Creem names the exact origin/referrer or the Loka store/source is visibly approved.",
      stop_rule: "Stop all new traffic creation for Loka checkout while the unregistered-origin warning is unresolved.",
      scale_rule: "Scale Loka promotion only after the compliance warning is closed and checkout traffic routes through an approved source.",
    };
  }
  if (row.id === "ally_paid_customer_feedback") {
    return {
      continue_rule: "Continue if Michelle replies with a purchase trigger, pain point, support issue, feature request, or testimonial.",
      stop_rule: "If there is no reply after the 7d review, do not repeat the email; convert the existing sale evidence into listing/landing copy tests.",
      scale_rule: "Scale by updating Marketplace/FAQ/screenshots around the reply language, then run one tracked listing or landing experiment.",
    };
  }
  if (row.id === "polyglot_checkout_unblock") {
    return {
      continue_rule: "Continue only when Cloudflare health, checkout-origin readiness, payment recovery, and Marketplace preflight are clean.",
      stop_rule: "Stop launch traffic while checkout/license domains or legacy checkout hosts remain unresolved.",
      scale_rule: "Scale Polyglot only after the release gate is clean and Creator Space post-upload metrics are recorded.",
    };
  }
  if (row.id === "gaode_china_location_tutorial") {
    return {
      continue_rule: "Continue once the tutorial URL and tracking plan are concrete and the page can be reviewed locally.",
      stop_rule: "If 7d/14d review shows no visits, Marketplace lift, support replies, or installs, rework the tutorial hook before publishing more.",
      scale_rule: "Scale by submitting the tutorial to directories or partner resources only after tracked tutorial or Marketplace signal appears.",
    };
  }
  if (decision === "blocked") {
    return {
      ...base,
      continue_rule: "Continue only by resolving the blocker locally or through a confirmed provider action.",
    };
  }
  if (decision === "needs_decision") {
    return {
      continue_rule: "Continue by choosing the concrete URL, target, owner, and tracking path, then rerun portfolio ops.",
      stop_rule: "Do not publish, submit, send, or drive traffic while the target is still a placeholder.",
      scale_rule: "Scale only after the baseline target is live or reviewable and has a recordable evidence path.",
    };
  }
  return base;
}

function reviewCommand(row) {
  if (row.source === "confirmation_queue") {
    return "# No experiment review command; make the decision locally, then rerun pnpm lead:portfolio-ops.";
  }
  return `pnpm lead:portfolio-experiments -- --record-review ${row.id} --evidence '<review-evidence>' --notes '<decision-notes>'`;
}

function canonicalConfirmation(queue) {
  return queue?.next_confirmation || queue?.next?.confirmation || "";
}

function build({ args, experiments, confirmationQueue, actionReview, pluginChannelFit }) {
  const sourceRows = Array.isArray(experiments?.experiments) ? experiments.experiments : [];
  const matchedConfirmations = new Set();
  const canonical = canonicalConfirmation(confirmationQueue);
  const experimentRows = sourceRows.map((row) => {
    const confirmation = matchConfirmation(row, confirmationQueue);
    if (confirmation?.key) matchedConfirmations.add(confirmation.key);
    if (confirmation?.confirmation) matchedConfirmations.add(`confirmation:${confirmation.confirmation}`);
    const channelFit = topChannelFor(row, pluginChannelFit);
    const review = actionReviewSignal(row, actionReview);
    const classification = classify(row, confirmation, review, args.today);
    return {
      source: "portfolio_experiment",
      id: row.id,
      plugin: row.plugin,
      channel: row.channel,
      status: row.status,
      decision: classification.decision,
      decision_rank: classification.rank,
      reason: classification.reason,
      hypothesis: row.hypothesis,
      primary_metric: row.primary_metric,
      evidence_required: row.evidence_required,
      next_local_step: row.next_local_step,
      next_review: row.next_review || null,
      review_recorded: Boolean(row.review_recorded),
      action_evidence_count: Number(row.action_evidence_count || 0),
      confirmation: row.confirmation || confirmation?.confirmation || "",
      is_canonical_confirmation: Boolean(canonical && (row.confirmation === canonical || confirmation?.confirmation === canonical)),
      target: confirmation?.target || row.action_pack?.target || row.external_action || "",
      record_command: confirmation?.record_command || "",
      gmail_query: confirmation?.gmail_query || "",
      verification: confirmation?.verification || row.action_pack?.verification || row.evidence_required || "",
      review_command: reviewCommand(row),
      channel_decision: channelFit?.decision || "",
      channel_score: channelFit?.score ?? "",
      channel_next_step: channelFit?.next_step || "",
      ...rulesFor(row, classification.decision),
    };
  });

  const queueRows = (Array.isArray(confirmationQueue?.rows) ? confirmationQueue.rows : [])
    .filter((item) => {
      if (item.key && matchedConfirmations.has(item.key)) return false;
      if (item.confirmation && matchedConfirmations.has(`confirmation:${item.confirmation}`)) return false;
      return ["needs_decision", "ready_confirmation_required", "waiting_provider", "blocked"].includes(item.readiness);
    })
    .map((item) => {
      const classification = classifyQueueItem(item);
      const pseudo = {
        source: "confirmation_queue",
        id: `queue_${slug(`${item.plugin}-${item.kind}-${item.confirmation || item.target}`)}`,
        plugin: item.plugin,
        channel: item.channel || item.kind,
        status: item.status,
      };
      return {
        ...pseudo,
        decision: classification.decision,
        decision_rank: classification.rank,
        reason: classification.reason,
        hypothesis: "",
        primary_metric: item.expected_benefit || item.verification || "",
        evidence_required: item.verification || "",
        next_local_step: item.action || item.preconditions?.[0] || "Make the missing local decision before external action.",
        next_review: item.reviews?.[0] || null,
        review_recorded: false,
        action_evidence_count: 0,
        confirmation: item.confirmation || "",
        is_canonical_confirmation: Boolean(canonical && item.confirmation === canonical),
        target: item.target || "",
        record_command: item.record_command || "",
        gmail_query: item.gmail_query || "",
        verification: item.verification || "",
        review_command: reviewCommand(pseudo),
        channel_decision: "",
        channel_score: "",
        channel_next_step: item.action || "",
        ...rulesFor(pseudo, classification.decision),
      };
    });

  const rows = [...experimentRows, ...queueRows]
    .sort((a, b) => {
      const rank = a.decision_rank - b.decision_rank;
      if (rank) return rank;
      const canonicalRank = Number(!a.is_canonical_confirmation) - Number(!b.is_canonical_confirmation);
      if (canonicalRank) return canonicalRank;
      return a.plugin.localeCompare(b.plugin) || a.channel.localeCompare(b.channel);
    });

  const counts = rows.reduce((acc, row) => {
    acc[row.decision] = (acc[row.decision] || 0) + 1;
    return acc;
  }, {});
  const next = rows[0] || null;

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    status: rows.length ? "ready" : "missing_experiments",
    recommendation: recommendationFor(rows),
    counts,
    next_decision: next,
    canonical_confirmation: canonical,
    rows,
    source_status: {
      experiments: experiments?.status || "missing",
      confirmation_queue: confirmationQueue?.status || "missing",
      action_review: actionReview?.status || "missing",
      plugin_channel_fit: pluginChannelFit?.status || "missing",
    },
  };
}

function recommendationFor(rows) {
  if (!rows.length) return "Run `pnpm lead:portfolio-experiments -- --seed`, then refresh the decision brief.";
  const reviewDue = rows.filter((row) => row.decision === "review_due");
  if (reviewDue.length) return `Review ${reviewDue.length} due experiment(s) before starting new promotion. First: ${reviewDue[0].plugin}.`;
  const ready = rows.find((row) => row.decision === "ready_confirmation_required");
  if (ready) return `Action-time confirmation needed: ${ready.confirmation}.`;
  const decision = rows.find((row) => row.decision === "needs_decision");
  if (decision) return `Make the next concrete target decision for ${decision.plugin}: ${decision.target || decision.next_local_step}.`;
  const waiting = rows.find((row) => row.decision === "waiting_provider");
  if (waiting) return `Wait for provider evidence on ${waiting.plugin}; keep work local until the blocker is named.`;
  const planned = rows.find((row) => row.decision === "planned");
  if (planned) return `Prepare the next local experiment asset for ${planned.plugin}: ${planned.next_local_step}.`;
  return "No actionable experiment decision found; refresh portfolio ops.";
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Experiment Decision Brief",
    "",
    `Generated: ${report.generated_at}`,
    `Date: ${report.today}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Decision Counts",
    "",
    "| Decision | Count |",
    "|---|---:|",
  ];

  for (const [decision, count] of Object.entries(report.counts)) {
    lines.push(`| ${clean(decision)} | ${count} |`);
  }
  if (!Object.keys(report.counts).length) lines.push("| none | 0 |");

  lines.push(
    "",
    "## Experiment Decisions",
    "",
    "| Decision | Plugin | Channel | Target | Next review | Continue / stop / scale basis | Confirmation |",
    "|---|---|---|---|---|---|---|",
  );
  for (const row of report.rows) {
    const review = row.next_review ? `${row.next_review.label}: ${row.next_review.date}` : "";
    const basis = `${row.continue_rule} Stop: ${row.stop_rule} Scale: ${row.scale_rule}`;
    lines.push(`| ${clean(row.decision)} | ${clean(row.plugin)} | ${clean(row.channel)} | ${clean(row.target)} | ${clean(review)} | ${clean(basis)} | ${clean(row.confirmation)} |`);
  }
  if (!report.rows.length) lines.push("| none |  |  |  |  |  |  |");

  for (const row of report.rows) {
    lines.push(
      "",
      `## ${row.plugin} / ${row.id}`,
      "",
      `- Decision: ${row.decision}`,
      `- Reason: ${row.reason}`,
      `- Status: ${row.status}`,
      `- Primary metric: ${row.primary_metric}`,
      `- Evidence required: ${row.evidence_required}`,
      `- Next local step: ${row.next_local_step}`,
      `- Channel fit: ${row.channel_decision || "missing"}${row.channel_score !== "" ? ` (${row.channel_score})` : ""}`,
      `- Channel next step: ${row.channel_next_step || "missing"}`,
      `- Confirmation phrase: ${row.confirmation || "required at action time"}`,
      `- Verification: ${row.verification || "record evidence in action log and rerun portfolio ops"}`,
      `- Continue rule: ${row.continue_rule}`,
      `- Stop/rework rule: ${row.stop_rule}`,
      `- Scale rule: ${row.scale_rule}`,
      "",
      "Commands:",
      "",
      "```bash",
      row.record_command || "# No external record command yet; keep this action local or decision-only.",
      row.gmail_query ? `# Read-only Gmail review query: ${row.gmail_query}` : "# No Gmail query needed yet.",
      row.review_command,
      "```",
    );
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This brief is local-only and does not send Gmail, publish, submit, upload, deploy, or modify payment settings.",
    "- External actions still require the exact confirmation phrase shown above.",
    "",
  );

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

  const [experiments, confirmationQueue, actionReview, pluginChannelFit] = await Promise.all([
    readJson(args.experiments, null),
    readJson(args.confirmationQueue, null),
    readJson(args.actionReview, null),
    readJson(args.pluginChannelFit, null),
  ]);

  const report = build({ args, experiments, confirmationQueue, actionReview, pluginChannelFit });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Experiment decisions: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
