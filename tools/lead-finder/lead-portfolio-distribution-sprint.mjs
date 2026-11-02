#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PLAN = "tools/lead-finder/portfolio-distribution-sprint.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-portfolio-distribution-sprint.md";
const DEFAULT_JSON = ".tmp/framer-portfolio-distribution-sprint.json";

function usage() {
  return `
Usage:
  pnpm lead:portfolio-sprint
  pnpm lead:portfolio-sprint -- --today 2026-08-07 --limit 4

Options:
  --plan <file>     Sprint configuration. Default: ${DEFAULT_PLAN}
  --actions <file>  Public action log. Default: ${DEFAULT_ACTIONS}
  --output <file>   Markdown operator view. Default: ${DEFAULT_OUTPUT}
  --json <file>     JSON operator view. Default: ${DEFAULT_JSON}
  --today <date>    Local date in YYYY-MM-DD format. Default: today
  --limit <n>       Number of actionable tasks to render in detail. Default: 4
  --help            Show this help message.
`;
}

function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseArgs(argv) {
  const args = {
    plan: DEFAULT_PLAN,
    actions: DEFAULT_ACTIONS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    today: todayLocal(),
    limit: 4,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") args.help = true;
    else if (key === "--plan") {
      args.plan = value;
      index += 1;
    } else if (key === "--actions") {
      args.actions = value;
      index += 1;
    } else if (key === "--output") {
      args.output = value;
      index += 1;
    } else if (key === "--json") {
      args.json = value;
      index += 1;
    } else if (key === "--today") {
      args.today = value;
      index += 1;
    } else if (key === "--limit") {
      args.limit = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.today)) {
    throw new Error(`Invalid --today date: ${args.today}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) args.limit = 4;
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

async function readJson(file) {
  const text = await readText(file);
  if (!text.trim()) throw new Error(`Missing JSON file: ${file}`);
  return JSON.parse(text);
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
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

async function fileExists(file) {
  if (!file) return false;
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function hash(value) {
  return createHash("sha256").update(value || "").digest("hex").slice(0, 12);
}

function searchableAction(action) {
  return [action.target, action.evidence, action.note].join(" ");
}

function completedAction(task, actions) {
  if (task.published_url) return { source: "plan", url: task.published_url };
  const action = actions.find((item) => (
    item.status === "done"
    && searchableAction(item).includes(`sprint_task=${task.id}`)
  ));
  if (!action) return null;
  return { source: "action_log", url: action.target || action.evidence || "" };
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000);
}

function validateTask(task, plan, assetExists) {
  const blockers = Array.isArray(task.blockers)
    ? task.blockers.filter((item) => typeof item === "string" && item.trim())
    : [];
  const warnings = Array.isArray(task.warnings)
    ? task.warnings.filter((item) => typeof item === "string" && item.trim())
    : [];
  const policy = plan.channel_policies?.[task.channel] || (task.channel === "decision" ? "metric_gate" : "");
  const body = task.body || "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.date || "")) blockers.push("Task date is invalid.");
  if (task.date < plan.start_date || task.date > plan.end_date) blockers.push("Task date is outside the sprint.");
  if (!policy) blockers.push(`No channel policy is defined for ${task.channel}.`);
  if (task.asset && !assetExists) blockers.push(`Asset is missing: ${task.asset}`);
  if (task.channel === "framer_community_feed" && /https?:\/\//i.test(body)) {
    blockers.push("Framer Feed body contains a link.");
  }
  if (/creem\.io\/payment\//i.test(body)) blockers.push("Direct Creem checkout links are not allowed.");
  if (/\b(WCAG[- ]?compliant|certif(?:y|ied|ication)|legal compliance guarantee)\b/i.test(body)) {
    blockers.push("Draft contains a prohibited compliance claim.");
  }
  if (task.channel === "linkedin" && policy !== "manual_only") {
    blockers.push("LinkedIn must remain manual-only.");
  }
  if (task.channel === "x" && !/official_api_or_manual_only/.test(policy)) {
    blockers.push("X must use the official API or manual publishing.");
  }
  if (["reddit", "zhihu"].includes(task.channel)) {
    warnings.push("Review the current community or question rules before publishing.");
  }
  if (!task.asset && !["community_replies", "build_in_public_post", "metric_gated_followup"].includes(task.type)) {
    warnings.push("No visual asset is assigned.");
  }

  return { policy, blockers, warnings };
}

async function enrichTask(task, plan, actions, today) {
  const assetExists = task.asset ? await fileExists(task.asset) : false;
  const completion = completedAction(task, actions);
  const validation = validateTask(task, plan, assetExists);
  let status = "upcoming";
  if (completion) status = "completed";
  else if (validation.blockers.length) status = "blocked";
  else if (task.date === today) status = "due_today";
  else if (task.date < today) status = "overdue";

  return {
    ...task,
    body_hash: hash(task.body),
    asset_exists: assetExists,
    policy: validation.policy,
    blockers: validation.blockers,
    warnings: validation.warnings,
    completion,
    status,
    days_from_today: daysBetween(task.date, today),
  };
}

function taskSort(left, right) {
  const statusRank = { due_today: 0, overdue: 1, upcoming: 2, blocked: 3, completed: 4 };
  return (statusRank[left.status] ?? 9) - (statusRank[right.status] ?? 9)
    || left.date.localeCompare(right.date)
    || Number(right.priority || 0) - Number(left.priority || 0);
}

function actionType(task) {
  if (task.channel === "decision") return "sprint_review";
  if (["community_replies", "value_first_answer"].includes(task.type)) return "community_reply";
  return "social_post";
}

function recordCommand(task, plan) {
  const type = actionType(task);
  const target = task.channel === "decision" ? task.title : "<published-url-or-public-evidence>";
  const asset = task.asset ? `; ${task.asset}` : "";
  return `pnpm lead:actions -- --add --type '${type}' --channel '${task.channel}' --campaign '${plan.sprint_id}' --status done --target '${target}' --evidence '<published-url-or-public-evidence>${asset}' --note 'sprint_task=${task.id}; body_hash=${task.body_hash}; completed after review.'`;
}

function renderMarkdown({ plan, tasks, actionable, topAction, args }) {
  const counts = Object.fromEntries(
    ["completed", "due_today", "overdue", "upcoming", "blocked"].map((status) => [
      status,
      tasks.filter((task) => task.status === status).length,
    ]),
  );
  const lines = [
    "# Framer Portfolio Distribution Sprint",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Today: ${args.today}`,
    `Sprint: ${plan.start_date} to ${plan.end_date}`,
    `Daily community contribution quota: ${plan.daily_engagement_quota}`,
    "",
    "## Status",
    "",
    `- Completed: ${counts.completed}`,
    `- Due today: ${counts.due_today}`,
    `- Overdue: ${counts.overdue}`,
    `- Upcoming: ${counts.upcoming}`,
    `- Blocked: ${counts.blocked}`,
    "",
    "## Next Action",
    "",
  ];

  if (!topAction) {
    lines.push("No publishable action is due. Use this run for measurement and useful community replies.", "");
  } else {
    lines.push(
      `- Date: ${topAction.date}`,
      `- Plugin: ${topAction.plugin}`,
      `- Channel: ${topAction.channel}`,
      `- Title: ${topAction.title}`,
      `- Status: ${topAction.status}`,
      `- Policy: ${topAction.policy}`,
      `- Confirmation: ${topAction.confirmation}`,
      `- Asset: ${topAction.asset || "none"}`,
      "",
      "```text",
      topAction.body,
      "```",
      "",
    );
  }

  lines.push(
    "## Action Queue",
    "",
    "| Date | Plugin | Channel | Status | Title |",
    "|---|---|---|---|---|",
  );
  for (const task of tasks) {
    lines.push(`| ${task.date} | ${task.plugin} | ${task.channel} | ${task.status} | ${task.title.replace(/\|/g, "/")} |`);
  }
  lines.push("");

  for (const task of actionable.slice(0, args.limit)) {
    lines.push(
      `## ${task.date}: ${task.title}`,
      "",
      `- Plugin/channel: ${task.plugin} / ${task.channel}`,
      `- Status: ${task.status}`,
      `- Confirmation: ${task.confirmation}`,
      `- Review window: ${task.review_window}`,
      `- Asset: ${task.asset || "none"} (${task.asset ? (task.asset_exists ? "ready" : "missing") : "not required"})`,
      `- Warnings: ${task.warnings.join(" ") || "none"}`,
      `- Blockers: ${task.blockers.join(" ") || "none"}`,
      "",
      "```text",
      task.body,
      "```",
      "",
      "Record after completion:",
      "",
      "```bash",
      recordCommand(task, plan),
      "```",
      "",
    );
  }

  lines.push(
    "## Daily Engagement",
    "",
    `Add ${plan.daily_engagement_quota} useful, non-promotional replies or comments today. Do not automate replies, likes, follows, or unsolicited messages.`,
    "",
    "## Safety",
    "",
    "- This command never publishes, uploads, comments, likes, follows, or sends messages.",
    "- LinkedIn is manual-only.",
    "- X uses the official API or manual publishing; do not script the website.",
    "- Framer Feed copy cannot contain Marketplace or owned-site links.",
    "- Reddit and Zhihu require a current rules/context review.",
    "- Do not expose customer data, API keys, payment identifiers, or direct Creem checkout links.",
    "- Do not promise rankings, WCAG conformance, certification, or legal compliance.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function writeText(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const [plan, actionsText] = await Promise.all([
    readJson(args.plan),
    readText(args.actions),
  ]);
  const actions = parseCsv(actionsText);
  const tasks = (await Promise.all(
    plan.tasks.map((task) => enrichTask(task, plan, actions, args.today)),
  )).sort(taskSort);
  const actionable = tasks.filter((task) => ["due_today", "overdue", "upcoming"].includes(task.status));
  const topAction = actionable.find((task) => ["due_today", "overdue"].includes(task.status)) || null;
  const data = {
    generated_at: new Date().toISOString(),
    today: args.today,
    sprint_id: plan.sprint_id,
    sprint_window: { start: plan.start_date, end: plan.end_date },
    goals: plan.goals,
    baseline: plan.baseline,
    daily_engagement_quota: plan.daily_engagement_quota,
    summary: Object.fromEntries(
      ["completed", "due_today", "overdue", "upcoming", "blocked"].map((status) => [
        status,
        tasks.filter((task) => task.status === status).length,
      ]),
    ),
    top_action: topAction,
    selected: actionable.slice(0, args.limit),
    tasks,
  };

  await Promise.all([
    writeText(args.output, renderMarkdown({ plan, tasks, actionable, topAction, args })),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Portfolio sprint: ${plan.sprint_id}\n`);
  process.stdout.write(`Today: ${args.today}\n`);
  process.stdout.write(`Completed: ${data.summary.completed}; due: ${data.summary.due_today}; overdue: ${data.summary.overdue}; blocked: ${data.summary.blocked}\n`);
  process.stdout.write(`Top action: ${topAction ? `${topAction.plugin} / ${topAction.channel} / ${topAction.title}` : "none due"}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
