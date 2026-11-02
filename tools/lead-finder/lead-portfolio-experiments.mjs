#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_DASHBOARD = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_EXPERIMENTS = "tools/lead-finder/portfolio-experiments.local.csv";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-portfolio-experiments.md";
const DEFAULT_JSON = ".tmp/framer-portfolio-experiments.json";

const INITIAL_EXPERIMENTS = [
  {
    id: "loka_compliance_origin_recovery",
    plugin: "Loka - Localization Hub",
    channel: "payment_compliance",
    status: "active_waiting",
    hypothesis: "If the exact unregistered checkout origin is identified and routed through an approved Loka store/site, Loka revenue can continue without store off-boarding risk.",
    primary_metric: "Creem warning closed before deadline and Loka checkout traffic remains approved.",
    external_action: "Ask Creem human support for the exact origin/referrer; then register that source or remove direct checkout traffic.",
    confirmation: "确认继续跟进 Loka Pro Creem human support",
    evidence_required: "Creem human reply or dashboard evidence naming the origin/referrer; follow-up action recorded in action log.",
    next_local_step: "Search Loka code/site/listings for direct Creem payment links and document each checkout surface.",
    review_windows: "same_day,24h,48h,72h",
    notes: "Support request already sent in Gmail thread 19f1aca947cfe24d; current reply is automated only.",
  },
  {
    id: "ally_paid_customer_feedback",
    plugin: "Ally Auditor",
    channel: "existing_customer",
    status: "planned_confirmation_required",
    hypothesis: "If the recent Ally Auditor buyer replies with the purchase trigger or missing workflow, the Marketplace page can be refreshed around real buyer language.",
    primary_metric: "One useful customer reply, testimonial, feature request, or support issue from a recent paid customer.",
    external_action: "Send one concise feedback/support email to the paid customer.",
    confirmation: "确认发送 Ally Auditor 客户反馈邮件",
    evidence_required: "Gmail sent id, reply thread, or explicit no-reply review after 7d.",
    next_local_step: "Prepare a review-ready Gmail draft grounded in the sale evidence; do not send without confirmation.",
    review_windows: "24h,48h,7d",
    notes: "Sale evidence: Creem email 19f1983597bdc24b, $4.99 Ally Auditor Pro.",
  },
  {
    id: "polyglot_checkout_unblock",
    plugin: "Polyglot AEO",
    channel: "marketplace_release_gate",
    status: "blocked_confirmation_required",
    hypothesis: "If license.polyglotaeo.com and production checkout/tracking are repaired, Polyglot can safely run the Marketplace upload and first Community experiment.",
    primary_metric: "Marketplace preflight upload_allowed=yes, checkout-origin ready, tracking fresh, and Creator Space post-upload snapshot recorded.",
    external_action: "Deploy Cloudflare custom domain and later Netlify only through existing confirmation-gated wrappers.",
    confirmation: "确认部署 Cloudflare Worker custom domain",
    evidence_required: "Cloudflare health 2xx/3xx, checkout-origin ready, Marketplace preflight ready, upload evidence after separate confirmation.",
    next_local_step: "Refresh Cloudflare dry-run and blocker brief before asking for action-time confirmation.",
    review_windows: "same_day,24h,48h,7d",
    notes: "Creem warning is clear for Polyglot; first blocker is Cloudflare Worker custom domain.",
  },
  {
    id: "gaode_china_location_tutorial",
    plugin: "Gaode Maps",
    channel: "seo_content",
    status: "planned_low_risk",
    hypothesis: "If Gaode gets a China-location Framer tutorial page, its existing free-user base can become searchable organic demand and later a paid map-kit audience.",
    primary_metric: "Marketplace opens/users lift, tutorial page visits, or one support/customer reply about China location pages.",
    external_action: "Publish a lightweight tutorial/use-case page only after local copy and tracking are ready.",
    confirmation: "确认发布 Gaode Maps tutorial/use-case page",
    evidence_required: "Tracked URL, action log row, and 7d review of Marketplace/users/opens plus CTA/form evidence.",
    next_local_step: "Draft the tutorial outline and tracking plan locally.",
    review_windows: "7d,14d",
    notes: "Gaode has the largest Creator Space baseline: 117 users, 128 opens.",
  },
];

