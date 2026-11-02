#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_DIAGNOSIS = ".tmp/framer-netlify-deploy-diagnosis.md";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_OUTPUT = ".tmp/framer-deploy-review.md";
const DEFAULT_JSON = ".tmp/framer-deploy-review.json";

function usage() {
  return `
Usage:
  pnpm lead:deploy-review

Options:
  --diagnosis <file>  Netlify deploy diagnosis markdown. Default: ${DEFAULT_DIAGNOSIS}
  --actions <file>    External action log CSV. Default: ${DEFAULT_ACTIONS}
  --events <file>     CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>      Netlify form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --output <file>     Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>       JSON output. Default: ${DEFAULT_JSON}
  --help              Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    diagnosis: DEFAULT_DIAGNOSIS,
    actions: DEFAULT_ACTIONS,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
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
    if (key === "--diagnosis") {
      args.diagnosis = value;
      index += 1;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--events") {
      args.events = value;
      index += 1;
      continue;
    }
    if (key === "--forms") {
      args.forms = value;
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

async function readJson(file, fallback) {
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
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

function newestAction(rows, predicate) {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => predicate(row))
    .sort((a, b) => String(b.row.date).localeCompare(String(a.row.date)) || b.index - a.index)
    .map(({ row, index }) => ({ ...row, __index: index }))[0] || null;
}

function extractLine(text, label) {
  const match = text.match(new RegExp(`^- ${escapeRegExp(label)}: (.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assess({ diagnosis, actions, eventsData, formsData }) {
  const latestDeployAction = newestAction(actions, (row) => row.type === "web_deploy");
  const latestBlockedDeploy = newestAction(
    actions,
    (row) => row.type === "web_deploy" && row.status === "blocked",
  );
  const latestDoneDeploy = newestAction(
    actions,
    (row) => row.type === "web_deploy" && row.status === "done",
  );
  const latestBlockedDeployIsCurrent = isNewerAction(latestBlockedDeploy, latestDoneDeploy);
  const latestBlockedText = latestBlockedDeployIsCurrent
    ? [
        latestBlockedDeploy?.target,
        latestBlockedDeploy?.evidence,
        latestBlockedDeploy?.note,
      ].filter(Boolean).join("\n")
    : "";
  const hasForbiddenBlock = /(?:JSONHTTPError:\s*)?Forbidden|HTTP 403/i.test(diagnosis) ||
    /(?:JSONHTTPError:\s*)?Forbidden|HTTP 403/i.test(latestBlockedText);
  const hasCreditBlock = /Account credit usage exceeded/i.test(diagnosis) ||
    /credit usage exceeded/i.test(latestBlockedText);
  const siteCheckPass = /lead:site-check`? passes/i.test(diagnosis) ||
    /Result: PASS/i.test(diagnosis);
  const localBuildPass = /Local `npm run build`.*passes/i.test(diagnosis) ||
    /npm run build.*passes/i.test(diagnosis);
  const latestDeployId = extractLine(diagnosis, "Latest published production deploy");
  const latestPublishedAt = extractLine(diagnosis, "Latest production published_at");
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];
  const forms = Array.isArray(formsData.submissions) ? formsData.submissions : [];
  const ignoredTestEvents = Array.isArray(eventsData.ignored_test_events)
    ? eventsData.ignored_test_events.length
    : Number(eventsData.ignored_test_events || eventsData.ignoredTestEvents || 0) || 0;
  const status = statusFor({ diagnosis, siteCheckPass, hasCreditBlock, hasForbiddenBlock, latestDoneDeploy });

  return {
    generated_at: new Date().toISOString(),
    status,
    production_site_check: siteCheckPass ? "pass" : diagnosis ? "unknown" : "missing",
    local_build: localBuildPass ? "pass" : diagnosis ? "unknown" : "missing",
    netlify_new_deploys: deployBlockStatus({ hasCreditBlock, hasForbiddenBlock }),
    deploy_blocker: deployBlocker({ hasCreditBlock, hasForbiddenBlock }),
    latest_production_deploy_id: latestDeployId,
    latest_production_published_at: latestPublishedAt,
    latest_deploy_action: latestDeployAction,
    latest_blocked_deploy: latestBlockedDeployIsCurrent ? latestBlockedDeploy : null,
    latest_done_deploy: latestDoneDeploy,
    real_cta_events: events.length,
    real_form_submissions: forms.length,
    ignored_test_events: ignoredTestEvents,
    recommendation: recommendationFor({
      status,
      hasCreditBlock,
      hasForbiddenBlock,
      siteCheckPass,
      events,
      forms,
    }),
  };
}

function isNewerAction(candidate, baseline) {
  if (!candidate) return false;
  if (!baseline) return true;
  const dateCompare = String(candidate.date || "").localeCompare(String(baseline.date || ""));
  if (dateCompare !== 0) return dateCompare > 0;
  return Number(candidate.__index ?? -1) > Number(baseline.__index ?? -1);
}

function deployBlockStatus({ hasCreditBlock, hasForbiddenBlock }) {
  if (hasCreditBlock && hasForbiddenBlock) return "blocked_forbidden_credit_evidence";
  if (hasCreditBlock) return "blocked_credit_usage_exceeded";
  if (hasForbiddenBlock) return "blocked_forbidden";
  return "not_blocked_in_evidence";
}

function deployBlocker({ hasCreditBlock, hasForbiddenBlock }) {
  if (hasCreditBlock && hasForbiddenBlock) {
    return "Latest CLI deploy returned Forbidden; earlier direct API evidence says account credit usage exceeded.";
  }
  if (hasCreditBlock) return "Netlify account credit usage exceeded.";
  if (hasForbiddenBlock) return "Netlify API returned Forbidden; check team billing, credits, deploy permissions, or project access.";
  return "";
}

function statusFor({ diagnosis, siteCheckPass, hasCreditBlock, hasForbiddenBlock, latestDoneDeploy }) {
  if (!diagnosis) return "missing_deploy_diagnosis";
  if ((hasCreditBlock || hasForbiddenBlock) && siteCheckPass) return "production_ok_new_deploys_blocked";
  if (hasCreditBlock || hasForbiddenBlock) return "new_deploys_blocked_site_status_unknown";
  if (latestDoneDeploy) return "deploy_logged_monitor_signals";
  if (siteCheckPass) return "production_ok";
  return "review_needed";
}

function recommendationFor({ status, hasCreditBlock, hasForbiddenBlock, siteCheckPass, events, forms }) {
  if (hasCreditBlock && hasForbiddenBlock && siteCheckPass) {
    return "Production site is usable, but Netlify new deploys are blocked: the latest CLI attempt returns Forbidden, and earlier direct API evidence identified account credit usage exceeded. Check Netlify team billing/credits and deploy permissions before retrying; focus on Marketplace/Community/directory actions meanwhile.";
  }
  if (hasForbiddenBlock && siteCheckPass) {
    return "Production site is usable, but Netlify new deploys are blocked by a Forbidden response. Check Netlify team billing, credits, deploy permissions, and project access before retrying; focus on Marketplace/Community/directory actions meanwhile.";
  }
  if (hasCreditBlock && siteCheckPass) {
    return "Production site is usable, but Netlify new deploys are blocked by account credits. Add credits before retrying deploys; focus on Marketplace/Community/directory actions meanwhile.";
  }
  if (hasForbiddenBlock) {
    return "Netlify new deploys are blocked by a Forbidden response. Check team billing, credits, deploy permissions, and project access, then rerun build, deploy, and site check.";
  }
  if (hasCreditBlock) {
    return "Netlify new deploys are blocked by account credits. Add credits, then rerun build, deploy, and site check.";
  }
  if (!siteCheckPass) {
    return "Production site health is not proven. Run `pnpm lead:site-check` before sending more traffic.";
  }
  if (events.length || forms.length) {
    return "Production site is receiving real intent. Apply intake and fulfill requests before posting more.";
  }
  if (status === "production_ok") {
    return "Production site is ready for traffic. Use the public preflight order and monitor forms/events after each action.";
  }
  return "Refresh deploy diagnosis and site checks before deciding the next public push.";
}

function renderMarkdown(review) {
  const latestAction = review.latest_deploy_action;
  const lines = [
    "# Framer Deploy Review",
    "",
    `Generated: ${review.generated_at}`,
    `Status: ${review.status}`,
    `Production site check: ${review.production_site_check}`,
    `Local build: ${review.local_build}`,
    `Netlify new deploys: ${review.netlify_new_deploys}`,
    review.deploy_blocker ? `Deploy blocker: ${review.deploy_blocker}` : "",
    `Latest production deploy: ${review.latest_production_deploy_id || "unknown"}`,
    `Latest production published_at: ${review.latest_production_published_at || "unknown"}`,
    `Real CTA events: ${review.real_cta_events}`,
    `Real form submissions: ${review.real_form_submissions}`,
    `Ignored test events: ${review.ignored_test_events}`,
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
  ];

  if (latestAction) {
    lines.push(
      "## Latest Deploy Action",
      "",
      `- Date: ${latestAction.date}`,
      `- Status: ${latestAction.status}`,
      `- Target: ${latestAction.target}`,
      `- Evidence: ${latestAction.evidence}`,
      latestAction.note ? `- Note: ${latestAction.note}` : "",
      "",
    );
  }

  lines.push(
    "## Commands",
    "",
    "```bash",
    "pnpm lead:site-check",
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:deploy-review",
    "pnpm lead:ops",
    "# after Netlify credits are restored:",
    "pnpm web:deploy:netlify-api",
    "```",
    "",
  );

  return `${lines.filter((line) => line !== undefined).join("\n")}\n`;
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

  const [diagnosis, actions, eventsData, formsData] = await Promise.all([
    readText(args.diagnosis),
    readRows(args.actions),
    readJson(args.events, { events: [] }),
    readJson(args.forms, { submissions: [] }),
  ]);
  const review = assess({ diagnosis, actions, eventsData, formsData });

  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Deploy review: ${review.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
