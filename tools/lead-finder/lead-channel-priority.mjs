#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openComplianceWarningsForScope } from "./compliance-scope.mjs";

const DEFAULT_GATE = ".tmp/framer-growth-gate.json";
const DEFAULT_MARKETPLACE_REVIEW = ".tmp/framer-marketplace-review.json";
const DEFAULT_COMMUNITY_REVIEW = ".tmp/framer-community-review.json";
const DEFAULT_DIRECTORY_REVIEW = ".tmp/framer-directory-review.json";
const DEFAULT_DISTRIBUTION_REVIEW = ".tmp/framer-distribution-review.json";
const DEFAULT_DEPLOY_REVIEW = ".tmp/framer-deploy-review.json";
const DEFAULT_ACTION_REVIEW = ".tmp/framer-action-review.json";
const DEFAULT_PREFLIGHT = ".tmp/framer-public-preflight.json";
const DEFAULT_NEXT_ACTIONS = ".tmp/framer-next-public-actions.json";
const DEFAULT_CREEM_COMPLIANCE = ".tmp/framer-creem-compliance-review.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-channel-priority.md";
const DEFAULT_JSON = ".tmp/framer-channel-priority.json";
const UPLOAD_EVIDENCE_PLACEHOLDER = "<framer-upload-confirmation-url-or-screenshot>";
const CREATOR_SPACE_EVIDENCE_PLACEHOLDER = "<creator-space-dashboard-snapshot-or-upload-confirmation>";

