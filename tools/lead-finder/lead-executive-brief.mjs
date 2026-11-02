#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OPS_RUN = ".tmp/framer-portfolio-ops-run.json";
const DEFAULT_TODAY = ".tmp/framer-today.json";
const DEFAULT_CONFIRMATIONS = ".tmp/framer-confirmation-queue.json";
const DEFAULT_WEEKLY = ".tmp/framer-portfolio-weekly-report.json";
const DEFAULT_GOAL_COVERAGE = ".tmp/framer-growth-goal-coverage.json";
const DEFAULT_PROOF_GAPS = ".tmp/framer-proof-gap-queue.json";
const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_CHECKOUT = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_OWNED_SITE_CTA = ".tmp/framer-owned-site-cta-kit.json";
const DEFAULT_CROSS_PROMOTION = ".tmp/framer-cross-promotion-matrix.json";
const DEFAULT_OWNED_SITE_IMPLEMENTATION = ".tmp/framer-owned-site-implementation-brief.json";
const DEFAULT_USE_CASE_PAGES = ".tmp/framer-use-case-page-brief.json";
const DEFAULT_USE_CASE_PAGE_PACKAGES = ".tmp/framer-use-case-page-packages.json";
const DEFAULT_PUBLISH_PREFLIGHT = ".tmp/framer-publish-preflight.json";
const DEFAULT_BLOCKER_QUEUE = ".tmp/framer-portfolio-blocker-queue.json";
const DEFAULT_CREEM_LINKS = ".tmp/framer-creem-link-inventory.json";
const DEFAULT_CREEM_STORE_VERIFICATION = ".tmp/framer-creem-store-verification-brief.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-growth-executive-brief.md";
const DEFAULT_JSON = ".tmp/framer-growth-executive-brief.json";

