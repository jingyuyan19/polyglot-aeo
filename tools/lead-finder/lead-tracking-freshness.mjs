#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "https://polyglotaeo.com";
const DEFAULT_DEPLOY_REVIEW = ".tmp/framer-deploy-review.json";
const DEFAULT_OUTPUT = ".tmp/framer-tracking-freshness.md";
const DEFAULT_JSON = ".tmp/framer-tracking-freshness.json";
const CHECKOUT_BASE = "https://license.polyglotaeo.com/checkout";
const UTM_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];
const ATTRIBUTION_FIELDS = [...UTM_FIELDS, "landing_path", "referrer"];
const MINI_AUDIT_FIELDS = [
  "request_type",
  "source_page",
  "agency_name",
  "site_url",
  "contact_email",
  "locales",
  "concern",
  ...ATTRIBUTION_FIELDS,
];
const EVENT_FIELDS = [
  "event_type",
  "cta",
  "destination",
  "source_path",
  "landing_path",
  "referrer",
  "ts",
  ...UTM_FIELDS,
  "reason",
  "project_id",
  "test_mode",
];
const SESSION_ATTRIBUTION_MARKERS = [
  "polyglot-aeo-attribution-v1",
  "sessionStorage",
  "landing_path",
  "referrer",
  "utm_source",
  "utm_campaign",
];
const CHECKOUT_ATTRIBUTION_MARKERS = [
  "polyglot-aeo-attribution-v1",
  "sessionStorage",
  "landing_path",
  "referrer",
  "reason",
  "project_id",
  "checkout_click",
];
const REQUEST_TIMEOUT_MS = Number(process.env.TRACKING_FRESHNESS_TIMEOUT_MS || 30000);
const MAX_SCRIPT_FETCHES = Number(process.env.TRACKING_FRESHNESS_MAX_SCRIPTS || 40);

