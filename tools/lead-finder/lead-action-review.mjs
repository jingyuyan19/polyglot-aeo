#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_EVENTS = ".tmp/framer-cta-events.json";
const DEFAULT_FORMS = ".tmp/framer-form-intake.json";
const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_MARKETPLACE_PUBLIC = "tools/lead-finder/marketplace-public-snapshots.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-action-review.md";
const DEFAULT_JSON = ".tmp/framer-action-review.json";
const PLUGIN_ALIASES = [
  { plugin: "Polyglot AEO", slug: "polyglot-aeo", terms: ["polyglot aeo", "polyglot-aeo", "polyglot_aeo"] },
  { plugin: "Ally Auditor", slug: "ally-auditor", terms: ["ally auditor", "ally-auditor", "ally_auditor"] },
  { plugin: "Loka - Localization Hub", slug: "loka-localization-hub", terms: ["loka - localization hub", "loka-localization-hub", "loka_localization_hub", "loka"] },
  { plugin: "Gaode Maps", slug: "gaode-maps-assistant", terms: ["gaode maps", "gaode-maps-assistant", "gaode_maps_assistant", "amap"] },
];

function usage() {
  return `
Usage:
  pnpm lead:action-review

Options:
  --actions <file>      External action log CSV. Default: ${DEFAULT_ACTIONS}
  --events <file>       CTA event JSON from lead:events. Default: ${DEFAULT_EVENTS}
  --forms <file>        Form intake JSON from lead:forms. Default: ${DEFAULT_FORMS}
  --marketplace <file>  Marketplace snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --marketplace-public <file> Marketplace public listing snapshot CSV. Default: ${DEFAULT_MARKETPLACE_PUBLIC}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --today <YYYY-MM-DD>  Review date. Default: local date.
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    events: DEFAULT_EVENTS,
    forms: DEFAULT_FORMS,
    marketplace: DEFAULT_MARKETPLACE,
    marketplacePublic: DEFAULT_MARKETPLACE_PUBLIC,
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
    if (key === "--marketplace") {
      args.marketplace = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-public") {
      args.marketplacePublic = value;
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

function addDays(date, days) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

function daysBetween(date, today) {
  const start = Date.parse(`${date}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor((end - start) / 86400000);
}

function number(value) {
  return Number.parseInt(value || "0", 10) || 0;
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

function formSource(item) {
  return (
    item?.utm_source ||
    item?.data?.utm_source ||
    item?.body?.utm_source ||
    item?.utmSource ||
    ""
  );
}

function campaignEvents(eventsData, campaign) {
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];
  if (!campaign) return [];
  return events.filter((event) => event.utm_campaign === campaign);
}

function campaignForms(formsData, campaign) {
  const submissions = Array.isArray(formsData.submissions) ? formsData.submissions : [];
  if (!campaign) return [];
  return submissions.filter((item) => formCampaign(item) === campaign);
}

function directoryEvents(eventsData) {
  const events = Array.isArray(eventsData.events) ? eventsData.events : [];
  return events.filter(
    (event) =>
      event.utm_source === "directory_submission" ||
      String(event.utm_campaign || "").startsWith("directory_"),
  );
}

function directoryForms(formsData) {
  const submissions = Array.isArray(formsData.submissions) ? formsData.submissions : [];
  return submissions.filter((item) => {
    const source = formSource(item);
    const campaign = formCampaign(item);
    return source === "directory_submission" || campaign.startsWith("directory_");
  });
}

function marketplaceAfterDate(rows, date) {
  return rows.filter((row) => row.date && row.date >= date);
}

function marketplaceBeforeDate(rows, date) {
  return rows.filter((row) => row.date && row.date < date);
}

function latestRows(rows) {
  return [...rows].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || b.__index - a.__index,
  );
}

function pluginForAction(action) {
  const text = `${action.campaign || ""}\n${action.target || ""}\n${action.evidence || ""}\n${action.note || ""}`.toLowerCase();
  return PLUGIN_ALIASES.find((item) => item.terms.some((term) => text.includes(term))) || null;
}

