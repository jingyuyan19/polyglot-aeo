#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ASSET_KITS = ".tmp/framer-plugin-asset-kits.json";
const DEFAULT_LANDING_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_OWNED_SITE_IMPLEMENTATION = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_OUTPUT = ".tmp/framer-use-case-page-brief.md";
const DEFAULT_JSON = ".tmp/framer-use-case-page-brief.json";
const DEFAULT_OUT_DIR = "docs/growth/use-cases";

function usage() {
  return `
Usage:
  pnpm lead:use-case-pages

Options:
  --asset-kits <file>          Plugin asset kits JSON. Default: ${DEFAULT_ASSET_KITS}
  --landing-baseline <file>    Landing baseline JSON. Default: ${DEFAULT_LANDING_BASELINE}
  --owned-site-implementation <file> Owned site implementation JSON. Default: ${DEFAULT_OWNED_SITE_IMPLEMENTATION}
  --public-health <file>       Public health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --output <file>              Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                JSON output. Default: ${DEFAULT_JSON}
  --out-dir <dir>              Per-plugin use-case briefs. Default: ${DEFAULT_OUT_DIR}
  --help                       Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    assetKits: DEFAULT_ASSET_KITS,
    landingBaseline: DEFAULT_LANDING_BASELINE,
    ownedSiteImplementation: DEFAULT_OWNED_SITE_IMPLEMENTATION,
    publicHealth: DEFAULT_PUBLIC_HEALTH,
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
      "--asset-kits": "assetKits",
      "--landing-baseline": "landingBaseline",
      "--owned-site-implementation": "ownedSiteImplementation",
      "--public-health": "publicHealth",
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

function absoluteUseCaseUrl(landing, kit) {
  const kitPath = kit?.landing?.url_path || "";
  if (/^https?:\/\//i.test(kitPath)) return kitPath;
  const base = landing?.proposed_url || "";
  if (!/^https?:\/\//i.test(base)) return kitPath || "";
  try {
    const url = new URL(base);
    const pathName = kitPath || `/${slug(kit?.seo || kit?.plugin || "use-case")}/`;
    url.pathname = pathName.startsWith("/") ? pathName : `/${pathName}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return kitPath || base;
  }
}

function statusFor({ landing, implementation, health }) {
  const blockers = [
    ...(Array.isArray(health?.blockers) ? health.blockers.map((item) => `Public health: ${item}`) : []),
    landing?.status === "blocked" ? `Landing baseline: ${landing.current_issue || "blocked"}` : "",
    implementation?.status && /^blocked/.test(implementation.status) ? `Owned site implementation: ${implementation.next_local_step || implementation.status}` : "",
  ].filter(Boolean);
  const text = blockers.join(" ");
  if (/compliance|Creem|unregistered|off-boarding/i.test(text)) return { status: "blocked_by_compliance", blockers };
  if (/checkout|payment|license|worker|legacy|custom domain|not reachable|not serving/i.test(text)) return { status: "blocked_by_checkout", blockers };
  if (blockers.length) return { status: "blocked_prepare_only", blockers };
  if (landing?.status === "ready_to_spec" && implementation?.status === "ready_confirmation_required") {
    return { status: "ready_confirmation_required", blockers: [] };
  }
  if (landing?.status === "ready_to_spec") return { status: "ready_local_copy", blockers: [] };
  return { status: "prepare_local_copy", blockers: [] };
}

function metaDescription(kit, landing) {
  const sections = landing?.sections || kit?.landing?.sections || [];
  const problem = sections.find((item) => /^Problem:/i.test(item)) || sections[0] || "";
  const workflow = sections.find((item) => /^Workflow:/i.test(item)) || sections[1] || "";
  return `${stripLabel(problem)} ${stripLabel(workflow)}`.replace(/\s+/g, " ").trim().slice(0, 155);
}

function stripLabel(value) {
  return String(value || "").replace(/^[A-Z][A-Za-z /-]+:\s*/, "").trim();
}

