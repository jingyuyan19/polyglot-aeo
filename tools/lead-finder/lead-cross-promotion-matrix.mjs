#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_OWNED_SITE_AUDIT = ".tmp/framer-owned-site-audit.json";
const DEFAULT_OWNED_SITE_CTA = ".tmp/framer-owned-site-cta-kit.json";
const DEFAULT_ASSET_KITS = ".tmp/framer-plugin-asset-kits.json";
const DEFAULT_PLUGIN_CHANNEL_FIT = ".tmp/framer-plugin-channel-fit.json";
const DEFAULT_CONFIRMATIONS = ".tmp/framer-confirmation-queue.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-cross-promotion-matrix.md";
const DEFAULT_JSON = ".tmp/framer-cross-promotion-matrix.json";

const OPPORTUNITIES = [
  {
    source: "Ally Auditor",
    target: "Gaode Maps",
    placement: "Ally site resources, docs ending CTA, or post-audit handoff checklist",
    angle: "After an accessibility QA pass, China-facing Framer location sections still need a native Gaode/AMap embed.",
    copy: "Building a China-facing location page too? Add a Gaode/AMap component after your accessibility pass.",
    link_label: "Add Gaode Maps",
    priority: 1,
  },
  {
    source: "Gaode Maps",
    target: "Ally Auditor",
    placement: "Gaode tutorial conclusion, component install page, or Framer QA checklist",
    angle: "A map section is often the most interactive part of a local page, so accessibility QA is a natural next step.",
    copy: "Before handing off the location page, run a quick accessibility audit for contrast, headings, and alt text.",
    link_label: "Run Ally Auditor",
    priority: 2,
  },
  {
    source: "Ally Auditor",
    target: "Polyglot AEO",
    placement: "Ally agency handoff checklist or advanced QA section",
    angle: "Agencies that already care about handoff QA can add multilingual AI-search readiness as the next proof point.",
    copy: "Shipping a multilingual client site? Add AEO/schema/llms.txt checks to the accessibility handoff.",
    link_label: "Check Polyglot AEO",
    priority: 3,
  },
  {
    source: "Polyglot AEO",
    target: "Ally Auditor",
    placement: "Polyglot agency page, success page, or multilingual launch QA docs",
    angle: "AEO readiness and accessibility QA are adjacent launch-proof tasks for Framer agencies.",
    copy: "Need broader launch QA? Pair multilingual AEO checks with a quick accessibility audit.",
    link_label: "Run Ally Auditor",
    priority: 4,
  },
  {
    source: "Gaode Maps",
    target: "Loka - Localization Hub",
    placement: "Gaode China-location tutorial or multilingual store-locator note",
    angle: "China-facing location pages often need both Gaode maps and simple language switching.",
    copy: "Turning this into a multilingual page? Use a Sheets-powered localization workflow for the copy.",
    link_label: "Try Loka",
    priority: 5,
  },
  {
    source: "Loka - Localization Hub",
    target: "Gaode Maps",
    placement: "Loka localization tutorial or China-market example page",
    angle: "Teams localizing Framer sites for China often also need a Gaode/AMap map block.",
    copy: "Adding a China-market location section? Generate a Gaode/AMap component for Framer.",
    link_label: "Add Gaode Maps",
    priority: 6,
  },
];

