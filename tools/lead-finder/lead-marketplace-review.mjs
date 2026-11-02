#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_ZIP = "plugin.zip";
const DEFAULT_PLUGIN = "Polyglot AEO";
const DEFAULT_OUTPUT = ".tmp/framer-marketplace-review.md";
const DEFAULT_JSON = ".tmp/framer-marketplace-review.json";
const UPLOAD_EVIDENCE_PLACEHOLDER = "<framer-upload-confirmation-url-or-screenshot>";
const CREATOR_SPACE_EVIDENCE_PLACEHOLDER = "<creator-space-dashboard-snapshot-or-upload-confirmation>";

function usage() {
  return `
Usage:
  pnpm lead:marketplace-review

Options:
  --marketplace <file> Marketplace snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --actions <file>     External action log CSV. Default: ${DEFAULT_ACTIONS}
  --preflight <file>   Marketplace preflight JSON. Default: ${DEFAULT_PREFLIGHT}
  --zip <file>         Current plugin package. Default: ${DEFAULT_ZIP}
  --plugin <name>      Marketplace snapshot plugin. Default: ${DEFAULT_PLUGIN}
  --output <file>      Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>        JSON output. Default: ${DEFAULT_JSON}
  --help               Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    marketplace: DEFAULT_MARKETPLACE,
    actions: DEFAULT_ACTIONS,
    preflight: DEFAULT_PREFLIGHT,
    zip: DEFAULT_ZIP,
    plugin: DEFAULT_PLUGIN,
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
    if (key === "--marketplace") {
      args.marketplace = value;
      index += 1;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
      index += 1;
      continue;
    }
    if (key === "--preflight") {
      args.preflight = value;
      index += 1;
      continue;
    }
    if (key === "--zip") {
      args.zip = value;
      index += 1;
      continue;
    }
    if (key === "--plugin") {
      args.plugin = value;
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

async function readJson(file, fallback = null) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

function number(value) {
  return Number.parseInt(value || "0", 10) || 0;
}

function latestRows(rows) {
  return [...rows].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index,
  );
}

function metricDelta(current, previous, key) {
  if (!current || !previous) return 0;
  return number(current[key]) - number(previous[key]);
}

function rowMentionsSha(row, sha256) {
  if (!sha256) return false;
  return Object.entries(row)
    .filter(([key]) => key !== "__index")
    .some(([, value]) => String(value).includes(sha256));
}

function review({
  snapshots,
  actions,
  preflight,
  currentPackageSha256,
  plugin,
}) {
  const pluginSnapshots = snapshots.filter((row) => row.plugin === plugin);
  const sortedSnapshots = latestRows(pluginSnapshots);
  const latest = sortedSnapshots[0] || null;
  const previous = sortedSnapshots[1] || null;
  const uploadActions = actions.filter(
    (row) => row.type === "marketplace_upload" && row.campaign === "plugin_upgrade",
  );
  const plannedUploads = uploadActions.filter((row) => row.status !== "done" && row.status !== "skipped");
  const doneUploads = uploadActions.filter((row) => row.status === "done");
  const currentPackageDoneUploads = doneUploads.filter((row) =>
    rowMentionsSha(row, currentPackageSha256),
  );
  const deltas = latest && previous
    ? {
        users: metricDelta(latest, previous, "users"),
        opens: metricDelta(latest, previous, "opens"),
        version: metricDelta(latest, previous, "version"),
        updated_changed: latest.updated !== previous.updated,
      }
    : {
        users: 0,
        opens: 0,
        version: 0,
        updated_changed: false,
      };

  return {
    generated_at: new Date().toISOString(),
    plugin,
    snapshots: pluginSnapshots.length,
    upload_planned: plannedUploads.length,
    upload_done: currentPackageDoneUploads.length,
    historical_upload_done: doneUploads.length,
    current_package_sha256: currentPackageSha256,
    latest_snapshot: latest,
    previous_snapshot: previous,
    deltas,
    marketplace_preflight: preflight
      ? {
          verdict: preflight.verdict || "unknown",
          upload_allowed: preflight.upload_allowed === true,
          blockers: Array.isArray(preflight.blockers) ? preflight.blockers : [],
        }
      : null,
    status: statusFor({
      snapshots,
      doneUploads: currentPackageDoneUploads,
      deltas,
      preflight,
    }),
    recommendation: recommendationFor({
      snapshots,
      plannedUploads,
      doneUploads: currentPackageDoneUploads,
      deltas,
      preflight,
    }),
  };
}

function statusFor({ snapshots, doneUploads, deltas, preflight }) {
  if (!doneUploads.length && preflight && preflight.upload_allowed !== true) {
    return "preflight_blocked";
  }
  if (!doneUploads.length) return "upload_not_logged";
  if (snapshots.length < 2) return "needs_after_upload_snapshot";
  if (deltas.version > 0 || deltas.opens > 0 || deltas.users > 0 || deltas.updated_changed) {
    return "marketplace_changed";
  }
  return "upload_logged_no_snapshot_change";
}

function recommendationFor({ snapshots, plannedUploads, doneUploads, deltas, preflight }) {
  if (!doneUploads.length && preflight && preflight.upload_allowed !== true) {
    const count = Array.isArray(preflight.blockers) ? preflight.blockers.length : 0;
    const blockers = count
      ? ` Preflight has ${count} blocker(s); see Marketplace Preflight Blockers below.`
      : "";
    return `Do not upload to Framer Marketplace until preflight allows it.${blockers}`.replace(/\.\.$/, ".");
  }
  if (!doneUploads.length) {
    return `Upload the current plugin.zip in Framer Marketplace, then record it with \`pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${UPLOAD_EVIDENCE_PLACEHOLDER}'\` after replacing the evidence placeholder.`;
  }
  if (snapshots.length < 2) {
    return `Record an after-upload Creator Space snapshot with \`pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${CREATOR_SPACE_EVIDENCE_PLACEHOLDER}' --users <users> --opens <opens> --version <version> --updated "<updated>"\`, then rerun \`pnpm lead:marketplace-review\`.`;
  }
  if (deltas.version > 0 || deltas.updated_changed) {
    return "Marketplace version/update changed. Monitor opens/users plus checkout CTA events after distribution.";
  }
  if (deltas.opens > 0 || deltas.users > 0) {
    return "Marketplace traffic changed. Pair this with `pnpm lead:events` to check checkout intent.";
  }
  if (plannedUploads.length) {
    return "Upload is still planned and latest snapshot has no change. Finish the upload or keep it planned.";
  }
  return "Upload is marked done but Creator Space metrics did not change. Re-check the marketplace dashboard and add a fresh snapshot.";
}

