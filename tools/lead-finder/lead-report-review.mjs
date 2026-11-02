#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_JSON = ".tmp/polyglot-report-review.json";
const DEFAULT_MARKDOWN = ".tmp/polyglot-report-review.md";

function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function usage() {
  return `
Usage:
  pnpm lead:report-review

Summarizes the 24h, 72h, and 7d report-first experiment without using open
rates. It reads local CRM state only and never sends or changes email.

Options:
  --crm <file>          CRM CSV. Default: ${DEFAULT_CRM}
  --campaign <name>     Campaign id. Default: report-first-v1
  --events <file>       First-party CTA event JSON. Default: ${DEFAULT_EVENTS}
  --today <YYYY-MM-DD>  Review date. Default: local date
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --markdown <file>     Markdown output. Default: ${DEFAULT_MARKDOWN}
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    campaign: "report-first-v1",
    events: DEFAULT_EVENTS,
    today: todayLocal(),
    json: DEFAULT_JSON,
    markdown: DEFAULT_MARKDOWN,
  };
  const mapping = {
    "--crm": "crm",
    "--campaign": "campaign",
    "--events": "events",
    "--today": "today",
    "--json": "json",
    "--markdown": "markdown",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (mapping[key]) {
      args[mapping[key]] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${key}`);
  }
  return args;
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

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function minDate(values) {
  return values.filter(Boolean).sort()[0] || "";
}

function maxDate(values) {
  return values.filter(Boolean).sort().at(-1) || "";
}

function cohortSummary(rows, cohort) {
  const cohortRows = rows.filter((row) => (row.report_cohort || "manual") === cohort);
  return {
    cohort,
    sent: cohortRows.filter((row) => Number.parseInt(row.sent_count || "0", 10) > 0).length,
    human_replies: cohortRows.filter((row) => row.status === "report_replied").length,
    qualified_replies: cohortRows.filter(
      (row) => row.status === "report_replied" && row.report_reply_quality === "qualified",
    ).length,
    bounced: cohortRows.filter((row) => row.status === "bounced").length,
    unsubscribed: cohortRows.filter((row) => row.status === "unsubscribed").length,
  };
}

