#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_IMPLEMENTATION = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_OUTPUT = ".tmp/framer-owned-site-drop-patches.md";
const DEFAULT_JSON = ".tmp/framer-owned-site-drop-patches.json";
const DEFAULT_OUT_DIR = ".tmp/framer-owned-site-drop-patches";

function usage() {
  return `
Usage:
  pnpm lead:owned-site-drop-patch

Options:
  --implementation <file>  Owned-site implementation JSON. Default: ${DEFAULT_IMPLEMENTATION}
  --output <file>          Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>            JSON output. Default: ${DEFAULT_JSON}
  --out-dir <dir>          Local patch output directory. Default: ${DEFAULT_OUT_DIR}
  --help                   Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    implementation: DEFAULT_IMPLEMENTATION,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    outDir: DEFAULT_OUT_DIR,
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
      "--implementation": "implementation",
      "--output": "output",
      "--json": "json",
      "--out-dir": "outDir",
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

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "plugin";
}

function readyForPatch(item) {
  return item?.status === "ready_confirmation_required" || item?.status === "ready_record_after_confirmation";
}

async function fetchHtml(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) {
    return { ok: false, status: 0, html: "", error: "missing site URL" };
  }
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "FramerOwnedSitePatchPreview/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await response.text();
    return { ok: response.ok, status: response.status, html, error: "" };
  } catch (error) {
    return { ok: false, status: 0, html: "", error: error?.message || String(error) };
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(value) {
  const text = String(value || "");
  if (!/^https?:\/\//i.test(text)) return "#";
  return text.replace(/"/g, "%22");
}

function ctaSection(item) {
  const related = Array.isArray(item.related_plugin_links) ? item.related_plugin_links.slice(0, 1) : [];
  const relatedHtml = related.length
    ? related.map((link) => `
      <p class="fgp-related-copy">${escapeHtml(link.copy)}</p>
      <a class="fgp-secondary-link" href="${safeUrl(link.tracked_marketplace_url)}" target="_blank" rel="noopener">${escapeHtml(link.link_label || `Open ${link.target_plugin}`)}</a>`).join("\n")
    : "";
  return `
<!-- Framer plugin growth CTA patch: generated locally; deploy only after explicit confirmation. -->
<section id="framer-plugin-growth-cta" class="fgp-growth-cta" data-plugin="${escapeHtml(item.plugin)}" data-campaign="${escapeHtml(campaignFrom(item.primary_cta_url))}">
  <div class="fgp-growth-cta__inner">
    <p class="fgp-kicker">Framer plugin</p>
    <h2>${escapeHtml(item.headline || item.plugin)}</h2>
    <p>${escapeHtml(item.primary_cta_copy || item.expected_benefit || "")}</p>
    <div class="fgp-actions">
      <a class="fgp-primary-link" href="${safeUrl(item.primary_cta_url)}" target="_blank" rel="noopener">${escapeHtml(item.primary_cta_label || `Get ${item.plugin}`)}</a>
      ${relatedHtml}
    </div>
  </div>
</section>
<!-- End Framer plugin growth CTA patch. -->`;
}

function campaignFrom(url) {
  try {
    return new URL(url).searchParams.get("utm_campaign") || "";
  } catch {
    return "";
  }
}

function patchStyles() {
  return `
<style id="framer-plugin-growth-cta-styles">
  .fgp-growth-cta {
    box-sizing: border-box;
    width: min(100% - 32px, 980px);
    margin: 48px auto;
    padding: 28px;
    border: 1px solid rgba(24, 24, 27, 0.14);
    border-radius: 8px;
    background: #ffffff;
    color: #18181b;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .fgp-growth-cta__inner {
    display: grid;
    gap: 12px;
  }
  .fgp-growth-cta h2 {
    margin: 0;
    font-size: clamp(24px, 4vw, 36px);
    line-height: 1.1;
    letter-spacing: 0;
  }
  .fgp-growth-cta p {
    margin: 0;
    max-width: 680px;
    color: #52525b;
    font-size: 16px;
    line-height: 1.55;
  }
  .fgp-kicker {
    font-size: 13px !important;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #2563eb !important;
  }
  .fgp-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }
  .fgp-primary-link,
  .fgp-secondary-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 16px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 700;
    line-height: 1;
  }
  .fgp-primary-link {
    background: #18181b;
    color: #ffffff;
  }
  .fgp-secondary-link {
    border: 1px solid rgba(24, 24, 27, 0.18);
    color: #18181b;
  }
  .fgp-related-copy {
    flex-basis: 100%;
    font-size: 14px !important;
  }
</style>`;
}

function fallbackHtml(item) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(item.plugin)} tracked CTA preview</title>
  ${patchStyles()}
</head>
<body>
  ${ctaSection(item)}
</body>
</html>
`;
}

function injectIntoHtml(html, item) {
  const section = ctaSection(item);
  const style = patchStyles();
  let output = String(html || "");
  if (!output.trim()) return fallbackHtml(item);
  if (/<\/head>/i.test(output)) output = output.replace(/<\/head>/i, `${style}\n</head>`);
  else output = `${style}\n${output}`;
  if (/<\/body>/i.test(output)) output = output.replace(/<\/body>/i, `${section}\n</body>`);
  else output = `${output}\n${section}`;
  return output;
}

