#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_ASSET_COVERAGE = ".tmp/framer-asset-coverage.json";
const DEFAULT_CONFIRMATIONS = ".tmp/framer-confirmation-queue.json";
const DEFAULT_PUBLISH_PREFLIGHT = ".tmp/framer-publish-preflight.json";
const DEFAULT_CREEM_LINKS = ".tmp/framer-creem-link-inventory.json";
const DEFAULT_CREEM_STORE_VERIFICATION = ".tmp/framer-creem-store-verification-brief.json";
const DEFAULT_BLOCKER_BRIEF = ".tmp/framer-blocker-resolution-brief.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-portfolio-blocker-queue.md";
const DEFAULT_JSON = ".tmp/framer-portfolio-blocker-queue.json";

function usage() {
  return `
Usage:
  pnpm lead:blocker-queue

Options:
  --portfolio <file>              Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --asset-coverage <file>         Asset coverage JSON. Default: ${DEFAULT_ASSET_COVERAGE}
  --confirmations <file>          Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATIONS}
  --publish-preflight <file>      Publish preflight JSON. Default: ${DEFAULT_PUBLISH_PREFLIGHT}
  --creem-links <file>            Creem link inventory JSON. Default: ${DEFAULT_CREEM_LINKS}
  --creem-store-verification <file> Creem store/domain verification JSON. Default: ${DEFAULT_CREEM_STORE_VERIFICATION}
  --blocker-brief <file>          Payment/blocker brief JSON. Default: ${DEFAULT_BLOCKER_BRIEF}
  --actions <file>                Action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>                 Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                   JSON output. Default: ${DEFAULT_JSON}
  --help                          Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    portfolio: DEFAULT_PORTFOLIO,
    assetCoverage: DEFAULT_ASSET_COVERAGE,
    confirmations: DEFAULT_CONFIRMATIONS,
    publishPreflight: DEFAULT_PUBLISH_PREFLIGHT,
    creemLinks: DEFAULT_CREEM_LINKS,
    creemStoreVerification: DEFAULT_CREEM_STORE_VERIFICATION,
    blockerBrief: DEFAULT_BLOCKER_BRIEF,
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
      "--portfolio": "portfolio",
      "--asset-coverage": "assetCoverage",
      "--confirmations": "confirmations",
      "--publish-preflight": "publishPreflight",
      "--creem-links": "creemLinks",
      "--creem-store-verification": "creemStoreVerification",
      "--blocker-brief": "blockerBrief",
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
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferPlugin(value) {
  const text = String(value || "");
  if (/polyglot|license\.polyglotaeo|cloudflare/i.test(text)) return "Polyglot AEO";
  if (/ally/i.test(text)) return "Ally Auditor";
  if (/loka|getloka/i.test(text)) return "Loka - Localization Hub";
  if (/gaode|amap/i.test(text)) return "Gaode Maps";
  return "Portfolio";
}

function readinessRank(readiness) {
  return {
    ready_for_confirmation: 10,
    needs_action: 20,
    waiting_provider: 30,
    blocked: 40,
    hold: 50,
  }[readiness] || 60;
}

function pluginRank(plugin, portfolio) {
  const profiles = Array.isArray(portfolio?.profiles) ? portfolio.profiles : [];
  const profile = profiles.find((item) => item.name === plugin);
  return Number(profile?.priority?.rank || 99);
}

function isOpenAction(row) {
  return !/done|resolved|closed|skipped|cancelled|canceled/i.test(row.status || "");
}

function add(rows, item) {
  const normalized = {
    plugin: item.plugin || inferPlugin(`${item.title || ""} ${item.reason || ""} ${item.target || ""}`),
    kind: item.kind || "blocker",
    readiness: item.readiness || "blocked",
    status: item.status || item.readiness || "blocked",
    title: item.title || item.kind || "Resolve blocker",
    reason: item.reason || "",
    next_action: item.next_action || "",
    confirmation: item.confirmation || "",
    verification: item.verification || "",
    evidence: item.evidence || "",
    source: item.source || "",
    risk: item.risk || "",
  };
  if (!normalized.reason && !normalized.next_action && !normalized.title) return;
  const key = [
    normalized.plugin,
    normalized.kind,
    slug(normalized.title),
    slug(normalized.reason).slice(0, 90),
  ].join("|");
  const existing = rows.find((row) => row.key === key);
  if (existing) {
    existing.source = Array.from(new Set([existing.source, normalized.source].filter(Boolean))).join("; ");
    existing.evidence = existing.evidence || normalized.evidence;
    existing.next_action = existing.next_action || normalized.next_action;
    existing.confirmation = existing.confirmation || normalized.confirmation;
    existing.verification = existing.verification || normalized.verification;
    existing.risk = existing.risk || normalized.risk;
    if (readinessRank(normalized.readiness) < readinessRank(existing.readiness)) {
      existing.readiness = normalized.readiness;
      existing.status = normalized.status;
    }
    return;
  }
  rows.push({ ...normalized, key });
}

function collectProfiles(rows, portfolio) {
  for (const profile of Array.isArray(portfolio?.profiles) ? portfolio.profiles : []) {
    for (const blocker of profile.blockers || []) {
      if (/^no hard blocker recorded/i.test(blocker)) continue;
      add(rows, {
        plugin: profile.name,
        kind: "profile_blocker",
        readiness: /warning|needs_action|credit|billing/i.test(blocker) ? "needs_action" : "blocked",
        status: "open",
        title: `${profile.name} profile blocker`,
        reason: blocker,
        next_action: profile.next_actions?.[0] || profile.public_health?.next_action || "",
        verification: "Blocker is removed from the refreshed portfolio profile.",
        source: ".tmp/framer-portfolio-growth-dashboard.json",
      });
    }
  }
}

function collectAssetCoverage(rows, assetCoverage) {
  for (const row of Array.isArray(assetCoverage?.rows) ? assetCoverage.rows : []) {
    if (row.promotion_ready) continue;
    add(rows, {
      plugin: row.plugin,
      kind: "promotion_gate",
      readiness: /waiting|provider/i.test(row.top_blocker || row.next_local_step || "") ? "waiting_provider" : "blocked",
      status: row.status,
      title: `${row.plugin} promotion gate`,
      reason: row.top_blocker || row.next_local_step,
      next_action: row.next_local_step,
      verification: "Asset coverage shows promotion_ready=true after a refreshed ops run.",
      source: ".tmp/framer-asset-coverage.json",
    });
  }
}

function collectConfirmations(rows, confirmations) {
  for (const row of Array.isArray(confirmations?.rows) ? confirmations.rows : []) {
    const readiness = row.readiness === "ready_confirmation_required" ? "ready_for_confirmation" : row.readiness;
    const isBlockerEvidence = ["waiting_provider", "blocked"].includes(readiness);
    const isComplianceUnlock = /creem_human_support/i.test(row.kind || "") ||
      (readiness === "ready_for_confirmation" && /creem|compliance|origin|referrer/i.test(`${row.plugin || ""} ${row.action || ""} ${row.target || ""}`));
    if (!isBlockerEvidence && !isComplianceUnlock) continue;
    add(rows, {
      plugin: row.plugin,
      kind: row.kind || "confirmation_gate",
      readiness,
      status: row.status,
      title: row.action || `${row.plugin} ${row.kind}`,
      reason: row.risk || row.expected_benefit || row.status,
      next_action: row.preconditions?.[0] || row.verification || "",
      confirmation: row.confirmation || "",
      verification: row.verification || "",
      source: ".tmp/framer-confirmation-queue.json",
    });
  }
}

function collectPublishPreflight(rows, publishPreflight) {
  for (const asset of Array.isArray(publishPreflight?.assets) ? publishPreflight.assets : []) {
    if (asset.status !== "fail") continue;
    add(rows, {
      plugin: asset.plugin,
      kind: asset.type || "publish_preflight",
      readiness: "blocked",
      status: asset.status,
      title: `${asset.plugin} ${asset.type || "publish"} preflight failed`,
      reason: asset.errors?.[0] || "Publish preflight failed.",
      next_action: publishPreflight?.recommendation || "Fix preflight errors and rerun pnpm lead:publish-preflight.",
      confirmation: asset.confirmation || "",
      verification: "Publish preflight passes with zero errors.",
      source: ".tmp/framer-publish-preflight.json",
    });
  }
}

function collectCreem(rows, creemLinks, creemStoreVerification) {
  for (const row of Array.isArray(creemLinks?.rows) ? creemLinks.rows : []) {
    if (!/blocked|needs/i.test(row.status || "")) continue;
    add(rows, {
      plugin: row.plugin,
      kind: "creem_link_inventory",
      readiness: row.status === "blocked_compliance" ? "waiting_provider" : "blocked",
      status: row.status,
      title: `${row.plugin} Creem checkout gate`,
      reason: row.next_action || row.status,
      next_action: row.next_action || "",
      verification: "Creem link inventory no longer reports blocked/needs verification status.",
      source: ".tmp/framer-creem-link-inventory.json",
    });
  }
  for (const row of Array.isArray(creemStoreVerification?.rows) ? creemStoreVerification.rows : []) {
    if (!["waiting_provider", "blocked"].includes(row.readiness)) continue;
    add(rows, {
      plugin: row.plugin,
      kind: "creem_store_verification",
      readiness: row.readiness,
      status: row.verification_status || row.readiness,
      title: `${row.plugin} Creem store/domain verification`,
      reason: row.risk || row.action || row.verification,
      next_action: row.action || "",
      verification: row.verification || "",
      source: ".tmp/framer-creem-store-verification-brief.json",
    });
  }
}

function collectPaymentBlockerBrief(rows, blockerBrief) {
  for (const step of Array.isArray(blockerBrief?.steps) ? blockerBrief.steps : []) {
    if (step.status === "ready") continue;
    add(rows, {
      plugin: inferPlugin(`${step.label} ${step.recommendation} ${step.commands?.join(" ") || ""}`),
      kind: "payment_recovery_step",
      readiness: step.status === "ready_for_confirmation" ? "ready_for_confirmation" : "blocked",
      status: step.status,
      title: step.label,
      reason: step.blockers?.[0] || step.recommendation || step.status,
      next_action: step.recommendation || "",
      confirmation: step.confirmation || "",
      verification: step.evidence_required?.[0] || "",
      source: ".tmp/framer-blocker-resolution-brief.json",
    });
  }
}

function collectActionWarnings(rows, actionRows) {
  for (const row of actionRows) {
    if (!/hosting_warning|compliance_warning|compliance_review/i.test(row.type || "")) continue;
    if (!isOpenAction(row)) continue;
    add(rows, {
      plugin: inferPlugin(`${row.campaign} ${row.target} ${row.evidence} ${row.note}`),
      kind: row.type,
      readiness: /compliance/i.test(row.type || "") ? "waiting_provider" : "needs_action",
      status: row.status || "open",
      title: row.target || row.campaign || row.type,
      reason: row.note || row.evidence || row.status,
      next_action: /hosting/i.test(row.type || "")
        ? "Resolve billing/hosting issue, record closure in action log, then rerun portfolio ops."
        : "Wait for provider closure/origin evidence or record approved dashboard evidence.",
      verification: "Matching action-log warning is marked done/resolved/closed/skipped and downstream reports refresh cleanly.",
      evidence: row.evidence || "",
      source: "tools/lead-finder/actions.local.csv",
    });
  }
}

function rootText(row) {
  return `${row.plugin || ""} ${row.kind || ""} ${row.title || ""} ${row.reason || ""} ${row.next_action || ""} ${row.confirmation || ""} ${row.evidence || ""} ${row.source || ""}`;
}

function rootKeyFor(row) {
  const plugin = row.plugin || inferPlugin(rootText(row));
  const text = rootText(row);
  const title = `${row.kind || ""} ${row.title || ""} ${row.confirmation || ""}`;

  if (plugin === "Polyglot AEO") {
    if (/production site checkout origin deploy|confirm.*polyglotaeo-web|netlify account credit|netlify deploy/i.test(title) || /Netlify account credit usage exceeded/i.test(text)) {
      return "polyglot_production_deploy_gate";
    }
    if (/cloudflare|worker custom domain|custom-domain|license\.polyglotaeo|approved worker|checkout origin|legacy checkout host|approved custom-domain|license health|pricing page/i.test(text)) {
      return "polyglot_checkout_custom_domain";
    }
    if (/framer community|marketplace|use-case|landing|promotion/i.test(text)) {
      return "polyglot_public_launch_hold";
    }
  }

  if (plugin === "Loka - Localization Hub") {
    if (/creem|compliance|origin|referrer|unregistered|checkout|payment/i.test(text)) {
      return "loka_creem_compliance_origin";
    }
    if (/landing|use-case|promotion/i.test(text)) {
      return "loka_public_launch_hold";
    }
  }

  if (plugin === "Gaode Maps") {
    if (/netlify|hosting|credit|billing|deploy|publish|grace credits|suspended/i.test(text)) {
      return "gaode_netlify_credits";
    }
    if (/landing|use-case|promotion/i.test(text)) {
      return "gaode_public_launch_hold";
    }
  }

  if (plugin === "Portfolio" && /marketplace|production site check/i.test(text)) {
    return "portfolio_marketplace_upload_hold";
  }

  return `${slug(plugin || "portfolio")}-${slug(row.kind || "blocker")}-${slug(row.title || row.reason).slice(0, 80)}`;
}

function rootMetadata(key, representative) {
  const defaults = {
    title: representative.title || "Resolve blocker",
    reason: representative.reason || representative.next_action || "",
    next_action: representative.next_action || "",
    verification: representative.verification || "",
  };
  const map = {
    polyglot_checkout_custom_domain: {
      title: "Polyglot checkout/custom-domain gate",
      reason: "Polyglot promotion is blocked until the approved checkout custom domain is serving production traffic and the production pricing/license paths reflect it.",
      next_action: "Use the Cloudflare Worker custom-domain confirmation gate, then rerun checkout/payment/public preflight.",
      verification: "Checkout origin readiness and public health no longer report Worker/custom-domain, legacy checkout host, or license-health blockers.",
    },
    polyglot_production_deploy_gate: {
      title: "Polyglot production deploy gate",
      reason: "Polyglot local checkout artifacts are prepared, but production deployment evidence is still required before scaling traffic.",
      next_action: "After the custom-domain gate is clear, deploy the production site only with the exact confirmation phrase and rerun preflight.",
      verification: "Production site checks pass and pricing pages expose the approved checkout domain.",
    },
    polyglot_public_launch_hold: {
      title: "Polyglot public launch hold",
      reason: "Public promotion, Marketplace upload, and use-case publishing should wait until checkout and production checks are clean.",
      next_action: "Keep public launch assets prepared locally; release only after payment and production gates are clear.",
      verification: "Publish preflight and confirmation queue no longer block Polyglot public promotion.",
    },
    loka_creem_compliance_origin: {
      title: "Loka Creem compliance origin/referrer",
      reason: "Creem warned about unregistered checkout traffic for Loka Pro; the exact origin/referrer is still needed before changing checkout settings.",
      next_action: "Reply in the existing Creem thread with the human-support origin/referrer request after exact confirmation, then wait for provider evidence.",
      verification: "Creem confirms the Loka Pro warning is closed or the dashboard shows approved origin/store evidence.",
    },
    loka_public_launch_hold: {
      title: "Loka public launch hold",
      reason: "Loka promotion should not increase checkout traffic while the Creem compliance origin is unresolved.",
      next_action: "Keep landing/use-case work local until the Creem warning is closed.",
      verification: "Loka Creem compliance warning is closed and downstream promotion gates refresh cleanly.",
    },
    gaode_netlify_credits: {
      title: "Gaode Netlify credit/deploy gate",
      reason: "Gaode production deploys are blocked by Netlify credit/billing evidence, so publishing or deploying would be unreliable.",
      next_action: "Resolve Netlify credits/billing or wait for reset, record closure evidence, then rerun publish preflight.",
      verification: "Hosting warning is marked closed and Gaode publish/deploy preflight passes.",
    },
    gaode_public_launch_hold: {
      title: "Gaode public launch hold",
      reason: "Gaode public pages should wait until hosting/deploy capacity and tracking are measurable.",
      next_action: "Keep content prepared locally until the Netlify deploy gate is clear.",
      verification: "Gaode hosting warning is closed and use-case/landing publish preflight passes.",
    },
    portfolio_marketplace_upload_hold: {
      title: "Portfolio Marketplace upload hold",
      reason: "Marketplace upload should wait until the production site/payment preflight is clean.",
      next_action: "Resolve production/payment blockers before uploading plugin.zip.",
      verification: "Marketplace upload preflight passes with zero production/payment blockers.",
    },
  };
  return { ...defaults, ...(map[key] || {}) };
}

function rootReadinessFor(key, rows) {
  const readinesses = new Set(rows.map((row) => row.readiness));
  if (key === "loka_creem_compliance_origin" && readinesses.has("waiting_provider")) return "waiting_provider";
  if (key === "gaode_netlify_credits" && readinesses.has("needs_action")) return "needs_action";
  if (readinesses.has("ready_for_confirmation")) return "ready_for_confirmation";
  return rows
    .map((row) => row.readiness)
    .sort((a, b) => readinessRank(a) - readinessRank(b))[0] || "blocked";
}

function chooseRepresentative(rows, readiness) {
  return [...rows].sort((a, b) =>
    (a.readiness === readiness ? 0 : 1) - (b.readiness === readiness ? 0 : 1) ||
    (b.confirmation ? 1 : 0) - (a.confirmation ? 1 : 0) ||
    (b.next_action ? 1 : 0) - (a.next_action ? 1 : 0) ||
    readinessRank(a.readiness) - readinessRank(b.readiness) ||
    a.title.localeCompare(b.title)
  )[0];
}

function uniqueList(values, max = 6) {
  return Array.from(new Set(values.map((value) => clean(value)).filter(Boolean))).slice(0, max);
}

function countRows(rows) {
  return rows.reduce((acc, row) => {
    acc[row.readiness] = (acc[row.readiness] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    acc.by_plugin[row.plugin] = (acc.by_plugin[row.plugin] || 0) + 1;
    return acc;
  }, { total: 0, by_plugin: {} });
}

function mergeRootRows(rows, portfolio) {
  const groups = new Map();
  for (const row of rows) {
    const rootKey = rootKeyFor(row);
    if (!groups.has(rootKey)) groups.set(rootKey, []);
    groups.get(rootKey).push(row);
  }
  const rootRows = [];
  for (const [rootKey, groupRows] of groups.entries()) {
    const readiness = rootReadinessFor(rootKey, groupRows);
    const representative = chooseRepresentative(groupRows, readiness);
    const metadata = rootMetadata(rootKey, representative);
    const confirmations = uniqueList(groupRows
      .filter((row) => row.readiness === readiness || row.readiness === "ready_for_confirmation")
      .map((row) => row.confirmation), 4);
    const verifications = uniqueList(groupRows.map((row) => row.verification), 4);
    const sources = uniqueList(groupRows.flatMap((row) => String(row.source || "").split("; ")), 8);
    const sampleSymptoms = uniqueList(groupRows.map((row) => row.reason || row.title), 5);
    const executableConfirmation = ["ready_for_confirmation", "waiting_provider"].includes(readiness)
      ? representative.confirmation || confirmations[0] || ""
      : "";
    rootRows.push({
      root_key: rootKey,
      plugin: representative.plugin,
      kind: "root_blocker",
      readiness,
      status: readiness,
      title: metadata.title,
      reason: metadata.reason,
      next_action: metadata.next_action || representative.next_action,
      confirmation: executableConfirmation,
      verification: representative.verification || metadata.verification || verifications[0] || "",
      evidence: representative.evidence || "",
      source: sources.join("; "),
      sources,
      confirmations,
      verifications,
      symptom_count: groupRows.length,
      sample_symptoms: sampleSymptoms,
      raw_keys: groupRows.map((row) => row.key),
    });
  }
  rootRows.sort((a, b) =>
    readinessRank(a.readiness) - readinessRank(b.readiness) ||
    pluginRank(a.plugin, portfolio) - pluginRank(b.plugin, portfolio) ||
    b.symptom_count - a.symptom_count ||
    a.plugin.localeCompare(b.plugin) ||
    a.title.localeCompare(b.title)
  );
  return rootRows;
}

function recommendationFor(rows) {
  const ready = rows.find((row) => row.readiness === "ready_for_confirmation");
  if (ready) return `Blocker can be unlocked after explicit confirmation: ${ready.plugin} / ${ready.title} (${ready.confirmation}).`;
  const waiting = rows.find((row) => row.readiness === "waiting_provider");
  if (waiting) return `Highest blocker is waiting on provider evidence: ${waiting.plugin} / ${waiting.title}.`;
  const needsAction = rows.find((row) => row.readiness === "needs_action");
  if (needsAction) return `Highest blocker needs account/operator action: ${needsAction.plugin} / ${needsAction.title}.`;
  const blocked = rows[0];
  if (blocked) return `Resolve blocker: ${blocked.plugin} / ${blocked.title}.`;
  return "No open portfolio blockers detected by the local evidence set.";
}

function build({ portfolio, assetCoverage, confirmations, publishPreflight, creemLinks, creemStoreVerification, blockerBrief, actionRows }) {
  const rows = [];
  collectProfiles(rows, portfolio);
  collectAssetCoverage(rows, assetCoverage);
  collectConfirmations(rows, confirmations);
  collectPublishPreflight(rows, publishPreflight);
  collectCreem(rows, creemLinks, creemStoreVerification);
  collectPaymentBlockerBrief(rows, blockerBrief);
  collectActionWarnings(rows, actionRows);
  rows.sort((a, b) =>
    readinessRank(a.readiness) - readinessRank(b.readiness) ||
    pluginRank(a.plugin, portfolio) - pluginRank(b.plugin, portfolio) ||
    a.plugin.localeCompare(b.plugin) ||
    a.title.localeCompare(b.title)
  );
  const rootBlockers = mergeRootRows(rows, portfolio);
  const counts = countRows(rows);
  const rootCounts = countRows(rootBlockers);
  return {
    generated_at: new Date().toISOString(),
    status: rootBlockers.length ? "open_blockers" : "clear",
    recommendation: recommendationFor(rootBlockers),
    counts,
    root_counts: rootCounts,
    root_blockers: rootBlockers,
    rows,
    guardrails: [
      "This queue is local-only and does not send Gmail, publish pages, submit forms, upload Marketplace files, deploy, or modify payment settings.",
      "Rows with a confirmation phrase still require the exact phrase before execution.",
      "Rows marked waiting_provider need provider/dashboard evidence, not guessing or unrelated setting changes.",
      "After resolving a blocker, record evidence in the action log and rerun portfolio ops.",
    ],
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Portfolio Blocker Queue",
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
    `- Root blockers: ${report.root_counts?.total || 0}`,
    `- Raw evidence rows: ${report.counts.total || 0}`,
    `- Ready for confirmation: ${report.root_counts?.ready_for_confirmation || 0}`,
    `- Needs action: ${report.root_counts?.needs_action || 0}`,
    `- Waiting provider: ${report.root_counts?.waiting_provider || 0}`,
    `- Blocked: ${report.root_counts?.blocked || 0}`,
    "",
    "## Root Blockers",
    "",
    "| Readiness | Plugin | Root Blocker | Symptoms | Next Action | Confirmation | Sources |",
    "|---|---|---|---:|---|---|---|",
  ];
  for (const row of report.root_blockers || []) {
    lines.push(`| ${clean(row.readiness)} | ${clean(row.plugin)} | ${clean(row.title)} | ${row.symptom_count || 0} | ${clean(short(row.next_action || row.reason, 160))} | ${clean(row.confirmation)} | ${clean(short(row.source, 180))} |`);
  }
  if (!report.root_blockers?.length) lines.push("| clear |  |  | 0 |  |  |  |");

  lines.push(
    "",
    "## Evidence Rows",
    "",
    "| Readiness | Plugin | Kind | Title | Reason | Next Action | Confirmation | Source |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const row of report.rows) {
    lines.push(`| ${clean(row.readiness)} | ${clean(row.plugin)} | ${clean(row.kind)} | ${clean(row.title)} | ${clean(short(row.reason, 160))} | ${clean(short(row.next_action, 140))} | ${clean(row.confirmation)} | ${clean(row.source)} |`);
  }
  if (!report.rows.length) lines.push("| clear |  |  |  |  |  |  |  |");

  lines.push("", "## By Plugin", "", "| Plugin | Root blockers | Evidence rows |", "|---|---:|---:|");
  const plugins = Array.from(new Set([
    ...Object.keys(report.root_counts?.by_plugin || {}),
    ...Object.keys(report.counts.by_plugin || {}),
  ])).sort((a, b) =>
    (report.root_counts?.by_plugin?.[b] || 0) - (report.root_counts?.by_plugin?.[a] || 0) ||
    (report.counts.by_plugin?.[b] || 0) - (report.counts.by_plugin?.[a] || 0) ||
    a.localeCompare(b)
  );
  for (const plugin of plugins) {
    lines.push(`| ${clean(plugin)} | ${report.root_counts?.by_plugin?.[plugin] || 0} | ${report.counts.by_plugin?.[plugin] || 0} |`);
  }
  if (!plugins.length) lines.push("| none | 0 | 0 |");

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
  const [
    portfolio,
    assetCoverage,
    confirmations,
    publishPreflight,
    creemLinks,
    creemStoreVerification,
    blockerBrief,
    actionRows,
  ] = await Promise.all([
    readJson(args.portfolio, null),
    readJson(args.assetCoverage, null),
    readJson(args.confirmations, null),
    readJson(args.publishPreflight, null),
    readJson(args.creemLinks, null),
    readJson(args.creemStoreVerification, null),
    readJson(args.blockerBrief, null),
    readRows(args.actions),
  ]);
  const report = build({
    portfolio,
    assetCoverage,
    confirmations,
    publishPreflight,
    creemLinks,
    creemStoreVerification,
    blockerBrief,
    actionRows,
  });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Portfolio blocker queue: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