function marketplaceRowsForAction(rows, action) {
  const plugin = pluginForAction(action);
  if (!plugin) return [];
  return rows.filter((row) => String(row.plugin || "").toLowerCase() === plugin.plugin.toLowerCase());
}

function marketplacePublicRowsForAction(rows, action) {
  const plugin = pluginForAction(action);
  if (!plugin) return [];
  return rows.filter((row) => {
    const slug = String(row.slug || "").toLowerCase();
    const url = String(row.url || "").toLowerCase();
    return slug === plugin.slug || url.includes(`/plugins/${plugin.slug}/`);
  });
}

function marketplaceDeltas(latest, baseline) {
  if (!latest || !baseline) {
    return {
      users: 0,
      opens: 0,
      version: 0,
      updated_changed: false,
    };
  }
  return {
    users: number(latest.users) - number(baseline.users),
    opens: number(latest.opens) - number(baseline.opens),
    version: number(latest.version) - number(baseline.version),
    updated_changed: latest.updated !== baseline.updated,
  };
}

function marketplacePublicDeltas(latest, baseline) {
  if (!latest || !baseline) {
    return {
      likes: 0,
      comments: 0,
      updated_changed: false,
    };
  }
  return {
    likes: number(latest.likes) - number(baseline.likes),
    comments: number(latest.comments) - number(baseline.comments),
    updated_changed: latest.updated_at !== baseline.updated_at,
  };
}

function publicListingSignal(latest, baseline, deltas) {
  if (!latest) return false;
  if (deltas.likes > 0 || deltas.comments > 0) return true;
  return !baseline && (number(latest.likes) > 0 || number(latest.comments) > 0);
}

function signalForAction(action, eventsData, formsData, marketplaceRows, marketplacePublicRows) {
  if (action.type === "marketplace_upload") {
    const snapshots = marketplaceAfterDate(marketplaceRows, action.date);
    const baseline = latestRows(marketplaceBeforeDate(marketplaceRows, action.date))[0] || null;
    const latest = latestRows(snapshots)[0] || null;
    const publicSnapshots = marketplaceAfterDate(marketplacePublicRows, action.date);
    const publicBaseline = latestRows(marketplaceBeforeDate(marketplacePublicRows, action.date))[0] || null;
    const publicLatest = latestRows(publicSnapshots)[0] || null;
    const events = Array.isArray(eventsData.events) ? eventsData.events : [];
    const forms = Array.isArray(formsData.submissions) ? formsData.submissions : [];
    const deltas = marketplaceDeltas(latest, baseline);
    const publicDeltas = marketplacePublicDeltas(publicLatest, publicBaseline);
    const traction =
      events.length > 0 ||
      forms.length > 0 ||
      deltas.opens > 0 ||
      deltas.users > 0 ||
      publicListingSignal(publicLatest, publicBaseline, publicDeltas);
    return {
      events: events.length,
      forms: forms.length,
      marketplace_snapshots: snapshots.length,
      marketplace_baseline: baseline,
      marketplace_latest: latest,
      marketplace_deltas: deltas,
      marketplace_public_snapshots: publicSnapshots.length,
      marketplace_public_baseline: publicBaseline,
      marketplace_public_latest: publicLatest,
      marketplace_public_deltas: publicDeltas,
      upload_proof: deltas.version > 0 || deltas.updated_changed,
      has_signal: traction,
    };
  }

  if (action.type === "landing_baseline") {
    const pluginMarketplaceRows = marketplaceRowsForAction(marketplaceRows, action);
    const snapshots = marketplaceAfterDate(pluginMarketplaceRows, action.date);
    const baseline = latestRows(marketplaceBeforeDate(pluginMarketplaceRows, action.date))[0] || null;
    const latest = latestRows(snapshots)[0] || null;
    const pluginPublicRows = marketplacePublicRowsForAction(marketplacePublicRows, action);
    const publicSnapshots = marketplaceAfterDate(pluginPublicRows, action.date);
    const publicBaseline = latestRows(marketplaceBeforeDate(pluginPublicRows, action.date))[0] || null;
    const publicLatest = latestRows(publicSnapshots)[0] || null;
    const events = campaignEvents(eventsData, action.campaign);
    const forms = campaignForms(formsData, action.campaign);
    const deltas = marketplaceDeltas(latest, baseline);
    const publicDeltas = marketplacePublicDeltas(publicLatest, publicBaseline);
    const traction =
      events.length > 0 ||
      forms.length > 0 ||
      deltas.opens > 0 ||
      deltas.users > 0 ||
      publicListingSignal(publicLatest, publicBaseline, publicDeltas);
    return {
      events: events.length,
      forms: forms.length,
      marketplace_snapshots: snapshots.length,
      marketplace_baseline: baseline,
      marketplace_latest: latest,
      marketplace_deltas: deltas,
      marketplace_public_snapshots: publicSnapshots.length,
      marketplace_public_baseline: publicBaseline,
      marketplace_public_latest: publicLatest,
      marketplace_public_deltas: publicDeltas,
      upload_proof: false,
      has_signal: traction,
    };
  }

  if (action.type === "directory_submission") {
    const events = directoryEvents(eventsData);
    const forms = directoryForms(formsData);
    return {
      events: events.length,
      forms: forms.length,
      marketplace_snapshots: 0,
      has_signal: events.length > 0 || forms.length > 0,
    };
  }

  const events = campaignEvents(eventsData, action.campaign);
  const forms = campaignForms(formsData, action.campaign);
  return {
    events: events.length,
    forms: forms.length,
    marketplace_snapshots: 0,
    has_signal: events.length > 0 || forms.length > 0,
  };
}

