#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_LANDING_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_OWNED_SITE_CTA = ".tmp/framer-owned-site-cta-kit.json";
const DEFAULT_CROSS_PROMOTION = ".tmp/framer-cross-promotion-matrix.json";
const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_CONFIRMATIONS = ".tmp/framer-confirmation-queue.json";
const DEFAULT_OUTPUT = ".tmp/framer-owned-site-implementation-brief.md";
const DEFAULT_JSON = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_OUT_DIR = "docs/growth/owned-site-implementation";

function usage() {
  return `
Usage:
  pnpm lead:owned-site-implementation

Options:
  --landing-baseline <file>  Landing baseline JSON. Default: ${DEFAULT_LANDING_BASELINE}
  --owned-site-cta <file>    Owned site CTA kit JSON. Default: ${DEFAULT_OWNED_SITE_CTA}
  --cross-promotion <file>   Cross-promotion matrix JSON. Default: ${DEFAULT_CROSS_PROMOTION}
  --public-health <file>     Public health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --confirmations <file>     Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATIONS}
  --output <file>            Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>              JSON output. Default: ${DEFAULT_JSON}
  --out-dir <dir>            Per-site implementation briefs. Default: ${DEFAULT_OUT_DIR}
  --help                     Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    landingBaseline: DEFAULT_LANDING_BASELINE,
    ownedSiteCta: DEFAULT_OWNED_SITE_CTA,
    crossPromotion: DEFAULT_CROSS_PROMOTION,
    publicHealth: DEFAULT_PUBLIC_HEALTH,
    confirmations: DEFAULT_CONFIRMATIONS,
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
      "--landing-baseline": "landingBaseline",
      "--owned-site-cta": "ownedSiteCta",
      "--cross-promotion": "crossPromotion",
      "--public-health": "publicHealth",
      "--confirmations": "confirmations",
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

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "plugin";
}

function normalized(value) {
  return slug(value).replace(/-localization-hub$/, "").replace(/-assistant$/, "");
}

function samePlugin(left, right) {
  const a = normalized(left);
  const b = normalized(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function byPlugin(rows, plugin) {
  return rows.find((row) => samePlugin(row.plugin || row.name || "", plugin)) || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function statusFor({ landing, cta, health }) {
  const blockers = unique([
    ...(Array.isArray(health?.blockers) ? health.blockers.map((item) => `Public health: ${item}`) : []),
    ...(Array.isArray(cta?.blockers) ? cta.blockers.map((item) => `CTA kit: ${item}`) : []),
    landing?.status === "blocked" ? `Landing baseline: ${landing.current_issue || landing.target_registry_status || "blocked"}` : "",
    cta?.status === "blocked_prepare_only" ? cta.hold_note || "CTA kit is blocked/prepare-only" : "",
  ]);
  const text = blockers.join(" ");
  if (/compliance|Creem|unregistered|off-boarding/i.test(text)) return { status: "blocked_by_compliance", blockers };
  if (/checkout|payment|license|worker|legacy|custom domain|not reachable|not serving/i.test(text)) return { status: "blocked_by_checkout", blockers };
  if (blockers.length) return { status: "blocked_prepare_only", blockers };
  if (landing?.status === "ready_to_spec" && cta?.status === "ready_site_update_confirmation_required") {
    return { status: "ready_confirmation_required", blockers: [] };
  }
  if (cta?.status === "already_tracked_record_after_confirmation") {
    return { status: "ready_record_after_confirmation", blockers: [] };
  }
  if (landing?.status === "ready_to_spec" || cta?.status === "ready_site_update_confirmation_required") {
    return { status: "prepare_local_copy", blockers: [] };
  }
  return { status: "missing_inputs", blockers: [] };
}

function pluginPriority(plugin, status) {
  const statusRank = {
    ready_confirmation_required: 1,
    ready_record_after_confirmation: 2,
    prepare_local_copy: 3,
    blocked_by_checkout: 8,
    blocked_by_compliance: 9,
    blocked_prepare_only: 10,
    missing_inputs: 11,
  }[status] || 12;
  const pluginRank = {
    "Ally Auditor": 1,
    "Gaode Maps": 2,
    "Polyglot AEO": 3,
    "Loka - Localization Hub": 4,
  }[plugin] || 9;
  return statusRank * 10 + pluginRank;
}

function confirmationFor(plugin, landing, cta, confirmations) {
  const rows = Array.isArray(confirmations?.rows) ? confirmations.rows : [];
  return landing?.confirmation
    || cta?.confirmation
    || rows.find((row) => samePlugin(row.plugin, plugin) && row.kind === "landing_baseline")?.confirmation
    || rows.find((row) => samePlugin(row.plugin, plugin))?.confirmation
    || "";
}

function crossRowsFor(plugin, crossPromotion) {
  return (Array.isArray(crossPromotion?.rows) ? crossPromotion.rows : [])
    .filter((row) => samePlugin(row.source_plugin, plugin));
}

function mergeCommands(...lists) {
  return unique(lists.flat().filter(Boolean));
}

function buildItem({ plugin, landing, cta, health, crossRows, confirmations }) {
  const status = statusFor({ landing, cta, health });
  const readyCross = crossRows.filter((row) => row.status === "ready_local_copy" || row.status === "ready_record_after_confirmation");
  const blockedCross = crossRows.filter((row) => /^blocked/.test(String(row.status || "")));
  const confirmation = confirmationFor(plugin, landing, cta, confirmations);
  const siteUrl = cta?.target_url || landing?.proposed_url || landing?.external_action?.target || "";
  const verificationCommands = mergeCommands(
    cta?.verification_commands || [],
    readyCross.flatMap((row) => row.verification_commands || []),
    ["pnpm lead:owned-site-implementation", "pnpm lead:portfolio-ops -- --skip-signals"],
  );
  const recordCommands = mergeCommands(
    cta?.record_command ? [cta.record_command] : [],
    readyCross.map((row) => row.record_command).filter(Boolean),
  );
  return {
    plugin,
    status: status.status,
    priority: pluginPriority(plugin, status.status),
    site_url: siteUrl,
    confirmation,
    headline: cta?.headline || landing?.headline || plugin,
    primary_cta_label: cta?.cta_label || `Get ${plugin}`,
    primary_cta_url: cta?.tracked_marketplace_url || landing?.tracked_marketplace_url || "",
    primary_cta_copy: cta?.supporting_copy || "",
    suggested_placement: cta?.suggested_placement || "Primary CTA and install section.",
    primary_html_snippet: cta?.html_snippet || "",
    related_plugin_links: readyCross.map((row) => ({
      target_plugin: row.target_plugin,
      placement: row.placement,
      link_label: row.link_label,
      copy: row.local_copy,
      tracked_marketplace_url: row.tracked_marketplace_url,
      campaign: row.campaign,
      confirmation: row.confirmation,
      record_command: row.record_command,
    })),
    blocked_related_plugin_links: blockedCross.map((row) => ({
      target_plugin: row.target_plugin,
      status: row.status,
      reason: row.next_local_step,
      blockers: row.blockers || [],
    })),
    blockers: status.blockers,
    risk: landing?.external_action?.risk || cta?.risk || "Owned-site changes can create attribution noise if CTA and UTM checks are not verified.",
    expected_benefit: landing?.external_action?.expected_benefit || cta?.expected_benefit || "Turns owned site traffic into measurable Marketplace install intent.",
    verification: landing?.external_action?.verification || "URL 200, tracked Marketplace CTA present, campaign visible in owned-site audit, and action log evidence recorded.",
    acceptance_criteria: acceptanceCriteria({ plugin, status: status.status, readyCross }),
    next_local_step: nextLocalStep({ plugin, status: status.status, confirmation, readyCross, blockers: status.blockers }),
    verification_commands: verificationCommands,
    record_commands: recordCommands,
  };
}

function acceptanceCriteria({ status, readyCross }) {
  if (/^blocked/.test(status)) {
    return [
      "Do not publish or add traffic while this row is blocked.",
      "Resolve the named public-health/payment/compliance blocker first.",
      "Rerun public health, owned-site CTA, cross-promotion, and this brief before asking for confirmation.",
    ];
  }
  const criteria = [
    "Primary CTA points to the Framer Marketplace listing with UTM params.",
    "No direct Creem checkout link is added or changed.",
    "Owned-site audit sees the expected campaign after the update.",
    "Action log records the external change only after confirmation and verification.",
  ];
  if (readyCross.length) criteria.push("Add at most one related-plugin link in a relevant resource/tutorial/handoff section.");
  return criteria;
}

function nextLocalStep({ plugin, status, confirmation, readyCross, blockers }) {
  if (status === "ready_confirmation_required") {
    const related = readyCross.length ? ` Include ${readyCross[0].target_plugin} as the first related-plugin link.` : "";
    return `Prepare the ${plugin} owned-site update locally; publish only after exact confirmation: ${confirmation}.${related}`;
  }
  if (status === "ready_record_after_confirmation") {
    return `Verify the live ${plugin} campaign and record the owned-site action after confirmation.`;
  }
  if (status === "prepare_local_copy") {
    return `Keep the ${plugin} copy packet local until the missing CTA/tracking input is ready.`;
  }
  if (/^blocked/.test(status)) {
    return `Hold ${plugin} owned-site traffic: ${blockers[0] || "blocker still open"}`;
  }
  return `Refresh landing baseline and owned-site CTA kit for ${plugin}.`;
}

function allPlugins({ landingBaseline, ownedSiteCta }) {
  return unique([
    ...(Array.isArray(landingBaseline?.rows) ? landingBaseline.rows.map((row) => row.plugin) : []),
    ...(Array.isArray(ownedSiteCta?.items) ? ownedSiteCta.items.map((row) => row.plugin) : []),
  ]);
}

function build({ landingBaseline, ownedSiteCta, crossPromotion, publicHealth, confirmations }) {
  const landingRows = Array.isArray(landingBaseline?.rows) ? landingBaseline.rows : [];
  const ctaRows = Array.isArray(ownedSiteCta?.items) ? ownedSiteCta.items : [];
  const healthRows = Array.isArray(publicHealth?.profiles) ? publicHealth.profiles : [];
  const items = allPlugins({ landingBaseline, ownedSiteCta })
    .map((plugin) => buildItem({
      plugin,
      landing: byPlugin(landingRows, plugin),
      cta: byPlugin(ctaRows, plugin),
      health: byPlugin(healthRows, plugin),
      crossRows: crossRowsFor(plugin, crossPromotion),
      confirmations,
    }))
    .sort((a, b) => a.priority - b.priority || a.plugin.localeCompare(b.plugin));
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const firstReady = items.find((item) => item.status === "ready_confirmation_required" || item.status === "ready_record_after_confirmation");
  return {
    generated_at: new Date().toISOString(),
    status: items.length ? "ready" : "missing_inputs",
    recommendation: firstReady
      ? `Prepare ${firstReady.plugin} owned-site implementation first; external publish still requires confirmation: ${firstReady.confirmation || "required"}.`
      : "No owned-site implementation is ready; resolve blockers or refresh landing/CTA inputs.",
    counts,
    items,
    guardrails: [
      "Local-only: this brief does not edit sites, deploy, send Gmail, submit forms, upload Marketplace files, or modify payment settings.",
      "Use exact confirmation phrases before any external site update.",
      "Do not add traffic to Loka while the Creem origin/referrer is unresolved.",
      "Do not add traffic to Polyglot while checkout-origin/custom-domain health is blocked.",
    ],
  };
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function renderMarkdown(report) {
  const lines = [
    "# Owned Site Implementation Brief",
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
    `- Ready confirmation required: ${report.counts.ready_confirmation_required || 0}`,
    `- Ready record after confirmation: ${report.counts.ready_record_after_confirmation || 0}`,
    `- Prepare local copy: ${report.counts.prepare_local_copy || 0}`,
    `- Blocked by checkout: ${report.counts.blocked_by_checkout || 0}`,
    `- Blocked by compliance: ${report.counts.blocked_by_compliance || 0}`,
    "",
    "| Status | Plugin | Site | Primary CTA | Related ready | Confirmation |",
    "|---|---|---|---|---:|---|",
  ];
  for (const item of report.items) {
    lines.push(`| ${clean(item.status)} | ${clean(item.plugin)} | ${clean(item.site_url)} | ${clean(item.primary_cta_label)} | ${item.related_plugin_links.length} | ${clean(item.confirmation)} |`);
  }

  lines.push("", "## Implementation Packets", "");
  for (const item of report.items) {
    lines.push(...renderItem(item));
  }

  lines.push("## Guardrails", "");
  for (const guardrail of report.guardrails) lines.push(`- ${guardrail}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderItem(item) {
  const lines = [
    `### ${item.plugin}`,
    "",
    `- Status: ${item.status}`,
    `- Site: ${item.site_url || "n/a"}`,
    `- Confirmation phrase: ${item.confirmation || "none"}`,
    `- Next local step: ${item.next_local_step}`,
    `- Risk: ${item.risk}`,
    `- Expected benefit: ${item.expected_benefit}`,
    `- Verification: ${item.verification}`,
    "",
    "Primary CTA:",
    `- Headline: ${item.headline}`,
    `- Label: ${item.primary_cta_label}`,
    `- URL: ${item.primary_cta_url || "n/a"}`,
    `- Copy: ${item.primary_cta_copy || "n/a"}`,
    `- Placement: ${item.suggested_placement}`,
  ];
  if (item.primary_html_snippet) {
    lines.push("", "HTML snippet:", "```html", item.primary_html_snippet, "```");
  }
  if (item.related_plugin_links.length) {
    lines.push("", "Related-plugin links:");
    for (const link of item.related_plugin_links) {
      lines.push(
        `- ${link.target_plugin}: ${link.copy}`,
        `  - Label: ${link.link_label}`,
        `  - URL: ${link.tracked_marketplace_url}`,
        `  - Campaign: ${link.campaign}`,
      );
    }
  }
  if (item.blocked_related_plugin_links.length) {
    lines.push("", "Blocked related-plugin links:");
    for (const link of item.blocked_related_plugin_links) {
      lines.push(`- ${link.target_plugin}: ${link.status}; ${link.reason}`);
    }
  }
  lines.push("", "Acceptance criteria:");
  for (const criterion of item.acceptance_criteria) lines.push(`- ${criterion}`);
  if (item.record_commands.length) {
    lines.push("", "Record commands after confirmed external change:", "```bash", ...item.record_commands, "```");
  }
  lines.push("", "Verification commands:", "```bash", ...item.verification_commands, "```");
  if (item.blockers.length) {
    lines.push("", "Blockers:");
    for (const blocker of item.blockers) lines.push(`- ${blocker}`);
  }
  lines.push("");
  return lines;
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function writePerSiteBriefs(report, outDir) {
  await mkdir(outDir, { recursive: true });
  await Promise.all(report.items.map((item) => {
    const text = [
      `# ${item.plugin} Owned Site Implementation`,
      "",
      `Generated: ${report.generated_at}`,
      "",
      ...renderItem(item),
    ].join("\n");
    return writeText(path.join(outDir, `${slug(item.plugin)}.md`), `${text}\n`);
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const [
    landingBaseline,
    ownedSiteCta,
    crossPromotion,
    publicHealth,
    confirmations,
  ] = await Promise.all([
    readJson(args.landingBaseline, null),
    readJson(args.ownedSiteCta, null),
    readJson(args.crossPromotion, null),
    readJson(args.publicHealth, null),
    readJson(args.confirmations, null),
  ]);

  const report = build({
    landingBaseline,
    ownedSiteCta,
    crossPromotion,
    publicHealth,
    confirmations,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
    writePerSiteBriefs(report, args.outDir),
  ]);

  process.stdout.write(`Owned-site implementation brief: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  process.stdout.write(`Per-site briefs: ${args.outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
