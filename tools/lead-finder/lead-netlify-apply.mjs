#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CONFIRMATION = "确认部署 polyglotaeo-web 到 Netlify";
const DEFAULT_SITE_ID = "49fc3e5b-7ff7-4185-b578-60c81e3168ff";
const DEFAULT_SITE_URL = "https://polyglotaeo.com";
const DEFAULT_TARGET_ORIGIN = "https://license.polyglotaeo.com";
const DEFAULT_WEB_DIR = "polyglotaeo-web";
const DEFAULT_DEPLOY_DIR = "polyglotaeo-web/out";
const DEFAULT_OUTPUT = ".tmp/framer-netlify-apply.md";
const DEFAULT_JSON = ".tmp/framer-netlify-apply.json";
const DEFAULT_NETLIFY_JSON = ".tmp/framer-netlify-recovery.json";
const DEFAULT_LOCAL_TRACKING_JSON = ".tmp/framer-local-tracking-freshness.json";
const DEFAULT_TRACKING_JSON = ".tmp/framer-tracking-freshness.json";
const DEFAULT_CHECKOUT_JSON = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_DEPLOY_REVIEW_JSON = ".tmp/framer-deploy-review.json";
const DEFAULT_PAYMENT_JSON = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_MARKETPLACE_JSON = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";

