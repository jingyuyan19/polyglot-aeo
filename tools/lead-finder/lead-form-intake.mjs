#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_SITE_ID = "49fc3e5b-7ff7-4185-b578-60c81e3168ff";
const DEFAULT_FORM_NAME = "framer-aeo-mini-audit";
const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-form-intake.md";
const DEFAULT_JSON = ".tmp/framer-form-intake.json";
const DEFAULT_AGENCY_DEAL_VALUE_USD = 750;
const DEFAULT_PLUGIN_DEAL_VALUE_USD = 190;
const REQUEST_ATTEMPTS = Number(process.env.NETLIFY_REQUEST_RETRIES || 6);

function usage() {
  return `
Usage:
  pnpm lead:forms
  pnpm lead:forms -- --apply

Options:
  --site <id>       Netlify site id. Default: ${DEFAULT_SITE_ID}
  --form <name>     Netlify form name. Default: ${DEFAULT_FORM_NAME}
  --crm <file>      Local CRM CSV. Default: ${DEFAULT_CRM}
  --output <file>   Markdown report. Default: ${DEFAULT_OUTPUT}
  --json <file>     JSON report. Default: ${DEFAULT_JSON}
  --apply           Upsert new submissions into CRM with pnpm lead:intake.
  --help            Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    site: process.env.NETLIFY_SITE_ID || DEFAULT_SITE_ID,
    form: process.env.NETLIFY_FORM_NAME || DEFAULT_FORM_NAME,
    crm: DEFAULT_CRM,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--site") {
      args.site = value;
      index += 1;
      continue;
    }
    if (key === "--form") {
      args.form = value;
      index += 1;
      continue;
    }
    if (key === "--crm") {
      args.crm = value;
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
    if (key === "--apply") {
      args.apply = true;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

async function readNetlifyToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;

  const configPath = path.join(os.homedir(), "Library/Preferences/netlify/config.json");
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    return config?.users?.[config.userId]?.auth?.token || config?.auth?.token || config?.token || "";
  } catch {
    return "";
  }
}

async function netlifyJson({ token, path: requestPath }) {
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await requestOnce({ token, path: requestPath });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === REQUEST_ATTEMPTS) break;
      process.stderr.write(`Netlify request retry ${attempt}/${REQUEST_ATTEMPTS - 1}: ${error.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw lastError;
}

function requestOnce({ token, path: requestPath }) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: "GET",
        hostname: "api.netlify.com",
        path: requestPath,
        timeout: 60000,
        agent: false,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          Connection: "close",
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(JSON.parse(text));
            return;
          }

          const error = new Error(`Netlify API returned HTTP ${response.statusCode}: ${text.slice(0, 200)}`);
          error.statusCode = response.statusCode;
          reject(error);
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("Netlify API request timed out")));
    request.on("error", reject);
    request.end();
  });
}

function isRetryable(error) {
  if (error.statusCode && error.statusCode >= 500) return true;
  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(error.code) || /timed out|ECONNRESET|socket hang up/i.test(error.message);
}

