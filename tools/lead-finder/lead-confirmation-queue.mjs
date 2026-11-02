#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TODAY = ".tmp/framer-today.json";
const DEFAULT_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_PLUGIN_CHANNEL_FIT = ".tmp/framer-plugin-channel-fit.json";
const DEFAULT_CUSTOMER_FEEDBACK_BRIEF = ".tmp/framer-customer-feedback-brief.json";
const DEFAULT_CREEM_HUMAN_SUPPORT_BRIEF = ".tmp/framer-creem-human-support-brief.json";
const DEFAULT_LANDING_BASELINE_BRIEF = ".tmp/framer-landing-baseline-brief.json";
const DEFAULT_OWNED_SITE_IMPLEMENTATION = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_USE_CASE_PAGES = ".tmp/framer-use-case-page-brief.json";
const DEFAULT_LANDING_TARGET_DECISION = ".tmp/framer-landing-target-decision.json";
const DEFAULT_BLOCKER_BRIEF = ".tmp/framer-blocker-resolution-brief.json";
const DEFAULT_COMMUNITY_BRIEF = ".tmp/framer-community-launch-brief.json";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-confirmation-queue.md";
const DEFAULT_JSON = ".tmp/framer-confirmation-queue.json";

function usage() {
  return `
Usage:
  pnpm lead:confirmations

Options:
  --today <file>                 Today plan JSON. Default: ${DEFAULT_TODAY}
  --experiments <file>           Portfolio experiments JSON. Default: ${DEFAULT_EXPERIMENTS}
  --plugin-channel-fit <file>    Plugin channel fit JSON. Default: ${DEFAULT_PLUGIN_CHANNEL_FIT}
  --customer-feedback-brief <file> Customer feedback brief JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK_BRIEF}
  --creem-human-support <file> Creem human-support brief JSON. Default: ${DEFAULT_CREEM_HUMAN_SUPPORT_BRIEF}
  --landing-baseline-brief <file> Landing baseline brief JSON. Default: ${DEFAULT_LANDING_BASELINE_BRIEF}
  --owned-site-implementation <file> Owned-site implementation JSON. Default: ${DEFAULT_OWNED_SITE_IMPLEMENTATION}
  --use-case-pages <file>         Use-case page brief JSON. Default: ${DEFAULT_USE_CASE_PAGES}
  --landing-target-decision <file> Landing target decision JSON. Default: ${DEFAULT_LANDING_TARGET_DECISION}
  --blocker-brief <file>         Blocker resolution brief JSON. Default: ${DEFAULT_BLOCKER_BRIEF}
  --community-brief <file>       Community launch brief JSON. Default: ${DEFAULT_COMMUNITY_BRIEF}
  --marketplace-preflight <file> Marketplace preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --actions <file>               Action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>                Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                  JSON output. Default: ${DEFAULT_JSON}
  --help                         Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    today: DEFAULT_TODAY,
    experiments: DEFAULT_EXPERIMENTS,
    pluginChannelFit: DEFAULT_PLUGIN_CHANNEL_FIT,
    customerFeedbackBrief: DEFAULT_CUSTOMER_FEEDBACK_BRIEF,
    creemHumanSupportBrief: DEFAULT_CREEM_HUMAN_SUPPORT_BRIEF,
    landingBaselineBrief: DEFAULT_LANDING_BASELINE_BRIEF,
    ownedSiteImplementation: DEFAULT_OWNED_SITE_IMPLEMENTATION,
    useCasePages: DEFAULT_USE_CASE_PAGES,
    landingTargetDecision: DEFAULT_LANDING_TARGET_DECISION,
    blockerBrief: DEFAULT_BLOCKER_BRIEF,
    communityBrief: DEFAULT_COMMUNITY_BRIEF,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
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
      "--today": "today",
      "--experiments": "experiments",
      "--plugin-channel-fit": "pluginChannelFit",
      "--customer-feedback-brief": "customerFeedbackBrief",
      "--creem-human-support": "creemHumanSupportBrief",
      "--landing-baseline-brief": "landingBaselineBrief",
      "--owned-site-implementation": "ownedSiteImplementation",
      "--use-case-pages": "useCasePages",
      "--landing-target-decision": "landingTargetDecision",
      "--blocker-brief": "blockerBrief",
      "--community-brief": "communityBrief",
      "--marketplace-preflight": "marketplacePreflight",
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
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
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
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

async function readRows(file) {
  const text = await readText(file);
  if (!text.trim()) return [];
  const [headers, ...records] = parseCsv(text);
  if (!headers?.length) return [];
  return records
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addItem(items, item) {
  const normalized = normalizeItem(item);
  if (!normalized.confirmation && normalized.requires_exact_confirmation) return;
  const key = normalized.confirmation
    ? `confirmation|${slug(normalized.confirmation)}`
    : ["target", normalized.plugin, normalized.kind, normalized.target].map((value) => slug(value)).join("|");
  const existing = items.find((row) => row.key === key);
  if (existing) {
    const shouldPrefer = normalized.priority < existing.priority || existing.kind === "today_confirmation";
    if (shouldPrefer) {
      existing.kind = normalized.kind;
      existing.channel = normalized.channel;
      existing.status = normalized.status;
      existing.action = normalized.action || existing.action;
      existing.target = normalized.target || existing.target;
    }
    existing.sources = unique([...existing.sources, ...normalized.sources]);
    existing.preconditions = unique([...existing.preconditions, ...normalized.preconditions]);
    existing.verification = existing.verification || normalized.verification;
    existing.risk = existing.risk || normalized.risk;
    existing.expected_benefit = existing.expected_benefit || normalized.expected_benefit;
    existing.execution_commands = unique([...existing.execution_commands, ...normalized.execution_commands]);
    existing.record_command = existing.record_command || normalized.record_command;
    existing.gmail_query = existing.gmail_query || normalized.gmail_query;
    existing.draft = existing.draft || normalized.draft;
    existing.verification_commands = unique([...existing.verification_commands, ...normalized.verification_commands]);
    existing.reviews = mergeReviews(existing.reviews, normalized.reviews);
    existing.priority = Math.min(existing.priority, normalized.priority);
    existing.readiness = higherReadiness(existing.readiness, normalized.readiness);
    return;
  }
  items.push({ ...normalized, key });
}

function normalizeItem(item) {
  const readiness = item.readiness || readinessForStatus(item.status);
  const plugin = inferPlugin(item.plugin || item.title || item.action || item.target || item.confirmation);
  return {
    plugin,
    kind: item.kind || item.channel || "external_action",
    channel: item.channel || item.kind || "",
    status: item.status || readiness,
    readiness,
    priority: Number(item.priority ?? priorityFor({ readiness, kind: item.kind, plugin: item.plugin })),
    action: item.action || item.title || "",
    target: item.target || "",
    risk: item.risk || "",
    expected_benefit: item.expected_benefit || item.expectedBenefit || "",
    confirmation: item.confirmation || "",
    verification: item.verification || item.evidence || "",
    preconditions: unique(item.preconditions || []),
    execution_commands: unique(item.execution_commands || item.executionCommands || item.commands || []),
    record_command: item.record_command || item.recordCommand || "",
    gmail_query: item.gmail_query || item.gmailQuery || "",
    draft: item.draft || null,
    reviews: Array.isArray(item.reviews) ? item.reviews : [],
    verification_commands: unique(item.verification_commands || item.verificationCommands || []),
    requires_exact_confirmation: item.requires_exact_confirmation !== false,
    sources: unique(item.sources || []),
  };
}

function readinessForStatus(status) {
  const text = String(status || "");
  if (/blocked|preflight_blocked|materials_ready_blocked/i.test(text)) return "blocked";
  if (/ready_confirmation_required|go_confirmation|planned_confirmation_required|confirmation_required/i.test(text)) return "ready_confirmation_required";
  if (/needs_decision|needs_concrete_target_url|prepare_target/i.test(text)) return "needs_decision";
  if (/waiting|active_waiting/i.test(text)) return "waiting_provider";
  if (/local_only/i.test(text)) return "local_only";
  return "planned";
}

function inferPlugin(value) {
  const text = String(value || "");
  for (const plugin of ["Polyglot AEO", "Ally Auditor", "Loka - Localization Hub", "Gaode Maps"]) {
    if (text.toLowerCase().includes(plugin.toLowerCase())) return plugin;
  }
  if (/loka pro/i.test(text)) return "Loka - Localization Hub";
  if (/gaode|amap/i.test(text)) return "Gaode Maps";
  if (/ally/i.test(text)) return "Ally Auditor";
  if (/polyglot|license\.polyglotaeo|cloudflare worker/i.test(text)) return "Polyglot AEO";
  return text || "Portfolio";
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

function isHostingGatedExternalAction(row) {
  const text = `${row.kind || ""} ${row.channel || ""} ${row.action || ""}`.toLowerCase();
  return /landing_baseline|use_case_page|owned_site|owned_seo|publish|deploy|netlify/.test(text);
}

function hostingWarningDetail(row) {
  return [row.campaign, row.status, row.target, row.evidence, row.note]
    .filter(Boolean)
    .join(" - ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function applyHostingWarningGates(items, actionRows, actionSource) {
  for (const row of items) {
    if (!isHostingGatedExternalAction(row)) continue;
    const warnings = openHostingWarningsForPlugin(actionRows, row.plugin);
    if (!warnings.length) continue;
    const details = warnings.map(hostingWarningDetail).filter(Boolean).join(" | ");
    row.status = "blocked_by_hosting_warning";
    row.readiness = "blocked";
    row.risk = [
      `Open hosting warning blocks publish/deploy execution: ${details}`,
      row.risk,
    ].filter(Boolean).join(" ");
    row.preconditions = unique([
      ...row.preconditions,
      "Resolve, close, skip, or mark done the matching hosting_warning action-log row before execution.",
      "Rerun publish preflight and confirmation queue after the hosting warning is cleared.",
    ]);
    row.verification = row.verification || "Action log shows hosting warning closed/resolved and publish preflight passes.";
    row.sources = unique([...row.sources, actionSource]);
    row.priority = Math.max(row.priority, priorityFor({ readiness: row.readiness, kind: row.kind, plugin: row.plugin }));
  }
}

function higherReadiness(left, right) {
  const order = {
    ready_confirmation_required: 1,
    needs_decision: 2,
    waiting_provider: 3,
    planned: 4,
    blocked: 5,
    local_only: 6,
  };
  return (order[left] || 9) <= (order[right] || 9) ? left : right;
}

function priorityFor({ readiness, kind, plugin }) {
  let score = {
    ready_confirmation_required: 10,
    needs_decision: 30,
    waiting_provider: 50,
    planned: 60,
    blocked: 80,
    local_only: 90,
  }[readiness] ?? 70;
  if (/customer_feedback/i.test(kind || "")) score -= 5;
  if (plugin === "Ally Auditor") score -= 3;
  return score;
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function mergeReviews(left = [], right = []) {
  const seen = new Set();
  const rows = [];
  for (const review of [...left, ...right]) {
    const key = `${review.label || ""}|${review.date || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(review);
  }
  return rows;
}

