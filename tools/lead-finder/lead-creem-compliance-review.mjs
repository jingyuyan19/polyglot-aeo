#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  annotateComplianceWarning,
  isOpenCreemComplianceWarning,
  openComplianceWarningsForScope,
  otherProductComplianceWarnings,
} from "./compliance-scope.mjs";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_CHECKOUT = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_CLOUDFLARE = ".tmp/framer-cloudflare-recovery.json";
const DEFAULT_PAYMENT = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_MARKETPLACE = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_OUTPUT = ".tmp/framer-creem-compliance-review.md";
const DEFAULT_JSON = ".tmp/framer-creem-compliance-review.json";
const WARNING_RESPONSE_WINDOW_HOURS = 72;

const CHECKOUT_ORIGINS = [
  {
    label: "Approved Worker custom domain",
    url: "https://license.polyglotaeo.com/checkout",
    status: "target",
    note: "Recommended production checkout and license API origin. Confirm this custom domain is approved for the Polyglot AEO Creem store before broad traffic.",
  },
  {
    label: "Marketing site checkout bridge",
    url: "https://polyglotaeo.com/go/checkout/",
    status: "registered_site",
    note: "Plugin upgrade clicks pass through this page for attribution before redirecting.",
  },
  {
    label: "Legacy workers.dev checkout endpoint",
    url: "https://polyglot-license.jimmymjing.workers.dev/checkout",
    status: "remove_or_get_explicit_approval",
    note: "Legacy Cloudflare Worker URL. Disable workers.dev routing or get explicit Creem approval before sending production checkout traffic here.",
  },
  {
    label: "Pricing page checkout",
    url: "https://polyglotaeo.com/pricing/",
    status: "registered_site",
    note: "Public pricing page links to the same Worker checkout flow unless overridden by direct Creem URLs.",
  },
  {
    label: "Checkout success URL",
    url: "https://polyglotaeo.com/success",
    status: "registered_site",
    note: "Success redirect configured in api/wrangler.toml and Creem checkout payloads.",
  },
];

const REMEDIATION_STEPS = [
  "In Creem, verify that Polyglot AEO is the registered business/store for https://polyglotaeo.com.",
  "Ask Creem Support whether https://license.polyglotaeo.com/checkout must be added as an approved checkout origin or separate store.",
  "In Cloudflare, route the Worker through license.polyglotaeo.com and keep workers.dev disabled for production.",
  "Deploy the Worker only after the custom domain exists and the live Creem API key is configured.",
  "Rebuild and deploy polyglotaeo-web so pricing and /go/checkout/ point at https://license.polyglotaeo.com.",
  "After Creem confirms closure, record the warning as resolved with the command below, then rerun Marketplace preflight.",
];

const SOURCE_LINKS = [
  {
    label: "Creem Checkout API",
    url: "https://docs.creem.io/api-reference/endpoint/create-checkout",
    note: "Checkout sessions support product_id, request_id, success_url, and metadata.",
  },
  {
    label: "Cloudflare Workers custom domains",
    url: "https://developers.cloudflare.com/workers/configuration/routing/custom-domains/",
    note: "Use a custom domain when the Worker should run on your own hostname.",
  },
];

