#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_MARKETPLACE_PUBLIC = ".tmp/framer-marketplace-public.json";
const DEFAULT_FOLLOWUP_PREFLIGHT = ".tmp/framer-followup-preflight.json";
const DEFAULT_CHANNEL_PRIORITY = ".tmp/framer-channel-priority.json";
const DEFAULT_OUTPUT = ".tmp/framer-signal-sweep.md";
const DEFAULT_JSON = ".tmp/framer-signal-sweep.json";

function usage() {
  return `
Usage:
  pnpm lead:signal-sweep

Options:
  --actions <file>              External action log CSV. Default: ${DEFAULT_ACTIONS}
  --revenue <file>              Revenue CSV. Default: ${DEFAULT_REVENUE}
  --events <file>               CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>                Netlify form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --marketplace-public <file>   Marketplace public listing JSON. Default: ${DEFAULT_MARKETPLACE_PUBLIC}
  --followup-preflight <file>   Follow-up preflight JSON. Default: ${DEFAULT_FOLLOWUP_PREFLIGHT}
  --channel-priority <file>     Channel priority JSON. Default: ${DEFAULT_CHANNEL_PRIORITY}
  --lookback <days>             Gmail query lookback. Default: 3
  --today <YYYY-MM-DD>          Local review date. Default: local date.
  --output <file>               Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                 JSON output. Default: ${DEFAULT_JSON}
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    revenue: DEFAULT_REVENUE,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
    marketplacePublic: DEFAULT_MARKETPLACE_PUBLIC,
    followupPreflight: DEFAULT_FOLLOWUP_PREFLIGHT,
    channelPriority: DEFAULT_CHANNEL_PRIORITY,
    lookback: 3,
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
    if (key === "--actions") {
      args.actions = value;
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
    if (key === "--marketplace-public") {
      args.marketplacePublic = value;
      index += 1;
      continue;
    }
    if (key === "--followup-preflight") {
      args.followupPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--channel-priority") {
      args.channelPriority = value;
      index += 1;
      continue;
    }
    if (key === "--lookback") {
      args.lookback = Number(value);
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

  if (!Number.isFinite(args.lookback) || args.lookback < 1) {
    throw new Error("--lookback must be a positive number.");
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
  return Number.parseFloat(value || "0") || 0;
}

function sameDayEmailSweeps(actions, today) {
  return actions
    .filter(
      (row) =>
        row.date === today &&
        row.type === "email_monitor" &&
        row.status === "done" &&
        /(reply|bounce|unsubscribe|signal|revenue|growth)/i.test(
          [row.campaign, row.target, row.note].filter(Boolean).join(" "),
        ),
    )
    .sort((a, b) => b.__index - a.__index);
}

function latestRows(rows, count = 5) {
  return [...rows]
    .sort(
      (a, b) =>
        String(b.date || "").localeCompare(String(a.date || "")) ||
        (b.__index || 0) - (a.__index || 0),
    )
    .slice(0, count);
}

function queryPack(lookback) {
  const d = Math.round(lookback);
  return [
    {
      label: "Polyglot / Framer human replies",
      query: `newer_than:${d}d ("Polyglot AEO" OR polyglot OR polyglotaeo OR "Framer AEO" OR "llms.txt") -from:me -in:spam -in:trash`,
    },
    {
      label: "Recent product-channel replies",
      query: `newer_than:${Math.max(1, d - 2)}d -from:me -in:spam -in:trash (Framer OR framer OR marketplace OR plugin OR AEO OR SEO OR llms OR Polyglot OR polyglot)`,
    },
    {
      label: "Revenue, checkout receipts, and Creem compliance",
      query: `newer_than:${d}d (Creem OR "You made a sale" OR "Payment receipt" OR invoice OR checkout OR subscription OR compliance OR off-boarding OR "unregistered traffic") -in:spam -in:trash`,
    },
    {
      label: "Bounces, unsubscribes, and auto-replies",
      query: `newer_than:${d}d (unsubscribe OR "please unsubscribe" OR "Delivery Status Notification" OR "address not found" OR bounced OR undeliverable OR "out of office" OR autoreply OR "auto-reply") -in:spam -in:trash`,
    },
    {
      label: "Directory and content partner replies",
      query: `newer_than:${d}d -from:me -in:spam -in:trash (Frameplugins OR HyperFramer OR Frameplate OR SegmentUI OR FramerHub OR "We Optimizz" OR Helm OR BRIX OR 925Studios OR "AY Automate" OR "Times One Hundred" OR "Modern Practice" OR directory OR resource)`,
    },
    {
      label: "Framer Community team",
      query: `newer_than:${d}d (from:creators@framer.com OR to:creators@framer.com OR "Framer Community") ("Polyglot AEO" OR marketplace OR visibility OR resource) -in:spam -in:trash`,
    },
  ];
}

function marketplaceSnapshot(marketplacePublic) {
  return marketplacePublic?.snapshot || {};
}

function buildSweep({ actions, revenueRows, eventsData, formsData, marketplacePublic, followupPreflight, channelPriority, args }) {
  const events = Array.isArray(eventsData?.events) ? eventsData.events : [];
  const ignoredTestEvents = Array.isArray(eventsData?.ignored_test_events)
    ? eventsData.ignored_test_events
    : [];
  const submissions = Array.isArray(formsData?.submissions) ? formsData.submissions : [];
  const verifiedRevenue = revenueRows.filter((row) => row.status === "verified");
  const pendingRevenue = revenueRows.filter((row) => row.status === "pending");
  const ignoredRevenue = revenueRows.filter((row) => row.status === "ignored");
  const sameDaySweeps = sameDayEmailSweeps(actions, args.today);
  const openComplianceWarnings = actions.filter(
    (row) => row.type === "compliance_warning" && !["done", "resolved", "skipped"].includes(row.status),
  );
  const publicSnapshot = marketplaceSnapshot(marketplacePublic);
  const likes = number(publicSnapshot.likes);
  const comments = number(publicSnapshot.comments);
  const signals = [];

  if (events.length) signals.push(`${events.length} CTA event(s)`);
  if (submissions.length) signals.push(`${submissions.length} form submission(s)`);
  if (verifiedRevenue.length) signals.push(`${verifiedRevenue.length} verified revenue row(s)`);
  if (pendingRevenue.length) signals.push(`${pendingRevenue.length} pending revenue row(s)`);
  if (openComplianceWarnings.length) signals.push(`${openComplianceWarnings.length} open compliance warning(s)`);
  if (likes || comments) signals.push(`Marketplace public engagement ${likes} like(s) / ${comments} comment(s)`);

  const needsGmailSweep = sameDaySweeps.length === 0;
  const recommendation = recommendationFor({ signals, needsGmailSweep, openComplianceWarnings, channelPriority });

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    lookback_days: args.lookback,
    recommendation,
    local_signals: {
      cta_events: events.length,
      ignored_test_events: ignoredTestEvents.length,
      form_submissions: submissions.length,
      verified_revenue_rows: verifiedRevenue.length,
      verified_revenue_usd: verifiedRevenue.reduce((sum, row) => sum + money(row.amount_usd), 0),
      pending_revenue_rows: pendingRevenue.length,
      pending_revenue_usd: pendingRevenue.reduce((sum, row) => sum + money(row.amount_usd), 0),
      ignored_revenue_rows: ignoredRevenue.length,
      open_compliance_warnings: openComplianceWarnings.length,
      marketplace_public_readable: Boolean(publicSnapshot.ok || marketplacePublic?.snapshot?.http_status === 200),
      marketplace_likes: likes,
      marketplace_comments: comments,
      marketplace_updated_at: publicSnapshot.updated_at || "",
    },
    gmail: {
      same_day_sweep_logged: sameDaySweeps.length > 0,
      same_day_sweeps: sameDaySweeps,
      queries: queryPack(args.lookback),
      log_command_template:
        "pnpm lead:actions -- --add --type email_monitor --channel gmail --campaign signal_sweep --status done --target 'read-only growth signal sweep newer_than:<N>d' --evidence '<gmail ids>; .tmp/framer-form-intake.json; .tmp/framer-cta-events.json; .tmp/framer-marketplace-public.json' --note '<summary of replies, bounces, revenue, forms, CTA, Marketplace engagement>'",
    },
    followup_preflight: {
      verdict: followupPreflight?.verdict || "missing",
      send_allowed: Boolean(followupPreflight?.send_allowed),
      scheduled_send_date: followupPreflight?.scheduled_send_date || "",
      queue_count: followupPreflight?.queue_count || 0,
      recommendation: followupPreflight?.recommendation || "",
    },
    channel_priority: {
      next_channel: channelPriority?.next_channel || "",
      next_confirmation: channelPriority?.next_confirmation || "",
      recommendation: channelPriority?.recommendation || "",
    },
    latest_revenue_rows: latestRows(revenueRows, 5),
    open_compliance_warnings: latestRows(openComplianceWarnings, 5),
  };
}

function recommendationFor({ signals, needsGmailSweep, openComplianceWarnings, channelPriority }) {
  if (openComplianceWarnings.length) {
    return `Resolve compliance warning before expanding distribution: ${openComplianceWarnings[0].target || openComplianceWarnings[0].campaign}.`;
  }
  if (signals.length) return `Fulfill or attribute signal before expanding distribution: ${signals.join("; ")}.`;
  if (needsGmailSweep) return "Run the Gmail read-only query pack, then log the sweep before sending follow-ups or judging channel performance.";
  if (channelPriority?.recommendation) return channelPriority.recommendation;
  return "No local signal found. Keep monitoring and follow the current channel priority.";
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Signal Sweep",
    "",
    `Generated: ${data.generated_at}`,
    `Today: ${data.today}`,
    `Lookback: ${data.lookback_days} day(s)`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Local Signals",
    "",
    `- CTA events: ${data.local_signals.cta_events}`,
    `- Ignored test events: ${data.local_signals.ignored_test_events}`,
    `- Form submissions: ${data.local_signals.form_submissions}`,
    `- Verified revenue: ${data.local_signals.verified_revenue_rows} row(s), $${data.local_signals.verified_revenue_usd}`,
    `- Pending revenue: ${data.local_signals.pending_revenue_rows} row(s), $${data.local_signals.pending_revenue_usd}`,
    `- Ignored revenue rows: ${data.local_signals.ignored_revenue_rows}`,
    `- Open compliance warnings: ${data.local_signals.open_compliance_warnings}`,
    `- Marketplace public listing readable: ${data.local_signals.marketplace_public_readable ? "yes" : "no"}`,
    `- Marketplace likes/comments: ${data.local_signals.marketplace_likes}/${data.local_signals.marketplace_comments}`,
    data.local_signals.marketplace_updated_at
      ? `- Marketplace updated: ${data.local_signals.marketplace_updated_at}`
      : "- Marketplace updated: unknown",
    "",
    "## Gmail Read-Only Query Pack",
    "",
    `Same-day Gmail sweep logged: ${data.gmail.same_day_sweep_logged ? "yes" : "no"}`,
    "",
  ];

  for (const item of data.gmail.queries) {
    lines.push(`### ${item.label}`, "", "```text", item.query, "```", "");
  }

  lines.push("### Log Template", "", "```bash", data.gmail.log_command_template, "```", "");

  lines.push("## Compliance Warnings", "");
  if (data.open_compliance_warnings.length) {
    lines.push("| Date | Channel | Campaign | Status | Target |", "|---|---|---|---|---|");
    for (const row of data.open_compliance_warnings) {
      lines.push(`| ${row.date || ""} | ${row.channel || ""} | ${row.campaign || ""} | ${row.status || ""} | ${String(row.target || "").replace(/\|/g, "/")} |`);
    }
  } else {
    lines.push("No open compliance warnings.");
  }
  lines.push("");

  lines.push(
    "## Follow-Up Gate",
    "",
    `- Verdict: ${data.followup_preflight.verdict}`,
    `- Send allowed: ${data.followup_preflight.send_allowed ? "yes" : "no"}`,
    `- Scheduled send date: ${data.followup_preflight.scheduled_send_date || "unknown"}`,
    `- Queue count: ${data.followup_preflight.queue_count}`,
    `- Recommendation: ${data.followup_preflight.recommendation || "none"}`,
    "",
    "## Channel Priority",
    "",
    `- Next channel: ${data.channel_priority.next_channel || "unknown"}`,
    `- Next confirmation: ${data.channel_priority.next_confirmation || "none"}`,
    `- Recommendation: ${data.channel_priority.recommendation || "none"}`,
    "",
  );

  lines.push("## Refresh Commands", "", "```bash");
  lines.push("pnpm lead:forms && pnpm lead:events");
  lines.push("pnpm lead:marketplace-public -- --record");
  lines.push("pnpm lead:signal-sweep");
  lines.push("pnpm lead:ops && pnpm lead:report");
  lines.push("```", "");

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

  const [
    actions,
    revenueRows,
    eventsData,
    formsData,
    marketplacePublic,
    followupPreflight,
    channelPriority,
  ] = await Promise.all([
    readRows(args.actions),
    readRows(args.revenue),
    readJson(args.events, { events: [], ignored_test_events: [] }),
    readJson(args.forms, { submissions: [] }),
    readJson(args.marketplacePublic, null),
    readJson(args.followupPreflight, null),
    readJson(args.channelPriority, null),
  ]);

  const data = buildSweep({
    actions,
    revenueRows,
    eventsData,
    formsData,
    marketplacePublic,
    followupPreflight,
    channelPriority,
    args,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Signal sweep: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