function collectToday(items, today, source) {
  for (const row of today?.needs_confirmation || []) {
    addItem(items, {
      plugin: row.plugin || row.title || "Portfolio",
      kind: row.kind || "today_confirmation",
      channel: row.channel || "",
      status: row.status || "ready_confirmation_required",
      action: row.title || row.action || "",
      target: row.target || "",
      risk: row.risk || "",
      expected_benefit: row.expected_benefit || "",
      confirmation: row.confirmation || "",
      verification: row.verification || row.evidence || "",
      sources: [source],
    });
  }
}

function collectExperiments(items, experiments, source) {
  for (const row of experiments?.experiments || []) {
    if (!row.confirmation) continue;
    addItem(items, {
      plugin: row.plugin,
      kind: row.channel || "portfolio_experiment",
      channel: row.channel || "",
      status: row.status,
      action: row.action_pack?.action || row.external_action || row.hypothesis || "",
      target: row.action_pack?.target || row.external_action || "",
      risk: row.action_pack?.risk || "",
      expected_benefit: row.action_pack?.expected_benefit || row.primary_metric || "",
      confirmation: row.confirmation,
      verification: row.action_pack?.verification || row.evidence_required || "",
      preconditions: row.action_pack?.preconditions || [],
      sources: [source],
    });
  }
}

