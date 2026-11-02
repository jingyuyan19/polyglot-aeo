#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_HOME_URL = "https://polyglotaeo.com/";
const DEFAULT_BENCHMARK_URL = "https://polyglotaeo.com/framer-aeo-benchmark/";
const DEFAULT_URL = "https://polyglotaeo.com/audit/";
const DEFAULT_SAMPLE_URL = "https://polyglotaeo.com/audit/sample/";
const DEFAULT_AGENCY_URL = "https://polyglotaeo.com/agency/";
const DEFAULT_LLMS_URL = "https://polyglotaeo.com/llms-txt/";
const DEFAULT_ROOT_LLMS_URL = "https://polyglotaeo.com/llms.txt";
const DEFAULT_PRICING_URL = "https://polyglotaeo.com/pricing/";
const DEFAULT_SITE_ID = "49fc3e5b-7ff7-4185-b578-60c81e3168ff";
const DEFAULT_FORM_NAME = "framer-aeo-mini-audit";
const DEFAULT_EVENT_FORM_NAME = "framer-aeo-event";
const MARKETPLACE_URL = "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";
const CHECKOUT_BASE = "https://license.polyglotaeo.com/checkout";
const DEFAULT_CHECKOUT_BRIDGE_URL = `https://polyglotaeo.com/go/checkout/?plan=monthly&target=${encodeURIComponent(
  `${CHECKOUT_BASE}?plan=monthly`,
)}&utm_source=site_check&utm_campaign=checkout_bridge`;
const HOME_PATTERNS = [
  "application/ld+json",
  "SoftwareApplication",
  "Polyglot AEO Pro",
  "/framer-aeo-benchmark/",
  "/llms-txt/",
  MARKETPLACE_URL,
];
const BENCHMARK_PATTERNS = [
  "Framer AEO benchmark",
  "Check whether a Framer site is ready for AI-search handoff",
  "The four gaps worth checking first",
  "What gets checked on the public site",
  "Send one Framer URL for a public AEO benchmark check",
  "Send benchmark request",
  'name="request_type"',
  'value="benchmark_check"',
  'name="source_page"',
  'value="/framer-aeo-benchmark/"',
  MARKETPLACE_URL,
];
const REQUIRED_PATTERNS = [
  "framer-aeo-mini-audit",
  "data-netlify",
  "/audit/thanks/",
  'name="site_url"',
  'name="contact_email"',
  "Send audit request",
  "Install free",
  MARKETPLACE_URL,
  "mailto:jimmymjing@gmail.com",
];
const SAMPLE_PATTERNS = [
  "Sample mini audit",
  "What the 3-point Framer AEO audit looks like",
  "Root llms.txt is not reachable",
  "Request this for your site",
];
const AGENCY_PATTERNS = [
  "For Framer agencies",
  "A repeatable AEO QA handoff for Framer client launches",
  "Get a free handoff note",
  "Client handoff QA",
  "Agency checklist",
  "Client handoff template",
  "Use this note as the client-facing QA deliverable",
  "Install free",
  MARKETPLACE_URL,
  "Send a client URL",
  "Send one client URL for a 3-point handoff note",
  "3 public findings, first fixes, and a client-ready summary",
  "Send client URL for a 3-point note",
  "/agency/thanks/",
  'name="request_type"',
  'value="agency_template"',
  'name="source_page"',
  'value="/agency/"',
  'name="agency_name"',
];
const LLMS_PATTERNS = [
  "Framer llms.txt workflow",
  "Ship a cleaner llms.txt file for your Framer site",
  "Root file is reachable",
  "Send one Framer URL for a quick llms.txt check",
  "Send llms.txt check request",
  'name="request_type"',
  'value="llms_txt_check"',
  'name="source_page"',
  'value="/llms-txt/"',
  MARKETPLACE_URL,
];
const ROOT_LLMS_PATTERNS = [
  "# Polyglot AEO",
  "https://polyglotaeo.com/llms-txt/",
  "## Product Capabilities",
  "## Commercial Paths",
  "Framer Marketplace",
];
const PRICING_PATTERNS = [
  "Install the plugin free from the Framer Marketplace",
  "Install free on Framer",
  MARKETPLACE_URL,
  `${CHECKOUT_BASE}?plan=monthly`,
  `${CHECKOUT_BASE}?plan=yearly`,
];
const CHECKOUT_BRIDGE_PATTERNS = [
  "Plugin checkout",
  "framer-aeo-event",
  "Continue to checkout",
];
const REQUEST_ATTEMPTS = Number(process.env.SITE_CHECK_ATTEMPTS || 6);