function usage() {
  return `
Usage:
  pnpm lead:channel-priority

Options:
  --gate <file>                 Growth gate JSON. Default: ${DEFAULT_GATE}
  --marketplace-review <file>   Marketplace review JSON. Default: ${DEFAULT_MARKETPLACE_REVIEW}
  --community-review <file>     Community review JSON. Default: ${DEFAULT_COMMUNITY_REVIEW}
  --directory-review <file>     Directory review JSON. Default: ${DEFAULT_DIRECTORY_REVIEW}
  --distribution-review <file>  Distribution review JSON. Default: ${DEFAULT_DISTRIBUTION_REVIEW}
  --deploy-review <file>        Deploy review JSON. Default: ${DEFAULT_DEPLOY_REVIEW}
  --action-review <file>        Public action review JSON. Default: ${DEFAULT_ACTION_REVIEW}
  --preflight <file>            Public preflight JSON. Default: ${DEFAULT_PREFLIGHT}
  --next-actions <file>         Next public actions JSON. Default: ${DEFAULT_NEXT_ACTIONS}
  --creem-compliance <file>     Creem compliance review JSON. Default: ${DEFAULT_CREEM_COMPLIANCE}
  --actions <file>              External action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>               Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                 JSON output. Default: ${DEFAULT_JSON}
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    gate: DEFAULT_GATE,
    marketplaceReview: DEFAULT_MARKETPLACE_REVIEW,
    communityReview: DEFAULT_COMMUNITY_REVIEW,
    directoryReview: DEFAULT_DIRECTORY_REVIEW,
    distributionReview: DEFAULT_DISTRIBUTION_REVIEW,
    deployReview: DEFAULT_DEPLOY_REVIEW,
    actionReview: DEFAULT_ACTION_REVIEW,
    preflight: DEFAULT_PREFLIGHT,
    nextActions: DEFAULT_NEXT_ACTIONS,
    creemCompliance: DEFAULT_CREEM_COMPLIANCE,
    actions: DEFAULT_ACTIONS,
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
    if (key === "--marketplace-review") {
      args.marketplaceReview = value;
      index += 1;
      continue;
    }
    if (key === "--community-review") {
      args.communityReview = value;
      index += 1;
      continue;
    }
    if (key === "--directory-review") {
      args.directoryReview = value;
      index += 1;
      continue;
    }
    if (key === "--distribution-review") {
      args.distributionReview = value;
      index += 1;
      continue;
    }
    if (key === "--deploy-review") {
      args.deployReview = value;
      index += 1;
      continue;
    }
    if (key === "--action-review") {
      args.actionReview = value;
      index += 1;
      continue;
    }
    if (key === "--preflight") {
      args.preflight = value;
      index += 1;
      continue;
    }
    if (key === "--next-actions") {
      args.nextActions = value;
      index += 1;
      continue;
    }
    if (key === "--creem-compliance") {
      args.creemCompliance = value;
      index += 1;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
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

function actionById(preflight, id) {
  return (Array.isArray(preflight?.actions) ? preflight.actions : []).find((action) => action.id === id);
}

function nextCardById(nextActions, id) {
  return (Array.isArray(nextActions?.cards) ? nextActions.cards : []).find((card) => card.id === id);
}

function number(value) {
  return Number.parseInt(value || "0", 10) || 0;
}

function money(value) {
  return Number.parseFloat(String(value || "0").replace(/[$,\s]/g, "")) || 0;
}

function buildPriority({
  gate,
  marketplaceReview,
  communityReview,
  directoryReview,
  distributionReview,
  deployReview,
  actionReview,
  preflight,
  nextActions,
  creemCompliance,
  actions,
}) {
  const summary = gate?.summary || {};
  const decision = gate?.decision || {};
  const cards = [
    complianceCard({ actions, creemCompliance }),
    actionReviewCard({ actionReview }),
    marketplaceCard({ marketplaceReview, preflight, nextActions }),
    communityCard({ communityReview, preflight, nextActions }),
    directoryCard({ directoryReview, preflight, nextActions }),
    distributionCard({ distributionReview }),
    followupCard({ summary, decision }),
    coldExpansionCard({ summary, decision }),
    deployCard({ deployReview }),
    monitoringCard({ summary }),
  ];
  const ranked = cards
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.rank_hint - b.rank_hint)
    .map((card, index) => ({ ...card, rank: index + 1 }));
  const executable = ranked.filter((card) =>
    ["resolve_blocker", "execute_next", "test_once", "review_due", "fulfill_intent", "monitor"].includes(card.decision),
  );
  const top = executable[0] || ranked[0] || null;

  return {
    generated_at: new Date().toISOString(),
    verdict: decision.verdict || "unknown",
    cold_email_cap: decision.cold_email_cap ?? "unknown",
    proof_state: {
      replies: number(summary.replies),
      opportunities: number(summary.opportunities),
      cta_events: number(summary.events),
      form_submissions: number(summary.form_submissions),
      booked_revenue_usd: money(summary.booked_revenue_usd),
      pending_revenue_signals: number(summary.pending_revenue_signals),
      marketplace_upload_done: Boolean(summary.marketplace_upload_done),
      public_posts_done: number(summary.public_posts_done),
      directory_forms_done: number(summary.directory_forms_done),
      tracked_pipeline_usd: money(summary.tracked_pipeline_usd),
      next_due_date: summary.next_due_date || "",
      next_due_count: number(summary.next_due_count),
    },
    next_confirmation: top?.confirmation || "",
    next_channel: top?.channel || "",
    recommendation: recommendationFor(top, decision),
    cards: ranked,
    stop_rules: stopRules(),
  };
}

function complianceCard({ actions, creemCompliance }) {
  const warnings = openComplianceWarningsForScope(actions, "polyglot_aeo");
  const creemWarnings = Array.isArray(creemCompliance?.open_warnings) ? creemCompliance.open_warnings : [];
  const openCount = Math.max(warnings.length, creemWarnings.length);
  if (!openCount && creemCompliance?.status !== "needs_action") return null;
  const warning = creemWarnings[0] || warnings[0] || {};
  const deadline = firstDeadline(creemCompliance);
  const deadlineText = deadline
    ? `${deadline.deadline_at}${deadline.hours_remaining === null || deadline.hours_remaining === undefined ? "" : ` (${deadline.hours_remaining}h remaining, ${deadline.urgency || "active"})`}`
    : "";
  const supportDraft = creemCompliance?.support_draft ? "\n\n# local-only: review/copy Creem support draft\nsed -n '1,180p' .tmp/framer-creem-compliance-review.md" : "";
  const resolvedCommand =
    creemCompliance?.resolved_command ||
    "pnpm lead:actions -- --add --type compliance_warning --channel creem --campaign unregistered_checkout_traffic --status resolved --target 'CREEM Compliance Review - Unregistered Traffic Detected' --evidence '<provider-dashboard-or-support-confirmation>' --note 'Creem compliance warning resolved'";
  return {
    rank_hint: -1,
    channel: "Payment Compliance",
    decision: "resolve_blocker",
    score: 112,
    status: `${openCount} open warning(s)${deadlineText ? ` / deadline ${deadlineText}` : ""}`,
    confirmation: "",
    why: creemCompliance?.recommendation || warning.note || warning.target || "A payment/provider compliance warning is open.",
    proof_to_collect: "Provider dashboard or support-thread confirmation that the store/domain warning is resolved.",
    command: `pnpm lead:creem-compliance\npnpm lead:payment-compliance-recovery\npnpm lead:checkout-origin\npnpm lead:ops${supportDraft}\n\n# after provider confirms closure:\n${resolvedCommand}`,
    review_window: deadlineText || "Before checkout-heavy Marketplace, Community, directory, or paid traffic pushes.",
  };
}