function collectCustomerFeedbackBrief(items, brief, source) {
  if (!brief?.external_action?.confirmation) return;
  addItem(items, {
    plugin: brief.item?.plugin || "Customer feedback",
    kind: "customer_feedback",
    channel: "existing_customer",
    status: brief.status,
    action: brief.external_action.action || "Send customer feedback email.",
    target: brief.external_action.target || brief.item?.customer_email || "",
    risk: brief.external_action.risk || "",
    expected_benefit: brief.external_action.expected_benefit || "",
    confirmation: brief.external_action.confirmation,
    verification: brief.external_action.verification || "",
    preconditions: brief.preconditions || [],
    record_command: brief.record_command || "",
    gmail_query: brief.gmail_query || "",
    draft: brief.item?.draft || null,
    reviews: brief.reviews || [],
    sources: [source],
  });
}

function collectCreemHumanSupportBrief(items, brief, source) {
  if (!brief?.external_action?.confirmation) return;
  addItem(items, {
    plugin: brief.plugin || "Loka - Localization Hub",
    kind: "creem_human_support",
    channel: "gmail",
    status: brief.status || "waiting_provider",
    priority: 18,
    action: brief.external_action.action || "Reply to Creem support requesting human support.",
    target: brief.external_action.target || "Creem support / Loka Pro compliance thread",
    risk: brief.external_action.risk || "",
    expected_benefit: brief.external_action.expected_benefit || "",
    confirmation: brief.external_action.confirmation || brief.confirmation || "",
    verification: brief.external_action.verification || "",
    preconditions: brief.preconditions || [],
    record_command: brief.record_command || "",
    gmail_query: brief.gmail_query || "",
    draft: brief.draft || null,
    reviews: brief.reviews || [],
    sources: [source],
  });
}

