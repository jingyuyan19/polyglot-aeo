#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CREEM = ".tmp/framer-creem-compliance-review.json";
const DEFAULT_CHECKOUT = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_CLOUDFLARE = ".tmp/framer-cloudflare-recovery.json";
const DEFAULT_NETLIFY = ".tmp/framer-netlify-recovery.json";
const DEFAULT_DEPLOY = ".tmp/framer-deploy-review.json";
const DEFAULT_MARKETPLACE = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_OUTPUT = ".tmp/framer-payment-compliance-recovery.md";
const DEFAULT_JSON = ".tmp/framer-payment-compliance-recovery.json";

function usage() {
  return `
Usage:
  pnpm lead:payment-compliance-recovery

Options:
  --creem <file>        Creem compliance JSON. Default: ${DEFAULT_CREEM}
  --checkout <file>     Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT}
  --cloudflare <file>   Cloudflare recovery JSON. Default: ${DEFAULT_CLOUDFLARE}
  --netlify <file>      Netlify recovery JSON. Default: ${DEFAULT_NETLIFY}
  --deploy <file>       Deploy review JSON. Default: ${DEFAULT_DEPLOY}
  --marketplace <file>  Marketplace preflight JSON. Default: ${DEFAULT_MARKETPLACE}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    creem: DEFAULT_CREEM,
    checkout: DEFAULT_CHECKOUT,
    cloudflare: DEFAULT_CLOUDFLARE,
    netlify: DEFAULT_NETLIFY,
    deploy: DEFAULT_DEPLOY,
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
    if (key === "--creem") {
      args.creem = value;
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
    if (key === "--netlify") {
      args.netlify = value;
      index += 1;
      continue;
    }
    if (key === "--deploy") {
      args.deploy = value;
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

async function readJson(file, fallback = null) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

function requirement(checkout, id) {
  return Array.isArray(checkout?.requirements)
    ? checkout.requirements.find((item) => item.id === id) || null
    : null;
}

function requirementPass(checkout, id) {
  return requirement(checkout, id)?.pass === true;
}

function phase(id, label, status, evidence, nextAction) {
  return { id, label, status, evidence, next_action: nextAction };
}

function phaseStatus(pass, blockedByExternal = false) {
  if (pass) return "ready";
  return blockedByExternal ? "blocked_external" : "needs_action";
}

function build({ creem, checkout, cloudflare, netlify, deploy, marketplace }) {
  const targetOrigin = checkout?.target_origin || "https://license.polyglotaeo.com";
  const site = checkout?.site || "https://polyglotaeo.com";
  const checkoutBlockers = Array.isArray(checkout?.blockers) ? checkout.blockers : [];
  const preflightBlockers = Array.isArray(marketplace?.blockers) ? marketplace.blockers : [];
  const openWarnings = Array.isArray(creem?.open_warnings) ? creem.open_warnings : [];
  const netlifyBlockers = netlify?.blockers || {};
  const deployBlocked = /blocked/i.test(deploy?.netlify_new_deploys || deploy?.status || "") ||
    Boolean(netlifyBlockers.account_credit_usage_exceeded || netlifyBlockers.forbidden_or_permission);

  const cloudflareReady =
    requirementPass(checkout, "target_dns_public") &&
    requirementPass(checkout, "target_health") &&
    (!cloudflare || cloudflare.status === "ready");
  const siteCheckoutReady =
    requirementPass(checkout, "production_pricing_origin") &&
    requirementPass(checkout, "production_bridge_origin");
  const creemReady = creem?.status === "clear" && openWarnings.length === 0;
  const marketplaceReady = marketplace?.upload_allowed === true;

  const phases = [
    phase(
      "cloudflare_custom_domain",
      "Cloudflare Worker custom domain",
      phaseStatus(cloudflareReady, true),
      [
        cloudflare?.recommendation,
        cloudflare?.deployments?.latest?.created_on ? `Latest Cloudflare deployment: ${cloudflare.deployments.latest.created_on}` : "",
        detailFor(checkout, "target_dns_public"),
        detailFor(checkout, "target_health"),
      ].filter(Boolean).join("; ") || "No checkout-origin DNS/health evidence yet.",
      cloudflare?.recommendation || `Fix ${targetOrigin} DNS/custom-domain routing until /health passes on the custom domain.`,
    ),
    phase(
      "netlify_site_deploy",
      "Production site checkout origin deploy",
      phaseStatus(siteCheckoutReady, deployBlocked),
      [
        detailFor(checkout, "production_pricing_origin"),
        detailFor(checkout, "production_bridge_origin"),
        deploy?.deploy_blocker,
        netlify?.recommendation,
      ].filter(Boolean).join("; "),
      `Restore Netlify deploy access, deploy the current local build to ${site}, then rerun checkout-origin and tracking freshness checks.`,
    ),
    phase(
      "creem_resolution",
      "Creem compliance closure",
      phaseStatus(creemReady, true),
      openWarnings.length
        ? `${openWarnings.length} open warning(s): ${openWarnings.map((item) => item.target || item.campaign).join("; ")}`
        : "No open Polyglot Creem warnings in the action log.",
      creemReady
        ? "No Polyglot Creem compliance action needed."
        : "Get Creem dashboard/support confirmation, then record a resolved compliance action.",
    ),
    phase(
      "marketplace_preflight",
      "Marketplace upload preflight",
      phaseStatus(marketplaceReady, false),
      preflightBlockers.length
        ? `${preflightBlockers.length} blocker(s): ${preflightBlockers.slice(0, 4).join("; ")}`
        : `Upload allowed: ${marketplace?.upload_allowed ? "yes" : "no"}`,
      "Rerun Marketplace preflight after Cloudflare, Netlify, and Creem are clear; upload only after explicit confirmation.",
    ),
  ];

  const blockers = [
    ...checkoutBlockers.map((item) => `Checkout origin: ${item.label || item.id}: ${item.detail || ""}`),
    ...preflightBlockers.map((item) => `Marketplace preflight: ${item}`),
  ];
  if (!creemReady && openWarnings.length) {
    blockers.push(`Creem: ${openWarnings.length} open compliance warning(s).`);
  }
  if (deployBlocked) {
    blockers.push(`Netlify: ${deploy?.deploy_blocker || netlify?.recommendation || "deploy access is blocked"}`);
  }

  const ready = phases.every((item) => item.status === "ready");
  return {
    generated_at: new Date().toISOString(),
    status: ready ? "ready_for_marketplace_confirmation" : "blocked",
    promotion_allowed: ready,
    marketplace_upload_allowed: marketplaceReady,
    target_origin: targetOrigin,
    site,
    phases,
    blockers: [...new Set(blockers.filter(Boolean))],
    confirmation_gated_commands: confirmationCommands({ targetOrigin, openWarnings }),
    read_only_commands: [
      "pnpm lead:creem-compliance",
      "pnpm lead:cloudflare-recovery",
      "pnpm lead:checkout-origin",
      "pnpm lead:netlify-recovery",
      "pnpm lead:deploy-review",
      "pnpm lead:marketplace-preflight",
      "pnpm lead:payment-compliance-recovery",
      "pnpm lead:ops && pnpm lead:report",
    ],
    recommendation: recommendationFor(phases),
  };
}

function detailFor(checkout, id) {
  const item = requirement(checkout, id);
  if (!item) return "";
  return `${item.label}: ${item.pass ? "pass" : "fail"} (${item.detail || "no detail"})`;
}

function recommendationFor(phases) {
  const firstBlocked = phases.find((item) => item.status !== "ready");
  if (!firstBlocked) {
    return "Payment compliance recovery is clear. Rerun Marketplace preflight, then proceed only with the explicit Marketplace upload confirmation phrase.";
  }
  return `Resolve first: ${firstBlocked.label}. ${firstBlocked.next_action}`;
}

function confirmationCommands({ targetOrigin, openWarnings }) {
  const commands = [
    {
      label: "Cloudflare Worker/custom-domain deploy",
      confirmation: "确认部署 Cloudflare Worker custom domain",
      commands: [
        "pnpm lead:cloudflare-apply -- --dry-run",
        "pnpm lead:cloudflare-apply -- --confirm '确认部署 Cloudflare Worker custom domain'",
        `curl -I ${targetOrigin}/health`,
      ],
    },
    {
      label: "Netlify production deploy",
      confirmation: "确认部署 polyglotaeo-web 到 Netlify",
      commands: [
        "pnpm lead:netlify-apply -- --dry-run",
        "pnpm lead:netlify-apply -- --confirm '确认部署 polyglotaeo-web 到 Netlify'",
        "pnpm lead:site-check && pnpm lead:tracking-freshness -- --strict",
      ],
    },
  ];

  if (openWarnings.length) {
    commands.push(
    {
      label: "Record Creem compliance closure",
      confirmation: "Creem dashboard/support confirmation evidence is available",
      commands: [
        "pnpm lead:actions -- --add --type compliance_warning --channel creem --campaign unregistered_checkout_traffic --status resolved --target 'CREEM Compliance Review - Unregistered Traffic Detected' --evidence '<provider-dashboard-or-support-confirmation>' --note 'Creem compliance warning resolved'",
      ],
    },
    );
  }

  commands.push(
    {
      label: "Framer Marketplace upload",
      confirmation: "确认上传 plugin.zip 到 Framer Marketplace",
      commands: [
        "pnpm lead:marketplace-preflight",
        "pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '<framer-upload-confirmation-url-or-screenshot>' --note 'uploaded from Framer Marketplace New Version flow'",
      ],
    },
  );

  return commands;
}

function renderMarkdown(data) {
  const lines = [
    "# Payment Compliance Recovery",
    "",
    `Generated: ${data.generated_at}`,
    `Status: ${data.status}`,
    `Promotion allowed: ${data.promotion_allowed ? "yes" : "no"}`,
    `Marketplace upload allowed: ${data.marketplace_upload_allowed ? "yes" : "no"}`,
    `Target origin: ${data.target_origin}`,
    `Site: ${data.site}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Recovery Phases",
    "",
    "| Phase | Status | Evidence | Next action |",
    "|---|---|---|---|",
  ];

  for (const item of data.phases) {
    lines.push(`| ${item.label} | ${item.status} | ${pipe(item.evidence)} | ${pipe(item.next_action)} |`);
  }

  if (data.blockers.length) {
    lines.push("", "## Blocking Evidence", "");
    for (const blocker of data.blockers) lines.push(`- ${blocker}`);
  }

  lines.push("", "## Read-Only Commands", "", "```bash", ...data.read_only_commands, "```", "");

  lines.push("## Confirmation-Gated Commands", "");
  for (const group of data.confirmation_gated_commands) {
    lines.push(`### ${group.label}`, "", `Confirmation required: \`${group.confirmation}\``, "", "```bash");
    lines.push(...group.commands);
    lines.push("```", "");
  }

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

  const [creem, checkout, cloudflare, netlify, deploy, marketplace] = await Promise.all([
    readJson(args.creem),
    readJson(args.checkout),
    readJson(args.cloudflare),
    readJson(args.netlify),
    readJson(args.deploy),
    readJson(args.marketplace),
  ]);
  const data = build({ creem, checkout, cloudflare, netlify, deploy, marketplace });
  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Payment compliance recovery: ${data.status}\n`);
  process.stdout.write(`Promotion allowed: ${data.promotion_allowed ? "yes" : "no"}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
