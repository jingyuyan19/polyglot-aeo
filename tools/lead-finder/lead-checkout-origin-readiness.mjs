#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import {
  openComplianceWarningsForScope,
  otherProductComplianceWarnings,
} from "./compliance-scope.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_ZIP = "plugin.zip";
const DEFAULT_STATIC_DIR = "polyglotaeo-web/out";
const DEFAULT_WRANGLER = "api/wrangler.toml";
const DEFAULT_SITE = "https://polyglotaeo.com";
const DEFAULT_TARGET_ORIGIN = "https://license.polyglotaeo.com";
const DEFAULT_LEGACY_ORIGIN = "https://polyglot-license.jimmymjing.workers.dev";
const DEFAULT_OUTPUT = ".tmp/framer-checkout-origin-readiness.md";
const DEFAULT_JSON = ".tmp/framer-checkout-origin-readiness.json";
const REQUEST_TIMEOUT_MS = Number(process.env.CHECKOUT_ORIGIN_TIMEOUT_MS || 15000);
const TARGET_CHECKOUT = `${DEFAULT_TARGET_ORIGIN}/checkout`;
const LEGACY_CHECKOUT = `${DEFAULT_LEGACY_ORIGIN}/checkout`;

function usage() {
  return `
Usage:
  pnpm lead:checkout-origin

Options:
  --actions <file>       External action log CSV. Default: ${DEFAULT_ACTIONS}
  --zip <file>           Plugin zip. Default: ${DEFAULT_ZIP}
  --static-dir <dir>     Local static export. Default: ${DEFAULT_STATIC_DIR}
  --wrangler <file>      Worker config. Default: ${DEFAULT_WRANGLER}
  --site <url>           Production site origin. Default: ${DEFAULT_SITE}
  --target-origin <url>  Approved Worker origin. Default: ${DEFAULT_TARGET_ORIGIN}
  --legacy-origin <url>  Legacy Worker origin. Default: ${DEFAULT_LEGACY_ORIGIN}
  --output <file>        Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>          JSON output. Default: ${DEFAULT_JSON}
  --strict               Exit non-zero unless status is ready.
  --help                 Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    zip: DEFAULT_ZIP,
    staticDir: DEFAULT_STATIC_DIR,
    wrangler: DEFAULT_WRANGLER,
    site: DEFAULT_SITE,
    targetOrigin: DEFAULT_TARGET_ORIGIN,
    legacyOrigin: DEFAULT_LEGACY_ORIGIN,
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
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--zip") {
      args.zip = value;
      index += 1;
      continue;
    }
    if (key === "--static-dir") {
      args.staticDir = value;
      index += 1;
      continue;
    }
    if (key === "--wrangler") {
      args.wrangler = value;
      index += 1;
      continue;
    }
    if (key === "--site") {
      args.site = value;
      index += 1;
      continue;
    }
    if (key === "--target-origin") {
      args.targetOrigin = value.replace(/\/+$/, "");
      index += 1;
      continue;
    }
    if (key === "--legacy-origin") {
      args.legacyOrigin = value.replace(/\/+$/, "");
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

  args.site = args.site.replace(/\/+$/, "");
  args.targetOrigin = args.targetOrigin.replace(/\/+$/, "");
  args.legacyOrigin = args.legacyOrigin.replace(/\/+$/, "");
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
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
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
    } else if (char !== "\r") {
      cell += char;
    }
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
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

function openComplianceWarnings(rows) {
  return openComplianceWarningsForScope(rows, "polyglot_aeo");
}

async function zipJsText(file) {
  try {
    const { stdout: listing } = await execFileAsync("unzip", ["-Z1", file], {
      maxBuffer: 5 * 1024 * 1024,
    });
    const entries = listing.split(/\r?\n/).filter((entry) => /\.(?:mjs|js)$/.test(entry));
    const chunks = await Promise.all(
      entries.map(async (entry) => {
        const { stdout } = await execFileAsync("unzip", ["-p", file, entry], {
          maxBuffer: 20 * 1024 * 1024,
        });
        return stdout;
      }),
    );
    return {
      ok: true,
      entries,
      text: chunks.join("\n"),
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      entries: [],
      text: "",
      error: error?.message || String(error),
    };
  }
}

async function staticText(dir) {
  const chunks = [];
  const files = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
      } else if (entry.isFile() && /\.(?:html|txt|js|mjs|json)$/i.test(entry.name)) {
        files.push(file);
        chunks.push(await readText(file));
      }
    }
  }
  await walk(dir);
  return { files, text: chunks.join("\n") };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "PolyglotAEO-GrowthOps/1.0" },
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      url,
      finalUrl: response.url || url,
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      text,
      error: "",
    };
  } catch (error) {
    return {
      url,
      finalUrl: url,
      status: 0,
      ok: false,
      text: "",
      error: error?.name === "AbortError" ? "timeout" : error?.message || String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function dnsCheck(origin) {
  const host = new URL(origin).hostname;
  const [v4, v6] = await Promise.allSettled([dns.resolve4(host), dns.resolve6(host)]);
  const addresses = [
    ...(v4.status === "fulfilled" ? v4.value : []),
    ...(v6.status === "fulfilled" ? v6.value : []),
  ];
  const reservedAddresses = addresses.filter((address) => isReservedAddress(address));
  const publicAddresses = addresses.filter((address) => !isReservedAddress(address));
  return {
    host,
    ok: addresses.length > 0,
    public_ok: publicAddresses.length > 0 && reservedAddresses.length === 0,
    addresses,
    public_addresses: publicAddresses,
    reserved_addresses: reservedAddresses,
    error: addresses.length
      ? ""
      : [v4, v6]
          .filter((item) => item.status === "rejected")
          .map((item) => item.reason?.code || item.reason?.message || String(item.reason))
          .join("; "),
  };
}

function isReservedAddress(address) {
  const version = net.isIP(address);
  if (version === 4) return isReservedIpv4(address);
  if (version === 6) return isReservedIpv6(address);
  return true;
}

function isReservedIpv4(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isReservedIpv6(address) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:")
  );
}

function extractScriptUrls(html, pageUrl, siteOrigin) {
  const urls = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const absolute = new URL(match[1], pageUrl);
    if (absolute.origin !== siteOrigin) continue;
    if (!absolute.pathname.includes("/_next/static/")) continue;
    urls.push(absolute.toString());
  }
  return [...new Set(urls)];
}

async function productionPageWithScripts(url, siteOrigin) {
  const page = await fetchText(url);
  const scripts = page.ok
    ? await Promise.all(
        extractScriptUrls(page.text, page.finalUrl || page.url, siteOrigin).map((scriptUrl) => fetchText(scriptUrl)),
      )
    : [];
  return {
    page,
    scripts,
    text: [page.text, ...scripts.map((script) => script.text)].join("\n"),
  };
}

function has(text, needle) {
  const source = String(text || "");
  const normalized = source.replace(/&amp;/g, "&");
  const decodedSource = safeDecodeURIComponent(source);
  const decodedNormalized = safeDecodeURIComponent(normalized);
  const encodedNeedle = encodeURIComponent(needle);
  return [source, normalized, decodedSource, decodedNormalized].some(
    (candidate) => candidate.includes(needle) || candidate.includes(encodedNeedle),
  );
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function check(id, label, pass, detail, required = true) {
  return {
    id,
    label,
    pass: Boolean(pass),
    required,
    detail,
  };
}

function statusFor(requirements) {
  const blockers = requirements.filter((item) => item.required && !item.pass);
  return blockers.length ? "blocked" : "ready";
}

function recommendationFor({ status, blockers }) {
  if (status === "ready") {
    return "Checkout origin is ready for promotion gates. Rerun Marketplace preflight, then proceed only with the normal explicit confirmation requirement.";
  }
  const ids = new Set(blockers.map((item) => item.id));
  if (ids.has("target_dns_public") || ids.has("target_health")) {
    return "Bring license.polyglotaeo.com online with public DNS and the Worker custom domain, then deploy the site so production checkout links use that approved origin.";
  }
  if (ids.has("production_pricing_origin") || ids.has("production_bridge_origin")) {
    return "Deploy the current polyglotaeo-web build so production pricing and checkout bridge point at license.polyglotaeo.com before checkout-heavy promotion.";
  }
  if (ids.has("creem_warning_closed")) {
    return "Resolve the Creem compliance warning and record it as resolved before checkout-heavy promotion.";
  }
  return "Fix the blocked checkout-origin checks, then rerun this readiness report.";
}

async function build(args) {
  const targetCheckout = `${args.targetOrigin}/checkout`;
  const legacyCheckout = `${args.legacyOrigin}/checkout`;
  const targetHealthUrl = `${args.targetOrigin}/health`;
  const legacyHealthUrl = `${args.legacyOrigin}/health`;
  const siteOrigin = new URL(args.site).origin;
  const bridgeUrl = `${args.site}/go/checkout/?${new URLSearchParams({
    plan: "monthly",
    target: `${targetCheckout}?plan=monthly`,
    utm_source: "checkout_origin_readiness",
    utm_campaign: "origin_probe",
  }).toString()}`;

  const [
    actions,
    wrangler,
    zip,
    localStatic,
    targetDns,
    targetHealth,
    legacyHealth,
    pricingProduction,
    bridgeProduction,
  ] = await Promise.all([
    readRows(args.actions),
    readText(args.wrangler),
    zipJsText(args.zip),
    staticText(args.staticDir),
    dnsCheck(args.targetOrigin),
    fetchText(targetHealthUrl),
    fetchText(legacyHealthUrl),
    productionPageWithScripts(`${args.site}/pricing/`, siteOrigin),
    productionPageWithScripts(bridgeUrl, siteOrigin),
  ]);

  const openWarnings = openComplianceWarnings(actions);
  const outOfScopeWarnings = otherProductComplianceWarnings(actions);
  const targetHealthText = targetHealth.text || "";
  const legacyReachable = legacyHealth.ok;
  const requirements = [
    check(
      "plugin_zip_origin",
      "Plugin zip uses approved checkout origin",
      zip.ok && has(zip.text, args.targetOrigin) && !has(zip.text, args.legacyOrigin),
      zip.ok
        ? `entries=${zip.entries.length}; target=${has(zip.text, args.targetOrigin)}; legacy=${has(zip.text, args.legacyOrigin)}`
        : zip.error,
    ),
    check(
      "local_static_origin",
      "Local static export uses approved checkout origin",
      has(localStatic.text, targetCheckout) && !has(localStatic.text, legacyCheckout),
      `files=${localStatic.files.length}; target=${has(localStatic.text, targetCheckout)}; legacy=${has(localStatic.text, legacyCheckout)}`,
    ),
    check(
      "worker_config_custom_domain",
      "Worker config routes the approved custom domain",
      has(wrangler, "workers_dev = false") &&
        has(wrangler, `pattern = "${new URL(args.targetOrigin).hostname}"`) &&
        has(wrangler, "custom_domain = true"),
      `workers_dev_false=${has(wrangler, "workers_dev = false")}; custom_domain=${has(wrangler, "custom_domain = true")}`,
    ),
    check(
      "target_dns",
      "Approved Worker custom domain resolves",
      targetDns.ok,
      targetDns.ok ? `addresses=${targetDns.addresses.join(", ")}` : targetDns.error,
    ),
    check(
      "target_dns_public",
      "Approved Worker custom domain resolves to public addresses",
      targetDns.public_ok || targetHealth.ok,
      targetDns.ok
        ? `public=${targetDns.public_addresses.join(", ") || "none"}; reserved=${targetDns.reserved_addresses.join(", ") || "none"}; health_ok=${targetHealth.ok}`
        : targetDns.error,
    ),
    check(
      "target_health",
      "Approved Worker custom domain serves /health",
      targetHealth.ok && has(targetHealthText, "polyglot-license"),
      `status=${targetHealth.status}; final=${targetHealth.finalUrl}; error=${targetHealth.error || ""}`,
    ),
    check(
      "production_pricing_origin",
      "Production pricing page uses approved checkout origin",
      pricingProduction.page.ok &&
        has(pricingProduction.text, targetCheckout) &&
        !has(pricingProduction.text, legacyCheckout),
      `status=${pricingProduction.page.status}; target=${has(pricingProduction.text, targetCheckout)}; legacy=${has(pricingProduction.text, legacyCheckout)}`,
    ),
    check(
      "production_bridge_origin",
      "Production checkout bridge allows approved origin and excludes legacy origin",
      bridgeProduction.page.ok &&
        has(bridgeProduction.text, new URL(args.targetOrigin).hostname) &&
        !has(bridgeProduction.text, new URL(args.legacyOrigin).hostname),
      `status=${bridgeProduction.page.status}; target_host=${has(bridgeProduction.text, new URL(args.targetOrigin).hostname)}; legacy_host=${has(bridgeProduction.text, new URL(args.legacyOrigin).hostname)}`,
    ),
    check(
      "creem_warning_closed",
      "Polyglot Creem compliance warning is resolved in action log",
      openWarnings.length === 0,
      `${openWarnings.length} in-scope open warning(s); ${outOfScopeWarnings.length} other plugin warning(s) ignored`,
    ),
  ];

  const warnings = [];
  if (legacyReachable) {
    warnings.push({
      id: "legacy_worker_reachable",
      label: "Legacy workers.dev /health is still reachable",
      detail: `status=${legacyHealth.status}; final=${legacyHealth.finalUrl}`,
    });
  }

  const status = statusFor(requirements);
  const blockers = requirements.filter((item) => item.required && !item.pass);

  return {
    generated_at: new Date().toISOString(),
    status,
    promotion_allowed: status === "ready",
    target_origin: args.targetOrigin,
    legacy_origin: args.legacyOrigin,
    site: args.site,
    requirements,
    blockers,
    warnings,
    external_checks: {
      target_dns: targetDns,
      target_health: compactFetch(targetHealth),
      legacy_health: compactFetch(legacyHealth),
      production_pricing: compactFetch(pricingProduction.page),
      production_checkout_bridge: compactFetch(bridgeProduction.page),
    },
    open_compliance_warnings: openWarnings,
    out_of_scope_compliance_warnings: outOfScopeWarnings,
    recommendation: recommendationFor({ status, blockers }),
  };
}

function compactFetch(result) {
  return {
    url: result.url,
    finalUrl: result.finalUrl,
    status: result.status,
    ok: result.ok,
    error: result.error,
  };
}

function renderMarkdown(data) {
  const lines = [
    "# Checkout Origin Readiness",
    "",
    `Generated: ${data.generated_at}`,
    `Status: ${data.status}`,
    `Promotion allowed: ${data.promotion_allowed ? "yes" : "no"}`,
    `Target origin: ${data.target_origin}`,
    `Legacy origin: ${data.legacy_origin}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Requirements",
    "",
    "| Check | Result | Detail |",
    "|---|---|---|",
  ];

  for (const item of data.requirements) {
    lines.push(`| ${item.label} | ${item.pass ? "pass" : "fail"} | ${pipe(item.detail)} |`);
  }

  if (data.blockers.length) {
    lines.push("", "## Blockers", "");
    for (const item of data.blockers) {
      lines.push(`- ${item.label}: ${item.detail}`);
    }
  }

  if (data.warnings.length) {
    lines.push("", "## Warnings", "");
    for (const item of data.warnings) {
      lines.push(`- ${item.label}: ${item.detail}`);
    }
  }

  lines.push(
    "",
    "## Next Commands",
    "",
    "```bash",
    "pnpm lead:checkout-origin",
    "pnpm lead:creem-compliance",
    "pnpm lead:site-check",
    "pnpm lead:marketplace-preflight",
    "pnpm lead:ops",
    "```",
    "",
  );

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

  const data = await build(args);
  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Checkout origin readiness: ${data.status}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);

  if (args.strict && data.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
