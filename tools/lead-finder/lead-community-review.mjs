#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_KIT = ".tmp/framer-community-feed-kit.json";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-community-review.md";
const DEFAULT_JSON = ".tmp/framer-community-review.json";
const PRIMARY_CHANNEL = "framer_community_feed";
const OPPORTUNITY_STATUSES = new Set([
  "replied",
  "mini_audit_sent",
  "call_booked",
  "installed_free",
  "paid_plugin",
  "service_offer",
  "service_won",
]);
const REVENUE_SIGNAL_STATUSES = new Set(["pending", "verified"]);

function usage() {
  return `
Usage:
  pnpm lead:community-review
  pnpm lead:community-review -- --comments 2 --dms 1

Options:
  --kit <file>          Community kit JSON. Default: ${DEFAULT_KIT}
  --events <file>       CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>        Netlify form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --actions <file>      External action log CSV. Default: ${DEFAULT_ACTIONS}
  --marketplace <file>  Marketplace snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --crm <file>          Outreach CRM CSV. Default: ${DEFAULT_CRM}
  --revenue <file>      Revenue ledger CSV. Default: ${DEFAULT_REVENUE}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>  Review date. Default: local date.
  --comments <number>   Manual Framer Community comments count. Default: 0
  --dms <number>        Manual DMs/profile replies from the post. Default: 0
  --opportunities <number> Manual qualified opportunities not yet in CRM. Default: 0
  --revenue-signals <number> Manual revenue events not yet in revenue ledger. Default: 0
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    kit: DEFAULT_KIT,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
    actions: DEFAULT_ACTIONS,
    marketplace: DEFAULT_MARKETPLACE,
    crm: DEFAULT_CRM,
    revenue: DEFAULT_REVENUE,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
    comments: 0,
    dms: 0,
    opportunities: 0,
    revenueSignals: 0,
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
    if (key === "--marketplace") {
      args.marketplace = value;
      index += 1;
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
    if (key === "--comments") {
      args.comments = parseCount(value, key);
      index += 1;
      continue;
    }
    if (key === "--dms") {
      args.dms = parseCount(value, key);
      index += 1;
      continue;
    }
    if (key === "--opportunities") {
      args.opportunities = parseCount(value, key);
      index += 1;
      continue;
    }
    if (key === "--revenue-signals") {
      args.revenueSignals = parseCount(value, key);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

function parseCount(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
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

function dateDiffDays(from, to) {
  if (!from || !to) return null;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.floor((toMs - fromMs) / 86400000);
}

function addDays(date, days) {
  if (!date) return "";
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

function formCampaign(item) {
  return (
    item?.utm_campaign ||
    item?.data?.utm_campaign ||
    item?.body?.utm_campaign ||
    item?.utmCampaign ||
    ""
  );
}

function formSourcePage(item) {
  return (
    item?.source_page ||
    item?.data?.source_page ||
    item?.body?.source_page ||
    item?.sourcePage ||
    ""
  );
}

function campaignForms(formsData, campaign) {
  const submissions = Array.isArray(formsData.submissions) ? formsData.submissions : [];
  return submissions.filter((item) => formCampaign(item) === campaign || formSourcePage(item).includes(campaign));
}

function campaignEvents(eventsData, campaign) {
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];
  return events.filter((event) => event.utm_campaign === campaign);
}

function campaignActions(actions, post) {
  return actions.filter(
    (row) =>
      (row.type === "post" || row.type === "social_post") &&
      row.status === "done" &&
      (row.channel === PRIMARY_CHANNEL || row.channel === post.channel) &&
      (row.campaign === post.campaign || row.target === post.title),
  );
}

function attributionText(row) {
  return [
    row.source,
    row.revenue_path,
    row.notes,
    row.reply_notes,
    row.contact_channel,
    row.campaign,
    row.target,
    row.evidence,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isCommunityAttributed(row) {
  const text = attributionText(row);
  return [
    PRIMARY_CHANNEL,
    "framer community",
    "community_feed",
    "community feed",
    "community_post",
    "community post",
    "utm_source=framer_community_feed",
  ].some((needle) => text.includes(needle));
}

function matchesPostAttribution(row, post) {
  if (!post) return false;
  const text = attributionText(row);
  return [post.campaign, post.title]
    .filter(Boolean)
    .some((needle) => text.includes(String(needle).toLowerCase()));
}

function crmSignalSummary(crmRows, posts) {
  const attributed = crmRows.filter(isCommunityAttributed);
  const opportunityRows = attributed.filter(
    (row) => OPPORTUNITY_STATUSES.has(row.status) || money(row.deal_value_usd) > 0,
  );
  const byCampaign = new Map();

  for (const post of posts) {
    const rows = opportunityRows.filter((row) => matchesPostAttribution(row, post));
    byCampaign.set(post.campaign, {
      opportunities: rows.length,
      deal_value_usd: rows.reduce((sum, row) => sum + money(row.deal_value_usd), 0),
      domains: rows.map((row) => row.domain).filter(Boolean),
    });
  }

  return {
    attributed_rows: attributed.length,
    total_opportunities: opportunityRows.length,
    total_deal_value_usd: opportunityRows.reduce((sum, row) => sum + money(row.deal_value_usd), 0),
    byCampaign,
  };
}

function revenueSignalSummary(revenueRows, posts) {
  const attributed = revenueRows.filter(isCommunityAttributed);
  const signalRows = attributed.filter((row) => REVENUE_SIGNAL_STATUSES.has(row.status));
  const byCampaign = new Map();

  for (const post of posts) {
    const rows = signalRows.filter((row) => matchesPostAttribution(row, post));
    byCampaign.set(post.campaign, {
      events: rows.length,
      amount_usd: rows.reduce((sum, row) => sum + money(row.amount_usd), 0),
      verified_events: rows.filter((row) => row.status === "verified").length,
      pending_events: rows.filter((row) => row.status === "pending").length,
    });
  }

  return {
    attributed_rows: attributed.length,
    total_events: signalRows.length,
    total_amount_usd: signalRows.reduce((sum, row) => sum + money(row.amount_usd), 0),
    verified_events: signalRows.filter((row) => row.status === "verified").length,
    pending_events: signalRows.filter((row) => row.status === "pending").length,
    byCampaign,
  };
}

function marketplaceDeltas(rows) {
  const sorted = [...rows]
    .filter((row) => row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index);
  const latest = sorted[0] || null;
  const previous = sorted[1] || null;
  return {
    latest,
    previous,
    users: latest && previous ? number(latest.users) - number(previous.users) : 0,
    opens: latest && previous ? number(latest.opens) - number(previous.opens) : 0,
    version: latest && previous ? number(latest.version) - number(previous.version) : 0,
  };
}

function assess({ kit, eventsData, formsData, actions, marketplaceRows, crmRows, revenueRows, args }) {
  const posts = Array.isArray(kit.posts) ? [...kit.posts].sort((a, b) => a.priority - b.priority) : [];
  const crmSignals = crmSignalSummary(crmRows, posts);
  const revenueSignals = revenueSignalSummary(revenueRows, posts);
  const rows = posts.map((post) => {
    const postedActions = campaignActions(actions, post);
    const newestPost = postedActions
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index)[0] || null;
    const events = campaignEvents(eventsData, post.campaign);
    const forms = campaignForms(formsData, post.campaign);
    const crm = crmSignals.byCampaign.get(post.campaign) || {};
    const revenue = revenueSignals.byCampaign.get(post.campaign) || {};
    const ageDays = dateDiffDays(newestPost?.date, args.today);
    return {
      priority: post.priority,
      title: post.title,
      campaign: post.campaign,
      posted: Boolean(newestPost),
      posted_date: newestPost?.date || "",
      age_days: ageDays,
      evidence: newestPost?.evidence || "",
      events: events.length,
      forms: forms.length,
      crm_opportunities: crm.opportunities || 0,
      crm_deal_value_usd: crm.deal_value_usd || 0,
      revenue_events: revenue.events || 0,
      revenue_amount_usd: revenue.amount_usd || 0,
      status: postStatus({
        posted: Boolean(newestPost),
        ageDays,
        events: events.length,
        forms: forms.length,
        opportunities: crm.opportunities || 0,
        revenueEvents: revenue.events || 0,
      }),
      next_review_date: nextReviewDate({
        postedDate: newestPost?.date || "",
        ageDays,
        events: events.length,
        forms: forms.length,
        opportunities: crm.opportunities || 0,
        revenueEvents: revenue.events || 0,
      }),
    };
  });

  const postedRows = rows.filter((row) => row.posted);
  const primary = rows.find((row) => Number(row.priority) === 1) || null;
  const deltas = marketplaceDeltas(marketplaceRows);
  const manualIntent = args.comments + args.dms;
  const trackedIntent = rows.reduce((sum, row) => sum + row.events + row.forms, 0);
  const opportunitySignal = args.opportunities + crmSignals.total_opportunities;
  const revenueSignal = args.revenueSignals + revenueSignals.total_events;
  const marketplaceLift = Math.max(0, deltas.users) + Math.max(0, deltas.opens);
  const totalSignal = manualIntent + trackedIntent + marketplaceLift + opportunitySignal + revenueSignal;
  const verdict = verdictFor({ rows, primary, totalSignal, opportunitySignal, revenueSignal, args });

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    feed: kit.feed || "",
    posts_total: rows.length,
    posts_logged: postedRows.length,
    comments: args.comments,
    dms: args.dms,
    manual_signal: manualIntent,
    manual_opportunities: args.opportunities,
    manual_revenue_signals: args.revenueSignals,
    tracked_events: rows.reduce((sum, row) => sum + row.events, 0),
    tracked_forms: rows.reduce((sum, row) => sum + row.forms, 0),
    tracked_signal: trackedIntent,
    crm_signal: {
      attributed_rows: crmSignals.attributed_rows,
      opportunities: crmSignals.total_opportunities,
      deal_value_usd: crmSignals.total_deal_value_usd,
    },
    revenue_signal: {
      attributed_rows: revenueSignals.attributed_rows,
      events: revenueSignals.total_events,
      verified_events: revenueSignals.verified_events,
      pending_events: revenueSignals.pending_events,
      amount_usd: revenueSignals.total_amount_usd,
    },
    opportunity_signal: opportunitySignal,
    revenue_signal_score: revenueSignal,
    marketplace_delta: deltas,
    marketplace_lift: marketplaceLift,
    total_signal: totalSignal,
    next_review_date: nextReviewDateForRows(rows),
    verdict,
    recommendation: recommendationFor({ rows, primary, totalSignal, opportunitySignal, revenueSignal, args }),
    rows,
  };
}

function postStatus({ posted, ageDays, events, forms, opportunities, revenueEvents }) {
  if (!posted) return "not_posted";
  if (revenueEvents > 0) return "revenue_signal";
  if (opportunities > 0) return "opportunity_signal";
  if (forms > 0) return "form_intent";
  if (events > 0) return "cta_intent";
  if (ageDays === null || ageDays < 1) return "measure_24h";
  if (ageDays < 2) return "measure_48h";
  if (ageDays < 3) return "measure_72h";
  return "posted_no_signal";
}

function nextReviewDate({ postedDate, ageDays, events, forms, opportunities, revenueEvents }) {
  if (!postedDate || events > 0 || forms > 0 || opportunities > 0 || revenueEvents > 0) return "";
  if (ageDays === null || ageDays < 1) return addDays(postedDate, 1);
  if (ageDays < 2) return addDays(postedDate, 2);
  if (ageDays < 3) return addDays(postedDate, 3);
  return "";
}

function nextReviewDateForRows(rows) {
  return rows
    .map((row) => row.next_review_date)
    .filter(Boolean)
    .sort()[0] || "";
}

function verdictFor({ rows, primary, totalSignal, opportunitySignal, revenueSignal }) {
  if (!rows.length) return "missing_kit";
  if (!primary?.posted) return "not_started_worth_testing";
  if (revenueSignal > 0) return "continue_community_revenue_signal";
  if (opportunitySignal > 0) return "continue_community_opportunity";
  if (totalSignal > 0) return "continue_community";
  if (primary.age_days !== null && primary.age_days >= 3) return "deprioritize_community";
  if (primary.age_days !== null && primary.age_days >= 2) return "revise_hook_before_next_post";
  return "wait_for_signal";
}

function recommendationFor({ rows, primary, totalSignal, opportunitySignal, revenueSignal }) {
  if (!rows.length) {
    return "Regenerate the Community kit with `pnpm lead:community`.";
  }
  if (!primary?.posted) {
    return "Community Feed is still untested. Publish only priority 1, record the URL, then review after 24h, 48h, and 72h.";
  }
  if (revenueSignal > 0) {
    return "Community has revenue signal. Prioritize fulfillment/support, record the revenue evidence, then consider one follow-up post only after the active thread is handled.";
  }
  if (opportunitySignal > 0) {
    return "Community has qualified opportunity signal. Reply and move the lead into CRM next steps before publishing another Community post.";
  }
  if (totalSignal > 0) {
    return "Signal exists. Reply to comments/DMs first, record the manual count, refresh Marketplace/public snapshots, then consider priority 2 after the 24h window.";
  }
  if (primary.age_days !== null && primary.age_days >= 3) {
    return "Community has no qualified signal after 72 hours. Deprioritize more Community posting behind Marketplace, directories, and partner/resource channels until the hook or visual angle is materially changed.";
  }
  if (primary.age_days !== null && primary.age_days >= 2) {
    return "Do not publish priority 2 yet. Rewrite the opening hook and visual angle around a sharper Framer launch pain before another Community post.";
  }
  return "Wait until the 24h/48h/72h measurement point before judging Community Feed value.";
}

function renderMarkdown(review) {
  const lines = [
    "# Framer Community Review",
    "",
    `Generated: ${review.generated_at}`,
    `Feed: ${review.feed || "unknown"}`,
    `Verdict: ${review.verdict}`,
    "",
    "## Signal",
    "",
    `- Posts logged: ${review.posts_logged}/${review.posts_total}`,
    `- Manual comments: ${review.comments}`,
    `- Manual DMs/profile replies: ${review.dms}`,
    `- Manual signal score: ${review.manual_signal}`,
    `- Manual opportunities: ${review.manual_opportunities}`,
    `- Manual revenue signals: ${review.manual_revenue_signals}`,
    `- Tracked CTA events: ${review.tracked_events}`,
    `- Tracked form submissions: ${review.tracked_forms}`,
    `- Tracked signal score: ${review.tracked_signal}`,
    `- CRM-attributed opportunities: ${review.crm_signal.opportunities}`,
    `- CRM-attributed deal value: ${formatUsd(review.crm_signal.deal_value_usd)}`,
    `- Revenue-attributed events: ${review.revenue_signal.events}`,
    `- Revenue-attributed amount: ${formatUsd(review.revenue_signal.amount_usd)}`,
    `- Marketplace users delta: ${review.marketplace_delta.users}`,
    `- Marketplace opens delta: ${review.marketplace_delta.opens}`,
    `- Marketplace lift score: ${review.marketplace_lift}`,
    `- Total signal score: ${review.total_signal}`,
    `- Next review date: ${review.next_review_date || "not scheduled"}`,
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
    "## Posts",
    "",
    "| Priority | Post | Campaign | Posted | Age days | CTA | Forms | CRM opps | Revenue | Status | Next review |",
    "|---:|---|---|---|---:|---:|---:|---:|---:|---|---|",
  ];

  for (const row of review.rows) {
    lines.push(
      `| ${row.priority} | ${row.title} | ${row.campaign} | ${row.posted ? "yes" : "no"} | ${row.age_days ?? ""} | ${row.events} | ${row.forms} | ${row.crm_opportunities} | ${row.revenue_events} | ${row.status} | ${row.next_review_date || ""} |`,
    );
  }

  lines.push(
    "",
    "## Decision Rules",
    "",
    "- 24h continue: any comment, DM, CTA event, form, or Marketplace users/opens lift.",
    "- 48h stop/rewrite: no manual signal, no tracked CTA/form, and no Marketplace lift.",
    "- 72h deprioritize: no comment, DM, CTA event, form, Marketplace lift, reply, opportunity, or revenue signal.",
    "- 7d continue: at least one qualified reply, form, opportunity, revenue signal, or Marketplace lift paired with CTA intent.",
    "- CRM/revenue signal is counted only when the row is explicitly attributed to Framer Community, such as `framer_community_feed`, `community_post`, or a Community URL.",
    "",
    "## Commands",
    "",
    "```bash",
    "pnpm lead:community",
    "pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <manual_opportunities> --revenue-signals <manual_revenue_events>",
    "pnpm lead:forms && pnpm lead:events && pnpm lead:marketplace-public -- --record && pnpm lead:community-review && pnpm lead:gate && pnpm lead:ops",
    "```",
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

  const [kit, eventsData, formsData, actions, marketplaceRows, crmRows, revenueRows] = await Promise.all([
    readJson(args.kit, { posts: [] }),
    readJson(args.events, { events: [] }),
    readJson(args.forms, { submissions: [] }),
    readRows(args.actions),
    readRows(args.marketplace),
    readRows(args.crm),
    readRows(args.revenue),
  ]);
  const review = assess({ kit, eventsData, formsData, actions, marketplaceRows, crmRows, revenueRows, args });
  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Community review: ${review.verdict}\n`);
  process.stdout.write(`Recommendation: ${review.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
