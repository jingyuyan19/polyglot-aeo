#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CHANNEL_PRIORITY = ".tmp/framer-channel-priority.json";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_MARKETPLACE_POSTFLIGHT = ".tmp/framer-marketplace-postflight.json";
const DEFAULT_COMMUNITY_PREFLIGHT = ".tmp/framer-community-preflight.json";
const DEFAULT_CLOUDFLARE_APPLY = ".tmp/framer-cloudflare-apply.json";
const DEFAULT_CLOUDFLARE_RECOVERY = ".tmp/framer-cloudflare-recovery.json";
const DEFAULT_PAYMENT_RECOVERY = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_NETLIFY_RECOVERY = ".tmp/framer-netlify-recovery.json";
const DEFAULT_DAY3_READINESS = ".tmp/framer-day3-readiness.json";
const DEFAULT_PARTNER_REVIEW = ".tmp/framer-partner-review.json";
const DEFAULT_ACTION_REVIEW = ".tmp/framer-action-review.json";
const DEFAULT_DEPLOY_REVIEW = ".tmp/framer-deploy-review.json";
const DEFAULT_TRACKING_FRESHNESS = ".tmp/framer-tracking-freshness.json";
const DEFAULT_SIGNAL_SWEEP = ".tmp/framer-signal-sweep.json";
const DEFAULT_CREEM_COMPLIANCE = ".tmp/framer-creem-compliance-review.json";
const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_PORTFOLIO_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_CUSTOMER_FEEDBACK_BRIEF = ".tmp/framer-customer-feedback-brief.json";
const DEFAULT_LANDING_BASELINE_BRIEF = ".tmp/framer-landing-baseline-brief.json";
const DEFAULT_OUTPUT = ".tmp/framer-today.md";
const DEFAULT_JSON = ".tmp/framer-today.json";
const CLOUDFLARE_CONFIRMATION_FRESHNESS_HOURS = 2;