function collectLandingBaselineBrief(items, brief, source) {
  if (!brief?.external_action?.confirmation) return;
  addItem(items, {
    plugin: brief.item?.plugin || "Landing baseline",
    kind: "landing_baseline",
    channel: "owned_site",
    status: brief.status,
    action: brief.external_action.action || "Create or deploy landing baseline.",
    target: brief.external_action.target || brief.item?.target_url || "",
    risk: brief.external_action.risk || "",
    expected_benefit: brief.external_action.expected_benefit || "",
    confirmation: brief.external_action.confirmation,
    verification: brief.external_action.verification || "",
    preconditions: brief.preconditions || [],
    record_command: brief.record_command || "",
    reviews: brief.reviews || [],
    verification_commands: brief.verification_commands || [],
    sources: [source],
  });
}

function collectOwnedSiteImplementation(items, brief, source) {
  for (const row of brief?.items || []) {
    if (!row.confirmation) continue;
    addItem(items, {
      plugin: row.plugin,
      kind: "landing_baseline",
      channel: "owned_site",
      status: row.status,
      priority: row.priority,
      action: `Create or deploy the tracked owned-site CTA update for ${row.plugin}.`,
      target: row.site_url || "",
      risk: row.risk || "A thin or untracked owned-site update can add traffic noise instead of qualified installs.",
      expected_benefit: row.expected_benefit || "Gives Marketplace traffic a measurable owned-site source.",
      confirmation: row.confirmation,
      verification: row.verification || "",
      preconditions: row.acceptance_criteria || [],
      record_command: row.record_command || row.record_commands?.[0] || "",
      reviews: row.reviews || [],
      verification_commands: row.verification_commands || [],
      sources: [source],
    });
  }
}

