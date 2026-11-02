#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BRIEF = ".tmp/framer-use-case-page-brief.json";
const DEFAULT_OUTPUT = ".tmp/framer-use-case-page-packages.md";
const DEFAULT_JSON = ".tmp/framer-use-case-page-packages.json";
const DEFAULT_OUT_DIR = ".tmp/framer-use-case-page-packages";

function usage() {
  return `
Usage:
  pnpm lead:use-case-page-package

Options:
  --brief <file>     Use-case page brief JSON. Default: ${DEFAULT_BRIEF}
  --output <file>    Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>      JSON output. Default: ${DEFAULT_JSON}
  --out-dir <dir>    Local package output directory. Default: ${DEFAULT_OUT_DIR}
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    brief: DEFAULT_BRIEF,
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
      "--brief": "brief",
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

function readyForPackage(item) {
  return item?.status === "ready_confirmation_required" || item?.status === "ready_local_copy";
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

function short(value, limit = 155) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}.`;
}

function campaignFrom(url) {
  try {
    return new URL(url).searchParams.get("utm_campaign") || "";
  } catch {
    return "";
  }
}

function firstSentence(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.match(/^(.+?[.!?])\s/)?.[1] || text;
}

function sectionCopy(section, item) {
  const heading = section.h2 || "Workflow";
  const angle = section.angle || "";
  if (/^Problem$/i.test(heading)) {
    return `${firstSentence(angle)} This page turns that risk into a short Framer workflow you can run before a client handoff.`;
  }
  if (/^Workflow$/i.test(heading)) {
    return `${firstSentence(angle)} Keep the workflow small: inspect the current page, fix the highest-risk issue, then record the proof before you scale the channel.`;
  }
  if (/^CTA$/i.test(heading)) {
    return `${firstSentence(angle)} The tracked install link below points to the Framer Marketplace so installs can be reviewed against this page.`;
  }
  if (/Install and measure/i.test(heading)) {
    return `Use the tracked Framer Marketplace CTA with campaign ${item.campaign}. Review same-day, 24h, 48h, 72h, and 7d signals before changing the hook or expanding distribution.`;
  }
  return angle;
}

function relatedBlock(item) {
  const related = Array.isArray(item.related_links) ? item.related_links.slice(0, 1) : [];
  if (!related.length) return "";
  return related.map((link) => `
      <aside class="uc-related">
        <p class="uc-kicker">Related Framer workflow</p>
        <h2>${escapeHtml(link.target_plugin || "Related plugin")}</h2>
        <p>${escapeHtml(link.copy || "")}</p>
        <a class="uc-secondary" href="${safeUrl(link.tracked_marketplace_url)}" target="_blank" rel="noopener">${escapeHtml(link.link_label || `Open ${link.target_plugin || "plugin"}`)}</a>
      </aside>`).join("\n");
}

function schemaJson(item) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: item.title,
    description: item.meta_description,
    url: item.url,
    about: item.target_keyword,
    author: {
      "@type": "Person",
      name: "Jimmy Jing",
    },
    mainEntity: {
      "@type": "SoftwareApplication",
      name: item.plugin,
      applicationCategory: "DesignApplication",
      operatingSystem: "Web",
      url: item.marketplace_url,
    },
  };
  return JSON.stringify(schema, null, 2).replace(/</g, "\\u003c");
}