function firstDeadline(creemCompliance) {
  const deadlines = Array.isArray(creemCompliance?.warning_deadlines)
    ? creemCompliance.warning_deadlines
    : [];
  return deadlines
    .filter((item) => item?.deadline_at)
    .sort((a, b) => String(a.deadline_at).localeCompare(String(b.deadline_at)))[0] || null;
}

function actionReviewCard({ actionReview }) {
  const due = number(actionReview?.due_reviews);
  const scheduled = number(actionReview?.scheduled_reviews);
  const signal = number(actionReview?.signal_actions);
  if (due > 0) {
    return {
      rank_hint: 0,
      channel: "Public Action Review",
      decision: "review_due",
      score: 106,
      status: `${due} due`,
      confirmation: "",
      why: actionReview?.recommendation || "A public action review is due before another public push.",
      proof_to_collect: "CTA events, forms, Marketplace snapshot changes, visible replies/comments, and review outcome.",
      command: "pnpm lead:action-review && pnpm lead:forms && pnpm lead:events && pnpm lead:channel-priority && pnpm lead:ops",
      review_window: "Before starting the next external action.",
    };
  }
  if (signal > 0) {
    return {
      rank_hint: 0,
      channel: "Public Action Review",
      decision: "fulfill_intent",
      score: 94,
      status: `${signal} signal action(s)`,
      confirmation: "",
      why: actionReview?.recommendation || "A public action has signal that should be fulfilled or attributed before more distribution.",
      proof_to_collect: "Lead/contact detail, source path, CTA/form/revenue evidence, and fulfillment status.",
      command: "pnpm lead:action-review && pnpm lead:forms -- --apply && pnpm lead:report",
      review_window: "Same day.",
    };
  }
  if (scheduled > 0) {
    return {
      rank_hint: 0,
      channel: "Public Action Review",
      decision: "scheduled",
      score: 40,
      status: `${scheduled} scheduled`,
      confirmation: "",
      why: actionReview?.recommendation || "A future public action review is scheduled.",
      proof_to_collect: "Review queue stays visible while higher-priority actions proceed.",
      command: "pnpm lead:action-review",
      review_window: actionReview?.rows?.[0]?.next_due_date || "Next scheduled checkpoint.",
    };
  }
  return null;
}

