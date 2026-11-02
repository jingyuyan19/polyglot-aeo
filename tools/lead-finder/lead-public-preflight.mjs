#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_GATE = ".tmp/framer-growth-gate.json";
const DEFAULT_COMMUNITY_LINT = ".tmp/framer-community-lint.json";
const DEFAULT_COMMUNITY_KIT = ".tmp/framer-community-feed-kit.json";
const DEFAULT_COMMUNITY_PREFLIGHT = ".tmp/framer-community-preflight.json";
const DEFAULT_COMMUNITY_REVIEW = ".tmp/framer-community-review.json";
const DEFAULT_MARKETPLACE_REVIEW = ".tmp/framer-marketplace-review.json";
const DEFAULT_PAYMENT_RECOVERY = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_DIRECTORY_KIT = ".tmp/framer-directory-submit-kit.json";
const DEFAULT_DIRECTORY_REVIEW = ".tmp/framer-directory-review.json";
const DEFAULT_PLUGIN_ZIP = "plugin.zip";
const DEFAULT_OUTPUT = ".tmp/framer-public-preflight.md";
const DEFAULT_JSON = ".tmp/framer-public-preflight.json";
const UPLOAD_EVIDENCE_PLACEHOLDER = "<framer-upload-confirmation-url-or-screenshot>";

