#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_MARKETPLACE_PUBLIC = ".tmp/framer-marketplace-public.json";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_COMMUNITY_PREFLIGHT = ".tmp/framer-community-preflight.json";
const DEFAULT_OUTPUT = ".tmp/framer-marketplace-postflight.md";
const DEFAULT_JSON = ".tmp/framer-marketplace-postflight.json";
const UPLOAD_TYPE = "marketplace_upload";
const UPLOAD_CAMPAIGN = "plugin_upgrade";
const UPLOAD_EVIDENCE_PLACEHOLDER = "<framer-upload-confirmation-url-or-screenshot>";
const CREATOR_SPACE_EVIDENCE_PLACEHOLDER = "<creator-space-dashboard-snapshot-or-upload-confirmation>";

function usage() {
  return `
Usage:
  pnpm lead:marketplace-postflight

Options:
  --actions <file>              External action log CSV. Default: ${DEFAULT_ACTIONS}
  --marketplace <file>          Creator Space snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --marketplace-preflight <file> Marketplace preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --marketplace-public <file>   Public listing snapshot JSON. Default: ${DEFAULT_MARKETPLACE_PUBLIC}
  --events <file>               CTA event JSON. Default: ${DEFAULT_EVENTS}
  --forms <file>                Form intake JSON. Default: ${DEFAULT_FORMS}
  --community-preflight <file>  Community publish preflight JSON. Default: ${DEFAULT_COMMUNITY_PREFLIGHT}
  --output <file>               Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                 JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>          Local date. Default: local date.
  --help                        Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    marketplace: DEFAULT_MARKETPLACE,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    marketplacePublic: DEFAULT_MARKETPLACE_PUBLIC,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
    communityPreflight: DEFAULT_COMMUNITY_PREFLIGHT,
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
    if (key === "--marketplace") {
      args.marketplace = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-preflight") {
      args.marketplacePreflight = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-public") {
      args.marketplacePublic = value;
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
    if (key === "--community-preflight") {
      args.communityPreflight = value;
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

function number(value) {
  return Number.parseInt(value || "0", 10) || 0;
}

function latestRows(rows) {
  return [...rows].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index,
  );
}

function latestUpload(actions) {
  return latestRows(
    actions.filter(
      (row) =>
        row.type === UPLOAD_TYPE &&
        row.campaign === UPLOAD_CAMPAIGN &&
        row.status === "done",
    ),
  )[0] || null;
}

function latestCreatorSnapshot(rows) {
  return latestRows(rows.filter((row) => row.date))[0] || null;
}

function afterUploadCreatorSnapshot(rows, upload) {
  if (!upload) return null;
  const candidates = rows.filter(
    (row) =>
      row.date &&
      row.date >= upload.date &&
      /after plugin\.zip upload|after upload|uploaded/i.test(row.note || ""),
  );
  return latestRows(candidates)[0] || null;
}

function eventCampaign(event) {
  return event?.utm_campaign || event?.campaign || "";
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

function pluginUpgradeEvents(eventsData) {
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];
  return events.filter(
    (event) =>
      eventCampaign(event) === UPLOAD_CAMPAIGN ||
      event.reason ||
      String(event.destination || "").includes("/checkout"),
  );
}

function pluginUpgradeForms(formsData) {
  const submissions = Array.isArray(formsData.submissions) ? formsData.submissions : [];
  return submissions.filter((item) => formCampaign(item) === UPLOAD_CAMPAIGN);
}

function marketplaceDeltas(current, previous) {
  return {
    users: current && previous ? number(current.users) - number(previous.users) : 0,
    opens: current && previous ? number(current.opens) - number(previous.opens) : 0,
    version: current && previous ? number(current.version) - number(previous.version) : 0,
    updated_changed: Boolean(current && previous && current.updated !== previous.updated),
  };
}

function publicSignal(publicSnapshot) {
  const snapshot = publicSnapshot?.snapshot || null;
  return {
    readable: Boolean(snapshot?.ok),
    likes: number(snapshot?.likes),
    comments: number(snapshot?.comments),
    updated_at: snapshot?.updated_at || "",
    published_at: snapshot?.published_at || "",
    framer_plugin_id: snapshot?.framer_plugin_id || "",
  };
}

function assess({
  args,
  actions,
  marketplaceRows,
  marketplacePreflight,
  marketplacePublic,
  eventsData,
  formsData,
  communityPreflight,
}) {
  const upload = latestUpload(actions);
  const latestSnapshot = latestCreatorSnapshot(marketplaceRows);
  const afterSnapshot = afterUploadCreatorSnapshot(marketplaceRows, upload);
  const previousSnapshot = latestRows(marketplaceRows.filter((row) => row !== latestSnapshot))[0] || null;
  const deltas = marketplaceDeltas(latestSnapshot, previousSnapshot);
  const publicData = publicSignal(marketplacePublic);
  const upgradeEvents = pluginUpgradeEvents(eventsData);
  const upgradeForms = pluginUpgradeForms(formsData);
  const preflightBlockers = Array.isArray(marketplacePreflight?.blockers)
    ? marketplacePreflight.blockers
    : [];
  const blockers = [];
  const missing = [];
  const signals = [];

  if (!upload) {
    blockers.push("Marketplace upload is not logged.");
    missing.push("Upload the current plugin.zip in Framer Marketplace and record it.");
  }
  if (!marketplacePreflight?.upload_allowed) {
    blockers.push(`Marketplace preflight is ${marketplacePreflight?.verdict || "missing"}, not ready_to_upload.`);
    for (const blocker of preflightBlockers) {
      blockers.push(`Preflight blocker: ${blocker}`);
    }
  }
  if (upload && !afterSnapshot) {
    missing.push("Record an after-upload Creator Space users/opens/version/updated snapshot.");
  }
  if (!publicData.readable) {
    missing.push("Refresh the public Marketplace listing snapshot.");
  }
  if (publicData.likes > 0) signals.push(`${publicData.likes} public Marketplace like(s)`);
  if (publicData.comments > 0) signals.push(`${publicData.comments} public Marketplace comment(s)`);
  if (deltas.users > 0) signals.push(`${deltas.users} Creator Space user delta`);
  if (deltas.opens > 0) signals.push(`${deltas.opens} Creator Space open delta`);
  if (upgradeEvents.length > 0) signals.push(`${upgradeEvents.length} plugin upgrade CTA event(s)`);
  if (upgradeForms.length > 0) signals.push(`${upgradeForms.length} plugin upgrade form(s)`);

  const status = statusFor({ upload, afterSnapshot, publicData, signals });
  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    status,
    upload_logged: Boolean(upload),
    upload_action: upload,
    marketplace_preflight: {
      verdict: marketplacePreflight?.verdict || "missing",
      upload_allowed: Boolean(marketplacePreflight?.upload_allowed),
      sha256: marketplacePreflight?.zip?.sha256 || "",
      blockers: preflightBlockers,
    },
    creator_space: {
      latest_snapshot: latestSnapshot,
      after_upload_snapshot: afterSnapshot,
      previous_snapshot: previousSnapshot,
      deltas,
    },
    public_listing: publicData,
    plugin_upgrade_events: upgradeEvents.length,
    plugin_upgrade_forms: upgradeForms.length,
    community_preflight: {
      verdict: communityPreflight?.verdict || "missing",
      publish_allowed: Boolean(communityPreflight?.publish_allowed),
      blockers: Array.isArray(communityPreflight?.blockers) ? communityPreflight.blockers : [],
    },
    blockers,
    missing,
    signals,
    postflight_complete: status === "signal_found" || status === "monitoring_ready",
    recommendation: recommendationFor({ status, missing, signals, communityPreflight, marketplacePreflight }),
    commands: commandsFor({
      upload: Boolean(upload),
      afterSnapshot: Boolean(afterSnapshot),
      uploadAllowed: Boolean(marketplacePreflight?.upload_allowed),
    }),
  };
}

function statusFor({ upload, afterSnapshot, publicData, signals }) {
  if (!upload) return "upload_not_logged";
  if (!afterSnapshot) return "needs_creator_space_snapshot";
  if (!publicData.readable) return "needs_public_listing_snapshot";
  if (signals.length) return "signal_found";
  return "monitoring_ready";
}

function recommendationFor({ status, missing, signals, communityPreflight, marketplacePreflight }) {
  if (status === "upload_not_logged" && marketplacePreflight?.upload_allowed !== true) {
    const count = Array.isArray(marketplacePreflight?.blockers)
      ? marketplacePreflight.blockers.length
      : 0;
    const blockers = count
      ? ` Preflight has ${count} blocker(s); see the Blockers section for details.`
      : "";
    return `Do not upload or run postflight yet; Marketplace preflight must pass first.${blockers}`.replace(/\.\.$/, ".");
  }
  if (status === "upload_not_logged") {
    return "Upload is still the next external step. Do not run Community distribution until Marketplace upload is logged and postflight is rerun.";
  }
  if (status === "needs_creator_space_snapshot") {
    return "Record Creator Space users/opens/version/updated immediately after upload, then rerun postflight.";
  }
  if (status === "needs_public_listing_snapshot") {
    return "Refresh the public Marketplace listing snapshot with `pnpm lead:marketplace-public -- --record`.";
  }
  if (signals.length) {
    return "Marketplace has traction signal. Fulfill comments/forms/CTA intent before broader posting.";
  }
  if (communityPreflight?.publish_allowed) {
    return "Postflight is ready and Community preflight allows the first Community test after explicit confirmation.";
  }
  return missing.length
    ? `Postflight still needs: ${missing.join("; ")}`
    : "Marketplace upload is recorded and monitoring is ready. Rerun events/forms/public snapshots before deciding on Community.";
}

function commandsFor({ upload, afterSnapshot, uploadAllowed }) {
  const commands = [
    "pnpm lead:marketplace-preflight",
    "pnpm lead:marketplace-public -- --record",
  ];
  if (!upload && uploadAllowed) {
    commands.push(
      `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${UPLOAD_EVIDENCE_PLACEHOLDER}' --note 'uploaded from Framer Marketplace New Version flow'`,
    );
  }
  if (upload && !afterSnapshot) {
    commands.push(
      `pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '${CREATOR_SPACE_EVIDENCE_PLACEHOLDER}' --users <users> --opens <opens> --version <version> --updated "<updated>"`,
    );
  }
  commands.push(
    "pnpm lead:marketplace-review",
    "pnpm lead:forms && pnpm lead:events",
    "pnpm lead:community-preflight",
    "pnpm lead:action-review && pnpm lead:channel-priority",
    "pnpm lead:ops && pnpm lead:report",
  );
  return commands;
}

