#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_READINESS = ".tmp/framer-day3-readiness.json";
const DEFAULT_PREFLIGHT = ".tmp/framer-followup-preflight.json";
const DEFAULT_QUEUE = ".tmp/framer-day3-gmail-queue.json";
const DEFAULT_OUTPUT = ".tmp/framer-day3-send-brief.md";
const DEFAULT_JSON = ".tmp/framer-day3-send-brief.json";
const DEFAULT_PILOT_OUTPUT = ".tmp/framer-day3-pilot-queue.md";
const DEFAULT_PILOT_JSON = ".tmp/framer-day3-pilot-queue.json";
const DEFAULT_CHUNK_SIZE = 18;
const DEFAULT_TRANCHE_SIZE = 20;

function usage() {
  return `
Usage:
  pnpm lead:day3-brief

Options:
  --crm <file>       Local CRM CSV. Default: ${DEFAULT_CRM}
  --readiness <file> Day 3 readiness JSON. Default: ${DEFAULT_READINESS}
  --preflight <file> Follow-up preflight JSON. Default: ${DEFAULT_PREFLIGHT}
  --queue <file>     Day 3 Gmail queue JSON. Default: ${DEFAULT_QUEUE}
  --today <date>     Brief date. Default: local date.
  --chunk-size <n>   Email count per Gmail query chunk. Default: ${DEFAULT_CHUNK_SIZE}
  --tranche-size <n> Recommended pilot send size. Default: ${DEFAULT_TRANCHE_SIZE}
  --output <file>    Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>      JSON output. Default: ${DEFAULT_JSON}
  --pilot-output <file> Pilot queue preview markdown. Default: ${DEFAULT_PILOT_OUTPUT}
  --pilot-json <file> Pilot queue preview JSON. Default: ${DEFAULT_PILOT_JSON}
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    readiness: DEFAULT_READINESS,
    preflight: DEFAULT_PREFLIGHT,
    queue: DEFAULT_QUEUE,
    today: todayLocal(),
    chunkSize: DEFAULT_CHUNK_SIZE,
    trancheSize: DEFAULT_TRANCHE_SIZE,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    pilotOutput: DEFAULT_PILOT_OUTPUT,
    pilotJson: DEFAULT_PILOT_JSON,
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
    if (key === "--readiness") {
      args.readiness = value;
      index += 1;
      continue;
    }
    if (key === "--preflight") {
      args.preflight = value;
      index += 1;
      continue;
    }
    if (key === "--queue") {
      args.queue = value;
      index += 1;
      continue;
    }
    if (key === "--today") {
      args.today = value;
      index += 1;
      continue;
    }
    if (key === "--chunk-size") {
      args.chunkSize = Number.parseInt(value, 10);
      if (!Number.isFinite(args.chunkSize) || args.chunkSize < 5) {
        throw new Error("--chunk-size must be an integer >= 5.");
      }
      index += 1;
      continue;
    }
    if (key === "--tranche-size") {
      args.trancheSize = Number.parseInt(value, 10);
      if (!Number.isFinite(args.trancheSize) || args.trancheSize < 1) {
        throw new Error("--tranche-size must be a positive integer.");
      }
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
    if (key === "--pilot-output") {
      args.pilotOutput = value;
      index += 1;
      continue;
    }
    if (key === "--pilot-json") {
      args.pilotJson = value;
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
  if (!rows.length) return [];
  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some((value) => value.trim()))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function gmailQuote(value) {
  return `"${String(value || "").replace(/"/g, '\\"')}"`;
}

function orGroup(values, prefix = "") {
  return values.map((value) => `${prefix}${gmailQuote(value)}`).join(" OR ");
}

function queryChunks(emails, chunkSize) {
  return chunks(emails, chunkSize).map((items, index) => {
    const fromGroup = orGroup(items, "from:");
    const toGroup = orGroup(items, "to:");
    return {
      index: index + 1,
      emails: items,
      replies: `newer_than:7d -from:me -in:spam -in:trash (${fromGroup})`,
      bounces: `newer_than:7d (from:mailer-daemon OR from:postmaster OR subject:(undelivered OR failure OR bounced OR "delivery status")) (${toGroup})`,
      unsubscribes: `newer_than:7d -from:me (unsubscribe OR "stop emailing" OR "remove me" OR opt-out) (${fromGroup})`,
    };
  });
}

