#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_OUTPUT_MD = ".tmp/framer-agency-discovered.md";
const DEFAULT_OUTPUT_CSV = ".tmp/framer-agency-discovered-outreach.csv";
const DEFAULT_MIN_SCORE = 70;
const DEFAULT_LIMIT = 25;
const DEFAULT_DISCOVERY_LIMIT = 40;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;
const DEFAULT_MAX_RUNTIME_MS = 120000;
const DEFAULT_PLUGIN_URL = "https://polyglotaeo.com/agency/?utm_source=outreach&utm_campaign=agency_partner#template";

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

const EMAIL_BLOCKLIST = [
  /example/i,
  /domain/i,
  /^jane@company\.com$/i,
  /^hello@website\.com$/i,
  /^your@company\.com$/i,
  /^email@framer\.com$/i,
  /sentry/i,
  /wixpress/i,
  /email\.com$/i,
  /\.(png|jpe?g|webp|gif|svg)$/i,
];

const SHARED_PLATFORM_DOMAINS = new Set([
  "behance.net",
  "contra.com",
  "dribbble.com",
  "framer.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
]);

const EXTERNAL_URL_BLOCKLIST = [
  /app\.framerstatic\.com$/i,
  /framerstatic\.com$/i,
  /framer\.link$/i,
  /dub\.sh$/i,
  /drive\.google\.com$/i,
  /docs\.google\.com$/i,
  /accounts\.google\.com$/i,
  /framerusercontent/i,
  /vercel-storage/i,
  /debugbear/i,
  /hotjar/i,
  /clarity\.ms$/i,
  /lemlist\.com$/i,
  /mux\.com$/i,
  /googletagmanager/i,
  /google-analytics/i,
  /facebook\.com$/i,
  /youtube\.com$/i,
  /youtu\.be$/i,
  /github\.com$/i,
  /fontawesome\.com$/i,
  /raw\.githubusercontent\.com$/i,
  /maps\.app\.goo\.gl$/i,
  /polar\.sh$/i,
  /schema\.org$/i,
  /w3\.org$/i,
  /ogp\.me$/i,
  /api\.w\.org$/i,
  /cdn\./i,
  /login\.framer\.com$/i,
  /fonts\./i,
  /head\.app$/i,
  /assets?\./i,
  /cloudfront\.net$/i,
  /stripe\.com$/i,
  /gumroad\.com$/i,
  /lemonsqueezy\.com$/i,
  /calendly\.com$/i,
  /typeform\.com$/i,
  /tally\.so$/i,
  /notion\.site$/i,
  /notion\.so$/i,
];

const SHORT_UTILITY_DOMAINS = new Set([
  "a.app",
  "p.fr",
  "div.fr",
  "e.de",
  "h1.fr",
  "h2.fr",
  "h3.fr",
  "h4.fr",
  "h5.fr",
  "h6.fr",
  "li.fr",
  "ol.fr",
  "ul.fr",
  "span.fr",
  "mark.fr",
  "code.fr",
  "strong.fr",
  "em.fr",
  "a.fr",
  "blockquote.fr",
  "table.fr",
  "framer-text.fr",
  "framer-image.fr",
  "text-styles-preset-reset.fr",
  "figure.fr",
  "document.co",
  "ncal.com",
]);

