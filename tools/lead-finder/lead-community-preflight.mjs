#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_KIT = ".tmp/framer-community-feed-kit.json";
const DEFAULT_LINT = ".tmp/framer-community-lint.json";
const DEFAULT_LINT_OUTPUT = ".tmp/framer-community-lint.md";
const DEFAULT_REVIEW = ".tmp/framer-community-review.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_MARKETPLACE_REVIEW = ".tmp/framer-marketplace-review.json";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_CHANNEL_PRIORITY = ".tmp/framer-channel-priority.json";
const DEFAULT_PAYMENT_RECOVERY = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_OUTPUT = ".tmp/framer-community-preflight.md";
const DEFAULT_JSON = ".tmp/framer-community-preflight.json";
const PRIMARY_CHANNEL = "framer_community_feed";

function usage() {
  return `
Usage:
  pnpm lead:community-preflight
  pnpm lead:community-preflight -- --priority 1

Options:
  --kit <file>                  Community kit JSON. Default: ${DEFAULT_KIT}
  --lint <file>                 Community lint JSON. Default: ${DEFAULT_LINT}
  --lint-output <file>          Community lint markdown. Default: ${DEFAULT_LINT_OUTPUT}
  --review <file>               Community review JSON. Default: ${DEFAULT_REVIEW}
  --actions <file>              External action log CSV. Default: ${DEFAULT_ACTIONS}
  --marketplace-review <file>   Marketplace review JSON. Default: ${DEFAULT_MARKETPLACE_REVIEW}
  --marketplace-preflight <file> Marketplace preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --channel-priority <file>     Channel priority JSON. Default: ${DEFAULT_CHANNEL_PRIORITY}
  --payment-recovery <file>     Payment compliance recovery JSON. Default: ${DEFAULT_PAYMENT_RECOVERY}
  --output <file>               Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                 JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>          Local date. Default: local date.
  --priority <number>           Post priority from the kit. Default: 1
  --campaign <id>               Select post by campaign instead of priority.
  --skip-lint-run               Reuse existing lint JSON instead of running lead:community-lint.
  --skip-site-check             Skip lead:site-check.
  --skip-payment-recovery       Reuse existing payment recovery JSON instead of running lead:payment-compliance-recovery.
  --allow-before-marketplace    Allow Community before Marketplace upload when explicitly chosen.
  --allow-out-of-order          Allow Community even when channel priority says another channel is next.
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    kit: DEFAULT_KIT,
    lint: DEFAULT_LINT,
    lintOutput: DEFAULT_LINT_OUTPUT,
    review: DEFAULT_REVIEW,
    actions: DEFAULT_ACTIONS,
    marketplaceReview: DEFAULT_MARKETPLACE_REVIEW,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    channelPriority: DEFAULT_CHANNEL_PRIORITY,
    paymentRecovery: DEFAULT_PAYMENT_RECOVERY,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
    priority: 1,
    runLint: true,
    runSiteCheck: true,
    runPaymentRecovery: true,
    allowBeforeMarketplace: false,
    allowOutOfOrder: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--kit") {
      args.kit = value;
      index += 1;
      continue;
    }
    if (key === "--lint") {
      args.lint = value;
      index += 1;
      continue;
    }
    if (key === "--lint-output") {
      args.lintOutput = value;
      index += 1;
      continue;
    }
    if (key === "--review") {
      args.review = value;
      index += 1;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-review") {
      args.marketplaceReview = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-preflight") {
      args.marketplacePreflight = value;
      index += 1;
      continue;
    }
    if (key === "--channel-priority") {
      args.channelPriority = value;
      index += 1;
      continue;
    }
    if (key === "--payment-recovery") {
      args.paymentRecovery = value;
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
    if (key === "--priority") {
      args.priority = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--campaign") {
      args.campaign = value;
      index += 1;
      continue;
    }
    if (key === "--skip-lint-run") {
      args.runLint = false;
      continue;
    }
    if (key === "--skip-site-check") {
      args.runSiteCheck = false;
      continue;
    }
    if (key === "--skip-payment-recovery") {
      args.runPaymentRecovery = false;
      continue;
    }
    if (key === "--allow-before-marketplace") {
      args.allowBeforeMarketplace = true;
      continue;
    }
    if (key === "--allow-out-of-order") {
      args.allowOutOfOrder = true;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
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
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

async function runStep(name, command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 30 * 1024 * 1024,
    });
    return {
      name,
      ok: true,
      command: [command, ...args].join(" "),
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      command: [command, ...args].join(" "),
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
      error: error?.message || String(error),
    };
  }
}

function selectPost(kit, args) {
  const posts = Array.isArray(kit.posts) ? kit.posts : [];
  const post = args.campaign
    ? posts.find((item) => item.campaign === args.campaign)
    : posts.find((item) => Number(item.priority) === args.priority);
  if (!post) return null;
  return post;
}

function postActions(rows, post) {
  return rows.filter(
    (row) =>
      row.type === "post" &&
      row.status === "done" &&
      (row.channel === PRIMARY_CHANNEL || row.channel === post?.channel) &&
      (row.campaign === post?.campaign || row.target === post?.title),
  );
}

function communityActions(rows) {
  return rows.filter(
    (row) =>
      row.type === "post" &&
      row.status === "done" &&
      (row.channel === PRIMARY_CHANNEL || String(row.evidence || "").includes("/community/")),
  );
}

function marketplaceUploadDone(rows) {
  return rows.some(
    (row) =>
      row.type === "marketplace_upload" &&
      row.campaign === "plugin_upgrade" &&
      row.status === "done",
  );
}

function dateDiffDays(from, to) {
  if (!from || !to) return null;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.floor((toMs - fromMs) / 86400000);
}

function addDays(date, days) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

function newestByDate(rows) {
  return [...rows].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index,
  )[0] || null;
}

function lintPost(lint, post) {
  const rows = Array.isArray(lint?.posts) ? lint.posts : [];
  return rows.find((row) => row.campaign === post?.campaign || Number(row.priority) === Number(post?.priority)) || null;
}

function assess({ args, kit, lint, review, actions, marketplaceReview, marketplacePreflight, channelPriority, paymentRecovery, steps }) {
  const post = selectPost(kit, args);
  const blockers = [];
  const warnings = [];
  const selectedLint = lintPost(lint, post);
  const selectedActions = postActions(actions, post);
  const existingPost = newestByDate(selectedActions);
  const latestCommunityPost = newestByDate(communityActions(actions));
  const daysSinceLatestCommunityPost = latestCommunityPost
    ? dateDiffDays(latestCommunityPost.date, args.today)
    : null;
  const uploadedMarketplace = marketplaceUploadDone(actions);
  const marketplaceOpen = marketplaceReview?.status === "upload_not_logged";
  const topChannel = channelPriority?.next_channel || "";
  const communityVerdict = review?.verdict || "";
  const paymentRecoveryBlocked = paymentRecovery?.promotion_allowed === false;

  if (!post) {
    blockers.push("Community kit does not contain the requested post. Run `pnpm lead:community`.");
  }

  if (!lint) {
    blockers.push("Community lint JSON is missing. Run `pnpm lead:community-lint`.");
  } else if (lint.status === "fail") {
    blockers.push("Community lint failed.");
  } else if (lint.status === "warn") {
    warnings.push("Community lint has warnings; review tone before publishing.");
  }

  if (selectedLint?.issues?.length) {
    blockers.push(`Selected post lint issues: ${selectedLint.issues.join("; ")}`);
  }
  if (selectedLint?.warnings?.length) {
    warnings.push(`Selected post lint warnings: ${selectedLint.warnings.join("; ")}`);
  }

  for (const step of steps) {
    if (!step.ok) blockers.push(`${step.name} failed`);
  }

  if (existingPost) {
    blockers.push(`Priority ${post?.priority || args.priority} Community post is already logged on ${existingPost.date}.`);
  }

  if (latestCommunityPost?.date === args.today) {
    blockers.push(`A Community post is already logged today (${latestCommunityPost.target || latestCommunityPost.campaign}).`);
  } else if (latestCommunityPost && daysSinceLatestCommunityPost !== null && daysSinceLatestCommunityPost < 1) {
    blockers.push("Latest Community post is less than 24 hours old.");
  }

  if (!args.allowBeforeMarketplace && !uploadedMarketplace) {
    const reason = marketplaceOpen
      ? "Marketplace upload is still not logged; upload Marketplace first so Community traffic has a current plugin listing to land on."
      : "Marketplace upload is not logged in the action log.";
    blockers.push(reason);
  }

  if (!args.allowOutOfOrder && topChannel && topChannel !== "Framer Community Feed") {
    blockers.push(`Channel priority currently routes next action to ${topChannel}.`);
  }

  if (marketplacePreflight && marketplacePreflight.upload_allowed === false && !uploadedMarketplace) {
    blockers.push(`Marketplace preflight is ${marketplacePreflight.verdict || "not ready"}.`);
  }

  if (!paymentRecovery) {
    blockers.push("Payment compliance recovery report is missing. Run `pnpm lead:payment-compliance-recovery`.");
  } else if (paymentRecoveryBlocked) {
    const firstBlocked = Array.isArray(paymentRecovery.phases)
      ? paymentRecovery.phases.find((phase) => phase.status !== "ready")
      : null;
    blockers.push(
      firstBlocked
        ? `Payment compliance recovery is ${paymentRecovery.status}; first blocker: ${firstBlocked.label}.`
        : `Payment compliance recovery is ${paymentRecovery.status || "blocked"}.`,
    );
  }

  if (communityVerdict && !["not_started_worth_testing", "revise_hook_before_next_post"].includes(communityVerdict)) {
    warnings.push(`Community review verdict is ${communityVerdict}; verify this is still the right post.`);
  }

  const publishAllowed = blockers.length === 0;
  const verdict = publishAllowed
    ? "ready_to_publish"
    : paymentRecoveryBlocked
      ? "blocked_payment_compliance"
      : uploadedMarketplace || args.allowBeforeMarketplace
      ? "blocked"
      : "blocked_until_marketplace_upload";

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    verdict,
    publish_allowed: publishAllowed,
    confirmation_phrase: "确认发布 Framer Community 第一条帖子",
    selected_post: post
      ? {
          priority: post.priority,
          title: post.title,
          campaign: post.campaign,
          channel: post.channel || PRIMARY_CHANNEL,
          primary_link: post.primary_link || "",
          body_chars: String(post.body || "").length,
          visual_asset: post.visual_asset?.file || "",
          visual_alt: post.visual_asset?.alt || "",
        }
      : null,
    lint_status: lint?.status || "missing",
    selected_lint_status: selectedLint?.status || "missing",
    community_review_verdict: communityVerdict || "missing",
    marketplace_status: marketplaceReview?.status || "missing",
    marketplace_upload_logged_done: uploadedMarketplace,
    payment_recovery_status: paymentRecovery?.status || "missing",
    payment_promotion_allowed: paymentRecovery?.promotion_allowed ?? null,
    channel_priority_next: topChannel || "missing",
    latest_community_post: latestCommunityPost
      ? {
          date: latestCommunityPost.date,
          target: latestCommunityPost.target,
          campaign: latestCommunityPost.campaign,
          evidence: latestCommunityPost.evidence,
        }
      : null,
    blockers,
    warnings,
    steps,
    recommendation: recommendation({ publishAllowed, blockers, uploadedMarketplace }),
    publish_command_after_submit: `pnpm lead:community-record -- --priority ${post?.priority || args.priority} --url '<published-framer-community-url>'`,
    review_commands: [
      "pnpm lead:forms && pnpm lead:events",
      "pnpm lead:community-review",
      "pnpm lead:action-review && pnpm lead:channel-priority",
      "pnpm lead:gate && pnpm lead:ops",
      `pnpm lead:community-review -- --today ${addDays(args.today, 1)}`,
      `pnpm lead:community-review -- --today ${addDays(args.today, 2)}`,
      `pnpm lead:community-review -- --today ${addDays(args.today, 3)}`,
    ],
  };
}

function recommendation({ publishAllowed, blockers, uploadedMarketplace }) {
  if (publishAllowed) {
    return "Community priority post is ready to publish after explicit user confirmation.";
  }
  if (blockers.some((blocker) => blocker.includes("Payment compliance recovery"))) {
    return "Do not publish Community yet. Resolve payment compliance recovery first, then rerun this preflight.";
  }
  if (!uploadedMarketplace) {
    return "Do not publish Community yet. Upload and record the current Marketplace plugin.zip first, then rerun this preflight.";
  }
  return `Do not publish Community yet. Fix blockers: ${blockers.slice(0, 4).join("; ")}`;
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Community Publish Preflight",
    "",
    `Generated: ${data.generated_at}`,
    `Date: ${data.today}`,
    `Verdict: ${data.verdict}`,
    `Publish allowed: ${data.publish_allowed ? "yes" : "no"}`,
    "",
    "## Selected Post",
    "",
  ];

  if (data.selected_post) {
    lines.push(
      `- Priority: ${data.selected_post.priority}`,
      `- Title: ${data.selected_post.title}`,
      `- Campaign: ${data.selected_post.campaign}`,
      `- Primary link: ${data.selected_post.primary_link || "unspecified"}`,
      `- Body chars: ${data.selected_post.body_chars}`,
      data.selected_post.visual_asset ? `- Visual asset: ${data.selected_post.visual_asset}` : "- Visual asset: missing",
    );
  } else {
    lines.push("- No selected post.");
  }

  lines.push(
    "",
    "## Checks",
    "",
    `- Community lint: ${data.lint_status}`,
    `- Selected post lint: ${data.selected_lint_status}`,
    `- Community review: ${data.community_review_verdict}`,
    `- Marketplace review: ${data.marketplace_status}`,
    `- Marketplace upload logged done: ${data.marketplace_upload_logged_done ? "yes" : "no"}`,
    `- Payment recovery: ${data.payment_recovery_status} (${data.payment_promotion_allowed === null ? "unknown" : `promotion allowed ${data.payment_promotion_allowed ? "yes" : "no"}`})`,
    `- Channel priority next: ${data.channel_priority_next}`,
    "",
    "| Step | Result |",
    "|---|---|",
  );

  if (data.steps.length) {
    for (const step of data.steps) lines.push(`| ${step.name} | ${step.ok ? "pass" : "fail"} |`);
  } else {
    lines.push("| Runtime checks | skipped |");
  }

  lines.push("", "## Recommendation", "", data.recommendation, "");

  if (data.blockers.length) {
    lines.push("## Blockers", "");
    for (const blocker of data.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }

  if (data.warnings.length) {
    lines.push("## Warnings", "");
    for (const warning of data.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push(
    "## Publish",
    "",
    `- Confirmation phrase: ${data.confirmation_phrase}`,
    "",
    "After submit:",
    "",
    "```bash",
    data.publish_command_after_submit,
    ...data.review_commands,
    "```",
    "",
    "## Guardrails",
    "",
    "- Do not publish unless `Publish allowed` is `yes`.",
    "- Do not publish without the explicit confirmation phrase.",
    "- Do not publish without attaching or first-commenting the selected visual asset.",
    "- Publish only the selected priority post first, then wait for the 24h, 48h, and 72h reviews.",
    "- Reply to comments or DMs before creating another Community post.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function build(args) {
  const steps = [];
  if (args.runLint) {
    steps.push(await runStep("Community lint", process.execPath, [
      "tools/lead-finder/lead-community-lint.mjs",
      "--kit",
      args.kit,
      "--output",
      args.lintOutput,
      "--json",
      args.lint,
    ]));
  }
  if (args.runSiteCheck) {
    steps.push(await runStep("Production site check", process.execPath, [
      "tools/lead-finder/lead-site-check.mjs",
    ]));
  }
  if (args.runPaymentRecovery) {
    steps.push(await runStep("Payment compliance recovery", process.execPath, [
      "tools/lead-finder/lead-payment-compliance-recovery.mjs",
      "--json",
      args.paymentRecovery,
    ]));
  }

  const [kit, lint, review, actions, marketplaceReview, marketplacePreflight, channelPriority, paymentRecovery] = await Promise.all([
    readJson(args.kit, { posts: [] }),
    readJson(args.lint, null),
    readJson(args.review, null),
    readRows(args.actions),
    readJson(args.marketplaceReview, null),
    readJson(args.marketplacePreflight, null),
    readJson(args.channelPriority, null),
    readJson(args.paymentRecovery, null),
  ]);

  return assess({
    args,
    kit,
    lint,
    review,
    actions,
    marketplaceReview,
    marketplacePreflight,
    channelPriority,
    paymentRecovery,
    steps,
  });
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

  const data = await build(args);
  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Community preflight: ${data.verdict}\n`);
  process.stdout.write(`Publish allowed: ${data.publish_allowed ? "yes" : "no"}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
