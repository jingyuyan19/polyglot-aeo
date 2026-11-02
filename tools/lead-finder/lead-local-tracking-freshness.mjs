#!/usr/bin/env node

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATIC_DIR = "polyglotaeo-web/out";
const DEFAULT_OUTPUT = ".tmp/framer-local-tracking-freshness.md";
const DEFAULT_JSON = ".tmp/framer-local-tracking-freshness.json";
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

function usage() {
  return `
Usage:
  pnpm lead:local-tracking-freshness

Options:
  --static-dir <dir> Static export directory. Default: ${DEFAULT_STATIC_DIR}
  --output <file>    Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>      JSON output. Default: ${DEFAULT_JSON}
  --strict           Exit non-zero when local tracking is stale.
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    staticDir: DEFAULT_STATIC_DIR,
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
    if (key === "--static-dir") {
      args.staticDir = value;
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

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function routeFile(staticDir, route) {
  if (route === "/") return path.join(staticDir, "index.html");
  if (route.endsWith(".html")) return path.join(staticDir, route.replace(/^\/+/, ""));
  return path.join(staticDir, route.replace(/^\/+|\/+$/g, ""), "index.html");
}

function extractScriptPaths(html) {
  const paths = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const src = match[1];
    if (!src.includes("/_next/static/")) continue;
    paths.push(src.replace(/^\/+/, ""));
  }
  return [...new Set(paths)];
}

async function allJsFiles(dir) {
  const output = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
      } else if (entry.isFile() && file.endsWith(".js")) {
        output.push(file);
      }
    }
  }
  if (await exists(dir)) await walk(dir);
  return output;
}

async function page(staticDir, key, route) {
  const file = routeFile(staticDir, route);
  const text = await readText(file);
  return {
    key,
    route,
    file: path.resolve(file),
    ok: Boolean(text),
    text,
  };
}

async function scriptState(staticDir, pages) {
  const scriptPaths = new Set();
  for (const item of pages) {
    for (const scriptPath of extractScriptPaths(item.text)) scriptPaths.add(scriptPath);
  }

  const pageScripts = new Map();
  for (const item of pages) {
    pageScripts.set(item.key, extractScriptPaths(item.text));
  }

  const scripts = [];
  for (const scriptPath of scriptPaths) {
    const file = path.join(staticDir, scriptPath);
    const text = await readText(file);
    scripts.push({
      path: scriptPath,
      file: path.resolve(file),
      ok: Boolean(text),
      text,
    });
  }

  const nextDir = path.join(staticDir, "_next", "static");
  const allJs = await Promise.all(
    (await allJsFiles(nextDir)).map(async (file) => ({
      path: path.relative(staticDir, file),
      file: path.resolve(file),
      ok: true,
      text: await readText(file),
    })),
  );

  return { scripts, allJs, pageScripts };
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

function pageText(item, state) {
  const scripts = state.pageScripts.get(item.key) || [];
  const scriptByPath = new Map(state.scripts.map((script) => [script.path, script]));
  return `${item.text}\n${scripts.map((scriptPath) => scriptByPath.get(scriptPath)?.text || "").join("\n")}`;
}

function check({ id, label, pass, required = true, missing = [], note = "" }) {
  return { id, label, pass: Boolean(pass), required, missing, note };
}

function assess({ staticDir, pages, state }) {
  const byKey = new Map(pages.map((item) => [item.key, item]));
  const formsPage = byKey.get("forms");
  const auditPage = byKey.get("audit");
  const checkoutPage = byKey.get("checkout");
  const miniAuditForm = formBlock(formsPage.text, "framer-aeo-mini-audit");
  const eventForm = formBlock(formsPage.text, "framer-aeo-event");
  const auditText = pageText(auditPage, state);
  const checkoutText = pageText(checkoutPage, state);
  const allText = pages.map((item) => item.text).join("\n") +
    "\n" +
    state.allJs.map((script) => script.text).join("\n");
  const miniAuditMissing = missingNames(miniAuditForm, MINI_AUDIT_FIELDS);
  const eventMissing = missingNames(eventForm, EVENT_FIELDS);
  const auditMissing = missingText(auditText, SESSION_ATTRIBUTION_MARKERS);
  const checkoutMissing = missingText(checkoutText, CHECKOUT_ATTRIBUTION_MARKERS);
  const sitewideMissing = missingText(allText, SESSION_ATTRIBUTION_MARKERS);
  const scriptFailures = state.scripts.filter((script) => !script.ok);

  const checks = [
    check({
      id: "audit_page_file",
      label: "Audit page file",
      pass: auditPage.ok && auditPage.text.includes("framer-aeo-mini-audit"),
      missing: auditPage.ok ? [] : [auditPage.file],
      note: auditPage.file,
    }),
    check({
      id: "checkout_bridge_file",
      label: "Checkout bridge file",
      pass: checkoutPage.ok && checkoutPage.text.includes("framer-aeo-event"),
      missing: checkoutPage.ok ? [] : [checkoutPage.file],
      note: checkoutPage.file,
    }),
    check({
      id: "form_declarations_file",
      label: "Netlify form declarations file",
      pass: formsPage.ok && Boolean(miniAuditForm) && Boolean(eventForm),
      missing: formsPage.ok ? [] : [formsPage.file],
      note: formsPage.file,
    }),
    check({
      id: "mini_audit_form_attribution_schema",
      label: "Mini-audit form attribution schema",
      pass: miniAuditMissing.length === 0,
      missing: miniAuditMissing,
      note: "Checks local __forms.html fields accepted by Netlify Forms.",
    }),
    check({
      id: "event_form_attribution_schema",
      label: "CTA event form attribution schema",
      pass: eventMissing.length === 0,
      missing: eventMissing,
      note: "Checks local install/checkout event fields accepted by Netlify Forms.",
    }),
    check({
      id: "audit_page_client_attribution",
      label: "Audit page client attribution persistence",
      pass: auditMissing.length === 0,
      missing: auditMissing,
      note: "Searches local audit page plus linked JS chunks.",
    }),
    check({
      id: "checkout_bridge_client_attribution",
      label: "Checkout bridge client attribution persistence",
      pass: checkoutMissing.length === 0,
      missing: checkoutMissing,
      note: "Searches local checkout bridge plus linked JS chunks.",
    }),
    check({
      id: "sitewide_session_attribution_marker",
      label: "Sitewide session attribution marker",
      pass: sitewideMissing.length === 0,
      missing: sitewideMissing,
      note: "Confirms the local static bundle includes the shared first-touch storage key.",
    }),
    check({
      id: "linked_script_files",
      label: "Linked JS chunk files",
      pass: scriptFailures.length === 0,
      required: false,
      missing: scriptFailures.map((script) => script.file),
      note: `${state.scripts.length} linked script(s), ${state.allJs.length} total JS file(s) checked.`,
    }),
  ];

  const failedRequired = checks.filter((item) => item.required && !item.pass);
  const status = failedRequired.length === 0 ? "fresh" : "stale_local_tracking";

  return {
    generated_at: new Date().toISOString(),
    static_dir: path.resolve(staticDir),
    status,
    fresh: status === "fresh",
    scripts_checked: state.scripts.length,
    total_js_files_checked: state.allJs.length,
    pages: pages.map((item) => ({
      key: item.key,
      route: item.route,
      file: item.file,
      ok: item.ok,
    })),
    checks,
    missing_required: failedRequired.flatMap((item) =>
      item.missing.length
        ? item.missing.map((marker) => `${item.label}: ${marker}`)
        : [item.label],
    ),
    recommendation: recommendation({ status, failedRequired }),
  };
}

function recommendation({ status, failedRequired }) {
  if (status === "fresh") {
    return "Local static export is tracking-fresh. A confirmed deploy of this build should restore attribution, form schemas, and checkout event tracking in production.";
  }
  const missingSummary = failedRequired.map((item) => item.label).join("; ");
  return `Local static export is not tracking-fresh (${missingSummary}). Fix the local build before requesting a production deploy.`;
}

function renderMarkdown(review) {
  const lines = [
    "# Framer Local Tracking Freshness",
    "",
    `Generated: ${review.generated_at}`,
    `Static export: ${review.static_dir}`,
    `Status: ${review.status}`,
    `Linked scripts checked: ${review.scripts_checked}`,
    `Total JS files checked: ${review.total_js_files_checked}`,
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

  lines.push("", "## Pages", "", "| Page | OK | File |", "|---|---|---|");
  for (const item of review.pages) {
    lines.push(`| ${item.key} | ${item.ok ? "yes" : "no"} | ${item.file} |`);
  }

  lines.push(
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
    "## Commands",
    "",
    "```bash",
    "pnpm --dir polyglotaeo-web build",
    "pnpm lead:local-tracking-freshness -- --strict",
    "# after explicit deploy confirmation:",
    "pnpm web:deploy:netlify-api",
    "pnpm lead:site-check && pnpm lead:tracking-freshness -- --strict",
    "```",
    "",
  );

  return `${lines.join("\n")}\n`;
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

  const staticDir = args.staticDir;
  const pages = await Promise.all([
    page(staticDir, "audit", "/audit/"),
    page(staticDir, "checkout", "/go/checkout/"),
    page(staticDir, "forms", "/__forms.html"),
  ]);
  const state = await scriptState(staticDir, pages);
  const review = assess({ staticDir, pages, state });

  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Local tracking freshness: ${review.status}\n`);
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