function collectUseCasePages(items, brief, source) {
  for (const row of brief?.items || []) {
    if (!row.confirmation) continue;
    addItem(items, {
      plugin: row.plugin,
      kind: "use_case_page",
      channel: "owned_seo",
      status: row.status,
      action: `Publish or update the ${row.plugin} use-case page after local content and tracking are ready.`,
      target: row.url || "",
      risk: row.risk || "Publishing thin or untracked content can add traffic noise without qualified installs.",
      expected_benefit: row.expected_benefit || "Creates a searchable owned page with measurable Marketplace click-through.",
      confirmation: row.confirmation,
      verification: row.verification || "",
      preconditions: row.acceptance_criteria || [],
      record_command: row.record_command || "",
      verification_commands: row.verification_commands || [],
      sources: [source],
    });
  }
}

function collectLandingTargetDecision(items, decision, source) {
  for (const row of decision?.unresolved || []) {
    addItem(items, {
      plugin: row.plugin,
      kind: "landing_target_decision",
      channel: "owned_site",
      status: row.status || "needs_decision",
      action: "Choose a concrete owned landing URL before any deploy.",
      target: row.recommended_url || row.proposed_url || "",
      risk: "Choosing the wrong domain can dilute plugin positioning or create traffic before tracking/deploy gates are ready.",
      expected_benefit: "Unlocks landing/tracking baseline coverage so future Community, directory, partner, and SEO traffic can be measured.",
      confirmation: row.confirmation || "",
      verification: row.verification || "Rerun portfolio ops and confirm the landing brief no longer contains <owned-domain>.",
      preconditions: ["Edit tools/lead-finder/landing-targets.local.csv only after choosing the owned URL."],
      sources: [source],
    });
  }
}

function collectPluginChannelFit(items, fit, source) {
  const row = fit?.next_channel;
  if (!row?.confirmation) return;
  addItem(items, {
    plugin: row.plugin,
    kind: row.channel || "plugin_channel_fit",
    channel: row.channel || "",
    status: row.decision || "",
    action: row.next_step || "",
    target: row.target || row.plugin || "",
    risk: row.risk || "",
    expected_benefit: row.reason || "",
    confirmation: row.confirmation,
    verification: row.verification || "",
    sources: [source],
  });
}

function collectBlockerBrief(items, brief, source) {
  const executable = brief?.next_executable;
  if (!executable?.confirmation) return;
  addItem(items, {
    plugin: executable.plugin || "Polyglot AEO",
    kind: executable.kind || "blocker_resolution",
    channel: "release_gate",
    status: executable.status || brief.status,
    action: executable.title || executable.action || "",
    target: executable.target || "",
    risk: executable.risk || "",
    expected_benefit: executable.expected_benefit || brief.recommendation || "",
    confirmation: executable.confirmation,
    verification: executable.verification || "",
    preconditions: executable.preconditions || [],
    execution_commands: executable.execution_commands || executable.commands || [],
    record_command: executable.record_command || "",
    verification_commands: executable.verification_commands || [],
    sources: [source],
  });
}

function collectCommunityBrief(items, brief, source) {
  if (!brief?.confirmation && !brief?.external_action?.confirmation) return;
  addItem(items, {
    plugin: brief.plugin || "Polyglot AEO",
    kind: "framer_community",
    channel: "framer_community",
    status: brief.status,
    action: brief.external_action?.action || "Publish the prepared Framer Community post.",
    target: brief.external_action?.target || brief.target || "Framer Community",
    risk: brief.external_action?.risk || "Publishing before preflight passes can create untracked or unsafe traffic.",
    expected_benefit: brief.external_action?.expected_benefit || "",
    confirmation: brief.external_action?.confirmation || brief.confirmation,
    verification: brief.external_action?.verification || "",
    preconditions: brief.preconditions || [],
    sources: [source],
  });
}