function sectionRows(kit, landing) {
  const source = landing?.sections?.length ? landing.sections : kit?.landing?.sections || [];
  const base = source.map((item) => {
    const [label, ...rest] = String(item || "").split(":");
    const hasLabel = rest.length > 0 && label.length < 30;
    return {
      h2: hasLabel ? label.trim() : item,
      angle: hasLabel ? rest.join(":").trim() : item,
    };
  });
  return [
    ...base,
    {
      h2: "What the plugin does",
      angle: (kit?.marketplace?.bullets || []).join(" "),
    },
    {
      h2: "When to use it",
      angle: kit?.demo || kit?.seo || "",
    },
    {
      h2: "Install and measure",
      angle: "Use the tracked Framer Marketplace CTA and review same-day, 24h, 48h, and 7d signals before scaling.",
    },
  ].filter((row) => row.h2 && row.angle);
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function recordCommand(item) {
  if (item.status !== "ready_confirmation_required") return "";
  return [
    "pnpm lead:actions -- --add",
    "--type use_case_page",
    "--channel owned_seo",
    `--campaign ${shellQuote(item.campaign)}`,
    "--status done",
    `--target ${shellQuote(`${item.plugin} use-case page: ${item.url}`)}`,
    `--evidence ${shellQuote(`${item.url}; ${item.primary_cta_url}; .tmp/framer-use-case-page-brief.md`)}`,
    `--note ${shellQuote(`${item.plugin} SEO/use-case page published after explicit confirmation; review same-day/24h/48h/7d.`)}`,
  ].join(" ");
}

function verificationCommands(item) {
  const commands = [
    "pnpm lead:use-case-pages",
    "pnpm lead:owned-sites",
    "pnpm lead:owned-site-implementation",
    "pnpm lead:portfolio-ops -- --skip-signals",
  ];
  if (item.url && item.campaign) {
    commands.unshift(`curl -L --silent ${shellQuote(item.url)} | rg ${shellQuote(`utm_campaign=${item.campaign}`)}`);
  }
  return commands;
}

function buildItem({ kit, landing, implementation, health }) {
  const status = statusFor({ landing, implementation, health });
  const url = absoluteUseCaseUrl(landing, kit);
  const campaign = landing?.campaign || kit?.tracking?.campaign || `${slug(kit.plugin)}_use_case`;
  const item = {
    plugin: kit.plugin,
    status: status.status,
    url,
    marketplace_url: kit.marketplace_url || "",
    target_keyword: kit.seo || kit.landing?.headline || kit.plugin,
    search_intent: "Framer builder looking for a practical workflow, checklist, or implementation path.",
    title: `${kit.seo || kit.landing?.headline || kit.plugin} | ${kit.plugin}`,
    meta_description: metaDescription(kit, landing),
    h1: landing?.headline || kit.landing?.headline || kit.seo || kit.plugin,
    campaign,
    primary_cta_url: implementation?.primary_cta_url || landing?.tracked_marketplace_url || kit.marketplace_url || "",
    primary_cta_label: implementation?.primary_cta_label || `Get ${kit.plugin}`,
    confirmation: useCaseConfirmation(kit.plugin),
    supporting_confirmation: landing?.confirmation || implementation?.confirmation || kit.experiment?.confirmation || "",
    risk: landing?.external_action?.risk || implementation?.risk || "A thin page can add traffic without useful install intent if the workflow and CTA are weak.",
    expected_benefit: "Creates a searchable owned surface with measurable Marketplace click-through before scaling Community, directory, or partner traffic.",
    verification: "URL returns 200, page contains the target keyword, primary CTA has UTM params, owned-site audit sees the campaign, and action log records evidence after confirmation.",
    sections: sectionRows(kit, landing),
    related_links: implementation?.related_plugin_links || [],
    blocked_related_links: implementation?.blocked_related_plugin_links || [],
    blockers: status.blockers,
    acceptance_criteria: acceptanceCriteria(status.status),
  };
  item.record_command = recordCommand(item);
  item.verification_commands = verificationCommands(item);
  item.next_local_step = nextLocalStep(item);
  return item;
}

function useCaseConfirmation(plugin) {
  const map = {
    "Ally Auditor": "确认发布 Ally Auditor use-case page",
    "Gaode Maps": "确认发布 Gaode Maps tutorial/use-case page",
    "Polyglot AEO": "确认发布 Polyglot AEO use-case page",
    "Loka - Localization Hub": "确认发布 Loka use-case page",
  };
  return map[plugin] || `确认发布 ${plugin} use-case page`;
}

function acceptanceCriteria(status) {
  if (/^blocked/.test(status)) {
    return [
      "Keep the page as a local brief only.",
      "Resolve the payment/compliance/public-health blocker first.",
      "Rerun use-case page, owned-site implementation, and public-health reports before asking for confirmation.",
    ];
  }
  return [
    "Page answers one concrete Framer use case, not a broad landing page.",
    "Primary CTA points to Framer Marketplace with UTM params.",
    "No direct Creem checkout link is added or changed.",
    "Page has one primary target keyword and one measurable Marketplace click path.",
    "Action log records the publish/update evidence only after explicit confirmation.",
  ];
}

function nextLocalStep(item) {
  if (item.status === "ready_confirmation_required") {
    return `Prepare ${item.plugin} use-case page locally; publish only after exact confirmation: ${item.confirmation}.`;
  }
  if (item.status === "ready_local_copy") {
    return `Keep ${item.plugin} use-case copy local until the owned-site implementation packet is ready.`;
  }
  if (/^blocked/.test(item.status)) {
    return `Hold ${item.plugin} use-case traffic: ${item.blockers[0] || "blocker still open"}`;
  }
  return `Refresh asset kit and landing baseline for ${item.plugin}.`;
}

function build({ assetKits, landingBaseline, ownedSiteImplementation, publicHealth }) {
  const kits = Array.isArray(assetKits?.kits) ? assetKits.kits : [];
  const landingRows = Array.isArray(landingBaseline?.rows) ? landingBaseline.rows : [];
  const implementationRows = Array.isArray(ownedSiteImplementation?.items) ? ownedSiteImplementation.items : [];
  const healthRows = Array.isArray(publicHealth?.profiles) ? publicHealth.profiles : [];
  const items = kits.map((kit) => buildItem({
    kit,
    landing: byPlugin(landingRows, kit.plugin),
    implementation: byPlugin(implementationRows, kit.plugin),
    health: byPlugin(healthRows, kit.plugin),
  })).sort((a, b) => priority(a) - priority(b) || a.plugin.localeCompare(b.plugin));
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const firstReady = items.find((item) => item.status === "ready_confirmation_required");
  return {
    generated_at: new Date().toISOString(),
    status: items.length ? "ready" : "missing_asset_kits",
    recommendation: firstReady
      ? `Prepare ${firstReady.plugin} use-case page first; external publish still requires confirmation: ${firstReady.confirmation || "required"}.`
      : "No use-case page is ready for external publishing; keep blocked pages local and resolve gates first.",
    counts,
    items,
    guardrails: [
      "Local-only: this brief does not publish pages, deploy sites, submit forms, send Gmail, upload Marketplace files, or modify payment settings.",
      "Blocked payment/compliance plugins remain local-only until their gates clear.",
      "Every external page update requires the exact confirmation phrase and post-update action-log evidence.",
    ],
  };
}

function priority(item) {
  const statusRank = {
    ready_confirmation_required: 1,
    ready_local_copy: 2,
    prepare_local_copy: 3,
    blocked_by_checkout: 8,
    blocked_by_compliance: 9,
    blocked_prepare_only: 10,
  }[item.status] || 11;
  const pluginRank = {
    "Ally Auditor": 1,
    "Gaode Maps": 2,
    "Polyglot AEO": 3,
    "Loka - Localization Hub": 4,
  }[item.plugin] || 9;
  return statusRank * 10 + pluginRank;
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Plugin Use-Case Page Brief",
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
    `- Ready local copy: ${report.counts.ready_local_copy || 0}`,
    `- Blocked by checkout: ${report.counts.blocked_by_checkout || 0}`,
    `- Blocked by compliance: ${report.counts.blocked_by_compliance || 0}`,
    "",
    "| Status | Plugin | URL | Target keyword | Confirmation |",
    "|---|---|---|---|---|",
  ];
  for (const item of report.items) {
    lines.push(`| ${clean(item.status)} | ${clean(item.plugin)} | ${clean(item.url)} | ${clean(item.target_keyword)} | ${clean(item.confirmation)} |`);
  }

  lines.push("", "## Page Briefs", "");
  for (const item of report.items) lines.push(...renderItem(item));
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
    `- URL: ${item.url || "n/a"}`,
    `- Target keyword: ${item.target_keyword}`,
    `- Search intent: ${item.search_intent}`,
    `- Title: ${item.title}`,
    `- Meta description: ${item.meta_description}`,
    `- H1: ${item.h1}`,
    `- Campaign: ${item.campaign}`,
    `- CTA: ${item.primary_cta_label} -> ${item.primary_cta_url || "n/a"}`,
    `- Confirmation phrase: ${item.confirmation || "none"}`,
    `- Risk: ${item.risk}`,
    `- Expected benefit: ${item.expected_benefit}`,
    `- Verification: ${item.verification}`,
    `- Next local step: ${item.next_local_step}`,
    "",
    "Outline:",
  ];
  for (const section of item.sections) lines.push(`- ${section.h2}: ${section.angle}`);
  if (item.related_links.length) {
    lines.push("", "Related-plugin links:");
    for (const link of item.related_links) {
      lines.push(`- ${link.target_plugin}: ${link.link_label} (${link.campaign})`);
    }
  }
  if (item.blocked_related_links.length) {
    lines.push("", "Blocked related-plugin links:");
    for (const link of item.blocked_related_links) {
      lines.push(`- ${link.target_plugin}: ${link.status}; ${link.reason}`);
    }
  }
  lines.push("", "Acceptance criteria:");
  for (const criterion of item.acceptance_criteria) lines.push(`- ${criterion}`);
  if (item.record_command) {
    lines.push("", "Record command after confirmed external change:", "```bash", item.record_command, "```");
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

async function writePerPluginBriefs(report, outDir) {
  await mkdir(outDir, { recursive: true });
  await Promise.all(report.items.map((item) => {
    const text = [
      `# ${item.plugin} Use-Case Page Brief`,
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
    assetKits,
    landingBaseline,
    ownedSiteImplementation,
    publicHealth,
  ] = await Promise.all([
    readJson(args.assetKits, null),
    readJson(args.landingBaseline, null),
    readJson(args.ownedSiteImplementation, null),
    readJson(args.publicHealth, null),
  ]);

  const report = build({ assetKits, landingBaseline, ownedSiteImplementation, publicHealth });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
    writePerPluginBriefs(report, args.outDir),
  ]);

  process.stdout.write(`Use-case page brief: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
  process.stdout.write(`Per-plugin briefs: ${args.outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