function usage() {
  return `
Usage:
  pnpm lead:cross-promo

Options:
  --public-health <file>       Public health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --owned-site-audit <file>    Owned site audit JSON. Default: ${DEFAULT_OWNED_SITE_AUDIT}
  --owned-site-cta <file>      Owned site CTA kit JSON. Default: ${DEFAULT_OWNED_SITE_CTA}
  --asset-kits <file>          Plugin asset kits JSON. Default: ${DEFAULT_ASSET_KITS}
  --plugin-channel-fit <file>  Plugin channel fit JSON. Default: ${DEFAULT_PLUGIN_CHANNEL_FIT}
  --confirmations <file>       Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATIONS}
  --actions <file>             Action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>              Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                JSON output. Default: ${DEFAULT_JSON}
  --help                       Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    publicHealth: DEFAULT_PUBLIC_HEALTH,
    ownedSiteAudit: DEFAULT_OWNED_SITE_AUDIT,
    ownedSiteCta: DEFAULT_OWNED_SITE_CTA,
    assetKits: DEFAULT_ASSET_KITS,
    pluginChannelFit: DEFAULT_PLUGIN_CHANNEL_FIT,
    confirmations: DEFAULT_CONFIRMATIONS,
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
      "--public-health": "publicHealth",
      "--owned-site-audit": "ownedSiteAudit",
      "--owned-site-cta": "ownedSiteCta",
      "--asset-kits": "assetKits",
      "--plugin-channel-fit": "pluginChannelFit",
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
      } else if (char === '"') quoted = false;
      else cell += char;
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
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function findChannel(pluginChannelFit, plugin, channel) {
  const pluginRow = (Array.isArray(pluginChannelFit?.plugins) ? pluginChannelFit.plugins : [])
    .find((row) => samePlugin(row.plugin, plugin));
  return (pluginRow?.channels || []).find((row) => row.channel === channel) || null;
}

function actionLogged(rows, campaign) {
  return rows.some((row) => {
    const text = `${row.type || ""} ${row.channel || ""} ${row.campaign || ""} ${row.status || ""} ${row.target || ""} ${row.evidence || ""} ${row.note || ""}`;
    return row.status === "done" && text.includes(campaign);
  });
}

function marketplaceUrl({ assetKit, health, channelFit }) {
  return assetKit?.marketplace_url || health?.marketplace_url || channelFit?.marketplace_url || "";
}

function trackedMarketplaceUrl(baseUrl, source, target, placement) {
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("utm_source", "owned_cross_promo");
    url.searchParams.set("utm_medium", "owned_site");
    url.searchParams.set("utm_campaign", campaignFor(source, target));
    url.searchParams.set("utm_content", slug(placement).slice(0, 70));
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function campaignFor(source, target) {
  return `${slug(source)}_to_${slug(target)}_cross_promo`;
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function statusFor({ sourceHealth, targetHealth, sourceSite, sourceCta, targetCta }) {
  const blockers = [];
  const sourceBlockers = hardBlockers(sourceHealth, sourceSite, sourceCta);
  const targetBlockers = hardBlockers(targetHealth, null, targetCta);
  blockers.push(...sourceBlockers.map((item) => `Source: ${item}`));
  blockers.push(...targetBlockers.map((item) => `Target: ${item}`));
  const uniqueBlockers = [...new Set(blockers)];

  const blockerText = uniqueBlockers.join(" ");
  if (/compliance|unregistered|off-boarding|Creem/i.test(blockerText)) {
    return { status: "blocked_by_compliance", blockers: uniqueBlockers };
  }
  if (/checkout|payment|legacy|license|worker|custom domain|not reachable|not serving/i.test(blockerText)) {
    return { status: "blocked_by_checkout", blockers: uniqueBlockers };
  }
  if (uniqueBlockers.length) return { status: "blocked_prepare_only", blockers: uniqueBlockers };
  if (sourceCta?.status === "ready_site_update_confirmation_required" || sourceSite?.readiness === "needs_cta_tracking") {
    return {
      status: "ready_local_copy",
      blockers: [],
    };
  }
  if (sourceCta?.status === "already_tracked_record_after_confirmation" || sourceSite?.readiness === "ready_for_recording") {
    return {
      status: "ready_record_after_confirmation",
      blockers: [],
    };
  }
  return {
    status: "prepare_local_copy",
    blockers: [],
  };
}

function hardBlockers(health, site, cta) {
  const rows = [
    ...(Array.isArray(health?.blockers) ? health.blockers : []),
    ...(Array.isArray(site?.blockers) ? site.blockers : []),
    ...(Array.isArray(cta?.blockers) ? cta.blockers : []),
  ].filter(Boolean);
  if (health?.status === "blocked" && !rows.length) rows.push(`${health.name || health.plugin || "plugin"} public health is blocked`);
  if (site?.readiness === "blocked" && !rows.length) rows.push(`${site.plugin || "site"} owned site is blocked`);
  if (cta?.status === "blocked_prepare_only" && !rows.length) rows.push(`${cta.plugin || "CTA"} is blocked/prepare-only`);
  return rows.filter((item) => !/^no hard blocker recorded/i.test(String(item)));
}

function priority(status, basePriority) {
  const offset = {
    ready_local_copy: 0,
    ready_record_after_confirmation: 1,
    prepare_local_copy: 2,
    blocked_by_checkout: 20,
    blocked_by_compliance: 21,
    blocked_prepare_only: 22,
  }[status] ?? 10;
  return offset * 10 + Number(basePriority || 99);
}

function recordCommand({ row }) {
  if (!/^ready_/.test(row.status)) return "";
  return [
    "pnpm lead:actions -- --add",
    "--type cross_promotion",
    "--channel owned_site",
    `--campaign ${shellQuote(row.campaign)}`,
    "--status done",
    `--target ${shellQuote(`${row.source_plugin} -> ${row.target_plugin} on ${row.source_site}`)}`,
    `--evidence ${shellQuote(`${row.source_site}; ${row.tracked_marketplace_url}; .tmp/framer-cross-promotion-matrix.md`)}`,
    `--note ${shellQuote(`Added related-plugin cross-promotion after explicit confirmation: ${row.confirmation || "confirmation required"}`)}`,
  ].join(" ");
}

function verificationCommands(row) {
  const commands = ["pnpm lead:owned-sites", "pnpm lead:cross-promo"];
  if (row.source_site && row.campaign) {
    commands.push(`curl -L --silent ${shellQuote(row.source_site)} | rg ${shellQuote(`utm_campaign=${row.campaign}`)}`);
  }
  commands.push("pnpm lead:portfolio-ops -- --skip-signals");
  return commands;
}

function buildRow({ opportunity, publicHealth, ownedSiteAudit, ownedSiteCta, assetKits, pluginChannelFit, confirmations, actionRows }) {
  const healthRows = Array.isArray(publicHealth?.profiles) ? publicHealth.profiles : [];
  const auditRows = Array.isArray(ownedSiteAudit?.items) ? ownedSiteAudit.items : [];
  const ctaRows = Array.isArray(ownedSiteCta?.items) ? ownedSiteCta.items : [];
  const kitRows = Array.isArray(assetKits?.kits) ? assetKits.kits : [];
  const confirmationRows = Array.isArray(confirmations?.rows) ? confirmations.rows : [];
  const sourceHealth = byPlugin(healthRows, opportunity.source);
  const targetHealth = byPlugin(healthRows, opportunity.target);
  const sourceSite = byPlugin(auditRows, opportunity.source);
  const sourceCta = byPlugin(ctaRows, opportunity.source);
  const targetCta = byPlugin(ctaRows, opportunity.target);
  const targetKit = byPlugin(kitRows, opportunity.target);
  const targetFit = (Array.isArray(pluginChannelFit?.plugins) ? pluginChannelFit.plugins : []).find((row) => samePlugin(row.plugin, opportunity.target));
  const crossFit = findChannel(pluginChannelFit, opportunity.source, "cross_promotion");
  const baseMarketplaceUrl = marketplaceUrl({ assetKit: targetKit, health: targetHealth, channelFit: targetFit });
  const campaign = campaignFor(opportunity.source, opportunity.target);
  const trackedUrl = trackedMarketplaceUrl(baseMarketplaceUrl, opportunity.source, opportunity.target, opportunity.placement);
  const status = statusFor({ sourceHealth, targetHealth, sourceSite, sourceCta, targetCta });
  const sourceConfirmation = sourceCta?.confirmation
    || confirmationRows.find((row) => samePlugin(row.plugin, opportunity.source) && row.kind === "landing_baseline")?.confirmation
    || "";
  const row = {
    source_plugin: opportunity.source,
    target_plugin: opportunity.target,
    source_site: sourceSite?.target_url || sourceCta?.target_url || "",
    placement: opportunity.placement,
    status: actionLogged(actionRows, campaign) ? "recorded" : status.status,
    priority: priority(status.status, opportunity.priority),
    reason: opportunity.angle,
    local_copy: opportunity.copy,
    link_label: opportunity.link_label,
    target_marketplace_url: baseMarketplaceUrl,
    tracked_marketplace_url: trackedUrl,
    campaign,
    confirmation: sourceConfirmation,
    risk: "A cross-promo link can create misleading attribution or payment-compliance noise if it sends traffic into an unresolved checkout/store surface.",
    expected_benefit: "Adds a relevant second-step path across owned plugin sites while keeping Marketplace installs measurable by source and campaign.",
    verification: "Source URL returns 200, copied link contains owned_cross_promo UTM params, owned-site audit sees the campaign, and the action log records the change after confirmation.",
    blockers: status.blockers,
    channel_fit_decision: crossFit?.decision || "",
    channel_fit_reason: crossFit?.reason || "",
    next_local_step: nextLocalStep(status.status, opportunity.source, opportunity.target, sourceConfirmation),
  };
  row.record_command = recordCommand({ row });
  row.verification_commands = verificationCommands(row);
  return row;
}

function nextLocalStep(status, source, target, confirmation) {
  if (status === "ready_local_copy") {
    return `Prepare the ${source} -> ${target} related-plugin copy locally; publish only after exact confirmation${confirmation ? `: ${confirmation}` : "."}`;
  }
  if (status === "ready_record_after_confirmation") {
    return `If the link is already live, verify the campaign and record the ${source} -> ${target} action after confirmation.`;
  }
  if (status === "prepare_local_copy") {
    return `Keep the ${source} -> ${target} copy in the local kit until owned-site tracking is ready.`;
  }
  if (status === "blocked_by_checkout") {
    return `Prepare copy only; do not drive traffic between ${source} and ${target} until checkout-origin blockers are closed.`;
  }
  if (status === "blocked_by_compliance") {
    return `Prepare copy only; do not create traffic between ${source} and ${target} until Creem/provider compliance is closed.`;
  }
  return `Keep ${source} -> ${target} local-only until blockers clear.`;
}

function build({ publicHealth, ownedSiteAudit, ownedSiteCta, assetKits, pluginChannelFit, confirmations, actionRows }) {
  const rows = OPPORTUNITIES
    .map((opportunity) => buildRow({
      opportunity,
      publicHealth,
      ownedSiteAudit,
      ownedSiteCta,
      assetKits,
      pluginChannelFit,
      confirmations,
      actionRows,
    }))
    .sort((a, b) => a.priority - b.priority || a.source_plugin.localeCompare(b.source_plugin));
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const ready = rows.filter((row) => row.status === "ready_local_copy" || row.status === "ready_record_after_confirmation");
  const blocked = rows.filter((row) => /^blocked/.test(row.status));
  return {
    generated_at: new Date().toISOString(),
    status: rows.length ? "ready" : "missing_inputs",
    recommendation: recommendationFor({ ready, blocked, rows }),
    counts,
    ready_count: ready.length,
    blocked_count: blocked.length,
    rows,
    guardrails: [
      "Local-only: this matrix does not edit owned sites, publish docs, send Gmail, submit forms, deploy, or change payment settings.",
      "Do not add cross-promo traffic to Loka while the Creem compliance origin/referrer is unresolved.",
      "Do not add cross-promo traffic to Polyglot while production checkout-origin and custom-domain health are blocked.",
      "Ready rows still require the exact confirmation phrase before any external site update.",
    ],
  };
}

function recommendationFor({ ready, blocked }) {
  if (ready.length) {
    const first = ready[0];
    return `Prepare ${first.source_plugin} -> ${first.target_plugin} owned-site cross-promo copy first; external publish still requires confirmation: ${first.confirmation || "required"}.`;
  }
  if (blocked.length) return `All priority cross-promo rows are gated; resolve first blocker: ${blocked[0].blockers[0] || blocked[0].status}.`;
  return "Refresh owned-site CTA and public-health reports before choosing cross-promotion.";
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function short(value, max = 150) {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Cross-Promotion Matrix",
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
    `- Ready local copy: ${report.counts.ready_local_copy || 0}`,
    `- Ready to record after confirmation: ${report.counts.ready_record_after_confirmation || 0}`,
    `- Prepare local copy: ${report.counts.prepare_local_copy || 0}`,
    `- Blocked by checkout: ${report.counts.blocked_by_checkout || 0}`,
    `- Blocked by compliance: ${report.counts.blocked_by_compliance || 0}`,
    `- Blocked/prepare-only: ${report.counts.blocked_prepare_only || 0}`,
    "",
    "## Priority Matrix",
    "",
    "| Status | Source | Target | Source site | Placement | Campaign | Confirmation |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of report.rows) {
    lines.push(`| ${clean(row.status)} | ${clean(row.source_plugin)} | ${clean(row.target_plugin)} | ${clean(row.source_site)} | ${clean(short(row.placement, 90))} | ${clean(row.campaign)} | ${clean(row.confirmation)} |`);
  }

  lines.push("", "## Row Details", "");
  for (const row of report.rows) {
    lines.push(
      `### ${row.source_plugin} -> ${row.target_plugin}`,
      "",
      `- Status: ${row.status}`,
      `- Placement: ${row.placement}`,
      `- Copy: ${row.local_copy}`,
      `- Link label: ${row.link_label}`,
      `- Target URL: ${row.tracked_marketplace_url || row.target_marketplace_url || "n/a"}`,
      `- Why: ${row.reason}`,
      `- Risk: ${row.risk}`,
      `- Expected benefit: ${row.expected_benefit}`,
      `- Verification: ${row.verification}`,
      `- Next local step: ${row.next_local_step}`,
      `- Confirmation phrase: ${row.confirmation || "none"}`,
    );
    if (row.record_command) {
      lines.push(
        "- Record command after confirmed external change:",
        "```bash",
        row.record_command,
        "```",
      );
    }
    lines.push(
      "Verification commands:",
      "```bash",
      ...row.verification_commands,
      "```",
    );
    if (row.blockers.length) {
      lines.push("Blockers:");
      for (const blocker of row.blockers) lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  lines.push(
    "## Guardrails",
    "",
    ...report.guardrails.map((item) => `- ${item}`),
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

  const [
    publicHealth,
    ownedSiteAudit,
    ownedSiteCta,
    assetKits,
    pluginChannelFit,
    confirmations,
    actionRows,
  ] = await Promise.all([
    readJson(args.publicHealth, null),
    readJson(args.ownedSiteAudit, null),
    readJson(args.ownedSiteCta, null),
    readJson(args.assetKits, null),
    readJson(args.pluginChannelFit, null),
    readJson(args.confirmations, null),
    readRows(args.actions),
  ]);

  const report = build({
    publicHealth,
    ownedSiteAudit,
    ownedSiteCta,
    assetKits,
    pluginChannelFit,
    confirmations,
    actionRows,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Cross-promotion matrix: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