function reviewPlanFor(action) {
  if (action.type === "marketplace_upload") {
    return [
      { label: "same-day snapshot", offset: 0, command: "pnpm lead:marketplace-public -- --record && pnpm lead:marketplace-review && pnpm lead:events && pnpm lead:forms && pnpm lead:marketplace-postflight" },
      { label: "24h Marketplace lift", offset: 1, command: "pnpm lead:marketplace-public -- --record && pnpm lead:marketplace-review && pnpm lead:events && pnpm lead:forms && pnpm lead:marketplace-postflight && pnpm lead:ops" },
      { label: "48h Marketplace lift", offset: 2, command: "pnpm lead:marketplace-public -- --record && pnpm lead:marketplace-review && pnpm lead:events && pnpm lead:forms && pnpm lead:marketplace-postflight && pnpm lead:community-preflight && pnpm lead:channel-priority" },
      { label: "7d Marketplace traction", offset: 7, command: "pnpm lead:marketplace-public -- --record && pnpm lead:marketplace-review && pnpm lead:events && pnpm lead:forms && pnpm lead:marketplace-postflight && pnpm lead:action-review && pnpm lead:ops" },
    ];
  }

  if (action.type === "landing_baseline") {
    return [
      { label: "same-day landing QA", offset: 0, command: "pnpm lead:public-health && pnpm lead:events && pnpm lead:forms && pnpm lead:marketplace-public -- --record && pnpm lead:action-review && pnpm lead:ops" },
      { label: "24h landing signal", offset: 1, command: "pnpm lead:events && pnpm lead:forms && pnpm lead:marketplace-public -- --record && pnpm lead:action-review && pnpm lead:channel-priority && pnpm lead:ops" },
      { label: "7d landing decision", offset: 7, command: "pnpm lead:events && pnpm lead:forms && pnpm lead:marketplace-public -- --record && pnpm lead:action-review && pnpm lead:channel-priority && pnpm lead:portfolio-weekly" },
      { label: "14d landing stop/scale", offset: 14, command: "pnpm lead:events && pnpm lead:forms && pnpm lead:marketplace-public -- --record && pnpm lead:action-review && pnpm lead:channel-priority && pnpm lead:ops" },
    ];
  }

  if (action.type === "directory_submission") {
    return [
      { label: "7d directory check", offset: 7, command: "pnpm lead:directory-review && pnpm lead:events && pnpm lead:forms && pnpm lead:channel-priority" },
      { label: "14d directory check", offset: 14, command: "pnpm lead:directory-review && pnpm lead:events && pnpm lead:forms && pnpm lead:ops" },
    ];
  }

  if (action.type === "post" && action.channel === "framer_community_feed") {
    return [
      { label: "24h Community check", offset: 1, command: "pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events> && pnpm lead:events && pnpm lead:forms" },
      { label: "48h Community decision", offset: 2, command: "pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events> && pnpm lead:channel-priority && pnpm lead:ops" },
    ];
  }

  if (action.type === "post") {
    return [
      { label: "24h post check", offset: 1, command: "pnpm lead:distribution-review && pnpm lead:events && pnpm lead:forms" },
      { label: "48h post decision", offset: 2, command: "pnpm lead:distribution-review && pnpm lead:channel-priority && pnpm lead:ops" },
    ];
  }

  return [];
}

