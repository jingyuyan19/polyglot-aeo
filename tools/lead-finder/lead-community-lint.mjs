#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_KIT = ".tmp/framer-community-feed-kit.json";
const DEFAULT_OUTPUT = ".tmp/framer-community-lint.md";
const DEFAULT_JSON = ".tmp/framer-community-lint.json";
const REQUIRED_UTM_SOURCE = "framer_community_feed";
const REQUIRED_UTM_MEDIUM = "community_post";
const RISKY_PATTERNS = [
  /\bguarantee(?:d|s)?\b/i,
  /\brank(?:ing)?s?\b/i,
  /\bget cited\b/i,
  /\bcitations?\b/i,
  /\bofficial(?:ly)? endorsed\b/i,
  /\bpartner(?:ed)? with Framer\b/i,
];

function usage() {
  return `
Usage:
  pnpm lead:community-lint

Options:
  --kit <file>       Community kit JSON. Default: ${DEFAULT_KIT}
  --output <file>    Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>      JSON output. Default: ${DEFAULT_JSON}
  --skip-fetch       Skip remote link status checks.
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    kit: DEFAULT_KIT,
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
    if (key === "--kit") {
      args.kit = value;
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
    if (key === "--skip-fetch") {
      args.skipFetch = true;
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

async function readJson(file, fallback) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

function extractUrls(text) {
  return Array.from(String(text).matchAll(/https?:\/\/[^\s)]+/g), (match) =>
    match[0].replace(/[.,;]+$/, ""),
  );
}

async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function lintPost(post) {
  const issues = [];
  const warnings = [];
  const urls = extractUrls(post.body);
  const firstLine = String(post.body || "").trim().split(/\r?\n/)[0] || "";
  const visual = post.visual_asset || {};
  const visualPath = visual.file ? path.resolve(visual.file) : "";

  if (!firstLine.includes("?")) {
    warnings.push("Opening line is not question-first.");
  }
  if (!visual.file) {
    issues.push("Post has no visual_asset file.");
  } else if (!(await fileExists(visual.file))) {
    issues.push(`Visual asset missing: ${visual.file}`);
  }
  if (!visual.alt || String(visual.alt).trim().length < 24) {
    warnings.push("Visual asset alt text is missing or too short.");
  }
  if (!visual.caption || String(visual.caption).trim().length < 24) {
    warnings.push("Visual asset caption is missing or too short.");
  }
  if (urls.length === 0) {
    issues.push("Post has no link.");
  }
  if (post.primary_link === "marketplace") {
    const firstUrl = urls[0] ? new URL(urls[0]) : null;
    const marketplaceFirst =
      firstUrl?.hostname === "www.framer.com" &&
      firstUrl.pathname.includes("/community/marketplace/plugins/");
    if (!marketplaceFirst) {
      issues.push("Post primary_link is marketplace, but the first URL is not a Framer Marketplace plugin URL.");
    }
  }
  for (const url of urls) {
    const parsed = new URL(url);
    if (parsed.hostname === "polyglotaeo.com") {
      if (parsed.searchParams.get("utm_source") !== REQUIRED_UTM_SOURCE) {
        issues.push(`Missing required utm_source on ${url}`);
      }
      if (parsed.searchParams.get("utm_medium") !== REQUIRED_UTM_MEDIUM) {
        issues.push(`Missing required utm_medium on ${url}`);
      }
      if (!parsed.searchParams.get("utm_campaign")) {
        issues.push(`Missing utm_campaign on ${url}`);
      }
    }
  }
  for (const pattern of RISKY_PATTERNS) {
    if (pattern.test(post.body)) {
      issues.push(`Risky claim pattern: ${pattern}`);
    }
  }
  if (post.body.length > 1400) {
    warnings.push(`Post is long for a Community feed item (${post.body.length} chars).`);
  }
  if (post.body.includes("Polyglot AEO") && Number(post.priority) === 1) {
    warnings.push("Priority 1 mentions the product name; keep first post checklist-led unless intentional.");
  }

  return {
    priority: post.priority,
    title: post.title,
    campaign: post.campaign,
    primary_link: post.primary_link || "",
    body_chars: post.body.length,
    visual_asset: visual.file || "",
    visual_asset_absolute: visualPath,
    urls,
    issues,
    warnings,
    status: issues.length ? "fail" : warnings.length ? "warn" : "pass",
  };
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "PolyglotAEOLeadLint/1.0",
      },
    });
    return {
      url,
      status: response.status,
      ok: response.status >= 200 && response.status < 400,
      final_url: response.url,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      error: error?.name === "AbortError" ? "timeout" : error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function assess(kit, args) {
  const posts = Array.isArray(kit.posts) ? kit.posts : [];
  const rows = await Promise.all(posts.map(lintPost));
  const urlSet = new Set();
  for (const row of rows) {
    for (const url of row.urls) urlSet.add(url);
  }
  const linkChecks = args.skipFetch
    ? []
    : await Promise.all(Array.from(urlSet).map(checkUrl));
  const linkFailures = linkChecks.filter((row) => !row.ok);
  const failedPosts = rows.filter((row) => row.issues.length);
  const warnedPosts = rows.filter((row) => row.warnings.length);
  const status = failedPosts.length || linkFailures.length ? "fail" : warnedPosts.length ? "warn" : "pass";

  return {
    generated_at: new Date().toISOString(),
    kit: args.kit,
    status,
    posts: rows,
    link_checks: linkChecks,
    summary: {
      posts: posts.length,
      failed_posts: failedPosts.length,
      warned_posts: warnedPosts.length,
      links_checked: linkChecks.length,
      link_failures: linkFailures.length,
    },
    recommendation: recommendation({ status, failedPosts, warnedPosts, linkFailures }),
  };
}

function recommendation({ status, failedPosts, warnedPosts, linkFailures }) {
  if (status === "pass") {
    return "Community post kit is publish-ready from a copy, UTM, and link-health perspective.";
  }
  if (failedPosts.length || linkFailures.length) {
    return "Fix failed copy/link checks before publishing the Community post.";
  }
  return "Warnings only. Review the tone, then publish priority 1 if the warnings are intentional.";
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Community Lint",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Summary",
    "",
    `- Posts: ${report.summary.posts}`,
    `- Failed posts: ${report.summary.failed_posts}`,
    `- Warned posts: ${report.summary.warned_posts}`,
    `- Links checked: ${report.summary.links_checked}`,
    `- Link failures: ${report.summary.link_failures}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Posts",
    "",
    "| Priority | Post | Campaign | Primary link | Visual | Chars | Status | Issues | Warnings |",
    "|---:|---|---|---|---|---:|---|---|---|",
  ];

  for (const row of report.posts) {
    lines.push(
      `| ${row.priority} | ${row.title} | ${row.campaign} | ${row.primary_link || ""} | ${row.visual_asset || ""} | ${row.body_chars} | ${row.status} | ${joinCell(row.issues)} | ${joinCell(row.warnings)} |`,
    );
  }

  lines.push("", "## Link Checks", "");
  if (!report.link_checks.length) {
    lines.push("Skipped.");
  } else {
    lines.push("| URL | Status | Result |");
    lines.push("|---|---:|---|");
    for (const row of report.link_checks) {
      lines.push(`| ${row.url} | ${row.status || ""} | ${row.ok ? "ok" : row.error || "failed"} |`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function joinCell(items) {
  if (!items.length) return "";
  return items.join("<br>").replace(/\|/g, "/");
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

  const kit = await readJson(args.kit, { posts: [] });
  const report = await assess(kit, args);
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Community lint: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  if (report.status === "fail") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
