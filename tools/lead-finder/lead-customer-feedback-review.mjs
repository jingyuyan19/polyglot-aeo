#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_QUEUE = ".tmp/framer-customer-feedback-queue.json";
const DEFAULT_REVIEWS = "tools/lead-finder/customer-feedback-reviews.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-customer-feedback-review.md";
const DEFAULT_JSON = ".tmp/framer-customer-feedback-review.json";
const REVIEW_HEADERS = ["date", "campaign", "customer", "window", "status", "evidence", "note"];
const POSITIVE_REVIEW_STATUSES = new Set([
  "reply_received",
  "testimonial",
  "feature_request",
  "support_issue",
]);
const REVIEW_WINDOWS = [
  { label: "24h", offset: 1 },
  { label: "48h", offset: 2 },
  { label: "72h", offset: 3 },
  { label: "7d", offset: 7 },
];

function usage() {
  return `
Usage:
  pnpm lead:customer-feedback-review
  pnpm lead:customer-feedback-review -- --record-review --campaign ally_auditor_customer_feedback --customer "Customer Name <customer@example.com>" --window 24h --status no_reply --evidence "<gmail-search-url-or-message-id>" --note "No reply at 24h."

Options:
  --actions <file>      Action log CSV. Default: ${DEFAULT_ACTIONS}
  --queue <file>        Customer feedback queue JSON. Default: ${DEFAULT_QUEUE}
  --reviews <file>      Local review CSV. Default: ${DEFAULT_REVIEWS}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>  Review date. Default: local date.
  --record-review       Append one local review row before rendering.
  --campaign <name>     Campaign to record, e.g. ally_auditor_customer_feedback.
  --customer <text>     Customer target, usually "Name <email>".
  --window <label>      Review window: 24h, 48h, 72h, or 7d.
  --status <status>     no_reply, reply_received, testimonial, feature_request, support_issue, closed.
  --evidence <text>     Gmail message id, search evidence, or manual note.
  --note <text>         Short review note.
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    queue: DEFAULT_QUEUE,
    reviews: DEFAULT_REVIEWS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
    recordReview: false,
    status: "",
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
      "--actions": "actions",
      "--queue": "queue",
      "--reviews": "reviews",
      "--output": "output",
      "--json": "json",
      "--today": "today",
      "--campaign": "campaign",
      "--customer": "customer",
      "--window": "window",
      "--status": "status",
      "--evidence": "evidence",
      "--note": "note",
    };
    if (key === "--record-review") {
      args.recordReview = true;
      continue;
    }
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
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

async function writeRows(file, rows) {
  const csv = [
    REVIEW_HEADERS.join(","),
    ...rows.map((row) => REVIEW_HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${csv}\n`, "utf8");
}

function assertReviewArgs(args) {
  if (!args.campaign) throw new Error("--campaign is required with --record-review.");
  if (!args.customer) throw new Error("--customer is required with --record-review.");
  if (!args.window) throw new Error("--window is required with --record-review.");
  if (!REVIEW_WINDOWS.some((window) => window.label === args.window)) {
    throw new Error("--window must be one of: 24h, 48h, 72h, 7d.");
  }
  if (!args.status) throw new Error("--status is required with --record-review.");
}

function reviewFromArgs(args) {
  assertReviewArgs(args);
  return {
    date: args.today,
    campaign: args.campaign,
    customer: args.customer,
    window: args.window,
    status: args.status,
    evidence: args.evidence || "",
    note: args.note || "",
  };
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sentFeedbackActions(actionRows) {
  return actionRows
    .filter((row) => row.type === "email_send" && row.channel === "gmail" && row.status === "done")
    .filter((row) => /_customer_feedback$/i.test(row.campaign || "") || /customer feedback/i.test(`${row.campaign || ""} ${row.note || ""}`))
    .map((row, index) => ({
      ...row,
      __index: row.__index ?? index,
    }));
}

function normalizeCustomer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmail(value) {
  return String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function queueByCampaign(queue) {
  const map = new Map();
  for (const item of Array.isArray(queue?.items) ? queue.items : []) {
    if (item.campaign) map.set(item.campaign, item);
  }
  return map;
}

function reviewMatch(action, review) {
  if (review.campaign !== action.campaign) return false;
  const actionEmail = extractEmail(action.target);
  const reviewEmail = extractEmail(review.customer);
  if (actionEmail && reviewEmail) return actionEmail.toLowerCase() === reviewEmail.toLowerCase();
  return normalizeCustomer(action.target) === normalizeCustomer(review.customer);
}

function latestReviewFor(action, reviews, windowLabel = "") {
  return reviews
    .filter((review) => reviewMatch(action, review))
    .filter((review) => !windowLabel || review.window === windowLabel)
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        (b.__index ?? 0) - (a.__index ?? 0),
    )[0] || null;
}

function hasPositiveReview(action, reviews) {
  return reviews
    .filter((review) => reviewMatch(action, review))
    .some((review) => POSITIVE_REVIEW_STATUSES.has(review.status));
}

function quote(value) {
  return `"${String(value || "").replace(/"/g, '\\"')}"`;
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\"'\"'")}'`;
}

