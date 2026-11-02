#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_QUEUE = ".tmp/framer-customer-feedback-queue.json";
const DEFAULT_OUTPUT = ".tmp/framer-customer-feedback-brief.md";
const DEFAULT_JSON = ".tmp/framer-customer-feedback-brief.json";

function usage() {
  return `
Usage:
  pnpm lead:customer-feedback-brief

Options:
  --queue <file>    Customer feedback queue JSON. Default: ${DEFAULT_QUEUE}
  --output <file>   Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>     JSON output. Default: ${DEFAULT_JSON}
  --today <date>    Anchor date YYYY-MM-DD. Default: local date.
  --help            Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    queue: DEFAULT_QUEUE,
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
    if (key === "--queue") {
      args.queue = value;
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

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
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

function selectItem(queue) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  return (
    items.find((item) => item.status === "ready_confirmation_required") ||
    items.find((item) => item.status === "queued_confirmation_required") ||
    null
  );
}

function build({ queue, today }) {
  const item = selectItem(queue);
  if (!item) {
    return {
      generated_at: new Date().toISOString(),
      today,
      status: "no_ready_customer_feedback",
      recommendation: queue?.recommendation || "No ready customer feedback action. Keep monitoring revenue and support signals.",
      item: null,
      preconditions: [],
      reviews: [],
      gmail_query: "",
      record_command: "",
    };
  }

  const reviews = [
    { label: "24h", date: addDays(today, 1) },
    { label: "48h", date: addDays(today, 2) },
    { label: "72h", date: addDays(today, 3) },
    { label: "7d", date: addDays(today, 7) },
  ];
  const gmailQuery = [
    "newer_than:10d",
    "-in:spam",
    "-in:trash",
    "-from:jimmymjing@gmail.com",
    `(${quote(item.customer_email)} OR ${quote(item.customer_domain)} OR ${quote(item.plugin)} OR ${quote(item.product)} OR feedback OR reply)`,
  ].join(" ");
  const recordCommand = [
    "pnpm lead:actions -- --add",
    "--type email_send",
    "--channel gmail",
    `--campaign ${shellQuote(item.campaign)}`,
    "--status done",
    `--target ${shellQuote(`${item.customer_name} <${item.customer_email}>`)}`,
    "--evidence '<gmail-sent-message-id>'",
    `--note ${shellQuote(`${item.plugin} customer feedback email sent after explicit confirmation; review at 24h/48h/72h/7d.`)}`,
  ].join(" ");
  const preconditions = [
    "Run the read-only Gmail review query immediately before sending; if it shows a prior outgoing feedback email, a customer reply, refund/support issue, or another recent touch, stop and regenerate the queue.",
    "Send only one personalized email to this customer; do not batch or reuse the draft for other customers.",
    `Do not create a Gmail draft or send unless the user provides the exact confirmation phrase: ${item.confirmation}`,
  ];

  return {
    generated_at: new Date().toISOString(),
    today,
    status: "ready_confirmation_required",
    recommendation: `Send ${item.plugin} customer feedback email only after exact confirmation: ${item.confirmation}`,
    item,
    external_action: {
      action: "Send one customer feedback email through Gmail.",
      target: `${item.customer_name} <${item.customer_email}>`,
      risk: item.risk,
      expected_benefit: item.expected_benefit,
      confirmation: item.confirmation,
      verification: item.verification,
    },
    preconditions,
    reviews,
    gmail_query: gmailQuery,
    record_command: recordCommand,
  };
}

function quote(value) {
  return `"${String(value || "").replace(/"/g, '\\"')}"`;
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\"'\"'")}'`;
}

function renderMarkdown(report) {
  const lines = [
    "# Customer Feedback Confirmation Brief",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Recommendation: ${report.recommendation}`,
    "",
  ];

  if (!report.item) {
    lines.push("No ready customer feedback action.", "");
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
    ...report.preconditions.map((item) => `- ${item}`),
    "",
    "## Draft",
    "",
    `Subject: ${item.draft.subject}`,
    "",
    "```text",
    item.draft.body,
    "```",
    "",
    "## Record After Sending",
    "",
    "```bash",
    report.record_command,
    "```",
    "",
    "## Review Schedule",
    "",
    "| Window | Date | Evidence to check |",
    "|---|---|---|",
  );

  for (const review of report.reviews) {
    lines.push(`| ${review.label} | ${review.date} | Gmail reply, customer request, testimonial permission, support issue, or no reply |`);
  }

  lines.push(
    "",
    "Gmail review query:",
    "",
    "```text",
    report.gmail_query,
    "```",
    "",
    "## Safety",
    "",
    "- This brief does not send email and does not create a Gmail draft.",
    "- Do not send unless the user provides the exact confirmation phrase.",
    "- Do not reuse the draft for other customers without a fresh queue and confirmation check.",
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

  const queue = await readJson(args.queue, null);
  const report = build({ queue, today: args.today });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Customer feedback confirmation brief: ${args.output}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
