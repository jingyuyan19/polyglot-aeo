#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_ZIP = "plugin.zip";
const DEFAULT_MARKETPLACE_REVIEW = ".tmp/framer-marketplace-review.json";
const DEFAULT_MARKETPLACE_BRIEF = ".tmp/framer-marketplace-update.md";
const DEFAULT_CREEM_REVIEW = ".tmp/framer-creem-compliance-review.json";
const DEFAULT_CHECKOUT_ORIGIN = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_OUTPUT = ".tmp/framer-marketplace-preflight.md";
const DEFAULT_JSON = ".tmp/framer-marketplace-preflight.json";
const MARKETPLACE_URL = "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";
const UPLOAD_EVIDENCE_PLACEHOLDER = "<framer-upload-confirmation-url-or-screenshot>";
const CREATOR_SPACE_EVIDENCE_PLACEHOLDER = "<creator-space-dashboard-snapshot-or-upload-confirmation>";

function usage() {
  return `
Usage:
  pnpm lead:marketplace-preflight

Options:
  --zip <file>                 Plugin zip to upload. Default: ${DEFAULT_ZIP}
  --marketplace-review <file>  Marketplace review JSON. Default: ${DEFAULT_MARKETPLACE_REVIEW}
  --marketplace-brief <file>   Marketplace brief markdown. Default: ${DEFAULT_MARKETPLACE_BRIEF}
  --creem-review <file>        Creem compliance review JSON. Default: ${DEFAULT_CREEM_REVIEW}
  --checkout-origin <file>     Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT_ORIGIN}
  --output <file>              Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                JSON output. Default: ${DEFAULT_JSON}
  --help                       Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    zip: DEFAULT_ZIP,
    marketplaceReview: DEFAULT_MARKETPLACE_REVIEW,
    marketplaceBrief: DEFAULT_MARKETPLACE_BRIEF,
    creemReview: DEFAULT_CREEM_REVIEW,
    checkoutOrigin: DEFAULT_CHECKOUT_ORIGIN,
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
    if (key === "--zip") {
      args.zip = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-review") {
      args.marketplaceReview = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-brief") {
      args.marketplaceBrief = value;
      index += 1;
      continue;
    }
    if (key === "--creem-review") {
      args.creemReview = value;
      index += 1;
      continue;
    }
    if (key === "--checkout-origin") {
      args.checkoutOrigin = value;
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

async function runStep(name, command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 30 * 1024 * 1024,
    });
    return {
      name,
      ok: true,
      command: [command, ...args].join(" "),
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      command: [command, ...args].join(" "),
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
      error: error?.message || String(error),
    };
  }
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function readJson(file, fallback) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

async function zipInfo(file) {
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  return {
    file,
    absolute: path.resolve(file),
    size: info.size,
    modified: info.mtime.toISOString(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function briefHasHash(brief, zip) {
  return Boolean(brief && zip?.sha256 && brief.includes(zip.sha256));
}

function assess({ steps, marketplaceReview, marketplaceBrief, creemReview, checkoutOrigin, zip }) {
  const blockers = [];
  const failedSteps = steps.filter((step) => !step.ok);
  for (const step of failedSteps) {
    if (step.name === "Checkout origin readiness") continue;
    blockers.push(`${step.name} failed`);
  }

  const allowedMarketplaceStatuses = new Set(["upload_not_logged", "preflight_blocked"]);
  if (!marketplaceReview) {
    blockers.push("Marketplace review JSON is missing.");
  } else if (!allowedMarketplaceStatuses.has(marketplaceReview.status)) {
    blockers.push(`Marketplace review status is ${marketplaceReview.status}, not upload_not_logged/preflight_blocked.`);
  }

  if (!briefHasHash(marketplaceBrief, zip)) {
    blockers.push("Marketplace brief does not include the current plugin.zip SHA256.");
  }

  if (!creemReview) {
    blockers.push("Creem compliance review JSON is missing.");
  } else if (creemReview.status !== "clear") {
    const count = Array.isArray(creemReview.open_warnings) ? creemReview.open_warnings.length : 0;
    blockers.push(`Creem compliance is ${creemReview.status} (${count} open warning(s)).`);
  }

  if (!checkoutOrigin) {
    blockers.push("Checkout origin readiness JSON is missing.");
  } else if (checkoutOrigin.status !== "ready") {
    const checkoutBlockers = Array.isArray(checkoutOrigin.blockers) ? checkoutOrigin.blockers : [];
    const count = checkoutBlockers.length;
    blockers.push(`Checkout origin readiness is ${checkoutOrigin.status} (${count} blocker(s)).`);
    for (const blocker of checkoutBlockers) {
      const label = blocker?.label || blocker?.id || "unknown";
      const detail = blocker?.detail ? `: ${blocker.detail}` : "";
      blockers.push(`Checkout origin blocker: ${label}${detail}`);
    }
  }

  const verdict = blockers.length ? "blocked" : "ready_to_upload";
  return {
    verdict,
    upload_allowed: verdict === "ready_to_upload",
    blockers,
    recommendation: verdict === "ready_to_upload"
      ? "Ready to upload the current plugin.zip to Framer Marketplace after explicit user confirmation."
      : "Do not upload. Fix the blockers, regenerate the preflight, then request confirmation again.",
  };
}

async function build(args) {
  const zip = await zipInfo(args.zip);
  const node = process.execPath;
  const steps = [];

  steps.push(await runStep("Plugin package check", node, [
    "tools/release/check-plugin-package.mjs",
    "--zip",
    args.zip,
  ]));
  steps.push(await runStep("Creem compliance review", node, [
    "tools/lead-finder/lead-creem-compliance-review.mjs",
    "--json",
    args.creemReview,
  ]));
  steps.push(await runStep("Checkout origin readiness", node, [
    "tools/lead-finder/lead-checkout-origin-readiness.mjs",
    "--json",
    args.checkoutOrigin,
    "--strict",
  ]));
  steps.push(await runStep("Production site check", node, [
    "tools/lead-finder/lead-site-check.mjs",
  ]));
  steps.push(await runStep("Marketplace review", node, [
    "tools/lead-finder/lead-marketplace-review.mjs",
    "--zip",
    args.zip,
    "--json",
    args.marketplaceReview,
  ]));
  steps.push(await runStep("Marketplace brief", node, [
    "tools/release/framer-marketplace-update.mjs",
    "--zip",
    args.zip,
    "--output",
    args.marketplaceBrief,
  ]));

  const [marketplaceReview, marketplaceBrief, creemReview, checkoutOrigin] = await Promise.all([
    readJson(args.marketplaceReview, null),
    readText(args.marketplaceBrief),
    readJson(args.creemReview, null),
    readJson(args.checkoutOrigin, null),
  ]);
  const assessment = assess({ steps, marketplaceReview, marketplaceBrief, creemReview, checkoutOrigin, zip });

  return {
    generated_at: new Date().toISOString(),
    marketplace_url: MARKETPLACE_URL,
    zip,
    marketplace_review_path: args.marketplaceReview,
    marketplace_brief_path: args.marketplaceBrief,
    creem_review_path: args.creemReview,
    checkout_origin_path: args.checkoutOrigin,
    marketplace_status: marketplaceReview?.status || "missing",
    creem_status: creemReview?.status || "missing",
    checkout_origin_status: checkoutOrigin?.status || "missing",
    checkout_origin_blockers: Array.isArray(checkoutOrigin?.blockers) ? checkoutOrigin.blockers.length : 0,
    open_compliance_warnings: Array.isArray(creemReview?.open_warnings) ? creemReview.open_warnings.length : 0,
    steps,
    ...assessment,
    confirmation_phrase:
      "确认上传 Polyglot AEO managed-AI plugin.zip 到 Framer Marketplace",
    upload_command_after_submit: `pnpm lead:marketplace-record -- --plugin-zip '${zip.absolute}' --evidence '${UPLOAD_EVIDENCE_PLACEHOLDER}' --note 'uploaded from Framer Marketplace New Version flow'`,
    snapshot_command_after_submit: `pnpm lead:marketplace-record -- --plugin-zip '${zip.absolute}' --evidence '${CREATOR_SPACE_EVIDENCE_PLACEHOLDER}' --users <users> --opens <opens> --version <version> --updated "<updated>"`,
  };
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Marketplace Upload Preflight",
    "",
    `Generated: ${data.generated_at}`,
    `Verdict: ${data.verdict}`,
    `Upload allowed: ${data.upload_allowed ? "yes" : "no"}`,
    `Marketplace status: ${data.marketplace_status}`,
    `Creem compliance: ${data.creem_status} (${data.open_compliance_warnings} open warning(s))`,
    `Checkout origin: ${data.checkout_origin_status} (${data.checkout_origin_blockers} blocker(s))`,
    "",
    "## Package",
    "",
    `- Zip: ${data.zip.absolute}`,
    `- Modified: ${data.zip.modified}`,
    `- Size: ${data.zip.size} bytes`,
    `- SHA256: ${data.zip.sha256}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
  ];

  if (data.blockers.length) {
    lines.push("## Blockers", "");
    for (const blocker of data.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }

  lines.push("## Checks", "");
  lines.push("| Check | Result |");
  lines.push("|---|---|");
  for (const step of data.steps) {
    lines.push(`| ${step.name} | ${step.ok ? "pass" : "fail"} |`);
  }
  lines.push("");

  lines.push(
    "## Upload",
    "",
    `- Marketplace URL: ${data.marketplace_url}`,
    `- Confirmation phrase: ${data.confirmation_phrase}`,
    `- Marketplace brief: ${data.marketplace_brief_path}`,
    "",
  );

  if (data.upload_allowed) {
    lines.push(
      "After submit:",
      "",
      "```bash",
      data.upload_command_after_submit,
      data.snapshot_command_after_submit,
      "pnpm lead:marketplace-public -- --record",
      "pnpm lead:marketplace-review",
      "pnpm lead:forms && pnpm lead:events",
      "pnpm lead:tracking-freshness",
      "pnpm lead:netlify-recovery",
      "pnpm lead:marketplace-postflight",
      "pnpm lead:community-preflight",
      "pnpm lead:action-review && pnpm lead:channel-priority",
      "pnpm lead:ops && pnpm lead:report",
      "```",
      "",
    );
  } else {
    lines.push("After-submit commands are hidden until `Upload allowed` is `yes`.", "");
  }

  lines.push(
    "## Guardrails",
    "",
    "- Do not upload unless `Upload allowed` is `yes`.",
    "- Do not upload without the explicit confirmation phrase.",
    "- Replace the upload evidence placeholder with a Framer confirmation URL, screenshot path, or admin note before recording the upload.",
    "- Record both the upload action and a Creator Space snapshot immediately after submit.",
    "- Refresh the public listing snapshot and run Marketplace postflight before any Community post.",
    "- If production tracking is still stale, keep Community posts and directory submissions paused until `pnpm lead:tracking-freshness -- --strict` passes.",
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

  const data = await build(args);
  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Marketplace preflight: ${data.verdict}\n`);
  process.stdout.write(`Upload allowed: ${data.upload_allowed ? "yes" : "no"}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
