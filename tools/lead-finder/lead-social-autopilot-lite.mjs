#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "./file-lock.mjs";

const DEFAULT_PACK = "docs/growth/social-platforms/ally-auditor-social-drafts.md";
const DEFAULT_CHANNEL_JSON = ".tmp/framer-channel-priority.json";
const DEFAULT_MARKETPLACE_JSON = ".tmp/framer-marketplace-public.json";
const DEFAULT_CUSTOMER_REVIEW_JSON = ".tmp/framer-customer-feedback-review.json";
const DEFAULT_OUTPUT = ".tmp/framer-social-autopilot-lite.md";
const DEFAULT_JSON = ".tmp/framer-social-autopilot-lite.json";
const DEFAULT_QUEUE = "tools/lead-finder/social-post-queue.local.csv";
const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_CAMPAIGN = "ally-auditor_organic_learning_2026_08";
const DEFAULT_CONFIRMATION = "确认发布 Ally Auditor Framer Feed builder discussion";
const DEFAULT_COOLDOWN_DAYS = 3;
const MARKETPLACE_URL = "https://www.framer.com/community/marketplace/plugins/ally-auditor/";
const HEADERS = [
  "date",
  "generated_at",
  "platform",
  "priority",
  "decision",
  "score",
  "status",
  "campaign",
  "confirmation",
  "title",
  "body_hash",
  "primary_link",
  "review_window",
  "risk",
  "visual_asset",
  "last_published_date",
  "cooldown_remaining_days",
  "source_file",
  "note",
];