function collectMarketplacePreflight(items, preflight, source) {
  const confirmation = preflight?.confirmation || preflight?.next_confirmation;
  if (!confirmation) return;
  addItem(items, {
    plugin: "Polyglot AEO",
    kind: "marketplace_upload",
    channel: "framer_marketplace",
    status: preflight.status || preflight.verdict || "",
    action: "Upload or update the Framer Marketplace package.",
    target: "Framer Marketplace",
    risk: "Uploading while checkout/compliance gates are blocked can send users into broken payment or support flows.",
    expected_benefit: "Refreshes the Marketplace listing only when public and checkout gates are clean.",
    confirmation,
    verification: "Marketplace upload evidence is recorded with lead:marketplace-record and postflight checks pass.",
    sources: [source],
  });
}

function build({ today, experiments, pluginChannelFit, customerFeedbackBrief, creemHumanSupportBrief, landingBaselineBrief, ownedSiteImplementation, useCasePages, landingTargetDecision, blockerBrief, communityBrief, marketplacePreflight, actionRows, actionSource }) {
  const items = [];
  collectToday(items, today, ".tmp/framer-today.json");
  collectExperiments(items, experiments, ".tmp/framer-portfolio-experiments.json");
  collectPluginChannelFit(items, pluginChannelFit, ".tmp/framer-plugin-channel-fit.json");
  collectCustomerFeedbackBrief(items, customerFeedbackBrief, ".tmp/framer-customer-feedback-brief.json");
  collectCreemHumanSupportBrief(items, creemHumanSupportBrief, ".tmp/framer-creem-human-support-brief.json");
  collectLandingBaselineBrief(items, landingBaselineBrief, ".tmp/framer-landing-baseline-brief.json");
  collectOwnedSiteImplementation(items, ownedSiteImplementation, ".tmp/framer-owned-site-implementation-brief.json");
  collectUseCasePages(items, useCasePages, ".tmp/framer-use-case-page-brief.json");
  collectLandingTargetDecision(items, landingTargetDecision, ".tmp/framer-landing-target-decision.json");
  collectBlockerBrief(items, blockerBrief, ".tmp/framer-blocker-resolution-brief.json");
  collectCommunityBrief(items, communityBrief, ".tmp/framer-community-launch-brief.json");
  collectMarketplacePreflight(items, marketplacePreflight, ".tmp/framer-marketplace-preflight.json");
  applyHostingWarningGates(items, actionRows, actionSource);

  const rows = items.sort((a, b) => a.priority - b.priority || a.plugin.localeCompare(b.plugin) || a.kind.localeCompare(b.kind));
  const canonicalConfirmation = today?.next_confirmation ||
    (Array.isArray(today?.needs_confirmation) ? today.needs_confirmation[0]?.confirmation : "");
  const next = rows.find((row) => row.readiness === "ready_confirmation_required" && row.confirmation === canonicalConfirmation) ||
    rows.find((row) => row.readiness === "ready_confirmation_required") ||
    rows[0] ||
    null;
  const counts = rows.reduce((acc, row) => {
    acc[row.readiness] = (acc[row.readiness] || 0) + 1;
    return acc;
  }, {});
  const safetyAudit = confirmationSafetyAudit(rows);
  return {
    generated_at: new Date().toISOString(),
    status: rows.length ? "ready" : "empty",
    recommendation: next
      ? recommendationFor(next)
      : "No confirmation-gated external action is currently queued.",
    next_confirmation: next?.confirmation || "",
    counts,
    safety_audit: safetyAudit,
    next,
    rows,
  };
}

