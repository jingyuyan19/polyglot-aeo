#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_AUDIT = ".tmp/framer-owned-site-audit.json";
const DEFAULT_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_OUTPUT = ".tmp/framer-owned-site-cta-kit.md";
const DEFAULT_JSON = ".tmp/framer-owned-site-cta-kit.json";

const COPY = {
  "Ally Auditor": {
    label: "Get Ally Auditor",
    secondary_label: "View on Framer Marketplace",
    headline: "Ship accessible Framer sites with confidence.",
    supporting_copy: "Audit your Framer site for WCAG issues before client handoff.",
    placement: "Hero primary CTA, pricing/install block, and footer Marketplace link.",
  },
  "Gaode Maps": {
    label: "Get Gaode Maps",
    secondary_label: "View on Framer Marketplace",
    headline: "Add Gaode maps to Framer without custom code.",
    supporting_copy: "Embed a Gaode/AMap-powered map on a Framer site in minutes.",
    placement: "Hero primary CTA, feature comparison block, and tutorial ending CTA.",
  },
  "Loka - Localization Hub": {
    label: "Get Loka Pro",
    secondary_label: "View on Framer Marketplace",
    headline: "Translate your Framer site in minutes.",
    supporting_copy: "Use Sheets-powered localization to ship multilingual Framer pages.",
    placement: "Prepare copy only until Creem names the exact origin/referrer.",
  },
  "Polyglot AEO": {
    label: "Get Polyglot AEO",
    secondary_label: "View on Framer Marketplace",
    headline: "Make Framer pages ready for multilingual AEO.",
    supporting_copy: "Check structured data and answer-engine readiness before handoff.",
    placement: "Prepare copy only until checkout-origin and tracking gates are healthy.",
  },
};

