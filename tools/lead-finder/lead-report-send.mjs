#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { withFileLock } from "./file-lock.mjs";
import { loadLocalEnv } from "./local-env.mjs";
import {
  emailMatchesSiteDomain,
  isCompanyDomainEmail,
  isOutreachMailbox,
} from "./public-audit-lib.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_PILOT = ".tmp/polyglot-report-pilot.json";
const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_PREFLIGHT = ".tmp/polyglot-report-sender-preflight.json";
const DEFAULT_REVIEW = ".tmp/polyglot-report-send-review.json";
const DEFAULT_LEDGER = ".tmp/polyglot-resend-ledger.json";
const DEFAULT_OUTPUT = ".tmp/polyglot-resend-run.json";
const REQUIRED_PREFLIGHT_CHECKS = new Set([
  "sender_identity",
  "postal_address",
  "spf",
  "dmarc",
  "dkim",
  "pilot_present",
  "pilot_company_contacts",
  "suppression",
  "pilot_report_ready",
]);
const SUPPRESSED_STATUSES = new Set([
  "bounced",
  "unsubscribed",
  "not_fit",
  "no_reply_closed",
  "report_closed",
]);

function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function usage() {
  return `
Usage:
  pnpm lead:report-send
  pnpm lead:report-send -- --execute --date 2026-07-13 --schedule-at 2026-07-13T08:30:00Z

The default is a local dry-run. --execute is required for a Resend API call.
No attachments, HTML, tracking pixels, or automatic follow-ups are sent.

Options:
  --pilot <file>            Audit bundle. Default: ${DEFAULT_PILOT}
  --crm <file>              Local CRM CSV. Default: ${DEFAULT_CRM}
  --preflight <file>        Sender preflight JSON. Default: ${DEFAULT_PREFLIGHT}
  --review <file>           Per-contact review manifest. Default: ${DEFAULT_REVIEW}
  --ledger <file>           Local idempotency ledger. Default: ${DEFAULT_LEDGER}
  --output <file>           Sanitized run result. Default: ${DEFAULT_OUTPUT}
  --date <YYYY-MM-DD>       Scheduled cohort date. Default: local date
  --expected-count <n>      Exact number required. Default: 2
  --schedule-at <ISO time>  Base scheduled time; omit to send immediately.
  --spacing-minutes <n>     Minutes between messages. Default: 17
  --sender-email <email>    Defaults to OUTREACH_SENDER_EMAIL.
  --sender-name <name>      Friendly sender name. Default: Polyglot AEO
  --execute                 Submit to Resend and update CRM after acceptance.
  --help                    Show this help.
`;
}

function positiveInt(value, key, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  const min = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${key} must be an integer >= ${min}.`);
  return parsed;
}

export function parseArgs(argv) {
  const args = {
    pilot: DEFAULT_PILOT,
    crm: DEFAULT_CRM,
    preflight: DEFAULT_PREFLIGHT,
    review: DEFAULT_REVIEW,
    ledger: DEFAULT_LEDGER,
    output: DEFAULT_OUTPUT,
    date: todayLocal(),
    expectedCount: 2,
    scheduleAt: "",
    spacingMinutes: 17,
    senderEmail: process.env.OUTREACH_SENDER_EMAIL || "",
    senderName: "Polyglot AEO",
    execute: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    const stringOptions = {
      "--pilot": "pilot",
      "--crm": "crm",
      "--preflight": "preflight",
      "--review": "review",
      "--ledger": "ledger",
      "--output": "output",
      "--date": "date",
      "--schedule-at": "scheduleAt",
      "--sender-email": "senderEmail",
      "--sender-name": "senderName",
    };
    if (stringOptions[key]) {
      args[stringOptions[key]] = value || "";
      index += 1;
      continue;
    }
    if (key === "--expected-count") {
      args.expectedCount = positiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--spacing-minutes") {
      args.spacingMinutes = positiveInt(value, key, true);
      index += 1;
      continue;
    }
    if (key === "--execute") {
      args.execute = true;
      continue;
    }
    throw new Error(`Unknown argument: ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("--date must use YYYY-MM-DD.");
  return args;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function parseCsv(text) {
  const records = [];
  let record = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(cell);
      cell = "";
    } else if (char === "\n") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || record.length) {
    record.push(cell);
    records.push(record);
  }
  if (!records.length) return [];
  const headers = records[0];
  return records
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

