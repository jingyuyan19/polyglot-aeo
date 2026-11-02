#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_KIT = ".tmp/framer-distribution-kit.json";
const DEFAULT_COMMUNITY_KIT = ".tmp/framer-community-feed-kit.json";
const DEFAULT_DIRECTORY_KIT = ".tmp/framer-directory-submit-kit.json";
const DEFAULT_CREEM_STORE = ".tmp/framer-creem-store-monitor.json";
const DEFAULT_DISTRIBUTION_REVIEW = ".tmp/framer-distribution-review.json";
const DEFAULT_DIRECTORY_REVIEW = ".tmp/framer-directory-review.json";
const DEFAULT_MARKETPLACE_REVIEW = ".tmp/framer-marketplace-review.json";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_MARKETPLACE_PUBLIC = ".tmp/framer-marketplace-public.json";
const DEFAULT_MARKETPLACE_POSTFLIGHT = ".tmp/framer-marketplace-postflight.json";
const DEFAULT_MARKETPLACE_BRIEF = ".tmp/framer-marketplace-update.md";
const DEFAULT_COMMUNITY_PREFLIGHT = ".tmp/framer-community-preflight.json";
const DEFAULT_DEPLOY_REVIEW = ".tmp/framer-deploy-review.json";
const DEFAULT_TRACKING_FRESHNESS = ".tmp/framer-tracking-freshness.json";
const DEFAULT_NETLIFY_RECOVERY = ".tmp/framer-netlify-recovery.json";
const DEFAULT_PAYMENT_COMPLIANCE_RECOVERY = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_CLOUDFLARE_APPLY = ".tmp/framer-cloudflare-apply.json";
const DEFAULT_CREEM_COMPLIANCE = ".tmp/framer-creem-compliance-review.json";
const DEFAULT_BLOCKER_BRIEF = ".tmp/framer-blocker-resolution-brief.json";
const DEFAULT_PLUGIN_ZIP = "plugin.zip";
const DEFAULT_OUTPUT = ".tmp/framer-launch-console.html";
const DEFAULT_JSON = ".tmp/framer-launch-console.json";
const MARKETPLACE_URL = "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";
const UPLOAD_EVIDENCE_PLACEHOLDER = "<framer-upload-confirmation-url-or-screenshot>";
const CREATOR_SPACE_EVIDENCE_PLACEHOLDER = "<creator-space-dashboard-snapshot-or-upload-confirmation>";

