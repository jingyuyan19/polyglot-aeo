#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TARGETS = "tools/lead-finder/landing-targets.local.csv";
const DEFAULT_OWNED_SITE_AUDIT = ".tmp/framer-owned-site-audit.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-creem-link-inventory.md";
const DEFAULT_JSON = ".tmp/framer-creem-link-inventory.json";

const KNOWN_CREEM_PRODUCTS = {
  "Ally Auditor": ["prod_5NLzeoJlyG2UcMeqfXiFKb"],
  "Gaode Maps": ["prod_70ue3EDfUUQmb1ohRBGeDU"],
  "Loka - Localization Hub": ["prod_4XxS1DWWjH5IHwNTmOEX9h"],
  "Polyglot AEO": [
    "prod_bcBjS641fdpc7R7IPMDSQ",
    "prod_26WFDeCASuir74jHgH3Kv2",
    "prod_5XtwOdU3HaSDrB9B5I6cyx",
    "prod_537xx0G3DBLLUhM2FAOnt0",
  ],
};

function usage() {
  return `
Usage:
  pnpm lead:creem-links

Options:
  --targets <file>          Landing target registry CSV. Default: ${DEFAULT_TARGETS}
  --owned-site-audit <file> Owned site audit JSON. Default: ${DEFAULT_OWNED_SITE_AUDIT}
  --actions <file>          Action log CSV. Default: ${DEFAULT_ACTIONS}
  --revenue <file>          Revenue CSV. Default: ${DEFAULT_REVENUE}
  --output <file>           Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>             JSON output. Default: ${DEFAULT_JSON}
  --skip-fetch              Use owned-site audit evidence only.
  --help                    Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    targets: DEFAULT_TARGETS,
    ownedSiteAudit: DEFAULT_OWNED_SITE_AUDIT,
    actions: DEFAULT_ACTIONS,
    revenue: DEFAULT_REVENUE,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    skipFetch: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--skip-fetch") {
      args.skipFetch = true;
      continue;
    }
    const map = {
      "--targets": "targets",
      "--owned-site-audit": "ownedSiteAudit",
      "--actions": "actions",
      "--revenue": "revenue",
      "--output": "output",
      "--json": "json",
    };
    if (map[key]) {
      args[map[key]] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${key}`);
  }
  return args;
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function readJson(file, fallback = null) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
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
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function samePlugin(left, right) {
  const a = slug(left).replace(/-localization-hub$/, "").replace(/-assistant$/, "");
  const b = slug(right).replace(/-localization-hub$/, "").replace(/-assistant$/, "");
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

async function fetchPage(url, skipFetch) {
  if (skipFetch || !/^https?:\/\//i.test(String(url || ""))) {
    return { ok: false, skipped: Boolean(skipFetch), status: 0, final_url: url || "", html: "", error: skipFetch ? "fetch skipped" : "missing URL" };
  }
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "FramerCreemLinkInventory/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    return {
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      server: response.headers.get("server") || "",
      cache_status: response.headers.get("cache-status") || "",
      html: await response.text(),
      error: "",
    };
  } catch (error) {
    return fetchWithCurl(url, error);
  }
}

async function fetchWithCurl(url, fetchError) {
  const marker = "\n__CREEM_LINK_INVENTORY_META__";
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-L",
        "--compressed",
        "--max-time",
        "20",
        "--silent",
        "--show-error",
        "--user-agent",
        "FramerCreemLinkInventory/1.0",
        "--write-out",
        `${marker}%{http_code}|%{url_effective}`,
        url,
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 25000 },
    );
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex < 0) {
      return { ok: false, status: 0, final_url: url, html: stdout, error: fetchError?.message || "curl metadata missing" };
    }
    const html = stdout.slice(0, markerIndex);
    const [statusText, finalUrl] = stdout.slice(markerIndex + marker.length).split("|");
    const status = Number(statusText || 0);
    return { ok: status >= 200 && status < 400, status, final_url: finalUrl || url, html, error: "" };
  } catch (error) {
    return { ok: false, status: 0, final_url: url, html: "", error: `${fetchError?.message || "fetch failed"}; curl: ${error?.message || error}` };
  }
}

function extractCreemOccurrences(html) {
  const pattern = /https?:\/\/(?:www\.)?creem\.io\/payment\/[A-Za-z0-9_-]+/gi;
  return String(html || "").match(pattern) || [];
}

function extractProductId(link) {
  const match = String(link || "").match(/\/payment\/(prod_[A-Za-z0-9_-]+)/i);
  return match?.[1] || "";
}

function matchingLines(html) {
  return String(html || "")
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((row) => /creem\.io\/payment|prod_/i.test(row.text))
    .slice(0, 20);
}

