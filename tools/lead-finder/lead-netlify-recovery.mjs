#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_SITE_ID = "49fc3e5b-7ff7-4185-b578-60c81e3168ff";
const DEFAULT_SITE_URL = "https://polyglotaeo.com";
const DEFAULT_DEPLOY_REVIEW = ".tmp/framer-deploy-review.json";
const DEFAULT_TRACKING_FRESHNESS = ".tmp/framer-tracking-freshness.json";
const DEFAULT_DIAGNOSIS = ".tmp/framer-netlify-deploy-diagnosis.md";
const DEFAULT_BUILD_DIR = "polyglotaeo-web/out";
const DEFAULT_OUTPUT = ".tmp/framer-netlify-recovery.md";
const DEFAULT_JSON = ".tmp/framer-netlify-recovery.json";
const API_BASE = "https://api.netlify.com/api/v1";
const REQUEST_TIMEOUT_MS = Number(process.env.NETLIFY_RECOVERY_TIMEOUT_MS || 30000);

function usage() {
  return `
Usage:
  pnpm lead:netlify-recovery

Options:
  --site <id>                 Netlify site id. Default: ${DEFAULT_SITE_ID}
  --site-url <url>            Production URL. Default: ${DEFAULT_SITE_URL}
  --deploy-review <file>      Deploy review JSON. Default: ${DEFAULT_DEPLOY_REVIEW}
  --tracking-freshness <file> Tracking freshness JSON. Default: ${DEFAULT_TRACKING_FRESHNESS}
  --diagnosis <file>          Deploy diagnosis markdown. Default: ${DEFAULT_DIAGNOSIS}
  --build-dir <dir>           Local static export directory. Default: ${DEFAULT_BUILD_DIR}
  --output <file>             Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>               JSON output. Default: ${DEFAULT_JSON}
  --help                      Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    site: process.env.NETLIFY_SITE_ID || DEFAULT_SITE_ID,
    siteUrl: DEFAULT_SITE_URL,
    deployReview: DEFAULT_DEPLOY_REVIEW,
    trackingFreshness: DEFAULT_TRACKING_FRESHNESS,
    diagnosis: DEFAULT_DIAGNOSIS,
    buildDir: DEFAULT_BUILD_DIR,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--site") {
      args.site = value;
      index += 1;
      continue;
    }
    if (key === "--site-url") {
      args.siteUrl = value.replace(/\/+$/, "");
      index += 1;
      continue;
    }
    if (key === "--deploy-review") {
      args.deployReview = value;
      index += 1;
      continue;
    }
    if (key === "--tracking-freshness") {
      args.trackingFreshness = value;
      index += 1;
      continue;
    }
    if (key === "--diagnosis") {
      args.diagnosis = value;
      index += 1;
      continue;
    }
    if (key === "--build-dir") {
      args.buildDir = value;
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

  args.siteUrl = args.siteUrl.replace(/\/+$/, "");
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

async function authToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) {
    return { token: process.env.NETLIFY_AUTH_TOKEN, source: "NETLIFY_AUTH_TOKEN" };
  }

  const configPaths = [
    path.join(os.homedir(), "Library/Preferences/netlify/config.json"),
    path.join(os.homedir(), ".netlify", "config.json"),
  ];

  for (const configPath of configPaths) {
    try {
      const config = JSON.parse(await readFile(configPath, "utf8"));
      const token = config?.users?.[config.userId]?.auth?.token ||
        config?.auth?.token ||
        config?.token ||
        "";
      if (token) return { token, source: configPath };
    } catch {
      // Try the next known Netlify CLI config location.
    }
  }

  return { token: "", source: "" };
}

async function netlifyGet({ token, path: requestPath }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${requestPath}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "PolyglotAEO-NetlifyRecovery/1.0",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json,
      body_preview: text.slice(0, 300),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      body_preview: "",
      error: error?.message || String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function publicGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "PolyglotAEO-NetlifyRecovery/1.0" },
      signal: controller.signal,
    });
    return {
      url,
      final_url: response.url || url,
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      text: await response.text(),
      probe: "fetch",
    };
  } catch (error) {
    return curlPublicGet(url, error);
  } finally {
    clearTimeout(timer);
  }
}

async function curlPublicGet(url, fetchError) {
  const statusMarker = "\n__NETLIFY_RECOVERY_STATUS__";
  const urlMarker = "\n__NETLIFY_RECOVERY_URL__";
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-L",
        "-sS",
        "--max-time",
        String(Math.max(5, Math.ceil(REQUEST_TIMEOUT_MS / 1000))),
        "-A",
        "PolyglotAEO-NetlifyRecovery/1.0",
        "-w",
        `${statusMarker}%{http_code}${urlMarker}%{url_effective}`,
        url,
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    const statusIndex = stdout.lastIndexOf(statusMarker);
    const urlIndex = stdout.lastIndexOf(urlMarker);
    const body = statusIndex === -1 ? stdout : stdout.slice(0, statusIndex);
    const statusText = statusIndex === -1 || urlIndex === -1
      ? "0"
      : stdout.slice(statusIndex + statusMarker.length, urlIndex).trim();
    const finalUrl = urlIndex === -1 ? url : stdout.slice(urlIndex + urlMarker.length).trim();
    const status = Number.parseInt(statusText, 10) || 0;
    return {
      url,
      final_url: finalUrl || url,
      status,
      ok: status >= 200 && status < 300,
      text: body,
      probe: "curl_fallback",
      fetch_error: fetchError?.message || String(fetchError || ""),
    };
  } catch (curlError) {
    return {
      url,
      final_url: url,
      status: 0,
      ok: false,
      text: "",
      probe: "fetch_then_curl_failed",
      error: curlError?.message || String(curlError),
      fetch_error: fetchError?.message || String(fetchError || ""),
    };
  }
}

async function buildDirStatus(buildDir) {
  try {
    const info = await stat(buildDir);
    const forms = await readText(path.join(buildDir, "__forms.html"));
    return {
      exists: info.isDirectory(),
      path: path.resolve(buildDir),
      modified_at: info.mtime.toISOString(),
      forms_has_attribution_schema: [
        'name="utm_source"',
        'name="landing_path"',
        'name="referrer"',
      ].every((marker) => forms.includes(marker)),
    };
  } catch (error) {
    return {
      exists: false,
      path: path.resolve(buildDir),
      error: error?.message || String(error),
      forms_has_attribution_schema: false,
    };
  }
}

function hasCreditBlock({ diagnosis, deployReview }) {
  const text = `${diagnosis}\n${deployReview?.deploy_blocker || ""}\n${deployReview?.netlify_new_deploys || ""}\n${deployReview?.recommendation || ""}`;
  return /credit usage exceeded|blocked_credit|blocked_forbidden_credit/i.test(text);
}

function hasForbiddenBlock({ diagnosis, deployReview }) {
  const text = `${diagnosis}\n${deployReview?.deploy_blocker || ""}\n${deployReview?.netlify_new_deploys || ""}\n${deployReview?.recommendation || ""}`;
  return /Forbidden|HTTP 403|blocked_forbidden/i.test(text);
}

function latestDeploy(deploysResponse, siteResponse) {
  const deploys = Array.isArray(deploysResponse.json) ? deploysResponse.json : [];
  return deploys[0] || siteResponse.json?.published_deploy || {};
}

function assess({
  args,
  tokenInfo,
  siteResponse,
  deploysResponse,
  formsResponse,
  publicPages,
  buildDir,
  deployReview,
  trackingFreshness,
  diagnosis,
}) {
  const deploy = latestDeploy(deploysResponse, siteResponse);
  const accountCreditBlock = hasCreditBlock({ diagnosis, deployReview });
  const forbiddenBlock = hasForbiddenBlock({ diagnosis, deployReview });
  const publicOk = publicPages.every((page) => page.ok);
  const forms = Array.isArray(formsResponse.json) ? formsResponse.json : [];
  const miniAuditForm = forms.find((form) => form.name === "framer-aeo-mini-audit");
  const eventForm = forms.find((form) => form.name === "framer-aeo-event");
  const tokenOk = Boolean(tokenInfo.token);
  const apiReadable = siteResponse.ok && deploysResponse.ok;
  const latestDeployId = deploy.id || deploy.deploy_id || deployReview?.latest_production_deploy_id || "";
  const latestPublishedAt = deploy.published_at || deploy.created_at || deployReview?.latest_production_published_at || "";
  const trackingFresh = trackingFreshness?.fresh === true;
  const localBuildFresh = buildDir.exists && buildDir.forms_has_attribution_schema;
  const status = statusFor({
    tokenOk,
    apiReadable,
    publicOk,
    accountCreditBlock,
    forbiddenBlock,
    trackingFresh,
  });

  return {
    generated_at: new Date().toISOString(),
    site_id: args.site,
    site_url: args.siteUrl,
    status,
    token: {
      found: tokenOk,
      source: tokenInfo.source ? tokenInfo.source.replace(os.homedir(), "~") : "",
    },
    api: {
      site_readable: siteResponse.ok,
      site_status: siteResponse.status,
      deploys_readable: deploysResponse.ok,
      deploys_status: deploysResponse.status,
      forms_readable: formsResponse.ok,
      forms_status: formsResponse.status,
    },
    public_pages: publicPages.map((page) => ({
      url: page.url,
      final_url: page.final_url,
      status: page.status,
      ok: page.ok,
      probe: page.probe || "",
      error: page.error || page.fetch_error || "",
    })),
    netlify_site: {
      name: siteResponse.json?.name || "",
      custom_domain: siteResponse.json?.custom_domain || "",
      ssl_url: siteResponse.json?.ssl_url || "",
      admin_url: siteResponse.json?.admin_url || "",
    },
    latest_deploy: {
      id: latestDeployId,
      state: deploy.state || deployReview?.status || "",
      published_at: latestPublishedAt,
      deploy_ssl_url: deploy.deploy_ssl_url || deploy.ssl_url || "",
      admin_url: deploy.admin_url || "",
    },
    forms: {
      mini_audit_registered: Boolean(miniAuditForm),
      mini_audit_submissions: miniAuditForm?.submission_count ?? null,
      event_registered: Boolean(eventForm),
      event_submissions: eventForm?.submission_count ?? null,
    },
    blockers: {
      account_credit_usage_exceeded: accountCreditBlock,
      forbidden_or_permission: forbiddenBlock,
      production_tracking_fresh: trackingFresh,
      local_build_has_attribution_schema: localBuildFresh,
    },
    build_dir: buildDir,
    deploy_review_status: deployReview?.status || "missing",
    tracking_freshness_status: trackingFreshness?.status || "missing",
    recommendation: recommendationFor({
      status,
      accountCreditBlock,
      forbiddenBlock,
      trackingFresh,
      localBuildFresh,
    }),
  };
}

function statusFor({ tokenOk, apiReadable, publicOk, accountCreditBlock, forbiddenBlock, trackingFresh }) {
  if (!tokenOk) return "netlify_token_missing";
  if (!apiReadable && publicOk) return "production_ok_netlify_api_unreadable";
  if (!publicOk) return "production_unreachable";
  if ((accountCreditBlock || forbiddenBlock) && !trackingFresh) return "production_ok_deploy_blocked_tracking_stale";
  if (accountCreditBlock || forbiddenBlock) return "production_ok_deploy_blocked";
  if (!trackingFresh) return "production_ok_tracking_stale_ready_for_confirmed_deploy";
  return "production_ok_tracking_fresh";
}

function recommendationFor({ status, accountCreditBlock, forbiddenBlock, trackingFresh, localBuildFresh }) {
  if (status === "netlify_token_missing") {
    return "Netlify token was not found. Run `npx netlify-cli@latest login`, then rerun this read-only recovery check.";
  }
  if (status === "production_unreachable") {
    return "Production pages are not all reachable. Run `pnpm lead:site-check` and inspect Netlify before sending any additional traffic.";
  }
  if (accountCreditBlock) {
    return "Netlify login/project binding is readable, but previous deploy evidence shows account credit usage exceeded. Add/restore Netlify credits for the Gaode team, then rerun `pnpm lead:netlify-apply -- --dry-run`; deploy only after explicit confirmation with `pnpm lead:netlify-apply -- --confirm '确认部署 polyglotaeo-web 到 Netlify'`. After deploy, run `pnpm lead:site-check` and `pnpm lead:tracking-freshness -- --strict`.";
  }
  if (forbiddenBlock) {
    return "Netlify API is readable, but previous deploy evidence shows Forbidden. Check team deploy permissions, billing, and project access before requesting deploy confirmation.";
  }
  if (!trackingFresh && localBuildFresh) {
    return "Local static export contains the attribution schema, but production tracking is stale. Request explicit deploy confirmation, deploy once, then rerun site and tracking strict checks.";
  }
  if (!trackingFresh) {
    return "Production tracking is stale and the local build freshness is not proven. Rebuild `polyglotaeo-web`, then request deploy confirmation.";
  }
  return "Production is reachable and tracking is fresh. Keep Marketplace/Community/directory actions gated by their own preflight and explicit confirmations.";
}

function renderMarkdown(review) {
  const lines = [
    "# Netlify Recovery Check",
    "",
    `Generated: ${review.generated_at}`,
    `Status: ${review.status}`,
    `Site: ${review.netlify_site.name || "unknown"} (${review.site_id})`,
    `Production URL: ${review.site_url}`,
    `Token found: ${review.token.found ? "yes" : "no"}${review.token.source ? ` (${review.token.source})` : ""}`,
    "",
    "## Read-Only API",
    "",
    `- Site readable: ${review.api.site_readable ? "yes" : "no"} (HTTP ${review.api.site_status})`,
    `- Deploys readable: ${review.api.deploys_readable ? "yes" : "no"} (HTTP ${review.api.deploys_status})`,
    `- Forms readable: ${review.api.forms_readable ? "yes" : "no"} (HTTP ${review.api.forms_status})`,
    `- Admin URL: ${review.netlify_site.admin_url || "unknown"}`,
    "",
    "## Latest Production Evidence",
    "",
    `- Latest deploy id: ${review.latest_deploy.id || "unknown"}`,
    `- Deploy state: ${review.latest_deploy.state || "unknown"}`,
    `- Published at: ${review.latest_deploy.published_at || "unknown"}`,
    `- Deploy URL: ${review.latest_deploy.deploy_ssl_url || "unknown"}`,
    "",
    "## Public Pages",
    "",
    "| URL | HTTP | OK |",
    "|---|---:|---|",
  ];

  for (const page of review.public_pages) {
    lines.push(`| ${page.url} | ${page.status} | ${page.ok ? "yes" : "no"} |`);
  }

  lines.push(
    "",
    "## Forms",
    "",
    `- Mini-audit registered: ${review.forms.mini_audit_registered ? "yes" : "no"}${review.forms.mini_audit_submissions === null ? "" : ` (${review.forms.mini_audit_submissions} submissions)`}`,
    `- Event registered: ${review.forms.event_registered ? "yes" : "no"}${review.forms.event_submissions === null ? "" : ` (${review.forms.event_submissions} submissions)`}`,
    "",
    "## Blockers",
    "",
    `- Account credit usage exceeded evidence: ${review.blockers.account_credit_usage_exceeded ? "yes" : "no"}`,
    `- Forbidden/permission evidence: ${review.blockers.forbidden_or_permission ? "yes" : "no"}`,
    `- Production tracking fresh: ${review.blockers.production_tracking_fresh ? "yes" : "no"}`,
    `- Local build has attribution schema: ${review.blockers.local_build_has_attribution_schema ? "yes" : "no"}`,
    "",
    "## Recovery Path",
    "",
    review.recommendation,
    "",
    "```bash",
    "pnpm lead:netlify-recovery",
    "pnpm lead:site-check",
    "pnpm lead:tracking-freshness -- --strict",
    "# after credits/permissions are fixed and explicit deploy confirmation is given:",
    "pnpm lead:netlify-apply -- --dry-run",
    "pnpm lead:netlify-apply -- --confirm '确认部署 polyglotaeo-web 到 Netlify'",
    "pnpm lead:site-check && pnpm lead:tracking-freshness -- --strict",
    "pnpm lead:deploy-review && pnpm lead:ops && pnpm lead:report",
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

  const [tokenInfo, deployReview, trackingFreshness, diagnosis, buildDir, publicPages] = await Promise.all([
    authToken(),
    readJson(args.deployReview, null),
    readJson(args.trackingFreshness, null),
    readText(args.diagnosis),
    buildDirStatus(args.buildDir),
    Promise.all([
      publicGet(`${args.siteUrl}/`),
      publicGet(`${args.siteUrl}/audit/`),
      publicGet(`${args.siteUrl}/go/checkout/`),
      publicGet(`${args.siteUrl}/__forms.html`),
    ]),
  ]);

  let siteResponse = { ok: false, status: 0, json: null, body_preview: "", error: "token missing" };
  let deploysResponse = { ok: false, status: 0, json: null, body_preview: "", error: "token missing" };
  let formsResponse = { ok: false, status: 0, json: null, body_preview: "", error: "token missing" };
  if (tokenInfo.token) {
    [siteResponse, deploysResponse, formsResponse] = await Promise.all([
      netlifyGet({ token: tokenInfo.token, path: `/sites/${encodeURIComponent(args.site)}` }),
      netlifyGet({ token: tokenInfo.token, path: `/sites/${encodeURIComponent(args.site)}/deploys?per_page=1` }),
      netlifyGet({ token: tokenInfo.token, path: `/sites/${encodeURIComponent(args.site)}/forms` }),
    ]);
  }

  const review = assess({
    args,
    tokenInfo,
    siteResponse,
    deploysResponse,
    formsResponse,
    publicPages,
    buildDir,
    deployReview,
    trackingFreshness,
    diagnosis,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Netlify recovery: ${review.status}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  process.stdout.write(`Recommendation: ${review.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