function htmlPage(item) {
  const sections = Array.isArray(item.sections) ? item.sections : [];
  const sectionsHtml = sections
    .filter((section) => section.h2 && section.angle)
    .map((section) => `
      <section class="uc-section">
        <h2>${escapeHtml(section.h2)}</h2>
        <p>${escapeHtml(sectionCopy(section, item))}</p>
      </section>`)
    .join("\n");
  const checklist = (item.acceptance_criteria || [])
    .map((criterion) => `<li>${escapeHtml(criterion)}</li>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(item.title)}</title>
  <meta name="description" content="${escapeHtml(short(item.meta_description))}">
  <link rel="canonical" href="${safeUrl(item.url)}">
  <meta property="og:title" content="${escapeHtml(item.title)}">
  <meta property="og:description" content="${escapeHtml(short(item.meta_description))}">
  <meta property="og:url" content="${safeUrl(item.url)}">
  <script type="application/ld+json">${schemaJson(item)}</script>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #18181b;
      background: #f7f7f4;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f7f4; }
    a { color: inherit; }
    .uc-page { min-height: 100vh; }
    .uc-hero {
      padding: 56px 20px 36px;
      background: #ffffff;
      border-bottom: 1px solid rgba(24, 24, 27, 0.1);
    }
    .uc-inner {
      width: min(100% - 32px, 980px);
      margin: 0 auto;
    }
    .uc-kicker {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #1d4ed8;
    }
    h1 {
      max-width: 820px;
      margin: 0;
      font-size: clamp(34px, 7vw, 64px);
      line-height: 0.98;
      letter-spacing: 0;
    }
    .uc-lede {
      max-width: 720px;
      margin: 22px 0 0;
      color: #52525b;
      font-size: 19px;
      line-height: 1.55;
    }
    .uc-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }
    .uc-primary,
    .uc-secondary {
      display: inline-flex;
      min-height: 44px;
      align-items: center;
      justify-content: center;
      padding: 0 18px;
      border-radius: 8px;
      font-weight: 800;
      text-decoration: none;
    }
    .uc-primary {
      background: #18181b;
      color: #ffffff;
    }
    .uc-secondary {
      border: 1px solid rgba(24, 24, 27, 0.18);
      color: #18181b;
      background: #ffffff;
    }
    .uc-content {
      padding: 36px 20px 64px;
    }
    .uc-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
    .uc-section,
    .uc-related,
    .uc-checklist {
      border: 1px solid rgba(24, 24, 27, 0.1);
      border-radius: 8px;
      background: #ffffff;
      padding: 24px;
    }
    .uc-section h2,
    .uc-related h2,
    .uc-checklist h2 {
      margin: 0;
      font-size: 24px;
      line-height: 1.15;
      letter-spacing: 0;
    }
    .uc-section p,
    .uc-related p {
      margin: 12px 0 0;
      color: #52525b;
      font-size: 16px;
      line-height: 1.6;
    }
    .uc-checklist ul {
      margin: 16px 0 0;
      padding-left: 20px;
      color: #52525b;
      line-height: 1.7;
    }
    .uc-related {
      background: #eff6ff;
      border-color: rgba(29, 78, 216, 0.18);
    }
    .uc-related .uc-secondary {
      margin-top: 16px;
      background: #ffffff;
    }
    .uc-footnote {
      margin: 24px 0 0;
      color: #71717a;
      font-size: 13px;
      line-height: 1.5;
    }
    @media (min-width: 760px) {
      .uc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .uc-section:first-child,
      .uc-checklist,
      .uc-related { grid-column: 1 / -1; }
    }
  </style>
</head>
<body>
  <!-- Local package generated by lead-use-case-page-package. Publish only after explicit confirmation. -->
  <main class="uc-page" data-plugin="${escapeHtml(item.plugin)}" data-campaign="${escapeHtml(item.campaign)}">
    <header class="uc-hero">
      <div class="uc-inner">
        <p class="uc-kicker">${escapeHtml(item.target_keyword)}</p>
        <h1>${escapeHtml(item.h1)}</h1>
        <p class="uc-lede">${escapeHtml(short(item.meta_description, 220))}</p>
        <div class="uc-actions">
          <a class="uc-primary" href="${safeUrl(item.primary_cta_url)}" target="_blank" rel="noopener">${escapeHtml(item.primary_cta_label || `Get ${item.plugin}`)}</a>
          <a class="uc-secondary" href="${safeUrl(item.marketplace_url)}" target="_blank" rel="noopener">View Marketplace listing</a>
        </div>
      </div>
    </header>
    <div class="uc-content">
      <div class="uc-inner uc-grid">
        ${sectionsHtml}
        ${relatedBlock(item)}
        <section class="uc-checklist">
          <h2>Publish checklist</h2>
          <ul>
            ${checklist}
          </ul>
          <p class="uc-footnote">External publish requires exact confirmation: ${escapeHtml(item.confirmation)}. After publish, record evidence with the command in page-copy.md.</p>
        </section>
      </div>
    </div>
  </main>
</body>
</html>
`;
}

function markdownCopy(item) {
  const lines = [
    `# ${item.title}`,
    "",
    `- Plugin: ${item.plugin}`,
    `- Target URL: ${item.url}`,
    `- Target keyword: ${item.target_keyword}`,
    `- Campaign: ${item.campaign}`,
    `- Confirmation: ${item.confirmation}`,
    `- Primary CTA: ${item.primary_cta_label} -> ${item.primary_cta_url}`,
    "",
    "## H1",
    "",
    item.h1,
    "",
    "## Meta Description",
    "",
    short(item.meta_description),
    "",
    "## Sections",
    "",
  ];
  for (const section of item.sections || []) {
    lines.push(`### ${section.h2}`, "", sectionCopy(section, item), "");
  }
  if (item.related_links?.length) {
    lines.push("## Related Plugin Link", "");
    for (const link of item.related_links.slice(0, 1)) {
      lines.push(`- ${link.link_label || link.target_plugin}: ${link.tracked_marketplace_url}`);
      if (link.copy) lines.push(`- Copy: ${link.copy}`);
    }
    lines.push("");
  }
  lines.push(
    "## Verification",
    "",
    ...((item.verification_commands || []).map((command) => `- \`${command}\``)),
    "",
    "## Record After Confirmed Publish",
    "",
    "```bash",
    item.record_command || "# Record command appears only for ready confirmation rows.",
    "```",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function trackedLinks(item) {
  const lines = [
    `${item.primary_cta_label || `Get ${item.plugin}`}: ${item.primary_cta_url}`,
    `Campaign: ${item.campaign || campaignFrom(item.primary_cta_url)}`,
  ];
  for (const link of item.related_links || []) {
    lines.push(`${link.link_label || link.target_plugin}: ${link.tracked_marketplace_url}`);
  }
  return `${lines.join("\n")}\n`;
}

async function writePackage(args, item) {
  const itemSlug = slug(item.plugin);
  const dir = path.join(args.outDir, itemSlug);
  const files = {
    html_file: path.join(dir, "index.html"),
    copy_file: path.join(dir, "page-copy.md"),
    links_file: path.join(dir, "tracked-links.txt"),
  };
  await Promise.all([
    writeText(files.html_file, htmlPage(item)),
    writeText(files.copy_file, markdownCopy(item)),
    writeText(files.links_file, trackedLinks(item)),
  ]);
  return {
    plugin: item.plugin,
    status: "local_page_package_ready_confirmation_required",
    url: item.url,
    confirmation: item.confirmation,
    campaign: item.campaign,
    target_keyword: item.target_keyword,
    primary_cta_url: item.primary_cta_url,
    ...files,
    record_command: item.record_command,
    verification_commands: [
      `rg ${shellQuote(item.target_keyword)} ${shellQuote(files.html_file)}`,
      `rg ${shellQuote(`utm_campaign=${item.campaign}`)} ${shellQuote(files.html_file)}`,
      `open ${shellQuote(files.html_file)}`,
      "pnpm lead:use-case-page-package",
      "pnpm lead:portfolio-ops -- --skip-signals",
    ],
  };
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function buildBlocked(item) {
  return {
    plugin: item.plugin,
    status: item.status || "blocked",
    url: item.url || "",
    confirmation: item.confirmation || "",
    blockers: item.blockers || [],
    next_local_step: item.next_local_step || "",
  };
}

async function buildReport(args, brief) {
  const items = Array.isArray(brief?.items) ? brief.items : [];
  const readyItems = items.filter(readyForPackage);
  const blocked = items.filter((item) => !readyForPackage(item)).map(buildBlocked);
  const packages = [];
  for (const item of readyItems) {
    packages.push(await writePackage(args, item));
  }
  const firstReady = packages[0];
  return {
    generated_at: new Date().toISOString(),
    status: packages.length ? "ready_confirmation_required" : "no_ready_use_case_pages",
    recommendation: firstReady
      ? `Local use-case page package is ready for ${firstReady.plugin}; publish only after exact confirmation: ${firstReady.confirmation}.`
      : "No use-case page package is ready; resolve checkout/compliance gates or refresh the use-case brief.",
    counts: {
      ready_packages: packages.length,
      blocked_held: blocked.length,
    },
    packages,
    blocked,
    guardrails: [
      "This script only writes local HTML/copy/link packages.",
      "Do not deploy, upload, or replace any live site without the exact confirmation phrase.",
      "No direct Creem checkout links are added; primary CTAs point to Framer Marketplace URLs with UTM params.",
      "After a confirmed publish, rerun owned-site audits and record action-log evidence.",
    ],
  };
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function renderMarkdown(report) {
  const lines = [
    "# Use-Case Page Packages",
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
    `- Ready local page packages: ${report.counts.ready_packages}`,
    `- Blocked/held pages: ${report.counts.blocked_held}`,
    "",
    "## Ready Packages",
    "",
    "| Plugin | Target URL | HTML | Copy | Links | Confirmation |",
    "|---|---|---|---|---|---|",
  ];
  for (const item of report.packages) {
    lines.push(`| ${clean(item.plugin)} | ${clean(item.url)} | ${clean(item.html_file)} | ${clean(item.copy_file)} | ${clean(item.links_file)} | ${clean(item.confirmation)} |`);
  }
  if (!report.packages.length) lines.push("| - | - | - | - | - | - |");

  lines.push("", "## Verification Commands", "");
  for (const item of report.packages) {
    lines.push(`### ${item.plugin}`, "", "```bash", ...item.verification_commands, "```", "");
  }

  lines.push("## Blocked / Held", "", "| Plugin | Status | Target URL | Next local step |", "|---|---|---|---|");
  for (const item of report.blocked) {
    lines.push(`| ${clean(item.plugin)} | ${clean(item.status)} | ${clean(item.url)} | ${clean(item.next_local_step || item.blockers?.[0] || "")} |`);
  }
  if (!report.blocked.length) lines.push("| - | - | - | - |");

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
  const brief = await readJson(args.brief, null);
  if (!brief) throw new Error(`Missing use-case page brief: ${args.brief}`);
  const report = await buildReport(args, brief);
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Use-case page packages: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
