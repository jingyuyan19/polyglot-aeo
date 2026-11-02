#!/usr/bin/env node

import { resolveTxt } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnv } from "./local-env.mjs";
import { isCompanyDomainEmail } from "./public-audit-lib.mjs";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_PILOT = ".tmp/polyglot-report-pilot.csv";
const DEFAULT_JSON = ".tmp/polyglot-report-sender-preflight.json";
const DEFAULT_MARKDOWN = ".tmp/polyglot-report-sender-preflight.md";

function usage() {
  return `
Usage:
  pnpm lead:report-preflight

Runs read-only DNS and local suppression/compliance checks. It never sends email
or creates a remote draft.

Options:
  --sender-email <email>    Sender identity; defaults to OUTREACH_SENDER_EMAIL.
  --dkim-selector <name>    Active DKIM selector; defaults to OUTREACH_DKIM_SELECTOR.
  --postal-address <text>   Footer address; defaults to SENDER_POSTAL_ADDRESS.
  --crm <file>              Suppression source. Default: ${DEFAULT_CRM}
  --pilot <file>            Report pilot CSV. Default: ${DEFAULT_PILOT}
  --json <file>             Machine-readable result. Default: ${DEFAULT_JSON}
  --markdown <file>         Human review result. Default: ${DEFAULT_MARKDOWN}
  --help                    Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    senderEmail: process.env.OUTREACH_SENDER_EMAIL || "",
    dkimSelector: process.env.OUTREACH_DKIM_SELECTOR || "",
    postalAddress: process.env.SENDER_POSTAL_ADDRESS || "",
    crm: DEFAULT_CRM,
    pilot: DEFAULT_PILOT,
    json: DEFAULT_JSON,
    markdown: DEFAULT_MARKDOWN,
  };
  const mapping = {
    "--sender-email": "senderEmail",
    "--dkim-selector": "dkimSelector",
    "--postal-address": "postalAddress",
    "--crm": "crm",
    "--pilot": "pilot",
    "--json": "json",
    "--markdown": "markdown",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (mapping[key]) {
      args[mapping[key]] = value || "";
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
  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

async function readCsv(file) {
  try {
    return parseCsv(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function txt(name) {
  try {
    return (await resolveTxt(name)).map((parts) => parts.join("")).filter(Boolean);
  } catch (error) {
    if (["ENODATA", "ENOTFOUND", "ESERVFAIL", "ETIMEOUT"].includes(error?.code)) return [];
    throw error;
  }
}

function senderDomain(email) {
  return String(email || "").trim().toLowerCase().split("@")[1] || "";
}

function normalizeDomain(value) {
  try {
    return new URL(/^https?:\/\//i.test(String(value || "")) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return String(value || "").toLowerCase().replace(/^www\./, "");
  }
}

function contactEmail(row) {
  return String(row.contact_email || row.contact_url || "")
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .trim()
    .toLowerCase();
}

function check(id, passed, detail) {
  return { id, status: passed ? "pass" : "fail", detail };
}

function addHours(iso, amount) {
  const date = new Date(iso);
  date.setUTCHours(date.getUTCHours() + amount);
  return date.toISOString();
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const domain = senderDomain(args.senderEmail);
  const [crmRows, pilotRows, spfRecords, dmarcRecords, dkimRecords] = await Promise.all([
    readCsv(args.crm),
    readCsv(args.pilot),
    domain ? txt(domain) : [],
    domain ? txt(`_dmarc.${domain}`) : [],
    domain && args.dkimSelector ? txt(`${args.dkimSelector}._domainkey.${domain}`) : [],
  ]);
  const suppressedStatuses = new Set(["bounced", "unsubscribed", "not_fit", "no_reply_closed", "report_closed"]);
  const suppressedDomains = new Set(
    crmRows.filter((row) => suppressedStatuses.has(row.status)).map((row) => normalizeDomain(row.domain)),
  );
  const suppressedEmails = new Set(
    crmRows.filter((row) => suppressedStatuses.has(row.status)).map(contactEmail).filter(Boolean),
  );
  const pilotSuppressed = pilotRows.filter(
    (row) => suppressedDomains.has(normalizeDomain(row.domain)) || suppressedEmails.has(contactEmail(row)),
  );
  const nonCompanyContacts = pilotRows.filter((row) => !isCompanyDomainEmail(contactEmail(row)));
  const notReady = pilotRows.filter((row) => row.send_ready !== "true" || row.send_blockers);
  const checks = [
    check("sender_identity", isCompanyDomainEmail(args.senderEmail), args.senderEmail || "OUTREACH_SENDER_EMAIL is missing"),
    check("postal_address", Boolean(args.postalAddress.trim()), args.postalAddress ? "configured" : "SENDER_POSTAL_ADDRESS is missing"),
    check(
      "spf",
      Boolean(domain) && spfRecords.some((record) => /^v=spf1\b/i.test(record)),
      !domain ? "sender domain unavailable" : spfRecords.join(" | ") || `no SPF record at ${domain}`,
    ),
    check(
      "dmarc",
      Boolean(domain) && dmarcRecords.some((record) => /^v=DMARC1\b/i.test(record)),
      !domain ? "sender domain unavailable" : dmarcRecords.join(" | ") || `no DMARC record at _dmarc.${domain}`,
    ),
    check(
      "dkim",
      Boolean(args.dkimSelector) && dkimRecords.some((record) => /(?:^v=DKIM1\b|\bp=)/i.test(record)),
      args.dkimSelector
        ? dkimRecords.join(" | ") || `no DKIM record at ${args.dkimSelector}._domainkey.${domain}`
        : "OUTREACH_DKIM_SELECTOR is missing",
    ),
    check("pilot_present", pilotRows.length > 0, `${pilotRows.length} pilot row(s)`),
    check("pilot_company_contacts", nonCompanyContacts.length === 0, `${nonCompanyContacts.length} non-company contact(s)`),
    check("suppression", pilotSuppressed.length === 0, `${pilotSuppressed.length} suppressed pilot contact(s)`),
    check("pilot_report_ready", notReady.length === 0, `${notReady.length} pilot row(s) still blocked`),
  ];
  const generatedAt = new Date().toISOString();
  const result = {
    generated_at: generatedAt,
    valid_until: addHours(generatedAt, 24),
    status: checks.every((item) => item.status === "pass") ? "pass" : "blocked",
    sender_email: args.senderEmail,
    sender_domain: domain,
    dkim_selector: args.dkimSelector,
    postal_address_configured: Boolean(args.postalAddress.trim()),
    pilot: args.pilot,
    pilot_rows: pilotRows.length,
    checks,
    blocked_checks: checks.filter((item) => item.status === "fail").map((item) => item.id),
    blocked_domains: pilotSuppressed.map((row) => row.domain),
  };
  const markdown = [
    "# Report-first sender preflight",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${result.status}`,
    `Sender: ${args.senderEmail || "missing"}`,
    `Pilot rows: ${pilotRows.length}`,
    "",
    "| Check | Status | Detail |",
    "|---|---|---|",
    ...checks.map((item) => `| ${item.id} | ${item.status} | ${String(item.detail).replace(/\|/g, "/")} |`),
    "",
    result.status === "pass"
      ? "The local sender gate passed for 24 hours. Sending is still manual and every report remains inline in the email body."
      : "Do not generate or send the report-first pack until every failed check is resolved and this preflight is rerun.",
    "",
  ].join("\n");
  await Promise.all([
    writeText(args.json, `${JSON.stringify(result, null, 2)}\n`),
    writeText(args.markdown, markdown),
  ]);
  process.stdout.write(`Report-first sender preflight: ${result.status}.\n${args.json}\n${args.markdown}\n`);
  if (result.status !== "pass") process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