function numberValue(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function revenueMonitor(readiness, preflight) {
  const source = readiness?.creem_store || preflight?.creem_store || null;
  return {
    status: source?.status || "missing",
    key_present: source?.key_present ?? null,
    new_polyglot_transactions: Number(source?.new_polyglot_transactions || 0),
    baseline_polyglot_transactions: Number(source?.baseline_polyglot_transactions || 0),
    review_needed: Boolean(source?.review_needed),
    recommendation: source?.recommendation || "Run pnpm lead:creem-store before follow-up sends when Creem API access is available.",
  };
}

function avg(values) {
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : 0;
}

function tranchePlan({ args, queue, crmRows, commandSet }) {
  const rowsByDomain = new Map(crmRows.map((row) => [row.domain, row]));
  const enriched = queue.map((item, index) => {
    const row = rowsByDomain.get(item.domain) || {};
    const fitText = [
      item.subject,
      row.issue_1,
      row.issue_2,
      row.issue_3,
      row.revenue_path,
    ].join(" ");
    return {
      queue_index: index + 1,
      action: item.action || "",
      domain: item.domain || "",
      to: item.to || "",
      subject: item.subject || "",
      variant: item.variant || "",
      score: numberValue(row.score),
      deal_value_usd: numberValue(row.deal_value_usd),
      revenue_path: row.revenue_path || "",
      fit: /agency|expert|studio|client|handoff/i.test(fitText) ? "agency_fit" : "site_fit",
      sent_check_query: item.sent_check_query || "",
      crm_update_after_sent: item.crm_update_after_sent || "",
    };
  });
  const size = Math.min(args.trancheSize, enriched.length);
  const first = enriched.slice(0, size);
  const remaining = enriched.slice(size);

  return {
    recommended_size: size,
    total_queue: enriched.length,
    first_tranche_avg_score: avg(first.map((item) => item.score)),
    remaining_avg_score: avg(remaining.map((item) => item.score)),
    first_tranche_agency_fit: first.filter((item) => item.fit === "agency_fit").length,
    first_tranche: first,
    commands: [
      `pnpm lead:gmail-queue -- --status sent_day_0 --sendpack-dir ${commandSet.queue_file} --limit ${size} --output .tmp/framer-day3-gmail-queue-pilot.md --json .tmp/framer-day3-gmail-queue-pilot.json`,
    ],
    preview_files: {
      markdown: args.pilotOutput,
      json: args.pilotJson,
    },
    recommendation: enriched.length > size
      ? `Use the first ${size} queued emails as a pilot tranche after the full same-day readiness/preflight passes; expand only after checking replies, bounces, unsubscribes, CTA/form events, and Marketplace opens.`
      : "The queue is small enough to treat as one tranche after the full same-day readiness/preflight passes.",
  };
}

function build({ args, readiness, preflight, queueData, crmRows }) {
  const queue = Array.isArray(queueData?.queue) ? queueData.queue : [];
  const targetDate = readiness?.target_date || readiness?.next_batch_date || queueData?.scheduled_send_date || "";
  const emails = unique(queue.map((item) => item.to));
  const domains = unique(queue.map((item) => item.domain));
  const sendAllowed = readiness?.send_allowed === true && preflight?.send_allowed === true;
  const notBefore = targetDate || queueData?.scheduled_send_date || "";
  const status = sendAllowed
    ? "ready_to_send"
    : targetDate && targetDate > args.today
      ? "not_due"
      : "blocked_or_needs_preflight";
  const gmailQueries = queryChunks(emails, args.chunkSize);
  const commandSet = commands({ readiness, preflight, targetDate, queueData });
  const creem = revenueMonitor(readiness, preflight);

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    status,
    send_allowed: sendAllowed,
    not_before: notBefore,
    target_date: targetDate,
    readiness: {
      verdict: readiness?.verdict || "missing",
      action_required: readiness?.action_required || "",
      recommendation: readiness?.recommendation || "",
      due_target_count: readiness?.due_target_count ?? null,
      queue_count: readiness?.queue_count ?? null,
      same_day_gmail_preflight_count: readiness?.same_day_gmail_preflight_count ?? null,
    },
    preflight: {
      verdict: preflight?.verdict || "missing",
      send_allowed: preflight?.send_allowed ?? null,
      recommendation: preflight?.recommendation || "",
      same_day_gmail_preflight_count: preflight?.same_day_gmail_preflight_count ?? null,
    },
    creem_store: creem,
    queue: {
      scheduled_send_date: queueData?.scheduled_send_date || "",
      status: queueData?.status || queueData?.sendpack_manifest?.status || "",
      next_status: queueData?.next_status || "",
      generated_at: queueData?.generated_at || "",
      sendpack_generated_at: queueData?.sendpack_manifest?.generated_at || "",
      sendpack_dir: queueData?.sendpack_dir || queueData?.sendpack_manifest?.out_dir || "",
      count: queue.length,
      domains: domains.slice(0, 20),
      sample: queue.slice(0, 8).map((item) => ({
        action: item.action,
        domain: item.domain,
        to: item.to,
        subject: item.subject,
        sent_check_query: item.sent_check_query,
        crm_update_after_sent: item.crm_update_after_sent,
      })),
    },
    gmail_queries: gmailQueries,
    revenue_query: 'newer_than:7d (from:creem.io OR from:noreply@creem.io OR subject:(sale OR payment OR receipt OR subscription)) (Polyglot OR "Polyglot AEO" OR polyglotaeo)',
    commands: commandSet,
    tranche_plan: tranchePlan({ args, queue, crmRows, commandSet }),
    stop_rules: stopRules(targetDate),
    recommendation: recommendationFor({ status, targetDate, args, readiness, preflight }),
  };
}

