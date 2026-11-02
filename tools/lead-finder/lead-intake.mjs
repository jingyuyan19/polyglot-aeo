#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_SOURCE = "audit_page";
const DEFAULT_STATUS = "replied";

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

function usage() {
  return `
Usage:
  pnpm lead:intake -- --site-url https://example.framer.website --contact-email founder@example.com --note "requested mini audit from /audit"

Options:
  --crm <file>             Local CRM CSV. Default: ${DEFAULT_CRM}
  --site-url <url>         Public site URL from the inbound request. Required.
  --contact-email <email>  Requester email, if known.
  --source <text>          Lead source. Default: ${DEFAULT_SOURCE}
  --status <status>        Initial CRM status. Default: ${DEFAULT_STATUS}
  --next-action <text>     Next CRM action. Default: inferred from status.
  --revenue-path <text>    Revenue path to attach, e.g. plugin_pro or launch_qa.
  --deal-value <amount>    Estimated deal value in USD.
  --note <text>            Context from Gmail or the request.
  --today <YYYY-MM-DD>     Override today's date. Default: local date.
  --help                   Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    source: DEFAULT_SOURCE,
    status: DEFAULT_STATUS,
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
    if (key === "--site-url") {
      args.siteUrl = value;
      index += 1;
      continue;
    }
    if (key === "--contact-email") {
      args.contactEmail = normalizeEmail(value);
      index += 1;
      continue;
    }
    if (key === "--source") {
      args.source = value;
      index += 1;
      continue;
    }
    if (key === "--status") {
      args.status = value;
      index += 1;
      continue;
    }
    if (key === "--next-action") {
      args.nextAction = value;
      index += 1;
      continue;
    }
    if (key === "--revenue-path") {
      args.revenuePath = value;
      index += 1;
      continue;
    }
    if (key === "--deal-value") {
      args.dealValueUsd = normalizeMoney(value, key);
      index += 1;
      continue;
    }
    if (key === "--note") {
      args.note = value;
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

  if (!args.siteUrl) {
    throw new Error("--site-url is required.");
  }

  args.domain = normalizeDomain(args.siteUrl);
  if (!args.domain) {
    throw new Error("--site-url must include a valid domain.");
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

function normalizeEmail(value) {
  const match = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function normalizeMoney(value, name) {
  const amount = Number.parseFloat(String(value || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${name} must be a non-negative amount.`);
  }
  return String(amount);
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
  } catch {
    return raw;
  }
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

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  return (
    [
      CRM_COLUMNS.join(","),
      ...rows.map((row) => CRM_COLUMNS.map((column) => csvEscape(row[column])).join(",")),
    ].join("\n") + "\n"
  );
}

async function writeRows(file, rows) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, toCsv(rows), "utf8");
}

function emptyRow(domain, args) {
  return Object.fromEntries(
    CRM_COLUMNS.map((column) => {
      if (column === "domain") return [column, domain];
      if (column === "final_url") return [column, normalizeUrl(args.siteUrl)];
      if (column === "contact_url") return [column, args.contactEmail ? `mailto:${args.contactEmail}` : ""];
      if (column === "contact_channel") return [column, args.contactEmail ? "email" : "manual"];
      if (column === "status") return [column, args.status];
      if (column === "source") return [column, args.source];
      if (column === "issue_1") return [column, "Inbound mini audit request; run public-site verification before replying."];
      if (column === "subject") return [column, `Framer AEO mini audit request for ${domain}`];
      if (column === "manual_check") return [column, "Open the public site and verify it is safe to audit before replying."];
      if (column === "created_at") return [column, args.today];
      if (column === "last_touch") return [column, args.today];
      if (column === "next_action") return [column, args.nextAction || "send_mini_audit_or_book_call"];
      if (column === "next_followup") return [column, args.today];
      if (column === "sent_count") return [column, "0"];
      if (column === "reply_notes") return [column, noteText(args)];
      if (column === "deal_value_usd") return [column, args.dealValueUsd || ""];
      if (column === "revenue_path") return [column, args.revenuePath || ""];
      return [column, ""];
    }),
  );
}

function noteText(args) {
  const parts = [`${args.today}: inbound mini audit request`];
  if (args.contactEmail) parts.push(`from ${args.contactEmail}`);
  if (args.note) parts.push(args.note);
  return parts.join(" / ");
}

function nextCommand(args) {
  if (args.source === "agency_page" || /agency_handoff/i.test(args.nextAction || "")) {
    const command = [
      "pnpm lead:handoff --",
      "--url",
      shellQuote(normalizeUrl(args.siteUrl)),
      args.contactEmail ? `--contact-email ${shellQuote(args.contactEmail)}` : "",
      "--output",
      shellQuote(`.tmp/framer-handoff-${args.domain}.md`),
    ].filter(Boolean).join(" ");
    return command;
  }

  return `pnpm lead:audit -- --domain ${args.domain}`;
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function applyStatus(row, args) {
  row.status = args.status;
  row.last_touch = args.today;
  row.next_action =
    args.nextAction ||
    (args.status === "replied" ? "send_mini_audit_or_book_call" : row.next_action || "manual_next_step");
  row.next_followup = args.today;
}

function upsert(rows, args) {
  const existing = rows.find((row) => normalizeDomain(row.domain) === args.domain);
  if (!existing) {
    rows.push(emptyRow(args.domain, args));
    return "added";
  }

  if (args.siteUrl) existing.final_url = normalizeUrl(args.siteUrl);
  if (args.contactEmail) {
    existing.contact_url = `mailto:${args.contactEmail}`;
    existing.contact_channel = "email";
  }
  existing.source = existing.source || args.source;
  existing.issue_1 = existing.issue_1 || "Inbound mini audit request; run public-site verification before replying.";
  existing.subject = existing.subject || `Framer AEO mini audit request for ${args.domain}`;
  existing.manual_check = existing.manual_check || "Open the public site and verify it is safe to audit before replying.";
  existing.reply_notes = existing.reply_notes ? `${existing.reply_notes} | ${noteText(args)}` : noteText(args);
  if (args.revenuePath && !existing.revenue_path) existing.revenue_path = args.revenuePath;
  if (args.dealValueUsd && !existing.deal_value_usd) existing.deal_value_usd = args.dealValueUsd;
  applyStatus(existing, args);
  return "updated";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const result = await withFileLock(args.crm, async () => {
    const rows = await readRows(args.crm);
    const upsertResult = upsert(rows, args);
    rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || a.domain.localeCompare(b.domain));
    await writeRows(args.crm, rows);
    return upsertResult;
  });

  process.stdout.write(`Inbound audit request ${result}: ${args.domain} -> ${args.status}\n`);
  process.stdout.write(`Next: ${nextCommand(args)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