function usage() {
  return `
Usage:
  pnpm lead:today

Options:
  --channel-priority <file>       Channel priority JSON. Default: ${DEFAULT_CHANNEL_PRIORITY}
  --marketplace-preflight <file>  Marketplace preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --marketplace-postflight <file> Marketplace postflight JSON. Default: ${DEFAULT_MARKETPLACE_POSTFLIGHT}
  --community-preflight <file>    Community preflight JSON. Default: ${DEFAULT_COMMUNITY_PREFLIGHT}
  --cloudflare-apply <file>       Cloudflare apply JSON. Default: ${DEFAULT_CLOUDFLARE_APPLY}
  --cloudflare-recovery <file>    Cloudflare recovery JSON. Default: ${DEFAULT_CLOUDFLARE_RECOVERY}
  --payment-recovery <file>       Payment compliance recovery JSON. Default: ${DEFAULT_PAYMENT_RECOVERY}
  --netlify-recovery <file>       Netlify recovery JSON. Default: ${DEFAULT_NETLIFY_RECOVERY}
  --day3-readiness <file>         Day 3 readiness JSON. Default: ${DEFAULT_DAY3_READINESS}
  --partner-review <file>         Partner/resource review JSON. Default: ${DEFAULT_PARTNER_REVIEW}
  --action-review <file>          Public action review JSON. Default: ${DEFAULT_ACTION_REVIEW}
  --deploy-review <file>          Deploy review JSON. Default: ${DEFAULT_DEPLOY_REVIEW}
  --tracking-freshness <file>     Tracking freshness JSON. Default: ${DEFAULT_TRACKING_FRESHNESS}
  --signal-sweep <file>           Signal sweep JSON. Default: ${DEFAULT_SIGNAL_SWEEP}
  --creem-compliance <file>       Creem compliance review JSON. Default: ${DEFAULT_CREEM_COMPLIANCE}
  --portfolio <file>              Multi-plugin portfolio JSON. Default: ${DEFAULT_PORTFOLIO}
  --portfolio-experiments <file>  Multi-plugin experiment JSON. Default: ${DEFAULT_PORTFOLIO_EXPERIMENTS}
  --customer-feedback-brief <file> Customer feedback confirmation brief JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK_BRIEF}
  --landing-baseline-brief <file> Landing/tracking confirmation brief JSON. Default: ${DEFAULT_LANDING_BASELINE_BRIEF}
  --output <file>                 Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                   JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>            Execution date. Default: local date.
  --help                          Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    channelPriority: DEFAULT_CHANNEL_PRIORITY,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    marketplacePostflight: DEFAULT_MARKETPLACE_POSTFLIGHT,
    communityPreflight: DEFAULT_COMMUNITY_PREFLIGHT,
    cloudflareApply: DEFAULT_CLOUDFLARE_APPLY,
    cloudflareRecovery: DEFAULT_CLOUDFLARE_RECOVERY,
    paymentRecovery: DEFAULT_PAYMENT_RECOVERY,
    netlifyRecovery: DEFAULT_NETLIFY_RECOVERY,
    day3Readiness: DEFAULT_DAY3_READINESS,
    partnerReview: DEFAULT_PARTNER_REVIEW,
    actionReview: DEFAULT_ACTION_REVIEW,
    deployReview: DEFAULT_DEPLOY_REVIEW,
    trackingFreshness: DEFAULT_TRACKING_FRESHNESS,
    signalSweep: DEFAULT_SIGNAL_SWEEP,
    creemCompliance: DEFAULT_CREEM_COMPLIANCE,
    portfolio: DEFAULT_PORTFOLIO,
    portfolioExperiments: DEFAULT_PORTFOLIO_EXPERIMENTS,
    customerFeedbackBrief: DEFAULT_CUSTOMER_FEEDBACK_BRIEF,
    landingBaselineBrief: DEFAULT_LANDING_BASELINE_BRIEF,
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
    if (key === "--channel-priority") {
      args.channelPriority = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-preflight") {
      args.marketplacePreflight = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-postflight") {
      args.marketplacePostflight = value;
      index += 1;
      continue;
    }
    if (key === "--community-preflight") {
      args.communityPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--cloudflare-apply") {
      args.cloudflareApply = value;
      index += 1;
      continue;
    }
    if (key === "--cloudflare-recovery") {
      args.cloudflareRecovery = value;
      index += 1;
      continue;
    }
    if (key === "--payment-recovery") {
      args.paymentRecovery = value;
      index += 1;
      continue;
    }
    if (key === "--netlify-recovery") {
      args.netlifyRecovery = value;
      index += 1;
      continue;
    }
    if (key === "--day3-readiness") {
      args.day3Readiness = value;
      index += 1;
      continue;
    }
    if (key === "--partner-review") {
      args.partnerReview = value;
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
    if (key === "--signal-sweep") {
      args.signalSweep = value;
      index += 1;
      continue;
    }
    if (key === "--creem-compliance") {
      args.creemCompliance = value;
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
    if (key === "--customer-feedback-brief") {
      args.customerFeedbackBrief = value;
      index += 1;
      continue;
    }
    if (key === "--landing-baseline-brief") {
      args.landingBaselineBrief = value;
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
  return text ? JSON.parse(text) : fallback;
}

function addItem(list, item) {
  list.push({
    title: item.title,
    status: item.status || "open",
    target: item.target || "",
    reason: item.reason || "",
    risk: item.risk || "",
    expected_benefit: item.expected_benefit || "",
    command: item.command || "",
    confirmation: item.confirmation || "",
    evidence: item.evidence || "",
    verification: item.verification || "",
    date: item.date || "",
  });
}

function generatedAtFreshness(record, maxHours = CLOUDFLARE_CONFIRMATION_FRESHNESS_HOURS) {
  const generatedAt = record?.generated_at || "";
  if (!generatedAt) {
    return {
      generated_at: "",
      fresh: false,
      hours_old: null,
      max_hours: maxHours,
      status: "missing",
      label: `missing (max ${maxHours}h)`,
    };
  }

  const timestamp = Date.parse(generatedAt);
  if (Number.isNaN(timestamp)) {
    return {
      generated_at: generatedAt,
      fresh: false,
      hours_old: null,
      max_hours: maxHours,
      status: "invalid",
      label: `invalid generated_at (max ${maxHours}h)`,
    };
  }

  const hoursOld = Math.max(0, (Date.now() - timestamp) / 36e5);
  const rounded = Math.round(hoursOld * 10) / 10;
  const fresh = hoursOld <= maxHours;
  return {
    generated_at: generatedAt,
    fresh,
    hours_old: rounded,
    max_hours: maxHours,
    status: fresh ? "fresh" : "stale",
    label: `${fresh ? "fresh" : "stale"} (${rounded}h old, max ${maxHours}h)`,
  };
}

function assess({
  args,
  channelPriority,
  marketplacePreflight,
  marketplacePostflight,
  communityPreflight,
  cloudflareApply,
  cloudflareRecovery,
  paymentRecovery,
  netlifyRecovery,
  day3Readiness,
  partnerReview,
  actionReview,
  deployReview,
  trackingFreshness,
  signalSweep,
  creemCompliance,
  portfolio,
  portfolioExperiments,
  customerFeedbackBrief,
  landingBaselineBrief,
}) {
  const canDoNow = [];
  const needsConfirmation = [];
  const scheduledNext = [];
  const blockedExternal = [];
  const stopRules = [];

  const nextChannel = channelPriority?.next_channel || "";
  const channelConfirmation = channelPriority?.next_confirmation || "";
  const creemDeadline = firstDeadline(creemCompliance);
  const creemDeadlineText = formatDeadline(creemDeadline);
  const cloudflareDryRunFreshness = generatedAtFreshness(cloudflareApply);
  const cloudflareDryRunReady =
    cloudflareApply?.deploy_allowed === true &&
    cloudflareApply?.status === "dry_run_ready";

  if (creemCompliance?.status === "needs_action" || (Array.isArray(creemCompliance?.open_warnings) && creemCompliance.open_warnings.length)) {
    addItem(canDoNow, {
      title: "Review Creem compliance packet and support draft",
      status: creemDeadline?.urgency === "expired" ? "deadline_expired" : "deadline_active",
      date: creemDeadline?.deadline_at || "",
      reason: creemCompliance.recommendation || "A Creem compliance warning is open; keep checkout-heavy promotion paused until provider/dashboard closure is recorded.",
      command: "pnpm lead:creem-compliance\nsed -n '1,180p' .tmp/framer-creem-compliance-review.md",
      evidence: creemDeadlineText ? `Deadline: ${creemDeadlineText}. No email or provider update should be sent without explicit confirmation.` : "No email or provider update should be sent without explicit confirmation.",
    });
  }

  addItem(canDoNow, {
    title: "Refresh local signal counters",
    reason: "Always safe; reads forms, CTA events, Marketplace public state, partner review, and local reports.",
    command: [
      "pnpm lead:forms",
      "pnpm lead:events",
      "pnpm lead:marketplace-public -- --record",
      "pnpm lead:signal-sweep",
      "pnpm lead:partner-review",
      "pnpm lead:portfolio",
      "pnpm lead:portfolio-experiments",
      "pnpm lead:today",
      "pnpm lead:ops",
      "pnpm lead:report",
    ].join("\n"),
  });

  const cloudflareGroup = paymentRecoveryConfirmationGroup(paymentRecovery, "Cloudflare");
  const firstPaymentPhase = Array.isArray(paymentRecovery?.phases) ? paymentRecovery.phases[0] : null;
  const cloudflareNeedsDeploy =
    paymentRecovery?.promotion_allowed === false &&
    firstPaymentPhase?.id === "cloudflare_custom_domain" &&
    firstPaymentPhase?.status !== "ready" &&
    cloudflareRecovery?.wrangler?.config_ready === true &&
    cloudflareRecovery?.secrets?.required_present === true &&
    cloudflareRecovery?.account?.readable === true &&
    cloudflareDryRunReady &&
    cloudflareDryRunFreshness.fresh;

  if (cloudflareNeedsDeploy && cloudflareGroup) {
    addItem(needsConfirmation, {
      title: "Deploy Cloudflare Worker custom domain",
      status: "confirmation_required",
      reason: paymentRecovery.recommendation || cloudflareRecovery.recommendation || firstPaymentPhase.next_action,
      confirmation: cloudflareGroup.confirmation,
      command: cloudflareGroup.commands.join("\n"),
      evidence: `Fresh dry-run (${cloudflareDryRunFreshness.label}) plus successful Wrangler deployment, passing https://license.polyglotaeo.com/health, checkout-origin, payment recovery, and Marketplace preflight.`,
    });
  } else if (
    paymentRecovery?.promotion_allowed === false &&
    firstPaymentPhase?.id === "cloudflare_custom_domain" &&
    firstPaymentPhase?.status !== "ready" &&
    cloudflareRecovery?.wrangler?.config_ready === true &&
    cloudflareRecovery?.secrets?.required_present === true &&
    cloudflareRecovery?.account?.readable === true &&
    cloudflareGroup
  ) {
    addItem(canDoNow, {
      title: "Refresh Cloudflare confirmation dry-run",
      status: "refresh_required",
      reason: cloudflareDryRunReady
        ? `Cloudflare dry-run is ${cloudflareDryRunFreshness.label}; refresh it before asking for deploy confirmation.`
        : cloudflareApply?.recommendation || "Cloudflare deploy confirmation needs a fresh successful dry-run first.",
      command: [
        "pnpm lead:cloudflare-recovery",
        "pnpm lead:cloudflare-apply -- --dry-run",
        "pnpm lead:blocker-brief",
        "pnpm lead:today",
      ].join("\n"),
      evidence: `Cloudflare dry-run generated_at must be <= ${CLOUDFLARE_CONFIRMATION_FRESHNESS_HOURS}h old before deployment confirmation is useful.`,
    });
  }

  const netlifyGroup = paymentRecoveryConfirmationGroup(paymentRecovery, "Netlify");
  const firstOpenPaymentPhase = Array.isArray(paymentRecovery?.phases)
    ? paymentRecovery.phases.find((item) => item.status !== "ready")
    : null;
  const netlifyBlockers = netlifyRecovery?.blockers || {};
  const netlifyNeedsDeploy =
    paymentRecovery?.promotion_allowed === false &&
    firstOpenPaymentPhase?.id === "netlify_site_deploy" &&
    firstOpenPaymentPhase?.status !== "ready" &&
    netlifyRecovery?.api?.site_readable === true &&
    netlifyRecovery?.api?.deploys_readable === true &&
    netlifyBlockers.account_credit_usage_exceeded !== true &&
    netlifyBlockers.forbidden_or_permission !== true &&
    netlifyBlockers.local_build_has_attribution_schema === true;

  if (netlifyNeedsDeploy && netlifyGroup) {
    addItem(needsConfirmation, {
      title: "Deploy polyglotaeo-web to Netlify",
      status: "confirmation_required",
      reason: paymentRecovery.recommendation || netlifyRecovery.recommendation || firstOpenPaymentPhase.next_action,
      confirmation: netlifyGroup.confirmation,
      command: netlifyGroup.commands.join("\n"),
      evidence: "Successful Netlify deploy ID plus passing site-check, strict tracking freshness, checkout-origin, payment recovery, and Marketplace preflight.",
    });
  }

  if (marketplacePreflight?.upload_allowed === true && channelConfirmation) {
    addItem(needsConfirmation, {
      title: `Execute ${nextChannel || "next public action"}`,
      status: "confirmation_required",
      reason: channelPriority?.recommendation || marketplacePreflight.recommendation,
      confirmation: channelConfirmation,
      command: "pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '<framer-upload-confirmation-url-or-screenshot>'",
      evidence: "Marketplace upload confirmation plus Creator Space users/opens/version snapshot.",
    });
  }

  const portfolioRows = portfolioProfiles(portfolio);
  const experimentRows = portfolioExperimentRows(portfolioExperiments);

  if (portfolioRows.length) {
    const top = portfolioRows[0];
    addItem(canDoNow, {
      title: `Use portfolio priority: ${top.plugin}`,
      status: "portfolio_priority",
      reason: `${top.priority}. ${top.next_action}`,
      command: "pnpm lead:portfolio\npnpm lead:portfolio-experiments\nsed -n '1,220p' .tmp/framer-portfolio-growth-dashboard.md\nsed -n '1,220p' .tmp/framer-portfolio-experiments.md",
      evidence: `${top.signal} Main blocker: ${top.blocker}`,
    });
  } else {
    addItem(canDoNow, {
      title: "Generate multi-plugin portfolio dashboard",
      status: "missing_portfolio",
      reason: "The long-running goal needs per-plugin priority, assets, blockers, and next actions before choosing the next promotion experiment.",
      command: "pnpm lead:portfolio\npnpm lead:portfolio-experiments -- --seed\npnpm lead:today",
    });
  }

  addCustomerFeedbackBrief({ needsConfirmation, customerFeedbackBrief });
  addLandingBaselineBrief({ canDoNow, needsConfirmation, blockedExternal, landingBaselineBrief });

  if (portfolioExperiments?.due_review_count > 0) {
    addItem(canDoNow, {
      title: "Review due portfolio experiments",
      status: "portfolio_review_due",
      reason: portfolioExperiments.recommendation || `${portfolioExperiments.due_review_count} portfolio experiment(s) have due review windows.`,
      command: "pnpm lead:portfolio-experiments\nsed -n '1,260p' .tmp/framer-portfolio-experiments.md",
      evidence: "Review before starting another channel experiment; record outcome in action/experiment logs.",
    });
  } else if (portfolioExperiments?.next_experiment?.next_local_step) {
    const nextExperiment = portfolioExperiments.next_experiment;
    const recommendation = portfolioExperiments.recommendation || "";
    if (/inventory is recorded/i.test(recommendation) && /loka/i.test(nextExperiment.plugin || "")) {
      addItem(scheduledNext, {
        title: "Wait for Creem human origin/referrer",
        status: "waiting_provider",
        reason: recommendation,
        command: "Search Gmail read-only for the Creem thread before any follow-up; do not change Creem/payment settings without provider evidence.",
        evidence: nextExperiment.evidence_required || "",
      });
    } else {
    addItem(canDoNow, {
      title: `Prepare portfolio experiment: ${nextExperiment.plugin}`,
      status: "portfolio_local_prep",
      reason: nextExperiment.next_local_step,
      command: "pnpm lead:portfolio-experiments",
      evidence: `Primary metric: ${nextExperiment.primary_metric || ""}`,
    });
    }
  }

  if (day3Readiness?.send_allowed === true) {
    addItem(canDoNow, {
      title: "Send exact Day 3 follow-up queue",
      status: "send_allowed",
      reason: day3Readiness.recommendation,
      command: "Use the Gmail queue only after same-day preflight; mark CRM rows sent only with Gmail SENT/message-id evidence.",
      evidence: "Gmail SENT/message-id per row.",
    });
  } else if (day3Readiness?.next_batch_date) {
    addItem(scheduledNext, {
      title: "Day 3 follow-up batch",
      status: day3Readiness.verdict || "scheduled",
      date: day3Readiness.next_batch_date,
      reason: day3Readiness.recommendation,
      command: "pnpm lead:day3-readiness",
    });
  }

  if (partnerReview?.due_reviews > 0) {
    addItem(canDoNow, {
      title: "Review partner/resource outreach",
      status: "review_due",
      reason: partnerReview.recommendation,
      command: "pnpm lead:partner-review\npnpm lead:signal-sweep",
    });
  } else if (partnerReview?.next_review_date) {
    addItem(scheduledNext, {
      title: "Partner/resource review",
      status: "scheduled",
      date: partnerReview.next_review_date,
      reason: partnerReview.recommendation,
      command: "pnpm lead:partner-review",
    });
  }

  if (actionReview?.due_reviews > 0) {
    addItem(canDoNow, {
      title: "Review due public action checkpoints",
      status: "review_due",
      reason: actionReview.recommendation,
      command: "pnpm lead:action-review\npnpm lead:channel-priority",
    });
  } else if (actionReview?.scheduled_reviews > 0) {
    addItem(scheduledNext, {
      title: "Public action review checkpoint",
      status: "scheduled",
      date: firstNextDue(actionReview),
      reason: actionReview.recommendation,
      command: "pnpm lead:action-review",
    });
  }

  if (communityPreflight?.publish_allowed === true) {
    addItem(needsConfirmation, {
      title: "Publish Framer Community priority 1 post",
      status: "confirmation_required",
      confirmation: communityPreflight.confirmation_phrase || "确认发布 Framer Community 第一条帖子",
      reason: communityPreflight.recommendation,
      command: communityPreflight.publish_command_after_submit || "pnpm lead:community-record -- --priority 1 --url '<published-framer-community-url>'",
      evidence: "Published Framer Community URL.",
    });
  } else if (communityPreflight?.recommendation) {
    addItem(blockedExternal, {
      title: "Framer Community post",
      status: communityPreflight.verdict || "blocked",
      reason: `${communityPreflight.recommendation} Community Feed is still worth one tracked priority-1 test after payment compliance and Marketplace upload proof are clean.`,
      command: "pnpm lead:community-preflight",
    });
  }

  if (deployReview && String(deployReview.netlify_new_deploys || deployReview.status || "").includes("blocked")) {
    addItem(blockedExternal, {
      title: "Production deploy / tracking freshness",
      status: deployReview.status || "blocked",
      reason: deployReview.recommendation || trackingFreshness?.recommendation || "",
      command: "pnpm lead:netlify-apply -- --dry-run\npnpm lead:netlify-recovery\npnpm lead:deploy-review",
      evidence: "Netlify account credits/permissions restored, then successful deploy ID.",
    });
  }

  if (marketplacePostflight?.status === "upload_not_logged") {
    stopRules.push("Do not publish Community or broaden directory traffic until Marketplace upload is logged and postflight is rerun.");
  }
  if (trackingFreshness?.fresh === false) {
    stopRules.push("Do not send broad Community/directory traffic until production tracking freshness passes strict mode; Marketplace upload can still proceed.");
  }
  if (creemCompliance?.status === "needs_action" || (Array.isArray(creemCompliance?.open_warnings) && creemCompliance.open_warnings.length)) {
    stopRules.push(`Do not resume checkout-heavy Marketplace, Community, directory, or paid traffic until the Creem warning is resolved${creemDeadlineText ? `; deadline ${creemDeadlineText}` : ""}.`);
  }
  if (day3Readiness?.send_allowed === false) {
    stopRules.push("Do not send Day 3 follow-ups before the scheduled date and same-day Gmail preflight.");
  }
  if (signalSweep?.local_signals) {
    const signals = signalSweep.local_signals;
    if (
      Number(signals.cta_events || 0) === 0 &&
      Number(signals.form_submissions || 0) === 0 &&
      Number(signals.verified_revenue_count || 0) === 0
    ) {
      stopRules.push("Do not restart cold Day 0 expansion while replies, CTA events, forms, and revenue are still zero.");
    }
  }

  const nextConfirmation =
    needsConfirmation.find((item) => item.confirmation)?.confirmation ||
    channelPriority?.next_confirmation ||
    "";

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    recommendation: recommendationFor({ needsConfirmation, canDoNow, scheduledNext, blockedExternal, channelPriority }),
    next_channel: nextChannel,
    next_confirmation: nextConfirmation,
    portfolio_priority: portfolioRows,
    portfolio_experiments: {
      status: portfolioExperiments?.status || "missing",
      active_count: portfolioExperiments?.active_count ?? null,
      due_review_count: portfolioExperiments?.due_review_count ?? null,
      recommendation: portfolioExperiments?.recommendation || "",
      rows: experimentRows,
    },
    can_do_now: canDoNow,
    needs_confirmation: needsConfirmation,
    scheduled_next: scheduledNext,
    blocked_external: blockedExternal,
    stop_rules: Array.from(new Set(stopRules)),
    source_state: {
      channel_priority: channelPriority?.recommendation || "",
      marketplace_preflight: marketplacePreflight?.verdict || "missing",
      marketplace_upload_allowed: marketplacePreflight?.upload_allowed ?? null,
      marketplace_postflight: marketplacePostflight?.status || "missing",
      community_preflight: communityPreflight?.verdict || "missing",
      cloudflare_apply: cloudflareApply?.status || "missing",
      cloudflare_apply_freshness: cloudflareDryRunFreshness,
      cloudflare_recovery: cloudflareRecovery?.status || "missing",
      payment_recovery: paymentRecovery?.status || "missing",
      payment_promotion_allowed: paymentRecovery?.promotion_allowed ?? null,
      netlify_recovery: netlifyRecovery?.status || "missing",
      day3_readiness: day3Readiness?.verdict || "missing",
      partner_review_due: partnerReview?.due_reviews ?? null,
      action_review_due: actionReview?.due_reviews ?? null,
      deploy_status: deployReview?.status || "missing",
      tracking_fresh: trackingFreshness?.fresh ?? null,
      creem_compliance: creemCompliance?.status || "missing",
      creem_deadline: creemDeadline?.deadline_at || "",
      creem_deadline_text: creemDeadlineText,
      portfolio: portfolioRows.length ? "ready" : "missing",
      portfolio_experiments: portfolioExperiments?.status || "missing",
      customer_feedback_brief: customerFeedbackBrief?.status || "missing",
      landing_baseline_brief: landingBaselineBrief?.status || "missing",
    },
  };
}

