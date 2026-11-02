#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_ASSET_KITS = ".tmp/framer-plugin-asset-kits.json";
const DEFAULT_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_LANDING_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_CUSTOMER_FEEDBACK = ".tmp/framer-customer-feedback-queue.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_PLUGIN_DIR = "docs/growth/plugins";
const DEFAULT_OUTPUT = ".tmp/framer-asset-coverage.md";
const DEFAULT_JSON = ".tmp/framer-asset-coverage.json";

const PROFILE_SECTIONS = [
  "## Positioning",
  "ICP:",
  "Core pain:",
  "One-line positioning:",
  "Free value:",
  "Paid value:",
  "## Current Evidence",
  "## Channel Fit",
  "## Assets",
  "## Next Actions",
];

const CHECKS = [
  "growth_file",
  "marketplace",
  "community",
  "directory",
  "partner",
  "customer",
  "demo_seo",
  "tracking",
  "landing_baseline",
  "experiment_review",
  "safety_gate",
  "evidence",
];
const ASSET_READINESS_CHECKS = [
  "growth_file",
  "marketplace",
  "community",
  "directory",
  "partner",
  "customer",
  "demo_seo",
  "tracking",
];
const LOCAL_PARTIAL_ORDER = [
  "landing_baseline",
  "tracking",
  "experiment_review",
  "growth_file",
  "marketplace",
  "community",
  "directory",
  "partner",
  "demo_seo",
  "evidence",
  "customer",
  "safety_gate",
];
const PROMOTION_BLOCKING_CHECKS = new Set(["landing_baseline", "tracking", "experiment_review", "safety_gate"]);

