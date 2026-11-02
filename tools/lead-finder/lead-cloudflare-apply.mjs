#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CONFIRMATION = "确认部署 Cloudflare Worker custom domain";
const DEFAULT_TARGET_ORIGIN = "https://license.polyglotaeo.com";
const DEFAULT_WRANGLER_DIR = "api";
const DEFAULT_OUTPUT = ".tmp/framer-cloudflare-apply.md";
const DEFAULT_JSON = ".tmp/framer-cloudflare-apply.json";
const DEFAULT_RECOVERY_JSON = ".tmp/framer-cloudflare-recovery.json";
const DEFAULT_CHECKOUT_JSON = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_PAYMENT_JSON = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_NETLIFY_JSON = ".tmp/framer-netlify-recovery.json";
const DEFAULT_DEPLOY_JSON = ".tmp/framer-deploy-review.json";
const DEFAULT_MARKETPLACE_JSON = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_BLOCKER_JSON = ".tmp/framer-blocker-resolution-brief.json";
const DEFAULT_TODAY_JSON = ".tmp/framer-today.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";

function usage() {
  return `
Usage:
  pnpm lead:cloudflare-apply -- --dry-run
  pnpm lead:cloudflare-apply -- --confirm "${CONFIRMATION}"

Options:
  --confirm <text>        Required for deploy. Must equal: ${CONFIRMATION}
  --dry-run               Do not deploy or write action-log rows.
  --target-origin <url>   Target Worker origin. Default: ${DEFAULT_TARGET_ORIGIN}
  --wrangler-dir <dir>    Wrangler working directory. Default: ${DEFAULT_WRANGLER_DIR}
  --health-attempts <n>   Health checks after deploy. Default: 6
  --health-delay-ms <n>   Delay between health checks. Default: 10000
  --output <file>         Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>           JSON output. Default: ${DEFAULT_JSON}
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    confirm: "",
    dryRun: false,
    targetOrigin: DEFAULT_TARGET_ORIGIN,
    wranglerDir: DEFAULT_WRANGLER_DIR,
    healthAttempts: 6,
    healthDelayMs: 10000,
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
    if (key === "--confirm") {
      args.confirm = value;
      index += 1;
      continue;
    }
    if (key === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (key === "--target-origin") {
      args.targetOrigin = value.replace(/\/+$/, "");
      index += 1;
      continue;
    }
    if (key === "--wrangler-dir") {
      args.wranglerDir = value;
      index += 1;
      continue;
    }
    if (key === "--health-attempts") {
      args.healthAttempts = parsePositiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--health-delay-ms") {
      args.healthDelayMs = parsePositiveInt(value, key);
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

  args.targetOrigin = args.targetOrigin.replace(/\/+$/, "");
  return args;
}

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
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
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const text = await readText(file);
    if (!text) return fallback;
    try {
      return JSON.parse(text);
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(150);
    }
  }
  return fallback;
}

async function runStep(name, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      maxBuffer: options.maxBuffer || 30 * 1024 * 1024,
    });
    return {
      name,
      ok: true,
      command: [command, ...args].join(" "),
      cwd: options.cwd || process.cwd(),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      stdout: tail(stdout),
      stderr: tail(stderr),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      command: [command, ...args].join(" "),
      cwd: options.cwd || process.cwd(),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      stdout: tail(error?.stdout || ""),
      stderr: tail(error?.stderr || ""),
      error: error?.message || String(error),
    };
  }
}

function tail(value, max = 5000) {
  const text = String(value || "");
  return text.length <= max ? text : text.slice(-max);
}

async function healthCheck(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "PolyglotAEO-CloudflareApply/1.0" },
      signal: controller.signal,
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      final_url: response.url || url,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      final_url: url,
      error: error?.name === "AbortError" ? "timeout" : error?.message || String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deployInputsReady(recovery) {
  return Boolean(
    recovery?.wrangler?.config_ready &&
      recovery?.account?.readable &&
      recovery?.secrets?.required_present,
  );
}

function deployInputBlockers(recovery) {
  const blockers = [];
  if (!recovery?.wrangler?.config_ready) blockers.push("Wrangler config is not ready.");
  if (!recovery?.account?.readable) blockers.push("Cloudflare account is not readable.");
  if (!recovery?.secrets?.required_present) blockers.push("Required Worker secrets are missing.");
  return blockers;
}

function parseWranglerToml(text) {
  const scalar = (name) => {
    const match = text.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, "m"));
    return match ? match[1].trim() : "";
  };
  const varNames = [];
  const varsBlock = text.match(/\[vars\]([\s\S]*?)(?:\n\[|$)/);
  if (varsBlock) {
    for (const line of varsBlock[1].split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
      if (match) varNames.push(match[1]);
    }
  }
  const customDomains = [];
  for (const block of text.split(/\[\[routes\]\]/).slice(1)) {
    const pattern = block.match(/^\s*pattern\s*=\s*"([^"]+)"/m)?.[1] || "";
    const customDomain = /custom_domain\s*=\s*true/.test(block);
    if (pattern || customDomain) customDomains.push({ pattern, custom_domain: customDomain });
  }
  return {
    name: scalar("name"),
    main: scalar("main"),
    compatibility_date: scalar("compatibility_date"),
    workers_dev: scalar("workers_dev"),
    vars: varNames,
    custom_domains: customDomains,
  };
}

async function buildDeploymentPlan(args, recovery) {
  const wranglerFile = recovery?.wrangler?.file || path.join(args.wranglerDir, "wrangler.toml");
  const text = await readText(wranglerFile);
  const config = parseWranglerToml(text);
  const latestDeployment = recovery?.deployments?.latest || null;
  const requiredSecrets = ["CREEM_API_KEY", "CREEM_TEST_API_KEY"];
  const presentSecretNames = Array.isArray(recovery?.secrets?.names) ? recovery.secrets.names : [];
  const presentSecrets = requiredSecrets.filter((name) => presentSecretNames.includes(name));
  const missingSecrets = requiredSecrets.filter((name) => !presentSecretNames.includes(name));
  return {
    wrangler_dir: args.wranglerDir,
    wrangler_file: wranglerFile,
    worker_name: config.name || recovery?.wrangler?.worker_name || "",
    main: config.main,
    compatibility_date: config.compatibility_date,
    workers_dev: config.workers_dev,
    target_origin: args.targetOrigin,
    custom_domains: config.custom_domains,
    vars: config.vars,
    required_secrets: requiredSecrets,
    present_secrets: presentSecrets,
    missing_secrets: missingSecrets,
    account_summary: recovery?.account?.summary || "",
    latest_deployment_id: latestDeployment?.id || "",
    latest_deployment_created_on: latestDeployment?.created_on || "",
    deploy_command: `cd ${args.wranglerDir} && npx wrangler deploy`,
    health_url: `${args.targetOrigin}/health`,
    post_deploy_checks: [
      "pnpm lead:checkout-origin",
      "pnpm lead:payment-compliance-recovery",
      "pnpm lead:marketplace-preflight",
      "pnpm lead:blocker-brief",
    ],
  };
}

async function runRecovery() {
  const step = await runStep("Cloudflare recovery preflight", process.execPath, [
    "tools/lead-finder/lead-cloudflare-recovery.mjs",
  ]);
  const recovery = await readJson(DEFAULT_RECOVERY_JSON, null);
  return { step, recovery };
}

async function runPostDeployChecks() {
  const steps = [];
  steps.push(await runStep("Checkout origin readiness", process.execPath, [
    "tools/lead-finder/lead-checkout-origin-readiness.mjs",
  ]));
  steps.push(await runStep("Cloudflare recovery refresh", process.execPath, [
    "tools/lead-finder/lead-cloudflare-recovery.mjs",
  ]));
  steps.push(await runStep("Netlify recovery refresh", process.execPath, [
    "tools/lead-finder/lead-netlify-recovery.mjs",
  ]));
  steps.push(await runStep("Deploy review refresh", process.execPath, [
    "tools/lead-finder/lead-deploy-review.mjs",
  ]));
  steps.push(await runStep("Payment compliance recovery", process.execPath, [
    "tools/lead-finder/lead-payment-compliance-recovery.mjs",
  ]));
  steps.push(await runStep("Marketplace preflight", process.execPath, [
    "tools/lead-finder/lead-marketplace-preflight.mjs",
  ]));
  steps.push(await runStep("Blocker resolution brief", process.execPath, [
    "tools/lead-finder/lead-blocker-resolution-brief.mjs",
  ]));
  steps.push(await runStep("Today execution plan", process.execPath, [
    "tools/lead-finder/lead-today.mjs",
  ]));
  return steps;
}

async function recordAction(status, evidence, note) {
  return runStep("Record Cloudflare deploy action", process.execPath, [
    "tools/lead-finder/lead-action-log.mjs",
    "--add",
    "--type",
    "deploy",
    "--channel",
    "cloudflare",
    "--campaign",
    "worker_custom_domain",
    "--status",
    status,
    "--target",
    "license.polyglotaeo.com",
    "--evidence",
    evidence,
    "--note",
    note,
    "--file",
    DEFAULT_ACTIONS,
  ]);
}

async function build(args) {
  const steps = [];
  const healthUrl = `${args.targetOrigin}/health`;
  const confirmed = args.confirm === CONFIRMATION;
  const { step: recoveryStep, recovery } = await runRecovery();
  steps.push(recoveryStep);
  const inputBlockers = deployInputBlockers(recovery);
  const canDeploy = deployInputsReady(recovery);
  const deploymentPlan = await buildDeploymentPlan(args, recovery);

  if (!args.dryRun && !confirmed) {
    return {
      generated_at: new Date().toISOString(),
      status: "confirmation_required",
      dry_run: false,
      confirmation_required: CONFIRMATION,
      target_origin: args.targetOrigin,
      deploy_allowed: false,
      deployment_plan: deploymentPlan,
      input_blockers: inputBlockers,
      steps,
      health_checks: [],
      recommendation: `Rerun with --confirm "${CONFIRMATION}" after explicit user confirmation.`,
    };
  }

  if (!canDeploy) {
    return {
      generated_at: new Date().toISOString(),
      status: args.dryRun ? "dry_run_blocked" : "blocked_preflight",
      dry_run: args.dryRun,
      confirmation_required: CONFIRMATION,
      target_origin: args.targetOrigin,
      deploy_allowed: false,
      deployment_plan: deploymentPlan,
      input_blockers: inputBlockers,
      steps,
      health_checks: [],
      recommendation: `Do not deploy. Fix deploy input blockers: ${inputBlockers.join("; ")}`,
    };
  }

  if (args.dryRun) {
    return {
      generated_at: new Date().toISOString(),
      status: "dry_run_ready",
      dry_run: true,
      confirmation_required: CONFIRMATION,
      target_origin: args.targetOrigin,
      deploy_allowed: true,
      deployment_plan: deploymentPlan,
      input_blockers: [],
      planned_commands: plannedCommands(args),
      steps,
      health_checks: [],
      recommendation: `Dry run passed. Deploy only after explicit confirmation: ${CONFIRMATION}`,
    };
  }

  const deployStep = await runStep("Wrangler deploy", "npx", ["wrangler", "deploy"], {
    cwd: args.wranglerDir,
    maxBuffer: 60 * 1024 * 1024,
  });
  steps.push(deployStep);

  const healthChecks = [];
  if (deployStep.ok) {
    for (let attempt = 1; attempt <= args.healthAttempts; attempt += 1) {
      const check = await healthCheck(healthUrl);
      healthChecks.push({ attempt, ...check });
      if (check.ok) break;
      if (attempt < args.healthAttempts) await sleep(args.healthDelayMs);
    }
    steps.push(...(await runPostDeployChecks()));
  }

  const latestHealth = healthChecks[healthChecks.length - 1] || null;
  const checkout = await readJson(DEFAULT_CHECKOUT_JSON, null);
  const payment = await readJson(DEFAULT_PAYMENT_JSON, null);
  const netlify = await readJson(DEFAULT_NETLIFY_JSON, null);
  const deploy = await readJson(DEFAULT_DEPLOY_JSON, null);
  const marketplace = await readJson(DEFAULT_MARKETPLACE_JSON, null);
  const blocker = await readJson(DEFAULT_BLOCKER_JSON, null);
  const today = await readJson(DEFAULT_TODAY_JSON, null);
  const verified =
    deployStep.ok &&
    latestHealth?.ok === true &&
    checkout?.promotion_allowed === true &&
    payment?.promotion_allowed === true;
  const status = !deployStep.ok
    ? "deploy_failed"
    : latestHealth?.ok !== true
      ? "deployed_health_pending"
      : verified
        ? "deployed_verified"
        : "deployed_needs_followup";
  const nextAction = nextRecoveryAction({ status, payment, blocker, today, checkout, netlify, deploy, marketplace });
  const actionStep = await recordAction(
    deployStep.ok ? "done" : "blocked",
    latestHealth?.ok ? healthUrl : DEFAULT_JSON,
    verified
      ? "Cloudflare Worker custom domain deploy verified."
      : nextAction?.recommendation || "Cloudflare deploy ran; follow-up checks still need attention.",
  );
  steps.push(actionStep);

  return {
    generated_at: new Date().toISOString(),
    status,
    dry_run: false,
    confirmation_required: CONFIRMATION,
    target_origin: args.targetOrigin,
    deploy_allowed: true,
    deployment_plan: deploymentPlan,
    input_blockers: [],
    planned_commands: plannedCommands(args),
    steps,
    health_checks: healthChecks,
    verification: {
      health_ok: latestHealth?.ok ?? false,
      checkout_origin_status: checkout?.status || "missing",
      promotion_allowed: checkout?.promotion_allowed ?? null,
      payment_recovery_status: payment?.status || "missing",
      payment_promotion_allowed: payment?.promotion_allowed ?? null,
      netlify_recovery_status: netlify?.status || "missing",
      deploy_review_status: deploy?.status || "missing",
      marketplace_preflight: marketplace?.verdict || "missing",
      marketplace_upload_allowed: marketplace?.upload_allowed ?? null,
      blocker_status: blocker?.status || "missing",
      blocker_next_confirmation: blocker?.next_executable?.confirmation || "",
      today_recommendation: today?.recommendation || "",
    },
    next_action: nextAction,
    recommendation: recommendationFor({ status, latestHealth, checkout, payment, marketplace, nextAction }),
  };
}

function plannedCommands(args) {
  return [
    `pnpm lead:cloudflare-apply -- --confirm "${CONFIRMATION}"`,
    "pnpm lead:checkout-origin",
    "pnpm lead:netlify-recovery",
    "pnpm lead:deploy-review",
    "pnpm lead:payment-compliance-recovery",
    "pnpm lead:marketplace-preflight",
    "pnpm lead:blocker-brief",
    "pnpm lead:today",
    "pnpm lead:ops && pnpm lead:report",
  ];
}

function nextRecoveryAction({ status, payment, blocker, today, checkout, netlify, deploy, marketplace }) {
  if (status === "deploy_failed") {
    return {
      kind: "retry_after_error",
      label: "Inspect Wrangler deploy failure",
      status: "blocked",
      confirmation: "",
      recommendation: "Wrangler deploy failed. Inspect stdout/stderr in .tmp/framer-cloudflare-apply.json before retrying.",
      commands: ["pnpm lead:cloudflare-apply -- --dry-run"],
    };
  }

  if (status === "deployed_health_pending") {
    return {
      kind: "health_pending",
      label: "Verify Cloudflare custom-domain health",
      status: "needs_attention",
      confirmation: "",
      recommendation: "Cloudflare deploy ran, but /health did not pass within the retry window. Rerun recovery and checkout-origin before asking for the next external action.",
      commands: [
        "pnpm lead:cloudflare-recovery",
        "pnpm lead:checkout-origin",
        "pnpm lead:blocker-brief",
      ],
    };
  }

  const firstOpenPhase = Array.isArray(payment?.phases)
    ? payment.phases.find((item) => item.status !== "ready") || null
    : null;
  const executable = blocker?.next_executable || null;
  const todayConfirmation = Array.isArray(today?.needs_confirmation)
    ? today.needs_confirmation[0] || null
    : null;

  if (executable || todayConfirmation) {
    return {
      kind: "confirmation",
      label: executable?.label || todayConfirmation?.title || "Next confirmation-gated action",
      status: "requires_confirmation",
      confirmation: executable?.confirmation || todayConfirmation?.confirmation || "",
      recommendation: blocker?.recommendation || today?.recommendation || "Use the next confirmation-gated command only after explicit approval.",
      commands: executable?.commands || splitCommandLines(todayConfirmation?.command),
    };
  }

  if (firstOpenPhase) {
    return {
      kind: "phase",
      label: firstOpenPhase.label || firstOpenPhase.id,
      status: firstOpenPhase.status || "blocked",
      confirmation: "",
      recommendation: firstOpenPhase.next_action || payment?.recommendation || "Continue payment compliance recovery.",
      commands: [
        "pnpm lead:payment-compliance-recovery",
        "pnpm lead:blocker-brief",
        "pnpm lead:today",
      ],
    };
  }

  if (marketplace?.upload_allowed === true) {
    return {
      kind: "marketplace",
      label: "Framer Marketplace upload",
      status: "requires_confirmation",
      confirmation: "确认上传 plugin.zip 到 Framer Marketplace",
      recommendation: "Payment recovery is clear. Upload only after explicit Marketplace confirmation and record the evidence.",
      commands: [
        "pnpm lead:marketplace-preflight",
        "pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '<framer-upload-confirmation-url-or-screenshot>'",
      ],
    };
  }

  return {
    kind: "refresh",
    label: "Refresh blocker routing",
    status: "needs_refresh",
    confirmation: "",
    recommendation: today?.recommendation || netlify?.recommendation || deploy?.recommendation || checkout?.recommendation || "Refresh local recovery reports.",
    commands: [
      "pnpm lead:checkout-origin",
      "pnpm lead:payment-compliance-recovery",
      "pnpm lead:blocker-brief",
      "pnpm lead:today",
    ],
  };
}

function splitCommandLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function recommendationFor({ status, latestHealth, checkout, payment, marketplace, nextAction }) {
  if (status === "deploy_failed") {
    return "Wrangler deploy failed. Inspect the deploy step stderr/stdout in the JSON report before retrying.";
  }
  if (status === "deployed_health_pending") {
    return nextAction?.recommendation || "Cloudflare deploy ran, but custom-domain health is not verified yet.";
  }
  if (status === "deployed_verified") {
    return "Cloudflare custom domain is verified. Continue with payment recovery, Netlify/Creem closure, then Marketplace preflight.";
  }
  if (nextAction?.recommendation) {
    return `Cloudflare deploy succeeded. Next: ${nextAction.recommendation}`;
  }
  const details = [
    latestHealth?.ok ? "" : `health=${latestHealth?.status || 0} ${latestHealth?.error || ""}`.trim(),
    checkout?.status ? `checkout=${checkout.status}` : "",
    payment?.status ? `payment=${payment.status}` : "",
    marketplace?.verdict ? `marketplace=${marketplace.verdict}` : "",
  ].filter(Boolean).join("; ");
  return `Deploy ran, but follow-up checks are not clear yet. ${details}`;
}

function renderMarkdown(data) {
  const lines = [
    "# Cloudflare Apply",
    "",
    `Generated: ${data.generated_at}`,
    `Status: ${data.status}`,
    `Dry run: ${data.dry_run ? "yes" : "no"}`,
    `Target origin: ${data.target_origin}`,
    `Deploy allowed by local preflight: ${data.deploy_allowed ? "yes" : "no"}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
  ];

  if (data.input_blockers?.length) {
    lines.push("## Input Blockers", "");
    for (const blocker of data.input_blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }

  lines.push("## Confirmation", "", `Required phrase: \`${data.confirmation_required}\``, "");

  if (data.deployment_plan) {
    const plan = data.deployment_plan;
    lines.push(
      "## Deployment Plan",
      "",
      `- Wrangler dir: ${plan.wrangler_dir}`,
      `- Wrangler config: ${plan.wrangler_file}`,
      `- Worker: ${plan.worker_name || "unknown"}`,
      `- Entry: ${plan.main || "unknown"}`,
      `- Compatibility date: ${plan.compatibility_date || "unknown"}`,
      `- workers.dev enabled: ${plan.workers_dev === "false" ? "no" : plan.workers_dev || "unknown"}`,
      `- Target origin: ${plan.target_origin}`,
      `- Health URL: ${plan.health_url}`,
      `- Cloudflare account: ${plan.account_summary || "unknown"}`,
      `- Latest deployment: ${plan.latest_deployment_id || "unknown"}${plan.latest_deployment_created_on ? ` (${plan.latest_deployment_created_on})` : ""}`,
      `- Required secrets present: ${Array.isArray(plan.missing_secrets) && plan.missing_secrets.length ? `no, missing ${plan.missing_secrets.join(", ")}` : "yes"}`,
      "",
    );
    if (Array.isArray(plan.custom_domains) && plan.custom_domains.length) {
      lines.push("Custom domains:", "", "| Pattern | Custom domain |", "|---|---|");
      for (const route of plan.custom_domains) {
        lines.push(`| ${pipe(route.pattern)} | ${route.custom_domain ? "yes" : "no"} |`);
      }
      lines.push("");
    }
    if (Array.isArray(plan.vars) && plan.vars.length) {
      lines.push(`Bound vars: ${plan.vars.join(", ")}`, "");
    }
    lines.push("Deploy command:", "", "```bash", plan.deploy_command, "```", "");
  }

  if (data.planned_commands?.length) {
    lines.push("## Planned Commands", "", "```bash", ...data.planned_commands, "```", "");
  }

  if (data.health_checks?.length) {
    lines.push("## Health Checks", "", "| Attempt | Status | Result |", "|---:|---:|---|");
    for (const check of data.health_checks) {
      lines.push(`| ${check.attempt} | ${check.status} | ${check.ok ? "pass" : check.error || check.final_url} |`);
    }
    lines.push("");
  }

  if (data.verification) {
    lines.push(
      "## Verification",
      "",
      `- Health: ${data.verification.health_ok ? "pass" : "fail"}`,
      `- Checkout origin: ${data.verification.checkout_origin_status}`,
      `- Checkout promotion allowed: ${data.verification.promotion_allowed === null ? "unknown" : data.verification.promotion_allowed ? "yes" : "no"}`,
      `- Payment recovery: ${data.verification.payment_recovery_status}`,
      `- Payment promotion allowed: ${data.verification.payment_promotion_allowed === null ? "unknown" : data.verification.payment_promotion_allowed ? "yes" : "no"}`,
      `- Netlify recovery: ${data.verification.netlify_recovery_status}`,
      `- Deploy review: ${data.verification.deploy_review_status}`,
      `- Marketplace preflight: ${data.verification.marketplace_preflight}`,
      `- Marketplace upload allowed: ${data.verification.marketplace_upload_allowed === null ? "unknown" : data.verification.marketplace_upload_allowed ? "yes" : "no"}`,
      `- Blocker brief: ${data.verification.blocker_status}`,
      `- Blocker next confirmation: ${data.verification.blocker_next_confirmation || "none"}`,
      "",
    );
  }

  if (data.next_action) {
    lines.push(
      "## Next Action",
      "",
      `- Kind: ${data.next_action.kind || ""}`,
      `- Label: ${data.next_action.label || ""}`,
      `- Status: ${data.next_action.status || ""}`,
      `- Confirmation: ${data.next_action.confirmation || "none"}`,
      `- Recommendation: ${data.next_action.recommendation || ""}`,
      "",
    );
    if (Array.isArray(data.next_action.commands) && data.next_action.commands.length) {
      lines.push("Commands:", "", "```bash", ...data.next_action.commands, "```", "");
    }
  }

  lines.push("## Steps", "", "| Step | Result | Command |", "|---|---|---|");
  for (const step of data.steps || []) {
    lines.push(`| ${step.name} | ${step.ok ? "pass" : "fail"} | ${pipe(step.command)} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\n/g, " ");
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const data = await build(args);
  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Cloudflare apply: ${data.status}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);

  if (
    !data.dry_run &&
    ["deploy_failed", "blocked_preflight", "deployed_health_pending"].includes(data.status)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
