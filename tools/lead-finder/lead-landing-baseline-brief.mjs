#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_OUTPUT = ".tmp/framer-landing-baseline-brief.md";
const DEFAULT_JSON = ".tmp/framer-landing-baseline-brief.json";

function usage() {
  return `
Usage:
  pnpm lead:landing-baseline-brief
  pnpm lead:landing-baseline-brief -- --owned-domain https://example.com
  pnpm lead:landing-baseline-brief -- --target-url https://example.com/ally-auditor-accessibility-checklist/

Options:
  --baseline <file>     Landing baseline JSON. Default: ${DEFAULT_BASELINE}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>  Anchor date. Default: local date.
  --plugin <name>       Select a specific plugin. Default: first ready_to_spec row.
  --owned-domain <url>  Replace https://<owned-domain> with this domain.
  --target-url <url>    Use an exact concrete target URL.
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    baseline: DEFAULT_BASELINE,
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
      "--baseline": "baseline",
      "--output": "output",
      "--json": "json",
      "--today": "today",
      "--plugin": "plugin",
      "--owned-domain": "ownedDomain",
      "--target-url": "targetUrl",
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

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

function normalizeDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function concreteTargetUrl(row, args) {
  if (args.targetUrl) return normalizeTargetUrl(args.targetUrl);
  const proposed = String(row?.proposed_url || "");
  const domain = normalizeDomain(args.ownedDomain);
  if (domain && proposed.includes("<owned-domain>")) {
    return proposed.replace("https://<owned-domain>", domain);
  }
  return proposed;
}

function normalizeTargetUrl(value) {
  try {
    const url = new URL(value);
    return url.href;
  } catch {
    return String(value || "");
  }
}

function targetIsConcrete(value) {
  const text = String(value || "");
  if (!/^https?:\/\//i.test(text)) return false;
  if (text.includes("<") || text.includes(">")) return false;
  try {
    const url = new URL(text);
    return Boolean(url.hostname && url.hostname.includes("."));
  } catch {
    return false;
  }
}

function selectRow(baseline, args) {
  const rows = Array.isArray(baseline?.rows) ? baseline.rows : [];
  if (args.plugin) {
    return rows.find((row) => row.plugin.toLowerCase() === args.plugin.toLowerCase()) || null;
  }
  return rows.find((row) => row.status === "ready_to_spec") || null;
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\"'\"'")}'`;
}

function build({ baseline, args }) {
  const row = selectRow(baseline, args);
  if (!row) {
    return {
      generated_at: new Date().toISOString(),
      today: args.today,
      status: "no_ready_landing_baseline",
      recommendation: baseline?.recommendation || "No ready landing baseline row. Refresh public health and asset kits first.",
      item: null,
      reviews: [],
      record_command: "",
    };
  }

  const targetUrl = concreteTargetUrl(row, args);
  const concreteTarget = targetIsConcrete(targetUrl);
  const blocked = row.status === "blocked";
  const status = blocked
    ? "blocked"
    : concreteTarget
      ? "ready_confirmation_required"
      : "needs_concrete_target_url";
  const reviews = [
    { label: "same-day", date: args.today },
    { label: "24h", date: addDays(args.today, 1) },
    { label: "7d", date: addDays(args.today, 7) },
    { label: "14d", date: addDays(args.today, 14) },
  ];
  const recordCommand =
    concreteTarget && !blocked
      ? [
          "pnpm lead:actions -- --add",
          "--type landing_baseline",
          "--channel owned_site",
          `--campaign ${shellQuote(row.campaign)}`,
          "--status done",
          `--target ${shellQuote(`${row.plugin} landing baseline: ${targetUrl}`)}`,
          "--evidence '<published-url-or-deploy-id>'",
          `--note ${shellQuote(`${row.plugin} landing/tracking baseline created after explicit confirmation; review same-day/24h/7d/14d.`)}`,
        ].join(" ")
      : "";

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    status,
    recommendation: recommendationFor({ row, targetUrl, concreteTarget, blocked }),
    item: {
      ...row,
      target_url: targetUrl,
      target_is_concrete: concreteTarget,
    },
    external_action: {
      action: row.external_action?.action || "Create or deploy a small owned landing/tutorial page and wire tracked CTA links.",
      target: targetUrl,
      risk: row.external_action?.risk || "A thin page without useful tutorial content may add noise instead of qualified installs.",
      expected_benefit: row.external_action?.expected_benefit || "Gives Marketplace traffic a measurable owned-page source and a reusable tutorial/SEO asset.",
      confirmation: row.confirmation,
      verification: row.external_action?.verification || "URL returns 200, tracked CTA includes UTM params, and action log contains deploy evidence.",
    },
    preconditions: preconditionsFor({ row, targetUrl, concreteTarget, blocked }),
    reviews,
    record_command: recordCommand,
    verification_commands: [
      "pnpm lead:marketplace-public -- --record",
      "pnpm lead:public-health",
      "pnpm lead:landing-baseline",
      "pnpm lead:landing-baseline-brief",
      "pnpm lead:portfolio-ops -- --skip-signals",
    ],
  };
}

