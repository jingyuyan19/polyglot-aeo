#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_KIT = ".tmp/framer-community-feed-kit.json";
const DEFAULT_LINT = ".tmp/framer-community-lint.json";
const DEFAULT_PREFLIGHT = ".tmp/framer-community-preflight.json";
const DEFAULT_REVIEW = ".tmp/framer-community-review.json";
const DEFAULT_PUBLIC_PREFLIGHT = ".tmp/framer-public-preflight.json";
const DEFAULT_PAYMENT = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_MARKETPLACE_PUBLIC = ".tmp/framer-marketplace-public.json";
const DEFAULT_MARKETPLACE_POSTFLIGHT = ".tmp/framer-marketplace-postflight.json";
const DEFAULT_OUTPUT = ".tmp/framer-community-launch-brief.md";
const DEFAULT_JSON = ".tmp/framer-community-launch-brief.json";
const CONFIRMATION = "确认发布 Framer Community 第一条帖子";

function usage() {
  return `
Usage:
  pnpm lead:community-brief

Options:
  --kit <file>                  Community feed kit JSON. Default: ${DEFAULT_KIT}
  --lint <file>                 Community lint JSON. Default: ${DEFAULT_LINT}
  --preflight <file>            Community preflight JSON. Default: ${DEFAULT_PREFLIGHT}
  --review <file>               Community review JSON. Default: ${DEFAULT_REVIEW}
  --public-preflight <file>     Public preflight JSON. Default: ${DEFAULT_PUBLIC_PREFLIGHT}
  --payment <file>              Payment recovery JSON. Default: ${DEFAULT_PAYMENT}
  --marketplace-public <file>   Marketplace public snapshot JSON. Default: ${DEFAULT_MARKETPLACE_PUBLIC}
  --marketplace-postflight <file> Marketplace postflight JSON. Default: ${DEFAULT_MARKETPLACE_POSTFLIGHT}
  --publish-date <YYYY-MM-DD>   Planned publish date for review schedule. Default: T+N relative schedule.
  --today <YYYY-MM-DD>          Report date. Default: local date.
  --output <file>               Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                 JSON output. Default: ${DEFAULT_JSON}
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    kit: DEFAULT_KIT,
    lint: DEFAULT_LINT,
    preflight: DEFAULT_PREFLIGHT,
    review: DEFAULT_REVIEW,
    publicPreflight: DEFAULT_PUBLIC_PREFLIGHT,
    payment: DEFAULT_PAYMENT,
    marketplacePublic: DEFAULT_MARKETPLACE_PUBLIC,
    marketplacePostflight: DEFAULT_MARKETPLACE_POSTFLIGHT,
    publishDate: "",
    today: todayLocal(),
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
    if (key === "--preflight") {
      args.preflight = value;
      index += 1;
      continue;
    }
    if (key === "--review") {
      args.review = value;
      index += 1;
      continue;
    }
    if (key === "--public-preflight") {
      args.publicPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--payment") {
      args.payment = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-public") {
      args.marketplacePublic = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-postflight") {
      args.marketplacePostflight = value;
      index += 1;
      continue;
    }
    if (key === "--publish-date") {
      args.publishDate = value;
      index += 1;
      continue;
    }
    if (key === "--today") {
      args.today = value;
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

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function selectedPost(kit, preflight) {
  const posts = Array.isArray(kit?.posts) ? kit.posts : [];
  const selectedTitle = typeof preflight?.selected_post === "string"
    ? preflight.selected_post
    : preflight?.selected_post?.title || "";
  return posts.find((post) => post.title === selectedTitle) ||
    posts.find((post) => Number(post.priority) === 1) ||
    null;
}

function build({
  args,
  kit,
  lint,
  preflight,
  review,
  publicPreflight,
  payment,
  marketplacePublic,
  marketplacePostflight,
}) {
  const post = selectedPost(kit, preflight);
  const marketplaceSnapshot = normalizeMarketplacePublic(marketplacePublic);
  const selectedCampaign = findCampaign(kit, post?.campaign);
  const blockers = unique([
    ...(Array.isArray(preflight?.blockers) ? preflight.blockers : []),
    ...(Array.isArray(publicPreflight?.blockers) ? publicPreflight.blockers.map((item) => item.reason || item) : []),
  ].filter(Boolean));
  const paymentFirstBlocker = Array.isArray(payment?.phases)
    ? payment.phases.find((phase) => phase.status !== "ready") || null
    : null;
  const copyReady = lint?.status === "pass" && Boolean(post?.body);
  const publishAllowed = preflight?.publish_allowed === true;
  const valueScore = valueAssessment({ kit, review, marketplacePublic: marketplaceSnapshot });
  const experiment = communityExperimentPlan({
    args,
    kit,
    post,
    selectedCampaign,
    marketplaceSnapshot,
    marketplacePostflight,
  });
  const status = publishAllowed
    ? "ready_for_confirmation"
    : copyReady
      ? "materials_ready_blocked"
      : "materials_need_work";

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    status,
    publish_allowed: publishAllowed,
    confirmation_required: publishAllowed ? preflight?.confirmation_phrase || CONFIRMATION : "",
    value_assessment: valueScore,
    experiment,
    campaign_links: campaignLinks(kit),
    selected_post: post ? postSummary(post) : null,
    copy_ready: copyReady,
    lint_status: lint?.status || "missing",
    community_preflight: preflight?.verdict || preflight?.status || "missing",
    public_preflight: publicPreflight?.verdict || publicPreflight?.status || "missing",
    payment_recovery: payment?.status || "missing",
    payment_first_blocker: paymentFirstBlocker ? {
      id: paymentFirstBlocker.id,
      label: paymentFirstBlocker.label,
      status: paymentFirstBlocker.status,
      next_action: paymentFirstBlocker.next_action,
    } : null,
    marketplace_public: marketplaceSnapshot,
    marketplace_postflight: {
      status: marketplacePostflight?.status || "missing",
      upload_logged: marketplacePostflight?.upload_logged ?? null,
      community_publish_allowed: marketplacePostflight?.community_publish_allowed ?? null,
    },
    blockers,
    pre_publish_commands: prePublishCommands(),
    publish_command: post ? `pnpm lead:community-record -- --priority ${post.priority} --url '<published-framer-community-url>'` : "",
    review_schedule: reviewSchedule(args.publishDate),
    review_commands: reviewCommands(args.publishDate),
    recommendation: recommendationFor({ publishAllowed, copyReady, valueScore, paymentFirstBlocker, blockers }),
  };
}

function postSummary(post) {
  return {
    priority: post.priority,
    title: post.title,
    campaign: post.campaign,
    primary_link: post.primary_link,
    goal: post.post_goal,
    visual_asset: post.visual_asset?.file || "",
    visual_alt: post.visual_asset?.alt || "",
    body: post.body || "",
  };
}

function findCampaign(kit, campaignId) {
  const campaigns = Array.isArray(kit?.campaigns) ? kit.campaigns : [];
  return campaigns.find((campaign) => campaign.id === campaignId) || null;
}

function campaignLinks(kit) {
  return (Array.isArray(kit?.campaigns) ? kit.campaigns : []).map((campaign) => ({
    id: campaign.id,
    url: campaign.url || "",
  }));
}

function normalizeMarketplacePublic(marketplacePublic) {
  const snapshot = marketplacePublic?.snapshot || marketplacePublic?.listing || marketplacePublic || {};
  return {
    listing_readable: marketplacePublic?.listing_readable ?? marketplacePublic?.readable ?? snapshot.ok ?? snapshot.readable ?? null,
    likes: intOrNull(snapshot.likes ?? marketplacePublic?.likes),
    comments: intOrNull(snapshot.comments ?? marketplacePublic?.comments),
    users: intOrNull(snapshot.users ?? marketplacePublic?.users),
    opens: intOrNull(snapshot.opens ?? marketplacePublic?.opens),
    updated: snapshot.updated_at || snapshot.updated || marketplacePublic?.updated || "",
    published_at: snapshot.published_at || marketplacePublic?.published_at || "",
    url: snapshot.url || marketplacePublic?.url || "",
  };
}

function intOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function creatorSpaceBaseline(marketplacePostflight) {
  const latest = marketplacePostflight?.creator_space?.latest_snapshot || {};
  return {
    date: latest.date || "",
    users: intOrNull(latest.users),
    opens: intOrNull(latest.opens),
    version: intOrNull(latest.version),
    updated: latest.updated || "",
    note: latest.note || "",
  };
}

function communityExperimentPlan({ args, kit, post, selectedCampaign, marketplaceSnapshot, marketplacePostflight }) {
  const decisionRules = Array.isArray(kit?.decision_rules) ? kit.decision_rules : [];
  return {
    hypothesis: "A question-first, Framer-native checklist post can produce measurable audience-matched signal before broader public distribution.",
    publish_scope: "Publish only priority 1 first; do not publish priority 2 until the 24h/48h review says the hook has signal.",
    primary_metric: "qualified_signal_72h",
    qualified_signal_definition: [
      "At least one useful Community comment, DM, or profile reply.",
      "At least one non-test CTA event or form submission from the Community campaign.",
      "Marketplace Creator Space users or opens increase from the pre-post baseline.",
      "Marketplace public likes or comments increase from the pre-post baseline.",
    ],
    baseline: {
      marketplace_public: marketplaceSnapshot,
      creator_space: creatorSpaceBaseline(marketplacePostflight),
    },
    tracking: {
      feed: kit?.feed || "https://www.framer.com/community/feed/",
      marketplace_url: kit?.marketplace || "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/",
      campaign: post?.campaign || "",
      campaign_url: selectedCampaign?.url || "",
      source: kit?.source || "",
      medium: kit?.medium || "",
    },
    checkpoints: decisionRules.length
      ? decisionRules
      : [
          {
            window: "24h",
            continue_if: "Any comment, DM/profile reply, CTA event, form submission, or Marketplace users/opens lift.",
            stop_if: "",
            action: "Reply first, record manual comments/DMs, then rerun Community review.",
          },
          {
            window: "48h",
            continue_if: "Total signal score is greater than 0.",
            stop_if: "No manual signal, no tracked CTA/form, and no Marketplace lift.",
            action: "Rewrite the priority 1 hook before any priority 2 post.",
          },
          {
            window: "72h",
            continue_if: "Any qualified comment, DM, tracked CTA/form, Marketplace lift, reply, opportunity, or revenue signal.",
            stop_if: "No manual signal, no tracked CTA/form, no Marketplace lift, and no reply/opportunity/revenue signal.",
            action: "Deprioritize Community behind Marketplace, directories, and partner/resource channels.",
          },
        ],
    baseline_commands: [
      "pnpm lead:marketplace-public -- --record",
      "pnpm lead:forms && pnpm lead:events",
      "pnpm lead:community-review",
    ],
    review_commands: reviewCommands(args.publishDate),
  };
}

function valueAssessment({ kit, review, marketplacePublic }) {
  const posts = Array.isArray(kit?.posts) ? kit.posts.length : 0;
  const listingReadable = marketplacePublic?.listing_readable === true;
  const untested = review?.verdict === "not_started_worth_testing";
  const marketplaceNative = Array.isArray(kit?.posts) && kit.posts.some((post) => post.primary_link === "marketplace");
  const score = [
    posts >= 1,
    listingReadable,
    marketplaceNative,
    untested,
  ].filter(Boolean).length;
  const verdict = score >= 3 ? "worth_one_controlled_test" : "uncertain";
  return {
    verdict,
    score,
    rationale: verdict === "worth_one_controlled_test"
      ? "Framer Community is audience-matched and still untested; run one measured, Marketplace-native post after payment compliance gates are clear."
      : "Community value is not proven enough yet; improve the kit or Marketplace baseline before spending a publish slot.",
  };
}

function prePublishCommands() {
  return [
    "pnpm lead:payment-compliance-recovery",
    "pnpm lead:marketplace-preflight",
    "pnpm lead:marketplace-postflight",
    "pnpm lead:community",
    "pnpm lead:community-lint",
    "pnpm lead:community-preflight",
    "pnpm lead:public-preflight",
    "pnpm lead:marketplace-public -- --record",
  ];
}

function reviewSchedule(publishDate) {
  const windows = [
    { label: "24h", days: 1 },
    { label: "48h", days: 2 },
    { label: "72h", days: 3 },
    { label: "7d", days: 7 },
  ];
  return windows.map((window) => ({
    window: window.label,
    date: publishDate ? addDays(publishDate, window.days) : `publish_date+${window.label}`,
    objective: objectiveFor(window.label),
  }));
}

function objectiveFor(window) {
  if (window === "24h") return "Reply to comments, record manual signal, and capture Marketplace users/opens.";
  if (window === "48h") return "Decide whether the hook has enough signal to keep Community in rotation.";
  if (window === "72h") return "Stop or continue Community based on comments, DMs, Marketplace lift, CTA/forms, replies, or opportunities.";
  return "Keep only if there is qualified signal beyond likes or impressions.";
}

function reviewCommands(publishDate) {
  const commands = [
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:marketplace-public -- --record",
    "pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events>",
    "pnpm lead:distribution-review",
    "pnpm lead:ops && pnpm lead:report",
  ];
  if (publishDate) {
    commands.unshift(`# Review dates: ${reviewSchedule(publishDate).map((item) => `${item.window}=${item.date}`).join(", ")}`);
  }
  return commands;
}