function gmailQueryFor(action, queueItem) {
  const target = action.target || "";
  const email = extractEmail(target) || queueItem?.customer_email || "";
  const domain = email.split("@")[1] || queueItem?.customer_domain || "";
  const terms = [
    email,
    domain,
    queueItem?.plugin,
    queueItem?.product,
    action.campaign,
    "feedback",
    "reply",
  ].filter(Boolean);
  return [
    "newer_than:14d",
    "-in:spam",
    "-in:trash",
    "-from:jimmymjing@gmail.com",
    `(${terms.map(quote).join(" OR ")})`,
  ].join(" ");
}

function recordCommand(action, checkpoint) {
  return [
    "pnpm lead:customer-feedback-review -- --record-review",
    `--campaign ${shellQuote(action.campaign)}`,
    `--customer ${shellQuote(action.target)}`,
    `--window ${shellQuote(checkpoint.label)}`,
    "--status no_reply",
    "--evidence '<gmail-search-or-message-id>'",
    `--note ${shellQuote(`Customer feedback ${checkpoint.label} review.`)}`,
  ].join(" ");
}

function build({ actionRows, queue, reviewRows, today }) {
  const queueMap = queueByCampaign(queue);
  const sentRows = sentFeedbackActions(actionRows);
  const rows = sentRows
    .map((action) => {
      const queueItem = queueMap.get(action.campaign) || null;
      const positive = hasPositiveReview(action, reviewRows);
      const checkpoints = REVIEW_WINDOWS.map((window) => {
        const dueDate = addDays(action.date, window.offset);
        const review = latestReviewFor(action, reviewRows, window.label);
        const due = dueDate && dueDate <= today;
        const status = review
          ? `reviewed_${review.status}`
          : positive
            ? "closed_signal_found"
            : due
              ? "due"
              : "scheduled";
        return {
          ...window,
          due_date: dueDate,
          due,
          status,
          review,
          record_command: recordCommand(action, window),
        };
      });
      const dueCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "due");
      const scheduledCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "scheduled");
      const latestReview = latestReviewFor(action, reviewRows);
      return {
        action,
        plugin: queueItem?.plugin || pluginFromCampaign(action.campaign),
        product: queueItem?.product || "",
        customer: action.target,
        sent_date: action.date,
        sent_evidence: action.evidence || "",
        gmail_query: gmailQueryFor(action, queueItem),
        latest_review: latestReview,
        checkpoints,
        due_count: dueCheckpoints.length,
        next_due_date: dueCheckpoints[0]?.due_date || scheduledCheckpoints[0]?.due_date || "",
        status: positive ? "signal_found" : dueCheckpoints.length ? "review_due" : scheduledCheckpoints.length ? "scheduled" : "review_complete",
      };
    })
    .sort(
      (a, b) =>
        b.due_count - a.due_count ||
        String(a.next_due_date || "9999-99-99").localeCompare(String(b.next_due_date || "9999-99-99")) ||
        String(b.sent_date).localeCompare(String(a.sent_date)) ||
        (b.action.__index ?? 0) - (a.action.__index ?? 0),
    );

  const due = rows.filter((row) => row.status === "review_due");
  const scheduled = rows.filter((row) => row.status === "scheduled");
  const signaled = rows.filter((row) => row.status === "signal_found");

  return {
    generated_at: new Date().toISOString(),
    today,
    status: rows.length ? (due.length ? "review_due" : "ready") : "no_sent_customer_feedback",
    sent_feedback_actions: rows.length,
    due_reviews: due.length,
    scheduled_reviews: scheduled.length,
    signal_reviews: signaled.length,
    recommendation: recommendationFor({ rows, due, scheduled, signaled }),
    rows,
  };
}

