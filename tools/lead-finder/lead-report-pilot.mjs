#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadLocalEnv } from "./local-env.mjs";
import {
  PUBLIC_AUDIT_VERSION,
  auditPublicSite,
  emailMatchesSiteDomain,
  isCompanyDomainEmail,
  isCustomDomain,
  isOutreachMailbox,
  renderReportFirstEmail,
} from "./public-audit-lib.mjs";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_NEW_LEADS = ".tmp/framer-leads.csv";
const DEFAULT_JSON = ".tmp/polyglot-report-pilot.json";
const DEFAULT_MARKDOWN = ".tmp/polyglot-report-pilot.md";
const DEFAULT_CSV = ".tmp/polyglot-report-pilot.csv";

function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function usage() {
  return `
Usage:
  pnpm lead:report-pilot
  pnpm lead:report-pilot -- --crm tools/lead-finder/outreach.local.csv --new-leads .tmp/framer-leads.csv

Builds a local old/new report-first review pack. It audits public pages but
does not mutate CRM, create Gmail drafts, send email, or attach report files.

Options:
  --crm <file>               Existing outreach CRM. Default: ${DEFAULT_CRM}
  --new-leads <file>         New lead-finder CSV. Default: ${DEFAULT_NEW_LEADS}
  --json <file>              Audit bundle. Default: ${DEFAULT_JSON}
  --markdown <file>          Human review pack. Default: ${DEFAULT_MARKDOWN}
  --csv <file>               CRM/mail-merge CSV. Default: ${DEFAULT_CSV}
  --old-count <number>       Old-contact cohort size. Default: 5
  --new-count <number>       New-contact cohort size. Default: 5
  --today <YYYY-MM-DD>       Eligibility date. Default: local date
  --start-date <YYYY-MM-DD>  First scheduled review/send date. Default: today
  --seed <text>              Stable shuffle seed. Default: report-first-v1
  --cohort-note <text>       Optional cohort-change note stored in JSON/Markdown.
  --postal-address <address> Compliance footer; defaults to SENDER_POSTAL_ADDRESS.
  --sender-name <name>       Signature name. Default: Jimmy
  --include-product-link     Add one first-party product link. Default: off
  --product-url <url>        Product link base. Default: https://polyglotaeo.com
  --timeout-ms <number>      Public request timeout. Default: 12000
  --retries <number>         Transient retries. Default: 1
  --max-pages <number>       Pages sampled per site. Default: 4
  --help                     Show this help message.
`;
}

function intArg(value, name, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const today = todayLocal();
  const args = {
    crm: DEFAULT_CRM,
    newLeads: DEFAULT_NEW_LEADS,
    json: DEFAULT_JSON,
    markdown: DEFAULT_MARKDOWN,
    csv: DEFAULT_CSV,
    oldCount: 5,
    newCount: 5,
    today,
    startDate: today,
    seed: "report-first-v1",
    campaign: "report-first-v1",
    cohortNote: "",
    postalAddress: process.env.SENDER_POSTAL_ADDRESS || "",
    senderName: "Jimmy",
    includeProductLink: false,
    productUrl: "https://polyglotaeo.com",
    timeoutMs: 12000,
    retries: 1,
    maxPages: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    const stringOptions = {
      "--crm": "crm",
      "--new-leads": "newLeads",
      "--json": "json",
      "--markdown": "markdown",
      "--csv": "csv",
      "--today": "today",
      "--start-date": "startDate",
      "--seed": "seed",
      "--cohort-note": "cohortNote",
      "--postal-address": "postalAddress",
      "--sender-name": "senderName",
      "--product-url": "productUrl",
    };
    if (stringOptions[key]) {
      args[stringOptions[key]] = value;
      index += 1;
      continue;
    }
    if (key === "--old-count") {
      args.oldCount = intArg(value, key, true);
      index += 1;
      continue;
    }
    if (key === "--new-count") {
      args.newCount = intArg(value, key, true);
      index += 1;
      continue;
    }
    if (key === "--timeout-ms") {
      args.timeoutMs = intArg(value, key);
      index += 1;
      continue;
    }
    if (key === "--retries") {
      args.retries = intArg(value, key, true);
      index += 1;
      continue;
    }
    if (key === "--max-pages") {
      args.maxPages = intArg(value, key);
      index += 1;
      continue;
    }
    if (key === "--include-product-link") {
      args.includeProductLink = true;
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

function contactEmail(row) {
  if (row.contact_email) return String(row.contact_email).trim().toLowerCase();
  const contact = String(row.contact_url || "").trim();
  return /^mailto:/i.test(contact) ? contact.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase() : "";
}

function normalizeDomain(raw) {
  try {
    return new URL(/^https?:\/\//i.test(String(raw || "")) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return String(raw || "").toLowerCase().replace(/^www\./, "");
  }
}

function rowUrl(row) {
  const value = String(row.final_url || row.url || row.domain || "").trim();
  return /^https?:\/\//i.test(value) ? value : value ? `https://${value}` : "";
}

function localeFamilies(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[|,;]/)
        .map((locale) => locale.trim().toLowerCase())
        .filter(Boolean)
        .map((locale) => (locale === "zh-cn" || locale === "zh-tw" ? locale : locale.split("-")[0])),
    ),
  );
}

function dateAtMost(value, latest) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= latest);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function subtractDays(dateString, amount) {
  return addDays(dateString, -amount);
}

