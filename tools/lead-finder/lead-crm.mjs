#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_DUE_MD = ".tmp/framer-actions.md";
const DEFAULT_IMPORT = ".tmp/framer-outreach.csv";

const CRM_COLUMNS = [
  "domain",
  "final_url",
  "locales",
  "score",
  "audit_score",
  "audit_rating",
  "audit_checked_at",
  "audit_version",
  "report_campaign",
  "report_cohort",
  "report_reply_quality",
  "contact_url",
  "contact_channel",
  "status",
  "source",
  "issue_1",
  "issue_2",
  "issue_3",
  "subject",
  "email_body",
  "contact_form_body",
  "manual_check",
  "created_at",
  "last_touch",
  "next_action",
  "next_followup",
  "sent_count",
  "reply_notes",
  "deal_value_usd",
  "revenue_path",
];

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
  pnpm lead:crm -- --import .tmp/framer-outreach.csv
  pnpm lead:crm -- --summary
  pnpm lead:crm -- --domain example.com --set-status sent_day_0

Options:
  --crm <file>              Local CRM CSV. Default: ${DEFAULT_CRM}
  --import <file>           Import outreach CSV. Default when flag is present: ${DEFAULT_IMPORT}
  --due-md <file>           Write today's action plan. Default: ${DEFAULT_DUE_MD}
  --summary                 Print funnel and due counts.
  --domain <domain>         Domain to update.
  --set-status <status>     Update one domain status.
  --note <text>             Append/update reply notes for --set-status.
  --next-action <text>      Override next action for --domain.
  --next-followup <date>    Override next follow-up date for --domain, or blank to clear.
  --contact-url <url>       Override contact URL for --domain.
  --contact-channel <text>  Override contact channel for --domain.
  --audit-score <number>    Set the public readiness score; does not replace lead score.
  --audit-rating <text>     Set Strong, Needs attention, or Limited public signals.
  --audit-checked-at <time> Set the public audit timestamp.
  --audit-version <text>    Set the public audit methodology version.
  --report-campaign <text>  Set the report-first campaign id.
  --report-cohort <text>    Set old/new/manual cohort.
  --report-reply-quality <text> Set qualified/unqualified after a human reply.
  --revenue-path <text>     Set revenue path, e.g. plugin, launch_qa, implementation.
  --deal-value <amount>     Set estimated or actual deal value in USD.
  --today <YYYY-MM-DD>      Override today's date. Default: local date.
  --help                    Show this help message.

Statuses:
  queued, reserve, manual_review, verified, sent_day_0, sent_day_3, sent_day_10, replied,
  mini_audit_sent, call_booked, installed_free, paid_plugin,
  service_offer, service_won, report_ready, report_sent, report_replied, report_closed,
  bounced, unsubscribed, not_fit, no_reply_closed
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    dueMd: DEFAULT_DUE_MD,
    summary: false,
    today: todayLocal(),
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
    if (key === "--import") {
      args.import = value && !value.startsWith("--") ? value : DEFAULT_IMPORT;
      if (value && !value.startsWith("--")) index += 1;
      continue;
    }
    if (key === "--due-md") {
      args.dueMd = value;
      index += 1;
      continue;
    }
    if (key === "--summary") {
      args.summary = true;
      continue;
    }
    if (key === "--domain") {
      args.domain = normalizeDomain(value);
      index += 1;
      continue;
    }
    if (key === "--set-status") {
      args.setStatus = value;
      index += 1;
      continue;
    }
    if (key === "--note") {
      args.note = value;
      index += 1;
      continue;
    }
    if (key === "--next-action") {
      args.nextAction = value;
      index += 1;
      continue;
    }
    if (key === "--next-followup") {
      args.nextFollowup = value || "";
      index += 1;
      continue;
    }
    if (key === "--contact-url") {
      args.contactUrl = value || "";
      index += 1;
      continue;
    }
    if (key === "--contact-channel") {
      args.contactChannel = value || "";
      index += 1;
      continue;
    }
    if (key === "--audit-score") {
      args.auditScore = value || "";
      index += 1;
      continue;
    }
    if (key === "--audit-rating") {
      args.auditRating = value || "";
      index += 1;
      continue;
    }
    if (key === "--audit-checked-at") {
      args.auditCheckedAt = value || "";
      index += 1;
      continue;
    }
    if (key === "--audit-version") {
      args.auditVersion = value || "";
      index += 1;
      continue;
    }
    if (key === "--report-campaign") {
      args.reportCampaign = value || "";
      index += 1;
      continue;
    }
    if (key === "--report-cohort") {
      args.reportCohort = value || "";
      index += 1;
      continue;
    }
    if (key === "--report-reply-quality") {
      args.reportReplyQuality = value || "";
      index += 1;
      continue;
    }
    if (key === "--revenue-path") {
      args.revenuePath = value;
      index += 1;
      continue;
    }
    if (key === "--deal-value") {
      args.dealValueUsd = normalizeDealValue(value);
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

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isDue(row, today) {
  return Boolean(row.next_followup && row.next_followup <= today && !CLOSED_STATUSES.has(row.status));
}

function normalizeDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return raw.toLowerCase().replace(/^www\./, "");
  }
}