function pluginFromCampaign(campaign) {
  return String(campaign || "")
    .replace(/_customer_feedback$/i, "")
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function recommendationFor({ rows, due, scheduled, signaled }) {
  if (due.length) return `Review ${due.length} sent customer feedback email(s) before sending another customer-learning email.`;
  if (signaled.length) return "At least one customer feedback email has a positive signal. Extract wording into the plugin asset kit and action log.";
  if (scheduled.length) return `No customer feedback review is due yet. Next review date: ${scheduled[0].next_due_date}.`;
  if (!rows.length) return "No sent customer feedback email is recorded yet. Use the confirmation brief before sending.";
  return "Customer feedback reviews are complete for current sent emails.";
}

function renderMarkdown(report) {
  const lines = [
    "# Customer Feedback Review",
    "",
    `Generated: ${report.generated_at}`,
    `Today: ${report.today}`,
    `Status: ${report.status}`,
    `Sent feedback actions: ${report.sent_feedback_actions}`,
    `Due reviews: ${report.due_reviews}`,
    `Scheduled reviews: ${report.scheduled_reviews}`,
    `Signal reviews: ${report.signal_reviews}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Review Queue",
    "",
  ];

  if (!report.rows.length) {
    lines.push("No sent customer feedback emails are recorded yet.", "");
  } else {
    lines.push("| Status | Sent | Plugin | Customer | Next/due | Latest review |");
    lines.push("|---|---|---|---|---|---|");
    for (const row of report.rows) {
      lines.push(`| ${row.status} | ${row.sent_date} | ${pipe(row.plugin)} | ${pipe(row.customer)} | ${row.next_due_date || ""} | ${pipe(latestReviewText(row.latest_review))} |`);
    }
    lines.push("");
  }

  lines.push("## Checkpoints", "");
  for (const row of report.rows) {
    lines.push(`### ${row.plugin}: ${row.customer}`, "");
    lines.push(`- Sent date: ${row.sent_date}`);
    if (row.sent_evidence) lines.push(`- Sent evidence: ${row.sent_evidence}`);
    lines.push(`- Gmail review query:`);
    lines.push("");
    lines.push("```text", row.gmail_query, "```", "");
    lines.push("| Window | Due date | Status | Evidence |");
    lines.push("|---|---|---|---|");
    for (const checkpoint of row.checkpoints) {
      lines.push(`| ${checkpoint.label} | ${checkpoint.due_date} | ${checkpoint.status} | ${pipe(checkpoint.review?.evidence || "")} |`);
    }
    const dueCommands = row.checkpoints
      .filter((checkpoint) => checkpoint.status === "due")
      .map((checkpoint) => checkpoint.record_command);
    if (dueCommands.length) {
      lines.push("", "Record after checking Gmail:", "", "```bash", ...dueCommands, "```");
    }
    lines.push("");
  }

  lines.push(
    "## Safety",
    "",
    "- This report does not search Gmail, create drafts, or send email.",
    "- Gmail search remains read-only; sending still requires the exact customer feedback confirmation phrase.",
    "- Record review rows only after manually checking Gmail or after an explicit read-only Gmail sweep.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function latestReviewText(review) {
  if (!review) return "";
  return `${review.window} ${review.status}${review.date ? ` on ${review.date}` : ""}`;
}

function pipe(value) {
  return String(value || "")
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, " ")
    .trim();
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

  if (args.recordReview) {
    await withFileLock(args.reviews, async () => {
      const rows = await readRows(args.reviews);
      rows.push(reviewFromArgs(args));
      await writeRows(args.reviews, rows);
    });
  }

  const [actionRows, queue, reviewRows] = await Promise.all([
    readRows(args.actions),
    readJson(args.queue, null),
    readRows(args.reviews),
  ]);
  const report = build({
    actionRows,
    queue,
    reviewRows,
    today: args.today,
  });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Customer feedback review: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