function usage() {
  return `
Usage:
  pnpm lead:site-check

Options:
  --home-url <url>  Public home URL. Default: ${DEFAULT_HOME_URL}
  --benchmark-url <url> Framer AEO benchmark URL. Default: ${DEFAULT_BENCHMARK_URL}
  --url <url>       Public audit URL. Default: ${DEFAULT_URL}
  --sample-url <url> Sample audit URL. Default: ${DEFAULT_SAMPLE_URL}
  --agency-url <url> Agency handoff URL. Default: ${DEFAULT_AGENCY_URL}
  --llms-url <url>   Framer llms.txt checklist URL. Default: ${DEFAULT_LLMS_URL}
  --root-llms-url <url> Root llms.txt URL. Default: ${DEFAULT_ROOT_LLMS_URL}
  --pricing-url <url> Pricing URL. Default: ${DEFAULT_PRICING_URL}
  --checkout-bridge-url <url> Plugin checkout bridge URL. Default: ${DEFAULT_CHECKOUT_BRIDGE_URL}
  --site <id>       Netlify site id for optional Forms API check. Default: ${DEFAULT_SITE_ID}
  --form <name>     Expected Netlify form name. Default: ${DEFAULT_FORM_NAME}
  --event-form <name> Expected Netlify CTA event form name. Default: ${DEFAULT_EVENT_FORM_NAME}
  --skip-home       Skip the home JSON-LD check.
  --skip-benchmark  Skip the benchmark URL check.
  --skip-forms      Skip the optional Netlify Forms API check.
  --skip-sample     Skip the sample audit URL check.
  --skip-agency     Skip the agency handoff URL check.
  --skip-llms       Skip the llms.txt checklist URL check.
  --skip-root-llms  Skip the root llms.txt file check.
  --skip-pricing    Skip the pricing/checkout URL check.
  --skip-checkout-bridge Skip the plugin checkout bridge check.
  --help            Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    homeUrl: DEFAULT_HOME_URL,
    benchmarkUrl: DEFAULT_BENCHMARK_URL,
    url: DEFAULT_URL,
    sampleUrl: DEFAULT_SAMPLE_URL,
    agencyUrl: DEFAULT_AGENCY_URL,
    llmsUrl: DEFAULT_LLMS_URL,
    rootLlmsUrl: DEFAULT_ROOT_LLMS_URL,
    pricingUrl: DEFAULT_PRICING_URL,
    checkoutBridgeUrl: DEFAULT_CHECKOUT_BRIDGE_URL,
    site: process.env.NETLIFY_SITE_ID || DEFAULT_SITE_ID,
    form: process.env.SITE_CHECK_FORM_NAME || DEFAULT_FORM_NAME,
    eventForm: process.env.SITE_CHECK_EVENT_FORM_NAME || DEFAULT_EVENT_FORM_NAME,
    skipHome: process.env.SITE_CHECK_SKIP_HOME === "1",
    skipBenchmark: process.env.SITE_CHECK_SKIP_BENCHMARK === "1",
    skipForms: process.env.SITE_CHECK_SKIP_FORMS === "1",
    skipSample: process.env.SITE_CHECK_SKIP_SAMPLE === "1",
    skipAgency: process.env.SITE_CHECK_SKIP_AGENCY === "1",
    skipLlms: process.env.SITE_CHECK_SKIP_LLMS === "1",
    skipRootLlms: process.env.SITE_CHECK_SKIP_ROOT_LLMS === "1",
    skipPricing: process.env.SITE_CHECK_SKIP_PRICING === "1",
    skipCheckoutBridge: process.env.SITE_CHECK_SKIP_CHECKOUT_BRIDGE === "1",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--home-url") {
      args.homeUrl = value;
      index += 1;
      continue;
    }
    if (key === "--url") {
      args.url = value;
      index += 1;
      continue;
    }
    if (key === "--benchmark-url") {
      args.benchmarkUrl = value;
      index += 1;
      continue;
    }
    if (key === "--sample-url") {
      args.sampleUrl = value;
      index += 1;
      continue;
    }
    if (key === "--agency-url") {
      args.agencyUrl = value;
      index += 1;
      continue;
    }
    if (key === "--llms-url") {
      args.llmsUrl = value;
      index += 1;
      continue;
    }
    if (key === "--root-llms-url") {
      args.rootLlmsUrl = value;
      index += 1;
      continue;
    }
    if (key === "--pricing-url") {
      args.pricingUrl = value;
      index += 1;
      continue;
    }
    if (key === "--checkout-bridge-url") {
      args.checkoutBridgeUrl = value;
      index += 1;
      continue;
    }
    if (key === "--site") {
      args.site = value;
      index += 1;
      continue;
    }
    if (key === "--form") {
      args.form = value;
      index += 1;
      continue;
    }
    if (key === "--event-form") {
      args.eventForm = value;
      index += 1;
      continue;
    }
    if (key === "--skip-forms") {
      args.skipForms = true;
      continue;
    }
    if (key === "--skip-home") {
      args.skipHome = true;
      continue;
    }
    if (key === "--skip-benchmark") {
      args.skipBenchmark = true;
      continue;
    }
    if (key === "--skip-sample") {
      args.skipSample = true;
      continue;
    }
    if (key === "--skip-agency") {
      args.skipAgency = true;
      continue;
    }
    if (key === "--skip-llms") {
      args.skipLlms = true;
      continue;
    }
    if (key === "--skip-root-llms") {
      args.skipRootLlms = true;
      continue;
    }
    if (key === "--skip-pricing") {
      args.skipPricing = true;
      continue;
    }
    if (key === "--skip-checkout-bridge") {
      args.skipCheckoutBridge = true;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

async function checkUrl(url, patterns = REQUIRED_PATTERNS) {
  const response = await curlBody(url);
  const text = response.body;
  const missing = patterns.filter((pattern) => !hasPattern(text, pattern));

  return {
    url,
    finalUrl: response.finalUrl,
    status: response.status,
    ok: response.status >= 200 && response.status < 300 && missing.length === 0,
    missing,
  };
}

function hasPattern(text, pattern) {
  const source = String(text || "");
  const normalized = source.replace(/&amp;/g, "&");
  const decodedSource = safeDecodeURIComponent(source);
  const decodedNormalized = safeDecodeURIComponent(normalized);
  const encodedPattern = encodeURIComponent(pattern);
  return [source, normalized, decodedSource, decodedNormalized].some(
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

async function curlHead(url) {
  const { stdout } = await runCurl(
    ["-sS", "--http1.1", "-I", "-L", "--connect-timeout", "15", "--max-time", "30", "-w", "STATUS:%{http_code} URL:%{url_effective}", url],
    { maxBuffer: 1024 * 1024 },
  );
  const metadata = stdout.match(/STATUS:(\d+) URL:(.+)\s*$/);
  const status = Number.parseInt(metadata?.[1] || "0", 10);
  const finalUrl = metadata?.[2] || url;
  return { status, finalUrl };
}

async function curlBody(url) {
  const marker = "\n__POLYGLOT_AEO_SITE_CHECK__";
  const { stdout } = await runCurl(
    ["-sS", "--http1.1", "--compressed", "-L", "--connect-timeout", "15", "--max-time", "30", "-w", `${marker}STATUS:%{http_code} URL:%{url_effective}`, url],
    { maxBuffer: 5 * 1024 * 1024 },
  );
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex === -1) {
    throw new Error("curl did not return status metadata.");
  }
  const body = stdout.slice(0, markerIndex);
  const metadata = stdout.slice(markerIndex + marker.length).trim();
  const status = Number.parseInt(metadata.match(/STATUS:(\d+)/)?.[1] || "0", 10);
  const finalUrl = metadata.match(/URL:(.+)$/)?.[1] || url;
  return { body, status, finalUrl };
}

async function runCurl(args, options) {
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await execFileAsync("curl", args, options);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === REQUEST_ATTEMPTS) break;
      process.stderr.write(`Site check retry ${attempt}/${REQUEST_ATTEMPTS - 1}: ${error.message.split("\n")[0]}\n`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw lastError;
}

function isRetryable(error) {
  const output = `${error?.message || ""}\n${error?.stderr || ""}`;
  return /ECONNRESET|Recv failure|Connection reset|timed out|Failed to connect|HTTP\/2 stream|SSL_ERROR_SYSCALL|SSL_connect/i.test(output);
}

async function checkNetlifyForm({ siteId, formName }) {
  const token = await readNetlifyToken();
  if (!token) {
    return {
      checked: false,
      ok: true,
      note: "skipped; NETLIFY_AUTH_TOKEN or Netlify CLI token not found",
    };
  }

  const forms = await netlifyJsonWithRetries({
    token,
    path: `/api/v1/sites/${encodeURIComponent(siteId)}/forms`,
  });
  const form = forms.find((item) => item.name === formName);

  return {
    checked: true,
    ok: Boolean(form),
    id: form?.id,
    submissionCount: form?.submission_count,
    note: form ? "registered" : "missing",
  };
}

async function readNetlifyToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;

  const configPath = path.join(os.homedir(), "Library/Preferences/netlify/config.json");
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    return config?.users?.[config.userId]?.auth?.token || config?.auth?.token || config?.token || "";
  } catch {
    return "";
  }
}

async function netlifyJsonWithRetries({ token, path: requestPath }) {
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await netlifyJson({ token, path: requestPath });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === REQUEST_ATTEMPTS) break;
      process.stderr.write(`Netlify Forms check retry ${attempt}/${REQUEST_ATTEMPTS - 1}: ${error.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw lastError;
}

function netlifyJson({ token, path: requestPath }) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: "GET",
        hostname: "api.netlify.com",
        path: requestPath,
        timeout: 60000,
        agent: false,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          Connection: "close",
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(JSON.parse(text));
            return;
          }

          const error = new Error(`Netlify API returned HTTP ${response.statusCode}: ${text.slice(0, 200)}`);
          error.statusCode = response.statusCode;
          reject(error);
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("Netlify API request timed out")));
    request.on("error", reject);
    request.end();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const homeResult = args.skipHome ? null : await checkUrl(args.homeUrl, HOME_PATTERNS);
  const benchmarkResult = args.skipBenchmark
    ? null
    : await checkUrl(args.benchmarkUrl, BENCHMARK_PATTERNS);
  const result = await checkUrl(args.url);
  const sampleResult = args.skipSample ? null : await checkUrl(args.sampleUrl, SAMPLE_PATTERNS);
  const agencyResult = args.skipAgency ? null : await checkUrl(args.agencyUrl, AGENCY_PATTERNS);
  const llmsResult = args.skipLlms ? null : await checkUrl(args.llmsUrl, LLMS_PATTERNS);
  const rootLlmsResult = args.skipRootLlms
    ? null
    : await checkUrl(args.rootLlmsUrl, ROOT_LLMS_PATTERNS);
  const pricingResult = args.skipPricing ? null : await checkUrl(args.pricingUrl, PRICING_PATTERNS);
  const checkoutBridgeResult = args.skipCheckoutBridge
    ? null
    : await checkUrl(args.checkoutBridgeUrl, CHECKOUT_BRIDGE_PATTERNS);
  let formResult = null;
  let eventFormResult = null;
  if (!args.skipForms) {
    try {
      formResult = await checkNetlifyForm({ siteId: args.site, formName: args.form });
      eventFormResult = await checkNetlifyForm({ siteId: args.site, formName: args.eventForm });
    } catch (error) {
      formResult = {
        checked: true,
        ok: true,
        note: `warning; Netlify Forms API unavailable (${error.message})`,
      };
      eventFormResult = formResult;
    }
  }

  if (homeResult) {
    process.stdout.write(`# Home JSON-LD Check\n\n`);
    process.stdout.write(`URL: ${homeResult.url}\n`);
    process.stdout.write(`Final URL: ${homeResult.finalUrl}\n`);
    process.stdout.write(`HTTP status: ${homeResult.status}\n`);
    if (homeResult.missing.length) {
      process.stdout.write(`Missing home markers: ${homeResult.missing.join(", ")}\n`);
    } else {
      process.stdout.write("Required home JSON-LD markers: present\n");
    }
    process.stdout.write("\n");
  }

  if (benchmarkResult) {
    process.stdout.write(`# Framer AEO Benchmark Page Check\n\n`);
    process.stdout.write(`URL: ${benchmarkResult.url}\n`);
    process.stdout.write(`Final URL: ${benchmarkResult.finalUrl}\n`);
    process.stdout.write(`HTTP status: ${benchmarkResult.status}\n`);
    if (benchmarkResult.missing.length) {
      process.stdout.write(`Missing benchmark markers: ${benchmarkResult.missing.join(", ")}\n`);
    } else {
      process.stdout.write("Required benchmark markers: present\n");
    }
    process.stdout.write("\n");
  }

  process.stdout.write(`# Public Audit Page Check\n\n`);
  process.stdout.write(`URL: ${result.url}\n`);
  process.stdout.write(`Final URL: ${result.finalUrl}\n`);
  process.stdout.write(`HTTP status: ${result.status}\n`);

  if (result.missing.length) {
    process.stdout.write(`Missing markers: ${result.missing.join(", ")}\n`);
  } else {
    process.stdout.write("Required form markers: present\n");
  }

  if (sampleResult) {
    process.stdout.write("\n# Sample Audit Page Check\n\n");
    process.stdout.write(`URL: ${sampleResult.url}\n`);
    process.stdout.write(`Final URL: ${sampleResult.finalUrl}\n`);
    process.stdout.write(`HTTP status: ${sampleResult.status}\n`);
    if (sampleResult.missing.length) {
      process.stdout.write(`Missing sample markers: ${sampleResult.missing.join(", ")}\n`);
    } else {
      process.stdout.write("Required sample markers: present\n");
    }
  }

  if (agencyResult) {
    process.stdout.write("\n# Agency Handoff Page Check\n\n");
    process.stdout.write(`URL: ${agencyResult.url}\n`);
    process.stdout.write(`Final URL: ${agencyResult.finalUrl}\n`);
    process.stdout.write(`HTTP status: ${agencyResult.status}\n`);
    if (agencyResult.missing.length) {
      process.stdout.write(`Missing agency markers: ${agencyResult.missing.join(", ")}\n`);
    } else {
      process.stdout.write("Required agency markers: present\n");
    }
  }

  if (llmsResult) {
    process.stdout.write("\n# Framer llms.txt Page Check\n\n");
    process.stdout.write(`URL: ${llmsResult.url}\n`);
    process.stdout.write(`Final URL: ${llmsResult.finalUrl}\n`);
    process.stdout.write(`HTTP status: ${llmsResult.status}\n`);
    if (llmsResult.missing.length) {
      process.stdout.write(`Missing llms.txt markers: ${llmsResult.missing.join(", ")}\n`);
    } else {
      process.stdout.write("Required llms.txt markers: present\n");
    }
  }

  if (rootLlmsResult) {
    process.stdout.write("\n# Root llms.txt File Check\n\n");
    process.stdout.write(`URL: ${rootLlmsResult.url}\n`);
    process.stdout.write(`Final URL: ${rootLlmsResult.finalUrl}\n`);
    process.stdout.write(`HTTP status: ${rootLlmsResult.status}\n`);
    if (rootLlmsResult.missing.length) {
      process.stdout.write(`Missing root llms.txt markers: ${rootLlmsResult.missing.join(", ")}\n`);
    } else {
      process.stdout.write("Required root llms.txt markers: present\n");
    }
  }

  if (pricingResult) {
    process.stdout.write("\n# Pricing Checkout Page Check\n\n");
    process.stdout.write(`URL: ${pricingResult.url}\n`);
    process.stdout.write(`Final URL: ${pricingResult.finalUrl}\n`);
    process.stdout.write(`HTTP status: ${pricingResult.status}\n`);
    if (pricingResult.missing.length) {
      process.stdout.write(`Missing pricing markers: ${pricingResult.missing.join(", ")}\n`);
    } else {
      process.stdout.write("Required pricing markers: present\n");
    }
  }

  if (checkoutBridgeResult) {
    process.stdout.write("\n# Plugin Checkout Bridge Check\n\n");
    process.stdout.write(`URL: ${checkoutBridgeResult.url}\n`);
    process.stdout.write(`Final URL: ${checkoutBridgeResult.finalUrl}\n`);
    process.stdout.write(`HTTP status: ${checkoutBridgeResult.status}\n`);
    if (checkoutBridgeResult.missing.length) {
      process.stdout.write(`Missing checkout bridge markers: ${checkoutBridgeResult.missing.join(", ")}\n`);
    } else {
      process.stdout.write("Required checkout bridge markers: present\n");
    }
  }

  if (formResult) {
    if (formResult.checked && formResult.id) {
      process.stdout.write(`Netlify form: ${formResult.note} (${formResult.id}, submissions: ${formResult.submissionCount ?? 0})\n`);
    } else {
      process.stdout.write(`Netlify form: ${formResult.note}\n`);
    }
  } else {
    process.stdout.write("Netlify form: skipped\n");
  }
  if (eventFormResult) {
    if (eventFormResult.checked && eventFormResult.id) {
      process.stdout.write(`Netlify event form: ${eventFormResult.note} (${eventFormResult.id}, submissions: ${eventFormResult.submissionCount ?? 0})\n`);
    } else {
      process.stdout.write(`Netlify event form: ${eventFormResult.note}\n`);
    }
  } else {
    process.stdout.write("Netlify event form: skipped\n");
  }

  if (
    homeResult?.ok === false ||
    benchmarkResult?.ok === false ||
    !result.ok ||
    sampleResult?.ok === false ||
    agencyResult?.ok === false ||
    llmsResult?.ok === false ||
    rootLlmsResult?.ok === false ||
    pricingResult?.ok === false ||
    checkoutBridgeResult?.ok === false ||
    formResult?.ok === false ||
    eventFormResult?.ok === false
  ) {
    process.stdout.write("\nResult: FAIL\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write("\nResult: PASS\n");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
