#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_LOCALE_PAGES = 3;
const DEFAULT_OUTPUT = ".tmp/framer-leads.csv";
const DEFAULT_RETRIES = 2;

const LOCALE_CODES = new Set([
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

const COLUMNS = [
  "url",
  "final_url",
  "domain",
  "is_framer",
  "framer_confidence",
  "framer_signals",
  "is_multilingual",
  "locales",
  "multilingual_signals",
  "has_llms_txt",
  "has_jsonld",
  "has_jsonld_inlanguage",
  "meta_issue",
  "contact_url",
  "contact_email",
  "contact_page",
  "pain_score",
  "outreach_angle",
  "notes",
];

function usage() {
  return `
Usage:
  pnpm lead:find -- --input tools/lead-finder/framer-prospects.local.txt
  node tools/lead-finder/lead-finder.mjs --input urls.txt --output .tmp/framer-leads.csv

Options:
  --input <file>             URL list. One URL per line; first CSV cell is also accepted.
  --output <file>            CSV output path. Default: ${DEFAULT_OUTPUT}
  --timeout-ms <number>      Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --concurrency <number>     Concurrent sites to inspect. Default: ${DEFAULT_CONCURRENCY}
  --max-locale-pages <num>   Locale pages sampled for duplicate meta checks. Default: ${DEFAULT_MAX_LOCALE_PAGES}
  --retries <number>         Retries for transient fetch failures. Default: ${DEFAULT_RETRIES}
  --help                     Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    maxLocalePages: DEFAULT_MAX_LOCALE_PAGES,
    output: DEFAULT_OUTPUT,
    retries: DEFAULT_RETRIES,
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

    if (key === "--timeout-ms") {
      args.timeoutMs = parsePositiveInt(value, key);
      index += 1;
      continue;
    }

    if (key === "--concurrency") {
      args.concurrency = parsePositiveInt(value, key);
      index += 1;
      continue;
    }

    if (key === "--max-locale-pages") {
      args.maxLocalePages = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--retries") {
      args.retries = parsePositiveInt(value, key);
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

function parseInput(text) {
  const seen = new Set();
  const urls = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const firstCell = line.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    const normalized = normalizeUrl(firstCell);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  }

  return urls;
}

function normalizeUrl(rawValue) {
  if (!rawValue) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(rawValue)
    ? rawValue
    : `https://${rawValue}`;

  try {
    const url = new URL(withProtocol);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchTextOnce(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "PolyglotAEOLeadFinder/1.0 (+https://polyglotaeo.com; manual lead research)",
      },
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      text: "",
      error: error?.name === "AbortError" ? "timeout" : error?.message || String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs, retries = DEFAULT_RETRIES) {
  let lastResponse;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    lastResponse = await fetchTextOnce(url, timeoutMs);
    const transientFailure = !lastResponse.ok && (lastResponse.status === 0 || lastResponse.status >= 500);

    if (!transientFailure || attempt === retries) {
      return lastResponse;
    }

    await wait(250 * (attempt + 1));
  }

  return lastResponse;
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html) {
  return decodeHtml(String(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attrValue(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? decodeHtml(match[1] || match[2] || match[3] || "") : "";
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

function extractMetaDescription(html) {
  const match = html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i);
  return match ? attrValue(match[0], "content").trim() : "";
}

function extractHtmlLang(html) {
  const match = html.match(/<html\b[^>]*>/i);
  return match ? normalizeLocale(attrValue(match[0], "lang")) : "";
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorRegex = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html))) {
    const rawHref = decodeHtml(match[1] || match[2] || match[3] || "").trim();
    const text = stripTags(match[4] || "");

    if (!rawHref) {
      continue;
    }

    if (/^mailto:/i.test(rawHref)) {
      links.push({ href: rawHref, text });
      continue;
    }

    try {
      const resolved = new URL(rawHref, baseUrl);
      resolved.hash = "";
      links.push({ href: resolved.href, text });
    } catch {
      // Ignore malformed links. This is a lead triage tool, not a crawler.
    }
  }

  return links;
}

function detectFramer(html, finalUrl) {
  const signals = [];
  const host = safeHost(finalUrl);

  if (host.endsWith(".framer.website") || host.endsWith(".framer.app")) {
    signals.push(["framer-host", 65]);
  }
  if (/framerusercontent\.com/i.test(html)) {
    signals.push(["framerusercontent", 30]);
  }
  if (/\bdata-framer[-\w]*=/i.test(html)) {
    signals.push(["data-framer", 30]);
  }
  if (/__framer/i.test(html)) {
    signals.push(["__framer", 20]);
  }
  if (/framer-motion/i.test(html)) {
    signals.push(["framer-motion", 10]);
  }
  if (/Made in Framer|framer\.com\/projects/i.test(html)) {
    signals.push(["framer-reference", 10]);
  }

  const confidence = Math.min(
    100,
    signals.reduce((sum, [, weight]) => sum + weight, 0),
  );

  return {
    isFramer: confidence >= 40,
    confidence,
    signals: signals.map(([signal]) => signal),
  };
}

function safeHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sameSite(candidate, base) {
  const candidateHost = safeHost(candidate);
  const baseHost = safeHost(base);
  return Boolean(candidateHost && baseHost && candidateHost === baseHost);
}

function normalizeLocale(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
}

function localeFamily(locale) {
  const normalized = normalizeLocale(locale);
  if (!normalized) {
    return "";
  }
  if (normalized === "zh-cn" || normalized === "zh-tw") {
    return normalized;
  }
  return normalized.split("-")[0];
}

function distinctLocaleFamilies(locales) {
  return Array.from(new Set(locales.map(localeFamily).filter(Boolean))).sort();
}

function detectLocales(html, links, baseUrl) {
  const locales = new Map();
  const signals = new Set();

  for (const linkTag of html.matchAll(/<link\b[^>]*rel=["'][^"']*alternate[^"']*["'][^>]*>/gi)) {
    const hreflang = normalizeLocale(attrValue(linkTag[0], "hreflang"));
    const href = attrValue(linkTag[0], "href");
    if (hreflang && hreflang !== "x-default") {
      locales.set(hreflang, href || baseUrl);
      signals.add("hreflang");
    }
  }

  for (const link of links) {
    if (!sameSite(link.href, baseUrl)) {
      continue;
    }

    let parsed;
    try {
      parsed = new URL(link.href);
    } catch {
      continue;
    }

    const firstSegment = parsed.pathname.split("/").filter(Boolean)[0];
    const locale = normalizeLocale(firstSegment);
    if (locale && LOCALE_CODES.has(locale)) {
      locales.set(locale, parsed.href);
      signals.add("locale-paths");
    }
  }

  const htmlLang = extractHtmlLang(html);
  if (htmlLang) {
    locales.set(htmlLang, baseUrl);
    signals.add("html-lang");
  }

  return {
    locales: Array.from(locales.keys()).sort(),
    localeFamilies: distinctLocaleFamilies(Array.from(locales.keys())),
    localeUrls: Array.from(locales.values()),
    signals: Array.from(signals).sort(),
  };
}

async function checkLlms(origin, timeoutMs, retries) {
  const llmsUrl = new URL("/llms.txt", origin).href;
  const response = await fetchText(llmsUrl, timeoutMs, retries);
  return response.ok && response.text.trim().length > 20;
}

function detectJsonLd(html) {
  const scripts = Array.from(
    html.matchAll(
      /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  );

  return {
    hasJsonLd: scripts.length > 0,
    hasInLanguage: scripts.some((script) => /\binLanguage\b/i.test(script[1] || "")),
  };
}

async function analyzeLocalePages(localeUrls, rootMeta, options) {
  const uniqueUrls = Array.from(new Set(localeUrls))
    .filter((url) => normalizeUrl(url) !== normalizeUrl(rootMeta.url))
    .slice(0, options.maxLocalePages);

  const localeMetas = [];
  for (const url of uniqueUrls) {
    const response = await fetchText(url, options.timeoutMs, options.retries);
    if (!response.ok) {
      continue;
    }
    localeMetas.push({
      url: response.url,
      title: extractTitle(response.text),
      description: extractMetaDescription(response.text),
    });
  }

  return localeMetas;
}

function detectMetaIssue(rootMeta, localeMetas) {
  const issues = [];

  if (!rootMeta.title) {
    issues.push("missing title");
  }
  if (!rootMeta.description) {
    issues.push("missing meta description");
  }

  const duplicateTitleCount = localeMetas.filter(
    (meta) => meta.title && rootMeta.title && meta.title === rootMeta.title,
  ).length;
  const duplicateDescriptionCount = localeMetas.filter(
    (meta) =>
      meta.description &&
      rootMeta.description &&
      meta.description === rootMeta.description,
  ).length;

  if (duplicateTitleCount > 0) {
    issues.push(`${duplicateTitleCount} sampled locale title(s) match default`);
  }
  if (duplicateDescriptionCount > 0) {
    issues.push(`${duplicateDescriptionCount} sampled locale description(s) match default`);
  }

  return issues.join("; ");
}

function extractEmails(text) {
  function isUsableEmail(email) {
    const [local, domain] = email.split("@");
    if (!local || !domain) return false;
    if (domain === "company.com" || domain === "example.com") return false;
    if (["email", "name", "user", "test", "example", "jane", "john"].includes(local)) {
      return false;
    }
    if (domain === "gmail.com" && ["hello", "contact", "info"].includes(local)) {
      return false;
    }
    return true;
  }

  const emails = Array.from(
    new Set(
      String(text || "")
        .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
        .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
        .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [],
    ),
  );

  return emails
    .map((email) => email.trim().toLowerCase())
    .filter((email) => !/\.(png|jpg|jpeg|gif|svg|webp|avif)$/i.test(email))
    .filter(isUsableEmail);
}

function findContactUrl(links, baseUrl) {
  const preferred = links.find((link) => /^mailto:/i.test(link.href));
  if (preferred) {
    return preferred.href;
  }

  const scoredLinks = links
    .filter((link) => sameSite(link.href, baseUrl))
    .map((link) => {
      const haystack = `${link.href} ${link.text}`;
      let score = 0;
      if (/contact|get in touch/i.test(haystack)) score += 50;
      if (/work-with-us|book|call|demo/i.test(haystack)) score += 30;
      if (/about|team|studio|agency|presentation/i.test(haystack)) score += 15;
      if (/privacy|terms|refund|login|signin|sign-in|dashboard/i.test(haystack)) score -= 50;
      return { ...link, score };
    })
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score);

  return scoredLinks[0]?.href || "";
}

async function enrichContact(contactUrl, homepageHtml, options) {
  const homepageEmail = extractEmails(homepageHtml)[0] || "";

  if (!contactUrl) {
    return {
      contactUrl: homepageEmail ? `mailto:${homepageEmail}` : "",
      contactEmail: homepageEmail,
      contactPage: "",
    };
  }

  if (/^mailto:/i.test(contactUrl)) {
    const contactEmail = extractEmails(contactUrl.replace(/^mailto:/i, "").split("?")[0])[0] || "";
    return {
      contactUrl: contactEmail ? `mailto:${contactEmail}` : "",
      contactEmail,
      contactPage: "",
    };
  }

  const enriched = {
    contactUrl,
    contactEmail: homepageEmail,
    contactPage: contactUrl,
  };

  try {
    const response = await fetchText(contactUrl, options.timeoutMs, options.retries);
    if (response.ok) {
      enriched.contactEmail = extractEmails(response.text)[0] || homepageEmail;
      if (enriched.contactEmail) {
        enriched.contactUrl = `mailto:${enriched.contactEmail}`;
      }
    }
  } catch {
    // Contact enrichment should never block lead scoring.
  }

  return enriched;
}

function scoreLead(row) {
  let score = 0;

  if (row.is_framer === "true") {
    score += 25;
  }
  if (row.is_multilingual === "true") {
    score += 25;
  }
  if (row.has_llms_txt === "false") {
    score += 15;
  }
  if (row.has_jsonld === "false") {
    score += 15;
  }
  if (row.has_jsonld === "true" && row.has_jsonld_inlanguage === "false") {
    score += 10;
  }
  if (/match default|missing/i.test(row.meta_issue)) {
    score += 15;
  }
  if (row.contact_url) {
    score += 5;
  }
  if (row.framer_confidence >= 80) {
    score += 5;
  }

  return Math.min(100, score);
}

function chooseOutreachAngle(row) {
  if (row.has_llms_txt === "false" && row.is_multilingual === "true") {
    return "Missing llms.txt for multilingual AI crawlers";
  }
  if (row.has_jsonld === "false") {
    return "No visible JSON-LD schema on homepage";
  }
  if (row.has_jsonld === "true" && row.has_jsonld_inlanguage === "false") {
    return "Schema exists but lacks per-locale inLanguage";
  }
  if (/match default/i.test(row.meta_issue)) {
    return "Localized pages appear to reuse default meta copy";
  }
  if (/missing/i.test(row.meta_issue)) {
    return "Basic page metadata appears incomplete";
  }
  return "Multilingual Framer AEO launch audit";
}

async function analyzeUrl(rawUrl, options) {
  const response = await fetchText(rawUrl, options.timeoutMs, options.retries);
  const finalUrl = response.url || rawUrl;
  const domain = safeHost(finalUrl);
  const notes = [];

  if (!response.ok) {
    notes.push(response.error || `HTTP ${response.status}`);
  }

  const html = response.text || "";
  const links = extractLinks(html, finalUrl);
  const framer = detectFramer(html, finalUrl);
  const multilingual = detectLocales(html, links, finalUrl);
  const jsonLd = detectJsonLd(html);

  let hasLlms = false;
  try {
    hasLlms = await checkLlms(new URL(finalUrl).origin, options.timeoutMs, options.retries);
  } catch (error) {
    notes.push(`llms check failed: ${error?.message || String(error)}`);
  }

  const rootMeta = {
    url: finalUrl,
    title: extractTitle(html),
    description: extractMetaDescription(html),
  };
  const localeMetas = await analyzeLocalePages(multilingual.localeUrls, rootMeta, options);
  const metaIssue = detectMetaIssue(rootMeta, localeMetas);
  const contact = await enrichContact(findContactUrl(links, finalUrl), html, options);

  const row = {
    url: rawUrl,
    final_url: finalUrl,
    domain,
    is_framer: String(framer.isFramer),
    framer_confidence: framer.confidence,
    framer_signals: framer.signals.join("|"),
    is_multilingual: String(multilingual.localeFamilies.length > 1),
    locales: multilingual.locales.join("|"),
    multilingual_signals: multilingual.signals.join("|"),
    has_llms_txt: String(hasLlms),
    has_jsonld: String(jsonLd.hasJsonLd),
    has_jsonld_inlanguage: String(jsonLd.hasInLanguage),
    meta_issue: metaIssue,
    contact_url: contact.contactUrl,
    contact_email: contact.contactEmail,
    contact_page: contact.contactPage,
    pain_score: 0,
    outreach_angle: "",
    notes: notes.join("; "),
  };

  row.pain_score = scoreLead(row);
  row.outreach_angle = chooseOutreachAngle(row);
  return row;
}

async function runPool(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function writeCsv(file, rows) {
  await mkdir(path.dirname(file), { recursive: true });
  const lines = [
    COLUMNS.join(","),
    ...rows.map((row) => COLUMNS.map((column) => csvEscape(row[column])).join(",")),
  ];
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
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

  const inputText = await readFile(args.input, "utf8");
  const urls = parseInput(inputText);

  if (urls.length === 0) {
    throw new Error(`No valid URLs found in ${args.input}`);
  }

  const rows = await runPool(urls, args.concurrency, (url) =>
    analyzeUrl(url, {
      timeoutMs: args.timeoutMs,
      maxLocalePages: args.maxLocalePages,
      retries: args.retries,
    }),
  );

  rows.sort((a, b) => Number(b.pain_score) - Number(a.pain_score));
  await writeCsv(args.output, rows);

  process.stdout.write(
    `Wrote ${rows.length} lead rows to ${args.output}. Review pain_score >= 70 first.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
