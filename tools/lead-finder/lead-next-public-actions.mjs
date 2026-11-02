#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PREFLIGHT = ".tmp/framer-public-preflight.json";
const DEFAULT_GATE = ".tmp/framer-growth-gate.json";
const DEFAULT_MARKETPLACE_REVIEW = ".tmp/framer-marketplace-review.json";
const DEFAULT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_MARKETPLACE_BRIEF = ".tmp/framer-marketplace-update.md";
const DEFAULT_COMMUNITY_REVIEW = ".tmp/framer-community-review.json";
const DEFAULT_COMMUNITY_KIT = ".tmp/framer-community-feed-kit.json";
const DEFAULT_DIRECTORY_REVIEW = ".tmp/framer-directory-review.json";
const DEFAULT_DEPLOY_REVIEW = ".tmp/framer-deploy-review.json";
const DEFAULT_OUTPUT = ".tmp/framer-next-public-actions.md";
const DEFAULT_JSON = ".tmp/framer-next-public-actions.json";

function usage() {
  return `
Usage:
  pnpm lead:next-public-actions

Options:
  --preflight <file>           Public preflight JSON. Default: ${DEFAULT_PREFLIGHT}
  --gate <file>                Growth gate JSON. Default: ${DEFAULT_GATE}
  --marketplace-review <file>  Marketplace review JSON. Default: ${DEFAULT_MARKETPLACE_REVIEW}
  --marketplace-preflight <file> Marketplace upload preflight JSON. Default: ${DEFAULT_MARKETPLACE_PREFLIGHT}
  --marketplace-brief <file>   Marketplace upload brief markdown. Default: ${DEFAULT_MARKETPLACE_BRIEF}
  --community-review <file>    Community review JSON. Default: ${DEFAULT_COMMUNITY_REVIEW}
  --community-kit <file>       Community post kit JSON. Default: ${DEFAULT_COMMUNITY_KIT}
  --directory-review <file>    Directory review JSON. Default: ${DEFAULT_DIRECTORY_REVIEW}
  --deploy-review <file>       Deploy review JSON. Default: ${DEFAULT_DEPLOY_REVIEW}
  --output <file>              Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                JSON output. Default: ${DEFAULT_JSON}
  --help                       Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    preflight: DEFAULT_PREFLIGHT,
    gate: DEFAULT_GATE,
    marketplaceReview: DEFAULT_MARKETPLACE_REVIEW,
    marketplacePreflight: DEFAULT_MARKETPLACE_PREFLIGHT,
    marketplaceBrief: DEFAULT_MARKETPLACE_BRIEF,
    communityReview: DEFAULT_COMMUNITY_REVIEW,
    communityKit: DEFAULT_COMMUNITY_KIT,
    directoryReview: DEFAULT_DIRECTORY_REVIEW,
    deployReview: DEFAULT_DEPLOY_REVIEW,
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
    if (key === "--preflight") {
      args.preflight = value;
      index += 1;
      continue;
    }
    if (key === "--gate") {
      args.gate = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-review") {
      args.marketplaceReview = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-preflight") {
      args.marketplacePreflight = value;
      index += 1;
      continue;
    }
    if (key === "--marketplace-brief") {
      args.marketplaceBrief = value;
      index += 1;
      continue;
    }
    if (key === "--community-review") {
      args.communityReview = value;
      index += 1;
      continue;
    }
    if (key === "--community-kit") {
      args.communityKit = value;
      index += 1;
      continue;
    }
    if (key === "--directory-review") {
      args.directoryReview = value;
      index += 1;
      continue;
    }
    if (key === "--deploy-review") {
      args.deployReview = value;
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

async function readJson(file, fallback) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

function buildBrief({ preflight, gate, marketplaceReview, marketplacePreflight, marketplaceBrief, communityReview, communityKit, directoryReview, deployReview }) {
  const actions = Array.isArray(preflight.actions) ? preflight.actions : [];
  const cards = actions.map((action, index) =>
    actionCard({
      action,
      rank: index + 1,
      marketplaceReview,
      marketplacePreflight,
      marketplaceBrief,
      communityReview,
      communityKit,
      directoryReview,
      deployReview,
    }),
  );
  const readyCards = cards.filter((card) => card.status === "confirmation_required");
  const nextReady = readyCards[0] || null;
  const next = nextReady || cards[0] || null;

  return {
    generated_at: new Date().toISOString(),
    verdict: preflight.verdict || "unknown",
    growth_gate: preflight.growth_gate || gate?.decision?.verdict || "",
    cold_email_cap: preflight.cold_email_cap ?? gate?.decision?.cold_email_cap ?? null,
    deploy_status: deployReview?.status || "unknown",
    production_site_check: deployReview?.production_site_check || "unknown",
    netlify_new_deploys: deployReview?.netlify_new_deploys || "unknown",
    marketplace_upload_allowed: marketplacePreflight?.upload_allowed ?? null,
    marketplace_preflight_verdict: marketplacePreflight?.verdict || "missing",
    ready_count: readyCards.length,
    blocked_count: cards.filter((card) => card.status === "blocked").length,
    next_confirmation: nextReady?.confirmation || "",
    next_action: next,
    cards,
    recommendation: recommendationFor({ nextReady, next, deployReview, preflight }),
    guardrails: [
      "Do not publish, upload, or submit anything until the matching confirmation phrase is explicit.",
      "Run the after-action command immediately after the external action, with a real URL, screenshot, or deploy evidence.",
      "Review forms/events before posting the next public action.",
      "Keep cold Day 0 expansion paused until at least one reply, non-test CTA event, form submission, public post proof, or revenue signal exists.",
    ],
  };
}

function markdownSection(text, heading) {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    section.push(lines[index]);
  }
  return section.join("\n").trim();
}

function codeBlockFromMarkdown(text) {
  const match = String(text || "").match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : "";
}

function actionCard({ action, rank, marketplaceReview, marketplacePreflight, marketplaceBrief, communityReview, communityKit, directoryReview, deployReview }) {
  const marketplaceAfterSubmit = markdownSection(marketplaceBrief?.text || "", "After Submit");
  const id = action.id || "";
  const base = {
    rank,
    id,
    label: action.label || id || "Unknown action",
    status: action.status || "unknown",
    confirmation: action.confirmation || "",
    evidence: action.evidence || "",
    command_after_action: action.command_after_action || "",
    blockers: Array.isArray(action.blockers) ? action.blockers : [],
  };

  if (id === "marketplace_plugin_zip") {
    const preflightReady = marketplacePreflight?.upload_allowed === true;
    const preflightBlockers = Array.isArray(marketplacePreflight?.blockers)
      ? marketplacePreflight.blockers
      : [];
    const status = preflightReady ? base.status : "blocked";
    const blockers = [
      ...base.blockers,
      ...(preflightReady
        ? []
        : [
            `Marketplace preflight is ${marketplacePreflight?.verdict || "missing"}; run \`pnpm lead:marketplace-preflight\` and require \`Upload allowed: yes\`.`,
            ...preflightBlockers,
          ]),
    ];
    return {
      ...base,
      status,
      blockers,
      why_now: "The plugin zip is ready, but the Marketplace upload is not logged. This is the highest-leverage public availability fix before measuring installs, opens, and checkout intent.",
      proof_to_collect: "Marketplace new-version upload confirmation, same-day Creator Space users/opens/version snapshot, public listing snapshot, postflight status, then 24h/48h/7d action-review checks.",
      good_signal: "Marketplace users or opens increase, install CTA clicks, checkout clicks, or a human reply after distribution.",
      weak_signal: "Upload is done but opens/users and tracked CTA events stay flat after Community/directory traffic.",
      marketplace_brief_path: marketplaceBrief?.path || "",
      marketplace_preflight_verdict: marketplacePreflight?.verdict || "missing",
      marketplace_upload_allowed: preflightReady,
      marketplace_zip_sha256: marketplacePreflight?.zip?.sha256 || "",
      marketplace_pre_upload_gate: markdownSection(marketplaceBrief?.text || "", "Pre-upload Gate"),
      marketplace_browser_path: markdownSection(marketplaceBrief?.text || "", "Browser Path"),
      marketplace_changes: markdownSection(marketplaceBrief?.text || "", "Changes"),
      marketplace_after_submit: codeBlockFromMarkdown(marketplaceAfterSubmit),
      operator_checklist: [
        "Run `pnpm lead:marketplace-preflight` before opening Framer and require `Upload allowed: yes`.",
        "Upload the exact plugin.zip path shown in the Marketplace brief.",
        "Paste the Changes text from the brief into Framer's Changes field.",
        "After submit, run the after-action commands with real Marketplace evidence, Creator Space snapshot values, a public listing snapshot, and the Marketplace postflight gate.",
      ],
      review_after_action: [
        "pnpm lead:marketplace-public -- --record",
        "pnpm lead:marketplace-review",
        "pnpm lead:events && pnpm lead:forms",
        "pnpm lead:marketplace-postflight",
        "pnpm lead:community-preflight",
        "pnpm lead:action-review && pnpm lead:channel-priority && pnpm lead:ops",
      ],
      channel_state: marketplaceReview?.status || "unknown",
    };
  }

  if (id === "community_priority_1") {
    const priorityPost = Array.isArray(communityKit?.posts)
      ? communityKit.posts.find((post) => Number(post.priority) === 1)
      : null;
    return {
      ...base,
      why_now: "Community Feed is untested and cold email has no replies. A single question-first post can create public proof without expanding cold outreach.",
      proof_to_collect: "Published Framer Community URL plus visible comments, DMs/profile replies, CTA events, form submissions, or Marketplace lift.",
      good_signal: "Any comment, DM, non-test CTA event, form submission, Marketplace opens/users lift, or install/checkout intent.",
      weak_signal: "Zero comments and zero tracked clicks/forms after 48 hours.",
      review_after_action: [
        "pnpm lead:community-review",
        "pnpm lead:community-review -- --comments <comments> --dms <dms>",
        "pnpm lead:events && pnpm lead:forms && pnpm lead:ops",
      ],
      channel_state: communityReview?.verdict || "unknown",
      community_post_title: priorityPost?.title || "",
      community_post_body: priorityPost?.body || "",
      community_post_goal: priorityPost?.post_goal || "",
    };
  }

  if (id === "directory_form") {
    const nextTarget = directoryReview?.rows?.find((row) => row.status === "needs_confirmation");
    return {
      ...base,
      why_now: "Directory listings are long-lived discovery surfaces. Submit only one high-fit target first so any later CTA/form movement can be attributed.",
      proof_to_collect: "Directory submission confirmation, screenshot, accepted listing URL, or reply ID.",
      good_signal: "Directory-sourced CTA event, form submission, accepted listing, or directory-owner reply.",
      weak_signal: "No directory-sourced CTA/form/listing signal after the 7 day and 14 day review windows.",
      review_after_action: [
        "pnpm lead:directory-review",
        "pnpm lead:events && pnpm lead:forms && pnpm lead:ops",
      ],
      channel_state: nextTarget?.status || directoryReview?.recommendation || "unknown",
      target: action.target || nextTarget?.target || "",
    };
  }

  return {
    ...base,
    why_now: "Public action is ready in preflight.",
    proof_to_collect: "External URL, screenshot, or confirmation evidence.",
    good_signal: "Any reply, non-test CTA event, form submission, listing acceptance, Marketplace lift, or revenue signal.",
    weak_signal: "No public proof after the planned review window.",
    review_after_action: ["pnpm lead:events && pnpm lead:forms && pnpm lead:ops"],
    channel_state: deployReview?.status || "unknown",
  };
}