function usage() {
  return `
Usage:
  pnpm lead:owned-site-cta

Options:
  --audit <file>     Owned site audit JSON. Default: ${DEFAULT_AUDIT}
  --baseline <file>  Landing baseline JSON. Default: ${DEFAULT_BASELINE}
  --output <file>    Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>      JSON output. Default: ${DEFAULT_JSON}
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    audit: DEFAULT_AUDIT,
    baseline: DEFAULT_BASELINE,
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
      "--audit": "audit",
      "--baseline": "baseline",
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

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function samePlugin(left, right) {
  const a = slug(left).replace(/-localization-hub$/, "").replace(/-assistant$/, "");
  const b = slug(right).replace(/-localization-hub$/, "").replace(/-assistant$/, "");
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function baselineFor(plugin, baseline) {
  const rows = Array.isArray(baseline?.rows) ? baseline.rows : [];
  return rows.find((row) => samePlugin(row.plugin, plugin)) || null;
}

function copyFor(plugin) {
  return COPY[plugin] || {
    label: `Get ${plugin}`,
    secondary_label: "View on Framer Marketplace",
    headline: plugin,
    supporting_copy: "Install the plugin from Framer Marketplace.",
    placement: "Hero primary CTA and install section CTA.",
  };
}

function statusFor(item, trackedUrl) {
  if (item.readiness === "blocked" || item.blockers?.length) return "blocked_prepare_only";
  if (!trackedUrl) return "missing_tracked_marketplace_url";
  if (item.readiness === "ready_for_recording") return "already_tracked_record_after_confirmation";
  if (item.readiness === "needs_cta_tracking") return "ready_site_update_confirmation_required";
  return "needs_page_work";
}

function priorityFor(status, plugin) {
  if (status === "ready_site_update_confirmation_required") {
    if (plugin === "Ally Auditor") return 1;
    if (plugin === "Gaode Maps") return 2;
    return 3;
  }
  if (status === "already_tracked_record_after_confirmation") return 4;
  if (status === "needs_page_work") return 5;
  if (status === "missing_tracked_marketplace_url") return 6;
  return 9;
}

function expectedCampaignFromUrl(url) {
  try {
    return new URL(url).searchParams.get("utm_campaign") || "";
  } catch {
    const match = String(url || "").match(/[?&]utm_campaign=([^&#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function recordCommand({ item, baseline, trackedUrl, campaign }) {
  return [
    "pnpm lead:actions -- --add",
    "--type owned_site_cta",
    "--channel owned_landing",
    `--campaign ${shellQuote(campaign || slug(item.plugin))}`,
    "--status done",
    `--target ${shellQuote(item.target_url)}`,
    `--evidence ${shellQuote(`${item.target_url}; ${trackedUrl}; .tmp/framer-owned-site-audit.md`)}`,
    `--note ${shellQuote(`Added visible tracked Framer Marketplace CTA for ${item.plugin}. Confirmation: ${baseline?.confirmation || ""}`)}`,
  ].join(" ");
}

function verificationCommands({ item, campaign, trackedUrl }) {
  const commands = [
    "pnpm lead:owned-sites",
    "pnpm lead:owned-site-cta",
  ];
  if (item.target_url && campaign) {
    commands.push(`curl -L --silent ${shellQuote(item.target_url)} | rg ${shellQuote(`utm_campaign=${campaign}`)}`);
  }
  if (trackedUrl) {
    commands.push(`node -e ${shellQuote(`const fs=require("fs"); const r=JSON.parse(fs.readFileSync(".tmp/framer-owned-site-audit.json","utf8")); const item=r.items.find(i=>i.plugin===${JSON.stringify(item.plugin)}); console.log({readiness:item?.readiness,tracked:item?.tracked_marketplace_link_count,campaign_hits:item?.expected_campaign_hits?.length});`)}`);
  }
  return commands;
}

function blockedNote(item) {
  if (item.plugin === "Loka - Localization Hub") {
    return "Hold live CTA/promotion changes until Creem confirms the exact unregistered origin/referrer or a separate approved store is in place.";
  }
  if (item.plugin === "Polyglot AEO") {
    return "Hold live CTA/promotion changes until checkout-origin and tracking gates are healthy.";
  }
  return item.blockers?.[0] || "Hold until blockers clear.";
}

function kitItem(item, baseline) {
  const copy = copyFor(item.plugin);
  const trackedUrl = item.expected_tracked_marketplace_url || baseline?.tracked_marketplace_url || "";
  const campaign = item.expected_campaign || baseline?.campaign || expectedCampaignFromUrl(trackedUrl);
  const status = statusFor(item, trackedUrl);
  const snippet = trackedUrl
    ? `<a href="${trackedUrl}" rel="noopener" target="_blank">${copy.label}</a>`
    : "";
  const verification = verificationCommands({ item, campaign, trackedUrl });
  return {
    plugin: item.plugin,
    target_url: item.target_url,
    readiness: item.readiness,
    status,
    priority: priorityFor(status, item.plugin),
    campaign,
    tracked_marketplace_url: trackedUrl,
    confirmation: baseline?.confirmation || "",
    cta_label: copy.label,
    secondary_label: copy.secondary_label,
    headline: copy.headline,
    supporting_copy: copy.supporting_copy,
    suggested_placement: copy.placement,
    html_snippet: snippet,
    verification_commands: verification,
    record_command: status === "ready_site_update_confirmation_required" || status === "already_tracked_record_after_confirmation"
      ? recordCommand({ item, baseline, trackedUrl, campaign })
      : "",
    blockers: item.blockers || [],
    gaps: item.gaps || [],
    next_action: nextActionFor({ item, status, campaign, baseline }),
    hold_note: status === "blocked_prepare_only" ? blockedNote(item) : "",
    expected_benefit: "Owned landing traffic becomes measurable before scaling Marketplace, Community, directory, partner, or SEO promotion.",
    risk: "External owned-site content changes can create misleading attribution or payment-compliance noise if direct checkout links are changed without verification.",
  };
}

function nextActionFor({ item, status, campaign, baseline }) {
  if (status === "ready_site_update_confirmation_required") {
    return `Add a visible CTA on ${item.target_url} using campaign ${campaign}, then rerun owned-site audit. Confirmation: ${baseline?.confirmation || "required"}.`;
  }
  if (status === "already_tracked_record_after_confirmation") {
    return `Record the tracked CTA evidence after confirmation: ${baseline?.confirmation || "required"}.`;
  }
  if (status === "blocked_prepare_only") return blockedNote(item);
  if (status === "missing_tracked_marketplace_url") return "Regenerate landing baseline before changing the site.";
  return item.next_action || "Improve first-viewport copy and CTA tracking, then rerun the audit.";
}

function build({ audit, baseline }) {
  const auditItems = Array.isArray(audit?.items) ? audit.items : [];
  const items = auditItems
    .map((item) => kitItem(item, baselineFor(item.plugin, baseline)))
    .sort((a, b) => a.priority - b.priority || a.plugin.localeCompare(b.plugin));
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    generated_at: new Date().toISOString(),
    status: items.length ? "ready" : "missing_owned_site_audit",
    recommendation: recommendationFor(items),
    counts,
    items,
  };
}

function recommendationFor(items) {
  if (!items.length) return "Run pnpm lead:owned-sites before generating the CTA kit.";
  const ready = items.find((item) => item.status === "ready_site_update_confirmation_required");
  if (ready) return `Prepare ${ready.plugin} owned-site CTA update first. Confirmation phrase: ${ready.confirmation || "required"}.`;
  const tracked = items.find((item) => item.status === "already_tracked_record_after_confirmation");
  if (tracked) return `Record tracked owned-site evidence for ${tracked.plugin} after confirmation.`;
  const blocked = items.find((item) => item.status === "blocked_prepare_only");
  if (blocked) return `Keep ${blocked.plugin} held: ${blocked.hold_note}`;
  return "Owned-site CTA kit generated; use each next action before scaling traffic.";
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Owned Site CTA Kit",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Summary",
    "",
    "| Plugin | Site | Status | CTA label | Campaign | Confirmation |",
    "|---|---|---|---|---|---|",
  ];

  for (const item of report.items) {
    lines.push(`| ${clean(item.plugin)} | ${clean(item.target_url)} | ${clean(item.status)} | ${clean(item.cta_label)} | ${clean(item.campaign)} | ${clean(item.confirmation)} |`);
  }
  if (!report.items.length) lines.push("| none |  |  |  |  |  |");

  for (const item of report.items) {
    lines.push(
      "",
      `## ${item.plugin}`,
      "",
      `- Site: ${item.target_url}`,
      `- Status: ${item.status}`,
      `- Readiness source: ${item.readiness}`,
      `- Confirmation: ${item.confirmation || "required before external site changes"}`,
      `- CTA label: ${item.cta_label}`,
      `- Secondary label: ${item.secondary_label}`,
      `- Headline: ${item.headline}`,
      `- Supporting copy: ${item.supporting_copy}`,
      `- Suggested placement: ${item.suggested_placement}`,
      `- Tracked Marketplace URL: ${item.tracked_marketplace_url || "missing"}`,
      `- Next action: ${item.next_action}`,
    );
    if (item.hold_note) lines.push(`- Hold note: ${item.hold_note}`);
    lines.push(
      "",
      "HTML snippet:",
      "",
      "```html",
      item.html_snippet || "<!-- Regenerate landing baseline before adding a tracked CTA. -->",
      "```",
      "",
      "Verification commands:",
      "",
      "```bash",
      ...item.verification_commands,
      "```",
    );
    if (item.record_command) {
      lines.push(
        "",
        "Record command after confirmed site update and verification:",
        "",
        "```bash",
        item.record_command,
        "```",
      );
    }
    if (item.gaps.length || item.blockers.length) {
      lines.push("", "Known gaps/blockers:");
      for (const gap of item.gaps) lines.push(`- ${gap}`);
      for (const blocker of item.blockers) lines.push(`- ${blocker}`);
    }
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This kit is local-only. It does not edit owned sites, deploy, publish, submit forms, send Gmail, or modify Creem/payment settings.",
    "- Blocked rows are preparation-only until the named compliance or checkout-origin gate is cleared.",
    "- Record an owned-site CTA action only after the live page includes the tracked Marketplace URL and the audit verifies it.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
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

  const [audit, baseline] = await Promise.all([
    readJson(args.audit, null),
    readJson(args.baseline, null),
  ]);
  const report = build({ audit, baseline });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Owned site CTA kit: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
