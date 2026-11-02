#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PUBLIC_AUDIT_VERSION,
  auditPublicSite,
  renderPublicAuditMarkdown,
  renderReportFirstEmail,
} from "./public-audit-lib.mjs";

const DEFAULT_JSON = ".tmp/polyglot-public-audits.json";
const DEFAULT_MARKDOWN = ".tmp/polyglot-public-audits.md";
const DEFAULT_CSV = ".tmp/polyglot-public-audits.csv";

function usage() {
  return `
Usage:
  pnpm lead:public-audit -- --url https://example.com
  pnpm lead:public-audit -- --input urls.txt
  pnpm lead:public-audit -- --input leads.csv --cohort new

This command only reads public pages and writes local review artifacts. It never
sends email, creates a Gmail draft, uploads a report, or changes CRM state.

Options:
  --url <url>                 Public URL to audit. Repeat for multiple URLs.
  --input <file>              Text URL list or CSV with final_url/url/domain columns.
  --json <file>               JSON output. Default: ${DEFAULT_JSON}
  --markdown <file>           Markdown review output. Default: ${DEFAULT_MARKDOWN}
  --csv <file>                Mail-merge review CSV. Default: ${DEFAULT_CSV}
  --cohort <old|new|manual>   Cohort label applied when input has none. Default: manual
  --campaign <name>           Campaign label. Default: report-first-v1
  --sender-name <name>        Signature name. Default: Jimmy
  --postal-address <address>  Compliance footer; defaults to SENDER_POSTAL_ADDRESS.
  --include-product-link      Add one first-party product link to the inline email.
  --product-url <url>         First-party product URL. Default: https://polyglotaeo.com
  --max-pages <number>        Maximum public pages per site. Default: 4
  --timeout-ms <number>       Request timeout. Default: 12000
  --retries <number>          Transient request retries. Default: 1
  --concurrency <number>      Concurrent site audits. Default: 2
  --help                      Show this help message.
`;
}

