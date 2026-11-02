#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-agency-handoff-note.md";
const DEFAULT_SCAN_OUTPUT = ".tmp/framer-handoff-scan.csv";
const DEFAULT_INPUT = ".tmp/framer-handoff-input.txt";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_LOCALE_PAGES = 3;

function usage() {
  return `
Usage:
  pnpm lead:handoff -- --url https://client-site.com
  pnpm lead:handoff -- --domain example.framer.website

Options:
  --url <url>              Public client URL to inspect.
  --domain <domain>        CRM domain to use when --url is not provided.
  --crm <file>             Local CRM CSV. Default: ${DEFAULT_CRM}
  --contact-email <email>  Reply email for the requester.
  --agency <name>          Agency or studio name from the request.
  --locales <text>         Locale context from the request.
  --context <text>         Launch or handoff context from the request.
  --output <file>          Markdown output. Default: ${DEFAULT_OUTPUT}
  --scan-output <file>     Intermediate lead scan CSV. Default: ${DEFAULT_SCAN_OUTPUT}
  --timeout-ms <number>    Per-request scan timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --max-locale-pages <n>   Locale pages sampled by the scanner. Default: ${DEFAULT_MAX_LOCALE_PAGES}
  --today <YYYY-MM-DD>     Report date. Default: local date.
  --help                   Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    output: DEFAULT_OUTPUT,
    scanOutput: DEFAULT_SCAN_OUTPUT,
    input: DEFAULT_INPUT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxLocalePages: DEFAULT_MAX_LOCALE_PAGES,
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
    if (key === "--url") {
      args.url = normalizeUrl(value);
      index += 1;
      continue;
    }
    if (key === "--domain") {
      args.domain = normalizeDomain(value);
      index += 1;
      continue;
    }
    if (key === "--crm") {
      args.crm = value;
      index += 1;
      continue;
    }
    if (key === "--contact-email") {
      args.contactEmail = normalizeEmail(value);
      index += 1;
      continue;
    }
    if (key === "--agency") {
      args.agency = value;
      index += 1;
      continue;
    }
    if (key === "--locales") {
      args.locales = value;
      index += 1;
      continue;
    }
    if (key === "--context") {
      args.context = value;
      index += 1;
      continue;
    }
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--scan-output") {
      args.scanOutput = value;
      index += 1;
      continue;
    }
    if (key === "--timeout-ms") {
      args.timeoutMs = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--max-locale-pages") {
      args.maxLocalePages = parsePositiveInt(value, key);
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

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
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

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = "";
    return url.href;
  } catch {
    return raw;
  }
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

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
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

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

async function readRows(file) {
  try {
    return parseCsv(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function resolveRequest(args) {
  if (args.url) {
    return {
      url: args.url,
      domain: normalizeDomain(args.url),
      contactEmail: args.contactEmail || "",
    };
  }

  if (!args.domain) {
    throw new Error("Provide --url or --domain.");
  }

  const rows = await readRows(args.crm);
  const row = rows.find((item) => normalizeDomain(item.domain) === args.domain);
  if (!row) {
    throw new Error(`No CRM row found for domain: ${args.domain}`);
  }

  return {
    url: normalizeUrl(row.final_url || row.domain),
    domain: normalizeDomain(row.domain),
    contactEmail: args.contactEmail || emailFromContact(row.contact_url),
    row,
  };
}

function emailFromContact(value) {
  const text = String(value || "");
  if (/^mailto:/i.test(text)) {
    return normalizeEmail(text.replace(/^mailto:/i, "").split("?")[0]);
  }
  return normalizeEmail(text);
}

async function scanUrl(url, args) {
  const inputFile = args.input === DEFAULT_INPUT ? `${args.scanOutput}.input.txt` : args.input;
  await writeText(inputFile, `${url}\n`);
  const commandArgs = [
    "tools/lead-finder/lead-finder.mjs",
    "--input",
    inputFile,
    "--output",
    args.scanOutput,
    "--concurrency",
    "1",
    "--timeout-ms",
    String(args.timeoutMs),
    "--max-locale-pages",
    String(args.maxLocalePages),
  ];

  await execFileAsync(process.execPath, commandArgs, { maxBuffer: 1024 * 1024 * 4 });
  const rows = parseCsv(await readFile(args.scanOutput, "utf8"));
  if (!rows.length) {
    throw new Error(`No scan row produced for ${url}`);
  }
  return rows[0];
}

function bool(value) {
  return String(value || "").toLowerCase() === "true";
}

function titleCaseFromDomain(domain) {
  return String(domain || "client site")
    .replace(/\.framer\.(website|app)$/i, "")
    .replace(/\..*$/, "")
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Client site";
}

function localeText(row, args) {
  if (args.locales) return args.locales;
  const locales = String(row.locales || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  if (locales.length) return locales.join(", ");
  return "not visible in the public scan";
}

function finding(check, observation, risk, fix) {
  return { check, observation, risk, fix };
}

function buildFindings(row, args) {
  const findings = [];
  const requestedLocales = hasMultipleRequestedLocales(args);

  if (!bool(row.is_framer)) {
    findings.push(finding(
      "Framer build signal",
      "The public HTML did not expose enough Framer markers for a high-confidence Framer detection.",
      "The handoff workflow may be pointing at the wrong public URL, an old domain, or a page where Framer assets are not visible to crawlers.",
      "Confirm the final published Framer URL before client handoff and rerun this public check on that exact domain.",
    ));
  }

  if (row.has_llms_txt === "false") {
    findings.push(finding(
      "llms.txt reachability",
      "No reachable root /llms.txt was found during the public scan.",
      "AI-search crawlers may understand the default page but miss the pages, locales, and context the client expects to be discoverable.",
      "Publish /llms.txt at the root with the priority client pages and visible locale URLs.",
    ));
  }

  if (row.has_jsonld === "false") {
    findings.push(finding(
      "Structured data",
      "No visible JSON-LD schema was found on the sampled public page.",
      "Search and answer engines get weaker entity context, which makes launch QA harder to prove to the client.",
      "Add Organization, WebSite, and page-type JSON-LD to the published page, then verify it outside the Framer editor.",
    ));
  } else if (row.has_jsonld_inlanguage === "false") {
    findings.push(finding(
      "Localized schema language",
      "JSON-LD exists, but no inLanguage field was detected in the sampled schema.",
      "Localized pages can look translated to users while crawlers still receive default-language structured context.",
      "Set inLanguage on locale-specific schema and verify the published HTML for every priority locale.",
    ));
  }

  if (row.meta_issue) {
    findings.push(finding(
      "Metadata drift",
      row.meta_issue,
      "The client may receive translated pages whose public metadata still repeats the default language or misses basic context.",
      "Review titles, descriptions, and CMS summary fields for the sampled locale pages before handoff.",
    ));
  }

  if (!bool(row.is_multilingual) && requestedLocales) {
    findings.push(finding(
      "Locale discovery",
      `The request mentioned ${args.locales}, but the public scan did not find multiple visible locale families.`,
      "A client can believe localization is live while crawlers and external reviewers only see the default site structure.",
      "Expose locale paths or hreflang/alternate links on the published site, then rerun the scan.",
    ));
  }

  const fallbacks = [
    finding(
      "Published-domain verification",
      "The scan result should be treated as a public-domain check, not a Framer canvas check.",
      "A handoff note based only on the editor can miss CDN, redirect, robots, and publish-state issues.",
      "Run the final QA pass after publish and record the public URL, timestamp, and owner in the client note.",
    ),
    finding(
      "Priority page coverage",
      "The quick pass starts at one URL and samples only a few linked locale pages.",
      "Important service, product, or CMS pages can fall outside the initial handoff evidence.",
      "Add the client's top 3 priority URLs to the handoff checklist and verify them one by one.",
    ),
    finding(
      "CMS collection spot-check",
      "CMS collection items need a separate spot-check for repeated titles, summaries, and schema fields.",
      "A clean homepage can hide repeated collection metadata that appears after launch.",
      "Check at least one published CMS item per priority locale before closing the handoff.",
    ),
  ];

  for (const item of fallbacks) {
    if (findings.length >= 3) break;
    findings.push(item);
  }

  return findings.slice(0, 3);
}

function hasMultipleRequestedLocales(args) {
  const localeTokens = String(args.locales || "")
    .split(/[,;|/]+|\band\b/gi)
    .map((item) => item.trim())
    .filter(Boolean);
  if (localeTokens.length > 1) return true;
  return /\b(multilingual|multi-language|localized|localised|locale|locales|translation)\b/i.test(args.context || "");
}

function renderFindingsTable(findings) {
  const lines = ["| Public check | Observation | Client risk | First fix |", "|---|---|---|---|"];
  for (const item of findings) {
    lines.push(
      `| ${escapeCell(item.check)} | ${escapeCell(item.observation)} | ${escapeCell(item.risk)} | ${escapeCell(item.fix)} |`,
    );
  }
  return lines.join("\n");
}

function escapeCell(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ");
}

function renderReplyEmail({ row, request, findings, args }) {
  const brand = titleCaseFromDomain(row.domain || request.domain);
  const greeting = args.agency ? `${args.agency} team` : "there";
  const contextLine = args.context ? `Context I used: ${args.context}` : "Context I used: public published-site check.";
  const localeLine = `Locales/context visible from the request or scan: ${localeText(row, args)}.`;

  return {
    subject: `3-point Framer handoff QA note for ${brand}`,
    body: `Hi ${greeting},

Thanks for sending the URL. I kept this to a compact handoff note your team can adapt for the client.

${contextLine}
${localeLine}

${findings.map((item, index) => `${index + 1}. ${item.check}: ${item.observation} Risk: ${item.risk} First fix: ${item.fix}`).join("\n\n")}

If this is useful, the next paid step would be turning the fixes into a launch QA pass across the client's priority pages and CMS collections.

Best,
Jimmy`,
  };
}

function renderMarkdown({ row, request, findings, args }) {
  const brand = titleCaseFromDomain(row.domain || request.domain);
  const email = renderReplyEmail({ row, request, findings, args });
  const contactEmail = request.contactEmail || args.contactEmail || "";
  const intakeCommand = [
    "pnpm lead:intake --",
    "--site-url",
    shellQuote(request.url),
    contactEmail ? `--contact-email ${shellQuote(contactEmail)}` : "",
    "--source agency_page",
    "--next-action send_agency_handoff_note_or_book_call",
    "--revenue-path launch_qa",
    "--deal-value 750",
    `--note ${shellQuote(`agency handoff note generated ${args.today}`)}`,
  ].filter(Boolean).join(" ");

  return `# Agency Handoff Note

Date: ${args.today}
Client URL: ${request.url}
Domain: ${row.domain || request.domain}
Agency: ${args.agency || "not provided"}
Contact email: ${contactEmail || "not provided"}
Visible locales/context: ${localeText(row, args)}
Launch context: ${args.context || "not provided"}

## Client-Ready Summary

I checked the public Framer launch for AI-search readiness across crawler context, localized schema/metadata, CMS handoff risk, and published-page verification. The most useful handoff is below: three findings, why each matters to the client, and the first fix to record.

${renderFindingsTable(findings)}

## Scan Evidence

- Final URL: ${row.final_url || request.url}
- Framer: ${row.is_framer} (${row.framer_confidence || 0}/100; ${row.framer_signals || "no public signal"})
- Multilingual: ${row.is_multilingual} (${row.locales || "no visible locales"})
- llms.txt reachable: ${row.has_llms_txt}
- JSON-LD present: ${row.has_jsonld}
- JSON-LD inLanguage: ${row.has_jsonld_inlanguage}
- Meta issue: ${row.meta_issue || "none detected in quick sample"}
- Scanner notes: ${row.notes || "none"}

## Reply Email

\`\`\`text
Subject: ${email.subject}

${email.body}
\`\`\`

## CRM Commands

After sending this note:

\`\`\`bash
${intakeCommand}
pnpm lead:crm -- --domain ${row.domain || request.domain} --set-status mini_audit_sent --revenue-path launch_qa --deal-value 750 --note "sent agency handoff note"
pnpm lead:crm -- --domain ${row.domain || request.domain} --set-status service_offer --revenue-path launch_qa --deal-value 750 --note "asked about implementation scope"
\`\`\`
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const request = await resolveRequest(args);
  const row = await scanUrl(request.url, args);
  const findings = buildFindings(row, args);
  const markdown = renderMarkdown({ row, request, findings, args });
  await writeText(args.output, markdown);
  process.stdout.write(`Agency handoff note written to ${args.output}\n`);
  process.stdout.write(`Scan CSV: ${args.scanOutput}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
