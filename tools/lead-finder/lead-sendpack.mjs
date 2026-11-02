#!/usr/bin/env node

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./local-env.mjs";
import { renderReportFirstEmail } from "./public-audit-lib.mjs";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_VERIFY = ".tmp/framer-verification-verified.md";
const DEFAULT_OUTPUT = ".tmp/framer-send-pack.md";
const DEFAULT_OUT_DIR = ".tmp/framer-send-pack";
const DEFAULT_HTML = ".tmp/framer-send-pack.html";
const DEFAULT_MARK_SENT = ".tmp/framer-mark-sent.sh";
const DEFAULT_STATUS = "verified";
const DEFAULT_VARIANT = "default";
const DEFAULT_PLUGIN_URL = "https://polyglotaeo.com/audit/";
const DEFAULT_AUDITS = ".tmp/polyglot-report-pilot.json";
const DEFAULT_SENDER_PREFLIGHT = ".tmp/polyglot-report-sender-preflight.json";
const SENDPACK_MANIFEST = ".sendpack-manifest.json";
const VALID_VARIANTS = new Set(["default", "value-first", "report-first-v1"]);
const BLOCKED_SEND_STATUSES = new Set([
  "bounced",
  "manual_review",
  "not_fit",
  "no_reply_closed",
  "report_closed",
  "unsubscribed",
]);
const BRAND_OVERRIDES = new Map([
  ["apexure", "Apexure"],
  ["auxstudio", "Aux Studio"],
  ["blaq-nexus", "Blaq Nexus"],
  ["blastoffstudio", "Blastoff! Studio"],
  ["attrad", "AT TRAD"],
  ["charry", "Charry"],
  ["denysfs", "Denys"],
  ["filipbanasiak", "Filip Banasiak"],
  ["flomotive", "Flomotive"],
  ["framer8", "Framer8"],
  ["framerlab", "Framer Lab"],
  ["gagatkurniawan21", "Gagat Kurniawan"],
  ["goodspeed", "Goodspeed"],
  ["gunjanb", "Gunjan Bhatnagar"],
  ["janarioli", "Jana Arioli"],
  ["jasonkitio", "Jason Kitio"],
  ["julen3drig", "Julen Armendariz"],
  ["mai-nguyen", "Mai Nguyen"],
  ["newoffset", "NewOffset"],
  ["paubueno", "Pau Bueno"],
  ["pepercode", "Pepercode"],
  ["pixlform", "PIXLFORM"],
  ["sourcepeak", "Sourcepeak"],
  ["south", "South"],
  ["svikoudev", "SVIKOUDEV"],
  ["syqi", "SYQI Creatives 才啟科技"],
  ["thouheethkabir", "Thouheeth Kabir"],
  ["trueform", "Trueform"],
  ["uiflip", "UI Flip"],
  ["victorflow", "VictorFlow"],
  ["walian", "Walian Studio"],
  ["wakafoils", "Waka Foils"],
  ["webnity-x", "Webnity X"],
  ["xeedesign", "XEE Design"],
]);