function usage() {
  return `
Usage:
  pnpm lead:asset-coverage

Options:
  --portfolio <file>          Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --asset-kits <file>         Plugin asset kits JSON. Default: ${DEFAULT_ASSET_KITS}
  --experiments <file>        Portfolio experiments JSON. Default: ${DEFAULT_EXPERIMENTS}
  --landing-baseline <file>   Landing/tracking baseline JSON. Default: ${DEFAULT_LANDING_BASELINE}
  --customer-feedback <file>  Customer feedback queue JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK}
  --actions <file>            Action log CSV. Default: ${DEFAULT_ACTIONS}
  --plugin-dir <dir>          Per-plugin growth files. Default: ${DEFAULT_PLUGIN_DIR}
  --output <file>             Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>               JSON output. Default: ${DEFAULT_JSON}
  --help                      Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    portfolio: DEFAULT_PORTFOLIO,
    assetKits: DEFAULT_ASSET_KITS,
    experiments: DEFAULT_EXPERIMENTS,
    landingBaseline: DEFAULT_LANDING_BASELINE,
    customerFeedback: DEFAULT_CUSTOMER_FEEDBACK,
    actions: DEFAULT_ACTIONS,
    pluginDir: DEFAULT_PLUGIN_DIR,
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
      "--portfolio": "portfolio",
      "--asset-kits": "assetKits",
      "--experiments": "experiments",
      "--landing-baseline": "landingBaseline",
      "--customer-feedback": "customerFeedback",
      "--actions": "actions",
      "--plugin-dir": "pluginDir",
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

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "plugin";
}

function normalize(value) {
  return slugify(value)
    .replace(/-localization-hub$/, "")
    .replace(/-assistant$/, "")
    .replace(/^loka-pro$/, "loka")
    .replace(/^gaode-maps$/, "gaode-maps");
}

function samePlugin(left, right) {
  if (!left || !right) return false;
  const a = normalize(left);
  const b = normalize(right);
  return a === b || a.includes(b) || b.includes(a);
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

function hostingWarningBlocker(row) {
  return [
    "Open hosting warning blocks publish/deploy execution",
    row.campaign,
    row.status,
    row.target,
    row.evidence,
    row.note,
  ].filter(Boolean).join(": ").replace(/\r?\n/g, " ").trim();
}

function findByPlugin(rows, plugin) {
  return rows.find((row) => samePlugin(row.plugin || row.name || row.product || "", plugin)) || null;
}

function hasText(value, min = 8) {
  return String(value || "").trim().length >= min;
}

function check(status, reason, weight = 1) {
  return { status, reason, weight };
}

function scoreFor(checks) {
  let score = 0;
  let max = 0;
  for (const item of Object.values(checks)) {
    max += item.weight || 1;
    if (item.status === "complete") score += item.weight || 1;
    else if (item.status === "partial") score += (item.weight || 1) / 2;
  }
  return {
    score,
    max,
    pct: max ? Math.round((score / max) * 100) : 0,
  };
}

async function profileFileCheck(args, kit) {
  const file = path.join(args.pluginDir, `${kit.slug || slugify(kit.plugin)}.md`);
  const text = await readText(file);
  if (!text) {
    return {
      file,
      ...check("missing", "Per-plugin growth file is missing."),
    };
  }
  const missing = PROFILE_SECTIONS.filter((section) => !text.includes(section));
  if (missing.length) {
    return {
      file,
      ...check("partial", `Growth file exists but is missing: ${missing.join(", ")}.`),
    };
  }
  return {
    file,
    ...check("complete", "Growth file has positioning, evidence, channels, assets, and next actions."),
  };
}

function marketplaceCheck(kit) {
  const market = kit.marketplace || {};
  const complete =
    hasText(market.title, 2) &&
    hasText(market.subtitle) &&
    Array.isArray(market.categories) && market.categories.length > 0 &&
    Array.isArray(market.description) && market.description.length >= 2 &&
    Array.isArray(market.bullets) && market.bullets.length >= 3 &&
    Array.isArray(market.screenshot_storyboard) && market.screenshot_storyboard.length >= 3 &&
    hasText(market.video_script) &&
    Array.isArray(market.faq) && market.faq.length >= 3;
  return check(complete ? "complete" : "partial", complete
    ? "Marketplace title, subtitle, category, description, screenshots, video, and FAQ are drafted."
    : "Marketplace kit exists but needs richer copy or visual/script coverage.");
}

function simpleAssetCheck(value, label) {
  const complete = hasText(value?.title || value?.short_description || value?.target || value?.subject || value);
  return check(complete ? "complete" : "missing", complete ? `${label} asset exists.` : `${label} asset is missing.`);
}

function communityCheck(kit) {
  const item = kit.community || {};
  const complete = hasText(item.title) && Array.isArray(item.body) && item.body.length >= 2 && hasText(item.primary_link);
  return check(complete ? "complete" : "partial", complete
    ? "Community post angle is drafted with discussion prompt and link gate."
    : "Community asset needs title, body, and primary-link gate.");
}

function customerCheck(kit, feedbackRows) {
  const item = kit.customer || {};
  const queue = findByPlugin(feedbackRows, kit.plugin);
  const templateReady = hasText(item.subject) && hasText(item.body);
  if (queue?.status === "ready_confirmation_required") {
    return check("complete", `Customer/support template exists and a real paid user is queued: ${queue.customer_name || queue.customer_email}.`);
  }
  if (templateReady) {
    return check("complete", queue?.status
      ? `Customer/support template exists; real-customer loop is ${queue.status}.`
      : "Customer/support template exists; no ready real-customer feedback loop is queued.");
  }
  return check("missing", "Customer/support template is missing.");
}

function trackingCheck(kit, landingRow) {
  const tracking = kit.tracking || {};
  const utm = tracking.utm || {};
  const hasKitTracking = hasText(tracking.campaign) && hasText(tracking.primary_metric) && hasText(utm.campaign);
  const hasLandingTracking =
    landingRow &&
    hasText(landingRow.campaign) &&
    landingRow.utm &&
    hasText(landingRow.tracked_marketplace_url) &&
    Array.isArray(landingRow.events) &&
    landingRow.events.length >= 2;
  if (hasKitTracking && hasLandingTracking) return check("complete", "UTM plan, primary metric, landing CTA, and events are specified.");
  if (hasKitTracking) return check("partial", "Asset-level tracking exists; landing/event baseline is not fully ready.");
  return check("missing", "Tracking campaign and UTM plan are missing.");
}

function landingCheck(landingRow) {
  if (!landingRow) return check("missing", "No landing/tracking baseline row exists.");
  const target = landingRow.proposed_url || landingRow.target_url || landingRow.external_action?.target || "";
  const concrete = isConcreteUrl(target);
  if (landingRow.status === "blocked") return check("partial", `Landing baseline is blocked: ${landingRow.current_issue || landingRow.reason || "see report"}.`);
  if (landingRow.status === "ready_to_spec" && concrete) return check("complete", `Landing baseline is ready with concrete URL ${target}.`);
  if (landingRow.status === "ready_to_spec") return check("partial", `Landing baseline spec exists but target URL is not concrete: ${target}.`);
  return check("partial", `Landing baseline status: ${landingRow.status || "unknown"}.`);
}

function experimentCheck(experiment) {
  if (!experiment) return check("missing", "No portfolio experiment row exists.");
  const complete = hasText(experiment.primary_metric) && hasText(experiment.review_windows, 2);
  return check(complete ? "complete" : "partial", complete
    ? `Experiment ${experiment.channel || ""} has primary metric and review windows.`
    : "Experiment exists but needs metric/review windows.");
}

function safetyCheck(kit, profile, experiment) {
  const text = `${profile?.blockers?.join(" ") || ""} ${experiment?.status || ""}`;
  const blocked = /blocked|warning|compliance|not serving|payment/i.test(text);
  const confirmation = kit.safety?.confirmation || experiment?.confirmation || "";
  if (blocked && confirmation) return check("complete", `Blocked/gated safely with confirmation phrase: ${confirmation}`);
  if (confirmation) return check("complete", `External action is gated by confirmation phrase: ${confirmation}`);
  return check("missing", "No action-time confirmation phrase found.");
}

function evidenceCheck(profile, actionRows) {
  const hasSignals = Array.isArray(profile?.signals) && profile.signals.length > 0;
  const action = actionRows.find((row) => samePlugin(`${row.campaign} ${row.target} ${row.note}`, profile?.name || ""));
  if (hasSignals && action) return check("complete", `Signals plus action-log evidence found (${action.campaign || action.type}).`);
  if (hasSignals) return check("partial", "Marketplace/public/revenue signals exist, but no plugin-specific action-log row matched.");
  return check("missing", "No current evidence signal found.");
}

function isConcreteUrl(value) {
  const text = String(value || "");
  return /^https?:\/\//i.test(text) && !text.includes("<") && !text.includes(">");
}

function blockersFor(profile, checks, actionRows, pluginName) {
  const blockers = [];
  for (const warning of openHostingWarningsForPlugin(actionRows, pluginName || profile?.name || "")) {
    blockers.push(hostingWarningBlocker(warning));
  }
  const profileBlockers = Array.isArray(profile?.blockers) ? profile.blockers : [];
  for (const item of profileBlockers) {
    if (/^no hard blocker recorded/i.test(String(item || ""))) continue;
    if (/blocked|warning|compliance|not serving|payment|checkout|tracking/i.test(item)) blockers.push(item);
  }
  for (const [id, item] of Object.entries(checks)) {
    if (item.status === "missing") blockers.push(`${id}: ${item.reason}`);
    else if (item.status === "partial" && PROMOTION_BLOCKING_CHECKS.has(id)) blockers.push(`${id}: ${item.reason}`);
  }
  return blockers;
}

function nextLocalStep(profile, checks) {
  const missing = Object.entries(checks).find(([, item]) => item.status === "missing");
  if (missing) return `Fill ${missing[0]}: ${missing[1].reason}`;
  const partialId = LOCAL_PARTIAL_ORDER.find((id) => checks[id]?.status === "partial");
  const partial = partialId ? [partialId, checks[partialId]] : null;
  if (partial) return `Improve ${partial[0]}: ${partial[1].reason}`;
  return Array.isArray(profile?.next_actions) ? profile.next_actions[0] || "Keep monitoring and review the next experiment window." : "Keep monitoring.";
}

function assetReadinessFor(checks) {
  const missing = ASSET_READINESS_CHECKS.filter((id) => checks[id]?.status !== "complete");
  return {
    ready: missing.length === 0,
    missing,
  };
}

function promotionReadyFor({ blockers, checks }) {
  return blockers.length === 0 && checks.landing_baseline.status === "complete" && checks.safety_gate.status === "complete";
}

function statusFor({ assetReady, promotionReady }) {
  if (!assetReady) return "asset_needs_work";
  if (!promotionReady) return "asset_ready_promotion_gated";
  return "asset_ready_promotion_ready";
}

function nextAssetStep(row) {
  if (!row.asset_ready) {
    const id = row.asset_missing_checks?.[0] || "asset";
    return `Fill ${id}: ${row.checks?.[id]?.reason || "asset readiness is incomplete."}`;
  }
  if (!row.promotion_ready) {
    return `Assets are ready; resolve promotion gate: ${row.top_blocker || row.next_local_step}`;
  }
  return row.next_local_step;
}

function assetRecommendation(rows) {
  const needsAssets = rows.filter((row) => !row.asset_ready);
  if (needsAssets.length) {
    const first = [...needsAssets].sort((a, b) => a.priority_rank - b.priority_rank || a.plugin.localeCompare(b.plugin))[0];
    return `Asset gap: ${first.plugin} needs ${first.asset_missing_checks.join(", ")}. Next local step: ${nextAssetStep(first)}`;
  }
  const gated = rows.filter((row) => !row.promotion_ready);
  if (gated.length) {
    const first = [...gated].sort((a, b) => a.priority_rank - b.priority_rank || a.plugin.localeCompare(b.plugin))[0];
    return `Promotion assets are complete for ${rows.length}/${rows.length} plugins; next execution gate: ${first.plugin} - ${first.top_blocker || first.next_local_step}`;
  }
  return "Promotion assets are complete and promotion-ready for all plugins; choose the smallest measurable experiment from the confirmation queue.";
}

async function buildReport({ args, portfolio, assetKits, experiments, landingBaseline, customerFeedback, actionRows }) {
  const profiles = Array.isArray(portfolio?.profiles) ? portfolio.profiles : [];
  const kits = Array.isArray(assetKits?.kits) ? assetKits.kits : [];
  const experimentRows = Array.isArray(experiments?.experiments) ? experiments.experiments : [];
  const landingRows = Array.isArray(landingBaseline?.rows) ? landingBaseline.rows : [];
  const feedbackRows = Array.isArray(customerFeedback?.items) ? customerFeedback.items : [];
  const rows = [];

  for (const kit of kits) {
    const profile = findByPlugin(profiles, kit.plugin) || {};
    const experiment = findByPlugin(experimentRows, kit.plugin);
    const landingRow = findByPlugin(landingRows, kit.plugin);
    const growthFile = await profileFileCheck(args, kit);
    const checks = {
      growth_file: growthFile,
      marketplace: marketplaceCheck(kit),
      community: communityCheck(kit),
      directory: simpleAssetCheck(kit.directory, "Directory"),
      partner: simpleAssetCheck(kit.partner, "Partner"),
      customer: customerCheck(kit, feedbackRows),
      demo_seo: check(hasText(kit.demo) && hasText(kit.seo) ? "complete" : "missing", hasText(kit.demo) && hasText(kit.seo) ? "Demo and SEO/AEO angle exist." : "Demo or SEO/AEO angle is missing."),
      tracking: trackingCheck(kit, landingRow),
      landing_baseline: landingCheck(landingRow),
      experiment_review: experimentCheck(experiment),
      safety_gate: safetyCheck(kit, profile, experiment),
      evidence: evidenceCheck(profile, actionRows),
    };
    const score = scoreFor(checks);
    const blockers = blockersFor(profile, checks, actionRows, kit.plugin);
    const assetReadiness = assetReadinessFor(checks);
    const promotionReady = promotionReadyFor({ blockers, checks });
    const coveragePct = assetReadiness.ready ? 100 : score.pct;
    rows.push({
      plugin: kit.plugin,
      slug: kit.slug || slugify(kit.plugin),
      marketplace_url: kit.marketplace_url || profile.marketplace_url || "",
      priority_rank: profile.priority?.rank ?? 99,
      priority: profile.priority?.label || "",
      score: score.score,
      max_score: score.max,
      coverage_pct: coveragePct,
      raw_coverage_pct: score.pct,
      status: statusFor({ assetReady: assetReadiness.ready, promotionReady }),
      asset_ready: assetReadiness.ready,
      asset_missing_checks: assetReadiness.missing,
      promotion_ready: promotionReady,
      external_action_allowed: kit.safety?.external_action_allowed === true,
      top_blocker: blockers[0] || "",
      next_local_step: nextLocalStep(profile, checks),
      checks,
    });
  }

  rows.sort((a, b) => a.priority_rank - b.priority_rank || b.coverage_pct - a.coverage_pct || a.plugin.localeCompare(b.plugin));
  const gated = rows.filter((row) => !row.external_action_allowed).length;
  return {
    generated_at: new Date().toISOString(),
    status: rows.length ? "ready" : "missing_asset_kits",
    recommendation: rows.length ? assetRecommendation(rows) : "Run pnpm lead:portfolio and pnpm lead:asset-kits first.",
    total_plugins: rows.length,
    gated_plugins: gated,
    covered_plugins: rows.filter((row) => row.asset_ready).length,
    asset_ready_plugins: rows.filter((row) => row.asset_ready).length,
    asset_needs_work_plugins: rows.filter((row) => !row.asset_ready).length,
    promotion_ready_plugins: rows.filter((row) => row.promotion_ready).length,
    promotion_gated_plugins: rows.filter((row) => !row.promotion_ready).length,
    checks: CHECKS,
    asset_checks: ASSET_READINESS_CHECKS,
    rows,
  };
}

function renderReport(report) {
  const lines = [
    "# Framer Asset Coverage",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Asset Readiness",
    "",
    `- Asset-ready plugins: ${report.asset_ready_plugins ?? report.covered_plugins}/${report.total_plugins}`,
    `- Asset-needs-work plugins: ${report.asset_needs_work_plugins ?? 0}`,
    `- Promotion-ready plugins: ${report.promotion_ready_plugins ?? 0}/${report.total_plugins}`,
    `- Promotion-gated plugins: ${report.promotion_gated_plugins ?? 0}`,
    "",
    "## Coverage Matrix",
    "",
    "| Plugin | Priority | Asset ready | Promotion ready | Coverage | Top blocker | Next local step |",
    "|---|---|---|---|---:|---|---|",
  ];
  for (const row of report.rows) {
    lines.push(`| ${link(row.plugin, row.marketplace_url)} | ${pipe(row.priority)} | ${row.asset_ready ? "yes" : "no"} | ${row.promotion_ready ? "yes" : "no"} | ${row.coverage_pct}% | ${pipe(row.top_blocker)} | ${pipe(nextAssetStep(row))} |`);
  }
  lines.push("", "## Check Details", "");
  for (const row of report.rows) {
    lines.push(`### ${row.plugin}`, "");
    lines.push("| Check | Status | Reason |");
    lines.push("|---|---|---|");
    for (const id of CHECKS) {
      const item = row.checks[id] || {};
      lines.push(`| ${id} | ${item.status || "missing"} | ${pipe(item.reason)} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function link(label, url) {
  return url ? `[${label}](${url})` : label;
}

function pipe(value) {
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
  const [portfolio, assetKits, experiments, landingBaseline, customerFeedback, actionRows] = await Promise.all([
    readJson(args.portfolio, null),
    readJson(args.assetKits, null),
    readJson(args.experiments, null),
    readJson(args.landingBaseline, null),
    readJson(args.customerFeedback, null),
    readRows(args.actions),
  ]);
  const report = await buildReport({ args, portfolio, assetKits, experiments, landingBaseline, customerFeedback, actionRows });
  await Promise.all([
    writeText(args.output, renderReport(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Asset coverage: ${args.output}\n`);
  process.stdout.write(`Status: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
