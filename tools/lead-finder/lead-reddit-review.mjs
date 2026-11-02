#!/usr/bin/env node

import {
  addDays,
  pipe,
  readJson,
  readRows,
  toBoolean,
  toNumber,
  todayLocal,
  writeText,
} from "./reddit-pilot-lib.mjs";

const DEFAULT_CONFIG = "tools/lead-finder/reddit-pilot-config.json";
const DEFAULT_LEDGER = "tools/lead-finder/reddit-activity.local.csv";
const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_OUTPUT = ".tmp/framer-reddit-review.md";
const DEFAULT_JSON = ".tmp/framer-reddit-review.json";
const WINDOW_RANK = { "24h": 1, "72h": 2, "7d": 3 };
const WINDOW_HOURS = { "24h": 24, "72h": 72, "7d": 168 };

function usage() {
  return `
Usage:
  pnpm lead:reddit-review

Options:
  --config <file>        Pilot config. Default: ${DEFAULT_CONFIG}
  --ledger <file>        Reddit activity ledger. Default: ${DEFAULT_LEDGER}
  --public-health <file> Portfolio public health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --output <file>        Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>          JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>   Review date. Default: today in pilot timezone.
  --help                 Show this help.
`;
}

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG,
    ledger: DEFAULT_LEDGER,
    publicHealth: DEFAULT_PUBLIC_HEALTH,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
  };
  const valueOptions = new Map([
    ["--config", "config"],
    ["--ledger", "ledger"],
    ["--public-health", "publicHealth"],
    ["--output", "output"],
    ["--json", "json"],
    ["--today", "today"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") args.help = true;
    else if (valueOptions.has(key)) {
      if (argv[index + 1] === undefined) throw new Error(`${key} requires a value.`);
      args[valueOptions.get(key)] = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  return args;
}

function latestSnapshot(snapshots) {
  return [...snapshots].sort(
    (a, b) => (WINDOW_RANK[b.review_window] || 0) - (WINDOW_RANK[a.review_window] || 0) || String(b.timestamp).localeCompare(String(a.timestamp)),
  )[0] || null;
}

function hoursAfter(timestamp, hours) {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) return "";
  return new Date(value + hours * 3600000).toISOString();
}

function buildExperiment(post, rows, config, now) {
  const plugin = config.plugins[post.plugin] || { name: post.plugin, campaign: post.campaign };
  const snapshots = rows.filter((row) => row.event_type === "snapshot" && row.post_id === post.post_id);
  const latest = latestSnapshot(snapshots);
  const insights = rows.filter(
    (row) => row.event_type === "insight" && (row.campaign === post.campaign || row.post_id === post.post_id),
  );
  const moderation = rows.filter(
    (row) => row.event_type === "moderation" && row.subreddit === post.subreddit && String(row.timestamp).localeCompare(String(post.timestamp)) >= 0,
  );
  const unresolvedModeration = moderation
    .filter((row) => ["warning", "removed", "banned"].includes(row.status))
    .some((issue) => !moderation.some((row) => row.status === "cleared" && String(row.timestamp).localeCompare(String(issue.timestamp)) > 0));
  const missingWindows = config.pilot.review_windows.filter((window) => {
    if (snapshots.some((row) => row.review_window === window)) return false;
    const due = Date.parse(hoursAfter(post.timestamp, WINDOW_HOURS[window]));
    return Number.isFinite(due) && now.getTime() >= due;
  });
  const installs = toNumber(latest?.installs);
  const activations = toNumber(latest?.activations);
  const activationRate = installs > 0 ? activations / installs : 0;
  const signal = installs >= config.thresholds.single_experiment_min_installs || insights.length >= config.thresholds.single_experiment_min_insights;
  return {
    post,
    plugin,
    snapshots,
    latest_snapshot: latest,
    missing_due_windows: missingWindows,
    insights: insights.length,
    unresolved_moderation: unresolvedModeration,
    installs,
    activations,
    activation_rate: activationRate,
    has_7d_review: snapshots.some((row) => row.review_window === "7d"),
    signal,
  };
}

function portfolioDecision(experiments, config) {
  const thresholds = config.thresholds;
  const core = experiments.filter((item) => item.plugin.tier === "A");
  const reviewedCore = core.filter((item) => item.has_7d_review);
  const totals = experiments.reduce(
    (result, item) => {
      result.installs += item.installs;
      result.activations += item.activations;
      result.insights += item.insights;
      return result;
    },
    { installs: 0, activations: 0, insights: 0 },
  );
  totals.activation_rate = totals.installs > 0 ? totals.activations / totals.installs : 0;
  const moderationIssue = experiments.some((item) => item.unresolved_moderation);
  let decision = "foundation_in_progress";
  let nextAction = "Complete the profile and 9:1 contribution foundation before the first product post.";

  if (moderationIssue) {
    decision = "stop_community_30_days";
    nextAction = "Stop in the affected community for 30 days, do not repost, and record moderator resolution evidence before resuming.";
  } else if (
    totals.installs >= thresholds.scale_min_installs &&
    totals.activation_rate >= thresholds.scale_min_activation_rate &&
    totals.insights >= thresholds.scale_min_insights
  ) {
    decision = "scale_next_cycle";
    nextAction = "Keep the same community cadence next cycle and consider adding optional first-run source attribution; paid ads remain out of scope.";
  } else if (reviewedCore.length >= 2) {
    if (totals.installs >= thresholds.continue_min_installs && totals.activation_rate >= thresholds.continue_min_activation_rate) {
      decision = "continue_organic";
      nextAction = "Continue the organic program and allow the conditional Loka experiment only when public health is clear.";
    } else if (totals.installs < thresholds.continue_min_installs && totals.insights < thresholds.single_experiment_min_insights) {
      decision = "stop_and_rework";
      nextAction = "Pause new product posts, rewrite positioning from the collected language, and do not increase posting frequency.";
    } else {
      decision = "maintain_and_refine";
      nextAction = "Keep community participation, refine the value-first angle, and run no more than one additional permitted test.";
    }
  } else if (core.length) {
    const latestCore = [...core].sort((a, b) => String(b.post.timestamp).localeCompare(String(a.post.timestamp)))[0];
    decision = latestCore.has_7d_review ? (latestCore.signal ? "next_core_experiment" : "rework_before_next") : "monitor_current_experiment";
    nextAction = latestCore.has_7d_review
      ? latestCore.signal
        ? "Run the next Tier A preflight; it still must pass public-health, 9:1, and exclusivity gates."
        : "Do not move to the next plugin until the first experiment angle is revised."
      : "Collect all due 24h, 72h, and 7d snapshots before another product post.";
  }
  return { decision, next_action: nextAction, totals, core_count: core.length, reviewed_core_count: reviewedCore.length };
}

function lokaEligibility(experiments, publicHealth, config) {
  const health = publicHealth?.profiles?.find((profile) => profile.id === config.plugins["loka-localization-hub"].public_health_id);
  const coreSignal = experiments.some((item) => item.plugin.tier === "A" && item.signal && item.has_7d_review);
  const healthReady = Boolean(health && health.status !== "blocked" && !(health.blockers || []).length);
  return {
    eligible: coreSignal && healthReady,
    core_signal: coreSignal,
    health_ready: healthReady,
    health_status: health?.status || "missing",
    blockers: health?.blockers || [],
  };
}

function render(report) {
  const { review, experiments, loka, args, config } = report;
  const lines = [
    "# Reddit Organic Pilot Review",
    "",
    `Generated: ${report.generated_at}`,
    `Review date: ${args.today}`,
    `Decision: ${review.decision}`,
    "",
    "## Recommendation",
    "",
    review.next_action,
    "",
    "## Portfolio Metrics",
    "",
    `- Reddit-related installs: ${review.totals.installs}`,
    `- Qualified activations: ${review.totals.activations}`,
    `- Activation rate: ${(review.totals.activation_rate * 100).toFixed(1)}%`,
    `- Recorded qualitative insights: ${review.totals.insights}`,
    `- Tier A experiments with 7d reviews: ${review.reviewed_core_count}/${Math.max(2, review.core_count)}`,
    `- Loka eligible: ${loka.eligible ? "yes" : "no"} (core signal=${loka.core_signal ? "yes" : "no"}; health=${loka.health_status})`,
    "",
    "## Experiments",
    "",
    "| Plugin | Community | Latest window | Installs | Activations | Rate | Insights | Missing due | Moderation | Signal |",
    "|---|---|---|---:|---:|---:|---:|---|---|---|",
  ];
  for (const item of experiments) {
    lines.push(`| ${pipe(item.plugin.name)} | ${pipe(config.subreddits[item.post.subreddit]?.label || item.post.subreddit)} | ${item.latest_snapshot?.review_window || "none"} | ${item.installs} | ${item.activations} | ${(item.activation_rate * 100).toFixed(1)}% | ${item.insights} | ${pipe(item.missing_due_windows.join(", ") || "none")} | ${item.unresolved_moderation ? "ISSUE" : "clear"} | ${item.signal ? "yes" : "no"} |`);
  }
  if (!experiments.length) lines.push("| No product post recorded | - | - | 0 | 0 | 0% | 0 | - | clear | no |");

  lines.push("", "## Thresholds", "");
  lines.push(
    `- Continue: at least ${config.thresholds.continue_min_installs} installs and ${(config.thresholds.continue_min_activation_rate * 100).toFixed(0)}% activation after both Tier A experiments.`,
    `- Scale: at least ${config.thresholds.scale_min_installs} installs, ${(config.thresholds.scale_min_activation_rate * 100).toFixed(0)}% activation, and ${config.thresholds.scale_min_insights} insights.`,
    "- Any unresolved removal, warning, or ban overrides metrics and stops the affected community for 30 days.",
    "",
    "## Missing Review Commands",
    "",
  );
  const missing = experiments.flatMap((item) => item.missing_due_windows.map((window) => ({ item, window })));
  if (!missing.length) {
    lines.push("- No currently due snapshot is missing.");
  } else {
    lines.push("```bash");
    for (const { item, window } of missing) {
      lines.push(`pnpm lead:reddit-activity -- --add --event snapshot --subreddit '${item.post.subreddit}' --plugin '${item.post.plugin}' --post-id '${item.post.post_id}' --window '${window}' --views <n> --upvotes <n> --comments <n> --installs <n> --activations <n> --evidence '<reddit-and-creator-space-proof>'`);
    }
    lines.push("```");
  }
  lines.push("", "## Guardrails", "", "- Metrics never override subreddit rules or an unresolved moderation action.", "- Do not sum cumulative snapshots; the review uses the latest snapshot for each post.", "- Do not publish Loka while payment/compliance public health is blocked.", "");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const config = await readJson(args.config);
  if (!config) throw new Error(`Missing Reddit pilot config: ${args.config}`);
  args.today ||= todayLocal(config.pilot.timezone);
  const [rows, publicHealth] = await Promise.all([
    readRows(args.ledger),
    readJson(args.publicHealth, {}),
  ]);
  const now = new Date();
  const posts = rows.filter((row) => row.event_type === "post" && row.status === "done" && toBoolean(row.promotional));
  const experiments = posts.map((post) => buildExperiment(post, rows, config, now));
  const review = portfolioDecision(experiments, config);
  const loka = lokaEligibility(experiments, publicHealth, config);
  const report = {
    generated_at: new Date().toISOString(),
    args,
    experiments,
    review,
    loka,
  };
  await Promise.all([
    writeText(args.output, render({ ...report, config })),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Reddit review: ${review.decision}\n`);
  process.stdout.write(`Experiments: ${experiments.length}; installs=${review.totals.installs}; activation=${(review.totals.activation_rate * 100).toFixed(1)}%\n`);
  process.stdout.write(`Loka eligible: ${loka.eligible ? "yes" : "no"}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
