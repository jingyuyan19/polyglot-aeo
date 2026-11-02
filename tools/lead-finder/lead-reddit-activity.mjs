#!/usr/bin/env node

import {
  REDDIT_ACTIVITY_HEADERS,
  addDays,
  contentHash,
  mutateRows,
  pipe,
  readJson,
  readRows,
  readText,
  toBoolean,
  toNumber,
  todayLocal,
  writeRows,
  writeText,
} from "./reddit-pilot-lib.mjs";

const DEFAULT_CONFIG = "tools/lead-finder/reddit-pilot-config.json";
const DEFAULT_LEDGER = "tools/lead-finder/reddit-activity.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-reddit-activity.md";
const DEFAULT_JSON = ".tmp/framer-reddit-activity.json";
const EVENT_TYPES = new Set([
  "asset",
  "profile",
  "rules_check",
  "contribution",
  "insight",
  "modmail",
  "post",
  "snapshot",
  "moderation",
]);

function usage() {
  return `
Usage:
  pnpm lead:reddit-activity -- --init
  pnpm lead:reddit-activity -- --seed-rules
  pnpm lead:reddit-activity -- --add --event contribution --subreddit framer --url <reddit-url> --topic "Helpful Framer answer" --category aeo --note "No product mention or link"
  pnpm lead:reddit-activity -- --add --event profile --status done --evidence <profile-url-or-screenshot> --note "Developer disclosure and pinned portfolio are live"
  pnpm lead:reddit-activity -- --add --event post --subreddit nocode --plugin polyglot-aeo --url <post-url> --post-id <id> --promotional --disclosed --flair Promoted --body-file docs/growth/reddit/drafts/polyglot-aeo-nocode.md
  pnpm lead:reddit-activity -- --add --event snapshot --subreddit nocode --plugin polyglot-aeo --post-id <id> --window 24h --views 500 --upvotes 8 --comments 4 --installs 2 --activations 1 --evidence <creator-space-proof>

Options:
  --config <file>       Pilot config. Default: ${DEFAULT_CONFIG}
  --ledger <file>       Local Reddit activity CSV. Default: ${DEFAULT_LEDGER}
  --output <file>       Markdown report. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON report. Default: ${DEFAULT_JSON}
  --init                Create the local ledger when missing.
  --seed-rules          Record today's configured subreddit rule checks.
  --add                 Append one activity row.
  --event <type>        ${Array.from(EVENT_TYPES).join(", ")}
  --date <YYYY-MM-DD>   Event date. Default: today in pilot timezone.
  --timestamp <iso>     Event timestamp. Default: now.
  --subreddit <id>      Config key such as nocode, framer, accessibility, SEO.
  --plugin <id>         Config key such as polyglot-aeo or ally-auditor.
  --campaign <id>       Defaults to the selected plugin campaign.
  --status <status>     Default: done for contributions/rules/assets, observation for snapshots.
  --url <url>           Reddit post/comment/profile URL.
  --post-id <id>        Stable post identifier used to join snapshots.
  --promotional         Mark the row as promotional.
  --disclosed           Mark builder affiliation as disclosed.
  --flair <name>        Post flair.
  --topic <text>        Human-readable topic.
  --category <id>       aeo, accessibility, localization, or china_map.
  --body-file <file>    Hash the final human-edited copy.
  --window <window>     24h, 72h, or 7d for snapshot rows.
  --views/--upvotes/--comments/--installs/--activations <n>
  --note <text>         Operator note.
  --evidence <text>     Public URL, screenshot, Creator Space proof, or rule URL.
  --help                Show this help.
`;
}

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG,
    ledger: DEFAULT_LEDGER,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    init: false,
    seedRules: false,
    add: false,
    promotional: false,
    disclosed: false,
  };
  const valueOptions = new Map([
    ["--config", "config"],
    ["--ledger", "ledger"],
    ["--output", "output"],
    ["--json", "json"],
    ["--event", "eventType"],
    ["--date", "date"],
    ["--timestamp", "timestamp"],
    ["--subreddit", "subreddit"],
    ["--plugin", "plugin"],
    ["--campaign", "campaign"],
    ["--status", "status"],
    ["--url", "url"],
    ["--post-id", "postId"],
    ["--flair", "flair"],
    ["--topic", "topic"],
    ["--category", "category"],
    ["--body-file", "bodyFile"],
    ["--window", "reviewWindow"],
    ["--views", "views"],
    ["--upvotes", "upvotes"],
    ["--comments", "comments"],
    ["--installs", "installs"],
    ["--activations", "activations"],
    ["--note", "note"],
    ["--evidence", "evidence"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") args.help = true;
    else if (key === "--init") args.init = true;
    else if (key === "--seed-rules") args.seedRules = true;
    else if (key === "--add") args.add = true;
    else if (key === "--promotional") args.promotional = true;
    else if (key === "--disclosed") args.disclosed = true;
    else if (valueOptions.has(key)) {
      if (argv[index + 1] === undefined) throw new Error(`${key} requires a value.`);
      args[valueOptions.get(key)] = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  return args;
}

function validateHttpUrl(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${label} must use http(s).`);
  return url.toString();
}

function validateArgs(args, config) {
  if (!args.add) return;
  if (!EVENT_TYPES.has(args.eventType)) {
    throw new Error(`--event must be one of: ${Array.from(EVENT_TYPES).join(", ")}`);
  }
  if (args.subreddit && !config.subreddits?.[args.subreddit]) {
    throw new Error(`Unknown subreddit config key: ${args.subreddit}`);
  }
  if (args.plugin && !config.plugins?.[args.plugin]) {
    throw new Error(`Unknown plugin config key: ${args.plugin}`);
  }
  if (["rules_check", "contribution", "modmail", "post", "snapshot", "moderation"].includes(args.eventType) && !args.subreddit) {
    throw new Error(`--subreddit is required for event ${args.eventType}.`);
  }
  if (["rules_check", "contribution", "post"].includes(args.eventType)) {
    args.url = validateHttpUrl(args.url, "--url");
  }
  if (args.eventType === "contribution") {
    if (args.promotional) throw new Error("A contribution row must be non-promotional.");
    if (!args.topic) throw new Error("--topic is required for contribution rows.");
  }
  if (args.eventType === "profile" && (!args.evidence || args.status !== "done")) {
    throw new Error("A ready profile row requires --status done and --evidence with a profile URL or screenshot.");
  }
  if (args.eventType === "post") {
    if (!args.plugin || !args.postId) throw new Error("Post rows require --plugin and --post-id.");
    if (!args.promotional) throw new Error("Product post rows must include --promotional.");
  }
  if (args.eventType === "snapshot") {
    if (!args.plugin || !args.postId || !args.reviewWindow) {
      throw new Error("Snapshot rows require --plugin, --post-id, and --window.");
    }
    if (!config.pilot.review_windows.includes(args.reviewWindow)) {
      throw new Error(`--window must be one of: ${config.pilot.review_windows.join(", ")}`);
    }
  }
  if (args.eventType === "rules_check" && !args.evidence) {
    throw new Error("Rules checks require --evidence with the current rules URL.");
  }
}

async function rowFromArgs(args, config) {
  const plugin = config.plugins?.[args.plugin];
  const body = args.bodyFile ? await readText(args.bodyFile) : "";
  if (args.bodyFile && !body) throw new Error(`Body file is missing or empty: ${args.bodyFile}`);
  const defaultStatus = args.eventType === "snapshot" ? "observation" : "done";
  return {
    date: args.date,
    timestamp: args.timestamp,
    event_type: args.eventType,
    subreddit: args.subreddit || "",
    plugin: args.plugin || "",
    campaign: args.campaign || plugin?.campaign || "",
    status: args.status || defaultStatus,
    url: args.url || "",
    post_id: args.postId || "",
    promotional: String(Boolean(args.promotional)),
    disclosed: String(Boolean(args.disclosed)),
    flair: args.flair || "",
    topic: args.topic || "",
    category: args.category || "",
    body_hash: body ? contentHash(body) : "",
    review_window: args.reviewWindow || "",
    views: args.views === undefined ? "" : toNumber(args.views),
    upvotes: args.upvotes === undefined ? "" : toNumber(args.upvotes),
    comments: args.comments === undefined ? "" : toNumber(args.comments),
    installs: args.installs === undefined ? "" : toNumber(args.installs),
    activations: args.activations === undefined ? "" : toNumber(args.activations),
    note: args.note || "",
    evidence: args.evidence || "",
  };
}

function duplicateKey(row) {
  return [row.date, row.event_type, row.subreddit, row.plugin, row.url, row.post_id, row.review_window, row.topic].join("|");
}

function buildReport(rows, config, args) {
  const today = args.date;
  const lookbackStart = addDays(today, -(config.pilot.contribution_lookback_days - 1));
  const recent = rows.filter((row) => row.date >= lookbackStart && row.date <= today);
  const recentContributions = recent.filter(
    (row) => row.event_type === "contribution" && !toBoolean(row.promotional) && row.status === "done",
  );
  const recentPromotions = recent.filter(
    (row) => row.event_type === "post" && toBoolean(row.promotional) && row.status === "done",
  );
  const profileReady = rows.some(
    (row) => row.event_type === "profile" && row.status === "done" && Boolean(row.evidence),
  );
  const bySubreddit = {};
  for (const row of recentContributions) {
    bySubreddit[row.subreddit] = (bySubreddit[row.subreddit] || 0) + 1;
  }
  const data = {
    generated_at: new Date().toISOString(),
    ledger: args.ledger,
    today,
    lookback_start: lookbackStart,
    profile_ready: profileReady,
    total_rows: rows.length,
    recent_non_promotional_contributions: recentContributions.length,
    required_non_promotional_contributions: config.pilot.min_non_promotional_contributions,
    recent_promotional_posts: recentPromotions.length,
    contribution_ratio_ready: recentContributions.length >= config.pilot.min_non_promotional_contributions,
    contributions_by_subreddit: bySubreddit,
    latest_rows: [...rows].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 20),
  };

  const lines = [
    "# Reddit Pilot Activity",
    "",
    `Generated: ${data.generated_at}`,
    `Ledger: ${args.ledger}`,
    `Profile ready: ${profileReady ? "yes" : "no"}`,
    `14-day contribution gate: ${recentContributions.length}/${config.pilot.min_non_promotional_contributions}`,
    `Promotional posts in the same window: ${recentPromotions.length}`,
    "",
    "## Contribution Mix",
    "",
  ];
  if (Object.keys(bySubreddit).length) {
    for (const [subreddit, count] of Object.entries(bySubreddit).sort()) {
      lines.push(`- ${config.subreddits[subreddit]?.label || subreddit}: ${count}`);
    }
  } else {
    lines.push("- No qualifying contribution has been recorded yet.");
  }
  lines.push("", "## Latest Activity", "", "| Date | Event | Community | Plugin | Status | Topic / Window | Evidence |", "|---|---|---|---|---|---|---|");
  for (const row of data.latest_rows) {
    lines.push(`| ${row.date} | ${row.event_type} | ${pipe(config.subreddits[row.subreddit]?.label || row.subreddit)} | ${pipe(config.plugins[row.plugin]?.name || row.plugin)} | ${pipe(row.status)} | ${pipe(row.topic || row.review_window)} | ${pipe(row.evidence || row.url)} |`);
  }
  lines.push("");
  return { data, markdown: `${lines.join("\n")}\n` };
}

async function seedRules(args, config) {
  return mutateRows(args.ledger, async (rows) => {
    let added = 0;
    for (const [subreddit, rule] of Object.entries(config.subreddits)) {
      if (rule.mode === "hold_first_eight_weeks") continue;
      const exists = rows.some(
        (row) => row.date === args.date && row.event_type === "rules_check" && row.subreddit === subreddit,
      );
      if (exists) continue;
      rows.push({
        date: args.date,
        timestamp: args.timestamp,
        event_type: "rules_check",
        subreddit,
        plugin: "",
        campaign: "",
        status: "done",
        url: rule.rules_url,
        post_id: "",
        promotional: "false",
        disclosed: "false",
        flair: "",
        topic: "Current subreddit rules",
        category: "",
        body_hash: "",
        review_window: "",
        views: "",
        upvotes: "",
        comments: "",
        installs: "",
        activations: "",
        note: rule.notes,
        evidence: rule.rules_url,
      });
      added += 1;
    }
    return added;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const config = await readJson(args.config);
  if (!config) throw new Error(`Missing Reddit pilot config: ${args.config}`);
  args.date ||= todayLocal(config.pilot.timezone);
  args.timestamp ||= new Date().toISOString();
  validateArgs(args, config);

  if (args.init && !(await readText(args.ledger))) {
    await writeRows(args.ledger, [], REDDIT_ACTIVITY_HEADERS);
  }
  const seeded = args.seedRules ? await seedRules(args, config) : 0;
  let added = false;
  if (args.add) {
    const row = await rowFromArgs(args, config);
    await mutateRows(args.ledger, async (rows) => {
      if (rows.some((item) => duplicateKey(item) === duplicateKey(row))) {
        throw new Error("An equivalent Reddit activity row already exists.");
      }
      rows.push(row);
    });
    added = true;
  }

  if (!(await readText(args.ledger))) await writeRows(args.ledger, [], REDDIT_ACTIVITY_HEADERS);
  const rows = await readRows(args.ledger);
  const report = buildReport(rows, config, args);
  await Promise.all([
    writeText(args.output, report.markdown),
    writeText(args.json, `${JSON.stringify(report.data, null, 2)}\n`),
  ]);
  process.stdout.write(`Reddit activity ledger: ${rows.length} row(s)\n`);
  process.stdout.write(`Rules seeded: ${seeded}\n`);
  process.stdout.write(`Activity added: ${added ? "yes" : "no"}\n`);
  process.stdout.write(`Contribution gate: ${report.data.recent_non_promotional_contributions}/${report.data.required_non_promotional_contributions}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