function usage() {
  return `
Usage:
  pnpm lead:launch-console

Options:
  --kit <file>                   Distribution kit JSON. Default: ${DEFAULT_KIT}
  --community-kit <file>         Framer Community feed kit JSON. Default: ${DEFAULT_COMMUNITY_KIT}
  --directory-kit <file>         Directory submission kit JSON. Default: ${DEFAULT_DIRECTORY_KIT}
  --creem-store <file>           Creem API transaction monitor JSON. Default: ${DEFAULT_CREEM_STORE}
  --distribution-review <file>   Distribution review JSON. Default: ${DEFAULT_DISTRIBUTION_REVIEW}
  --directory-review <file>      Directory review JSON. Default: ${DEFAULT_DIRECTORY_REVIEW}
  --marketplace-review <file>    Marketplace review JSON. Default: ${DEFAULT_MARKETPLACE_REVIEW}
  --marketplace-preflight <file> Marketplace upload preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --marketplace-public <file>    Marketplace public listing JSON. Default: ${DEFAULT_MARKETPLACE_PUBLIC}
  --marketplace-postflight <file> Marketplace after-upload postflight JSON. Default: ${DEFAULT_MARKETPLACE_POSTFLIGHT}
  --marketplace-brief <file>     Marketplace upload brief markdown. Default: ${DEFAULT_MARKETPLACE_BRIEF}
  --community-preflight <file>   Community publish preflight JSON. Default: ${DEFAULT_COMMUNITY_PREFLIGHT}
  --deploy-review <file>         Deploy review JSON. Default: ${DEFAULT_DEPLOY_REVIEW}
  --tracking-freshness <file>    Production tracking freshness JSON. Default: ${DEFAULT_TRACKING_FRESHNESS}
  --netlify-recovery <file>      Netlify recovery check JSON. Default: ${DEFAULT_NETLIFY_RECOVERY}
  --payment-compliance-recovery <file> Payment compliance recovery JSON. Default: ${DEFAULT_PAYMENT_COMPLIANCE_RECOVERY}
  --cloudflare-apply <file>      Cloudflare apply dry-run/deploy JSON. Default: ${DEFAULT_CLOUDFLARE_APPLY}
  --creem-compliance <file>      Creem compliance review JSON. Default: ${DEFAULT_CREEM_COMPLIANCE}
  --blocker-brief <file>         Blocker resolution brief JSON. Default: ${DEFAULT_BLOCKER_BRIEF}
  --plugin-zip <file>            Plugin zip path. Default: ${DEFAULT_PLUGIN_ZIP}
  --output <file>                HTML output. Default: ${DEFAULT_OUTPUT}
  --json <file>                  JSON output. Default: ${DEFAULT_JSON}
  --help                         Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    kit: DEFAULT_KIT,
    communityKit: DEFAULT_COMMUNITY_KIT,
    directoryKit: DEFAULT_DIRECTORY_KIT,
    creemStore: DEFAULT_CREEM_STORE,
    distributionReview: DEFAULT_DISTRIBUTION_REVIEW,
    directoryReview: DEFAULT_DIRECTORY_REVIEW,
    marketplaceReview: DEFAULT_MARKETPLACE_REVIEW,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    marketplacePublic: DEFAULT_MARKETPLACE_PUBLIC,
    marketplacePostflight: DEFAULT_MARKETPLACE_POSTFLIGHT,
    marketplaceBrief: DEFAULT_MARKETPLACE_BRIEF,
    communityPreflight: DEFAULT_COMMUNITY_PREFLIGHT,
    deployReview: DEFAULT_DEPLOY_REVIEW,
    trackingFreshness: DEFAULT_TRACKING_FRESHNESS,
    netlifyRecovery: DEFAULT_NETLIFY_RECOVERY,
    paymentComplianceRecovery: DEFAULT_PAYMENT_COMPLIANCE_RECOVERY,
    cloudflareApply: DEFAULT_CLOUDFLARE_APPLY,
    creemCompliance: DEFAULT_CREEM_COMPLIANCE,
    blockerBrief: DEFAULT_BLOCKER_BRIEF,
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
    if (key === "--kit") {
      args.kit = value;
      index += 1;
      continue;
    }
    if (key === "--community-kit") {
      args.communityKit = value;
      index += 1;
      continue;
    }
    if (key === "--directory-kit") {
      args.directoryKit = value;
      index += 1;
      continue;
    }
    if (key === "--creem-store") {
      args.creemStore = value;
      index += 1;
      continue;
    }
    if (key === "--distribution-review") {
      args.distributionReview = value;
      index += 1;
      continue;
    }
    if (key === "--directory-review") {
      args.directoryReview = value;
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
    if (key === "--marketplace-brief") {
      args.marketplaceBrief = value;
      index += 1;
      continue;
    }
    if (key === "--community-preflight") {
      args.communityPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--deploy-review") {
      args.deployReview = value;
      index += 1;
      continue;
    }
    if (key === "--tracking-freshness") {
      args.trackingFreshness = value;
      index += 1;
      continue;
    }
    if (key === "--netlify-recovery") {
      args.netlifyRecovery = value;
      index += 1;
      continue;
    }
    if (key === "--payment-compliance-recovery") {
      args.paymentComplianceRecovery = value;
      index += 1;
      continue;
    }
    if (key === "--cloudflare-apply") {
      args.cloudflareApply = value;
      index += 1;
      continue;
    }
    if (key === "--creem-compliance") {
      args.creemCompliance = value;
      index += 1;
      continue;
    }
    if (key === "--blocker-brief") {
      args.blockerBrief = value;
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

async function readText(file, fallback = "") {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readJson(file, fallback) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

async function zipInfo(file) {
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  return {
    file,
    absolute: path.resolve(file),
    size: info.size,
    modified: info.mtime.toISOString(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function priorityPosts(kit) {
  return (Array.isArray(kit.posts) ? kit.posts : [])
    .filter((post) => Number(post.priority) <= 2)
    .sort((a, b) => Number(a.priority) - Number(b.priority));
}

function postCommand(post) {
  const channel = String(post.action_channel || post.channel || "");
  if (channel.includes("community_feed")) {
    return [
      "pnpm lead:community-record --",
      `--priority ${Number(post.priority) || 1}`,
      "--url '<published-framer-community-url>'",
    ].join(" ");
  }

  return [
    "pnpm lead:actions -- --add",
    "--type post",
    `--channel ${shellQuote(post.action_channel || post.channel || "framer_community")}`,
    `--campaign ${shellQuote(post.campaign)}`,
    "--status done",
    `--target ${shellQuote(post.title)}`,
    `--evidence '${evidencePlaceholder(post)}'`,
    `--note ${shellQuote(`published ${post.title} from launch console`)}`,
  ].join(" ");
}

function evidencePlaceholder(post) {
  const channel = String(post.action_channel || post.channel || "");
  if (channel.includes("community_feed")) return "<published-framer-community-url>";
  return "<published-url-or-thread-id>";
}

function marketplaceDoneCommand(zip) {
  return [
    "pnpm lead:marketplace-record --",
    `--plugin-zip ${shellQuote(zip.file)}`,
    `--evidence ${shellQuote(UPLOAD_EVIDENCE_PLACEHOLDER)}`,
    "--note 'uploaded from Framer Marketplace New Version flow'",
  ].join(" ");
}

function marketplaceSnapshotCommand(zip) {
  return [
    "pnpm lead:marketplace-record --",
    `--plugin-zip ${shellQuote(zip.file)}`,
    `--evidence ${shellQuote(CREATOR_SPACE_EVIDENCE_PLACEHOLDER)}`,
    "--users <users>",
    "--opens <opens>",
    "--version <version>",
    '--updated "<updated>"',
  ].join(" ");
}

function creatorSpaceSnapshotCommand(note) {
  return [
    "pnpm lead:marketplace -- --add",
    "--users <users>",
    "--opens <opens>",
    "--version <version>",
    '--updated "<updated>"',
    `--note ${shellQuote(note)}`,
  ].join(" ");
}

function directoryCommand(target) {
  const parts = [
    "pnpm lead:directory-record --",
    `--campaign ${shellQuote(target.campaign)}`,
    `--evidence ${shellQuote(target.evidence_hint || "<submission-confirmation-or-screenshot>")}`,
  ];
  if (target.kit_status && target.kit_status !== "manual_confirmation_required") {
    parts.push("--force");
  }
  return parts.join(" ");
}

function directoryTargets(directoryKit, directoryReview) {
  const reviewByCampaign = new Map(
    (Array.isArray(directoryReview?.rows) ? directoryReview.rows : []).map((row) => [
      row.campaign,
      row,
    ]),
  );

  return (Array.isArray(directoryKit.targets) ? directoryKit.targets : [])
    .slice()
    .sort((a, b) => Number(a.priority) - Number(b.priority))
    .map((target) => {
      const review = reviewByCampaign.get(target.campaign);
      const merged = {
        ...target,
        kit_status: target.status,
        review_status: review?.status || "",
        action_count: review?.action_count ?? 0,
      };
      return {
        ...merged,
        command: directoryCommand(merged),
      };
    });
}

function markdownSection(text, heading) {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    section.push(lines[index]);
  }
  return section.join("\n").trim();
}

function briefText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  return trimmed.length > 6000 ? `${trimmed.slice(0, 6000)}\n\n...[truncated]` : trimmed;
}

function firstCreemDeadline(creemCompliance) {
  return Array.isArray(creemCompliance?.warning_deadlines)
    ? creemCompliance.warning_deadlines[0] || null
    : null;
}

function creemDeadlineText(creemCompliance) {
  const deadline = firstCreemDeadline(creemCompliance);
  if (!deadline) return "";
  return `${deadline.deadline_at || "unknown deadline"} (${deadline.hours_remaining ?? "unknown"}h remaining, ${deadline.urgency || "unknown"})`;
}

function cloudflareApplySummary(cloudflareApply) {
  const plan = cloudflareApply?.deployment_plan || {};
  return {
    status: cloudflareApply?.status || "missing",
    dry_run: cloudflareApply?.dry_run ?? null,
    deploy_allowed: cloudflareApply?.deploy_allowed ?? null,
    generated_at: cloudflareApply?.generated_at || "",
    confirmation_required: cloudflareApply?.confirmation_required || "确认部署 Cloudflare Worker custom domain",
    recommendation: cloudflareApply?.recommendation || "Run pnpm lead:cloudflare-apply -- --dry-run before requesting deploy confirmation.",
    planned_commands: Array.isArray(cloudflareApply?.planned_commands)
      ? cloudflareApply.planned_commands
      : ["pnpm lead:cloudflare-apply -- --dry-run"],
    deployment_plan: {
      wrangler_dir: plan.wrangler_dir || "api",
      wrangler_file: plan.wrangler_file || "api/wrangler.toml",
      worker_name: plan.worker_name || "",
      main: plan.main || "",
      target_origin: plan.target_origin || cloudflareApply?.target_origin || "https://license.polyglotaeo.com",
      health_url: plan.health_url || "https://license.polyglotaeo.com/health",
      custom_domains: Array.isArray(plan.custom_domains) ? plan.custom_domains : [],
      vars: Array.isArray(plan.vars) ? plan.vars : [],
      required_secrets: Array.isArray(plan.required_secrets) ? plan.required_secrets : [],
      missing_secrets: Array.isArray(plan.missing_secrets) ? plan.missing_secrets : [],
      latest_deployment_id: plan.latest_deployment_id || "",
      latest_deployment_created_on: plan.latest_deployment_created_on || "",
      deploy_command: plan.deploy_command || "cd api && npx wrangler deploy",
    },
  };
}

function revenueMonitor(creemStore) {
  const newTransactions = Array.isArray(creemStore?.new_transactions) ? creemStore.new_transactions : [];
  const newPolyglotTransactions = Array.isArray(creemStore?.polyglot_new_transactions)
    ? creemStore.polyglot_new_transactions
    : [];
  const revenueCommands = Array.isArray(creemStore?.revenue_commands) ? creemStore.revenue_commands : [];
  const baselinePolyglotTransactions = Array.isArray(creemStore?.baseline_polyglot_transactions)
    ? creemStore.baseline_polyglot_transactions
    : [];
  const baselineReviewCommands = Array.isArray(creemStore?.baseline_review_commands)
    ? creemStore.baseline_review_commands
    : [];
  const apiKeyEnv = creemStore?.api_key_env || "CREEM_API_KEY";
  const setupCommand = [`export ${apiKeyEnv}='<creem-api-key>'`, "pnpm lead:creem-store"].join("\n");
  return {
    status: creemStore?.status || "missing",
    mode: creemStore?.test_mode ? "test" : "live",
    api_key_env: apiKeyEnv,
    key_present: creemStore?.key_present ?? null,
    transactions_returned: creemStore?.transactions_returned ?? 0,
    new_transactions: newTransactions,
    new_polyglot_transactions: newPolyglotTransactions,
    baseline_polyglot_transactions: baselinePolyglotTransactions,
    revenue_commands: revenueCommands,
    baseline_review_commands: baselineReviewCommands,
    recommendation: creemStore?.recommendation || "Run pnpm lead:creem-store to refresh direct Creem transaction monitoring.",
    setup_command: setupCommand,
    monitor_command: "pnpm lead:creem-store",
    command_block: [
      creemStore?.key_present === false ? setupCommand : "pnpm lead:creem-store",
      revenueCommands.length
        ? ["# after confirming these are live external Polyglot AEO transactions", ...revenueCommands].join("\n")
        : "",
      baselineReviewCommands.length
        ? ["# after confirming these baseline transactions are live external Polyglot AEO revenue and not already recorded", ...baselineReviewCommands].join("\n")
        : "",
    ].filter(Boolean).join("\n\n"),
  };
}

function buildConsole({
  kit,
  communityKit,
  directoryKit,
  creemStore,
  distributionReview,
  directoryReview,
  marketplaceReview,
  marketplacePreflight,
  marketplacePublic,
  marketplacePostflight,
  marketplaceBrief,
  communityPreflight,
  deployReview,
  trackingFreshness,
  netlifyRecovery,
  paymentComplianceRecovery,
  cloudflareApply,
  creemCompliance,
  blockerBrief,
  zip,
}) {
  const posts = priorityPosts(kit).map((post) => ({
    ...post,
    command: postCommand(post),
  }));
  const communityPosts = (Array.isArray(communityKit.posts) ? communityKit.posts : [])
    .sort((a, b) => Number(a.priority) - Number(b.priority))
    .map((post) => ({
      ...post,
      command: postCommand(post),
    }));
  const marketplacePublicSnapshot =
    marketplacePublic?.snapshot || marketplacePublic?.listing || marketplacePostflight?.public_listing || {};
  const marketplacePublicReadable =
    marketplacePublic?.snapshot?.ok ??
    marketplacePublic?.listing?.readable ??
    marketplacePublic?.readable ??
    marketplacePostflight?.public_listing?.readable ??
    null;
  const marketplacePostflightComplete =
    marketplacePostflight?.postflight_complete ?? marketplacePostflight?.complete ?? null;
  const marketplacePostflightMissing = Array.isArray(marketplacePostflight?.missing)
    ? marketplacePostflight.missing
    : Array.isArray(marketplacePostflight?.missing_proof)
      ? marketplacePostflight.missing_proof
      : [];

  const data = {
    generated_at: new Date().toISOString(),
    marketplace_url: MARKETPLACE_URL,
    zip,
    marketplace: {
      status: marketplaceReview?.status || "unknown",
      recommendation: marketplaceReview?.recommendation || "Run pnpm lead:marketplace-review.",
      preflight_verdict: marketplacePreflight?.verdict || "missing",
      upload_allowed: marketplacePreflight?.upload_allowed ?? null,
      preflight_sha256: marketplacePreflight?.zip?.sha256 || "",
      preflight_recommendation: marketplacePreflight?.recommendation || "",
      preflight_blockers: Array.isArray(marketplacePreflight?.blockers)
        ? marketplacePreflight.blockers
        : [],
      public_readable: marketplacePublicReadable,
      public_likes: marketplacePublicSnapshot.likes ?? marketplacePublic?.likes ?? null,
      public_comments: marketplacePublicSnapshot.comments ?? marketplacePublic?.comments ?? null,
      public_updated:
        marketplacePublicSnapshot.updated_at ??
        marketplacePublicSnapshot.updated ??
        marketplacePublic?.updated ??
        "",
      postflight_status: marketplacePostflight?.status || "missing",
      postflight_complete: marketplacePostflightComplete,
      postflight_recommendation: marketplacePostflight?.recommendation || "",
      postflight_missing: marketplacePostflightMissing,
      brief_path: marketplaceBrief?.path || "",
      brief: briefText(marketplaceBrief?.text || ""),
      browser_path: markdownSection(marketplaceBrief?.text || "", "Browser Path"),
      changes: markdownSection(marketplaceBrief?.text || "", "Changes"),
      after_submit: markdownSection(marketplaceBrief?.text || "", "After Submit"),
      baseline_command: creatorSpaceSnapshotCommand("Creator Space baseline before Marketplace upload"),
      community_baseline_command: creatorSpaceSnapshotCommand("Creator Space baseline before Community post"),
      done_command: marketplaceDoneCommand(zip),
      snapshot_command: marketplaceSnapshotCommand(zip),
    },
    deploy: {
      status: deployReview?.status || "unknown",
      recommendation: deployReview?.recommendation || "Run pnpm lead:deploy-review.",
      production_site_check: deployReview?.production_site_check || "unknown",
      netlify_new_deploys: deployReview?.netlify_new_deploys || "unknown",
      latest_production_deploy_id: deployReview?.latest_production_deploy_id || "",
      latest_production_published_at: deployReview?.latest_production_published_at || "",
    },
    tracking: {
      status: trackingFreshness?.status || "missing",
      fresh: trackingFreshness?.fresh ?? null,
      scripts_checked: trackingFreshness?.scripts_checked ?? 0,
      missing_required_count: Array.isArray(trackingFreshness?.missing_required)
        ? trackingFreshness.missing_required.length
        : 0,
      recommendation: trackingFreshness?.recommendation || "Run pnpm lead:tracking-freshness.",
    },
    netlify_recovery: {
      status: netlifyRecovery?.status || "missing",
      api_readable: Boolean(netlifyRecovery?.api?.site_readable && netlifyRecovery?.api?.deploys_readable),
      latest_deploy_id: netlifyRecovery?.latest_deploy?.id || "",
      credit_blocker: netlifyRecovery?.blockers?.account_credit_usage_exceeded ?? null,
      local_build_has_attribution_schema: netlifyRecovery?.blockers?.local_build_has_attribution_schema ?? null,
      recommendation: netlifyRecovery?.recommendation || "Run pnpm lead:netlify-recovery.",
    },
    payment_recovery: {
      status: paymentComplianceRecovery?.status || "missing",
      promotion_allowed: paymentComplianceRecovery?.promotion_allowed ?? null,
      marketplace_upload_allowed: paymentComplianceRecovery?.marketplace_upload_allowed ?? null,
      recommendation: paymentComplianceRecovery?.recommendation || "Run pnpm lead:payment-compliance-recovery.",
      creem_status: creemCompliance?.status || "missing",
      creem_deadline: firstCreemDeadline(creemCompliance),
      creem_deadline_text: creemDeadlineText(creemCompliance),
      creem_recommendation: creemCompliance?.recommendation || "",
      creem_support_draft: creemCompliance?.support_draft || "",
      creem_closure_draft: creemCompliance?.closure_draft || "",
      phases: Array.isArray(paymentComplianceRecovery?.phases) ? paymentComplianceRecovery.phases : [],
      blockers: Array.isArray(paymentComplianceRecovery?.blockers) ? paymentComplianceRecovery.blockers : [],
      read_only_commands: Array.isArray(paymentComplianceRecovery?.read_only_commands)
        ? paymentComplianceRecovery.read_only_commands
        : ["pnpm lead:payment-compliance-recovery"],
      confirmation_gated_commands: Array.isArray(paymentComplianceRecovery?.confirmation_gated_commands)
        ? paymentComplianceRecovery.confirmation_gated_commands
        : [],
    },
    cloudflare_apply: cloudflareApplySummary(cloudflareApply),
    revenue_monitor: revenueMonitor(creemStore),
    blocker: {
      status: blockerBrief?.status || "missing",
      recommendation: blockerBrief?.recommendation || "",
      next_confirmation: blockerBrief?.next_executable?.confirmation || "",
      decision_queue: Array.isArray(blockerBrief?.decision_queue) ? blockerBrief.decision_queue : [],
      stop_rules: Array.isArray(blockerBrief?.stop_rules) ? blockerBrief.stop_rules : [],
    },
    distribution: {
      recommendation: distributionReview?.recommendation || "Run pnpm lead:distribution-review.",
      priority_posted: distributionReview?.priority_posted ?? 0,
      priority_posts: distributionReview?.priority_posts ?? posts.length,
      posts,
    },
    community: {
      feed: communityKit.feed || "https://www.framer.com/community/feed/",
      source: communityKit.source || "framer_community_feed",
      medium: communityKit.medium || "community_post",
      preflight_verdict: communityPreflight?.verdict || "missing",
      preflight_publish_allowed: communityPreflight?.publish_allowed ?? false,
      preflight_recommendation: communityPreflight?.recommendation || "",
      preflight_blockers: Array.isArray(communityPreflight?.blockers)
        ? communityPreflight.blockers
        : [],
      posts: communityPosts,
      guardrails: Array.isArray(communityKit.guardrails) ? communityKit.guardrails : [],
      measurement: Array.isArray(communityKit.measurement) ? communityKit.measurement : [],
    },
    directory: {
      recommendation: directoryReview?.recommendation || "Run pnpm lead:directory-review.",
      product: directoryKit.product || {},
      field_values: Array.isArray(directoryKit.field_values) ? directoryKit.field_values : [],
      links: directoryKit.links || {},
      guardrails: Array.isArray(directoryKit.guardrails) ? directoryKit.guardrails : [],
      targets: directoryTargets(directoryKit, directoryReview),
    },
    review_commands: [
      "pnpm lead:forms && pnpm lead:events",
      "pnpm lead:tracking-freshness",
      "pnpm lead:netlify-recovery",
      "pnpm lead:netlify-apply -- --dry-run",
      "pnpm lead:cloudflare-recovery",
      "pnpm lead:cloudflare-apply -- --dry-run",
      "pnpm lead:payment-compliance-recovery",
      "pnpm lead:blocker-brief",
      "pnpm lead:deploy-review",
      "pnpm lead:community-review",
      "pnpm lead:distribution-review",
      "pnpm lead:directory-review",
      "pnpm lead:marketplace-public -- --record",
      "pnpm lead:signal-sweep",
      "pnpm lead:creem-store",
      "pnpm lead:marketplace-review",
      "pnpm lead:marketplace-postflight",
      "pnpm lead:community-preflight",
      "pnpm lead:community-brief",
      "pnpm lead:day3-readiness",
      "pnpm lead:day3-brief",
      "pnpm lead:next-public-actions",
      "pnpm lead:ops",
      "pnpm lead:report",
    ],
  };

  data.acquisition_runbook = buildAcquisitionRunbook(data);
  return data;
}

function buildAcquisitionRunbook(data) {
  const communityPriority = data.community.posts.find((post) => Number(post.priority) === 1);
  const directoryTarget =
    data.directory.targets.find(
      (target) =>
        target.review_status === "needs_confirmation" ||
        target.kit_status === "manual_confirmation_required",
    ) || data.directory.targets[0];
  const reviewLoop = [
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:marketplace-public -- --record",
    "pnpm lead:tracking-freshness",
    "pnpm lead:netlify-recovery",
    "pnpm lead:netlify-apply -- --dry-run",
    "pnpm lead:signal-sweep",
    "pnpm lead:creem-store",
    "pnpm lead:marketplace-review",
    "pnpm lead:marketplace-postflight",
    "pnpm lead:community-preflight",
    "pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events>",
    "pnpm lead:directory-review",
    "pnpm lead:day3-readiness",
    "pnpm lead:day3-brief",
    "pnpm lead:action-review",
    "pnpm lead:channel-priority",
    "pnpm lead:ops && pnpm lead:report",
  ];

  return [
    {
      title: "1. Payment compliance recovery",
      status: data.payment_recovery.status,
      confirmation: "Cloudflare/Netlify/Creem steps require their listed confirmations",
      objective: "Clear checkout-origin and provider compliance blockers before sending traffic to purchase paths.",
      proof: [
        `Payment recovery status: ${data.payment_recovery.status}`,
        `Creem compliance status: ${data.payment_recovery.creem_status}`,
        data.payment_recovery.creem_deadline_text ? `Creem warning deadline: ${data.payment_recovery.creem_deadline_text}` : "",
        `Promotion allowed: ${data.payment_recovery.promotion_allowed === null ? "unknown" : data.payment_recovery.promotion_allowed ? "yes" : "no"}`,
        `Marketplace upload allowed: ${data.payment_recovery.marketplace_upload_allowed === null ? "unknown" : data.payment_recovery.marketplace_upload_allowed ? "yes" : "no"}`,
        data.payment_recovery.recommendation,
      ].filter(Boolean),
      commands: [
        "pnpm lead:creem-compliance",
        "pnpm lead:cloudflare-recovery",
        "pnpm lead:cloudflare-apply -- --dry-run",
        "pnpm lead:checkout-origin",
        "pnpm lead:netlify-recovery",
        "pnpm lead:netlify-apply -- --dry-run",
        "pnpm lead:deploy-review",
        "pnpm lead:marketplace-preflight",
        "pnpm lead:payment-compliance-recovery",
        "pnpm lead:blocker-brief",
        "pnpm lead:ops && pnpm lead:report",
      ],
      stop_rule: "Do not upload Marketplace, post Community, submit directories, or push checkout-heavy traffic until payment compliance recovery allows promotion.",
    },
    {
      title: "2. Preflight before a public action",
      status: "must_run_first",
      confirmation: "",
      objective: "Keep traffic measurable before any external upload, post, or form submission.",
      proof: [
        `Current plugin zip: ${data.zip.absolute}`,
        `Current zip sha256: ${data.zip.sha256}`,
        `Deploy state: ${data.deploy.status}`,
        `Tracking freshness: ${data.tracking.status}`,
        `Netlify recovery: ${data.netlify_recovery.status}`,
      ],
      commands: [
        "pnpm lead:marketplace-preflight",
        "pnpm release:plugin-check",
        "pnpm lead:site-check",
        "pnpm lead:tracking-freshness",
        "pnpm lead:netlify-recovery",
        "pnpm lead:netlify-apply -- --dry-run",
        "pnpm lead:cloudflare-recovery",
        "pnpm lead:cloudflare-apply -- --dry-run",
        "pnpm lead:payment-compliance-recovery",
        "pnpm lead:marketplace-review",
        "pnpm lead:marketplace-public -- --record",
        "pnpm lead:marketplace-postflight",
        "pnpm lead:community-preflight",
        "pnpm lead:community-brief",
        "pnpm lead:public-preflight",
        "pnpm lead:next-public-actions",
      ],
      stop_rule: "If plugin-check or site-check fails, stop before uploading or posting. If tracking freshness is stale, Marketplace upload can proceed when its preflight allows, but pause broad Community and directory traffic until a fresh deploy passes strict mode.",
    },
    {
      title: "3. Marketplace upload",
      status: data.marketplace.status,
      confirmation: "确认上传 plugin.zip 到 Framer Marketplace",
      objective: "Make the current checkout-tracking plugin package publicly available before judging traffic channels.",
      proof: [
        "Framer New Version upload confirmation",
        "Creator Space users/opens baseline before upload",
        "Creator Space users, opens, version, and updated timestamp",
        "Public Marketplace listing snapshot",
        "Marketplace postflight and Community preflight status",
        "Same-day, 24h, 48h, and 7d action-review status",
      ],
      commands: [
        "pnpm lead:marketplace-preflight",
        data.marketplace.baseline_command,
        data.marketplace.done_command,
        data.marketplace.snapshot_command,
        "pnpm lead:marketplace-public -- --record",
        "pnpm lead:marketplace-review",
        "pnpm lead:events && pnpm lead:forms",
        "pnpm lead:marketplace-postflight",
        "pnpm lead:community-preflight",
        "pnpm lead:community-brief",
        "pnpm lead:action-review && pnpm lead:ops",
      ],
      stop_rule: "Record the upload and a Marketplace snapshot before publishing Community or directory traffic; treat version/update change as upload proof, not traction unless users, opens, CTA events, forms, or revenue move.",
    },
    {
      title: "4. Framer Community one-post test",
      status: data.community.preflight_publish_allowed
        ? "ready_after_confirmation"
        : data.community.posts.length
          ? "blocked_by_preflight"
          : "missing_post",
      confirmation: "确认发布 Framer Community 第一条帖子",
      objective: "Test whether the Feed creates comments, DMs, CTA clicks, form submissions, or Marketplace lift.",
      proof: [
        "Published Framer Community URL",
        `Priority 1 primary link: ${communityPriority?.primary_link || "unknown"}`,
        communityPriority?.primary_link === "marketplace"
          ? "First URL points to the Framer Marketplace plugin listing."
          : "First URL follows the selected Community kit strategy.",
        "Creator Space users/opens baseline before Community post",
        "Visible comments, DMs, opportunities, and revenue events entered manually during review",
        "UTM CTA events, forms, Marketplace users/opens movement, CRM opportunities, and revenue ledger movement",
        "24h, 48h, and 72h Community review verdicts",
      ],
      commands: [
        "pnpm lead:marketplace-postflight",
        data.marketplace.community_baseline_command,
        "pnpm lead:community-preflight",
        "pnpm lead:community-lint",
        "pnpm lead:community-brief",
        communityPriority?.command || "pnpm lead:community-record -- --priority 1 --url '<published-framer-community-url>'",
        "pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events>",
        "pnpm lead:community-review -- --today <post-date-plus-3-days> --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events>",
        "pnpm lead:events && pnpm lead:forms && pnpm lead:action-review && pnpm lead:ops",
      ],
      stop_rule: "Do not publish until Community preflight allows it. If 48 hours have zero comments, DMs, CTA events, forms, and Marketplace lift, rewrite the hook before posting priority 2. If 72 hours still has no qualified signal, deprioritize Community behind Marketplace, directories, and partner/resource channels.",
    },
    {
      title: "5. Directory test",
      status: directoryTarget ? "ready_after_confirmation" : "missing_target",
      confirmation: "确认提交 Frameplate / All Framer 目录表单",
      objective: "Try one long-lived Framer directory surface without losing attribution.",
      proof: [
        "Submission confirmation, screenshot, accepted listing URL, or directory-owner reply",
        "Directory-sourced CTA event, form submission, or Marketplace lift",
      ],
      commands: [
        directoryTarget?.command || "pnpm lead:directory-record -- --campaign '<campaign>' --evidence '<submission-confirmation-or-screenshot>'",
        "pnpm lead:directory-review",
        "pnpm lead:events && pnpm lead:forms && pnpm lead:action-review && pnpm lead:ops",
      ],
      stop_rule: "Submit one directory first; do not broaden if 7 and 14 day checks show no listing, reply, CTA, form, or Marketplace signal.",
    },
    {
      title: "6. Measurement loop",
      status: "always_on",
      confirmation: "",
      objective: "Convert any signal into a follow-up, audit, service opportunity, or revenue ledger entry.",
      proof: [
        "New Gmail replies, bounces, unsubscribes, or payment receipts",
        `Creem monitor status: ${data.revenue_monitor.status}`,
        `New Polyglot Creem transactions: ${data.revenue_monitor.new_polyglot_transactions.length}`,
        `Baseline Polyglot Creem transactions to review: ${data.revenue_monitor.baseline_polyglot_transactions.length}`,
        "Netlify CTA events and form submissions",
        "Marketplace snapshot deltas",
      ],
      commands: reviewLoop,
      stop_rule: "Do not expand new cold Day 0 email while replies, CTA events, forms, public proof, and revenue remain zero.",
    },
  ];
}

function renderHtml(data) {
  const title = "Polyglot AEO Launch Console";
  const marketplacePrepCommands = [
    "pnpm lead:marketplace-preflight",
    "pnpm release:plugin-check",
    "pnpm release:marketplace-brief",
    data.marketplace.baseline_command,
    "pnpm lead:marketplace-public -- --record",
  ].join("\n");
  const marketplaceFallbackAfterCommands = [
    data.marketplace.done_command,
    data.marketplace.snapshot_command,
    "pnpm lead:marketplace-public -- --record",
    "pnpm lead:marketplace-review",
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:marketplace-postflight",
    "pnpm lead:community-preflight",
    "pnpm lead:action-review && pnpm lead:channel-priority",
    "pnpm lead:ops && pnpm lead:report",
  ].join("\n");
  const marketplaceAfterCommands =
    codeBlockFromMarkdown(data.marketplace.after_submit) || marketplaceFallbackAfterCommands;
  const communityCommands = [
    "pnpm lead:marketplace-postflight",
    data.marketplace.community_baseline_command,
    "pnpm lead:community-preflight",
    "pnpm lead:community-lint",
    "pnpm lead:community-brief",
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:tracking-freshness -- --strict",
    "pnpm lead:deploy-review",
    "pnpm lead:community-review",
    "pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events>",
    "pnpm lead:community-review -- --today <post-date-plus-3-days> --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events>",
    "pnpm lead:distribution-review",
    "pnpm lead:directory-review",
    "pnpm lead:next-public-actions",
    "pnpm lead:gate",
    "pnpm lead:ops",
  ].join("\n");
  const deployCommands = [
    "pnpm lead:site-check",
    "pnpm lead:tracking-freshness",
    "pnpm lead:netlify-recovery",
    "pnpm lead:netlify-apply -- --dry-run",
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:deploy-review",
    "pnpm lead:ops",
    "# after Netlify credits are restored:",
    "pnpm lead:netlify-apply -- --confirm '确认部署 polyglotaeo-web 到 Netlify'",
  ].join("\n");
  const directoryCommands = [
    "pnpm lead:tracking-freshness -- --strict",
    "pnpm lead:directory-review",
    ...data.directory.targets
      .filter((target) => target.review_status === "needs_confirmation" || target.kit_status === "manual_confirmation_required")
      .map((target) => target.command),
    "pnpm lead:forms && pnpm lead:events && pnpm lead:tracking-freshness && pnpm lead:directory-review && pnpm lead:ops",
  ].join("\n");
  const directoryFields = data.directory.field_values
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  const runbookCommands = data.acquisition_runbook
    .flatMap((step) => step.commands || [])
    .filter(Boolean)
    .join("\n");
  const revenueMonitorCommands = data.revenue_monitor.command_block || "pnpm lead:creem-store";
  const revenueLedgerCommands = [
    ...data.revenue_monitor.revenue_commands,
    ...data.revenue_monitor.baseline_review_commands,
  ].join("\n");
  const paymentReadOnlyCommands = data.payment_recovery.read_only_commands.join("\n");
  const paymentConfirmationCommands = data.payment_recovery.confirmation_gated_commands
    .map((group) => [
      `# ${group.label || "Confirmation-gated step"}`,
      `# Confirmation required: ${group.confirmation || "explicit confirmation"}`,
      ...(group.commands || []),
    ].join("\n"))
    .join("\n\n");
  const cloudflarePlan = data.cloudflare_apply.deployment_plan;
  const cloudflarePlanText = cloudflareDeploymentPlanText(data.cloudflare_apply);
  const cloudflareCommands = [
    `# Confirmation required: ${data.cloudflare_apply.confirmation_required}`,
    ...data.cloudflare_apply.planned_commands,
  ].join("\n");
  const paymentPhases = data.payment_recovery.phases.length
    ? data.payment_recovery.phases
        .map((phase) => `${phase.label || phase.id}: ${phase.status || "unknown"} — ${phase.next_action || ""}`)
        .join("\n")
    : "Run pnpm lead:payment-compliance-recovery";
  const decisionQueueCommands = data.blocker.decision_queue
    .map((item) => [`# ${item.title || item.kind || "Decision queue item"}`, item.command || ""].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --ink: #15171a;
      --muted: #5d6673;
      --line: #d9dee7;
      --panel: #ffffff;
      --accent: #0f766e;
      --warn: #9a3412;
      --code: #111827;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 44px;
    }
    header {
      display: grid;
      gap: 10px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
      letter-spacing: 0;
    }
    h3 {
      margin: 0 0 8px;
      font-size: 16px;
      letter-spacing: 0;
    }
    p { margin: 0 0 10px; }
    a { color: var(--accent); }
    .meta {
      color: var(--muted);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 14px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 9px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }
    .status.warn {
      color: var(--warn);
      border-color: #fed7aa;
      background: #fff7ed;
    }
    .status.ready {
      color: var(--accent);
      border-color: #99f6e4;
      background: #f0fdfa;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 10px 0 0;
    }
    .button {
      appearance: none;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      min-height: 34px;
      padding: 6px 10px;
    }
    .button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .button:focus-visible {
      outline: 3px solid #99f6e4;
      outline-offset: 2px;
    }
    pre {
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--code);
      color: #f8fafc;
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0 0;
      font-size: 13px;
    }
    .post {
      display: grid;
      gap: 8px;
      border-top: 1px solid var(--line);
      padding-top: 14px;
      margin-top: 14px;
    }
    .post:first-of-type {
      border-top: 0;
      padding-top: 0;
      margin-top: 0;
    }
    .kv {
      display: grid;
      grid-template-columns: 120px minmax(0, 1fr);
      gap: 8px;
      font-size: 14px;
      margin: 4px 0;
    }
    .kv span:first-child { color: var(--muted); }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 0;
      font-size: 14px;
    }
    th, td {
      border-top: 1px solid var(--line);
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; }
    .runbook {
      display: grid;
      gap: 12px;
    }
    .runbook-step {
      border-top: 1px solid var(--line);
      padding-top: 14px;
    }
    .runbook-step:first-child {
      border-top: 0;
      padding-top: 0;
    }
    .runbook-step ul {
      margin: 8px 0 0;
      padding-left: 20px;
    }
    .runbook-step li {
      margin: 3px 0;
    }
    .lock {
      color: var(--warn);
      font-weight: 700;
    }
    @media (max-width: 760px) {
      main { width: min(100% - 20px, 1120px); padding-top: 18px; }
      .grid { grid-template-columns: 1fr; }
      .kv { grid-template-columns: 1fr; gap: 2px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Generated ${escapeHtml(data.generated_at)}. Use this page to execute and record the external actions that currently block traction.</div>
    </header>

    <section>
      <h2>Decision Queue</h2>
      <p class="meta">${escapeHtml(data.blocker.recommendation || "Refresh blocker brief before taking an external action.")}</p>
      <div class="row">
        <span class="status ${data.blocker.status === "confirmation_needed" ? "warn" : "ready"}">${escapeHtml(data.blocker.status)}</span>
        ${data.blocker.next_confirmation ? `<span class="status warn">${escapeHtml(data.blocker.next_confirmation)}</span>` : ""}
        <button class="button" data-copy="${escapeAttr(decisionQueueCommands)}">Copy Decision Queue Commands</button>
      </div>
      ${renderDecisionQueue(data.blocker.decision_queue)}
      ${decisionQueueCommands ? `<pre>${escapeHtml(decisionQueueCommands)}</pre>` : ""}
      ${renderList("Blocker Stop Rules", data.blocker.stop_rules)}
    </section>

    <section>
      <h2>Acquisition Runbook</h2>
      <p class="meta">Follow this order so every public action has evidence, attribution, a review window, and a stop rule.</p>
      <div class="row">
        <button class="button" data-copy="${escapeAttr(runbookCommands)}">Copy Runbook Commands</button>
      </div>
      <div class="runbook">
        ${data.acquisition_runbook.map(renderRunbookStep).join("\n")}
      </div>
    </section>

    <div class="grid">
      <section>
        <h2>Payment Recovery</h2>
        <span class="status ${data.payment_recovery.promotion_allowed ? "ready" : "warn"}">${escapeHtml(data.payment_recovery.status)}</span>
        <p class="meta">${escapeHtml(data.payment_recovery.recommendation)}</p>
        <div class="kv"><span>Creem</span><span>${escapeHtml(data.payment_recovery.creem_status)}</span></div>
        <div class="kv"><span>Deadline</span><span>${escapeHtml(data.payment_recovery.creem_deadline_text || "none")}</span></div>
        <div class="kv"><span>Promotion</span><span>${escapeHtml(data.payment_recovery.promotion_allowed === null ? "unknown" : data.payment_recovery.promotion_allowed ? "allowed" : "blocked")}</span></div>
        <div class="kv"><span>Marketplace</span><span>${escapeHtml(data.payment_recovery.marketplace_upload_allowed === null ? "unknown" : data.payment_recovery.marketplace_upload_allowed ? "upload allowed" : "upload blocked")}</span></div>
        <pre>${escapeHtml(paymentPhases)}</pre>
        ${data.payment_recovery.blockers.length ? `<p class="meta">${escapeHtml(`Blockers: ${data.payment_recovery.blockers.slice(0, 6).join("; ")}`)}</p>` : ""}
        ${data.payment_recovery.creem_recommendation ? `<p class="meta">${escapeHtml(`Creem: ${data.payment_recovery.creem_recommendation}`)}</p>` : ""}
        <div class="post">
          <h3>Cloudflare Deploy Plan</h3>
          <span class="status ${data.cloudflare_apply.deploy_allowed ? "ready" : "warn"}">${escapeHtml(data.cloudflare_apply.status)}</span>
          <p class="meta">${escapeHtml(data.cloudflare_apply.recommendation)}</p>
          <div class="kv"><span>Confirmation</span><span>${escapeHtml(data.cloudflare_apply.confirmation_required)}</span></div>
          <div class="kv"><span>Worker</span><span>${escapeHtml(cloudflarePlan.worker_name || "unknown")}</span></div>
          <div class="kv"><span>Config</span><span>${escapeHtml(cloudflarePlan.wrangler_file)}</span></div>
          <div class="kv"><span>Custom domain</span><span>${escapeHtml(cloudflarePlan.custom_domains.map((route) => route.pattern).filter(Boolean).join(", ") || cloudflarePlan.target_origin)}</span></div>
          <div class="kv"><span>Health</span><span>${escapeHtml(cloudflarePlan.health_url)}</span></div>
          <div class="kv"><span>Secrets</span><span>${escapeHtml(cloudflarePlan.missing_secrets.length ? `missing ${cloudflarePlan.missing_secrets.join(", ")}` : "required secrets present")}</span></div>
          <div class="kv"><span>Latest deploy</span><span>${escapeHtml(cloudflarePlan.latest_deployment_id ? `${cloudflarePlan.latest_deployment_id}${cloudflarePlan.latest_deployment_created_on ? ` (${cloudflarePlan.latest_deployment_created_on})` : ""}` : "unknown")}</span></div>
          <div class="row">
            <button class="button" data-copy="${escapeAttr(cloudflarePlanText)}">Copy Deploy Plan</button>
            <button class="button" data-copy="${escapeAttr(cloudflareCommands)}">Copy Cloudflare Commands</button>
          </div>
          <pre>${escapeHtml(cloudflarePlanText)}</pre>
        </div>
        <div class="row">
          <button class="button" data-copy="${escapeAttr(paymentReadOnlyCommands)}">Copy Read-Only Checks</button>
          <button class="button" data-copy="${escapeAttr(paymentConfirmationCommands)}">Copy Confirmation-Gated Commands</button>
          ${data.payment_recovery.creem_support_draft ? `<button class="button" data-copy="${escapeAttr(data.payment_recovery.creem_support_draft)}">Copy Creem Support Draft</button>` : ""}
          ${data.payment_recovery.creem_closure_draft ? `<button class="button" data-copy="${escapeAttr(data.payment_recovery.creem_closure_draft)}">Copy Creem Closure Draft</button>` : ""}
        </div>
        <pre>${escapeHtml(paymentReadOnlyCommands)}</pre>
        ${data.payment_recovery.creem_support_draft ? `<h3>Creem Support Draft</h3><pre>${escapeHtml(data.payment_recovery.creem_support_draft)}</pre>` : ""}
      </section>

      <section>
        <h2>Marketplace Upload</h2>
        <span class="status ${data.marketplace.status === "marketplace_changed" ? "ready" : "warn"}">${escapeHtml(data.marketplace.status)}</span>
        <p class="meta">${escapeHtml(data.marketplace.recommendation)}</p>
        <div class="kv"><span>Preflight</span><span>${escapeHtml(`${data.marketplace.preflight_verdict} (${data.marketplace.upload_allowed === null ? "unknown" : `upload allowed ${data.marketplace.upload_allowed ? "yes" : "no"}`})`)}</span></div>
        <div class="kv"><span>Package</span><span>${escapeHtml(data.zip.absolute)}</span></div>
        <div class="kv"><span>SHA256</span><span>${escapeHtml(data.zip.sha256)}</span></div>
        <div class="kv"><span>Preflight SHA</span><span>${escapeHtml(data.marketplace.preflight_sha256 || "missing")}</span></div>
        <div class="kv"><span>Public listing</span><span>${escapeHtml(`${data.marketplace.public_readable === null ? "unknown" : data.marketplace.public_readable ? "readable" : "not readable"}; likes ${data.marketplace.public_likes ?? "?"}; comments ${data.marketplace.public_comments ?? "?"}`)}</span></div>
        <div class="kv"><span>Postflight</span><span>${escapeHtml(`${data.marketplace.postflight_status}${data.marketplace.postflight_complete === null ? "" : ` (complete ${data.marketplace.postflight_complete ? "yes" : "no"})`}`)}</span></div>
        <div class="kv"><span>Baseline</span><span>${escapeHtml("Capture Creator Space users/opens before upload and again after upload.")}</span></div>
        <div class="kv"><span>Brief</span><span>${escapeHtml(data.marketplace.brief_path || "Run pnpm release:marketplace-brief")}</span></div>
        ${data.marketplace.preflight_blockers.length ? `<p class="meta">${escapeHtml(`Preflight blockers: ${data.marketplace.preflight_blockers.join("; ")}`)}</p>` : ""}
        ${data.marketplace.postflight_recommendation ? `<p class="meta">${escapeHtml(`Postflight: ${data.marketplace.postflight_recommendation}`)}</p>` : ""}
        ${data.marketplace.postflight_missing.length ? `<p class="meta">${escapeHtml(`Postflight missing: ${data.marketplace.postflight_missing.join("; ")}`)}</p>` : ""}
        <div class="row">
          <a class="button primary" href="${escapeAttr(data.marketplace_url)}" target="_blank" rel="noreferrer">Open Marketplace</a>
          <button class="button" data-copy="${escapeAttr(data.zip.absolute)}">Copy Zip Path</button>
          <button class="button" data-copy="${escapeAttr(data.marketplace.changes)}">Copy Changes</button>
          <button class="button" data-copy="${escapeAttr(marketplacePrepCommands)}">Copy Prep Commands</button>
          <button class="button" data-copy="${escapeAttr(marketplaceAfterCommands)}">Copy After-Submit Commands</button>
          <button class="button" data-copy="${escapeAttr(data.marketplace.brief)}">Copy Marketplace Brief</button>
        </div>
        <pre>${escapeHtml(marketplacePrepCommands)}</pre>
        <h3>Changes</h3>
        <pre>${escapeHtml(data.marketplace.changes || "Run pnpm release:marketplace-brief to refresh the Marketplace Changes text.")}</pre>
        <h3>Upload Path</h3>
        <pre>${escapeHtml(data.marketplace.browser_path || "Run pnpm release:marketplace-brief to refresh the Marketplace browser path.")}</pre>
        <h3>After Submit</h3>
        <pre>${escapeHtml(marketplaceAfterCommands)}</pre>
      </section>

      <section>
        <h2>Revenue Monitor</h2>
        <span class="status ${data.revenue_monitor.new_polyglot_transactions.length ? "ready" : data.revenue_monitor.status === "missing_api_key" || data.revenue_monitor.status === "fetch_failed" || data.revenue_monitor.status === "missing" ? "warn" : "ready"}">${escapeHtml(data.revenue_monitor.status)}</span>
        <p class="meta">${escapeHtml(data.revenue_monitor.recommendation)}</p>
        <div class="kv"><span>Mode</span><span>${escapeHtml(data.revenue_monitor.mode)}</span></div>
        <div class="kv"><span>API key</span><span>${escapeHtml(`${data.revenue_monitor.api_key_env} (${data.revenue_monitor.key_present === null ? "unknown" : data.revenue_monitor.key_present ? "present" : "missing"})`)}</span></div>
        <div class="kv"><span>Transactions</span><span>${escapeHtml(`${data.revenue_monitor.transactions_returned} returned; ${data.revenue_monitor.new_transactions.length} new`)}</span></div>
        <div class="kv"><span>Polyglot</span><span>${escapeHtml(`${data.revenue_monitor.new_polyglot_transactions.length} new transaction(s)`)}</span></div>
        <div class="kv"><span>Baseline</span><span>${escapeHtml(`${data.revenue_monitor.baseline_polyglot_transactions.length} Polyglot transaction(s) to review`)}</span></div>
        <div class="kv"><span>Ledger commands</span><span>${escapeHtml(String(data.revenue_monitor.revenue_commands.length))}</span></div>
        <div class="kv"><span>Baseline commands</span><span>${escapeHtml(String(data.revenue_monitor.baseline_review_commands.length))}</span></div>
        ${renderRevenueTransactions(data.revenue_monitor.new_polyglot_transactions)}
        ${renderRevenueTransactions(data.revenue_monitor.baseline_polyglot_transactions, "No baseline Polyglot transactions are waiting for revenue-ledger review.")}
        <div class="row">
          <button class="button" data-copy="${escapeAttr(revenueMonitorCommands)}">Copy Monitor Commands</button>
          ${revenueLedgerCommands ? `<button class="button" data-copy="${escapeAttr(revenueLedgerCommands)}">Copy Revenue Commands</button>` : ""}
        </div>
        <pre>${escapeHtml(revenueMonitorCommands)}</pre>
      </section>

      <section>
        <h2>Public Distribution</h2>
        <span class="status ${data.distribution.priority_posted >= data.distribution.priority_posts ? "ready" : "warn"}">${escapeHtml(`${data.distribution.priority_posted}/${data.distribution.priority_posts} priority posts`)}</span>
        <p class="meta">${escapeHtml(data.distribution.recommendation)}</p>
        <div class="row">
          <button class="button" data-copy="${escapeAttr(data.distribution.posts.map((post) => post.command).join("\n"))}">Copy Record Commands</button>
          <button class="button" data-copy="${escapeAttr(data.review_commands.join("\n"))}">Copy Review Commands</button>
        </div>
        <pre>${escapeHtml(data.review_commands.join("\n"))}</pre>
      </section>

      <section>
        <h2>Deploy Status</h2>
        <span class="status ${data.deploy.status.includes("blocked") ? "warn" : "ready"}">${escapeHtml(data.deploy.status)}</span>
        <p class="meta">${escapeHtml(data.deploy.recommendation)}</p>
        <div class="kv"><span>Site check</span><span>${escapeHtml(data.deploy.production_site_check)}</span></div>
        <div class="kv"><span>Netlify deploys</span><span>${escapeHtml(data.deploy.netlify_new_deploys)}</span></div>
        <div class="kv"><span>Deploy ID</span><span>${escapeHtml(data.deploy.latest_production_deploy_id || "unknown")}</span></div>
        <div class="kv"><span>Tracking freshness</span><span>${escapeHtml(data.tracking.status)}</span></div>
        <div class="kv"><span>Missing tracking proof</span><span>${escapeHtml(data.tracking.missing_required_count)}</span></div>
        <p class="meta">${escapeHtml(data.tracking.recommendation)}</p>
        <div class="kv"><span>Netlify recovery</span><span>${escapeHtml(data.netlify_recovery.status)}</span></div>
        <div class="kv"><span>Latest deploy</span><span>${escapeHtml(data.netlify_recovery.latest_deploy_id || "unknown")}</span></div>
        <p class="meta">${escapeHtml(data.netlify_recovery.recommendation)}</p>
        <div class="row">
          <button class="button" data-copy="${escapeAttr(deployCommands)}">Copy Deploy Review Commands</button>
        </div>
        <pre>${escapeHtml(deployCommands)}</pre>
      </section>
    </div>

    <section>
      <h2>Framer Community Feed</h2>
      <p class="meta">Use this version for ${escapeHtml(data.community.feed)}. It is question-first and lighter on plugin promotion than the generic social copy.</p>
      <div class="row">
        <span class="status ${data.community.preflight_publish_allowed ? "ready" : "warn"}">${escapeHtml(`preflight ${data.community.preflight_verdict}`)}</span>
        <span class="status ${data.community.preflight_publish_allowed ? "ready" : "warn"}">${escapeHtml(`publish allowed ${data.community.preflight_publish_allowed ? "yes" : "no"}`)}</span>
      </div>
      ${data.community.preflight_recommendation ? `<p class="meta">${escapeHtml(data.community.preflight_recommendation)}</p>` : ""}
      ${data.community.preflight_blockers.length ? `<p class="meta">${escapeHtml(`Blockers: ${data.community.preflight_blockers.join("; ")}`)}</p>` : ""}
      <p class="meta">Run the lint command before publishing. After publishing, record the URL with the matching command, then run the review commands after 24 hours and again after 48 hours. Fill comments, DMs, opportunities, and revenue events manually if the thread creates visible sales signal that Netlify cannot track.</p>
      <p class="meta">If priority 1 is Marketplace-native, capture a Creator Space users/opens snapshot immediately before publishing so Community lift can be measured without relying on stale website attribution.</p>
      <div class="row">
        <a class="button primary" href="${escapeAttr(data.community.feed)}" target="_blank" rel="noreferrer">Open Community Feed</a>
        <button class="button" data-copy="${escapeAttr(data.community.posts.map((post) => post.command).join("\n"))}">Copy Community Record Commands</button>
        <button class="button" data-copy="${escapeAttr(communityCommands)}">Copy Community Review Commands</button>
      </div>
      ${data.community.posts.map(renderPost).join("\n")}
      ${renderList("Community Guardrails", data.community.guardrails)}
      ${renderList("Community Measurement", data.community.measurement)}
    </section>

    <section>
      <h2>Directory Submission</h2>
      <p class="meta">${escapeHtml(data.directory.recommendation)}</p>
      <div class="row">
        <button class="button" data-copy="${escapeAttr(directoryFields)}">Copy Directory Fields</button>
        <button class="button" data-copy="${escapeAttr(directoryCommands)}">Copy Directory Commands</button>
      </div>
      <pre>${escapeHtml(directoryFields)}</pre>
      ${data.directory.targets.map(renderDirectoryTarget).join("\n")}
      ${renderList("Directory Guardrails", data.directory.guardrails)}
    </section>

    <section>
      <h2>Generic Priority Posts</h2>
      ${data.distribution.posts.map(renderPost).join("\n")}
    </section>
  </main>
  <script>
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-copy]");
      if (!button) return;
      const text = button.getAttribute("data-copy") || "";
      await navigator.clipboard.writeText(text);
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = original; }, 1200);
    });
  </script>
