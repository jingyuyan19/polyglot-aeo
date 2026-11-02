#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openComplianceWarningsForScope } from "./compliance-scope.mjs";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_CREEM_STORE = ".tmp/framer-creem-store-monitor.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_MARKETPLACE_PUBLIC = ".tmp/framer-marketplace-public.json";
const DEFAULT_TRACKING_FRESHNESS = ".tmp/framer-tracking-freshness.json";
const DEFAULT_LOCAL_TRACKING_FRESHNESS = ".tmp/framer-local-tracking-freshness.json";
const DEFAULT_CHECKOUT_ORIGIN = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_PAYMENT_COMPLIANCE_RECOVERY = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_CHANNEL_PRIORITY = ".tmp/framer-channel-priority.json";
const DEFAULT_COMMUNITY_REVIEW = ".tmp/framer-community-review.json";
const DEFAULT_OUTPUT = ".tmp/framer-weekly-report.md";
const DEFAULT_TARGET_SENT = 10;
const DEFAULT_TARGET_REPLIES = 2;
const DEFAULT_TARGET_OPPORTUNITIES = 1;
const VERIFIED_REVENUE_STATUSES = new Set(["verified"]);

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
const BOUNCED_STATUSES = new Set(["bounced"]);
const CLOSED_STATUSES = new Set([
  "bounced",
  "unsubscribed",
  "not_fit",
  "no_reply_closed",
  "report_closed",
  "paid_plugin",
  "service_won",
]);