function usage() {
  return `
Usage:
  pnpm lead:social-autopilot
  pnpm lead:social-autopilot -- --record --limit 3

Options:
  --pack <file>             Social draft pack markdown. Default: ${DEFAULT_PACK}
  --channel-json <file>     Channel priority JSON. Default: ${DEFAULT_CHANNEL_JSON}
  --marketplace-json <file> Marketplace snapshot JSON. Default: ${DEFAULT_MARKETPLACE_JSON}
  --customer-review-json <file> Customer feedback review JSON. Default: ${DEFAULT_CUSTOMER_REVIEW_JSON}
  --queue <file>            Local queue CSV. Default: ${DEFAULT_QUEUE}
  --actions <file>          Local action log CSV. Default: ${DEFAULT_ACTIONS}
  --output <file>           Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>             JSON output. Default: ${DEFAULT_JSON}
  --limit <n>               Candidate count to render/record. Default: 5
  --record                  Append/update candidate rows in the local queue.
  --today <YYYY-MM-DD>      Local date. Default: today.
  --help                    Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    pack: DEFAULT_PACK,
    channelJson: DEFAULT_CHANNEL_JSON,
    marketplaceJson: DEFAULT_MARKETPLACE_JSON,
    customerReviewJson: DEFAULT_CUSTOMER_REVIEW_JSON,
    queue: DEFAULT_QUEUE,
    actions: DEFAULT_ACTIONS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    limit: 5,
    record: false,
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
    if (key === "--pack") {
      args.pack = value;
      index += 1;
      continue;
    }
    if (key === "--channel-json") {
      args.channelJson = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-json") {
      args.marketplaceJson = value;
      index += 1;
      continue;
    }
    if (key === "--customer-review-json") {
      args.customerReviewJson = value;
      index += 1;
      continue;
    }
    if (key === "--queue") {
      args.queue = value;
      index += 1;
      continue;
    }
    if (key === "--actions") {
      args.actions = value;
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
      args.limit = Number(value);
      index += 1;
      continue;
    }
    if (key === "--record") {
      args.record = true;
      continue;
    }
    if (key === "--today") {
      args.today = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = 5;
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

async function readJson(file, fallback = null) {
  const text = await readText(file);
  if (!text.trim()) return fallback;
  return JSON.parse(text);
}

function extractDrafts(markdown) {
  const drafts = [];
  const sectionPattern = /^## Draft\s+(\d+):\s+(.+)$/gm;
  const matches = Array.from(markdown.matchAll(sectionPattern));

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const section = markdown.slice(match.index, next?.index ?? markdown.length);
    const body = section.match(/```text\n([\s\S]*?)\n```/)?.[1]?.trim() || "";
    if (!body) continue;
    drafts.push({
      priority: Number(match[1]),
      title: match[2].trim(),
      body,
      notes: section,
    });
  }

  return drafts;
}

function platformFor(title) {
  if (/linkedin/i.test(title)) return "linkedin";
  if (/\bX\/Twitter\b|twitter/i.test(title)) return "x";
  if (/framer community/i.test(title)) return "framer_community_feed";
  if (/indie hackers|maker/i.test(title)) return "indie_hackers";
  if (/reddit/i.test(title)) return "reddit";
  return "unknown";
}

function visualAssetFor(notes) {
  return notes.match(/^Visual:\s+`([^`]+)`/m)?.[1]?.trim() || "";
}

function daysBetween(today, date) {
  const end = Date.parse(`${today}T00:00:00Z`);
  const start = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function isFresh(timestamp, today, maxAgeDays = 7) {
  if (!timestamp) return false;
  const generatedDate = new Date(timestamp);
  if (Number.isNaN(generatedDate.valueOf())) return false;
  return daysBetween(today, generatedDate.toISOString().slice(0, 10)) <= maxAgeDays;
}

function isAllyAction(action) {
  return /ally[-_ ]auditor/i.test([
    action.campaign,
    action.target,
    action.evidence,
    action.note,
  ].join(" "));
}

function latestPublishedSocialPost(actions, platform) {
  return actions
    .filter((action) => (
      ["social_post", "post"].includes(action.type)
      && action.channel === platform
      && action.status === "done"
      && isAllyAction(action)
      && /^\d{4}-\d{2}-\d{2}$/.test(action.date || "")
    ))
    .sort((left, right) => right.date.localeCompare(left.date))[0] || null;
}

function hasPublishedCandidate(actions, platform, bodyHash) {
  return actions.some((action) => (
    ["social_post", "post"].includes(action.type)
    && action.channel === platform
    && action.status === "done"
    && [action.target, action.evidence, action.note].join(" ").includes(`body_hash=${bodyHash}`)
  ));
}

function scoreCandidate({ platform, draft, channelPriority, marketplace, customerReview, today }) {
  const base = {
    linkedin: 94,
    x: 86,
    framer_community_feed: 72,
    indie_hackers: 64,
    reddit: 28,
    unknown: 10,
  }[platform] ?? 10;

  let score = base;
  const penalties = [];
  const boosts = [];

  const marketplaceLive = marketplace?.snapshot?.ok === true;
  if (marketplaceLive) {
    score += 4;
    boosts.push("Marketplace baseline is live/readable.");
  } else {
    score -= 12;
    penalties.push("Marketplace baseline is not live/readable.");
  }

  const channelPriorityFresh = isFresh(channelPriority?.generated_at, today);
  if (channelPriorityFresh && /blocked|pause/i.test(channelPriority?.verdict || "")) {
    if (["framer_community_feed", "reddit"].includes(platform)) {
      score -= 10;
      penalties.push("Public distribution gate is paused/blocked.");
    } else {
      score -= 2;
      penalties.push("Keep this as Marketplace-only, not broad public distribution.");
    }
  } else if (!channelPriorityFresh && channelPriority?.verdict) {
    penalties.push("Ignored stale channel-priority data older than seven days.");
  }

  if (/No customer feedback review is due/i.test(customerReview?.recommendation || "")) {
    score -= 1;
    penalties.push("Customer reply review is not due yet.");
  }

  if (platform === "reddit") {
    score -= 15;
    penalties.push("Manual subreddit rules check required before any post.");
  }

  if (platform === "framer_community_feed") {
    const visualAsset = visualAssetFor(draft.notes);
    if (visualAsset) {
      score += 8;
      boosts.push("Includes a current-product visual asset.");
    } else {
      score -= 10;
      penalties.push("Needs a current-product visual asset.");
    }

    if (/https?:\/\//i.test(draft.body)) {
      score -= 30;
      penalties.push("Framer Feed copy must not include an external or Marketplace link.");
    } else {
      score += 6;
      boosts.push("Framer Feed copy contains no external link.");
    }
  }

  if (platform !== "framer_community_feed" && draft.body.includes(MARKETPLACE_URL)) {
    score += 3;
    boosts.push("Uses Marketplace URL instead of blocked owned-site CTA.");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    boosts,
    penalties,
  };
}

function decisionFor(platform, score) {
  if (platform === "reddit") return "prepare_discussion_only_manual_rules_check";
  if (platform === "framer_community_feed") {
    return score >= 80 ? "ready_confirmation_required" : "gated_after_visual_and_creator_space_baseline";
  }
  if (score >= 85) return "ready_confirmation_required";
  if (score >= 60) return "queued_confirmation_required";
  return "hold_prepare_only";
}

function statusFor(decision) {
  if (["already_published_observe_only", "cooldown_observe_only"].includes(decision)) return "prepare_only";
  if (decision === "ready_confirmation_required") return "ready_confirmation_required";
  if (decision === "queued_confirmation_required") return "queued_confirmation_required";
  return "prepare_only";
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function buildCandidates({ drafts, args, channelPriority, marketplace, customerReview, actions }) {
  return drafts
    .map((draft) => {
      const platform = platformFor(draft.title);
      const bodyHash = hash(draft.body);
      const scoring = scoreCandidate({ platform, draft, channelPriority, marketplace, customerReview, today: args.today });
      const latestPost = latestPublishedSocialPost(actions, platform);
      const ageDays = latestPost ? daysBetween(args.today, latestPost.date) : null;
      const cooldownRemaining = ageDays === null ? 0 : Math.max(0, DEFAULT_COOLDOWN_DAYS - ageDays);
      const alreadyPublished = hasPublishedCandidate(actions, platform, bodyHash);
      const decision = alreadyPublished
        ? "already_published_observe_only"
        : cooldownRemaining > 0
          ? "cooldown_observe_only"
          : decisionFor(platform, scoring.score);
      const score = ["already_published_observe_only", "cooldown_observe_only"].includes(decision) ? 0 : scoring.score;
      const penalties = [...scoring.penalties];
      if (alreadyPublished) penalties.push("This exact candidate was already published; do not repost it.");
      if (cooldownRemaining > 0) penalties.push(`${cooldownRemaining} day(s) remain in the per-product Feed cooldown.`);
      return {
        date: args.today,
        generated_at: new Date().toISOString(),
        platform,
        priority: draft.priority,
        decision,
        score,
        status: statusFor(decision),
        campaign: DEFAULT_CAMPAIGN,
        confirmation: DEFAULT_CONFIRMATION,
        title: draft.title,
        body: draft.body,
        body_hash: bodyHash,
        primary_link: platform === "framer_community_feed" ? "" : MARKETPLACE_URL,
        review_window: "24h,72h,7d",
        risk: penalties.join(" "),
        visual_asset: visualAssetFor(draft.notes),
        last_published_date: latestPost?.date || "",
        cooldown_remaining_days: cooldownRemaining,
        boosts: scoring.boosts,
        penalties,
        source_file: args.pack,
        note: alreadyPublished
          ? "This exact candidate was already published; observe results instead of reposting."
          : cooldownRemaining > 0
            ? "Cooldown is active; observe the previous post."
            : "Local candidate only; do not publish until explicit confirmation.",
      };
    })
    .sort((a, b) => b.score - a.score || a.priority - b.priority);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
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
    .map((values) => Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])));
}

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

