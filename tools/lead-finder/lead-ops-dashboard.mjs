#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { openComplianceWarningsForScope } from "./compliance-scope.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_CREEM_STORE = ".tmp/framer-creem-store-monitor.json";
const DEFAULT_GMAIL_QUEUE = ".tmp/framer-queued-gmail-queue.json";
const DEFAULT_TODAY_PLAN = ".tmp/framer-today.json";
const DEFAULT_DAY3_READINESS = ".tmp/framer-day3-readiness.json";
const DEFAULT_DAY3_BRIEF = ".tmp/framer-day3-send-brief.json";
const DEFAULT_FOLLOWUP_PREFLIGHT = ".tmp/framer-followup-preflight.json";
const DEFAULT_ACTION_REVIEW = ".tmp/framer-action-review.json";
const DEFAULT_DEPLOY_REVIEW = ".tmp/framer-deploy-review.json";
const DEFAULT_TRACKING_FRESHNESS = ".tmp/framer-tracking-freshness.json";
const DEFAULT_LOCAL_TRACKING_FRESHNESS = ".tmp/framer-local-tracking-freshness.json";
const DEFAULT_CHECKOUT_ORIGIN = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_PAYMENT_COMPLIANCE_RECOVERY = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_BLOCKER_BRIEF = ".tmp/framer-blocker-resolution-brief.json";
const DEFAULT_NETLIFY_RECOVERY = ".tmp/framer-netlify-recovery.json";
const DEFAULT_DISTRIBUTION_REVIEW = ".tmp/framer-distribution-review.json";
const DEFAULT_COMMUNITY_REVIEW = ".tmp/framer-community-review.json";
const DEFAULT_COMMUNITY_PREFLIGHT = ".tmp/framer-community-preflight.json";
const DEFAULT_COMMUNITY_BRIEF = ".tmp/framer-community-launch-brief.json";
const DEFAULT_DIRECTORY_REVIEW = ".tmp/framer-directory-review.json";
const DEFAULT_PARTNER_REVIEW = ".tmp/framer-partner-review.json";
const DEFAULT_MARKETPLACE_REVIEW = ".tmp/framer-marketplace-review.json";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_MARKETPLACE_PUBLIC = ".tmp/framer-marketplace-public.json";
const DEFAULT_MARKETPLACE_POSTFLIGHT = ".tmp/framer-marketplace-postflight.json";
const DEFAULT_CHANNEL_PRIORITY = ".tmp/framer-channel-priority.json";
const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_PORTFOLIO_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_ASSET_COVERAGE = ".tmp/framer-asset-coverage.json";
const DEFAULT_PLUGIN_CHANNEL_FIT = ".tmp/framer-plugin-channel-fit.json";
const DEFAULT_CROSS_PROMOTION = ".tmp/framer-cross-promotion-matrix.json";
const DEFAULT_LANDING_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_LANDING_TARGET_DECISION = ".tmp/framer-landing-target-decision.json";
const DEFAULT_LANDING_BASELINE_BRIEF = ".tmp/framer-landing-baseline-brief.json";
const DEFAULT_OWNED_SITE_AUDIT = ".tmp/framer-owned-site-audit.json";
const DEFAULT_OWNED_SITE_CTA_KIT = ".tmp/framer-owned-site-cta-kit.json";
const DEFAULT_OWNED_SITE_IMPLEMENTATION = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_USE_CASE_PAGES = ".tmp/framer-use-case-page-brief.json";
const DEFAULT_CUSTOMER_FEEDBACK = ".tmp/framer-customer-feedback-queue.json";
const DEFAULT_CUSTOMER_FEEDBACK_BRIEF = ".tmp/framer-customer-feedback-brief.json";
const DEFAULT_CUSTOMER_FEEDBACK_REVIEW = ".tmp/framer-customer-feedback-review.json";
const DEFAULT_CONFIRMATION_QUEUE = ".tmp/framer-confirmation-queue.json";
const DEFAULT_EXPERIMENT_DECISION = ".tmp/framer-experiment-decision-brief.json";
const DEFAULT_GOAL_COVERAGE = ".tmp/framer-growth-goal-coverage.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_PLUGIN_ZIP = "plugin.zip";
const DEFAULT_OUTPUT = ".tmp/framer-growth-ops.md";
const UPLOAD_EVIDENCE_PLACEHOLDER = "<framer-upload-confirmation-url-or-screenshot>";
const CREATOR_SPACE_EVIDENCE_PLACEHOLDER = "<creator-space-dashboard-snapshot-or-upload-confirmation>";
const CLOSED_STATUSES = new Set([
  "bounced",
  "unsubscribed",
  "not_fit",
  "no_reply_closed",
  "report_closed",
  "paid_plugin",
  "service_won",
]);
const REPLY_STATUSES = new Set([
  "replied",
  "report_replied",
  "mini_audit_sent",
  "call_booked",
  "installed_free",
  "paid_plugin",
  "service_offer",
  "service_won",
]);
const OPPORTUNITY_STATUSES = new Set([
  "report_replied",
  "call_booked",
  "installed_free",
  "paid_plugin",
  "service_offer",
  "service_won",
]);
const REQUIRED_PLUGIN_MARKERS = [
  "https://polyglotaeo.com/go/checkout/",
  "framer_plugin",
  "plugin_upgrade",
  "utm_content",
  "project_id",
];

