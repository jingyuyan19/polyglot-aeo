#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_TARGETS = "tools/lead-finder/landing-targets.local.csv";
const DEFAULT_ASSET_COVERAGE = ".tmp/framer-asset-coverage.json";
const DEFAULT_CHANNEL_FIT = ".tmp/framer-plugin-channel-fit.json";
const DEFAULT_DEPLOY_REVIEW = ".tmp/framer-deploy-review.json";
const DEFAULT_NETLIFY_RECOVERY = ".tmp/framer-netlify-recovery.json";
const DEFAULT_OUTPUT = ".tmp/framer-landing-target-decision.md";
const DEFAULT_JSON = ".tmp/framer-landing-target-decision.json";

function usage() {
  return `
Usage:
  pnpm lead:landing-target-decision

Options:
  --baseline <file>       Landing baseline JSON. Default: ${DEFAULT_BASELINE}
  --targets <file>        Landing target registry CSV. Default: ${DEFAULT_TARGETS}
  --asset-coverage <file> Asset coverage JSON. Default: ${DEFAULT_ASSET_COVERAGE}
  --channel-fit <file>    Plugin channel fit JSON. Default: ${DEFAULT_CHANNEL_FIT}
  --deploy-review <file>  Deploy review JSON. Default: ${DEFAULT_DEPLOY_REVIEW}
  --netlify-recovery <file> Netlify recovery JSON. Default: ${DEFAULT_NETLIFY_RECOVERY}
  --output <file>         Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>           JSON output. Default: ${DEFAULT_JSON}
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    baseline: DEFAULT_BASELINE,
    targets: DEFAULT_TARGETS,
    assetCoverage: DEFAULT_ASSET_COVERAGE,
    channelFit: DEFAULT_CHANNEL_FIT,
    deployReview: DEFAULT_DEPLOY_REVIEW,
    netlifyRecovery: DEFAULT_NETLIFY_RECOVERY,
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
      "--baseline": "baseline",
      "--targets": "targets",
      "--asset-coverage": "assetCoverage",
      "--channel-fit": "channelFit",
      "--deploy-review": "deployReview",
      "--netlify-recovery": "netlifyRecovery",
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

function samePlugin(left, right) {
  const a = slug(left).replace(/-localization-hub$/, "").replace(/-assistant$/, "");
  const b = slug(right).replace(/-localization-hub$/, "").replace(/-assistant$/, "");
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function targetForPlugin(plugin, targetRows) {
  return targetRows.find((row) => samePlugin(row.plugin || row.id || "", plugin)) || null;
}

function isConcreteUrl(value) {
  const text = String(value || "");
  if (!/^https?:\/\//i.test(text) || /[<>]/.test(text)) return false;
  try {
    const url = new URL(text);
    return Boolean(url.hostname && url.hostname.includes("."));
  } catch {
    return false;
  }
}

function urlPath(value) {
  const raw = String(value || "");
  if (!raw) return "/";
  try {
    return new URL(raw.replace("https://<owned-domain>", "https://example.com")).pathname || "/";
  } catch {
    return raw.startsWith("/") ? raw : `/${slug(raw)}/`;
  }
}

function normalizeDomain(value) {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "";
  }
}

function knownDomains(targetRows) {
  return Array.from(
    new Set(
      targetRows
        .map((row) => normalizeDomain(row.target_url))
        .filter(Boolean),
    ),
  ).sort();
}

function deployBlocked(deployReview, netlifyRecovery) {
  const haystack = `${deployReview?.status || ""} ${deployReview?.recommendation || ""} ${netlifyRecovery?.status || ""} ${netlifyRecovery?.recommendation || ""}`;
  return /blocked|forbidden|credit/i.test(haystack);
}

function coverageRow(plugin, assetCoverage) {
  const rows = Array.isArray(assetCoverage?.rows) ? assetCoverage.rows : [];
  return rows.find((row) => samePlugin(row.plugin, plugin)) || null;
}

function channelFitRow(plugin, channelFit) {
  const rows = Array.isArray(channelFit?.plugins) ? channelFit.plugins : [];
  return rows.find((row) => samePlugin(row.plugin, plugin)) || null;
}

function candidateRows({ row, targetRows, deployReview, netlifyRecovery }) {
  const pathPart = urlPath(row.proposed_url);
  const domains = knownDomains(targetRows);
  const blockedDeploy = deployBlocked(deployReview, netlifyRecovery);
  const candidates = [
    {
      label: "preferred_neutral_domain",
      target_url: `https://<new-framer-plugin-domain>${pathPart}`,
      decision: "needs_domain_choice",
      brand_fit: "high",
      deploy_fit: "unknown",
      note: "Best long-term if these plugins need a brand-neutral resource hub, but it requires choosing and configuring an owned domain first.",
    },
  ];

  if (domains.includes("https://polyglotaeo.com")) {
    candidates.push({
      label: "fast_existing_domain",
      target_url: `https://polyglotaeo.com${pathPart}`,
      decision: blockedDeploy ? "hold_deploy_blocked" : "possible_after_confirmation",
      brand_fit: row.plugin === "Polyglot AEO" ? "high" : "medium_low",
      deploy_fit: blockedDeploy ? "blocked_by_netlify_or_deploy_gate" : "usable",
      note: "Fastest existing owned domain, but non-Polyglot plugins may look less clean under the Polyglot brand.",
    });
  }

  if (domains.includes("https://getloka.dev") && row.plugin === "Loka - Localization Hub") {
    candidates.push({
      label: "plugin_owned_domain",
      target_url: `https://getloka.dev${pathPart}`,
      decision: "blocked_compliance",
      brand_fit: "high",
      deploy_fit: "blocked_until_creem_warning_closes",
      note: "Loka traffic should stay held until Creem names and clears the unregistered checkout origin.",
    });
  }

  candidates.push({
    label: "marketplace_only_fallback",
    target_url: row.tracked_marketplace_url || row.marketplace_url || "",
    decision: "not_owned_landing",
    brand_fit: "medium",
    deploy_fit: "no_deploy_needed",
    note: "Useful only as a temporary CTA; it does not solve owned landing/tracking coverage.",
  });

  return candidates;
}

