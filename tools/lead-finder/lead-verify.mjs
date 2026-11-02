#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-verification.md";
const DEFAULT_TIMEOUT_MS = 12000;
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

function usage() {
  return `
Usage:
  pnpm lead:verify
  node tools/lead-finder/lead-verify.mjs --crm tools/lead-finder/outreach.local.csv

Options:
  --crm <file>             Local CRM CSV. Default: ${DEFAULT_CRM}
  --output <file>          Markdown verification report. Default: ${DEFAULT_OUTPUT}
  --status <status>        Verify only rows with this status. Default: queued
  --timeout-ms <number>    Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --retries <number>       Retries for transient fetch failures. Default: ${DEFAULT_RETRIES}
  --help                   Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    output: DEFAULT_OUTPUT,
    status: "queued",
    timeoutMs: DEFAULT_TIMEOUT_MS,
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

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchTextOnce(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "PolyglotAEOLeadVerifier/1.0 (+https://polyglotaeo.com)",
      },
    });
    const text = await response.text().catch(() => "");
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
    clearTimeout(timeout);
  }
}

async function fetchText(url, timeoutMs, retries = DEFAULT_RETRIES) {
  let lastResult;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    lastResult = await fetchTextOnce(url, timeoutMs);
    const transient = !lastResult.ok && (lastResult.status === 0 || lastResult.status >= 500);
    if (!transient || attempt === retries) {
      return lastResult;
    }
    await wait(250 * (attempt + 1));
  }

  return lastResult;
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function rootUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attrValue(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? match[1] || match[2] || match[3] || "" : "";
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

function extractMetaDescription(html) {
  const match = html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i);
  return match ? attrValue(match[0], "content").trim() : "";
}

function detectFramer(html, finalUrl) {
  const signals = [];
  const host = new URL(finalUrl).hostname.toLowerCase();
  if (host.endsWith(".framer.website") || host.endsWith(".framer.app")) signals.push("framer-host");
  if (/framerusercontent\.com/i.test(html)) signals.push("framerusercontent");
  if (/\bdata-framer[-\w]*=/i.test(html)) signals.push("data-framer");
  if (/__framer/i.test(html)) signals.push("__framer");
  if (/Made in Framer|framer\.com\/projects/i.test(html)) signals.push("framer-reference");
  return signals;
}

function normalizeLocale(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
}

function localeFamily(locale) {
  const normalized = normalizeLocale(locale);
  if (!normalized) return "";
  if (normalized === "zh-cn" || normalized === "zh-tw") return normalized;
  return normalized.split("-")[0];
}

function detectLocales(html, finalUrl) {
  const locales = new Set();
  const signals = new Set();

  for (const linkTag of html.matchAll(/<link\b[^>]*rel=["'][^"']*alternate[^"']*["'][^>]*>/gi)) {
    const hreflang = normalizeLocale(attrValue(linkTag[0], "hreflang"));
    if (hreflang && hreflang !== "x-default") {
      locales.add(hreflang);
      signals.add("hreflang");
    }
  }

  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || "";
  const htmlLang = normalizeLocale(attrValue(htmlTag, "lang"));
  if (htmlLang) {
    locales.add(htmlLang);
    signals.add("html-lang");
  }

  for (const href of html.matchAll(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const rawHref = href[1] || href[2] || href[3] || "";
    try {
      const url = new URL(rawHref, finalUrl);
      const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
      if (first && LOCALE_CODES.has(first)) {
        locales.add(first);
        signals.add("locale-paths");
      }
    } catch {
      // Ignore malformed hrefs in verification.
    }
  }

  const families = Array.from(new Set(Array.from(locales).map(localeFamily).filter(Boolean))).sort();
  return {
    locales: Array.from(locales).sort(),
    families,
    signals: Array.from(signals).sort(),
  };
}

function detectJsonLd(html) {
  const scripts = Array.from(
    html.matchAll(
      /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  );
  return {
    count: scripts.length,
    hasInLanguage: scripts.some((script) => /\binLanguage\b/i.test(script[1] || "")),
  };
}

function hasEmailContact(row) {
  return row.contact_channel === "email" || /^mailto:/i.test(row.contact_url || "");
}

function isAgencyPartner(row) {
  const source = String(row.source || "").toLowerCase();
  const issues = `${row.issue_1 || ""} ${row.issue_2 || ""} ${row.issue_3 || ""}`.toLowerCase();
  return source.includes("agency") || issues.includes("agency partner prospect:");
}

async function verifyRow(row, args) {
  const startUrl = normalizeUrl(row.final_url || row.domain);
  const page = startUrl
    ? await fetchText(startUrl, args.timeoutMs, args.retries)
    : { ok: false, status: 0, url: "", text: "", error: "missing_url" };
  const llmsUrl = page.url ? `${rootUrl(page.url)}/llms.txt` : "";
  const llms = llmsUrl
    ? await fetchText(llmsUrl, args.timeoutMs, args.retries)
    : { ok: false, status: 0, url: "", text: "", error: "missing_root" };

  const framerSignals = page.ok ? detectFramer(page.text, page.url) : [];
  const locales = page.ok ? detectLocales(page.text, page.url) : { locales: [], families: [], signals: [] };
  const jsonLd = page.ok ? detectJsonLd(page.text) : { count: 0, hasInLanguage: false };
  const title = page.ok ? extractTitle(page.text) : "";
  const description = page.ok ? extractMetaDescription(page.text) : "";

  const standardSendReady =
    page.ok &&
    framerSignals.length >= 2 &&
    locales.families.length >= 2 &&
    !llms.ok &&
    hasEmailContact(row);

  const agencySendReady =
    isAgencyPartner(row) &&
    page.ok &&
    framerSignals.length >= 2 &&
    hasEmailContact(row);

  return {
    row,
    page,
    llms,
    framerSignals,
    locales,
    jsonLd,
    title,
    description,
    fit: agencySendReady ? "agency_partner" : "standard_multilingual",
    recommendation: standardSendReady || agencySendReady ? "send_ready" : "manual_review",
  };
}

function renderVerification(results, args) {
  const lines = [
    "# Framer Lead Verification",
    "",
    `CRM: ${args.crm}`,
    `Status filter: ${args.status}`,
    "",
    "## Summary",
    "",
  ];

  const ready = results.filter((result) => result.recommendation === "send_ready").length;
  lines.push(`- Rows checked: ${results.length}`);
  lines.push(`- Send-ready after verification: ${ready}`);
  lines.push(`- Needs manual review: ${results.length - ready}`);
  lines.push("");

  for (const result of results) {
    const row = result.row;
    lines.push(`## ${row.domain}`);
    lines.push("");
    lines.push(`- Recommendation: ${result.recommendation}`);
    lines.push(`- URL checked: ${result.page.url || row.final_url || row.domain}`);
    lines.push(`- Page fetch: ${result.page.ok ? "ok" : "failed"} (${result.page.status || result.page.error})`);
    lines.push(`- Contact: ${row.contact_channel || "manual"} ${row.contact_url || ""}`.trim());
    lines.push(`- Framer signals: ${result.framerSignals.join(", ") || "none"}`);
    lines.push(`- Locales: ${result.locales.locales.join(", ") || "none"}`);
    lines.push(`- Locale families: ${result.locales.families.join(", ") || "none"}`);
    lines.push(`- Locale signals: ${result.locales.signals.join(", ") || "none"}`);
    lines.push(`- llms.txt: ${result.llms.ok ? "reachable" : `not reachable (${result.llms.status || result.llms.error})`}`);
    lines.push(`- JSON-LD blocks: ${result.jsonLd.count}`);
    lines.push(`- JSON-LD inLanguage: ${result.jsonLd.hasInLanguage ? "yes" : "no"}`);
    lines.push(`- Title: ${result.title || "missing"}`);
    lines.push(`- Meta description: ${result.description || "missing"}`);
    lines.push(`- Current first issue: ${row.issue_1 || ""}`);
    lines.push(`- Verification fit: ${result.fit}`);
    if (result.recommendation !== "send_ready") {
      lines.push("- Hold reason: verify this manually before sending; one or more required signals is weak.");
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

  const rows = (await readRows(args.crm)).filter((row) => !args.status || row.status === args.status);
  const results = [];
  for (const row of rows) {
    results.push(await verifyRow(row, args));
  }

  const report = renderVerification(results, args);
  await writeText(args.output, report);
  process.stdout.write(report);
  process.stdout.write(`Verification written to ${args.output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