function positiveInt(value, name, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = {
    urls: [],
    json: DEFAULT_JSON,
    markdown: DEFAULT_MARKDOWN,
    csv: DEFAULT_CSV,
    cohort: "manual",
    campaign: "report-first-v1",
    senderName: "Jimmy",
    postalAddress: process.env.SENDER_POSTAL_ADDRESS || "",
    includeProductLink: false,
    productUrl: "https://polyglotaeo.com",
    maxPages: 4,
    timeoutMs: 12000,
    retries: 1,
    concurrency: 2,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--url") {
      args.urls.push(value);
      index += 1;
      continue;
    }
    if (key === "--input") {
      args.input = value;
      index += 1;
      continue;
    }
    if (key === "--json") {
      args.json = value;
      index += 1;
      continue;
    }
    if (key === "--markdown") {
      args.markdown = value;
      index += 1;
      continue;
    }
    if (key === "--csv") {
      args.csv = value;
      index += 1;
      continue;
    }
    if (key === "--cohort") {
      args.cohort = value;
      index += 1;
      continue;
    }
    if (key === "--campaign") {
      args.campaign = value;
      index += 1;
      continue;
    }
    if (key === "--sender-name") {
      args.senderName = value;
      index += 1;
      continue;
    }
    if (key === "--postal-address") {
      args.postalAddress = value;
      index += 1;
      continue;
    }
    if (key === "--include-product-link") {
      args.includeProductLink = true;
      continue;
    }
    if (key === "--product-url") {
      args.productUrl = value;
      index += 1;
      continue;
    }
    if (key === "--max-pages") {
      args.maxPages = positiveInt(value, key);
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
    if (key === "--concurrency") {
      args.concurrency = positiveInt(value, key);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${key}`);
  }
  return args;
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
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function parseTextRows(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => ({ final_url: line.split(",")[0].trim().replace(/^['"]|['"]$/g, "") }));
}

async function readInput(file) {
  const text = await readFile(file, "utf8");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  if (/\b(final_url|url|domain)\b/i.test(firstLine) && firstLine.includes(",")) return parseCsv(text);
  return parseTextRows(text);
}

function inputUrl(row) {
  return String(row.final_url || row.url || row.domain || "").trim();
}

function normalizeDomain(raw) {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return raw.toLowerCase();
  }
}

function dedupeRows(rows, cohort) {
  const byDomain = new Map();
  for (const row of rows) {
    const url = inputUrl(row);
    if (!url) continue;
    const domain = normalizeDomain(url);
    if (!domain || byDomain.has(domain)) continue;
    byDomain.set(domain, { ...row, report_cohort: row.report_cohort || cohort, final_url: url });
  }
  return Array.from(byDomain.values());
}

async function runPool(rows, concurrency, mapper) {
  const output = new Array(rows.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < rows.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(rows[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
  return output;
}

function productUrl(args, row) {
  if (!args.includeProductLink) return "";
  try {
    const url = new URL(args.productUrl);
    url.searchParams.set("utm_source", "outreach");
    url.searchParams.set("utm_medium", "email");
    url.searchParams.set("utm_campaign", args.campaign);
    url.searchParams.set("utm_content", row.report_cohort || args.cohort);
    return url.href;
  } catch {
    return args.productUrl;
  }
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const columns = [
    "domain",
    "final_url",
    "contact_url",
    "contact_email",
    "report_campaign",
    "report_cohort",
    "audit_score",
    "audit_rating",
    "audit_checked_at",
    "audit_version",
    "coverage_pct",
    "subject",
    "email_body",
    "issue_1",
    "evidence_1",
    "issue_2",
    "evidence_2",
    "issue_3",
    "evidence_3",
    "send_ready",
    "send_blockers",
  ];
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n")}\n`;
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function flatRow(entry, args) {
  const { audit, source } = entry;
  const email = renderReportFirstEmail(audit, source, {
    senderName: args.senderName,
    postalAddress: args.postalAddress,
    includeProductLink: args.includeProductLink,
    productUrl: productUrl(args, source),
  });
  return {
    domain: audit.domain,
    final_url: audit.final_url,
    contact_url: source.contact_url || (source.contact_email ? `mailto:${source.contact_email}` : ""),
    contact_email: source.contact_email || String(source.contact_url || "").replace(/^mailto:/i, "").split("?")[0],
    report_campaign: source.report_campaign || args.campaign,
    report_cohort: source.report_cohort || args.cohort,
    audit_score: audit.score ?? "",
    audit_rating: audit.rating,
    audit_checked_at: audit.checked_at,
    audit_version: audit.audit_version,
    coverage_pct: audit.coverage_pct,
    subject: email.subject,
    email_body: email.body,
    issue_1: audit.findings[0]?.observed || "",
    evidence_1: audit.findings[0]?.evidence_url || "",
    issue_2: audit.findings[1]?.observed || "",
    evidence_2: audit.findings[1]?.evidence_url || "",
    issue_3: audit.findings[2]?.observed || "",
    evidence_3: audit.findings[2]?.evidence_url || "",
    send_ready: email.blockers.length === 0 ? "true" : "false",
    send_blockers: email.blockers.join(" | "),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const fileRows = args.input ? await readInput(args.input) : [];
  const directRows = args.urls.map((url) => ({ final_url: url, report_cohort: args.cohort }));
  const rows = dedupeRows([...fileRows, ...directRows], args.cohort);
  if (!rows.length) throw new Error(`No audit URLs supplied.\n${usage()}`);

  const results = await runPool(rows, args.concurrency, async (source) => {
    try {
      const audit = await auditPublicSite(inputUrl(source), {
        timeoutMs: args.timeoutMs,
        retries: args.retries,
        maxPages: args.maxPages,
      });
      return { source, audit };
    } catch (error) {
      return { source, error: error?.message || String(error) };
    }
  });
  const completed = results.filter((result) => result.audit);
  const errors = results.filter((result) => result.error).map((result) => ({
    url: inputUrl(result.source),
    domain: normalizeDomain(inputUrl(result.source)),
    error: result.error,
  }));
  const generatedAt = new Date().toISOString();
  const json = {
    audit_version: PUBLIC_AUDIT_VERSION,
    generated_at: generatedAt,
    source: args.input || "direct URLs",
    row_count: completed.length,
    error_count: errors.length,
    audits: completed.map(({ source, audit }) => ({ ...audit, source_row: source })),
    errors,
  };
  const markdown = [
    "# Polyglot public audit review pack",
    "",
    `Generated: ${generatedAt}`,
    `Completed: ${completed.length}`,
    `Errors: ${errors.length}`,
    "",
    "These are public-page observations only. This file is a local review artifact and is not an email attachment.",
    "",
    ...completed.flatMap(({ audit }) => [renderPublicAuditMarkdown(audit).trim(), ""]),
    ...(errors.length
      ? ["## Errors", "", ...errors.map((error) => `- ${error.domain || error.url}: ${error.error}`), ""]
      : []),
  ].join("\n");
  const flatRows = completed.map((entry) => flatRow(entry, args));

  await Promise.all([
    writeText(args.json, `${JSON.stringify(json, null, 2)}\n`),
    writeText(args.markdown, `${markdown.trim()}\n`),
    writeText(args.csv, toCsv(flatRows)),
  ]);
  const ready = flatRows.filter((row) => row.send_ready === "true").length;
  process.stdout.write(
    `Public audits: ${completed.length} complete, ${errors.length} error(s), ${ready} send-ready after compliance checks.\n` +
      `Local outputs: ${args.json}, ${args.markdown}, ${args.csv}\n` +
      "No email was sent and no remote draft was created.\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