async function readCrmDomains(file) {
  try {
    const text = await readFile(file, "utf8");
    const rows = parseCsv(text);
    return new Set(rows.map((row) => normalizeDomain(row.domain)).filter(Boolean));
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
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

  if (cell || row.length) row.push(cell);
  if (row.length) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
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

function valueFromSubmission(submission, key) {
  return (
    submission?.data?.[key] ||
    submission?.body?.[key] ||
    submission?.[key] ||
    ""
  );
}

function normalizeSubmission(submission, crmDomains) {
  const siteUrl = String(valueFromSubmission(submission, "site_url")).trim();
  const contactEmail = normalizeEmail(valueFromSubmission(submission, "contact_email") || submission.email);
  const locales = String(valueFromSubmission(submission, "locales")).trim();
  const concern = String(valueFromSubmission(submission, "concern")).trim();
  const agencyName = String(valueFromSubmission(submission, "agency_name")).trim();
  const requestType = String(valueFromSubmission(submission, "request_type")).trim();
  const sourcePage = String(valueFromSubmission(submission, "source_page")).trim();
  const utmSource = String(valueFromSubmission(submission, "utm_source")).trim();
  const utmMedium = String(valueFromSubmission(submission, "utm_medium")).trim();
  const utmCampaign = String(valueFromSubmission(submission, "utm_campaign")).trim();
  const utmContent = String(valueFromSubmission(submission, "utm_content")).trim();
  const utmTerm = String(valueFromSubmission(submission, "utm_term")).trim();
  const landingPath = String(valueFromSubmission(submission, "landing_path")).trim();
  const referrer = String(valueFromSubmission(submission, "referrer")).trim();
  const isAgencyRequest = requestType === "agency_template" || sourcePage === "/agency/";
  const isLlmsRequest = requestType === "llms_txt_check" || sourcePage === "/llms-txt/";
  const source = isAgencyRequest ? "agency_page" : isLlmsRequest ? "llms_txt_page" : "audit_page";
  const revenuePath = isAgencyRequest ? "launch_qa" : isLlmsRequest ? "plugin_pro" : "";
  const dealValueUsd = isAgencyRequest
    ? String(DEFAULT_AGENCY_DEAL_VALUE_USD)
    : isLlmsRequest
      ? String(DEFAULT_PLUGIN_DEAL_VALUE_USD)
      : "";
  const nextAction = isAgencyRequest
    ? "send_agency_handoff_note_or_book_call"
    : isLlmsRequest
      ? "send_llms_txt_check_or_plugin_install"
      : "send_mini_audit_or_book_call";
  const domain = normalizeDomain(siteUrl);
  const status = !siteUrl ? "missing_site_url" : crmDomains.has(domain) ? "already_in_crm" : "new";

  return {
    id: submission.id || "",
    number: submission.number || "",
    created_at: submission.created_at || submission.createdAt || "",
    site_url: siteUrl,
    domain,
    contact_email: contactEmail,
    locales,
    concern,
    agency_name: agencyName,
    request_type: requestType,
    source_page: sourcePage,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    landing_path: landingPath,
    referrer,
    source,
    revenue_path: revenuePath,
    deal_value_usd: dealValueUsd,
    next_action: nextAction,
    status,
    intake_command: siteUrl
      ? intakeCommand({
          siteUrl,
          contactEmail,
          locales,
          concern,
          agencyName,
          requestType,
          sourcePage,
          source,
          revenuePath,
          dealValueUsd,
          nextAction,
          id: submission.id,
        })
      : "",
    audit_command: domain
      ? isAgencyRequest
        ? handoffCommand({ siteUrl, contactEmail, locales, concern, agencyName, domain })
        : `pnpm lead:audit -- --domain ${domain}`
      : "",
  };
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key] || "unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderCounts(title, counts, emptyText) {
  const lines = [`## ${title}`, ""];
  const visible = counts.filter(([value]) => value && value !== "unknown");
  if (!visible.length) {
    lines.push(emptyText, "");
    return lines;
  }

  lines.push("| Value | Submissions |");
  lines.push("|---|---:|");
  for (const [value, count] of visible) {
    lines.push(`| ${value} | ${count} |`);
  }
  lines.push("");
  return lines;
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function intakeCommand({
  siteUrl,
  contactEmail,
  locales,
  concern,
  agencyName,
  requestType,
  sourcePage,
  source,
  revenuePath,
  dealValueUsd,
  nextAction,
  id,
}) {
  const args = [
    "pnpm lead:intake --",
    "--site-url",
    shellQuote(siteUrl),
  ];
  if (contactEmail) {
    args.push("--contact-email", shellQuote(contactEmail));
  }
  if (source) {
    args.push("--source", shellQuote(source));
  }
  if (nextAction) {
    args.push("--next-action", shellQuote(nextAction));
  }
  if (revenuePath) {
    args.push("--revenue-path", shellQuote(revenuePath));
  }
  if (dealValueUsd) {
    args.push("--deal-value", shellQuote(dealValueUsd));
  }
  const note = [
    id ? `netlify form submission ${id}` : "netlify form submission",
    requestType ? `request type: ${requestType}` : "",
    sourcePage ? `source page: ${sourcePage}` : "",
    agencyName ? `agency: ${agencyName}` : "",
    locales ? `locales: ${locales}` : "",
    concern ? `concern: ${concern}` : "",
  ].filter(Boolean).join(" / ");
  args.push("--note", shellQuote(note));
  return args.join(" ");
}

function handoffCommand({ siteUrl, contactEmail, locales, concern, agencyName, domain }) {
  const args = [
    "pnpm lead:handoff --",
    "--url",
    shellQuote(siteUrl),
    "--output",
    shellQuote(`.tmp/framer-handoff-${domain}.md`),
  ];
  if (contactEmail) {
    args.push("--contact-email", shellQuote(contactEmail));
  }
  if (agencyName) {
    args.push("--agency", shellQuote(agencyName));
  }
  if (locales) {
    args.push("--locales", shellQuote(locales));
  }
  if (concern) {
    args.push("--context", shellQuote(concern));
  }
  return args.join(" ");
}

async function applySubmission(item) {
  if (!item.site_url) return { item, skipped: "missing site_url" };

  const note = [
    `netlify form submission ${item.id}`,
    item.request_type ? `request type: ${item.request_type}` : "",
    item.source_page ? `source page: ${item.source_page}` : "",
    item.agency_name ? `agency: ${item.agency_name}` : "",
    item.locales ? `locales: ${item.locales}` : "",
    item.concern ? `concern: ${item.concern}` : "",
  ].filter(Boolean).join(" / ");
  const args = ["lead:intake", "--", "--site-url", item.site_url];
  if (item.contact_email) {
    args.push("--contact-email", item.contact_email);
  }
  if (item.source) {
    args.push("--source", item.source);
  }
  if (item.next_action) {
    args.push("--next-action", item.next_action);
  }
  if (item.revenue_path) {
    args.push("--revenue-path", item.revenue_path);
  }
  if (item.deal_value_usd) {
    args.push("--deal-value", item.deal_value_usd);
  }
  args.push("--note", note);

  const { stdout } = await execFileAsync("pnpm", args, { maxBuffer: 1024 * 1024 });
  return { item, stdout: stdout.trim() };
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function renderMarkdown({ form, items, applied }) {
  const lines = [
    "# Framer Audit Form Intake",
    "",
    `Form: ${form.name} (${form.id})`,
    `Submissions: ${items.length}`,
    "",
  ];

  if (!items.length) {
    lines.push("No form submissions yet.");
    return `${lines.join("\n")}\n`;
  }

  lines.push(...renderCounts("By UTM Campaign", countBy(items, "utm_campaign"), "No UTM campaigns on form submissions yet."));
  lines.push(...renderCounts("By UTM Source", countBy(items, "utm_source"), "No UTM sources on form submissions yet."));
  lines.push(...renderCounts("By Landing Path", countBy(items, "landing_path"), "No landing paths captured yet."));

  lines.push("| Created | Status | Type | Domain | Email | Locales |");
  lines.push("|---|---|---|---|---|---|");
  for (const item of items) {
    lines.push(
      `| ${item.created_at || "unknown"} | ${item.status} | ${item.request_type || "mini_audit"} | ${item.domain || "missing"} | ${item.contact_email || "missing"} | ${item.locales || ""} |`,
    );
  }
  lines.push("");

  for (const item of items) {
    lines.push(`## ${item.domain || item.id || "submission"}`);
    lines.push("");
    lines.push(`- Submission id: ${item.id || "unknown"}`);
    lines.push(`- Site URL: ${item.site_url || "missing"}`);
    lines.push(`- Contact email: ${item.contact_email || "missing"}`);
    lines.push(`- Request type: ${item.request_type || "mini_audit"}`);
    lines.push(`- Source page: ${item.source_page || "not provided"}`);
    lines.push(`- Landing path: ${item.landing_path || "not provided"}`);
    lines.push(`- UTM campaign: ${item.utm_campaign || "not provided"}`);
    lines.push(`- UTM source: ${item.utm_source || "not provided"}`);
    lines.push(`- Referrer: ${item.referrer || "not provided"}`);
    lines.push(`- Agency: ${item.agency_name || "not provided"}`);
    lines.push(`- Locales: ${item.locales || "not provided"}`);
    lines.push(`- Concern: ${item.concern || "not provided"}`);
    lines.push(`- Source: ${item.source || "audit_page"}`);
    if (item.revenue_path) {
      lines.push(`- Revenue path: ${item.revenue_path} (${item.deal_value_usd || "0"} USD estimate)`);
    }
    lines.push(`- CRM status: ${item.status}`);
    if (item.intake_command) {
      lines.push("");
      lines.push("```bash");
      lines.push(item.intake_command);
      lines.push(item.audit_command);
      lines.push("```");
    }
    lines.push("");
  }

  if (applied.length) {
    lines.push("## Applied");
    lines.push("");
    for (const result of applied) {
      lines.push(`- ${result.item.domain || result.item.id}: ${result.stdout || result.skipped}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const token = await readNetlifyToken();
  if (!token) {
    throw new Error("Netlify token not found. Run netlify login or set NETLIFY_AUTH_TOKEN.");
  }

  const forms = await netlifyJson({
    token,
    path: `/api/v1/sites/${encodeURIComponent(args.site)}/forms`,
  });
  const form = forms.find((item) => item.name === args.form);
  if (!form) {
    throw new Error(`Netlify form not found: ${args.form}`);
  }

  const submissions = await netlifyJson({
    token,
    path: `/api/v1/forms/${encodeURIComponent(form.id)}/submissions`,
  });
  const crmDomains = await readCrmDomains(args.crm);
  const items = submissions.map((submission) => normalizeSubmission(submission, crmDomains));
  const applied = [];

  if (args.apply) {
    for (const item of items.filter((entry) => entry.status !== "already_in_crm")) {
      applied.push(await applySubmission(item));
    }
  }

  await writeText(args.output, renderMarkdown({ form, items, applied }));
  await writeText(args.json, `${JSON.stringify({ form, submissions: items, applied }, null, 2)}\n`);

  process.stdout.write(`Form submissions: ${items.length}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  if (args.apply) {
    process.stdout.write(`Applied: ${applied.length}\n`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
