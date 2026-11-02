#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { annotateComplianceWarning, isOpenCreemComplianceWarning } from "./compliance-scope.mjs";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_CHECKOUT_ORIGIN = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_OUTPUT = ".tmp/framer-public-health.md";
const DEFAULT_JSON = ".tmp/framer-public-health.json";
const execFileAsync = promisify(execFile);

const PLUGINS = [
  {
    id: "polyglot_aeo",
    name: "Polyglot AEO",
    marketplace_url: "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/",
    public_pages: [
      { type: "landing", label: "Home", url: "https://polyglotaeo.com/", required: ["Polyglot AEO"] },
      {
        type: "pricing",
        label: "Pricing",
        url: "https://polyglotaeo.com/pricing/",
        required: ["Install free on Framer"],
      },
      {
        type: "checkout_bridge",
        label: "Checkout bridge",
        url:
          "https://polyglotaeo.com/go/checkout/?plan=monthly&target=https%3A%2F%2Flicense.polyglotaeo.com%2Fcheckout%3Fplan%3Dmonthly&utm_source=public_health&utm_campaign=checkout_bridge",
        required: ["Plugin checkout", "Continue to checkout"],
      },
      { type: "health", label: "License health", url: "https://license.polyglotaeo.com/health" },
    ],
    expected_checkout_hosts: ["license.polyglotaeo.com"],
    legacy_checkout_hosts: ["polyglot-license.jimmymjing.workers.dev"],
    next_action: "Keep Polyglot public traffic gated until the custom checkout domain and production pricing page are verified.",
  },
  {
    id: "ally_auditor",
    name: "Ally Auditor",
    marketplace_url: "https://www.framer.com/community/marketplace/plugins/ally-auditor/",
    public_pages: [],
    next_action: "Use Marketplace plus the real paid customer signal first; record a landing/checkout URL when one exists.",
  },
  {
    id: "loka_pro",
    name: "Loka - Localization Hub",
    marketplace_url: "https://www.framer.com/community/marketplace/plugins/loka-localization-hub/",
    public_pages: [
      { type: "landing", label: "Home", url: "https://getloka.dev/", required: ["Loka"] },
      { type: "pricing", label: "Pricing", url: "https://getloka.dev/pricing" },
    ],
    expected_checkout_hosts: ["creem.io", "www.creem.io"],
    next_action: "Wait for Creem human support to name the exact Loka origin/referrer before changing payment routing.",
  },
  {
    id: "gaode_maps_assistant",
    name: "Gaode Maps",
    marketplace_url: "https://www.framer.com/community/marketplace/plugins/gaode-maps-assistant/",
    public_pages: [],
    next_action: "Treat Marketplace as the current public surface; add a tracked tutorial URL before scaling content promotion.",
  },
];