function renderMarkdown(data) {
  const lines = [
    "# Framer Marketplace Postflight",
    "",
    `Generated: ${data.generated_at}`,
    `Date: ${data.today}`,
    `Status: ${data.status}`,
    `Postflight complete: ${data.postflight_complete ? "yes" : "no"}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Upload",
    "",
    `- Upload logged: ${data.upload_logged ? "yes" : "no"}`,
    `- Marketplace preflight: ${data.marketplace_preflight.verdict} (upload allowed ${data.marketplace_preflight.upload_allowed ? "yes" : "no"})`,
    data.marketplace_preflight.sha256 ? `- Package SHA256: ${data.marketplace_preflight.sha256}` : "- Package SHA256: unknown",
    "",
    "## Creator Space",
    "",
    data.creator_space.latest_snapshot
      ? `- Latest users/opens/version/updated: ${data.creator_space.latest_snapshot.users}/${data.creator_space.latest_snapshot.opens}/${data.creator_space.latest_snapshot.version}/${data.creator_space.latest_snapshot.updated}`
      : "- Latest snapshot: none",
    `- After-upload snapshot: ${data.creator_space.after_upload_snapshot ? "yes" : "no"}`,
    `- Delta users/opens/version: ${formatDelta(data.creator_space.deltas.users)}/${formatDelta(data.creator_space.deltas.opens)}/${formatDelta(data.creator_space.deltas.version)}`,
    `- Updated changed: ${data.creator_space.deltas.updated_changed ? "yes" : "no"}`,
    "",
    "## Public Listing",
    "",
    `- Readable: ${data.public_listing.readable ? "yes" : "no"}`,
    `- Likes: ${data.public_listing.likes}`,
    `- Comments: ${data.public_listing.comments}`,
    `- Published: ${data.public_listing.published_at || "unknown"}`,
    `- Updated: ${data.public_listing.updated_at || "unknown"}`,
    `- Framer plugin id: ${data.public_listing.framer_plugin_id || "unknown"}`,
    "",
    "## Intent Signals",
    "",
    `- Plugin upgrade CTA events: ${data.plugin_upgrade_events}`,
    `- Plugin upgrade forms: ${data.plugin_upgrade_forms}`,
    `- Community preflight: ${data.community_preflight.verdict} (publish allowed ${data.community_preflight.publish_allowed ? "yes" : "no"})`,
    "",
  ];

  if (data.blockers.length) {
    lines.push("## Blockers", "");
    for (const blocker of data.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }

  if (data.missing.length) {
    lines.push("## Missing Proof", "");
    for (const item of data.missing) lines.push(`- ${item}`);
    lines.push("");
  }

  if (data.signals.length) {
    lines.push("## Signals", "");
    for (const signal of data.signals) lines.push(`- ${signal}`);
    lines.push("");
  }

  lines.push("## Commands", "", "```bash", ...data.commands, "```", "");
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const [
    actions,
    marketplaceRows,
    marketplacePreflight,
    marketplacePublic,
    eventsData,
    formsData,
    communityPreflight,
  ] = await Promise.all([
    readRows(args.actions),
    readRows(args.marketplace),
    readJson(args.marketplacePreflight, null),
    readJson(args.marketplacePublic, null),
    readJson(args.events, { events: [] }),
    readJson(args.forms, { submissions: [] }),
    readJson(args.communityPreflight, null),
  ]);

  const data = assess({
    args,
    actions,
    marketplaceRows,
    marketplacePreflight,
    marketplacePublic,
    eventsData,
    formsData,
    communityPreflight,
  });
  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Marketplace postflight: ${data.status}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
