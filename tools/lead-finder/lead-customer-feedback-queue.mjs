#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_OUTPUT = ".tmp/framer-customer-feedback-queue.md";
const DEFAULT_JSON = ".tmp/framer-customer-feedback-queue.json";

const PLUGIN_RULES = [
  {
    id: "ally_auditor",
    plugin: "Ally Auditor",
    terms: ["ally auditor"],
    confirmation: "确认发送 Ally Auditor 客户反馈邮件",
    campaign: "ally_auditor_customer_feedback",
    primary_question:
      "What were you hoping Ally Auditor would help you check or fix first: alt text, contrast, headings, client reports, or something else?",
  },
  {
    id: "loka_pro",
    plugin: "Loka - Localization Hub",
    terms: ["loka"],
    confirmation: "确认发送 Loka Pro 客户反馈邮件",
    campaign: "loka_pro_customer_feedback",
    primary_question:
      "What were you hoping Loka would help you localize first: language switching, Google Sheets workflow, translation keys, text extraction, or something else?",
  },
  {
    id: "polyglot_aeo",
    plugin: "Polyglot AEO",
    terms: ["polyglot"],
    confirmation: "确认发送 Polyglot AEO 客户反馈邮件",
    campaign: "polyglot_aeo_customer_feedback",
    primary_question:
      "What were you hoping Polyglot AEO would help you verify first: llms.txt, schema, locale coverage, CMS gaps, or client handoff proof?",
  },
  {
    id: "gaode_maps_assistant",
    plugin: "Gaode Maps",
    terms: ["gaode", "amap"],
    confirmation: "确认发送 Gaode Maps 用户反馈邮件",
    campaign: "gaode_maps_customer_feedback",
    primary_question:
      "What are you trying to build with Gaode Maps in Framer: a location page, store page, route, POI search, or something else?",
  },
];