function recommendationFor({ nextReady, next, deployReview, preflight }) {
  if (!nextReady) {
    const blockerText = next?.blockers?.length ? ` First blocked action: ${next.label}: ${next.blockers.slice(0, 3).join("; ")}.` : "";
    return `No ready public action is available. Run \`pnpm lead:public-preflight\` and inspect blockers.${blockerText}`;
  }
  const deployBlocked = String(deployReview?.netlify_new_deploys || "").startsWith("blocked");
  const deployNote = deployBlocked
    ? ` Production is usable, but new Netlify deploys are blocked (${deployReview?.netlify_new_deploys}), so do not spend time retrying deploys.`
    : "";
  return `Next confirmation to request: ${nextReady.confirmation || nextReady.label}.${deployNote} Preflight verdict: ${preflight.verdict || "unknown"}.`;
}

function renderMarkdown(brief) {
  const lines = [
    "# Framer Next Public Actions",
    "",
    `Generated: ${brief.generated_at}`,
    `Verdict: ${brief.verdict}`,
    `Growth gate: ${brief.growth_gate || "unknown"}`,
    `Cold email cap: ${brief.cold_email_cap ?? "unknown"}`,
    `Deploy status: ${brief.deploy_status}`,
    `Production site check: ${brief.production_site_check}`,
    `Netlify new deploys: ${brief.netlify_new_deploys}`,
    `Marketplace preflight: ${brief.marketplace_preflight_verdict} (${brief.marketplace_upload_allowed === null ? "unknown" : `upload allowed ${brief.marketplace_upload_allowed ? "yes" : "no"}`})`,
    `Ready actions: ${brief.ready_count}`,
    `Blocked actions: ${brief.blocked_count}`,
    "",
    "## Recommendation",
    "",
    brief.recommendation,
    "",
  ];

  if (brief.next_confirmation) {
    lines.push("## Next Confirmation", "", "```text", brief.next_confirmation, "```", "");
  }

  lines.push("## Action Cards", "");
  for (const card of brief.cards) {
    lines.push(
      `### ${card.rank}. ${card.label}`,
      "",
      `- Status: ${card.status}`,
      card.confirmation ? `- Confirmation phrase: ${card.confirmation}` : "",
      card.target ? `- Target: ${card.target}` : "",
      `- Channel state: ${card.channel_state}`,
      `- Why now: ${card.why_now}`,
      `- Proof to collect: ${card.proof_to_collect}`,
      `- Good signal: ${card.good_signal}`,
      `- Weak signal: ${card.weak_signal}`,
    );
    if (Array.isArray(card.operator_checklist) && card.operator_checklist.length) {
      lines.push("", "Operator checklist:");
      for (const item of card.operator_checklist) lines.push(`- ${item}`);
    }
    if (card.marketplace_preflight_verdict) {
      lines.push(
        `- Marketplace preflight: ${card.marketplace_preflight_verdict} (upload allowed ${card.marketplace_upload_allowed ? "yes" : "no"})`,
      );
    }
    if (card.marketplace_zip_sha256) {
      lines.push(`- Marketplace zip SHA256: ${card.marketplace_zip_sha256}`);
    }
    if (card.marketplace_brief_path) lines.push(`- Marketplace brief: ${card.marketplace_brief_path}`);
    if (card.marketplace_pre_upload_gate) {
      lines.push("", "Marketplace pre-upload gate:", "", card.marketplace_pre_upload_gate);
    }
    if (card.marketplace_changes) {
      lines.push("", "Marketplace Changes text:", "", "```text", card.marketplace_changes, "```");
    }
    if (card.marketplace_browser_path) {
      lines.push("", "Marketplace upload path:", "", "```text", card.marketplace_browser_path, "```");
    }
    if (card.marketplace_after_submit) {
      lines.push("", "Marketplace brief after-submit commands:", "", "```bash", card.marketplace_after_submit, "```");
    }
    if (card.community_post_body) {
      lines.push(
        "",
        "Community post to publish:",
        "",
        card.community_post_title ? `Title: ${card.community_post_title}` : "",
        card.community_post_goal ? `Goal: ${card.community_post_goal}` : "",
        "",
        "```text",
        card.community_post_body,
        "```",
      );
    }
    if (card.evidence) lines.push(`- Evidence/input: ${card.evidence}`);
    if (card.blockers.length) lines.push(`- Blockers: ${card.blockers.join("; ")}`);
    if (card.command_after_action) {
      lines.push("", "After-action command:", "", "```bash", card.command_after_action, "```");
    }
    if (card.review_after_action.length) {
      lines.push("", "Review commands:", "", "```bash", ...card.review_after_action, "```");
    }
    lines.push("");
  }

  lines.push("## Guardrails", "");
  for (const item of brief.guardrails) lines.push(`- ${item}`);
  lines.push("");

  return `${lines.filter((line) => line !== undefined).join("\n")}\n`;
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

  const [preflightRaw, gate, marketplaceReview, marketplacePreflight, marketplaceBriefText, communityReview, communityKit, directoryReview, deployReview] = await Promise.all([
    readJson(args.preflight, { actions: [] }),
    readJson(args.gate, null),
    readJson(args.marketplaceReview, null),
    readJson(args.marketplacePreflight, null),
    readText(args.marketplaceBrief),
    readJson(args.communityReview, null),
    readJson(args.communityKit, null),
    readJson(args.directoryReview, null),
    readJson(args.deployReview, null),
  ]);
  const brief = buildBrief({
    preflight: preflightRaw,
    gate,
    marketplaceReview,
    marketplacePreflight,
    marketplaceBrief: {
      path: args.marketplaceBrief,
      text: marketplaceBriefText,
    },
    communityReview,
    communityKit,
    directoryReview,
    deployReview,
  });

  await Promise.all([
    writeText(args.output, renderMarkdown(brief)),
    writeText(args.json, `${JSON.stringify(brief, null, 2)}\n`),
  ]);

  process.stdout.write(`Next public action: ${brief.next_confirmation || "none"}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