function commands({ readiness, preflight, targetDate, queueData }) {
  const date = targetDate || "<send-date>";
  const regenerate = readiness?.commands?.regenerate_queue || preflight?.commands?.regenerate_queue || [
    `pnpm lead:sendpack -- --status sent_day_0 --today ${date} --due-only --output .tmp/framer-day3-pack.md --html .tmp/framer-day3-pack.html --out-dir .tmp/framer-day3-pack --mark-sent .tmp/framer-mark-day3.sh`,
    "pnpm lead:gmail-queue -- --status sent_day_0 --sendpack-dir .tmp/framer-day3-pack --output .tmp/framer-day3-gmail-queue.md --json .tmp/framer-day3-gmail-queue.json",
  ];
  return {
    regenerate_queue: regenerate,
    log_gmail_preflight: readiness?.commands?.log_gmail_preflight ||
      'pnpm lead:actions -- --add --type email_monitor --channel gmail --campaign signal_sweep --status done --target "Day 3 send-day reply bounce unsubscribe revenue sweep" --evidence "<gmail-message-ids-or-query-summary>" --note "<reply/bounce/unsubscribe/revenue result summary>"',
    followup_preflight: readiness?.commands?.followup_preflight || preflight?.commands?.rerun_preflight || `pnpm lead:followup-preflight -- --today ${date}`,
    creem_store: readiness?.commands?.creem_store || preflight?.commands?.creem_store || "pnpm lead:creem-store",
    day3_readiness: `pnpm lead:day3-readiness -- --today ${date}`,
    gmail_queue: "pnpm lead:gmail-queue -- --status sent_day_0 --sendpack-dir .tmp/framer-day3-pack --output .tmp/framer-day3-gmail-queue.md --json .tmp/framer-day3-gmail-queue.json",
    after_send_review: readiness?.commands?.review_after_send || preflight?.commands?.after_send_review || [
      "pnpm lead:forms && pnpm lead:events",
      "pnpm lead:creem-store",
      "pnpm lead:signal-sweep",
      "pnpm lead:report && pnpm lead:ops",
    ],
    queue_file: queueData?.sendpack_dir || queueData?.sendpack_manifest?.out_dir || ".tmp/framer-day3-pack",
  };
}

function stopRules(targetDate) {
  return [
    `Do not send this batch before ${targetDate || "the scheduled send date"}.`,
    "Do not send until same-day Gmail reply/bounce/unsubscribe/revenue search evidence is logged.",
    "Do not send if Creem API monitor reports new or baseline Polyglot revenue candidates waiting for review.",
    "Do not send unless both lead:followup-preflight and lead:day3-readiness say send_allowed yes.",
    "If using the pilot tranche, keep the full queue/readiness evidence and only update CRM rows with Gmail SENT/message-id evidence for the emails actually sent.",
    "Do not update CRM from sent_day_0 to sent_day_3 until Gmail returns SENT/message-id evidence per row.",
    "Do not use a queue whose scheduled date, status, or count differs from the current readiness report.",
  ];
}