function usage() {
  return `
Usage:
  pnpm lead:public-health

Options:
  --actions <file>      Action log CSV. Default: ${DEFAULT_ACTIONS}
  --checkout-origin <file> Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT_ORIGIN}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --skip-fetch          Read local action state only; do not fetch public URLs.
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    checkoutOrigin: DEFAULT_CHECKOUT_ORIGIN,
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
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--checkout-origin") {
      args.checkoutOrigin = value;
      index += 1;
      continue;
    }
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--json") {
      args.json = value;
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

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

async function fetchPage(page, skipFetch) {
  if (skipFetch) {
    return {
      ...page,
      ok: false,
      skipped: true,
      status: 0,
      final_url: page.url,
      title: "",
      description: "",
      missing_required: page.required || [],
      creem_links: [],
      links: [],
      expected_checkout_hits: [],
      legacy_checkout_hits: [],
    };
  }

  try {
    const response = await fetch(page.url, {
      headers: { "user-agent": "FramerPluginPublicHealth/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    const html = await response.text();
    return summarizePage({ page, response, html });
  } catch (error) {
    const fallback = await fetchPageWithCurl(page);
    if (fallback.ok || fallback.status) {
      return {
        ...fallback,
        fetch_error: error?.message || String(error),
        fetch_fallback: "curl",
      };
    }
    return {
      ...page,
      ok: false,
      status: 0,
      final_url: page.url,
      error: error?.message || String(error),
      title: "",
      description: "",
      missing_required: page.required || [],
      creem_links: [],
      links: [],
      expected_checkout_hits: [],
      legacy_checkout_hits: [],
    };
  }
}

async function fetchPageWithCurl(page) {
  const marker = "\n__FRAMER_PUBLIC_HEALTH_META__";
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
        "FramerPluginPublicHealth/1.0",
        "--write-out",
        `${marker}%{http_code}|%{url_effective}|%{content_type}`,
        page.url,
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 25000 },
    );
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex < 0) {
      return failedFallback(page, "curl metadata marker missing");
    }
    const html = stdout.slice(0, markerIndex);
    const [statusText, finalUrl, contentType] = stdout.slice(markerIndex + marker.length).split("|");
    const status = Number.parseInt(statusText, 10) || 0;
    return summarizePage({
      page,
      html,
      response: {
        ok: status >= 200 && status < 400,
        status,
        url: finalUrl || page.url,
        headers: {
          get(name) {
            return String(name || "").toLowerCase() === "content-type" ? contentType || "" : "";
          },
        },
      },
    });
  } catch (error) {
    return failedFallback(page, error?.message || String(error));
  }
}

function failedFallback(page, error) {
  return {
    ...page,
    ok: false,
    status: 0,
    final_url: page.url,
    error,
    title: "",
    description: "",
    missing_required: page.required || [],
    creem_links: [],
    links: [],
    expected_checkout_hits: [],
    legacy_checkout_hits: [],
  };
}

function summarizePage({ page, response, html }) {
  const text = htmlToText(html);
  const required = page.required || [];
  const links = extractLinks(html);
  return {
    ...page,
    ok: response.ok,
    status: response.status,
    final_url: response.url,
    content_type: response.headers.get("content-type") || "",
    title: extractTitle(html),
    description: extractMetaDescription(html),
    body_chars: text.length,
    missing_required: required.filter((pattern) => !containsPattern(html, pattern) && !containsPattern(text, pattern)),
    creem_links: unique(html.match(/https:\/\/(?:www\.)?creem\.io\/payment\/[A-Za-z0-9_-]+/g) || []),
    links,
    expected_checkout_hits: [],
    legacy_checkout_hits: [],
    html_excerpt: text.slice(0, 500),
    checkout_haystack: `${html}\n${text}\n${links.join("\n")}`,
  };
}

function extractLinks(html) {
  return unique(
    Array.from(String(html || "").matchAll(/https?:\/\/[^"'<>\s)]+/g)).map((match) => decodeHtml(match[0])),
  ).slice(0, 200);
}

function htmlToText(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function extractTitle(html) {
  return decodeHtml(String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function extractMetaDescription(html) {
  const htmlText = String(html || "");
  return decodeHtml(
    htmlText.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] ||
      htmlText.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i)?.[1] ||
      "",
  );
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPattern(text, pattern) {
  const source = String(text || "");
  const decodedHtml = decodeHtml(source);
  const decodedUriSource = safeDecodeURIComponent(source);
  const decodedUriHtml = safeDecodeURIComponent(decodedHtml);
  const encodedPattern = encodeURIComponent(pattern);
  return [source, decodedHtml, decodedUriSource, decodedUriHtml].some(
    (candidate) => candidate.includes(pattern) || candidate.includes(encodedPattern),
  );
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function enrichCheckoutHits(plugin, pages) {
  return pages.map((page) => {
    const haystack = page.checkout_haystack || `${page.html_excerpt || ""}\n${(page.links || []).join("\n")}`;
    const expected = (plugin.expected_checkout_hosts || []).filter((host) => containsPattern(haystack, host));
    const legacy = (plugin.legacy_checkout_hosts || []).filter((host) => containsPattern(haystack, host));
    return {
      ...page,
      expected_checkout_hits: expected,
      legacy_checkout_hits: legacy,
    };
  });
}

function openWarningsForPlugin(actions, pluginId) {
  return actions
    .filter(isOpenCreemComplianceWarning)
    .map(annotateComplianceWarning)
    .filter((row) => row.product_scope === pluginId);
}

function checkoutRequirement(checkoutOrigin, id) {
  return Array.isArray(checkoutOrigin?.requirements)
    ? checkoutOrigin.requirements.find((item) => item.id === id) || null
    : null;
}

function checkoutPass(checkoutOrigin, id) {
  return checkoutRequirement(checkoutOrigin, id)?.pass === true;
}

function checkoutDetail(checkoutOrigin, id) {
  const item = checkoutRequirement(checkoutOrigin, id);
  return item ? `${item.label}: ${item.pass ? "pass" : "fail"} (${item.detail || "no detail"})` : "";
}

function polyglotLocalCheckoutClean(checkoutOrigin) {
  return [
    "plugin_zip_origin",
    "local_static_origin",
    "worker_config_custom_domain",
  ].every((id) => checkoutPass(checkoutOrigin, id));
}

async function buildPluginReport(plugin, actions, skipFetch, checkoutOrigin) {
  const marketplace = await fetchPage(
    {
      type: "marketplace",
      label: "Marketplace",
      url: plugin.marketplace_url,
      required: [plugin.name.split(" - ")[0]],
    },
    skipFetch,
  );
  const publicPages = enrichCheckoutHits(
    plugin,
    await Promise.all(plugin.public_pages.map((page) => fetchPage(page, skipFetch))),
  );
  const pages = [marketplace, ...publicPages];
  const warnings = openWarningsForPlugin(actions, plugin.id);
  const blockers = [];
  const gaps = [];
  const signals = [];
  const localCheckoutClean = plugin.id === "polyglot_aeo" && polyglotLocalCheckoutClean(checkoutOrigin);

  if (marketplace.ok) signals.push(`Marketplace reachable: ${marketplace.status}.`);
  else blockers.push(`Marketplace page not verified: ${marketplace.error || marketplace.status || "unknown"}.`);

  if (localCheckoutClean) {
    signals.push("Local checkout artifacts are clean: plugin.zip, static export, and Worker config use the approved custom domain.");
  }

  if (!plugin.public_pages.length) {
    gaps.push("No dedicated landing/pricing URL is recorded yet; growth can still use Marketplace, but tracking is weaker.");
  }

  for (const page of publicPages) {
    if (page.ok) signals.push(`${page.label} reachable: ${page.status}.`);
    else if (page.type === "pricing" && plugin.id === "loka_pro" && page.status === 404) {
      gaps.push("Loka has no dedicated /pricing page; checkout appears on the homepage.");
    } else {
      blockers.push(`${page.label} not verified: ${page.error || page.status || "unknown"}.`);
    }

    if (page.missing_required?.length) {
      gaps.push(`${page.label} missing expected marker(s): ${page.missing_required.join(", ")}.`);
    }
    if (page.legacy_checkout_hits?.length) {
      blockers.push(
        plugin.id === "polyglot_aeo" && localCheckoutClean
          ? `${page.label} production page still references legacy checkout host(s): ${page.legacy_checkout_hits.join(", ")}; local checkout artifacts are already clean, so this is now a production deploy/custom-domain gate.`
          : `${page.label} still references legacy checkout host(s): ${page.legacy_checkout_hits.join(", ")}.`,
      );
    }
  }

  if (warnings.length) {
    blockers.push(`Open Creem compliance warning for ${warnings[0].product}; provider origin/referrer still required.`);
  }

  if (plugin.id === "polyglot_aeo") {
    const pricing = publicPages.find((page) => page.type === "pricing");
    const health = publicPages.find((page) => page.type === "health");
    const pricingHaystack = pricing?.checkout_haystack || `${pricing?.html_excerpt || ""}\n${(pricing?.links || []).join("\n")}`;
    if (pricing?.ok && !containsPattern(pricingHaystack, "license.polyglotaeo.com/checkout")) {
      blockers.push(
        localCheckoutClean
          ? "Production pricing page does not expose the approved custom-domain checkout URL yet; local static export does, so deploy is required after Cloudflare/Netlify gates pass."
          : "Production pricing page does not expose the approved custom-domain checkout URL yet.",
      );
    }
    if (!health?.ok) {
      blockers.push("license.polyglotaeo.com/health is not reachable, so checkout-origin readiness is not proven.");
    }
    const checkoutDetails = [
      checkoutDetail(checkoutOrigin, "target_dns_public"),
      checkoutDetail(checkoutOrigin, "target_health"),
      checkoutDetail(checkoutOrigin, "production_pricing_origin"),
      checkoutDetail(checkoutOrigin, "production_bridge_origin"),
    ].filter(Boolean);
    if (checkoutDetails.length) {
      signals.push(`Checkout-origin readiness evidence: ${checkoutDetails.join("; ")}.`);
    }
  }

  if (plugin.id === "loka_pro") {
    const directCreemCount = publicPages.reduce((sum, page) => sum + (page.creem_links?.length || 0), 0);
    if (directCreemCount) {
      signals.push(`Public getloka.dev page exposes ${directCreemCount} direct Creem payment link(s).`);
      if (warnings.length) {
        blockers.push("Do not change the Loka direct Creem link until Creem identifies the exact offending origin/referrer.");
      }
    }
  }

  const status = blockers.length
    ? "blocked"
    : gaps.length
      ? "needs_tracking_or_landing_baseline"
      : "ready_for_small_tracked_experiment";
  const nextAction =
    plugin.id === "polyglot_aeo" && status === "ready_for_small_tracked_experiment"
      ? "Run Marketplace upload/preflight flow, then use one small tracked public experiment after explicit confirmation."
      : plugin.next_action;

  return {
    id: plugin.id,
    name: plugin.name,
    marketplace_url: plugin.marketplace_url,
    generated_at: new Date().toISOString(),
    status,
    signals: unique(signals),
    blockers: unique(blockers),
    gaps: unique(gaps),
    next_action: nextAction,
    checkout_origin_status: plugin.id === "polyglot_aeo" && checkoutOrigin
      ? {
          status: checkoutOrigin.status || "missing",
          promotion_allowed: checkoutOrigin.promotion_allowed === true,
          local_checkout_clean: localCheckoutClean,
          recommendation: checkoutOrigin.recommendation || "",
          blocker_count: Array.isArray(checkoutOrigin.blockers) ? checkoutOrigin.blockers.length : 0,
        }
      : null,
    pages,
    open_warnings: warnings,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Plugin Public Health",
    "",
    `Generated: ${report.generated_at}`,
    "",
    "## Summary",
    "",
    `- Marketplace pages reachable: ${report.summary.marketplace_ok}/${report.profiles.length}`,
    `- Plugins blocked: ${report.summary.blocked}`,
    `- Plugins missing landing/tracking baseline: ${report.summary.gaps}`,
    "",
    "| Plugin | Status | Marketplace | Public surface | Main issue | Next action |",
    "|---|---|---:|---|---|---|",
  ];

  for (const profile of report.profiles) {
    const marketplace = profile.pages.find((page) => page.type === "marketplace");
    const surface = profile.pages
      .filter((page) => page.type !== "marketplace")
      .map((page) => `${page.label}:${page.status || (page.skipped ? "skipped" : "n/a")}`)
      .join(", ") || "Marketplace only";
    lines.push(
      `| ${profile.name} | ${profile.status} | ${marketplace?.status || 0} | ${pipe(surface)} | ${pipe(profile.blockers[0] || profile.gaps[0] || "none")} | ${pipe(profile.next_action)} |`,
    );
  }

  for (const profile of report.profiles) {
    lines.push("", `## ${profile.name}`, "");
    lines.push(`- Status: ${profile.status}`);
    lines.push(`- Marketplace: ${profile.marketplace_url}`);
    lines.push(`- Next action: ${profile.next_action}`);
    lines.push("");
    lines.push("Signals:");
    if (profile.signals.length) profile.signals.forEach((item) => lines.push(`- ${item}`));
    else lines.push("- No positive public health signal recorded.");
    lines.push("");
    lines.push("Blockers:");
    if (profile.blockers.length) profile.blockers.forEach((item) => lines.push(`- ${item}`));
    else lines.push("- None.");
    lines.push("");
    lines.push("Gaps:");
    if (profile.gaps.length) profile.gaps.forEach((item) => lines.push(`- ${item}`));
    else lines.push("- None.");
    lines.push("");
    lines.push("| Page | Type | Status | Final URL | Creem links | Missing markers |");
    lines.push("|---|---|---:|---|---:|---|");
    for (const page of profile.pages) {
      lines.push(
        `| ${page.label} | ${page.type} | ${page.status || 0} | ${pipe(page.final_url || page.url)} | ${page.creem_links?.length || 0} | ${pipe((page.missing_required || []).join(", "))} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/");
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

  const [actions, checkoutOrigin] = await Promise.all([
    readRows(args.actions),
    readJson(args.checkoutOrigin, null),
  ]);
  const profiles = await Promise.all(
    PLUGINS.map((plugin) => buildPluginReport(plugin, actions, args.skipFetch, checkoutOrigin)),
  );
  const report = {
    generated_at: new Date().toISOString(),
    checkout_origin_status: checkoutOrigin?.status || "missing",
    profiles,
    summary: {
      marketplace_ok: profiles.filter((profile) => profile.pages.find((page) => page.type === "marketplace")?.ok).length,
      blocked: profiles.filter((profile) => profile.status === "blocked").length,
      gaps: profiles.filter((profile) => profile.status === "needs_tracking_or_landing_baseline").length,
    },
  };

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Public health report: ${args.output}\n`);
  process.stdout.write(`Status: ${profiles.map((profile) => `${profile.name}=${profile.status}`).join("; ")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