function usage() {
  return `
Usage:
  pnpm lead:tracking-freshness

Options:
  --base-url <url>       Production site origin. Default: ${DEFAULT_BASE_URL}
  --deploy-review <file> Deploy review JSON. Default: ${DEFAULT_DEPLOY_REVIEW}
  --output <file>        Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>          JSON output. Default: ${DEFAULT_JSON}
  --strict               Exit non-zero when production tracking is stale.
  --help                 Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    deployReview: DEFAULT_DEPLOY_REVIEW,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--base-url") {
      args.baseUrl = value;
      index += 1;
      continue;
    }
    if (key === "--deploy-review") {
      args.deployReview = value;
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
    if (key === "--strict") {
      args.strict = true;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, "");
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

async function readJson(file, fallback) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "PolyglotAEO-GrowthOps/1.0",
      },
      signal: controller.signal,
    });
    return {
      url,
      finalUrl: response.url || url,
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      text: await response.text(),
    };
  } finally {
    clearTimeout(timer);
  }
}

function urlFor(baseUrl, pathName) {
  return new URL(pathName, `${baseUrl}/`).toString();
}

function checkoutBridgeUrl(baseUrl) {
  const target = `${CHECKOUT_BASE}?plan=monthly`;
  const params = new URLSearchParams({
    plan: "monthly",
    target,
    utm_source: "tracking_freshness",
    utm_campaign: "production_probe",
    reason: "freshness",
    project_id: "freshness_probe",
  });
  return `${urlFor(baseUrl, "/go/checkout/")}?${params.toString()}`;
}

function extractScriptUrls(html, pageUrl, origin) {
  const urls = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const absolute = new URL(match[1], pageUrl);
    if (absolute.origin !== origin) continue;
    if (!absolute.pathname.includes("/_next/static/")) continue;
    urls.push(absolute.toString());
  }
  return [...new Set(urls)];
}

async function fetchScripts(pages, origin) {
  const allUrls = [];
  const pageScripts = new Map();
  for (const page of pages) {
    const urls = extractScriptUrls(page.text, page.finalUrl || page.url, origin);
    pageScripts.set(page.key, urls);
    allUrls.push(...urls);
  }

  const uniqueUrls = [...new Set(allUrls)].slice(0, MAX_SCRIPT_FETCHES);
  const scripts = await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const result = await fetchText(url);
        return {
          url,
          status: result.status,
          ok: result.ok,
          text: result.text,
          error: "",
        };
      } catch (error) {
        return {
          url,
          status: 0,
          ok: false,
          text: "",
          error: error?.message || String(error),
        };
      }
    }),
  );

  return {
    scripts,
    pageScripts,
    limited: uniqueUrls.length < new Set(allUrls).size,
  };
}

function formBlock(html, formName) {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) || [];
  return forms.find((form) => hasName(form, formName)) || "";
}

function hasName(html, name) {
  return new RegExp(`\\bname=["']${escapeRegExp(name)}["']`, "i").test(html);
}

function missingNames(html, names) {
  return names.filter((name) => !hasName(html, name));
}

function missingText(text, markers) {
  return markers.filter((marker) => !text.includes(marker));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pageText(page, scriptState) {
  const urls = scriptState.pageScripts.get(page.key) || [];
  const scriptByUrl = new Map(scriptState.scripts.map((script) => [script.url, script]));
  const scripts = urls.map((url) => scriptByUrl.get(url)?.text || "").join("\n");
  return `${page.text}\n${scripts}`;
}

function check({ id, label, pass, required = true, missing = [], note = "" }) {
  return { id, label, pass: Boolean(pass), required, missing, note };
}

function assess({ baseUrl, pages, scriptState, deployReview }) {
  const byKey = new Map(pages.map((page) => [page.key, page]));
  const formsPage = byKey.get("forms");
  const auditPage = byKey.get("audit");
  const checkoutPage = byKey.get("checkout");
  const miniAuditForm = formBlock(formsPage.text, "framer-aeo-mini-audit");
  const eventForm = formBlock(formsPage.text, "framer-aeo-event");
  const auditText = pageText(auditPage, scriptState);
  const checkoutText = pageText(checkoutPage, scriptState);
  const allText = pages.map((page) => page.text).join("\n") +
    "\n" +
    scriptState.scripts.map((script) => script.text).join("\n");
  const miniAuditMissing = missingNames(miniAuditForm, MINI_AUDIT_FIELDS);
  const eventMissing = missingNames(eventForm, EVENT_FIELDS);
  const auditMissing = missingText(auditText, SESSION_ATTRIBUTION_MARKERS);
  const checkoutMissing = missingText(checkoutText, CHECKOUT_ATTRIBUTION_MARKERS);
  const anySessionMissing = missingText(allText, SESSION_ATTRIBUTION_MARKERS);
  const scriptFailures = scriptState.scripts.filter((script) => !script.ok);

  const checks = [
    check({
      id: "audit_page_fetch",
      label: "Audit page fetch",
      pass: auditPage.ok && auditPage.text.includes("framer-aeo-mini-audit"),
      missing: auditPage.ok ? [] : [`HTTP ${auditPage.status}`],
      note: auditPage.finalUrl,
    }),
    check({
      id: "checkout_bridge_fetch",
      label: "Checkout bridge fetch",
      pass: checkoutPage.ok && checkoutPage.text.includes("framer-aeo-event"),
      missing: checkoutPage.ok ? [] : [`HTTP ${checkoutPage.status}`],
      note: checkoutPage.finalUrl,
    }),
    check({
      id: "form_declarations_fetch",
      label: "Netlify form declarations fetch",
      pass: formsPage.ok && Boolean(miniAuditForm) && Boolean(eventForm),
      missing: formsPage.ok ? [] : [`HTTP ${formsPage.status}`],
      note: formsPage.finalUrl,
    }),
    check({
      id: "mini_audit_form_attribution_schema",
      label: "Mini-audit form attribution schema",
      pass: miniAuditMissing.length === 0,
      missing: miniAuditMissing,
      note: "Checks __forms.html fields accepted by Netlify Forms.",
    }),
    check({
      id: "event_form_attribution_schema",
      label: "CTA event form attribution schema",
      pass: eventMissing.length === 0,
      missing: eventMissing,
      note: "Checks install/checkout event fields accepted by Netlify Forms.",
    }),
    check({
      id: "audit_page_client_attribution",
      label: "Audit page client attribution persistence",
      pass: auditMissing.length === 0,
      missing: auditMissing,
      note: "Searches the production audit page plus its same-origin JS chunks.",
    }),
    check({
      id: "checkout_bridge_client_attribution",
      label: "Checkout bridge client attribution persistence",
      pass: checkoutMissing.length === 0,
      missing: checkoutMissing,
      note: "Searches the production checkout bridge plus its same-origin JS chunks.",
    }),
    check({
      id: "sitewide_session_attribution_marker",
      label: "Sitewide session attribution marker",
      pass: anySessionMissing.length === 0,
      missing: anySessionMissing,
      note: "Confirms the deployed bundle includes the shared first-touch storage key.",
    }),
    check({
      id: "linked_script_fetches",
      label: "Linked JS chunks fetched",
      pass: scriptFailures.length === 0,
      required: false,
      missing: scriptFailures.map((script) => `${script.url} (${script.error || `HTTP ${script.status}`})`),
      note: `${scriptState.scripts.length} script(s) checked${scriptState.limited ? "; capped by max script fetches" : ""}.`,
    }),
  ];

  const failedRequired = checks.filter((item) => item.required && !item.pass);
  const fetchFailed = failedRequired.some((item) =>
    ["audit_page_fetch", "checkout_bridge_fetch", "form_declarations_fetch"].includes(item.id),
  );
  const status = failedRequired.length === 0
    ? "fresh"
    : fetchFailed
      ? "check_failed"
      : "stale_production_tracking";

  return {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    status,
    fresh: status === "fresh",
    checked_pages: pages.map((page) => ({
      key: page.key,
      url: page.url,
      final_url: page.finalUrl,
      http_status: page.status,
      ok: page.ok,
    })),
    scripts_checked: scriptState.scripts.length,
    script_fetch_failures: scriptFailures.map((script) => ({
      url: script.url,
      status: script.status,
      error: script.error,
    })),
    checks,
    missing_required: failedRequired.flatMap((item) =>
      item.missing.length
        ? item.missing.map((marker) => `${item.label}: ${marker}`)
        : [item.label],
    ),
    deploy_context: deployContext(deployReview),
    recommendation: recommendationFor({ status, failedRequired, deployReview }),
  };
}

function deployContext(deployReview) {
  if (!deployReview) {
    return {
      status: "missing",
      netlify_new_deploys: "unknown",
      deploy_blocker: "",
    };
  }

  return {
    status: deployReview.status || "unknown",
    production_site_check: deployReview.production_site_check || "unknown",
    netlify_new_deploys: deployReview.netlify_new_deploys || "unknown",
    deploy_blocker: deployReview.deploy_blocker || "",
    latest_production_deploy_id: deployReview.latest_production_deploy_id || "",
    latest_production_published_at: deployReview.latest_production_published_at || "",
  };
}

function recommendationFor({ status, failedRequired, deployReview }) {
  if (status === "fresh") {
    return "Production tracking is fresh: first-touch attribution persistence, form schemas, and checkout event fields are deployed. Keep monitoring forms/events after each public action.";
  }

  if (status === "check_failed") {
    return "Production tracking freshness could not be proven because one or more public pages failed to fetch. Rerun the check before sending additional traffic.";
  }

  const deployBlocked = /^blocked_|blocked/i.test(deployReview?.netlify_new_deploys || "") ||
    /blocked/i.test(deployReview?.status || "");
  const missingSummary = failedRequired.map((item) => item.label).join("; ");
  if (deployBlocked) {
    return `Production tracking is stale (${missingSummary}). Restore Netlify credits/permissions, deploy the current polyglotaeo-web build, then rerun \`pnpm lead:tracking-freshness -- --strict\` and \`pnpm lead:site-check\` before broad Community or directory traffic. Marketplace upload can still be handled separately, but Community/directory attribution is not fresh yet.`;
  }

  return `Production tracking is stale (${missingSummary}). Deploy the current polyglotaeo-web build and rerun \`pnpm lead:tracking-freshness -- --strict\` before broad Community or directory traffic.`;
}

function renderMarkdown(review) {
  const lines = [
    "# Framer Production Tracking Freshness",
    "",
    `Generated: ${review.generated_at}`,
    `Base URL: ${review.base_url}`,
    `Status: ${review.status}`,
    `Scripts checked: ${review.scripts_checked}`,
    "",
    "## Checks",
    "",
    "| Result | Check | Missing |",
    "|---|---|---|",
  ];

  for (const item of review.checks) {
    const result = item.pass ? "pass" : item.required ? "fail" : "warn";
    const missing = item.missing.length ? item.missing.join(", ") : "";
    lines.push(`| ${result} | ${item.label} | ${missing.replace(/\|/g, "/")} |`);
  }

  lines.push("", "## Pages", "", "| Page | HTTP | Final URL |", "|---|---:|---|");
  for (const page of review.checked_pages) {
    lines.push(`| ${page.key} | ${page.http_status} | ${page.final_url} |`);
  }

  lines.push(
    "",
    "## Deploy Context",
    "",
    `- Deploy status: ${review.deploy_context.status}`,
    `- Production site check: ${review.deploy_context.production_site_check || "unknown"}`,
    `- Netlify new deploys: ${review.deploy_context.netlify_new_deploys}`,
    review.deploy_context.deploy_blocker
      ? `- Deploy blocker: ${review.deploy_context.deploy_blocker}`
      : "",
    review.deploy_context.latest_production_deploy_id
      ? `- Latest production deploy: ${review.deploy_context.latest_production_deploy_id}`
      : "",
    review.deploy_context.latest_production_published_at
      ? `- Latest published_at: ${review.deploy_context.latest_production_published_at}`
      : "",
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
    "## Commands",
    "",
    "```bash",
    "pnpm lead:tracking-freshness",
    "pnpm lead:tracking-freshness -- --strict",
    "pnpm lead:site-check",
    "pnpm lead:deploy-review",
    "# after Netlify credits/permissions are restored:",
    "cd polyglotaeo-web && npm run build",
    "pnpm web:deploy:netlify-api",
    "```",
    "",
  );

  return `${lines.filter((line) => line !== undefined).join("\n")}\n`;
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

  const origin = new URL(args.baseUrl).origin;
  const pages = await Promise.all([
    fetchText(`${urlFor(args.baseUrl, "/audit/")}?utm_source=tracking_freshness&utm_campaign=production_probe`)
      .then((page) => ({ key: "audit", ...page })),
    fetchText(checkoutBridgeUrl(args.baseUrl)).then((page) => ({ key: "checkout", ...page })),
    fetchText(urlFor(args.baseUrl, "/__forms.html")).then((page) => ({ key: "forms", ...page })),
  ]);
  const [scriptState, deployReview] = await Promise.all([
    fetchScripts(pages, origin),
    readJson(args.deployReview, null),
  ]);
  const review = assess({ baseUrl: args.baseUrl, pages, scriptState, deployReview });

  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Tracking freshness: ${review.status}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  process.stdout.write(`Recommendation: ${review.recommendation}\n`);

  if (args.strict && !review.fresh) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
