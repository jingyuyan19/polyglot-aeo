#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_OUTPUT = ".tmp/framer-partner-review.md";
const DEFAULT_JSON = ".tmp/framer-partner-review.json";
const REVIEWABLE_TYPES = new Set(["email_send", "directory_submission", "platform_request"]);

function usage() {
  return `
Usage:
  pnpm lead:partner-review

Options:
  --actions <file>      External action log CSV. Default: ${DEFAULT_ACTIONS}
  --events <file>       CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>        Form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>  Review date. Default: local date.
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
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
    if (key === "--today") {
      args.today = value;
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

async function readJson(file, fallback) {
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

function addDays(date, days) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

function daysBetween(date, today) {
  const start = Date.parse(`${date}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor((end - start) / 86400000);
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

function partnerEvents(eventsData) {
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];
  return events.filter((event) => {
    const campaign = String(event.utm_campaign || "");
    const source = String(event.utm_source || "");
    return (
      campaign.startsWith("content_partner_") ||
      campaign.startsWith("directory_") ||
      source === "directory_submission" ||
      source === "partner_resource"
    );
  });
}

function partnerForms(formsData) {
  const submissions = Array.isArray(formsData.submissions) ? formsData.submissions : [];
  return submissions.filter((item) => {
    const campaign = String(formCampaign(item));
    return campaign.startsWith("content_partner_") || campaign.startsWith("directory_");
  });
}

function isPartnerAction(action) {
  if (action.status !== "done") return false;
  if (!REVIEWABLE_TYPES.has(action.type)) return false;
  if (action.type === "platform_request" && action.channel === "gmail") return true;
  if (action.type === "directory_submission" && action.channel === "gmail") return true;
  if (action.type !== "email_send") return false;
  return String(action.campaign || "").startsWith("content_partner_");
}

function partnerKind(action) {
  if (action.type === "platform_request") return "framer_platform";
  if (action.type === "directory_submission") return "directory_email";
  return "content_partner";
}

function reviewPlanFor(action) {
  const kind = partnerKind(action);
  if (kind === "framer_platform") {
    return [
      { label: "3d Framer visibility reply check", offset: 3 },
      { label: "7d Framer visibility escalation decision", offset: 7 },
    ];
  }
  if (kind === "directory_email") {
    return [
      { label: "3d directory reply check", offset: 3 },
      { label: "7d directory inclusion check", offset: 7 },
      { label: "14d directory close/retry decision", offset: 14 },
    ];
  }
  return [
    { label: "3d partner reply check", offset: 3 },
    { label: "7d backlink/resource inclusion check", offset: 7 },
    { label: "14d close/recycle decision", offset: 14 },
  ];
}

function normalizedSearchTerm(text) {
  return String(text || "")
    .replace(/\b(Framer|Polyglot|AEO|resource|for|your|guide|content|directory|plugin|category)\b/gi, " ")
    .replace(/[^a-z0-9 .-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => part.length > 2)
    .slice(0, 3)
    .join(" ");
}

function queryTerms(rows) {
  const terms = new Set([
    "Frameplugins",
    "HyperFramer",
    "Frameplate",
    "SegmentUI",
    "FramerHub",
    "We Optimizz",
    "Helm",
    "BRIX",
    "925Studios",
    "AY Automate",
    "Times One Hundred",
    "Modern Practice",
    "Framer Community",
  ]);
  for (const row of rows) {
    for (const source of [row.action.target, row.action.campaign]) {
      const term = normalizedSearchTerm(source);
      if (term) terms.add(term);
    }
  }
  return Array.from(terms).sort();
}

function gmailQuery(rows) {
  const terms = queryTerms(rows).slice(0, 24);
  return `newer_than:7d -from:me -in:spam -in:trash (${terms.map((term) => `"${term}"`).join(" OR ")} OR directory OR resource OR backlink OR listed OR roundup)`;
}

function signalForAction(action, eventsData, formsData, signalActions) {
  const events = partnerEvents(eventsData);
  const forms = partnerForms(formsData);
  const responseRows = signalActions.filter((row) => {
    const haystack = [row.campaign, row.target, row.note, row.evidence].join(" ").toLowerCase();
    const campaign = String(action.campaign || "").toLowerCase();
    const target = String(action.target || "").toLowerCase();
    return (
      (campaign && haystack.includes(campaign)) ||
      (target && haystack.includes(target)) ||
      /partner reply|directory reply|resource accepted|listed|backlink/i.test(haystack)
    );
  });
  return {
    events: events.length,
    forms: forms.length,
    response_actions: responseRows.length,
    has_signal: events.length > 0 || forms.length > 0 || responseRows.length > 0,
  };
}

function assess({ actions, eventsData, formsData, args }) {
  const signalActions = actions.filter(
    (row) =>
      row.status === "done" &&
      ["email_monitor", "partner_reply", "directory_reply", "resource_listing"].includes(row.type),
  );
  const reviewRows = actions
    .filter(isPartnerAction)
    .map((action) => {
      const signal = signalForAction(action, eventsData, formsData, signalActions);
      const checkpoints = reviewPlanFor(action).map((checkpoint) => {
        const dueDate = addDays(action.date, checkpoint.offset);
        const due = dueDate <= args.today;
        return {
          ...checkpoint,
          due_date: dueDate,
          due,
          status: signal.has_signal ? "signal_found" : due ? "due" : "scheduled",
        };
      });
      const dueCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "due");
      const scheduledCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "scheduled");
      return {
        action,
        kind: partnerKind(action),
        age_days: daysBetween(action.date, args.today),
        signal,
        checkpoints,
        due_count: dueCheckpoints.length,
        next_due_date: dueCheckpoints[0]?.due_date || scheduledCheckpoints[0]?.due_date || "",
        status: actionStatus({ signal, dueCheckpoints, scheduledCheckpoints }),
      };
    })
    .sort(
      (a, b) =>
        b.due_count - a.due_count ||
        String(a.next_due_date || "9999-99-99").localeCompare(String(b.next_due_date || "9999-99-99")) ||
        String(b.action.date).localeCompare(String(a.action.date)) ||
        b.action.__index - a.action.__index,
    );

  const dueRows = reviewRows.filter((row) => row.due_count > 0 && !row.signal.has_signal);
  const scheduledRows = reviewRows.filter((row) => row.due_count === 0 && row.next_due_date && !row.signal.has_signal);
  const signalRows = reviewRows.filter((row) => row.signal.has_signal);

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    reviewable_actions: reviewRows.length,
    due_reviews: dueRows.length,
    scheduled_reviews: scheduledRows.length,
    signal_actions: signalRows.length,
    partner_events: partnerEvents(eventsData).length,
    partner_forms: partnerForms(formsData).length,
    next_review_date: dueRows[0]?.next_due_date || scheduledRows[0]?.next_due_date || "",
    recommendation: recommendationFor({ reviewRows, dueRows, scheduledRows, signalRows }),
    gmail_query: gmailQuery(reviewRows),
    rows: reviewRows,
  };
}

