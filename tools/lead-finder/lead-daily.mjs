#!/usr/bin/env node

import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROSPECTS = "tools/lead-finder/framer-prospects.local.txt";
const DEFAULT_SEARCH_INPUT = "tools/lead-finder/search-results.local.txt";
const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_LEADS = ".tmp/framer-leads.csv";
const DEFAULT_OUTREACH_MD = ".tmp/framer-outreach.md";
const DEFAULT_OUTREACH_CSV = ".tmp/framer-outreach.csv";
const DEFAULT_ACTIONS = ".tmp/framer-actions.md";

const dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  return `
Usage:
  pnpm lead:daily
  pnpm lead:daily -- --search-input tools/lead-finder/search-results.local.txt

Options:
  --search-input <file>     Raw copied search results. Default if present: ${DEFAULT_SEARCH_INPUT}
  --skip-discover           Do not run discovery even if search input exists.
  --prospects <file>        Prospect URL list. Default: ${DEFAULT_PROSPECTS}
  --crm <file>              Local CRM CSV. Default: ${DEFAULT_CRM}
  --today <YYYY-MM-DD>      Date passed to CRM.
  --limit <number>          Outreach draft limit. Default: lead:outreach default.
  --min-score <number>      Outreach minimum pain_score. Default: lead:outreach default.
  --timeout-ms <number>     Scan timeout. Default: lead:find default.
  --retries <number>        Scan retries. Default: lead:find default.
  --help                    Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    prospects: DEFAULT_PROSPECTS,
    crm: DEFAULT_CRM,
    searchInput: "",
    skipDiscover: false,
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
    if (key === "--search-input") {
      args.searchInput = value && !value.startsWith("--") ? value : DEFAULT_SEARCH_INPUT;
      if (value && !value.startsWith("--")) index += 1;
      continue;
    }
    if (key === "--skip-discover") {
      args.skipDiscover = true;
      continue;
    }
    if (key === "--prospects") {
      args.prospects = value;
      index += 1;
      continue;
    }
    if (key === "--crm") {
      args.crm = value;
      index += 1;
      continue;
    }
    if (key === "--today") {
      args.today = value;
      index += 1;
      continue;
    }
    if (key === "--limit") {
      args.limit = value;
      index += 1;
      continue;
    }
    if (key === "--min-score") {
      args.minScore = value;
      index += 1;
      continue;
    }
    if (key === "--timeout-ms") {
      args.timeoutMs = value;
      index += 1;
      continue;
    }
    if (key === "--retries") {
      args.retries = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function script(name) {
  return path.join(dirname, name);
}

function runNode(scriptName, args) {
  const command = [script(scriptName), ...args];
  process.stdout.write(`\n$ node ${path.relative(process.cwd(), command[0])} ${args.join(" ")}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, command, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${scriptName} exited with signal ${signal}`));
      } else if (code) {
        reject(new Error(`${scriptName} failed with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  if (!args.skipDiscover) {
    const searchInput = args.searchInput || ((await exists(DEFAULT_SEARCH_INPUT)) ? DEFAULT_SEARCH_INPUT : "");
    if (searchInput) {
      await runNode("lead-discover.mjs", [
        "--input",
        searchInput,
        "--append-to",
        args.prospects,
      ]);
    }
  }

  if (!(await exists(args.prospects))) {
    throw new Error(
      `No prospects file found at ${args.prospects}. Add URLs there or run with --search-input <file>.`,
    );
  }

  const findArgs = ["--input", args.prospects, "--output", DEFAULT_LEADS];
  if (args.timeoutMs) findArgs.push("--timeout-ms", args.timeoutMs);
  if (args.retries) findArgs.push("--retries", args.retries);
  await runNode("lead-finder.mjs", findArgs);

  const outreachArgs = [
    "--input",
    DEFAULT_LEADS,
    "--output-md",
    DEFAULT_OUTREACH_MD,
    "--output-csv",
    DEFAULT_OUTREACH_CSV,
  ];
  if (args.limit) outreachArgs.push("--limit", args.limit);
  if (args.minScore) outreachArgs.push("--min-score", args.minScore);
  await runNode("lead-outreach.mjs", outreachArgs);

  const crmArgs = [
    "--import",
    DEFAULT_OUTREACH_CSV,
    "--crm",
    args.crm,
    "--due-md",
    DEFAULT_ACTIONS,
    "--summary",
  ];
  if (args.today) crmArgs.push("--today", args.today);
  await runNode("lead-crm.mjs", crmArgs);

  process.stdout.write(
    `\nDaily lead run complete.\nReview ${DEFAULT_ACTIONS}, then manually verify each queued lead before sending.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