function normalizeDealValue(value) {
  const cleaned = String(value || "").replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("--deal-value must be a non-negative number.");
  }
  return parsed.toFixed(2).replace(/\.00$/, "");
}

async function readCsvFile(file, columns = CRM_COLUMNS) {
  try {
    const text = await readFile(file, "utf8");
    return parseCsv(text);
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

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  return (
    [CRM_COLUMNS.join(","), ...rows.map((row) => CRM_COLUMNS.map((column) => csvEscape(row[column])).join(","))].join(
      "\n",
    ) + "\n"
  );
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function emptyCrmRow(domain, today) {
  return Object.fromEntries(
    CRM_COLUMNS.map((column) => {
      if (column === "domain") return [column, domain];
      if (column === "status") return [column, "queued"];
      if (column === "created_at") return [column, today];
      if (column === "next_action") return [column, "verify_and_send_day_0"];
      if (column === "next_followup") return [column, today];
      if (column === "sent_count") return [column, "0"];
      return [column, ""];
    }),
  );
}

function importOutreachRows(crmRows, outreachRows, args) {
  const byDomain = new Map(crmRows.map((row) => [normalizeDomain(row.domain), row]));
  let added = 0;
  let updated = 0;

  for (const outreach of outreachRows) {
    const domain = normalizeDomain(outreach.domain);
    if (!domain) continue;

    const existing = byDomain.get(domain);
    const row = existing || emptyCrmRow(domain, args.today);

    row.score = outreach.score || row.score;
    row.final_url = outreach.final_url || row.final_url;
    row.locales = outreach.locales || row.locales;
    row.contact_url = outreach.contact_url || row.contact_url;
    row.contact_channel = outreach.contact_channel || row.contact_channel || "manual";
    row.source = args.import;
    row.issue_1 = outreach.issue_1 || row.issue_1;
    row.issue_2 = outreach.issue_2 || row.issue_2;
    row.issue_3 = outreach.issue_3 || row.issue_3;
    row.subject = outreach.subject || row.subject;
    row.email_body = outreach.email_body || row.email_body;
    row.contact_form_body = outreach.contact_form_body || row.contact_form_body;
    row.manual_check = outreach.manual_check || row.manual_check;
    row.audit_score = outreach.audit_score || row.audit_score;
    row.audit_rating = outreach.audit_rating || row.audit_rating;
    row.audit_checked_at = outreach.audit_checked_at || row.audit_checked_at;
    row.audit_version = outreach.audit_version || row.audit_version;
    row.report_campaign = outreach.report_campaign || row.report_campaign;
    row.report_cohort = outreach.report_cohort || row.report_cohort;
    row.report_reply_quality = outreach.report_reply_quality || row.report_reply_quality;

    if (!existing) {
      row.status = outreach.status || row.status;
      row.next_action = outreach.next_action || row.next_action;
      row.next_followup = outreach.next_followup || row.next_followup;
      byDomain.set(domain, row);
      added += 1;
    } else {
      updated += 1;
    }
  }

  return {
    rows: Array.from(byDomain.values()).sort((a, b) => Number(b.score || 0) - Number(a.score || 0)),
    added,
    updated,
  };
}

function transition(row, status, args) {
  row.status = status;
  row.last_touch = args.today;

  if (args.note) {
    row.reply_notes = row.reply_notes ? `${row.reply_notes} | ${args.today}: ${args.note}` : `${args.today}: ${args.note}`;
  }
  if (args.revenuePath) {
    row.revenue_path = args.revenuePath;
  }
  if (args.dealValueUsd) {
    row.deal_value_usd = args.dealValueUsd;
  }

  if (status === "verified") {
    row.next_action = "send_day_0";
    row.next_followup = args.today;
    return row;
  }

  if (status === "manual_review") {
    row.next_action = "manual_review";
    row.next_followup = "";
    return row;
  }

  if (status === "reserve") {
    row.next_action = "reserve_for_replacement";
    row.next_followup = "";
    return row;
  }

  if (status === "sent_day_0") {
    row.sent_count = String((Number.parseInt(row.sent_count || "0", 10) || 0) + 1);
    row.next_action = "send_day_3_followup";
    row.next_followup = addDays(args.today, 3);
    return row;
  }

  if (status === "sent_day_3") {
    row.sent_count = String((Number.parseInt(row.sent_count || "0", 10) || 0) + 1);
    row.next_action = "send_day_10_followup";
    row.next_followup = addDays(args.today, 7);
    return row;
  }

  if (status === "sent_day_10") {
    row.sent_count = String((Number.parseInt(row.sent_count || "0", 10) || 0) + 1);
    row.next_action = "wait_for_reply";
    row.next_followup = "";
    return row;
  }

  if (status === "report_ready") {
    row.next_action = "manual_review_inline_report";
    row.next_followup = args.nextFollowup || args.today;
    return row;
  }

  if (status === "report_sent") {
    row.sent_count = String((Number.parseInt(row.sent_count || "0", 10) || 0) + 1);
    row.next_action = "review_report_reply_24h_no_followup";
    row.next_followup = addDays(args.today, 1);
    return row;
  }

  if (status === "report_replied") {
    row.next_action = "send_smallest_specific_fix";
    row.next_followup = args.today;
    return row;
  }

  if (status === "replied") {
    row.next_action = "send_mini_audit_or_book_call";
    row.next_followup = args.today;
    return row;
  }

  if (status === "mini_audit_sent") {
    row.next_action = "follow_up_offer";
    row.next_followup = addDays(args.today, 3);
    return row;
  }

  if (status === "service_offer") {
    row.next_action = "follow_up_offer";
    row.next_followup = addDays(args.today, 3);
    return row;
  }

  if (status === "call_booked" || status === "installed_free") {
    row.next_action = "manual_next_step";
    row.next_followup = addDays(args.today, 2);
    return row;
  }

  if (CLOSED_STATUSES.has(status)) {
    row.next_action = "closed";
    row.next_followup = "";
    return row;
  }

  row.next_action = row.next_action || "manual_next_step";
  row.next_followup = row.next_followup || args.today;
  return row;
}

function updateDomain(rows, args) {
  const hasFieldUpdate =
    args.note ||
    args.revenuePath ||
    args.dealValueUsd ||
    args.nextAction !== undefined ||
    args.nextFollowup !== undefined ||
    args.contactUrl !== undefined ||
    args.contactChannel !== undefined ||
    args.auditScore !== undefined ||
    args.auditRating !== undefined ||
    args.auditCheckedAt !== undefined ||
    args.auditVersion !== undefined ||
    args.reportCampaign !== undefined ||
    args.reportCohort !== undefined ||
    args.reportReplyQuality !== undefined;

  if (!args.domain || (!args.setStatus && !hasFieldUpdate)) {
    return { rows, changed: false };
  }

  const row = rows.find((candidate) => normalizeDomain(candidate.domain) === args.domain);
  if (!row) {
    throw new Error(`No CRM row found for ${args.domain}. Import outreach first.`);
  }

  if (args.setStatus) {
    transition(row, args.setStatus, args);
  } else {
    row.last_touch = args.today;
    if (args.note) {
      row.reply_notes = row.reply_notes ? `${row.reply_notes} | ${args.today}: ${args.note}` : `${args.today}: ${args.note}`;
    }
    if (args.revenuePath) {
      row.revenue_path = args.revenuePath;
    }
    if (args.dealValueUsd) {
      row.deal_value_usd = args.dealValueUsd;
    }
  }
  if (args.nextAction !== undefined) {
    row.next_action = args.nextAction;
  }
  if (args.nextFollowup !== undefined) {
    row.next_followup = args.nextFollowup;
  }
  if (args.contactUrl !== undefined) {
    row.contact_url = args.contactUrl;
  }
  if (args.contactChannel !== undefined) {
    row.contact_channel = args.contactChannel;
  }
  if (args.auditScore !== undefined) {
    row.audit_score = args.auditScore;
  }
  if (args.auditRating !== undefined) {
    row.audit_rating = args.auditRating;
  }
  if (args.auditCheckedAt !== undefined) {
    row.audit_checked_at = args.auditCheckedAt;
  }
  if (args.auditVersion !== undefined) {
    row.audit_version = args.auditVersion;
  }
  if (args.reportCampaign !== undefined) {
    row.report_campaign = args.reportCampaign;
  }
  if (args.reportCohort !== undefined) {
    row.report_cohort = args.reportCohort;
  }
  if (args.reportReplyQuality !== undefined) {
    row.report_reply_quality = args.reportReplyQuality;
  }
  return { rows, changed: true };
}

function day3Draft(row) {
  const issues = [row.issue_1, row.issue_2, row.issue_3]
    .map((issue) => String(issue || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  while (issues.length < 3) {
    issues.push([
      "Check whether /llms.txt is reachable from the published root domain.",
      "Check whether homepage JSON-LD exists in the public HTML.",
      "Check whether localized pages keep language-specific title, description, and schema context.",
    ][issues.length]);
  }

  return `Subject: 3 public AEO checks for ${row.domain}

Hi team,

I pulled the public check into a tiny fix list, so you do not have to reply just to get the useful part:

${issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")}

Here is the sample format I use for the mini audit:
https://polyglotaeo.com/audit/sample/?utm_source=outreach&utm_campaign=day3_sample

If useful, reply with the live domain you care about most and I will send the short 3-point mini audit in one note.

Best,
Jimmy`;
}

function day10Draft(row) {
  return `Subject: closing the loop on ${row.domain}

Hi team,

Closing the loop on this. The quick takeaway from my public check was: ${row.issue_1}

If multilingual AEO QA is not a priority right now, no worries. The free Polyglot AEO plugin can still help your team check schema, llms.txt, CMS gaps, and the published domain inside Framer when the next locale update ships.

Best,
Jimmy

https://polyglotaeo.com`;
}

function actionDraft(row) {
  if (row.status === "report_sent") {
    return "Review replies, bounces, and opt-outs only. Do not send another email during the 7-day report-first observation window.";
  }
  if (row.status === "report_replied") {
    return "Reply with the smallest Framer-side fix for the highest-priority finding. Do not require a call.";
  }
  if (isAgencyPartner(row) && row.subject && row.email_body) {
    return `Subject: ${row.subject}\n\n${row.email_body}`;
  }
  if (row.status === "verified") {
    return valueFirstDay0Draft(row);
  }
  if (row.status === "sent_day_0") {
    return day3Draft(row);
  }
  if (row.status === "sent_day_3") {
    return day10Draft(row);
  }
  if (row.contact_channel === "contact_page" && row.contact_form_body) {
    return `Contact form message:\n\n${row.contact_form_body}\n\nEmail fallback:\n\nSubject: ${row.subject}\n\n${row.email_body}`;
  }
  if (row.subject && row.email_body) {
    return `Subject: ${row.subject}\n\n${row.email_body}`;
  }
  return row.email_body || "";
}

function isAgencyPartner(row) {
  return (
    String(row.source || "").includes("agency") ||
    String(row.issue_1 || "").toLowerCase().startsWith("agency partner prospect:")
  );
}

function issueFragment(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "");
}

function valueFirstDay0Draft(row) {
  const issueOne = row.issue_1 || "No reachable /llms.txt was detected at the site root.";
  const issueTwo = row.issue_2 || "No visible JSON-LD schema was detected on the homepage HTML.";
  const localeText = row.locales ? ` because it appears to ship locale signals (${row.locales})` : "";

  return `Subject: 2 public AEO checks for ${row.domain}

Hi team,

I checked the public Framer site at ${row.domain}${localeText}; the main public AEO gap I saw is: ${issueFragment(issueOne)}.

The two public checks I would fix first:

1. ${issueOne}
2. ${issueTwo}

That combination can make AI/search crawlers understand the default page, while localized pages lose schema, llms.txt, or language-specific context.

If useful, I can send the short fix checklist I would use for this site.

Best,
Jimmy

https://polyglotaeo.com/audit/?utm_source=outreach&utm_campaign=value_first_day0`;
}

function renderDueMarkdown(rows, args) {
  const dueRows = rows.filter((row) => isDue(row, args.today));
  const manualRows = rows.filter((row) => row.status === "manual_review");
  const lines = [
    "# Framer Outreach Actions",
    "",
    `Date: ${args.today}`,
    `CRM: ${args.crm}`,
    "",
    "## Due Today",
    "",
  ];

  if (!dueRows.length) {
    lines.push("No due actions today.");
    lines.push("");
  } else {
    lines.push("| Domain | Status | Next action | Channel | Contact | Score |");
    lines.push("|---|---|---|---|---|---:|");
    for (const row of dueRows) {
      lines.push(
        `| ${row.domain} | ${row.status} | ${row.next_action} | ${row.contact_channel || "manual"} | ${row.contact_url || "manual"} | ${row.score || ""} |`,
      );
    }
    lines.push("");
  }

  for (const row of dueRows) {
    lines.push(`## ${row.domain}`);
    lines.push("");
    lines.push(`- Status: ${row.status}`);
    if (row.final_url) lines.push(`- URL: ${row.final_url}`);
    if (row.locales) lines.push(`- Locales: ${row.locales}`);
    lines.push(`- Channel: ${row.contact_channel || "manual"}`);
    lines.push(`- Contact: ${row.contact_url || "manual research needed"}`);
    lines.push(`- Manual check: ${row.manual_check || "Open the live site before sending."}`);
    lines.push(`- Issue: ${row.issue_1}`);
    if (row.issue_2) lines.push(`- Extra issue: ${row.issue_2}`);
    lines.push("");
    lines.push("Draft:");
    lines.push("");
    lines.push("```text");
    lines.push(actionDraft(row));
    lines.push("```");
    lines.push("");
    lines.push("After sending, update status:");
    lines.push("");
    lines.push("```bash");
    if (row.status === "queued" || row.status === "verified") {
      lines.push(`pnpm lead:crm -- --domain ${row.domain} --set-status sent_day_0`);
    } else if (row.status === "manual_review" && row.contact_channel === "contact_page") {
      lines.push(
        `pnpm lead:crm -- --domain ${row.domain} --set-status sent_day_0 --note "contact form submitted"`,
      );
    } else if (row.status === "sent_day_0") {
      lines.push(`pnpm lead:crm -- --domain ${row.domain} --set-status sent_day_3`);
    } else if (row.status === "sent_day_3") {
      lines.push(`pnpm lead:crm -- --domain ${row.domain} --set-status sent_day_10`);
    } else {
      lines.push(`pnpm lead:crm -- --domain ${row.domain} --set-status replied --note "..."`);
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("## Manual Review Backlog");
  lines.push("");
  if (!manualRows.length) {
    lines.push("No manual review leads.");
    lines.push("");
  } else {
    lines.push("| Domain | Channel | Contact | Score | Next manual step |");
    lines.push("|---|---|---|---:|---|");
    for (const row of manualRows) {
      lines.push(
        `| ${row.domain} | ${row.contact_channel || "manual"} | ${row.contact_url || "manual research needed"} | ${row.score || ""} | ${manualNextStep(row).replace(/\|/g, "/")} |`,
      );
    }
    lines.push("");
    lines.push("Run `pnpm lead:manual-review` for fetch evidence and CRM commands.");
    lines.push("");
  }

  lines.push("## Funnel");
  lines.push("");
  for (const [status, count] of statusCounts(rows)) {
    lines.push(`- ${status}: ${count}`);
  }

  return `${lines.join("\n")}\n`;
}

function manualNextStep(row) {
  if (row.contact_channel === "contact_page" && row.contact_url) {
    return "Open contact page, verify responsible person, send contact form draft if not a demo.";
  }
  return "Find human contact or mark not_fit if this is a template/demo.";
}

function statusCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.status || "unknown", (counts.get(row.status || "unknown") || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function summaryText(rows, args) {
  const dueRows = rows.filter((row) => isDue(row, args.today));
  const openRows = rows.filter((row) => !CLOSED_STATUSES.has(row.status));
  const lines = [
    `CRM: ${args.crm}`,
    `Date: ${args.today}`,
    `Total leads: ${rows.length}`,
    `Open leads: ${openRows.length}`,
    `Due today: ${dueRows.length}`,
    "Statuses:",
  ];

  for (const [status, count] of statusCounts(rows)) {
    lines.push(`  ${status}: ${count}`);
  }

  if (dueRows.length) {
    lines.push("Due domains:");
    for (const row of dueRows) {
      lines.push(`  ${row.domain} - ${row.next_action}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  let importResult = { added: 0, updated: 0 };
  let updateResult = { rows: [], changed: false };

  const crmRows = await withFileLock(args.crm, async () => {
    let lockedRows = await readCsvFile(args.crm);

    if (args.import) {
      const outreachRows = await readCsvFile(args.import);
      const result = importOutreachRows(lockedRows, outreachRows, args);
      lockedRows = result.rows;
      importResult = result;
    }

    updateResult = updateDomain(lockedRows, args);
    lockedRows = updateResult.rows;

    await writeText(args.crm, toCsv(lockedRows));
    return lockedRows;
  });
  await writeText(args.dueMd, renderDueMarkdown(crmRows, args));

  if (args.import) {
    process.stdout.write(`Imported outreach rows. Added ${importResult.added}, updated ${importResult.updated}.\n`);
  }
  if (updateResult.changed) {
    process.stdout.write(args.setStatus ? `Updated ${args.domain} to ${args.setStatus}.\n` : `Updated ${args.domain}.\n`);
  }
  if (args.summary || (!args.import && !updateResult.changed)) {
    process.stdout.write(summaryText(crmRows, args));
  }
  process.stdout.write(`Action plan: ${args.dueMd}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
