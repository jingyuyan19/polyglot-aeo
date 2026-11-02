#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT = ".tmp/framer-prospects-discovered.txt";
const DEFAULT_REPORT = ".tmp/framer-prospects-discovered.csv";
const DEFAULT_MIN_SCORE = 35;
const DEFAULT_LIMIT = 150;

const LOCALE_SEGMENTS = new Set([
  "ar",
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "he",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "no",
  "pl",
  "pt",
  "sv",
  "th",
  "tr",
  "vi",
  "zh",
  "zh-cn",
  "zh-tw",
]);

const EXCLUDED_HOSTS = new Set([
  "bing.com",
  "duckduckgo.com",
  "facebook.com",
  "framer.com",
  "google.com",
  "instagram.com",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "tiktok.com",
  "x.com",
  "youtube.com",
]);

const REPORT_COLUMNS = [
  "url",
  "domain",
  "score",
  "signals",
  "risk",
  "recommended_next_step",
  "source_hint",
];

function usage() {
  return `
Usage:
  pnpm lead:discover -- --input search-results.txt
  node tools/lead-finder/lead-discover.mjs --input raw.txt --output .tmp/prospects.txt

Options:
  --input <file>          Raw text, copied search results, CSV, or URL list. Required.
  --output <file>         Prospect URL list for lead:find. Default: ${DEFAULT_OUTPUT}
  --report <file>         CSV report with scoring signals. Default: ${DEFAULT_REPORT}
  --min-score <number>    Minimum discovery score. Default: ${DEFAULT_MIN_SCORE}
  --limit <number>        Maximum prospects to output. Default: ${DEFAULT_LIMIT}
  --append-to <file>      Append unique prospects to an existing local list.
  --include-risky         Include likely templates/demos in the output.
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    report: DEFAULT_REPORT,
    minScore: DEFAULT_MIN_SCORE,
    limit: DEFAULT_LIMIT,
    includeRisky: false,
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
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--report") {
      args.report = value;
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
    if (key === "--append-to") {
      args.appendTo = value;
      index += 1;
      continue;
    }
    if (key === "--include-risky") {
      args.includeRisky = true;
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

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeUrl(rawValue) {
  const trimmed = decodeEntities(rawValue)
    .trim()
    .replace(/[),.;\]\s]+$/g, "")
    .replace(/^["'(<\[]+/g, "");

  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    url.hash = "";
    for (const param of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(param)) {
        url.searchParams.delete(param);
      }
    }
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/g, "");
    }
    return url.href;
  } catch {
    return "";
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function rootHost(host) {
  const parts = host.split(".");
  if (parts.length <= 2) {
    return host;
  }
  return parts.slice(-2).join(".");
}

function isExcluded(host) {
  const root = rootHost(host);
  return EXCLUDED_HOSTS.has(host) || EXCLUDED_HOSTS.has(root);
}

function extractUrls(text) {
  const urls = new Set();
  const decoded = decodeEntities(text);

  for (const match of decoded.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) urls.add(normalized);
  }

  for (const match of decoded.matchAll(/\b((?:[a-z0-9-]+\.)+(?:com|io|co|ai|app|dev|design|studio|website|site|fr|de|es|nl|cm|xyz|net|org))(\/[^\s"'<>]*)?/gi)) {
    const normalized = normalizeUrl(`${match[1]}${match[2] || ""}`);
    if (normalized) urls.add(normalized);
  }

  return Array.from(urls);
}

function lineContext(text, url) {
  const host = hostOf(url);
  const normalized = url.replace(/^https?:\/\//, "");
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(url) || line.includes(host) || line.includes(normalized));

  if (index === -1) {
    return "";
  }

  return lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 3)).join(" ");
}

function hasLocalePath(url) {
  try {
    const first = new URL(url).pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return Boolean(first && LOCALE_SEGMENTS.has(first));
  } catch {
    return false;
  }
}

function scoreCandidate(url, context) {
  const host = hostOf(url);
  const lower = `${url}\n${context}`.toLowerCase();
  const signals = [];
  const risks = [];
  let score = 0;

  if (!host || isExcluded(host)) {
    return null;
  }

  if (host.endsWith(".framer.website") || host.endsWith(".framer.app")) {
    score += 45;
    signals.push("framer-host");
  }
  if (lower.includes("framerusercontent.com")) {
    score += 25;
    signals.push("framerusercontent");
  }
  const explicitNonFramer = /\b(not|no|without)\s+(?:a\s+)?framer\b|\bis\s+not\s+(?:a\s+)?framer\b/i.test(lower);
  if (/\bframer\b/.test(lower) && !explicitNonFramer) {
    score += 15;
    signals.push("framer-mentioned");
  }
  if (hasLocalePath(url)) {
    score += 25;
    signals.push("locale-path-url");
  }
  if (/\bhreflang\b|locali[sz]ation|multi[- ]?language|multilingual|\/fr\b|\/de\b|\/ja\b|\/ko\b|\/es\b/i.test(lower)) {
    score += 25;
    signals.push("multilingual-intent");
  }
  if (/\b(cms|blog|case stud|portfolio|agency|studio|startup|saas)\b/i.test(lower)) {
    score += 10;
    signals.push("commercial-or-cms-context");
  }
  if (/\b(contact|about|book|work with us|get in touch)\b/i.test(lower)) {
    score += 8;
    signals.push("contact-intent");
  }
  if (/\b(template|remix|free template|buy template|demo)\b/i.test(lower)) {
    score -= 45;
    risks.push("template-or-demo");
  }
  if (host.endsWith(".framer.website") && !/\b(contact|agency|studio|founder|company|saas|case stud|portfolio)\b/i.test(lower)) {
    risks.push("may-be-unpublished-or-template");
  }

  return {
    url,
    domain: host,
    score: Math.max(0, score),
    signals,
    risk: risks,
    sourceHint: context.replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

function recommendedNextStep(candidate) {
  if (candidate.risk.includes("template-or-demo")) {
    return "manual_check_template_author_or_skip";
  }
  if (candidate.signals.includes("framer-host") && candidate.signals.includes("multilingual-intent")) {
    return "scan_now";
  }
  if (candidate.signals.includes("framer-mentioned") && candidate.signals.includes("multilingual-intent")) {
    return "scan_then_confirm_framer";
  }
  return "manual_check_before_scan";
}

function dedupeByDomain(candidates) {
  const best = new Map();

  for (const candidate of candidates) {
    const current = best.get(candidate.domain);
    if (!current || candidate.score > current.score || candidate.url.length < current.url.length) {
      best.set(candidate.domain, candidate);
    }
  }

  return Array.from(best.values());
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toReportCsv(candidates) {
  return (
    [
      REPORT_COLUMNS.join(","),
      ...candidates.map((candidate) =>
        [
          candidate.url,
          candidate.domain,
          candidate.score,
          candidate.signals.join("|"),
          candidate.risk.join("|"),
          recommendedNextStep(candidate),
          candidate.sourceHint,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function appendUnique(file, urls) {
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const currentUrls = new Set(extractUrls(existing).map((url) => hostOf(url)));
  const lines = existing.trim() ? [existing.trimEnd()] : [];
  let added = 0;

  for (const url of urls) {
    const host = hostOf(url);
    if (currentUrls.has(host)) {
      continue;
    }
    currentUrls.add(host);
    lines.push(url);
    added += 1;
  }

  await writeText(file, `${lines.join("\n")}\n`);
  return added;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.input) {
    throw new Error("Missing required --input <file>.\n" + usage());
  }

  const text = await readFile(args.input, "utf8");
  const candidates = dedupeByDomain(
    extractUrls(text)
      .map((url) => scoreCandidate(url, lineContext(text, url)))
      .filter(Boolean)
      .filter((candidate) => args.includeRisky || !candidate.risk.includes("template-or-demo"))
      .filter((candidate) => candidate.score >= args.minScore),
  )
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain))
    .slice(0, args.limit);

  await writeText(args.output, `${candidates.map((candidate) => candidate.url).join("\n")}\n`);
  await writeText(args.report, toReportCsv(candidates));

  let appended = 0;
  if (args.appendTo) {
    appended = await appendUnique(args.appendTo, candidates.map((candidate) => candidate.url));
  }

  process.stdout.write(
    `Discovered ${candidates.length} prospect(s). URL list: ${args.output}. Report: ${args.report}.${
      args.appendTo ? ` Appended ${appended} new domain(s) to ${args.appendTo}.` : ""
    }\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
