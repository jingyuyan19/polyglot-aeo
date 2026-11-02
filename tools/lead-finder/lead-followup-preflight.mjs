#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_QUEUE = ".tmp/framer-day3-gmail-queue.json";
const DEFAULT_CREEM_STORE = ".tmp/framer-creem-store-monitor.json";
const DEFAULT_OUTPUT = ".tmp/framer-followup-preflight.md";
const DEFAULT_JSON = ".tmp/framer-followup-preflight.json";
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
  pnpm lead:followup-preflight

Options:
  --crm <file>       Local CRM CSV. Default: ${DEFAULT_CRM}
  --actions <file>   External action log CSV. Default: ${DEFAULT_ACTIONS}
  --queue <file>     Gmail queue JSON. Default: ${DEFAULT_QUEUE}
  --creem-store <file> Creem API transaction monitor JSON. Default: ${DEFAULT_CREEM_STORE}
  --output <file>    Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>      JSON output. Default: ${DEFAULT_JSON}
  --today <date>     Preflight date. Default: local date.
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    actions: DEFAULT_ACTIONS,
    queue: DEFAULT_QUEUE,
    creemStore: DEFAULT_CREEM_STORE,
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
    if (key === "--crm") {
      args.crm = value;
      index += 1;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--queue") {
      args.queue = value;
      index += 1;
      continue;
    }
    if (key === "--creem-store") {
      args.creemStore = value;
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

function scheduledDate(queueData) {
  return queueData?.scheduled_send_date || queueData?.sendpack_manifest?.today || "";
}

function queueStatus(queueData) {
  return queueData?.status || queueData?.sendpack_manifest?.status || "";
}

function nextStatus(queueData) {
  return queueData?.next_status || "";
}

function isDueForQueue(row, status, scheduled) {
  return (
    row.status === status &&
    !CLOSED_STATUSES.has(row.status) &&
    Boolean(row.next_followup) &&
    row.next_followup <= scheduled
  );
}

function sameDayGmailPreflight(actions, date) {
  return actions
    .map((row, index) => ({ ...row, __index: index }))
    .filter(
      (row) =>
        row.date === date &&
        row.type === "email_monitor" &&
        row.status === "done" &&
        /(reply|bounce|unsubscribe|signal|revenue|growth_gate)/i.test(
          [row.campaign, row.target, row.note, row.notes].filter(Boolean).join(" "),
        ),
    )
    .sort((a, b) => b.__index - a.__index);
}

function revenueMonitor(creemStore) {
  const newPolyglotTransactions = Array.isArray(creemStore?.polyglot_new_transactions)
    ? creemStore.polyglot_new_transactions
    : [];
  const baselinePolyglotTransactions = Array.isArray(creemStore?.baseline_polyglot_transactions)
    ? creemStore.baseline_polyglot_transactions
    : [];
  const revenueCommands = Array.isArray(creemStore?.revenue_commands) ? creemStore.revenue_commands : [];
  const baselineReviewCommands = Array.isArray(creemStore?.baseline_review_commands)
    ? creemStore.baseline_review_commands
    : [];
  const reviewNeeded = newPolyglotTransactions.length > 0 ||
    baselinePolyglotTransactions.length > 0 ||
    revenueCommands.length > 0 ||
    baselineReviewCommands.length > 0;
  return {
    status: creemStore?.status || "missing",
    recommendation: creemStore?.recommendation || "Run pnpm lead:creem-store before follow-up sends when Creem API access is available.",
    key_present: creemStore?.key_present ?? null,
    new_polyglot_transactions: newPolyglotTransactions.length,
    baseline_polyglot_transactions: baselinePolyglotTransactions.length,
    revenue_commands: revenueCommands.length,
    baseline_review_commands: baselineReviewCommands.length,
    review_needed: reviewNeeded,
  };
}

function assess({ rows, actions, queueData, creemStore, args }) {
  const queue = Array.isArray(queueData?.queue) ? queueData.queue : [];
  const scheduled = scheduledDate(queueData);
  const status = queueStatus(queueData);
  const creem = revenueMonitor(creemStore);
  const crmByDomain = new Map(rows.map((row) => [row.domain, row]));
  const dueRows = scheduled && status
    ? rows.filter((row) => isDueForQueue(row, status, scheduled))
    : [];
  const queueDomains = queue.map((item) => item.domain).filter(Boolean);
  const duplicateDomains = duplicateValues(queueDomains);
  const queuedDomainSet = new Set(queueDomains);
  const missingDueDomains = dueRows
    .map((row) => row.domain)
    .filter((domain) => !queuedDomainSet.has(domain));
  const sameDayMonitor = scheduled ? sameDayGmailPreflight(actions, scheduled) : [];
  const rowIssues = queue.flatMap((item) => issuesForItem(item, crmByDomain, status, scheduled));
  const countMismatch = queueData?.limit
    ? false
    : dueRows.length !== queue.length || missingDueDomains.length > 0;
  const blockers = [];
  const warnings = [];

  if (!scheduled) blockers.push("Queue is missing scheduled_send_date/sendpack_manifest.today.");
  if (!status) blockers.push("Queue is missing CRM status.");
  if (!queue.length) blockers.push("Queue has no items.");
  if (duplicateDomains.length) blockers.push(`Duplicate queued domain(s): ${duplicateDomains.join(", ")}.`);
  if (rowIssues.length) blockers.push(`${rowIssues.length} queued row issue(s).`);
  if (countMismatch) {
    blockers.push(`Queue count ${queue.length} does not match due CRM count ${dueRows.length}.`);
  }
  if (creem.review_needed) {
    blockers.push(`Creem API monitor has revenue review candidates: ${creem.new_polyglot_transactions} new Polyglot transaction(s), ${creem.baseline_polyglot_transactions} baseline Polyglot transaction(s). Review the revenue ledger before sending follow-ups.`);
  }
  const creemWeak = creem.status === "missing_api_key" || creem.status === "fetch_failed" || creem.status === "missing";
  if (creemWeak) {
    warnings.push(`Creem API monitor is ${creem.status}; Gmail revenue sweep remains required fallback evidence before sending.`);
  }

  let verdict = "ready_to_send";
  let sendAllowed = true;
  if (blockers.length) {
    verdict = creem.review_needed ? "blocked_revenue_review" : "blocked_bad_queue";
    sendAllowed = false;
  } else if (scheduled > args.today) {
    verdict = "not_due";
    sendAllowed = false;
  } else if (scheduled < args.today) {
    verdict = "blocked_stale_queue";
    sendAllowed = false;
  } else if (!sameDayMonitor.length) {
    verdict = "blocked_missing_send_day_gmail_preflight";
    sendAllowed = false;
  }

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    crm: args.crm,
    actions: args.actions,
    queue_file: args.queue,
    scheduled_send_date: scheduled,
    status,
    next_status: nextStatus(queueData),
    queue_generated_at: queueData?.generated_at || "",
    sendpack_generated_at: queueData?.sendpack_manifest?.generated_at || "",
    sendpack_dir: queueData?.sendpack_dir || queueData?.sendpack_manifest?.out_dir || "",
    queue_count: queue.length,
    due_crm_count: dueRows.length,
    same_day_gmail_preflight_count: sameDayMonitor.length,
    same_day_gmail_preflight_evidence: sameDayMonitor.map((row) => ({
      date: row.date,
      campaign: row.campaign,
      target: row.target,
      evidence: row.evidence,
    })),
    creem_store_file: args.creemStore,
    creem_store: creem,
    duplicate_domains: duplicateDomains,
    missing_due_domains: missingDueDomains,
    row_issues: rowIssues,
    blockers,
    warnings,
    verdict,
    send_allowed: sendAllowed,
    recommendation: recommendationFor({ verdict, scheduled, status }),
    commands: commandPlan({ scheduled, status }),
  };
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates).sort();
}