function usage() {
  return `
Usage:
  pnpm lead:report
  node tools/lead-finder/lead-report.mjs --crm tools/lead-finder/outreach.local.csv

Options:
  --crm <file>                Local CRM CSV. Default: ${DEFAULT_CRM}
  --revenue <file>            Revenue CSV. Default: ${DEFAULT_REVENUE}
  --events <file>             CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --creem-store <file>        Creem API transaction monitor JSON. Default: ${DEFAULT_CREEM_STORE}
  --actions <file>            External action log CSV. Default: ${DEFAULT_ACTIONS}
  --marketplace <file>        Marketplace snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --marketplace-preflight <file> Marketplace upload preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --marketplace-public <file> Marketplace public listing JSON. Default: ${DEFAULT_MARKETPLACE_PUBLIC}
  --tracking-freshness <file> Production tracking freshness JSON. Default: ${DEFAULT_TRACKING_FRESHNESS}
  --local-tracking-freshness <file> Local static export tracking freshness JSON. Default: ${DEFAULT_LOCAL_TRACKING_FRESHNESS}
  --checkout-origin <file>   Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT_ORIGIN}
  --payment-compliance-recovery <file> Payment compliance recovery JSON. Default: ${DEFAULT_PAYMENT_COMPLIANCE_RECOVERY}
  --channel-priority <file>   Channel priority JSON. Default: ${DEFAULT_CHANNEL_PRIORITY}
  --community-review <file>   Framer Community review JSON. Default: ${DEFAULT_COMMUNITY_REVIEW}
  --output <file>             Markdown report. Default: ${DEFAULT_OUTPUT}
  --today <YYYY-MM-DD>        Report date. Default: local date.
  --target-sent <number>      Weekly sent target. Default: ${DEFAULT_TARGET_SENT}
  --target-replies <number>   Weekly reply target. Default: ${DEFAULT_TARGET_REPLIES}
  --target-opps <number>      Weekly opportunity target. Default: ${DEFAULT_TARGET_OPPORTUNITIES}
  --help                      Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    revenue: DEFAULT_REVENUE,
    events: DEFAULT_EVENTS,
    creemStore: DEFAULT_CREEM_STORE,
    actions: DEFAULT_ACTIONS,
    marketplace: DEFAULT_MARKETPLACE,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    marketplacePublic: DEFAULT_MARKETPLACE_PUBLIC,
    trackingFreshness: DEFAULT_TRACKING_FRESHNESS,
    localTrackingFreshness: DEFAULT_LOCAL_TRACKING_FRESHNESS,
    checkoutOrigin: DEFAULT_CHECKOUT_ORIGIN,
    paymentComplianceRecovery: DEFAULT_PAYMENT_COMPLIANCE_RECOVERY,
    channelPriority: DEFAULT_CHANNEL_PRIORITY,
    communityReview: DEFAULT_COMMUNITY_REVIEW,
    output: DEFAULT_OUTPUT,
    today: todayLocal(),
    targetSent: DEFAULT_TARGET_SENT,
    targetReplies: DEFAULT_TARGET_REPLIES,
    targetOpps: DEFAULT_TARGET_OPPORTUNITIES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") {
      continue;
    }
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--crm") {
      args.crm = value;
      index += 1;
      continue;
    }
    if (key === "--output") {
      args.output = value;
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
    if (key === "--creem-store") {
      args.creemStore = value;
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
    if (key === "--channel-priority") {
      args.channelPriority = value;
      index += 1;
      continue;
    }
    if (key === "--community-review") {
      args.communityReview = value;
      index += 1;
      continue;
    }
    if (key === "--today") {
      args.today = value;
      index += 1;
      continue;
    }
    if (key === "--target-sent") {
      args.targetSent = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--target-replies") {
      args.targetReplies = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--target-opps") {
      args.targetOpps = parsePositiveInt(value, key);
      index += 1;
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

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
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

  if (!rows.length) {
    return [];
  }

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

async function readRows(file) {
  try {
    return parseCsv(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readEvents(file) {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(data?.events) ? data.events.map(normalizeEvent) : [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function normalizeEvent(event) {
  return {
    created_at: event.created_at || event.ts || "",
    event_type: event.event_type || "unknown",
    cta: event.cta || "unknown",
    source_path: event.source_path || "unknown",
    destination: event.destination || "",
    utm_source: event.utm_source || "",
    utm_medium: event.utm_medium || "",
    utm_campaign: event.utm_campaign || "",
    reason: event.reason || "",
  };
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
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
  if (!denominator) {
    return "0%";
  }
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

function outreachVariant(row) {
  const match = String(row.reply_notes || "").match(/\boutreach variant:([a-z0-9-]+)/i);
  if (match) {
    return match[1].toLowerCase();
  }
  if (number(row.sent_count) > 0) {
    return "default";
  }
  return "";
}

function isDue(row, today) {
  return Boolean(row.next_followup && row.next_followup <= today && !CLOSED_STATUSES.has(row.status));
}

function summarize(rows, revenueRows, eventRows, creemStore, actionRows, marketplaceRows, marketplacePreflight, marketplacePublic, trackingFreshness, localTrackingFreshness, checkoutOrigin, paymentComplianceRecovery, communityReview, args) {
  const sentRows = rows.filter((row) => number(row.sent_count) > 0 && !BOUNCED_STATUSES.has(row.status));
  const bouncedRows = rows.filter((row) => BOUNCED_STATUSES.has(row.status));
  const repliedRows = rows.filter((row) => REPLY_STATUSES.has(row.status));
  const replyQueueRows = rows.filter((row) => row.status === "replied");
  const opportunityRows = rows.filter((row) => OPPORTUNITY_STATUSES.has(row.status));
  const reserveRows = rows.filter((row) => row.status === "reserve");
  const verifiedRevenueRows = revenueRows.filter((row) => VERIFIED_REVENUE_STATUSES.has(row.status));
  const pendingRevenueRows = revenueRows.filter((row) => row.status === "pending");
  const revenueSignalRows = revenueRows.filter((row) => row.status === "pending" || row.status === "verified");
  const installEventRows = eventRows.filter((row) => row.event_type === "install_click");
  const checkoutEventRows = eventRows.filter((row) => row.event_type === "checkout_click");
  const dueRows = rows.filter((row) => isDue(row, args.today));
  const openRows = rows.filter((row) => !CLOSED_STATUSES.has(row.status));
  const futureDueRows = openRows
    .filter((row) => row.next_followup && row.next_followup > args.today)
    .sort((a, b) => a.next_followup.localeCompare(b.next_followup));
  const nextDueDate = futureDueRows[0]?.next_followup || "";
  const nextDueCount = nextDueDate
    ? futureDueRows.filter((row) => row.next_followup === nextDueDate).length
    : 0;
  const pipelineRows = rows.filter(
    (row) =>
      money(row.deal_value_usd) > 0 &&
      !CLOSED_STATUSES.has(row.status) &&
      (row.revenue_path || OPPORTUNITY_STATUSES.has(row.status)),
  );
  const pipelineValue = pipelineRows.reduce((sum, row) => sum + money(row.deal_value_usd), 0);
  const bookedRevenue = verifiedRevenueRows.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const pendingRevenueValue = pendingRevenueRows.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const averageScore = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + number(row.score), 0) / rows.length)
    : 0;
  const variantRows = rows.filter((row) => outreachVariant(row));
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
  const benchmarkFirstDay3Prepared = actionRows.some(
    (row) =>
      row.type === "copy_update" &&
      row.campaign === "benchmark_first_day3" &&
      row.status === "done",
  );
  const openComplianceWarnings = actionRows
    .map((row, index) => ({ ...row, __index: index }))
    .filter((row) => openComplianceWarningsForScope([row], "polyglot_aeo").length)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index);
  const recentActions = actionRows
    .map((row, index) => ({ ...row, __index: index }))
    .filter((row) => row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index)
    .slice(0, 10);
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
    replyQueue: replyQueueRows.length,
    reserve: reserveRows.length,
    opportunities: opportunityRows.length + revenueSignalRows.length,
    crmOpportunities: opportunityRows.length,
    pipelineValue,
    bookedRevenue,
    pendingRevenueValue,
    creemStore,
    revenueSignals: revenueSignalRows.length,
    verifiedRevenueRows,
    pendingRevenueRows,
    revenueRows,
    eventRows,
    actionRows,
    recentActions,
    marketplaceUploadDone,
    marketplaceUploadPlanned,
    marketplacePreflight,
    marketplacePublic,
    trackingFreshness,
    localTrackingFreshness,
    checkoutOrigin,
    paymentComplianceRecovery,
    communityReview,
    openComplianceWarnings,
    benchmarkFirstDay3Prepared,
    latestMarketplace,
    installEvents: installEventRows.length,
    checkoutEvents: checkoutEventRows.length,
    nextDueDate,
    nextDueCount,
    averageScore,
    replyRate: pct(repliedRows.length, sentRows.length),
    opportunityRate: pct(opportunityRows.length, sentRows.length),
    sentRows,
    bouncedRows,
    repliedRows,
    replyQueueRows,
    opportunityRows,
    dueRows,
    variantRows,
    reserveRows,
  };
}

function progressLine(label, value, target) {
  const marker = value >= target ? "hit" : "gap";
  return `- ${label}: ${value}/${target} (${marker})`;
}

function channelCard(priority, channel) {
  const cards = Array.isArray(priority?.cards) ? priority.cards : [];
  return cards.find((card) => card.channel === channel) || null;
}

function channelPriorityAction(priority) {
  if (!priority?.recommendation) return "";
  const next = Array.isArray(priority.cards)
    ? [...priority.cards].sort((a, b) => Number(a.rank) - Number(b.rank))[0]
    : null;
  const recommendation = priority.recommendation;
  const command = next?.command ? ` Command: \`${next.command}\`.` : "";
  const confirmation = priority.next_confirmation && !recommendation.includes(priority.next_confirmation)
    ? ` Confirmation required: ${priority.next_confirmation}.`
    : "";
  return `Channel priority: ${recommendation}${confirmation}${command}`;
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

function nextActions(summary, args, channelPriority) {
  const actions = [];
  const sentGap = Math.max(0, args.targetSent - summary.sent);
  const priorityAction = channelPriorityAction(channelPriority);

  if (priorityAction) {
    actions.push(priorityAction);
  }

  if (summary.openComplianceWarnings?.length) {
    const warning = summary.openComplianceWarnings[0];
    actions.push(`Resolve compliance warning before checkout-heavy promotion: ${warning.target || warning.campaign} (${warning.status}). Evidence: ${warning.evidence || "see action log"}.${complianceDeadlineText(warning)}`);
  }

  if (summary.checkoutOrigin && summary.checkoutOrigin.status !== "ready") {
    actions.push(`Checkout origin is not ready (${summary.checkoutOrigin.status || "unknown"}). ${summary.checkoutOrigin.recommendation || "Run `pnpm lead:checkout-origin`."}`);
  }

  if (summary.paymentComplianceRecovery && summary.paymentComplianceRecovery.status !== "ready_for_marketplace_confirmation") {
    actions.push(`Payment compliance recovery is ${summary.paymentComplianceRecovery.status || "unknown"}. ${summary.paymentComplianceRecovery.recommendation || "Run `pnpm lead:payment-compliance-recovery`."}`);
    actions.push("Run `pnpm lead:blocker-brief` for the ordered unblock path, next confirmation phrase, commands, and evidence checklist before taking any external action.");
  }

  if (!summary.marketplaceUploadDone && summary.marketplacePreflight) {
    if (summary.marketplacePreflight.upload_allowed) {
      actions.push(`Marketplace preflight is ready (${summary.marketplacePreflight.verdict}); upload only after explicit confirmation, then record the upload with external evidence and a fresh Creator Space snapshot.`);
    } else {
      const blockerText = Array.isArray(summary.marketplacePreflight.blockers) && summary.marketplacePreflight.blockers.length
        ? ` Blockers: ${summary.marketplacePreflight.blockers.slice(0, 3).join("; ")}.`
        : "";
      actions.push(`Marketplace preflight is not allowing upload (${summary.marketplacePreflight.verdict || "unknown"}). Run \`pnpm lead:marketplace-preflight\` after fixing it.${blockerText}`);
    }
  }
  if (summary.trackingFreshness && summary.trackingFreshness.fresh === false) {
    actions.push("Production tracking is stale; restore Netlify deploy access, rerun `pnpm lead:netlify-apply -- --dry-run`, then deploy only with the explicit Netlify confirmation before broad Community or directory traffic.");
  }
  if (
    summary.trackingFreshness?.fresh === false &&
    summary.localTrackingFreshness?.fresh === true
  ) {
    actions.push("Local static export tracking is fresh; after deploy access is restored, use `pnpm lead:netlify-apply -- --confirm '确认部署 polyglotaeo-web 到 Netlify'` so build, deploy, postchecks, and action logging stay together.");
  }
  if (summary.communityReview?.recommendation) {
    actions.push(`Community review: ${summary.communityReview.recommendation}`);
  }

  if (!priorityAction && !summary.marketplaceUploadDone && summary.marketplaceUploadPlanned) {
    actions.push("Upload the prepared `plugin.zip` via Framer `More options -> New Version`, then record it with `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '<framer-upload-confirmation-url-or-screenshot>'` after replacing the evidence placeholder.");
  }
  if (summary.marketplaceUploadDone && summary.checkoutEvents === 0) {
    actions.push("Marketplace upload is recorded; monitor plugin opens/users and checkout CTA events after distribution.");
  }
  if (sentGap > 0) {
    const usableQueue = Math.min(sentGap, summary.due);
    if (usableQueue > 0) {
      actions.push(`Process ${usableQueue} due lead(s) from .tmp/framer-actions.md; send the rows already marked verified.`);
    }
    if (sentGap > usableQueue) {
      actions.push(`Collect enough candidates to create ${sentGap - usableQueue} more verified Day 0 lead(s).`);
    }
  }
  if (summary.replyQueue > 0) {
    actions.push("Run `pnpm lead:audit -- --status replied`, send the promised mini audit, then mark it `mini_audit_sent`.");
  }
  if (summary.pendingRevenueRows.length > 0) {
    actions.push("Verify pending revenue signals in Gmail/Creem, then update them with `pnpm lead:revenue -- --status verified --amount-usd ...`.");
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
      actions.push(`Creem API monitor found ${polyglotCount} new Polyglot transaction(s); confirm they are live revenue, then run the generated lead:revenue command(s).`);
    } else if (baselineCount > 0) {
      actions.push(`Creem API monitor baseline includes ${baselineCount} Polyglot transaction(s); review them before assuming no historical revenue was missed.`);
    } else if (status === "missing_api_key" || status === "fetch_failed") {
      actions.push(`Creem API monitor is ${status}: ${summary.creemStore.recommendation}`);
    }
  }
  if (summary.checkoutEvents > 0 && summary.revenueSignals === 0) {
    actions.push("Checkout intent exists but no revenue signal is recorded; verify Creem dashboard/email and update the revenue ledger if needed.");
  }
  if (summary.installEvents === 0 && summary.checkoutEvents === 0 && genericPostsHeld(channelPriority)) {
    actions.push("No tracked CTA intent yet, but Generic Public Posts are on hold by channel priority. Upload Marketplace first, then test Framer Community priority 1 before publishing broader generic posts.");
  } else if (summary.installEvents === 0 && summary.checkoutEvents === 0) {
    actions.push("No tracked CTA intent yet; publish priority 1 and 2 from `.tmp/framer-distribution-kit.md` first: `Framer AEO benchmark post` and `Agency handoff post`, then rerun `pnpm lead:events && pnpm lead:forms`.");
  }
  if (
    summary.sent >= args.targetSent &&
    summary.due === 0 &&
    summary.replyQueue === 0 &&
    summary.nextDueDate
  ) {
    actions.push(`Monitor replies. Next scheduled follow-up: ${summary.nextDueDate} for ${summary.nextDueCount} lead(s).`);
  }
  const dueAgencyRows = summary.dueRows.filter((row) =>
    String(row.issue_1 || "").toLowerCase().startsWith("agency partner prospect:"),
  );
  if (summary.replies < args.targetReplies && summary.sent >= args.targetSent && dueAgencyRows.length > 0) {
    actions.push(`Reply target is weak; send the ${dueAgencyRows.length} queued agency-handoff-v2 note(s), which lead with a free 3-point client handoff deliverable instead of the plugin.`);
  } else if (summary.replies < args.targetReplies && summary.sent >= args.targetSent && summary.reserve > 0) {
    actions.push("Reply target is weak; use the value-first reserve pack for the next Day 0 batch instead of repeating the default first email.");
  } else if (summary.replies < args.targetReplies && summary.sent >= args.targetSent && summary.benchmarkFirstDay3Prepared && summary.nextDueDate) {
    actions.push(`Reply target is weak; the benchmark-first Day 3 pack is prepared for ${summary.nextDueDate}. On the send date, run \`pnpm lead:day3-brief -- --today ${summary.nextDueDate}\`, scan Gmail for replies, bounces, unsubscribes, and revenue signals, then send only the remaining due queue.`);
  } else if (summary.replies < args.targetReplies && summary.sent >= args.targetSent) {
    actions.push("Reply target is weak; tighten the first line around one specific page/locale finding.");
  }
  if (summary.opportunities < args.targetOpps && summary.replies > 0) {
    actions.push("Convert replies into a concrete mini audit, install, or launch QA offer within 24 hours.");
  }
  if (summary.due > 0 && sentGap === 0) {
    actions.push(`Process ${summary.due} due action(s) from .tmp/framer-actions.md.`);
  }
  if (!actions.length) {
    actions.push("Keep the same cadence and add another 100 candidate URLs next week.");
  }

  return actions;
}