function addCustomerFeedbackBrief({ needsConfirmation, customerFeedbackBrief }) {
  if (!customerFeedbackBrief) return;
  const item = customerFeedbackBrief.item || {};
  const action = customerFeedbackBrief.external_action || item.external_action || {};
  if (customerFeedbackBrief.status !== "ready_confirmation_required" || !action.confirmation) return;

  addItem(needsConfirmation, {
    title: `Customer feedback: ${item.plugin || item.product || action.target || "next paying customer"}`,
    status: "confirmation_required",
    target: action.target || item.customer_email || "",
    reason: action.action || customerFeedbackBrief.recommendation || "Send the next customer feedback email only after explicit confirmation.",
    risk: action.risk || item.risk || "",
    expected_benefit: action.expected_benefit || item.expected_benefit || "",
    confirmation: action.confirmation || item.confirmation || "",
    command: [
      "Use Gmail only after exact confirmation.",
      customerFeedbackBrief.record_command || "",
      customerFeedbackBrief.gmail_query ? `Review query after send/reply window: ${customerFeedbackBrief.gmail_query}` : "",
    ].filter(Boolean).join("\n"),
    verification: action.verification || item.verification || "",
    evidence: "Customer feedback brief is ready; no Gmail draft or send should happen before confirmation.",
  });
}