function renderMarkdown(data) {
  const latest = data.latest_snapshot;
  const previous = data.previous_snapshot;
  const lines = [
    "# Framer Marketplace Review",
    "",
    `Generated: ${data.generated_at}`,
    `Plugin: ${data.plugin}`,
    `Status: ${data.status}`,
    `Current package upload actions done: ${data.upload_done}`,
    `Historical upload actions done: ${data.historical_upload_done}`,
    `Current package SHA256: ${data.current_package_sha256}`,
    `Upload actions planned/open: ${data.upload_planned}`,
    `Snapshots: ${data.snapshots}`,
    data.marketplace_preflight
      ? `Marketplace preflight: ${data.marketplace_preflight.verdict} (upload allowed ${data.marketplace_preflight.upload_allowed ? "yes" : "no"})`
      : "Marketplace preflight: missing",
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Latest Snapshot",
    "",
  ];

  if (!latest) {
    lines.push("No marketplace snapshots recorded.", "");
  } else {
    lines.push(
      `- Date: ${latest.date}`,
      `- Users: ${latest.users}${previous ? ` (${formatDelta(data.deltas.users)})` : ""}`,
      `- Opens: ${latest.opens}${previous ? ` (${formatDelta(data.deltas.opens)})` : ""}`,
      `- Version: ${latest.version}${previous ? ` (${formatDelta(data.deltas.version)})` : ""}`,
      `- Updated: ${latest.updated}${previous ? ` (${data.deltas.updated_changed ? "changed" : "same"})` : ""}`,
      latest.note ? `- Note: ${latest.note}` : "",
      "",
    );
  }

  if (Array.isArray(data.marketplace_preflight?.blockers) && data.marketplace_preflight.blockers.length) {
    lines.push("## Marketplace Preflight Blockers", "");
    for (const blocker of data.marketplace_preflight.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  lines.push(
    "## Commands",
    "",
    "```bash",
    "pnpm release:marketplace-brief",
    "pnpm lead:marketplace-preflight",
    `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${UPLOAD_EVIDENCE_PLACEHOLDER}'`,
    `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${CREATOR_SPACE_EVIDENCE_PLACEHOLDER}' --users <users> --opens <opens> --version <version> --updated "<updated>"`,
    "pnpm lead:marketplace-review",
    "pnpm lead:events && pnpm lead:ops && pnpm lead:report",
    "```",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function formatDelta(value) {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const [snapshots, actions, preflight, currentPackageSha256] = await Promise.all([
    readRows(args.marketplace),
    readRows(args.actions),
    readJson(args.preflight),
    sha256(args.zip),
  ]);
  const data = review({
    snapshots,
    actions,
    preflight,
    currentPackageSha256,
    plugin: args.plugin,
  });
  await writeText(args.output, renderMarkdown(data));
  await writeText(args.json, `${JSON.stringify(data, null, 2)}\n`);
  process.stdout.write(`Marketplace review: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
