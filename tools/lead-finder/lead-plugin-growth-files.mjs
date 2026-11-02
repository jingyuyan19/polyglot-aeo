#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_CONFIRMATIONS = ".tmp/framer-confirmation-queue.json";
const DEFAULT_EXPERIMENTS = ".tmp/framer-experiment-decision-brief.json";
const DEFAULT_PROOF_GAPS = ".tmp/framer-proof-gap-queue.json";
const DEFAULT_OWNED_IMPL = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_USE_CASES = ".tmp/framer-use-case-page-brief.json";
const DEFAULT_CROSS_PROMO = ".tmp/framer-cross-promotion-matrix.json";
const DEFAULT_DAILY_CONSISTENCY = ".tmp/framer-daily-action-consistency.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_PLUGIN_DIR = "docs/growth/plugins";
const DEFAULT_OUTPUT = ".tmp/framer-plugin-growth-files.md";
const DEFAULT_JSON = ".tmp/framer-plugin-growth-files.json";

function usage() {
  return `
Usage:
  pnpm lead:plugin-growth-files

Options:
  --portfolio <file>          Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --confirmations <file>      Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATIONS}
  --experiments <file>        Experiment decision brief JSON. Default: ${DEFAULT_EXPERIMENTS}
  --proof-gaps <file>         Proof gap queue JSON. Default: ${DEFAULT_PROOF_GAPS}
  --owned-impl <file>         Owned-site implementation JSON. Default: ${DEFAULT_OWNED_IMPL}
  --use-cases <file>          Use-case page brief JSON. Default: ${DEFAULT_USE_CASES}
  --cross-promo <file>        Cross-promotion matrix JSON. Default: ${DEFAULT_CROSS_PROMO}
  --daily-consistency <file>  Daily consistency JSON. Default: ${DEFAULT_DAILY_CONSISTENCY}
  --actions <file>            Action log CSV. Default: ${DEFAULT_ACTIONS}
  --plugin-dir <dir>          Per-plugin growth file directory. Default: ${DEFAULT_PLUGIN_DIR}
  --output <file>             Markdown summary output. Default: ${DEFAULT_OUTPUT}
  --json <file>               JSON output. Default: ${DEFAULT_JSON}
  --help                      Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    portfolio: DEFAULT_PORTFOLIO,
    confirmations: DEFAULT_CONFIRMATIONS,
    experiments: DEFAULT_EXPERIMENTS,
    proofGaps: DEFAULT_PROOF_GAPS,
    ownedImpl: DEFAULT_OWNED_IMPL,
    useCases: DEFAULT_USE_CASES,
    crossPromo: DEFAULT_CROSS_PROMO,
    dailyConsistency: DEFAULT_DAILY_CONSISTENCY,
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
      "--confirmations": "confirmations",
      "--experiments": "experiments",
      "--proof-gaps": "proofGaps",
      "--owned-impl": "ownedImpl",
      "--use-cases": "useCases",
      "--cross-promo": "crossPromo",
      "--daily-consistency": "dailyConsistency",
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

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function short(value, max = 180) {
  const text = clean(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pluginTerms(profile) {
  const text = `${profile?.id || ""} ${profile?.slug || ""} ${profile?.name || ""}`.toLowerCase();
  if (/polyglot/.test(text)) return ["polyglot", "polyglot aeo", "polyglotaeo", "framer_aeo"];
  if (/ally/.test(text)) return ["ally", "ally auditor", "allyauditor"];
  if (/loka/.test(text)) return ["loka", "loka pro", "getloka", "localization hub"];
  if (/gaode|amap/.test(text)) return ["gaode", "gaode maps", "gaodemaps", "amap"];
  return [String(profile?.name || "").toLowerCase()].filter(Boolean);
}

function samePlugin(profile, value) {
  const haystack = String(value || "").toLowerCase();
  if (!haystack) return false;
  return pluginTerms(profile).some((term) => haystack.includes(term));
}

function rowMatchesProfile(profile, row, fields) {
  return fields.some((field) => samePlugin(profile, row?.[field]));
}

function actionMatchesProfile(profile, row) {
  const text = [
    row.type,
    row.channel,
    row.campaign,
    row.status,
    row.target,
    row.evidence,
    row.note,
  ].join(" ");
  return samePlugin(profile, text);
}

function recentActions(profile, rows) {
  return [...rows]
    .filter((row) => actionMatchesProfile(profile, row))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.__index || 0) - Number(a.__index || 0))
    .slice(0, 8);
}

function proofGapMatchesProfile(profile, row) {
  if (samePlugin(profile, row?.primary_confirmation?.plugin)) return true;
  if ((row?.candidate_confirmations || []).some((item) => samePlugin(profile, item.plugin))) return true;
  if ((row?.blockers || []).some((item) => samePlugin(profile, item.plugin))) return true;
  return false;
}

function buildPluginReport(profile, sources) {
  const confirmations = (sources.confirmations?.rows || []).filter((row) => samePlugin(profile, row.plugin));
  const experiments = (sources.experiments?.rows || []).filter((row) => samePlugin(profile, row.plugin));
  const ownedImpl = (sources.ownedImpl?.items || []).filter((row) => samePlugin(profile, row.plugin));
  const useCases = (sources.useCases?.items || []).filter((row) => samePlugin(profile, row.plugin));
  const crossPromo = (sources.crossPromo?.rows || []).filter((row) => samePlugin(profile, row.source_plugin) || samePlugin(profile, row.target_plugin));
  const proofGaps = (sources.proofGaps?.rows || []).filter((row) => proofGapMatchesProfile(profile, row));
  const actions = recentActions(profile, sources.actions || []);
  const canonicalConfirmation = sources.dailyConsistency?.canonical?.confirmation || sources.confirmations?.next_confirmation || "";
  const isTopPlugin = confirmations.some((row) => row.confirmation && row.confirmation === canonicalConfirmation) ||
    experiments.some((row) => row.confirmation && row.confirmation === canonicalConfirmation);
  const readyConfirmations = confirmations.filter((row) => row.readiness === "ready_confirmation_required");
  const blockedConfirmations = confirmations.filter((row) => row.readiness && row.readiness !== "ready_confirmation_required");
  const status = profile.public_health?.status || "not_refreshed";
  const nextConfirmation = (readyConfirmations.find((row) => row.confirmation === canonicalConfirmation) || readyConfirmations[0] || confirmations[0] || null)?.confirmation || "";

  return {
    slug: profile.slug,
    name: profile.name,
    status,
    marketplace_url: profile.marketplace_url,
    priority: profile.priority,
    is_top_plugin: isTopPlugin,
    canonical_confirmation: canonicalConfirmation,
    next_confirmation: nextConfirmation,
    counts: {
      confirmations: confirmations.length,
      ready_confirmations: readyConfirmations.length,
      blocked_confirmations: blockedConfirmations.length,
      experiments: experiments.length,
      proof_gaps: proofGaps.length,
      owned_impl: ownedImpl.length,
      use_cases: useCases.length,
      cross_promo: crossPromo.length,
      recent_actions: actions.length,
    },
    profile,
    confirmations,
    experiments,
    owned_impl: ownedImpl,
    use_cases: useCases,
    cross_promo: crossPromo,
    proof_gaps: proofGaps,
    recent_actions: actions,
  };
}

function revenueSummary(profile) {
  const rows = Array.isArray(profile.external_revenue_rows) ? profile.external_revenue_rows : [];
  if (!rows.length) return "No external revenue imported yet.";
  const amount = rows.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  return `${rows.length} external payment(s), $${amount.toFixed(2)}.`;
}

function creatorSummary(profile) {
  const snapshot = profile.creator_snapshot;
  if (!snapshot) return "No Creator Space snapshot imported.";
  return `users ${snapshot.users || "?"}, opens ${snapshot.opens || "?"}, version ${snapshot.version || "?"}, updated ${snapshot.updated || "?"}, captured ${snapshot.date || "unknown"}.`;
}

function renderPlugin(report, generatedAt) {
  const profile = report.profile;
  const lines = [
    `# ${report.name} Growth File`,
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Operator Summary",
    "",
    `- Marketplace: ${profile.marketplace_url}`,
    `- Status: live public page ${profile.marketplace?.ok ? "verified" : "not verified"}; public health ${profile.public_health?.status || "not refreshed"}`,
    `- Priority: ${profile.priority?.rank || "?"}. ${profile.priority?.label || "unranked"}${report.is_top_plugin ? " (current top operator action)" : ""}`,
    `- Creator Space: ${creatorSummary(profile)}`,
    `- Revenue/customer evidence: ${revenueSummary(profile)}`,
    `- Next confirmation: ${report.next_confirmation || "none currently ready"}`,
    `- Canonical portfolio confirmation: ${report.canonical_confirmation || "none"}`,
    "",
    "## Positioning",
    "",
    `- ICP: ${profile.icp}`,
    `- Core pain: ${profile.pain}`,
    `- One-line positioning: ${profile.positioning}`,
    `- Free value: ${profile.free_value}`,
    `- Paid value: ${profile.paid_value}`,
    `- Best channels: ${(profile.best_channels || []).join(", ")}`,
    "",
    "## Current Evidence",
    "",
    ...(profile.signals || []).map((item) => `- ${item}`),
    ...(profile.signals?.length ? [] : ["- No imported signal yet."]),
    "",
    "## Blockers",
    "",
    ...(profile.blockers || []).map((item) => `- ${item}`),
    ...(profile.blockers?.length ? [] : ["- None recorded."]),
    "",
    "## Confirmation Gates",
    "",
  ];

  if (report.confirmations.length) {
    lines.push("| Readiness | Channel | Target | Confirmation | Risk | Verification |", "|---|---|---|---|---|---|");
    for (const row of report.confirmations) {
      lines.push(`| ${clean(row.readiness || row.status)} | ${clean(row.channel || row.kind)} | ${clean(short(row.target, 80))} | ${clean(row.confirmation)} | ${clean(short(row.risk, 120))} | ${clean(short(row.verification, 140))} |`);
    }
  } else {
    lines.push("- No confirmation-gated action in the current queue.");
  }

  lines.push("", "## Experiment Decisions", "");
  if (report.experiments.length) {
    lines.push("| Decision | Channel | Target | Next review | Confirmation | Continue / Stop / Scale |", "|---|---|---|---|---|---|");
    for (const row of report.experiments) {
      const review = row.next_review ? `${row.next_review.label || ""} ${row.next_review.date || ""}`.trim() : "";
      const rules = `Continue: ${row.continue_rule || ""} Stop: ${row.stop_rule || ""} Scale: ${row.scale_rule || ""}`;
      lines.push(`| ${clean(row.decision)} | ${clean(row.channel)} | ${clean(short(row.target, 80))} | ${clean(review)} | ${clean(row.confirmation)} | ${clean(short(rules, 180))} |`);
    }
  } else {
    lines.push("- No active experiment decision for this plugin.");
  }

  lines.push("", "## Owned Surfaces And Tracking", "");
  if (report.owned_impl.length) {
    lines.push("Owned-site implementation:");
    for (const row of report.owned_impl) {
      lines.push(`- ${row.status}: ${row.site_url || row.target || ""} -> ${row.primary_cta_url || ""}`);
      lines.push(`  Confirmation: ${row.confirmation || "n/a"}`);
      lines.push(`  Verification: ${row.verification || "n/a"}`);
    }
  } else {
    lines.push("- Owned-site implementation row missing.");
  }
  if (report.use_cases.length) {
    lines.push("", "Use-case pages:");
    for (const row of report.use_cases) {
      lines.push(`- ${row.status}: ${row.url}`);
      lines.push(`  Keyword: ${row.target_keyword || "n/a"}`);
      lines.push(`  Confirmation: ${row.confirmation || "n/a"}`);
    }
  } else {
    lines.push("", "Use-case pages:");
    lines.push("- No use-case page row generated.");
  }
  if (report.cross_promo.length) {
    lines.push("", "Cross-promotion:");
    for (const row of report.cross_promo.slice(0, 6)) {
      lines.push(`- ${row.status}: ${row.source_plugin} -> ${row.target_plugin}; campaign=${row.campaign || "n/a"}; confirmation=${row.confirmation || "n/a"}`);
    }
  }

  lines.push("", "## Proof Gaps", "");
  if (report.proof_gaps.length) {
    lines.push("| Requirement | Mode | Primary confirmation | Closure condition |", "|---|---|---|---|");
    for (const row of report.proof_gaps) {
      lines.push(`| ${clean(row.requirement_id)} | ${clean(row.proof_mode)} | ${clean(row.primary_confirmation?.confirmation || "")} | ${clean(short(row.closure_condition || row.next_proof, 160))} |`);
    }
  } else {
    lines.push("- No open proof gap currently maps to this plugin.");
  }

  lines.push("", "## Recent Evidence Log", "");
  if (report.recent_actions.length) {
    lines.push("| Date | Type | Channel | Status | Target | Evidence |", "|---|---|---|---|---|---|");
    for (const row of report.recent_actions) {
      lines.push(`| ${clean(row.date)} | ${clean(row.type)} | ${clean(row.channel)} | ${clean(row.status)} | ${clean(short(row.target, 80))} | ${clean(short(row.evidence || row.note, 120))} |`);
    }
  } else {
    lines.push("- No recent action-log evidence mapped to this plugin.");
  }

  lines.push(
    "",
    "## Next Actions",
    "",
    ...(profile.next_actions || []).map((item) => `- ${item}`),
    "",
    "## Safety",
    "",
    "- This file is generated from local/read-only evidence and does not send Gmail, publish, submit, upload, deploy, or modify payment settings.",
    "- External actions require the exact confirmation phrase in the matching confirmation gate.",
    "- Do not scale traffic while checkout, compliance, hosting, or tracking blockers are open.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function renderSummary(report) {
  const lines = [
    "# Plugin Growth Files",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Recommendation: ${report.recommendation}`,
    "",
    "| Plugin | Status | Top? | Ready gates | Experiments | Proof gaps | Next confirmation | File |",
    "|---|---|---:|---:|---:|---:|---|---|",
  ];
  for (const plugin of report.plugins) {
    lines.push(`| ${clean(plugin.name)} | ${clean(plugin.status)} | ${plugin.is_top_plugin ? "yes" : "no"} | ${plugin.counts.ready_confirmations} | ${plugin.counts.experiments} | ${plugin.counts.proof_gaps} | ${clean(plugin.next_confirmation)} | ${clean(plugin.file)} |`);
  }
  lines.push(
    "",
    "## Guardrails",
    "",
    "- Generated plugin files are local operator documents, not proof that an external action has been executed.",
    "- Treat missing/blocked confirmation rows as a hold on promotion, not permission to improvise around the gate.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function build({ portfolio, confirmations, experiments, proofGaps, ownedImpl, useCases, crossPromo, dailyConsistency, actions, pluginDir }) {
  const profiles = Array.isArray(portfolio?.profiles) ? portfolio.profiles : [];
  const generatedAt = new Date().toISOString();
  const sources = { confirmations, experiments, proofGaps, ownedImpl, useCases, crossPromo, dailyConsistency, actions };
  const plugins = profiles.map((profile) => {
    const plugin = buildPluginReport(profile, sources);
    return {
      ...plugin,
      file: path.join(pluginDir, `${plugin.slug}.md`),
    };
  });
  const top = plugins.find((plugin) => plugin.is_top_plugin) || plugins[0] || null;
  return {
    generated_at: generatedAt,
    status: plugins.length ? "ready" : "missing_portfolio_profiles",
    recommendation: top
      ? `Open ${top.name} first; next confirmation: ${top.next_confirmation || top.canonical_confirmation || "none"}.`
      : "Run portfolio dashboard before generating plugin growth files.",
    source_status: {
      portfolio: portfolio?.generated_at ? "present" : "missing",
      confirmation_queue: confirmations?.status || "missing",
      experiment_decision: experiments?.status || "missing",
      proof_gaps: proofGaps?.status || "missing",
      daily_consistency: dailyConsistency?.status || "missing",
    },
    plugins,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const [portfolio, confirmations, experiments, proofGaps, ownedImpl, useCases, crossPromo, dailyConsistency, actions] = await Promise.all([
    readJson(args.portfolio, null),
    readJson(args.confirmations, null),
    readJson(args.experiments, null),
    readJson(args.proofGaps, null),
    readJson(args.ownedImpl, null),
    readJson(args.useCases, null),
    readJson(args.crossPromo, null),
    readJson(args.dailyConsistency, null),
    readRows(args.actions),
  ]);

  const report = build({
    portfolio,
    confirmations,
    experiments,
    proofGaps,
    ownedImpl,
    useCases,
    crossPromo,
    dailyConsistency,
    actions,
    pluginDir: args.pluginDir,
  });

  const pluginWrites = report.plugins.map((plugin) => writeText(plugin.file, renderPlugin(plugin, report.generated_at)));
  await Promise.all([
    ...pluginWrites,
    writeText(args.output, renderSummary(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Plugin growth files: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
