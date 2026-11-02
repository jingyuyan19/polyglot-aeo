#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_ASSET_KITS = ".tmp/framer-plugin-asset-kits.json";
const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_TARGETS = "tools/lead-finder/landing-targets.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-landing-baseline.md";
const DEFAULT_JSON = ".tmp/framer-landing-baseline.json";
const DEFAULT_OUT_DIR = "docs/growth/landing-baselines";

function usage() {
  return `
Usage:
  pnpm lead:landing-baseline

Options:
  --public-health <file> Public health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --asset-kits <file>    Plugin asset kits JSON. Default: ${DEFAULT_ASSET_KITS}
  --portfolio <file>     Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --targets <file>       Landing target registry CSV. Default: ${DEFAULT_TARGETS}
  --output <file>        Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>          JSON output. Default: ${DEFAULT_JSON}
  --out-dir <dir>        Per-plugin baseline docs dir. Default: ${DEFAULT_OUT_DIR}
  --help                 Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    publicHealth: DEFAULT_PUBLIC_HEALTH,
    assetKits: DEFAULT_ASSET_KITS,
    portfolio: DEFAULT_PORTFOLIO,
    targets: DEFAULT_TARGETS,
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
      "--public-health": "publicHealth",
      "--asset-kits": "assetKits",
      "--portfolio": "portfolio",
      "--targets": "targets",
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

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function samePlugin(left, right) {
  const a = slug(left)
    .replace(/-localization-hub$/, "")
    .replace(/-assistant$/, "");
  const b = slug(right)
    .replace(/-localization-hub$/, "")
    .replace(/-assistant$/, "");
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function kitByPlugin(assetKits) {
  const map = new Map();
  for (const kit of Array.isArray(assetKits?.kits) ? assetKits.kits : []) {
    map.set(kit.plugin, kit);
  }
  return map;
}

function profileByPlugin(portfolio) {
  const map = new Map();
  for (const profile of Array.isArray(portfolio?.profiles) ? portfolio.profiles : []) {
    map.set(profile.name, profile);
  }
  return map;
}

function shouldCreateBaseline(row) {
  return row.public_health_status === "needs_tracking_or_landing_baseline";
}

function marketplaceUrl(profile, publicHealthRow) {
  return profile?.marketplace_url || publicHealthRow?.marketplace_url || "";
}

function trackedMarketplaceUrl(baseUrl, campaign, content) {
  if (!baseUrl) return "";
  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", "owned_landing");
  url.searchParams.set("utm_medium", "landing_baseline");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", content);
  return url.href;
}

function baseDomain(plugin) {
  if (plugin === "Polyglot AEO") return "https://polyglotaeo.com";
  if (plugin === "Loka - Localization Hub") return "https://getloka.dev";
  return "https://<owned-domain>";
}

function targetForPlugin(plugin, targetRows) {
  const row = targetRows.find((item) => samePlugin(item.plugin || item.id || "", plugin));
  if (!row) return null;
  const status = String(row.status || "").trim() || "unreviewed";
  const targetUrl = String(row.target_url || "").trim();
  return {
    status,
    target_url: targetUrl,
    notes: row.notes || "",
    source: row.source || "landing-targets.local.csv",
    usable: Boolean(targetUrl) && !/disabled/i.test(status),
  };
}

function resolvePath(plugin, kit, targetRows) {
  const registered = targetForPlugin(plugin, targetRows);
  if (registered?.usable) return registered.target_url;
  const raw = kit?.landing?.url_path || `/${slug(plugin)}/`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${baseDomain(plugin)}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function confirmationFor(plugin) {
  return `确认创建 ${plugin} landing/tracking baseline`;
}

function buildBaseline({ publicHealth, assetKits, portfolio, targetRows, targetRegistryFile }) {
  const kits = kitByPlugin(assetKits);
  const profiles = profileByPlugin(portfolio);
  const publicRows = Array.isArray(publicHealth?.profiles) ? publicHealth.profiles : [];

  const rows = publicRows.map((publicRow) => {
    const plugin = publicRow.name;
    const profile = profiles.get(plugin) || null;
    const kit = kits.get(plugin) || null;
    const campaign = kit?.tracking?.campaign || `${slug(plugin)}_landing_baseline`;
    const target = targetForPlugin(plugin, targetRows);
    const url = resolvePath(plugin, kit, targetRows);
    const content = slug(kit?.landing?.headline || plugin);
    const trackedMarketplace = trackedMarketplaceUrl(marketplaceUrl(profile, publicRow), campaign, content);
    const blocked = publicRow.status === "blocked";
    const needsBaseline = shouldCreateBaseline({
      public_health_status: publicRow.status,
    });
    return {
      plugin,
      id: publicRow.id || slug(plugin),
      status: blocked ? "blocked" : needsBaseline ? "ready_to_spec" : "already_has_public_surface",
      priority: priorityFor({ plugin, profile, needsBaseline, blocked }),
      public_health_status: publicRow.status,
      current_issue: publicRow.blockers?.[0] || publicRow.gaps?.[0] || "",
      proposed_url: url,
      target_source: target?.usable ? "landing_target_registry" : "asset_kit_default",
      target_registry_status: target?.status || "missing",
      target_registry_notes: target?.notes || "",
      headline: kit?.landing?.headline || `${plugin} for Framer`,
      sections: kit?.landing?.sections || [],
      campaign,
      primary_metric: kit?.tracking?.primary_metric || "Marketplace users/opens lift or one qualified user reply.",
      utm: {
        source: "owned_landing",
        medium: "landing_baseline",
        campaign,
        content,
      },
      tracked_marketplace_url: trackedMarketplace,
      events: [
        `${slug(plugin)}_landing_view`,
        `${slug(plugin)}_marketplace_click`,
        `${slug(plugin)}_install_click`,
      ],
      acceptance_criteria: acceptanceCriteria({ plugin, blocked, needsBaseline }),
      confirmation: confirmationFor(plugin),
      external_action: {
        action: "Create or deploy a small owned landing/tutorial page and wire tracked CTA links.",
        target: url,
        risk: blocked
          ? "Promotion can worsen payment/compliance risk until blockers are resolved."
          : "A thin page without useful tutorial content may add noise instead of qualified installs.",
        expected_benefit: "Gives Marketplace traffic a measurable owned-page source and a reusable tutorial/SEO asset.",
        confirmation: confirmationFor(plugin),
        verification: "URL returns 200, tracked Marketplace CTA includes UTM params, baseline Marketplace snapshot is recorded, and action log contains deployment evidence.",
      },
    };
  }).sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.priority - b.priority || a.plugin.localeCompare(b.plugin));

  const ready = rows.filter((row) => row.status === "ready_to_spec");
  const blocked = rows.filter((row) => row.status === "blocked");

  return {
    generated_at: new Date().toISOString(),
    status: ready.length ? "ready_confirmation_required" : blocked.length ? "blocked" : "no_missing_baseline",
    target_registry: {
      file: targetRegistryFile,
      rows: targetRows.length,
      concrete_targets: targetRows.filter((row) => String(row.target_url || "").trim()).length,
    },
    ready_count: ready.length,
    blocked_count: blocked.length,
    recommendation: recommendationFor({ ready, blocked }),
    rows,
  };
}

function priorityFor({ plugin, profile, needsBaseline, blocked }) {
  if (blocked) return 90;
  if (plugin === "Ally Auditor") return 1;
  if (plugin === "Gaode Maps") return 2;
  if (needsBaseline) return 3;
  return profile?.priority?.rank || 50;
}

function acceptanceCriteria({ plugin, blocked, needsBaseline }) {
  if (blocked) {
    return [
      "Resolve current public-health blocker before publishing or promoting this page.",
      "Run pnpm lead:public-health and confirm status is no longer blocked.",
      "Only then prepare a fresh confirmation packet before any deploy.",
    ];
  }
  if (!needsBaseline) {
    return [
      "Existing public surface remains reachable.",
      "CTA links keep UTM campaign attribution.",
      "Marketplace snapshot is recorded before and after major traffic pushes.",
    ];
  }
  return [
    `Create one focused ${plugin} landing or tutorial page, not a broad marketing site.`,
    "Primary CTA points to the Framer Marketplace listing with UTM params.",
    "Record Marketplace public snapshot before publishing and again at 24h/7d.",
    "Record the deploy/publish evidence in tools/lead-finder/actions.local.csv.",
    "Do not publish without the exact confirmation phrase.",
  ];
}

function recommendationFor({ ready, blocked }) {
  if (ready.length) {
    return `Prepare ${ready[0].plugin} landing/tracking baseline first; use exact confirmation before deploying.`;
  }
  if (blocked.length) return `Resolve ${blocked[0].plugin} blocker before creating or promoting more public traffic.`;
  return "All tracked plugins either have a public surface or no landing baseline is currently required.";
}

function statusRank(status) {
  const ranks = {
    ready_to_spec: 1,
    blocked: 2,
    already_has_public_surface: 3,
  };
  return ranks[status] || 9;
}

function renderMarkdown(report) {
  const lines = [
    "# Landing And Tracking Baseline",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Ready: ${report.ready_count}`,
    `Blocked: ${report.blocked_count}`,
    `Landing target registry: ${report.target_registry?.file || "missing"} (${report.target_registry?.concrete_targets ?? 0}/${report.target_registry?.rows ?? 0} concrete targets)`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Baselines",
    "",
    "| Status | Plugin | Proposed URL | Source | Campaign | Metric | Confirmation |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const row of report.rows) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.plugin)} | ${pipe(row.proposed_url)} | ${pipe(row.target_source)} | ${pipe(row.campaign)} | ${pipe(row.primary_metric)} | ${pipe(row.confirmation)} |`);
  }

  lines.push("", "## Details", "");
  for (const row of report.rows) {
    lines.push(`### ${row.plugin}`, "");
    lines.push(`- Status: ${row.status}`);
    lines.push(`- Public health: ${row.public_health_status}`);
    if (row.current_issue) lines.push(`- Current issue: ${row.current_issue}`);
    lines.push(`- Proposed URL: ${row.proposed_url}`);
    lines.push(`- Target source: ${row.target_source}`);
    lines.push(`- Target registry status: ${row.target_registry_status}${row.target_registry_notes ? ` (${row.target_registry_notes})` : ""}`);
    lines.push(`- Headline: ${row.headline}`);
    lines.push(`- Primary metric: ${row.primary_metric}`);
    lines.push(`- Confirmation: ${row.confirmation}`);
    lines.push(`- Tracked Marketplace CTA: ${row.tracked_marketplace_url || "missing Marketplace URL"}`);
    lines.push("", "Sections:");
    for (const section of row.sections) lines.push(`- ${section}`);
    lines.push("", "Events:");
    for (const event of row.events) lines.push(`- ${event}`);
    lines.push("", "Acceptance criteria:");
    for (const item of row.acceptance_criteria) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push(
    "## Safety",
    "",
    "- This report does not deploy, publish, submit, or modify payment settings.",
    "- Any landing page creation/deploy is an external action and requires the listed confirmation phrase.",
    "- Do not create new traffic for blocked payment/compliance plugins until their blockers are resolved.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function renderPluginMarkdown(row) {
  const lines = [
    `# ${row.plugin} Landing Baseline`,
    "",
    `Status: ${row.status}`,
    `Proposed URL: ${row.proposed_url}`,
    `Target source: ${row.target_source}`,
    `Target registry status: ${row.target_registry_status}${row.target_registry_notes ? ` (${row.target_registry_notes})` : ""}`,
    `Campaign: ${row.campaign}`,
    `Confirmation: ${row.confirmation}`,
    "",
    "## Positioning",
    "",
    row.headline,
    "",
    "## Page Sections",
    "",
    ...row.sections.map((section) => `- ${section}`),
    "",
    "## Tracking",
    "",
    `- Primary metric: ${row.primary_metric}`,
    `- UTM source: ${row.utm.source}`,
    `- UTM medium: ${row.utm.medium}`,
    `- UTM campaign: ${row.utm.campaign}`,
    `- UTM content: ${row.utm.content}`,
    `- Tracked Marketplace CTA: ${row.tracked_marketplace_url || "missing Marketplace URL"}`,
    "",
    "## Events",
    "",
    ...row.events.map((event) => `- ${event}`),
    "",
    "## Acceptance Criteria",
    "",
    ...row.acceptance_criteria.map((item) => `- ${item}`),
    "",
    "## External Action Gate",
    "",
    `- Action: ${row.external_action.action}`,
    `- Target: ${row.external_action.target}`,
    `- Risk: ${row.external_action.risk}`,
    `- Expected benefit: ${row.external_action.expected_benefit}`,
    `- Confirmation phrase: ${row.external_action.confirmation}`,
    `- Verification: ${row.external_action.verification}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "")
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, " ")
    .trim();
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function writePluginDocs(report, outDir) {
  await mkdir(outDir, { recursive: true });
  await Promise.all(
    report.rows.map((row) =>
      writeText(path.join(outDir, `${row.id || slug(row.plugin)}.md`), renderPluginMarkdown(row)),
    ),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const [publicHealth, assetKits, portfolio, targetRows] = await Promise.all([
    readJson(args.publicHealth, null),
    readJson(args.assetKits, null),
    readJson(args.portfolio, null),
    readRows(args.targets),
  ]);
  const report = buildBaseline({ publicHealth, assetKits, portfolio, targetRows, targetRegistryFile: args.targets });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
    writePluginDocs(report, args.outDir),
  ]);

  process.stdout.write(`Landing baseline: ${args.output}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