function usage() {
  return `
Usage:
  pnpm lead:public-preflight

Options:
  --gate <file>                Growth gate JSON. Default: ${DEFAULT_GATE}
  --community-lint <file>      Community lint JSON. Default: ${DEFAULT_COMMUNITY_LINT}
  --community-kit <file>       Community kit JSON. Default: ${DEFAULT_COMMUNITY_KIT}
  --community-preflight <file> Community preflight JSON. Default: ${DEFAULT_COMMUNITY_PREFLIGHT}
  --community-review <file>    Community review JSON. Default: ${DEFAULT_COMMUNITY_REVIEW}
  --marketplace-review <file>  Marketplace review JSON. Default: ${DEFAULT_MARKETPLACE_REVIEW}
  --payment-recovery <file>    Payment compliance recovery JSON. Default: ${DEFAULT_PAYMENT_RECOVERY}
  --directory-kit <file>       Directory kit JSON. Default: ${DEFAULT_DIRECTORY_KIT}
  --directory-review <file>    Directory review JSON. Default: ${DEFAULT_DIRECTORY_REVIEW}
  --plugin-zip <file>          Plugin zip path. Default: ${DEFAULT_PLUGIN_ZIP}
  --output <file>              Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                JSON output. Default: ${DEFAULT_JSON}
  --help                       Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    gate: DEFAULT_GATE,
    communityLint: DEFAULT_COMMUNITY_LINT,
    communityKit: DEFAULT_COMMUNITY_KIT,
    communityPreflight: DEFAULT_COMMUNITY_PREFLIGHT,
    communityReview: DEFAULT_COMMUNITY_REVIEW,
    marketplaceReview: DEFAULT_MARKETPLACE_REVIEW,
    paymentRecovery: DEFAULT_PAYMENT_RECOVERY,
    directoryKit: DEFAULT_DIRECTORY_KIT,
    directoryReview: DEFAULT_DIRECTORY_REVIEW,
    pluginZip: DEFAULT_PLUGIN_ZIP,
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
    if (key === "--gate") {
      args.gate = value;
      index += 1;
      continue;
    }
    if (key === "--community-lint") {
      args.communityLint = value;
      index += 1;
      continue;
    }
    if (key === "--community-kit") {
      args.communityKit = value;
      index += 1;
      continue;
    }
    if (key === "--community-preflight") {
      args.communityPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--community-review") {
      args.communityReview = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-review") {
      args.marketplaceReview = value;
      index += 1;
      continue;
    }
    if (key === "--payment-recovery") {
      args.paymentRecovery = value;
      index += 1;
      continue;
    }
    if (key === "--directory-kit") {
      args.directoryKit = value;
      index += 1;
      continue;
    }
    if (key === "--directory-review") {
      args.directoryReview = value;
      index += 1;
      continue;
    }
    if (key === "--plugin-zip") {
      args.pluginZip = value;
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

async function readJson(file, fallback) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

async function pluginZipState(file) {
  try {
    const info = await stat(file);
    return {
      exists: true,
      path: path.resolve(file),
      size: info.size,
      modified: info.mtime.toISOString(),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        exists: false,
        path: path.resolve(file),
        error: "missing",
      };
    }
    throw error;
  }
}

function paymentRecoveryBlockers(paymentRecovery) {
  if (!paymentRecovery) {
    return ["Payment compliance recovery report is missing."];
  }
  if (paymentRecovery.promotion_allowed !== false) return [];
  const firstBlocked = Array.isArray(paymentRecovery.phases)
    ? paymentRecovery.phases.find((phase) => phase.status !== "ready")
    : null;
  return [
    firstBlocked
      ? `Payment compliance recovery is ${paymentRecovery.status}; first blocker: ${firstBlocked.label}.`
      : `Payment compliance recovery is ${paymentRecovery.status || "blocked"}.`,
  ];
}

function communityAction({ lint, kit, preflight, review, paymentRecovery }) {
  const firstPost = Array.isArray(kit.posts)
    ? [...kit.posts].sort((a, b) => Number(a.priority) - Number(b.priority))[0]
    : null;
  const paymentBlockers = paymentRecoveryBlockers(paymentRecovery);
  if (preflight) {
    const blockers = [
      ...(Array.isArray(preflight.blockers) ? preflight.blockers : []),
      ...paymentBlockers,
    ];
    const ready = preflight.publish_allowed && blockers.length === 0;
    return {
      id: "community_priority_1",
      label: "Publish Framer Community priority 1 post",
      status: ready ? "confirmation_required" : "blocked",
      confirmation: ready ? preflight.confirmation_phrase || "确认发布 Framer Community 第一条帖子" : "",
      evidence: preflight.selected_post?.campaign || preflight.community_review_verdict || ".tmp/framer-community-preflight.json",
      command_after_action: preflight.publish_command_after_submit || "pnpm lead:community-record -- --priority 1 --url '<published-framer-community-url>'",
      post_title: preflight.selected_post?.title || firstPost?.title || "",
      campaign: preflight.selected_post?.campaign || firstPost?.campaign || "",
      blockers,
    };
  }
  const lintPass = lint?.status === "pass";
  const notStarted = review?.verdict === "not_started_worth_testing" || !review;
  const ready = Boolean(firstPost && lintPass && notStarted && paymentBlockers.length === 0);
  const blockers = [...paymentBlockers];
  if (!firstPost) blockers.push("Community kit has no priority 1 post.");
  if (!lintPass) blockers.push(`Community lint is ${lint?.status || "missing"}.`);
  if (!notStarted) blockers.push(`Community review verdict is ${review?.verdict}.`);

  return {
    id: "community_priority_1",
    label: "Publish Framer Community priority 1 post",
    status: ready ? "confirmation_required" : "blocked",
    confirmation: ready ? "确认发布 Framer Community 第一条帖子" : "",
    evidence: lint?.kit || ".tmp/framer-community-feed-kit.json",
    command_after_action: "pnpm lead:community-record -- --priority 1 --url '<published-framer-community-url>'",
    post_title: firstPost?.title || "",
    campaign: firstPost?.campaign || "",
    blockers,
  };
}

function marketplaceAction({ marketplaceReview, plugin, paymentRecovery }) {
  const uploadOpen = marketplaceReview?.status === "upload_not_logged";
  const blockers = paymentRecoveryBlockers(paymentRecovery);
  if (!plugin.exists) blockers.push("plugin.zip is missing.");
  if (!uploadOpen) blockers.push(`Marketplace status is ${marketplaceReview?.status || "missing"}.`);
  const ready = uploadOpen && plugin.exists && blockers.length === 0;

  return {
    id: "marketplace_plugin_zip",
    label: "Upload plugin.zip to Framer Marketplace",
    status: ready ? "confirmation_required" : "blocked",
    confirmation: ready ? "确认上传 plugin.zip 到 Framer Marketplace" : "",
    evidence: plugin.path,
    command_after_action: `pnpm lead:marketplace-record -- --plugin-zip '${plugin.path}' --evidence '${UPLOAD_EVIDENCE_PLACEHOLDER}' --note 'uploaded from Framer Marketplace New Version flow'`,
    blockers,
  };
}

function directoryAction({ kit, review, paymentRecovery }) {
  if ((review?.directory_forms || 0) > 0 || (review?.form_submitted || 0) > 0) {
    return {
      id: "directory_form",
      label: "Review directory-sourced intent",
      status: "monitoring",
      confirmation: "",
      evidence: ".tmp/framer-directory-review.json",
      command_after_action: "pnpm lead:forms && pnpm lead:events && pnpm lead:directory-review && pnpm lead:ops",
      target: "",
      blockers: [],
    };
  }

  const reviewRows = Array.isArray(review?.rows) ? review.rows : [];
  const reviewTarget = reviewRows.find((item) => item.status === "needs_confirmation");
  const targets = Array.isArray(kit.targets) ? kit.targets : [];
  const kitTarget = targets.find((item) => item.status === "manual_confirmation_required") || targets[0];
  const target = reviewTarget
    ? {
        name: reviewTarget.target,
        channel: reviewTarget.channel,
        campaign: reviewTarget.campaign,
        submit_url: reviewTarget.submit_url,
      }
    : kitTarget;
  const blockers = paymentRecoveryBlockers(paymentRecovery);
  const ready = Boolean(target) && blockers.length === 0;
  return {
    id: "directory_form",
    label: "Submit one high-fit Framer directory form",
    status: ready ? "confirmation_required" : "blocked",
    confirmation: ready ? "确认提交 Frameplate / All Framer 目录表单" : "",
    evidence: target?.submit_url || "",
    command_after_action: target
      ? `pnpm lead:directory-record -- --campaign '${target.campaign}' --evidence '<submission-confirmation-or-screenshot>' --note 'submitted from public preflight'`
      : "",
    target: target?.name || "",
    blockers: [
      ...blockers,
      ...(target ? [] : ["Directory kit has no target."]),
    ],
  };
}

function assess({ gate, communityLint, communityKit, communityPreflight, communityReview, marketplaceReview, paymentRecovery, directoryKit, directoryReview, plugin }) {
  const actions = [
    marketplaceAction({ marketplaceReview, plugin, paymentRecovery }),
    communityAction({ lint: communityLint, kit: communityKit, preflight: communityPreflight, review: communityReview, paymentRecovery }),
    directoryAction({ kit: directoryKit, review: directoryReview, paymentRecovery }),
  ];
  const readyActions = actions.filter((action) => action.status === "confirmation_required");
  const blockedActions = actions.filter((action) => action.status === "blocked");
  const coldCap = gate?.decision?.cold_email_cap ?? null;
  const verdict = coldCap === 0 && readyActions.length
    ? "public_actions_ready_cold_email_paused"
    : readyActions.length
      ? "public_actions_ready"
      : "blocked";

  return {
    generated_at: new Date().toISOString(),
    verdict,
    cold_email_cap: coldCap,
    growth_gate: gate?.decision?.verdict || "",
    actions,
    ready_count: readyActions.length,
    blocked_count: blockedActions.length,
    confirmation_phrases: readyActions.map((action) => action.confirmation),
    recommendation: recommendation({ verdict, readyActions, blockedActions }),
  };
}

function recommendation({ verdict, readyActions, blockedActions }) {
  if (verdict === "blocked") {
    return `No public action is ready. Fix blockers: ${blockedActions.map((action) => `${action.label}: ${action.blockers.join("; ")}`).join(" / ")}`;
  }
  const next = readyActions[0];
  return `Next public action needs explicit confirmation: ${next.confirmation}`;
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Public Action Preflight",
    "",
    `Generated: ${data.generated_at}`,
    `Verdict: ${data.verdict}`,
    `Growth gate: ${data.growth_gate}`,
    `Cold email cap: ${data.cold_email_cap ?? "unknown"}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Actions",
    "",
    "| Action | Status | Confirmation | Evidence | Blockers |",
    "|---|---|---|---|---|",
  ];

  for (const action of data.actions) {
    lines.push(
      `| ${action.label} | ${action.status} | ${action.confirmation || ""} | ${action.evidence || ""} | ${action.blockers.join("<br>")} |`,
    );
  }

  lines.push("", "## After-Action Commands", "");
  for (const action of data.actions.filter((item) => item.command_after_action)) {
    lines.push(`### ${action.label}`, "", "```bash", action.command_after_action, "```", "");
  }

  lines.push("## Confirmation Phrases", "");
  if (data.confirmation_phrases.length) {
    for (const phrase of data.confirmation_phrases) lines.push(`- ${phrase}`);
  } else {
    lines.push("- No ready public action.");
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

  const [gate, communityLint, communityKit, communityPreflight, communityReview, marketplaceReview, paymentRecovery, directoryKit, directoryReview, plugin] = await Promise.all([
    readJson(args.gate, null),
    readJson(args.communityLint, null),
    readJson(args.communityKit, { posts: [] }),
    readJson(args.communityPreflight, null),
    readJson(args.communityReview, null),
    readJson(args.marketplaceReview, null),
    readJson(args.paymentRecovery, null),
    readJson(args.directoryKit, { targets: [] }),
    readJson(args.directoryReview, null),
    pluginZipState(args.pluginZip),
  ]);
  const data = assess({
    gate,
    communityLint,
    communityKit,
    communityPreflight,
    communityReview,
    marketplaceReview,
    paymentRecovery,
    directoryKit,
    directoryReview,
    plugin,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Public preflight: ${data.verdict}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