const ASSET_URL_PATTERN = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|mp4|mov|css|js|json|webmanifest|woff2?|ttf|otf|eot)(?:[?#]|$)/i;

const BRAND_OVERRIDES = new Map([
  ["blastoffstudio.com", "Blastoff! Studio"],
  ["denysfs.framer.website", "Denys"],
  ["dorian.pro", "Dorian"],
  ["filipbanasiak.com", "Filip Banasiak"],
  ["framer8.com", "Framer8"],
  ["framer-expert.com", "Francisc Toth"],
  ["framerlab.dev", "Framer Lab"],
  ["goodspeed.studio", "Goodspeed Studio"],
  ["newoffset.com", "NewOffset"],
  ["pixlform.com", "PIXLFORM"],
  ["uiflip.com", "UI Flip"],
  ["walian.studio", "Walian Studio"],
  ["xeedesign.com", "XEE Design"],
]);

function usage() {
  return `
Usage:
  pnpm lead:agency -- --input agency-urls.txt

Options:
  --input <file>          Raw search results or URL list. Required.
  --output-md <file>      Markdown evidence report. Default: ${DEFAULT_OUTPUT_MD}
  --output-csv <file>     Outreach CSV importable by lead:crm. Default: ${DEFAULT_OUTPUT_CSV}
  --min-score <number>    Minimum score for CSV output. Default: ${DEFAULT_MIN_SCORE}
  --limit <number>        Maximum CSV rows. Default: ${DEFAULT_LIMIT}
  --discovery-limit <n>   Maximum URLs to inspect after profile expansion. Default: ${DEFAULT_DISCOVERY_LIMIT}
  --timeout-ms <number>   Per-page fetch timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --retries <number>      Fetch retries per page. Default: ${DEFAULT_RETRIES}
  --max-runtime-ms <n>    Stop inspecting new URLs after this many ms. Default: ${DEFAULT_MAX_RUNTIME_MS}
  --plugin-url <url>      Link used in agency outreach. Default: ${DEFAULT_PLUGIN_URL}
  --crm <file>            Exclude domains already present in this CRM CSV.
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    outputMd: DEFAULT_OUTPUT_MD,
    outputCsv: DEFAULT_OUTPUT_CSV,
    minScore: DEFAULT_MIN_SCORE,
    limit: DEFAULT_LIMIT,
    discoveryLimit: DEFAULT_DISCOVERY_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    maxRuntimeMs: DEFAULT_MAX_RUNTIME_MS,
    pluginUrl: DEFAULT_PLUGIN_URL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
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
    if (key === "--discovery-limit") {
      args.discoveryLimit = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--timeout-ms") {
      args.timeoutMs = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--retries") {
      args.retries = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--max-runtime-ms") {
      args.maxRuntimeMs = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--plugin-url") {
      args.pluginUrl = value;
      index += 1;
      continue;
    }
    if (key === "--crm") {
      args.crm = value;
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
  if (!trimmed) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    url.hash = "";
    for (const param of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(param)) {
        url.searchParams.delete(param);
      }
    }
    return url.href;
  } catch {
    return "";
  }
}

function extractUrls(text) {
  const urls = new Set();
  const decoded = decodeEntities(text);

  for (const match of decoded.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) urls.add(normalized);
  }
  for (const match of decoded.matchAll(/\b((?:[a-z0-9-]+\.)+(?:com|io|co|ai|app|dev|design|studio|website|site|fr|de|es|nl|net|org))(\/[^\s"'<>]*)?/gi)) {
    const normalized = normalizeUrl(`${match[1]}${match[2] || ""}`);
    if (normalized) urls.add(normalized);
  }

  return Array.from(urls);
}

function extractFramerProfileUrls(text) {
  const urls = new Set();
  const decoded = decodeEntities(text);
  for (const match of decoded.matchAll(/\/@[a-z0-9_-]+\/?/gi)) {
    urls.add(`https://www.framer.com${match[0].endsWith("/") ? match[0] : `${match[0]}/`}`);
  }
  return Array.from(urls);
}

function isExternalCandidateUrl(url, sourceDomain = "") {
  if (!url || ASSET_URL_PATTERN.test(url)) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  const domain = domainOf(url);
  if (!domain) return false;
  if (/^framer-[a-z0-9-]+\.fr$/i.test(domain)) return false;
  if (SHORT_UTILITY_DOMAINS.has(domain)) return false;
  if (sourceDomain && rootDomain(domain) === rootDomain(sourceDomain)) return false;
  if (SHARED_PLATFORM_DOMAINS.has(rootDomain(domain))) return false;
  if (EXTERNAL_URL_BLOCKLIST.some((pattern) => pattern.test(domain) || pattern.test(url))) return false;
  return true;
}

function externalCandidateUrls(html, sourceDomain) {
  const withoutStyles = String(html || "").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return extractUrls(withoutStyles)
    .map((url) => normalizeUrl(url))
    .filter((url) => isExternalCandidateUrl(url, sourceDomain));
}

function domainOf(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function rootDomain(domain) {
  const parts = String(domain || "").split(".");
  if (parts.length <= 2) return domain;
  return parts.slice(-2).join(".");
}

function stripHtml(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function metaContent(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']+)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  }
  return "";
}

function titleOf(html) {
  return decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmails(html) {
  const emails = new Set();
  for (const match of String(html || "").matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = match[0].toLowerCase();
    if (!EMAIL_BLOCKLIST.some((pattern) => pattern.test(email))) {
      emails.add(email);
    }
  }
  for (const match of String(html || "").matchAll(/mailto:([^"'<>\s?]+)/gi)) {
    const email = decodeURIComponent(match[1]).toLowerCase();
    if (!EMAIL_BLOCKLIST.some((pattern) => pattern.test(email))) {
      emails.add(email);
    }
  }
  return Array.from(emails);
}

function chooseEmail(emails, domain) {
  const root = rootDomain(domain);
  return (
    emails.find((email) => email.endsWith(`@${root}`)) ||
    emails.find((email) => !/^(no-?reply|hello@example|test@)/i.test(email)) ||
    ""
  );
}

function brandFromDomain(domain) {
  return String(domain || "")
    .replace(/\..*$/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function brandFromTitle(title, domain) {
  if (BRAND_OVERRIDES.has(domain)) {
    return BRAND_OVERRIDES.get(domain);
  }

  const fallback = brandFromDomain(domain);
  const parts = String(title || "")
    .split(/[|–—·•]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const specific = parts.find((part) => {
    const lower = part.toLowerCase();
    return (
      part.length <= 40 &&
      !/\b(framer|agency|websites?|landing pages?|marketing sites?|design|development|seo|conversion|official expert|launch|high-performing|faster)\b/i.test(lower)
    );
  });
  return specific || fallback;
}

function greetingFor(email, brand) {
  const firstBrandWord = String(brand || "").split(/\s+/)[0] || "";
  const genericBrandWords = new Set(["agency", "design", "digital", "framer", "lab", "labs", "studio", "team"]);
  const local = String(email || "").split("@")[0] || "";
  if (
    /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(brand) &&
    !/\b(Studio|Agency|Digital|Design|Lab|Labs|Group|Team)\b$/.test(brand) &&
    !genericBrandWords.has(firstBrandWord.toLowerCase())
  ) {
    return brand.split(/\s+/)[0];
  }
  if (/^(info|hello|contact|team|support|agency|studio)$/i.test(local)) {
    return `${brand} team`;
  }
  if (/^[A-Z][a-z]{2,20}$/.test(brand) && !genericBrandWords.has(brand.toLowerCase())) {
    return brand;
  }
  if (/\b(Studio|Agency|Digital|Design|Lab|Labs|Group|Team)\b$/i.test(brand)) {
    return `${brand} team`;
  }

  const first = local.split(/[._-]+/)[0];
  if (/^[a-z]{2,20}$/i.test(first)) {
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  return `${brand} team`;
}

function signalSet(text) {
  const lower = text.toLowerCase();
  const signals = [];
  if (lower.includes("official framer expert") || /\bframer\s+pro\s+expert\b/i.test(text)) signals.push("official-framer-expert");
  if (lower.includes("framer agency")) signals.push("framer-agency");
  if (/\bframer\s+(?:pro\s+)?expert\b/i.test(text)) signals.push("framer-expert");
  if (/certified\s+framer/i.test(text)) signals.push("certified-framer");
  if (/framer\s+(development|websites?|partner|studio|design)/i.test(text)) signals.push("framer-service");
  if (/\b(seo|geo|aio|ai search|chatgpt|conversion|growth)\b/i.test(text)) signals.push("seo-geo-conversion");
  if (/\b(open to freelance|open for work|available for new projects|available for projects|hire me|let'?s chat|book a call)\b/i.test(text)) signals.push("service-availability");
  if (/\b(client|handoff|launch|agency|studio|b2b|saas|freelance|freelancer)\b/i.test(text)) signals.push("agency-context");
  return Array.from(new Set(signals));
}

function scoreAgency({ emails, signals }) {
  let score = 0;
  if (signals.includes("official-framer-expert")) score += 45;
  if (signals.includes("framer-agency")) score += 40;
  if (signals.includes("framer-expert")) score += 30;
  if (signals.includes("certified-framer")) score += 25;
  if (signals.includes("framer-service")) score += 20;
  if (signals.includes("seo-geo-conversion")) score += 10;
  if (signals.includes("service-availability")) score += 10;
  if (signals.includes("agency-context")) score += 10;
  if (emails.length) score += 25;
  return Math.min(score, 100);
}

function hasRisk(text) {
  return /\b(template marketplace|free template|premium template|framer template|portfolio template|personal framer template|waitlist template|event template|brand book template|directory template|cloneable|remix|download template|get this template)\b/i.test(text);
}

function platformRisk(domain) {
  return SHARED_PLATFORM_DOMAINS.has(rootDomain(domain)) ? "shared-platform-profile" : "";
}

async function fetchPage(url, args) {
  let lastError = "";
  for (let attempt = 0; attempt <= args.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 Polyglot AEO outreach research",
        },
      });
      const html = await response.text();
      return { ok: true, status: response.status, finalUrl: response.url, html };
    } catch (error) {
      lastError = `${error?.name || "Error"}: ${error?.message || error}`;
    } finally {
      clearTimeout(timeout);
    }
  }
  const curlResult = await fetchPageWithCurl(url, args);
  if (curlResult.ok) {
    return curlResult;
  }
  return { ok: false, status: 0, finalUrl: url, error: curlResult.error || lastError };
}

async function fetchPageWithCurl(url, args) {
  try {
    const marker = "\n__POLYGLOT_AEO_CURL_META__";
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-L",
        "--compressed",
        "--retry",
        String(args.retries),
        "--retry-delay",
        "1",
        "-sS",
        "--connect-timeout",
        String(Math.ceil(args.timeoutMs / 1000)),
        "--max-time",
        String(Math.ceil(args.timeoutMs / 1000) * Math.max(1, args.retries + 1)),
        "-A",
        "Mozilla/5.0 Polyglot AEO outreach research",
        "-w",
        `${marker}STATUS:%{http_code} URL:%{url_effective}`,
        url,
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    const markerIndex = stdout.lastIndexOf(marker);
    const html = markerIndex === -1 ? stdout : stdout.slice(0, markerIndex);
    const meta = markerIndex === -1 ? "" : stdout.slice(markerIndex + marker.length);
    const status = Number.parseInt(meta.match(/STATUS:(\d+)/)?.[1] || "0", 10);
    const finalUrl = meta.match(/URL:(.+)$/)?.[1]?.trim() || url;
    return { ok: status >= 200 && status < 400 && html.length > 0, status, finalUrl, html };
  } catch (error) {
    return { ok: false, status: 0, finalUrl: url, error: `curl: ${error?.message || error}` };
  }
}

async function inspectUrl(url, args) {
  const result = await fetchPage(url, args);
  const domain = domainOf(result.finalUrl || url);
  const html = result.html || "";
  const title = titleOf(html);
  const description = metaContent(html, "description");
  const text = stripHtml(html);
  const emails = extractEmails(html);
  const signals = signalSet(`${title} ${description} ${text}`);
  const risk = platformRisk(domain) || (hasRisk(text) ? "template-or-marketplace" : "");
  const score = result.ok && !risk ? scoreAgency({ emails, signals }) : 0;
  const email = chooseEmail(emails, domain);
  const brand = brandFromTitle(title, domain);
  const candidateUrls = externalCandidateUrls(html, domain);
  const profileUrls = extractFramerProfileUrls(html);

  return {
    url,
    finalUrl: result.finalUrl || url,
    domain,
    status: result.status,
    title,
    description,
    emails,
    email,
    signals,
    risk,
    score,
    ok: result.ok,
    error: result.error || "",
    brand,
    candidateUrls,
    profileUrls,
    sample: text.slice(0, 360),
  };
}

function issueOne(item) {
  if (item.signals.includes("official-framer-expert")) {
    return `Agency partner prospect: ${item.brand} publicly identifies as an Official Framer Expert.`;
  }
  if (item.signals.includes("framer-agency")) {
    return `Agency partner prospect: ${item.brand} has a public Framer Agency positioning.`;
  }
  return `Agency partner prospect: ${item.brand} publicly offers Framer services.`;
}

function publicSignalLine(item) {
  const text = `${item.title || ""} ${item.description || ""} ${item.sample || ""}`.replace(/\s+/g, " ");
  if (item.signals.includes("official-framer-expert")) {
    return "the Official Framer Expert positioning";
  }
  if (/\bavailable for work\b/i.test(text)) {
    return "the available-for-work signal on your public site";
  }
  if (/\bbook a call\b/i.test(text)) {
    return "the Book a Call path on your public site";
  }
  if (/\bframer website designer\b/i.test(text)) {
    return "the Framer website designer positioning";
  }
  if (/\bframer\s+(?:websites?|development|design)\b/i.test(text)) {
    return "the Framer service positioning";
  }
  if (item.signals.includes("seo-geo-conversion")) {
    return "the public SEO/GEO/conversion positioning";
  }
  return "your public Framer agency/expert positioning";
}

function emailBody(item, args) {
  const greeting = greetingFor(item.email, item.brand);
  const publicSignal = publicSignalLine(item);
  return `Hi ${greeting},

I found ${item.brand} through ${publicSignal}.

Quick thought: for Framer agencies, AEO QA is easier to sell as a client handoff note than as another SEO/plugin task.

I am offering a free 3-point handoff note for one active Framer client launch. The format is simple: observed issue, client risk, and next fix across /llms.txt, localized schema/metadata, CMS gaps, and published-page checks.

If you want to inspect the format first, I put the reusable template here:
${args.pluginUrl}

Send one public Framer client URL and I will return the note in that format. No meeting needed.

Best,
Jimmy`;
}

function outreachRow(item, args) {
  return {
    domain: item.domain,
    final_url: item.finalUrl,
    locales: "",
    score: item.score,
    contact_url: item.email ? `mailto:${item.email}` : item.finalUrl,
    contact_channel: item.email ? "email" : "manual",
    subject: `Free Framer handoff QA note for ${item.brand}`,
    issue_1: issueOne(item),
    issue_2: "Their positioning maps to the client launch QA workflow behind SEO/GEO and AI-search visibility promises.",
    issue_3: "Partnership angle: Framer agencies can use multilingual AEO checks as a reusable launch QA deliverable.",
    email_body: emailBody(item, args),
    contact_form_body: "",
    manual_check: `Open ${item.finalUrl} before sending; confirm Framer agency/expert positioning and the public contact ${item.email || "channel"}.`,
  };
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
      MAIL_COLUMNS.join(","),
      ...rows.map((row) => MAIL_COLUMNS.map((column) => csvEscape(row[column])).join(",")),
    ].join("\n") + "\n"
  );
}

function renderMarkdown(items, rows, args) {
  const lines = [
    "# Framer Agency Discovery",
    "",
    `Input: ${args.input}`,
    `Generated: ${new Date().toISOString()}`,
    `CSV: ${args.outputCsv}`,
    `Runtime: ${args.runtimeElapsedMs || 0}ms / ${args.maxRuntimeMs}ms`,
    "",
    "## Outreach-Ready",
    "",
  ];
  if (args.runtimeSkipped) {
    lines.splice(6, 0, `Runtime guard: stopped before inspecting ${args.runtimeSkipped} queued URL(s).`);
  }

  if (!rows.length) {
    lines.push("No agency prospects met the score and email criteria.");
  } else {
    lines.push("| Domain | Score | Email | Signals | Import |");
    lines.push("|---|---:|---|---|---|");
    for (const row of rows) {
      const item = items.find((candidate) => candidate.domain === row.domain);
      lines.push(
        `| ${row.domain} | ${row.score} | ${row.contact_url.replace(/^mailto:/, "")} | ${item?.signals.join("|") || ""} | \`pnpm lead:crm -- --import ${args.outputCsv}\` |`,
      );
    }
  }

  lines.push("");
  lines.push("## Evidence");
  lines.push("");
  for (const item of items) {
    lines.push(`### ${item.domain || item.url}`);
    lines.push("");
    lines.push(`- URL: ${item.finalUrl}`);
    lines.push(`- HTTP: ${item.status || "fetch_failed"}`);
    lines.push(`- Score: ${item.score}`);
    lines.push(`- Title: ${item.title || ""}`);
    lines.push(`- Emails: ${item.emails.join(", ") || "none"}`);
    lines.push(`- Signals: ${item.signals.join(", ") || "none"}`);
    if (item.candidateUrls?.length) lines.push(`- External candidates: ${item.candidateUrls.slice(0, 8).join(", ")}`);
    if (item.profileUrls?.length) lines.push(`- Framer profiles: ${item.profileUrls.slice(0, 8).join(", ")}`);
    if (item.risk) lines.push(`- Risk: ${item.risk}`);
    if (item.error) lines.push(`- Error: ${item.error}`);
    lines.push(`- Sample: ${item.sample}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function hasRuntimeBudget(args, startedAt) {
  return Date.now() - startedAt < args.maxRuntimeMs;
}

async function inspectBatch(urls, args, startedAt, stats) {
  const items = [];
  for (const url of urls) {
    if (!hasRuntimeBudget(args, startedAt)) {
      stats.runtimeSkipped += 1;
      continue;
    }
    items.push(await inspectUrl(url, args));
  }
  return items;
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function parseCsvDomains(text) {
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

  const [headers, ...records] = rows;
  const domainIndex = headers?.indexOf("domain") ?? -1;
  if (domainIndex === -1) return new Set();
  return new Set(records.map((record) => record[domainIndex]).filter(Boolean));
}

async function main() {
  const startedAt = Date.now();
  const stats = { runtimeSkipped: 0 };
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.input) {
    throw new Error("Missing required --input <file>.\n" + usage());
  }

  const input = await readFile(args.input, "utf8");
  const existingDomains = args.crm ? parseCsvDomains(await readFile(args.crm, "utf8")) : new Set();
  const urls = Array.from(new Set([...extractUrls(input), ...extractFramerProfileUrls(input)])).slice(0, args.discoveryLimit);
  const inspected = await inspectBatch(urls, args, startedAt, stats);

  const discoveredUrls = new Set();
  for (const item of inspected) {
    if (item.risk === "shared-platform-profile" || SHARED_PLATFORM_DOMAINS.has(rootDomain(item.domain))) {
      for (const url of item.candidateUrls || []) {
        discoveredUrls.add(url);
      }
      for (const url of item.profileUrls || []) {
        discoveredUrls.add(url);
      }
    }
  }
  const secondPass = await inspectBatch(
    Array.from(discoveredUrls).slice(0, args.discoveryLimit),
    args,
    startedAt,
    stats,
  );
  inspected.push(...secondPass);

  const profileDiscoveredUrls = new Set();
  for (const item of secondPass) {
    if (item.risk === "shared-platform-profile" || SHARED_PLATFORM_DOMAINS.has(rootDomain(item.domain))) {
      for (const url of item.candidateUrls || []) {
        profileDiscoveredUrls.add(url);
      }
    }
  }
  inspected.push(
    ...(await inspectBatch(
      Array.from(profileDiscoveredUrls).slice(0, args.discoveryLimit),
      args,
      startedAt,
      stats,
    )),
  );

  const byDomain = new Map();
  for (const item of inspected) {
    if (!item.domain) continue;
    const current = byDomain.get(item.domain);
    if (!current || item.score > current.score || (item.email && !current.email)) {
      byDomain.set(item.domain, item);
    }
  }

  const ranked = Array.from(byDomain.values()).sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
  const ready = ranked
    .filter((item) => !existingDomains.has(item.domain))
    .filter((item) => item.score >= args.minScore && item.email && item.signals.some((signal) => signal.includes("framer")))
    .slice(0, args.limit)
    .map((item) => outreachRow(item, args));

  args.runtimeElapsedMs = Date.now() - startedAt;
  args.runtimeSkipped = stats.runtimeSkipped;
  await writeText(args.outputCsv, toCsv(ready));
  await writeText(args.outputMd, renderMarkdown(ranked, ready, args));

  process.stdout.write(`Agency pages inspected: ${ranked.length}\n`);
  process.stdout.write(`Outreach-ready agency rows: ${ready.length}\n`);
  if (stats.runtimeSkipped) {
    process.stdout.write(`Runtime guard skipped queued URLs: ${stats.runtimeSkipped}\n`);
  }
  process.stdout.write(`Markdown: ${args.outputMd}\n`);
  process.stdout.write(`CSV: ${args.outputCsv}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