function recommendationFor({ publishAllowed, copyReady, valueScore, paymentFirstBlocker, blockers }) {
  if (!copyReady) {
    return "Community materials are not publish-ready. Regenerate the kit and rerun lint before considering a post.";
  }
  if (publishAllowed) {
    return `Community is ready for one controlled test. Publish only after explicit confirmation: ${CONFIRMATION}`;
  }
  const firstBlocker = paymentFirstBlocker?.label || blockers[0] || "public preflight blocker";
  if (valueScore.verdict === "worth_one_controlled_test") {
    return `Worth testing, but do not publish yet. Clear first blocker: ${firstBlocker}.`;
  }
  return `Do not publish yet. Clear blockers and improve the launch kit before spending the Community post slot: ${firstBlocker}.`;
}

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Community Launch Brief",
    "",
    `Generated: ${data.generated_at}`,
    `Today: ${data.today}`,
    `Status: ${data.status}`,
    `Publish allowed: ${data.publish_allowed ? "yes" : "no"}`,
    `Confirmation required: ${data.confirmation_required || "not ready"}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Value Assessment",
    "",
    `- Verdict: ${data.value_assessment.verdict}`,
    `- Score: ${data.value_assessment.score}/4`,
    `- Rationale: ${data.value_assessment.rationale}`,
    "",
    "## Experiment Plan",
    "",
    `- Hypothesis: ${data.experiment.hypothesis}`,
    `- Publish scope: ${data.experiment.publish_scope}`,
    `- Primary metric: ${data.experiment.primary_metric}`,
    "",
    "Qualified signal:",
    "",
  ];

  for (const item of data.experiment.qualified_signal_definition) lines.push(`- ${item}`);

  lines.push(
    "",
    "Baseline:",
    "",
    `- Marketplace listing readable: ${data.experiment.baseline.marketplace_public.listing_readable === null ? "unknown" : data.experiment.baseline.marketplace_public.listing_readable ? "yes" : "no"}`,
    `- Marketplace public likes: ${data.experiment.baseline.marketplace_public.likes ?? "unknown"}`,
    `- Marketplace public comments: ${data.experiment.baseline.marketplace_public.comments ?? "unknown"}`,
    `- Marketplace public updated: ${data.experiment.baseline.marketplace_public.updated || "unknown"}`,
    `- Creator Space users: ${data.experiment.baseline.creator_space.users ?? "unknown"}`,
    `- Creator Space opens: ${data.experiment.baseline.creator_space.opens ?? "unknown"}`,
    `- Creator Space version: ${data.experiment.baseline.creator_space.version ?? "unknown"}`,
    `- Creator Space baseline date: ${data.experiment.baseline.creator_space.date || "unknown"}`,
    "",
    "Tracking links:",
    "",
    `- Feed: ${data.experiment.tracking.feed}`,
    `- Marketplace: ${data.experiment.tracking.marketplace_url}`,
    `- Campaign: ${data.experiment.tracking.campaign}`,
    `- Campaign URL: ${data.experiment.tracking.campaign_url || "missing"}`,
    `- UTM source/medium: ${data.experiment.tracking.source || "missing"} / ${data.experiment.tracking.medium || "missing"}`,
    "",
    "Decision checkpoints:",
    "",
    "| Window | Continue if | Stop if | Action |",
    "|---|---|---|---|",
  );

  for (const item of data.experiment.checkpoints) {
    lines.push(`| ${item.window} | ${item.continue_if || ""} | ${item.stop_if || ""} | ${item.action || ""} |`);
  }

  lines.push(
    "",
    "## Current Gates",
    "",
    `- Copy/lint: ${data.copy_ready ? "ready" : "not ready"} (${data.lint_status})`,
    `- Community preflight: ${data.community_preflight}`,
    `- Public preflight: ${data.public_preflight}`,
    `- Payment recovery: ${data.payment_recovery}`,
    `- Payment first blocker: ${data.payment_first_blocker?.label || "none"}`,
    `- Marketplace postflight: ${data.marketplace_postflight.status}`,
    "",
  );

  if (data.selected_post) {
    lines.push(
      "## Selected Post",
      "",
      `- Priority: ${data.selected_post.priority}`,
      `- Title: ${data.selected_post.title}`,
      `- Campaign: ${data.selected_post.campaign}`,
      `- Primary link: ${data.selected_post.primary_link}`,
      `- Visual: ${data.selected_post.visual_asset}`,
      `- Goal: ${data.selected_post.goal}`,
      "",
      "```text",
      data.selected_post.body,
      "```",
      "",
    );
  }

  if (data.blockers.length) {
    lines.push("## Blockers", "");
    for (const blocker of data.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }

  lines.push("## Pre-Publish Commands", "", "```bash", ...data.pre_publish_commands, "```", "");

  if (data.publish_command) {
    lines.push(
      "## After Publishing",
      "",
      "Record the post URL immediately:",
      "",
      "```bash",
      data.publish_command,
      "```",
      "",
    );
  }

  lines.push("## Review Schedule", "", "| Window | Date | Objective |", "|---|---|---|");
  for (const item of data.review_schedule) {
    lines.push(`| ${item.window} | ${item.date} | ${item.objective} |`);
  }
  lines.push("", "## Review Commands", "", "```bash", ...data.review_commands, "```", "");

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

  const [kit, lint, preflight, review, publicPreflight, payment, marketplacePublic, marketplacePostflight] = await Promise.all([
    readJson(args.kit, null),
    readJson(args.lint, null),
    readJson(args.preflight, null),
    readJson(args.review, null),
    readJson(args.publicPreflight, null),
    readJson(args.payment, null),
    readJson(args.marketplacePublic, null),
    readJson(args.marketplacePostflight, null),
  ]);
  const data = build({
    args,
    kit,
    lint,
    preflight,
    review,
    publicPreflight,
    payment,
    marketplacePublic,
    marketplacePostflight,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Community launch brief: ${data.status}\n`);
  process.stdout.write(`Publish allowed: ${data.publish_allowed ? "yes" : "no"}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