function recommendationFor({ status, targetDate, args, readiness, preflight }) {
  if (status === "ready_to_send") {
    return "Send only the exact queued Gmail items, then update CRM rows one by one with Gmail SENT/message-id evidence.";
  }
  if (targetDate && targetDate > args.today) {
    return `Do not send yet. This batch is prepared for ${targetDate}; rerun Gmail preflight and readiness on that date.`;
  }
  return readiness?.recommendation || preflight?.recommendation || "Refresh follow-up preflight and readiness before touching Gmail sends.";
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Day 3 Send Brief",
    "",
    `Generated: ${data.generated_at}`,
    `Today: ${data.today}`,
    `Status: ${data.status}`,
    `Send allowed: ${data.send_allowed ? "yes" : "no"}`,
    `Not before: ${data.not_before || "unknown"}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Batch",
    "",
    `- Readiness verdict: ${data.readiness.verdict}`,
    `- Readiness action: ${data.readiness.action_required || "none"}`,
    `- Follow-up preflight: ${data.preflight.verdict} (send allowed ${data.preflight.send_allowed === null ? "unknown" : data.preflight.send_allowed ? "yes" : "no"})`,
    `- Due target count: ${data.readiness.due_target_count ?? "unknown"}`,
    `- Queue count: ${data.queue.count}`,
    `- Queue status: ${data.queue.status || "unknown"}`,
    `- Next status: ${data.queue.next_status || "unknown"}`,
    `- Scheduled send date: ${data.queue.scheduled_send_date || "unknown"}`,
    `- Queue generated: ${data.queue.generated_at || "unknown"}`,
    `- Sendpack generated: ${data.queue.sendpack_generated_at || "unknown"}`,
    "",
    "## Revenue Monitor",
    "",
    `- Creem store status: ${data.creem_store.status}`,
    `- Creem API key: ${data.creem_store.key_present === null ? "unknown" : data.creem_store.key_present ? "present" : "missing"}`,
    `- New Polyglot transactions: ${data.creem_store.new_polyglot_transactions}`,
    `- Baseline Polyglot transactions: ${data.creem_store.baseline_polyglot_transactions}`,
    `- Revenue review needed: ${data.creem_store.review_needed ? "yes" : "no"}`,
    `- Recommendation: ${data.creem_store.recommendation}`,
    "",
    "## Gmail Preflight Queries",
    "",
    "Run these read-only searches on the send date, then log the evidence before any send.",
    "",
  ];

  for (const chunk of data.gmail_queries) {
    lines.push(`### Chunk ${chunk.index} (${chunk.emails.length} emails)`, "");
    lines.push("Replies:");
    lines.push("```text", chunk.replies, "```", "");
    lines.push("Bounces:");
    lines.push("```text", chunk.bounces, "```", "");
    lines.push("Unsubscribes:");
    lines.push("```text", chunk.unsubscribes, "```", "");
  }

  lines.push("Revenue signals:", "```text", data.revenue_query, "```", "");
  lines.push("Creem API monitor:", "```bash", data.commands.creem_store, "```", "");

  if (data.tranche_plan.total_queue) {
    lines.push("## Recommended Send Tranche", "");
    lines.push(data.tranche_plan.recommendation, "");
    lines.push(`- Pilot size: ${data.tranche_plan.recommended_size}/${data.tranche_plan.total_queue}`);
    lines.push(`- Pilot average CRM score: ${data.tranche_plan.first_tranche_avg_score}`);
    lines.push(`- Remaining average CRM score: ${data.tranche_plan.remaining_avg_score}`);
    lines.push(`- Pilot agency-fit subjects: ${data.tranche_plan.first_tranche_agency_fit}`);
    lines.push(`- Pilot preview: ${data.tranche_plan.preview_files.markdown}`);
    lines.push("", "Pilot queue command after full readiness passes:", "", "```bash");
    lines.push(...data.tranche_plan.commands);
    lines.push("```", "");
    lines.push("| # | Queue # | Domain | Score | Fit | Subject |");
    lines.push("|---:|---:|---|---:|---|---|");
    data.tranche_plan.first_tranche.forEach((item, index) => {
      lines.push(`| ${index + 1} | ${item.queue_index} | ${item.domain} | ${item.score} | ${item.fit} | ${pipe(item.subject)} |`);
    });
    lines.push("");
  }

  lines.push("## Send-Day Commands", "", "```bash");
  lines.push(...data.commands.regenerate_queue);
  lines.push(data.commands.creem_store);
  lines.push(data.commands.log_gmail_preflight);
  lines.push(data.commands.followup_preflight);
  lines.push(data.commands.day3_readiness);
  lines.push("```", "");

  if (data.queue.sample.length) {
    lines.push("## Queue Sample", "", "| # | Action | Domain | To | Subject |", "|---:|---|---|---|---|");
    data.queue.sample.forEach((item, index) => {
      lines.push(`| ${index + 1} | ${item.action} | ${item.domain} | ${item.to} | ${pipe(item.subject)} |`);
    });
    lines.push("");
    lines.push("First item SENT check and CRM update:");
    lines.push("```text");
    lines.push(data.queue.sample[0].sent_check_query || "");
    lines.push("```");
    lines.push("```bash");
    lines.push(data.queue.sample[0].crm_update_after_sent || "");
    lines.push("```", "");
  }

  lines.push("## After Send Review", "", "```bash", ...data.commands.after_send_review, "```", "");
  lines.push("## Stop Rules", "");
  for (const rule of data.stop_rules) lines.push(`- ${rule}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderPilotMarkdown(data) {
  const tranche = data.tranche_plan || {};
  const lines = [
    "# Framer Day 3 Pilot Queue Preview",
    "",
    `Generated: ${data.generated_at}`,
    `Today: ${data.today}`,
    `Status: ${data.status}`,
    `Send allowed: ${data.send_allowed ? "yes" : "no"}`,
    `Not before: ${data.not_before || "unknown"}`,
    `Target date: ${data.target_date || "unknown"}`,
    "",
    "## Purpose",
    "",
    "This is a local preview for the recommended pilot tranche. It is not send evidence and does not update CRM.",
    "",
    "## Pilot",
    "",
    `- Size: ${tranche.recommended_size || 0}/${tranche.total_queue || 0}`,
    `- Average CRM score: ${tranche.first_tranche_avg_score || 0}`,
    `- Remaining average CRM score: ${tranche.remaining_avg_score || 0}`,
    `- Agency-fit subjects: ${tranche.first_tranche_agency_fit || 0}`,
    "",
    "Generate the send-day pilot Gmail queue only after full readiness passes:",
    "",
    "```bash",
    ...(Array.isArray(tranche.commands) ? tranche.commands : []),
    "```",
    "",
    "## Queue Preview",
    "",
    "| # | Queue # | Action | Domain | To | Score | Fit | Subject |",
    "|---:|---:|---|---|---|---:|---|---|",
  ];

  for (const [index, item] of (tranche.first_tranche || []).entries()) {
    lines.push(`| ${index + 1} | ${item.queue_index} | ${item.action || ""} | ${item.domain || ""} | ${item.to || ""} | ${item.score ?? ""} | ${item.fit || ""} | ${pipe(item.subject)} |`);
  }

  lines.push(
    "",
    "## Stop Rules",
    "",
    "- Do not send this pilot before the scheduled date.",
    "- Do not send unless same-day Gmail reply/bounce/unsubscribe/revenue evidence is logged.",
    "- Do not send if Creem API monitor reports new or baseline Polyglot revenue candidates waiting for review.",
    "- Do not send unless both follow-up preflight and Day 3 readiness say send_allowed yes.",
    "- After sending, update only rows with Gmail SENT/message-id evidence.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
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

  const [readiness, preflight, queueData, crmRows] = await Promise.all([
    readJson(args.readiness, null),
    readJson(args.preflight, null),
    readJson(args.queue, { queue: [] }),
    readRows(args.crm),
  ]);
  const data = build({ args, readiness, preflight, queueData, crmRows });

  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
    writeText(args.pilotOutput, renderPilotMarkdown(data)),
    writeText(args.pilotJson, `${JSON.stringify(data.tranche_plan, null, 2)}\n`),
  ]);

  process.stdout.write(`Day 3 send brief: ${data.status}\n`);
  process.stdout.write(`Send allowed: ${data.send_allowed ? "yes" : "no"}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  process.stdout.write(`Pilot markdown: ${args.pilotOutput}\n`);
  process.stdout.write(`Pilot JSON: ${args.pilotJson}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