function pluginTerms(plugin) {
  const map = {
    "Polyglot AEO": ["polyglot", "framer_aeo"],
    "Ally Auditor": ["ally auditor", "ally"],
    "Loka - Localization Hub": ["loka", "loka pro", "getloka"],
    "Gaode Maps": ["gaode", "amap"],
  };
  return map[plugin] || [String(plugin || "").toLowerCase()];
}

function rowText(row) {
  return `${row.type || ""} ${row.channel || ""} ${row.campaign || ""} ${row.status || ""} ${row.target || ""} ${row.evidence || ""} ${row.note || ""} ${row.product || ""} ${row.customer || ""}`;
}

function matchingRows(rows, plugin) {
  const terms = pluginTerms(plugin);
  return rows.filter((row) => {
    const text = rowText(row).toLowerCase();
    return terms.some((term) => text.includes(term.toLowerCase()));
  });
}

function openComplianceWarnings(rows, plugin) {
  return matchingRows(rows, plugin).filter((row) => {
    const text = rowText(row);
    return /compliance_warning/i.test(row.type || "") && /needs_action|open|warning/i.test(text) && !/resolved|closed/i.test(text);
  });
}

function approvalEvidence(rows, plugin) {
  return matchingRows(rows, plugin).filter((row) => {
    const text = rowText(row);
    const actionScope = `${row.type || ""} ${row.channel || ""} ${row.campaign || ""} ${row.target || ""}`;
    if (!/creem|payment|checkout|store|compliance/i.test(actionScope)) return false;
    if (/tooling_update/i.test(row.type || "")) return false;
    if (/needs_action|waiting|blocked|open/i.test(row.status || "")) return false;
    if (/no\s+(?:new\s+)?(?:resolved|approved|approval|closure|closed)|no .*?(?:resolved|approved|approval|closure|closed)|not .*?(?:resolved|approved|registered|closed)|without .*?(?:resolved|approved|registered|closed)/i.test(text)) {
      return false;
    }
    if (/confirmation|confirm phrase|explicit confirmation/i.test(text) && !/creem.*(?:approved|registered|resolved|closed)|store.*(?:approved|registered|resolved|closed)|dashboard.*(?:approved|registered|resolved|closed)/i.test(text)) {
      return false;
    }
    return /(?:warning|compliance).*(?:resolved|closed)|(?:creem|provider|dashboard).*confirmed.*(?:approved|registered|resolved|closed)|(?:approved|registered|resolved|closed).*(?:by|in)\s+creem|store.*(?:is|was|has been)\s+(?:approved|registered)/i.test(text);
  });
}

function storeDomainEvidence(rows, plugin) {
  return matchingRows(rows, plugin).filter((row) => {
    const text = rowText(row);
    const actionScope = `${row.type || ""} ${row.channel || ""} ${row.campaign || ""} ${row.target || ""}`;
    if (!/creem|payment|checkout|store/i.test(actionScope)) return false;
    if (!/payment_verification/i.test(row.type || "")) return false;
    if (/needs_action|waiting|blocked|open/i.test(row.status || "")) return false;
    return /read-only creem dashboard verification|store\/domain pairing|separate .*store exists|website url/i.test(text);
  });
}

function positiveExternalRevenue(rows, plugin) {
  return matchingRows(rows, plugin).filter((row) => {
    const amount = Number(row.amount_usd || 0);
    const text = rowText(row);
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (/test environment|test mode|test\.creem\.io|jimmymjing@gmail\.com/i.test(text)) return false;
    return /creem|paid|sale|subscription|customer/i.test(text);
  });
}

function auditForPlugin(ownedSiteAudit, plugin) {
  const items = Array.isArray(ownedSiteAudit?.items) ? ownedSiteAudit.items : [];
  return items.find((item) => samePlugin(item.plugin, plugin)) || null;
}