function usage() {
  return `
Usage:
  pnpm lead:creem-compliance

Options:
  --actions <file>      External action log CSV. Default: ${DEFAULT_ACTIONS}
  --checkout <file>     Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT}
  --cloudflare <file>   Cloudflare recovery JSON. Default: ${DEFAULT_CLOUDFLARE}
  --payment <file>      Payment compliance recovery JSON. Default: ${DEFAULT_PAYMENT}
  --marketplace <file>  Marketplace preflight JSON. Default: ${DEFAULT_MARKETPLACE}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    checkout: DEFAULT_CHECKOUT,
    cloudflare: DEFAULT_CLOUDFLARE,
    payment: DEFAULT_PAYMENT,
    marketplace: DEFAULT_MARKETPLACE,
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
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--checkout") {
      args.checkout = value;
      index += 1;
      continue;
    }
    if (key === "--cloudflare") {
      args.cloudflare = value;
      index += 1;
      continue;
    }
    if (key === "--payment") {
      args.payment = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace") {
      args.marketplace = value;
      index += 1;
      continue;
    }
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--json") {
      args.json = value;
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

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
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
  if (!rows.length) return [];

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

function openWarnings(rows) {
  return openComplianceWarningsForScope(rows, "polyglot_aeo");
}

function buildReview({ actions, checkout, cloudflare, payment, marketplace }) {
  const warnings = openWarnings(actions);
  const outOfScopeWarnings = otherProductComplianceWarnings(actions);
  const warningDeadlines = warnings.map((warning) => warningDeadline(warning));
  const status = warnings.length ? "needs_action" : "clear";
  const evidencePacket = evidencePacketFor({ checkout, cloudflare, payment, marketplace });
  return {
    generated_at: new Date().toISOString(),
    status,
    open_warnings: warnings,
    out_of_scope_warnings: outOfScopeWarnings,
    all_open_warnings: actions.filter(isOpenCreemComplianceWarning).map(annotateComplianceWarning),
    warning_deadlines: warningDeadlines,
    checkout_origins: CHECKOUT_ORIGINS,
    evidence_packet: evidencePacket,
    remediation_steps: REMEDIATION_STEPS,
    source_links: SOURCE_LINKS,
    recommendation: recommendationFor(warnings, warningDeadlines),
    support_draft: supportDraft(warnings, evidencePacket, warningDeadlines),
    closure_draft: closureDraft(warnings, evidencePacket),
    resolved_command:
      "pnpm lead:actions -- --add --type compliance_warning --channel creem --campaign unregistered_checkout_traffic --status resolved --target 'CREEM Compliance Review - Unregistered Traffic Detected' --evidence '<provider-dashboard-or-support-confirmation>' --note 'Creem compliance warning resolved'",
  };
}

function recommendationFor(warnings, warningDeadlines = []) {
  if (!warnings.length) {
    return "No open Polyglot AEO Creem compliance warnings are logged. Keep checking Creem/payment mail during each signal sweep, and keep other plugin store warnings out of Polyglot gates.";
  }
  const firstDeadline = warningDeadlines[0]?.deadline_at
    ? ` Deadline: ${warningDeadlines[0].deadline_at} (${warningDeadlines[0].hours_remaining}h remaining).`
    : "";
  return `Resolve the Creem unregistered checkout traffic warning before checkout-heavy promotion: verify Polyglot AEO is approved for polyglotaeo.com, move production checkout traffic to https://license.polyglotaeo.com, and either disable or get explicit approval for the legacy workers.dev origin.${firstDeadline}`;
}

function evidencePacketFor({ checkout, cloudflare, payment, marketplace }) {
  const checkoutBlockers = Array.isArray(checkout?.blockers)
    ? checkout.blockers.map((item) => `${item.label || item.id}: ${item.detail || ""}`)
    : [];
  const cloudflareEvidence = [
    `status=${cloudflare?.status || "missing"}`,
    `worker=${cloudflare?.wrangler?.worker_name || "unknown"}`,
    `config_ready=${cloudflare?.wrangler?.config_ready === true ? "yes" : "no"}`,
    `secrets_present=${cloudflare?.secrets?.required_present === true ? "yes" : "no"}`,
    `dns=${cloudflare?.dns?.addresses?.join(", ") || "unknown"}`,
    `health=${cloudflare?.health?.ok ? "pass" : `fail status ${cloudflare?.health?.status ?? "unknown"}`}`,
    cloudflare?.deployments?.latest?.created_on ? `latest_deploy=${cloudflare.deployments.latest.created_on}` : "",
  ].filter(Boolean);
  const paymentPhase = Array.isArray(payment?.phases)
    ? payment.phases.find((phase) => phase.status !== "ready") || payment.phases[0]
    : null;
  return {
    generated_at: new Date().toISOString(),
    target_state: {
      primary_site: "https://polyglotaeo.com",
      checkout_bridge: "https://polyglotaeo.com/go/checkout/",
      target_worker_origin: checkout?.target_origin || "https://license.polyglotaeo.com",
      legacy_worker_origin: checkout?.legacy_origin || "https://polyglot-license.jimmymjing.workers.dev",
      success_url: "https://polyglotaeo.com/success",
    },
    current_status: {
      checkout_origin: checkout?.status || "missing",
      checkout_promotion_allowed: checkout?.promotion_allowed ?? null,
      cloudflare: cloudflare?.status || "missing",
      payment_recovery: payment?.status || "missing",
      payment_promotion_allowed: payment?.promotion_allowed ?? null,
      marketplace_preflight: marketplace?.verdict || "missing",
      marketplace_upload_allowed: marketplace?.upload_allowed ?? null,
    },
    first_blocker: paymentPhase
      ? `${paymentPhase.label}: ${paymentPhase.next_action || paymentPhase.evidence || paymentPhase.status}`
      : "Payment recovery report is missing.",
    checkout_blockers: checkoutBlockers,
    cloudflare_evidence: cloudflareEvidence,
    marketplace_blockers: Array.isArray(marketplace?.blockers) ? marketplace.blockers : [],
  };
}