function issuesForItem(item, crmByDomain, status, scheduled) {
  const issues = [];
  const row = crmByDomain.get(item.domain);
  if (!item.domain) {
    issues.push({ domain: "", issue: "missing_domain" });
    return issues;
  }
  if (!row) {
    issues.push({ domain: item.domain, issue: "domain_not_found_in_crm" });
    return issues;
  }
  if (CLOSED_STATUSES.has(row.status)) {
    issues.push({ domain: item.domain, issue: `closed_status:${row.status}` });
  }
  if (status && row.status !== status) {
    issues.push({ domain: item.domain, issue: `status_mismatch:${row.status}` });
  }
  if (scheduled && (!row.next_followup || row.next_followup > scheduled)) {
    issues.push({ domain: item.domain, issue: `not_due_until:${row.next_followup || "missing"}` });
  }
  if (!item.to) {
    issues.push({ domain: item.domain, issue: "missing_recipient" });
  }
  if (!item.subject) {
    issues.push({ domain: item.domain, issue: "missing_subject" });
  }
  if (!item.body) {
    issues.push({ domain: item.domain, issue: "missing_body" });
  }
  return issues;
}

function recommendationFor({ verdict, scheduled, status }) {
  if (verdict === "not_due") {
    return `Do not send yet. This ${status || "follow-up"} queue is scheduled for ${scheduled}; rerun Gmail reply/bounce/unsubscribe preflight on that date.`;
  }
  if (verdict === "blocked_stale_queue") {
    return `Queue date ${scheduled} is in the past. Regenerate sendpack and Gmail queue for today's due rows before sending.`;
  }
  if (verdict === "blocked_missing_send_day_gmail_preflight") {
    return "Do not send until today's Gmail reply, bounce, unsubscribe, and revenue sweep has been completed and logged.";
  }
  if (verdict === "blocked_revenue_review") {
    return "Do not send. Creem API monitor has Polyglot revenue candidates waiting for manual review; update the revenue ledger or clear the candidates, then rerun preflight.";
  }
  if (verdict === "blocked_bad_queue") {
    return "Do not send. Fix the queue/CRM mismatches, regenerate the sendpack and Gmail queue, then rerun this preflight.";
  }
  return "Queue is send-ready after same-day Gmail preflight. Send only these queued rows, then mark sent only with Gmail SENT/message-id evidence.";
}

