#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT = ".tmp/framer-creem-store-monitor.md";
const DEFAULT_JSON = ".tmp/framer-creem-store-monitor.json";
const DEFAULT_STATE = ".tmp/framer-creem-store-monitor-state.json";
const LIVE_API_BASE = "https://api.creem.io/v1";
const TEST_API_BASE = "https://test-api.creem.io/v1";
const DEFAULT_LIMIT = 20;
const DEFAULT_PRODUCT_FILTERS = [
  "Polyglot",
  "Polyglot AEO",
  "prod_bcBjS641fdpc7R7IPMDSQ",
  "prod_26WFDeCASuir74jHgH3Kv2",
  "prod_5XtwOdU3HaSDrB9B5I6cyx",
  "prod_537xx0G3DBLLUhM2FAOnt0",
];

function usage() {
  return `
Usage:
  pnpm lead:creem-store
  pnpm lead:creem-store -- --test-mode

Options:
  --api-base <url>        Creem API base URL. Default: live or test based on --test-mode.
  --api-key-env <name>    Environment variable containing the API key. Default: CREEM_API_KEY or CREEM_TEST_API_KEY.
  --state <file>          Local monitor state. Default: ${DEFAULT_STATE}
  --output <file>         Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>           JSON output. Default: ${DEFAULT_JSON}
  --limit <number>        Transactions to fetch. Default: ${DEFAULT_LIMIT}
  --product-filter <text> Comma-separated product/name/id filters. Default: Polyglot product names and known product ids.
  --test-mode             Use CREEM_TEST_API_KEY and test API base unless overridden.
  --no-save-state         Do not update the local monitor state after a successful fetch.
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    state: DEFAULT_STATE,
    limit: DEFAULT_LIMIT,
    saveState: true,
    productFilters: DEFAULT_PRODUCT_FILTERS,
    testMode: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--api-base") {
      args.apiBase = value;
      index += 1;
      continue;
    }
    if (key === "--api-key-env") {
      args.apiKeyEnv = value;
      index += 1;
      continue;
    }
    if (key === "--state") {
      args.state = value;
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
    if (key === "--limit") {
      args.limit = Number.parseInt(value, 10);
      if (!Number.isFinite(args.limit) || args.limit < 1 || args.limit > 100) {
        throw new Error("--limit must be an integer between 1 and 100.");
      }
      index += 1;
      continue;
    }
    if (key === "--product-filter") {
      args.productFilters = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (key === "--test-mode") {
      args.testMode = true;
      continue;
    }
    if (key === "--no-save-state") {
      args.saveState = false;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  args.apiBase = (args.apiBase || (args.testMode ? TEST_API_BASE : LIVE_API_BASE)).replace(/\/+$/, "");
  args.apiKeyEnv = args.apiKeyEnv || (args.testMode ? "CREEM_TEST_API_KEY" : "CREEM_API_KEY");
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
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
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

function transactionEndpoint(args) {
  const url = new URL(`${args.apiBase}/transactions/search`);
  url.searchParams.set("limit", String(args.limit));
  return url.toString();
}

async function fetchTransactions(args, apiKey) {
  const endpoint = transactionEndpoint(args);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "x-api-key": apiKey,
      "user-agent": "PolyglotAEOLeadMonitor/1.0",
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const message = body?.message || body?.error || response.statusText || "Creem API request failed";
    throw new Error(`${message} (${response.status})`);
  }
  return {
    endpoint,
    body,
    transactions: normalizeTransactions(body),
  };
}

function normalizeTransactions(body) {
  const items = Array.isArray(body)
    ? body
    : Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.transactions)
          ? body.transactions
          : Array.isArray(body?.results)
            ? body.results
            : [];

  return items.map((item, index) => normalizeTransaction(item, index)).filter((item) => item.id);
}

function normalizeTransaction(item, index) {
  const productValue = typeof item?.product === "string" ? item.product : "";
  const productText = [
    productValue,
    item?.product?.name,
    item?.product?.id,
    item?.product_id,
    item?.product_name,
    item?.order?.product?.name,
    item?.metadata?.product,
  ].filter(Boolean).join(" ");
  const customer = item?.customer?.email ||
    item?.customer_email ||
    item?.email ||
    item?.customer?.name ||
    item?.customer_name ||
    "";
  const currency = String(item?.currency || item?.amount?.currency || item?.total?.currency || "USD").toUpperCase();
  const amount = amountValue(item);
  const id = String(
    item?.id ||
    item?.transaction_id ||
    item?.checkout_id ||
    item?.payment_id ||
    item?.uuid ||
    `transaction_${index + 1}`,
  );

  return {
    id,
    created_at: item?.created_at || item?.createdAt || item?.created || item?.date || "",
    product: productText || "unknown",
    product_id: item?.product?.id || item?.product_id || "",
    customer,
    customer_redacted: redactEmail(customer),
    currency,
    amount_raw: amount.raw,
    amount_usd: amount.usd,
    status: item?.status || item?.type || "",
    mode: item?.mode || (item?.test_mode === true ? "test" : ""),
    evidence_id: `creem:${id}`,
  };
}

function amountValue(item) {
  const directUsd = firstNumber(
    item?.amount_usd,
    item?.amountUSD,
    item?.usd_amount,
  );
  if (directUsd !== null) {
    return { raw: String(directUsd), usd: money(directUsd) };
  }

  const cents = firstNumber(
    item?.amount_cents,
    item?.amount_in_cents,
    item?.total_cents,
    item?.subtotal_cents,
  );
  if (cents !== null) {
    return { raw: String(cents), usd: money(cents / 100) };
  }

  const amount = firstNumber(
    item?.amount,
    item?.total,
    item?.subtotal,
    item?.price,
    item?.amount_paid,
  );
  if (amount === null) return { raw: "", usd: "" };

  // Creem monetary values are commonly cents-based. Avoid tiny $1900 mistakes.
  const normalized = Number.isInteger(amount) && amount >= 100 ? amount / 100 : amount;
  return { raw: String(amount), usd: money(normalized) };
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number.parseFloat(String(value).replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function money(value) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(2).replace(/\.00$/, "");
}

function redactEmail(value) {
  const text = String(value || "");
  const match = text.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return text ? "[redacted]" : "";
  const local = match[1];
  const domain = match[2];
  return `${local.slice(0, 2)}***@${domain}`;
}

function isPolyglot(transaction, filters) {
  const haystack = [
    transaction.product,
    transaction.product_id,
    transaction.id,
  ].join(" ").toLowerCase();
  return filters.some((filter) => haystack.includes(String(filter).toLowerCase()));
}

function newTransactions(transactions, state) {
  const seen = new Set(Array.isArray(state?.seen_ids) ? state.seen_ids : []);
  const lastId = state?.last_transaction_id || "";
  if (!lastId && !seen.size) return [];
  const result = [];
  for (const item of transactions) {
    if (item.id === lastId || seen.has(item.id)) break;
    result.push(item);
  }
  return result;
}

function nextState(transactions, previous) {
  const existing = Array.isArray(previous?.seen_ids) ? previous.seen_ids : [];
  const ids = [...transactions.map((item) => item.id), ...existing]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 200);
  return {
    last_check_at: new Date().toISOString(),
    last_transaction_id: transactions[0]?.id || previous?.last_transaction_id || "",
    transaction_count: transactions.length,
    seen_ids: ids,
  };
}

function revenueCommand(transaction) {
  const args = [
    "pnpm lead:revenue --",
    "--source creem_api",
    "--status pending",
    `--product ${shellQuote(transaction.product || "Polyglot AEO")}`,
    `--email-id ${shellQuote(transaction.evidence_id)}`,
    transaction.amount_usd ? `--amount-usd ${shellQuote(transaction.amount_usd)}` : "",
    transaction.currency ? `--currency ${shellQuote(transaction.currency)}` : "",
    transaction.customer ? `--customer ${shellQuote(transaction.customer)}` : "",
    "--revenue-path plugin_pro",
    `--note ${shellQuote(`Creem API transaction ${transaction.id}`)}`,
  ].filter(Boolean);
  return args.join(" ");
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function buildMissingKey(args) {
  return {
    generated_at: new Date().toISOString(),
    status: "missing_api_key",
    test_mode: args.testMode,
    api_base: args.apiBase,
    api_key_env: args.apiKeyEnv,
    key_present: false,
    recommendation: `Set ${args.apiKeyEnv} in your local environment to monitor Creem transactions directly. Gmail revenue sweeps remain the fallback.`,
    transactions_returned: 0,
    new_transactions: [],
    polyglot_new_transactions: [],
    baseline_polyglot_transactions: [],
    revenue_commands: [],
    baseline_review_commands: [],
    state_file: args.state,
    output: args.output,
    json: args.json,
  };
}

async function build(args) {
  const apiKey = process.env[args.apiKeyEnv] || "";
  if (!apiKey) return buildMissingKey(args);

  const previousState = await readJson(args.state, null);
  try {
    const fetched = await fetchTransactions(args, apiKey);
    const newRows = newTransactions(fetched.transactions, previousState);
    const polyglotNewRows = newRows.filter((item) => isPolyglot(item, args.productFilters));
    const firstRun = !previousState?.last_transaction_id && !Array.isArray(previousState?.seen_ids);
    const baselinePolyglotRows = firstRun
      ? fetched.transactions.filter((item) => isPolyglot(item, args.productFilters))
      : [];
    const state = nextState(fetched.transactions, previousState || {});
    if (args.saveState) {
      await writeText(args.state, `${JSON.stringify(state, null, 2)}\n`);
    }
    const status = firstRun
      ? "baseline_saved"
      : polyglotNewRows.length
        ? "new_polyglot_transactions"
        : newRows.length
          ? "new_non_polyglot_transactions"
          : "no_new_transactions";

    return {
      generated_at: new Date().toISOString(),
      status,
      test_mode: args.testMode,
      api_base: args.apiBase,
      endpoint: fetched.endpoint.replace(/([?&]limit=)\d+/, `$1${args.limit}`),
      api_key_env: args.apiKeyEnv,
      key_present: true,
      state_saved: args.saveState,
      state_file: args.state,
      previous_last_transaction_id: previousState?.last_transaction_id || "",
      latest_transaction_id: fetched.transactions[0]?.id || "",
      transactions_returned: fetched.transactions.length,
      product_filters: args.productFilters,
      new_transactions: newRows,
      polyglot_new_transactions: polyglotNewRows,
      baseline_polyglot_transactions: baselinePolyglotRows,
      revenue_commands: polyglotNewRows.map(revenueCommand),
      baseline_review_commands: baselinePolyglotRows.map(revenueCommand),
      recommendation: recommendationFor({ status, polyglotNewRows, newRows, baselinePolyglotRows }),
      output: args.output,
      json: args.json,
    };
  } catch (error) {
    return {
      generated_at: new Date().toISOString(),
      status: "fetch_failed",
      test_mode: args.testMode,
      api_base: args.apiBase,
      api_key_env: args.apiKeyEnv,
      key_present: true,
      error: error?.message || String(error),
      recommendation: "Creem API monitor failed. Keep using Gmail revenue sweeps and check the Creem dashboard manually.",
      transactions_returned: 0,
      new_transactions: [],
      polyglot_new_transactions: [],
      baseline_polyglot_transactions: [],
      revenue_commands: [],
      baseline_review_commands: [],
      state_file: args.state,
      output: args.output,
      json: args.json,
    };
  }
}

function recommendationFor({ status, polyglotNewRows, newRows, baselinePolyglotRows = [] }) {
  if (status === "baseline_saved") {
    if (baselinePolyglotRows.length) {
      return `Creem store monitor baseline saved. Review ${baselinePolyglotRows.length} Polyglot-related baseline transaction(s) before assuming no historical revenue was missed; future runs will flag only new transactions.`;
    }
    return "Creem store monitor baseline saved. Future runs will flag new transactions since this snapshot.";
  }
  if (polyglotNewRows.length) {
    return "New Polyglot-related Creem transaction(s) found. Review the rows, then run the generated lead:revenue command(s) if they are real external revenue.";
  }
  if (newRows.length) {
    return "New Creem transaction(s) found, but none match the Polyglot filters. Review manually before ignoring.";
  }
  return "No new Creem transactions since the last monitor state.";
}

function renderMarkdown(data) {
  const lines = [
    "# Creem Store Monitor",
    "",
    `Generated: ${data.generated_at}`,
    `Status: ${data.status}`,
    `Mode: ${data.test_mode ? "test" : "live"}`,
    `API key env: ${data.api_key_env} (${data.key_present ? "present" : "missing"})`,
    `API base: ${data.api_base}`,
    `State file: ${data.state_file}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
  ];

  if (data.status === "missing_api_key") {
    lines.push(
      "## Setup",
      "",
      "```bash",
      `export ${data.api_key_env}='<creem-api-key>'`,
      "pnpm lead:creem-store",
      "```",
      "",
    );
    return `${lines.join("\n")}\n`;
  }

  if (data.error) {
    lines.push("## Error", "", data.error, "");
  }

  lines.push(
    "## Summary",
    "",
    `- Transactions returned: ${data.transactions_returned}`,
    `- Previous last transaction: ${data.previous_last_transaction_id || "none"}`,
    `- Latest transaction: ${data.latest_transaction_id || "none"}`,
    `- New transactions: ${data.new_transactions.length}`,
    `- New Polyglot transactions: ${data.polyglot_new_transactions.length}`,
    `- Baseline Polyglot transactions: ${data.baseline_polyglot_transactions.length}`,
    `- State saved: ${data.state_saved ? "yes" : "no"}`,
    "",
  );

  if (data.polyglot_new_transactions.length) {
    lines.push("## New Polyglot Transactions", "");
    lines.push("| Created | Product | Amount | Customer | Status | Evidence |");
    lines.push("|---|---|---:|---|---|---|");
    for (const row of data.polyglot_new_transactions) {
      lines.push(`| ${row.created_at || ""} | ${pipe(row.product)} | ${row.amount_usd || row.amount_raw || ""} ${row.currency || ""} | ${pipe(row.customer_redacted)} | ${pipe(row.status)} | ${pipe(row.evidence_id)} |`);
    }
    lines.push("");
  }

  if (data.new_transactions.length && !data.polyglot_new_transactions.length) {
    lines.push("## New Non-Polyglot Transactions", "");
    lines.push("| Created | Product | Amount | Customer | Status | Evidence |");
    lines.push("|---|---|---:|---|---|---|");
    for (const row of data.new_transactions.slice(0, 10)) {
      lines.push(`| ${row.created_at || ""} | ${pipe(row.product)} | ${row.amount_usd || row.amount_raw || ""} ${row.currency || ""} | ${pipe(row.customer_redacted)} | ${pipe(row.status)} | ${pipe(row.evidence_id)} |`);
    }
    lines.push("");
  }

  if (data.baseline_polyglot_transactions.length) {
    lines.push(
      "## Baseline Polyglot Transactions",
      "",
      "These were present on the first successful monitor run. Review them manually before recording revenue; future monitor runs will only flag transactions after this baseline.",
      "",
    );
    lines.push("| Created | Product | Amount | Customer | Status | Evidence |");
    lines.push("|---|---|---:|---|---|---|");
    for (const row of data.baseline_polyglot_transactions.slice(0, 20)) {
      lines.push(`| ${row.created_at || ""} | ${pipe(row.product)} | ${row.amount_usd || row.amount_raw || ""} ${row.currency || ""} | ${pipe(row.customer_redacted)} | ${pipe(row.status)} | ${pipe(row.evidence_id)} |`);
    }
    lines.push("");
  }

  if (data.revenue_commands.length) {
    lines.push(
      "## Revenue Commands",
      "",
      "Run only after confirming the transaction is real external Polyglot AEO revenue:",
      "",
      "```bash",
      ...data.revenue_commands,
      "```",
      "",
    );
  }

  if (data.baseline_review_commands.length) {
    lines.push(
      "## Baseline Review Commands",
      "",
      "Run only after confirming the baseline transaction is real external Polyglot AEO revenue and not already recorded:",
      "",
      "```bash",
      ...data.baseline_review_commands,
      "```",
      "",
    );
  }

  lines.push(
    "## Guardrails",
    "",
    "- Do not treat test-mode transactions as booked revenue.",
    "- Do not record unrelated Creem products as Polyglot revenue.",
    "- Keep Gmail revenue sweeps as a fallback when the API key is missing or fetch fails.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const data = await build(args);
  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Creem store monitor: ${data.status}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