function usage() {
  return `
Usage:
  pnpm lead:executive

Options:
  --ops-run <file>          Portfolio ops run JSON. Default: ${DEFAULT_OPS_RUN}
  --today <file>            Today plan JSON. Default: ${DEFAULT_TODAY}
  --confirmations <file>    Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATIONS}
  --weekly <file>           Weekly report JSON. Default: ${DEFAULT_WEEKLY}
  --goal-coverage <file>    Growth goal coverage JSON. Default: ${DEFAULT_GOAL_COVERAGE}
  --proof-gaps <file>       Proof gap queue JSON. Default: ${DEFAULT_PROOF_GAPS}
  --public-health <file>    Public health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --checkout <file>         Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT}
  --owned-site-cta <file>   Owned site CTA kit JSON. Default: ${DEFAULT_OWNED_SITE_CTA}
  --cross-promotion <file>  Cross-promotion matrix JSON. Default: ${DEFAULT_CROSS_PROMOTION}
  --owned-site-implementation <file> Owned site implementation brief JSON. Default: ${DEFAULT_OWNED_SITE_IMPLEMENTATION}
  --use-case-pages <file>   Use-case page brief JSON. Default: ${DEFAULT_USE_CASE_PAGES}
  --use-case-page-packages <file> Use-case local package JSON. Default: ${DEFAULT_USE_CASE_PAGE_PACKAGES}
  --publish-preflight <file> Publish preflight JSON. Default: ${DEFAULT_PUBLISH_PREFLIGHT}
  --blocker-queue <file>   Portfolio blocker queue JSON. Default: ${DEFAULT_BLOCKER_QUEUE}
  --creem-links <file>      Creem link inventory JSON. Default: ${DEFAULT_CREEM_LINKS}
  --creem-store-verification <file> Creem store/domain verification brief JSON. Default: ${DEFAULT_CREEM_STORE_VERIFICATION}
  --actions <file>          Action log CSV. Default: ${DEFAULT_ACTIONS}
  --revenue <file>          Revenue CSV. Default: ${DEFAULT_REVENUE}
  --output <file>           Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>             JSON output. Default: ${DEFAULT_JSON}
  --help                    Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    opsRun: DEFAULT_OPS_RUN,
    today: DEFAULT_TODAY,
    confirmations: DEFAULT_CONFIRMATIONS,
    weekly: DEFAULT_WEEKLY,
    goalCoverage: DEFAULT_GOAL_COVERAGE,
    proofGaps: DEFAULT_PROOF_GAPS,
    publicHealth: DEFAULT_PUBLIC_HEALTH,
    checkout: DEFAULT_CHECKOUT,
    ownedSiteCta: DEFAULT_OWNED_SITE_CTA,
    crossPromotion: DEFAULT_CROSS_PROMOTION,
    ownedSiteImplementation: DEFAULT_OWNED_SITE_IMPLEMENTATION,
    useCasePages: DEFAULT_USE_CASE_PAGES,
    useCasePagePackages: DEFAULT_USE_CASE_PAGE_PACKAGES,
    publishPreflight: DEFAULT_PUBLISH_PREFLIGHT,
    blockerQueue: DEFAULT_BLOCKER_QUEUE,
    creemLinks: DEFAULT_CREEM_LINKS,
    creemStoreVerification: DEFAULT_CREEM_STORE_VERIFICATION,
    actions: DEFAULT_ACTIONS,
    revenue: DEFAULT_REVENUE,
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
      "--ops-run": "opsRun",
      "--today": "today",
      "--confirmations": "confirmations",
      "--weekly": "weekly",
      "--goal-coverage": "goalCoverage",
      "--proof-gaps": "proofGaps",
      "--public-health": "publicHealth",
      "--checkout": "checkout",
      "--owned-site-cta": "ownedSiteCta",
      "--cross-promotion": "crossPromotion",
      "--owned-site-implementation": "ownedSiteImplementation",
      "--use-case-pages": "useCasePages",
      "--use-case-page-packages": "useCasePagePackages",
      "--publish-preflight": "publishPreflight",
      "--blocker-queue": "blockerQueue",
      "--creem-links": "creemLinks",
      "--creem-store-verification": "creemStoreVerification",
      "--actions": "actions",
      "--revenue": "revenue",
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

function short(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function inferPlugin(value) {
  const text = String(value || "");
  if (/polyglot|license\.polyglotaeo|cloudflare|worker custom domain/i.test(text)) return "Polyglot AEO";
  if (/ally/i.test(text)) return "Ally Auditor";
  if (/loka|getloka/i.test(text)) return "Loka - Localization Hub";
  if (/gaode|amap/i.test(text)) return "Gaode Maps";
  return "Portfolio";
}

function money(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function realRevenueRows(rows) {
  return rows.filter((row) => {
    const text = `${row.status || ""} ${row.product || ""} ${row.customer || ""} ${row.notes || ""}`;
    if (/test environment|test mode|test\.creem\.io/i.test(text)) return false;
    return money(row.amount_usd) > 0 && /real external|paid|sale|subscription|customer|creem/i.test(text);
  });
}

function statusLine({ opsRun, goalCoverage, confirmationQueue }) {
  const failed = Array.isArray(opsRun?.steps) ? opsRun.steps.filter((step) => step.status !== "ok") : [];
  return {
    ops: opsRun ? `${opsRun.status || "unknown"} (${opsRun.steps?.length || 0} steps, ${failed.length} failed)` : "missing",
    goal: goalCoverage ? `${goalCoverage.status || "unknown"} (${Object.entries(goalCoverage.counts || {}).map(([k, v]) => `${v} ${k}`).join(", ") || "no counts"})` : "missing",
    confirmation: confirmationQueue ? `${confirmationQueue.counts?.ready_confirmation_required || 0} ready, ${confirmationQueue.counts?.blocked || 0} blocked` : "missing",
  };
}

function readyConfirmationRows(confirmationQueue) {
  return Array.isArray(confirmationQueue?.rows)
    ? confirmationQueue.rows.filter((row) => row.readiness === "ready_confirmation_required")
    : [];
}

function sameConfirmation(left, right) {
  return Boolean(left && right && String(left).trim() === String(right).trim());
}

function matchingConfirmationRow(rows, action) {
  if (!action) return null;
  const confirmation = action.confirmation || "";
  const plugin = action.plugin || inferPlugin(`${action.title || ""} ${action.reason || ""} ${confirmation}`);
  return rows.find((row) => sameConfirmation(row.confirmation, confirmation)) ||
    rows.find((row) => row.plugin === plugin && action.title && new RegExp(action.title.replace(/[.*+?^${}()|[\]\\]/g, ".*"), "i").test(row.action || row.title || "")) ||
    null;
}

function mergeActionWithQueue(action, queueRow) {
  if (!action) return null;
  return {
    plugin: action.plugin || queueRow?.plugin || "",
    title: action.title || queueRow?.action || queueRow?.title || queueRow?.kind || "Review confirmation-gated action",
    target: action.target || queueRow?.target || "",
    reason: action.reason || queueRow?.expected_benefit || queueRow?.action || queueRow?.verification || "",
    confirmation: action.confirmation || queueRow?.confirmation || "",
    risk: action.risk || queueRow?.risk || "",
    expected_benefit: action.expected_benefit || queueRow?.expected_benefit || "",
    verification: action.verification || queueRow?.verification || "",
  };
}

function topAction(today, weekly, confirmationQueue) {
  const needsConfirmation = Array.isArray(today?.needs_confirmation) ? today.needs_confirmation[0] : null;
  const weeklyAction = Array.isArray(weekly?.next_actions) ? weekly.next_actions[0] : null;
  const readyRows = readyConfirmationRows(confirmationQueue);
  const ready = readyRows[0] || null;
  if (needsConfirmation) {
    const actionText = `${needsConfirmation.plugin || ""} ${needsConfirmation.title || ""} ${needsConfirmation.target || ""} ${needsConfirmation.reason || ""} ${needsConfirmation.confirmation || ""}`;
    const action = {
      plugin: needsConfirmation.plugin || inferPlugin(actionText),
      title: needsConfirmation.title || "Review today's confirmation-gated action",
      target: needsConfirmation.target || "",
      reason: needsConfirmation.reason || needsConfirmation.expected_benefit || "",
      confirmation: needsConfirmation.confirmation || "",
      risk: needsConfirmation.risk || "",
      expected_benefit: needsConfirmation.expected_benefit || "",
      verification: needsConfirmation.verification || needsConfirmation.evidence || "",
    };
    return mergeActionWithQueue(action, matchingConfirmationRow(readyRows, action));
  }
  if (ready) {
    return mergeActionWithQueue({
      plugin: ready.plugin || "",
      title: ready.action || ready.title || ready.kind || "Review confirmation queue",
      target: ready.target || "",
      reason: ready.action || ready.expected_benefit || ready.verification || "",
      confirmation: ready.confirmation || "",
      risk: ready.risk || "",
      expected_benefit: ready.expected_benefit || "",
      verification: ready.verification || "",
    }, ready);
  }
  const fallback = {
    plugin: weeklyAction?.plugin || "",
    title: needsConfirmation?.title || weeklyAction?.title || "Refresh portfolio ops",
    target: needsConfirmation?.target || "",
    reason: needsConfirmation?.reason || weeklyAction?.reason || today?.recommendation || "",
    confirmation: needsConfirmation?.confirmation || weeklyAction?.confirmation || "",
    risk: needsConfirmation?.risk || "",
    expected_benefit: needsConfirmation?.expected_benefit || "",
    verification: needsConfirmation?.verification || "",
  };
  return mergeActionWithQueue(fallback, matchingConfirmationRow(readyRows, fallback));
}

function safeLocalActions(today) {
  return (Array.isArray(today?.can_do_now) ? today.can_do_now : [])
    .slice(0, 3)
    .map((item) => ({
      title: item.title || "",
      status: item.status || "",
      reason: item.reason || item.evidence || "",
      command: item.command || "",
    }));
}

function blockedActions(today, publicHealth, checkout) {
  const blockedToday = (Array.isArray(today?.blocked_external) ? today.blocked_external : [])
    .slice(0, 3)
    .map((item) => ({
      title: item.title || "",
      status: item.status || "blocked",
      reason: item.reason || "",
    }));
  const blockedPlugins = (Array.isArray(publicHealth?.profiles) ? publicHealth.profiles : [])
    .filter((profile) => profile.status === "blocked")
    .map((profile) => ({
      title: profile.name,
      status: "blocked",
      reason: profile.blockers?.[0] || profile.next_action || "",
    }));
  const checkoutBlockers = (Array.isArray(checkout?.blockers) ? checkout.blockers : [])
    .slice(0, 4)
    .map((item) => ({
      title: item.label || item.id || "Checkout origin",
      status: "blocked",
      reason: item.detail || "",
    }));
  return [...blockedToday, ...blockedPlugins, ...checkoutBlockers].slice(0, 8);
}

function pluginRows(publicHealth, weekly) {
  const weeklyProfiles = Array.isArray(weekly?.profiles) ? weekly.profiles : [];
  const byPlugin = new Map(weeklyProfiles.map((row) => [row.plugin, row]));
  return (Array.isArray(publicHealth?.profiles) ? publicHealth.profiles : []).map((profile) => {
    const weeklyRow = byPlugin.get(profile.name) || {};
    return {
      plugin: profile.name,
      status: profile.status,
      priority: weeklyRow.priority || "",
      users: weeklyRow.users || "",
      opens: weeklyRow.opens || "",
      revenue_usd: Number(weeklyRow.revenue_usd || 0),
      main_issue: profile.blockers?.[0] || profile.gaps?.[0] || "",
      next_action: weeklyRow.next_action || profile.next_action || "",
    };
  });
}

function crossPromotionSummary(crossPromotion) {
  const rows = Array.isArray(crossPromotion?.rows) ? crossPromotion.rows : [];
  return {
    status: crossPromotion?.status || "missing",
    recommendation: crossPromotion?.recommendation || "",
    counts: crossPromotion?.counts || {},
    rows: rows.slice(0, 6).map((row) => ({
      status: row.status,
      source_plugin: row.source_plugin,
      target_plugin: row.target_plugin,
      source_site: row.source_site,
      campaign: row.campaign,
      confirmation: row.confirmation,
      next_local_step: row.next_local_step,
    })),
  };
}

function ownedSiteImplementationSummary(brief) {
  const items = Array.isArray(brief?.items) ? brief.items : [];
  return {
    status: brief?.status || "missing",
    recommendation: brief?.recommendation || "",
    counts: brief?.counts || {},
    rows: items.slice(0, 6).map((item) => ({
      status: item.status,
      plugin: item.plugin,
      site_url: item.site_url,
      primary_cta_label: item.primary_cta_label,
      related_ready: item.related_plugin_links?.length || 0,
      confirmation: item.confirmation,
    })),
  };
}

function useCasePagesSummary(brief) {
  const items = Array.isArray(brief?.items) ? brief.items : [];
  return {
    status: brief?.status || "missing",
    recommendation: brief?.recommendation || "",
    counts: brief?.counts || {},
    rows: items.slice(0, 6).map((item) => ({
      status: item.status,
      plugin: item.plugin,
      url: item.url,
      target_keyword: item.target_keyword,
      campaign: item.campaign,
      confirmation: item.confirmation,
    })),
  };
}

function publishPreflightSummary(preflight) {
  const assets = Array.isArray(preflight?.assets) ? preflight.assets : [];
  return {
    status: preflight?.status || "missing",
    recommendation: preflight?.recommendation || "",
    counts: preflight?.counts || {},
    rows: assets.slice(0, 6).map((asset) => ({
      status: asset.status,
      type: asset.type,
      plugin: asset.plugin,
      target: asset.target,
      campaign: asset.campaign,
      warnings: asset.warnings?.length || 0,
      errors: asset.errors?.length || 0,
      confirmation: asset.confirmation,
    })),
  };
}

function creemLinksSummary(inventory) {
  const rows = Array.isArray(inventory?.rows) ? inventory.rows : [];
  return {
    status: inventory?.status || "missing",
    recommendation: inventory?.recommendation || "",
    counts: inventory?.counts || {},
    rows: rows.slice(0, 6).map((row) => ({
      status: row.status,
      plugin: row.plugin,
      target_url: row.target_url,
      product_ids: row.product_ids || [],
      direct_creem_unique_links: row.direct_creem_unique_links || 0,
      direct_creem_occurrences: row.direct_creem_occurrences || 0,
      open_compliance_warnings: row.open_compliance_warnings || 0,
      store_domain_evidence_count: row.store_domain_evidence_count || 0,
      approval_evidence_count: row.approval_evidence_count || 0,
      next_action: row.next_action || "",
    })),
  };
}

function creemStoreVerificationSummary(brief) {
  const rows = Array.isArray(brief?.rows) ? brief.rows : [];
  return {
    status: brief?.status || "missing",
    recommendation: brief?.recommendation || "",
    counts: brief?.counts || {},
    rows: rows.slice(0, 6).map((row) => ({
      readiness: row.readiness,
      plugin: row.plugin,
      expected_domain: row.expected_domain,
      inventory_status: row.inventory_status,
      product_ids: row.product_ids || [],
      action: row.action || "",
      verification: row.verification || "",
    })),
  };
}

function proofGapSummary(queue) {
  const rows = Array.isArray(queue?.rows) ? queue.rows : [];
  return {
    status: queue?.status || "missing",
    recommendation: queue?.recommendation || "",
    counts: queue?.counts || {},
    rows: rows.slice(0, 6).map((row) => ({
      requirement_id: row.requirement_id,
      proof_mode: row.proof_mode,
      next_proof: row.next_proof || "",
      closure_condition: row.closure_condition || "",
      confirmation: row.primary_confirmation?.confirmation || "",
      plugin: row.primary_confirmation?.plugin || "",
      kind: row.primary_confirmation?.kind || "",
      is_top_action: row.primary_confirmation?.is_top_action === true,
      blockers: Array.isArray(row.blockers) ? row.blockers.slice(0, 3).map((item) => `${item.plugin}: ${item.readiness}`) : [],
    })),
  };
}

function recommendationFor({ action, checkout, ownedSiteCta, goalCoverage }) {
  if (action.confirmation) return `Action-time confirmation needed: ${action.confirmation}.`;
  if (ownedSiteCta?.recommendation) return ownedSiteCta.recommendation;
  if (checkout?.recommendation) return checkout.recommendation;
  return goalCoverage?.recommendation || "Refresh portfolio ops before deciding the next growth action.";
}

function actionCompleteness(action) {
  const required = [
    ["plugin", action.plugin],
    ["action", action.title],
    ["target", action.target],
    ["risk", action.risk],
    ["expected_benefit", action.expected_benefit],
    ["confirmation", action.confirmation],
    ["verification", action.verification],
  ];
  const missing = required.filter(([, value]) => !String(value || "").trim()).map(([field]) => field);
  return {
    status: missing.length ? "incomplete" : "complete",
    missing,
    required_fields: required.map(([field]) => field),
  };
}

function build({
  opsRun,
  today,
  confirmationQueue,
  weekly,
  goalCoverage,
  proofGaps,
  publicHealth,
  checkout,
  ownedSiteCta,
  crossPromotion,
  ownedSiteImplementation,
  useCasePages,
  useCasePagePackages,
  publishPreflight,
  blockerQueue,
  creemLinks,
  creemStoreVerification,
  actionRows,
  revenueRows,
}) {
  const action = topAction(today, weekly, confirmationQueue);
  const topActionCompleteness = actionCompleteness(action);
  const realRevenue = realRevenueRows(revenueRows);
  const statuses = statusLine({ opsRun, goalCoverage, confirmationQueue });
  return {
    generated_at: new Date().toISOString(),
    status: opsRun?.status === "ready" && today && confirmationQueue ? "ready" : "partial",
    recommendation: recommendationFor({ action, checkout, ownedSiteCta, goalCoverage }),
    status_line: statuses,
    metrics: {
      action_log_rows: actionRows.length,
      real_revenue_signals: realRevenue.length,
      real_revenue_usd: realRevenue.reduce((sum, row) => sum + money(row.amount_usd), 0),
      proof_gap_total: Number(Object.values(proofGaps?.counts || {}).reduce((sum, value) => sum + Number(value || 0), 0)),
      ready_confirmations: Number(confirmationQueue?.counts?.ready_confirmation_required || 0),
      blocked_confirmations: Number(confirmationQueue?.counts?.blocked || 0),
      owned_site_cta_ready: Number(ownedSiteCta?.counts?.ready_site_update_confirmation_required || 0),
      owned_site_cta_blocked: Number(ownedSiteCta?.counts?.blocked_prepare_only || 0),
      cross_promo_ready: Number(crossPromotion?.counts?.ready_local_copy || 0) + Number(crossPromotion?.counts?.ready_record_after_confirmation || 0),
      cross_promo_blocked: Number(crossPromotion?.counts?.blocked_by_checkout || 0) + Number(crossPromotion?.counts?.blocked_by_compliance || 0) + Number(crossPromotion?.counts?.blocked_prepare_only || 0),
      owned_site_impl_ready: Number(ownedSiteImplementation?.counts?.ready_confirmation_required || 0) + Number(ownedSiteImplementation?.counts?.ready_record_after_confirmation || 0),
      owned_site_impl_blocked: Number(ownedSiteImplementation?.counts?.blocked_by_checkout || 0) + Number(ownedSiteImplementation?.counts?.blocked_by_compliance || 0) + Number(ownedSiteImplementation?.counts?.blocked_prepare_only || 0),
      use_case_pages_ready: Number(useCasePages?.counts?.ready_confirmation_required || 0) + Number(useCasePages?.counts?.ready_local_copy || 0),
      use_case_page_packages_ready: Number(useCasePagePackages?.counts?.ready_packages || 0),
      use_case_pages_blocked: Number(useCasePages?.counts?.blocked_by_checkout || 0) + Number(useCasePages?.counts?.blocked_by_compliance || 0) + Number(useCasePages?.counts?.blocked_prepare_only || 0),
      publish_preflight_assets: Number(publishPreflight?.counts?.assets || 0),
      publish_preflight_warnings: Number(publishPreflight?.counts?.warnings || 0),
      publish_preflight_errors: Number(publishPreflight?.counts?.errors || 0),
      blocker_queue_root_total: Number(blockerQueue?.root_counts?.total ?? blockerQueue?.counts?.total ?? 0),
      blocker_queue_total: Number(blockerQueue?.counts?.total || 0),
      blocker_queue_ready_confirmation: Number(blockerQueue?.root_counts?.ready_for_confirmation ?? blockerQueue?.counts?.ready_for_confirmation ?? 0),
      blocker_queue_needs_action: Number(blockerQueue?.root_counts?.needs_action ?? blockerQueue?.counts?.needs_action ?? 0),
      blocker_queue_waiting_provider: Number(blockerQueue?.root_counts?.waiting_provider ?? blockerQueue?.counts?.waiting_provider ?? 0),
      creem_direct_links: Number(creemLinks?.counts?.direct_creem_links || 0),
      creem_needs_verification: Number(creemLinks?.counts?.needs_store_domain_verification || 0),
      creem_blocked_compliance: Number(creemLinks?.counts?.blocked_compliance || 0),
      creem_blocked_checkout: Number(creemLinks?.counts?.blocked_checkout || 0),
      creem_store_manual_checks: Number(creemStoreVerification?.counts?.manual_read_only_check_required || 0),
      creem_store_waiting_provider: Number(creemStoreVerification?.counts?.waiting_provider || 0),
      creem_store_blocked: Number(creemStoreVerification?.counts?.blocked || 0),
    },
    top_action: action,
    top_action_completeness: topActionCompleteness,
    safe_local_actions: safeLocalActions(today),
    confirmation_rows: (Array.isArray(confirmationQueue?.rows) ? confirmationQueue.rows : []).slice(0, 6),
    blocked_actions: blockedActions(today, publicHealth, checkout),
    plugin_rows: pluginRows(publicHealth, weekly),
    cross_promotion: crossPromotionSummary(crossPromotion),
    owned_site_implementation: ownedSiteImplementationSummary(ownedSiteImplementation),
    use_case_pages: useCasePagesSummary(useCasePages),
    publish_preflight: publishPreflightSummary(publishPreflight),
    blocker_queue: {
      status: blockerQueue?.status || "missing",
      recommendation: blockerQueue?.recommendation || "",
      root_rows: Array.isArray(blockerQueue?.root_blockers) ? blockerQueue.root_blockers.slice(0, 8) : [],
      rows: Array.isArray(blockerQueue?.rows) ? blockerQueue.rows.slice(0, 8) : [],
    },
    creem_links: creemLinksSummary(creemLinks),
    creem_store_verification: creemStoreVerificationSummary(creemStoreVerification),
    checkout: {
      status: checkout?.status || "missing",
      recommendation: checkout?.recommendation || "",
      promotion_allowed: checkout?.promotion_allowed === true,
      blockers: Array.isArray(checkout?.blockers) ? checkout.blockers.slice(0, 4) : [],
    },
    goal_coverage: {
      status: goalCoverage?.status || "missing",
      counts: goalCoverage?.counts || {},
      recommendation: goalCoverage?.recommendation || "",
    },
    proof_gaps: proofGapSummary(proofGaps),
    next_commands: [
      "pnpm lead:portfolio-ops -- --skip-signals",
      "pnpm lead:proof-gaps",
      "pnpm lead:cross-promo",
      "pnpm lead:owned-site-implementation",
      "pnpm lead:use-case-pages",
      "pnpm lead:creem-links",
      "pnpm lead:creem-store-verification",
      "pnpm lead:publish-preflight",
      "pnpm lead:blocker-queue",
      "pnpm lead:executive",
      "sed -n '1,180p' .tmp/framer-growth-executive-brief.md",
      "sed -n '1,160p' .tmp/framer-confirmation-queue.md",
    ],
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Growth Executive Brief",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Current Proof",
    "",
    `- Portfolio ops: ${report.status_line.ops}`,
    `- Goal coverage: ${report.status_line.goal}`,
    `- Proof gaps: ${report.metrics.proof_gap_total} open (${report.proof_gaps.recommendation || "no recommendation"})`,
    `- Confirmation queue: ${report.status_line.confirmation}`,
    `- Action log rows: ${report.metrics.action_log_rows}`,
    `- Revenue signals: ${report.metrics.real_revenue_signals} ($${report.metrics.real_revenue_usd.toFixed(2)})`,
    `- Owned-site CTA kit: ${report.metrics.owned_site_cta_ready} ready, ${report.metrics.owned_site_cta_blocked} blocked/prepare-only`,
    `- Cross-promotion: ${report.metrics.cross_promo_ready} ready local copy, ${report.metrics.cross_promo_blocked} blocked/prepare-only`,
    `- Owned-site implementation: ${report.metrics.owned_site_impl_ready} ready, ${report.metrics.owned_site_impl_blocked} blocked/prepare-only`,
    `- Use-case pages: ${report.metrics.use_case_pages_ready} ready/local, ${report.metrics.use_case_page_packages_ready} local packages, ${report.metrics.use_case_pages_blocked} blocked/prepare-only`,
    `- Publish preflight: ${report.metrics.publish_preflight_assets} assets, ${report.metrics.publish_preflight_warnings} warnings, ${report.metrics.publish_preflight_errors} errors`,
    `- Blocker queue: ${report.metrics.blocker_queue_root_total} root blockers (${report.metrics.blocker_queue_total} evidence rows), ${report.metrics.blocker_queue_ready_confirmation} ready-confirmation, ${report.metrics.blocker_queue_needs_action} need action, ${report.metrics.blocker_queue_waiting_provider} waiting provider`,
    `- Creem link inventory: ${report.metrics.creem_direct_links} direct links, ${report.metrics.creem_needs_verification} need store/domain verification, ${report.metrics.creem_blocked_compliance} compliance blocked, ${report.metrics.creem_blocked_checkout} checkout blocked`,
    `- Creem store/domain verification: ${report.metrics.creem_store_manual_checks} manual read-only checks, ${report.metrics.creem_store_waiting_provider} waiting provider, ${report.metrics.creem_store_blocked} blocked`,
    "",
    "## Do First",
    "",
    `- Plugin: ${report.top_action.plugin || "Portfolio"}`,
    `- Action: ${report.top_action.title}`,
    `- Target: ${report.top_action.target || "n/a"}`,
    `- Why: ${short(report.top_action.reason || report.top_action.expected_benefit || "n/a")}`,
    `- Risk: ${short(report.top_action.risk || "n/a")}`,
    `- Expected benefit: ${short(report.top_action.expected_benefit || "n/a")}`,
    `- Verification: ${short(report.top_action.verification || "n/a")}`,
    `- Confirmation phrase: ${report.top_action.confirmation || "none"}`,
    `- Safety fields: ${report.top_action_completeness.status}${report.top_action_completeness.missing.length ? ` (missing: ${report.top_action_completeness.missing.join(", ")})` : ""}`,
    "",
    "## Proof Gaps",
    "",
    `- Status: ${report.proof_gaps.status}`,
    `- Recommendation: ${report.proof_gaps.recommendation || "No proof gap queue generated yet."}`,
    "",
    "| Requirement | Mode | Primary confirmation | Top action? | Closure condition | Blockers |",
    "|---|---|---|---|---|---|",
  ];
  for (const item of report.proof_gaps.rows) {
    lines.push(`| ${clean(item.requirement_id)} | ${clean(item.proof_mode)} | ${clean(item.confirmation || "none")} | ${item.is_top_action ? "yes" : "no"} | ${clean(short(item.closure_condition || item.next_proof, 120))} | ${clean(item.blockers.join("; ") || "none")} |`);
  }
  if (!report.proof_gaps.rows.length) lines.push("| none |  |  |  |  |  |");

  lines.push(
    "",
    "## Safe Local Work",
    "",
    "| Status | Action | Why |",
    "|---|---|---|",
  );
  for (const item of report.safe_local_actions) {
    lines.push(`| ${clean(item.status)} | ${clean(item.title)} | ${clean(short(item.reason, 140))} |`);
  }
  if (!report.safe_local_actions.length) lines.push("| none |  |  |");

  lines.push(
    "",
    "## Cross-Promotion",
    "",
    `- Status: ${report.cross_promotion.status}`,
    `- Recommendation: ${report.cross_promotion.recommendation || "No cross-promotion matrix generated yet."}`,
    "",
    "| Status | Source | Target | Campaign | Confirmation |",
    "|---|---|---|---|---|",
  );
  for (const item of report.cross_promotion.rows) {
    lines.push(`| ${clean(item.status)} | ${clean(item.source_plugin)} | ${clean(item.target_plugin)} | ${clean(item.campaign)} | ${clean(item.confirmation)} |`);
  }
  if (!report.cross_promotion.rows.length) lines.push("| none |  |  |  |  |");

  lines.push(
    "",
    "## Owned-Site Implementation",
    "",
    `- Status: ${report.owned_site_implementation.status}`,
    `- Recommendation: ${report.owned_site_implementation.recommendation || "No owned-site implementation brief generated yet."}`,
    "",
    "| Status | Plugin | Site | CTA | Related ready | Confirmation |",
    "|---|---|---|---|---:|---|",
  );
  for (const item of report.owned_site_implementation.rows) {
    lines.push(`| ${clean(item.status)} | ${clean(item.plugin)} | ${clean(item.site_url)} | ${clean(item.primary_cta_label)} | ${item.related_ready} | ${clean(item.confirmation)} |`);
  }
  if (!report.owned_site_implementation.rows.length) lines.push("| none |  |  |  |  |  |");

  lines.push(
    "",
    "## Use-Case Pages",
    "",
    `- Status: ${report.use_case_pages.status}`,
    `- Recommendation: ${report.use_case_pages.recommendation || "No use-case page brief generated yet."}`,
    "",
    "| Status | Plugin | URL | Keyword | Campaign | Confirmation |",
    "|---|---|---|---|---|---|",
  );
  for (const item of report.use_case_pages.rows) {
    lines.push(`| ${clean(item.status)} | ${clean(item.plugin)} | ${clean(item.url)} | ${clean(item.target_keyword)} | ${clean(item.campaign)} | ${clean(item.confirmation)} |`);
  }
  if (!report.use_case_pages.rows.length) lines.push("| none |  |  |  |  |  |");

  lines.push(
    "",
    "## Publish Preflight",
    "",
    `- Status: ${report.publish_preflight.status}`,
    `- Recommendation: ${report.publish_preflight.recommendation || "No publish preflight generated yet."}`,
    "",
    "| Status | Type | Plugin | Target | Campaign | Warnings | Errors | Confirmation |",
    "|---|---|---|---|---|---:|---:|---|",
  );
  for (const item of report.publish_preflight.rows) {
    lines.push(`| ${clean(item.status)} | ${clean(item.type)} | ${clean(item.plugin)} | ${clean(item.target)} | ${clean(item.campaign)} | ${item.warnings} | ${item.errors} | ${clean(item.confirmation)} |`);
  }
  if (!report.publish_preflight.rows.length) lines.push("| none |  |  |  |  |  |  |  |");

  lines.push(
    "",
    "## Blocker Queue",
    "",
    `- Status: ${report.blocker_queue.status}`,
    `- Recommendation: ${report.blocker_queue.recommendation || "No portfolio blocker queue generated yet."}`,
    "",
    "| Readiness | Plugin | Root Blocker | Symptoms | Next Action | Confirmation |",
    "|---|---|---|---:|---|---|",
  );
  const blockerRows = report.blocker_queue.root_rows.length ? report.blocker_queue.root_rows : report.blocker_queue.rows;
  for (const item of blockerRows) {
    lines.push(`| ${clean(item.readiness)} | ${clean(item.plugin)} | ${clean(item.title)} | ${item.symptom_count || 1} | ${clean(short(item.next_action || item.reason, 140))} | ${clean(item.confirmation)} |`);
  }
  if (!blockerRows.length) lines.push("| none |  |  | 0 |  |  |");

  lines.push(
    "",
    "## Creem Link Inventory",
    "",
    `- Status: ${report.creem_links.status}`,
    `- Recommendation: ${report.creem_links.recommendation || "No Creem link inventory generated yet."}`,
    "",
    "| Status | Plugin | URL | Product IDs | Direct Links | Occurrences | Open Warnings | Store/Domain Evidence | Approval Evidence | Next Action |",
    "|---|---|---|---|---:|---:|---:|---:|---:|---|",
  );
  for (const item of report.creem_links.rows) {
    lines.push(`| ${clean(item.status)} | ${clean(item.plugin)} | ${clean(item.target_url)} | ${clean(item.product_ids.join(", ") || "none")} | ${item.direct_creem_unique_links} | ${item.direct_creem_occurrences} | ${item.open_compliance_warnings} | ${item.store_domain_evidence_count} | ${item.approval_evidence_count} | ${clean(short(item.next_action, 140))} |`);
  }
  if (!report.creem_links.rows.length) lines.push("| none |  |  |  |  |  |  |  |  |  |");

  lines.push(
    "",
    "## Creem Store/Domain Verification",
    "",
    `- Status: ${report.creem_store_verification.status}`,
    `- Recommendation: ${report.creem_store_verification.recommendation || "No Creem store/domain verification brief generated yet."}`,
    "",
    "| Readiness | Plugin | Domain | Inventory Status | Product IDs | Action | Verification |",
    "|---|---|---|---|---|---|---|",
  );
  for (const item of report.creem_store_verification.rows) {
    lines.push(`| ${clean(item.readiness)} | ${clean(item.plugin)} | ${clean(item.expected_domain)} | ${clean(item.inventory_status)} | ${clean(item.product_ids.join(", ") || "none")} | ${clean(short(item.action, 120))} | ${clean(short(item.verification, 120))} |`);
  }
  if (!report.creem_store_verification.rows.length) lines.push("| none |  |  |  |  |  |  |");

  lines.push(
    "",
    "## Confirmation Queue",
    "",
    "| Readiness | Plugin | Kind | Target | Confirmation |",
    "|---|---|---|---|---|",
  );
  for (const item of report.confirmation_rows) {
    lines.push(`| ${clean(item.readiness)} | ${clean(item.plugin)} | ${clean(item.kind)} | ${clean(item.target)} | ${clean(item.confirmation)} |`);
  }
  if (!report.confirmation_rows.length) lines.push("| empty |  |  |  |  |");

  lines.push(
    "",
    "## Do Not Do Yet",
    "",
    "| Status | Item | Reason |",
    "|---|---|---|",
  );
  for (const item of report.blocked_actions) {
    lines.push(`| ${clean(item.status)} | ${clean(item.title)} | ${clean(short(item.reason, 180))} |`);
  }
  if (!report.blocked_actions.length) lines.push("| none |  |  |");

  lines.push(
    "",
    "## Plugin Snapshot",
    "",
    "| Plugin | Status | Users | Opens | Revenue | Main issue | Next action |",
    "|---|---|---:|---:|---:|---|---|",
  );
  for (const item of report.plugin_rows) {
    lines.push(`| ${clean(item.plugin)} | ${clean(item.status)} | ${clean(item.users)} | ${clean(item.opens)} | $${Number(item.revenue_usd || 0).toFixed(2)} | ${clean(short(item.main_issue, 120))} | ${clean(short(item.next_action, 120))} |`);
  }
  if (!report.plugin_rows.length) lines.push("| none |  |  |  |  |  |  |");

  lines.push(
    "",
    "## Checkout Gate",
    "",
    `- Status: ${report.checkout.status}`,
    `- Promotion allowed: ${report.checkout.promotion_allowed ? "yes" : "no"}`,
    `- Recommendation: ${report.checkout.recommendation || "none"}`,
    "",
    "Blockers:",
  );
  if (report.checkout.blockers.length) {
    for (const item of report.checkout.blockers) lines.push(`- ${item.label || item.id}: ${item.detail || ""}`);
  } else {
    lines.push("- none");
  }

  lines.push(
    "",
    "## Commands",
    "",
    "```bash",
    ...report.next_commands,
    "```",
    "",
    "## Guardrails",
    "",
    "- This brief is local-only. It does not send Gmail, publish, submit forms, upload Marketplace files, deploy, or modify payment settings.",
    "- Execute external actions only after the exact confirmation phrase shown above.",
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
    opsRun,
    today,
    confirmationQueue,
    weekly,
    goalCoverage,
    proofGaps,
    publicHealth,
    checkout,
    ownedSiteCta,
    crossPromotion,
    ownedSiteImplementation,
    useCasePages,
    useCasePagePackages,
    publishPreflight,
    blockerQueue,
    creemLinks,
    creemStoreVerification,
    actionRows,
    revenueRows,
  ] = await Promise.all([
    readJson(args.opsRun, null),
    readJson(args.today, null),
    readJson(args.confirmations, null),
    readJson(args.weekly, null),
    readJson(args.goalCoverage, null),
    readJson(args.proofGaps, null),
    readJson(args.publicHealth, null),
    readJson(args.checkout, null),
    readJson(args.ownedSiteCta, null),
    readJson(args.crossPromotion, null),
    readJson(args.ownedSiteImplementation, null),
    readJson(args.useCasePages, null),
    readJson(args.useCasePagePackages, null),
    readJson(args.publishPreflight, null),
    readJson(args.blockerQueue, null),
    readJson(args.creemLinks, null),
    readJson(args.creemStoreVerification, null),
    readRows(args.actions),
    readRows(args.revenue),
  ]);

  const report = build({
    opsRun,
    today,
    confirmationQueue,
    weekly,
    goalCoverage,
    proofGaps,
    publicHealth,
    checkout,
    ownedSiteCta,
    crossPromotion,
    ownedSiteImplementation,
    useCasePages,
    useCasePagePackages,
    publishPreflight,
    blockerQueue,
    creemLinks,
    creemStoreVerification,
    actionRows,
    revenueRows,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Executive brief: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
