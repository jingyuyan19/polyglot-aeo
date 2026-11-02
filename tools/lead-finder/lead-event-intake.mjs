#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const DEFAULT_SITE_ID = "49fc3e5b-7ff7-4185-b578-60c81e3168ff";
const DEFAULT_FORM_NAME = "framer-aeo-event";
const DEFAULT_OUTPUT = ".tmp/framer-cta-events.md";
const DEFAULT_JSON = ".tmp/framer-cta-events.json";
const REQUEST_ATTEMPTS = Number(process.env.NETLIFY_REQUEST_RETRIES || 6);

function usage() {
  return `
Usage:
  pnpm lead:events
  pnpm lead:events -- --include-test

Options:
  --site <id>       Netlify site id. Default: ${DEFAULT_SITE_ID}
  --form <name>     Netlify event form name. Default: ${DEFAULT_FORM_NAME}
  --output <file>   Markdown report. Default: ${DEFAULT_OUTPUT}
  --json <file>     JSON report. Default: ${DEFAULT_JSON}
  --include-test    Include submissions where test_mode is truthy. Default: false
  --help            Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    site: process.env.NETLIFY_SITE_ID || DEFAULT_SITE_ID,
    form: process.env.NETLIFY_EVENT_FORM_NAME || DEFAULT_FORM_NAME,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    includeTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--site") {
      args.site = value;
      index += 1;
      continue;
    }
    if (key === "--form") {
      args.form = value;
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
    if (key === "--include-test") {
      args.includeTest = true;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

async function readNetlifyToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;

  const configPath = path.join(os.homedir(), "Library/Preferences/netlify/config.json");
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    return config?.users?.[config.userId]?.auth?.token || config?.auth?.token || config?.token || "";
  } catch {
    return "";
  }
}

async function netlifyJson({ token, path: requestPath }) {
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await requestOnce({ token, path: requestPath });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === REQUEST_ATTEMPTS) break;
      process.stderr.write(`Netlify request retry ${attempt}/${REQUEST_ATTEMPTS - 1}: ${error.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw lastError;
}

function requestOnce({ token, path: requestPath }) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: "GET",
        hostname: "api.netlify.com",
        path: requestPath,
        timeout: 60000,
        agent: false,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          Connection: "close",
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(JSON.parse(text));
            return;
          }

          const error = new Error(`Netlify API returned HTTP ${response.statusCode}: ${text.slice(0, 200)}`);
          error.statusCode = response.statusCode;
          reject(error);
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("Netlify API request timed out")));
    request.on("error", reject);
    request.end();
  });
}

function isRetryable(error) {
  if (error.statusCode && error.statusCode >= 500) return true;
  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(error.code) || /timed out|ECONNRESET|socket hang up/i.test(error.message);
}

function valueFromSubmission(submission, key) {
  return submission?.data?.[key] || submission?.body?.[key] || submission?.[key] || "";
}

function normalizeEvent(submission) {
  const eventType = String(valueFromSubmission(submission, "event_type")).trim();
  const cta = String(valueFromSubmission(submission, "cta")).trim();
  const sourcePath = String(valueFromSubmission(submission, "source_path")).trim();
  const landingPath = String(valueFromSubmission(submission, "landing_path")).trim();
  const destination = String(valueFromSubmission(submission, "destination")).trim();
  const ts = String(valueFromSubmission(submission, "ts")).trim();

  return {
    id: submission.id || "",
    number: submission.number || "",
    created_at: submission.created_at || submission.createdAt || ts || "",
    event_type: eventType || "unknown",
    cta: cta || "unknown",
    destination,
    source_path: sourcePath || "unknown",
    landing_path: landingPath,
    referrer: String(valueFromSubmission(submission, "referrer")).trim(),
    ts,
    utm_source: String(valueFromSubmission(submission, "utm_source")).trim(),
    utm_medium: String(valueFromSubmission(submission, "utm_medium")).trim(),
    utm_campaign: String(valueFromSubmission(submission, "utm_campaign")).trim(),
    utm_content: String(valueFromSubmission(submission, "utm_content")).trim(),
    utm_term: String(valueFromSubmission(submission, "utm_term")).trim(),
    reason: String(valueFromSubmission(submission, "reason")).trim(),
    project_id: String(valueFromSubmission(submission, "project_id")).trim(),
    test_mode: String(valueFromSubmission(submission, "test_mode")).trim(),
  };
}

function isTruthy(value) {
  return /^(1|true|yes|y)$/i.test(String(value || "").trim());
}

function isTestEvent(event) {
  return isTruthy(event.test_mode);
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key] || "unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderCounts(title, counts, emptyText) {
  const lines = [`## ${title}`, ""];
  if (!counts.length) {
    lines.push(emptyText, "");
    return lines;
  }

  lines.push("| Value | Events |");
  lines.push("|---|---:|");
  for (const [value, count] of counts) {
    lines.push(`| ${value || "unknown"} | ${count} |`);
  }
  lines.push("");
  return lines;
}

function renderMarkdown({ form, events, ignoredTestEvents }) {
  const lines = [
    "# Framer CTA Event Intake",
    "",
    `Form: ${form.name} (${form.id})`,
    `Events: ${events.length}`,
    `Ignored test events: ${ignoredTestEvents.length}`,
    "",
  ];

  lines.push(...renderCounts("By Event Type", countBy(events, "event_type"), "No CTA events yet."));
  lines.push(...renderCounts("By CTA", countBy(events, "cta"), "No CTA events yet."));
  lines.push(...renderCounts("By Source Path", countBy(events, "source_path"), "No CTA events yet."));
  lines.push(...renderCounts("By Upgrade Reason", countBy(events, "reason").filter(([value]) => value), "No plugin upgrade reasons yet."));
  lines.push(...renderCounts("By Campaign", countBy(events, "utm_campaign").filter(([value]) => value), "No UTM campaigns yet."));

  lines.push("## Recent Events", "");
  if (!events.length) {
    lines.push("No CTA events yet.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Created | Type | CTA | Source | Reason | Campaign | Destination |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const item of events.slice(0, 20)) {
    lines.push(
      `| ${item.created_at || "unknown"} | ${item.event_type} | ${item.cta} | ${item.source_path} | ${item.reason || ""} | ${item.utm_campaign || ""} | ${item.destination || ""} |`,
    );
  }
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

  const token = await readNetlifyToken();
  if (!token) {
    throw new Error("Netlify token not found. Run netlify login or set NETLIFY_AUTH_TOKEN.");
  }

  const forms = await netlifyJson({
    token,
    path: `/api/v1/sites/${encodeURIComponent(args.site)}/forms`,
  });
  const form = forms.find((item) => item.name === args.form);
  if (!form) {
    throw new Error(`Netlify event form not found: ${args.form}`);
  }

  const submissions = await netlifyJson({
    token,
    path: `/api/v1/forms/${encodeURIComponent(form.id)}/submissions`,
  });
  const allEvents = submissions.map(normalizeEvent).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const ignoredTestEvents = args.includeTest ? [] : allEvents.filter(isTestEvent);
  const events = args.includeTest ? allEvents : allEvents.filter((event) => !isTestEvent(event));

  await writeText(args.output, renderMarkdown({ form, events, ignoredTestEvents }));
  await writeText(args.json, `${JSON.stringify({ form, events, ignored_test_events: ignoredTestEvents }, null, 2)}\n`);

  process.stdout.write(`CTA events: ${events.length}\n`);
  if (ignoredTestEvents.length) {
    process.stdout.write(`Ignored test events: ${ignoredTestEvents.length}\n`);
  }
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