function isReviewable(action) {
  if (action.status !== "done") return false;
  if (action.type === "marketplace_upload") return true;
  if (action.type === "landing_baseline") return true;
  if (action.type === "post") return true;
  if (action.type === "directory_submission") return action.channel !== "gmail";
  return false;
}

function buildReview({ actions, eventsData, formsData, marketplaceRows, marketplacePublicRows, args }) {
  const rows = actions
    .filter(isReviewable)
    .map((action) => {
      const ageDays = daysBetween(action.date, args.today);
      const signal = signalForAction(
        action,
        eventsData,
        formsData,
        marketplaceRows,
        marketplacePublicRows,
      );
      const checkpoints = reviewPlanFor(action).map((checkpoint) => {
        const dueDate = addDays(action.date, checkpoint.offset);
        const due = dueDate <= args.today;
        return {
          ...checkpoint,
          due_date: dueDate,
          due,
          status: signal.has_signal ? "signal_found" : due ? "due" : "scheduled",
        };
      });
      const dueCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "due");
      const scheduledCheckpoints = checkpoints.filter((checkpoint) => checkpoint.status === "scheduled");
      return {
        action,
        age_days: ageDays,
        signal,
        checkpoints,
        due_count: dueCheckpoints.length,
        next_due_date: dueCheckpoints[0]?.due_date || scheduledCheckpoints[0]?.due_date || "",
        status: actionStatus({ signal, dueCheckpoints, scheduledCheckpoints }),
      };
    })
    .sort(
      (a, b) =>
        b.due_count - a.due_count ||
        String(a.next_due_date || "9999-99-99").localeCompare(String(b.next_due_date || "9999-99-99")) ||
        String(b.action.date).localeCompare(String(a.action.date)) ||
        b.action.__index - a.action.__index,
    );

  const dueRows = rows.filter((row) => row.due_count > 0 && !row.signal.has_signal);
  const scheduledRows = rows.filter((row) => row.due_count === 0 && row.next_due_date && !row.signal.has_signal);
  const signalRows = rows.filter((row) => row.signal.has_signal);

  return {
    generated_at: new Date().toISOString(),
    today: args.today,
    reviewable_actions: rows.length,
    due_reviews: dueRows.length,
    scheduled_reviews: scheduledRows.length,
    signal_actions: signalRows.length,
    recommendation: recommendationFor({ rows, dueRows, scheduledRows, signalRows }),
    rows,
  };
}

function actionStatus({ signal, dueCheckpoints, scheduledCheckpoints }) {
  if (signal.has_signal) return "signal_found";
  if (dueCheckpoints.length) return "review_due";
  if (scheduledCheckpoints.length) return "scheduled";
  return "no_review_plan";
}

function recommendationFor({ rows, dueRows, scheduledRows, signalRows }) {
  if (dueRows.length) {
    return `Review ${dueRows.length} due public action(s) before starting another public push.`;
  }
  if (signalRows.length) {
    return "Signal exists on at least one public action. Fulfill or attribute it before expanding distribution.";
  }
  if (scheduledRows.length) {
    return `No public review is due yet. Next review date: ${scheduledRows[0].next_due_date}.`;
  }
  if (!rows.length) {
    return "No completed Marketplace, landing, Community, post, or directory action is available for review yet.";
  }
  return "No action review is currently due.";
}

