#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TARGETS = "tools/lead-finder/landing-targets.local.csv";
const DEFAULT_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_OUTPUT = ".tmp/framer-owned-site-audit.md";
const DEFAULT_JSON = ".tmp/framer-owned-site-audit.json";

function usage() {
  return `
Usage:
  pnpm lead:owned-sites

Options:
  --targets <file>       Landing target registry CSV. Default: ${DEFAULT_TARGETS}
  --baseline <file>      Landing baseline JSON. Default: ${DEFAULT_BASELINE}
  --output <file>        Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>          JSON output. Default: ${DEFAULT_JSON}
  --skip-fetch           Do not fetch URLs; render registry-only audit.
  --help                 Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    targets: DEFAULT_TARGETS,
    baseline: DEFAULT_BASELINE,
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
      "--baseline": "baseline",
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

function baselineForPlugin(plugin, baseline) {
  const rows = Array.isArray(baseline?.rows) ? baseline.rows : [];
  return rows.find((row) => samePlugin(row.plugin, plugin)) || null;
}

function pluginNeedles(plugin) {
  const map = {
    "Polyglot AEO": ["polyglot", "aeo"],
    "Ally Auditor": ["ally", "auditor", "accessib"],
    "Loka - Localization Hub": ["loka", "localiz", "translate"],
    "Gaode Maps": ["gaode", "amap", "maps"],
  };
  return map[plugin] || slug(plugin).split("-").filter(Boolean);
}

function normalizeUrl(value) {
  try {
    return new URL(value).href;
  } catch {
    return String(value || "");
  }
}

async function fetchSite(row, skipFetch) {
  const url = String(row.target_url || "").trim();
  if (!url || skipFetch) {
    return {
      ok: false,
      skipped: Boolean(skipFetch),
      status: 0,
      final_url: url,
      content_type: "",
      html: "",
      error: url ? "" : "missing target_url",
    };
  }
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "FramerOwnedSiteAudit/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    return {
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      content_type: response.headers.get("content-type") || "",
      html: await response.text(),
      error: "",
    };
  } catch (error) {
    return fetchWithCurl(url, error);
  }
}

async function fetchWithCurl(url, fetchError) {
  const marker = "\n__FRAMER_OWNED_SITE_META__";
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
        "FramerOwnedSiteAudit/1.0",
        "--write-out",
        `${marker}%{http_code}|%{url_effective}|%{content_type}`,
        url,
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 25000 },
    );
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex < 0) {
      return {
        ok: false,
        status: 0,
        final_url: url,
        content_type: "",
        html: "",
        error: `curl metadata marker missing after fetch error: ${fetchError?.message || fetchError || ""}`,
      };
    }
    const html = stdout.slice(0, markerIndex);
    const [statusText, finalUrl, contentType] = stdout.slice(markerIndex + marker.length).split("|");
    const status = Number.parseInt(statusText, 10) || 0;
    return {
      ok: status >= 200 && status < 400,
      status,
      final_url: finalUrl || url,
      content_type: contentType || "",
      html,
      error: fetchError?.message || "",
      fallback: "curl",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      final_url: url,
      content_type: "",
      html: "",
      error: `${fetchError?.message || ""}; curl: ${error?.message || error}`,
    };
  }
}

function htmlText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchTag(html, pattern) {
  const match = String(html || "").match(pattern);
  return decodeHtml(match?.[1] || "");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function linksFromHtml(html, base) {
  const links = [];
  const regex = /\b(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(String(html || "")))) {
    const raw = decodeHtml(match[1]);
    if (!raw || raw.startsWith("#") || raw.startsWith("data:")) continue;
    try {
      links.push(new URL(raw, base).href);
    } catch {
      links.push(raw);
    }
  }
  return Array.from(new Set(links));
}

function classify({ row, baseline, site, links, text }) {
  const registryStatus = String(row.status || "");
  const blockedByRegistry = /blocked/i.test(registryStatus);
  const marketplaceLinks = links.filter((link) => link.includes("framer.com/community/marketplace/plugins/"));
  const trackedMarketplaceLinks = marketplaceLinks.filter((link) => hasUtm(link));
  const directCreemLinks = links.filter((link) => /creem\.io/i.test(link));
  const checkoutLinks = links.filter((link) => /checkout|pricing|license|creem/i.test(link));
  const legacyCheckoutLinks = links.filter((link) => /polyglot-license\.jimmymjing\.workers\.dev/i.test(link));
  const expectedTracked = baseline?.tracked_marketplace_url || "";
  const expectedCampaign = baseline?.campaign || "";
  const expectedCampaignHits = expectedCampaign
    ? links.filter((link) => link.includes(`utm_campaign=${encodeURIComponent(expectedCampaign)}`) || link.includes(`utm_campaign=${expectedCampaign}`))
    : [];
  const needles = pluginNeedles(row.plugin);
  const brandTextPresent = needles.some((needle) => text.toLowerCase().includes(needle));
  const netlifyForms = /data-netlify|name=["']form-name["']/i.test(site.html);
  const formCount = (site.html.match(/<form\b/gi) || []).length;
  const hasEventForm = /framer-aeo-event|utm_source|utm_campaign|landing_path/i.test(site.html);

  const blockers = [];
  const gaps = [];
  const signals = [];
  if (!site.ok) blockers.push(`Site not reachable: status=${site.status}; ${site.error || "fetch failed"}`);
  else signals.push(`Site reachable: ${site.status}`);
  if (blockedByRegistry) blockers.push(`Registry status is ${registryStatus}`);
  if (!brandTextPresent) gaps.push("Brand/product text not obvious on page.");
  if (!marketplaceLinks.length) gaps.push("No Framer Marketplace CTA link found.");
  if (marketplaceLinks.length && !trackedMarketplaceLinks.length) gaps.push("Marketplace CTA exists but has no UTM tracking.");
  if (expectedTracked && !expectedCampaignHits.length) gaps.push(`Expected campaign ${expectedCampaign} not found in links.`);
  if (row.plugin === "Loka - Localization Hub" && directCreemLinks.length) blockers.push("Loka page contains direct Creem links while compliance origin is unresolved.");
  if (legacyCheckoutLinks.length) blockers.push("Legacy Polyglot checkout host appears on owned site.");
  if (trackedMarketplaceLinks.length) signals.push("Tracked Marketplace CTA present.");
  else if (marketplaceLinks.length) signals.push("Marketplace CTA present.");
  if (formCount) signals.push(`${formCount} form(s) present.`);

  let readiness = "needs_work";
  if (blockers.length) readiness = "blocked";
  else if (site.ok && brandTextPresent && trackedMarketplaceLinks.length) readiness = "ready_for_recording";
  else if (site.ok && brandTextPresent) readiness = "needs_cta_tracking";

  return {
    readiness,
    signals,
    gaps,
    blockers,
    marketplace_links: marketplaceLinks,
    tracked_marketplace_links: trackedMarketplaceLinks,
    direct_creem_links: directCreemLinks,
    checkout_links: checkoutLinks,
    legacy_checkout_links: legacyCheckoutLinks,
    expected_tracked_marketplace_url: expectedTracked,
    expected_campaign: expectedCampaign,
    expected_campaign_hits: expectedCampaignHits,
    brand_text_present: brandTextPresent,
    form_count: formCount,
    netlify_forms: netlifyForms,
    attribution_markers: hasEventForm,
  };
}

async function auditRow(row, baseline, skipFetch) {
  const baselineRow = baselineForPlugin(row.plugin, baseline);
  const site = await fetchSite(row, skipFetch);
  const title = matchTag(site.html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = matchTag(site.html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || matchTag(site.html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const links = linksFromHtml(site.html, site.final_url || row.target_url);
  const text = htmlText(site.html);
  const assessment = classify({ row, baseline: baselineRow, site, links, text });
  return {
    plugin: row.plugin,
    target_url: row.target_url,
    registry_status: row.status || "",
    source: row.source || "",
    notes: row.notes || "",
    status: site.status,
    ok: site.ok,
    final_url: site.final_url,
    content_type: site.content_type,
    title,
    description,
    body_chars: text.length,
    html_chars: site.html.length,
    error: site.error || "",
    readiness: assessment.readiness,
    signals: assessment.signals,
    gaps: assessment.gaps,
    blockers: assessment.blockers,
    brand_text_present: assessment.brand_text_present,
    marketplace_link_count: assessment.marketplace_links.length,
    tracked_marketplace_link_count: assessment.tracked_marketplace_links.length,
    direct_creem_link_count: assessment.direct_creem_links.length,
    checkout_link_count: assessment.checkout_links.length,
    form_count: assessment.form_count,
    netlify_forms: assessment.netlify_forms,
    attribution_markers: assessment.attribution_markers,
    expected_campaign: assessment.expected_campaign,
    expected_campaign_hits: assessment.expected_campaign_hits,
    expected_tracked_marketplace_url: assessment.expected_tracked_marketplace_url,
    marketplace_links: assessment.marketplace_links.slice(0, 12),
    tracked_marketplace_links: assessment.tracked_marketplace_links.slice(0, 12),
    direct_creem_links: assessment.direct_creem_links.slice(0, 12),
    checkout_links: assessment.checkout_links.slice(0, 12),
    next_action: nextActionFor({ row, assessment }),
  };
}

function hasUtm(link) {
  try {
    const url = new URL(link);
    return Boolean(url.searchParams.get("utm_source") && url.searchParams.get("utm_campaign"));
  } catch {
    return /utm_source=.*utm_campaign=|utm_campaign=.*utm_source=/i.test(link);
  }
}

function nextActionFor({ row, assessment }) {
  if (assessment.blockers.length) return assessment.blockers[0];
  if (assessment.readiness === "ready_for_recording") {
    return `Record ${row.plugin} landing baseline only after confirmation and evidence capture.`;
  }
  if (!assessment.marketplace_links.length) return "Add a visible Framer Marketplace CTA with the tracked URL from the landing baseline report.";
  if (!assessment.tracked_marketplace_links.length) return "Replace Marketplace CTA with the UTM-tracked URL from the landing baseline report.";
  if (!assessment.brand_text_present) return "Make the plugin name/use case obvious in the first viewport.";
  return "Keep monitoring; rerun after copy or CTA changes.";
}

function build({ rows, baseline, skipFetch }) {
  const audits = rows.map((row) => auditRow(row, baseline, skipFetch));
  return Promise.all(audits).then((items) => {
    const counts = items.reduce((acc, item) => {
      acc[item.readiness] = (acc[item.readiness] || 0) + 1;
      return acc;
    }, {});
    return {
      generated_at: new Date().toISOString(),
      status: items.length ? "ready" : "missing_target_registry",
      recommendation: recommendationFor(items),
      counts,
      items,
    };
  });
}

function recommendationFor(items) {
  if (!items.length) return "Add owned site rows to tools/lead-finder/landing-targets.local.csv.";
  const blocked = items.find((item) => item.readiness === "blocked");
  if (blocked) return `Keep ${blocked.plugin} gated: ${blocked.next_action}`;
  const cta = items.find((item) => item.readiness === "needs_cta_tracking");
  if (cta) return `Improve ${cta.plugin} owned site CTA/tracking: ${cta.next_action}`;
  const ready = items.find((item) => item.readiness === "ready_for_recording");
  if (ready) return `Ready to record owned-site baseline after confirmation: ${ready.plugin}.`;
  return "Owned-site audit ready; use the per-site next actions before scaling traffic.";
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Owned Site Audit",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Readiness Counts",
    "",
    "| Readiness | Count |",
    "|---|---:|",
  ];
  for (const [key, count] of Object.entries(report.counts)) {
    lines.push(`| ${clean(key)} | ${count} |`);
  }
  if (!Object.keys(report.counts).length) lines.push("| none | 0 |");

  lines.push(
    "",
    "## Sites",
    "",
    "| Plugin | URL | HTTP | Readiness | Marketplace CTA | Tracked CTA | Forms | Creem links | Next action |",
    "|---|---|---:|---|---:|---:|---:|---:|---|",
  );
  for (const item of report.items) {
    lines.push(`| ${clean(item.plugin)} | ${clean(item.target_url)} | ${item.status || 0} | ${clean(item.readiness)} | ${item.marketplace_link_count} | ${item.tracked_marketplace_link_count} | ${item.form_count} | ${item.direct_creem_link_count} | ${clean(item.next_action)} |`);
  }

  for (const item of report.items) {
    lines.push(
      "",
      `## ${item.plugin}`,
      "",
      `- URL: ${item.target_url}`,
      `- Final URL: ${item.final_url || ""}`,
      `- Registry status: ${item.registry_status}`,
      `- Title: ${item.title || "missing"}`,
      `- Description: ${item.description || "missing"}`,
      `- Readiness: ${item.readiness}`,
      `- Brand text present: ${item.brand_text_present ? "yes" : "no"}`,
      `- Expected campaign: ${item.expected_campaign || "none"}`,
      `- Attribution markers: ${item.attribution_markers ? "yes" : "no"}`,
      "",
      "Signals:",
      ...listOrNone(item.signals),
      "",
      "Gaps:",
      ...listOrNone(item.gaps),
      "",
      "Blockers:",
      ...listOrNone(item.blockers),
    );
    if (item.tracked_marketplace_links.length || item.marketplace_links.length) {
      lines.push("", "Marketplace links:", ...[...item.tracked_marketplace_links, ...item.marketplace_links]
        .filter(uniqueFilter)
        .slice(0, 8)
        .map((link) => `- ${link}`));
    }
    if (item.direct_creem_links.length) {
      lines.push("", "Creem links:", ...item.direct_creem_links.slice(0, 8).map((link) => `- ${link}`));
    }
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This audit is read-only. It does not deploy, publish, submit, send email, or modify payment settings.",
    "- A reachable owned site is not enough to scale promotion; CTA tracking and action-log evidence are still required.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function uniqueFilter(value, index, arr) {
  return arr.indexOf(value) === index;
}

function listOrNone(values) {
  return values?.length ? values.map((value) => `- ${value}`) : ["- none"];
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
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

  const [rows, baseline] = await Promise.all([
    readRows(args.targets),
    readJson(args.baseline, null),
  ]);
  const report = await build({ rows, baseline, skipFetch: args.skipFetch });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Owned site audit: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
