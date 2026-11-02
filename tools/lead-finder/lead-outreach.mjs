#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_INPUT = ".tmp/framer-leads.csv";
const DEFAULT_OUTPUT_MD = ".tmp/framer-outreach.md";
const DEFAULT_OUTPUT_CSV = ".tmp/framer-outreach.csv";
const DEFAULT_MIN_SCORE = 70;
const DEFAULT_LIMIT = 10;
const DEFAULT_SENDER = "Jimmy";
const DEFAULT_PLUGIN_URL = "https://polyglotaeo.com/audit/";

const MAIL_COLUMNS = [
  "domain",
  "final_url",
  "locales",
  "score",
  "contact_url",
  "contact_channel",
  "subject",
  "issue_1",
  "issue_2",
  "issue_3",
  "email_body",
  "contact_form_body",
  "manual_check",
];

function usage() {
  return `
Usage:
  pnpm lead:outreach -- --input .tmp/framer-leads.csv
  node tools/lead-finder/lead-outreach.mjs --input .tmp/framer-leads.csv --limit 10

Options:
  --input <file>                 Lead CSV from lead:find. Default: ${DEFAULT_INPUT}
  --output-md <file>             Markdown mini-audit brief. Default: ${DEFAULT_OUTPUT_MD}
  --output-csv <file>            Mail-merge CSV. Default: ${DEFAULT_OUTPUT_CSV}
  --min-score <number>           Minimum pain_score. Default: ${DEFAULT_MIN_SCORE}
  --limit <number>               Maximum leads to draft. Default: ${DEFAULT_LIMIT}
  --sender <name>                Email signature name. Default: ${DEFAULT_SENDER}
  --plugin-url <url>             Product URL in drafts. Default: ${DEFAULT_PLUGIN_URL}
  --include-single-locale        Include Framer rows not confirmed as multilingual.
  --include-nonframer            Include rows not confirmed as Framer.
  --help                         Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    outputMd: DEFAULT_OUTPUT_MD,
    outputCsv: DEFAULT_OUTPUT_CSV,
    minScore: DEFAULT_MIN_SCORE,
    limit: DEFAULT_LIMIT,
    sender: DEFAULT_SENDER,
    pluginUrl: DEFAULT_PLUGIN_URL,
    includeSingleLocale: false,
    includeNonframer: false,
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
    if (key === "--input") {
      args.input = value;
      index += 1;
      continue;
    }
    if (key === "--output-md") {
      args.outputMd = value;
      index += 1;
      continue;
    }
    if (key === "--output-csv") {
      args.outputCsv = value;
      index += 1;
      continue;
    }
    if (key === "--min-score") {
      args.minScore = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--limit") {
      args.limit = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--sender") {
      args.sender = value;
      index += 1;
      continue;
    }
    if (key === "--plugin-url") {
      args.pluginUrl = value;
      index += 1;
      continue;
    }
    if (key === "--include-single-locale") {
      args.includeSingleLocale = true;
      continue;
    }
    if (key === "--include-nonframer") {
      args.includeNonframer = true;
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

  if (rows.length === 0) {
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
    [MAIL_COLUMNS.join(","), ...rows.map((row) => MAIL_COLUMNS.map((column) => csvEscape(row[column])).join(","))].join(
      "\n",
    ) + "\n"
  );
}

function bool(value) {
  return String(value).toLowerCase() === "true";
}

function score(row) {
  return Number.parseInt(row.pain_score || "0", 10) || 0;
}

function splitList(value) {
  return String(value || "")
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function qualifyRows(rows, args) {
  const qualified = rows
    .filter((row) => score(row) >= args.minScore)
    .filter((row) => args.includeNonframer || bool(row.is_framer))
    .filter((row) => args.includeSingleLocale || bool(row.is_multilingual))
    .sort((a, b) => score(b) - score(a));

  const seenDomains = new Set();
  const deduped = [];

  for (const row of qualified) {
    const domain = String(row.domain || row.final_url || row.url).toLowerCase();
    if (seenDomains.has(domain)) {
      continue;
    }
    seenDomains.add(domain);
    deduped.push(row);
  }

  return deduped.slice(0, args.limit);
}

function localePhrase(row) {
  const locales = splitList(row.locales);
  if (locales.length >= 3) {
    return `${locales.length} locale signals (${locales.slice(0, 4).join(", ")})`;
  }
  if (locales.length === 2) {
    return `two locale signals (${locales.join(", ")})`;
  }
  if (locales.length === 1) {
    return `one visible locale signal (${locales[0]})`;
  }
  return "localized pages";
}

function buildIssues(row) {
  const issues = [];
  const locales = splitList(row.locales);
  const framerSignals = splitList(row.framer_signals);
  const multilingualSignals = splitList(row.multilingual_signals);

  if (!bool(row.has_llms_txt)) {
    issues.push("No reachable /llms.txt was detected at the site root.");
  }

  if (!bool(row.has_jsonld)) {
    issues.push("No visible JSON-LD schema was detected on the homepage HTML.");
  } else if (!bool(row.has_jsonld_inlanguage)) {
    issues.push("JSON-LD exists, but no inLanguage field was detected in sampled schema.");
  }

  if (row.meta_issue) {
    issues.push(`Metadata issue from the crawl: ${row.meta_issue}.`);
  }

  if (bool(row.is_multilingual)) {
    issues.push(
      `The crawler found ${localePhrase(row)}. AEO checks should be verified per locale, not only on the default page.`,
    );
  }

  if (framerSignals.length) {
    issues.push(`Framer confidence is ${row.framer_confidence}/100 from signals: ${framerSignals.join(", ")}.`);
  }

  if (multilingualSignals.length && locales.length > 1) {
    issues.push(`Locale evidence came from ${multilingualSignals.join(", ")}.`);
  }

  if (issues.length === 0) {
    issues.push("Manual review is needed before outreach; the scanner did not find a concrete AEO gap.");
  }

  return issues.slice(0, 3);
}

function primaryIssue(issues) {
  return issues.find((issue) => !/^Framer confidence/.test(issue)) || issues[0];
}

function manualCheck(row) {
  const checks = [
    "Open the live site before sending.",
    "Verify the site is a real business or agency, not a template/demo.",
  ];

  if (!row.contact_email && !row.contact_url) {
    checks.push("Find a human contact on the site or LinkedIn.");
  } else if (row.contact_page && !row.contact_email) {
    checks.push(`Contact page found at ${row.contact_page}; find the responsible person before sending.`);
  }
  if (!bool(row.is_multilingual)) {
    checks.push("Confirm multilingual intent manually.");
  }
  if (/fetch failed|HTTP|timeout/i.test(row.notes || "")) {
    checks.push(`Scanner note: ${row.notes}.`);
  }

  return checks.join(" ");
}

function buildEmail(row, issues, args) {
  const domain = row.domain || row.final_url || row.url;
  const issue = primaryIssue(issues);
  const subject = `quick AEO QA note for ${domain}`;
  const body = `Hi team,

I was reviewing Framer multilingual sites and noticed ${domain} has ${localePhrase(row)}.

One public QA finding: ${issue} For localized Framer sites, that can make AI search and crawlers understand the default page while missing the localized version.

I built Polyglot AEO for this exact Framer handoff: localized schema, llms.txt files, CMS gap checks, and published-site verification inside Framer.

Want me to send a short 3-point mini audit for this site?

Best,
${args.sender}

${args.pluginUrl}`;

  return { subject, body };
}

function contactChannel(row) {
  if (row.contact_email || /^mailto:/i.test(row.contact_url || "")) {
    return "email";
  }
  if (/^https?:\/\//i.test(row.contact_page || row.contact_url || "")) {
    return "contact_page";
  }
  return "manual";
}

function contactTarget(row) {
  if (row.contact_email) {
    return `mailto:${row.contact_email}`;
  }
  return row.contact_url || row.contact_page || "";
}

function buildContactFormBody(row, issues, args) {
  const domain = row.domain || row.final_url || row.url;
  const issue = primaryIssue(issues);

  return `Hi team,

I checked the public Framer site at ${domain} and noticed one multilingual AEO QA issue: ${issue}

I built Polyglot AEO to help Framer teams verify localized schema, llms.txt, CMS gaps, and published-site AEO before and after launch.

Happy to send a short 3-point mini audit if useful.

${args.sender}
${args.pluginUrl}`;
}

function outreachRows(rows, args) {
  return rows.map((row) => {
    const issues = buildIssues(row);
    const email = buildEmail(row, issues, args);
    const channel = contactChannel(row);
    return {
      domain: row.domain || "",
      final_url: row.final_url || row.url || "",
      locales: row.locales || "",
      score: String(score(row)),
      contact_url: contactTarget(row),
      contact_channel: channel,
      subject: email.subject,
      issue_1: issues[0] || "",
      issue_2: issues[1] || "",
      issue_3: issues[2] || "",
      email_body: email.body,
      contact_form_body: channel === "contact_page" ? buildContactFormBody(row, issues, args) : "",
      manual_check: manualCheck(row),
    };
  });
}

function renderMarkdown(rows, drafts, args) {
  const generatedAt = new Date().toISOString();
  const lines = [
    "# Framer Outreach Brief",
    "",
    `Generated: ${generatedAt}`,
    `Input: ${args.input}`,
    `Filter: pain_score >= ${args.minScore}, Framer only${args.includeSingleLocale ? "" : ", multilingual only"}`,
    "",
    "## Send Rules",
    "",
    "- Do not send a draft until the site is manually opened and the issue is verified.",
    "- Do not contact template/demo sites unless there is a real agency or maker behind them.",
    "- Keep the first email to one specific finding and one helpful offer.",
    "- Stop after the Day 10 follow-up if there is no reply.",
    "",
    "## Qualified Leads",
    "",
  ];

  if (drafts.length === 0) {
    lines.push("No qualified leads matched the current filter.");
    lines.push("");
    lines.push("Try lowering `--min-score`, adding more prospects, or using `--include-single-locale` only for manual research.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Score | Domain | Channel | Contact | Primary issue |");
  lines.push("|---:|---|---|---|---|");
  for (const draft of drafts) {
    lines.push(
      `| ${draft.score} | ${draft.domain} | ${draft.contact_channel} | ${draft.contact_url || "manual"} | ${draft.issue_1.replace(/\|/g, "/")} |`,
    );
  }

  lines.push("");
  lines.push("## Mini Audits And Drafts");
  lines.push("");

  rows.forEach((row, index) => {
    const draft = drafts[index];
    lines.push(`### ${index + 1}. ${draft.domain || row.final_url}`);
    lines.push("");
    lines.push(`- Score: ${draft.score}`);
    lines.push(`- Final URL: ${draft.final_url || row.final_url || row.url}`);
    lines.push(`- Locales: ${draft.locales || row.locales || "not detected"}`);
    lines.push(`- Channel: ${draft.contact_channel}`);
    lines.push(`- Contact: ${draft.contact_url || "manual research needed"}`);
    lines.push(`- Manual check: ${draft.manual_check}`);
    lines.push("");
    lines.push("Mini audit:");
    lines.push("");
    lines.push(`1. ${draft.issue_1}`);
    if (draft.issue_2) lines.push(`2. ${draft.issue_2}`);
    if (draft.issue_3) lines.push(`3. ${draft.issue_3}`);
    lines.push("");
    lines.push("Email draft:");
    lines.push("");
    lines.push("```text");
    lines.push(`Subject: ${draft.subject}`);
    lines.push("");
    lines.push(draft.email_body);
    lines.push("```");
    lines.push("");
    if (draft.contact_form_body) {
      lines.push("Contact form draft:");
      lines.push("");
      lines.push("```text");
      lines.push(draft.contact_form_body);
      lines.push("```");
      lines.push("");
    }
  });

  return `${lines.join("\n")}\n`;
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

  const inputText = await readFile(args.input, "utf8");
  const rows = parseCsv(inputText);
  const qualified = qualifyRows(rows, args);
  const drafts = outreachRows(qualified, args);

  await writeText(args.outputCsv, toCsv(drafts));
  await writeText(args.outputMd, renderMarkdown(qualified, drafts, args));

  process.stdout.write(
    `Wrote ${drafts.length} outreach draft(s): ${args.outputMd} and ${args.outputCsv}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