function classify({ target, page, uniqueLinks, productIds, actionRows, revenueRows }) {
  const openWarnings = openComplianceWarnings(actionRows, target.plugin);
  const approvals = approvalEvidence(actionRows, target.plugin);
  const storeDomain = storeDomainEvidence(actionRows, target.plugin);
  const revenue = positiveExternalRevenue(revenueRows, target.plugin);
  const registryStatus = String(target.status || "");
  if (/blocked_compliance/i.test(registryStatus) || openWarnings.length) {
    return {
      status: "blocked_compliance",
      risk: "Do not scale checkout traffic until the provider identifies or closes the unregistered-origin warning.",
      open_warnings: openWarnings.length,
      approval_evidence: approvals.length,
      store_domain_evidence: storeDomain.length,
      revenue_signals: revenue.length,
    };
  }
  if (/blocked_checkout/i.test(registryStatus)) {
    return {
      status: "blocked_checkout",
      risk: "Checkout/custom-domain gate is not clean; keep promotion local-only.",
      open_warnings: openWarnings.length,
      approval_evidence: approvals.length,
      store_domain_evidence: storeDomain.length,
      revenue_signals: revenue.length,
    };
  }
  if (uniqueLinks.length && storeDomain.length) {
    return {
      status: "direct_checkout_with_local_store_domain_evidence",
      risk: "Direct checkout exists and local read-only dashboard evidence confirms the store/domain pairing; keep monitoring provider warnings and capture provider approval/closure if requested.",
      open_warnings: openWarnings.length,
      approval_evidence: approvals.length,
      store_domain_evidence: storeDomain.length,
      revenue_signals: revenue.length,
    };
  }
  if (uniqueLinks.length && !approvals.length) {
    return {
      status: "needs_store_domain_verification",
      risk: "Direct Creem checkout exists on an owned site, but no local evidence proves the site/store pairing is approved.",
      open_warnings: openWarnings.length,
      approval_evidence: approvals.length,
      store_domain_evidence: storeDomain.length,
      revenue_signals: revenue.length,
    };
  }
  if (uniqueLinks.length) {
    return {
      status: "direct_checkout_with_local_approval_evidence",
      risk: "Direct checkout exists; keep approval evidence attached before scaling traffic.",
      open_warnings: openWarnings.length,
      approval_evidence: approvals.length,
      store_domain_evidence: storeDomain.length,
      revenue_signals: revenue.length,
    };
  }
  if (!page.ok && !page.skipped) {
    return {
      status: "fetch_failed",
      risk: page.error || "Owned site fetch failed.",
      open_warnings: openWarnings.length,
      approval_evidence: approvals.length,
      store_domain_evidence: storeDomain.length,
      revenue_signals: revenue.length,
    };
  }
  return {
    status: "no_direct_creem_link",
    risk: "No direct Creem payment link found on the inspected owned URL.",
    open_warnings: openWarnings.length,
    approval_evidence: approvals.length,
    store_domain_evidence: storeDomain.length,
    revenue_signals: revenue.length,
  };
}

function nextActionFor(row) {
  if (row.status === "blocked_compliance") {
    return "Keep promotion blocked; wait for Creem human origin/referrer or dashboard approval evidence, then record closure.";
  }
  if (row.status === "blocked_checkout") {
    return "Resolve checkout/custom-domain gate before driving traffic.";
  }
  if (row.status === "needs_store_domain_verification") {
    return "Before scaling this owned site, confirm the Creem store Website URL/business matches this domain or move checkout through an approved bridge.";
  }
  if (row.status === "direct_checkout_with_local_approval_evidence") {
    return "Keep the approval evidence linked in action log and monitor payments/refunds.";
  }
  if (row.status === "direct_checkout_with_local_store_domain_evidence") {
    return "Keep the store/domain evidence linked in action log, monitor for new Creem warnings, and capture provider approval/closure if requested.";
  }
  if (row.status === "fetch_failed") return "Rerun inventory or inspect the owned URL manually.";
  return "No payment action needed for this inspected URL.";
}

async function inspectTarget({ target, ownedSiteAudit, actionRows, revenueRows, skipFetch }) {
  const page = await fetchPage(target.target_url, skipFetch);
  const fallbackAudit = auditForPlugin(ownedSiteAudit, target.plugin);
  const occurrences = page.html ? extractCreemOccurrences(page.html) : [];
  const fallbackLinks = Array.isArray(fallbackAudit?.direct_creem_links) ? fallbackAudit.direct_creem_links : [];
  const uniqueLinks = Array.from(new Set(occurrences.length ? occurrences : fallbackLinks));
  const productIds = Array.from(new Set(uniqueLinks.map(extractProductId).filter(Boolean)));
  const expectedProductIds = KNOWN_CREEM_PRODUCTS[target.plugin] || [];
  const expectedProductHit = expectedProductIds.length
    ? productIds.some((id) => expectedProductIds.includes(id))
    : null;
  const assessment = classify({ target, page, uniqueLinks, productIds, actionRows, revenueRows });
  const row = {
    plugin: target.plugin,
    target_url: target.target_url,
    registry_status: target.status || "",
    status: assessment.status,
    risk: assessment.risk,
    http_status: page.status || fallbackAudit?.status || 0,
    final_url: page.final_url || fallbackAudit?.final_url || target.target_url || "",
    direct_creem_unique_links: uniqueLinks.length,
    direct_creem_occurrences: occurrences.length || fallbackAudit?.direct_creem_link_count || 0,
    product_ids: productIds,
    expected_product_ids: expectedProductIds,
    expected_product_hit: expectedProductHit,
    open_compliance_warnings: assessment.open_warnings,
    approval_evidence_count: assessment.approval_evidence,
    store_domain_evidence_count: assessment.store_domain_evidence,
    external_revenue_signals: assessment.revenue_signals,
    links: uniqueLinks,
    matching_lines: page.html ? matchingLines(page.html) : [],
    source: page.html ? "live_fetch" : fallbackAudit ? "owned_site_audit_fallback" : "missing",
  };
  row.next_action = nextActionFor(row);
  return row;
}