function addLandingBaselineBrief({ canDoNow, needsConfirmation, blockedExternal, landingBaselineBrief }) {
  if (!landingBaselineBrief) return;
  const item = landingBaselineBrief.item || {};
  const action = landingBaselineBrief.external_action || item.external_action || {};
  const target = action.target || item.target_url || "";
  const concreteTarget = item.target_is_concrete === true || isConcreteUrl(target);

  if (landingBaselineBrief.status === "ready_confirmation_required" && concreteTarget && action.confirmation) {
    addItem(needsConfirmation, {
      title: `Landing/tracking baseline: ${item.plugin || "next plugin"}`,
      status: "confirmation_required",
      target,
      reason: action.action || landingBaselineBrief.recommendation || "Create the next owned landing/tracking baseline only after explicit confirmation.",
      risk: action.risk || "",
      expected_benefit: action.expected_benefit || "",
      confirmation: action.confirmation || "",
      command: [
        landingBaselineBrief.record_command || "",
        Array.isArray(landingBaselineBrief.verification_commands)
          ? landingBaselineBrief.verification_commands.join("\n")
          : "",
      ].filter(Boolean).join("\n"),
      verification: action.verification || "",
      evidence: "Target URL is concrete and the landing baseline brief is ready.",
    });
    return;
  }

  if (landingBaselineBrief.status === "needs_concrete_target_url" || !concreteTarget) {
    const exampleTarget = target
      ? target.replace("https://<owned-domain>", "https://your-owned-domain.com")
      : "https://your-owned-domain.com/plugin-use-case/";
    addItem(canDoNow, {
      title: `Choose concrete landing URL: ${item.plugin || "next plugin"}`,
      status: "needs_concrete_target_url",
      target,
      reason: landingBaselineBrief.recommendation || "The landing baseline target still contains a placeholder domain.",
      command: [
        "Edit tools/lead-finder/landing-targets.local.csv and fill target_url for this plugin.",
        "pnpm lead:portfolio-ops -- --skip-signals",
        "pnpm lead:landing-baseline-brief -- --owned-domain https://your-owned-domain.com",
        `pnpm lead:landing-baseline-brief -- --target-url ${exampleTarget}`,
        "pnpm lead:today",
      ].join("\n"),
      evidence: Array.isArray(landingBaselineBrief.preconditions)
        ? landingBaselineBrief.preconditions.join("; ")
        : "",
      verification: "Rerun Today and confirm the landing brief moves to ready_confirmation_required only after the target URL is concrete.",
    });
    return;
  }

  if (landingBaselineBrief.status && landingBaselineBrief.status !== "no_ready_baseline") {
    addItem(blockedExternal, {
      title: `Landing/tracking baseline: ${item.plugin || "next plugin"}`,
      status: landingBaselineBrief.status,
      target,
      reason: landingBaselineBrief.recommendation || "Landing baseline brief is not ready for confirmation.",
      command: "pnpm lead:landing-baseline\npnpm lead:landing-baseline-brief",
      verification: "A ready brief with a concrete target URL and exact confirmation phrase.",
    });
  }
}

