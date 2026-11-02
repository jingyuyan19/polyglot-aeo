#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-gmail-monitor.md";
const CLOSED_STATUSES = new Set([
  "bounced",
  "unsubscribed",
  "not_fit",
  "no_reply_closed",
  "report_closed",
  "paid_plugin",
  "service_won",
]);
const REVIEW_ONLY_STATUSES = new Set(["report_sent"]);

function usage() {
  return `
Usage:
  pnpm lead:monitor

Options:
  --crm <file>          Local CRM CSV. Default: ${DEFAULT_CRM}
  --revenue <file>      Revenue CSV. Default: ${DEFAULT_REVENUE}
  --output <file>       Markdown monitor pack. Default: ${DEFAULT_OUTPUT}
  --today <YYYY-MM-DD>  Monitor date. Default: local date.
  --lookback <days>     Gmail search lookback. Default: 7
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    revenue: DEFAULT_REVENUE,
    output: DEFAULT_OUTPUT,
    today: todayLocal(),
    lookback: 7,
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
    if (key === "--today") {
      args.today = value;
      index += 1;
      continue;
    }
    if (key === "--lookback") {
      args.lookback = parsePositiveInt(value, key);
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

function number(value) {
  return Number.parseInt(value || "0", 10) || 0;
}

function contactEmail(row) {
  const raw = String(row.contact_url || "").trim();
  const withoutMailto = raw.replace(/^mailto:/i, "");
  const match = withoutMailto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function isDue(row, today) {
  return Boolean(row.next_followup && row.next_followup <= today && !CLOSED_STATUSES.has(row.status));
}

function gmailOrQuery(items, prefix) {
  const terms = items.map((item) => `${prefix}:${item}`);
  if (terms.length === 1) {
    return terms[0];
  }
  return `{${terms.join(" ")}}`;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function followUpSlug(status) {
  if (status === "sent_day_0") return "day3";
  if (status === "sent_day_3") return "day10";
  return status.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "followup";
}

function followUpGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.next_followup || !row.status) continue;
    const key = `${row.next_followup}|${row.status}`;
    const group = groups.get(key) || {
      date: row.next_followup,
      status: row.status,
      slug: followUpSlug(row.status),
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.status.localeCompare(b.status),
  );
}

function renderFollowUpCommands(group) {
  const prefix = `.tmp/framer-${group.slug}`;
  return [
    `pnpm lead:sendpack -- --status ${group.status} --today ${group.date} --due-only --output ${prefix}-pack.md --html ${prefix}-pack.html --out-dir ${prefix}-pack --mark-sent .tmp/framer-mark-${group.slug}.sh`,
    `pnpm lead:gmail-queue -- --status ${group.status} --sendpack-dir ${prefix}-pack --output ${prefix}-gmail-queue.md --json ${prefix}-gmail-queue.json`,
  ];
}

function renderFirstTouchCommands(group) {
  const prefix = `.tmp/framer-${group.slug}`;
  return [
    `pnpm lead:sendpack -- --status ${group.status} --today ${group.date} --due-only --output ${prefix}-pack.md --html ${prefix}-pack.html --out-dir ${prefix}-pack --mark-sent .tmp/framer-mark-${group.slug}.sh`,
    `pnpm lead:gmail-queue -- --status ${group.status} --sendpack-dir ${prefix}-pack --output ${prefix}-gmail-queue.md --json ${prefix}-gmail-queue.json`,
  ];
}

function render(rows, revenueRows, args) {
  const activeSentRows = rows
    .filter((row) => number(row.sent_count) > 0 && !CLOSED_STATUSES.has(row.status))
    .sort((a, b) => (a.next_followup || "").localeCompare(b.next_followup || ""));
  const activeEmails = Array.from(new Set(activeSentRows.map(contactEmail).filter(Boolean))).sort();
  const dueRows = rows
    .filter((row) => isDue(row, args.today))
    .sort(
      (a, b) =>
        (a.next_followup || "").localeCompare(b.next_followup || "") ||
        (a.domain || "").localeCompare(b.domain || ""),
    );
  const reportReviewRows = activeSentRows.filter((row) => REVIEW_ONLY_STATUSES.has(row.status));
  const followUpEligibleRows = activeSentRows.filter((row) => !REVIEW_ONLY_STATUSES.has(row.status));
  const dueFollowUpRows = followUpEligibleRows.filter((row) => isDue(row, args.today));
  const dueFirstTouchRows = dueRows.filter(
    (row) =>
      (row.status === "queued" || row.status === "verified") &&
      row.contact_channel === "email" &&
      contactEmail(row),
  );
  const firstTouchGroups = followUpGroups(dueFirstTouchRows);
  const futureRows = followUpEligibleRows.filter((row) => row.next_followup && row.next_followup > args.today);
  const nextDueDate = futureRows[0]?.next_followup || "";
  const commandRows = dueFollowUpRows.length
    ? dueFollowUpRows
    : followUpEligibleRows.filter((row) => row.next_followup === nextDueDate);
  const commandGroups = followUpGroups(commandRows);
  const pendingRevenueRows = revenueRows.filter((row) => row.status === "pending");
  const ignoredRevenueRows = revenueRows.filter((row) => row.status === "ignored");

  const lines = [
    "# Framer Gmail Monitor",
    "",
    `Date: ${args.today}`,
    `CRM: ${args.crm}`,
    `Revenue: ${args.revenue}`,
    `Lookback: ${args.lookback} day(s)`,
    "",
    "## Gmail Queries",
    "",
    "Use these with the Gmail connector or Gmail search.",
    "",
    "### Replies From Active Leads",
    "",
  ];

  if (!activeEmails.length) {
    lines.push("No active sent lead emails to monitor.");
  } else {
    for (const group of chunks(activeEmails, 5)) {
      lines.push("```text");
      lines.push(`newer_than:${args.lookback}d ${gmailOrQuery(group, "from")} -in:trash -in:spam`);
      lines.push("```");
    }
  }

  lines.push("");
  lines.push("### Bounces");
  lines.push("");
  lines.push("```text");
  lines.push(`newer_than:${args.lookback}d "Delivery Status Notification" -in:trash -in:spam`);
  lines.push("```");
  lines.push("");
  lines.push("```text");
  lines.push(`newer_than:${args.lookback}d (Undelivered OR "Address not found" OR "Mail Delivery") -in:trash -in:spam`);
  lines.push("```");
  lines.push("");
  lines.push("### Revenue Signals");
  lines.push("");
  lines.push("```text");
  lines.push(`newer_than:${Math.max(args.lookback, 14)}d from:noreply@creem.io ("You made a sale!" OR refund OR subscription) -in:trash -in:spam`);
  lines.push("```");
  lines.push("");
  lines.push("### Mini Audit Requests");
  lines.push("");
  lines.push("```text");
  lines.push(`newer_than:${args.lookback}d subject:"Framer AEO mini audit request" -in:trash -in:spam`);
  lines.push("```");
  lines.push("");
  lines.push("```text");
  lines.push(`newer_than:${args.lookback}d ("framer-aeo-mini-audit" OR "New form submission" OR "Netlify Forms") -in:trash -in:spam`);
  lines.push("```");
  lines.push("");
  lines.push("```text");
  lines.push(`newer_than:${args.lookback}d ("Please send a short Framer AEO mini audit" OR "Site URL:" OR "Main launch or SEO concern:") -in:trash -in:spam`);
  lines.push("```");

  lines.push("");
  lines.push("## First-Touch Queue Commands");
  lines.push("");
  if (!firstTouchGroups.length) {
    lines.push("No due first-touch email queues.");
  } else {
    lines.push("Run these after checking sent mail for duplicates.");
    lines.push("");
    for (const group of firstTouchGroups) {
      lines.push(`### ${group.slug.toUpperCase()} on ${group.date} (${group.rows.length} lead(s))`);
      lines.push("");
      lines.push("```bash");
      for (const command of renderFirstTouchCommands(group)) {
        lines.push(command);
      }
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("");
  lines.push("## Report-First Observation");
  lines.push("");
  if (!reportReviewRows.length) {
    lines.push("No report-first emails are in the 7-day observation window.");
  } else {
    lines.push(
      `${reportReviewRows.length} report-first email(s) are observation-only. Review replies, bounces, opt-outs, clicks, and installs; do not generate or send a follow-up.`,
    );
    lines.push("");
    lines.push("```bash");
    lines.push("pnpm lead:report-review");
    lines.push("```");
  }

  lines.push("");
  lines.push("## Follow-Up Queue Commands");
  lines.push("");
  if (!commandGroups.length) {
    lines.push("No active follow-up queues are due or scheduled.");
  } else {
    lines.push(
      dueFollowUpRows.length
        ? "Run these only after reply/bounce monitoring for today's due leads."
        : `Next scheduled follow-up batch: ${nextDueDate}. Prepare it ahead of time with:`,
    );
    lines.push("");
    for (const group of commandGroups) {
      lines.push(`### ${group.slug.toUpperCase()} on ${group.date} (${group.rows.length} lead(s))`);
      lines.push("");
      lines.push("```bash");
      for (const command of renderFollowUpCommands(group)) {
        lines.push(command);
      }
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("");
  lines.push("## Active Lead Map");
  lines.push("");
  if (!activeSentRows.length) {
    lines.push("No active sent leads.");
  } else {
    lines.push("| Domain | Status | Contact | Next follow-up | If replied | If bounced | If unsubscribed |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const row of activeSentRows) {
      const email = contactEmail(row);
      const repliedCommand = row.status === "report_sent"
        ? `pnpm lead:crm -- --domain ${row.domain} --set-status report_replied --report-reply-quality <qualified|unqualified> --note "gmail report reply"`
        : `pnpm lead:crm -- --domain ${row.domain} --set-status replied --note "gmail reply"`;
      lines.push(
        `| ${row.domain || ""} | ${row.status || ""} | ${email || row.contact_url || "manual"} | ${row.next_followup || ""} | \`${repliedCommand}\` | \`pnpm lead:crm -- --domain ${row.domain} --set-status bounced --note "gmail bounce"\` | \`pnpm lead:crm -- --domain ${row.domain} --set-status unsubscribed --note "gmail unsubscribe"\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## Due Today");
  lines.push("");
  if (!dueRows.length) {
    lines.push("No due actions today.");
  } else {
    for (const row of dueRows) {
      lines.push(`- ${row.domain}: ${row.status} -> ${row.next_action}`);
    }
  }

  lines.push("");
  lines.push("## Revenue Follow-Up");
  lines.push("");
  if (!pendingRevenueRows.length) {
    lines.push("No pending revenue signals.");
  } else {
    for (const row of pendingRevenueRows) {
      lines.push(
        `- Verify ${row.source || "revenue"} ${row.email_id || row.product || ""}: \`pnpm lead:revenue -- --source ${row.source || "manual"} --status verified --amount-usd <amount> --email-id ${row.email_id || "<id>"}\``,
      );
    }
  }
  if (ignoredRevenueRows.length) {
    lines.push("");
    lines.push("Ignored revenue events are kept for audit trail, not counted as outcomes.");
  }

  lines.push("");
  lines.push("## Mini Audit Request Intake");
  lines.push("");
  lines.push("First pull Netlify Forms directly so form submissions do not depend on email notifications:");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm lead:forms");
  lines.push("pnpm lead:forms -- --apply");
  lines.push("```");
  lines.push("");
  lines.push("When an email includes a public URL, add it to CRM and generate the reply kit:");
  lines.push("");
  lines.push("```bash");
  lines.push('pnpm lead:intake -- --site-url "<public site URL>" --contact-email "<requester email>" --note "gmail mini audit request"');
  lines.push("pnpm lead:audit -- --domain <domain>");
  lines.push("```");

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
  const markdown = render(rows, revenueRows, args);
  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, markdown, "utf8");
  process.stdout.write(markdown);
  process.stdout.write(`Monitor pack written to ${args.output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
