#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_ASSET_COVERAGE = ".tmp/framer-asset-coverage.json";
const DEFAULT_LANDING_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_LANDING_TARGET_DECISION = ".tmp/framer-landing-target-decision.json";
const DEFAULT_OWNED_SITE_AUDIT = ".tmp/framer-owned-site-audit.json";
const DEFAULT_CREEM_LINKS = ".tmp/framer-creem-link-inventory.json";
const DEFAULT_CREEM_STORE_VERIFICATION = ".tmp/framer-creem-store-verification-brief.json";
const DEFAULT_OWNED_SITE_CTA_KIT = ".tmp/framer-owned-site-cta-kit.json";
const DEFAULT_CROSS_PROMOTION = ".tmp/framer-cross-promotion-matrix.json";
const DEFAULT_OWNED_SITE_IMPLEMENTATION = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_OWNED_SITE_DROP_PATCH = ".tmp/framer-owned-site-drop-patches.json";
const DEFAULT_USE_CASE_PAGES = ".tmp/framer-use-case-page-brief.json";
const DEFAULT_USE_CASE_PAGE_PACKAGES = ".tmp/framer-use-case-page-packages.json";
const DEFAULT_PUBLISH_PREFLIGHT = ".tmp/framer-publish-preflight.json";
const DEFAULT_EXPERIMENT_DECISION = ".tmp/framer-experiment-decision-brief.json";
const DEFAULT_CONFIRMATION_QUEUE = ".tmp/framer-confirmation-queue.json";
const DEFAULT_TODAY_PLAN = ".tmp/framer-today.json";
const DEFAULT_BLOCKER_QUEUE = ".tmp/framer-portfolio-blocker-queue.json";
const DEFAULT_WEEKLY = ".tmp/framer-portfolio-weekly-report.json";
const DEFAULT_OPS_RUN = ".tmp/framer-portfolio-ops-run.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_PARTNERS = "tools/lead-finder/partners.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-growth-goal-coverage.md";
const DEFAULT_JSON = ".tmp/framer-growth-goal-coverage.json";

const REQUIRED_PLUGINS = [
  "Polyglot AEO",
  "Ally Auditor",
  "Loka - Localization Hub",
  "Gaode Maps",
];

const REQUIREMENT_EVIDENCE_FILES = {
  plugin_growth_profiles: [
    ".tmp/framer-portfolio-growth-dashboard.json",
    ".tmp/framer-asset-coverage.json",
    "tools/lead-finder/revenue.local.csv",
  ],
  fact_refresh_pipeline: [
    ".tmp/framer-portfolio-ops-run.json",
    ".tmp/framer-portfolio-blocker-queue.json",
    ".tmp/framer-creem-link-inventory.json",
    ".tmp/framer-creem-store-verification-brief.json",
  ],
  payment_compliance_evidence: [
    ".tmp/framer-creem-link-inventory.json",
    ".tmp/framer-creem-store-verification-brief.json",
    ".tmp/framer-creem-human-support-brief.json",
    "tools/lead-finder/actions.local.csv",
  ],
  priority_ranking: [
    ".tmp/framer-portfolio-growth-dashboard.json",
    ".tmp/framer-plugin-channel-fit.json",
    ".tmp/framer-channel-priority.json",
  ],
  promotion_assets: [
    ".tmp/framer-asset-coverage.json",
    ".tmp/framer-plugin-asset-kits.json",
    ".tmp/framer-community-launch-brief.json",
    ".tmp/framer-directory-submit-kit.json",
  ],
  owned_landing_tracking: [
    ".tmp/framer-landing-baseline.json",
    ".tmp/framer-owned-site-audit.json",
    ".tmp/framer-owned-site-cta-kit.json",
    ".tmp/framer-owned-site-implementation-brief.json",
    ".tmp/framer-publish-preflight.json",
  ],
  searchable_use_case_pages: [
    ".tmp/framer-use-case-page-brief.json",
    ".tmp/framer-use-case-page-packages.json",
    ".tmp/framer-publish-preflight.json",
  ],
  measurable_experiment_loop: [
    ".tmp/framer-experiment-decision-brief.json",
    ".tmp/framer-action-review.json",
    "tools/lead-finder/actions.local.csv",
  ],
  channel_system: [
    ".tmp/framer-confirmation-queue.json",
    ".tmp/framer-cross-promotion-matrix.json",
    "tools/lead-finder/actions.local.csv",
    "tools/lead-finder/partners.local.csv",
  ],
  weekly_report: [
    ".tmp/framer-portfolio-weekly-report.json",
    ".tmp/framer-daily-action-consistency.json",
  ],
  safety_confirmation_gates: [
    ".tmp/framer-confirmation-queue.json",
    ".tmp/framer-action-time-packet.json",
    ".tmp/framer-daily-action-consistency.json",
  ],
  real_growth_signals: [
    "tools/lead-finder/revenue.local.csv",
    "tools/lead-finder/partners.local.csv",
    ".tmp/framer-customer-feedback-review.json",
    ".tmp/framer-action-review.json",
  ],
};