function recommendationFor(rows) {
  const blocked = rows.find((row) => row.status === "blocked_compliance");
  if (blocked) return `Keep ${blocked.plugin} payment/compliance gated until Creem identifies or closes the exact origin/referrer.`;
  const verify = rows.find((row) => row.status === "needs_store_domain_verification");
  if (verify) return `Verify Creem store/domain approval before scaling owned-site traffic for ${verify.plugin}.`;
  const checkout = rows.find((row) => row.status === "blocked_checkout");
  if (checkout) return `Resolve checkout gate for ${checkout.plugin} before checkout-heavy promotion.`;
  return "No open direct-Creem blockers found in the inspected owned-site matrix.";
}

async function build({ targets, ownedSiteAudit, actionRows, revenueRows, skipFetch }) {
  const rows = await Promise.all(targets.map((target) => inspectTarget({
    target,
    ownedSiteAudit,
    actionRows,
    revenueRows,
    skipFetch,
  })));
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    acc.direct_creem_links += row.direct_creem_unique_links;
    acc.direct_creem_occurrences += row.direct_creem_occurrences;
    return acc;
  }, { direct_creem_links: 0, direct_creem_occurrences: 0 });
  return {
    generated_at: new Date().toISOString(),
    status: rows.length ? "ready" : "missing_targets",
    recommendation: recommendationFor(rows),
    counts,
    rows,
    guardrails: [
      "This inventory is read-only and does not modify Creem, payment links, websites, Gmail, or deployment state.",
      "Direct Creem links are not automatically wrong, but each owned site/business must be represented by an approved Creem store/site.",
      "Use provider/dashboard evidence before treating needs_store_domain_verification as closed.",
    ],
  };
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function renderMarkdown(report) {
  const lines = [
    "# Creem Link Inventory",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Counts",
    "",
    `- Direct Creem unique links: ${report.counts.direct_creem_links || 0}`,
    `- Direct Creem occurrences: ${report.counts.direct_creem_occurrences || 0}`,
    `- Blocked by compliance: ${report.counts.blocked_compliance || 0}`,
    `- Blocked by checkout: ${report.counts.blocked_checkout || 0}`,
    `- Needs store/domain verification: ${report.counts.needs_store_domain_verification || 0}`,
    `- Has local store/domain evidence: ${report.counts.direct_checkout_with_local_store_domain_evidence || 0}`,
    `- No direct Creem link: ${report.counts.no_direct_creem_link || 0}`,
    "",
    "## Matrix",
    "",
    "| Status | Plugin | URL | Product IDs | Direct links | Occurrences | Open warnings | Store/domain evidence | Approval evidence | Revenue signals | Next action |",
    "|---|---|---|---|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const row of report.rows) {
    lines.push(`| ${clean(row.status)} | ${clean(row.plugin)} | ${clean(row.target_url)} | ${clean(row.product_ids.join(", ") || "none")} | ${row.direct_creem_unique_links} | ${row.direct_creem_occurrences} | ${row.open_compliance_warnings} | ${row.store_domain_evidence_count} | ${row.approval_evidence_count} | ${row.external_revenue_signals} | ${clean(row.next_action)} |`);
  }
  if (!report.rows.length) lines.push("| none |  |  |  |  |  |  |  |  |  |  |");

  lines.push("", "## Direct Links", "", "| Plugin | Link |", "|---|---|");
  let linkRows = 0;
  for (const row of report.rows) {
    for (const link of row.links) {
      lines.push(`| ${clean(row.plugin)} | ${clean(link)} |`);
      linkRows += 1;
    }
  }
  if (!linkRows) lines.push("| none |  |");

  lines.push("", "## Evidence Lines", "", "| Plugin | Line | Text |", "|---|---:|---|");
  let evidenceRows = 0;
  for (const row of report.rows) {
    for (const line of row.matching_lines.slice(0, 5)) {
      lines.push(`| ${clean(row.plugin)} | ${line.line} | ${clean(line.text)} |`);
      evidenceRows += 1;
    }
  }
  if (!evidenceRows) lines.push("| none |  |  |");

  lines.push("", "## Guardrails", "");
  for (const rule of report.guardrails) lines.push(`- ${rule}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const [targets, ownedSiteAudit, actionRows, revenueRows] = await Promise.all([
    readRows(args.targets),
    readJson(args.ownedSiteAudit, null),
    readRows(args.actions),
    readRows(args.revenue),
  ]);
  const report = await build({ targets, ownedSiteAudit, actionRows, revenueRows, skipFetch: args.skipFetch });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Creem link inventory: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