function recommendationFor(row) {
  if (row.readiness === "ready_confirmation_required") {
    return `Action-time confirmation needed: ${row.confirmation}.`;
  }
  if (row.readiness === "needs_decision") {
    return `Human decision needed before confirmation: ${row.plugin} / ${row.kind}.`;
  }
  if (row.readiness === "waiting_provider") {
    return `Wait for provider/user evidence before asking for confirmation: ${row.plugin} / ${row.kind}.`;
  }
  if (row.readiness === "blocked") {
    return `Blocked external action remains in queue: ${row.plugin} / ${row.kind}.`;
  }
  return `Review queued action: ${row.plugin} / ${row.kind}.`;
}

function present(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(String(value || "").trim());
}

function fieldPresent(row, field) {
  return present(row[field]);
}

function readinessSafetyRow(row) {
  const required = [
    "action",
    "target",
    "risk",
    "expected_benefit",
    "confirmation",
    "verification",
    "record_command",
  ];
  const text = `${row.kind || ""} ${row.channel || ""} ${row.action || ""}`.toLowerCase();
  if (/gmail|customer_feedback|creem_human_support/.test(text)) {
    required.push("gmail_query", "draft");
  }
  if (/deploy|publish|landing_baseline|use_case_page|owned_site|owned_seo|release_gate|marketplace/.test(text)) {
    required.push("verification_commands");
  }
  if (/cloudflare|release_gate/.test(text)) {
    required.push("execution_commands", "preconditions");
  }
  const missing = required.filter((field) => !fieldPresent(row, field));
  return {
    plugin: row.plugin,
    kind: row.kind,
    target: row.target,
    confirmation: row.confirmation,
    status: missing.length ? "incomplete" : "complete",
    missing,
    required_fields: required,
  };
}