function usage() {
  return `
Usage:
  pnpm lead:ops

Options:
  --crm <file>           Local CRM CSV. Default: ${DEFAULT_CRM}
  --revenue <file>       Revenue CSV. Default: ${DEFAULT_REVENUE}
  --events <file>        CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>         Netlify form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --creem-store <file>   Creem API transaction monitor JSON. Default: ${DEFAULT_CREEM_STORE}
  --gmail-queue <file>   Gmail queue JSON. Default: ${DEFAULT_GMAIL_QUEUE}
  --today-plan <file>    Today execution plan JSON. Default: ${DEFAULT_TODAY_PLAN}
  --day3-readiness <file> Day 3 readiness JSON. Default: ${DEFAULT_DAY3_READINESS}
  --day3-brief <file> Day 3 send brief JSON. Default: ${DEFAULT_DAY3_BRIEF}
  --followup-preflight <file> Follow-up pre-send gate JSON. Default: ${DEFAULT_FOLLOWUP_PREFLIGHT}
  --action-review <file> Public action review JSON. Default: ${DEFAULT_ACTION_REVIEW}
  --deploy-review <file> Deploy review JSON. Default: ${DEFAULT_DEPLOY_REVIEW}
  --tracking-freshness <file> Production tracking freshness JSON. Default: ${DEFAULT_TRACKING_FRESHNESS}
  --local-tracking-freshness <file> Local static export tracking freshness JSON. Default: ${DEFAULT_LOCAL_TRACKING_FRESHNESS}
  --checkout-origin <file> Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT_ORIGIN}
  --payment-compliance-recovery <file> Payment compliance recovery JSON. Default: ${DEFAULT_PAYMENT_COMPLIANCE_RECOVERY}
  --blocker-brief <file> Blocker resolution brief JSON. Default: ${DEFAULT_BLOCKER_BRIEF}
  --netlify-recovery <file> Netlify recovery check JSON. Default: ${DEFAULT_NETLIFY_RECOVERY}
  --distribution-review <file> Distribution review JSON. Default: ${DEFAULT_DISTRIBUTION_REVIEW}
  --community-review <file> Community Feed review JSON. Default: ${DEFAULT_COMMUNITY_REVIEW}
  --community-preflight <file> Community publish preflight JSON. Default: ${DEFAULT_COMMUNITY_PREFLIGHT}
  --community-brief <file> Community launch brief JSON. Default: ${DEFAULT_COMMUNITY_BRIEF}
  --directory-review <file> Directory review JSON. Default: ${DEFAULT_DIRECTORY_REVIEW}
  --partner-review <file> Partner/resource email review JSON. Default: ${DEFAULT_PARTNER_REVIEW}
  --marketplace-review <file> Marketplace review JSON. Default: ${DEFAULT_MARKETPLACE_REVIEW}
  --marketplace-preflight <file> Marketplace upload preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --marketplace-public <file> Marketplace public listing JSON. Default: ${DEFAULT_MARKETPLACE_PUBLIC}
  --marketplace-postflight <file> Marketplace after-upload postflight JSON. Default: ${DEFAULT_MARKETPLACE_POSTFLIGHT}
  --channel-priority <file> Channel priority JSON. Default: ${DEFAULT_CHANNEL_PRIORITY}
  --portfolio <file>     Multi-plugin portfolio JSON. Default: ${DEFAULT_PORTFOLIO}
  --portfolio-experiments <file> Multi-plugin experiment JSON. Default: ${DEFAULT_PORTFOLIO_EXPERIMENTS}
  --asset-coverage <file> Plugin asset coverage JSON. Default: ${DEFAULT_ASSET_COVERAGE}
  --plugin-channel-fit <file> Plugin channel fit JSON. Default: ${DEFAULT_PLUGIN_CHANNEL_FIT}
  --cross-promotion <file> Cross-promotion matrix JSON. Default: ${DEFAULT_CROSS_PROMOTION}
  --landing-baseline <file> Landing/tracking baseline JSON. Default: ${DEFAULT_LANDING_BASELINE}
  --landing-target-decision <file> Landing target decision JSON. Default: ${DEFAULT_LANDING_TARGET_DECISION}
  --landing-baseline-brief <file> Landing baseline confirmation brief JSON. Default: ${DEFAULT_LANDING_BASELINE_BRIEF}
  --owned-site-audit <file> Owned site audit JSON. Default: ${DEFAULT_OWNED_SITE_AUDIT}
  --owned-site-cta-kit <file> Owned site CTA kit JSON. Default: ${DEFAULT_OWNED_SITE_CTA_KIT}
  --owned-site-implementation <file> Owned site implementation brief JSON. Default: ${DEFAULT_OWNED_SITE_IMPLEMENTATION}
  --use-case-pages <file> Use-case page brief JSON. Default: ${DEFAULT_USE_CASE_PAGES}
  --customer-feedback <file> Customer feedback queue JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK}
  --customer-feedback-brief <file> Customer feedback confirmation brief JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK_BRIEF}
  --customer-feedback-review <file> Customer feedback review JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK_REVIEW}
  --confirmation-queue <file> Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATION_QUEUE}
  --experiment-decision <file> Experiment decision brief JSON. Default: ${DEFAULT_EXPERIMENT_DECISION}
  --goal-coverage <file> Growth goal coverage JSON. Default: ${DEFAULT_GOAL_COVERAGE}
  --actions <file>       External action log CSV. Default: ${DEFAULT_ACTIONS}
  --marketplace <file>   Marketplace snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --plugin-zip <file>    Framer marketplace package. Default: ${DEFAULT_PLUGIN_ZIP}
  --output <file>        Markdown dashboard. Default: ${DEFAULT_OUTPUT}
  --today <YYYY-MM-DD>   Dashboard date. Default: local date.
  --help                 Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    revenue: DEFAULT_REVENUE,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
    creemStore: DEFAULT_CREEM_STORE,
    gmailQueue: DEFAULT_GMAIL_QUEUE,
    todayPlan: DEFAULT_TODAY_PLAN,
    day3Readiness: DEFAULT_DAY3_READINESS,
    day3Brief: DEFAULT_DAY3_BRIEF,
    followupPreflight: DEFAULT_FOLLOWUP_PREFLIGHT,
    actionReview: DEFAULT_ACTION_REVIEW,
    deployReview: DEFAULT_DEPLOY_REVIEW,
    trackingFreshness: DEFAULT_TRACKING_FRESHNESS,
    localTrackingFreshness: DEFAULT_LOCAL_TRACKING_FRESHNESS,
    checkoutOrigin: DEFAULT_CHECKOUT_ORIGIN,
    paymentComplianceRecovery: DEFAULT_PAYMENT_COMPLIANCE_RECOVERY,
    blockerBrief: DEFAULT_BLOCKER_BRIEF,
    netlifyRecovery: DEFAULT_NETLIFY_RECOVERY,
    distributionReview: DEFAULT_DISTRIBUTION_REVIEW,
    communityReview: DEFAULT_COMMUNITY_REVIEW,
    communityPreflight: DEFAULT_COMMUNITY_PREFLIGHT,
    communityBrief: DEFAULT_COMMUNITY_BRIEF,
    directoryReview: DEFAULT_DIRECTORY_REVIEW,
    partnerReview: DEFAULT_PARTNER_REVIEW,
    marketplaceReview: DEFAULT_MARKETPLACE_REVIEW,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    marketplacePublic: DEFAULT_MARKETPLACE_PUBLIC,
    marketplacePostflight: DEFAULT_MARKETPLACE_POSTFLIGHT,
    channelPriority: DEFAULT_CHANNEL_PRIORITY,
    portfolio: DEFAULT_PORTFOLIO,
    portfolioExperiments: DEFAULT_PORTFOLIO_EXPERIMENTS,
    assetCoverage: DEFAULT_ASSET_COVERAGE,
    pluginChannelFit: DEFAULT_PLUGIN_CHANNEL_FIT,
    crossPromotion: DEFAULT_CROSS_PROMOTION,
    landingBaseline: DEFAULT_LANDING_BASELINE,
    landingTargetDecision: DEFAULT_LANDING_TARGET_DECISION,
    landingBaselineBrief: DEFAULT_LANDING_BASELINE_BRIEF,
    ownedSiteAudit: DEFAULT_OWNED_SITE_AUDIT,
    ownedSiteCtaKit: DEFAULT_OWNED_SITE_CTA_KIT,
    ownedSiteImplementation: DEFAULT_OWNED_SITE_IMPLEMENTATION,
    useCasePages: DEFAULT_USE_CASE_PAGES,
    customerFeedback: DEFAULT_CUSTOMER_FEEDBACK,
    customerFeedbackBrief: DEFAULT_CUSTOMER_FEEDBACK_BRIEF,
    customerFeedbackReview: DEFAULT_CUSTOMER_FEEDBACK_REVIEW,
    confirmationQueue: DEFAULT_CONFIRMATION_QUEUE,
    experimentDecision: DEFAULT_EXPERIMENT_DECISION,
    goalCoverage: DEFAULT_GOAL_COVERAGE,
    actions: DEFAULT_ACTIONS,
    marketplace: DEFAULT_MARKETPLACE,
    pluginZip: DEFAULT_PLUGIN_ZIP,
    output: DEFAULT_OUTPUT,
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
    if (key === "--crm") {
      args.crm = value;
      index += 1;
      continue;
    }
    if (key === "--revenue") {
      args.revenue = value;
      index += 1;
      continue;
    }
    if (key === "--events") {
      args.events = value;
      index += 1;
      continue;
    }
    if (key === "--forms") {
      args.forms = value;
      index += 1;
      continue;
    }
    if (key === "--creem-store") {
      args.creemStore = value;
      index += 1;
      continue;
    }
    if (key === "--gmail-queue") {
      args.gmailQueue = value;
      index += 1;
      continue;
    }
    if (key === "--today-plan") {
      args.todayPlan = value;
      index += 1;
      continue;
    }
    if (key === "--day3-readiness") {
      args.day3Readiness = value;
      index += 1;
      continue;
    }
    if (key === "--day3-brief") {
      args.day3Brief = value;
      index += 1;
      continue;
    }
    if (key === "--followup-preflight") {
      args.followupPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--action-review") {
      args.actionReview = value;
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
    if (key === "--local-tracking-freshness") {
      args.localTrackingFreshness = value;
      index += 1;
      continue;
    }
    if (key === "--checkout-origin") {
      args.checkoutOrigin = value;
      index += 1;
      continue;
    }
    if (key === "--payment-compliance-recovery") {
      args.paymentComplianceRecovery = value;
      index += 1;
      continue;
    }
    if (key === "--blocker-brief") {
      args.blockerBrief = value;
      index += 1;
      continue;
    }
    if (key === "--netlify-recovery") {
      args.netlifyRecovery = value;
      index += 1;
      continue;
    }
    if (key === "--distribution-review") {
      args.distributionReview = value;
      index += 1;
      continue;
    }
    if (key === "--community-review") {
      args.communityReview = value;
      index += 1;
      continue;
    }
    if (key === "--community-preflight") {
      args.communityPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--community-brief") {
      args.communityBrief = value;
      index += 1;
      continue;
    }
    if (key === "--directory-review") {
      args.directoryReview = value;
      index += 1;
      continue;
    }
    if (key === "--partner-review") {
      args.partnerReview = value;
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
    if (key === "--channel-priority") {
      args.channelPriority = value;
      index += 1;
      continue;
    }
    if (key === "--portfolio") {
      args.portfolio = value;
      index += 1;
      continue;
    }
    if (key === "--portfolio-experiments") {
      args.portfolioExperiments = value;
      index += 1;
      continue;
    }
    if (key === "--asset-coverage") {
      args.assetCoverage = value;
      index += 1;
      continue;
    }
    if (key === "--plugin-channel-fit") {
      args.pluginChannelFit = value;
      index += 1;
      continue;
    }
    if (key === "--cross-promotion") {
      args.crossPromotion = value;
      index += 1;
      continue;
    }
    if (key === "--landing-baseline") {
      args.landingBaseline = value;
      index += 1;
      continue;
    }
    if (key === "--landing-target-decision") {
      args.landingTargetDecision = value;
      index += 1;
      continue;
    }
    if (key === "--landing-baseline-brief") {
      args.landingBaselineBrief = value;
      index += 1;
      continue;
    }
    if (key === "--owned-site-audit") {
      args.ownedSiteAudit = value;
      index += 1;
      continue;
    }
    if (key === "--owned-site-cta-kit") {
      args.ownedSiteCtaKit = value;
      index += 1;
      continue;
    }
    if (key === "--owned-site-implementation") {
      args.ownedSiteImplementation = value;
      index += 1;
      continue;
    }
    if (key === "--use-case-pages") {
      args.useCasePages = value;
      index += 1;
      continue;
    }
    if (key === "--customer-feedback") {
      args.customerFeedback = value;
      index += 1;
      continue;
    }
    if (key === "--customer-feedback-brief") {
      args.customerFeedbackBrief = value;
      index += 1;
      continue;
    }
    if (key === "--customer-feedback-review") {
      args.customerFeedbackReview = value;
      index += 1;
      continue;
    }
    if (key === "--confirmation-queue") {
      args.confirmationQueue = value;
      index += 1;
      continue;
    }
    if (key === "--experiment-decision") {
      args.experimentDecision = value;
      index += 1;
      continue;
    }
    if (key === "--goal-coverage") {
      args.goalCoverage = value;
      index += 1;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace") {
      args.marketplace = value;
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
    if (key === "--today") {
      args.today = value;
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

async function readJson(file, fallback) {
  const text = await readText(file);
  if (!text) return fallback;
  return JSON.parse(text);
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
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

async function readRows(file) {
  return parseCsv(await readText(file));
}

function number(value) {
  return Number.parseInt(value || "0", 10) || 0;
}

function money(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatUsd(value) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function pct(numerator, denominator) {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key] || "unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function isDue(row, today) {
  return Boolean(row.next_followup && row.next_followup <= today && !CLOSED_STATUSES.has(row.status));
}

async function inspectPluginZip(file) {
  try {
    const [info, buffer, entries, js] = await Promise.all([
      stat(file),
      readFile(file),
      unzipList(file),
      unzipJs(file),
    ]);
    const missingMarkers = REQUIRED_PLUGIN_MARKERS.filter((marker) => !js.includes(marker));
    const hasRequiredEntries = [
      "framer.json",
      "framer-plugin-packed.txt",
      "icon.svg",
      "index.html",
    ].every((entry) => entries.includes(entry));

    return {
      ok: hasRequiredEntries && missingMarkers.length === 0,
      exists: true,
      mtime: info.mtime.toISOString(),
      size: info.size,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      entries: entries.length,
      missingMarkers,
      hasRequiredEntries,
    };
  } catch (error) {
    return {
      ok: false,
      exists: false,
      error: error.message,
    };
  }
}

async function unzipList(file) {
  const { stdout } = await execFileAsync("unzip", ["-Z1", file], {
    maxBuffer: 5 * 1024 * 1024,
  });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function unzipJs(file) {
  const entries = await unzipList(file);
  const jsEntries = entries.filter((entry) => /\.(?:mjs|js)$/.test(entry));
  const chunks = await Promise.all(
    jsEntries.map(async (entry) => {
      const { stdout } = await execFileAsync("unzip", ["-p", file, entry], {
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    }),
  );
  return chunks.join("\n");
}

function summarize(rows, revenueRows, events, formData, creemStore, queueData, todayPlan, day3Readiness, day3Brief, followupPreflight, deployReview, trackingFreshness, localTrackingFreshness, checkoutOrigin, paymentComplianceRecovery, blockerBrief, netlifyRecovery, distributionReview, communityReview, communityPreflight, communityBrief, directoryReview, partnerReview, marketplaceReview, marketplacePreflight, marketplacePublic, marketplacePostflight, actionRows, marketplaceRows, plugin) {
  const sentRows = rows.filter((row) => number(row.sent_count) > 0 && row.status !== "bounced");
  const bouncedRows = rows.filter((row) => row.status === "bounced");
  const repliedRows = rows.filter((row) => REPLY_STATUSES.has(row.status));
  const opportunityRows = rows.filter((row) => OPPORTUNITY_STATUSES.has(row.status));
  const dueRows = rows.filter((row) => isDue(row, formData.today));
  const openRows = rows.filter((row) => !CLOSED_STATUSES.has(row.status));
  const verifiedRevenue = revenueRows.filter((row) => row.status === "verified");
  const pendingRevenue = revenueRows.filter((row) => row.status === "pending");
  const pipelineRows = rows.filter(
    (row) =>
      money(row.deal_value_usd) > 0 &&
      !CLOSED_STATUSES.has(row.status) &&
      (row.revenue_path || OPPORTUNITY_STATUSES.has(row.status)),
  );
  const pipelineValue = pipelineRows.reduce((sum, row) => sum + money(row.deal_value_usd), 0);
  const bookedRevenue = verifiedRevenue.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const pendingRevenueValue = pendingRevenue.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const installEvents = events.filter((event) => event.event_type === "install_click");
  const checkoutEvents = events.filter((event) => event.event_type === "checkout_click");
  const submissions = Array.isArray(formData.submissions) ? formData.submissions : [];
  const queue = Array.isArray(queueData.queue) ? queueData.queue : [];
  const recentActions = actionRows
    .map((row, index) => ({ ...row, __index: index }))
    .filter((row) => row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index)
    .slice(0, 8);
  const marketplaceUploadDone = actionRows.some(
    (row) =>
      row.type === "marketplace_upload" &&
      row.campaign === "plugin_upgrade" &&
      row.status === "done",
  );
  const marketplaceUploadPlanned = actionRows.some(
    (row) =>
      row.type === "marketplace_upload" &&
      row.campaign === "plugin_upgrade" &&
      row.status !== "done" &&
      row.status !== "skipped",
  );
  const publishedPosts = actionRows.filter((row) => row.type === "post" && row.status === "done");
  const openComplianceWarnings = actionRows
    .map((row, index) => ({ ...row, __index: index }))
    .filter((row) => openComplianceWarningsForScope([row], "polyglot_aeo").length)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index);
  const latestMarketplace = [...marketplaceRows]
    .filter((row) => row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;

  return {
    total: rows.length,
    open: openRows.length,
    due: dueRows.length,
    sent: sentRows.length,
    bounced: bouncedRows.length,
    replies: repliedRows.length,
    opportunities: opportunityRows.length,
    replyRate: pct(repliedRows.length, sentRows.length),
    opportunityRate: pct(opportunityRows.length, sentRows.length),
    pipelineValue,
    bookedRevenue,
    pendingRevenue: pendingRevenue.length,
    pendingRevenueValue,
    creemStore,
    events: events.length,
    installEvents: installEvents.length,
    checkoutEvents: checkoutEvents.length,
    submissions: submissions.length,
    queue: queue.length,
    todayPlan,
    day3Readiness,
    day3Brief,
    followupPreflight,
    deployReview,
    distributionReview,
    checkoutOrigin,
    paymentComplianceRecovery,
    blockerBrief,
    communityReview,
    communityPreflight,
    communityBrief,
    directoryReview,
    partnerReview,
    marketplaceReview,
    marketplacePreflight,
    marketplacePublic,
    marketplacePostflight,
    actions: actionRows.length,
    openComplianceWarnings,
    publishedPosts: publishedPosts.length,
    marketplaceUploadDone,
    marketplaceUploadPlanned,
    latestMarketplace,
    pluginReady: plugin.ok,
    dueRows,
    queueRows: queue,
    recentActions,
    trackingFreshness,
    localTrackingFreshness,
    netlifyRecovery,
  };
}

function renderCountList(rows, key, emptyText) {
  if (!rows.length) return `${emptyText}\n`;
  return `${countBy(rows, key)
    .map(([value, count]) => `- ${value}: ${count}`)
    .join("\n")}\n`;
}

function renderQueue(queue) {
  if (!queue.length) return "No queued Gmail items found.\n";
  const lines = ["| Domain | To | Subject | Variant | Action |", "|---|---|---|---|---|"];
  for (const item of queue.slice(0, 10)) {
    lines.push(`| ${item.domain} | ${item.to} | ${String(item.subject || "").replace(/\|/g, "/")} | ${item.variant || ""} | ${item.action} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderDay3Readiness(readiness) {
  if (!readiness) {
    return "No Day 3 readiness generated yet. Run `pnpm lead:day3-readiness` before any scheduled follow-up work.\n";
  }

  const lines = [
    `- Verdict: ${readiness.verdict}`,
    `- Action required: ${readiness.action_required || "unknown"}`,
    `- Send allowed: ${readiness.send_allowed ? "yes" : "no"}`,
    `- Next batch date: ${readiness.next_batch_date || "none"}`,
    `- Target date: ${readiness.target_date || "none"}`,
    `- Due today: ${readiness.due_today_count ?? 0}`,
    `- Due for target date: ${readiness.due_target_count ?? 0}`,
    `- Queue items: ${readiness.queue_count ?? 0}`,
    `- Same-day Gmail preflight logs: ${readiness.same_day_gmail_preflight_count ?? 0}`,
    readiness.creem_store
      ? `- Creem store monitor: ${readiness.creem_store.status || "unknown"} (review needed ${readiness.creem_store.review_needed ? "yes" : "no"})`
      : "",
    `- Recommendation: ${readiness.recommendation}`,
    "",
  ].filter((line) => line !== "");

  if (Array.isArray(readiness.blockers) && readiness.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of readiness.blockers.slice(0, 8)) lines.push(`- ${blocker}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderDay3Brief(brief) {
  if (!brief) {
    return "No Day 3 send brief generated yet. Run `pnpm lead:day3-brief` before the scheduled follow-up date.\n";
  }

  const queryChunks = Array.isArray(brief.gmail_queries) ? brief.gmail_queries.length : 0;
  const tranche = brief.tranche_plan || {};
  const lines = [
    `- Status: ${brief.status || "unknown"}`,
    `- Send allowed: ${brief.send_allowed ? "yes" : "no"}`,
    `- Not before: ${brief.not_before || "unknown"}`,
    `- Target date: ${brief.target_date || "unknown"}`,
    `- Queue items: ${brief.queue?.count ?? 0}`,
    `- Gmail query chunks: ${queryChunks}`,
    brief.creem_store
      ? `- Creem store monitor: ${brief.creem_store.status || "unknown"} (review needed ${brief.creem_store.review_needed ? "yes" : "no"})`
      : "",
    tranche.total_queue
      ? `- Recommended pilot tranche: ${tranche.recommended_size}/${tranche.total_queue} (avg score ${tranche.first_tranche_avg_score}; agency-fit ${tranche.first_tranche_agency_fit})`
      : "",
    tranche.preview_files?.markdown ? `- Pilot preview: ${tranche.preview_files.markdown}` : "",
    `- Recommendation: ${brief.recommendation || ""}`,
    "",
  ].filter((line) => line !== "");

  if (Array.isArray(tranche.first_tranche) && tranche.first_tranche.length) {
    lines.push("| # | Queue # | Domain | Score | Fit |");
    lines.push("|---:|---:|---|---:|---|");
    tranche.first_tranche.slice(0, 8).forEach((item, index) => {
      lines.push(`| ${index + 1} | ${item.queue_index} | ${item.domain || ""} | ${item.score ?? ""} | ${item.fit || ""} |`);
    });
    lines.push("");
  }

  if (Array.isArray(brief.stop_rules) && brief.stop_rules.length) {
    lines.push("Stop rules:");
    for (const rule of brief.stop_rules.slice(0, 5)) lines.push(`- ${rule}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderFollowupPreflight(review) {
  if (!review) {
    return "No follow-up preflight generated yet. Run `pnpm lead:followup-preflight` after preparing a follow-up Gmail queue.\n";
  }

  const lines = [
    `- Verdict: ${review.verdict}`,
    `- Send allowed: ${review.send_allowed ? "yes" : "no"}`,
    `- Scheduled send date: ${review.scheduled_send_date || "unknown"}`,
    `- Queue items: ${review.queue_count ?? 0}`,
    `- Due CRM rows for schedule: ${review.due_crm_count ?? 0}`,
    `- Same-day Gmail preflight logs: ${review.same_day_gmail_preflight_count ?? 0}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ];

  if (Array.isArray(review.blockers) && review.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of review.blockers.slice(0, 8)) lines.push(`- ${blocker}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderActions(rows) {
  if (!rows.length) return "No external actions recorded yet.\n";
  const lines = ["| Date | Type | Channel | Campaign | Status | Target |", "|---|---|---|---|---|---|"];
  for (const row of rows) {
    lines.push(`| ${row.date} | ${row.type} | ${row.channel} | ${row.campaign || ""} | ${row.status} | ${String(row.target || "").replace(/\|/g, "/")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderComplianceWarnings(rows) {
  if (!rows.length) return "No open compliance warnings.\n";
  const lines = [
    "| Date | Channel | Campaign | Status | Deadline | Target | Evidence |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 6)) {
    const deadline = complianceDeadline(row);
    const deadlineText = deadline
      ? `${deadline.deadline_at} (${deadline.hours_remaining}h, ${deadline.urgency})`
      : "";
    lines.push(
      `| ${row.date || ""} | ${row.channel || ""} | ${row.campaign || ""} | ${row.status || ""} | ${deadlineText} | ${String(row.target || "").replace(/\|/g, "/")} | ${String(row.evidence || row.note || "").replace(/\|/g, "/").slice(0, 180)} |`,
    );
  }
  lines.push(
    "",
    "Resolution: verify the affected store/domain in the payment provider dashboard, add or approve the missing website/business, or remove the offending checkout traffic; then record a resolved compliance action before broad checkout-heavy promotion.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function renderCreemStore(monitor) {
  if (!monitor) {
    return "No Creem store monitor generated yet. Run `pnpm lead:creem-store` to check direct Creem transaction signal.\n";
  }

  const newTransactions = Array.isArray(monitor.new_transactions) ? monitor.new_transactions : [];
  const newPolyglotTransactions = Array.isArray(monitor.polyglot_new_transactions)
    ? monitor.polyglot_new_transactions
    : [];
  const revenueCommands = Array.isArray(monitor.revenue_commands) ? monitor.revenue_commands : [];
  const baselinePolyglotTransactions = Array.isArray(monitor.baseline_polyglot_transactions)
    ? monitor.baseline_polyglot_transactions
    : [];
  const baselineReviewCommands = Array.isArray(monitor.baseline_review_commands)
    ? monitor.baseline_review_commands
    : [];
  const lines = [
    `- Status: ${monitor.status || "unknown"}`,
    `- Mode: ${monitor.test_mode ? "test" : "live"}`,
    `- API key env: ${monitor.api_key_env || "unknown"} (${monitor.key_present ? "present" : "missing"})`,
    `- Transactions returned: ${monitor.transactions_returned ?? 0}`,
    `- New transactions: ${newTransactions.length}`,
    `- New Polyglot transactions: ${newPolyglotTransactions.length}`,
    `- Baseline Polyglot transactions: ${baselinePolyglotTransactions.length}`,
    `- Revenue commands ready: ${revenueCommands.length}`,
    `- Baseline review commands ready: ${baselineReviewCommands.length}`,
    `- Recommendation: ${monitor.recommendation || "none"}`,
    "",
  ];

  if (newPolyglotTransactions.length) {
    lines.push("| Created | Product | Amount | Customer | Evidence |");
    lines.push("|---|---|---:|---|---|");
    for (const row of newPolyglotTransactions.slice(0, 8)) {
      lines.push(
        `| ${row.created_at || ""} | ${String(row.product || "").replace(/\|/g, "/")} | ${row.amount_usd || row.amount_raw || ""} ${row.currency || ""} | ${String(row.customer_redacted || "").replace(/\|/g, "/")} | ${String(row.evidence_id || "").replace(/\|/g, "/")} |`,
      );
    }
    lines.push("");
  }

  if (revenueCommands.length) {
    lines.push("Revenue commands after manual confirmation:", "", "```bash");
    for (const command of revenueCommands.slice(0, 8)) lines.push(command);
    lines.push("```", "");
  }

  if (baselinePolyglotTransactions.length) {
    lines.push("Baseline Polyglot transactions to review:", "");
    lines.push("| Created | Product | Amount | Customer | Evidence |");
    lines.push("|---|---|---:|---|---|");
    for (const row of baselinePolyglotTransactions.slice(0, 8)) {
      lines.push(
        `| ${row.created_at || ""} | ${String(row.product || "").replace(/\|/g, "/")} | ${row.amount_usd || row.amount_raw || ""} ${row.currency || ""} | ${String(row.customer_redacted || "").replace(/\|/g, "/")} | ${String(row.evidence_id || "").replace(/\|/g, "/")} |`,
      );
    }
    lines.push("");
  }

  if (baselineReviewCommands.length) {
    lines.push("Baseline review commands after manual confirmation:", "", "```bash");
    for (const command of baselineReviewCommands.slice(0, 8)) lines.push(command);
    lines.push("```", "");
  }

  return `${lines.join("\n")}\n`;
}

function renderCheckoutOrigin(readiness) {
  if (!readiness) return "No checkout origin readiness report generated yet. Run `pnpm lead:checkout-origin`.\n";
  const lines = [
    `- Status: ${readiness.status || "unknown"}`,
    `- Promotion allowed: ${readiness.promotion_allowed ? "yes" : "no"}`,
    `- Target origin: ${readiness.target_origin || ""}`,
    `- Legacy origin: ${readiness.legacy_origin || ""}`,
    `- Recommendation: ${readiness.recommendation || ""}`,
    "",
  ];

  if (Array.isArray(readiness.blockers) && readiness.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of readiness.blockers.slice(0, 8)) {
      lines.push(`- ${blocker.label || blocker.id}: ${blocker.detail || ""}`);
    }
    lines.push("");
  }

  if (Array.isArray(readiness.warnings) && readiness.warnings.length) {
    lines.push("Warnings:");
    for (const warning of readiness.warnings.slice(0, 5)) {
      lines.push(`- ${warning.label || warning.id}: ${warning.detail || ""}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderPaymentComplianceRecovery(recovery) {
  if (!recovery) {
    return "No payment compliance recovery report generated yet. Run `pnpm lead:payment-compliance-recovery`.\n";
  }

  const lines = [
    `- Status: ${recovery.status || "unknown"}`,
    `- Promotion allowed: ${recovery.promotion_allowed ? "yes" : "no"}`,
    `- Marketplace upload allowed: ${recovery.marketplace_upload_allowed ? "yes" : "no"}`,
    `- Recommendation: ${recovery.recommendation || ""}`,
    "",
  ];

  if (Array.isArray(recovery.phases) && recovery.phases.length) {
    lines.push("| Phase | Status | Next action |");
    lines.push("|---|---|---|");
    for (const phase of recovery.phases) {
      lines.push(`| ${phase.label || phase.id} | ${phase.status || "unknown"} | ${String(phase.next_action || "").replace(/\|/g, "/")} |`);
    }
    lines.push("");
  }

  if (Array.isArray(recovery.blockers) && recovery.blockers.length) {
    lines.push("Blocking evidence:");
    for (const blocker of recovery.blockers.slice(0, 8)) lines.push(`- ${blocker}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderBlockerBrief(brief) {
  if (!brief) {
    return "No blocker resolution brief generated yet. Run `pnpm lead:blocker-brief` after refreshing payment recovery and apply dry-runs.\n";
  }

  const lines = [
    `- Status: ${brief.status || "unknown"}`,
    `- Promotion allowed: ${brief.promotion_allowed === null ? "unknown" : brief.promotion_allowed ? "yes" : "no"}`,
    `- Public preflight: ${brief.public_preflight || "unknown"}`,
    `- Next confirmation: ${brief.next_executable?.confirmation || "none"}`,
    `- Recommendation: ${brief.recommendation || ""}`,
    "",
  ];

  if (Array.isArray(brief.decision_queue) && brief.decision_queue.length) {
    lines.push("| Kind | Status | Due | Action | Confirmation |");
    lines.push("|---|---|---|---|---|");
    for (const item of brief.decision_queue.slice(0, 6)) {
      lines.push(
        `| ${String(item.kind || "").replace(/\|/g, "/")} | ${String(item.status || "").replace(/\|/g, "/")} | ${String(item.due || "").replace(/\|/g, "/")} | ${String(item.title || "").replace(/\|/g, "/")} | ${String(item.confirmation || "").replace(/\|/g, "/")} |`,
      );
    }
    lines.push("");
  }

  if (Array.isArray(brief.steps) && brief.steps.length) {
    lines.push("| Step | Status | Confirmation |");
    lines.push("|---|---|---|");
    for (const step of brief.steps.slice(0, 5)) {
      lines.push(`| ${step.label || step.id} | ${step.status || "unknown"} | ${String(step.confirmation || "").replace(/\|/g, "/")} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderMarketplace(row) {
  if (!row) return "No Marketplace snapshot recorded yet.\n";
  return [
    `- Date: ${row.date}`,
    `- Users: ${row.users}`,
    `- Opens: ${row.opens}`,
    `- Version: ${row.version}`,
    `- Updated: ${row.updated}`,
    row.note ? `- Note: ${row.note}` : "",
  ]
    .filter(Boolean)
    .join("\n") + "\n";
}

function renderMarketplaceReview(review) {
  if (!review) {
    return "No marketplace review generated yet. Run `pnpm lead:marketplace-review`.\n";
  }
  return [
    `- Status: ${review.status}`,
    `- Upload actions done: ${review.upload_done}`,
    `- Upload actions planned/open: ${review.upload_planned}`,
    `- Snapshots: ${review.snapshots}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ].join("\n");
}

function renderMarketplacePreflight(review) {
  if (!review) {
    return "No marketplace upload preflight generated yet. Run `pnpm lead:marketplace-preflight`.\n";
  }

  const lines = [
    `- Verdict: ${review.verdict}`,
    `- Upload allowed: ${review.upload_allowed ? "yes" : "no"}`,
    `- Marketplace status: ${review.marketplace_status || "unknown"}`,
    `- Package SHA256: ${review.zip?.sha256 || "unknown"}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ];

  if (Array.isArray(review.blockers) && review.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of review.blockers.slice(0, 8)) lines.push(`- ${blocker}`);
    lines.push("");
  }

  if (Array.isArray(review.steps) && review.steps.length) {
    lines.push("| Check | Result |");
    lines.push("|---|---|");
    for (const step of review.steps) {
      lines.push(`| ${step.name} | ${step.ok ? "pass" : "fail"} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderMarketplacePublic(review) {
  if (!review?.snapshot) {
    return "No Marketplace public listing snapshot generated yet. Run `pnpm lead:marketplace-public -- --record`.\n";
  }

  const snapshot = review.snapshot;
  const lines = [
    `- Listing readable: ${snapshot.ok ? "yes" : "no"}`,
    `- Title: ${snapshot.title || "unknown"}`,
    `- Likes: ${snapshot.likes}`,
    `- Comments: ${snapshot.comments}`,
    `- Published: ${snapshot.published_at || "unknown"}`,
    `- Updated: ${snapshot.updated_at || "unknown"}`,
    `- Framer plugin id: ${snapshot.framer_plugin_id || "unknown"}`,
    `- Categories: ${snapshot.categories || "unknown"}`,
    `- Recommendation: ${review.recommendation || "none"}`,
    "",
  ];

  if (review.previous_different_snapshot) {
    lines.push(
      "Previous different snapshot:",
      `- Date: ${review.previous_different_snapshot.date}`,
      `- Likes: ${review.previous_different_snapshot.likes}`,
      `- Comments: ${review.previous_different_snapshot.comments}`,
      `- Updated: ${review.previous_different_snapshot.updated_at || "unknown"}`,
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderMarketplacePostflight(review) {
  if (!review) {
    return "No Marketplace postflight generated yet. Run `pnpm lead:marketplace-postflight` after upload or while preparing the upload runbook.\n";
  }

  const lines = [
    `- Status: ${review.status}`,
    `- Postflight complete: ${review.postflight_complete ? "yes" : "no"}`,
    `- Upload logged: ${review.upload_logged ? "yes" : "no"}`,
    `- After-upload Creator Space snapshot: ${review.creator_space?.after_upload_snapshot ? "yes" : "no"}`,
    `- Public listing readable: ${review.public_listing?.readable ? "yes" : "no"}`,
    `- Plugin upgrade CTA events: ${review.plugin_upgrade_events ?? 0}`,
    `- Plugin upgrade forms: ${review.plugin_upgrade_forms ?? 0}`,
    `- Community publish allowed: ${review.community_preflight?.publish_allowed ? "yes" : "no"}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ];

  if (Array.isArray(review.missing) && review.missing.length) {
    lines.push("Missing proof:");
    for (const item of review.missing.slice(0, 8)) lines.push(`- ${item}`);
    lines.push("");
  }

  if (Array.isArray(review.signals) && review.signals.length) {
    lines.push("Signals:");
    for (const signal of review.signals.slice(0, 8)) lines.push(`- ${signal}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderActionReview(review) {
  if (!review || !Array.isArray(review.rows)) {
    return "No public action review generated yet. Run `pnpm lead:action-review` after external actions are recorded.\n";
  }

  const lines = [
    `- Due reviews: ${review.due_reviews}`,
    `- Scheduled reviews: ${review.scheduled_reviews}`,
    `- Actions with signal: ${review.signal_actions}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ];

  if (!review.rows.length) {
    lines.push("No completed public actions are ready for post-action review.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Status | Date | Channel | Target | Next/due |");
  lines.push("|---|---|---|---|---|");
  for (const row of review.rows.slice(0, 8)) {
    lines.push(`| ${row.status} | ${row.action?.date || ""} | ${row.action?.channel || ""} | ${String(row.action?.target || "").replace(/\|/g, "/")} | ${row.next_due_date || ""} |`);
  }

  return `${lines.join("\n")}\n`;
}

function renderDeployReview(review) {
  if (!review) {
    return "No deploy review generated yet. Run `pnpm lead:deploy-review` after `pnpm lead:site-check`.\n";
  }

  return [
    `- Status: ${review.status}`,
    `- Production site check: ${review.production_site_check}`,
    `- Local build: ${review.local_build}`,
    `- Netlify new deploys: ${review.netlify_new_deploys}`,
    `- Latest production deploy: ${review.latest_production_deploy_id || "unknown"}`,
    `- Latest production published_at: ${review.latest_production_published_at || "unknown"}`,
    `- Real CTA events: ${review.real_cta_events}`,
    `- Real form submissions: ${review.real_form_submissions}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ].join("\n");
}

function renderTrackingFreshness(review) {
  if (!review) {
    return "No production tracking freshness check generated yet. Run `pnpm lead:tracking-freshness` after `pnpm lead:site-check`.\n";
  }

  const lines = [
    `- Status: ${review.status}`,
    `- Fresh: ${review.fresh ? "yes" : "no"}`,
    `- Scripts checked: ${review.scripts_checked ?? 0}`,
    `- Deploy context: ${review.deploy_context?.netlify_new_deploys || "unknown"}`,
  ];

  if (Array.isArray(review.missing_required) && review.missing_required.length) {
    lines.push("- Missing required tracking proof:");
    for (const item of review.missing_required.slice(0, 10)) {
      lines.push(`  - ${item}`);
    }
  }

  lines.push(`- Recommendation: ${review.recommendation}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderLocalTrackingFreshness(review) {
  if (!review) {
    return "No local tracking freshness check generated yet. Run `pnpm --dir polyglotaeo-web build` and `pnpm lead:local-tracking-freshness`.\n";
  }

  const lines = [
    `- Status: ${review.status}`,
    `- Fresh: ${review.fresh ? "yes" : "no"}`,
    `- Static export: ${review.static_dir || "unknown"}`,
    `- Linked scripts checked: ${review.scripts_checked ?? 0}`,
    `- Total JS files checked: ${review.total_js_files_checked ?? 0}`,
  ];

  if (Array.isArray(review.missing_required) && review.missing_required.length) {
    lines.push("- Missing required local tracking proof:");
    for (const item of review.missing_required.slice(0, 10)) {
      lines.push(`  - ${item}`);
    }
  }

  lines.push(`- Recommendation: ${review.recommendation}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderNetlifyRecovery(review) {
  if (!review) {
    return "No Netlify recovery check generated yet. Run `pnpm lead:netlify-recovery`.\n";
  }

  return [
    `- Status: ${review.status}`,
    `- API site/deploys/forms readable: ${review.api?.site_readable ? "yes" : "no"} / ${review.api?.deploys_readable ? "yes" : "no"} / ${review.api?.forms_readable ? "yes" : "no"}`,
    `- Latest deploy: ${review.latest_deploy?.id || "unknown"} (${review.latest_deploy?.published_at || "unknown"})`,
    `- Forms: mini-audit ${review.forms?.mini_audit_registered ? "registered" : "missing"}, event ${review.forms?.event_registered ? "registered" : "missing"}`,
    `- Credit blocker evidence: ${review.blockers?.account_credit_usage_exceeded ? "yes" : "no"}`,
    `- Local build attribution schema: ${review.blockers?.local_build_has_attribution_schema ? "yes" : "no"}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ].join("\n");
}

function renderDue(rows) {
  if (!rows.length) return "No due CRM rows today.\n";
  const lines = ["| Domain | Status | Channel | Next action |", "|---|---|---|---|"];
  for (const row of rows.slice(0, 12)) {
    lines.push(`| ${row.domain} | ${row.status} | ${row.contact_channel} | ${row.next_action || ""} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderDistributionReview(review, channelPriority) {
  if (!review || !Array.isArray(review.rows)) {
    return "No distribution review generated yet. Run `pnpm lead:distribution-review` after `pnpm lead:forms && pnpm lead:events`.\n";
  }
  const recommendation = genericPostsHeld(channelPriority)
    ? "Generic Public Posts are on hold by channel priority. Upload Marketplace first, then test Framer Community priority 1 before broader priority posts."
    : review.recommendation;

  const lines = [
    `- Priority posts posted: ${review.priority_posted}/${review.priority_posts}`,
    `- Priority CTA events: ${review.priority_events}`,
    `- Priority form submissions: ${review.priority_forms}`,
    `- Recommendation: ${recommendation}`,
    "",
    "| Priority | Post | Posted | CTA events | Forms | Status |",
    "|---:|---|---|---:|---:|---|",
  ];

  for (const row of review.rows.slice(0, 5)) {
    lines.push(`| ${row.priority} | ${row.title} | ${row.posted ? "yes" : "no"} | ${row.events} | ${row.forms} | ${row.status} |`);
  }

  return `${lines.join("\n")}\n`;
}

function renderCommunityReview(review) {
  if (!review) {
    return "No Community Feed review generated yet. Run `pnpm lead:community-review` after `pnpm lead:community`.\n";
  }

  return [
    `- Verdict: ${review.verdict}`,
    `- Posts logged: ${review.posts_logged}/${review.posts_total}`,
    `- Manual comments: ${review.comments}`,
    `- Manual DMs/profile replies: ${review.dms}`,
    `- Manual signal score: ${review.manual_signal ?? Number(review.comments || 0) + Number(review.dms || 0)}`,
    `- Manual opportunities: ${review.manual_opportunities ?? 0}`,
    `- Manual revenue signals: ${review.manual_revenue_signals ?? 0}`,
    `- Tracked CTA events: ${review.tracked_events}`,
    `- Tracked form submissions: ${review.tracked_forms}`,
    `- Tracked signal score: ${review.tracked_signal ?? Number(review.tracked_events || 0) + Number(review.tracked_forms || 0)}`,
    `- CRM-attributed opportunities: ${review.crm_signal?.opportunities ?? 0}`,
    `- CRM-attributed deal value: ${formatUsd(review.crm_signal?.deal_value_usd ?? 0)}`,
    `- Revenue-attributed events: ${review.revenue_signal?.events ?? 0}`,
    `- Revenue-attributed amount: ${formatUsd(review.revenue_signal?.amount_usd ?? 0)}`,
    `- Marketplace users delta: ${review.marketplace_delta?.users ?? 0}`,
    `- Marketplace opens delta: ${review.marketplace_delta?.opens ?? 0}`,
    `- Marketplace lift score: ${review.marketplace_lift ?? 0}`,
    `- Total signal score: ${review.total_signal ?? 0}`,
    `- Next review date: ${review.next_review_date || "not scheduled"}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ].join("\n");
}

function renderCommunityPreflight(preflight) {
  if (!preflight) {
    return "No Community publish preflight generated yet. Run `pnpm lead:community-preflight` before asking for Community post confirmation.\n";
  }

  const lines = [
    `- Verdict: ${preflight.verdict}`,
    `- Publish allowed: ${preflight.publish_allowed ? "yes" : "no"}`,
    `- Selected post: ${preflight.selected_post?.title || "unknown"}`,
    `- Selected primary link: ${preflight.selected_post?.primary_link || "unknown"}`,
    `- Selected visual asset: ${preflight.selected_post?.visual_asset || "missing"}`,
    `- Marketplace upload logged done: ${preflight.marketplace_upload_logged_done ? "yes" : "no"}`,
    `- Channel priority next: ${preflight.channel_priority_next || "unknown"}`,
    `- Recommendation: ${preflight.recommendation}`,
    "",
  ];

  if (Array.isArray(preflight.blockers) && preflight.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of preflight.blockers.slice(0, 8)) lines.push(`- ${blocker}`);
    lines.push("");
  }

  if (Array.isArray(preflight.warnings) && preflight.warnings.length) {
    lines.push("Warnings:");
    for (const warning of preflight.warnings.slice(0, 5)) lines.push(`- ${warning}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderCommunityBrief(brief) {
  if (!brief) {
    return "No Community launch brief generated yet. Run `pnpm lead:community-brief` after kit, lint, and preflight refresh.\n";
  }

  const experiment = brief.experiment || {};
  const marketplaceBaseline = experiment.baseline?.marketplace_public || {};
  const creatorBaseline = experiment.baseline?.creator_space || {};
  const tracking = experiment.tracking || {};
  const lines = [
    `- Status: ${brief.status}`,
    `- Publish allowed: ${brief.publish_allowed ? "yes" : "no"}`,
    `- Value verdict: ${brief.value_assessment?.verdict || "unknown"} (${brief.value_assessment?.score ?? "?"}/4)`,
    experiment.primary_metric ? `- Primary metric: ${experiment.primary_metric}` : "",
    tracking.campaign ? `- Campaign: ${tracking.campaign}` : "",
    tracking.campaign_url ? `- Campaign URL: ${tracking.campaign_url}` : "",
    marketplaceBaseline.listing_readable !== undefined
      ? `- Marketplace baseline: readable ${marketplaceBaseline.listing_readable === null ? "unknown" : marketplaceBaseline.listing_readable ? "yes" : "no"}, likes ${marketplaceBaseline.likes ?? "unknown"}, comments ${marketplaceBaseline.comments ?? "unknown"}`
      : "",
    creatorBaseline.users !== undefined || creatorBaseline.opens !== undefined
      ? `- Creator Space baseline: users ${creatorBaseline.users ?? "unknown"}, opens ${creatorBaseline.opens ?? "unknown"}, version ${creatorBaseline.version ?? "unknown"}, date ${creatorBaseline.date || "unknown"}`
      : "",
    `- Selected post: ${brief.selected_post?.title || "unknown"}`,
    `- Primary link: ${brief.selected_post?.primary_link || "unknown"}`,
    `- Visual: ${brief.selected_post?.visual_asset || "missing"}`,
    `- Recommendation: ${brief.recommendation}`,
    "",
  ].filter(Boolean);

  if (Array.isArray(experiment.qualified_signal_definition) && experiment.qualified_signal_definition.length) {
    lines.push("Qualified signal:");
    for (const item of experiment.qualified_signal_definition.slice(0, 4)) lines.push(`- ${item}`);
    lines.push("");
  }

  if (Array.isArray(brief.blockers) && brief.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of brief.blockers.slice(0, 6)) lines.push(`- ${blocker}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderDirectoryReview(review) {
  if (!review || !Array.isArray(review.rows)) {
    return "No directory review generated yet. Run `pnpm lead:directory-review` after `pnpm lead:directory`.\n";
  }

  const lines = [
    `- Manual targets ready: ${review.manual_ready}`,
    `- Form submissions logged: ${review.form_submitted}`,
    `- Email pitches logged/scheduled: ${review.email_pitched}`,
    `- Directory CTA events: ${review.directory_events}`,
    `- Directory form submissions: ${review.directory_forms}`,
    `- Recommendation: ${review.recommendation}`,
    "",
    "| Priority | Target | Channel | Status | Actions |",
    "|---:|---|---|---|---:|",
  ];

  for (const row of review.rows.slice(0, 5)) {
    lines.push(`| ${row.priority} | ${row.target} | ${row.channel} | ${row.status} | ${row.action_count} |`);
  }

  return `${lines.join("\n")}\n`;
}

function renderPartnerReview(review) {
  if (!review || !Array.isArray(review.rows)) {
    return "No partner/resource review generated yet. Run `pnpm lead:partner-review` after partner or directory email pitches.\n";
  }

  const lines = [
    `- Reviewable partner/resource actions: ${review.reviewable_actions}`,
    `- Due reviews: ${review.due_reviews}`,
    `- Scheduled reviews: ${review.scheduled_reviews}`,
    `- Actions with signal: ${review.signal_actions}`,
    `- Partner CTA events: ${review.partner_events}`,
    `- Partner form submissions: ${review.partner_forms}`,
    `- Next review date: ${review.next_review_date || "none"}`,
    `- Recommendation: ${review.recommendation}`,
    "",
  ];

  if (review.gmail_query) {
    lines.push("Gmail query:", "", "```text", review.gmail_query, "```", "");
  }

  if (review.rows.length) {
    lines.push("| Status | Next due | Kind | Campaign | Target |");
    lines.push("|---|---|---|---|---|");
    for (const row of review.rows.slice(0, 8)) {
      lines.push(`| ${row.status} | ${row.next_due_date || ""} | ${row.kind || ""} | ${row.action?.campaign || ""} | ${String(row.action?.target || "").replace(/\|/g, "/")} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderChannelPriority(priority) {
  if (!priority || !Array.isArray(priority.cards)) {
    return "No channel priority generated yet. Run `pnpm lead:channel-priority` after the review commands.\n";
  }

  const lines = [
    `- Recommendation: ${priority.recommendation}`,
    `- Next channel: ${priority.next_channel || "none"}`,
    "",
    "| Rank | Score | Channel | Decision | Status |",
    "|---:|---:|---|---|---|",
  ];
  if (priority.next_confirmation) {
    lines.splice(2, 0, `- Next confirmation: ${priority.next_confirmation}`);
  }

  for (const card of priority.cards.slice(0, 8)) {
    lines.push(`| ${card.rank} | ${card.score} | ${card.channel} | ${card.decision} | ${String(card.status || "").replace(/\|/g, "/")} |`);
  }

  return `${lines.join("\n")}\n`;
}

function renderTodayPlan(plan) {
  if (!plan) {
    return "No today execution plan generated yet. Run `pnpm lead:today` after the review commands.\n";
  }

  const lines = [
    `- Recommendation: ${plan.recommendation}`,
    `- Next channel: ${plan.next_channel || "none"}`,
    `- Next confirmation: ${plan.next_confirmation || "none"}`,
    `- Can do now: ${Array.isArray(plan.can_do_now) ? plan.can_do_now.length : 0}`,
    `- Needs confirmation: ${Array.isArray(plan.needs_confirmation) ? plan.needs_confirmation.length : 0}`,
    `- Scheduled next: ${Array.isArray(plan.scheduled_next) ? plan.scheduled_next.length : 0}`,
    `- Blocked external: ${Array.isArray(plan.blocked_external) ? plan.blocked_external.length : 0}`,
    "",
  ];

  const tagged = (kind, rows) => (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, kind }));
  const canDoRows = tagged("can_do_now", plan.can_do_now).filter((row) => row.status !== "open");
  const rows = [
    ...tagged("needs_confirmation", plan.needs_confirmation),
    ...canDoRows,
    ...tagged("scheduled_next", plan.scheduled_next),
    ...tagged("blocked_external", plan.blocked_external),
  ].slice(0, 8);

  if (rows.length) {
    lines.push("| Kind | Status | Date | Title | Target | Confirmation/Reason | Risk | Expected benefit | Verification |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const row of rows) {
      lines.push(`| ${cleanTable(row.kind)} | ${cleanTable(row.status)} | ${cleanTable(row.date)} | ${cleanTable(row.title)} | ${cleanTable(row.target)} | ${cleanTable(row.confirmation || row.reason)} | ${cleanTable(row.risk)} | ${cleanTable(row.expected_benefit)} | ${cleanTable(row.verification || row.evidence)} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function portfolioPriorityRows(portfolio) {
  const profiles = Array.isArray(portfolio?.profiles) ? portfolio.profiles : [];
  return profiles
    .map((profile) => ({
      rank: profile?.priority?.rank ?? 99,
      plugin: profile?.name || "",
      priority: profile?.priority?.label || "",
      signal: Array.isArray(profile?.signals) ? profile.signals[0] || "" : "",
      blocker: Array.isArray(profile?.blockers) ? profile.blockers[0] || "" : "",
      next_action: Array.isArray(profile?.next_actions) ? profile.next_actions[0] || "" : "",
      marketplace_url: profile?.marketplace_url || "",
    }))
    .filter((row) => row.plugin)
    .sort((a, b) => a.rank - b.rank || a.plugin.localeCompare(b.plugin));
}

function renderPortfolioPriority(portfolio) {
  const rows = portfolioPriorityRows(portfolio);
  if (!rows.length) return "No portfolio dashboard generated yet. Run `pnpm lead:portfolio`.\n";
  const lines = [
    `- Public Marketplace pages checked: ${portfolio?.marketplace_ok ?? "unknown"}`,
    `- Open Polyglot Creem warnings: ${portfolio?.polyglot_creem_open ?? "unknown"}`,
    `- Open other-store Creem warnings: ${portfolio?.other_creem_open ?? "unknown"}`,
    `- External paid signals: ${portfolio?.external_revenue_count ?? "unknown"}`,
    portfolio?.gmail_note ? `- Gmail note: ${portfolio.gmail_note}` : "",
    "",
    "| Rank | Plugin | Priority | Signal | Blocker | Next action |",
    "|---:|---|---|---|---|---|",
  ].filter((line) => line !== "");
  for (const row of rows.slice(0, 6)) {
    const plugin = row.marketplace_url ? `[${row.plugin}](${row.marketplace_url})` : row.plugin;
    lines.push(`| ${row.rank} | ${plugin} | ${cleanTable(row.priority)} | ${cleanTable(row.signal)} | ${cleanTable(row.blocker)} | ${cleanTable(row.next_action)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderPortfolioExperiments(experiments) {
  const rows = Array.isArray(experiments?.experiments) ? experiments.experiments : [];
  if (!rows.length) return "No portfolio experiment log generated yet. Run `pnpm lead:portfolio-experiments -- --seed`.\n";
  const lines = [
    `- Status: ${experiments.status || "unknown"}`,
    `- Active experiments: ${experiments.active_count ?? "unknown"}`,
    `- Due reviews: ${experiments.due_review_count ?? "unknown"}`,
    `- Recommendation: ${experiments.recommendation || "none"}`,
    "",
    "| Plugin | Channel | Status | Primary metric | Confirmation | Next review |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    const nextReview = row.next_review ? `${row.next_review.label}: ${row.next_review.date}` : "";
    lines.push(`| ${cleanTable(row.plugin)} | ${cleanTable(row.channel)} | ${cleanTable(row.status)} | ${cleanTable(row.primary_metric)} | ${cleanTable(row.confirmation)} | ${cleanTable(nextReview)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderExperimentDecision(decision) {
  const rows = Array.isArray(decision?.rows) ? decision.rows : [];
  if (!decision) return "No experiment decision brief generated yet. Run `pnpm lead:experiment-decisions`.\n";
  const counts = decision.counts || {};
  const lines = [
    `- Status: ${decision.status || "unknown"}`,
    `- Recommendation: ${decision.recommendation || "none"}`,
    `- Ready: ${counts.ready_confirmation_required || 0}; needs decision: ${counts.needs_decision || 0}; review due: ${counts.review_due || 0}; blocked: ${counts.blocked || 0}`,
    decision.next_decision ? `- Next decision: ${decision.next_decision.plugin} / ${decision.next_decision.decision}` : "- Next decision: none",
    "",
    "| Decision | Plugin | Channel | Target | Continue rule | Stop/rework rule | Scale rule |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.decision)} | ${cleanTable(row.plugin)} | ${cleanTable(row.channel)} | ${cleanTable(row.target)} | ${cleanTable(row.continue_rule)} | ${cleanTable(row.stop_rule)} | ${cleanTable(row.scale_rule)} |`);
  }
  if (!rows.length) lines.push("| empty |  |  |  |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function renderGoalCoverage(coverage) {
  const rows = Array.isArray(coverage?.requirements) ? coverage.requirements : [];
  if (!coverage) return "No growth goal coverage audit generated yet. Run `pnpm lead:goal-coverage`.\n";
  const counts = coverage.counts || {};
  const lines = [
    `- Status: ${coverage.status || "unknown"}`,
    `- Recommendation: ${coverage.recommendation || "none"}`,
    `- Proven: ${counts.proven || 0}; partial: ${counts.partial || 0}; blocked: ${counts.blocked || 0}; missing: ${counts.missing || 0}`,
    "",
    "| Status | Requirement | Evidence | Next proof |",
    "|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 10)) {
    lines.push(`| ${cleanTable(row.status)} | ${cleanTable(row.requirement)} | ${cleanTable(row.evidence)} | ${cleanTable(row.next_proof)} |`);
  }
  if (!rows.length) lines.push("| empty |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function renderAssetCoverage(coverage) {
  const rows = Array.isArray(coverage?.rows) ? coverage.rows : [];
  if (!rows.length) return "No asset coverage report generated yet. Run `pnpm lead:asset-coverage`.\n";
  const lines = [
    `- Status: ${coverage.status || "unknown"}`,
    `- Asset-ready plugins: ${coverage.asset_ready_plugins ?? coverage.covered_plugins ?? "unknown"} / ${coverage.total_plugins ?? rows.length}`,
    `- Promotion-ready plugins: ${coverage.promotion_ready_plugins ?? "unknown"} / ${coverage.total_plugins ?? rows.length}`,
    `- Promotion-gated plugins: ${coverage.promotion_gated_plugins ?? coverage.gated_plugins ?? "unknown"}`,
    `- Recommendation: ${coverage.recommendation || "none"}`,
    "",
    "| Plugin | Asset ready | Promotion ready | Coverage | Top blocker | Next local step |",
    "|---|---|---|---:|---|---|",
  ];
  for (const row of rows.slice(0, 6)) {
    const plugin = row.marketplace_url ? `[${row.plugin}](${row.marketplace_url})` : row.plugin;
    lines.push(`| ${plugin} | ${row.asset_ready ? "yes" : "no"} | ${row.promotion_ready ? "yes" : "no"} | ${row.coverage_pct ?? "unknown"}% | ${cleanTable(row.top_blocker)} | ${cleanTable(row.next_local_step)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderPluginChannelFit(fit) {
  const rows = Array.isArray(fit?.plugins) ? fit.plugins : [];
  if (!rows.length) return "No plugin channel fit matrix generated yet. Run `pnpm lead:plugin-channel-fit`.\n";
  const lines = [
    `- Status: ${fit.status || "unknown"}`,
    `- Recommendation: ${fit.recommendation || "none"}`,
    "",
    "| Plugin | Top channel | Decision | Score | Next step | Confirmation |",
    "|---|---|---|---:|---|---|",
  ];
  for (const row of rows.slice(0, 6)) {
    const plugin = row.marketplace_url ? `[${row.plugin}](${row.marketplace_url})` : row.plugin;
    const top = row.top_channel || {};
    lines.push(`| ${plugin} | ${cleanTable(top.channel)} | ${cleanTable(top.decision)} | ${top.score ?? ""} | ${cleanTable(top.next_step)} | ${cleanTable(top.confirmation)} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderCrossPromotion(crossPromotion) {
  const rows = Array.isArray(crossPromotion?.rows) ? crossPromotion.rows : [];
  if (!crossPromotion) return "No cross-promotion matrix generated yet. Run `pnpm lead:cross-promo`.\n";
  const counts = crossPromotion.counts || {};
  const lines = [
    `- Status: ${crossPromotion.status || "unknown"}`,
    `- Recommendation: ${crossPromotion.recommendation || "none"}`,
    `- Ready local copy: ${counts.ready_local_copy || 0}; blocked by checkout: ${counts.blocked_by_checkout || 0}; blocked by compliance: ${counts.blocked_by_compliance || 0}`,
    "",
    "| Status | Source | Target | Source site | Campaign | Confirmation |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.status)} | ${cleanTable(row.source_plugin)} | ${cleanTable(row.target_plugin)} | ${cleanTable(row.source_site)} | ${cleanTable(row.campaign)} | ${cleanTable(row.confirmation)} |`);
  }
  if (!rows.length) lines.push("| empty |  |  |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function renderLandingBaseline(landingBaseline) {
  const rows = Array.isArray(landingBaseline?.rows) ? landingBaseline.rows : [];
  if (!rows.length) return "No landing baseline report generated yet. Run `pnpm lead:landing-baseline`.\n";
  const lines = [
    `- Status: ${landingBaseline.status || "unknown"}`,
    `- Ready: ${landingBaseline.ready_count ?? "unknown"}`,
    `- Blocked: ${landingBaseline.blocked_count ?? "unknown"}`,
    `- Recommendation: ${landingBaseline.recommendation || "none"}`,
    "",
    "| Status | Plugin | Proposed URL | Campaign | Confirmation |",
    "|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.status)} | ${cleanTable(row.plugin)} | ${cleanTable(row.proposed_url)} | ${cleanTable(row.campaign)} | ${cleanTable(row.confirmation)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderLandingTargetDecision(decision) {
  const rows = Array.isArray(decision?.unresolved) ? decision.unresolved : [];
  if (!decision) return "No landing target decision brief generated yet. Run `pnpm lead:landing-target-decision`.\n";
  const lines = [
    `- Status: ${decision.status || "unknown"}`,
    `- Recommendation: ${decision.recommendation || "none"}`,
    `- Known owned domains: ${(decision.target_registry?.known_domains || []).join(", ") || "none"}`,
    `- Deploy context: ${decision.deploy_context?.deploy_review_status || "unknown"}; Netlify: ${decision.deploy_context?.netlify_recovery_status || "unknown"}`,
    "",
    "| Plugin | Status | Recommended URL | Decision | Confirmation |",
    "|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 6)) {
    lines.push(`| ${cleanTable(row.plugin)} | ${cleanTable(row.status)} | ${cleanTable(row.recommended_url)} | ${cleanTable(row.recommended_decision)} | ${cleanTable(row.confirmation)} |`);
  }
  if (!rows.length) lines.push("| none |  |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function renderLandingBaselineBrief(brief) {
  if (!brief?.item) return "No ready landing baseline confirmation brief. Run `pnpm lead:landing-baseline-brief`.\n";
  const lines = [
    `- Status: ${brief.status || "unknown"}`,
    `- Target: ${brief.item.plugin} -> ${brief.item.target_url}`,
    `- Confirmation: ${brief.external_action?.confirmation || brief.item.confirmation || ""}`,
    `- Recommendation: ${brief.recommendation || "none"}`,
    "",
    "Preconditions:",
  ];
  for (const precondition of brief.preconditions || []) {
    lines.push(`- ${precondition}`);
  }
  lines.push("", "| Window | Date |", "|---|---|");
  for (const review of brief.reviews || []) {
    lines.push(`| ${cleanTable(review.label)} | ${cleanTable(review.date)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderOwnedSiteAudit(audit) {
  const rows = Array.isArray(audit?.items) ? audit.items : [];
  if (!audit) return "No owned site audit generated yet. Run `pnpm lead:owned-sites`.\n";
  const counts = audit.counts || {};
  const lines = [
    `- Status: ${audit.status || "unknown"}`,
    `- Recommendation: ${audit.recommendation || "none"}`,
    `- Ready for recording: ${counts.ready_for_recording || 0}; needs CTA tracking: ${counts.needs_cta_tracking || 0}; blocked: ${counts.blocked || 0}; needs work: ${counts.needs_work || 0}`,
    "",
    "| Plugin | URL | HTTP | Readiness | Marketplace CTA | Tracked CTA | Forms | Creem links | Next action |",
    "|---|---|---:|---|---:|---:|---:|---:|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.plugin)} | ${cleanTable(row.target_url)} | ${row.status || 0} | ${cleanTable(row.readiness)} | ${row.marketplace_link_count || 0} | ${row.tracked_marketplace_link_count || 0} | ${row.form_count || 0} | ${row.direct_creem_link_count || 0} | ${cleanTable(row.next_action)} |`);
  }
  if (!rows.length) lines.push("| empty |  |  |  |  |  |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function renderOwnedSiteCtaKit(kit) {
  const rows = Array.isArray(kit?.items) ? kit.items : [];
  if (!kit) return "No owned site CTA kit generated yet. Run `pnpm lead:owned-site-cta`.\n";
  const counts = kit.counts || {};
  const lines = [
    `- Status: ${kit.status || "unknown"}`,
    `- Recommendation: ${kit.recommendation || "none"}`,
    `- Ready to update: ${counts.ready_site_update_confirmation_required || 0}; blocked/prepare-only: ${counts.blocked_prepare_only || 0}; already tracked: ${counts.already_tracked_record_after_confirmation || 0}`,
    "",
    "| Plugin | Site | Status | CTA | Campaign | Confirmation | Next action |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.plugin)} | ${cleanTable(row.target_url)} | ${cleanTable(row.status)} | ${cleanTable(row.cta_label)} | ${cleanTable(row.campaign)} | ${cleanTable(row.confirmation)} | ${cleanTable(row.next_action)} |`);
  }
  if (!rows.length) lines.push("| empty |  |  |  |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function renderOwnedSiteImplementation(brief) {
  const rows = Array.isArray(brief?.items) ? brief.items : [];
  if (!brief) return "No owned-site implementation brief generated yet. Run `pnpm lead:owned-site-implementation`.\n";
  const counts = brief.counts || {};
  const lines = [
    `- Status: ${brief.status || "unknown"}`,
    `- Recommendation: ${brief.recommendation || "none"}`,
    `- Ready: ${counts.ready_confirmation_required || 0}; blocked checkout: ${counts.blocked_by_checkout || 0}; blocked compliance: ${counts.blocked_by_compliance || 0}`,
    "",
    "| Status | Plugin | Site | CTA | Related ready | Confirmation |",
    "|---|---|---|---|---:|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.status)} | ${cleanTable(row.plugin)} | ${cleanTable(row.site_url)} | ${cleanTable(row.primary_cta_label)} | ${row.related_plugin_links?.length || 0} | ${cleanTable(row.confirmation)} |`);
  }
  if (!rows.length) lines.push("| empty |  |  |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function renderUseCasePages(brief) {
  const rows = Array.isArray(brief?.items) ? brief.items : [];
  if (!brief) return "No use-case page brief generated yet. Run `pnpm lead:use-case-pages`.\n";
  const counts = brief.counts || {};
  const lines = [
    `- Status: ${brief.status || "unknown"}`,
    `- Recommendation: ${brief.recommendation || "none"}`,
    `- Ready/local: ${(counts.ready_confirmation_required || 0) + (counts.ready_local_copy || 0)}; blocked checkout: ${counts.blocked_by_checkout || 0}; blocked compliance: ${counts.blocked_by_compliance || 0}`,
    "",
    "| Status | Plugin | URL | Keyword | Campaign | Confirmation |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.status)} | ${cleanTable(row.plugin)} | ${cleanTable(row.url)} | ${cleanTable(row.target_keyword)} | ${cleanTable(row.campaign)} | ${cleanTable(row.confirmation)} |`);
  }
  if (!rows.length) lines.push("| empty |  |  |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function renderCustomerFeedback(customerFeedback) {
  const rows = Array.isArray(customerFeedback?.items) ? customerFeedback.items : [];
  if (!rows.length) return "No customer feedback queue generated yet. Run `pnpm lead:customer-feedback`.\n";
  const ready = rows.filter((row) => row.status === "ready_confirmation_required").length;
  const held = rows.filter((row) => row.status === "hold_payment_compliance").length;
  const lines = [
    `- Status: ${customerFeedback.status || "unknown"}`,
    `- Ready: ${ready}`,
    `- Held: ${held}`,
    `- Recommendation: ${customerFeedback.recommendation || "none"}`,
    "",
    "| Plugin | Customer | Amount | Status | Confirmation |",
    "|---|---|---:|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.plugin)} | ${cleanTable(`${row.customer_name} <${row.customer_email}>`)} | $${Number(row.amount_usd || 0).toFixed(2)} | ${cleanTable(row.status)} | ${cleanTable(row.confirmation)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderCustomerFeedbackBrief(brief) {
  if (!brief?.item) return "No ready customer feedback confirmation brief. Run `pnpm lead:customer-feedback-brief`.\n";
  const reviews = Array.isArray(brief.reviews) ? brief.reviews : [];
  const lines = [
    `- Status: ${brief.status || "unknown"}`,
    `- Target: ${brief.item.customer_name} <${brief.item.customer_email}>`,
    `- Plugin: ${brief.item.plugin}`,
    `- Confirmation: ${brief.external_action?.confirmation || brief.item.confirmation || ""}`,
    `- Verification: ${brief.external_action?.verification || brief.item.verification || ""}`,
    "",
    "| Window | Date |",
    "|---|---|",
  ];
  for (const review of reviews) {
    lines.push(`| ${cleanTable(review.label)} | ${cleanTable(review.date)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderCustomerFeedbackReview(review) {
  const rows = Array.isArray(review?.rows) ? review.rows : [];
  if (!rows.length) return "No sent customer feedback review queue yet. Run `pnpm lead:customer-feedback-review` after a confirmed send is recorded.\n";
  const lines = [
    `- Status: ${review.status || "unknown"}`,
    `- Due reviews: ${review.due_reviews ?? "unknown"}`,
    `- Scheduled reviews: ${review.scheduled_reviews ?? "unknown"}`,
    `- Signal reviews: ${review.signal_reviews ?? "unknown"}`,
    `- Recommendation: ${review.recommendation || "none"}`,
    "",
    "| Status | Sent | Plugin | Customer | Next/due | Latest review |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.status)} | ${cleanTable(row.sent_date)} | ${cleanTable(row.plugin)} | ${cleanTable(row.customer)} | ${cleanTable(row.next_due_date)} | ${cleanTable(latestReviewText(row.latest_review))} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderConfirmationQueue(queue) {
  const rows = Array.isArray(queue?.rows) ? queue.rows : [];
  if (!queue) return "No confirmation queue generated yet. Run `pnpm lead:confirmations`.\n";
  const counts = queue.counts || {};
  const lines = [
    `- Status: ${queue.status || "unknown"}`,
    `- Recommendation: ${queue.recommendation || "none"}`,
    `- Next confirmation: ${queue.next_confirmation || "none"}`,
    `- Ready: ${counts.ready_confirmation_required || 0}; needs decision: ${counts.needs_decision || 0}; waiting: ${counts.waiting_provider || 0}; blocked: ${counts.blocked || 0}`,
    "",
    "| Readiness | Plugin | Kind | Target | Record? | Confirmation |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows.slice(0, 8)) {
    lines.push(`| ${cleanTable(row.readiness)} | ${cleanTable(row.plugin)} | ${cleanTable(row.kind)} | ${cleanTable(row.target)} | ${row.record_command ? "yes" : "no"} | ${cleanTable(row.confirmation)} |`);
  }
  if (!rows.length) lines.push("| empty |  |  |  |  |  |");
  return `${lines.join("\n")}\n`;
}

function latestReviewText(review) {
  if (!review) return "";
  return `${review.window || ""} ${review.status || ""}${review.date ? ` on ${review.date}` : ""}`.trim();
}

function cleanTable(value) {
  return String(value || "")
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function channelCard(priority, channel) {
  const cards = Array.isArray(priority?.cards) ? priority.cards : [];
  return cards.find((card) => card.channel === channel) || null;
}

function genericPostsHeld(priority) {
  const card = channelCard(priority, "Generic Public Posts");
  return String(card?.decision || "").startsWith("hold");
}

function complianceDeadline(row) {
  const text = `${row.evidence || ""}\n${row.note || ""}`;
  const match = text.match(/email_ts\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/i);
  const timestamp = match ? (/(?:Z|[+-][0-9]{2}:?[0-9]{2})$/.test(match[1]) ? match[1] : `${match[1]}Z`) : row.date ? `${row.date}T00:00:00Z` : "";
  const warningDate = timestamp ? new Date(timestamp) : null;
  if (!warningDate || Number.isNaN(warningDate.getTime())) return null;
  const deadline = new Date(warningDate.getTime() + 72 * 60 * 60 * 1000);
  const hoursRemaining = Math.ceil((deadline.getTime() - Date.now()) / (60 * 60 * 1000));
  return {
    deadline_at: deadline.toISOString(),
    hours_remaining: hoursRemaining,
    urgency: hoursRemaining <= 0 ? "expired" : hoursRemaining <= 24 ? "urgent" : "active",
  };
}

function complianceDeadlineText(row) {
  const deadline = complianceDeadline(row);
  if (!deadline) return "";
  return ` Deadline: ${deadline.deadline_at} (${deadline.hours_remaining}h remaining, ${deadline.urgency}).`;
}

function actionLines(summary, plugin, queueData, channelPriority, actionReview) {
  const lines = [];

  if (channelPriority?.recommendation) {
    lines.push(`Channel priority: ${channelPriority.recommendation}`);
  }

  if (summary.todayPlan?.recommendation) {
    lines.push(`Today plan: ${summary.todayPlan.recommendation}`);
  }

  if (summary.openComplianceWarnings?.length) {
    const warning = summary.openComplianceWarnings[0];
    lines.push(`Compliance warning: ${warning.target || warning.campaign || "open warning"} is ${warning.status}. Evidence: ${warning.evidence || "see action log"}.${complianceDeadlineText(warning)} Resolve before pushing checkout-heavy traffic.`);
  }

  if (summary.checkoutOrigin?.recommendation) {
    lines.push(`Checkout origin: ${summary.checkoutOrigin.recommendation}`);
  }

  if (summary.paymentComplianceRecovery?.recommendation) {
    lines.push(`Payment recovery: ${summary.paymentComplianceRecovery.recommendation}`);
  }

  if (actionReview?.due_reviews > 0) {
    lines.push(`Action review: ${actionReview.recommendation}`);
  }

  if (summary.marketplacePreflight?.recommendation) {
    lines.push(`Marketplace preflight: ${summary.marketplacePreflight.recommendation}`);
  }

  if (summary.marketplacePublic?.recommendation) {
    lines.push(`Marketplace public listing: ${summary.marketplacePublic.recommendation}`);
  }

  if (summary.marketplacePostflight?.recommendation) {
    lines.push(`Marketplace postflight: ${summary.marketplacePostflight.recommendation}`);
  }

  if (summary.marketplaceReview?.recommendation) {
    lines.push(`Marketplace review: ${summary.marketplaceReview.recommendation}`);
  } else if (summary.marketplaceUploadDone) {
    lines.push("Marketplace upload is logged as done; monitor `lead:events`, `lead:forms`, and Framer opens/users for proof of live traction.");
  } else if (plugin.ok) {
    lines.push("Upload the current `plugin.zip` from the public plugin page via `More options -> New Version`; after upload, record it with `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '<framer-upload-confirmation-url-or-screenshot>'` after replacing the evidence placeholder.");
  } else {
    lines.push("Regenerate and validate `plugin.zip` with `pnpm run pack && pnpm release:plugin-check` before touching Marketplace.");
  }

  if (summary.queue > 0) {
    const generatedAt = queueData.generated_at || "unknown";
    const variants = Array.from(
      new Set((queueData.queue || []).map((item) => item.variant).filter(Boolean)),
    );
    const variantText = variants.length ? ` (${variants.join(", ")})` : "";
    lines.push(`Send or draft the ${summary.queue} queued agency email(s)${variantText} once Gmail is available; queue generated at ${generatedAt}.`);
  }

  if (summary.day3Readiness?.recommendation) {
    lines.push(`Day 3 readiness: ${summary.day3Readiness.recommendation}`);
  }

  if (summary.day3Brief?.tranche_plan?.total_queue) {
    const tranche = summary.day3Brief.tranche_plan;
    lines.push(`Day 3 pilot: when the send date arrives and full preflight passes, start with ${tranche.recommended_size}/${tranche.total_queue} queued emails before expanding.`);
  }

  if (summary.followupPreflight?.recommendation) {
    lines.push(`Follow-up preflight: ${summary.followupPreflight.recommendation}`);
  }

  if (summary.distributionReview?.recommendation && genericPostsHeld(channelPriority)) {
    lines.push("Distribution review: Generic Public Posts are on hold by channel priority. Upload Marketplace first, then test Framer Community priority 1 before broader priority posts.");
  } else if (summary.distributionReview?.recommendation) {
    lines.push(`Distribution review: ${summary.distributionReview.recommendation}`);
  } else if (summary.events === 0 && summary.submissions === 0 && summary.publishedPosts === 0) {
    lines.push("No public traffic yet and no post is logged. Publish priority 1 and 2 from `.tmp/framer-distribution-kit.md` first: `Framer AEO benchmark post` and `Agency handoff post`, then record both with the included `pnpm lead:actions -- --add` commands.");
  } else if (summary.events === 0 && summary.submissions === 0) {
    lines.push("Posts are logged but there is still no tracked CTA/form intent; rerun `pnpm lead:events && pnpm lead:forms`, then revise the distribution hook before posting lower-priority items.");
  }

  if (summary.communityReview?.recommendation) {
    const preflightBlocks = summary.communityPreflight && summary.communityPreflight.publish_allowed === false;
    lines.push(
      preflightBlocks
        ? `Community review: ${summary.communityReview.recommendation} Final publish gate is blocked by Community preflight.`
        : `Community review: ${summary.communityReview.recommendation}`,
    );
  }

  if (summary.communityPreflight?.recommendation) {
    lines.push(`Community preflight: ${summary.communityPreflight.recommendation}`);
  }

  if (summary.directoryReview?.recommendation) {
    lines.push(`Directory review: ${summary.directoryReview.recommendation}`);
  }

  if (summary.partnerReview?.recommendation) {
    lines.push(`Partner review: ${summary.partnerReview.recommendation}`);
  }

  if (summary.deployReview?.recommendation) {
    lines.push(`Deploy review: ${summary.deployReview.recommendation}`);
  }

  if (summary.netlifyRecovery?.recommendation) {
    lines.push(`Netlify recovery: ${summary.netlifyRecovery.recommendation}`);
  }

  if (summary.trackingFreshness?.recommendation) {
    lines.push(`Production tracking: ${summary.trackingFreshness.recommendation}`);
  }

  if (summary.localTrackingFreshness?.recommendation) {
    lines.push(`Local tracking: ${summary.localTrackingFreshness.recommendation}`);
  }

  if (summary.creemStore?.recommendation) {
    const status = summary.creemStore.status || "unknown";
    const polyglotCount = Array.isArray(summary.creemStore.polyglot_new_transactions)
      ? summary.creemStore.polyglot_new_transactions.length
      : 0;
    const commandCount = Array.isArray(summary.creemStore.revenue_commands)
      ? summary.creemStore.revenue_commands.length
      : 0;
    const baselineCount = Array.isArray(summary.creemStore.baseline_polyglot_transactions)
      ? summary.creemStore.baseline_polyglot_transactions.length
      : 0;
    if (polyglotCount > 0 || commandCount > 0) {
      lines.push(`Creem store monitor: ${polyglotCount} new Polyglot transaction(s) found; confirm them manually, then run the generated lead:revenue command(s).`);
    } else if (baselineCount > 0) {
      lines.push(`Creem store monitor: ${baselineCount} baseline Polyglot transaction(s) need manual revenue-ledger review before assuming no historical revenue was missed.`);
    } else if (status === "missing_api_key" || status === "fetch_failed") {
      lines.push(`Creem store monitor: ${summary.creemStore.recommendation}`);
    }
  }

  if (summary.pendingRevenue > 0) {
    lines.push("Verify pending Creem/Gmail revenue signals and update `lead:revenue` with amount and customer.");
  }

  if (!summary.marketplaceUploadDone || summary.publishedPosts === 0) {
    lines.push("Open `.tmp/framer-launch-console.html` for the shortest execution path: Marketplace upload, priority posts, record commands, and review commands in one page.");
  }

  if (summary.due > 0) {
    lines.push(`Process ${summary.due} due CRM row(s), but only mark sent after a Gmail SENT id or manual send evidence exists.`);
  }

  return lines;
}

function commandLines({ args, summary }) {
  const lines = [
    "pnpm lead:portfolio-ops",
    "pnpm release:plugin-check",
    "pnpm release:marketplace-brief",
    "pnpm lead:checkout-origin",
    "pnpm lead:public-health",
    "pnpm lead:portfolio",
    "pnpm lead:portfolio-experiments",
    "pnpm lead:asset-kits",
    "pnpm lead:landing-baseline",
    "pnpm lead:asset-coverage",
    "pnpm lead:landing-target-decision",
    "pnpm lead:landing-baseline-brief",
    "pnpm lead:owned-sites",
    "pnpm lead:owned-site-cta",
    "pnpm lead:plugin-channel-fit",
    "pnpm lead:cross-promo",
    "pnpm lead:owned-site-implementation",
    "pnpm lead:use-case-pages",
    "pnpm lead:customer-feedback",
    "pnpm lead:customer-feedback-brief",
    "pnpm lead:customer-feedback-review",
    "pnpm lead:confirmations",
    "pnpm lead:experiment-decisions",
    "pnpm lead:goal-coverage",
    "pnpm lead:executive",
    "pnpm lead:partners",
    "pnpm lead:portfolio-weekly",
    "pnpm lead:marketplace-preflight",
    "pnpm lead:site-check",
    "pnpm lead:tracking-freshness",
    "pnpm lead:local-tracking-freshness",
    "pnpm lead:netlify-recovery",
    "pnpm lead:netlify-apply -- --dry-run",
    "pnpm lead:deploy-review",
    "pnpm lead:action-review",
    "pnpm lead:gate",
    "pnpm lead:distribution",
    "pnpm lead:community",
    "pnpm lead:community-lint",
    "pnpm lead:community-preflight",
    "pnpm lead:community-brief",
    "pnpm lead:community-review",
    "pnpm lead:directory",
    "pnpm lead:directory-record -- --campaign frameplate_plugin --evidence '<submission-confirmation-or-screenshot>'",
    "pnpm lead:directory-review",
    "pnpm lead:partner-review",
    "pnpm lead:distribution-review",
    "pnpm lead:today",
    "pnpm lead:launch-console",
    "pnpm lead:actions",
    "pnpm lead:marketplace",
    "pnpm lead:marketplace-public -- --record",
    "pnpm lead:marketplace-postflight",
    `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${UPLOAD_EVIDENCE_PLACEHOLDER}'`,
    `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${CREATOR_SPACE_EVIDENCE_PLACEHOLDER}' --users <users> --opens <opens> --version <version> --updated "<updated>"`,
    "pnpm lead:marketplace-review",
    "pnpm lead:signal-sweep",
    "pnpm lead:creem-store",
    "pnpm lead:creem-compliance",
    "pnpm lead:cloudflare-recovery",
    "pnpm lead:cloudflare-apply -- --dry-run",
    "pnpm lead:payment-compliance-recovery",
    "pnpm lead:blocker-brief",
    "pnpm lead:public-preflight",
    "pnpm lead:next-public-actions",
    "pnpm lead:channel-priority",
    "pnpm lead:marketplace -- --add --users 1 --opens 1 --version 1 --updated \"1d ago\" --note \"Creator Space dashboard\"",
    "sed -n '1,190p' .tmp/framer-distribution-kit.md",
    "sed -n '1,220p' .tmp/framer-community-feed-kit.md",
    "sed -n '1,220p' .tmp/framer-directory-submit-kit.md",
    "pnpm lead:forms && pnpm lead:events && pnpm lead:tracking-freshness && pnpm lead:netlify-recovery && pnpm lead:netlify-apply -- --dry-run && pnpm lead:signal-sweep && pnpm lead:report && pnpm lead:ops",
    "pnpm lead:handoff -- --url \"https://client-site.com\" --contact-email \"partner@example.com\" --agency \"Example Studio\" --context \"pre-launch client handoff\"",
  ];

  if (summary.queue > 0) {
    lines.push(
      `pnpm lead:sendpack -- --status queued --variant value-first --today ${args.today} --due-only --output .tmp/framer-queued-pack.md --html .tmp/framer-queued-pack.html --out-dir .tmp/framer-queued-pack --mark-sent .tmp/framer-mark-queued.sh`,
      "pnpm lead:gmail-queue -- --status queued --sendpack-dir .tmp/framer-queued-pack --output .tmp/framer-queued-gmail-queue.md --json .tmp/framer-queued-gmail-queue.json",
    );
  }

  if (summary.followupPreflight) {
    lines.push("pnpm lead:day3-readiness", "pnpm lead:day3-brief", "pnpm lead:monitor -- --lookback 2", "pnpm lead:followup-preflight");
  }

  return lines;
}

function render({ args, rows, revenueRows, eventData, formData, creemStore, queueData, todayPlan, day3Readiness, day3Brief, followupPreflight, actionReview, deployReview, trackingFreshness, localTrackingFreshness, checkoutOrigin, paymentComplianceRecovery, blockerBrief, netlifyRecovery, distributionReview, communityReview, communityPreflight, communityBrief, directoryReview, partnerReview, marketplaceReview, marketplacePreflight, marketplacePublic, marketplacePostflight, channelPriority, portfolio, portfolioExperiments, assetCoverage, pluginChannelFit, crossPromotion, landingBaseline, landingTargetDecision, landingBaselineBrief, ownedSiteAudit, ownedSiteCtaKit, ownedSiteImplementation, useCasePages, customerFeedback, customerFeedbackBrief, customerFeedbackReview, confirmationQueue, experimentDecision, goalCoverage, actionRows, marketplaceRows, plugin }) {
  const events = Array.isArray(eventData.events) ? eventData.events : [];
  const summary = summarize(rows, revenueRows, events, { ...formData, today: args.today }, creemStore, queueData, todayPlan, day3Readiness, day3Brief, followupPreflight, deployReview, trackingFreshness, localTrackingFreshness, checkoutOrigin, paymentComplianceRecovery, blockerBrief, netlifyRecovery, distributionReview, communityReview, communityPreflight, communityBrief, directoryReview, partnerReview, marketplaceReview, marketplacePreflight, marketplacePublic, marketplacePostflight, actionRows, marketplaceRows, plugin);
  const actions = actionLines(summary, plugin, queueData, channelPriority, actionReview);
  const commands = commandLines({ args, summary });

  const lines = [
    "# Framer Growth Ops",
    "",
    `Date: ${args.today}`,
    `CRM: ${args.crm}`,
    `Plugin zip: ${args.pluginZip}`,
    "",
    "## Today",
    "",
  ];

  actions.forEach((action, index) => {
    lines.push(`${index + 1}. ${action}`);
  });

  lines.push(
    "",
    "## Funnel",
    "",
    `- CRM leads: ${summary.total}`,
    `- Open leads: ${summary.open}`,
    `- Due today: ${summary.due}`,
    `- Sent leads: ${summary.sent}`,
    `- Replies: ${summary.replies} (${summary.replyRate})`,
    `- Opportunities: ${summary.opportunities} (${summary.opportunityRate})`,
    `- Bounces: ${summary.bounced}`,
    `- Tracked pipeline value: ${formatUsd(summary.pipelineValue)}`,
    `- Booked revenue: ${formatUsd(summary.bookedRevenue)}`,
    `- Pending revenue signals: ${summary.pendingRevenue}${summary.pendingRevenueValue ? ` (${formatUsd(summary.pendingRevenueValue)} known value)` : ""}`,
    `- Creem store monitor: ${summary.creemStore?.status || "not generated"}`,
    `- CTA events: ${summary.events} (${summary.installEvents} install, ${summary.checkoutEvents} checkout)`,
    `- Form submissions: ${summary.submissions}`,
    `- Gmail queue items: ${summary.queue}`,
    `- External actions logged: ${summary.actions}`,
    `- Open compliance warnings: ${summary.openComplianceWarnings.length}`,
    `- Checkout origin readiness: ${summary.checkoutOrigin?.status || "not generated"}`,
    `- Distribution posts logged: ${summary.publishedPosts}`,
    `- Marketplace upload logged done: ${summary.marketplaceUploadDone ? "yes" : "no"}`,
    "",
    "## Plugin Release Gate",
    "",
  );

  if (plugin.exists) {
    lines.push(
      `- Status: ${plugin.ok ? "ready" : "not ready"}`,
      `- Modified: ${plugin.mtime}`,
      `- Size: ${plugin.size} bytes`,
      `- Entries: ${plugin.entries}`,
      `- SHA256: ${plugin.sha256}`,
      `- Checkout bridge markers: ${plugin.missingMarkers?.length ? `missing ${plugin.missingMarkers.join(", ")}` : "present"}`,
    );
  } else {
    lines.push(`- Status: missing (${plugin.error || "not found"})`);
  }

  lines.push(
    "",
    "## Today Execution Plan",
    "",
    renderTodayPlan(summary.todayPlan),
    "## Confirmation Queue",
    "",
    renderConfirmationQueue(confirmationQueue),
    "## Portfolio Priority",
    "",
    renderPortfolioPriority(portfolio),
    "## Portfolio Experiments",
    "",
    renderPortfolioExperiments(portfolioExperiments),
    "## Experiment Decisions",
    "",
    renderExperimentDecision(experimentDecision),
    "## Goal Coverage",
    "",
    renderGoalCoverage(goalCoverage),
    "## Asset Coverage",
    "",
    renderAssetCoverage(assetCoverage),
    "## Plugin Channel Fit",
    "",
    renderPluginChannelFit(pluginChannelFit),
    "## Cross-Promotion Matrix",
    "",
    renderCrossPromotion(crossPromotion),
    "## Landing Baselines",
    "",
    renderLandingBaseline(landingBaseline),
    "## Landing Target Decision",
    "",
    renderLandingTargetDecision(landingTargetDecision),
    "## Landing Baseline Confirmation Brief",
    "",
    renderLandingBaselineBrief(landingBaselineBrief),
    "## Owned Site Audit",
    "",
    renderOwnedSiteAudit(ownedSiteAudit),
    "## Owned Site CTA Kit",
    "",
    renderOwnedSiteCtaKit(ownedSiteCtaKit),
    "## Owned Site Implementation",
    "",
    renderOwnedSiteImplementation(ownedSiteImplementation),
    "## Use-Case Pages",
    "",
    renderUseCasePages(useCasePages),
    "## Customer Feedback Queue",
    "",
    renderCustomerFeedback(customerFeedback),
    "## Customer Feedback Confirmation Brief",
    "",
    renderCustomerFeedbackBrief(customerFeedbackBrief),
    "## Customer Feedback Review",
    "",
    renderCustomerFeedbackReview(customerFeedbackReview),
    "## Due CRM Rows",
    "",
    renderDue(summary.dueRows),
    "## Gmail Queue",
    "",
    renderQueue(summary.queueRows),
    "## Day 3 Readiness",
    "",
    renderDay3Readiness(summary.day3Readiness),
    "## Day 3 Send Brief",
    "",
    renderDay3Brief(summary.day3Brief),
    "## Follow-Up Preflight",
    "",
    renderFollowupPreflight(summary.followupPreflight),
    "## Compliance Warnings",
    "",
    renderComplianceWarnings(summary.openComplianceWarnings),
    "## Creem Store Monitor",
    "",
    renderCreemStore(summary.creemStore),
    "## Checkout Origin Readiness",
    "",
    renderCheckoutOrigin(summary.checkoutOrigin),
    "## Payment Compliance Recovery",
    "",
    renderPaymentComplianceRecovery(summary.paymentComplianceRecovery),
    "## Blocker Resolution Brief",
    "",
    renderBlockerBrief(summary.blockerBrief),
    "## Recent External Actions",
    "",
    renderActions(summary.recentActions),
    "## Marketplace Snapshot",
    "",
    renderMarketplace(summary.latestMarketplace),
    "## Marketplace Review",
    "",
    renderMarketplaceReview(summary.marketplaceReview),
    "## Marketplace Upload Preflight",
    "",
    renderMarketplacePreflight(summary.marketplacePreflight),
    "## Marketplace Public Listing",
    "",
    renderMarketplacePublic(summary.marketplacePublic),
    "## Marketplace Postflight",
    "",
    renderMarketplacePostflight(summary.marketplacePostflight),
    "## Channel Priority",
    "",
    renderChannelPriority(channelPriority),
    "## Public Action Review",
    "",
    renderActionReview(actionReview),
    "## Deploy Review",
    "",
    renderDeployReview(summary.deployReview),
    "## Production Tracking Freshness",
    "",
    renderTrackingFreshness(summary.trackingFreshness),
    "## Local Tracking Freshness",
    "",
    renderLocalTrackingFreshness(summary.localTrackingFreshness),
    "## Netlify Recovery",
    "",
    renderNetlifyRecovery(summary.netlifyRecovery),
    "## Status Mix",
    "",
    renderCountList(rows, "status", "No CRM rows found."),
    "## Signal Mix",
    "",
    `- Netlify event form: ${eventData.form?.name || "unknown"} (${eventData.form?.submission_count ?? 0} total submissions reported by Netlify)`,
    `- Netlify mini-audit form: ${formData.form?.name || "unknown"} (${formData.form?.submission_count ?? 0} total submissions reported by Netlify)`,
    "",
    "## Distribution Review",
    "",
    renderDistributionReview(summary.distributionReview, channelPriority),
    "",
    "## Community Review",
    "",
    renderCommunityReview(summary.communityReview),
    "",
    "## Community Publish Preflight",
    "",
    renderCommunityPreflight(summary.communityPreflight),
    "",
    "## Community Launch Brief",
    "",
    renderCommunityBrief(summary.communityBrief),
    "",
    "## Directory Review",
    "",
    renderDirectoryReview(summary.directoryReview),
    "",
    "## Partner Review",
    "",
    renderPartnerReview(summary.partnerReview),
    "",
    "## Commands",
    "",
    "```bash",
    ...commands,
    "```",
    "",
    "## Guardrails",
    "",
    "- Do not mark queued leads as sent until Gmail returns a SENT/message id or there is manual send evidence.",
    "- Do not send Day 3 follow-ups before the scheduled date shown by `pnpm lead:monitor`.",
    "- Contact form submissions still require manual confirmation before submitting anything on a third-party site.",
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

  const [rows, revenueRows, eventData, formData, creemStore, queueData, todayPlan, day3Readiness, day3Brief, followupPreflight, actionReview, deployReview, trackingFreshness, localTrackingFreshness, checkoutOrigin, paymentComplianceRecovery, blockerBrief, netlifyRecovery, distributionReview, communityReview, communityPreflight, communityBrief, directoryReview, partnerReview, marketplaceReview, marketplacePreflight, marketplacePublic, marketplacePostflight, channelPriority, portfolio, portfolioExperiments, assetCoverage, pluginChannelFit, crossPromotion, landingBaseline, landingTargetDecision, landingBaselineBrief, ownedSiteAudit, ownedSiteCtaKit, ownedSiteImplementation, useCasePages, customerFeedback, customerFeedbackBrief, customerFeedbackReview, confirmationQueue, experimentDecision, goalCoverage, actionRows, marketplaceRows, plugin] = await Promise.all([
    readRows(args.crm),
    readRows(args.revenue),
    readJson(args.events, { events: [] }),
    readJson(args.forms, { submissions: [] }),
    readJson(args.creemStore, null),
    readJson(args.gmailQueue, { queue: [] }),
    readJson(args.todayPlan, null),
    readJson(args.day3Readiness, null),
    readJson(args.day3Brief, null),
    readJson(args.followupPreflight, null),
    readJson(args.actionReview, null),
    readJson(args.deployReview, null),
    readJson(args.trackingFreshness, null),
    readJson(args.localTrackingFreshness, null),
    readJson(args.checkoutOrigin, null),
    readJson(args.paymentComplianceRecovery, null),
    readJson(args.blockerBrief, null),
    readJson(args.netlifyRecovery, null),
    readJson(args.distributionReview, null),
    readJson(args.communityReview, null),
    readJson(args.communityPreflight, null),
    readJson(args.communityBrief, null),
    readJson(args.directoryReview, null),
    readJson(args.partnerReview, null),
    readJson(args.marketplaceReview, null),
    readJson(args.marketplacePreflight, null),
    readJson(args.marketplacePublic, null),
    readJson(args.marketplacePostflight, null),
    readJson(args.channelPriority, null),
    readJson(args.portfolio, null),
    readJson(args.portfolioExperiments, null),
    readJson(args.assetCoverage, null),
    readJson(args.pluginChannelFit, null),
    readJson(args.crossPromotion, null),
    readJson(args.landingBaseline, null),
    readJson(args.landingTargetDecision, null),
    readJson(args.landingBaselineBrief, null),
    readJson(args.ownedSiteAudit, null),
    readJson(args.ownedSiteCtaKit, null),
    readJson(args.ownedSiteImplementation, null),
    readJson(args.useCasePages, null),
    readJson(args.customerFeedback, null),
    readJson(args.customerFeedbackBrief, null),
    readJson(args.customerFeedbackReview, null),
    readJson(args.confirmationQueue, null),
    readJson(args.experimentDecision, null),
    readJson(args.goalCoverage, null),
    readRows(args.actions),
    readRows(args.marketplace),
    inspectPluginZip(args.pluginZip),
  ]);

  const markdown = render({
    args,
    rows,
    revenueRows,
    eventData,
    formData,
    creemStore,
    queueData,
    todayPlan,
    day3Readiness,
    day3Brief,
    followupPreflight,
    actionReview,
    deployReview,
    trackingFreshness,
    localTrackingFreshness,
    checkoutOrigin,
    paymentComplianceRecovery,
    blockerBrief,
    netlifyRecovery,
    distributionReview,
    communityReview,
    communityPreflight,
    communityBrief,
    directoryReview,
    partnerReview,
    marketplaceReview,
    marketplacePreflight,
    marketplacePublic,
    marketplacePostflight,
    channelPriority,
    portfolio,
    portfolioExperiments,
    assetCoverage,
    pluginChannelFit,
    crossPromotion,
    landingBaseline,
    landingTargetDecision,
    landingBaselineBrief,
    ownedSiteAudit,
    ownedSiteCtaKit,
    ownedSiteImplementation,
    useCasePages,
    customerFeedback,
    customerFeedbackBrief,
    customerFeedbackReview,
    confirmationQueue,
    experimentDecision,
    goalCoverage,
    actionRows,
    marketplaceRows,
    plugin,
  });
  await writeText(args.output, markdown);
  process.stdout.write(markdown);
  process.stdout.write(`Dashboard written to ${args.output}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