function recommendationFor({ row, targetUrl, concreteTarget, blocked }) {
  if (blocked) return `${row.plugin} is blocked by public-health/payment/compliance risk. Do not create public traffic yet.`;
  if (!concreteTarget) return `Choose an owned domain or exact target URL before deploying ${row.plugin}; current target is ${targetUrl}.`;
  return `Create ${row.plugin} landing/tracking baseline only after exact confirmation: ${row.confirmation}`;
}

function preconditionsFor({ row, concreteTarget, blocked }) {
  const items = [];
  if (blocked) {
    items.push("Resolve public-health/payment/compliance blocker first.");
  }
  if (!concreteTarget) {
    items.push("Fill tools/lead-finder/landing-targets.local.csv with a real target_url, replace <owned-domain>, or rerun with --target-url.");
  }
  items.push("Keep the primary CTA pointed at the Framer Marketplace listing with UTM params.");
  items.push("Record a Marketplace public snapshot before publishing.");
  items.push("Record action-log evidence after publishing/deploying.");
  items.push(`Use exact confirmation phrase: ${row.confirmation}`);
  return items;
}

function renderMarkdown(report) {
  const lines = [
    "# Landing Baseline Confirmation Brief",
    "",
    `Generated: ${report.generated_at}`,
    `Today: ${report.today}`,
    `Status: ${report.status}`,
    `Recommendation: ${report.recommendation}`,
    "",
  ];

  if (!report.item) {
    lines.push("No ready landing baseline item.", "");
    return `${lines.join("\n")}\n`;
  }

  const item = report.item;
  lines.push(
    "## External Action",
    "",
    `- Action: ${report.external_action.action}`,
    `- Target: ${report.external_action.target}`,
    `- Risk: ${report.external_action.risk}`,
    `- Expected benefit: ${report.external_action.expected_benefit}`,
    `- Confirmation phrase: ${report.external_action.confirmation}`,
    `- Verification: ${report.external_action.verification}`,
    "",
    "## Preconditions",
    "",
  );
  for (const precondition of report.preconditions) lines.push(`- ${precondition}`);

  lines.push(
    "",
    "## Page Spec",
    "",
    `- Plugin: ${item.plugin}`,
    `- Target URL: ${item.target_url}`,
    `- Headline: ${item.headline}`,
    `- Campaign: ${item.campaign}`,
    `- Primary metric: ${item.primary_metric}`,
    `- Tracked Marketplace CTA: ${item.tracked_marketplace_url || "missing"}`,
    "",
    "Sections:",
  );
  for (const section of item.sections || []) lines.push(`- ${section}`);

  lines.push("", "Events:");
  for (const event of item.events || []) lines.push(`- ${event}`);

  lines.push("", "Acceptance criteria:");
  for (const criterion of item.acceptance_criteria || []) lines.push(`- ${criterion}`);

  lines.push(
    "",
    "## Record After Publishing",
    "",
  );

  if (report.record_command) {
    lines.push(
      "```bash",
      report.record_command,
      "```",
    );
  } else {
    lines.push("Record command is withheld until the target URL is concrete and the plugin is not blocked.");
  }

  lines.push(
    "",
    "## Review Schedule",
    "",
    "| Window | Date | Evidence to check |",
    "|---|---|---|",
  );
  for (const review of report.reviews) {
    lines.push(`| ${review.label} | ${review.date} | URL 200, CTA UTM present, Marketplace opens/users/public reactions, CTA/form events |`);
  }

  lines.push(
    "",
    "Verification commands:",
    "",
    "```bash",
    ...report.verification_commands,
    "```",
    "",
    "## Safety",
    "",
    "- This brief does not deploy, publish, submit forms, or modify payment settings.",
    "- Do not publish unless the target URL is concrete and the exact confirmation phrase is provided.",
    "- Blocked plugins must remain blocked until public-health/payment/compliance checks pass.",
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

  const baseline = await readJson(args.baseline, null);
  const report = build({ baseline, args });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Landing baseline confirmation brief: ${args.output}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