async function readCsv(file) {
  return parseCsv(await readFile(file, "utf8"));
}

function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "");
}

function bodyStats(body) {
  return {
    words: String(body || "").trim().split(/\s+/).filter(Boolean).length,
    checks: (String(body || "").match(/^[123]\. /gm) || []).length,
    evidence_urls: (String(body || "").match(/^Evidence: https?:\/\//gm) || []).length,
  };
}

function assertPreflight(preflight, now) {
  if (preflight?.status !== "pass") throw new Error("Sender preflight is not passing.");
  if (!preflight.valid_until || Date.parse(preflight.valid_until) <= now.getTime()) {
    throw new Error("Sender preflight is stale.");
  }
  const passing = new Set((preflight.checks || []).filter((check) => check.status === "pass").map((check) => check.id));
  for (const id of REQUIRED_PREFLIGHT_CHECKS) {
    if (!passing.has(id)) throw new Error(`Sender preflight check is missing or failed: ${id}.`);
  }
}

function assertSchedule(args, now) {
  if (!args.scheduleAt) return null;
  const scheduled = new Date(args.scheduleAt);
  if (Number.isNaN(scheduled.getTime())) throw new Error("--schedule-at must be a valid ISO date/time.");
  if (args.execute && scheduled.getTime() < now.getTime() + 60_000) {
    throw new Error("Scheduled execution must start at least one minute in the future.");
  }
  if (scheduled.getTime() > now.getTime() + 30 * 86_400_000) {
    throw new Error("Resend scheduling cannot exceed 30 days.");
  }
  return scheduled;
}

function reviewMap(review, args, now) {
  if (!review) return new Map();
  if (review.campaign !== "report-first-v1" || review.date !== args.date) {
    throw new Error("Review manifest campaign/date does not match this run.");
  }
  const reviewedAt = Date.parse(review.reviewed_at || "");
  if (!Number.isFinite(reviewedAt) || reviewedAt > now.getTime() + 60_000 || now.getTime() - reviewedAt > 6 * 3_600_000) {
    throw new Error("Review manifest must be no more than six hours old.");
  }
  return new Map((review.reviews || []).map((item) => [normalizeDomain(item.domain), item]));
}

function assertReview(item, domain) {
  const required = [
    "approved",
    "brand_confirmed",
    "contact_confirmed",
    "current_site_confirmed",
    "suppression_confirmed",
    "unsubscribe_confirmed",
  ];
  if (!item) throw new Error(`${domain} has no current review approval.`);
  for (const key of required) {
    if (item[key] !== true) throw new Error(`${domain} review is missing ${key}.`);
  }
  if (Number(item.evidence_urls_confirmed) !== 3) {
    throw new Error(`${domain} review must confirm exactly three evidence URLs.`);
  }
}

function auditDateIsFresh(audit, args, now) {
  const checked = Date.parse(audit.checked_at || "");
  return (
    Number.isFinite(checked) &&
    String(audit.checked_at).slice(0, 10) === args.date &&
    checked <= now.getTime() + 60_000 &&
    now.getTime() - checked <= 24 * 3_600_000
  );
}

function rowContact(row) {
  const direct = String(row.contact_email || "").trim();
  if (direct) return direct;
  const url = String(row.contact_url || "").trim();
  return url.toLowerCase().startsWith("mailto:") ? url.slice(7).split("?")[0] : "";
}

function sanitizeTag(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 256) || "unknown";
}

export function idempotencyKey(row, args) {
  return `${sanitizeTag(row.report_campaign || "report-first-v1")}/${args.date}/${sanitizeTag(row.domain)}`;
}

export function buildResendPayload(prepared, args) {
  const sender = `${args.senderName} <${args.senderEmail}>`;
  return {
    from: sender,
    to: [prepared.to],
    reply_to: args.senderEmail,
    subject: prepared.row.subject,
    text: prepared.row.email_body,
    headers: {
      "List-Unsubscribe": `<mailto:${args.senderEmail}?subject=unsubscribe>`,
    },
    tags: [
      { name: "campaign", value: sanitizeTag(prepared.row.report_campaign) },
      { name: "cohort", value: sanitizeTag(prepared.row.report_cohort) },
      { name: "domain", value: sanitizeTag(prepared.row.domain) },
    ],
    ...(prepared.scheduled_at ? { scheduled_at: prepared.scheduled_at } : {}),
  };
}

export function prepareReportBatch({ bundle, crmRows, preflight, review, ledger, args, now = new Date() }) {
  assertPreflight(preflight, now);
  if (!args.senderEmail || !isCompanyDomainEmail(args.senderEmail)) {
    throw new Error("A company-domain OUTREACH_SENDER_EMAIL is required.");
  }
  const postalAddress = String(process.env.SENDER_POSTAL_ADDRESS || "").trim();
  if (!postalAddress) throw new Error("SENDER_POSTAL_ADDRESS is required.");
  const scheduleBase = assertSchedule(args, now);
  const crmMap = new Map(crmRows.map((row) => [normalizeDomain(row.domain), row]));
  const reviews = reviewMap(review, args, now);
  const sentKeys = new Set((ledger?.entries || []).map((entry) => `${entry.campaign}:${normalizeDomain(entry.domain)}`));
  const dueAudits = (bundle?.audits || [])
    .filter((audit) => audit.source_row?.next_followup === args.date)
    .sort((a, b) => String(a.source_row.scheduled_order).localeCompare(String(b.source_row.scheduled_order)));
  if (dueAudits.length !== args.expectedCount) {
    throw new Error(`Expected exactly ${args.expectedCount} report(s) for ${args.date}; found ${dueAudits.length}.`);
  }
  return dueAudits.map((audit, index) => {
    const row = audit.source_row;
    const domain = normalizeDomain(row.domain || audit.domain);
    const crm = crmMap.get(domain);
    if (!crm) throw new Error(`${domain} is missing from CRM.`);
    if (SUPPRESSED_STATUSES.has(crm.status)) throw new Error(`${domain} is suppressed by CRM status ${crm.status}.`);
    if (crm.status !== "report_ready") throw new Error(`${domain} CRM status must be report_ready, found ${crm.status}.`);
    if (row.send_ready !== "true" || (row.send_blockers || []).length) throw new Error(`${domain} is not send-ready.`);
    if (!auditDateIsFresh(audit, args, now)) throw new Error(`${domain} audit is stale or from a different date.`);
    const to = rowContact(row);
    if (!isCompanyDomainEmail(to) || !emailMatchesSiteDomain(to, domain) || !isOutreachMailbox(to)) {
      throw new Error(`${domain} contact is not an eligible matching company mailbox.`);
    }
    const crmEmail = rowContact(crm);
    if (crmEmail && crmEmail.toLowerCase() !== to.toLowerCase()) throw new Error(`${domain} CRM contact changed after review.`);
    const stats = bodyStats(row.email_body);
    if (stats.checks !== 3 || stats.evidence_urls !== 3) throw new Error(`${domain} inline report must contain three checks and three evidence URLs.`);
    if (!row.email_body.includes(postalAddress)) throw new Error(`${domain} email is missing the configured postal footer.`);
    if (/<img|!\[|tracking pixel|guarantee|rankings|AI citations/i.test(row.email_body)) {
      throw new Error(`${domain} email contains a blocked claim or remote-image signal.`);
    }
    if (/https:\/\/polyglotaeo\.com\//i.test(row.email_body)) throw new Error(`${domain} unexpectedly includes a product link.`);
    assertReview(reviews.get(domain), domain);
    const campaign = row.report_campaign || bundle.campaign || "report-first-v1";
    if (sentKeys.has(`${campaign}:${domain}`)) throw new Error(`${domain} already exists in the Resend ledger for ${campaign}.`);
    const scheduled = scheduleBase
      ? new Date(scheduleBase.getTime() + index * args.spacingMinutes * 60_000).toISOString()
      : "";
    return {
      audit,
      row,
      crm,
      to,
      scheduled_at: scheduled,
      idempotency_key: idempotencyKey(row, args),
      body_stats: stats,
    };
  });
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function updateCrmDefault(prepared, resendId, args) {
  const note = `outreach variant:report-first-v1; inline report; resend_id:${resendId}; ` +
    (prepared.scheduled_at ? `scheduled_at:${prepared.scheduled_at}` : "accepted immediately");
  await execFileAsync(process.execPath, [
    path.resolve("tools/lead-finder/lead-crm.mjs"),
    "--crm", args.crm,
    "--domain", prepared.row.domain,
    "--set-status", "report_sent",
    "--audit-score", String(prepared.audit.score ?? ""),
    "--audit-rating", prepared.audit.rating || "",
    "--audit-checked-at", prepared.audit.checked_at || "",
    "--audit-version", prepared.audit.audit_version || "",
    "--report-campaign", prepared.row.report_campaign || "report-first-v1",
    "--report-cohort", prepared.row.report_cohort || "",
    "--note", note,
    "--today", args.date,
  ]);
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function executePreparedBatch(preparedRows, args, options = {}) {
  const apiKey = options.apiKey || process.env.RESEND_API_KEY || "";
  if (!/^re_[A-Za-z0-9_-]{20,}$/.test(apiKey)) throw new Error("A valid RESEND_API_KEY is required for --execute.");
  const fetchImpl = options.fetchImpl || fetch;
  const updateCrm = options.updateCrm || updateCrmDefault;
  const results = [];
  await withFileLock(args.ledger, async () => {
    const ledger = await readJson(args.ledger, { version: 1, entries: [] });
    for (const prepared of preparedRows) {
      const campaign = prepared.row.report_campaign || "report-first-v1";
      const duplicate = ledger.entries.some(
        (entry) => entry.campaign === campaign && normalizeDomain(entry.domain) === normalizeDomain(prepared.row.domain),
      );
      if (duplicate) throw new Error(`${prepared.row.domain} already exists in the Resend ledger.`);
      const payload = buildResendPayload(prepared, args);
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": prepared.idempotency_key,
        },
        body: JSON.stringify(payload),
      });
      const data = await parseResponse(response);
      if (!response.ok || !data.id) {
        const code = data?.name || data?.code || `http_${response.status}`;
        const message = data?.message || data?.error?.message || "Resend rejected the request.";
        throw new Error(`${prepared.row.domain} Resend error ${code}: ${message}`);
      }
      const entry = {
        campaign,
        domain: prepared.row.domain,
        cohort: prepared.row.report_cohort,
        recipient: prepared.to,
        subject: prepared.row.subject,
        resend_email_id: data.id,
        idempotency_key: prepared.idempotency_key,
        accepted_at: new Date().toISOString(),
        scheduled_at: prepared.scheduled_at || "",
        status: prepared.scheduled_at ? "scheduled" : "accepted",
        crm_updated: false,
      };
      ledger.entries.push(entry);
      await writeJson(args.ledger, ledger);
      try {
        await updateCrm(prepared, data.id, args);
        entry.crm_updated = true;
        await writeJson(args.ledger, ledger);
      } catch (error) {
        entry.crm_error = error?.message || String(error);
        await writeJson(args.ledger, ledger);
        throw new Error(`${prepared.row.domain} was accepted by Resend (${data.id}) but CRM update failed.`);
      }
      results.push(entry);
    }
  });
  return results;
}

function sanitizedRows(preparedRows) {
  return preparedRows.map((prepared) => ({
    domain: prepared.row.domain,
    cohort: prepared.row.report_cohort,
    recipient: prepared.to,
    subject: prepared.row.subject,
    scheduled_at: prepared.scheduled_at,
    idempotency_key: prepared.idempotency_key,
    body_stats: prepared.body_stats,
    attachments: [],
    html: false,
    tracking_pixel: false,
  }));
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const [bundle, crmRows, preflight, ledger] = await Promise.all([
    readJson(args.pilot),
    readCsv(args.crm),
    readJson(args.preflight),
    readJson(args.ledger, { version: 1, entries: [] }),
  ]);
  const review = args.execute ? await readJson(args.review) : await readJson(args.review, null);
  const prepared = prepareReportBatch({ bundle, crmRows, preflight, review, ledger, args });
  const output = {
    generated_at: new Date().toISOString(),
    mode: args.execute ? "execute" : "dry-run",
    date: args.date,
    row_count: prepared.length,
    rows: sanitizedRows(prepared),
    results: [],
  };
  if (args.execute) output.results = await executePreparedBatch(prepared, args);
  await writeJson(args.output, output);
  process.stdout.write(
    args.execute
      ? `Resend accepted ${output.results.length} report-first email(s). See ${args.output} and ${args.ledger}.\n`
      : `Dry-run prepared ${prepared.length} report-first email(s). No API call was made. See ${args.output}.\n`,
  );
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedUrl) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
