#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_KIT = ".tmp/framer-directory-submit-kit.json";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_OUTPUT = ".tmp/framer-directory-review.md";
const DEFAULT_JSON = ".tmp/framer-directory-review.json";

function usage() {
  return `
Usage:
  pnpm lead:directory-review

Options:
  --kit <file>      Directory kit JSON. Default: ${DEFAULT_KIT}
  --actions <file>  External action log CSV. Default: ${DEFAULT_ACTIONS}
  --events <file>   CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>    Netlify form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --output <file>   Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>     JSON output. Default: ${DEFAULT_JSON}
  --help            Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    kit: DEFAULT_KIT,
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
    if (key === "--kit") {
      args.kit = value;
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
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
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

function formSource(item) {
  return (
    item?.utm_source ||
    item?.data?.utm_source ||
    item?.body?.utm_source ||
    item?.utmSource ||
    ""
  );
}

function directoryForms(formsData) {
  const submissions = Array.isArray(formsData.submissions) ? formsData.submissions : [];
  return submissions.filter((item) => {
    const source = formSource(item);
    const campaign = formCampaign(item);
    return source === "directory_submission" || campaign.startsWith("directory_");
  });
}

function directoryEvents(eventsData) {
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];
  return events.filter(
    (event) =>
      event.utm_source === "directory_submission" ||
      String(event.utm_campaign || "").startsWith("directory_"),
  );
}

function targetActions(actions, target) {
  return actions.filter(
    (row) =>
      row.type === "directory_submission" &&
      (row.campaign === target.campaign || row.channel === target.channel || row.target === target.name),
  );
}

function assess({ kit, actions, eventsData, formsData }) {
  const targets = Array.isArray(kit.targets) ? [...kit.targets].sort((a, b) => a.priority - b.priority) : [];
  const events = directoryEvents(eventsData);
  const forms = directoryForms(formsData);
  const rows = targets.map((target) => {
    const rowsForTarget = targetActions(actions, target);
    const doneRows = rowsForTarget.filter((row) => row.status === "done");
    const formRows = doneRows.filter((row) => row.channel !== "gmail");
    const emailRows = doneRows.filter((row) => row.channel === "gmail");
    return {
      priority: target.priority,
      target: target.name,
      channel: target.channel,
      campaign: target.campaign,
      kit_status: target.status,
      submit_url: target.submit_url,
      form_submitted: formRows.length > 0,
      email_pitch_sent: emailRows.length > 0 || target.status === "email_pitch_sent",
      action_count: rowsForTarget.length,
      evidence: doneRows.map((row) => row.evidence).filter(Boolean),
      status: statusFor({ target, formRows, emailRows }),
    };
  });
  const manualReady = rows.filter(
    (row) => row.kit_status === "manual_confirmation_required" && !row.form_submitted,
  );
  const formSubmitted = rows.filter((row) => row.form_submitted);
  const emailPitched = rows.filter((row) => row.email_pitch_sent);

  return {
    generated_at: new Date().toISOString(),
    targets: rows.length,
    manual_ready: manualReady.length,
    form_submitted: formSubmitted.length,
    email_pitched: emailPitched.length,
    directory_events: events.length,
    directory_forms: forms.length,
    rows,
    recommendation: recommendationFor({ manualReady, formSubmitted, emailPitched, events, forms }),
  };
}

function statusFor({ target, formRows, emailRows }) {
  if (formRows.length) return "form_submitted";
  if (emailRows.length) return "email_pitch_sent";
  if (target.status === "manual_confirmation_required") return "needs_confirmation";
  if (target.status === "wait_for_reply_or_confirmation") return "wait";
  return target.status || "unknown";
}

function recommendationFor({ manualReady, formSubmitted, emailPitched, events, forms }) {
  if (forms.length > 0) {
    return "Directory-sourced form intent exists. Apply form intake, then fulfill the audit/handoff request.";
  }
  if (events.length > 0) {
    return "Directory-sourced CTA intent exists. Inspect paths and sharpen the directory listing/form ask.";
  }
  if (formSubmitted.length === 0 && manualReady.length > 0) {
    return `Submit one manual directory target after confirmation: ${manualReady[0].target}.`;
  }
  if (emailPitched.length > 0) {
    return "Email directory pitches are out. Wait for replies or submit one manual directory target after confirmation.";
  }
  return "No directory action is ready. Regenerate the directory kit or inspect target statuses.";
}

function renderMarkdown(review) {
  const lines = [
    "# Framer Directory Review",
    "",
    `Generated: ${review.generated_at}`,
    `Targets: ${review.targets}`,
    `Manual targets ready: ${review.manual_ready}`,
    `Form submissions logged: ${review.form_submitted}`,
    `Email pitches logged/scheduled: ${review.email_pitched}`,
    `Directory CTA events: ${review.directory_events}`,
    `Directory form submissions: ${review.directory_forms}`,
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
    "## Targets",
    "",
    "| Priority | Target | Channel | Kit status | Review status | Actions | Evidence |",
    "|---:|---|---|---|---|---:|---|",
  ];

  for (const row of review.rows) {
    lines.push(
      `| ${row.priority} | ${row.target} | ${row.channel} | ${row.kit_status} | ${row.status} | ${row.action_count} | ${row.evidence.join("<br>").replace(/\|/g, "/")} |`,
    );
  }

  lines.push(
    "",
    "## Commands",
    "",
    "```bash",
    "pnpm lead:directory",
    "pnpm lead:directory-record -- --campaign frameplate_plugin --evidence '<submission-confirmation-or-screenshot>'",
    "pnpm lead:directory-review",
    "pnpm lead:forms && pnpm lead:events && pnpm lead:directory-review && pnpm lead:public-preflight && pnpm lead:ops",
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

  const [kit, actions, eventsData, formsData] = await Promise.all([
    readJson(args.kit, { targets: [] }),
    readRows(args.actions),
    readJson(args.events, { events: [] }),
    readJson(args.forms, { submissions: [] }),
  ]);
  const review = assess({ kit, actions, eventsData, formsData });

  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);
  process.stdout.write(`Directory review: ${review.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