function textSnippet(item) {
  const related = Array.isArray(item.related_plugin_links) ? item.related_plugin_links[0] : null;
  return [
    `${item.primary_cta_label || `Get ${item.plugin}`}: ${item.primary_cta_url}`,
    related ? `${related.link_label || related.target_plugin}: ${related.tracked_marketplace_url}` : "",
  ].filter(Boolean).join("\n");
}

async function buildPatch({ args, item }) {
  const itemSlug = slug(item.plugin);
  const dir = path.join(args.outDir, itemSlug);
  const fetched = await fetchHtml(item.site_url);
  const html = injectIntoHtml(fetched.html, item);
  const indexFile = path.join(dir, "index.html");
  const snippetFile = path.join(dir, "tracked-cta-snippet.html");
  const textFile = path.join(dir, "tracked-links.txt");
  await Promise.all([
    writeText(indexFile, html),
    writeText(snippetFile, `${patchStyles()}\n${ctaSection(item)}\n`),
    writeText(textFile, `${textSnippet(item)}\n`),
  ]);
  return {
    plugin: item.plugin,
    status: "local_patch_ready_confirmation_required",
    site_url: item.site_url,
    confirmation: item.confirmation,
    fetched_status: fetched.status,
    fetched_ok: fetched.ok,
    fetched_error: fetched.error,
    index_file: indexFile,
    snippet_file: snippetFile,
    text_file: textFile,
    primary_cta_url: item.primary_cta_url,
    related_plugin_links: item.related_plugin_links || [],
    verification_commands: [
      `rg 'utm_campaign=${campaignFrom(item.primary_cta_url)}' '${indexFile}'`,
      `open '${indexFile}'`,
      "pnpm lead:owned-sites",
      "pnpm lead:owned-site-cta",
      "pnpm lead:portfolio-ops -- --skip-signals",
    ],
  };
}

async function build(args, implementation) {
  const items = Array.isArray(implementation?.items) ? implementation.items : [];
  const ready = items.filter(readyForPatch);
  const blocked = items.filter((item) => /^blocked/.test(String(item.status || "")));
  const patches = [];
  for (const item of ready) patches.push(await buildPatch({ args, item }));
  const report = {
    generated_at: new Date().toISOString(),
    status: patches.length ? "ready_confirmation_required" : "no_ready_owned_site_patch",
    recommendation: patches.length
      ? `Local owned-site patch package is ready for ${patches[0].plugin}; deploy only after exact confirmation: ${patches[0].confirmation}.`
      : "No owned-site patch package is ready; resolve blockers or refresh owned-site implementation brief.",
    counts: {
      ready_patches: patches.length,
      blocked_held: blocked.length,
    },
    patches,
    blocked: blocked.map((item) => ({
      plugin: item.plugin,
      status: item.status,
      site_url: item.site_url,
      blockers: item.blockers || [],
      next_local_step: item.next_local_step,
    })),
    guardrails: [
      "This script only writes local preview/patch files.",
      "Do not deploy, upload, or replace any live site without the exact confirmation phrase.",
      "After a confirmed deploy, rerun owned-site audit and record action-log evidence.",
    ],
  };
  return report;
}

function renderMarkdown(report) {
  const lines = [
    "# Owned Site Drop Patch Pack",
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
    `- Ready local patch packages: ${report.counts.ready_patches}`,
    `- Blocked/held packages: ${report.counts.blocked_held}`,
    "",
    "## Ready Patch Packages",
    "",
    "| Plugin | Site | Patch file | Snippet | Confirmation |",
    "|---|---|---|---|---|",
  ];
  for (const patch of report.patches) {
    lines.push(`| ${clean(patch.plugin)} | ${clean(patch.site_url)} | ${clean(patch.index_file)} | ${clean(patch.snippet_file)} | ${clean(patch.confirmation)} |`);
  }
  if (!report.patches.length) lines.push("| none |  |  |  |  |");

  lines.push("", "## Verification Commands", "");
  for (const patch of report.patches) {
    lines.push(`### ${patch.plugin}`, "", "```bash");
    for (const command of patch.verification_commands) lines.push(command);
    lines.push("```", "");
  }

  lines.push("## Blocked / Held", "", "| Plugin | Status | Site | Next local step |", "|---|---|---|---|");
  for (const item of report.blocked) {
    lines.push(`| ${clean(item.plugin)} | ${clean(item.status)} | ${clean(item.site_url)} | ${clean(item.next_local_step)} |`);
  }
  if (!report.blocked.length) lines.push("| none |  |  |  |");

  lines.push("", "## Guardrails", "");
  for (const guardrail of report.guardrails) lines.push(`- ${guardrail}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const implementation = await readJson(args.implementation, null);
  const report = await build(args, implementation);
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Owned-site drop patch pack: ${args.output}\n`);
  process.stdout.write(`Status: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
