#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadLocalEnv } from "./local-env.mjs";
import { auditPublicSite, renderReportFirstEmail } from "./public-audit-lib.mjs";

const DEFAULT_PILOT = ".tmp/polyglot-report-pilot.json";
const DEFAULT_CSV = ".tmp/polyglot-report-refresh.csv";
const DEFAULT_MARKDOWN = ".tmp/polyglot-report-refresh.md";

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
  pnpm lead:report-refresh
  pnpm lead:report-refresh -- --date 2026-07-14

Re-audits only the fixed report-first contacts scheduled for one date. It does
not reselect the cohort, mutate CRM, create drafts, or send email.

Options:
  --pilot <file>            Input audit bundle. Default: ${DEFAULT_PILOT}
  --output <file>           Updated audit bundle. Default: same as --pilot
  --csv <file>              Refreshed CRM import rows. Default: ${DEFAULT_CSV}
  --markdown <file>         Review preview. Default: ${DEFAULT_MARKDOWN}
  --date <YYYY-MM-DD>       Scheduled cohort date. Default: local date
  --timeout-ms <number>     Public request timeout. Default: 12000
  --retries <number>        Transient retries. Default: 1
  --max-pages <number>      Maximum sampled pages. Default: 4
  --sender-name <name>      Email signature. Default: Jimmy
  --help                    Show this help.
`;
}

function positiveInt(value, key, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  const min = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${key} must be an integer >= ${min}.`);
  return parsed;
}

function parseArgs(argv) {
  const args = {
    pilot: DEFAULT_PILOT,
    output: "",
    csv: DEFAULT_CSV,
    markdown: DEFAULT_MARKDOWN,
    date: todayLocal(),
    timeoutMs: 12000,
    retries: 1,
    maxPages: 4,
    senderName: "Jimmy",
    postalAddress: process.env.SENDER_POSTAL_ADDRESS || "",
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
      "--output": "output",
      "--csv": "csv",
      "--markdown": "markdown",
      "--date": "date",
      "--sender-name": "senderName",
    };
    if (stringOptions[key]) {
      args[stringOptions[key]] = value || "";
      index += 1;
      continue;
    }
    if (key === "--timeout-ms") {
      args.timeoutMs = positiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--retries") {
      args.retries = positiveInt(value, key, true);
      index += 1;
      continue;
    }
    if (key === "--max-pages") {
      args.maxPages = positiveInt(value, key);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${key}`);
  }
  if (!args.output) args.output = args.pilot;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("--date must use YYYY-MM-DD.");
  return args;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const columns = [
    "domain", "final_url", "locales", "score", "audit_score", "audit_rating", "audit_checked_at",
    "audit_version", "report_campaign", "report_cohort", "contact_url", "contact_email", "contact_channel",
    "status", "source", "issue_1", "issue_2", "issue_3", "subject", "email_body", "manual_check",
    "created_at", "last_touch", "next_action", "next_followup", "sent_count", "scheduled_order",
    "send_ready", "send_blockers",
  ];
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n")}\n`;
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function auditUrl(audit, row) {
  return audit.requested_url || row.final_url || audit.final_url || `https://${row.domain}`;
}

function preservedBrand(row) {
  const explicit = String(row.brand || "").trim();
  if (explicit) return explicit;
  const subject = String(row.subject || "").trim();
  const prefix = "3 public Framer checks for ";
  return subject.startsWith(prefix) ? subject.slice(prefix.length).trim() : "";
}

function refreshedRow(audit, oldRow, email) {
  return {
    ...oldRow,
    domain: audit.domain,
    final_url: audit.final_url,
    locales: audit.locales_checked.join("|"),
    audit_score: audit.score ?? "",
    audit_rating: audit.rating,
    audit_checked_at: audit.checked_at,
    audit_version: audit.audit_version,
    issue_1: audit.findings[0]?.observed || "",
    issue_2: audit.findings[1]?.observed || "",
    issue_3: audit.findings[2]?.observed || "",
    subject: email.subject,
    email_body: email.body,
    send_ready: email.blockers.length ? "false" : "true",
    send_blockers: email.blockers,
  };
}

export async function refreshDueAudits(bundle, args, options = {}) {
  const auditFn = options.auditFn || auditPublicSite;
  const due = (bundle.audits || []).filter((audit) => audit.source_row?.next_followup === args.date);
  if (!due.length) throw new Error(`No fixed report-first contacts are scheduled for ${args.date}.`);
  const replacements = new Map();
  for (const existing of due) {
    const oldRow = existing.source_row;
    const renderRow = { ...oldRow, brand: preservedBrand(oldRow) };
    const audit = await auditFn(auditUrl(existing, oldRow), {
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      maxPages: args.maxPages,
    });
    const email = renderReportFirstEmail(audit, renderRow, {
      senderName: args.senderName,
      postalAddress: args.postalAddress,
      includeProductLink: false,
    });
    const row = refreshedRow(audit, renderRow, email);
    replacements.set(String(oldRow.domain).toLowerCase(), { ...audit, source_row: row });
  }
  const audits = bundle.audits.map((audit) =>
    replacements.get(String(audit.source_row?.domain || audit.domain).toLowerCase()) || audit,
  );
  return {
    bundle: {
      ...bundle,
      generated_at: new Date().toISOString(),
      refreshed_at: new Date().toISOString(),
      refreshed_date: args.date,
      audits,
    },
    refreshed: Array.from(replacements.values()),
  };
}

function renderMarkdown(refreshed, args) {
  const lines = [
    "# Polyglot report-first daily refresh",
    "",
    `Date: ${args.date}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "This is a fixed-cohort public re-audit. No email was sent and no contact was replaced.",
    "",
  ];
  for (const audit of refreshed) {
    const row = audit.source_row;
    lines.push(
      `## ${row.scheduled_order} · ${row.domain}`,
      "",
      `- Score: ${audit.score ?? "evidence insufficient"}`,
      `- Rating: ${audit.rating}`,
      `- Coverage: ${audit.coverage_pct}%`,
      `- Send ready: ${row.send_ready}`,
      ...(row.send_blockers.length ? [`- Blockers: ${row.send_blockers.join("; ")}`] : []),
      "",
      "```text",
      `Subject: ${row.subject}`,
      "",
      row.email_body,
      "```",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.postalAddress) throw new Error("SENDER_POSTAL_ADDRESS is required.");
  const bundle = JSON.parse(await readFile(args.pilot, "utf8"));
  const result = await refreshDueAudits(bundle, args);
  const rows = result.refreshed.map((audit) => audit.source_row);
  await Promise.all([
    writeText(args.output, `${JSON.stringify(result.bundle, null, 2)}\n`),
    writeText(args.csv, toCsv(rows)),
    writeText(args.markdown, renderMarkdown(result.refreshed, args)),
  ]);
  const blocked = rows.filter((row) => row.send_ready !== "true");
  process.stdout.write(
    `Refreshed ${rows.length} fixed report-first contact(s) for ${args.date}. ` +
      `Outputs: ${args.output}, ${args.csv}, ${args.markdown}. No email was sent.\n`,
  );
  if (blocked.length) throw new Error(`${blocked.length} refreshed report(s) are blocked and must not be sent.`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedUrl) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