function usage() {
  return `
Usage:
  pnpm lead:portfolio-experiments

Options:
  --dashboard <file>   Portfolio dashboard JSON. Default: ${DEFAULT_DASHBOARD}
  --experiments <file> Experiment CSV. Default: ${DEFAULT_EXPERIMENTS}
  --actions <file>     Action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>      Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>        JSON output. Default: ${DEFAULT_JSON}
  --seed               Create missing initial portfolio experiment rows.
  --record-review <id> Append dated review evidence to one experiment row.
  --review-status <status> Optional status update when recording a review.
  --evidence <text>    Evidence text for --record-review.
  --notes <text>       Extra note text for --record-review.
  --today <YYYY-MM-DD> Report date. Default: local date.
  --help               Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    dashboard: DEFAULT_DASHBOARD,
    experiments: DEFAULT_EXPERIMENTS,
    actions: DEFAULT_ACTIONS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    seed: false,
    recordReview: "",
    reviewStatus: "",
    evidence: "",
    notes: "",
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
    if (key === "--seed") {
      args.seed = true;
      continue;
    }
    if (key === "--record-review") {
      args.recordReview = value;
      index += 1;
      continue;
    }
    if (key === "--review-status") {
      args.reviewStatus = value;
      index += 1;
      continue;
    }
    const map = {
      "--dashboard": "dashboard",
      "--experiments": "experiments",
      "--actions": "actions",
      "--output": "output",
      "--json": "json",
      "--evidence": "evidence",
      "--notes": "notes",
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

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function renderCsv(rows) {
  const headers = [
    "date",
    "id",
    "plugin",
    "channel",
    "status",
    "hypothesis",
    "primary_metric",
    "external_action",
    "confirmation",
    "evidence_required",
    "next_local_step",
    "review_windows",
    "evidence",
    "notes",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] || "")).join(",")),
  ].join("\n") + "\n";
}

async function seedExperiments(file, rows, today) {
  const existingIds = new Set(rows.map((row) => row.id));
  const additions = INITIAL_EXPERIMENTS
    .filter((row) => !existingIds.has(row.id))
    .map((row) => ({
      date: today,
      evidence: "",
      ...row,
    }));
  if (!additions.length) return rows;
  const nextRows = [...rows, ...additions];
  await writeText(file, renderCsv(nextRows));
  return nextRows;
}

async function recordReview(file, rows, args) {
  if (!args.recordReview) return rows;
  const index = rows.findIndex((row) => row.id === args.recordReview);
  if (index === -1) {
    throw new Error(`Unknown experiment id for --record-review: ${args.recordReview}`);
  }
  if (!args.evidence && !args.notes && !args.reviewStatus) {
    throw new Error("--record-review needs --evidence, --notes, or --review-status.");
  }

  const row = { ...rows[index] };
  const prefix = `[${args.today} review]`;
  const reviewParts = [
    args.evidence ? `evidence=${args.evidence}` : "",
    args.reviewStatus ? `status=${args.reviewStatus}` : "",
  ].filter(Boolean);
  const noteParts = [
    args.notes ? `${prefix} ${args.notes}` : "",
  ].filter(Boolean);

  if (reviewParts.length) {
    row.evidence = [row.evidence, `${prefix} ${reviewParts.join("; ")}`]
      .filter(Boolean)
      .join(" | ");
  }
  if (noteParts.length) {
    row.notes = [row.notes, ...noteParts]
      .filter(Boolean)
      .join(" | ");
  }
  if (args.reviewStatus) row.status = args.reviewStatus;

  const nextRows = [...rows];
  nextRows[index] = row;
  await writeText(file, renderCsv(nextRows));
  return nextRows;
}

function addDays(date, days) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

function reviewDates(row) {
  const map = {
    same_day: 0,
    "24h": 1,
    "48h": 2,
    "72h": 3,
    "7d": 7,
    "14d": 14,
  };
  return String(row.review_windows || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((label) => ({
      label,
      date: addDays(row.date, map[label] ?? 0),
    }));
}

function profileFor(dashboard, plugin) {
  return (dashboard?.profiles || []).find((profile) => profile.name === plugin) || null;
}

function actionEvidence(actions, experiment) {
  const haystack = `${experiment.id}\n${experiment.plugin}\n${experiment.channel}`.toLowerCase();
  return actions.filter((row) => {
    const text = `${row.campaign || ""}\n${row.target || ""}\n${row.note || ""}`.toLowerCase();
    if (experiment.id === "loka_compliance_origin_recovery") return text.includes("loka");
    if (experiment.id === "ally_paid_customer_feedback") return text.includes("ally");
    if (experiment.id === "polyglot_checkout_unblock") return text.includes("polyglot") || text.includes("cloudflare");
    if (experiment.id === "gaode_china_location_tutorial") return text.includes("gaode");
    return haystack.split(/\s+/).some((term) => term && text.includes(term));
  });
}

function assessExperiment(row, dashboard, actions) {
  const profile = profileFor(dashboard, row.plugin);
  const matchingActions = actionEvidence(actions, row);
  const dates = reviewDates(row);
  const nextReview = dates.find((item) => item.date >= todayLocal()) || dates[dates.length - 1] || null;
  const externalBlocked = /confirmation_required|blocked|active_waiting/i.test(row.status);
  const readyLocal = !/done|stopped/i.test(row.status);
  return {
    ...row,
    profile_priority: profile?.priority?.label || "",
    profile_signal: profile?.signals?.[0] || "",
    profile_blocker: profile?.blockers?.[0] || "",
    action_evidence_count: matchingActions.length,
    latest_action: matchingActions.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null,
    review_dates: dates,
    next_review: nextReview,
    review_recorded: reviewRecorded(row, nextReview),
    local_work_allowed: readyLocal,
    external_action_allowed: false,
    external_blocked_reason: externalBlocked
      ? `Requires explicit confirmation phrase: ${row.confirmation || "confirmation required"}`
      : "External action must still be confirmed at action time.",
    action_pack: actionPackFor(row),
  };
}

function actionPackFor(row) {
  const packs = {
    loka_compliance_origin_recovery: {
      target: "Creem support / Loka Pro store",
      risk: "Too many repeated support messages can create noise; changing Creem/payment settings without the origin can fail to close the warning.",
      expected_benefit: "Protect Loka Pro revenue and prevent store off-boarding by fixing the exact unregistered checkout source.",
      verification: "Human Creem reply names the origin/referrer, or dashboard shows the Loka Pro store/source is approved; action log records the fix.",
      draft: `Subject: Re: CREEM Compliance Review - Unregistered Traffic Detected

Hi Creem Support,

Following up on the Loka Pro unregistered checkout traffic warning.

Could a human support teammate please confirm the exact website/origin/referrer that triggered the warning for the Loka Pro store? I want to either register that source properly or remove the unintended checkout traffic.

Store: Loka Pro
Registered website: https://getloka.dev
Known recent customer details: available privately on request

Thanks,
Jimmy`,
    },
    ally_paid_customer_feedback: {
      target: "Paid Ally Auditor customer (private CRM)",
      risk: "Customer feedback email can feel intrusive if too long or salesy; keep it short, support-oriented, and one-off.",
      expected_benefit: "Learn why a real buyer paid for Ally Auditor and convert that language into Marketplace copy, screenshots, FAQ, or testimonial.",
      verification: "Gmail sent id after confirmation, then reply/no-reply review at 24h/48h/7d; any useful reply recorded in action log and plugin growth file.",
      draft: `Subject: Quick question about Ally Auditor Pro

Hi there,

Thanks for trying Ally Auditor Pro. I am improving the Framer accessibility workflow and wanted to ask one quick question:

What were you hoping Ally Auditor would help you check or fix first?

Even a one-line answer is useful. I am especially curious whether the purchase was driven by alt text, contrast, headings, client reports, or something else.

Thanks,
Jimmy`,
    },
    polyglot_checkout_unblock: {
      target: "Cloudflare Worker custom domain for license.polyglotaeo.com",
      risk: "Deploying the Worker/custom domain can affect live checkout/license traffic; only run through the guarded wrapper and verify /health immediately.",
      expected_benefit: "Move Polyglot checkout onto the approved custom domain so Marketplace upload and Community traffic can safely continue.",
      verification: "Cloudflare apply JSON records success, https://license.polyglotaeo.com/health returns 2xx/3xx, checkout-origin readiness advances, and Marketplace preflight reruns clean.",
      draft: `Command pack:

pnpm lead:cloudflare-apply -- --dry-run
pnpm lead:cloudflare-apply -- --confirm '确认部署 Cloudflare Worker custom domain'
pnpm lead:checkout-origin
pnpm lead:payment-compliance-recovery
pnpm lead:marketplace-preflight`,
    },
    gaode_china_location_tutorial: {
      target: "Gaode Maps tutorial/use-case page",
      risk: "Publishing content before tracking and a clear offer are ready can create unmeasurable traffic.",
      expected_benefit: "Turn Gaode Maps' largest existing user base into searchable organic demand for China-facing Framer location pages.",
      verification: "Tracked tutorial URL, action log row, and 7d/14d review comparing Creator Space users/opens and CTA/form events.",
      draft: `Local outline:

Title: Add Gaode Maps to a Framer site without coding

Sections:
1. When a China-facing Framer site needs Gaode/AMap instead of a generic map.
2. How to create a marker map with Gaode Maps.
3. How to generate and paste the Framer Code Component.
4. How to test mobile responsiveness and route/marker behavior.
5. Install the free Marketplace plugin.`,
    },
  };
  return packs[row.id] || {
    target: row.plugin,
    risk: "External action requires action-time confirmation.",
    expected_benefit: row.primary_metric,
    verification: row.evidence_required,
    draft: "",
  };
}

function build({ dashboard, experiments, actions }) {
  const rows = experiments.map((row) => assessExperiment(row, dashboard, actions));
  const active = rows.filter((row) => !/done|stopped/i.test(row.status));
  const dueReview = rows.filter((row) => row.next_review?.date && row.next_review.date <= todayLocal() && row.action_evidence_count > 0 && !row.review_recorded);
  const next = active[0] || null;
  return {
    generated_at: new Date().toISOString(),
    status: rows.length ? "ready" : "missing_experiment_log",
    experiments: rows,
    active_count: active.length,
    due_review_count: dueReview.length,
    next_experiment: next,
    recommendation: recommendationFor({ rows, dueReview, next }),
  };
}

function reviewRecorded(row, review) {
  if (!review?.date) return false;
  const text = `${row.evidence || ""}\n${row.notes || ""}`;
  return text.includes(`[${review.date} review]`);
}

function recommendationFor({ rows, dueReview, next }) {
  if (!rows.length) return "Seed portfolio experiments with `pnpm lead:portfolio-experiments -- --seed`.";
  if (dueReview.length) return `Review ${dueReview.length} experiment(s) with due evidence before starting anything new.`;
  if (!next) return "No active portfolio experiments. Choose the next plugin/channel from the portfolio dashboard.";
  if (next.id === "loka_compliance_origin_recovery") {
    const hasInventory = /loka-checkout-origin-inventory|direct Creem payment link occurrence/i.test(`${next.evidence || ""}\n${next.notes || ""}`);
    if (hasInventory) {
      return "Loka checkout inventory is recorded. Wait for Creem human support to name the exact origin/referrer; do not change Creem/payment settings without that evidence.";
    }
    return "Work locally on Loka checkout-origin inventory while waiting for Creem human support; do not change Creem/payment settings without confirmation.";
  }
  return `Next local experiment prep: ${next.next_local_step}`;
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Portfolio Experiments",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Active experiments: ${report.active_count}`,
    `Due reviews: ${report.due_review_count}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Confirmation-Gated External Actions",
    "",
    "| Plugin | Target | Risk | Expected benefit | Confirmation | Verification |",
    "|---|---|---|---|---|---|",
  ];

  for (const row of report.experiments) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(row.action_pack.target)} | ${pipe(row.action_pack.risk)} | ${pipe(row.action_pack.expected_benefit)} | ${pipe(row.confirmation)} | ${pipe(row.action_pack.verification)} |`);
  }

  lines.push(
    "",
    "## Experiment Queue",
    "",
    "| Plugin | Channel | Status | Primary metric | Confirmation | Next review |",
    "|---|---|---|---|---|---|",
  );

  for (const row of report.experiments) {
    lines.push(`| ${pipe(row.plugin)} | ${pipe(row.channel)} | ${pipe(row.status)} | ${pipe(row.primary_metric)} | ${pipe(row.confirmation)} | ${row.next_review ? `${row.next_review.label}: ${row.next_review.date}` : ""} |`);
  }

  for (const row of report.experiments) {
    lines.push(
      "",
      `## ${row.plugin} / ${row.id}`,
      "",
      `- Status: ${row.status}`,
      `- Hypothesis: ${row.hypothesis}`,
      `- Primary metric: ${row.primary_metric}`,
      `- Current signal: ${row.profile_signal || "missing portfolio signal"}`,
      `- Current blocker: ${row.profile_blocker || "none recorded"}`,
      `- Local next step: ${row.next_local_step}`,
      `- External action: ${row.external_action}`,
      `- Confirmation phrase: ${row.confirmation || "required at action time"}`,
      `- Evidence required: ${row.evidence_required}`,
      `- Existing action evidence count: ${row.action_evidence_count}`,
      `- Review recorded for next window: ${row.review_recorded ? "yes" : "no"}`,
      `- Risk: ${row.action_pack.risk}`,
      `- Expected benefit: ${row.action_pack.expected_benefit}`,
      `- Verification: ${row.action_pack.verification}`,
      "",
      "Review schedule:",
      ...row.review_dates.map((item) => `- ${item.label}: ${item.date}`),
      "",
      "Draft or command pack:",
      "",
      "```text",
      row.action_pack.draft,
      "```",
      "",
      "Safety:",
      `- External action allowed now: ${row.external_action_allowed ? "yes" : "no"}`,
      `- Reason: ${row.external_blocked_reason}`,
    );
  }

  lines.push(
    "",
    "## Commands",
    "",
    "```bash",
    "pnpm lead:portfolio",
    "pnpm lead:portfolio-experiments",
    "pnpm lead:ops",
    "pnpm lead:report",
    "```",
    "",
  );

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

  const [dashboard, actionRows] = await Promise.all([
    readJson(args.dashboard, null),
    readRows(args.actions),
  ]);
  let experimentRows = await readRows(args.experiments);
  if (args.seed) {
    experimentRows = await seedExperiments(args.experiments, experimentRows, args.today);
  }
  experimentRows = await recordReview(args.experiments, experimentRows, args);

  const report = build({ dashboard, experiments: experimentRows, actions: actionRows });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Portfolio experiments: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