function renderRows(rows, emptyText) {
  if (!rows.length) {
    return `${emptyText}\n`;
  }

  const lines = ["| Domain | Status | Channel | Score | Next action | Notes |", "|---|---|---|---:|---|---|"];
  for (const row of rows.slice(0, 12)) {
    lines.push(
      `| ${row.domain || ""} | ${row.status || ""} | ${row.contact_channel || "manual"} | ${row.score || ""} | ${row.next_action || ""} | ${(row.reply_notes || row.issue_1 || "").replace(/\|/g, "/").slice(0, 120)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderRevenueRows(rows, emptyText) {
  if (!rows.length) {
    return `${emptyText}\n`;
  }

  const lines = ["| Date | Source | Status | Product | Value | Evidence |", "|---|---|---|---|---:|---|"];
  for (const row of rows.slice(0, 12)) {
    const value = row.amount_usd === "" ? "unknown" : formatUsd(money(row.amount_usd));
    const evidence = [
      row.customer,
      row.domain,
      row.email_id ? `email ${row.email_id}` : "",
      row.notes,
    ]
      .filter(Boolean)
      .join(" / ")
      .replace(/\|/g, "/")
      .slice(0, 220);
    lines.push(
      `| ${row.date || ""} | ${row.source || ""} | ${row.status || ""} | ${row.product || ""} | ${value} | ${evidence} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderVariantRows(rows) {
  if (!rows.length) {
    return "No outreach variants have sent data yet.\n";
  }

  const variants = Array.from(new Set(rows.map(outreachVariant))).sort();
  const lines = ["| Variant | Sent attempts | Bounced | Replies | Opportunities | Reply rate |", "|---|---:|---:|---:|---:|---:|"];
  for (const variant of variants) {
    const group = rows.filter((row) => outreachVariant(row) === variant);
    const sent = group.filter((row) => number(row.sent_count) > 0).length;
    const bounced = group.filter((row) => BOUNCED_STATUSES.has(row.status)).length;
    const replies = group.filter((row) => REPLY_STATUSES.has(row.status)).length;
    const opportunities = group.filter((row) => OPPORTUNITY_STATUSES.has(row.status)).length;
    lines.push(`| ${variant} | ${sent} | ${bounced} | ${replies} | ${opportunities} | ${pct(replies, sent - bounced)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderEventCounts(rows, key, emptyText) {
  if (!rows.length) {
    return `${emptyText}\n`;
  }

  const lines = ["| Value | Events |", "|---|---:|"];
  for (const [value, count] of countBy(rows, key).slice(0, 8)) {
    lines.push(`| ${String(value || "unknown").replace(/\|/g, "/")} | ${count} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderEventRows(rows, emptyText) {
  if (!rows.length) {
    return `${emptyText}\n`;
  }

  const lines = ["| Created | Type | CTA | Source | Reason | Campaign |", "|---|---|---|---|---|---|"];
  for (const row of rows.slice(0, 10)) {
    lines.push(
      `| ${row.created_at || "unknown"} | ${row.event_type || ""} | ${(row.cta || "").replace(/\|/g, "/")} | ${(row.source_path || "").replace(/\|/g, "/")} | ${(row.reason || "").replace(/\|/g, "/")} | ${(row.utm_campaign || "").replace(/\|/g, "/")} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderActionRows(rows, emptyText) {
  if (!rows.length) {
    return `${emptyText}\n`;
  }

  const lines = ["| Date | Type | Channel | Campaign | Status | Target |", "|---|---|---|---|---|---|"];
  for (const row of rows.slice(0, 10)) {
    lines.push(
      `| ${row.date || ""} | ${row.type || ""} | ${row.channel || ""} | ${row.campaign || ""} | ${row.status || ""} | ${(row.target || "").replace(/\|/g, "/")} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderComplianceWarnings(rows) {
  if (!rows.length) {
    return "No open compliance warnings.\n";
  }

  const lines = ["| Date | Channel | Campaign | Status | Deadline | Target | Evidence |", "|---|---|---|---|---|---|---|"];
  for (const row of rows.slice(0, 8)) {
    const deadline = complianceDeadline(row);
    const deadlineText = deadline
      ? `${deadline.deadline_at} (${deadline.hours_remaining}h, ${deadline.urgency})`
      : "";
    lines.push(
      `| ${row.date || ""} | ${row.channel || ""} | ${row.campaign || ""} | ${row.status || ""} | ${deadlineText} | ${(row.target || "").replace(/\|/g, "/")} | ${(row.evidence || row.note || "").replace(/\|/g, "/").slice(0, 220)} |`,
    );
  }
  lines.push(
    "",
    "Resolve open payment or marketplace compliance warnings before pushing checkout-heavy traffic; record a resolved compliance action when the provider dashboard or support thread confirms the issue is closed.",
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

  if (baselinePolyglotTransactions.length) {
    lines.push("| Baseline Created | Product | Amount | Customer | Evidence |");
    lines.push("|---|---|---:|---|---|");
    for (const row of baselinePolyglotTransactions.slice(0, 8)) {
      lines.push(
        `| ${row.created_at || ""} | ${String(row.product || "").replace(/\|/g, "/")} | ${row.amount_usd || row.amount_raw || ""} ${row.currency || ""} | ${String(row.customer_redacted || "").replace(/\|/g, "/")} | ${String(row.evidence_id || "").replace(/\|/g, "/")} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderMarketplaceSnapshot(row) {
  if (!row) {
    return "No Marketplace snapshot recorded yet.\n";
  }

  return [
    `- Date: ${row.date}`,
    `- Plugin: ${row.plugin}`,
    `- Users: ${row.users}`,
    `- Opens: ${row.opens}`,
    `- Version: ${row.version}`,
    `- Updated: ${row.updated}`,
    row.note ? `- Note: ${row.note}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderMarketplacePreflight(preflight) {
  if (!preflight) {
    return "No Marketplace upload preflight generated yet. Run `pnpm lead:marketplace-preflight`.\n";
  }

  const lines = [
    `- Verdict: ${preflight.verdict || "unknown"}`,
    `- Upload allowed: ${preflight.upload_allowed ? "yes" : "no"}`,
    `- Marketplace status: ${preflight.marketplace_status || "unknown"}`,
    `- Package SHA256: ${preflight.zip?.sha256 || "unknown"}`,
    `- Recommendation: ${preflight.recommendation || "none"}`,
  ];

  if (Array.isArray(preflight.blockers) && preflight.blockers.length) {
    lines.push("- Blockers: " + preflight.blockers.slice(0, 5).join("; "));
  }

  return `${lines.join("\n")}\n`;
}

function renderMarketplacePublic(publicSnapshot) {
  if (!publicSnapshot?.snapshot) {
    return "No Marketplace public listing snapshot generated yet. Run `pnpm lead:marketplace-public -- --record`.\n";
  }

  const snapshot = publicSnapshot.snapshot;
  return [
    `- Listing readable: ${snapshot.ok ? "yes" : "no"}`,
    `- Likes: ${snapshot.likes}`,
    `- Comments: ${snapshot.comments}`,
    `- Published: ${snapshot.published_at || "unknown"}`,
    `- Updated: ${snapshot.updated_at || "unknown"}`,
    `- Framer plugin id: ${snapshot.framer_plugin_id || "unknown"}`,
    `- Categories: ${snapshot.categories || "unknown"}`,
    `- Recommendation: ${publicSnapshot.recommendation || "none"}`,
    "",
  ].join("\n");
}

function renderTrackingFreshness(review) {
  if (!review) {
    return "No production tracking freshness check generated yet. Run `pnpm lead:tracking-freshness`.\n";
  }

  return [
    `- Status: ${review.status || "unknown"}`,
    `- Fresh: ${review.fresh ? "yes" : "no"}`,
    `- Scripts checked: ${review.scripts_checked ?? 0}`,
    `- Missing required proof: ${Array.isArray(review.missing_required) ? review.missing_required.length : 0}`,
    `- Recommendation: ${review.recommendation || "none"}`,
    "",
  ].join("\n");
}

function renderLocalTrackingFreshness(review) {
  if (!review) {
    return "No local tracking freshness check generated yet. Run `pnpm --dir polyglotaeo-web build` and `pnpm lead:local-tracking-freshness`.\n";
  }

  return [
    `- Status: ${review.status || "unknown"}`,
    `- Fresh: ${review.fresh ? "yes" : "no"}`,
    `- Static dir: ${review.static_dir || "unknown"}`,
    `- Scripts checked: ${review.scripts_checked ?? 0}`,
    `- Total JS files checked: ${review.total_js_files_checked ?? 0}`,
    `- Missing required proof: ${Array.isArray(review.missing_required) ? review.missing_required.length : 0}`,
    `- Recommendation: ${review.recommendation || "none"}`,
    "",
  ].join("\n");
}

function renderCheckoutOrigin(readiness) {
  if (!readiness) {
    return "No checkout origin readiness report generated yet. Run `pnpm lead:checkout-origin`.\n";
  }

  const lines = [
    `- Status: ${readiness.status || "unknown"}`,
    `- Promotion allowed: ${readiness.promotion_allowed ? "yes" : "no"}`,
    `- Target origin: ${readiness.target_origin || "unknown"}`,
    `- Legacy origin: ${readiness.legacy_origin || "unknown"}`,
    `- Blockers: ${Array.isArray(readiness.blockers) ? readiness.blockers.length : 0}`,
    `- Recommendation: ${readiness.recommendation || "none"}`,
    "",
  ];

  if (Array.isArray(readiness.blockers) && readiness.blockers.length) {
    lines.push("Blocker details:");
    for (const blocker of readiness.blockers.slice(0, 6)) {
      lines.push(`- ${blocker.label || blocker.id}: ${blocker.detail || ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderPaymentComplianceRecovery(recovery) {
  if (!recovery) {
    return "No payment compliance recovery report generated yet. Run `pnpm lead:payment-compliance-recovery`.\n";
  }

  const lines = [
    `- Status: ${recovery.status || "unknown"}`,
    `- Promotion allowed: ${recovery.promotion_allowed ? "yes" : "no"}`,
    `- Marketplace upload allowed: ${recovery.marketplace_upload_allowed ? "yes" : "no"}`,
    `- Recommendation: ${recovery.recommendation || "none"}`,
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

  return lines.join("\n");
}

function renderChannelPriority(priority) {
  if (!priority || !Array.isArray(priority.cards)) {
    return "No channel priority generated yet. Run `pnpm lead:channel-priority`.\n";
  }

  const lines = [
    `- Recommendation: ${priority.recommendation}`,
    `- Next channel: ${priority.next_channel || "none"}`,
  ];
  if (priority.next_confirmation) {
    lines.push(`- Next confirmation: ${priority.next_confirmation}`);
  }
  lines.push(
    "",
    "| Rank | Score | Channel | Decision | Status |",
    "|---:|---:|---|---|---|",
  );

  for (const card of priority.cards.slice(0, 5)) {
    lines.push(`| ${card.rank} | ${card.score} | ${card.channel} | ${card.decision} | ${String(card.status || "").replace(/\|/g, "/")} |`);
  }

  return `${lines.join("\n")}\n`;
}

function renderCommunityReview(review) {
  if (!review) {
    return "No Framer Community review generated yet. Run `pnpm lead:community-review`.\n";
  }

  return [
    `- Verdict: ${review.verdict || "unknown"}`,
    `- Posts logged: ${review.posts_logged ?? 0}/${review.posts_total ?? 0}`,
    `- Manual comments: ${review.comments ?? 0}`,
    `- Manual DMs/profile replies: ${review.dms ?? 0}`,
    `- Manual opportunities: ${review.manual_opportunities ?? 0}`,
    `- Manual revenue signals: ${review.manual_revenue_signals ?? 0}`,
    `- Tracked CTA events: ${review.tracked_events ?? 0}`,
    `- Tracked form submissions: ${review.tracked_forms ?? 0}`,
    `- CRM-attributed opportunities: ${review.crm_signal?.opportunities ?? 0}`,
    `- CRM-attributed deal value: ${formatUsd(review.crm_signal?.deal_value_usd ?? 0)}`,
    `- Revenue-attributed events: ${review.revenue_signal?.events ?? 0}`,
    `- Revenue-attributed amount: ${formatUsd(review.revenue_signal?.amount_usd ?? 0)}`,
    `- Marketplace users delta: ${review.marketplace_delta?.users ?? 0}`,
    `- Marketplace opens delta: ${review.marketplace_delta?.opens ?? 0}`,
    `- Total signal score: ${review.total_signal ?? 0}`,
    `- Next review date: ${review.next_review_date || "not scheduled"}`,
    `- Recommendation: ${review.recommendation || "none"}`,
    "",
  ].join("\n");
}

function renderReport(rows, revenueRows, eventRows, creemStore, actionRows, marketplaceRows, marketplacePreflight, marketplacePublic, trackingFreshness, localTrackingFreshness, checkoutOrigin, paymentComplianceRecovery, communityReview, channelPriority, args) {
  const summary = summarize(rows, revenueRows, eventRows, creemStore, actionRows, marketplaceRows, marketplacePreflight, marketplacePublic, trackingFreshness, localTrackingFreshness, checkoutOrigin, paymentComplianceRecovery, communityReview, args);
  const lines = [
    "# Framer Outreach Weekly Report",
    "",
    `Date: ${args.today}`,
    `CRM: ${args.crm}`,
    `Revenue: ${args.revenue}`,
    `CTA events: ${args.events}`,
    `Creem store monitor: ${args.creemStore}`,
    `Actions: ${args.actions}`,
    `Marketplace snapshots: ${args.marketplace}`,
    `Marketplace preflight: ${args.marketplacePreflight}`,
    `Marketplace public listing: ${args.marketplacePublic}`,
    `Tracking freshness: ${args.trackingFreshness}`,
    `Local tracking freshness: ${args.localTrackingFreshness}`,
    `Checkout origin readiness: ${args.checkoutOrigin}`,
    `Payment compliance recovery: ${args.paymentComplianceRecovery}`,
    `Community review: ${args.communityReview}`,
    "",
    "## Targets",
    "",
    progressLine("Verified sent leads", summary.sent, args.targetSent),
    progressLine("Replies or later-stage conversations", summary.replies, args.targetReplies),
    progressLine("Install/service/opportunity outcomes", summary.opportunities, args.targetOpps),
    "",
    "## Funnel",
    "",
    `- Total CRM leads: ${summary.total}`,
    `- Open leads: ${summary.open}`,
    `- Due today: ${summary.due}`,
    `- Next scheduled follow-up: ${summary.nextDueDate || "none"}${summary.nextDueDate ? ` (${summary.nextDueCount} lead(s))` : ""}`,
    `- Bounced contacts: ${summary.bounced}`,
    `- Average pain score: ${summary.averageScore}`,
    `- Reply rate from sent leads: ${summary.replyRate}`,
    `- Opportunity rate from sent leads: ${summary.opportunityRate}`,
    `- Tracked pipeline value: ${formatUsd(summary.pipelineValue)}`,
    `- Booked revenue: ${formatUsd(summary.bookedRevenue)}`,
    `- Pending revenue signals: ${summary.pendingRevenueRows.length}${summary.pendingRevenueValue ? ` (${formatUsd(summary.pendingRevenueValue)} known value)` : ""}`,
    `- Creem store monitor: ${summary.creemStore?.status || "not generated"}`,
    `- Open compliance warnings: ${summary.openComplianceWarnings.length}`,
    `- Install CTA clicks: ${summary.installEvents}`,
    `- Checkout CTA clicks: ${summary.checkoutEvents}`,
    `- Marketplace upload logged done: ${summary.marketplaceUploadDone ? "yes" : "no"}`,
    `- Marketplace preflight: ${summary.marketplacePreflight?.verdict || "not generated"}${summary.marketplacePreflight ? ` (upload allowed ${summary.marketplacePreflight.upload_allowed ? "yes" : "no"})` : ""}`,
    `- Checkout origin readiness: ${summary.checkoutOrigin?.status || "not generated"}`,
    `- Payment compliance recovery: ${summary.paymentComplianceRecovery?.status || "not generated"}`,
    `- Production tracking freshness: ${summary.trackingFreshness?.status || "not generated"}`,
    `- Local tracking freshness: ${summary.localTrackingFreshness?.status || "not generated"}`,
    `- Community review: ${summary.communityReview?.verdict || "not generated"}`,
    "",
    "## Status Mix",
    "",
  ];

  for (const [status, count] of countBy(rows, "status")) {
    lines.push(`- ${status}: ${count}`);
  }

  lines.push("");
  lines.push("## Contact Channels");
  lines.push("");
  for (const [channel, count] of countBy(rows, "contact_channel")) {
    lines.push(`- ${channel}: ${count}`);
  }

  lines.push("");
  lines.push("## Copy Experiments");
  lines.push("");
  lines.push(renderVariantRows(summary.variantRows));

  lines.push("");
  lines.push("## CTA Intent");
  lines.push("");
  lines.push("- Total tracked CTA events: " + summary.eventRows.length);
  lines.push("- Install clicks: " + summary.installEvents);
  lines.push("- Checkout clicks: " + summary.checkoutEvents);
  lines.push("");
  lines.push("### By CTA");
  lines.push("");
  lines.push(renderEventCounts(summary.eventRows, "cta", "No CTA events recorded yet."));
  lines.push("");
  lines.push("### By Source Path");
  lines.push("");
  lines.push(renderEventCounts(summary.eventRows, "source_path", "No CTA events recorded yet."));
  lines.push("");
  lines.push("### By Upgrade Reason");
  lines.push("");
  lines.push(renderEventCounts(summary.eventRows.filter((row) => row.reason), "reason", "No plugin upgrade reasons recorded yet."));
  lines.push("");
  lines.push("### Recent CTA Events");
  lines.push("");
  lines.push(renderEventRows(summary.eventRows, "No CTA events recorded yet."));

  lines.push("");
  lines.push("## External Actions");
  lines.push("");
  lines.push(renderActionRows(summary.recentActions, "No external actions recorded yet."));

  lines.push("");
  lines.push("## Compliance Warnings");
  lines.push("");
  lines.push(renderComplianceWarnings(summary.openComplianceWarnings));

  lines.push("");
  lines.push("## Creem Store Monitor");
  lines.push("");
  lines.push(renderCreemStore(summary.creemStore));

  lines.push("");
  lines.push("## Checkout Origin Readiness");
  lines.push("");
  lines.push(renderCheckoutOrigin(summary.checkoutOrigin));

  lines.push("");
  lines.push("## Payment Compliance Recovery");
  lines.push("");
  lines.push(renderPaymentComplianceRecovery(summary.paymentComplianceRecovery));

  lines.push("");
  lines.push("## Marketplace Snapshot");
  lines.push("");
  lines.push(renderMarketplaceSnapshot(summary.latestMarketplace));

  lines.push("");
  lines.push("## Marketplace Upload Preflight");
  lines.push("");
  lines.push(renderMarketplacePreflight(summary.marketplacePreflight));

  lines.push("");
  lines.push("## Marketplace Public Listing");
  lines.push("");
  lines.push(renderMarketplacePublic(summary.marketplacePublic));

  lines.push("");
  lines.push("## Production Tracking Freshness");
  lines.push("");
  lines.push(renderTrackingFreshness(summary.trackingFreshness));

  lines.push("");
  lines.push("## Local Tracking Freshness");
  lines.push("");
  lines.push(renderLocalTrackingFreshness(summary.localTrackingFreshness));

  lines.push("");
  lines.push("## Channel Priority");
  lines.push("");
  lines.push(renderChannelPriority(channelPriority));

  lines.push("");
  lines.push("## Community Review");
  lines.push("");
  lines.push(renderCommunityReview(summary.communityReview));

  lines.push("");
  lines.push("## Revenue Paths");
  lines.push("");
  const revenuePathRows = rows.filter((row) => row.revenue_path);
  if (!revenuePathRows.length) {
    lines.push("No revenue paths recorded yet.");
  } else {
    for (const [revenuePath, count] of countBy(revenuePathRows, "revenue_path")) {
      const value = revenuePathRows
        .filter((row) => row.revenue_path === revenuePath)
        .reduce((sum, row) => sum + money(row.deal_value_usd), 0);
      lines.push(`- ${revenuePath}: ${count} lead(s), ${formatUsd(value)} tracked`);
    }
  }

  lines.push("");
  lines.push("## Revenue Ledger");
  lines.push("");
  lines.push(renderRevenueRows(summary.revenueRows, "No external revenue events recorded yet."));

  lines.push("");
  lines.push("## Due Actions");
  lines.push("");
  lines.push(renderRows(summary.dueRows, "No due actions."));

  lines.push("");
  lines.push("## Bounces");
  lines.push("");
  lines.push(renderRows(summary.bouncedRows, "No bounces detected."));

  lines.push("");
  lines.push("## Reply Queue");
  lines.push("");
  lines.push(renderRows(summary.replyQueueRows, "No replied leads waiting for a mini audit."));

  lines.push("");
  lines.push("## Opportunities");
  lines.push("");
  lines.push(renderRows(summary.opportunityRows, "No opportunities yet."));

  lines.push("");
  lines.push("## Next Actions");
  lines.push("");
  for (const action of nextActions(summary, args, channelPriority)) {
    lines.push(`- ${action}`);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const rows = await readRows(args.crm);
  const revenueRows = await readRows(args.revenue);
  const eventRows = await readEvents(args.events);
  const creemStore = await readJson(args.creemStore, null);
  const actionRows = await readRows(args.actions);
  const marketplaceRows = await readRows(args.marketplace);
  const marketplacePreflight = await readJson(args.marketplacePreflight, null);
  const marketplacePublic = await readJson(args.marketplacePublic, null);
  const trackingFreshness = await readJson(args.trackingFreshness, null);
  const localTrackingFreshness = await readJson(args.localTrackingFreshness, null);
  const checkoutOrigin = await readJson(args.checkoutOrigin, null);
  const paymentComplianceRecovery = await readJson(args.paymentComplianceRecovery, null);
  const communityReview = await readJson(args.communityReview, null);
  const channelPriority = await readJson(args.channelPriority, null);
  const report = renderReport(rows, revenueRows, eventRows, creemStore, actionRows, marketplaceRows, marketplacePreflight, marketplacePublic, trackingFreshness, localTrackingFreshness, checkoutOrigin, paymentComplianceRecovery, communityReview, channelPriority, args);
  await writeText(args.output, report);
  process.stdout.write(report);
  process.stdout.write(`Report written to ${args.output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
