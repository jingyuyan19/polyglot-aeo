#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_KIT = ".tmp/framer-distribution-kit.json";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-distribution-review.md";
const DEFAULT_JSON = ".tmp/framer-distribution-review.json";
const PRIORITY_LIMIT = 2;

function usage() {
  return `
Usage:
  pnpm lead:distribution-review

Options:
  --kit <file>       Distribution kit JSON. Default: ${DEFAULT_KIT}
  --events <file>    CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>     Netlify form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --actions <file>   External action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>    Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>      JSON output. Default: ${DEFAULT_JSON}
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    kit: DEFAULT_KIT,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
    actions: DEFAULT_ACTIONS,
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
    if (key === "--kit") {
      args.kit = value;
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
    if (key === "--actions") {
      args.actions = value;
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

async function readText(file, fallback = "") {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
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

async function readActions(file) {
  return parseCsv(await readText(file));
}

function formCampaign(item) {
  return (
    item?.utm_campaign ||
    item?.data?.utm_campaign ||
    item?.body?.utm_campaign ||
    item?.utmCampaign ||
    ""
  );
}

function formSourcePage(item) {
  return (
    item?.source_page ||
    item?.data?.source_page ||
    item?.body?.source_page ||
    item?.sourcePage ||
    ""
  );
}

function campaignForms(forms, campaign) {
  const submissions = Array.isArray(forms.submissions) ? forms.submissions : [];
  return submissions.filter((item) => formCampaign(item) === campaign || formSourcePage(item).includes(campaign));
}

function campaignEvents(eventsData, campaign) {
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];
  return events.filter((event) => event.utm_campaign === campaign);
}

function campaignActions(actions, post) {
  return actions.filter(
    (row) =>
      row.type === "post" &&
      row.status === "done" &&
      (row.target === post.title || row.campaign === post.campaign),
  );
}

function assess({ kit, eventsData, formsData, actions }) {
  const posts = Array.isArray(kit.posts) ? [...kit.posts].sort((a, b) => a.priority - b.priority) : [];
  const priorityPosts = posts.filter((post) => Number(post.priority) <= PRIORITY_LIMIT);
  const rows = posts.map((post) => {
    const actionsForPost = campaignActions(actions, post);
    const events = campaignEvents(eventsData, post.campaign);
    const forms = campaignForms(formsData, post.campaign);
    return {
      priority: post.priority,
      title: post.title,
      campaign: post.campaign,
      posted: actionsForPost.length > 0,
      action_evidence: actionsForPost.map((row) => row.evidence).filter(Boolean),
      events: events.length,
      forms: forms.length,
      status: statusFor({ post, actionsForPost, events, forms }),
    };
  });

  const priorityRows = rows.filter((row) => Number(row.priority) <= PRIORITY_LIMIT);
  const priorityPosted = priorityRows.filter((row) => row.posted).length;
  const priorityEvents = priorityRows.reduce((sum, row) => sum + row.events, 0);
  const priorityForms = priorityRows.reduce((sum, row) => sum + row.forms, 0);

  return {
    generated_at: new Date().toISOString(),
    priority_limit: PRIORITY_LIMIT,
    posts_total: posts.length,
    priority_posts: priorityPosts.length,
    priority_posted: priorityPosted,
    priority_events: priorityEvents,
    priority_forms: priorityForms,
    rows,
    recommendation: recommendation({ priorityRows, priorityPosted, priorityEvents, priorityForms }),
  };
}

function statusFor({ post, actionsForPost, events, forms }) {
  if (!actionsForPost.length) return Number(post.priority) <= PRIORITY_LIMIT ? "publish_next" : "wait";
  if (forms.length) return "form_intent";
  if (events.length) return "cta_intent";
  return "posted_no_signal";
}

function recommendation({ priorityRows, priorityPosted, priorityEvents, priorityForms }) {
  if (priorityPosted < priorityRows.length) {
    const missing = priorityRows.filter((row) => !row.posted).map((row) => row.title);
    return `Publish priority post(s) first: ${missing.join(", ")}.`;
  }
  if (priorityForms > 0) {
    return "Form intent exists. Run `pnpm lead:forms -- --apply`, then generate audit or handoff replies.";
  }
  if (priorityEvents > 0) {
    return "CTA intent exists but no form submission yet. Inspect CTA paths, then follow up with a sharper form ask.";
  }
  return "Priority 1/2 are posted but still have no CTA or form signal. Revise the hook before publishing lower-priority posts.";
}

function renderMarkdown(review) {
  const lines = [
    "# Framer Distribution Review",
    "",
    `Generated: ${review.generated_at}`,
    `Priority posts: ${review.priority_posted}/${review.priority_posts} posted`,
    `Priority CTA events: ${review.priority_events}`,
    `Priority form submissions: ${review.priority_forms}`,
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
    "## Posts",
    "",
    "| Priority | Post | Campaign | Posted | CTA events | Forms | Status |",
    "|---:|---|---|---|---:|---:|---|",
  ];

  for (const row of review.rows) {
    lines.push(
      `| ${row.priority} | ${row.title} | ${row.campaign} | ${row.posted ? "yes" : "no"} | ${row.events} | ${row.forms} | ${row.status} |`,
    );
  }

  lines.push(
    "",
    "## Commands",
    "",
    "```bash",
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:distribution-review",
    "pnpm lead:ops",
    "```",
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

  const kit = await readJson(args.kit, { posts: [] });
  const eventsData = await readJson(args.events, { events: [] });
  const formsData = await readJson(args.forms, { submissions: [] });
  const actions = await readActions(args.actions);
  const review = assess({ kit, eventsData, formsData, actions });

  await writeText(args.output, renderMarkdown(review));
  await writeText(args.json, `${JSON.stringify(review, null, 2)}\n`);
  process.stdout.write(`Distribution review: ${review.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
