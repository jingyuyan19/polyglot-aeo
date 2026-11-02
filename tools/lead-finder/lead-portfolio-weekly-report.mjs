#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_PARTNERS = "tools/lead-finder/partners.local.csv";
const DEFAULT_TODAY = ".tmp/framer-today.json";
const DEFAULT_CHANNEL_PRIORITY = ".tmp/framer-channel-priority.json";
const DEFAULT_PLUGIN_CHANNEL_FIT = ".tmp/framer-plugin-channel-fit.json";
const DEFAULT_LOKA_INVENTORY = ".tmp/loka-checkout-origin-inventory.json";
const DEFAULT_ASSET_KITS = ".tmp/framer-plugin-asset-kits.json";
const DEFAULT_LANDING_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_LANDING_TARGET_DECISION = ".tmp/framer-landing-target-decision.json";
const DEFAULT_LANDING_BASELINE_BRIEF = ".tmp/framer-landing-baseline-brief.json";
const DEFAULT_OWNED_SITE_AUDIT = ".tmp/framer-owned-site-audit.json";
const DEFAULT_OWNED_SITE_CTA_KIT = ".tmp/framer-owned-site-cta-kit.json";
const DEFAULT_CROSS_PROMOTION = ".tmp/framer-cross-promotion-matrix.json";
const DEFAULT_OWNED_SITE_IMPLEMENTATION = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_USE_CASE_PAGES = ".tmp/framer-use-case-page-brief.json";
const DEFAULT_USE_CASE_PAGE_PACKAGES = ".tmp/framer-use-case-page-packages.json";
const DEFAULT_PUBLISH_PREFLIGHT = ".tmp/framer-publish-preflight.json";
const DEFAULT_CREEM_LINKS = ".tmp/framer-creem-link-inventory.json";
const DEFAULT_CREEM_STORE_VERIFICATION = ".tmp/framer-creem-store-verification-brief.json";
const DEFAULT_CUSTOMER_FEEDBACK = ".tmp/framer-customer-feedback-queue.json";
const DEFAULT_CUSTOMER_FEEDBACK_BRIEF = ".tmp/framer-customer-feedback-brief.json";
const DEFAULT_CUSTOMER_FEEDBACK_REVIEW = ".tmp/framer-customer-feedback-review.json";
const DEFAULT_CONFIRMATION_QUEUE = ".tmp/framer-confirmation-queue.json";
const DEFAULT_EXPERIMENT_DECISION = ".tmp/framer-experiment-decision-brief.json";
const DEFAULT_OUTPUT = ".tmp/framer-portfolio-weekly-report.md";
const DEFAULT_JSON = ".tmp/framer-portfolio-weekly-report.json";