function usage() {
  return `
Usage:
  pnpm lead:sendpack
  node tools/lead-finder/lead-sendpack.mjs --crm tools/lead-finder/outreach.local.csv

Options:
  --crm <file>            Local CRM CSV. Default: ${DEFAULT_CRM}
  --verify <file>         Verification markdown. Default: ${DEFAULT_VERIFY}
  --output <file>         Combined markdown send pack. Default: ${DEFAULT_OUTPUT}
  --out-dir <dir>         Per-lead .txt files. Default: ${DEFAULT_OUT_DIR}
  --html <file>           Browser-friendly send page. Default: ${DEFAULT_HTML}
  --mark-sent <file>      Shell script to mark included leads sent. Default: ${DEFAULT_MARK_SENT}
  --status <status>       CRM status to include. Default: ${DEFAULT_STATUS}
  --variant <variant>     Email copy variant: default, value-first, report-first-v1. Default: ${DEFAULT_VARIANT}
  --plugin-url <url>      Product URL in drafts. Default: ${DEFAULT_PLUGIN_URL}
  --audits <file>         Public audit JSON for report-first-v1. Default: ${DEFAULT_AUDITS}
  --sender-preflight <file> SPF/DKIM/DMARC and suppression gate. Default: ${DEFAULT_SENDER_PREFLIGHT}
  --postal-address <text> Compliance footer; defaults to SENDER_POSTAL_ADDRESS.
  --sender-name <name>    Signature name for report-first-v1. Default: Jimmy
  --include-product-link  Add one first-party product link. Default: off
  --today <YYYY-MM-DD>    Date for due filtering. Default: local date.
  --due-only              Only include rows with next_followup due on/before today.
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    verify: DEFAULT_VERIFY,
    output: DEFAULT_OUTPUT,
    outDir: DEFAULT_OUT_DIR,
    html: DEFAULT_HTML,
    markSent: DEFAULT_MARK_SENT,
    status: DEFAULT_STATUS,
    variant: DEFAULT_VARIANT,
    pluginUrl: DEFAULT_PLUGIN_URL,
    audits: DEFAULT_AUDITS,
    senderPreflight: DEFAULT_SENDER_PREFLIGHT,
    postalAddress: process.env.SENDER_POSTAL_ADDRESS || "",
    senderName: "Jimmy",
    includeProductLink: false,
    today: todayLocal(),
    dueOnly: false,
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
    if (key === "--verify") {
      args.verify = value;
      index += 1;
      continue;
    }
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--out-dir") {
      args.outDir = value;
      index += 1;
      continue;
    }
    if (key === "--html") {
      args.html = value;
      index += 1;
      continue;
    }
    if (key === "--mark-sent") {
      args.markSent = value;
      index += 1;
      continue;
    }
    if (key === "--status") {
      args.status = value;
      index += 1;
      continue;
    }
    if (key === "--variant") {
      args.variant = value;
      index += 1;
      continue;
    }
    if (key === "--plugin-url") {
      args.pluginUrl = value;
      index += 1;
      continue;
    }
    if (key === "--audits") {
      args.audits = value;
      index += 1;
      continue;
    }
    if (key === "--sender-preflight") {
      args.senderPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--postal-address") {
      args.postalAddress = value || "";
      index += 1;
      continue;
    }
    if (key === "--sender-name") {
      args.senderName = value || "Jimmy";
      index += 1;
      continue;
    }
    if (key === "--include-product-link") {
      args.includeProductLink = true;
      continue;
    }
    if (key === "--today") {
      args.today = value;
      index += 1;
      continue;
    }
    if (key === "--due-only") {
      args.dueOnly = true;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  if (!VALID_VARIANTS.has(args.variant)) {
    throw new Error(`--variant must be one of: ${Array.from(VALID_VARIANTS).join(", ")}`);
  }
  if (BLOCKED_SEND_STATUSES.has(args.status)) {
    throw new Error(`Refusing to generate a send pack for non-sendable CRM status: ${args.status}.`);
  }
  if (args.variant === "report-first-v1" && args.status !== "report_ready") {
    throw new Error("report-first-v1 send packs must use --status report_ready.");
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

function futureScheduleWarning(args) {
  const today = todayLocal();
  if (!args.dueOnly || !args.today || args.today <= today) {
    return "";
  }
  return `Prepared ahead for ${args.today}. Do not send these emails before ${args.today}; rerun Gmail reply/bounce/unsubscribe preflight on the send day.`;
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

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function readAuditMap(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    const audits = Array.isArray(value) ? value : value.audits || [];
    return new Map(
      audits
        .filter((audit) => audit?.domain)
        .map((audit) => [String(audit.domain).toLowerCase().replace(/^www\./, ""), audit]),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw new Error(`Could not read public audit JSON ${file}: ${error?.message || String(error)}`);
  }
}

async function readSenderPreflight(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Could not read sender preflight ${file}: ${error?.message || String(error)}`);
  }
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function slug(value) {
  return String(value || "lead")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodeMailto(value) {
  return encodeURIComponent(String(value || "")).replace(/%20/g, "+");
}

function jsString(value) {
  return JSON.stringify(String(value || ""));
}

function shellEscape(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function contactEmail(row) {
  const contact = String(row.contact_url || "").trim();
  if (/^mailto:/i.test(contact)) {
    return contact.replace(/^mailto:/i, "").split("?")[0].trim();
  }
  return "";
}

function foldHeaderLine(name, value) {
  const line = `${name}: ${String(value || "").replace(/\r?\n/g, " ")}`;
  if (line.length <= 78) {
    return line;
  }

  const chunks = [];
  let remaining = line;
  while (remaining.length > 78) {
    chunks.push(remaining.slice(0, 78));
    remaining = ` ${remaining.slice(78)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}

function parseVerification(markdown) {
  const sections = new Map();
  const parts = markdown.split(/\n## /);

  for (const part of parts.slice(1)) {
    const [headingLine, ...bodyLines] = part.split("\n");
    const domain = headingLine.trim();
    if (!domain || domain === "Summary") {
      continue;
    }

    const body = bodyLines.join("\n");
    const values = {};
    for (const line of body.split(/\r?\n/)) {
      const match = line.match(/^- ([^:]+):\s*(.*)$/);
      if (match) {
        values[match[1].trim()] = match[2].trim();
      }
    }
    sections.set(domain, values);
  }

  return sections;
}

function localePhrase(row, verification) {
  const families = verification["Locale families"] || "";
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
  if (families) {
    const values = families
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => names[item] || item);
    if (values.length >= 2) return `${values.join(" and ")} versions`;
  }

  const locales = String(row.locales || "")
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (locales.length >= 2) {
    return `${locales.map((item) => names[item.split("-")[0]] || item).join(" and ")} versions`;
  }
  return "localized versions";
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

function agencyProspectBrand(row) {
  const issue = issueFragment(row.issue_1 || "");
  const match = issue.match(/^Agency partner prospect:\s*(.+?)(?:\s+publicly|\s+has\b|\s+is\b|\.|$)/i);
  return match?.[1]?.trim() || "";
}

function brandName(row, verification) {
  const title = verification.Title || "";
  const agencyBrand = agencyProspectBrand(row);
  if (agencyBrand) {
    return agencyBrand;
  }
  const fallbackBrand = domainBrand(row);
  const compact = String(row.domain || "")
    .replace(/\.framer\.website$/i, "")
    .replace(/\.framer\.app$/i, "")
    .replace(/\..*$/, "");

  if (BRAND_OVERRIDES.has(compact)) {
    return fallbackBrand;
  }
  if (/^Foil Company$/i.test(title)) {
    return fallbackBrand;
  }
  if (title && !/^(missing|my framer site|made with framer)$/i.test(title.trim())) {
    return title.split(/[|–—-]/)[0].trim();
  }
  return fallbackBrand;
}

function greetingName(row, verification) {
  const brand = brandName(row, verification);
  const title = verification.Title || "";
  const firstWord = brand.split(/\s+/)[0];
  const email = contactEmail(row);
  const genericFirstWords = new Set(["atelier", "studio", "agency", "design", "portfolio", "company"]);
  const hasTeamSuffix = /\b(Studio|Agency|Digital|Design|Lab|Labs|Group|Team)\b$/i.test(brand);
  const looksPersonal =
    (/\b(designer|portfolio|developer|consultant|freelance)\b/i.test(title) ||
      /@gmail\.com$/i.test(email)) &&
    /^[A-Z][a-z]+$/.test(firstWord) &&
    brand.split(/\s+/).length >= 2 &&
    !hasTeamSuffix &&
    !genericFirstWords.has(firstWord.toLowerCase());

  if (looksPersonal) {
    return firstWord;
  }
  return `${brand} team`;
}

function possessive(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "the site's";
  }
  return /s$/i.test(text) ? `${text}'` : `${text}'s`;
}

function issueFragment(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "");
}

function fixForIssue(issue) {
  const lower = String(issue || "").toLowerCase();

  if (lower.includes("llms.txt")) {
    return "publish a root /llms.txt that summarizes the site, key pages, and locale paths for AI-search crawlers";
  }
  if (lower.includes("json-ld") && lower.includes("inlanguage")) {
    return "set JSON-LD inLanguage values per locale so crawlers do not treat every version as the default language";
  }
  if (lower.includes("json-ld") || lower.includes("schema")) {
    return "add visible JSON-LD for Organization, WebSite, and the main page type in the published HTML";
  }
  if (lower.includes("title") && lower.includes("match default")) {
    return "give the localized page a language-specific title instead of reusing the default page title";
  }
  if (lower.includes("description") && lower.includes("match default")) {
    return "write a language-specific meta description for the localized page";
  }
  if (lower.includes("missing meta description")) {
    return "add a concise meta description before the page is handed off or promoted";
  }
  if (lower.includes("locale")) {
    return "verify each locale path has its own title, description, schema, and crawler-readable context";
  }
  return "turn this into a tracked launch QA item with an owner and a before/after verification step";
}

function day3ActionItems(row) {
  return auditIssues(row).map((issue) => {
    const observed = issueFragment(issue);
    const fix = fixForIssue(issue);
    return `Observed: ${observed}. Fix: ${fix}.`;
  });
}

function agencyPositioning(row, verification) {
  const issue = issueFragment(row.issue_1 || "");
  const match = issue.match(/^Agency partner prospect:\s*(.+)$/i);
  if (match?.[1]) {
    return match[1];
  }
  return `${brandName(row, verification)} has public Framer agency/expert positioning`;
}

function buildSubject(row, verification) {
  return `quick AEO QA note for ${brandName(row, verification)}`;
}

function campaignUrl(args, campaign) {
  try {
    const url = new URL(args.pluginUrl || "https://polyglotaeo.com");
    url.searchParams.set("utm_source", "outreach");
    url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return args.pluginUrl || "https://polyglotaeo.com";
  }
}

function sampleAuditUrl(args, campaign) {
  try {
    const base = new URL(args.pluginUrl || "https://polyglotaeo.com/audit/");
    const url = new URL("/audit/sample/", base.origin);
    url.searchParams.set("utm_source", "outreach");
    url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return "https://polyglotaeo.com/audit/sample/";
  }
}

function agencyUrl(args, campaign) {
  try {
    const base = new URL(args.pluginUrl || "https://polyglotaeo.com/audit/");
    const url = new URL("/agency/", base.origin);
    url.searchParams.set("utm_source", "outreach");
    url.searchParams.set("utm_campaign", campaign);
    url.hash = "template";
    return url.toString();
  } catch {
    return "https://polyglotaeo.com/agency/#template";
  }
}

function benchmarkUrl(args, campaign) {
  try {
    const base = new URL(args.pluginUrl || "https://polyglotaeo.com/audit/");
    const url = new URL("/framer-aeo-benchmark/", base.origin);
    url.searchParams.set("utm_source", "outreach");
    url.searchParams.set("utm_campaign", campaign);
    url.hash = "benchmark-request";
    return url.toString();
  } catch {
    return "https://polyglotaeo.com/framer-aeo-benchmark/#benchmark-request";
  }
}

function buildBody(row, verification, args) {
  const greeting = greetingName(row, verification);
  const brand = brandName(row, verification);
  const locales = localePhrase(row, verification);
  const firstIssue = row.issue_1 || "No reachable /llms.txt was detected at the site root.";
  const secondIssue = row.issue_2 || "No visible JSON-LD schema was detected on the homepage HTML.";

  return `Hi ${greeting},

I checked ${possessive(brand)} public Framer site because it appears to ship ${locales}; the main public AEO gap I saw is: ${issueFragment(firstIssue)}.

A second public signal: ${secondIssue}

That combination can make AI/search crawlers understand the default page while missing the localized version. I built Polyglot AEO for this exact handoff inside Framer: localized schema, llms.txt files, CMS gap checks, and published-site verification.

Want me to send a short 3-point mini audit for this site?

Best,
Jimmy

${campaignUrl(args, "default_day0")}`;
}

function buildValueFirstSubject(row, verification) {
  if (isAgencyPartner(row)) {
    return buildAgencyHandoffSubject(row, verification);
  }
  return `2 public AEO checks for ${brandName(row, verification)}`;
}

function buildValueFirstBody(row, verification, args) {
  if (isAgencyPartner(row)) {
    return buildAgencyHandoffBody(row, verification, args);
  }

  const greeting = greetingName(row, verification);
  const brand = brandName(row, verification);
  const locales = localePhrase(row, verification);
  const firstIssue = row.issue_1 || "No reachable /llms.txt was detected at the site root.";
  const secondIssue = row.issue_2 || "No visible JSON-LD schema was detected on the homepage HTML.";

  return `Hi ${greeting},

I checked ${possessive(brand)} public Framer site because it appears to ship ${locales}; the main public AEO gap I saw is: ${issueFragment(firstIssue)}.

The two public checks I would fix first:

1. ${firstIssue}
2. ${secondIssue}

That combination can make AI/search crawlers understand the default page, while localized pages lose schema, llms.txt, or language-specific context.

I built Polyglot AEO as a Framer plugin for exactly this QA pass: localized schema, llms.txt, CMS gap checks, and published-site verification.

I also put the public Framer AEO benchmark here, so the checks are inspectable before you reply:
${benchmarkUrl(args, "value_first_day0")}

If useful, I can send the short fix checklist I would use for this site.

Best,
Jimmy

${campaignUrl(args, "value_first_day0")}`;
}

function buildAgencyHandoffSubject(row, verification) {
  return `Free Framer handoff QA note for ${brandName(row, verification)}`;
}

function buildAgencyHandoffBody(row, verification, args) {
  const greeting = greetingName(row, verification);
  const brand = brandName(row, verification);
  const positioning = agencyPositioning(row, verification);

  return `Hi ${greeting},

I found ${brand} while reviewing Framer agency/expert sites. The public signal I noted: ${positioning}.

Quick thought: for Framer agencies, AEO QA is easier to sell as a client handoff note than as another SEO/plugin task.

I published the benchmark I am using for this review here, so you can inspect the checks before sending me anything:
${benchmarkUrl(args, "agency_partner_day0_benchmark")}

The useful deliverable for an agency is a free 3-point handoff note for one active Framer client launch: observed issue, client risk, and next fix across /llms.txt, localized schema/metadata, CMS gaps, and published-page checks.

If this maps to a current launch, send one public Framer client URL and I will return the note in that format. No meeting needed.

Best,
Jimmy`;
}

function buildDay3Subject(row, verification) {
  if (isAgencyPartner(row)) {
    return `Agency AEO QA checklist for ${brandName(row, verification)}`;
  }
  return `3 public AEO checks for ${brandName(row, verification)}`;
}

function buildDay3Body(row, verification, args) {
  const greeting = greetingName(row, verification);
  const brand = brandName(row, verification);
  const issues = day3ActionItems(row);

  if (isAgencyPartner(row)) {
    return `Hi ${greeting},

I mapped this to your public positioning: ${agencyPositioning(row, verification)}.

Since the first note was a bit abstract, I put the public Framer AEO benchmark online here:
${benchmarkUrl(args, "agency_partner_day3_benchmark")}

The agency use case is a pre-launch QA deliverable, not another generic SEO checklist:

1. Before launch: verify /llms.txt, schema, locale metadata, and CMS gaps on the published Framer domain.
2. During handoff: record each issue as observed risk plus next fix, so the client sees concrete QA evidence.
3. After launch: keep the same checklist for every multilingual client site instead of rebuilding it per project.

If useful, reply with one active Framer client URL and I will return a short 3-point note written in that benchmark format.

Best,
Jimmy`;
  }

  return `Hi ${greeting},

I turned the public crawl into a more concrete QA note for ${brand}, so you do not have to reply just to get the useful part:

${issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")}

This is the format I would use for a real mini audit: observation, risk, and next fix, not a generic SEO checklist.

I also put the public Framer AEO benchmark here, so you can inspect the checklist before asking for the audit:
${benchmarkUrl(args, "day3_benchmark")}

If useful, reply "audit" or submit the site on that page and I will turn this into a short 3-point mini audit for ${row.domain}.

Best,
Jimmy`;
}

function auditIssues(row) {
  const issues = [row.issue_1, row.issue_2, row.issue_3]
    .map((issue) => String(issue || "").trim())
    .filter(Boolean);

  const fallbacks = [
    "Check whether /llms.txt is reachable from the published root domain.",
    "Check whether homepage JSON-LD exists in the public HTML.",
    "Check whether localized pages keep language-specific title, description, and schema context.",
  ];

  for (const fallback of fallbacks) {
    if (issues.length >= 3) break;
    issues.push(fallback);
  }

  const seen = new Set();
  return issues.filter((issue) => {
    const key = issue.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function buildDay10Subject(row, verification) {
  if (isAgencyPartner(row)) {
    return `closing the loop on Framer AEO QA for ${brandName(row, verification)}`;
  }
  return `closing the loop on ${brandName(row, verification)}`;
}

function buildDay10Body(row, verification) {
  const greeting = greetingName(row, verification);
  const issue = row.issue_1 || "the localized AEO checks should be verified on the published domain.";

  if (isAgencyPartner(row)) {
    return `Hi ${greeting},

Closing the loop on this. The practical agency use case is a repeatable AEO QA pass before or after Framer client launches: llms.txt, localized schema, CMS gaps, and a short client-facing audit note.

I left the agency handoff template here if it helps on a future launch:
https://polyglotaeo.com/agency/#template

If this is not a priority right now, no worries. The free Polyglot AEO plugin is still useful as a quick internal checker for the next multilingual Framer project.

Best,
Jimmy
`;
  }

  return `Hi ${greeting},

Closing the loop on this. The quick takeaway from my public check was: ${issue}

If multilingual AEO QA is not a priority right now, no worries. The free Polyglot AEO plugin can still help your team check schema, llms.txt, CMS gaps, and the published domain inside Framer when the next locale update ships.

Best,
Jimmy

https://polyglotaeo.com`;
}

function isAgencyPartner(row) {
  return (
    String(row.source || "").includes("agency") ||
    String(row.issue_1 || "").toLowerCase().startsWith("agency partner prospect:")
  );
}

function renderLead(row, verification, audit, args) {
  let subject = buildSubject(row, verification);
  let body = buildBody(row, verification, args);
  let nextStatus = "sent_day_0";
  let variant = args.variant;

  if (args.variant === "report-first-v1") {
    if (!audit) throw new Error(`No public audit found for ${row.domain}.`);
    const email = renderReportFirstEmail(audit, row, {
      senderName: args.senderName,
      postalAddress: args.postalAddress,
      includeProductLink: args.includeProductLink,
      productUrl: args.pluginUrl,
    });
    if (email.blockers.length) {
      throw new Error(`${row.domain} is blocked: ${email.blockers.join("; ")}`);
    }
    subject = email.subject;
    body = email.body;
    nextStatus = "report_sent";
    variant = "report-first-v1";
  } else if (row.status !== "sent_day_0" && row.status !== "sent_day_3" && isAgencyPartner(row)) {
    subject = buildAgencyHandoffSubject(row, verification);
    body = buildAgencyHandoffBody(row, verification, args);
    variant = "agency-handoff-v2";
  } else if (row.status !== "sent_day_0" && row.status !== "sent_day_3" && args.variant === "value-first") {
    subject = buildValueFirstSubject(row, verification);
    body = buildValueFirstBody(row, verification, args);
  } else if (row.status === "sent_day_0") {
    subject = buildDay3Subject(row, verification);
    body = buildDay3Body(row, verification, args);
    nextStatus = "sent_day_3";
  } else if (row.status === "sent_day_3") {
    subject = buildDay10Subject(row, verification);
    body = buildDay10Body(row, verification);
    nextStatus = "sent_day_10";
  }

  const command = crmCommand(row, nextStatus, args, variant, audit);

  return {
    subject,
    body,
    command,
    nextStatus,
    variant,
    text: `Subject: ${subject}

${body}`,
  };
}

function crmCommand(row, nextStatus, args, variant = args.variant, audit) {
  const base = `pnpm lead:crm -- --domain ${row.domain} --set-status ${nextStatus}`;
  if (nextStatus === "report_sent") {
    return [
      base,
      `--audit-score ${shellEscape(audit?.score ?? row.audit_score ?? "")}`,
      `--audit-rating ${shellEscape(audit?.rating || row.audit_rating || "")}`,
      `--audit-checked-at ${shellEscape(audit?.checked_at || row.audit_checked_at || "")}`,
      `--audit-version ${shellEscape(audit?.audit_version || row.audit_version || "")}`,
      `--report-campaign ${shellEscape(row.report_campaign || "report-first-v1")}`,
      `--report-cohort ${shellEscape(row.report_cohort || "manual")}`,
      `--note ${shellEscape("outreach variant:report-first-v1; inline report body; no attachment")}`,
    ].join(" ");
  }
  if (nextStatus === "sent_day_0" && variant !== "default") {
    return `${base} --note "outreach variant:${variant}"`;
  }
  return base;
}

function firstTouchVariantForRow(row, args) {
  if (isAgencyPartner(row)) {
    return "agency-handoff-v2";
  }
  return args.variant;
}

function markSentCommand(row, audit, args) {
  if (args.variant === "report-first-v1") {
    return crmCommand(row, "report_sent", args, "report-first-v1", audit);
  }
  if (row.status === "sent_day_0") {
    return crmCommand(row, "sent_day_3", args);
  }
  if (row.status === "sent_day_3") {
    return crmCommand(row, "sent_day_10", args);
  }
  return crmCommand(row, "sent_day_0", args, firstTouchVariantForRow(row, args));
}

function renderMarkSentScript(rows, auditMap, args) {
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# Generated by pnpm lead:sendpack.",
    "# Run this only after you have actually sent every inline-body email in the send pack.",
    "# The local .eml/.txt files are draft helpers; do not attach review artifacts.",
    `cd ${shellEscape(process.cwd())}`,
    "",
  ];

  for (const row of rows) {
    const audit = auditMap.get(String(row.domain || "").toLowerCase().replace(/^www\./, ""));
    const command = markSentCommand(row, audit, args);
    const nextStatus = command.match(/--set-status\s+(\S+)/)?.[1] || "sent";
    lines.push(`echo ${shellEscape(`Marking ${row.domain} as ${nextStatus}`)}`);
    lines.push(command);
  }

  lines.push("");
  lines.push("pnpm lead:report");
  return `${lines.join("\n")}\n`;
}

function renderMarkdown(rows, verificationMap, auditMap, args) {
  const warning = futureScheduleWarning(args);
  const lines = [
    "# Framer Send Pack",
    "",
    `Generated: ${new Date().toISOString()}`,
    `CRM status: ${args.status}`,
    `Date: ${args.today}`,
    `Due only: ${args.dueOnly ? "yes" : "no"}`,
    `Rows: ${rows.length}`,
    "",
    "Use this only after opening the live site once more and confirming it is not a demo/template.",
    "For report-first-v1, the report is the email body. Never attach this pack, its JSON, or a PDF export.",
    "",
  ];
  if (warning) {
    lines.push("## Not Before", "", warning, "");
  }
  lines.push("## Leads", "");

  if (!rows.length) {
    lines.push("No leads matched the selected status.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Domain | Contact | Status | Evidence |");
  lines.push("|---|---|---|---|");
  for (const row of rows) {
    const verification = verificationMap.get(row.domain) || {};
    const audit = auditMap.get(String(row.domain || "").toLowerCase().replace(/^www\./, ""));
    const evidence = audit
      ? `${audit.rating}${audit.score === null ? "" : ` ${audit.score}/100`} / ${audit.coverage_pct}% coverage / ${audit.locales_checked.join(", ")}`
      : `${verification.Recommendation || "not verified"} / ${verification["Locale families"] || row.locales || "locales n/a"} / ${verification["llms.txt"] || row.issue_1 || ""}`;
    lines.push(
      `| ${row.domain} | ${row.contact_url || "manual"} | ${row.status} | ${evidence} |`,
    );
  }
  lines.push("");
  lines.push("## Batch update after sending");
  lines.push("");
  lines.push("After you have actually sent every email in this pack, run:");
  lines.push("");
  lines.push("```bash");
  lines.push(`bash ${args.markSent}`);
  lines.push("```");
  lines.push("");

  for (const row of rows) {
    const verification = verificationMap.get(row.domain) || {};
    const audit = auditMap.get(String(row.domain || "").toLowerCase().replace(/^www\./, ""));
    const send = renderLead(row, verification, audit, args);
    const command = markSentCommand(row, audit, args);
    lines.push(`## ${row.domain}`);
    lines.push("");
    lines.push(`- Contact: ${row.contact_url || "manual"}`);
    lines.push(`- URL: ${row.final_url || row.domain}`);
    lines.push(`- Verification: ${verification.Recommendation || "not found"}`);
    lines.push(`- Framer signals: ${verification["Framer signals"] || "not found"}`);
    lines.push(`- Locales: ${verification.Locales || row.locales || "not found"}`);
    lines.push(`- llms.txt: ${verification["llms.txt"] || "not found"}`);
    lines.push(`- JSON-LD blocks: ${verification["JSON-LD blocks"] || "not found"}`);
    lines.push(`- JSON-LD inLanguage: ${verification["JSON-LD inLanguage"] || "not found"}`);
    if (audit) {
      lines.push(`- Public readiness: ${audit.rating}${audit.score === null ? "" : ` · ${audit.score}/100`} · ${audit.coverage_pct}% coverage`);
      lines.push(`- Audit checked: ${audit.checked_at}`);
    }
    lines.push("");
    lines.push("Email:");
    lines.push("");
    lines.push("```text");
    lines.push(send.text);
    lines.push("```");
    lines.push("");
    if (args.variant !== "report-first-v1") {
      lines.push("Mini audit to send if they reply:");
      lines.push("");
      lines.push(`1. ${row.issue_1}`);
      if (row.issue_2) lines.push(`2. ${row.issue_2}`);
      if (row.issue_3) lines.push(`3. ${row.issue_3}`);
      lines.push("");
    }
    lines.push("After sending:");
    lines.push("");
    lines.push("```bash");
    lines.push(command);
    lines.push("```");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderEml(row, verification, audit, args) {
  const send = renderLead(row, verification, audit, args);
  const to = contactEmail(row);
  const headers = [
    foldHeaderLine("To", to),
    foldHeaderLine("Subject", send.subject),
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ];

  return `${headers.join("\r\n")}\r\n\r\n${send.body.replace(/\n/g, "\r\n")}\r\n`;
}

function renderHtml(rows, verificationMap, auditMap, args) {
  const warning = futureScheduleWarning(args);
  const batchCommand = `bash ${args.markSent}`;
  const batchCommands = rows
    .map((row) => markSentCommand(row, auditMap.get(String(row.domain || "").toLowerCase().replace(/^www\./, "")), args))
    .join("\n");
  const cards = rows
    .map((row) => {
      const verification = verificationMap.get(row.domain) || {};
      const audit = auditMap.get(String(row.domain || "").toLowerCase().replace(/^www\./, ""));
      const send = renderLead(row, verification, audit, args);
      const email = contactEmail(row);
      const fileBase = slug(row.domain);
      const emlHref = `${path.basename(args.outDir)}/${fileBase}.eml`;
      const txtHref = `${path.basename(args.outDir)}/${fileBase}.txt`;
      const mailtoHref = email
        ? `mailto:${encodeMailto(email)}?subject=${encodeMailto(send.subject)}&body=${encodeMailto(send.body)}`
        : "";
      const command = markSentCommand(row, audit, args);

      return `
        <article class="lead" data-domain="${escapeHtml(row.domain)}">
          <div class="lead-head">
            <div>
              <h2>${escapeHtml(brandName(row, verification))}</h2>
              <p class="domain">${escapeHtml(row.domain)}</p>
            </div>
            <label class="done-toggle">
              <input type="checkbox" data-done="${escapeHtml(row.domain)}">
              <span>Sent</span>
            </label>
          </div>
          <dl class="facts">
            <div><dt>Contact</dt><dd>${escapeHtml(row.contact_url || "manual")}</dd></div>
            <div><dt>URL</dt><dd><a href="${escapeHtml(row.final_url || "")}">${escapeHtml(row.final_url || row.domain)}</a></dd></div>
            <div><dt>Verification</dt><dd>${escapeHtml(verification.Recommendation || "not found")}</dd></div>
            <div><dt>Locales</dt><dd>${escapeHtml(verification.Locales || row.locales || "not found")}</dd></div>
            <div><dt>llms.txt</dt><dd>${escapeHtml(verification["llms.txt"] || "not found")}</dd></div>
            <div><dt>JSON-LD</dt><dd>${escapeHtml(`${verification["JSON-LD blocks"] || "0"} blocks, inLanguage ${verification["JSON-LD inLanguage"] || "no"}`)}</dd></div>
            <div><dt>Score</dt><dd>${escapeHtml(row.score)}</dd></div>
            ${audit ? `<div><dt>Public readiness</dt><dd>${escapeHtml(`${audit.rating}${audit.score === null ? "" : ` · ${audit.score}/100`} · ${audit.coverage_pct}% coverage`)}</dd></div>` : ""}
          </dl>
          <div class="actions">
            ${mailtoHref ? `<a class="button primary" href="${mailtoHref}">Open Mailto</a>` : ""}
            <a class="button" href="${escapeHtml(emlHref)}">Open EML</a>
            <a class="button" href="${escapeHtml(txtHref)}">Open TXT</a>
            <button class="button" type="button" data-copy="${escapeHtml(command)}">Copy CRM Command</button>
          </div>
          <section>
            <h3>Email</h3>
            <pre>${escapeHtml(send.text)}</pre>
          </section>
          ${args.variant === "report-first-v1" ? "" : `<section>
            <h3>Mini Audit</h3>
            <ol>
              <li>${escapeHtml(row.issue_1)}</li>
              ${row.issue_2 ? `<li>${escapeHtml(row.issue_2)}</li>` : ""}
              ${row.issue_3 ? `<li>${escapeHtml(row.issue_3)}</li>` : ""}
            </ol>
          </section>`}
          <section>
            <h3>After Sending</h3>
            <code>${escapeHtml(command)}</code>
          </section>
        </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Framer Send Pack</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #17181c; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    header { margin-bottom: 24px; }
    h1 { font-size: 32px; margin: 0 0 8px; letter-spacing: 0; }
    h2 { font-size: 22px; margin: 0; letter-spacing: 0; }
    h3 { font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .06em; color: #5c6470; }
    p { line-height: 1.55; }
    .session { position: sticky; top: 0; z-index: 2; background: rgba(246, 247, 249, .96); border-bottom: 1px solid #dfe3ea; padding: 16px 0; margin-bottom: 18px; backdrop-filter: blur(12px); }
    .session-inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .session strong { display: block; font-size: 18px; }
    .session span { color: #5d6675; }
    .lead { background: white; border: 1px solid #dfe3ea; border-radius: 8px; padding: 20px; margin: 18px 0; box-shadow: 0 10px 24px rgba(20, 30, 48, .06); }
    .lead.is-done { border-color: #8fd4a7; background: #fbfffc; }
    .lead-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .domain { margin: 4px 0 0; color: #677080; }
    .done-toggle { display: inline-flex; align-items: center; gap: 8px; background: #eef5ff; color: #1d5fa7; border-radius: 999px; padding: 6px 10px; font-size: 13px; white-space: nowrap; cursor: pointer; }
    .done-toggle input { margin: 0; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin: 18px 0; }
    .facts div { border: 1px solid #e6e9ef; border-radius: 8px; padding: 10px; background: #fbfcfe; min-width: 0; }
    dt { font-size: 12px; color: #697282; margin-bottom: 4px; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 12px; border: 1px solid #cbd2dc; border-radius: 6px; color: #1f2937; text-decoration: none; background: #fff; font: inherit; cursor: pointer; }
    .button.primary { background: #20242c; color: white; border-color: #20242c; }
    .warning { border: 1px solid #e0b75b; background: #fff7db; color: #6a4b00; border-radius: 8px; padding: 12px 14px; font-weight: 700; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #10141b; color: #f3f6fb; border-radius: 8px; padding: 14px; line-height: 1.55; }
    code { display: block; overflow-wrap: anywhere; background: #f0f3f7; border: 1px solid #dce2ea; border-radius: 6px; padding: 10px; }
    li { margin: 6px 0; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Framer Send Pack</h1>
      <p>Generated for CRM status <strong>${escapeHtml(args.status)}</strong> on <strong>${escapeHtml(args.today)}</strong>. Due only: <strong>${args.dueOnly ? "yes" : "no"}</strong>. Rows: <strong>${rows.length}</strong>.</p>
      <p>Open each live site once more, confirm it is not a demo/template, then use the mailto or EML draft and update CRM after sending. The report stays inline in the email body; do not attach any review artifact.</p>
      ${warning ? `<p class="warning">${escapeHtml(warning)}</p>` : ""}
    </header>
    <section class="session">
      <div class="session-inner">
        <div>
          <strong><span id="done-count">0</span> / ${rows.length} sent</strong>
          <span>After every email is sent, run <code>${escapeHtml(batchCommand)}</code></span>
        </div>
        <div class="actions">
          <button class="button" type="button" data-copy-all="true">Copy All CRM Commands</button>
          <a class="button primary" href="${escapeHtml(path.basename(args.markSent))}">Open Batch Script</a>
        </div>
      </div>
    </section>
    ${cards || "<p>No verified leads.</p>"}
  </main>
  <script>
    const storageKey = ${jsString(`framer-send-pack:${args.crm}:${args.status}`)};
    const batchCommands = ${jsString(batchCommands)};
    const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const doneCount = document.getElementById("done-count");
    const checkboxes = Array.from(document.querySelectorAll("[data-done]"));

    function saveState() {
      localStorage.setItem(storageKey, JSON.stringify(state));
    }

    function renderProgress() {
      let count = 0;
      for (const input of checkboxes) {
        const done = Boolean(state[input.dataset.done]);
        input.checked = done;
        input.closest(".lead")?.classList.toggle("is-done", done);
        if (done) count += 1;
      }
      if (doneCount) doneCount.textContent = String(count);
    }

    for (const input of checkboxes) {
      input.addEventListener("change", () => {
        state[input.dataset.done] = input.checked;
        saveState();
        renderProgress();
      });
    }

    for (const button of document.querySelectorAll("[data-copy]")) {
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(button.dataset.copy || "");
        const old = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = old; }, 1200);
      });
    }

    for (const button of document.querySelectorAll("[data-copy-all]")) {
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(batchCommands);
        const old = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = old; }, 1200);
      });
    }

    renderProgress();
  </script>
</body>
</html>
`;
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const rows = (await readRows(args.crm)).filter((row) => {
    if (row.status !== args.status) {
      return false;
    }
    if (!args.dueOnly) {
      return true;
    }
    return Boolean(row.next_followup && row.next_followup <= args.today);
  });
  const verificationMap = parseVerification(await readText(args.verify));
  const auditMap = args.variant === "report-first-v1" ? await readAuditMap(args.audits) : new Map();
  if (args.variant === "report-first-v1" && rows.length > 0 && !args.postalAddress) {
    throw new Error("SENDER_POSTAL_ADDRESS (or --postal-address) is required for report-first-v1.");
  }
  if (args.variant === "report-first-v1" && rows.length > 0) {
    const senderPreflight = await readSenderPreflight(args.senderPreflight);
    if (!senderPreflight) {
      throw new Error(`Missing sender preflight ${args.senderPreflight}. Run pnpm lead:report-preflight first.`);
    }
    if (senderPreflight.status !== "pass") {
      throw new Error(`Sender preflight is ${senderPreflight.status || "invalid"}; resolve its failed checks before drafting.`);
    }
    if (!senderPreflight.valid_until || senderPreflight.valid_until < new Date().toISOString()) {
      throw new Error("Sender preflight is stale. Rerun pnpm lead:report-preflight before drafting.");
    }
    for (const row of rows) {
      const audit = auditMap.get(String(row.domain || "").toLowerCase().replace(/^www\./, ""));
      renderLead(row, {}, audit, args);
    }
  }
  const markdown = renderMarkdown(rows, verificationMap, auditMap, args);
  const html = renderHtml(rows, verificationMap, auditMap, args);

  await writeText(args.output, markdown);
  await writeText(args.html, html);
  await writeText(args.markSent, renderMarkSentScript(rows, auditMap, args));
  await chmod(args.markSent, 0o755);
  await rm(args.outDir, { recursive: true, force: true });
  await mkdir(args.outDir, { recursive: true });
  const files = [];
  for (const row of rows) {
    const verification = verificationMap.get(row.domain) || {};
    const audit = auditMap.get(String(row.domain || "").toLowerCase().replace(/^www\./, ""));
    const send = renderLead(row, verification, audit, args);
    const fileBase = slug(row.domain);
    const textFile = `${fileBase}.txt`;
    const emlFile = `${fileBase}.eml`;
    await writeText(path.join(args.outDir, textFile), `${send.text}\n`);
    await writeText(path.join(args.outDir, emlFile), renderEml(row, verification, audit, args));
    files.push({
      domain: row.domain,
      text: textFile,
      eml: emlFile,
      next_status: send.nextStatus,
      variant: send.variant,
    });
  }
  await writeText(
    path.join(args.outDir, SENDPACK_MANIFEST),
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        crm: args.crm,
        status: args.status,
        variant: args.variant,
        audits: args.variant === "report-first-v1" ? args.audits : "",
        sender_preflight: args.variant === "report-first-v1" ? args.senderPreflight : "",
        inline_report_only: args.variant === "report-first-v1",
        attachments: [],
        today: args.today,
        due_only: args.dueOnly,
        output: args.output,
        html: args.html,
        out_dir: args.outDir,
        mark_sent: args.markSent,
        row_count: rows.length,
        files,
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(
    `Wrote ${rows.length} send-ready lead(s) to ${args.output}, ${args.html}, ${args.markSent}, and ${args.outDir}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
