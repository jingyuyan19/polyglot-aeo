#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TODAY_PLAN = ".tmp/framer-today.json";
const DEFAULT_PAYMENT = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_CHECKOUT = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_CLOUDFLARE_APPLY = ".tmp/framer-cloudflare-apply.json";
const DEFAULT_CLOUDFLARE_RECOVERY = ".tmp/framer-cloudflare-recovery.json";
const DEFAULT_NETLIFY_APPLY = ".tmp/framer-netlify-apply.json";
const DEFAULT_NETLIFY_RECOVERY = ".tmp/framer-netlify-recovery.json";
const DEFAULT_CREEM = ".tmp/framer-creem-compliance-review.json";
const DEFAULT_MARKETPLACE = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_PUBLIC = ".tmp/framer-public-preflight.json";
const DEFAULT_COMMUNITY = ".tmp/framer-community-launch-brief.json";
const DEFAULT_OUTPUT = ".tmp/framer-blocker-resolution-brief.md";
const DEFAULT_JSON = ".tmp/framer-blocker-resolution-brief.json";
const CLOUDFLARE_CONFIRMATION_FRESHNESS_HOURS = 2;

function usage() {
  return `
Usage:
  pnpm lead:blocker-brief

Options:
  --today-plan <file>        Today execution plan JSON. Default: ${DEFAULT_TODAY_PLAN}
  --payment <file>           Payment recovery JSON. Default: ${DEFAULT_PAYMENT}
  --checkout <file>          Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT}
  --cloudflare-apply <file>  Cloudflare apply JSON. Default: ${DEFAULT_CLOUDFLARE_APPLY}
  --cloudflare <file>        Cloudflare recovery JSON. Default: ${DEFAULT_CLOUDFLARE_RECOVERY}
  --netlify-apply <file>     Netlify apply JSON. Default: ${DEFAULT_NETLIFY_APPLY}
  --netlify <file>           Netlify recovery JSON. Default: ${DEFAULT_NETLIFY_RECOVERY}
  --creem <file>             Creem compliance review JSON. Default: ${DEFAULT_CREEM}
  --marketplace <file>       Marketplace preflight JSON. Default: ${DEFAULT_MARKETPLACE}
  --public-preflight <file>  Public preflight JSON. Default: ${DEFAULT_PUBLIC}
  --community <file>         Community launch brief JSON. Default: ${DEFAULT_COMMUNITY}
  --today <YYYY-MM-DD>       Report date. Default: local date.
  --output <file>            Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>              JSON output. Default: ${DEFAULT_JSON}
  --help                     Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    todayPlan: DEFAULT_TODAY_PLAN,
    payment: DEFAULT_PAYMENT,
    checkout: DEFAULT_CHECKOUT,
    cloudflareApply: DEFAULT_CLOUDFLARE_APPLY,
    cloudflare: DEFAULT_CLOUDFLARE_RECOVERY,
    netlifyApply: DEFAULT_NETLIFY_APPLY,
    netlify: DEFAULT_NETLIFY_RECOVERY,
    creem: DEFAULT_CREEM,
    marketplace: DEFAULT_MARKETPLACE,
    publicPreflight: DEFAULT_PUBLIC,
    community: DEFAULT_COMMUNITY,
    today: todayLocal(),
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
    if (key === "--today-plan") {
      args.todayPlan = value;
      index += 1;
      continue;
    }
    if (key === "--payment") {
      args.payment = value;
      index += 1;
      continue;
    }
    if (key === "--checkout") {
      args.checkout = value;
      index += 1;
      continue;
    }
    if (key === "--cloudflare-apply") {
      args.cloudflareApply = value;
      index += 1;
      continue;
    }
    if (key === "--cloudflare") {
      args.cloudflare = value;
      index += 1;
      continue;
    }
    if (key === "--netlify-apply") {
      args.netlifyApply = value;
      index += 1;
      continue;
    }
    if (key === "--netlify") {
      args.netlify = value;
      index += 1;
      continue;
    }
    if (key === "--creem") {
      args.creem = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace") {
      args.marketplace = value;
      index += 1;
      continue;
    }
    if (key === "--public-preflight") {
      args.publicPreflight = value;
      index += 1;
      continue;
    }
    if (key === "--community") {
      args.community = value;
      index += 1;
      continue;
    }
    if (key === "--today") {
      args.today = value;
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

function commandGroup(payment, labelNeedle) {
  const groups = Array.isArray(payment?.confirmation_gated_commands)
    ? payment.confirmation_gated_commands
    : [];
  return groups.find((group) => String(group.label || "").includes(labelNeedle)) || null;
}

function firstOpenPhase(payment) {
  return Array.isArray(payment?.phases)
    ? payment.phases.find((phase) => phase.status !== "ready") || null
    : null;
}

function phase(payment, id) {
  return Array.isArray(payment?.phases)
    ? payment.phases.find((item) => item.id === id) || null
    : null;
}

function firstCreemDeadline(creem) {
  return Array.isArray(creem?.warning_deadlines) ? creem.warning_deadlines[0] || null : null;
}

function deadlineSummary(deadline) {
  if (!deadline) return "";
  return `${deadline.deadline_at || "unknown deadline"} (${deadline.hours_remaining ?? "unknown"}h remaining, ${deadline.urgency || "unknown"})`;
}

function generatedAtFreshness(record, maxHours = CLOUDFLARE_CONFIRMATION_FRESHNESS_HOURS) {
  const generatedAt = record?.generated_at || "";
  if (!generatedAt) {
    return {
      generated_at: "",
      fresh: false,
      hours_old: null,
      max_hours: maxHours,
      status: "missing",
      label: `missing (max ${maxHours}h)`,
    };
  }

  const timestamp = Date.parse(generatedAt);
  if (Number.isNaN(timestamp)) {
    return {
      generated_at: generatedAt,
      fresh: false,
      hours_old: null,
      max_hours: maxHours,
      status: "invalid",
      label: `invalid generated_at (max ${maxHours}h)`,
    };
  }

  const hoursOld = Math.max(0, (Date.now() - timestamp) / 36e5);
  const rounded = Math.round(hoursOld * 10) / 10;
  const fresh = hoursOld <= maxHours;
  return {
    generated_at: generatedAt,
    fresh,
    hours_old: rounded,
    max_hours: maxHours,
    status: fresh ? "fresh" : "stale",
    label: `${fresh ? "fresh" : "stale"} (${rounded}h old, max ${maxHours}h)`,
  };
}

function build({
  args,
  todayPlan,
  payment,
  checkout,
  cloudflareApply,
  cloudflare,
  netlifyApply,
  netlify,
  creem,
  marketplace,
  publicPreflight,
  community,
}) {
  const steps = [
    cloudflareStep({ payment, checkout, cloudflareApply, cloudflare, todayPlan }),
    netlifyStep({ payment, netlifyApply, netlify }),
    creemStep({ payment, creem }),
    marketplaceStep({ payment, marketplace }),
    communityStep({ community, publicPreflight }),
  ];
  const first = steps.find((step) => step.status !== "ready") || null;
  const executable = steps.find((step) => step.status === "ready_for_confirmation") || null;
  const status = payment?.promotion_allowed === true
    ? "ready_for_public_preflight"
    : executable
      ? "confirmation_needed"
      : "blocked";

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    status,
    first_blocker: first ? {
      id: first.id,
      label: first.label,
      status: first.status,
      confirmation: first.confirmation,
      recommendation: first.recommendation,
    } : null,
    next_executable: executable ? {
      id: executable.id,
      label: executable.label,
      kind: executable.kind,
      action: executable.action || executable.label,
      target: executable.target || "",
      risk: executable.risk || "",
      expected_benefit: executable.expected_benefit || "",
      confirmation: executable.confirmation,
      commands: executable.commands,
      preconditions: executable.preconditions || [],
      record_command: executable.record_command || "",
      verification: executable.verification || "",
      verification_commands: executable.verification_commands || [],
      evidence_required: executable.evidence_required || [],
    } : null,
    payment_recovery_status: payment?.status || "missing",
    promotion_allowed: payment?.promotion_allowed ?? null,
    public_preflight: publicPreflight?.verdict || publicPreflight?.status || "missing",
    decision_queue: decisionQueue({ steps, executable, creem, netlify, publicPreflight }),
    steps,
    refresh_commands: refreshCommands(),
    stop_rules: stopRules(),
    recommendation: recommendationFor({ status, first, executable, payment }),
  };
}

function decisionQueue({ steps, executable, creem, netlify, publicPreflight }) {
  const byId = Object.fromEntries(steps.map((step) => [step.id, step]));
  const creemDeadline = firstCreemDeadline(creem);
  const queue = [];

  if (creem?.status === "needs_action" || byId.creem_resolution?.status === "blocked_external") {
    queue.push({
      kind: "local_only",
      status: creemDeadline?.urgency === "expired" ? "overdue" : "due",
      title: "Review Creem support packet",
      due: creemDeadline?.deadline_at || "",
      confirmation: "",
      command: "pnpm lead:creem-compliance\nsed -n '1,180p' .tmp/framer-creem-compliance-review.md",
      evidence: "Support draft is reviewed/copied; do not send or mark resolved without explicit approval and provider evidence.",
    });
  }

  if (executable) {
    queue.push({
      kind: "requires_confirmation",
      status: executable.id === "cloudflare_custom_domain" ? "ready_now" : "ready",
      title: `Confirm or defer ${executable.label}`,
      due: executable.id === "cloudflare_custom_domain" ? "now" : "",
      confirmation: executable.confirmation,
      command: executable.commands.join("\n"),
      evidence: "Run only after the exact confirmation phrase is provided; then rerun checkout-origin and payment recovery.",
    });
  }

  if (!executable && byId.cloudflare_custom_domain?.status === "refresh_required") {
    queue.push({
      kind: "local_only",
      status: "refresh_required",
      title: "Refresh Cloudflare confirmation preflight",
      due: "before requesting deploy confirmation",
      confirmation: "",
      command: "pnpm lead:cloudflare-recovery\npnpm lead:cloudflare-apply -- --dry-run\npnpm lead:blocker-brief\npnpm lead:today",
      evidence: byId.cloudflare_custom_domain.recommendation || "Cloudflare dry-run must be fresh before deploy confirmation is useful.",
    });
  }

  if (byId.netlify_site_deploy?.status === "blocked") {
    queue.push({
      kind: "external_console",
      status: "blocked",
      title: "Restore Netlify deploy ability",
      due: "before production checkout-origin deploy",
      confirmation: "",
      command: "pnpm lead:netlify-recovery\npnpm lead:netlify-apply -- --dry-run",
      evidence: netlify?.recommendation || "Netlify credits/permissions must allow a new deploy dry-run before confirmation is useful.",
    });
  }

  if (publicPreflight?.verdict === "blocked") {
    queue.push({
      kind: "hold",
      status: "blocked",
      title: "Hold Marketplace, Community, directory, and paid traffic",
      due: "until public preflight passes",
      confirmation: "",
      command: "pnpm lead:public-preflight\npnpm lead:next-public-actions",
      evidence: publicPreflight.recommendation || "No public action is ready while payment compliance and upload gates are blocked.",
    });
  }

  return queue;
}

function cloudflareStep({ payment, checkout, cloudflareApply, cloudflare, todayPlan }) {
  const group = commandGroup(payment, "Cloudflare") || {};
  const currentPhase = phase(payment, "cloudflare_custom_domain");
  const dryRunFreshness = generatedAtFreshness(cloudflareApply);
  const applyReady =
    cloudflareApply?.deploy_allowed === true &&
    cloudflareApply?.status === "dry_run_ready";
  const readyForConfirmation =
    currentPhase?.status !== "ready" &&
    applyReady &&
    dryRunFreshness.fresh;
  const refreshRequired =
    currentPhase?.status !== "ready" &&
    applyReady &&
    !dryRunFreshness.fresh;
  const healthBlocker = checkoutBlocker(checkout, "target_health");
  const dnsBlocker = checkoutBlocker(checkout, "target_dns_public");
  const todayConfirmation = Array.isArray(todayPlan?.needs_confirmation)
    ? todayPlan.needs_confirmation.find((item) => String(item.title || "").includes("Cloudflare"))
    : null;
  const commands = group.commands || splitCommandLines(todayConfirmation?.command) || [
    "pnpm lead:cloudflare-apply -- --dry-run",
    "pnpm lead:cloudflare-apply -- --confirm '确认部署 Cloudflare Worker custom domain'",
    "curl -I https://license.polyglotaeo.com/health",
  ];
  const evidenceRequired = [
    `Cloudflare dry-run generated_at is <= ${CLOUDFLARE_CONFIRMATION_FRESHNESS_HOURS}h old`,
    "Successful Wrangler deploy step in .tmp/framer-cloudflare-apply.json",
    "https://license.polyglotaeo.com/health returns HTTP 2xx/3xx",
    "pnpm lead:checkout-origin no longer reports target DNS/health blockers",
    "pnpm lead:payment-compliance-recovery advances past cloudflare_custom_domain",
  ];

  return {
    id: "cloudflare_custom_domain",
    label: "Cloudflare Worker custom domain",
    kind: "marketplace_release_gate",
    action: "Deploy Cloudflare custom domain and later Netlify only through existing confirmation-gated wrappers.",
    target: "Cloudflare Worker custom domain for license.polyglotaeo.com",
    risk: "Deploying the Worker/custom domain can affect live checkout/license traffic; only run through the guarded wrapper and verify /health immediately.",
    expected_benefit: "Move Polyglot checkout onto the approved custom domain so Marketplace upload and Community traffic can safely continue.",
    status: currentPhase?.status === "ready"
      ? "ready"
      : readyForConfirmation
        ? "ready_for_confirmation"
        : refreshRequired
          ? "refresh_required"
          : "blocked",
    confirmation: group.confirmation || todayConfirmation?.confirmation || "确认部署 Cloudflare Worker custom domain",
    commands,
    evidence_required: evidenceRequired,
    preconditions: [
      `Run or verify a dry-run no older than ${CLOUDFLARE_CONFIRMATION_FRESHNESS_HOURS} hours before executing the confirm command.`,
      "Use only pnpm lead:cloudflare-apply; do not run raw wrangler commands from memory.",
      "Stop if .tmp/framer-cloudflare-apply.json reports input_blockers or deploy_allowed is not true.",
      "Do not run the later Netlify deploy until Cloudflare health and checkout-origin checks pass.",
    ],
    record_command: "pnpm lead:actions -- --add --type deploy --channel cloudflare --campaign 'polyglot_checkout_origin_recovery' --status done --target 'Cloudflare Worker custom domain for license.polyglotaeo.com' --evidence '.tmp/framer-cloudflare-apply.json; https://license.polyglotaeo.com/health' --note 'Cloudflare Worker custom domain deployed after exact confirmation; checkout-origin/payment recovery refreshed.'",
    verification: `Fresh dry-run plus successful guarded deploy; ${evidenceRequired.join("; ")}.`,
    verification_commands: [
      "curl -I https://license.polyglotaeo.com/health",
      "pnpm lead:checkout-origin",
      "pnpm lead:payment-compliance-recovery",
      "pnpm lead:blocker-brief",
      "pnpm lead:portfolio-ops -- --skip-signals",
    ],
    dry_run_freshness: dryRunFreshness,
    blockers: [
      dnsBlocker,
      healthBlocker,
      refreshRequired ? `Cloudflare dry-run is ${dryRunFreshness.label}; refresh with pnpm lead:cloudflare-apply -- --dry-run before requesting confirmation.` : "",
      ...(Array.isArray(cloudflareApply?.input_blockers) ? cloudflareApply.input_blockers : []),
    ].filter(Boolean),
    recommendation: readyForConfirmation
      ? `Dry-run is fresh (${dryRunFreshness.label}). This is the current action-time confirmation step.`
      : refreshRequired
        ? `Refresh Cloudflare dry-run before asking for deploy confirmation; current dry-run is ${dryRunFreshness.label}.`
        : cloudflare?.recommendation || currentPhase?.next_action || "Refresh Cloudflare recovery and apply dry-run.",
  };
}

function netlifyStep({ payment, netlifyApply, netlify }) {
  const group = commandGroup(payment, "Netlify") || {};
  const currentPhase = phase(payment, "netlify_site_deploy");
  const readyForConfirmation =
    currentPhase?.status !== "ready" &&
    netlifyApply?.deploy_allowed === true &&
    /dry_run_ready/.test(netlifyApply?.status || "");

  return {
    id: "netlify_site_deploy",
    label: "Production site checkout origin deploy",
    status: currentPhase?.status === "ready" ? "ready" : readyForConfirmation ? "ready_for_confirmation" : "blocked",
    confirmation: group.confirmation || "确认部署 polyglotaeo-web 到 Netlify",
    commands: group.commands || [
      "pnpm lead:netlify-apply -- --dry-run",
      "pnpm lead:netlify-apply -- --confirm '确认部署 polyglotaeo-web 到 Netlify'",
      "pnpm lead:site-check && pnpm lead:tracking-freshness -- --strict",
    ],
    evidence_required: [
      "Netlify latest deploy id changes or deploy evidence is recorded",
      "Production pricing and /go/checkout use https://license.polyglotaeo.com",
      "pnpm lead:site-check passes",
      "pnpm lead:tracking-freshness -- --strict passes",
    ],
    blockers: Array.isArray(netlifyApply?.input_blockers) && netlifyApply.input_blockers.length
      ? netlifyApply.input_blockers
      : [netlify?.recommendation].filter(Boolean),
    recommendation: readyForConfirmation
      ? "Netlify dry-run is ready. Deploy only after explicit confirmation."
      : netlifyApply?.recommendation || netlify?.recommendation || currentPhase?.next_action || "Refresh Netlify recovery and apply dry-run.",
  };
}

function creemStep({ payment, creem }) {
  const group = commandGroup(payment, "Creem") || {};
  const currentPhase = phase(payment, "creem_resolution");
  const readyForRecord = creem?.status === "clear" || currentPhase?.status === "ready";
  const deadline = firstCreemDeadline(creem);

  return {
    id: "creem_resolution",
    label: "Creem compliance closure",
    status: readyForRecord ? "ready" : "blocked_external",
    confirmation: readyForRecord ? "" : group.confirmation || "Creem dashboard/support confirmation evidence is available",
    deadline,
    support_draft: creem?.support_draft || "",
    closure_draft: creem?.closure_draft || "",
    commands: readyForRecord
      ? ["pnpm lead:creem-compliance"]
      : group.commands || [
          "pnpm lead:creem-compliance",
          "pnpm lead:actions -- --add --type compliance_warning --channel creem --campaign unregistered_checkout_traffic --status resolved --target 'CREEM Compliance Review - Unregistered Traffic Detected' --evidence '<provider-dashboard-or-support-confirmation>' --note 'Creem compliance warning resolved'",
        ],
    evidence_required: readyForRecord
      ? ["pnpm lead:creem-compliance reports clear for Polyglot AEO"]
      : [
          "Creem dashboard or support confirms the warning is closed",
          "Action log contains a resolved compliance_warning row with provider evidence",
          "pnpm lead:creem-compliance reports clear",
        ],
    blockers: creem?.status === "needs_action"
      ? [
          deadline ? `Creem warning response deadline: ${deadlineSummary(deadline)}` : "",
          creem.recommendation,
        ].filter(Boolean)
      : [],
    recommendation: readyForRecord
      ? "No Polyglot Creem compliance action is needed."
      : creem?.recommendation || currentPhase?.next_action || "Get Creem closure evidence before checkout-heavy promotion.",
  };
}

function marketplaceStep({ payment, marketplace }) {
  const group = commandGroup(payment, "Framer Marketplace") || {};
  const currentPhase = phase(payment, "marketplace_preflight");
  const readyForConfirmation = marketplace?.upload_allowed === true;

  return {
    id: "marketplace_upload",
    label: "Framer Marketplace upload",
    status: readyForConfirmation ? "ready_for_confirmation" : currentPhase?.status || "blocked",
    confirmation: group.confirmation || "确认上传 plugin.zip 到 Framer Marketplace",
    commands: group.commands || [
      "pnpm lead:marketplace-preflight",
      "pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '<framer-upload-confirmation-url-or-screenshot>' --note 'uploaded from Framer Marketplace New Version flow'",
    ],
    evidence_required: [
      "Marketplace preflight says Upload allowed: yes",
      "Framer New Version upload confirmation URL or screenshot",
      "Marketplace record row with current plugin.zip hash",
      "Marketplace public and postflight snapshots after upload",
    ],
    blockers: Array.isArray(marketplace?.blockers) ? marketplace.blockers.slice(0, 8) : [],
    recommendation: marketplace?.recommendation || currentPhase?.next_action || "Rerun Marketplace preflight after payment recovery is clear.",
  };
}

function communityStep({ community, publicPreflight }) {
  const readyForConfirmation = community?.publish_allowed === true;

  return {
    id: "community_launch",
    label: "Framer Community controlled post",
    status: readyForConfirmation ? "ready_for_confirmation" : community?.status || "blocked",
    confirmation: community?.confirmation_required || "确认发布 Framer Community 第一条帖子",
    commands: [
      "pnpm lead:community",
      "pnpm lead:community-lint",
      "pnpm lead:community-preflight",
      "pnpm lead:community-brief",
      "pnpm lead:community-record -- --priority 1 --url '<published-framer-community-url>'",
    ],
    evidence_required: [
      "Community preflight says Publish allowed: yes",
      "Published Framer Community URL",
      "Post URL recorded with lead:community-record",
      "24h/48h/72h review windows run with comments/DMs plus Marketplace/form/event evidence",
    ],
    blockers: [
      ...(Array.isArray(community?.blockers) ? community.blockers : []),
      publicPreflight?.verdict === "blocked" ? publicPreflight.recommendation : "",
    ].filter(Boolean).slice(0, 8),
    recommendation: community?.recommendation || "Run one Marketplace-native Community test only after public preflight allows it.",
  };
}

function checkoutBlocker(checkout, id) {
  const item = Array.isArray(checkout?.requirements)
    ? checkout.requirements.find((entry) => entry.id === id)
    : null;
  if (!item || item.pass === true) return "";
  return `${item.label || id}: ${item.detail || "failed"}`;
}

function splitCommandLines(command) {
  if (!command) return null;
  return String(command).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function refreshCommands() {
  return [
    "pnpm lead:creem-compliance",
    "pnpm lead:checkout-origin",
    "pnpm lead:cloudflare-recovery",
    "pnpm lead:cloudflare-apply -- --dry-run",
    "pnpm lead:netlify-recovery",
    "pnpm lead:netlify-apply -- --dry-run",
    "pnpm lead:payment-compliance-recovery",
    "pnpm lead:marketplace-preflight",
    "pnpm lead:public-preflight",
    "pnpm lead:community-brief",
    "pnpm lead:blocker-brief",
  ];
}

function stopRules() {
  return [
    "Do not deploy Cloudflare or Netlify without the exact confirmation phrase printed in this brief.",
    "Do not mark Creem resolved without dashboard/support evidence.",
    "Do not upload plugin.zip until Marketplace preflight says Upload allowed: yes and the user confirms the Marketplace phrase.",
    "Do not publish Community or submit directories while public preflight is blocked.",
    "Do not send Day 3 follow-ups before 2026-07-03 and same-day Gmail preflight.",
  ];
}

function recommendationFor({ status, first, executable, payment }) {
  if (status === "ready_for_public_preflight") {
    return "Payment recovery is clear. Rerun Marketplace/Public preflight and proceed only with the next explicit confirmation.";
  }
  if (executable) {
    return `Action-time confirmation needed: ${executable.confirmation}.`;
  }
  if (first) {
    return `Blocked at ${first.label}. ${first.recommendation}`;
  }
  return payment?.recommendation || "Refresh blocker reports and rerun this brief.";
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Blocker Resolution Brief",
    "",
    `Generated: ${data.generated_at}`,
    `Today: ${data.today}`,
    `Status: ${data.status}`,
    `Promotion allowed: ${data.promotion_allowed === null ? "unknown" : data.promotion_allowed ? "yes" : "no"}`,
    `Public preflight: ${data.public_preflight}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
  ];

  if (data.next_executable) {
    lines.push(
      "## Next Confirmation",
      "",
      `Step: ${data.next_executable.label}`,
      `Required phrase: \`${data.next_executable.confirmation}\``,
      "",
      "```bash",
      ...data.next_executable.commands,
      "```",
      "",
    );
  }

  if (Array.isArray(data.decision_queue) && data.decision_queue.length) {
    lines.push("## Decision Queue", "", "| Kind | Status | Due | Action | Confirmation | Evidence |", "|---|---|---|---|---|---|");
    for (const item of data.decision_queue) {
      lines.push(
        `| ${pipe(item.kind)} | ${pipe(item.status)} | ${pipe(item.due)} | ${pipe(item.title)} | ${pipe(item.confirmation)} | ${pipe(item.evidence)} |`,
      );
    }
    lines.push("");
    lines.push("Queue commands:", "", "```bash");
    for (const item of data.decision_queue) {
      lines.push(`# ${item.title}`, ...String(item.command || "").split(/\r?\n/).filter(Boolean), "");
    }
    lines.push("```", "");
  }

  lines.push("## Resolution Path", "", "| Order | Step | Status | Confirmation | Recommendation |", "|---:|---|---|---|---|");
  data.steps.forEach((step, index) => {
    lines.push(`| ${index + 1} | ${step.label} | ${step.status} | ${pipe(step.confirmation)} | ${pipe(step.recommendation)} |`);
  });
  lines.push("");

  for (const step of data.steps) {
    lines.push(`## ${step.label}`, "");
    lines.push(`Status: ${step.status}`);
    lines.push(`Confirmation: ${step.confirmation || "none"}`);
    if (step.deadline) {
      lines.push(`Deadline: ${deadlineSummary(step.deadline)}`);
    }
    lines.push("", "Commands:", "", "```bash", ...step.commands, "```", "");
    lines.push("Evidence required:");
    for (const item of step.evidence_required) lines.push(`- ${item}`);
    if (step.blockers.length) {
      lines.push("", "Current blockers:");
      for (const blocker of step.blockers.slice(0, 8)) lines.push(`- ${blocker}`);
    }
    if (step.support_draft) {
      lines.push("", "Support draft:", "", "```text", step.support_draft, "```");
    }
    if (step.closure_draft) {
      lines.push("", "Closure follow-up draft:", "", "```text", step.closure_draft, "```");
    }
    lines.push("");
  }

  lines.push("## Refresh Commands", "", "```bash", ...data.refresh_commands, "```", "");
  lines.push("## Stop Rules", "");
  for (const rule of data.stop_rules) lines.push(`- ${rule}`);
  lines.push("");
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

  const [todayPlan, payment, checkout, cloudflareApply, cloudflare, netlifyApply, netlify, creem, marketplace, publicPreflight, community] = await Promise.all([
    readJson(args.todayPlan, null),
    readJson(args.payment, null),
    readJson(args.checkout, null),
    readJson(args.cloudflareApply, null),
    readJson(args.cloudflare, null),
    readJson(args.netlifyApply, null),
    readJson(args.netlify, null),
    readJson(args.creem, null),
    readJson(args.marketplace, null),
    readJson(args.publicPreflight, null),
    readJson(args.community, null),
  ]);
  const data = build({
    args,
    todayPlan,
    payment,
    checkout,
    cloudflareApply,
    cloudflare,
    netlifyApply,
    netlify,
    creem,
    marketplace,
    publicPreflight,
    community,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Blocker brief: ${data.status}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  if (data.next_executable?.confirmation) {
    process.stdout.write(`Next confirmation: ${data.next_executable.confirmation}\n`);
  }
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