function nextBusinessDate(start, offset) {
  let date = start;
  let remaining = offset;
  while (true) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) {
      if (remaining === 0) return date;
      remaining -= 1;
    }
    date = addDays(date, 1);
  }
}

function looksLikePortfolio(row) {
  return /portfolio|template|demo/i.test(`${row.domain || ""} ${row.final_url || ""} ${row.title || ""} ${row.notes || ""}`);
}

function stableRank(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffled(rows, seed, cohort) {
  return [...rows].sort(
    (a, b) =>
      stableRank(`${seed}:${cohort}:${normalizeDomain(rowUrl(a))}`) -
        stableRank(`${seed}:${cohort}:${normalizeDomain(rowUrl(b))}`) ||
      normalizeDomain(rowUrl(a)).localeCompare(normalizeDomain(rowUrl(b))),
  );
}

function eligibleOldRows(rows, args) {
  const cutoff = subtractDays(args.today, 10);
  // Older CRM rows may not carry locale metadata; auditEligible verifies the
  // live site has at least two locale families before it can be selected.
  return shuffled(
    rows.filter((row) =>
      row.status === "sent_day_0" &&
      Number.parseInt(row.sent_count || "0", 10) === 1 &&
      dateAtMost(row.last_touch, cutoff) &&
      isCompanyDomainEmail(contactEmail(row)) &&
      isCustomDomain(rowUrl(row)) &&
      emailMatchesSiteDomain(contactEmail(row), rowUrl(row)) &&
      isOutreachMailbox(contactEmail(row)) &&
      !looksLikePortfolio(row),
    ),
    args.seed,
    "old",
  );
}

function eligibleNewRows(rows, crmDomains, args) {
  return shuffled(
    rows.filter((row) =>
      String(row.is_framer).toLowerCase() === "true" &&
      Number(row.framer_confidence || 0) >= 80 &&
      String(row.is_multilingual).toLowerCase() === "true" &&
      localeFamilies(row.locales).length >= 2 &&
      isCompanyDomainEmail(contactEmail(row)) &&
      isCustomDomain(rowUrl(row)) &&
      emailMatchesSiteDomain(contactEmail(row), rowUrl(row)) &&
      isOutreachMailbox(contactEmail(row)) &&
      !crmDomains.has(normalizeDomain(rowUrl(row))) &&
      !looksLikePortfolio(row),
    ),
    args.seed,
    "new",
  );
}

function buildFunnel(rows, stages) {
  let remaining = rows;
  return stages.map(({ label, test }) => {
    remaining = remaining.filter(test);
    return { label, count: remaining.length };
  });
}

function eligibilityStats(crmRows, newRows, crmDomains, args) {
  const cutoff = subtractDays(args.today, 10);
  return {
    old: buildFunnel(crmRows, [
      { label: "CRM rows", test: () => true },
      {
        label: "One Day-0 touch, at least 10 days old",
        test: (row) =>
          row.status === "sent_day_0" &&
          Number.parseInt(row.sent_count || "0", 10) === 1 &&
          dateAtMost(row.last_touch, cutoff),
      },
      { label: "Company-domain email", test: (row) => isCompanyDomainEmail(contactEmail(row)) },
      { label: "Custom domain", test: (row) => isCustomDomain(rowUrl(row)) },
      { label: "Email matches site domain", test: (row) => emailMatchesSiteDomain(contactEmail(row), rowUrl(row)) },
      { label: "Outreach-appropriate mailbox", test: (row) => isOutreachMailbox(contactEmail(row)) },
      { label: "Not a pure portfolio/template/demo", test: (row) => !looksLikePortfolio(row) },
    ]),
    new: buildFunnel(newRows, [
      { label: "Discovery rows", test: () => true },
      {
        label: "Framer confidence at least 80",
        test: (row) => String(row.is_framer).toLowerCase() === "true" && Number(row.framer_confidence || 0) >= 80,
      },
      {
        label: "At least two locale families",
        test: (row) =>
          String(row.is_multilingual).toLowerCase() === "true" && localeFamilies(row.locales).length >= 2,
      },
      { label: "Company-domain email", test: (row) => isCompanyDomainEmail(contactEmail(row)) },
      { label: "Custom domain", test: (row) => isCustomDomain(rowUrl(row)) },
      { label: "Email matches site domain", test: (row) => emailMatchesSiteDomain(contactEmail(row), rowUrl(row)) },
      { label: "Outreach-appropriate mailbox", test: (row) => isOutreachMailbox(contactEmail(row)) },
      { label: "Not already in CRM", test: (row) => !crmDomains.has(normalizeDomain(rowUrl(row))) },
      { label: "Not a pure portfolio/template/demo", test: (row) => !looksLikePortfolio(row) },
    ]),
  };
}

function auditEligible(audit) {
  const verifiedLocaleFamilies = new Set(
    audit.pages_checked
      .filter((page) => page.status >= 200 && page.status < 300)
      .flatMap((page) => localeFamilies(page.expected_locale)),
  );
  return (
    audit.score !== null &&
    audit.coverage_pct >= 75 &&
    verifiedLocaleFamilies.size >= 2 &&
    audit.findings.filter((finding) => finding.confidence === "high").length >= 2 &&
    audit.pages_checked[0]?.status >= 200 &&
    audit.pages_checked[0]?.status < 300
  );
}

async function fillCohort(candidates, count, cohort, args, auditLog) {
  const selected = [];
  for (const source of candidates) {
    if (selected.length >= count) break;
    try {
      const audit = await auditPublicSite(rowUrl(source), {
        timeoutMs: args.timeoutMs,
        retries: args.retries,
        maxPages: args.maxPages,
      });
      auditLog.push({ cohort, source, audit, eligible: auditEligible(audit) });
      if (auditEligible(audit)) selected.push({ cohort, source, audit });
    } catch (error) {
      auditLog.push({ cohort, source, error: error?.message || String(error), eligible: false });
    }
  }
  return selected;
}

function productUrl(args, cohort) {
  if (!args.includeProductLink) return "";
  try {
    const url = new URL(args.productUrl);
    url.searchParams.set("utm_source", "outreach");
    url.searchParams.set("utm_medium", "email");
    url.searchParams.set("utm_campaign", args.campaign);
    url.searchParams.set("utm_content", cohort);
    return url.href;
  } catch {
    return args.productUrl;
  }
}

function shellEscape(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function crmReadyCommand(row) {
  return [
    "pnpm lead:crm --",
    `--domain ${shellEscape(row.domain)}`,
    "--set-status report_ready",
    `--audit-score ${shellEscape(row.audit_score)}`,
    `--audit-rating ${shellEscape(row.audit_rating)}`,
    `--audit-checked-at ${shellEscape(row.audit_checked_at)}`,
    `--audit-version ${shellEscape(row.audit_version)}`,
    `--report-campaign ${shellEscape(row.report_campaign)}`,
    `--report-cohort ${shellEscape(row.report_cohort)}`,
    `--next-followup ${shellEscape(row.next_followup)}`,
    `--note ${shellEscape("report-first inline audit reviewed; no attachment")}`,
  ].join(" ");
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const columns = [
    "domain", "final_url", "locales", "score", "audit_score", "audit_rating", "audit_checked_at",
    "audit_version", "report_campaign", "report_cohort", "contact_url", "contact_email", "contact_channel",
    "status", "source", "issue_1", "issue_2", "issue_3", "subject", "email_body", "manual_check",
    "created_at", "last_touch", "next_action", "next_followup", "sent_count", "scheduled_order",
    "send_ready", "send_blockers",
  ];
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n")}\n`;
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

export function scheduleCohorts(oldSelected, newSelected, args) {
  const oldQueue = [...oldSelected];
  const newQueue = [...newSelected];
  const scheduledDays = [];

  while (oldQueue.length || newQueue.length) {
    const pair = [];
    if (oldQueue.length && newQueue.length) {
      pair.push(oldQueue.shift(), newQueue.shift());
    } else {
      const remaining = oldQueue.length ? oldQueue : newQueue;
      while (pair.length < 2 && remaining.length) pair.push(remaining.shift());
    }
    const dayIndex = scheduledDays.length;
    const date = nextBusinessDate(args.startDate, dayIndex);
    scheduledDays.push({
      date,
      entries: pair.sort(
        (a, b) =>
          stableRank(`${args.seed}:${date}:${a.cohort}:${normalizeDomain(rowUrl(a.source))}`) -
            stableRank(`${args.seed}:${date}:${b.cohort}:${normalizeDomain(rowUrl(b.source))}`) ||
          normalizeDomain(rowUrl(a.source)).localeCompare(normalizeDomain(rowUrl(b.source))),
      ),
    });
  }

  return scheduledDays;
}

function buildRows(oldSelected, newSelected, args) {
  const rows = [];
  const scheduledDays = scheduleCohorts(oldSelected, newSelected, args);

  for (const { date, entries: pair } of scheduledDays) {
    for (const [order, entry] of pair.entries()) {
      const { source, audit, cohort } = entry;
      const email = renderReportFirstEmail(audit, source, {
        senderName: args.senderName,
        postalAddress: args.postalAddress,
        includeProductLink: args.includeProductLink,
        productUrl: productUrl(args, cohort),
      });
      rows.push({
        brand: email.subject.replace(/^3 public Framer checks for /, ""),
        domain: audit.domain,
        final_url: audit.final_url,
        locales: source.locales || audit.locales_checked.join("|"),
        score: source.score || source.pain_score || "",
        audit_score: audit.score ?? "",
        audit_rating: audit.rating,
        audit_checked_at: audit.checked_at,
        audit_version: audit.audit_version,
        report_campaign: args.campaign,
        report_cohort: cohort,
        contact_url: source.contact_url || (source.contact_email ? `mailto:${source.contact_email}` : ""),
        contact_email: contactEmail(source),
        contact_channel: "email",
        status: "report_ready",
        source: cohort === "old" ? source.source || args.crm : args.newLeads,
        issue_1: audit.findings[0]?.observed || "",
        issue_2: audit.findings[1]?.observed || "",
        issue_3: audit.findings[2]?.observed || "",
        subject: email.subject,
        email_body: email.body,
        manual_check: "Open every evidence URL, confirm the brand/contact/site state, and rerun reply/bounce/unsubscribe preflight. Inline body only; no attachment.",
        created_at: source.created_at || args.today,
        last_touch: source.last_touch || "",
        next_action: "manual_review_inline_report",
        next_followup: date,
        sent_count: source.sent_count || "0",
        scheduled_order: `${date}-${order + 1}`,
        send_ready: email.blockers.length === 0 ? "true" : "false",
        send_blockers: email.blockers.join(" | "),
        audit,
      });
    }
  }
  return rows;
}

function renderMarkdown(rows, auditLog, eligibility, args) {
  const oldCount = rows.filter((row) => row.report_cohort === "old").length;
  const newCount = rows.filter((row) => row.report_cohort === "new").length;
  const readyCount = rows.filter((row) => row.send_ready === "true").length;
  const lines = [
    "# Polyglot report-first pilot",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Campaign: ${args.campaign}`,
    `Selected: ${oldCount} old + ${newCount} new`,
    ...(args.cohortNote ? [`Cohort note: ${args.cohortNote}`] : []),
    `Compliance send-ready: ${readyCount}/${rows.length}`,
    "",
    "This is a local dry-run. Reports are rendered directly inside each email body; no PDF, image, or report attachment is created.",
    "",
    "## Schedule",
    "",
    "| Order | Cohort | Domain | Score | Coverage | Ready |",
    "|---|---|---|---:|---:|---|",
    ...rows.map(
      (row) => `| ${row.scheduled_order} | ${row.report_cohort} | ${row.domain} | ${row.audit_score} | ${row.audit.coverage_pct}% | ${row.send_ready} |`,
    ),
    "",
    "## Required workflow",
    "",
    `1. Import locally with \`pnpm lead:crm -- --import ${args.csv}\`; existing old rows keep their current status.`,
    "2. Open every evidence URL and verify the named recipient, current site state, and suppression status.",
    "3. Run the matching CRM command below only after the inline report is approved.",
    "4. Generate drafts with `pnpm lead:sendpack -- --status report_ready --variant report-first-v1 --audits .tmp/polyglot-report-pilot.json`.",
    "5. Sending remains manual. Do not attach this Markdown/JSON/CSV file to the email.",
    "",
  ];
  for (const row of rows) {
    lines.push(
      `## ${row.scheduled_order} · ${row.domain}`,
      "",
      `- Cohort: ${row.report_cohort}`,
      `- Contact: ${row.contact_url}`,
      `- Audit: ${row.audit_rating} · ${row.audit_score}/100 · ${row.audit.coverage_pct}% coverage`,
      `- Send ready: ${row.send_ready}${row.send_blockers ? ` — ${row.send_blockers}` : ""}`,
      "",
      "```text",
      `Subject: ${row.subject}`,
      "",
      row.email_body,
      "```",
      "",
      "CRM review command:",
      "",
      "```bash",
      crmReadyCommand(row),
      "```",
      "",
    );
  }
  const rejected = auditLog.filter((entry) => !entry.eligible);
  lines.push(
    "## Prefilter funnel",
    "",
    "| Cohort | Stage | Remaining |",
    "|---|---|---:|",
    ...eligibility.old.map((stage) => `| Old | ${stage.label} | ${stage.count} |`),
    ...eligibility.new.map((stage) => `| New | ${stage.label} | ${stage.count} |`),
    "",
    "## Selection audit",
    "",
    `- Candidate audits attempted: ${auditLog.length}`,
    `- Rejected after public audit: ${rejected.length}`,
  );
  for (const entry of rejected) {
    lines.push(`- ${entry.cohort} · ${normalizeDomain(rowUrl(entry.source))}: ${entry.error || "did not meet coverage/locale/finding requirements"}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const [crmRows, newLeadRows] = await Promise.all([readCsv(args.crm), readCsv(args.newLeads)]);
  const crmDomains = new Set(crmRows.map((row) => normalizeDomain(row.domain)));
  const eligibility = eligibilityStats(crmRows, newLeadRows, crmDomains, args);
  const oldCandidates = eligibleOldRows(crmRows, args);
  const newCandidates = eligibleNewRows(newLeadRows, crmDomains, args);
  const auditLog = [];
  const oldSelected = await fillCohort(oldCandidates, args.oldCount, "old", args, auditLog);
  const newSelected = await fillCohort(newCandidates, args.newCount, "new", args, auditLog);
  const rows = buildRows(oldSelected, newSelected, args);
  const generatedAt = new Date().toISOString();
  const json = {
    audit_version: PUBLIC_AUDIT_VERSION,
    generated_at: generatedAt,
    campaign: args.campaign,
    cohort_note: args.cohortNote,
    dry_run: true,
    requested: { old: args.oldCount, new: args.newCount },
    selected: { old: oldSelected.length, new: newSelected.length },
    prefilter_funnel: eligibility,
    audits: rows.map((row) => ({ ...row.audit, source_row: Object.fromEntries(Object.entries(row).filter(([key]) => key !== "audit")) })),
    selection_log: auditLog.map((entry) => ({
      cohort: entry.cohort,
      domain: normalizeDomain(rowUrl(entry.source)),
      eligible: entry.eligible,
      error: entry.error || "",
      audit_score: entry.audit?.score ?? null,
      coverage_pct: entry.audit?.coverage_pct ?? null,
      high_confidence_findings: entry.audit?.findings.filter((finding) => finding.confidence === "high").length ?? 0,
    })),
  };
  await Promise.all([
    writeText(args.json, `${JSON.stringify(json, null, 2)}\n`),
    writeText(args.markdown, renderMarkdown(rows, auditLog, eligibility, args)),
    writeText(args.csv, toCsv(rows)),
  ]);
  process.stdout.write(
    `Report-first pilot: selected ${oldSelected.length}/${args.oldCount} old and ${newSelected.length}/${args.newCount} new.\n` +
      `Local dry-run outputs: ${args.json}, ${args.markdown}, ${args.csv}\n` +
      "No email was sent, no Gmail draft was created, and no report attachment was produced.\n",
  );
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedUrl) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