function commandPlan({ scheduled, status }) {
  const date = scheduled || "<scheduled-date>";
  const queueStatusValue = status || "sent_day_0";
  return {
    refresh_monitor: "pnpm lead:monitor -- --lookback 2",
    regenerate_queue: [
      `pnpm lead:sendpack -- --status ${queueStatusValue} --today ${date} --due-only --output .tmp/framer-day3-pack.md --html .tmp/framer-day3-pack.html --out-dir .tmp/framer-day3-pack --mark-sent .tmp/framer-mark-day3.sh`,
      `pnpm lead:gmail-queue -- --status ${queueStatusValue} --sendpack-dir .tmp/framer-day3-pack --output .tmp/framer-day3-gmail-queue.md --json .tmp/framer-day3-gmail-queue.json`,
    ],
    creem_store: "pnpm lead:creem-store",
    rerun_preflight: `pnpm lead:followup-preflight -- --today ${date}`,
    after_send_review: [
      "pnpm lead:events && pnpm lead:forms",
      "pnpm lead:report && pnpm lead:ops",
    ],
  };
}

function renderMarkdown(review) {
  const lines = [
    "# Framer Follow-Up Preflight",
    "",
    `Generated: ${review.generated_at}`,
    `Today: ${review.today}`,
    `Verdict: ${review.verdict}`,
    `Send allowed: ${review.send_allowed ? "yes" : "no"}`,
    "",
    "## Queue",
    "",
    `- Queue file: ${review.queue_file}`,
    `- Scheduled send date: ${review.scheduled_send_date || "unknown"}`,
    `- Queue generated: ${review.queue_generated_at || "unknown"}`,
    `- Sendpack generated: ${review.sendpack_generated_at || "unknown"}`,
    `- Sendpack dir: ${review.sendpack_dir || "unknown"}`,
    `- CRM status: ${review.status || "unknown"}`,
    `- Next status: ${review.next_status || "unknown"}`,
    `- Queue items: ${review.queue_count}`,
    `- Due CRM rows for schedule: ${review.due_crm_count}`,
    `- Same-day Gmail preflight logs: ${review.same_day_gmail_preflight_count}`,
    "",
    "## Revenue Monitor",
    "",
    `- Creem store status: ${review.creem_store.status}`,
    `- Creem API key: ${review.creem_store.key_present === null ? "unknown" : review.creem_store.key_present ? "present" : "missing"}`,
    `- New Polyglot transactions: ${review.creem_store.new_polyglot_transactions}`,
    `- Baseline Polyglot transactions: ${review.creem_store.baseline_polyglot_transactions}`,
    `- Revenue review needed: ${review.creem_store.review_needed ? "yes" : "no"}`,
    `- Recommendation: ${review.creem_store.recommendation}`,
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
  ];

  if (review.blockers.length) {
    lines.push("## Blockers", "");
    for (const blocker of review.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }

  if (review.warnings.length) {
    lines.push("## Warnings", "");
    for (const warning of review.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  if (review.row_issues.length) {
    lines.push("## Row Issues", "");
    lines.push("| Domain | Issue |");
    lines.push("|---|---|");
    for (const issue of review.row_issues.slice(0, 30)) {
      lines.push(`| ${issue.domain || ""} | ${issue.issue} |`);
    }
    if (review.row_issues.length > 30) {
      lines.push(`| ... | ${review.row_issues.length - 30} more issue(s) |`);
    }
    lines.push("");
  }

  if (review.missing_due_domains.length) {
    lines.push("## Missing Due Domains", "");
    for (const domain of review.missing_due_domains.slice(0, 30)) lines.push(`- ${domain}`);
    if (review.missing_due_domains.length > 30) {
      lines.push(`- ... ${review.missing_due_domains.length - 30} more`);
    }
    lines.push("");
  }

  lines.push("## Commands", "", "```bash");
  lines.push(review.commands.refresh_monitor);
  lines.push(review.commands.creem_store);
  lines.push(...review.commands.regenerate_queue);
  lines.push(review.commands.rerun_preflight);
  lines.push(...review.commands.after_send_review);
  lines.push("```", "");

  lines.push("## Send Rules", "");
  lines.push("- Do not send before `Scheduled send date`.");
  lines.push("- Do not send when `Send allowed` is `no`.");
  lines.push("- Rerun Gmail reply/bounce/unsubscribe/revenue preflight on the scheduled date.");
  lines.push("- Run `pnpm lead:creem-store`; if it reports new or baseline Polyglot transactions, review revenue before sending.");
  lines.push("- Mark CRM rows as sent only after Gmail returns SENT/message-id evidence.");
  lines.push("");

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

  const [rows, actions, queueData, creemStore] = await Promise.all([
    readRows(args.crm),
    readRows(args.actions),
    readJson(args.queue, { queue: [] }),
    readJson(args.creemStore, null),
  ]);
  const review = assess({ rows, actions, queueData, creemStore, args });

  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Follow-up preflight: ${review.verdict}\n`);
  process.stdout.write(`Send allowed: ${review.send_allowed ? "yes" : "no"}\n`);
  process.stdout.write(`Recommendation: ${review.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