function isConcreteUrl(value) {
  const text = String(value || "");
  return /^https?:\/\//i.test(text) && !text.includes("<") && !text.includes(">");
}

function portfolioProfiles(portfolio) {
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

function portfolioExperimentRows(portfolioExperiments) {
  const rows = Array.isArray(portfolioExperiments?.experiments) ? portfolioExperiments.experiments : [];
  return rows.map((row) => ({
    plugin: row.plugin || "",
    channel: row.channel || "",
    status: row.status || "",
    primary_metric: row.primary_metric || "",
    confirmation: row.confirmation || "",
    next_review: row.next_review ? `${row.next_review.label}: ${row.next_review.date}` : "",
    local_next_step: row.next_local_step || "",
  }));
}

function firstDeadline(creemCompliance) {
  const deadlines = Array.isArray(creemCompliance?.warning_deadlines)
    ? creemCompliance.warning_deadlines
    : [];
  return deadlines
    .filter((item) => item?.deadline_at)
    .sort((a, b) => String(a.deadline_at).localeCompare(String(b.deadline_at)))[0] || null;
}

function formatDeadline(deadline) {
  if (!deadline?.deadline_at) return "";
  const hours = deadline.hours_remaining === null || deadline.hours_remaining === undefined
    ? ""
    : `, ${deadline.hours_remaining}h remaining`;
  return `${deadline.deadline_at}${hours}${deadline.urgency ? `, ${deadline.urgency}` : ""}`;
}

function paymentRecoveryConfirmationGroup(paymentRecovery, labelNeedle) {
  const groups = Array.isArray(paymentRecovery?.confirmation_gated_commands)
    ? paymentRecovery.confirmation_gated_commands
    : [];
  return groups.find((group) => String(group.label || "").includes(labelNeedle)) || null;
}

function firstNextDue(review) {
  if (!Array.isArray(review?.rows)) return "";
  return review.rows.find((row) => row.next_due_date)?.next_due_date || "";
}

function recommendationFor({ needsConfirmation, canDoNow, scheduledNext, blockedExternal, channelPriority }) {
  const urgentLocal = canDoNow.find((item) => item.status === "deadline_active" || item.status === "deadline_expired");
  if (needsConfirmation.length) {
    return `Action-time confirmation needed: ${needsConfirmation[0].confirmation}.${urgentLocal ? ` Local-only today: ${urgentLocal.title}${urgentLocal.date ? ` before ${urgentLocal.date}` : ""}.` : ""}`;
  }
  if (urgentLocal) return `Do now: ${urgentLocal.title}${urgentLocal.date ? ` before ${urgentLocal.date}` : ""}.`;
  const due = canDoNow.find((item) =>
    item.status === "review_due" ||
    item.status === "portfolio_review_due" ||
    item.status === "send_allowed"
  );
  if (due) return `Do now: ${due.title}.`;
  if (scheduledNext.length) {
    const waiting = scheduledNext.find((item) => item.status === "waiting_provider");
    if (waiting) return `No external action is safe without confirmation. Waiting on: ${waiting.title}.`;
    return `No external action is safe without confirmation. Next scheduled checkpoint: ${scheduledNext[0].date || scheduledNext[0].title}.`;
  }
  if (blockedExternal.length) return `Blocked externally: ${blockedExternal[0].title}.`;
  return channelPriority?.recommendation || "Refresh local signals and follow the channel priority.";
}

function renderList(title, rows, emptyText) {
  const lines = [`## ${title}`, ""];
  if (!rows.length) {
    lines.push(emptyText, "");
    return lines;
  }
  lines.push("| Status | Date | Title | Target | Reason | Risk | Expected benefit | Confirmation | Verification | Command |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const row of rows) {
    lines.push(
      [
        row.status || "",
        row.date || "",
        row.title || "",
        row.target || "",
        cleanCell(row.reason),
        cleanCell(row.risk),
        cleanCell(row.expected_benefit),
        cleanCell(row.confirmation),
        cleanCell(row.verification || row.evidence),
        cleanCell(row.command),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }
  lines.push("");
  return lines;
}

function cleanCell(value) {
  return String(value || "")
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function renderMarkdown(plan) {
  const lines = [
    "# Framer Today",
    "",
    `Generated: ${plan.generated_at}`,
    `Today: ${plan.today}`,
    "",
    "## Recommendation",
    "",
    plan.recommendation,
    "",
    "## Current Gate",
    "",
    `- Next channel: ${plan.next_channel || "none"}`,
    `- Next confirmation: ${plan.next_confirmation || "none"}`,
    `- Marketplace preflight: ${plan.source_state.marketplace_preflight} (upload allowed ${plan.source_state.marketplace_upload_allowed === null ? "unknown" : plan.source_state.marketplace_upload_allowed ? "yes" : "no"})`,
    `- Cloudflare dry-run: ${plan.source_state.cloudflare_apply} (${plan.source_state.cloudflare_apply_freshness?.label || "missing"})`,
    `- Cloudflare recovery: ${plan.source_state.cloudflare_recovery}`,
    `- Payment recovery: ${plan.source_state.payment_recovery} (promotion allowed ${plan.source_state.payment_promotion_allowed === null ? "unknown" : plan.source_state.payment_promotion_allowed ? "yes" : "no"})`,
    `- Netlify recovery: ${plan.source_state.netlify_recovery}`,
    `- Day 3 readiness: ${plan.source_state.day3_readiness}`,
    `- Partner reviews due: ${plan.source_state.partner_review_due ?? "unknown"}`,
    `- Tracking fresh: ${plan.source_state.tracking_fresh === null ? "unknown" : plan.source_state.tracking_fresh ? "yes" : "no"}`,
    `- Creem compliance: ${plan.source_state.creem_compliance}${plan.source_state.creem_deadline_text ? ` (${plan.source_state.creem_deadline_text})` : ""}`,
    `- Portfolio: ${plan.source_state.portfolio}`,
    `- Portfolio experiments: ${plan.source_state.portfolio_experiments} (active ${plan.portfolio_experiments.active_count ?? "unknown"}, due ${plan.portfolio_experiments.due_review_count ?? "unknown"})`,
    `- Customer feedback brief: ${plan.source_state.customer_feedback_brief}`,
    `- Landing baseline brief: ${plan.source_state.landing_baseline_brief}`,
    "",
    ...renderPortfolioPriority(plan.portfolio_priority),
    ...renderPortfolioExperiments(plan.portfolio_experiments),
    ...renderList("Can Do Now", plan.can_do_now, "No due local-only or send-allowed action beyond routine refresh."),
    ...renderList("Needs Confirmation", plan.needs_confirmation, "No action-time confirmation is currently ready."),
    ...renderList("Scheduled Next", plan.scheduled_next, "No scheduled checkpoint found."),
    ...renderList("Blocked External", plan.blocked_external, "No external blocker recorded."),
    "## Stop Rules",
    "",
  ];

  if (!plan.stop_rules.length) {
    lines.push("No stop rules triggered.", "");
  } else {
    for (const rule of plan.stop_rules) lines.push(`- ${rule}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderPortfolioPriority(rows) {
  const lines = ["## Portfolio Priority", ""];
  if (!rows.length) {
    lines.push("No portfolio dashboard generated yet. Run `pnpm lead:portfolio`.", "");
    return lines;
  }
  lines.push("| Rank | Plugin | Priority | Signal | Blocker | Next action |");
  lines.push("|---:|---|---|---|---|---|");
  for (const row of rows.slice(0, 6)) {
    const plugin = row.marketplace_url ? `[${row.plugin}](${row.marketplace_url})` : row.plugin;
    lines.push(`| ${row.rank} | ${plugin} | ${cleanCell(row.priority)} | ${cleanCell(row.signal)} | ${cleanCell(row.blocker)} | ${cleanCell(row.next_action)} |`);
  }
  lines.push("");
  return lines;
}

function renderPortfolioExperiments(section) {
  const lines = ["## Portfolio Experiments", ""];
  if (!section || !Array.isArray(section.rows) || !section.rows.length) {
    lines.push("No portfolio experiment log generated yet. Run `pnpm lead:portfolio-experiments -- --seed`.", "");
    return lines;
  }
  lines.push(`- Status: ${section.status || "unknown"}`);
  lines.push(`- Active experiments: ${section.active_count ?? "unknown"}`);
  lines.push(`- Due reviews: ${section.due_review_count ?? "unknown"}`);
  lines.push(`- Recommendation: ${section.recommendation || "none"}`);
  lines.push("");
  lines.push("| Plugin | Channel | Status | Primary metric | Confirmation | Next review |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of section.rows.slice(0, 8)) {
    lines.push(`| ${cleanCell(row.plugin)} | ${cleanCell(row.channel)} | ${cleanCell(row.status)} | ${cleanCell(row.primary_metric)} | ${cleanCell(row.confirmation)} | ${cleanCell(row.next_review)} |`);
  }
  lines.push("");
  return lines;
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
    channelPriority,
    marketplacePreflight,
    marketplacePostflight,
    communityPreflight,
    cloudflareApply,
    cloudflareRecovery,
    paymentRecovery,
    netlifyRecovery,
    day3Readiness,
    partnerReview,
    actionReview,
    deployReview,
    trackingFreshness,
    signalSweep,
    creemCompliance,
    portfolio,
    portfolioExperiments,
    customerFeedbackBrief,
    landingBaselineBrief,
  ] = await Promise.all([
    readJson(args.channelPriority, null),
    readJson(args.marketplacePreflight, null),
    readJson(args.marketplacePostflight, null),
    readJson(args.communityPreflight, null),
    readJson(args.cloudflareApply, null),
    readJson(args.cloudflareRecovery, null),
    readJson(args.paymentRecovery, null),
    readJson(args.netlifyRecovery, null),
    readJson(args.day3Readiness, null),
    readJson(args.partnerReview, null),
    readJson(args.actionReview, null),
    readJson(args.deployReview, null),
    readJson(args.trackingFreshness, null),
    readJson(args.signalSweep, null),
    readJson(args.creemCompliance, null),
    readJson(args.portfolio, null),
    readJson(args.portfolioExperiments, null),
    readJson(args.customerFeedbackBrief, null),
    readJson(args.landingBaselineBrief, null),
  ]);

  const plan = assess({
    args,
    channelPriority,
    marketplacePreflight,
    marketplacePostflight,
    communityPreflight,
    cloudflareApply,
    cloudflareRecovery,
    paymentRecovery,
    netlifyRecovery,
    day3Readiness,
    partnerReview,
    actionReview,
    deployReview,
    trackingFreshness,
    signalSweep,
    creemCompliance,
    portfolio,
    portfolioExperiments,
    customerFeedbackBrief,
    landingBaselineBrief,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(plan)),
    writeText(args.json, `${JSON.stringify(plan, null, 2)}\n`),
  ]);

  process.stdout.write(`Today: ${plan.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