function priorityFor({ row, channelFit, assetCoverage }) {
  const fit = channelFitRow(row.plugin, channelFit);
  const coverage = coverageRow(row.plugin, assetCoverage);
  let score = Number(row.priority || 50);
  if (fit?.top_channel?.decision === "prepare_target") score -= 30;
  if (/landing_baseline/i.test(coverage?.top_blocker || "")) score -= 10;
  if (row.plugin === "Ally Auditor") score -= 5;
  return score;
}

function decisionFor({ row, target, channelFit, assetCoverage, deployReview, netlifyRecovery, targetRows }) {
  const concrete = isConcreteUrl(target?.target_url);
  const hasPlaceholder = String(row.proposed_url || "").includes("<owned-domain>");
  const status = concrete ? "ready" : hasPlaceholder ? "needs_decision" : "review";
  const pathPart = urlPath(row.proposed_url);
  const candidates = candidateRows({ row, targetRows, deployReview, netlifyRecovery });
  const fit = channelFitRow(row.plugin, channelFit);
  const coverage = coverageRow(row.plugin, assetCoverage);
  const recommended = candidates[0];
  return {
    plugin: row.plugin,
    status,
    priority: priorityFor({ row, channelFit, assetCoverage }),
    current_registry_status: target?.status || "missing",
    current_registry_url: target?.target_url || "",
    proposed_url: row.proposed_url || "",
    path: pathPart,
    recommended_url: concrete ? target.target_url : recommended.target_url,
    recommended_decision: concrete ? "already_concrete" : recommended.decision,
    reason: concrete
      ? "The landing target registry already has a concrete URL."
      : `No concrete owned landing URL is recorded for ${row.plugin}; current baseline still uses ${row.proposed_url}.`,
    channel_fit: fit?.top_channel || null,
    asset_coverage: coverage
      ? {
          coverage_pct: coverage.coverage_pct,
          promotion_ready: Boolean(coverage.promotion_ready),
          top_blocker: coverage.top_blocker || "",
          next_local_step: coverage.next_local_step || "",
        }
      : null,
    candidates,
    registry_update_hint: `${row.plugin},${recommended.target_url},ready,manual,"Chosen owned URL; deploy only after explicit confirmation."`,
    confirmation: row.confirmation || `Confirm ${row.plugin} landing target`,
    verification: "Rerun pnpm lead:portfolio-ops -- --skip-signals and confirm landing baseline/asset coverage no longer contain <owned-domain> for this plugin.",
  };
}

