#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_DISTRIBUTION_REVIEW = ".tmp/framer-distribution-review.json";
const DEFAULT_MARKETPLACE_REVIEW = ".tmp/framer-marketplace-review.json";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_COMMUNITY_PREFLIGHT = ".tmp/framer-community-preflight.json";
const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-growth-gate.md";
const DEFAULT_JSON = ".tmp/framer-growth-gate.json";
const DEFAULT_PAUSE_SENT = 50;

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
  pnpm lead:gate

Options:
  --crm <file>                  Local CRM CSV. Default: ${DEFAULT_CRM}
  --revenue <file>              Revenue CSV. Default: ${DEFAULT_REVENUE}
  --events <file>               CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>                Netlify form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --actions <file>              External action log CSV. Default: ${DEFAULT_ACTIONS}
  --distribution-review <file>  Distribution review JSON. Default: ${DEFAULT_DISTRIBUTION_REVIEW}
  --marketplace-review <file>   Marketplace review JSON. Default: ${DEFAULT_MARKETPLACE_REVIEW}
  --marketplace-preflight <file> Marketplace upload preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --community-preflight <file> Community publish preflight JSON. Default: ${DEFAULT_COMMUNITY_PREFLIGHT}
  --marketplace <file>          Marketplace snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --output <file>               Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                 JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>          Gate date. Default: local date.
  --pause-sent <number>         Pause cold expansion at this many sent leads if replies are zero. Default: ${DEFAULT_PAUSE_SENT}
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    revenue: DEFAULT_REVENUE,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
    actions: DEFAULT_ACTIONS,
    distributionReview: DEFAULT_DISTRIBUTION_REVIEW,
    marketplaceReview: DEFAULT_MARKETPLACE_REVIEW,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    communityPreflight: DEFAULT_COMMUNITY_PREFLIGHT,
    marketplace: DEFAULT_MARKETPLACE,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
    pauseSent: DEFAULT_PAUSE_SENT,
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
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--distribution-review") {
      args.distributionReview = value;
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
    if (key === "--community-preflight") {
      args.communityPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace") {
      args.marketplace = value;
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
    if (key === "--pause-sent") {
      args.pauseSent = parsePositiveInt(value, key);
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

function isDue(row, today) {
  return Boolean(row.next_followup && row.next_followup <= today && !CLOSED_STATUSES.has(row.status));
}

function latestRows(rows) {
  return [...rows].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index,
  );
}

function summarize({
  crmRows,
  revenueRows,
  eventData,
  formData,
  actionRows,
  distributionReview,
  marketplaceReview,
  marketplacePreflight,
  communityPreflight,
  marketplaceRows,
  args,
}) {
  const events = Array.isArray(eventData.events) ? eventData.events : [];
  const ignoredTestEvents = Array.isArray(eventData.ignored_test_events)
    ? eventData.ignored_test_events
    : [];
  const submissions = Array.isArray(formData.submissions) ? formData.submissions : [];
  const sentRows = crmRows.filter((row) => number(row.sent_count) > 0 && row.status !== "bounced");
  const repliedRows = crmRows.filter((row) => REPLY_STATUSES.has(row.status));
  const opportunityRows = crmRows.filter((row) => OPPORTUNITY_STATUSES.has(row.status));
  const bouncedRows = crmRows.filter((row) => row.status === "bounced");
  const unsubscribedRows = crmRows.filter((row) => row.status === "unsubscribed");
  const reportPilotRows = crmRows.filter((row) => row.report_campaign === "report-first-v1");
  const reportPilotSentRows = reportPilotRows.filter((row) => number(row.sent_count) > 0);
  const openRows = crmRows.filter((row) => !CLOSED_STATUSES.has(row.status));
  const dueRows = crmRows.filter((row) => isDue(row, args.today));
  const futureDueRows = openRows
    .filter((row) => row.next_followup && row.next_followup > args.today)
    .sort((a, b) => a.next_followup.localeCompare(b.next_followup));
  const nextDueDate = futureDueRows[0]?.next_followup || "";
  const nextDueCount = nextDueDate
    ? futureDueRows.filter((row) => row.next_followup === nextDueDate).length
    : 0;
  const pendingRevenueRows = revenueRows.filter((row) => row.status === "pending");
  const verifiedRevenueRows = revenueRows.filter((row) => row.status === "verified");
  const bookedRevenue = verifiedRevenueRows.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const pendingRevenue = pendingRevenueRows.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const pipelineRows = crmRows.filter(
    (row) =>
      money(row.deal_value_usd) > 0 &&
      !CLOSED_STATUSES.has(row.status) &&
      (row.revenue_path || OPPORTUNITY_STATUSES.has(row.status)),
  );
  const pipelineValue = pipelineRows.reduce((sum, row) => sum + money(row.deal_value_usd), 0);
  const marketplaceUploadDone = actionRows.some(
    (row) =>
      row.type === "marketplace_upload" &&
      row.campaign === "plugin_upgrade" &&
      row.status === "done",
  );
  const marketplaceUploadOpen = actionRows.some(
    (row) =>
      row.type === "marketplace_upload" &&
      row.campaign === "plugin_upgrade" &&
      row.status !== "done" &&
      row.status !== "skipped",
  );
  const publicPostsDone = actionRows.filter(
    (row) => row.type === "post" && row.status === "done",
  );
  const directoryFormsDone = actionRows.filter(
    (row) =>
      row.type === "directory_submission" &&
      row.channel !== "gmail" &&
      row.status === "done",
  );
  const publicDistributionDone = publicPostsDone.length + directoryFormsDone.length;
  const distributionPriorityPosted = number(distributionReview?.priority_posted);
  const latestMarketplace = latestRows(marketplaceRows)[0] || null;

  return {
    crm_leads: crmRows.length,
    open_leads: openRows.length,
    sent: sentRows.length,
    replies: repliedRows.length,
    opportunities: opportunityRows.length,
    bounces: bouncedRows.length,
    unsubscribes: unsubscribedRows.length,
    report_first_selected: reportPilotRows.length,
    report_first_sent: reportPilotSentRows.length,
    reply_rate: pct(repliedRows.length, sentRows.length),
    opportunity_rate: pct(opportunityRows.length, sentRows.length),
    due_today: dueRows.length,
    next_due_date: nextDueDate,
    next_due_count: nextDueCount,
    events: events.length,
    ignored_test_events: ignoredTestEvents.length,
    form_submissions: submissions.length,
    public_posts_done: publicPostsDone.length,
    directory_forms_done: directoryFormsDone.length,
    public_distribution_done: publicDistributionDone,
    distribution_priority_posted: distributionPriorityPosted,
    marketplace_upload_done: marketplaceUploadDone,
    marketplace_upload_open: marketplaceUploadOpen,
    marketplace_review_status: marketplaceReview?.status || "",
    marketplace_review_recommendation: marketplaceReview?.recommendation || "",
    marketplace_preflight_verdict: marketplacePreflight?.verdict || "",
    marketplace_preflight_upload_allowed: Boolean(marketplacePreflight?.upload_allowed),
    marketplace_preflight_recommendation: marketplacePreflight?.recommendation || "",
    marketplace_preflight_blockers: Array.isArray(marketplacePreflight?.blockers)
      ? marketplacePreflight.blockers
      : [],
    marketplace_preflight_sha256: marketplacePreflight?.zip?.sha256 || "",
    community_preflight_verdict: communityPreflight?.verdict || "",
    community_preflight_publish_allowed: Boolean(communityPreflight?.publish_allowed),
    community_preflight_recommendation: communityPreflight?.recommendation || "",
    community_preflight_blockers: Array.isArray(communityPreflight?.blockers)
      ? communityPreflight.blockers
      : [],
    distribution_review_recommendation: distributionReview?.recommendation || "",
    marketplace_snapshot: latestMarketplace,
    booked_revenue_usd: bookedRevenue,
    pending_revenue_usd: pendingRevenue,
    pending_revenue_signals: pendingRevenueRows.length,
    tracked_pipeline_usd: pipelineValue,
    proof_signals:
      repliedRows.length +
      opportunityRows.length +
      events.length +
      submissions.length +
      verifiedRevenueRows.length,
  };
}

function decide(summary, args) {
  const reasons = [];
  const priorityActions = [];
  const blockedActions = [];
  const allowedActions = [];
  const confirmations = [];

  const coldExpansionRisk = summary.sent >= args.pauseSent && summary.replies === 0;
  const noPublicProof =
    summary.events === 0 &&
    summary.form_submissions === 0 &&
    summary.public_distribution_done === 0 &&
    summary.distribution_priority_posted === 0;
  const noRevenueProof = summary.booked_revenue_usd === 0 && summary.pending_revenue_signals === 0;

  if (coldExpansionRisk) {
    reasons.push(
      `${summary.sent} sent leads and 0 replies crosses the pause threshold (${args.pauseSent}).`,
    );
    blockedActions.push(
      "Do not add a new cold Day 0 email batch until at least one reply, CTA event, form submission, or public distribution proof exists.",
    );
  }
  if (noPublicProof) {
    reasons.push("No non-test CTA events, forms, or logged public posts are present.");
  }
  if (noRevenueProof) {
    reasons.push("No booked revenue or pending revenue signal has been recorded.");
  }

  if (!summary.marketplace_upload_done && summary.marketplace_upload_open) {
    if (summary.marketplace_preflight_upload_allowed) {
      priorityActions.push(
        "Marketplace preflight is ready. Upload the prepared `plugin.zip` through Framer Marketplace `New Version`, then record it with `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '<framer-upload-confirmation-url-or-screenshot>'` after replacing the evidence placeholder, and capture a fresh Creator Space snapshot.",
      );
      confirmations.push("确认上传 plugin.zip 到 Framer Marketplace");
    } else {
      const blockers = summary.marketplace_preflight_blockers.length
        ? ` Blockers: ${summary.marketplace_preflight_blockers.slice(0, 3).join("; ")}.`
        : "";
      priorityActions.push(
        `Run or fix \`pnpm lead:marketplace-preflight\` before uploading Marketplace.${blockers}`,
      );
      blockedActions.push("Do not upload `plugin.zip` to Framer Marketplace until Marketplace preflight reports `Upload allowed: yes`.");
    }
  }

  if (noPublicProof || summary.distribution_priority_posted === 0) {
    if (summary.community_preflight_publish_allowed) {
      priorityActions.push(
        "Community preflight is ready. Publish the question-first Framer Community post from `.tmp/framer-community-feed-kit.md`, then record it with `pnpm lead:community-record -- --priority 1 --url '<published-framer-community-url>'` and rerun `pnpm lead:events && pnpm lead:forms && pnpm lead:gate`.",
      );
      confirmations.push("确认发布 Framer Community 第一条帖子");
    } else {
      const blockers = summary.community_preflight_blockers.length
        ? ` Blockers: ${summary.community_preflight_blockers.slice(0, 3).join("; ")}.`
        : "";
      priorityActions.push(
        `Run or fix \`pnpm lead:community-preflight\` before publishing the Framer Community post.${blockers}`,
      );
      blockedActions.push("Do not publish the Framer Community post until Community preflight reports `Publish allowed: yes`.");
    }
  }

  if (summary.directory_forms_done === 0 && summary.events === 0 && summary.form_submissions === 0) {
    priorityActions.push(
      "Submit one high-fit directory/product form from `.tmp/framer-directory-submit-kit.md` after confirmation; do not broaden beyond one until signal appears.",
    );
    confirmations.push("确认提交 Frameplate / All Framer 目录表单");
  }

  if (summary.due_today > 0) {
    allowedActions.push(
      `Process ${summary.due_today} due CRM row(s) only after Gmail reply/bounce/unsubscribe preflight.`,
    );
  } else if (summary.next_due_date) {
    blockedActions.push(
      `Do not send Day 3 follow-ups before ${summary.next_due_date}; ${summary.next_due_count} lead(s) are scheduled for that date.`,
    );
  }

  allowedActions.push("Continue Gmail/Netlify/Marketplace monitoring and record any human reply, form, CTA, or sale immediately.");

  const reportPilotRemaining = Math.max(0, 10 - summary.report_first_sent);
  if (reportPilotRemaining > 0 && summary.report_first_selected > 0) {
    allowedActions.push(
      `Scoped exception: review/send at most ${reportPilotRemaining} remaining report-first-v1 inline audit(s), only after \`pnpm lead:report-preflight\` passes. This does not reopen generic cold Day 0 expansion.`,
    );
  } else if (summary.report_first_sent >= 10) {
    blockedActions.push("The 10-contact report-first pilot cap is reached; wait for the 7-day review decision before any expansion.");
  }

  let verdict = "proceed";
  let coldEmailCap = 5;
  if (coldExpansionRisk && noPublicProof) {
    verdict = "pause_cold_expand_ship_public_distribution";
    coldEmailCap = 0;
  } else if (coldExpansionRisk) {
    verdict = "pause_cold_expand_measure_signal";
    coldEmailCap = 0;
  } else if (summary.replies === 0 && summary.sent >= 20) {
    verdict = "slow_cold_expand";
    coldEmailCap = 2;
    reasons.push("Reply rate is still 0% after a meaningful sample; keep any new outreach narrowly targeted.");
  }

  if (!priorityActions.length) {
    priorityActions.push("Hold cadence, monitor proof signals, and use `pnpm lead:report` before the next send window.");
  }

  return {
    verdict,
    cold_email_cap: coldEmailCap,
    report_first_pilot_remaining: reportPilotRemaining,
    reasons,
    priority_actions: priorityActions,
    allowed_actions: allowedActions,
    blocked_actions: blockedActions,
    confirmation_phrases: Array.from(new Set(confirmations)),
  };
}

function renderMarkdown({ args, summary, decision }) {
  const lines = [
    "# Framer Growth Gate",
    "",
    `Date: ${args.today}`,
    `Verdict: ${decision.verdict}`,
    `Cold Day 0 cap before new proof: ${decision.cold_email_cap}`,
    `Report-first pilot remaining: ${decision.report_first_pilot_remaining}`,
    "",
    "## Funnel Proof",
    "",
    `- Sent leads: ${summary.sent}`,
    `- Replies: ${summary.replies} (${summary.reply_rate})`,
    `- Opportunities: ${summary.opportunities} (${summary.opportunity_rate})`,
    `- Bounces / unsubscribes: ${summary.bounces} / ${summary.unsubscribes}`,
    `- Non-test CTA events: ${summary.events}`,
    `- Ignored test CTA events: ${summary.ignored_test_events}`,
    `- Netlify form submissions: ${summary.form_submissions}`,
    `- Public posts logged done: ${summary.public_posts_done}`,
    `- Directory forms logged done: ${summary.directory_forms_done}`,
    `- Marketplace upload logged done: ${summary.marketplace_upload_done ? "yes" : "no"}`,
    `- Marketplace preflight: ${summary.marketplace_preflight_verdict || "not generated"} (upload allowed ${summary.marketplace_preflight_upload_allowed ? "yes" : "no"})`,
    `- Community preflight: ${summary.community_preflight_verdict || "not generated"} (publish allowed ${summary.community_preflight_publish_allowed ? "yes" : "no"})`,
    `- Tracked pipeline value: ${formatUsd(summary.tracked_pipeline_usd)}`,
    `- Booked revenue: ${formatUsd(summary.booked_revenue_usd)}`,
    `- Pending revenue signals: ${summary.pending_revenue_signals}${summary.pending_revenue_usd ? ` (${formatUsd(summary.pending_revenue_usd)} known value)` : ""}`,
    `- Next scheduled follow-up: ${summary.next_due_date || "none"}${summary.next_due_date ? ` (${summary.next_due_count} lead(s))` : ""}`,
    "",
    "## Reasons",
    "",
    ...list(decision.reasons, "No gate risks detected."),
    "",
    "## Priority Actions",
    "",
    ...list(decision.priority_actions, "No priority action needed."),
    "",
    "## Allowed Actions",
    "",
    ...list(decision.allowed_actions, "No allowed actions listed."),
    "",
    "## Blocked Actions",
    "",
    ...list(decision.blocked_actions, "No blocked actions listed."),
    "",
    "## Confirmation Phrases",
    "",
    ...list(decision.confirmation_phrases, "No external confirmation needed right now."),
    "",
    "## Source Reviews",
    "",
    `- Distribution review: ${summary.distribution_review_recommendation || "none"}`,
    `- Marketplace review: ${summary.marketplace_review_recommendation || "none"}`,
    `- Marketplace preflight: ${summary.marketplace_preflight_recommendation || "none"}`,
    `- Community preflight: ${summary.community_preflight_recommendation || "none"}`,
    summary.marketplace_preflight_sha256 ? `- Marketplace preflight package SHA256: ${summary.marketplace_preflight_sha256}` : "- Marketplace preflight package SHA256: none",
    summary.marketplace_snapshot
      ? `- Marketplace snapshot: ${summary.marketplace_snapshot.date}, users ${summary.marketplace_snapshot.users}, opens ${summary.marketplace_snapshot.opens}, version ${summary.marketplace_snapshot.version}, updated ${summary.marketplace_snapshot.updated}`
      : "- Marketplace snapshot: none",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function list(items, emptyText) {
  if (!items.length) return [`- ${emptyText}`];
  return items.map((item) => `- ${item}`);
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
    crmRows,
    revenueRows,
    eventData,
    formData,
    actionRows,
    distributionReview,
    marketplaceReview,
    marketplacePreflight,
    communityPreflight,
    marketplaceRows,
  ] = await Promise.all([
    readRows(args.crm),
    readRows(args.revenue),
    readJson(args.events, { events: [], ignored_test_events: [] }),
    readJson(args.forms, { submissions: [] }),
    readRows(args.actions),
    readJson(args.distributionReview, null),
    readJson(args.marketplaceReview, null),
    readJson(args.marketplacePreflight, null),
    readJson(args.communityPreflight, null),
    readRows(args.marketplace),
  ]);

  const summary = summarize({
    crmRows,
    revenueRows,
    eventData,
    formData,
    actionRows,
    distributionReview,
    marketplaceReview,
    marketplacePreflight,
    communityPreflight,
    marketplaceRows,
    args,
  });
  const decision = decide(summary, args);
  const output = {
    generated_at: new Date().toISOString(),
    today: args.today,
    summary,
    decision,
  };
  const markdown = renderMarkdown({ args, summary, decision });

  await Promise.all([
    writeText(args.output, markdown),
    writeText(args.json, `${JSON.stringify(output, null, 2)}\n`),
  ]);

  process.stdout.write(markdown);
  process.stdout.write(`Growth gate written to ${args.output} and ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