function decisionFor(metrics, observationComplete) {
  if (metrics.factual_complaints > 0 || metrics.bounced + metrics.unsubscribed >= 2) {
    return {
      decision: "pause_immediately",
      reason: "A factual complaint or the combined bounce/unsubscribe stop threshold was reached.",
    };
  }
  if (metrics.sent === 0) {
    return {
      decision: "not_started",
      reason: "No report-first email has been manually sent, so the observation window has not started.",
    };
  }
  if (!observationComplete) {
    return {
      decision: "observe_no_followup",
      reason: "The 7-day observation window is still open. Review signals only; do not send another email.",
    };
  }
  if (metrics.human_replies >= 2 && metrics.qualified_replies >= 1) {
    return {
      decision: "expand_to_20_new_ab",
      reason: "At least two humans replied and at least one reply was qualified.",
    };
  }
  if (metrics.qualified_replies === 1) {
    return {
      decision: "revise_and_repeat_10",
      reason: "One qualified reply is a useful signal, but not enough to expand the batch.",
    };
  }
  return {
    decision: "stop_and_review",
    reason: "No qualified reply was recorded by the end of the 7-day window.",
  };
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
  let rows = [];
  let eventData = {};
  try {
    rows = parseCsv(await readFile(args.crm, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    eventData = JSON.parse(await readFile(args.events, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const campaignRows = rows.filter((row) => row.report_campaign === args.campaign);
  const campaignEvents = (Array.isArray(eventData.events) ? eventData.events : []).filter(
    (event) => event.utm_campaign === args.campaign && String(event.test_mode).toLowerCase() !== "true",
  );
  const sentRows = campaignRows.filter((row) => Number.parseInt(row.sent_count || "0", 10) > 0);
  const firstSent = minDate(sentRows.map((row) => row.last_touch));
  const lastSent = maxDate(sentRows.map((row) => row.last_touch));
  const observationEnd = lastSent ? addDays(lastSent, 7) : "";
  const observationComplete = Boolean(observationEnd && args.today >= observationEnd);
  const metrics = {
    selected: campaignRows.length,
    sent: sentRows.length,
    human_replies: campaignRows.filter((row) => row.status === "report_replied").length,
    qualified_replies: campaignRows.filter(
      (row) => row.status === "report_replied" && row.report_reply_quality === "qualified",
    ).length,
    bounced: campaignRows.filter((row) => row.status === "bounced").length,
    unsubscribed: campaignRows.filter((row) => row.status === "unsubscribed").length,
    factual_complaints: campaignRows.filter((row) =>
      /factual|incorrect|wrong finding|false positive|not accurate/i.test(row.reply_notes || ""),
    ).length,
    first_party_clicks: campaignEvents.length,
    tracked_install_clicks: campaignEvents.filter((event) => event.event_type === "install_click").length,
    crm_install_signals: campaignRows.filter((row) => row.status === "installed_free").length,
    first_sent: firstSent,
    last_sent: lastSent,
    observation_end: observationEnd,
  };
  const decision = decisionFor(metrics, observationComplete);
  const nextCheckpoint = !lastSent
    ? "after the first manual send"
    : args.today < addDays(lastSent, 1)
      ? addDays(lastSent, 1)
      : args.today < addDays(lastSent, 3)
        ? addDays(lastSent, 3)
        : args.today < addDays(lastSent, 7)
          ? addDays(lastSent, 7)
          : "complete";
  const cohorts = ["old", "new"].map((cohort) => cohortSummary(campaignRows, cohort));
  const report = {
    generated_at: new Date().toISOString(),
    today: args.today,
    campaign: args.campaign,
    metrics,
    cohorts,
    observation_complete: observationComplete,
    next_checkpoint: nextCheckpoint,
    ...decision,
    qualified_reply_definition:
      "A human asks for a fix, discusses a finding, requests installation, or asks about implementation; record as report_replied + report_reply_quality=qualified.",
    ignored_metric: "email open rate",
  };
  const markdown = [
    "# Polyglot report-first review",
    "",
    `Date: ${args.today}`,
    `Campaign: ${args.campaign}`,
    `Decision: ${decision.decision}`,
    `Reason: ${decision.reason}`,
    `Next checkpoint: ${nextCheckpoint}`,
    "",
    "## Funnel",
    "",
    `- Selected: ${metrics.selected}`,
    `- Sent: ${metrics.sent}`,
    `- Human replies: ${metrics.human_replies}`,
    `- Qualified replies: ${metrics.qualified_replies}`,
    `- Bounces / unsubscribes: ${metrics.bounced} / ${metrics.unsubscribed}`,
    `- Factual complaints: ${metrics.factual_complaints}`,
    `- First-party clicks / tracked install clicks: ${metrics.first_party_clicks} / ${metrics.tracked_install_clicks}`,
    `- CRM install signals: ${metrics.crm_install_signals}`,
    `- Observation window: ${firstSent || "not started"} → ${observationEnd || "not started"}`,
    "",
    "| Cohort | Sent | Human replies | Qualified | Bounced | Unsubscribed |",
    "|---|---:|---:|---:|---:|---:|",
    ...cohorts.map(
      (row) => `| ${row.cohort} | ${row.sent} | ${row.human_replies} | ${row.qualified_replies} | ${row.bounced} | ${row.unsubscribed} |`,
    ),
    "",
    "Open rates are deliberately excluded. During the 7-day window, review replies, bounces, opt-outs, first-party clicks, and install signals without sending a follow-up.",
    "",
  ].join("\n");
  await Promise.all([
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
    writeText(args.markdown, markdown),
  ]);
  process.stdout.write(`Report-first review: ${decision.decision}. Next checkpoint: ${nextCheckpoint}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
