#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-mini-audits.md";
const DEFAULT_STATUS = "replied";
const DEFAULT_PLUGIN_VALUE_USD = 190;
const BRAND_OVERRIDES = new Map([
  ["attrad", "AT TRAD"],
  ["gunjanb", "Gunjan B"],
  ["jasonkitio", "Jason Kitio"],
  ["svikoudev", "SVIKOUDEV"],
  ["syqi", "SYQI Creatives"],
  ["wakafoils", "Waka Foils"],
]);

function usage() {
  return `
Usage:
  pnpm lead:audit
  pnpm lead:audit -- --status replied
  pnpm lead:audit -- --domain example.framer.website

Options:
  --crm <file>                  Local CRM CSV. Default: ${DEFAULT_CRM}
  --output <file>               Markdown reply kit. Default: ${DEFAULT_OUTPUT}
  --status <status|all>         CRM status to include. Default: ${DEFAULT_STATUS}
  --domain <domain>             Generate for one domain regardless of status.
  --plugin-value-usd <amount>   Value used for Pro conversion commands. Default: ${DEFAULT_PLUGIN_VALUE_USD}
  --today <YYYY-MM-DD>          Report date. Default: local date.
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    output: DEFAULT_OUTPUT,
    status: DEFAULT_STATUS,
    pluginValueUsd: DEFAULT_PLUGIN_VALUE_USD,
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
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--status") {
      args.status = value;
      index += 1;
      continue;
    }
    if (key === "--domain") {
      args.domain = normalizeDomain(value);
      index += 1;
      continue;
    }
    if (key === "--plugin-value-usd") {
      args.pluginValueUsd = parseMoney(value, key);
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

function parseMoney(value, name) {
  const parsed = Number.parseFloat(String(value || "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
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

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function domainBrand(row) {
  const compact = String(row.domain || "")
    .replace(/\.framer\.website$/i, "")
    .replace(/\.framer\.app$/i, "")
    .replace(/\..*$/, "");

  if (BRAND_OVERRIDES.has(compact)) {
    return BRAND_OVERRIDES.get(compact);
  }

  return compact
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function greetingName(row) {
  const brand = domainBrand(row);
  const firstWord = brand.split(/\s+/)[0];
  const looksPersonal =
    /^[A-Z][a-z]+$/.test(firstWord) &&
    /\b(design|designer|dev|developer|portfolio|creative)\b/i.test(`${row.final_url} ${row.subject}`);

  return looksPersonal ? firstWord : `${brand} team`;
}

function localePhrase(row) {
  const names = {
    en: "English",
    et: "Estonian",
    fr: "French",
    de: "German",
    es: "Spanish",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    "zh-cn": "Simplified Chinese",
    "zh-tw": "Traditional Chinese",
  };
  const families = Array.from(
    new Set(
      String(row.locales || "")
        .split(/[|,;]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .map((item) => (item === "zh-cn" || item === "zh-tw" ? item : item.split("-")[0])),
    ),
  );

  if (families.length >= 2) {
    return `${families.map((item) => names[item] || item).join(" and ")} versions`;
  }
  return "the localized pages";
}

function auditIssues(row) {
  return [row.issue_1, row.issue_2, row.issue_3]
    .map((issue) => String(issue || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildReplyEmail(row) {
  const brand = domainBrand(row);
  const greeting = greetingName(row);
  const issues = auditIssues(row);
  const issueLines = issues.length
    ? issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")
    : "1. I need to re-open the live site before sending a concrete finding.";

  return {
    subject: `3-point Framer AEO mini audit for ${brand}`,
    body: `Hi ${greeting},

Thanks for taking a look. I kept this to public checks I can verify from outside the Framer project.

${issueLines}

Why I would fix this: ${localePhrase(row)} should give AI search and crawlers the same clear business context as the default version, not just translated visible copy.

Fastest path:
- Add per-locale JSON-LD with the right inLanguage values.
- Publish llms.txt / localized llms files where the Framer plan supports static files.
- Re-run the published-site verifier after deploy so the public domain, not only the Framer canvas, is checked.

Polyglot AEO handles that workflow inside Framer. The free install is enough to verify the problem; Pro is $19/mo or $190/year if you want the full multilingual generation workflow.

If you want, send me the highest-priority locale/page and I will point to the smallest fix first.

Best,
Jimmy

https://polyglotaeo.com`,
  };
}

function selectRows(rows, args) {
  if (args.domain) {
    return rows.filter((row) => normalizeDomain(row.domain) === args.domain);
  }
  if (args.status === "all") {
    return rows;
  }
  return rows.filter((row) => row.status === args.status);
}

function renderMarkdown(rows, args) {
  const lines = [
    "# Framer Mini Audit Reply Kit",
    "",
    `Date: ${args.today}`,
    `CRM: ${args.crm}`,
    "",
    "Use this after a lead replies or asks for the promised 3-point mini audit.",
    "",
  ];

  if (!rows.length) {
    lines.push("No CRM rows matched the requested domain/status.");
    lines.push("");
    lines.push("Typical command after a reply:");
    lines.push("");
    lines.push("```bash");
    lines.push("pnpm lead:audit -- --status replied");
    lines.push("```");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Domain | Status | Contact | Revenue path |");
  lines.push("|---|---|---|---|");
  for (const row of rows) {
    lines.push(
      `| ${row.domain || ""} | ${row.status || ""} | ${row.contact_url || "manual"} | ${row.revenue_path || "plugin_pro / launch_qa"} |`,
    );
  }
  lines.push("");

  for (const row of rows) {
    const email = buildReplyEmail(row);
    lines.push(`## ${row.domain}`);
    lines.push("");
    lines.push(`- URL: ${row.final_url || row.domain}`);
    lines.push(`- Locales: ${row.locales || "unknown"}`);
    lines.push(`- Contact: ${row.contact_url || "manual"}`);
    lines.push(`- Current status: ${row.status || "unknown"}`);
    lines.push(`- Current revenue path: ${row.revenue_path || "not set"}`);
    lines.push("");
    lines.push("Reply email:");
    lines.push("");
    lines.push("```text");
    lines.push(`Subject: ${email.subject}`);
    lines.push("");
    lines.push(email.body);
    lines.push("```");
    lines.push("");
    lines.push("After sending the mini audit:");
    lines.push("");
    lines.push("```bash");
    lines.push(
      `pnpm lead:crm -- --domain ${row.domain} --set-status mini_audit_sent --revenue-path plugin_pro --deal-value ${args.pluginValueUsd} --note "sent 3-point mini audit"`,
    );
    lines.push("```");
    lines.push("");
    lines.push("If they ask for implementation help:");
    lines.push("");
    lines.push("```bash");
    lines.push(
      `pnpm lead:crm -- --domain ${row.domain} --set-status service_offer --revenue-path launch_qa --note "asked for paid implementation scope"`,
    );
    lines.push("```");
    lines.push("");
    lines.push("If they buy Pro:");
    lines.push("");
    lines.push("```bash");
    lines.push(
      `pnpm lead:crm -- --domain ${row.domain} --set-status paid_plugin --revenue-path plugin_pro --deal-value ${args.pluginValueUsd} --note "converted to Pro"`,
    );
    lines.push("```");
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

  const rows = selectRows(await readRows(args.crm), args);
  const markdown = renderMarkdown(rows, args);
  await writeText(args.output, markdown);
  process.stdout.write(markdown);
  process.stdout.write(`Reply kit written to ${args.output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