function usage() {
  return `
Usage:
  pnpm lead:netlify-apply -- --dry-run
  pnpm lead:netlify-apply -- --confirm "${CONFIRMATION}"

Options:
  --confirm <text>        Required for deploy. Must equal: ${CONFIRMATION}
  --dry-run               Do not build, deploy, or write action-log rows.
  --site <id>             Netlify site id. Default: ${DEFAULT_SITE_ID}
  --site-url <url>        Production URL. Default: ${DEFAULT_SITE_URL}
  --target-origin <url>   Approved Worker origin. Default: ${DEFAULT_TARGET_ORIGIN}
  --web-dir <dir>         Web app directory. Default: ${DEFAULT_WEB_DIR}
  --deploy-dir <dir>      Static export directory. Default: ${DEFAULT_DEPLOY_DIR}
  --output <file>         Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>           JSON output. Default: ${DEFAULT_JSON}
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    confirm: "",
    dryRun: false,
    site: process.env.NETLIFY_SITE_ID || DEFAULT_SITE_ID,
    siteUrl: DEFAULT_SITE_URL,
    targetOrigin: DEFAULT_TARGET_ORIGIN,
    webDir: DEFAULT_WEB_DIR,
    deployDir: DEFAULT_DEPLOY_DIR,
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
    if (key === "--site") {
      args.site = value;
      index += 1;
      continue;
    }
    if (key === "--site-url") {
      args.siteUrl = value.replace(/\/+$/, "");
      index += 1;
      continue;
    }
    if (key === "--target-origin") {
      args.targetOrigin = value.replace(/\/+$/, "");
      index += 1;
      continue;
    }
    if (key === "--web-dir") {
      args.webDir = value;
      index += 1;
      continue;
    }
    if (key === "--deploy-dir") {
      args.deployDir = value;
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

  args.siteUrl = args.siteUrl.replace(/\/+$/, "");
  args.targetOrigin = args.targetOrigin.replace(/\/+$/, "");
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

function requirement(checkout, id) {
  return Array.isArray(checkout?.requirements)
    ? checkout.requirements.find((item) => item.id === id) || null
    : null;
}

function requirementPass(checkout, id) {
  return requirement(checkout, id)?.pass === true;
}

async function runPreflight(args) {
  const steps = [];
  steps.push(await runStep("Netlify recovery preflight", process.execPath, [
    "tools/lead-finder/lead-netlify-recovery.mjs",
    "--site",
    args.site,
    "--site-url",
    args.siteUrl,
    "--build-dir",
    args.deployDir,
  ]));
  steps.push(await runStep("Local tracking freshness", process.execPath, [
    "tools/lead-finder/lead-local-tracking-freshness.mjs",
    "--static-dir",
    args.deployDir,
  ]));
  steps.push(await runStep("Checkout origin readiness", process.execPath, [
    "tools/lead-finder/lead-checkout-origin-readiness.mjs",
    "--site",
    args.siteUrl,
    "--target-origin",
    args.targetOrigin,
  ]));
  steps.push(await runStep("Deploy review refresh", process.execPath, [
    "tools/lead-finder/lead-deploy-review.mjs",
  ]));

  const [netlify, localTracking, checkout, deployReview] = await Promise.all([
    readJson(DEFAULT_NETLIFY_JSON, null),
    readJson(DEFAULT_LOCAL_TRACKING_JSON, null),
    readJson(DEFAULT_CHECKOUT_JSON, null),
    readJson(DEFAULT_DEPLOY_REVIEW_JSON, null),
  ]);

  return { steps, netlify, localTracking, checkout, deployReview };
}

async function runPostDeployChecks(args) {
  const steps = [];
  steps.push(await runStep("Site check", process.execPath, [
    "tools/lead-finder/lead-site-check.mjs",
  ], { maxBuffer: 60 * 1024 * 1024 }));
  steps.push(await runStep("Production tracking freshness strict", process.execPath, [
    "tools/lead-finder/lead-tracking-freshness.mjs",
    "--base-url",
    args.siteUrl,
    "--strict",
  ]));
  steps.push(await runStep("Checkout origin readiness", process.execPath, [
    "tools/lead-finder/lead-checkout-origin-readiness.mjs",
    "--site",
    args.siteUrl,
    "--target-origin",
    args.targetOrigin,
  ]));
  steps.push(await runStep("Netlify recovery refresh", process.execPath, [
    "tools/lead-finder/lead-netlify-recovery.mjs",
    "--site",
    args.site,
    "--site-url",
    args.siteUrl,
    "--build-dir",
    args.deployDir,
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
  return steps;
}

function deployInputBlockers({ netlify, localTracking, checkout, deployReview }) {
  const blockers = [];
  const api = netlify?.api || {};
  const netlifyBlockers = netlify?.blockers || {};
  const targetDns = requirement(checkout, "target_dns_public");
  const targetHealth = requirement(checkout, "target_health");

  if (!netlify?.token?.found) blockers.push("Netlify auth token was not found.");
  if (!api.site_readable) blockers.push(`Netlify site is not readable${api.site_status ? ` (HTTP ${api.site_status})` : ""}.`);
  if (!api.deploys_readable) blockers.push(`Netlify deploys are not readable${api.deploys_status ? ` (HTTP ${api.deploys_status})` : ""}.`);
  if (netlifyBlockers.account_credit_usage_exceeded) blockers.push("Netlify account credit usage exceeded evidence is present.");
  if (netlifyBlockers.forbidden_or_permission) blockers.push("Netlify deploy permission/Forbidden evidence is present.");
  if (localTracking?.fresh !== true) blockers.push("Local static export is not tracking-fresh.");
  if (targetDns && !targetDns.pass) blockers.push(`Approved Worker custom domain DNS is not ready: ${targetDns.detail || "failed"}.`);
  if (targetHealth && !targetHealth.pass) blockers.push(`Approved Worker custom domain /health is not ready: ${targetHealth.detail || "failed"}.`);

  if (/blocked/i.test(deployReview?.netlify_new_deploys || "") && !netlifyBlockers.account_credit_usage_exceeded && !netlifyBlockers.forbidden_or_permission) {
    blockers.push(`Deploy review reports blocked Netlify deploys: ${deployReview.deploy_blocker || deployReview.netlify_new_deploys}.`);
  }

  return blockers;
}

function deployNeeded({ tracking, checkout }) {
  return Boolean(
    tracking?.fresh === false ||
      requirementPass(checkout, "production_pricing_origin") === false ||
      requirementPass(checkout, "production_bridge_origin") === false,
  );
}

async function recordAction(args, status, evidence, note) {
  return runStep("Record Netlify deploy action", process.execPath, [
    "tools/lead-finder/lead-action-log.mjs",
    "--add",
    "--type",
    "web_deploy",
    "--channel",
    "netlify",
    "--campaign",
    "polyglotaeo_web",
    "--status",
    status,
    "--target",
    args.siteUrl,
    "--evidence",
    evidence,
    "--note",
    note,
    "--file",
    DEFAULT_ACTIONS,
  ]);
}

async function build(args) {
  const confirmed = args.confirm === CONFIRMATION;
  const { steps, netlify, localTracking, checkout, deployReview } = await runPreflight(args);
  const inputBlockers = deployInputBlockers({ netlify, localTracking, checkout, deployReview });
  const canDeploy = inputBlockers.length === 0;
  const initialTracking = await readJson(DEFAULT_TRACKING_JSON, null);
  const needed = deployNeeded({ tracking: initialTracking, checkout });

  if (!args.dryRun && !confirmed) {
    return {
      generated_at: new Date().toISOString(),
      status: "confirmation_required",
      dry_run: false,
      confirmation_required: CONFIRMATION,
      site_id: args.site,
      site_url: args.siteUrl,
      target_origin: args.targetOrigin,
      deploy_allowed: false,
      deploy_needed: needed,
      input_blockers: inputBlockers,
      planned_commands: plannedCommands(args),
      steps,
      recommendation: `Rerun with --confirm "${CONFIRMATION}" after explicit user confirmation.`,
    };
  }

  if (!canDeploy) {
    return {
      generated_at: new Date().toISOString(),
      status: args.dryRun ? "dry_run_blocked" : "blocked_preflight",
      dry_run: args.dryRun,
      confirmation_required: CONFIRMATION,
      site_id: args.site,
      site_url: args.siteUrl,
      target_origin: args.targetOrigin,
      deploy_allowed: false,
      deploy_needed: needed,
      input_blockers: inputBlockers,
      planned_commands: plannedCommands(args),
      steps,
      recommendation: `Do not deploy. Fix deploy input blockers: ${inputBlockers.join("; ")}`,
    };
  }

  if (args.dryRun) {
    return {
      generated_at: new Date().toISOString(),
      status: needed ? "dry_run_ready" : "dry_run_ready_no_deploy_needed",
      dry_run: true,
      confirmation_required: CONFIRMATION,
      site_id: args.site,
      site_url: args.siteUrl,
      target_origin: args.targetOrigin,
      deploy_allowed: true,
      deploy_needed: needed,
      input_blockers: [],
      planned_commands: plannedCommands(args),
      steps,
      recommendation: needed
        ? `Dry run passed. Deploy only after explicit confirmation: ${CONFIRMATION}`
        : "Dry run passed, but current evidence does not show a required Netlify deploy. Keep using preflights before public traffic.",
    };
  }

  const buildStep = await runStep("Build polyglotaeo-web", "pnpm", [
    "--dir",
    args.webDir,
    "build",
  ], { maxBuffer: 80 * 1024 * 1024 });
  steps.push(buildStep);

  let deployStep = null;
  if (buildStep.ok) {
    deployStep = await runStep("Netlify static deploy", process.execPath, [
      "tools/lead-finder/netlify-static-deploy.mjs",
      "--site",
      args.site,
      "--dir",
      args.deployDir,
    ], { maxBuffer: 80 * 1024 * 1024 });
    steps.push(deployStep);
  }

  if (deployStep?.ok) {
    steps.push(...(await runPostDeployChecks(args)));
  }

  const [tracking, refreshedCheckout, payment, marketplace, refreshedNetlify] = await Promise.all([
    readJson(DEFAULT_TRACKING_JSON, null),
    readJson(DEFAULT_CHECKOUT_JSON, null),
    readJson(DEFAULT_PAYMENT_JSON, null),
    readJson(DEFAULT_MARKETPLACE_JSON, null),
    readJson(DEFAULT_NETLIFY_JSON, null),
  ]);
  const verified =
    buildStep.ok &&
    deployStep?.ok === true &&
    tracking?.fresh === true &&
    requirementPass(refreshedCheckout, "production_pricing_origin") &&
    requirementPass(refreshedCheckout, "production_bridge_origin");
  const status = !buildStep.ok
    ? "build_failed"
    : !deployStep?.ok
      ? "deploy_failed"
      : verified
        ? "deployed_verified"
        : "deployed_needs_followup";
  const evidence = deployStep?.ok ? refreshedNetlify?.latest_deploy?.id || DEFAULT_JSON : DEFAULT_JSON;
  const actionStep = await recordAction(
    args,
    deployStep?.ok ? "done" : "blocked",
    evidence,
    verified
      ? "Netlify deploy verified with fresh production tracking and approved checkout origin."
      : "Netlify deploy path ran; follow-up checks still need attention.",
  );
  steps.push(actionStep);

  return {
    generated_at: new Date().toISOString(),
    status,
    dry_run: false,
    confirmation_required: CONFIRMATION,
    site_id: args.site,
    site_url: args.siteUrl,
    target_origin: args.targetOrigin,
    deploy_allowed: true,
    deploy_needed: needed,
    input_blockers: [],
    planned_commands: plannedCommands(args),
    steps,
    verification: {
      latest_deploy_id: refreshedNetlify?.latest_deploy?.id || "",
      tracking_fresh: tracking?.fresh ?? null,
      tracking_status: tracking?.status || "missing",
      checkout_origin_status: refreshedCheckout?.status || "missing",
      production_pricing_origin: requirementPass(refreshedCheckout, "production_pricing_origin"),
      production_bridge_origin: requirementPass(refreshedCheckout, "production_bridge_origin"),
      payment_recovery_status: payment?.status || "missing",
      payment_promotion_allowed: payment?.promotion_allowed ?? null,
      marketplace_preflight: marketplace?.verdict || "missing",
      marketplace_upload_allowed: marketplace?.upload_allowed ?? null,
    },
    recommendation: recommendationFor({ status, tracking, checkout: refreshedCheckout, payment, marketplace }),
  };
}

function plannedCommands(args) {
  return [
    "pnpm lead:netlify-apply -- --dry-run",
    `pnpm lead:netlify-apply -- --confirm "${CONFIRMATION}"`,
    "pnpm lead:site-check && pnpm lead:tracking-freshness -- --strict",
    "pnpm lead:checkout-origin",
    "pnpm lead:payment-compliance-recovery",
    "pnpm lead:marketplace-preflight",
    "pnpm lead:today && pnpm lead:ops && pnpm lead:report",
  ];
}

function recommendationFor({ status, tracking, checkout, payment, marketplace }) {
  if (status === "build_failed") {
    return "Web build failed. Inspect the build step stderr/stdout in the JSON report before retrying.";
  }
  if (status === "deploy_failed") {
    return "Netlify deploy failed. Inspect the deploy step stderr/stdout in the JSON report before retrying.";
  }
  if (status === "deployed_verified") {
    return "Netlify production deploy is verified. Continue with Creem closure, payment recovery, then Marketplace preflight.";
  }
  const details = [
    tracking?.status ? `tracking=${tracking.status}` : "",
    checkout?.status ? `checkout=${checkout.status}` : "",
    payment?.status ? `payment=${payment.status}` : "",
    marketplace?.verdict ? `marketplace=${marketplace.verdict}` : "",
  ].filter(Boolean).join("; ");
  return `Deploy ran, but follow-up checks are not clear yet. ${details}`;
}

function renderMarkdown(data) {
  const lines = [
    "# Netlify Apply",
    "",
    `Generated: ${data.generated_at}`,
    `Status: ${data.status}`,
    `Dry run: ${data.dry_run ? "yes" : "no"}`,
    `Site: ${data.site_url} (${data.site_id})`,
    `Target origin: ${data.target_origin}`,
    `Deploy allowed by local preflight: ${data.deploy_allowed ? "yes" : "no"}`,
    `Deploy needed by current evidence: ${data.deploy_needed ? "yes" : "no"}`,
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

  if (data.planned_commands?.length) {
    lines.push("## Planned Commands", "", "```bash", ...data.planned_commands, "```", "");
  }

  if (data.verification) {
    lines.push(
      "## Verification",
      "",
      `- Latest deploy id: ${data.verification.latest_deploy_id || "unknown"}`,
      `- Tracking freshness: ${data.verification.tracking_status}`,
      `- Tracking fresh: ${data.verification.tracking_fresh === null ? "unknown" : data.verification.tracking_fresh ? "yes" : "no"}`,
      `- Checkout origin: ${data.verification.checkout_origin_status}`,
      `- Production pricing origin: ${data.verification.production_pricing_origin ? "pass" : "fail"}`,
      `- Production bridge origin: ${data.verification.production_bridge_origin ? "pass" : "fail"}`,
      `- Payment recovery: ${data.verification.payment_recovery_status}`,
      `- Payment promotion allowed: ${data.verification.payment_promotion_allowed === null ? "unknown" : data.verification.payment_promotion_allowed ? "yes" : "no"}`,
      `- Marketplace preflight: ${data.verification.marketplace_preflight}`,
      `- Marketplace upload allowed: ${data.verification.marketplace_upload_allowed === null ? "unknown" : data.verification.marketplace_upload_allowed ? "yes" : "no"}`,
      "",
    );
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
  await writeFile(file, text, "utf8");
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

  process.stdout.write(`Netlify apply: ${data.status}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);

  if (!data.dry_run && data.status !== "deployed_verified") {
    process.exitCode = data.status === "confirmation_required" ? 0 : 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