function usage() {
  return `
Usage:
  pnpm lead:goal-coverage

Options:
  --portfolio <file>              Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --asset-coverage <file>         Asset coverage JSON. Default: ${DEFAULT_ASSET_COVERAGE}
  --landing-baseline <file>       Landing baseline JSON. Default: ${DEFAULT_LANDING_BASELINE}
  --landing-target-decision <file> Landing target decision JSON. Default: ${DEFAULT_LANDING_TARGET_DECISION}
  --owned-site-audit <file>       Owned site audit JSON. Default: ${DEFAULT_OWNED_SITE_AUDIT}
  --creem-links <file>            Creem link inventory JSON. Default: ${DEFAULT_CREEM_LINKS}
  --creem-store-verification <file> Creem store/domain verification brief JSON. Default: ${DEFAULT_CREEM_STORE_VERIFICATION}
  --owned-site-cta-kit <file>     Owned site CTA kit JSON. Default: ${DEFAULT_OWNED_SITE_CTA_KIT}
  --cross-promotion <file>        Cross-promotion matrix JSON. Default: ${DEFAULT_CROSS_PROMOTION}
  --owned-site-implementation <file> Owned site implementation brief JSON. Default: ${DEFAULT_OWNED_SITE_IMPLEMENTATION}
  --owned-site-drop-patch <file>  Owned-site local drop patch JSON. Default: ${DEFAULT_OWNED_SITE_DROP_PATCH}
  --use-case-pages <file>         Use-case page brief JSON. Default: ${DEFAULT_USE_CASE_PAGES}
  --use-case-page-packages <file> Use-case local package JSON. Default: ${DEFAULT_USE_CASE_PAGE_PACKAGES}
  --publish-preflight <file>      Publish preflight JSON. Default: ${DEFAULT_PUBLISH_PREFLIGHT}
  --experiment-decision <file>    Experiment decision brief JSON. Default: ${DEFAULT_EXPERIMENT_DECISION}
  --confirmation-queue <file>     Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATION_QUEUE}
  --today-plan <file>             Today execution plan JSON. Default: ${DEFAULT_TODAY_PLAN}
  --blocker-queue <file>          Portfolio blocker queue JSON. Default: ${DEFAULT_BLOCKER_QUEUE}
  --weekly <file>                 Weekly report JSON. Default: ${DEFAULT_WEEKLY}
  --ops-run <file>                Portfolio ops run JSON. Default: ${DEFAULT_OPS_RUN}
  --actions <file>                Action log CSV. Default: ${DEFAULT_ACTIONS}
  --revenue <file>                Revenue CSV. Default: ${DEFAULT_REVENUE}
  --partners <file>               Partner log CSV. Default: ${DEFAULT_PARTNERS}
  --output <file>                 Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                   JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>            Audit date. Default: local date.
  --help                          Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    portfolio: DEFAULT_PORTFOLIO,
    assetCoverage: DEFAULT_ASSET_COVERAGE,
    landingBaseline: DEFAULT_LANDING_BASELINE,
    landingTargetDecision: DEFAULT_LANDING_TARGET_DECISION,
    ownedSiteAudit: DEFAULT_OWNED_SITE_AUDIT,
    creemLinks: DEFAULT_CREEM_LINKS,
    creemStoreVerification: DEFAULT_CREEM_STORE_VERIFICATION,
    ownedSiteCtaKit: DEFAULT_OWNED_SITE_CTA_KIT,
    crossPromotion: DEFAULT_CROSS_PROMOTION,
    ownedSiteImplementation: DEFAULT_OWNED_SITE_IMPLEMENTATION,
    ownedSiteDropPatch: DEFAULT_OWNED_SITE_DROP_PATCH,
    useCasePages: DEFAULT_USE_CASE_PAGES,
    useCasePagePackages: DEFAULT_USE_CASE_PAGE_PACKAGES,
    publishPreflight: DEFAULT_PUBLISH_PREFLIGHT,
    experimentDecision: DEFAULT_EXPERIMENT_DECISION,
    confirmationQueue: DEFAULT_CONFIRMATION_QUEUE,
    todayPlan: DEFAULT_TODAY_PLAN,
    blockerQueue: DEFAULT_BLOCKER_QUEUE,
    weekly: DEFAULT_WEEKLY,
    opsRun: DEFAULT_OPS_RUN,
    actions: DEFAULT_ACTIONS,
    revenue: DEFAULT_REVENUE,
    partners: DEFAULT_PARTNERS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
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
      "--landing-baseline": "landingBaseline",
      "--landing-target-decision": "landingTargetDecision",
      "--owned-site-audit": "ownedSiteAudit",
      "--creem-links": "creemLinks",
      "--creem-store-verification": "creemStoreVerification",
      "--owned-site-cta-kit": "ownedSiteCtaKit",
      "--cross-promotion": "crossPromotion",
      "--owned-site-implementation": "ownedSiteImplementation",
      "--owned-site-drop-patch": "ownedSiteDropPatch",
      "--use-case-pages": "useCasePages",
      "--use-case-page-packages": "useCasePagePackages",
      "--publish-preflight": "publishPreflight",
      "--experiment-decision": "experimentDecision",
      "--confirmation-queue": "confirmationQueue",
      "--today-plan": "todayPlan",
      "--blocker-queue": "blockerQueue",
      "--weekly": "weekly",
      "--ops-run": "opsRun",
      "--actions": "actions",
      "--revenue": "revenue",
      "--partners": "partners",
      "--output": "output",
      "--json": "json",
      "--today": "today",
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

function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
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

function profiles(portfolio) {
  return Array.isArray(portfolio?.profiles) ? portfolio.profiles : [];
}

function profileByName(portfolio) {
  return new Map(profiles(portfolio).map((profile) => [profile.name, profile]));
}

function statusWeight(status) {
  return {
    proven: 4,
    partial: 3,
    blocked: 2,
    missing: 1,
  }[status] || 0;
}

function lowestStatus(rows) {
  const ordered = [...rows].sort((a, b) => statusWeight(a.status) - statusWeight(b.status));
  return ordered[0]?.status || "missing";
}

function pluginCoverageRows({ portfolio, assetCoverage, revenueRows }) {
  const byProfile = profileByName(portfolio);
  const coverageRows = Array.isArray(assetCoverage?.rows) ? assetCoverage.rows : [];
  return REQUIRED_PLUGINS.map((plugin) => {
    const profile = byProfile.get(plugin);
    const coverage = coverageRows.find((row) => row.plugin === plugin);
    const hasRevenue = revenueRows.some((row) => positiveRevenue(row) && matchesPlugin(plugin, `${row.product || ""} ${row.customer || ""}`));
    const completeness = profileCompleteness(profile);
    const blocker = profile?.blockers?.[0] || coverage?.top_blocker || "";
    const promotionGate = coverage?.promotion_ready
      ? "promotion_ready"
      : coverage
        ? "promotion_gated_or_needs_work"
        : "asset_coverage_missing";
    const status = !profile
      ? "missing"
      : completeness.missing.length
        ? "partial"
        : "proven";
    return {
      plugin,
      status,
      evidence: [
        profile ? "portfolio profile present" : "missing portfolio profile",
        completeness.missing.length ? `missing fields=${completeness.missing.join(", ")}` : "required profile fields complete",
        profile?.priority?.label ? `priority=${profile.priority.label}` : "missing priority",
        profile?.creator_snapshot ? `users=${profile.creator_snapshot.users || "?"}, opens=${profile.creator_snapshot.opens || "?"}, version=${profile.creator_snapshot.version || "?"}` : "missing Creator Space metrics",
        `signals=${profile?.signals?.length || 0}`,
        `blockers=${profile?.blockers?.length || 0}`,
        `next_actions=${profile?.next_actions?.length || 0}`,
        hasRevenue ? "external revenue signal present" : "no external revenue signal",
        `promotion_gate=${promotionGate}`,
      ].join("; "),
      next_proof: completeness.missing.length
        ? `Fill missing profile fields: ${completeness.missing.join(", ")}.`
        : coverage?.promotion_ready
          ? "Profile is complete and promotion assets are ready."
          : `Profile is complete; promotion gating is tracked separately: ${coverage?.next_local_step || profile?.next_actions?.[0] || "refresh asset coverage."}`,
      blocker,
      promotion_gate: promotionGate,
    };
  });
}

function present(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value === 0) return true;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function hasCreatorMetrics(snapshot) {
  return Boolean(snapshot && (present(snapshot.users) || present(snapshot.opens)) && present(snapshot.version));
}

function hasProfileStatus(profile) {
  return Boolean(
    present(profile?.public_health?.status) ||
    present(profile?.marketplace?.status) ||
    profile?.marketplace?.ok === true ||
    profile?.marketplace?.ok === false,
  );
}

function profileCompleteness(profile) {
  if (!profile) return { missing: ["profile"] };
  const checks = [
    ["marketplace_url", present(profile.marketplace_url)],
    ["status", hasProfileStatus(profile)],
    ["version_or_creator_metrics", hasCreatorMetrics(profile.creator_snapshot)],
    ["category", present(profile.category)],
    ["pricing", present(profile.marketplace?.pricing || profile.pricing)],
    ["priority", present(profile.priority?.label)],
    ["icp", present(profile.icp)],
    ["core_pain", present(profile.pain)],
    ["positioning", present(profile.positioning)],
    ["free_value", present(profile.free_value)],
    ["paid_value", present(profile.paid_value)],
    ["current_signal", present(profile.signals)],
    ["blocker_or_gap_status", present(profile.blockers)],
    ["next_action", present(profile.next_actions)],
    ["channel_fit", present(profile.best_channels)],
  ];
  return {
    missing: checks.filter(([, ok]) => !ok).map(([field]) => field),
  };
}

function positiveRevenue(row) {
  return Number(row.amount_usd || 0) > 0 && !/test/i.test(`${row.product || ""} ${row.customer || ""}`);
}

function matchesPlugin(plugin, text) {
  const lower = String(text || "").toLowerCase();
  const terms = {
    "Polyglot AEO": ["polyglot", "framer_aeo"],
    "Ally Auditor": ["ally"],
    "Loka - Localization Hub": ["loka", "getloka"],
    "Gaode Maps": ["gaode", "amap"],
  }[plugin] || [plugin.toLowerCase()];
  return terms.some((term) => lower.includes(term));
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

function recentActionCount(rows, pattern) {
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
  return rows.filter((row) => regex.test(`${row.type || ""} ${row.channel || ""} ${row.campaign || ""} ${row.status || ""} ${row.target || ""} ${row.evidence || ""} ${row.note || ""}`)).length;
}

function buildRequirements({
  portfolio,
  assetCoverage,
  landingBaseline,
  landingTargetDecision,
  ownedSiteAudit,
  creemLinks,
  creemStoreVerification,
  ownedSiteCtaKit,
  crossPromotion,
  ownedSiteImplementation,
  ownedSiteDropPatch,
  useCasePages,
  useCasePagePackages,
  publishPreflight,
  experimentDecision,
  confirmationQueue,
  todayPlan,
  blockerQueue,
  weekly,
  opsRun,
  actionRows,
  revenueRows,
  partnerRows,
}) {
  const pluginRows = pluginCoverageRows({ portfolio, assetCoverage, revenueRows });
  const landingRows = Array.isArray(landingBaseline?.rows) ? landingBaseline.rows : [];
  const ownedSiteRows = Array.isArray(ownedSiteAudit?.items) ? ownedSiteAudit.items : [];
  const creemLinkRows = Array.isArray(creemLinks?.rows) ? creemLinks.rows : [];
  const creemNeedsStoreDomainVerification = creemLinks?.counts?.needs_store_domain_verification ?? 0;
  const creemStoreVerificationRows = Array.isArray(creemStoreVerification?.rows) ? creemStoreVerification.rows : [];
  const creemManualChecks = creemStoreVerificationRows.filter((row) => row.readiness === "manual_read_only_check_required");
  const creemWaitingProvider = creemStoreVerificationRows.filter((row) => row.readiness === "waiting_provider");
  const creemBlocked = creemStoreVerificationRows.filter((row) => row.readiness === "blocked");
  const ownedSiteCtaRows = Array.isArray(ownedSiteCtaKit?.items) ? ownedSiteCtaKit.items : [];
  const ownedSiteImplementationRows = Array.isArray(ownedSiteImplementation?.items) ? ownedSiteImplementation.items : [];
  const ownedSiteDropPatchRows = Array.isArray(ownedSiteDropPatch?.patches) ? ownedSiteDropPatch.patches : [];
  const useCasePageRows = Array.isArray(useCasePages?.items) ? useCasePages.items : [];
  const useCasePagePackageRows = Array.isArray(useCasePagePackages?.packages) ? useCasePagePackages.packages : [];
  const publishPreflightRows = Array.isArray(publishPreflight?.assets) ? publishPreflight.assets : [];
  const unresolvedLanding = Array.isArray(landingTargetDecision?.unresolved)
    ? landingTargetDecision.unresolved
    : [];
  const crossPromoRows = Array.isArray(crossPromotion?.rows) ? crossPromotion.rows : [];
  const crossPromoReady = crossPromoRows.filter((row) => row.status === "ready_local_copy" || row.status === "ready_record_after_confirmation");
  const crossPromoBlocked = crossPromoRows.filter((row) => /^blocked/.test(String(row.status || "")));
  const experimentRows = Array.isArray(experimentDecision?.rows) ? experimentDecision.rows : [];
  const confirmationRows = Array.isArray(confirmationQueue?.rows) ? confirmationQueue.rows : [];
  const readyConfirmations = Number(confirmationQueue?.counts?.ready_confirmation_required || 0);
  const blockedConfirmations = Number(confirmationQueue?.counts?.blocked || 0);
  const confirmationSafetyAudit = confirmationQueue?.safety_audit || {};
  const canonicalConfirmation = todayPlan?.next_confirmation || confirmationQueue?.next_confirmation || "";
  const canonicalRecommendation = todayPlan?.recommendation || confirmationQueue?.recommendation || "";
  const blockerRootRows = Array.isArray(blockerQueue?.root_blockers) ? blockerQueue.root_blockers : [];
  const blockerQueueRows = blockerRootRows.length ? blockerRootRows : (Array.isArray(blockerQueue?.rows) ? blockerQueue.rows : []);
  const blockerRootCount = blockerQueue?.root_counts?.total ?? blockerQueue?.counts?.total ?? "missing";
  const blockerRawCount = blockerQueue?.counts?.total ?? "missing";
  const revenueSignals = revenueRows.filter(positiveRevenue);
  const partnerSignals = partnerRows.filter((row) => Number(row.signal_count || 0) > 0);
  const opsFailed = Array.isArray(opsRun?.steps)
    ? opsRun.steps.filter((step) => step.status !== "ok")
    : [];
  const actionLogs = {
    total: actionRows.length,
    tooling: recentActionCount(actionRows, /tooling_update|confirmation_queue|decision_brief/i),
    externalDone: actionRows.filter((row) => row.status === "done" && !/tooling|monitor|review|preflight|sweep/i.test(`${row.type || ""} ${row.campaign || ""}`)).length,
  };
  const concreteLandingRows = landingRows.filter((row) => isConcreteUrl(row.proposed_url));
  const readyLandingRows = concreteLandingRows.filter((row) => row.status === "ready_to_spec");
  const loggedLandingRows = actionRows.filter((row) => row.type === "landing_baseline" && row.status === "done");
  const ownedSitesReady = ownedSiteRows.filter((row) => row.readiness === "ready_for_recording");
  const ownedSitesNeedTracking = ownedSiteRows.filter((row) => row.readiness === "needs_cta_tracking");
  const ownedSitesBlocked = ownedSiteRows.filter((row) => row.readiness === "blocked");
  const ownedSiteCtaReady = ownedSiteCtaRows.filter((row) => row.status === "ready_site_update_confirmation_required");
  const ownedSiteCtaBlocked = ownedSiteCtaRows.filter((row) => row.status === "blocked_prepare_only");
  const ownedSiteImplementationReady = ownedSiteImplementationRows.filter((row) => row.status === "ready_confirmation_required" || row.status === "ready_record_after_confirmation");
  const ownedSiteImplementationBlocked = ownedSiteImplementationRows.filter((row) => /^blocked/.test(String(row.status || "")));
  const useCasePageReady = useCasePageRows.filter((row) => row.status === "ready_confirmation_required" || row.status === "ready_local_copy");
  const useCasePageBlocked = useCasePageRows.filter((row) => /^blocked/.test(String(row.status || "")));
  const useCasePagePrepared = useCasePageRows.filter((row) => row.url && row.target_keyword);

  return [
    {
      id: "plugin_growth_profiles",
      requirement: "Every live plugin has a current growth profile with Marketplace URL, priority, metrics, signal, blocker, and next action.",
      status: lowestStatus(pluginRows),
      evidence: `${pluginRows.filter((row) => row.status === "proven").length}/${REQUIRED_PLUGINS.length} required plugin profiles complete; ${pluginRows.filter((row) => row.promotion_gate && row.promotion_gate !== "promotion_ready").length} profile(s) are promotion-gated in downstream requirements.`,
      next_proof: pluginRows.find((row) => row.status !== "proven")?.next_proof || "Profiles are complete; resolve downstream promotion gates in assets, landing, checkout, and compliance requirements.",
      rows: pluginRows,
    },
    {
      id: "fact_refresh_pipeline",
      requirement: "Daily refresh uses current facts instead of memory: public health, portfolio, experiments, queue, weekly report, and ops dashboard.",
      status: opsRun?.status === "ready" && !opsFailed.length ? "proven" : opsRun ? "partial" : "missing",
      evidence: opsRun ? `portfolio ops status=${opsRun.status}; steps=${opsRun.steps?.length || 0}; failed=${opsFailed.length}; blocker queue=${blockerQueue?.status || "missing"}; root_blockers=${blockerRootCount}; raw_blockers=${blockerRawCount}; creem link inventory=${creemLinks?.status || "missing"}; direct_creem_links=${creemLinks?.counts?.direct_creem_links ?? "missing"}; store/domain verification needed=${creemNeedsStoreDomainVerification}; creem store verification=${creemStoreVerification?.status || "missing"}; manual_checks=${creemManualChecks.length}; waiting_provider=${creemWaitingProvider.length}; blocked=${creemBlocked.length}` : "No portfolio ops run JSON found.",
      next_proof: opsFailed.length ? `Fix failed step: ${opsFailed[0].title}` : "Keep running pnpm lead:portfolio-ops before growth decisions.",
      rows: blockerQueueRows.slice(0, 8).map((row) => ({
        plugin: row.plugin,
        readiness: row.readiness,
        kind: row.kind,
        title: row.title,
        symptom_count: row.symptom_count || 1,
        next_action: row.next_action,
        confirmation: row.confirmation,
      })),
    },
    {
      id: "payment_compliance_evidence",
      requirement: "Checkout/payment/compliance state is isolated per plugin and has evidence before scalable promotion.",
      status: creemStoreVerification?.status !== "ready"
        ? "missing"
        : creemManualChecks.length || creemWaitingProvider.length || creemBlocked.length
          ? "partial"
          : "proven",
      evidence: `creem link inventory=${creemLinks?.status || "missing"}; direct_links=${creemLinks?.counts?.direct_creem_links ?? "missing"}; needs_store_domain_verification=${creemNeedsStoreDomainVerification}; compliance_blocked=${creemLinks?.counts?.blocked_compliance ?? "missing"}; checkout_blocked=${creemLinks?.counts?.blocked_checkout ?? "missing"}; store verification=${creemStoreVerification?.status || "missing"}; manual_checks=${creemManualChecks.length}; waiting_provider=${creemWaitingProvider.length}; blocked=${creemBlocked.length}`,
      next_proof: creemManualChecks[0]
        ? `Run read-only Creem dashboard verification for ${creemManualChecks[0].plugin}, then record the evidence with the provided action-log command.`
        : creemWaitingProvider[0]
          ? `Wait for Creem provider evidence for ${creemWaitingProvider[0].plugin}: ${creemWaitingProvider[0].verification}`
          : creemBlocked[0]
            ? `Clear checkout gate for ${creemBlocked[0].plugin}: ${creemBlocked[0].verification}`
            : "Keep Creem link inventory and store/domain verification brief refreshed before traffic expansion.",
      rows: creemStoreVerificationRows.map((row) => ({
        readiness: row.readiness,
        plugin: row.plugin,
        expected_domain: row.expected_domain,
        inventory_status: row.inventory_status,
        product_ids: row.product_ids,
        action: row.action,
        verification: row.verification,
      })),
    },
    {
      id: "priority_ranking",
      requirement: "Plugins are prioritized by revenue proximity, demand, blockers, and channel fit.",
      status: profiles(portfolio).length >= REQUIRED_PLUGINS.length ? "proven" : "missing",
      evidence: profiles(portfolio).map((profile) => `${profile.priority?.rank || "?"}. ${profile.name}: ${profile.priority?.label || "unranked"}`).join("; ") || "No portfolio priority rows found.",
      next_proof: "Refresh portfolio dashboard whenever Creator Space, payment, or customer signals change.",
    },
    {
      id: "promotion_assets",
      requirement: "Each high-priority plugin has Marketplace, Community, directory, partner, customer, demo/use-case, SEO/AEO, and tracking assets.",
      status: assetCoverage?.status === "ready" && Number(assetCoverage.asset_ready_plugins ?? assetCoverage.covered_plugins ?? 0) === REQUIRED_PLUGINS.length ? "proven" : "partial",
      evidence: `asset coverage status=${assetCoverage?.status || "missing"}; asset_ready=${assetCoverage?.asset_ready_plugins ?? assetCoverage?.covered_plugins ?? 0}/${assetCoverage?.total_plugins ?? REQUIRED_PLUGINS.length}; promotion_ready=${assetCoverage?.promotion_ready_plugins ?? "unknown"}/${assetCoverage?.total_plugins ?? REQUIRED_PLUGINS.length}; promotion_gated=${assetCoverage?.promotion_gated_plugins ?? assetCoverage?.gated_plugins ?? "unknown"}`,
      next_proof: Number(assetCoverage?.asset_needs_work_plugins || 0)
        ? assetCoverage?.recommendation || "Run pnpm lead:asset-coverage."
        : "Promotion assets are complete; resolve downstream execution gates in landing, checkout, compliance, confirmation, and experiment requirements.",
      rows: Array.isArray(assetCoverage?.rows) ? assetCoverage.rows.map((row) => ({
        plugin: row.plugin,
        status: row.status,
        asset_ready: row.asset_ready,
        asset_missing_checks: row.asset_missing_checks,
        promotion_ready: row.promotion_ready,
        coverage_pct: row.coverage_pct,
        top_blocker: row.top_blocker,
        next_local_step: row.next_local_step,
      })) : [],
    },
    {
      id: "owned_landing_tracking",
      requirement: "Every plugin has a concrete owned landing/use-case URL and tracking path before scalable promotion.",
      status: unresolvedLanding.length
        ? "partial"
        : ownedSitesNeedTracking.length || ownedSitesBlocked.length || (readyLandingRows.length && !loggedLandingRows.length)
          ? "partial"
          : landingTargetDecision?.status === "ready"
            ? "proven"
            : "missing",
      evidence: unresolvedLanding.length
        ? `${unresolvedLanding.length} landing target decision(s) unresolved: ${unresolvedLanding.map((row) => row.plugin).join(", ")}.`
        : `landing target decision status=${landingTargetDecision?.status || "missing"}; concrete landing URLs=${concreteLandingRows.length}; ready specs=${readyLandingRows.length}; owned sites ready=${ownedSitesReady.length}; owned sites need tracking=${ownedSitesNeedTracking.length}; owned sites blocked=${ownedSitesBlocked.length}; CTA kit ready=${ownedSiteCtaReady.length}; CTA kit blocked=${ownedSiteCtaBlocked.length}; implementation ready=${ownedSiteImplementationReady.length}; implementation blocked=${ownedSiteImplementationBlocked.length}; local drop patches ready=${ownedSiteDropPatchRows.length}; use-case pages ready/local=${useCasePageReady.length}; use-case local packages ready=${useCasePagePackageRows.length}; publish preflight assets=${publishPreflightRows.length}; publish preflight warnings=${publishPreflight?.counts?.warnings ?? "missing"}; publish preflight errors=${publishPreflight?.counts?.errors ?? "missing"}; use-case pages blocked=${useCasePageBlocked.length}; logged landing baseline actions=${loggedLandingRows.length}`,
      next_proof: unresolvedLanding[0]
        ? `Choose concrete URL for ${unresolvedLanding[0].plugin}: ${unresolvedLanding[0].recommended_url}`
        : ownedSitesNeedTracking[0]
          ? (ownedSiteCtaReady.find((row) => samePlugin(row.plugin, ownedSitesNeedTracking[0].plugin))
              ? `Use the owned-site implementation brief for ${ownedSitesNeedTracking[0].plugin}, then verify and record the tracked link after confirmation.`
              : `Add tracked Marketplace CTA to ${ownedSitesNeedTracking[0].plugin}: ${ownedSitesNeedTracking[0].next_action}`)
          : ownedSitesBlocked[0]
            ? `Keep ${ownedSitesBlocked[0].plugin} gated: ${ownedSitesBlocked[0].next_action}`
        : readyLandingRows.length && !loggedLandingRows.length
          ? `Confirm and record the first landing baseline action: ${readyLandingRows[0].plugin} -> ${readyLandingRows[0].proposed_url}`
          : "Rerun landing baseline and public health to verify no <owned-domain> placeholders remain.",
      rows: unresolvedLanding.length
        ? unresolvedLanding.map((row) => ({
            plugin: row.plugin,
            status: row.status,
            recommended_url: row.recommended_url,
            reason: row.reason,
          }))
        : landingRows.map((row) => ({
            plugin: row.plugin,
            status: row.status,
            proposed_url: row.proposed_url,
            target_registry_status: row.target_registry_status,
            target_source: row.target_source,
            owned_site_readiness: ownedSiteRows.find((site) => samePlugin(site.plugin, row.plugin))?.readiness || "",
            owned_site_next_action: ownedSiteRows.find((site) => samePlugin(site.plugin, row.plugin))?.next_action || "",
            owned_site_cta_status: ownedSiteCtaRows.find((kit) => samePlugin(kit.plugin, row.plugin))?.status || "",
            owned_site_implementation_status: ownedSiteImplementationRows.find((brief) => samePlugin(brief.plugin, row.plugin))?.status || "",
            owned_site_drop_patch_status: ownedSiteDropPatchRows.find((patch) => samePlugin(patch.plugin, row.plugin))?.status || "",
            owned_site_drop_patch_file: ownedSiteDropPatchRows.find((patch) => samePlugin(patch.plugin, row.plugin))?.index_file || "",
            owned_site_publish_preflight_status: publishPreflightRows.find((asset) => asset.type === "owned_site_patch" && samePlugin(asset.plugin, row.plugin))?.status || "",
            owned_site_publish_preflight_warnings: publishPreflightRows.find((asset) => asset.type === "owned_site_patch" && samePlugin(asset.plugin, row.plugin))?.warnings?.length ?? "",
            owned_site_publish_preflight_errors: publishPreflightRows.find((asset) => asset.type === "owned_site_patch" && samePlugin(asset.plugin, row.plugin))?.errors?.length ?? "",
            use_case_page_status: useCasePageRows.find((brief) => samePlugin(brief.plugin, row.plugin))?.status || "",
            use_case_page_package_status: useCasePagePackageRows.find((item) => samePlugin(item.plugin, row.plugin))?.status || "",
            use_case_page_package_file: useCasePagePackageRows.find((item) => samePlugin(item.plugin, row.plugin))?.html_file || "",
            use_case_publish_preflight_status: publishPreflightRows.find((asset) => asset.type === "use_case_page" && samePlugin(asset.plugin, row.plugin))?.status || "",
            use_case_publish_preflight_warnings: publishPreflightRows.find((asset) => asset.type === "use_case_page" && samePlugin(asset.plugin, row.plugin))?.warnings?.length ?? "",
            use_case_publish_preflight_errors: publishPreflightRows.find((asset) => asset.type === "use_case_page" && samePlugin(asset.plugin, row.plugin))?.errors?.length ?? "",
          })),
    },
    {
      id: "searchable_use_case_pages",
      requirement: "Each plugin has a searchable owned use-case page brief with keyword, campaign, CTA, confirmation gate, and blocker status.",
      status: useCasePagePrepared.length >= REQUIRED_PLUGINS.length && useCasePageReady.length === REQUIRED_PLUGINS.length
        ? "proven"
        : useCasePagePrepared.length
          ? "partial"
          : "missing",
      evidence: `use-case page brief status=${useCasePages?.status || "missing"}; prepared=${useCasePagePrepared.length}/${REQUIRED_PLUGINS.length}; ready/local=${useCasePageReady.length}; local packages=${useCasePagePackageRows.length}; publish preflight=${publishPreflight?.status || "missing"}; publish preflight errors=${publishPreflight?.counts?.errors ?? "missing"}; blocked=${useCasePageBlocked.length}; counts=${JSON.stringify(useCasePages?.counts || {})}`,
      next_proof: useCasePageReady[0]
        ? `Confirm, publish, verify, and record first ready use-case page: ${useCasePageReady[0].plugin} -> ${useCasePageReady[0].url}`
        : useCasePageBlocked[0]
          ? `Keep ${useCasePageBlocked[0].plugin} local-only until blocker clears: ${useCasePageBlocked[0].next_local_step || useCasePageBlocked[0].status}`
          : "Run pnpm lead:use-case-pages after asset kits, landing baseline, owned-site implementation, and public health.",
      rows: useCasePageRows.map((row) => ({
        status: row.status,
        plugin: row.plugin,
        url: row.url,
        target_keyword: row.target_keyword,
        campaign: row.campaign,
        confirmation: row.confirmation,
        next_local_step: row.next_local_step,
        local_package_status: useCasePagePackageRows.find((item) => samePlugin(item.plugin, row.plugin))?.status || "",
        local_package_file: useCasePagePackageRows.find((item) => samePlugin(item.plugin, row.plugin))?.html_file || "",
        publish_preflight_status: publishPreflightRows.find((asset) => asset.type === "use_case_page" && samePlugin(asset.plugin, row.plugin))?.status || "",
        publish_preflight_warnings: publishPreflightRows.find((asset) => asset.type === "use_case_page" && samePlugin(asset.plugin, row.plugin))?.warnings?.length ?? "",
        publish_preflight_errors: publishPreflightRows.find((asset) => asset.type === "use_case_page" && samePlugin(asset.plugin, row.plugin))?.errors?.length ?? "",
      })),
    },
    {
      id: "measurable_experiment_loop",
      requirement: "Small experiments have one channel, evidence, review windows, and continue/stop/scale rules.",
      status: experimentDecision?.status === "ready" && experimentRows.length >= REQUIRED_PLUGINS.length ? "proven" : "partial",
      evidence: `experiment decision status=${experimentDecision?.status || "missing"}; rows=${experimentRows.length}; counts=${JSON.stringify(experimentDecision?.counts || {})}`,
      next_proof: canonicalRecommendation || experimentDecision?.recommendation || "Run pnpm lead:experiment-decisions.",
      rows: experimentRows.map((row) => ({
        plugin: row.plugin,
        channel: row.channel,
        decision: row.decision,
        next_local_step: row.next_local_step,
      })),
    },
    {
      id: "channel_system",
      requirement: "Marketplace, Community, directories, partners, agency outreach, existing customers, cross-promotion, and SEO/AEO are represented with logs or decision gates.",
      status: actionLogs.total && confirmationRows.length && crossPromoRows.length ? "proven" : "partial",
      evidence: `actions=${actionLogs.total}; external_done=${actionLogs.externalDone}; confirmation_rows=${confirmationRows.length}; partners=${partnerRows.length}; partner_signals=${partnerSignals.length}; cross_promo_rows=${crossPromoRows.length}; cross_promo_ready=${crossPromoReady.length}; cross_promo_blocked=${crossPromoBlocked.length}`,
      next_proof: crossPromoRows.length
        ? "Keep every external action in action log and partner log with a review window."
        : "Run pnpm lead:cross-promo so related-plugin/owned-site/success-page promotion has an evidence-gated matrix.",
      rows: crossPromoRows.slice(0, 8).map((row) => ({
        status: row.status,
        source_plugin: row.source_plugin,
        target_plugin: row.target_plugin,
        source_site: row.source_site,
        campaign: row.campaign,
        confirmation: row.confirmation,
      })),
    },
    {
      id: "weekly_report",
      requirement: "Weekly report shows per-plugin metrics, channel signals, stop rules, next three actions, confirmations, risks, and blockers.",
      status: weekly?.status === "ready" ? "proven" : weekly ? "partial" : "missing",
      evidence: weekly ? `weekly status=${weekly.status}; recommendation=${weekly.recommendation || "none"}; canonical daily confirmation=${canonicalConfirmation || "none"}` : "No weekly report JSON found.",
      next_proof: "Run pnpm lead:portfolio-weekly after portfolio ops refresh.",
    },
    {
      id: "safety_confirmation_gates",
      requirement: "External actions are gated with action, target, risk, benefit, confirmation phrase, and verification.",
      status: confirmationQueue?.status === "ready" && confirmationRows.length && confirmationSafetyAudit.status === "complete" ? "proven" : "partial",
      evidence: `confirmation queue status=${confirmationQueue?.status || "missing"}; ready=${readyConfirmations}; blocked=${blockedConfirmations}; safety_audit=${confirmationSafetyAudit.status || "missing"}; safety_complete=${confirmationSafetyAudit.complete_rows ?? "missing"}/${confirmationSafetyAudit.ready_rows ?? "missing"}; canonical_next=${canonicalConfirmation || "none"}; queue_default_next=${confirmationQueue?.next_confirmation || "none"}`,
      next_proof: confirmationSafetyAudit.status && confirmationSafetyAudit.status !== "complete"
        ? `Fix missing ready-row safety fields: ${(confirmationSafetyAudit.missing_fields || []).join(", ") || "unknown"}.`
        : "Do not send, publish, deploy, submit, upload, or modify payment until the exact confirmation phrase is given.",
      rows: confirmationRows.slice(0, 8).map((row) => ({
        readiness: row.readiness,
        plugin: row.plugin,
        kind: row.kind,
        target: row.target,
        confirmation: row.confirmation,
        safety_status: (confirmationSafetyAudit.items || []).find((item) => item.confirmation === row.confirmation)?.status || "",
      })),
    },
    {
      id: "real_growth_signals",
      requirement: "The system tracks real users, installs/opens, customer replies, opportunities, and revenue instead of vanity activity.",
      status: revenueSignals.length || partnerSignals.length ? "partial" : "missing",
      evidence: `external revenue signals=${revenueSignals.length}; revenue=$${revenueSignals.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0).toFixed(2)}; partner signals=${partnerSignals.length}`,
      next_proof: "Record confirmed installs/replies/revenue after each experiment review; scale only after logged signal.",
    },
  ];
}

function recommendationFor(requirements) {
  const blocked = requirements.find((item) => item.status === "blocked");
  if (blocked) return `Resolve blocked requirement: ${blocked.requirement}`;
  const missing = requirements.find((item) => item.status === "missing");
  if (missing) return `Create missing evidence for ${missing.id}: ${missing.next_proof}`;
  const partial = requirements.find((item) => item.status === "partial");
  if (partial) return `Next coverage gap: ${partial.id}. ${partial.next_proof}`;
  return "Growth operating system coverage is proven by current local evidence; continue weekly experiment reviews.";
}

function addEvidenceFiles(requirements) {
  return requirements.map((row) => ({
    ...row,
    evidence_files: REQUIREMENT_EVIDENCE_FILES[row.id] || [],
  }));
}

function completionAudit(requirements) {
  const notProven = requirements.filter((row) => row.status !== "proven");
  const proven = requirements.filter((row) => row.status === "proven");
  return {
    verdict: notProven.length ? "not_complete" : "complete",
    requirements_total: requirements.length,
    proven: proven.length,
    not_proven: notProven.length,
    blocking_requirements: notProven.map((row) => ({
      id: row.id,
      status: row.status,
      requirement: row.requirement,
      evidence: row.evidence,
      next_proof: row.next_proof,
      evidence_files: row.evidence_files,
    })),
    rule: "Do not mark the long-running goal complete unless every requirement is proven by current evidence files and no required external action remains unexecuted or unverified.",
  };
}

function build({
  args,
  portfolio,
  assetCoverage,
  landingBaseline,
  landingTargetDecision,
  ownedSiteAudit,
  creemLinks,
  creemStoreVerification,
  ownedSiteCtaKit,
  crossPromotion,
  ownedSiteImplementation,
  ownedSiteDropPatch,
  useCasePages,
  useCasePagePackages,
  publishPreflight,
  experimentDecision,
  confirmationQueue,
  todayPlan,
  blockerQueue,
  weekly,
  opsRun,
  actionRows,
  revenueRows,
  partnerRows,
}) {
  const requirements = addEvidenceFiles(buildRequirements({
    portfolio,
    assetCoverage,
    landingBaseline,
    landingTargetDecision,
    ownedSiteAudit,
    creemLinks,
    creemStoreVerification,
    ownedSiteCtaKit,
    crossPromotion,
    ownedSiteImplementation,
    ownedSiteDropPatch,
    useCasePages,
    useCasePagePackages,
    publishPreflight,
    experimentDecision,
    confirmationQueue,
    todayPlan,
    blockerQueue,
    weekly,
    opsRun,
    actionRows,
    revenueRows,
    partnerRows,
  }));
  const counts = requirements.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const audit = completionAudit(requirements);
  const status = audit.verdict === "complete" ? "complete_evidence" : "in_progress";
  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    status,
    completion_audit: audit,
    recommendation: recommendationFor(requirements),
    counts,
    requirements,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Growth Goal Coverage",
    "",
    `Generated: ${report.generated_at}`,
    `Date: ${report.today}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Coverage Counts",
    "",
    "| Status | Count |",
    "|---|---:|",
  ];
  for (const [status, count] of Object.entries(report.counts)) {
    lines.push(`| ${clean(status)} | ${count} |`);
  }
  if (!Object.keys(report.counts).length) lines.push("| none | 0 |");

  lines.push(
    "",
    "## Completion Audit",
    "",
    `- Verdict: ${clean(report.completion_audit?.verdict || "unknown")}`,
    `- Requirements proven: ${report.completion_audit?.proven || 0}/${report.completion_audit?.requirements_total || 0}`,
    `- Not yet proven: ${report.completion_audit?.not_proven || 0}`,
    `- Rule: ${clean(report.completion_audit?.rule || "")}`,
    "",
  );
  if (report.completion_audit?.blocking_requirements?.length) {
    lines.push("| Status | Requirement ID | Next proof | Evidence files |", "|---|---|---|---|");
    for (const row of report.completion_audit.blocking_requirements) {
      lines.push(`| ${clean(row.status)} | ${clean(row.id)} | ${clean(row.next_proof)} | ${clean((row.evidence_files || []).join("; "))} |`);
    }
  } else {
    lines.push("All requirements are proven by the current local evidence set.");
  }

  lines.push(
    "",
    "## Requirements",
    "",
    "| Status | Requirement | Evidence | Next proof | Evidence files |",
    "|---|---|---|---|---|",
  );
  for (const row of report.requirements) {
    lines.push(`| ${clean(row.status)} | ${clean(row.requirement)} | ${clean(row.evidence)} | ${clean(row.next_proof)} | ${clean((row.evidence_files || []).join("; "))} |`);
  }

  for (const row of report.requirements.filter((item) => Array.isArray(item.rows) && item.rows.length)) {
    lines.push("", `## ${row.id}`, "", "```json", JSON.stringify(row.rows, null, 2), "```");
  }

  lines.push(
    "",
    "## Commands",
    "",
    "```bash",
    "pnpm lead:portfolio-ops -- --skip-signals",
    "pnpm lead:use-case-pages",
    "pnpm lead:use-case-page-package",
    "pnpm lead:creem-links",
    "pnpm lead:creem-store-verification",
    "pnpm lead:publish-preflight",
    "pnpm lead:blocker-queue",
    "pnpm lead:goal-coverage",
    "sed -n '1,180p' .tmp/framer-growth-goal-coverage.md",
    "```",
    "",
    "## Safety",
    "",
    "- This audit is local-only and does not send Gmail, publish, submit, upload, deploy, or modify payment settings.",
    "- Treat partial or missing rows as work still required; do not mark the long-running goal complete from weaker evidence.",
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

  const [
    portfolio,
    assetCoverage,
    landingBaseline,
    landingTargetDecision,
    ownedSiteAudit,
    creemLinks,
    creemStoreVerification,
    ownedSiteCtaKit,
    crossPromotion,
    ownedSiteImplementation,
    ownedSiteDropPatch,
    useCasePages,
    useCasePagePackages,
    publishPreflight,
    experimentDecision,
    confirmationQueue,
    todayPlan,
    blockerQueue,
    weekly,
    opsRun,
    actionRows,
    revenueRows,
    partnerRows,
  ] = await Promise.all([
    readJson(args.portfolio, null),
    readJson(args.assetCoverage, null),
    readJson(args.landingBaseline, null),
    readJson(args.landingTargetDecision, null),
    readJson(args.ownedSiteAudit, null),
    readJson(args.creemLinks, null),
    readJson(args.creemStoreVerification, null),
    readJson(args.ownedSiteCtaKit, null),
    readJson(args.crossPromotion, null),
    readJson(args.ownedSiteImplementation, null),
    readJson(args.ownedSiteDropPatch, null),
    readJson(args.useCasePages, null),
    readJson(args.useCasePagePackages, null),
    readJson(args.publishPreflight, null),
    readJson(args.experimentDecision, null),
    readJson(args.confirmationQueue, null),
    readJson(args.todayPlan, null),
    readJson(args.blockerQueue, null),
    readJson(args.weekly, null),
    readJson(args.opsRun, null),
    readRows(args.actions),
    readRows(args.revenue),
    readRows(args.partners),
  ]);

  const report = build({
    args,
    portfolio,
    assetCoverage,
    landingBaseline,
    landingTargetDecision,
    ownedSiteAudit,
    creemLinks,
    creemStoreVerification,
    ownedSiteCtaKit,
    crossPromotion,
    ownedSiteImplementation,
    ownedSiteDropPatch,
    useCasePages,
    useCasePagePackages,
    publishPreflight,
    experimentDecision,
    confirmationQueue,
    todayPlan,
    blockerQueue,
    weekly,
    opsRun,
    actionRows,
    revenueRows,
    partnerRows,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Goal coverage: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