</body>
</html>
`;
}

function renderRunbookStep(step) {
  const commands = (step.commands || []).filter(Boolean).join("\n");
  return `<div class="runbook-step">
  <h3>${escapeHtml(step.title)}</h3>
  <div class="row">
    <span class="status ${step.status === "always_on" || step.status === "marketplace_changed" ? "ready" : "warn"}">${escapeHtml(step.status)}</span>
    ${step.confirmation ? `<span class="status warn">${escapeHtml(step.confirmation)}</span>` : ""}
    <button class="button" data-copy="${escapeAttr(commands)}">Copy Step Commands</button>
  </div>
  <p>${escapeHtml(step.objective)}</p>
  ${renderInlineList("Proof", step.proof)}
  <pre>${escapeHtml(commands)}</pre>
  <p class="lock">${escapeHtml(step.stop_rule)}</p>
</div>`;
}

function renderDecisionQueue(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return `<p class="meta">${escapeHtml("No decision queue is available. Run pnpm lead:blocker-brief first.")}</p>`;
  }
  const body = rows
    .map((row) => `<tr>
      <td>${escapeHtml(row.kind || "")}</td>
      <td>${escapeHtml(row.status || "")}</td>
      <td>${escapeHtml(row.due || "")}</td>
      <td>${escapeHtml(row.title || "")}</td>
      <td>${escapeHtml(row.confirmation || "")}</td>
    </tr>`)
    .join("\n");
  return `<table>
    <thead><tr><th>Kind</th><th>Status</th><th>Due</th><th>Action</th><th>Confirmation</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderRevenueTransactions(rows, emptyText = "No new Polyglot transactions are waiting for revenue-ledger confirmation.") {
  if (!Array.isArray(rows) || !rows.length) {
    return `<p class="meta">${escapeHtml(emptyText)}</p>`;
  }
  const body = rows
    .slice(0, 8)
    .map((row) => `<tr>
      <td>${escapeHtml(row.created_at || "")}</td>
      <td>${escapeHtml(row.product || "")}</td>
      <td>${escapeHtml(`${row.amount_usd || row.amount_raw || ""} ${row.currency || ""}`.trim())}</td>
      <td>${escapeHtml(row.customer_redacted || "")}</td>
      <td>${escapeHtml(row.evidence_id || "")}</td>
    </tr>`)
    .join("\n");
  return `<table>
    <thead><tr><th>Created</th><th>Product</th><th>Amount</th><th>Customer</th><th>Evidence</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderPost(post) {
  return `<div class="post">
  <h3>${escapeHtml(post.priority)}. ${escapeHtml(post.title)}</h3>
  <div class="kv"><span>Campaign</span><span>${escapeHtml(post.campaign)}</span></div>
  <div class="kv"><span>Primary link</span><span>${escapeHtml(post.primary_link || "unspecified")}</span></div>
  <div class="kv"><span>Visual</span><span>${escapeHtml(post.visual_asset?.file || "none")}</span></div>
  <div class="row">
    <button class="button" data-copy="${escapeAttr(post.body)}">Copy Post</button>
    <button class="button" data-copy="${escapeAttr(post.command)}">Copy Record Command</button>
  </div>
  <pre>${escapeHtml(post.body)}</pre>
  <pre>${escapeHtml(post.command)}</pre>
</div>`;
}

function renderDirectoryTarget(target) {
  const status = target.review_status || target.kit_status || "unknown";
  const ready = status === "form_submitted" || status === "email_pitch_sent";
  return `<div class="post">
  <h3>${escapeHtml(target.priority)}. ${escapeHtml(target.name)}</h3>
  <span class="status ${ready ? "ready" : "warn"}">${escapeHtml(status)}</span>
  <div class="kv"><span>Channel</span><span>${escapeHtml(target.channel)}</span></div>
  <div class="kv"><span>Campaign</span><span>${escapeHtml(target.campaign)}</span></div>
  <div class="kv"><span>Action</span><span>${escapeHtml(target.action)}</span></div>
  <div class="row">
    <a class="button primary" href="${escapeAttr(target.submit_url)}" target="_blank" rel="noreferrer">Open Submit Page</a>
    <button class="button" data-copy="${escapeAttr(target.command)}">Copy Record Command</button>
  </div>
  <pre>${escapeHtml(target.command)}</pre>
</div>`;
}

function renderInlineList(title, items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";
  return `<div class="meta">${escapeHtml(title)}</div>
  <ul>
    ${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n    ")}
  </ul>`;
}

function renderList(title, items) {
  if (!items.length) return "";
  return `<div class="post">
  <h3>${escapeHtml(title)}</h3>
  <ul>
    ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n    ")}
  </ul>
</div>`;
}

function cloudflareDeploymentPlanText(cloudflareApply) {
  const plan = cloudflareApply.deployment_plan || {};
  const domains = Array.isArray(plan.custom_domains)
    ? plan.custom_domains.map((route) => `${route.pattern || "unknown"} (${route.custom_domain ? "custom domain" : "route"})`).join(", ")
    : "";
  return [
    `Status: ${cloudflareApply.status}`,
    `Deploy allowed: ${cloudflareApply.deploy_allowed === null ? "unknown" : cloudflareApply.deploy_allowed ? "yes" : "no"}`,
    `Confirmation required: ${cloudflareApply.confirmation_required}`,
    `Worker: ${plan.worker_name || "unknown"}`,
    `Wrangler dir: ${plan.wrangler_dir || "unknown"}`,
    `Wrangler config: ${plan.wrangler_file || "unknown"}`,
    `Entry: ${plan.main || "unknown"}`,
    `Target origin: ${plan.target_origin || "unknown"}`,
    `Custom domains: ${domains || "unknown"}`,
    `Health URL: ${plan.health_url || "unknown"}`,
    `Required secrets: ${(plan.required_secrets || []).join(", ") || "unknown"}`,
    `Missing secrets: ${(plan.missing_secrets || []).join(", ") || "none"}`,
    `Latest deployment: ${plan.latest_deployment_id || "unknown"}${plan.latest_deployment_created_on ? ` (${plan.latest_deployment_created_on})` : ""}`,
    "",
    "Deploy command:",
    plan.deploy_command || "pnpm lead:cloudflare-apply -- --confirm '确认部署 Cloudflare Worker custom domain'",
    "",
    "Post-deploy checks:",
    ...cloudflareApply.planned_commands,
  ].join("\n");
}

function codeBlockFromMarkdown(text) {
  const match = String(text || "").match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : "";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
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

  const [
    kit,
    communityKit,
    directoryKit,
    creemStore,
    distributionReview,
    directoryReview,
    marketplaceReview,
    marketplacePreflight,
    marketplacePublic,
    marketplacePostflight,
    marketplaceBriefText,
    communityPreflight,
    deployReview,
    trackingFreshness,
    netlifyRecovery,
    paymentComplianceRecovery,
    cloudflareApply,
    creemCompliance,
    blockerBrief,
    zip,
  ] = await Promise.all([
    readJson(args.kit, { posts: [] }),
    readJson(args.communityKit, { posts: [] }),
    readJson(args.directoryKit, { targets: [], field_values: [] }),
    readJson(args.creemStore, null),
    readJson(args.distributionReview, null),
    readJson(args.directoryReview, null),
    readJson(args.marketplaceReview, null),
    readJson(args.marketplacePreflight, null),
    readJson(args.marketplacePublic, null),
    readJson(args.marketplacePostflight, null),
    readText(args.marketplaceBrief),
    readJson(args.communityPreflight, null),
    readJson(args.deployReview, null),
    readJson(args.trackingFreshness, null),
    readJson(args.netlifyRecovery, null),
    readJson(args.paymentComplianceRecovery, null),
    readJson(args.cloudflareApply, null),
    readJson(args.creemCompliance, null),
    readJson(args.blockerBrief, null),
    zipInfo(args.pluginZip),
  ]);

  const data = buildConsole({
    kit,
    communityKit,
    directoryKit,
    creemStore,
    distributionReview,
    directoryReview,
    marketplaceReview,
    marketplacePreflight,
    marketplacePublic,
    marketplacePostflight,
    marketplaceBrief: {
      path: args.marketplaceBrief,
      text: marketplaceBriefText,
    },
    communityPreflight,
    deployReview,
    trackingFreshness,
    netlifyRecovery,
    paymentComplianceRecovery,
    cloudflareApply,
    creemCompliance,
    blockerBrief,
    zip,
  });
  await writeText(args.output, renderHtml(data));
  await writeText(args.json, `${JSON.stringify(data, null, 2)}\n`);
  process.stdout.write(`Launch console: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