function usage() {
  return `
Usage:
  pnpm lead:portfolio-weekly

Options:
  --portfolio <file>          Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --experiments <file>        Portfolio experiments JSON. Default: ${DEFAULT_EXPERIMENTS}
  --actions <file>            Action log CSV. Default: ${DEFAULT_ACTIONS}
  --revenue <file>            Revenue CSV. Default: ${DEFAULT_REVENUE}
  --partners <file>           Partner log CSV. Default: ${DEFAULT_PARTNERS}
  --today-plan <file>         Today JSON. Default: ${DEFAULT_TODAY}
  --channel-priority <file>   Channel priority JSON. Default: ${DEFAULT_CHANNEL_PRIORITY}
  --plugin-channel-fit <file> Plugin/channel fit JSON. Default: ${DEFAULT_PLUGIN_CHANNEL_FIT}
  --loka-inventory <file>     Loka checkout inventory JSON. Default: ${DEFAULT_LOKA_INVENTORY}
  --asset-kits <file>         Plugin asset kits JSON. Default: ${DEFAULT_ASSET_KITS}
  --landing-baseline <file>   Landing/tracking baseline JSON. Default: ${DEFAULT_LANDING_BASELINE}
  --landing-target-decision <file> Landing target decision JSON. Default: ${DEFAULT_LANDING_TARGET_DECISION}
  --landing-baseline-brief <file> Landing baseline confirmation brief JSON. Default: ${DEFAULT_LANDING_BASELINE_BRIEF}
  --owned-site-audit <file>  Owned site audit JSON. Default: ${DEFAULT_OWNED_SITE_AUDIT}
  --owned-site-cta-kit <file> Owned site CTA kit JSON. Default: ${DEFAULT_OWNED_SITE_CTA_KIT}
  --cross-promotion <file>   Cross-promotion matrix JSON. Default: ${DEFAULT_CROSS_PROMOTION}
  --owned-site-implementation <file> Owned site implementation brief JSON. Default: ${DEFAULT_OWNED_SITE_IMPLEMENTATION}
  --use-case-pages <file>    Use-case page brief JSON. Default: ${DEFAULT_USE_CASE_PAGES}
  --use-case-page-packages <file> Use-case local package JSON. Default: ${DEFAULT_USE_CASE_PAGE_PACKAGES}
  --publish-preflight <file> Publish preflight JSON. Default: ${DEFAULT_PUBLISH_PREFLIGHT}
  --creem-links <file>       Creem link inventory JSON. Default: ${DEFAULT_CREEM_LINKS}
  --creem-store-verification <file> Creem store/domain verification brief JSON. Default: ${DEFAULT_CREEM_STORE_VERIFICATION}
  --customer-feedback <file>  Customer feedback queue JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK}
  --customer-feedback-brief <file> Customer feedback confirmation brief JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK_BRIEF}
  --customer-feedback-review <file> Customer feedback review JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK_REVIEW}
  --confirmation-queue <file> Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATION_QUEUE}
  --experiment-decision <file> Experiment decision brief JSON. Default: ${DEFAULT_EXPERIMENT_DECISION}
  --output <file>             Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>               JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>        Report date. Default: local date.
  --help                      Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    portfolio: DEFAULT_PORTFOLIO,
    experiments: DEFAULT_EXPERIMENTS,
    actions: DEFAULT_ACTIONS,
    revenue: DEFAULT_REVENUE,
    partners: DEFAULT_PARTNERS,
    todayPlan: DEFAULT_TODAY,
    channelPriority: DEFAULT_CHANNEL_PRIORITY,
    pluginChannelFit: DEFAULT_PLUGIN_CHANNEL_FIT,
    lokaInventory: DEFAULT_LOKA_INVENTORY,
    assetKits: DEFAULT_ASSET_KITS,
    landingBaseline: DEFAULT_LANDING_BASELINE,
    landingTargetDecision: DEFAULT_LANDING_TARGET_DECISION,
    landingBaselineBrief: DEFAULT_LANDING_BASELINE_BRIEF,
    ownedSiteAudit: DEFAULT_OWNED_SITE_AUDIT,
    ownedSiteCtaKit: DEFAULT_OWNED_SITE_CTA_KIT,
    crossPromotion: DEFAULT_CROSS_PROMOTION,
    ownedSiteImplementation: DEFAULT_OWNED_SITE_IMPLEMENTATION,
    useCasePages: DEFAULT_USE_CASE_PAGES,
    useCasePagePackages: DEFAULT_USE_CASE_PAGE_PACKAGES,
    publishPreflight: DEFAULT_PUBLISH_PREFLIGHT,
    creemLinks: DEFAULT_CREEM_LINKS,
    creemStoreVerification: DEFAULT_CREEM_STORE_VERIFICATION,
    customerFeedback: DEFAULT_CUSTOMER_FEEDBACK,
    customerFeedbackBrief: DEFAULT_CUSTOMER_FEEDBACK_BRIEF,
    customerFeedbackReview: DEFAULT_CUSTOMER_FEEDBACK_REVIEW,
    confirmationQueue: DEFAULT_CONFIRMATION_QUEUE,
    experimentDecision: DEFAULT_EXPERIMENT_DECISION,
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
      "--portfolio": "portfolio",
      "--experiments": "experiments",
      "--actions": "actions",
      "--revenue": "revenue",
      "--partners": "partners",
      "--today-plan": "todayPlan",
      "--channel-priority": "channelPriority",
      "--plugin-channel-fit": "pluginChannelFit",
      "--loka-inventory": "lokaInventory",
      "--asset-kits": "assetKits",
      "--landing-baseline": "landingBaseline",
      "--landing-target-decision": "landingTargetDecision",
      "--landing-baseline-brief": "landingBaselineBrief",
      "--owned-site-audit": "ownedSiteAudit",
      "--owned-site-cta-kit": "ownedSiteCtaKit",
      "--cross-promotion": "crossPromotion",
      "--owned-site-implementation": "ownedSiteImplementation",
      "--use-case-pages": "useCasePages",
      "--use-case-page-packages": "useCasePagePackages",
      "--publish-preflight": "publishPreflight",
      "--creem-links": "creemLinks",
      "--creem-store-verification": "creemStoreVerification",
      "--customer-feedback": "customerFeedback",
      "--customer-feedback-brief": "customerFeedbackBrief",
      "--customer-feedback-review": "customerFeedbackReview",
      "--confirmation-queue": "confirmationQueue",
      "--experiment-decision": "experimentDecision",
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

function pluginTerms(profile) {
  const map = {
    "Polyglot AEO": ["polyglot", "framer_aeo", "plugin_upgrade"],
    "Ally Auditor": ["ally"],
    "Loka - Localization Hub": ["loka", "getloka"],
    "Gaode Maps": ["gaode", "amap"],
  };
  return map[profile.name] || [String(profile.name || "").toLowerCase()];
}

function matchesPlugin(profile, text) {
  const lower = String(text || "").toLowerCase();
  return pluginTerms(profile).some((term) => lower.includes(term.toLowerCase()));
}

function positiveExternalRevenue(row) {
  const amount = Number(row.amount_usd || 0);
  const customer = String(row.customer || "");
  const product = String(row.product || "");
  return amount > 0 && !/test/i.test(product) && !/jimmymjing@gmail\.com/i.test(customer);
}

function pluginRevenue(profile, revenueRows) {
  return revenueRows.filter((row) => positiveExternalRevenue(row) && matchesPlugin(profile, row.product));
}

function pluginActions(profile, actionRows) {
  return actionRows.filter((row) => matchesPlugin(profile, `${row.campaign || ""} ${row.target || ""} ${row.evidence || ""} ${row.note || ""}`));
}

function pluginReplies(profile, actionRows) {
  return pluginActions(profile, actionRows).filter((row) =>
    actionHasPositiveSignal(row),
  );
}

function actionHasPositiveSignal(row) {
  const text = `${row.type || ""} ${row.status || ""} ${row.evidence || ""} ${row.note || ""}`;
  if (/no reply|no human|auto[- ]?reply|automated|monitor|sweep|tooling|preflight|review|draft|planned|sent .*email|sent resource|sent .*pitch|asked .*confirm|requires explicit confirmation/i.test(text)) {
    return false;
  }
  return /human reply|customer reply|replied|testimonial|accepted|listed|backlink live|published listing|form submission|cta event|opportunity|revenue|paid customer feedback/i.test(text);
}

function experimentFor(profile, experiments) {
  const rows = Array.isArray(experiments?.experiments) ? experiments.experiments : [];
  return rows.find((row) => row.plugin === profile.name) || null;
}

function profileRows({ portfolio, experiments, actionRows, revenueRows }) {
  const profiles = Array.isArray(portfolio?.profiles) ? portfolio.profiles : [];
  return profiles
    .map((profile) => {
      const revenue = pluginRevenue(profile, revenueRows);
      const replies = pluginReplies(profile, actionRows);
      const experiment = experimentFor(profile, experiments);
      const amount = revenue.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
      return {
        plugin: profile.name,
        rank: profile.priority?.rank ?? 99,
        priority: profile.priority?.label || "",
        users: profile.creator_snapshot?.users || "",
        opens: profile.creator_snapshot?.opens || "",
        version: profile.creator_snapshot?.version || "",
        updated: profile.creator_snapshot?.updated || profile.marketplace?.updated || "",
        revenue_count: revenue.length,
        revenue_usd: amount,
        replies: replies.length,
        marketplace_url: profile.marketplace_url || "",
        public_health_status: profile.public_health?.status || "",
        public_health_issue: profile.public_health?.blockers?.[0] || profile.public_health?.gaps?.[0] || "",
        blocker: profile.blockers?.[0] || "",
        next_action: profile.next_actions?.[0] || "",
        experiment_status: experiment?.status || "",
        experiment_channel: experiment?.channel || "",
        confirmation: experiment?.confirmation || "",
      };
    })
    .sort((a, b) => a.rank - b.rank || a.plugin.localeCompare(b.plugin));
}

function channelRows(channelPriority) {
  return Array.isArray(channelPriority?.cards) ? channelPriority.cards : [];
}

function partnerSummary(partnerRows) {
  const due = partnerRows.filter((row) => row.next_review && row.next_review <= todayLocal());
  const signaled = partnerRows.filter((row) => Number(row.signal_count || 0) > 0);
  return {
    total: partnerRows.length,
    due: due.length,
    signaled: signaled.length,
    rows: partnerRows.slice(0, 10),
  };
}

function confirmationRows(experiments) {
  const rows = Array.isArray(experiments?.experiments) ? experiments.experiments : [];
  return rows
    .filter((row) => row.confirmation)
    .map((row) => ({
      plugin: row.plugin,
      channel: row.channel,
      status: row.status,
      confirmation: row.confirmation,
      target: row.action_pack?.target || row.external_action || "",
      risk: row.action_pack?.risk || "",
      expected_benefit: row.action_pack?.expected_benefit || row.primary_metric || "",
      verification: row.action_pack?.verification || row.evidence_required || "",
    }));
}

function topNextActions(profiles, todayPlan, experiments, channelFit, confirmationQueue) {
  const rows = [];
  const today = todayAction(todayPlan);
  pushUniqueAction(rows, today);
  const queuedActions = confirmationQueueActions(confirmationQueue, today?.confirmation);
  for (const queued of queuedActions) {
    if (rows.length >= 3) break;
    if (rows.some((row) => row.plugin === queued.plugin)) continue;
    pushUniqueAction(rows, queued);
  }
  for (const queued of queuedActions) {
    if (rows.length >= 3) break;
    pushUniqueAction(rows, queued);
  }
  const fitNext = channelFit?.next_channel;
  if (fitNext?.plugin && /^go/i.test(String(fitNext.decision || ""))) {
    pushUniqueAction(rows, {
      title: fitNext.next_step,
      reason: fitNext.reason,
      confirmation: fitNext.confirmation,
      plugin: fitNext.plugin,
    });
  }
  const waiting = (todayPlan?.scheduled_next || []).find((item) => item.status === "waiting_provider");
  if (waiting) {
    pushUniqueAction(rows, {
      title: waiting.title,
      reason: waiting.reason,
      confirmation: "",
      plugin: "Loka - Localization Hub",
    });
  }
  const experimentRecommendation = experiments?.recommendation || "";
  if (experimentRecommendation && !rows.some((row) => row.reason === experimentRecommendation)) {
    pushUniqueAction(rows, {
      title: "Follow portfolio experiment recommendation",
      reason: experimentRecommendation,
      confirmation: "",
      plugin: "Portfolio",
    });
  }
  for (const profile of profiles) {
    if (rows.length >= 3) break;
    if (rows.some((row) => row.plugin === profile.plugin && row.confirmation && row.confirmation === profile.confirmation)) continue;
    pushUniqueAction(rows, {
      title: profile.next_action,
      reason: profile.blocker,
      confirmation: profile.confirmation,
      plugin: profile.plugin,
    });
  }
  return rows.slice(0, 3);
}

function pushUniqueAction(rows, item) {
  if (!item) return;
  const duplicate = rows.some((row) => (
    (item.confirmation && row.confirmation === item.confirmation) ||
    (row.plugin === item.plugin && normalizeAction(row.title) === normalizeAction(item.title))
  ));
  if (!duplicate) rows.push(item);
}

function normalizeAction(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayAction(todayPlan) {
  const ready = Array.isArray(todayPlan?.needs_confirmation) ? todayPlan.needs_confirmation[0] : null;
  if (!ready) return null;
  return {
    title: ready.title || "Review today's confirmation-gated action",
    reason: ready.expected_benefit || ready.reason || todayPlan?.recommendation || "",
    confirmation: ready.confirmation || todayPlan?.next_confirmation || "",
    plugin: ready.plugin || inferPlugin(`${ready.title || ""} ${ready.reason || ""} ${ready.confirmation || ""}`),
  };
}

function inferPlugin(value) {
  const text = String(value || "");
  if (/polyglot|license\.polyglotaeo|cloudflare|worker custom domain/i.test(text)) return "Polyglot AEO";
  if (/ally/i.test(text)) return "Ally Auditor";
  if (/loka|getloka/i.test(text)) return "Loka - Localization Hub";
  if (/gaode|amap/i.test(text)) return "Gaode Maps";
  return "Portfolio";
}

function confirmationQueueActions(queue, skipConfirmation = "") {
  return (Array.isArray(queue?.rows) ? queue.rows : [])
    .filter((row) =>
      (row.readiness === "ready_confirmation_required" || row.status === "ready_confirmation_required") &&
      row.confirmation !== skipConfirmation
    )
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999))
    .map((row) => ({
      title: row.action || row.kind || "Review confirmation queue",
      reason: row.expected_benefit || row.risk || queue?.recommendation || "",
      confirmation: row.confirmation || "",
      plugin: row.plugin || "Portfolio",
    }));
}

function build({ args, portfolio, experiments, actionRows, revenueRows, partnerRows, todayPlan, channelPriority, pluginChannelFit, lokaInventory, assetKits, landingBaseline, landingTargetDecision, landingBaselineBrief, ownedSiteAudit, ownedSiteCtaKit, crossPromotion, ownedSiteImplementation, useCasePages, useCasePagePackages, publishPreflight, creemLinks, creemStoreVerification, customerFeedback, customerFeedbackBrief, customerFeedbackReview, confirmationQueue, experimentDecision }) {
  const profiles = profileRows({ portfolio, experiments, actionRows, revenueRows });
  const partners = partnerSummary(partnerRows);
  const channels = channelRows(channelPriority);
  const channelFit = pluginChannelFitSummary(pluginChannelFit);
  const confirmations = confirmationRows(experiments);
  const nextActions = topNextActions(profiles, todayPlan, experiments, channelFit, confirmationQueue);
  const assets = assetSummary(assetKits, profiles);
  const landing = landingBaselineSummary(landingBaseline);
  const feedback = customerFeedbackSummary(customerFeedback);
  const feedbackReview = customerFeedbackReviewSummary(customerFeedbackReview);
  const totalRevenue = profiles.reduce((sum, row) => sum + row.revenue_usd, 0);
  const totalReplies = profiles.reduce((sum, row) => sum + row.replies, 0);
  const blocked = profiles.filter(isRealBlocker);

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    status: profiles.length ? "ready" : "missing_portfolio",
    recommendation: recommendationFor({ experiments, todayPlan, channelFit, blocked, confirmationQueue }),
    next_confirmation: todayPlan?.next_confirmation || confirmationQueue?.next_confirmation || nextActions.find((row) => row.confirmation)?.confirmation || "",
    profiles,
    channels,
    plugin_channel_fit: channelFit,
    partners,
    assets,
    landing_baseline: landing,
    landing_target_decision: landingTargetDecisionSummary(landingTargetDecision),
    landing_baseline_brief: landingBaselineBrief || null,
    owned_site_audit: ownedSiteAuditSummary(ownedSiteAudit),
    owned_site_cta_kit: ownedSiteCtaKitSummary(ownedSiteCtaKit),
    cross_promotion: crossPromotionSummary(crossPromotion),
    owned_site_implementation: ownedSiteImplementationSummary(ownedSiteImplementation),
    use_case_pages: useCasePagesSummary(useCasePages),
    publish_preflight: publishPreflightSummary(publishPreflight),
    creem_links: creemLinksSummary(creemLinks),
    creem_store_verification: creemStoreVerificationSummary(creemStoreVerification),
    customer_feedback: feedback,
    customer_feedback_brief: customerFeedbackBrief || null,
    customer_feedback_review: feedbackReview,
    confirmation_queue: confirmationQueueSummary(confirmationQueue),
    experiment_decision: experimentDecisionSummary(experimentDecision),
    confirmations,
    next_actions: nextActions,
    totals: {
      external_revenue_usd: totalRevenue,
      external_revenue_count: profiles.reduce((sum, row) => sum + row.revenue_count, 0),
      customer_or_partner_reply_signals: totalReplies,
      partner_rows: partners.total,
      partner_due: partners.due,
      plugin_channel_fit_rows: channelFit.rows.length,
      plugin_channel_fit_go: channelFit.rows.filter((row) => /^go/i.test(row.decision)).length,
      asset_kits: assets.total,
      asset_kits_complete: assets.complete,
      landing_baseline_ready: landing.ready,
      landing_baseline_blocked: landing.blocked,
      owned_site_ready_for_recording: Number(ownedSiteAudit?.counts?.ready_for_recording || 0),
      owned_site_needs_cta_tracking: Number(ownedSiteAudit?.counts?.needs_cta_tracking || 0),
      owned_site_blocked: Number(ownedSiteAudit?.counts?.blocked || 0),
      owned_site_cta_ready: Number(ownedSiteCtaKit?.counts?.ready_site_update_confirmation_required || 0),
      owned_site_cta_blocked: Number(ownedSiteCtaKit?.counts?.blocked_prepare_only || 0),
      cross_promotion_ready: Number(crossPromotion?.counts?.ready_local_copy || 0) + Number(crossPromotion?.counts?.ready_record_after_confirmation || 0),
      cross_promotion_blocked: Number(crossPromotion?.counts?.blocked_by_checkout || 0) + Number(crossPromotion?.counts?.blocked_by_compliance || 0) + Number(crossPromotion?.counts?.blocked_prepare_only || 0),
      owned_site_implementation_ready: Number(ownedSiteImplementation?.counts?.ready_confirmation_required || 0) + Number(ownedSiteImplementation?.counts?.ready_record_after_confirmation || 0),
      owned_site_implementation_blocked: Number(ownedSiteImplementation?.counts?.blocked_by_checkout || 0) + Number(ownedSiteImplementation?.counts?.blocked_by_compliance || 0) + Number(ownedSiteImplementation?.counts?.blocked_prepare_only || 0),
      use_case_pages_ready: Number(useCasePages?.counts?.ready_confirmation_required || 0) + Number(useCasePages?.counts?.ready_local_copy || 0),
      use_case_page_packages_ready: Number(useCasePagePackages?.counts?.ready_packages || 0),
      use_case_pages_blocked: Number(useCasePages?.counts?.blocked_by_checkout || 0) + Number(useCasePages?.counts?.blocked_by_compliance || 0) + Number(useCasePages?.counts?.blocked_prepare_only || 0),
      publish_preflight_assets: Number(publishPreflight?.counts?.assets || 0),
      publish_preflight_warnings: Number(publishPreflight?.counts?.warnings || 0),
      publish_preflight_errors: Number(publishPreflight?.counts?.errors || 0),
      creem_direct_links: Number(creemLinks?.counts?.direct_creem_links || 0),
      creem_needs_verification: Number(creemLinks?.counts?.needs_store_domain_verification || 0),
      creem_blocked_compliance: Number(creemLinks?.counts?.blocked_compliance || 0),
      creem_blocked_checkout: Number(creemLinks?.counts?.blocked_checkout || 0),
      creem_store_manual_checks: Number(creemStoreVerification?.counts?.manual_read_only_check_required || 0),
      creem_store_waiting_provider: Number(creemStoreVerification?.counts?.waiting_provider || 0),
      creem_store_blocked: Number(creemStoreVerification?.counts?.blocked || 0),
      landing_target_decisions_needed: Number(landingTargetDecision?.unresolved?.length || 0),
      customer_feedback_ready: feedback.ready,
      customer_feedback_held: feedback.held,
      customer_feedback_due_reviews: feedbackReview.due,
      customer_feedback_signal_reviews: feedbackReview.signals,
      confirmation_ready: Number(confirmationQueue?.counts?.ready_confirmation_required || 0),
      confirmation_needs_decision: Number(confirmationQueue?.counts?.needs_decision || 0),
      confirmation_blocked: Number(confirmationQueue?.counts?.blocked || 0),
      experiment_decision_ready: Number(experimentDecision?.counts?.ready_confirmation_required || 0),
      experiment_decision_needs_decision: Number(experimentDecision?.counts?.needs_decision || 0),
      experiment_decision_review_due: Number(experimentDecision?.counts?.review_due || 0),
      public_health_blocked: profiles.filter((row) => row.public_health_status === "blocked").length,
      public_health_gaps: profiles.filter((row) => row.public_health_status === "needs_tracking_or_landing_baseline").length,
    },
    risks: riskRows({ portfolio, todayPlan, lokaInventory, blocked }),
  };
}

function landingTargetDecisionSummary(decision) {
  const rows = Array.isArray(decision?.unresolved) ? decision.unresolved : [];
  return {
    status: decision?.status || "missing",
    recommendation: decision?.recommendation || "",
    known_domains: decision?.target_registry?.known_domains || [],
    deploy_context: decision?.deploy_context || null,
    rows,
  };
}

function pluginChannelFitSummary(pluginChannelFit) {
  const plugins = Array.isArray(pluginChannelFit?.plugins) ? pluginChannelFit.plugins : [];
  const rows = plugins.map((item) => {
    const top = item.top_channel || {};
    return {
      plugin: item.plugin || "",
      marketplace_url: item.marketplace_url || "",
      channel: top.channel || "",
      decision: top.decision || "",
      score: Number(top.score || 0),
      reason: top.reason || "",
      next_step: top.next_step || "",
      confirmation: top.confirmation || "",
      verification: top.verification || "",
      evidence: top.evidence || "",
    };
  });
  return {
    status: pluginChannelFit?.status || "missing",
    recommendation: pluginChannelFit?.recommendation || "",
    next_channel: pluginChannelFit?.next_channel || null,
    rows,
  };
}

function customerFeedbackSummary(customerFeedback) {
  const items = Array.isArray(customerFeedback?.items) ? customerFeedback.items : [];
  return {
    status: customerFeedback?.status || "missing",
    recommendation: customerFeedback?.recommendation || "",
    total: items.length,
    ready: items.filter((item) => item.status === "ready_confirmation_required").length,
    held: items.filter((item) => item.status === "hold_payment_compliance").length,
    sent: items.filter((item) => item.status === "sent_or_recorded").length,
    rows: items,
  };
}

function customerFeedbackReviewSummary(customerFeedbackReview) {
  const rows = Array.isArray(customerFeedbackReview?.rows) ? customerFeedbackReview.rows : [];
  return {
    status: customerFeedbackReview?.status || "missing",
    recommendation: customerFeedbackReview?.recommendation || "",
    total: rows.length,
    due: Number(customerFeedbackReview?.due_reviews || 0),
    scheduled: Number(customerFeedbackReview?.scheduled_reviews || 0),
    signals: Number(customerFeedbackReview?.signal_reviews || 0),
    rows,
  };
}

function confirmationQueueSummary(queue) {
  return {
    status: queue?.status || "missing",
    recommendation: queue?.recommendation || "",
    next_confirmation: queue?.next_confirmation || "",
    counts: queue?.counts || {},
    rows: Array.isArray(queue?.rows) ? queue.rows : [],
  };
}

function experimentDecisionSummary(decision) {
  return {
    status: decision?.status || "missing",
    recommendation: decision?.recommendation || "",
    counts: decision?.counts || {},
    next_decision: decision?.next_decision || null,
    rows: Array.isArray(decision?.rows) ? decision.rows : [],
  };
}

function assetSummary(assetKits, profiles) {
  const kits = Array.isArray(assetKits?.kits) ? assetKits.kits : [];
  const byPlugin = new Map(kits.map((kit) => [kit.plugin, kit]));
  const rows = profiles.map((profile) => {
    const kit = byPlugin.get(profile.plugin);
    return {
      plugin: profile.plugin,
      present: Boolean(kit),
      marketplace: Boolean(kit?.marketplace?.title && kit?.marketplace?.subtitle),
      community: Boolean(kit?.community?.title),
      directory: Boolean(kit?.directory?.short_description),
      partner: Boolean(kit?.partner?.pitch),
      customer: Boolean(kit?.customer?.subject && kit?.customer?.body),
      seo: Boolean(kit?.seo),
      confirmation: kit?.safety?.confirmation || profile.confirmation || "",
    };
  });
  return {
    total: kits.length,
    complete: rows.filter((row) => row.present && row.marketplace && row.community && row.directory && row.partner && row.customer && row.seo).length,
    rows,
  };
}

function landingBaselineSummary(landingBaseline) {
  const rows = Array.isArray(landingBaseline?.rows) ? landingBaseline.rows : [];
  return {
    status: landingBaseline?.status || "missing",
    recommendation: landingBaseline?.recommendation || "",
    ready: Number(landingBaseline?.ready_count || rows.filter((row) => row.status === "ready_to_spec").length),
    blocked: Number(landingBaseline?.blocked_count || rows.filter((row) => row.status === "blocked").length),
    rows,
  };
}

function ownedSiteAuditSummary(audit) {
  const rows = Array.isArray(audit?.items) ? audit.items : [];
  return {
    status: audit?.status || "missing",
    recommendation: audit?.recommendation || "",
    counts: audit?.counts || {},
    rows,
  };
}

function ownedSiteCtaKitSummary(kit) {
  const rows = Array.isArray(kit?.items) ? kit.items : [];
  return {
    status: kit?.status || "missing",
    recommendation: kit?.recommendation || "",
    counts: kit?.counts || {},
    rows,
  };
}

function crossPromotionSummary(crossPromotion) {
  const rows = Array.isArray(crossPromotion?.rows) ? crossPromotion.rows : [];
  return {
    status: crossPromotion?.status || "missing",
    recommendation: crossPromotion?.recommendation || "",
    counts: crossPromotion?.counts || {},
    rows,
  };
}

function ownedSiteImplementationSummary(brief) {
  const rows = Array.isArray(brief?.items) ? brief.items : [];
  return {
    status: brief?.status || "missing",
    recommendation: brief?.recommendation || "",
    counts: brief?.counts || {},
    rows,
  };
}

function useCasePagesSummary(brief) {
  const rows = Array.isArray(brief?.items) ? brief.items : [];
  return {
    status: brief?.status || "missing",
    recommendation: brief?.recommendation || "",
    counts: brief?.counts || {},
    rows,
  };
}

function publishPreflightSummary(preflight) {
  const rows = Array.isArray(preflight?.assets) ? preflight.assets : [];
  return {
    status: preflight?.status || "missing",
    recommendation: preflight?.recommendation || "",
    counts: preflight?.counts || {},
    rows,
  };
}

function creemLinksSummary(inventory) {
  const rows = Array.isArray(inventory?.rows) ? inventory.rows : [];
  return {
    status: inventory?.status || "missing",
    recommendation: inventory?.recommendation || "",
    counts: inventory?.counts || {},
    rows,
  };
}

function creemStoreVerificationSummary(brief) {
  const rows = Array.isArray(brief?.rows) ? brief.rows : [];
  return {
    status: brief?.status || "missing",
    recommendation: brief?.recommendation || "",
    counts: brief?.counts || {},
    rows,
  };
}

function recommendationFor({ experiments, todayPlan, channelFit, blocked, confirmationQueue }) {
  if (todayPlan?.next_confirmation && todayPlan?.recommendation) return todayPlan.recommendation;
  if (confirmationQueue?.recommendation) return confirmationQueue.recommendation;
  if (channelFit?.next_channel && /^go/i.test(String(channelFit.next_channel.decision || ""))) {
    return channelFit.recommendation;
  }
  if (todayPlan?.recommendation) return todayPlan.recommendation;
  if (experiments?.recommendation) return experiments.recommendation;
  if (blocked.length) return `Resolve ${blocked[0].plugin}: ${blocked[0].blocker}`;
  return "Keep the smallest measurable experiment running and review proof before expansion.";
}

function isRealBlocker(row) {
  const blocker = String(row.blocker || "");
  if (!blocker || /^No hard blocker recorded/i.test(blocker)) return false;
  if (row.public_health_status === "blocked") return true;
  return /block|warning|risk|not serving|not verified|failed|off-boarding|compliance/i.test(blocker);
}

function riskRows({ portfolio, todayPlan, lokaInventory, blocked }) {
  const rows = [];
  if (portfolio?.other_creem_open) {
    rows.push({
      area: "Creem/Loka",
      status: "open_warning",
      detail: "One non-Polyglot Creem warning remains scoped to Loka Pro.",
    });
  }
  if (lokaInventory?.assessment?.product_link_occurrences) {
    rows.push({
      area: "Loka checkout",
      status: "inventory_recorded",
      detail: `${lokaInventory.assessment.product_link_occurrences} direct getloka.dev Creem link occurrence(s); still need provider origin/referrer.`,
    });
  }
  if (todayPlan?.source_state?.payment_recovery === "blocked") {
    rows.push({
      area: "Polyglot payment",
      status: "blocked",
      detail: "Cloudflare custom domain / checkout-origin gate blocks Marketplace and Community expansion.",
    });
  }
  for (const row of blocked.slice(0, 3)) {
    rows.push({ area: row.plugin, status: "blocker", detail: row.blocker });
  }
  return rows;
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Plugin Portfolio Weekly Report",
    "",
    `Generated: ${report.generated_at}`,
    `Week/date anchor: ${report.today}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    report.next_confirmation ? `Next confirmation: ${report.next_confirmation}` : "",
    "",
    "## Portfolio Metrics",
    "",
    `- External revenue signals: ${report.totals.external_revenue_count} ($${report.totals.external_revenue_usd.toFixed(2)})`,
    `- Customer/partner reply signals: ${report.totals.customer_or_partner_reply_signals}`,
    `- Customer feedback queue: ${report.customer_feedback.ready} ready, ${report.customer_feedback.held} held`,
    `- Customer feedback reviews: ${report.customer_feedback_review.due} due, ${report.customer_feedback_review.signals} signal`,
    `- Confirmation queue: ${report.totals.confirmation_ready} ready, ${report.totals.confirmation_needs_decision} need decision, ${report.totals.confirmation_blocked} blocked`,
    `- Experiment decisions: ${report.totals.experiment_decision_ready} ready, ${report.totals.experiment_decision_needs_decision} need decision, ${report.totals.experiment_decision_review_due} review due`,
    `- Partner rows: ${report.totals.partner_rows} (due ${report.totals.partner_due})`,
    `- Plugin/channel fit rows: ${report.totals.plugin_channel_fit_rows} (${report.totals.plugin_channel_fit_go} go)`,
    `- Plugin asset kits: ${report.totals.asset_kits_complete}/${report.profiles.length} complete`,
    `- Landing baselines: ${report.landing_baseline.ready} ready, ${report.landing_baseline.blocked} blocked`,
    `- Owned sites: ${report.totals.owned_site_ready_for_recording} ready for recording, ${report.totals.owned_site_needs_cta_tracking} need CTA tracking, ${report.totals.owned_site_blocked} blocked`,
    `- Owned-site CTA kit: ${report.totals.owned_site_cta_ready} ready to update, ${report.totals.owned_site_cta_blocked} blocked/prepare-only`,
    `- Cross-promotion: ${report.totals.cross_promotion_ready} ready local copy, ${report.totals.cross_promotion_blocked} blocked/prepare-only`,
    `- Owned-site implementation: ${report.totals.owned_site_implementation_ready} ready, ${report.totals.owned_site_implementation_blocked} blocked/prepare-only`,
    `- Use-case pages: ${report.totals.use_case_pages_ready} ready/local, ${report.totals.use_case_page_packages_ready} local packages, ${report.totals.use_case_pages_blocked} blocked/prepare-only`,
    `- Publish preflight: ${report.totals.publish_preflight_assets} assets, ${report.totals.publish_preflight_warnings} warnings, ${report.totals.publish_preflight_errors} errors`,
    `- Creem link inventory: ${report.totals.creem_direct_links} direct links, ${report.totals.creem_needs_verification} need store/domain verification, ${report.totals.creem_blocked_compliance} compliance blocked, ${report.totals.creem_blocked_checkout} checkout blocked`,
    `- Creem store/domain verification: ${report.totals.creem_store_manual_checks} manual read-only checks, ${report.totals.creem_store_waiting_provider} waiting provider, ${report.totals.creem_store_blocked} blocked`,
    `- Landing target decisions needed: ${report.totals.landing_target_decisions_needed}`,
    `- Public health: ${report.totals.public_health_blocked} blocked, ${report.totals.public_health_gaps} need landing/tracking baseline`,
    "",
    "| Rank | Plugin | Users | Opens | Version | Updated | Revenue | Replies/signals | Public health | Experiment | Main blocker |",
    "|---:|---|---:|---:|---|---|---:|---:|---|---|---|",
  ];
  for (const row of report.profiles) {
    const plugin = row.marketplace_url ? `[${row.plugin}](${row.marketplace_url})` : row.plugin;
    lines.push(`| ${row.rank} | ${plugin} | ${row.users || ""} | ${row.opens || ""} | ${row.version || ""} | ${row.updated || ""} | $${row.revenue_usd.toFixed(2)} | ${row.replies} | ${pipe(row.public_health_status)} | ${pipe(row.experiment_status || row.experiment_channel)} | ${pipe(row.blocker)} |`);
  }

  lines.push(
    "",
    "## Channels",
    "",
    "| Rank | Channel | Decision | Status |",
    "|---:|---|---|---|",
  );
  for (const card of report.channels.slice(0, 10)) {
    lines.push(`| ${card.rank ?? ""} | ${pipe(card.channel)} | ${pipe(card.decision)} | ${pipe(card.status)} |`);
  }

  lines.push(
    "",
    "## Plugin Channel Fit",
    "",
    `- Status: ${report.plugin_channel_fit.status}`,
    `- Recommendation: ${report.plugin_channel_fit.recommendation || "No plugin/channel fit matrix generated yet."}`,
    "",
    "| Plugin | Top channel | Decision | Score | Next step | Confirmation |",
    "|---|---|---|---:|---|---|",
  );
  for (const row of report.plugin_channel_fit.rows) {
    const plugin = row.marketplace_url ? `[${pipe(row.plugin)}](${row.marketplace_url})` : pipe(row.plugin);
    lines.push(`| ${plugin} | ${pipe(row.channel)} | ${pipe(row.decision)} | ${row.score} | ${pipe(row.next_step)} | ${pipe(row.confirmation)} |`);
  }
  if (!report.plugin_channel_fit.rows.length) {
    lines.push("| none |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Next 3 Growth Actions",
    "",
    "| Plugin | Action | Why | Confirmation |",
    "|---|---|---|---|",
  );
  for (const row of report.next_actions) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(row.title)} | ${pipe(row.reason)} | ${pipe(row.confirmation)} |`);
  }

  lines.push(
    "",
    "## Confirmation Queue",
    "",
    `- Status: ${report.confirmation_queue.status}`,
    `- Recommendation: ${report.confirmation_queue.recommendation || "No confirmation queue generated yet."}`,
    `- Next confirmation: ${report.confirmation_queue.next_confirmation || "none"}`,
    "",
    "| Readiness | Plugin | Kind | Target | Record? | Confirmation |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.confirmation_queue.rows.slice(0, 8)) {
    lines.push(`| ${pipe(row.readiness)} | ${pipe(row.plugin)} | ${pipe(row.kind)} | ${pipe(row.target)} | ${row.record_command ? "yes" : "no"} | ${pipe(row.confirmation)} |`);
  }
  if (!report.confirmation_queue.rows.length) {
    lines.push("| empty |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Experiment Decision Brief",
    "",
    `- Status: ${report.experiment_decision.status}`,
    `- Recommendation: ${report.experiment_decision.recommendation || "No experiment decision brief generated yet."}`,
    report.experiment_decision.next_decision ? `- Next decision: ${report.experiment_decision.next_decision.plugin} / ${report.experiment_decision.next_decision.decision}` : "- Next decision: none",
    "",
    "| Decision | Plugin | Channel | Target | Continue rule | Stop/rework rule | Scale rule |",
    "|---|---|---|---|---|---|---|",
  );
  for (const row of report.experiment_decision.rows.slice(0, 8)) {
    lines.push(`| ${pipe(row.decision)} | ${pipe(row.plugin)} | ${pipe(row.channel)} | ${pipe(row.target)} | ${pipe(row.continue_rule)} | ${pipe(row.stop_rule)} | ${pipe(row.scale_rule)} |`);
  }
  if (!report.experiment_decision.rows.length) {
    lines.push("| none |  |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Confirmation-Gated Actions",
    "",
    "| Plugin | Target | Risk | Expected benefit | Confirmation | Verification |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.confirmations) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(row.target)} | ${pipe(row.risk)} | ${pipe(row.expected_benefit)} | ${pipe(row.confirmation)} | ${pipe(row.verification)} |`);
  }

  lines.push(
    "",
    "## Asset Kits",
    "",
    "| Plugin | Marketplace | Community | Directory | Partner | Customer | SEO | Confirmation |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const row of report.assets.rows) {
    lines.push(`| ${pipe(row.plugin)} | ${yesNo(row.marketplace)} | ${yesNo(row.community)} | ${yesNo(row.directory)} | ${yesNo(row.partner)} | ${yesNo(row.customer)} | ${yesNo(row.seo)} | ${pipe(row.confirmation)} |`);
  }

  lines.push(
    "",
    "## Landing Baselines",
    "",
    `- Status: ${report.landing_baseline.status}`,
    `- Recommendation: ${report.landing_baseline.recommendation || "No landing baseline report generated yet."}`,
    report.landing_baseline_brief?.status ? `- Confirmation brief: ${report.landing_baseline_brief.status}` : "- Confirmation brief: missing",
    report.landing_baseline_brief?.item ? `- Brief target: ${report.landing_baseline_brief.item.plugin} -> ${report.landing_baseline_brief.item.target_url}` : "",
    report.landing_baseline_brief?.external_action?.confirmation ? `- Brief confirmation: ${report.landing_baseline_brief.external_action.confirmation}` : "",
    "",
    "| Status | Plugin | Proposed URL | Campaign | Metric | Confirmation |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.landing_baseline.rows) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.plugin)} | ${pipe(row.proposed_url)} | ${pipe(row.campaign)} | ${pipe(row.primary_metric)} | ${pipe(row.confirmation)} |`);
  }
  if (!report.landing_baseline.rows.length) {
    lines.push("| none |  |  |  |  |");
  }
  if (report.landing_baseline_brief?.preconditions?.length) {
    lines.push("", "Landing brief preconditions:");
    for (const item of report.landing_baseline_brief.preconditions) {
      lines.push(`- ${item}`);
    }
  }

  lines.push(
    "",
    "## Landing Target Decisions",
    "",
    `- Status: ${report.landing_target_decision.status}`,
    `- Recommendation: ${report.landing_target_decision.recommendation || "No landing target decision report generated yet."}`,
    `- Known owned domains: ${report.landing_target_decision.known_domains.join(", ") || "none"}`,
    "",
    "| Plugin | Recommended URL | Decision | Confirmation |",
    "|---|---|---|---|",
  );
  for (const row of report.landing_target_decision.rows) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(row.recommended_url)} | ${pipe(row.recommended_decision)} | ${pipe(row.confirmation)} |`);
  }
  if (!report.landing_target_decision.rows.length) {
    lines.push("| none |  |  |  |");
  }

  lines.push(
    "",
    "## Owned Site Audit",
    "",
    `- Status: ${report.owned_site_audit.status}`,
    `- Recommendation: ${report.owned_site_audit.recommendation || "No owned site audit generated yet."}`,
    "",
    "| Plugin | URL | HTTP | Readiness | Marketplace CTA | Tracked CTA | Creem links | Next action |",
    "|---|---|---:|---|---:|---:|---:|---|",
  );
  for (const row of report.owned_site_audit.rows) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(row.target_url)} | ${row.status || 0} | ${pipe(row.readiness)} | ${row.marketplace_link_count || 0} | ${row.tracked_marketplace_link_count || 0} | ${row.direct_creem_link_count || 0} | ${pipe(row.next_action)} |`);
  }
  if (!report.owned_site_audit.rows.length) {
    lines.push("| none |  |  |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Owned Site CTA Kit",
    "",
    `- Status: ${report.owned_site_cta_kit.status}`,
    `- Recommendation: ${report.owned_site_cta_kit.recommendation || "No owned site CTA kit generated yet."}`,
    "",
    "| Plugin | Site | Status | CTA | Campaign | Confirmation |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.owned_site_cta_kit.rows) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(row.target_url)} | ${pipe(row.status)} | ${pipe(row.cta_label)} | ${pipe(row.campaign)} | ${pipe(row.confirmation)} |`);
  }
  if (!report.owned_site_cta_kit.rows.length) {
    lines.push("| none |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Cross-Promotion Matrix",
    "",
    `- Status: ${report.cross_promotion.status}`,
    `- Recommendation: ${report.cross_promotion.recommendation || "No cross-promotion matrix generated yet."}`,
    "",
    "| Status | Source | Target | Site | Campaign | Confirmation |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.cross_promotion.rows.slice(0, 8)) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.source_plugin)} | ${pipe(row.target_plugin)} | ${pipe(row.source_site)} | ${pipe(row.campaign)} | ${pipe(row.confirmation)} |`);
  }
  if (!report.cross_promotion.rows.length) {
    lines.push("| none |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Owned Site Implementation",
    "",
    `- Status: ${report.owned_site_implementation.status}`,
    `- Recommendation: ${report.owned_site_implementation.recommendation || "No owned-site implementation brief generated yet."}`,
    "",
    "| Status | Plugin | Site | CTA | Related ready | Confirmation |",
    "|---|---|---|---|---:|---|",
  );
  for (const row of report.owned_site_implementation.rows.slice(0, 8)) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.plugin)} | ${pipe(row.site_url)} | ${pipe(row.primary_cta_label)} | ${row.related_plugin_links?.length || 0} | ${pipe(row.confirmation)} |`);
  }
  if (!report.owned_site_implementation.rows.length) {
    lines.push("| none |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Use-Case Pages",
    "",
    `- Status: ${report.use_case_pages.status}`,
    `- Recommendation: ${report.use_case_pages.recommendation || "No use-case page brief generated yet."}`,
    "",
    "| Status | Plugin | URL | Keyword | Campaign | Confirmation |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.use_case_pages.rows.slice(0, 8)) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.plugin)} | ${pipe(row.url)} | ${pipe(row.target_keyword)} | ${pipe(row.campaign)} | ${pipe(row.confirmation)} |`);
  }
  if (!report.use_case_pages.rows.length) {
    lines.push("| none |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Publish Preflight",
    "",
    `- Status: ${report.publish_preflight.status}`,
    `- Recommendation: ${report.publish_preflight.recommendation || "No publish preflight generated yet."}`,
    "",
    "| Status | Type | Plugin | Target | Campaign | Warnings | Errors | Confirmation |",
    "|---|---|---|---|---|---:|---:|---|",
  );
  for (const row of report.publish_preflight.rows.slice(0, 8)) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.type)} | ${pipe(row.plugin)} | ${pipe(row.target)} | ${pipe(row.campaign)} | ${row.warnings?.length || 0} | ${row.errors?.length || 0} | ${pipe(row.confirmation)} |`);
  }
  if (!report.publish_preflight.rows.length) {
    lines.push("| none |  |  |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Creem Link Inventory",
    "",
    `- Status: ${report.creem_links.status}`,
    `- Recommendation: ${report.creem_links.recommendation || "No Creem link inventory generated yet."}`,
    "",
    "| Status | Plugin | URL | Product IDs | Direct Links | Occurrences | Open Warnings | Store/Domain Evidence | Approval Evidence | Next Action |",
    "|---|---|---|---|---:|---:|---:|---:|---:|---|",
  );
  for (const row of report.creem_links.rows.slice(0, 8)) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.plugin)} | ${pipe(row.target_url)} | ${pipe((row.product_ids || []).join(", ") || "none")} | ${row.direct_creem_unique_links || 0} | ${row.direct_creem_occurrences || 0} | ${row.open_compliance_warnings || 0} | ${row.store_domain_evidence_count || 0} | ${row.approval_evidence_count || 0} | ${pipe(row.next_action)} |`);
  }
  if (!report.creem_links.rows.length) {
    lines.push("| none |  |  |  |  |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Creem Store/Domain Verification",
    "",
    `- Status: ${report.creem_store_verification.status}`,
    `- Recommendation: ${report.creem_store_verification.recommendation || "No Creem store/domain verification brief generated yet."}`,
    "",
    "| Readiness | Plugin | Domain | Inventory Status | Product IDs | Action | Verification |",
    "|---|---|---|---|---|---|---|",
  );
  for (const row of report.creem_store_verification.rows.slice(0, 8)) {
    lines.push(`| ${pipe(row.readiness)} | ${pipe(row.plugin)} | ${pipe(row.expected_domain)} | ${pipe(row.inventory_status)} | ${pipe((row.product_ids || []).join(", ") || "none")} | ${pipe(row.action)} | ${pipe(row.verification)} |`);
  }
  if (!report.creem_store_verification.rows.length) {
    lines.push("| none |  |  |  |  |  |  |");
  }

  lines.push(
    "",
    "## Existing Customers",
    "",
    `- Status: ${report.customer_feedback.status}`,
    `- Recommendation: ${report.customer_feedback.recommendation || "No customer feedback queue generated yet."}`,
    report.customer_feedback_brief?.status ? `- Confirmation brief: ${report.customer_feedback_brief.status}` : "- Confirmation brief: missing",
    report.customer_feedback_brief?.item ? `- Brief target: ${report.customer_feedback_brief.item.customer_name} <${report.customer_feedback_brief.item.customer_email}>` : "",
    `- Review status: ${report.customer_feedback_review.status}`,
    `- Review recommendation: ${report.customer_feedback_review.recommendation || "No customer feedback review generated yet."}`,
    "",
    "| Plugin | Customer | Amount | Status | Confirmation |",
    "|---|---|---:|---|---|",
  );
  for (const row of report.customer_feedback.rows) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(`${row.customer_name} <${row.customer_email}>`)} | $${Number(row.amount_usd || 0).toFixed(2)} | ${pipe(row.status)} | ${pipe(row.confirmation)} |`);
  }
  if (!report.customer_feedback.rows.length) {
    lines.push("| none |  |  |  |  |");
  }

  lines.push(
    "",
    "### Customer Feedback Review",
    "",
    "| Status | Sent | Plugin | Customer | Next/due | Latest review |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.customer_feedback_review.rows) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.sent_date)} | ${pipe(row.plugin)} | ${pipe(row.customer)} | ${pipe(row.next_due_date)} | ${pipe(latestReviewText(row.latest_review))} |`);
  }
  if (!report.customer_feedback_review.rows.length) {
    lines.push("| none |  |  |  |  |");
  }

  lines.push(
    "",
    "## Partner Log",
    "",
    `- Total: ${report.partners.total}`,
    `- Due: ${report.partners.due}`,
    `- With signal: ${report.partners.signaled}`,
    "",
    "| Status | Next review | Kind | Campaign | Target |",
    "|---|---|---|---|---|",
  );
  for (const row of report.partners.rows) {
    lines.push(`| ${pipe(row.status)} | ${row.next_review || ""} | ${pipe(row.kind)} | ${pipe(row.campaign)} | ${pipe(row.target)} |`);
  }

  lines.push(
    "",
    "## Risks And Stop Rules",
    "",
    "| Area | Status | Detail |",
    "|---|---|---|",
  );
  for (const row of report.risks) {
    lines.push(`| ${pipe(row.area)} | ${pipe(row.status)} | ${pipe(row.detail)} |`);
  }

  lines.push(
    "",
    "## Weekly Operating Commands",
    "",
    "```bash",
    "pnpm lead:portfolio-ops",
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
    "pnpm lead:creem-links",
    "pnpm lead:owned-site-cta",
    "pnpm lead:plugin-channel-fit",
    "pnpm lead:cross-promo",
    "pnpm lead:owned-site-implementation",
    "pnpm lead:use-case-pages",
    "pnpm lead:use-case-page-package",
    "pnpm lead:publish-preflight",
    "pnpm lead:customer-feedback",
    "pnpm lead:customer-feedback-brief",
    "pnpm lead:customer-feedback-review",
    "pnpm lead:confirmations",
    "pnpm lead:experiment-decisions",
    "pnpm lead:partners",
    "pnpm lead:portfolio-weekly",
    "pnpm lead:executive",
    "pnpm lead:today",
    "pnpm lead:ops",
    "```",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function latestReviewText(review) {
  if (!review) return "";
  return `${review.window || ""} ${review.status || ""}${review.date ? ` on ${review.date}` : ""}`.trim();
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
    portfolio,
    experiments,
    actionRows,
    revenueRows,
    partnerRows,
    todayPlan,
    channelPriority,
    pluginChannelFit,
    lokaInventory,
    assetKits,
    landingBaseline,
    landingTargetDecision,
    landingBaselineBrief,
    ownedSiteAudit,
    ownedSiteCtaKit,
    crossPromotion,
    ownedSiteImplementation,
    useCasePages,
    useCasePagePackages,
    publishPreflight,
    creemLinks,
    creemStoreVerification,
    customerFeedback,
    customerFeedbackBrief,
    customerFeedbackReview,
    confirmationQueue,
    experimentDecision,
  ] = await Promise.all([
    readJson(args.portfolio, null),
    readJson(args.experiments, null),
    readRows(args.actions),
    readRows(args.revenue),
    readRows(args.partners),
    readJson(args.todayPlan, null),
    readJson(args.channelPriority, null),
    readJson(args.pluginChannelFit, null),
    readJson(args.lokaInventory, null),
    readJson(args.assetKits, null),
    readJson(args.landingBaseline, null),
    readJson(args.landingTargetDecision, null),
    readJson(args.landingBaselineBrief, null),
    readJson(args.ownedSiteAudit, null),
    readJson(args.ownedSiteCtaKit, null),
    readJson(args.crossPromotion, null),
    readJson(args.ownedSiteImplementation, null),
    readJson(args.useCasePages, null),
    readJson(args.useCasePagePackages, null),
    readJson(args.publishPreflight, null),
    readJson(args.creemLinks, null),
    readJson(args.creemStoreVerification, null),
    readJson(args.customerFeedback, null),
    readJson(args.customerFeedbackBrief, null),
    readJson(args.customerFeedbackReview, null),
    readJson(args.confirmationQueue, null),
    readJson(args.experimentDecision, null),
  ]);

  const report = build({
    args,
    portfolio,
    experiments,
    actionRows,
    revenueRows,
    partnerRows,
    todayPlan,
    channelPriority,
    pluginChannelFit,
    lokaInventory,
    assetKits,
    landingBaseline,
    landingTargetDecision,
    landingBaselineBrief,
    ownedSiteAudit,
    ownedSiteCtaKit,
    crossPromotion,
    ownedSiteImplementation,
    useCasePages,
    useCasePagePackages,
    publishPreflight,
    creemLinks,
    creemStoreVerification,
    customerFeedback,
    customerFeedbackBrief,
    customerFeedbackReview,
    confirmationQueue,
    experimentDecision,
  });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Portfolio weekly report: ${args.output}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