function usage() {
  return `
Usage:
  pnpm lead:customer-feedback

Options:
  --revenue <file>       Revenue CSV. Default: ${DEFAULT_REVENUE}
  --actions <file>       Action log CSV. Default: ${DEFAULT_ACTIONS}
  --portfolio <file>     Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --experiments <file>   Portfolio experiments JSON. Default: ${DEFAULT_EXPERIMENTS}
  --output <file>        Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>          JSON output. Default: ${DEFAULT_JSON}
  --help                 Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    revenue: DEFAULT_REVENUE,
    actions: DEFAULT_ACTIONS,
    portfolio: DEFAULT_PORTFOLIO,
    experiments: DEFAULT_EXPERIMENTS,
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
    const map = {
      "--revenue": "revenue",
      "--actions": "actions",
      "--portfolio": "portfolio",
      "--experiments": "experiments",
      "--output": "output",
      "--json": "json",
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

function isExternalRevenue(row) {
  const amount = Number(row.amount_usd || 0);
  const customer = String(row.customer || "");
  const product = String(row.product || "");
  return amount > 0 && !/test/i.test(product) && !/jimmymjing@gmail\.com/i.test(customer);
}

function ruleForProduct(product) {
  const text = String(product || "").toLowerCase();
  return PLUGIN_RULES.find((rule) => rule.terms.some((term) => text.includes(term))) || null;
}

function parseCustomer(customerField, fallbackDomain = "") {
  const raw = String(customerField || "").trim();
  const email = raw.match(/<([^>]+)>/)?.[1] || raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const name = raw.replace(/<[^>]+>/g, "").trim() || (email ? email.split("@")[0] : "there");
  const domain = email ? email.split("@")[1] : fallbackDomain;
  return { name, email, domain };
}

function experimentFor(experiments, plugin) {
  return (experiments?.experiments || []).find((row) => row.plugin === plugin) || null;
}

function profileFor(portfolio, plugin) {
  return (portfolio?.profiles || []).find((row) => row.name === plugin) || null;
}

function hasSentFeedback(actions, rule, customer) {
  const needle = `${rule.campaign}\n${customer.email}`.toLowerCase();
  return actions.some((row) => {
    if (row.type !== "email_send" || row.channel !== "gmail" || row.status !== "done") return false;
    const text = `${row.type || ""}\n${row.channel || ""}\n${row.campaign || ""}\n${row.status || ""}\n${row.target || ""}\n${row.evidence || ""}\n${row.note || ""}`.toLowerCase();
    return text.includes(rule.campaign) && (customer.email ? text.includes(customer.email.toLowerCase()) : text.includes(needle));
  });
}

function statusFor({ rule, profile, experiment, sent }) {
  if (sent) return "sent_or_recorded";
  const blockerText = `${profile?.blockers?.join("\n") || ""}\n${profile?.public_health?.blockers?.join("\n") || ""}`;
  if (rule.id === "loka_pro" && /creem|compliance|warning|origin\/referrer/i.test(blockerText)) {
    return "hold_payment_compliance";
  }
  if (experiment?.status?.includes("confirmation_required")) return "ready_confirmation_required";
  return "queued_confirmation_required";
}

function draftFor({ rule, customer, row }) {
  const firstName = customer.name.split(/\s+/)[0] || "there";
  const subject = `Quick question about ${row.product}`;
  const body = [
    `Hi ${firstName},`,
    "",
    `Thanks for trying ${row.product}. I am the maker, and I am checking in personally because your feedback would help me improve the plugin in the right direction.`,
    "",
    rule.primary_question,
    "",
    "A one-line reply is perfect.",
    "",
    "Best,",
    "Jimmy",
  ].join("\n");
  return { subject, body };
}

function buildQueue({ revenueRows, actionRows, portfolio, experiments }) {
  const items = revenueRows
    .filter(isExternalRevenue)
    .map((row) => {
      const rule = ruleForProduct(row.product);
      if (!rule) return null;
      const customer = parseCustomer(row.customer, row.domain);
      const profile = profileFor(portfolio, rule.plugin);
      const experiment = experimentFor(experiments, rule.plugin);
      const sent = hasSentFeedback(actionRows, rule, customer);
      const status = statusFor({ rule, profile, experiment, sent });
      return {
        date: row.date,
        plugin: rule.plugin,
        product: row.product,
        amount_usd: Number(row.amount_usd || 0),
        customer_name: customer.name,
        customer_email: customer.email,
        customer_domain: customer.domain || row.domain || "",
        source_email_id: row.email_id || "",
        status,
        campaign: rule.campaign,
        confirmation: rule.confirmation,
        primary_metric: experiment?.primary_metric || "One useful customer reply, testimonial, feature request, or support issue.",
        risk: status === "hold_payment_compliance"
          ? "Contacting the customer before resolving the payment compliance warning could distract from the urgent Creem fix."
          : "A customer email can feel intrusive if it is long, salesy, or repeated.",
        expected_benefit: status === "hold_payment_compliance"
          ? "Preserve revenue first; then learn from a real paying Loka user once checkout compliance is safe."
          : "Learn why a real customer paid and turn that language into Marketplace copy, screenshots, FAQ, or testimonial.",
        verification: "Gmail sent id after explicit confirmation, then reply/no-reply review at 24h/48h/72h/7d; useful replies recorded in action log and plugin growth file.",
        draft: draftFor({ rule, customer, row }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.amount_usd - a.amount_usd);

  return items;
}

function statusRank(status) {
  const ranks = {
    ready_confirmation_required: 1,
    queued_confirmation_required: 2,
    hold_payment_compliance: 3,
    sent_or_recorded: 4,
  };
  return ranks[status] || 9;
}

function recommendationFor(items) {
  const ready = items.find((item) => item.status === "ready_confirmation_required");
  if (ready) return `Next customer-learning action: ${ready.plugin} feedback email to ${ready.customer_name}, only after confirmation "${ready.confirmation}".`;
  const hold = items.find((item) => item.status === "hold_payment_compliance");
  if (hold) return `Customer feedback is queued, but ${hold.plugin} should wait until payment compliance is resolved.`;
  return "No ready external customer feedback action. Keep monitoring revenue and support signals.";
}

function renderMarkdown(report) {
  const lines = [
    "# Framer Customer Feedback Queue",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Recommendation: ${report.recommendation}`,
    "",
    "## Queue",
    "",
    "| Plugin | Customer | Amount | Status | Confirmation |",
    "|---|---|---:|---|---|",
  ];
  for (const item of report.items) {
    lines.push(`| ${pipe(item.plugin)} | ${pipe(`${item.customer_name} <${item.customer_email}>`)} | $${item.amount_usd.toFixed(2)} | ${item.status} | ${pipe(item.confirmation)} |`);
  }
  if (!report.items.length) lines.push("| none |  |  |  |  |");

  for (const item of report.items) {
    lines.push(
      "",
      `## ${item.plugin} - ${item.customer_name}`,
      "",
      `- Status: ${item.status}`,
      `- Product: ${item.product}`,
      `- Source email id: ${item.source_email_id}`,
      `- Campaign: ${item.campaign}`,
      `- Primary metric: ${item.primary_metric}`,
      `- Risk: ${item.risk}`,
      `- Expected benefit: ${item.expected_benefit}`,
      `- Confirmation: ${item.confirmation}`,
      `- Verification: ${item.verification}`,
      "",
      "Draft only, not sent:",
      "",
      `Subject: ${item.draft.subject}`,
      "",
      "```text",
      item.draft.body,
      "```",
    );
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This report does not create Gmail drafts and does not send email.",
    "- Send only after the exact confirmation phrase for the matching plugin.",
    "- Record the Gmail sent id in the action log after sending.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
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

  const [revenueRows, actionRows, portfolio, experiments] = await Promise.all([
    readRows(args.revenue),
    readRows(args.actions),
    readJson(args.portfolio, null),
    readJson(args.experiments, null),
  ]);
  const items = buildQueue({ revenueRows, actionRows, portfolio, experiments });
  const report = {
    generated_at: new Date().toISOString(),
    status: items.some((item) => item.status === "ready_confirmation_required")
      ? "ready_confirmation_required"
      : items.length
        ? "queued_or_held"
        : "empty",
    recommendation: recommendationFor(items),
    items,
  };

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Customer feedback queue: ${args.output}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
