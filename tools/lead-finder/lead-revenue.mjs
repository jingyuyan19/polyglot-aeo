#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";

const REVENUE_COLUMNS = [
  "date",
  "source",
  "status",
  "amount_usd",
  "currency",
  "product",
  "customer",
  "email_id",
  "domain",
  "revenue_path",
  "notes",
];

const VALID_STATUSES = new Set(["pending", "verified", "refunded", "ignored"]);

function usage() {
  return `
Usage:
  pnpm lead:revenue -- --source creem --status pending --product "Polyglot AEO" --email-id 19f12902f31ad441 --note "Gmail subject: You made a sale!"
  pnpm lead:revenue -- --summary

Options:
  --revenue <file>        Revenue CSV. Default: ${DEFAULT_REVENUE}
  --date <YYYY-MM-DD>     Event date. Default: local date.
  --source <text>         Source system, e.g. creem, stripe, manual, gmail.
  --status <status>       pending, verified, refunded, ignored. Default: pending.
  --amount-usd <amount>   Actual amount in USD when known.
  --currency <code>       Original currency. Default: USD.
  --product <text>        Product or offer name.
  --customer <text>       Customer name or email when known.
  --email-id <id>         Gmail message id or external evidence id for dedupe.
  --domain <domain>       Related lead domain when known.
  --revenue-path <text>   plugin, launch_qa, implementation, etc.
  --note <text>           Append evidence or context.
  --summary               Print totals without adding/updating an event.
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    revenue: DEFAULT_REVENUE,
    date: todayLocal(),
    status: "pending",
    currency: "USD",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") {
      continue;
    }
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--summary") {
      args.summary = true;
      continue;
    }
    if (key === "--revenue") {
      args.revenue = value;
      index += 1;
      continue;
    }
    if (key === "--date") {
      args.date = value;
      index += 1;
      continue;
    }
    if (key === "--source") {
      args.source = value;
      index += 1;
      continue;
    }
    if (key === "--status") {
      args.status = value;
      index += 1;
      continue;
    }
    if (key === "--amount-usd") {
      args.amountUsd = normalizeAmount(value);
      index += 1;
      continue;
    }
    if (key === "--currency") {
      args.currency = String(value || "USD").trim().toUpperCase();
      index += 1;
      continue;
    }
    if (key === "--product") {
      args.product = value;
      index += 1;
      continue;
    }
    if (key === "--customer") {
      args.customer = value;
      index += 1;
      continue;
    }
    if (key === "--email-id") {
      args.emailId = value;
      index += 1;
      continue;
    }
    if (key === "--domain") {
      args.domain = normalizeDomain(value);
      index += 1;
      continue;
    }
    if (key === "--revenue-path") {
      args.revenuePath = value;
      index += 1;
      continue;
    }
    if (key === "--note") {
      args.note = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  if (!VALID_STATUSES.has(args.status)) {
    throw new Error(`--status must be one of: ${Array.from(VALID_STATUSES).join(", ")}`);
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

function normalizeAmount(value) {
  const cleaned = String(value || "").replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("--amount-usd must be a non-negative number.");
  }
  return parsed.toFixed(2).replace(/\.00$/, "");
}

function normalizeDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return raw.toLowerCase().replace(/^www\./, "");
  }
}

async function readRows(file) {
  try {
    return parseCsv(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
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

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
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

  if (!rows.length) {
    return [];
  }

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  return (
    [
      REVENUE_COLUMNS.join(","),
      ...rows.map((row) => REVENUE_COLUMNS.map((column) => csvEscape(row[column])).join(",")),
    ].join("\n") + "\n"
  );
}

async function writeRows(file, rows) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, toCsv(rows), "utf8");
}

function eventKey(row) {
  if (row.email_id) {
    return `email:${row.email_id}`;
  }
  return [
    row.date || "",
    row.source || "",
    row.product || "",
    row.customer || "",
    row.domain || "",
    row.amount_usd || "",
  ].join("|");
}

function buildEvent(args) {
  if (!args.source) {
    throw new Error("--source is required when recording a revenue event.");
  }

  return {
    date: args.date,
    source: args.source,
    status: args.status,
    amount_usd: args.amountUsd || "",
    currency: args.currency || "USD",
    product: args.product || "",
    customer: args.customer || "",
    email_id: args.emailId || "",
    domain: args.domain || "",
    revenue_path: args.revenuePath || "",
    notes: args.note || "",
  };
}

function upsert(rows, event) {
  const key = eventKey(event);
  const existing = rows.find((row) => eventKey(row) === key);

  if (!existing) {
    rows.push(event);
    return { rows, action: "added" };
  }

  for (const column of REVENUE_COLUMNS) {
    if (event[column]) {
      existing[column] = event[column];
    }
  }

  return { rows, action: "updated" };
}

function money(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatUsd(value) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function summary(rows) {
  const verified = rows.filter((row) => row.status === "verified");
  const pending = rows.filter((row) => row.status === "pending");
  const refunded = rows.filter((row) => row.status === "refunded");
  const verifiedValue = verified.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const pendingKnownValue = pending.reduce((sum, row) => sum + money(row.amount_usd), 0);
  const refundedValue = refunded.reduce((sum, row) => sum + money(row.amount_usd), 0);

  return [
    `Revenue events: ${rows.length}`,
    `Verified revenue: ${formatUsd(verifiedValue)} (${verified.length} event(s))`,
    `Pending revenue signals: ${pending.length}${pendingKnownValue ? `, ${formatUsd(pendingKnownValue)} known value` : ""}`,
    `Refunded revenue: ${formatUsd(refundedValue)} (${refunded.length} event(s))`,
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  let rows = await readRows(args.revenue);

  if (!args.summary) {
    const event = buildEvent(args);
    const result = upsert(rows, event);
    rows = result.rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    await writeRows(args.revenue, rows);
    process.stdout.write(`Revenue event ${result.action}: ${event.source} ${event.status} ${event.product || ""}\n`);
  }

  process.stdout.write(`${summary(rows)}\n`);
  process.stdout.write(`Revenue ledger: ${args.revenue}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