function marketplaceCard({ marketplaceReview, preflight, nextActions }) {
  const action = actionById(preflight, "marketplace_plugin_zip") || {};
  const nextCard = nextCardById(nextActions, "marketplace_plugin_zip") || {};
  const status = marketplaceReview?.status || "unknown";
  if (action.status === "blocked") {
    return {
      rank_hint: 1,
      channel: "Framer Marketplace",
      decision: "blocked_by_preflight",
      score: 24,
      status: action.blockers?.length ? action.blockers.slice(0, 2).join("; ") : "preflight_blocked",
      confirmation: "",
      why: "Marketplace upload is blocked by the public action preflight.",
      proof_to_collect: "A clean Marketplace preflight plus payment compliance recovery evidence.",
      command: "pnpm lead:public-preflight && pnpm lead:marketplace-preflight && pnpm lead:channel-priority",
      review_window: "Before requesting Marketplace upload confirmation.",
    };
  }
  if (status === "upload_not_logged") {
    return {
      rank_hint: 1,
      channel: "Framer Marketplace",
      decision: "execute_next",
      score: 100,
      status,
      confirmation: action.confirmation || nextCard.confirmation || "确认上传 plugin.zip 到 Framer Marketplace",
      why: "The plugin package is ready, but the public Marketplace version is not logged. This is the smallest public availability fix before measuring installs, opens, and checkout intent.",
      proof_to_collect: "Upload confirmation plus Creator Space users/opens/version snapshot.",
      command: action.command_after_action || `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${UPLOAD_EVIDENCE_PLACEHOLDER}' --note 'uploaded from Framer Marketplace New Version flow'`,
      review_window: "Immediately after upload, then again after Community/directory traffic.",
    };
  }
  if (status === "needs_after_upload_snapshot") {
    return {
      rank_hint: 1,
      channel: "Framer Marketplace",
      decision: "measure",
      score: 82,
      status,
      confirmation: "",
      why: "Upload is logged, but the after-upload Creator Space snapshot is missing.",
      proof_to_collect: "Users, opens, version, and updated values.",
      command: `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${CREATOR_SPACE_EVIDENCE_PLACEHOLDER}' --users <users> --opens <opens> --version <version> --updated "<updated>"`,
      review_window: "Same day.",
    };
  }
  return {
    rank_hint: 1,
    channel: "Framer Marketplace",
    decision: "monitor",
    score: status === "marketplace_changed" ? 66 : 45,
    status,
    confirmation: "",
    why: marketplaceReview?.recommendation || "Marketplace review is available for monitoring.",
    proof_to_collect: "Opens/users/version deltas plus install and checkout events.",
    command: "pnpm lead:marketplace-review && pnpm lead:events && pnpm lead:forms",
    review_window: "After every public traffic push.",
  };
}

function communityCard({ communityReview, preflight, nextActions }) {
  const action = actionById(preflight, "community_priority_1") || {};
  const nextCard = nextCardById(nextActions, "community_priority_1") || {};
  const verdict = communityReview?.verdict || "unknown";
  if (action.status === "blocked") {
    return {
      rank_hint: 2,
      channel: "Framer Community Feed",
      decision: "blocked_by_preflight",
      score: 24,
      status: action.blockers?.length ? action.blockers.slice(0, 2).join("; ") : "preflight_blocked",
      confirmation: "",
      why: "Community Feed is worth one tracked priority-1 test for Framer-native proof, but publishing is blocked until payment compliance, Marketplace upload proof, and the public action preflight are clean.",
      proof_to_collect: "A clean preflight first; after publish, collect the post URL, visible comments, DMs/profile replies, CTA clicks, forms, and Marketplace lift.",
      command: "pnpm lead:community-preflight && pnpm lead:public-preflight && pnpm lead:channel-priority",
      review_window: "After payment compliance and Marketplace upload proof; then 24h, 48h, and 72h after the first post.",
    };
  }
  if (verdict === "not_started_worth_testing") {
    return {
      rank_hint: 2,
      channel: "Framer Community Feed",
      decision: "test_once",
      score: 86,
      status: verdict,
      confirmation: action.confirmation || nextCard.confirmation || "确认发布 Framer Community 第一条帖子",
      why: "The channel is untested and can create public proof without expanding cold outreach.",
      proof_to_collect: "Published URL, visible comments, DMs/profile replies, CTA clicks, forms, or Marketplace lift.",
      command: action.command_after_action || "pnpm lead:community-record -- --priority 1 --url '<published-framer-community-url>'",
      review_window: "24h and 48h after the first post.",
    };
  }
  if (verdict === "revise_hook_before_next_post") {
    return {
      rank_hint: 2,
      channel: "Framer Community Feed",
      decision: "revise_before_repeat",
      score: 38,
      status: verdict,
      confirmation: "",
      why: communityReview?.recommendation || "The first post did not generate enough signal.",
      proof_to_collect: "A rewritten hook tied to a visible objection or sharper launch pain.",
      command: "pnpm lead:community && pnpm lead:community-lint",
      review_window: "Before any priority 2 post.",
    };
  }
  return {
    rank_hint: 2,
    channel: "Framer Community Feed",
    decision: verdict === "continue_community" ? "monitor" : "wait",
    score: verdict === "continue_community" ? 72 : 45,
    status: verdict,
    confirmation: "",
    why: communityReview?.recommendation || "Community review needs more signal or a scheduled review date.",
    proof_to_collect: "Manual comments/DMs/opportunities/revenue plus tracked CTA/form/Marketplace lift.",
    command: "pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events>",
    review_window: communityReview?.next_review_date || "At the next 24h/48h checkpoint.",
  };
}