function actionStatus({ signal, dueCheckpoints, scheduledCheckpoints }) {
  if (signal.has_signal) return "signal_found";
  if (dueCheckpoints.length) return "review_due";
  if (scheduledCheckpoints.length) return "scheduled";
  return "no_review_plan";
}

function recommendationFor({ reviewRows, dueRows, scheduledRows, signalRows }) {
  if (!reviewRows.length) {
    return "No content partner, directory email, or Framer visibility request actions are logged yet.";
  }
  if (dueRows.length) {
    return `Review ${dueRows.length} partner/resource action(s) before sending more partner outreach.`;
  }
  if (signalRows.length) {
    return "A partner/resource signal exists. Attribute it, fulfill any request, and update the action log before expanding.";
  }
  return `No partner/resource review is due yet. Next review date: ${scheduledRows[0]?.next_due_date || "none"}.`;
}

function renderMarkdown(review) {
  const lines = [
    "# Framer Partner Review",
    "",
    `Generated: ${review.generated_at}`,
    `Today: ${review.today}`,
    `Reviewable partner/resource actions: ${review.reviewable_actions}`,
    `Due reviews: ${review.due_reviews}`,
    `Scheduled reviews: ${review.scheduled_reviews}`,
    `Actions with signal: ${review.signal_actions}`,
    `Partner CTA events: ${review.partner_events}`,
    `Partner form submissions: ${review.partner_forms}`,
    `Next review date: ${review.next_review_date || "none"}`,
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
    "## Gmail Reply Query",
    "",
    "```text",
    review.gmail_query,
    "```",
    "",
    "## Review Queue",
    "",
  ];

  if (!review.rows.length) {
    lines.push("No partner/resource actions to review.", "");
  } else {
    lines.push("| Status | Next due | Kind | Date | Campaign | Target | Checkpoints |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const row of review.rows.slice(0, 20)) {
      const checkpoints = row.checkpoints
        .map((checkpoint) => `${checkpoint.label}: ${checkpoint.status} ${checkpoint.due_date}`)
        .join("<br>");
      lines.push(
        `| ${row.status} | ${row.next_due_date || ""} | ${row.kind} | ${row.action.date || ""} | ${row.action.campaign || ""} | ${String(row.action.target || "").replace(/\|/g, "/")} | ${checkpoints} |`,
      );
    }
    if (review.rows.length > 20) {
      lines.push(`| ... | | | | | ${review.rows.length - 20} more action(s) | |`);
    }
    lines.push("");
  }

  lines.push("## Commands", "", "```bash");
  lines.push("pnpm lead:partner-review");
  lines.push("pnpm lead:signal-sweep");
  lines.push("pnpm lead:forms");
  lines.push("pnpm lead:events");
  lines.push("pnpm lead:ops");
  lines.push("```", "");

  lines.push("## Guardrails", "");
  lines.push("- This review does not send follow-ups; it only tells you when to inspect Gmail or verify listing/backlink status.");
  lines.push("- Record accepted listings, resource replies, or backlink wins in `lead:actions` before expanding partner outreach.");
  lines.push("- Do not send a partner follow-up without checking for replies, bounces, and existing listing evidence first.");
  lines.push("");

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

  const [actions, eventsData, formsData] = await Promise.all([
    readRows(args.actions),
    readJson(args.events, { events: [] }),
    readJson(args.forms, { submissions: [] }),
  ]);
  const review = assess({ actions, eventsData, formsData, args });

  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Partner review: ${review.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