async function writeRows(file, rows) {
  const csv = [
    HEADERS.join(","),
    ...rows.map((row) => HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${csv}\n`, "utf8");
}

async function recordQueue(file, candidates) {
  return withFileLock(file, async () => {
    const rows = await readRows(file);
    let added = 0;
    let updated = 0;

    for (const candidate of candidates) {
      const row = Object.fromEntries(HEADERS.map((header) => [header, candidate[header] ?? ""]));
      const existingIndex = rows.findIndex(
        (item) => item.date === candidate.date && item.platform === candidate.platform && item.body_hash === candidate.body_hash,
      );
      if (existingIndex >= 0) {
        rows[existingIndex] = row;
        updated += 1;
      } else {
        rows.push(row);
        added += 1;
      }
    }

    await writeRows(file, rows);
    return { added, updated, total: rows.length };
  });
}

function renderMarkdown({ candidates, selected, args, channelPriority, marketplace, customerReview, record }) {
  const lines = [
    "# Social Autopilot Lite",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Campaign: ${DEFAULT_CAMPAIGN}`,
    `Marketplace: ${MARKETPLACE_URL}`,
    `Record: ${record ? `${record.added} added, ${record.updated} updated (${record.total} total)` : "not requested"}`,
    "",
    "## Recommendation",
    "",
    "Queue channel-native candidates, but never publish automatically.",
    "",
    `Confirmation phrase: \`${DEFAULT_CONFIRMATION}\``,
    "",
    "## Current Gates",
    "",
    `- Channel priority: ${channelPriority?.next_channel || "unknown"} / ${channelPriority?.verdict || "unknown"}`,
    `- Marketplace snapshot: ${marketplace?.snapshot?.ok ? "live" : "not live"}; likes/comments ${marketplace?.snapshot?.likes ?? "?"}/${marketplace?.snapshot?.comments ?? "?"}`,
    `- Customer feedback review: ${customerReview?.recommendation || "unknown"}`,
    `- Feed cooldown: ${DEFAULT_COOLDOWN_DAYS} days per product`,
    "- Framer Feed link policy: no Marketplace or owned-site links in post copy.",
    "",
    "## Ranked Candidates",
    "",
    "| Rank | Platform | Score | Decision | Title |",
    "|---:|---|---:|---|---|",
  ];

  selected.forEach((candidate, index) => {
    lines.push(`| ${index + 1} | ${candidate.platform} | ${candidate.score} | ${candidate.decision} | ${candidate.title.replace(/\|/g, "/")} |`);
  });

  lines.push("");

  for (const candidate of selected) {
    lines.push(
      `## ${candidate.platform}: ${candidate.title}`,
      "",
      `- Score: ${candidate.score}`,
      `- Decision: ${candidate.decision}`,
      `- Confirmation: ${candidate.confirmation}`,
      `- Review window: ${candidate.review_window}`,
      `- Visual asset: ${candidate.visual_asset || "none"}`,
      `- Last published: ${candidate.last_published_date || "none"}`,
      `- Cooldown remaining: ${candidate.cooldown_remaining_days} day(s)`,
      `- Risk notes: ${candidate.risk || "none"}`,
      "",
      "```text",
      candidate.body,
      "```",
      "",
      "Record after publishing:",
      "",
      "```bash",
      `pnpm lead:actions -- --add --type social_post --channel '${candidate.platform}' --campaign '${candidate.campaign}' --status done --target '<published-post-url-or-title>' --evidence '<published-url-or-screenshot>${candidate.visual_asset ? `; ${candidate.visual_asset}` : candidate.primary_link ? `; ${candidate.primary_link}` : ""}' --note 'Published one reviewed Ally Auditor social candidate after explicit confirmation; body_hash=${candidate.body_hash}.'`,
      "```",
      "",
    );
  }

  lines.push(
    "## Pre-Post Baseline",
    "",
    "```bash",
    `pnpm lead:marketplace-public -- --record --url '${MARKETPLACE_URL}' --note 'Ally Auditor social pre-post baseline.'`,
    "pnpm lead:customer-feedback-review",
    "```",
    "",
    "## Guardrails",
    "",
    "- This command does not publish social posts.",
    "- Publish one post at a time only after explicit confirmation.",
    `- Enforce a ${DEFAULT_COOLDOWN_DAYS}-day per-product Feed cooldown.`,
    "- Framer Feed posts must not include Marketplace or owned-site links.",
    "- Reject stale copy about former Pro, BYOK, AI alt text, subscriptions, or payment counts.",
    "- Do not automate Reddit product-link posting.",
    "- Do not make legal accessibility compliance guarantees.",
    "- Do not reuse customer names, emails, or quotes without permission.",
    "",
    "## Source",
    "",
    `- Draft pack: ${args.pack}`,
    `- Queue CSV: ${args.queue}`,
    `- Action log CSV: ${args.actions}`,
    `- Candidates parsed: ${candidates.length}`,
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

  const [pack, channelPriority, marketplace, customerReview, actions] = await Promise.all([
    readText(args.pack),
    readJson(args.channelJson, {}),
    readJson(args.marketplaceJson, {}),
    readJson(args.customerReviewJson, {}),
    readRows(args.actions),
  ]);

  const drafts = extractDrafts(pack);
  const candidates = buildCandidates({ drafts, args, channelPriority, marketplace, customerReview, actions });
  const selected = candidates.slice(0, args.limit);
  const record = args.record ? await recordQueue(args.queue, selected) : null;
  const data = {
    generated_at: new Date().toISOString(),
    campaign: DEFAULT_CAMPAIGN,
    marketplace: MARKETPLACE_URL,
    confirmation: DEFAULT_CONFIRMATION,
    queue: args.queue,
    source_file: args.pack,
    channel_priority: {
      verdict: channelPriority?.verdict || "",
      next_channel: channelPriority?.next_channel || "",
      recommendation: channelPriority?.recommendation || "",
    },
    marketplace_snapshot: marketplace?.snapshot || null,
    customer_review: {
      recommendation: customerReview?.recommendation || "",
      next_review_date: customerReview?.next_review_date || "",
    },
    record,
    candidates,
    selected,
    top_candidate: selected.find((candidate) => candidate.status === "ready_confirmation_required") || null,
  };

  await Promise.all([
    writeText(args.output, renderMarkdown({ candidates, selected, args, channelPriority, marketplace, customerReview, record })),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  const top = selected[0];
  process.stdout.write(`Social autopilot lite: ${selected.length} candidate(s)\n`);
  process.stdout.write(`Top candidate: ${top ? `${top.platform} (${top.score}) ${top.title}` : "none"}\n`);
  process.stdout.write(`Record: ${record ? `${record.added} added, ${record.updated} updated` : "not requested"}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