function build({ baseline, targetRows, assetCoverage, channelFit, deployReview, netlifyRecovery, args }) {
  const rows = Array.isArray(baseline?.rows) ? baseline.rows : [];
  const unresolved = rows
    .filter((row) => row.status === "ready_to_spec" && String(row.proposed_url || "").includes("<owned-domain>"))
    .map((row) =>
      decisionFor({
        row,
        target: targetForPlugin(row.plugin, targetRows),
        channelFit,
        assetCoverage,
        deployReview,
        netlifyRecovery,
        targetRows,
      }),
    )
    .sort((a, b) => a.priority - b.priority || a.plugin.localeCompare(b.plugin));
  const concrete = rows
    .filter((row) => isConcreteUrl(targetForPlugin(row.plugin, targetRows)?.target_url))
    .map((row) =>
      decisionFor({
        row,
        target: targetForPlugin(row.plugin, targetRows),
        channelFit,
        assetCoverage,
        deployReview,
        netlifyRecovery,
        targetRows,
      }),
    );

  return {
    generated_at: new Date().toISOString(),
    status: unresolved.length ? "needs_decision" : "ready",
    recommendation: unresolved.length
      ? `Choose a concrete owned landing URL for ${unresolved[0].plugin}; do not deploy until the exact confirmation phrase is given.`
      : "Landing target registry has concrete URLs for all ready landing baselines.",
    target_registry: {
      file: args.targets,
      rows: targetRows.length,
      known_domains: knownDomains(targetRows),
    },
    deploy_context: {
      deploy_review_status: deployReview?.status || "missing",
      netlify_recovery_status: netlifyRecovery?.status || "missing",
      deploy_blocked: deployBlocked(deployReview, netlifyRecovery),
    },
    next_decision: unresolved[0] || null,
    unresolved,
    concrete,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Landing Target Decision Brief",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Known owned domains: ${report.target_registry.known_domains.join(", ") || "none"}`,
    `Deploy context: ${report.deploy_context.deploy_review_status}; Netlify: ${report.deploy_context.netlify_recovery_status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Decisions Needed",
    "",
    "| Plugin | Status | Current URL | Recommended URL | Decision | Confirmation |",
    "|---|---|---|---|---|---|",
  ];

  for (const row of report.unresolved) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(row.status)} | ${pipe(row.proposed_url)} | ${pipe(row.recommended_url)} | ${pipe(row.recommended_decision)} | ${pipe(row.confirmation)} |`);
  }
  if (!report.unresolved.length) {
    lines.push("| none |  |  |  |  |  |");
  }

  lines.push("", "## Candidate URLs", "");
  for (const row of report.unresolved) {
    lines.push(`### ${row.plugin}`, "");
    lines.push(`- Reason: ${row.reason}`);
    if (row.channel_fit?.channel) {
      lines.push(`- Top channel: ${row.channel_fit.channel} (${row.channel_fit.decision}, score ${row.channel_fit.score})`);
    }
    if (row.asset_coverage?.top_blocker) {
      lines.push(`- Asset blocker: ${row.asset_coverage.top_blocker}`);
    }
    lines.push(`- Registry update hint: \`${row.registry_update_hint}\``);
    lines.push("", "| Candidate | URL | Decision | Brand fit | Deploy fit | Note |", "|---|---|---|---|---|---|");
    for (const candidate of row.candidates) {
      lines.push(`| ${pipe(candidate.label)} | ${pipe(candidate.target_url)} | ${pipe(candidate.decision)} | ${pipe(candidate.brand_fit)} | ${pipe(candidate.deploy_fit)} | ${pipe(candidate.note)} |`);
    }
    lines.push("");
  }

  lines.push(
    "## After Choosing A URL",
    "",
    "1. Update `tools/lead-finder/landing-targets.local.csv` with the chosen concrete `target_url`.",
    "2. Rerun `pnpm lead:portfolio-ops -- --skip-signals`.",
    "3. Confirm `.tmp/framer-landing-baseline-brief.md` moves from `needs_concrete_target_url` to `ready_confirmation_required`.",
    "4. Deploy or publish only after the exact confirmation phrase shown in the brief.",
    "",
    "## Safety",
    "",
    "- This report does not edit the target registry.",
    "- This report does not deploy, publish, submit, send email, or modify payment settings.",
    "- Do not use a blocked payment/compliance plugin as a traffic destination until its blocker is closed.",
    "",
  );

  return `${lines.join("\n")}\n`;
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

  const [baseline, targetRows, assetCoverage, channelFit, deployReview, netlifyRecovery] = await Promise.all([
    readJson(args.baseline, null),
    readRows(args.targets),
    readJson(args.assetCoverage, null),
    readJson(args.channelFit, null),
    readJson(args.deployReview, null),
    readJson(args.netlifyRecovery, null),
  ]);

  const report = build({
    baseline,
    targetRows,
    assetCoverage,
    channelFit,
    deployReview,
    netlifyRecovery,
    args,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Landing target decision brief: ${args.output}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
