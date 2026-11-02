#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const DEFAULT_OWNED_SITE_DROP_PATCH = ".tmp/framer-owned-site-drop-patches.json";
const DEFAULT_USE_CASE_PAGE_PACKAGES = ".tmp/framer-use-case-page-packages.json";
const DEFAULT_CONFIRMATION_QUEUE = ".tmp/framer-confirmation-queue.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-publish-preflight.md";
const DEFAULT_JSON = ".tmp/framer-publish-preflight.json";

function usage() {
  return `
Usage:
  pnpm lead:publish-preflight

Options:
  --owned-site-drop-patch <file>  Owned-site local patch JSON. Default: ${DEFAULT_OWNED_SITE_DROP_PATCH}
  --use-case-page-packages <file> Use-case page local packages JSON. Default: ${DEFAULT_USE_CASE_PAGE_PACKAGES}
  --confirmations <file>          Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATION_QUEUE}
  --actions <file>                Action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>                 Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                   JSON output. Default: ${DEFAULT_JSON}
  --help                          Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    ownedSiteDropPatch: DEFAULT_OWNED_SITE_DROP_PATCH,
    useCasePagePackages: DEFAULT_USE_CASE_PAGE_PACKAGES,
    confirmations: DEFAULT_CONFIRMATION_QUEUE,
    actions: DEFAULT_ACTIONS,
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
    const map = {
      "--owned-site-drop-patch": "ownedSiteDropPatch",
      "--use-case-page-packages": "useCasePagePackages",
      "--confirmations": "confirmations",
      "--actions": "actions",
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

  return rows;
}

async function readRows(file) {
  const text = await readText(file);
  if (!text.trim()) return [];
  const [headers, ...records] = parseCsv(text);
  if (!headers?.length) return [];
  return records
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function fileInfo(file) {
  const text = await readText(file);
  if (!text) {
    return { file, exists: false, bytes: 0, sha256: "", text: "" };
  }
  let bytes = Buffer.byteLength(text);
  try {
    bytes = (await stat(file)).size;
  } catch {
    // Keep the byte length from the in-memory text.
  }
  return {
    file,
    exists: true,
    bytes,
    sha256: createHash("sha256").update(text).digest("hex"),
    text,
  };
}

function campaignFrom(url) {
  try {
    return new URL(url).searchParams.get("utm_campaign") || "";
  } catch {
    return "";
  }
}

function isMarketplaceUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.framer.com" && parsed.pathname.includes("/community/marketplace/plugins/");
  } catch {
    return false;
  }
}

function isConcreteUrl(value) {
  const text = String(value || "");
  if (!/^https?:\/\//i.test(text) || /[<>]/.test(text)) return false;
  try {
    const parsed = new URL(text);
    return Boolean(parsed.hostname && parsed.hostname.includes("."));
  } catch {
    return false;
  }
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function pluginTerms(plugin) {
  const text = String(plugin || "").toLowerCase();
  if (/gaode|amap/.test(text)) return ["gaode", "gaode maps", "gaodemaps", "amap"];
  if (/ally/.test(text)) return ["ally", "ally auditor", "allyauditor"];
  if (/loka/.test(text)) return ["loka", "loka pro", "getloka"];
  if (/polyglot/.test(text)) return ["polyglot", "polyglot aeo", "polyglotaeo"];
  return text ? [text] : [];
}

function actionText(row) {
  return [
    row.type,
    row.channel,
    row.campaign,
    row.status,
    row.target,
    row.evidence,
    row.note,
  ].join(" ").toLowerCase();
}

function isOpenAction(row) {
  return !/done|resolved|closed|skipped|cancelled|canceled/i.test(row.status || "");
}

function openHostingWarningsForPlugin(actions, plugin) {
  const terms = pluginTerms(plugin);
  if (!terms.length) return [];
  return (actions || []).filter((row) => {
    if (!/hosting_warning/i.test(row.type || "")) return false;
    if (!isOpenAction(row)) return false;
    const haystack = actionText(row);
    return terms.some((term) => haystack.includes(term));
  });
}

function hostingWarningDetail(row) {
  return clean([
    row.campaign,
    row.status,
    row.target,
    row.evidence,
    row.note,
  ].filter(Boolean).join(" - "));
}

function shortHash(value) {
  return String(value || "").slice(0, 12);
}

function countCreemLinks(text) {
  return (String(text || "").match(/https?:\/\/(?:www\.)?creem\.io\/payment\/[^\s"'<>)]*/gi) || []).length;
}

function confirmationExists(queue, { confirmation, plugin, kind }) {
  const rows = Array.isArray(queue?.rows) ? queue.rows : [];
  return rows.some((row) => {
    const sameConfirmation = String(row.confirmation || "") === String(confirmation || "");
    const samePlugin = !plugin || String(row.plugin || "") === String(plugin || "");
    const sameKind = !kind || String(row.kind || "") === String(kind || "");
    return sameConfirmation && samePlugin && sameKind;
  });
}

function addCheck(checks, { name, ok, detail, level = "error" }) {
  checks.push({
    name,
    status: ok ? "pass" : level,
    detail: detail || "",
  });
}

function summarizeChecks(checks) {
  return {
    errors: checks.filter((check) => check.status === "error").map((check) => `${check.name}: ${check.detail}`),
    warnings: checks.filter((check) => check.status === "warning").map((check) => `${check.name}: ${check.detail}`),
  };
}

function assetStatus({ errors, warnings }) {
  if (errors.length) return "fail";
  if (warnings.length) return "pass_with_warnings";
  return "pass";
}

function fileSummary(info) {
  return {
    file: info.file,
    exists: info.exists,
    bytes: info.bytes,
    sha256: info.sha256,
  };
}

async function assessOwnedPatch(patch, confirmationQueue, actionRows) {
  const [index, snippet, links] = await Promise.all([
    fileInfo(patch.index_file),
    fileInfo(patch.snippet_file),
    fileInfo(patch.text_file),
  ]);
  const checks = [];
  const campaign = campaignFrom(patch.primary_cta_url);
  const fullCreemLinks = countCreemLinks(index.text);
  const snippetCreemLinks = countCreemLinks(snippet.text);
  const hostingWarnings = openHostingWarningsForPlugin(actionRows, patch.plugin);

  for (const info of [index, snippet, links]) {
    addCheck(checks, {
      name: `${path.basename(info.file)} exists`,
      ok: info.exists && info.bytes > 0,
      detail: info.exists ? `${info.bytes} bytes, sha256 ${shortHash(info.sha256)}` : `missing file ${info.file}`,
    });
  }

  addCheck(checks, {
    name: "primary CTA is Framer Marketplace URL",
    ok: isMarketplaceUrl(patch.primary_cta_url),
    detail: patch.primary_cta_url || "missing primary CTA URL",
  });
  addCheck(checks, {
    name: "primary CTA has UTM campaign",
    ok: Boolean(campaign),
    detail: campaign || "missing utm_campaign",
  });
  addCheck(checks, {
    name: "snippet contains tracked CTA section",
    ok: snippet.text.includes("framer-plugin-growth-cta"),
    detail: patch.snippet_file,
  });
  addCheck(checks, {
    name: "snippet contains primary CTA URL",
    ok: snippet.text.includes(patch.primary_cta_url),
    detail: campaign,
  });
  addCheck(checks, {
    name: "text link file contains primary CTA URL",
    ok: links.text.includes(patch.primary_cta_url),
    detail: patch.text_file,
  });
  addCheck(checks, {
    name: "full preview contains injected CTA",
    ok: index.text.includes("framer-plugin-growth-cta") && index.text.includes(patch.primary_cta_url),
    detail: patch.index_file,
  });
  addCheck(checks, {
    name: "generated snippet avoids direct Creem checkout",
    ok: snippetCreemLinks === 0,
    detail: snippetCreemLinks ? `${snippetCreemLinks} direct Creem payment link(s) in generated snippet` : "snippet has no direct Creem checkout links",
  });
  addCheck(checks, {
    name: "source homepage direct Creem checkout links",
    ok: fullCreemLinks === 0,
    level: "warning",
    detail: fullCreemLinks
      ? `${fullCreemLinks} existing direct Creem payment link(s) remain in the full homepage preview; confirm this store/domain is approved before scaling traffic`
      : "no direct Creem checkout links found in full preview",
  });
  addCheck(checks, {
    name: "source homepage fetch was OK",
    ok: patch.fetched_ok === true,
    level: "warning",
    detail: patch.fetched_ok ? `HTTP ${patch.fetched_status}` : (patch.fetched_error || `HTTP ${patch.fetched_status || 0}`),
  });
  addCheck(checks, {
    name: "confirmation queue contains matching row",
    ok: confirmationExists(confirmationQueue, {
      confirmation: patch.confirmation,
      plugin: patch.plugin,
      kind: "landing_baseline",
    }),
    detail: patch.confirmation || "missing confirmation phrase",
  });
  for (const warning of hostingWarnings) {
    addCheck(checks, {
      name: "open hosting warning blocks publish",
      ok: false,
      detail: hostingWarningDetail(warning),
    });
  }

  for (const link of patch.related_plugin_links || []) {
    addCheck(checks, {
      name: `related link has campaign: ${link.target_plugin || "related plugin"}`,
      ok: Boolean(link.campaign) && snippet.text.includes(`utm_campaign=${link.campaign}`),
      detail: link.tracked_marketplace_url || "",
    });
  }

  const summary = summarizeChecks(checks);
  return {
    type: "owned_site_patch",
    plugin: patch.plugin,
    target: patch.site_url,
    campaign,
    confirmation: patch.confirmation,
    status: assetStatus(summary),
    primary_cta_url: patch.primary_cta_url,
    files: [index, snippet, links].map(fileSummary),
    checks,
    ...summary,
  };
}

async function assessUseCasePackage(item, confirmationQueue, actionRows) {
  const [html, copy, links] = await Promise.all([
    fileInfo(item.html_file),
    fileInfo(item.copy_file),
    fileInfo(item.links_file),
  ]);
  const checks = [];
  const campaign = item.campaign || campaignFrom(item.primary_cta_url);
  const directCreemLinks = countCreemLinks(`${html.text}\n${copy.text}\n${links.text}`);
  const hostingWarnings = openHostingWarningsForPlugin(actionRows, item.plugin);

  for (const info of [html, copy, links]) {
    addCheck(checks, {
      name: `${path.basename(info.file)} exists`,
      ok: info.exists && info.bytes > 0,
      detail: info.exists ? `${info.bytes} bytes, sha256 ${shortHash(info.sha256)}` : `missing file ${info.file}`,
    });
  }

  addCheck(checks, {
    name: "target URL is concrete",
    ok: isConcreteUrl(item.url),
    detail: item.url || "missing target URL",
  });
  addCheck(checks, {
    name: "canonical URL matches target",
    ok: html.text.includes(`<link rel="canonical" href="${item.url}">`),
    detail: item.url || "missing canonical target",
  });
  addCheck(checks, {
    name: "meta description exists",
    ok: /<meta\s+name="description"\s+content="/i.test(html.text),
    detail: item.html_file,
  });
  addCheck(checks, {
    name: "structured data exists",
    ok: html.text.includes('application/ld+json'),
    detail: item.html_file,
  });
  addCheck(checks, {
    name: "target keyword is present",
    ok: html.text.includes(item.target_keyword) && copy.text.includes(item.target_keyword),
    detail: item.target_keyword || "missing target keyword",
  });
  addCheck(checks, {
    name: "primary CTA is Framer Marketplace URL",
    ok: isMarketplaceUrl(item.primary_cta_url),
    detail: item.primary_cta_url || "missing primary CTA URL",
  });
  addCheck(checks, {
    name: "primary CTA campaign matches package",
    ok: Boolean(campaign) && campaignFrom(item.primary_cta_url) === campaign,
    detail: campaign || "missing utm_campaign",
  });
  addCheck(checks, {
    name: "HTML contains tracked primary CTA",
    ok: html.text.includes(item.primary_cta_url) && html.text.includes(`utm_campaign=${campaign}`),
    detail: item.html_file,
  });
  addCheck(checks, {
    name: "link file contains tracked primary CTA",
    ok: links.text.includes(item.primary_cta_url) && links.text.includes(`Campaign: ${campaign}`),
    detail: item.links_file,
  });
  addCheck(checks, {
    name: "record command is ready",
    ok: Boolean(item.record_command) && item.record_command.includes(campaign),
    detail: item.record_command || "missing record command",
  });
  addCheck(checks, {
    name: "generated package avoids direct Creem checkout",
    ok: directCreemLinks === 0,
    detail: directCreemLinks ? `${directCreemLinks} direct Creem payment link(s) found` : "no direct Creem checkout links found",
  });
  addCheck(checks, {
    name: "confirmation queue contains matching row",
    ok: confirmationExists(confirmationQueue, {
      confirmation: item.confirmation,
      plugin: item.plugin,
      kind: "use_case_page",
    }),
    detail: item.confirmation || "missing confirmation phrase",
  });
  for (const warning of hostingWarnings) {
    addCheck(checks, {
      name: "open hosting warning blocks publish",
      ok: false,
      detail: hostingWarningDetail(warning),
    });
  }

  const summary = summarizeChecks(checks);
  return {
    type: "use_case_page",
    plugin: item.plugin,
    target: item.url,
    campaign,
    confirmation: item.confirmation,
    status: assetStatus(summary),
    target_keyword: item.target_keyword,
    primary_cta_url: item.primary_cta_url,
    record_command: item.record_command,
    files: [html, copy, links].map(fileSummary),
    checks,
    ...summary,
  };
}

function blockedRows({ ownedSiteDropPatch, useCasePagePackages }) {
  return [
    ...(Array.isArray(ownedSiteDropPatch?.blocked) ? ownedSiteDropPatch.blocked : []).map((row) => ({
      type: "owned_site_patch",
      plugin: row.plugin,
      status: row.status,
      target: row.site_url,
      reason: row.next_local_step || row.blockers?.[0] || "",
    })),
    ...(Array.isArray(useCasePagePackages?.blocked) ? useCasePagePackages.blocked : []).map((row) => ({
      type: "use_case_page",
      plugin: row.plugin,
      status: row.status,
      target: row.url,
      reason: row.next_local_step || row.blockers?.[0] || "",
    })),
  ];
}

function reportStatus(assets) {
  if (!assets.length) return "no_publish_assets";
  if (assets.some((asset) => asset.status === "fail")) return "failed";
  if (assets.some((asset) => asset.status === "pass_with_warnings")) return "passed_with_warnings_confirmation_required";
  return "passed_confirmation_required";
}

function recommendationFor(report) {
  const failed = report.assets.find((asset) => asset.status === "fail");
  if (failed) return `Fix publish preflight errors for ${failed.plugin} ${failed.type} before asking for publish confirmation.`;
  const warned = report.assets.find((asset) => asset.status === "pass_with_warnings");
  if (warned) return `Publish assets pass tracking checks, but review warnings before scaling traffic; next external action still requires exact confirmation: ${warned.confirmation}.`;
  const first = report.assets[0];
  if (first) return `Publish assets pass local preflight; external publish still requires exact confirmation: ${first.confirmation}.`;
  return "No ready publish assets found; generate owned-site patches or use-case packages first.";
}

async function build({ ownedSiteDropPatch, useCasePagePackages, confirmationQueue, actionRows }) {
  const patchRows = Array.isArray(ownedSiteDropPatch?.patches) ? ownedSiteDropPatch.patches : [];
  const pageRows = Array.isArray(useCasePagePackages?.packages) ? useCasePagePackages.packages : [];
  const assets = [
    ...(await Promise.all(patchRows.map((patch) => assessOwnedPatch(patch, confirmationQueue, actionRows)))),
    ...(await Promise.all(pageRows.map((item) => assessUseCasePackage(item, confirmationQueue, actionRows)))),
  ];
  const report = {
    generated_at: new Date().toISOString(),
    status: reportStatus(assets),
    counts: {
      assets: assets.length,
      pass: assets.filter((asset) => asset.status === "pass").length,
      pass_with_warnings: assets.filter((asset) => asset.status === "pass_with_warnings").length,
      fail: assets.filter((asset) => asset.status === "fail").length,
      warnings: assets.reduce((sum, asset) => sum + asset.warnings.length, 0),
      errors: assets.reduce((sum, asset) => sum + asset.errors.length, 0),
      blocked_held: blockedRows({ ownedSiteDropPatch, useCasePagePackages }).length,
    },
    assets,
    blocked: blockedRows({ ownedSiteDropPatch, useCasePagePackages }),
    guardrails: [
      "This preflight only reads local files and writes local reports.",
      "It does not send Gmail, publish pages, submit forms, upload Marketplace files, deploy sites, or modify payment settings.",
      "Direct Creem links in full homepage previews are warnings because they may be inherited from the current site; confirm the corresponding store/domain before scaling traffic.",
      "Open hosting warnings in the action log block matching owned-site publish/deploy actions until the warning is resolved, closed, skipped, or otherwise recorded as done.",
      "External execution still requires the exact confirmation phrase shown for that asset.",
    ],
  };
  report.recommendation = recommendationFor(report);
  return report;
}

function renderMarkdown(report) {
  const lines = [
    "# Publish Preflight",
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
    `- Assets checked: ${report.counts.assets}`,
    `- Passed: ${report.counts.pass}`,
    `- Passed with warnings: ${report.counts.pass_with_warnings}`,
    `- Failed: ${report.counts.fail}`,
    `- Warnings: ${report.counts.warnings}`,
    `- Errors: ${report.counts.errors}`,
    `- Blocked/held: ${report.counts.blocked_held}`,
    "",
    "## Assets",
    "",
    "| Status | Type | Plugin | Target | Campaign | Confirmation |",
    "|---|---|---|---|---|---|",
  ];
  for (const asset of report.assets) {
    lines.push(`| ${clean(asset.status)} | ${clean(asset.type)} | ${clean(asset.plugin)} | ${clean(asset.target)} | ${clean(asset.campaign)} | ${clean(asset.confirmation)} |`);
  }
  if (!report.assets.length) lines.push("| none |  |  |  |  |  |");

  lines.push("", "## Findings", "", "| Level | Plugin | Type | Finding |", "|---|---|---|---|");
  for (const asset of report.assets) {
    for (const finding of asset.errors) lines.push(`| error | ${clean(asset.plugin)} | ${clean(asset.type)} | ${clean(finding)} |`);
    for (const finding of asset.warnings) lines.push(`| warning | ${clean(asset.plugin)} | ${clean(asset.type)} | ${clean(finding)} |`);
  }
  if (!report.assets.some((asset) => asset.errors.length || asset.warnings.length)) lines.push("| none |  |  |  |");

  lines.push("", "## Files", "", "| Plugin | Type | File | Bytes | SHA-256 |", "|---|---|---|---:|---|");
  for (const asset of report.assets) {
    for (const file of asset.files) {
      lines.push(`| ${clean(asset.plugin)} | ${clean(asset.type)} | ${clean(file.file)} | ${file.bytes || 0} | ${shortHash(file.sha256)} |`);
    }
  }
  if (!report.assets.length) lines.push("| none |  |  |  |  |");

  lines.push("", "## Blocked / Held", "", "| Type | Plugin | Status | Target | Reason |", "|---|---|---|---|---|");
  for (const row of report.blocked) {
    lines.push(`| ${clean(row.type)} | ${clean(row.plugin)} | ${clean(row.status)} | ${clean(row.target)} | ${clean(row.reason)} |`);
  }
  if (!report.blocked.length) lines.push("| none |  |  |  |  |");

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
  const [ownedSiteDropPatch, useCasePagePackages, confirmationQueue, actionRows] = await Promise.all([
    readJson(args.ownedSiteDropPatch, null),
    readJson(args.useCasePagePackages, null),
    readJson(args.confirmations, null),
    readRows(args.actions),
  ]);
  const report = await build({ ownedSiteDropPatch, useCasePagePackages, confirmationQueue, actionRows });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Publish preflight: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