function renderMarkdown(review) {
  const lines = [
    "# Framer Public Action Review",
    "",
    `Generated: ${review.generated_at}`,
    `Today: ${review.today}`,
    `Reviewable actions: ${review.reviewable_actions}`,
    `Due reviews: ${review.due_reviews}`,
    `Scheduled reviews: ${review.scheduled_reviews}`,
    `Actions with signal: ${review.signal_actions}`,
    "",
    "## Recommendation",
    "",
    review.recommendation,
    "",
    "## Review Queue",
    "",
  ];

  if (!review.rows.length) {
    lines.push("No completed public actions are ready for post-action review.", "");
  } else {
    lines.push("| Status | Action date | Channel | Campaign | Target | Next/due | Signal |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const row of review.rows) {
      lines.push(
        `| ${row.status} | ${row.action.date} | ${row.action.channel} | ${row.action.campaign || ""} | ${pipe(row.action.target)} | ${row.next_due_date || ""} | ${signalText(row.signal)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Checkpoints", "");
  for (const row of review.rows) {
    lines.push(`### ${row.action.type}: ${row.action.target}`, "");
    lines.push(`- Date: ${row.action.date}`);
    lines.push(`- Channel: ${row.action.channel}`);
    if (row.action.campaign) lines.push(`- Campaign: ${row.action.campaign}`);
    if (row.action.evidence) lines.push(`- Evidence: ${row.action.evidence}`);
    lines.push(`- Signal: ${signalText(row.signal)}`, "");
    for (const checkpoint of row.checkpoints) {
      lines.push(`- ${checkpoint.status}: ${checkpoint.label} on ${checkpoint.due_date}`);
    }
    const dueCommands = row.checkpoints
      .filter((checkpoint) => checkpoint.status === "due")
      .map((checkpoint) => checkpoint.command);
    if (dueCommands.length) {
      lines.push("", "Due commands:", "", "```bash", ...Array.from(new Set(dueCommands)), "```");
    }
    lines.push("");
  }

  lines.push("## Always Run After External Actions", "", "```bash");
  lines.push("pnpm lead:forms && pnpm lead:events");
  lines.push("pnpm lead:marketplace-public -- --record && pnpm lead:marketplace-postflight");
  lines.push("pnpm lead:landing-baseline && pnpm lead:landing-baseline-brief");
  lines.push("pnpm lead:marketplace-review && pnpm lead:community-review && pnpm lead:directory-review && pnpm lead:distribution-review");
  lines.push("pnpm lead:community-preflight && pnpm lead:channel-priority");
  lines.push("pnpm lead:action-review && pnpm lead:channel-priority && pnpm lead:ops");
  lines.push("```", "");

  return `${lines.join("\n")}\n`;
}

function signalText(signal) {
  const parts = [`events ${signal.events}`, `forms ${signal.forms}`];
  if (signal.marketplace_snapshots !== undefined) {
    parts.push(`marketplace snapshots ${signal.marketplace_snapshots}`);
    const deltas = signal.marketplace_deltas || {};
    parts.push(`opens ${formatDelta(number(deltas.opens))}`);
    parts.push(`users ${formatDelta(number(deltas.users))}`);
    parts.push(`version ${formatDelta(number(deltas.version))}`);
    parts.push(`updated ${deltas.updated_changed ? "changed" : "same"}`);
    parts.push(`upload proof ${signal.upload_proof ? "yes" : "no"}`);
    const publicDeltas = signal.marketplace_public_deltas || {};
    parts.push(`public snapshots ${signal.marketplace_public_snapshots || 0}`);
    parts.push(`likes ${formatDelta(number(publicDeltas.likes))}`);
    parts.push(`comments ${formatDelta(number(publicDeltas.comments))}`);
  }
  return parts.join(", ");
}

function formatDelta(value) {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}

function pipe(value) {
  return String(value ?? "").replace(/\|/g, "/");
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

  const [actions, eventsData, formsData, marketplaceRows, marketplacePublicRows] = await Promise.all([
    readRows(args.actions),
    readJson(args.events, { events: [] }),
    readJson(args.forms, { submissions: [] }),
    readRows(args.marketplace),
    readRows(args.marketplacePublic),
  ]);
  const review = buildReview({
    actions,
    eventsData,
    formsData,
    marketplaceRows,
    marketplacePublicRows,
    args,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(review)),
    writeText(args.json, `${JSON.stringify(review, null, 2)}\n`),
  ]);

  process.stdout.write(`Action review: ${review.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