function extractEmailTimestamp(row) {
  const text = `${row.evidence || ""}\n${row.note || ""}`;
  const match = text.match(/email_ts\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/i);
  if (match) return /(?:Z|[+-][0-9]{2}:?[0-9]{2})$/.test(match[1]) ? match[1] : `${match[1]}Z`;
  if (row.date) return `${row.date}T00:00:00Z`;
  return "";
}

function warningDeadline(row) {
  const sourceTs = extractEmailTimestamp(row);
  const sourceDate = sourceTs ? new Date(sourceTs) : null;
  if (!sourceDate || Number.isNaN(sourceDate.getTime())) {
    return {
      target: row.target || row.campaign || "",
      source_ts: sourceTs,
      deadline_at: "",
      hours_remaining: null,
      urgency: "unknown",
    };
  }
  const deadline = new Date(sourceDate.getTime() + WARNING_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000);
  const hoursRemaining = Math.ceil((deadline.getTime() - Date.now()) / (60 * 60 * 1000));
  const urgency = hoursRemaining <= 0 ? "expired" : hoursRemaining <= 24 ? "urgent" : "active";
  return {
    target: row.target || row.campaign || "",
    source_ts: sourceDate.toISOString(),
    deadline_at: deadline.toISOString(),
    hours_remaining: hoursRemaining,
    urgency,
  };
}

function supportDraft(warnings, evidencePacket, warningDeadlines = []) {
  const evidence = warnings[0]?.evidence || "<Creem warning email id or support ticket>";
  const deadline = warningDeadlines[0]?.deadline_at || "<warning-response-deadline>";
  const target = evidencePacket.target_state;
  const status = evidencePacket.current_status;
  return `Hi Creem Support,

We received a compliance warning about unregistered checkout traffic for our CREEM account.

Product/business: Polyglot AEO
Primary site: ${target.primary_site}
Checkout bridge: ${target.checkout_bridge}
Target checkout/session endpoint: ${target.target_worker_origin}/checkout
Legacy checkout/session endpoint we plan to remove from production traffic: ${target.legacy_worker_origin}/checkout
Success URL: ${target.success_url}
Warning evidence: ${evidence}
Warning response deadline: ${deadline}
Current remediation status:
- Checkout origin readiness: ${status.checkout_origin}
- Cloudflare custom domain: ${status.cloudflare}
- Payment compliance recovery: ${status.payment_recovery}
- Marketplace upload preflight: ${status.marketplace_preflight}
- First blocker: ${evidencePacket.first_blocker}

Could you confirm which origin or business triggered the warning, and whether ${target.target_worker_origin} should be approved under the existing Polyglot AEO store or represented as a separate approved store/site?

We have paused checkout-heavy promotion until the registered-store setup is correct.

Thanks,
Jimmy`;
}

function closureDraft(warnings, evidencePacket) {
  const evidence = warnings[0]?.evidence || "<Creem warning email id or support ticket>";
  const target = evidencePacket.target_state;
  return `Hi Creem Support,

Following up on the unregistered checkout traffic warning for Polyglot AEO.

Warning evidence: ${evidence}
Primary site: ${target.primary_site}
Approved checkout/session endpoint requested: ${target.target_worker_origin}/checkout
Legacy workers.dev endpoint removed from production traffic: ${target.legacy_worker_origin}/checkout
Success URL: ${target.success_url}

Could you confirm whether the warning is now closed, or whether any additional origin/store registration is required before we resume Marketplace and Community promotion?

Thanks,
Jimmy`;
}