function directoryCard({ directoryReview, preflight, nextActions }) {
  const action = actionById(preflight, "directory_form") || {};
  const nextCard = nextCardById(nextActions, "directory_form") || {};
  const manualReady = number(directoryReview?.manual_ready);
  const forms = number(directoryReview?.directory_forms);
  const events = number(directoryReview?.directory_events);
  if (action.status === "blocked") {
    return {
      rank_hint: 3,
      channel: "Framer Directories",
      decision: "blocked_by_preflight",
      score: 24,
      status: action.blockers?.length ? action.blockers.slice(0, 2).join("; ") : "preflight_blocked",
      confirmation: "",
      why: "Directory submission is blocked by the public action preflight.",
      proof_to_collect: "Payment compliance recovery cleared, then one directory submission confirmation or screenshot.",
      command: "pnpm lead:public-preflight && pnpm lead:directory-review && pnpm lead:channel-priority",
      review_window: "Before requesting directory submission confirmation.",
    };
  }
  if (forms > 0 || events > 0) {
    return {
      rank_hint: 3,
      channel: "Framer Directories",
      decision: "fulfill_intent",
      score: 90,
      status: "intent_detected",
      confirmation: "",
      why: directoryReview?.recommendation || "Directory-sourced intent exists.",
      proof_to_collect: "Form details, CTA source path, listing URL, or reply.",
      command: "pnpm lead:forms -- --apply && pnpm lead:directory-review",
      review_window: "Same day.",
    };
  }
  if (manualReady > 0) {
    return {
      rank_hint: 3,
      channel: "Framer Directories",
      decision: "test_once",
      score: 74,
      status: "manual_target_ready",
      confirmation: action.confirmation || nextCard.confirmation || "确认提交 Frameplate / All Framer 目录表单",
      why: "Directory listings are long-lived discovery surfaces. Submit one high-fit target first so later CTA/form movement can be attributed.",
      proof_to_collect: "Submission confirmation, screenshot, accepted listing URL, or directory owner reply.",
      command: action.command_after_action || "pnpm lead:directory-record -- --campaign frameplate_plugin --evidence '<submission-confirmation-or-screenshot>'",
      review_window: "7 days and 14 days after submission.",
    };
  }
  return {
    rank_hint: 3,
    channel: "Framer Directories",
    decision: "wait",
    score: 34,
    status: "no_manual_target_ready",
    confirmation: "",
    why: directoryReview?.recommendation || "No directory action is currently ready.",
    proof_to_collect: "Reply, accepted listing, CTA event, or form submission.",
    command: "pnpm lead:directory-review",
    review_window: "After a directory reply or accepted listing.",
  };
}

function distributionCard({ distributionReview }) {
  const posted = number(distributionReview?.priority_posted);
  const total = number(distributionReview?.priority_posts);
  const events = number(distributionReview?.priority_events);
  const forms = number(distributionReview?.priority_forms);
  if (forms > 0 || events > 0) {
    return {
      rank_hint: 4,
      channel: "Generic Public Posts",
      decision: "fulfill_intent",
      score: 88,
      status: "intent_detected",
      confirmation: "",
      why: distributionReview?.recommendation || "Public distribution has tracked intent.",
      proof_to_collect: "CTA/form path and matching reply/audit fulfillment.",
      command: "pnpm lead:forms -- --apply && pnpm lead:events && pnpm lead:report",
      review_window: "Same day.",
    };
  }
  return {
    rank_hint: 4,
    channel: "Generic Public Posts",
    decision: posted < total ? "hold_until_primary_public_action" : "revise_before_repeat",
    score: posted < total ? 58 : 36,
    status: `${posted}/${total || "?"} priority posted`,
    confirmation: "",
    why: distributionReview?.recommendation || "Priority public posts are not yet producing signal.",
    proof_to_collect: "Post URL, CTA event, form submission, or Marketplace lift.",
    command: "pnpm lead:distribution-review",
    review_window: "After Marketplace upload and first Community test.",
  };
}

