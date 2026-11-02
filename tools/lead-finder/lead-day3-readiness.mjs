#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_QUEUE = ".tmp/framer-day3-gmail-queue.json";
const DEFAULT_FOLLOWUP_PREFLIGHT = ".tmp/framer-followup-preflight.json";
const DEFAULT_CREEM_STORE = ".tmp/framer-creem-store-monitor.json";
const DEFAULT_OUTPUT = ".tmp/framer-day3-readiness.md";
const DEFAULT_JSON = ".tmp/framer-day3-readiness.json";
const DEFAULT_STATUS = "sent_day_0";
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
  pnpm lead:day3-readiness

Options:
  --crm <file>                  Local CRM CSV. Default: ${DEFAULT_CRM}
  --actions <file>              External action log CSV. Default: ${DEFAULT_ACTIONS}
  --queue <file>                Follow-up Gmail queue JSON. Default: ${DEFAULT_QUEUE}
  --followup-preflight <file>   Follow-up preflight JSON. Default: ${DEFAULT_FOLLOWUP_PREFLIGHT}
  --creem-store <file>          Creem API transaction monitor JSON. Default: ${DEFAULT_CREEM_STORE}
  --output <file>               Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                 JSON output. Default: ${DEFAULT_JSON}
  --status <status>             CRM status to check. Default: ${DEFAULT_STATUS}
  --today <YYYY-MM-DD>          Readiness date. Default: local date.
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    actions: DEFAULT_ACTIONS,
    queue: DEFAULT_QUEUE,
    followupPreflight: DEFAULT_FOLLOWUP_PREFLIGHT,
    creemStore: DEFAULT_CREEM_STORE,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    status: DEFAULT_STATUS,
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
    if (key === "--followup-preflight") {
      args.followupPreflight = value;
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
    if (key === "--status") {
      args.status = value;
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

function statusSlug(status) {
  if (status === "sent_day_0") return "day3";
  if (status === "sent_day_3") return "day10";
  return status.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "followup";
}

function activeRowsForStatus(rows, status) {
  return rows
    .filter((row) => row.status === status && !CLOSED_STATUSES.has(row.status) && row.next_followup)
    .sort((a, b) => (a.next_followup || "").localeCompare(b.next_followup || "") || (a.domain || "").localeCompare(b.domain || ""));
}

function dueRowsForDate(rows, status, date) {
  if (!date) return [];
  return activeRowsForStatus(rows, status).filter((row) => row.next_followup <= date);
}

function sameDayGmailPreflight(actions, date) {
  return actions
    .map((row, index) => ({ ...row, __index: index }))
    .filter(
      (row) =>
        row.date === date &&
        row.type === "email_monitor" &&
        row.status === "done" &&
        /(reply|bounce|unsubscribe|signal|revenue|growth_gate|sweep)/i.test(
          [row.campaign, row.target, row.note, row.notes].filter(Boolean).join(" "),
        ),
    )
    .sort((a, b) => b.__index - a.__index);
}

function queueDomains(queueData) {
  return Array.isArray(queueData?.queue)
    ? queueData.queue.map((item) => item.domain).filter(Boolean)
    : [];
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

function revenueMonitor(creemStore, followupPreflight) {
  const source = creemStore || followupPreflight?.creem_store || null;
  const newPolyglot = Array.isArray(source?.polyglot_new_transactions)
    ? source.polyglot_new_transactions.length
    : Number(source?.new_polyglot_transactions || 0);
  const baselinePolyglot = Array.isArray(source?.baseline_polyglot_transactions)
    ? source.baseline_polyglot_transactions.length
    : Number(source?.baseline_polyglot_transactions || 0);
  const revenueCommands = Array.isArray(source?.revenue_commands)
    ? source.revenue_commands.length
    : Number(source?.revenue_commands || 0);
  const baselineReviewCommands = Array.isArray(source?.baseline_review_commands)
    ? source.baseline_review_commands.length
    : Number(source?.baseline_review_commands || 0);
  return {
    status: source?.status || "missing",
    key_present: source?.key_present ?? null,
    new_polyglot_transactions: newPolyglot,
    baseline_polyglot_transactions: baselinePolyglot,
    revenue_commands: revenueCommands,
    baseline_review_commands: baselineReviewCommands,
    review_needed: newPolyglot > 0 || baselinePolyglot > 0 || revenueCommands > 0 || baselineReviewCommands > 0,
    recommendation: source?.recommendation || "Run pnpm lead:creem-store before follow-up sends when Creem API access is available.",
  };
}

function buildCommands({ args, targetDate, slug, status }) {
  const date = targetDate || "<followup-date>";
  const prefix = `.tmp/framer-${slug}`;
  return {
    monitor: `pnpm lead:monitor -- --lookback 2 --today ${args.today}`,
    regenerate_queue: [
      `pnpm lead:sendpack -- --status ${status} --today ${date} --due-only --output ${prefix}-pack.md --html ${prefix}-pack.html --out-dir ${prefix}-pack --mark-sent .tmp/framer-mark-${slug}.sh`,
      `pnpm lead:gmail-queue -- --status ${status} --sendpack-dir ${prefix}-pack --output ${prefix}-gmail-queue.md --json ${prefix}-gmail-queue.json`,
    ],
    creem_store: "pnpm lead:creem-store",
    followup_preflight: `pnpm lead:followup-preflight -- --today ${date}`,
    log_gmail_preflight:
      'pnpm lead:actions -- --add --type email_monitor --channel gmail --campaign signal_sweep --status done --target "Day 3 send-day reply bounce unsubscribe revenue sweep" --evidence "<gmail-message-ids-or-query-summary>" --note "<reply/bounce/unsubscribe/revenue result summary>"',
    review_after_send: [
      "pnpm lead:forms",
      "pnpm lead:events",
      "pnpm lead:signal-sweep",
      "pnpm lead:report",
      "pnpm lead:ops",
    ],
  };
}

function assess({ rows, actions, queueData, followupPreflight, creemStore, args }) {
  const slug = statusSlug(args.status);
  const activeRows = activeRowsForStatus(rows, args.status);
  const nextBatchDate = activeRows[0]?.next_followup || "";
  const queueScheduledDate = scheduledDate(queueData);
  const queueStatusValue = queueStatus(queueData);
  const queueItems = Array.isArray(queueData?.queue) ? queueData.queue : [];
  const targetDate = queueScheduledDate || nextBatchDate || "";
  const dueToday = dueRowsForDate(rows, args.status, args.today);
  const dueForTarget = dueRowsForDate(rows, args.status, targetDate);
  const sameDayMonitor = targetDate ? sameDayGmailPreflight(actions, targetDate) : [];
  const domains = queueDomains(queueData);
  const duplicateDomains = duplicateValues(domains);
  const queuedDomainSet = new Set(domains);
  const missingDueDomains = dueForTarget
    .map((row) => row.domain)
    .filter((domain) => domain && !queuedDomainSet.has(domain));
  const blockers = [];
  const warnings = [];
  const creem = revenueMonitor(creemStore, followupPreflight);

  if (queueItems.length && queueStatusValue && queueStatusValue !== args.status) {
    blockers.push(`Queue status is ${queueStatusValue}, expected ${args.status}.`);
  }
  if (queueItems.length && targetDate && queueScheduledDate && queueScheduledDate !== targetDate) {
    blockers.push(`Queue scheduled date ${queueScheduledDate} does not match target date ${targetDate}.`);
  }
  if (duplicateDomains.length) {
    blockers.push(`Duplicate queued domain(s): ${duplicateDomains.join(", ")}.`);
  }
  if (queueItems.length && missingDueDomains.length) {
    blockers.push(`Queue is missing ${missingDueDomains.length} due domain(s) for ${targetDate}.`);
  }
  if (followupPreflight && targetDate && followupPreflight.scheduled_send_date && followupPreflight.scheduled_send_date !== targetDate) {
    warnings.push(`Follow-up preflight is for ${followupPreflight.scheduled_send_date}, expected ${targetDate}.`);
  }
  if (creem.review_needed) {
    blockers.push(`Creem API monitor has revenue review candidates: ${creem.new_polyglot_transactions} new Polyglot transaction(s), ${creem.baseline_polyglot_transactions} baseline Polyglot transaction(s). Review revenue before sending follow-ups.`);
  }
  if (creem.status === "missing_api_key" || creem.status === "fetch_failed" || creem.status === "missing") {
    warnings.push(`Creem API monitor is ${creem.status}; Gmail revenue sweep remains required fallback evidence before sending.`);
  }

  let verdict = "no_followups_scheduled";
  let actionRequired = "monitor";
  let sendAllowed = false;
  let recommendation = "No active follow-up rows are scheduled for this status. Keep monitoring replies, forms, CTA events, and Marketplace signals.";

  if (nextBatchDate) {
    if (nextBatchDate > args.today) {
      verdict = queueItems.length ? "not_due_queue_prepared" : "not_due_prepare_optional";
      actionRequired = "wait";
      recommendation = queueItems.length
        ? `Do not send yet. The next ${slug} batch is scheduled for ${nextBatchDate}; rerun this on the send day after Gmail reply/bounce/unsubscribe/revenue checks.`
        : `Do not send yet. The next ${slug} batch is scheduled for ${nextBatchDate}; prepare the queue only if you need an advance copy review.`;
    } else if (targetDate && targetDate < args.today) {
      verdict = "blocked_stale_or_overdue";
      actionRequired = "regenerate_queue";
      recommendation = `Do not send from the existing queue. The target date ${targetDate} is before ${args.today}; rerun monitor, regenerate the due-only pack, and rerun follow-up preflight.`;
    } else if (!queueItems.length || queueScheduledDate !== nextBatchDate || queueStatusValue !== args.status) {
      verdict = "due_needs_queue";
      actionRequired = "regenerate_queue";
      recommendation = `The ${slug} batch is due. Regenerate the due-only sendpack and Gmail queue for ${nextBatchDate}, then rerun follow-up preflight.`;
    } else if (!followupPreflight || followupPreflight.scheduled_send_date !== nextBatchDate || followupPreflight.status !== args.status) {
      verdict = "due_needs_followup_preflight";
      actionRequired = "run_followup_preflight";
      recommendation = `The ${slug} queue exists for today, but follow-up preflight is missing or stale. Run preflight before touching Gmail sends.`;
    } else if (followupPreflight.send_allowed === true) {
      verdict = "ready_to_send";
      actionRequired = "send_exact_queue";
      sendAllowed = true;
      recommendation = "Queue is send-ready after same-day Gmail preflight. Send only the queued rows, then update CRM only with Gmail SENT/message-id evidence.";
    } else if (!sameDayMonitor.length || followupPreflight.verdict === "blocked_missing_send_day_gmail_preflight") {
      verdict = "due_needs_same_day_gmail_preflight";
      actionRequired = "run_gmail_preflight";
      recommendation = "The queue is due, but same-day Gmail reply/bounce/unsubscribe/revenue evidence is missing. Do that read-only sweep and log it before sending.";
    } else if (blockers.length || String(followupPreflight.verdict || "").startsWith("blocked")) {
      verdict = "blocked_by_followup_preflight";
      actionRequired = "fix_queue";
      recommendation = followupPreflight.recommendation || "Follow-up preflight is blocking sends. Fix the queue/CRM mismatch and rerun preflight.";
    }
  }

  if (blockers.length && sendAllowed) {
    verdict = "blocked_by_readiness";
    actionRequired = "fix_queue";
    sendAllowed = false;
    recommendation = "Do not send. Fix readiness blockers, regenerate the queue if needed, and rerun follow-up preflight.";
  }

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    crm: args.crm,
    actions: args.actions,
    queue_file: args.queue,
    followup_preflight_file: args.followupPreflight,
    status: args.status,
    slug,
    verdict,
    action_required: actionRequired,
    send_allowed: sendAllowed,
    recommendation,
    next_batch_date: nextBatchDate,
    target_date: targetDate,
    active_followup_rows: activeRows.length,
    due_today_count: dueToday.length,
    due_target_count: dueForTarget.length,
    queue_scheduled_date: queueScheduledDate,
    queue_status: queueStatusValue,
    queue_count: queueItems.length,
    queue_generated_at: queueData?.generated_at || "",
    sendpack_generated_at: queueData?.sendpack_manifest?.generated_at || "",
    followup_preflight_verdict: followupPreflight?.verdict || "missing",
    followup_preflight_send_allowed: followupPreflight?.send_allowed ?? false,
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
    blockers,
    warnings,
    sample_due_domains: dueForTarget.slice(0, 12).map((row) => row.domain).filter(Boolean),
    commands: buildCommands({ args, targetDate: targetDate || nextBatchDate, slug, status: args.status }),
  };
}

function renderMarkdown(readiness) {
  const lines = [
    "# Framer Day 3 Readiness",
    "",
    `Generated: ${readiness.generated_at}`,
    `Today: ${readiness.today}`,
    `Status checked: ${readiness.status}`,
    `Verdict: ${readiness.verdict}`,
    `Send allowed: ${readiness.send_allowed ? "yes" : "no"}`,
    "",
    "## Batch",
    "",
    `- Next batch date: ${readiness.next_batch_date || "none"}`,
    `- Target date: ${readiness.target_date || "none"}`,
    `- Active follow-up rows for status: ${readiness.active_followup_rows}`,
    `- Due today: ${readiness.due_today_count}`,
    `- Due for target date: ${readiness.due_target_count}`,
    `- Queue scheduled date: ${readiness.queue_scheduled_date || "missing"}`,
    `- Queue status: ${readiness.queue_status || "missing"}`,
    `- Queue items: ${readiness.queue_count}`,
    `- Queue generated: ${readiness.queue_generated_at || "unknown"}`,
    `- Sendpack generated: ${readiness.sendpack_generated_at || "unknown"}`,
    `- Follow-up preflight: ${readiness.followup_preflight_verdict} (send allowed ${readiness.followup_preflight_send_allowed ? "yes" : "no"})`,
    `- Same-day Gmail preflight logs: ${readiness.same_day_gmail_preflight_count}`,
    "",
    "## Revenue Monitor",
    "",
    `- Creem store status: ${readiness.creem_store.status}`,
    `- Creem API key: ${readiness.creem_store.key_present === null ? "unknown" : readiness.creem_store.key_present ? "present" : "missing"}`,
    `- New Polyglot transactions: ${readiness.creem_store.new_polyglot_transactions}`,
    `- Baseline Polyglot transactions: ${readiness.creem_store.baseline_polyglot_transactions}`,
    `- Revenue review needed: ${readiness.creem_store.review_needed ? "yes" : "no"}`,
    `- Recommendation: ${readiness.creem_store.recommendation}`,
    "",
    "## Recommendation",
    "",
    readiness.recommendation,
    "",
  ];

  if (readiness.blockers.length) {
    lines.push("## Blockers", "");
    for (const blocker of readiness.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }

  if (readiness.warnings.length) {
    lines.push("## Warnings", "");
    for (const warning of readiness.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  if (readiness.sample_due_domains.length) {
    lines.push("## Sample Due Domains", "");
    for (const domain of readiness.sample_due_domains) lines.push(`- ${domain}`);
    if (readiness.due_target_count > readiness.sample_due_domains.length) {
      lines.push(`- ... ${readiness.due_target_count - readiness.sample_due_domains.length} more`);
    }
    lines.push("");
  }

  lines.push("## Required Evidence", "");
  lines.push("- Same-day Gmail reply/bounce/unsubscribe/revenue sweep logged on the target date.");
  lines.push("- Creem API monitor refreshed when an API key is available; any Polyglot revenue candidates reviewed before sending.");
  lines.push("- Follow-up preflight verdict is `ready_to_send` and `send_allowed` is `yes`.");
  lines.push("- Gmail SENT/message-id evidence for every CRM row before marking it as sent.");
  lines.push("");

  lines.push("## Commands", "", "```bash");
  lines.push(readiness.commands.monitor);
  lines.push(readiness.commands.creem_store);
  if (["regenerate_queue", "fix_queue"].includes(readiness.action_required)) {
    lines.push(...readiness.commands.regenerate_queue);
  }
  if (["regenerate_queue", "run_followup_preflight", "fix_queue"].includes(readiness.action_required)) {
    lines.push(readiness.commands.followup_preflight);
  }
  if (readiness.action_required === "run_gmail_preflight") {
    lines.push(readiness.commands.log_gmail_preflight);
    lines.push(readiness.commands.followup_preflight);
  }
  if (readiness.action_required === "send_exact_queue") {
    lines.push(...readiness.commands.review_after_send);
  }
  lines.push("```", "");

  lines.push("## Send Rules", "");
  lines.push("- Do not send when `Send allowed` is `no`.");
  lines.push("- Do not send when Creem monitor has new or baseline Polyglot revenue candidates waiting for review.");
  lines.push("- Do not use an old queue if the target date or status does not match.");
  lines.push("- Do not mark CRM rows sent until Gmail has a SENT/message id or explicit manual evidence.");
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

  const [rows, actions, queueData, followupPreflight, creemStore] = await Promise.all([
    readRows(args.crm),
    readRows(args.actions),
    readJson(args.queue, { queue: [] }),
    readJson(args.followupPreflight, null),
    readJson(args.creemStore, null),
  ]);
  const readiness = assess({ rows, actions, queueData, followupPreflight, creemStore, args });

  await Promise.all([
    writeText(args.output, renderMarkdown(readiness)),
    writeText(args.json, `${JSON.stringify(readiness, null, 2)}\n`),
  ]);

  process.stdout.write(`Day 3 readiness: ${readiness.verdict}\n`);
  process.stdout.write(`Send allowed: ${readiness.send_allowed ? "yes" : "no"}\n`);
  process.stdout.write(`Recommendation: ${readiness.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