function renderMarkdown(review) {
  const lines = [
    "# Creem Compliance Review",
    "",
    `Generated: ${review.generated_at}`,
    `Status: ${review.status}`,
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
    "## Open Polyglot Warnings",
    "",
  ];

  if (review.open_warnings.length) {
    lines.push("| Date | Campaign | Status | Target | Evidence |", "|---|---|---|---|---|");
    for (const row of review.open_warnings) {
      lines.push(`| ${row.date || ""} | ${row.campaign || ""} | ${row.status || ""} | ${pipe(row.target)} | ${pipe(row.evidence || row.note)} |`);
    }
  } else {
    lines.push("No open Polyglot AEO Creem compliance warnings.");
  }

  lines.push("", "## Other Plugin Warnings", "");
  if (review.out_of_scope_warnings.length) {
    lines.push("| Date | Product | Campaign | Status | Target | Evidence |", "|---|---|---|---|---|---|");
    for (const row of review.out_of_scope_warnings) {
      lines.push(`| ${row.date || ""} | ${row.product || row.product_scope || ""} | ${row.campaign || ""} | ${row.status || ""} | ${pipe(row.target)} | ${pipe(row.evidence || row.note)} |`);
    }
  } else {
    lines.push("No open warnings for other known plugin stores.");
  }

  lines.push("", "## Response Window", "");
  if (review.warning_deadlines.length) {
    lines.push("| Target | Warning timestamp | Deadline | Hours remaining | Urgency |", "|---|---|---|---:|---|");
    for (const deadline of review.warning_deadlines) {
      lines.push(`| ${pipe(deadline.target)} | ${deadline.source_ts || "unknown"} | ${deadline.deadline_at || "unknown"} | ${deadline.hours_remaining ?? "unknown"} | ${deadline.urgency || "unknown"} |`);
    }
  } else {
    lines.push("No open warning response window.");
  }

  lines.push(
    "",
    "## Checkout Origins To Verify",
    "",
    "| Surface | URL | Status | Note |",
    "|---|---|---|---|",
  );
  for (const origin of review.checkout_origins) {
    lines.push(`| ${origin.label} | ${origin.url} | ${origin.status || ""} | ${origin.note} |`);
  }

  lines.push(
    "",
    "## Evidence Packet",
    "",
    `- Primary site: ${review.evidence_packet.target_state.primary_site}`,
    `- Checkout bridge: ${review.evidence_packet.target_state.checkout_bridge}`,
    `- Target Worker origin: ${review.evidence_packet.target_state.target_worker_origin}`,
    `- Legacy Worker origin: ${review.evidence_packet.target_state.legacy_worker_origin}`,
    `- Checkout origin readiness: ${review.evidence_packet.current_status.checkout_origin}`,
    `- Cloudflare recovery: ${review.evidence_packet.current_status.cloudflare}`,
    `- Payment recovery: ${review.evidence_packet.current_status.payment_recovery}`,
    `- Marketplace preflight: ${review.evidence_packet.current_status.marketplace_preflight}`,
    `- First blocker: ${review.evidence_packet.first_blocker}`,
    "",
  );
  if (review.evidence_packet.checkout_blockers.length) {
    lines.push("Checkout blockers:");
    for (const blocker of review.evidence_packet.checkout_blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }
  if (review.evidence_packet.cloudflare_evidence.length) {
    lines.push("Cloudflare evidence:");
    for (const item of review.evidence_packet.cloudflare_evidence) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push("", "## Source Links", "", "| Source | URL | Note |", "|---|---|---|");
  for (const source of review.source_links) {
    lines.push(`| ${source.label} | ${source.url} | ${source.note} |`);
  }

  if (review.open_warnings.length) {
    lines.push("", "## Remediation Steps", "");
    for (const [index, step] of review.remediation_steps.entries()) {
      lines.push(`${index + 1}. ${step}`);
    }

    lines.push(
      "",
      "## Support Draft",
      "",
      "```text",
      review.support_draft,
      "```",
      "",
      "## Closure Follow-up Draft",
      "",
      "```text",
      review.closure_draft,
      "```",
      "",
      "## Mark Resolved",
      "",
      "Run this only after Creem dashboard or support confirms the warning is closed:",
      "",
      "```bash",
      review.resolved_command,
      "```",
      "",
    );
  } else {
    lines.push(
      "",
      "## Polyglot Action",
      "",
      "No Polyglot AEO Creem support draft or closure command is generated because there is no open Polyglot Creem warning.",
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/");
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

  const [actions, checkout, cloudflare, payment, marketplace] = await Promise.all([
    readRows(args.actions),
    readJson(args.checkout, null),
    readJson(args.cloudflare, null),
    readJson(args.payment, null),
    readJson(args.marketplace, null),
  ]);
  const review = buildReview({ actions, checkout, cloudflare, payment, marketplace });
  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Creem compliance: ${review.status}\n`);
  process.stdout.write(`Recommendation: ${review.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