function followupCard({ summary }) {
  const dueToday = number(summary.due_today);
  const nextDate = summary.next_due_date || "";
  if (dueToday > 0) {
    return {
      rank_hint: 5,
      channel: "Scheduled Follow-ups",
      decision: "execute_scheduled_only",
      score: 68,
      status: `${dueToday} due today`,
      confirmation: "",
      why: "Follow-ups are already scheduled; process only due rows after reply/bounce preflight.",
      proof_to_collect: "Gmail sent IDs, replies, bounces, unsubscribes.",
      command: "pnpm lead:monitor -- --lookback 2\npnpm lead:followup-preflight",
      review_window: "Before and after send.",
    };
  }
  return {
    rank_hint: 5,
    channel: "Scheduled Follow-ups",
    decision: "wait",
    score: 26,
    status: nextDate ? `next due ${nextDate}` : "none due",
    confirmation: "",
    why: nextDate
      ? `${number(summary.next_due_count)} lead(s) are scheduled for ${nextDate}; do not pull them forward.`
      : "No follow-ups are due.",
    proof_to_collect: "Replies, bounces, unsubscribes before the due window.",
    command: "pnpm lead:monitor",
    review_window: nextDate || "Next scheduled follow-up date.",
  };
}

function coldExpansionCard({ summary, decision }) {
  const cap = decision.cold_email_cap ?? 0;
  const sent = number(summary.sent);
  const replies = number(summary.replies);
  return {
    rank_hint: 6,
    channel: "New Cold Day 0 Email",
    decision: cap > 0 ? "limited_test" : "paused",
    score: cap > 0 ? 42 : 0,
    status: `${sent} sent / ${replies} replies / cap ${cap}`,
    confirmation: "",
    why: cap > 0
      ? "Cold expansion is allowed only in a small cap."
      : "Cold expansion is paused until there is a reply, CTA event, form submission, public proof, or revenue signal.",
    proof_to_collect: "Human replies and non-test CTA/form/revenue signals.",
    command: cap > 0 ? `pnpm lead:sendpack -- --limit ${cap}` : "pnpm lead:gate",
    review_window: "After proof signal appears.",
  };
}

function deployCard({ deployReview }) {
  const status = deployReview?.status || "unknown";
  const blocked = String(deployReview?.netlify_new_deploys || "").startsWith("blocked");
  return {
    rank_hint: 7,
    channel: "Production Site Deploy",
    decision: blocked ? "blocked_external" : "monitor",
    score: blocked ? -10 : 44,
    status,
    confirmation: "",
    why: deployReview?.recommendation || "Deploy review should be checked before campaign pushes.",
    proof_to_collect: "Successful Netlify deploy ID, site check pass, CTA/form tracking pass.",
    command: blocked ? "pnpm lead:deploy-review" : "pnpm lead:site-check && pnpm lead:deploy-review",
    review_window: blocked ? "After Netlify credits are restored." : "Before public distribution.",
  };
}

function monitoringCard({ summary }) {
  return {
    rank_hint: 8,
    channel: "Signal Monitoring",
    decision: "monitor",
    score: 52,
    status: `${number(summary.replies)} replies / ${number(summary.events)} CTA / ${number(summary.form_submissions)} forms`,
    confirmation: "",
    why: "Monitoring is the only always-on action while public side effects need confirmation.",
    proof_to_collect: "Replies, bounces, unsubscribes, CTA events, forms, Marketplace snapshot changes, and Creem payments.",
    command: "pnpm lead:forms && pnpm lead:events && pnpm lead:marketplace-review && pnpm lead:report && pnpm lead:ops",
    review_window: "Daily, and immediately after public action.",
  };
}

function recommendationFor(top, decision) {
  if (!top) return "No channel data is available. Refresh the review commands first.";
  const cold = decision.cold_email_cap === 0
    ? " Keep new cold Day 0 email paused until proof appears."
    : "";
  return `Next channel: ${top.channel} (${top.decision}).${top.confirmation ? ` Confirmation required: ${top.confirmation}.` : ""}${cold}`;
}

function stopRules() {
  return [
    "Resolve open payment, Marketplace, or policy compliance warnings before pushing checkout-heavy traffic.",
    "Do not expand new cold Day 0 email while reply/CTA/form/revenue proof is zero.",
    "For Framer Community, publish only priority 1 first; if 48h has zero comments, DMs, CTA events, forms, and Marketplace lift, rewrite the hook before priority 2.",
    "For directories, submit one manual target first; if 7/14 day checks show no accepted listing, CTA, form, or reply, do not broaden the directory batch.",
    "After Marketplace upload, record a Creator Space snapshot before attributing later Community or directory traffic.",
    "Do not retry Netlify deploys until the credit block is resolved; production is currently usable for traffic.",
  ];
}