function confirmationSafetyAudit(rows) {
  const readyRows = rows.filter((row) => row.readiness === "ready_confirmation_required");
  const items = readyRows.map(readinessSafetyRow);
  const incomplete = items.filter((row) => row.status !== "complete");
  return {
    status: incomplete.length ? "incomplete" : "complete",
    ready_rows: readyRows.length,
    complete_rows: items.length - incomplete.length,
    incomplete_rows: incomplete.length,
    missing_fields: Array.from(new Set(incomplete.flatMap((row) => row.missing))).sort(),
    items,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Confirmation Queue",
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
    `- Ready confirmations: ${report.counts.ready_confirmation_required || 0}`,
    `- Needs decision first: ${report.counts.needs_decision || 0}`,
    `- Waiting provider/user: ${report.counts.waiting_provider || 0}`,
    `- Blocked: ${report.counts.blocked || 0}`,
    `- Planned/local-only: ${(report.counts.planned || 0) + (report.counts.local_only || 0)}`,
    `- Ready-row safety audit: ${report.safety_audit?.status || "missing"} (${report.safety_audit?.complete_rows || 0}/${report.safety_audit?.ready_rows || 0} complete)`,
    "",
  ];

  if (report.next) {
    lines.push(
      "## Next Confirmation",
      "",
      `- Plugin: ${report.next.plugin}`,
      `- Kind: ${report.next.kind}`,
      `- Readiness: ${report.next.readiness}`,
      `- Action: ${report.next.action || "Review source brief."}`,
      `- Target: ${report.next.target || "missing"}`,
      `- Confirmation: ${report.next.confirmation || "missing"}`,
      `- Risk: ${report.next.risk || "See source brief."}`,
      `- Expected benefit: ${report.next.expected_benefit || "See source brief."}`,
      `- Verification: ${report.next.verification || "See source brief."}`,
      "",
    );
    if (report.next.preconditions.length) {
      lines.push("Preconditions:");
      for (const item of report.next.preconditions) lines.push(`- ${item}`);
      lines.push("");
    }
    if (report.next.execution_commands.length) {
      lines.push("Execution command(s) after exact confirmation:", "", "```bash");
      for (const command of report.next.execution_commands) lines.push(command);
      lines.push("```", "");
    }
    if (report.next.record_command) {
      lines.push("Record after execution:", "", "```bash", report.next.record_command, "```", "");
    }
    if (report.next.gmail_query) {
      lines.push("Read-only Gmail review query:", "", "```text", report.next.gmail_query, "```", "");
    }
    if (report.next.reviews.length) {
      lines.push("Review schedule:", "", "| Window | Date |", "|---|---|");
      for (const review of report.next.reviews) {
        lines.push(`| ${pipe(review.label)} | ${pipe(review.date)} |`);
      }
      lines.push("");
    }
    if (report.next.verification_commands.length) {
      lines.push("Verification commands:", "", "```bash");
      for (const command of report.next.verification_commands) lines.push(command);
      lines.push("```", "");
    }
    if (report.next.draft?.subject || report.next.draft?.body) {
      lines.push(
        "Draft preview:",
        "",
        `Subject: ${report.next.draft.subject || ""}`,
        "",
        "```text",
        report.next.draft.body || "",
        "```",
        "",
      );
    }
  }

  lines.push(
    "## Queue",
    "",
    "| Readiness | Plugin | Kind | Status | Target | Record? | Confirmation | Sources |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const row of report.rows) {
    lines.push(`| ${pipe(row.readiness)} | ${pipe(row.plugin)} | ${pipe(row.kind)} | ${pipe(row.status)} | ${pipe(row.target)} | ${row.record_command ? "yes" : "no"} | ${pipe(row.confirmation)} | ${pipe(row.sources.join("<br>"))} |`);
  }
  if (!report.rows.length) lines.push("| empty |  |  |  |  |  |  |  |");

  lines.push(
    "",
    "## Ready-Row Safety Audit",
    "",
    "| Status | Plugin | Kind | Missing fields | Confirmation |",
    "|---|---|---|---|---|",
  );
  for (const row of report.safety_audit?.items || []) {
    lines.push(`| ${pipe(row.status)} | ${pipe(row.plugin)} | ${pipe(row.kind)} | ${pipe(row.missing.join(", ") || "none")} | ${pipe(row.confirmation)} |`);
  }
  if (!report.safety_audit?.items?.length) lines.push("| empty |  |  |  |  |");

  lines.push(
    "",
    "## Safety",
    "",
    "- This report does not send Gmail, publish Community posts, submit directories, upload Marketplace files, deploy, or modify Creem/payment settings.",
    "- Only rows with `ready_confirmation_required` are candidates for action-time confirmation.",
    "- Open `hosting_warning` action-log rows block matching owned-site publish/deploy confirmations until cleared.",
    "- Rows marked `needs_decision`, `waiting_provider`, or `blocked` must not be executed as external actions.",
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
  const [
    today,
    experiments,
    pluginChannelFit,
    customerFeedbackBrief,
    creemHumanSupportBrief,
    landingBaselineBrief,
    ownedSiteImplementation,
    useCasePages,
    landingTargetDecision,
    blockerBrief,
    communityBrief,
    marketplacePreflight,
    actionRows,
  ] = await Promise.all([
    readJson(args.today, null),
    readJson(args.experiments, null),
    readJson(args.pluginChannelFit, null),
    readJson(args.customerFeedbackBrief, null),
    readJson(args.creemHumanSupportBrief, null),
    readJson(args.landingBaselineBrief, null),
    readJson(args.ownedSiteImplementation, null),
    readJson(args.useCasePages, null),
    readJson(args.landingTargetDecision, null),
    readJson(args.blockerBrief, null),
    readJson(args.communityBrief, null),
    readJson(args.marketplacePreflight, null),
    readRows(args.actions),
  ]);
  const report = build({
    today,
    experiments,
    pluginChannelFit,
    customerFeedbackBrief,
    creemHumanSupportBrief,
    landingBaselineBrief,
    ownedSiteImplementation,
    useCasePages,
    landingTargetDecision,
    blockerBrief,
    communityBrief,
    marketplacePreflight,
    actionRows,
    actionSource: args.actions,
  });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Confirmation queue: ${args.output}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
