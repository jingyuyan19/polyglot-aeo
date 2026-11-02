#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_PENDING = ".tmp/framer-gmail-pending.md";
const DEFAULT_SENDPACK_DIR = ".tmp/framer-value-first-reserve-pack";
const DEFAULT_OUTPUT = ".tmp/framer-gmail-queue.md";
const DEFAULT_JSON = ".tmp/framer-gmail-queue.json";
const DEFAULT_STATUS = "reserve";
const DEFAULT_VARIANT = "";
const DEFAULT_NEXT_STATUS = "";
const DEFAULT_LIMIT = 0;
const DEFAULT_MAX_SENDPACK_AGE_MS = 15 * 60 * 1000;
const SENDPACK_MANIFEST = ".sendpack-manifest.json";
const BLOCKED_QUEUE_STATUSES = new Set([
  "bounced",
  "manual_review",
  "not_fit",
  "no_reply_closed",
  "report_sent",
  "report_replied",
  "report_closed",
  "unsubscribed",
]);

function usage() {
  return `
Usage:
  pnpm lead:gmail-queue

Options:
  --crm <file>             Local CRM CSV. Default: ${DEFAULT_CRM}
  --pending <file>         Pending Gmail markdown. Default: ${DEFAULT_PENDING}
  --sendpack-dir <dir>     Per-lead .txt sendpack directory. Default: ${DEFAULT_SENDPACK_DIR}
  --output <file>          Markdown queue output. Default: ${DEFAULT_OUTPUT}
  --json <file>            Machine-readable queue output. Default: ${DEFAULT_JSON}
  --status <status>        CRM status to queue for new drafts. Default: ${DEFAULT_STATUS}
  --next-status <status>   CRM status after successful send. Default: inferred from --status.
  --variant <variant>      Outreach variant note for Day 0 CRM commands. Default: value-first for reserve, blank otherwise.
  --limit <number>         Maximum queue items to output. Default: no limit.
  --include-pending-drafts Include Gmail drafts from --pending. Default: only for Day 0 queues.
  --allow-stale-sendpack   Allow sendpack files generated more than 15 minutes ago.
  --max-sendpack-age-ms <n> Maximum sendpack manifest age. Default: ${DEFAULT_MAX_SENDPACK_AGE_MS}.
  --help                   Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    pending: DEFAULT_PENDING,
    sendpackDir: DEFAULT_SENDPACK_DIR,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    status: DEFAULT_STATUS,
    variant: DEFAULT_VARIANT,
    nextStatus: DEFAULT_NEXT_STATUS,
    limit: DEFAULT_LIMIT,
    includePendingDrafts: null,
    allowStaleSendpack: false,
    maxSendpackAgeMs: DEFAULT_MAX_SENDPACK_AGE_MS,
    sendpackDirProvided: false,
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
    if (key === "--pending") {
      args.pending = value;
      index += 1;
      continue;
    }
    if (key === "--sendpack-dir") {
      args.sendpackDir = value;
      args.sendpackDirProvided = true;
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
    if (key === "--next-status") {
      args.nextStatus = value;
      index += 1;
      continue;
    }
    if (key === "--variant") {
      args.variant = value;
      index += 1;
      continue;
    }
    if (key === "--limit") {
      args.limit = Number.parseInt(value, 10);
      if (!Number.isFinite(args.limit) || args.limit < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      index += 1;
      continue;
    }
    if (key === "--include-pending-drafts") {
      args.includePendingDrafts = true;
      continue;
    }
    if (key === "--allow-stale-sendpack") {
      args.allowStaleSendpack = true;
      continue;
    }
    if (key === "--max-sendpack-age-ms") {
      args.maxSendpackAgeMs = Number.parseInt(value, 10);
      if (!Number.isFinite(args.maxSendpackAgeMs) || args.maxSendpackAgeMs < 0) {
        throw new Error("--max-sendpack-age-ms must be a non-negative integer.");
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  if (!args.sendpackDirProvided) {
    args.sendpackDir = defaultSendpackDirForStatus(args.status);
  }
  if (BLOCKED_QUEUE_STATUSES.has(args.status)) {
    throw new Error(`Refusing to build a Gmail queue for non-sendable CRM status: ${args.status}.`);
  }
  if (!args.nextStatus) {
    args.nextStatus = inferNextStatus(args.status);
  }
  if (!args.variant && args.nextStatus === "sent_day_0") {
    args.variant = "value-first";
  }
  if (args.includePendingDrafts === null) {
    args.includePendingDrafts = args.nextStatus === "sent_day_0";
  }

  return args;
}

function defaultSendpackDirForStatus(status) {
  if (status === "queued") return ".tmp/framer-queued-pack";
  if (status === "verified") return ".tmp/framer-send-pack";
  return DEFAULT_SENDPACK_DIR;
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

function futureScheduleWarning(manifest) {
  const scheduledDate = manifest.today || "";
  const today = todayLocal();
  if (!manifest.due_only || !scheduledDate || scheduledDate <= today) {
    return "";
  }
  return `Prepared ahead for ${scheduledDate}. Do not send these Gmail items before ${scheduledDate}; rerun Gmail reply/bounce/unsubscribe preflight on the send day.`;
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function readSendpackManifest(args) {
  const manifestFile = path.join(args.sendpackDir, SENDPACK_MANIFEST);
  const text = await readText(manifestFile);
  if (!text) {
    throw new Error(
      `Missing sendpack manifest: ${manifestFile}. Regenerate the sendpack with pnpm lead:sendpack before running lead:gmail-queue.`,
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new Error(`Invalid sendpack manifest JSON: ${manifestFile}`);
  }

  if (manifest.status && manifest.status !== args.status) {
    throw new Error(
      `Sendpack status mismatch: manifest has ${manifest.status}, but lead:gmail-queue was called with ${args.status}.`,
    );
  }

  const generatedAt = Date.parse(manifest.generated_at || "");
  if (!Number.isFinite(generatedAt)) {
    throw new Error(`Sendpack manifest is missing a valid generated_at: ${manifestFile}`);
  }

  const manifestStat = await stat(manifestFile);
  const ageMs = Date.now() - generatedAt;
  if (!args.allowStaleSendpack && ageMs > args.maxSendpackAgeMs) {
    throw new Error(
      `Sendpack manifest is stale (${Math.round(ageMs / 1000)}s old): ${manifestFile}. Regenerate lead:sendpack immediately before lead:gmail-queue, or pass --allow-stale-sendpack for manual recovery.`,
    );
  }

  return {
    ...manifest,
    manifest_file: manifestFile,
    manifest_mtime: manifestStat.mtime.toISOString(),
    age_ms: ageMs,
  };
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
    .filter((record) => record.some(Boolean))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

function contactEmail(row) {
  const contact = row.contact_url || "";
  const mailto = contact.match(/mailto:([^?\s]+)/i)?.[1];
  return mailto ? decodeURIComponent(mailto) : "";
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseEmailText(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const first = lines[0] || "";
  const subject = first.startsWith("Subject: ") ? first.slice("Subject: ".length).trim() : "";
  const body = lines.slice(subject ? 2 : 0).join("\n").trim();
  return { subject, body };
}

function parsePending(text) {
  const pending = [];
  let inDrafts = false;
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## Draft Created, Send Not Confirmed")) {
      inDrafts = true;
      current = null;
      continue;
    }
    if (line.startsWith("## ") && !line.startsWith("## Draft Created, Send Not Confirmed")) {
      inDrafts = false;
      current = null;
      continue;
    }
    if (!inDrafts) continue;
    if (line.trim() === "None.") continue;

    const itemMatch = line.match(/^- ([a-z0-9.-]+\.[a-z0-9.-]+)/i);
    if (itemMatch) {
      current = { domain: itemMatch[1] };
      pending.push(current);
      continue;
    }

    const fieldMatch = line.match(/^\s+- ([^:]+):\s*(.+)$/);
    if (fieldMatch && current) {
      const key = fieldMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      current[key] = fieldMatch[2].trim();
    }
  }

  return pending.filter((item) => item.gmail_draft_id);
}

async function buildQueue(args) {
  const sendpackManifest = await readSendpackManifest(args);
  const crmRows = parseCsv(await readText(args.crm));
  const pendingDrafts = parsePending(await readText(args.pending));
  const rowsByDomain = new Map(crmRows.map((row) => [row.domain, row]));
  const manifestFilesByDomain = new Map(
    (sendpackManifest.files || []).map((file) => [file.domain, file]),
  );
  const queuedDomains = new Set();
  const queue = [];

  if (args.includePendingDrafts) {
    for (const draft of pendingDrafts) {
      const row = rowsByDomain.get(draft.domain) || {};
      if (row.status && row.status !== args.status) {
        continue;
      }
      const variant = draft.variant || variantForDomain(draft.domain, args, manifestFilesByDomain);
      queuedDomains.add(draft.domain);
      queue.push({
        action: "send_existing_draft",
        domain: draft.domain,
        to: draft.to || contactEmail(row),
        subject: draft.subject || "",
        variant,
        draft_id: draft.gmail_draft_id,
        draft_message_id: draft.gmail_draft_message_id || "",
        thread_id: draft.gmail_thread_id || "",
        crm_status: row.status || "",
        sent_check_query: sentCheckQuery(draft.to || contactEmail(row), draft.subject || ""),
        crm_update_after_sent: crmCommand(draft.domain, args, variant),
      });
    }
  }

  if (args.nextStatus === "sent_day_0") {
    for (const row of crmRows) {
      if (row.status !== args.status || row.contact_channel !== "email") continue;
      if (queuedDomains.has(row.domain)) continue;

      const draftId = existingDraftId(row);
      if (!draftId) continue;

      const to = contactEmail(row);
      if (!to) continue;

      const variant = variantForDomain(row.domain, args, manifestFilesByDomain);
      queuedDomains.add(row.domain);
      queue.push({
        action: "send_existing_draft",
        domain: row.domain,
        to,
        subject: row.subject || "",
        variant,
        draft_id: draftId,
        crm_status: row.status || "",
        sent_check_query: sentCheckQuery(to, row.subject || ""),
        crm_update_after_sent: crmCommand(row.domain, args, variant),
      });
    }
  }

  for (const row of crmRows) {
    if (row.status !== args.status || row.contact_channel !== "email") continue;
    if (queuedDomains.has(row.domain)) continue;

    const to = contactEmail(row);
    if (!to) continue;

    const sendpackFile = path.join(args.sendpackDir, `${slug(row.domain)}.txt`);
    const text = await readText(sendpackFile);
    if (!text) continue;

    const email = parseEmailText(text);
    const variant = variantForDomain(row.domain, args, manifestFilesByDomain);
    queue.push({
      action: "create_draft_then_send",
      domain: row.domain,
      to,
      subject: email.subject,
      body: email.body,
      variant,
      sendpack_file: sendpackFile,
      crm_status: row.status,
      sent_check_query: sentCheckQuery(to, email.subject),
      crm_update_after_sent: crmCommand(row.domain, args, variant),
    });
  }

  const queueTotal = queue.length;
  const limitedQueue = args.limit ? queue.slice(0, args.limit) : queue;

  return {
    generated_at: new Date().toISOString(),
    crm: args.crm,
    pending: args.pending,
    sendpack_dir: args.sendpackDir,
    status: args.status,
    next_status: args.nextStatus,
    variant: args.variant,
    limit: args.limit,
    queue_total_before_limit: queueTotal,
    include_pending_drafts: args.includePendingDrafts,
    sendpack_manifest: sendpackManifest,
    scheduled_send_date: sendpackManifest.today || "",
    future_schedule_warning: futureScheduleWarning(sendpackManifest),
    queue: limitedQueue,
  };
}

function existingDraftId(row) {
  const notes = String(row.reply_notes || "");
  const match = notes.match(/gmail draft created\s+([^;\s]+)/i);
  return match?.[1] || "";
}

function inferNextStatus(status) {
  if (status === "report_ready") return "report_sent";
  if (status === "sent_day_0") return "sent_day_3";
  if (status === "sent_day_3") return "sent_day_10";
  return "sent_day_0";
}

function variantForDomain(domain, args, manifestFilesByDomain) {
  return manifestFilesByDomain.get(domain)?.variant || args.variant;
}

function crmCommand(domain, args, variant) {
  const note =
    args.nextStatus === "report_sent"
      ? "outreach variant:report-first-v1; inline report body; no attachment; gmail sent id <message_id>"
      : args.nextStatus === "sent_day_0" && variant
      ? `outreach variant:${variant}; gmail sent id <message_id>`
      : "gmail sent id <message_id>";
  return `pnpm lead:crm -- --domain ${domain} --set-status ${args.nextStatus} --note "${note}"`;
}

function gmailEscape(value) {
  return String(value || "").replace(/"/g, '\\"');
}

function sentCheckQuery(to, subject) {
  return `to:${to} subject:"${gmailEscape(subject)}" in:sent newer_than:30d`;
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Gmail Queue",
    "",
    `Generated: ${data.generated_at}`,
    `CRM: ${data.crm}`,
    `Pending: ${data.pending}`,
    `Sendpack: ${data.sendpack_dir}`,
    `Sendpack generated: ${data.sendpack_manifest.generated_at}`,
    `Sendpack manifest: ${data.sendpack_manifest.manifest_file}`,
    `Status filter: ${data.status}`,
    `Next status after SENT: ${data.next_status}`,
    `Variant: ${data.variant}`,
    `Limit: ${data.limit || "none"}`,
    `Queue total before limit: ${data.queue_total_before_limit}`,
    `Include pending drafts: ${data.include_pending_drafts ? "yes" : "no"}`,
    data.scheduled_send_date ? `Scheduled send date: ${data.scheduled_send_date}` : "",
    "",
    "Use this queue with the Gmail connector. Only run the CRM command after Gmail returns a SENT/message id.",
    "",
  ];
  if (data.future_schedule_warning) {
    lines.push("## Not Before", "", data.future_schedule_warning, "");
  }

  if (!data.queue.length) {
    lines.push("No Gmail send items queued.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| # | Action | Domain | To | Subject |");
  lines.push("|---:|---|---|---|---|");
  data.queue.forEach((item, index) => {
    lines.push(`| ${index + 1} | ${item.action} | ${item.domain} | ${item.to} | ${item.subject} |`);
  });
  lines.push("");

  data.queue.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.domain}`);
    lines.push("");
    lines.push(`- Action: ${item.action}`);
    lines.push(`- To: ${item.to}`);
    lines.push(`- Subject: ${item.subject}`);
    if (item.draft_id) lines.push(`- Draft id: ${item.draft_id}`);
    if (item.sendpack_file) lines.push(`- Sendpack file: ${item.sendpack_file}`);
    if (item.sent_check_query) lines.push(`- Sent check: \`${item.sent_check_query}\``);
    lines.push("- After SENT:");
    lines.push("");
    lines.push("```bash");
    lines.push(item.crm_update_after_sent);
    lines.push("```");
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

async function writeOutputs(data, args) {
  await mkdir(path.dirname(args.output), { recursive: true });
  await mkdir(path.dirname(args.json), { recursive: true });
  await writeFile(args.output, renderMarkdown(data), "utf8");
  await writeFile(args.json, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const data = await buildQueue(args);
  await writeOutputs(data, args);

  process.stdout.write(`Queued Gmail send items: ${data.queue.length}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  for (const item of data.queue) {
    process.stdout.write(`- ${item.action}: ${item.domain} -> ${item.to}\n`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