function renderMarkdown(priority) {
  const lines = [
    "# Framer Channel Priority",
    "",
    `Generated: ${priority.generated_at}`,
    `Growth gate: ${priority.verdict}`,
    `Cold email cap: ${priority.cold_email_cap}`,
    "",
    "## Recommendation",
    "",
    priority.recommendation,
    "",
    "## Proof State",
    "",
    `- Replies: ${priority.proof_state.replies}`,
    `- Opportunities: ${priority.proof_state.opportunities}`,
    `- CTA events: ${priority.proof_state.cta_events}`,
    `- Form submissions: ${priority.proof_state.form_submissions}`,
    `- Marketplace upload done: ${priority.proof_state.marketplace_upload_done ? "yes" : "no"}`,
    `- Public posts done: ${priority.proof_state.public_posts_done}`,
    `- Directory forms done: ${priority.proof_state.directory_forms_done}`,
    `- Booked revenue: $${priority.proof_state.booked_revenue_usd.toLocaleString("en-US")}`,
    `- Pending revenue signals: ${priority.proof_state.pending_revenue_signals}`,
    `- Tracked pipeline: $${priority.proof_state.tracked_pipeline_usd.toLocaleString("en-US")}`,
    `- Next follow-up: ${priority.proof_state.next_due_date || "none"}${priority.proof_state.next_due_date ? ` (${priority.proof_state.next_due_count})` : ""}`,
    "",
    "## Ranked Channels",
    "",
    "| Rank | Score | Channel | Decision | Status | Confirmation |",
    "|---:|---:|---|---|---|---|",
  ];

  for (const card of priority.cards) {
    lines.push(
      `| ${card.rank} | ${card.score} | ${card.channel} | ${card.decision} | ${pipe(card.status)} | ${pipe(card.confirmation || "")} |`,
    );
  }

  lines.push("", "## Channel Cards", "");
  for (const card of priority.cards) {
    lines.push(
      `### ${card.rank}. ${card.channel}`,
      "",
      `- Decision: ${card.decision}`,
      `- Score: ${card.score}`,
      `- Status: ${card.status}`,
      card.confirmation ? `- Confirmation phrase: ${card.confirmation}` : "",
      `- Why: ${card.why}`,
      `- Proof to collect: ${card.proof_to_collect}`,
      `- Review window: ${card.review_window}`,
      "",
      "Command:",
      "",
      "```bash",
      card.command,
      "```",
      "",
    );
  }

  lines.push("## Stop Rules", "");
  for (const rule of priority.stop_rules) lines.push(`- ${rule}`);
  lines.push("");
  return `${lines.filter((line) => line !== undefined).join("\n")}\n`;
}

function pipe(value) {
  return String(value ?? "").replace(/\|/g, "/");
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
    gate,
    marketplaceReview,
    communityReview,
    directoryReview,
    distributionReview,
    deployReview,
    actionReview,
    preflight,
    nextActions,
    creemCompliance,
    actions,
  ] = await Promise.all([
    readJson(args.gate, null),
    readJson(args.marketplaceReview, null),
    readJson(args.communityReview, null),
    readJson(args.directoryReview, null),
    readJson(args.distributionReview, null),
    readJson(args.deployReview, null),
    readJson(args.actionReview, null),
    readJson(args.preflight, null),
    readJson(args.nextActions, null),
    readJson(args.creemCompliance, null),
    readRows(args.actions),
  ]);
  const priority = buildPriority({
    gate,
    marketplaceReview,
    communityReview,
    directoryReview,
    distributionReview,
    deployReview,
    actionReview,
    preflight,
    nextActions,
    creemCompliance,
    actions,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(priority)),
    writeText(args.json, `${JSON.stringify(priority, null, 2)}\n`),
  ]);

  process.stdout.write(`Next channel: ${priority.next_channel || "none"}\n`);
  if (priority.next_confirmation) {
    process.stdout.write(`Confirmation: ${priority.next_confirmation}\n`);
  }
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
