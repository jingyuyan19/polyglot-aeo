#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT = ".tmp/framer-community-feed-kit.md";
const DEFAULT_JSON = ".tmp/framer-community-feed-kit.json";
const SITE = "https://polyglotaeo.com";
const MARKETPLACE = "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";
const FEED = "https://www.framer.com/community/feed/";
const VISUAL_ASSETS = {
  benchmark: {
    file: "marketplace-media/marketplace-contact-sheet.png",
    alt: "Polyglot AEO screenshots showing the AEO control center, schema audit, llms.txt workflow, and published verifier.",
    caption: "Use this as the attached image for the first Community test so the post is inspectable at a glance.",
  },
  agency: {
    file: "marketplace-media/marketplace-01-control-center.png",
    alt: "Polyglot AEO control center for a multilingual Framer site launch QA workflow.",
    caption: "Use this when the post is aimed at agencies evaluating a client handoff workflow.",
  },
  llms: {
    file: "marketplace-media/marketplace-03-llms-workflow.png",
    alt: "Polyglot AEO llms.txt workflow screen for reviewing AI-readable Framer site content.",
    caption: "Use this when the post is specifically about llms.txt implementation details.",
  },
};

const CAMPAIGNS = [
  {
    id: "framer_aeo_benchmark",
    path: "/framer-aeo-benchmark/",
    anchor: "benchmark-request",
  },
  {
    id: "agency_partner",
    path: "/agency/",
    anchor: "agency-request",
  },
  {
    id: "llms_txt_workflow",
    path: "/llms-txt/",
  },
];

function usage() {
  return `
Usage:
  pnpm lead:community

Options:
  --source <source>   UTM source. Default: framer_community_feed
  --medium <medium>   UTM medium. Default: community_post
  --output <file>     Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>       JSON output. Default: ${DEFAULT_JSON}
  --help              Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    source: "framer_community_feed",
    medium: "community_post",
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
    if (key === "--source") {
      args.source = value;
      index += 1;
      continue;
    }
    if (key === "--medium") {
      args.medium = value;
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

function campaignUrl(campaign, args) {
  const url = new URL(campaign.path, SITE);
  url.searchParams.set("utm_source", args.source);
  url.searchParams.set("utm_medium", args.medium);
  url.searchParams.set("utm_campaign", campaign.id);
  if (campaign.anchor) url.hash = campaign.anchor;
  return url.toString();
}

function buildKit(args) {
  const campaigns = CAMPAIGNS.map((campaign) => ({
    ...campaign,
    url: campaignUrl(campaign, args),
  }));
  const links = Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.url]));

  return {
    generated_at: new Date().toISOString(),
    feed: FEED,
    source: args.source,
    medium: args.medium,
    marketplace: MARKETPLACE,
    campaigns,
    visual_assets: VISUAL_ASSETS,
    posts: posts(links),
    replies: replies(links),
    measurement: measurement(),
    decision_rules: decisionRules(),
    guardrails: guardrails(),
  };
}

function posts(links) {
  return [
    {
      priority: 1,
      channel: "framer_community_feed",
      campaign: "framer_aeo_benchmark",
      title: "Marketplace-native AEO checklist post",
      post_goal: "Start a discussion and drive Framer-native Marketplace opens/users before relying on stale website attribution.",
      primary_link: "marketplace",
      visual_asset: VISUAL_ASSETS.benchmark,
      publish_checklist: [
        "Attach the contact-sheet visual before publishing.",
        "Keep the first link to the Marketplace plugin page while production website tracking is stale.",
        "Use the benchmark page only as secondary context until strict production tracking is fresh.",
        "Capture Creator Space users/opens before posting so the first signal can be measured.",
        "Ask the final question exactly as written unless a current Framer thread makes a sharper angle obvious.",
      ],
      body: `Question for Framer builders and agencies: what does your AI-readiness QA include before client handoff?

I am testing a Framer-native launch QA checklist around the parts that tend to drift after publish:

1. Is /llms.txt reachable from the final root domain?
2. Do localized pages have matching JSON-LD and language metadata?
3. Did CMS titles/descriptions drift across locales?
4. Did the client review the same published domain that crawlers see?

I packaged the checker workflow as a free Framer plugin here:
${MARKETPLACE}

The public checklist/benchmark notes are here too:
${links.framer_aeo_benchmark}

Curious: what else would you add to a Framer launch QA pass before handing a site to a client?`,
    },
    {
      priority: 2,
      channel: "framer_community_feed",
      campaign: "agency_partner",
      title: "Agency handoff offer post",
      post_goal: "Convert agency replies into one public client URL for a 3-point handoff note.",
      primary_link: "site",
      visual_asset: VISUAL_ASSETS.agency,
      publish_checklist: [
        "Use only after priority 1 has either signal or a clean 48h read.",
        "Attach the control-center screenshot so the offer has concrete workflow proof.",
        "Do not ask for a meeting; keep the CTA to one public Framer URL.",
      ],
      body: `For Framer agencies: how are you showing AI-readiness proof in the client handoff?

I am testing a small AEO QA handoff format for client launches.

The deliverable is intentionally short:

1. observed issue
2. client risk
3. next fix

I am applying it to /llms.txt, localized schema/metadata, CMS gaps, and published-page checks.

If you have one active Framer client launch, send a public URL here:
${links.agency_partner}

I will return a 3-point note in that format. No meeting needed. The free plugin behind the workflow is also live in the Marketplace:
${MARKETPLACE}`,
    },
    {
      priority: 3,
      channel: "framer_community_feed",
      campaign: "llms_txt_workflow",
      title: "llms.txt workflow post",
      post_goal: "Use after priority 1 has context; focus on practical implementation details.",
      primary_link: "site",
      visual_asset: VISUAL_ASSETS.llms,
      publish_checklist: [
        "Use only after the first post has been reviewed.",
        "Attach the llms.txt workflow screenshot.",
        "Keep this tactical; do not mention Pro or pricing.",
      ],
      body: `Practical llms.txt question for Framer sites: what do you include after the file exists?

I am trying to keep the file useful for AI agents without turning it into another sitemap.

The workflow I am using:

1. root summary
2. priority pages
3. locale paths
4. product/service pages
5. docs or CMS collections worth citing

I wrote the Framer-specific version here:
${links.llms_txt_workflow}

Would love to compare notes with anyone already shipping llms.txt on client sites.`,
    },
  ];
}

function replies(links) {
  return [
    {
      trigger: "Someone asks whether this is official Framer functionality",
      body: `Framer has official AI-agent readability, llms.txt, and AEO scanner docs. Polyglot AEO is independent and sits in the QA/handoff layer: schema, localized metadata, CMS gaps, llms.txt review, and published-domain verification.`,
    },
    {
      trigger: "Someone asks what the plugin does",
      body: `The free version is useful as a checker/workflow surface. Pro is optional and adds the heavier multilingual generation/reporting pieces. The public checklist is here first so people can inspect the method without installing anything: ${links.framer_aeo_benchmark}`,
    },
    {
      trigger: "Agency replies with interest",
      body: `Happy to run the 3-point handoff format. Send one public Framer client URL and the launch context, and I will return observed issue, client risk, and next fix.`,
    },
    {
      trigger: "Someone challenges AI-search claims",
      body: `Agreed that nobody can guarantee citations or rankings. I am treating this as crawl/readiness QA: make the published Framer site easier to parse, verify the metadata/schema/llms.txt layer, and give clients concrete handoff evidence.`,
    },
  ];
}

function measurement() {
  return [
    "Attach the selected visual asset; if Framer cannot attach it, add it as the first comment or skip the post.",
    "Before publishing priority 1, capture the current Creator Space users/opens snapshot with `pnpm lead:marketplace -- --add ...` if the dashboard changed since the last baseline.",
    "Post only priority 1 first, then wait at least 24 hours before posting priority 2.",
    "After publishing, record the post URL with the command printed under that post.",
    "After 24 hours, 48 hours, and 72 hours, capture a fresh Creator Space users/opens snapshot before judging Community lift.",
    "Run `pnpm lead:forms && pnpm lead:events && pnpm lead:marketplace-public -- --record && pnpm lead:distribution-review && pnpm lead:ops` after 24 hours, 48 hours, and 72 hours.",
    "Run `pnpm lead:community-review` after recording the post; add `--comments`, `--dms`, `--opportunities`, and `--revenue-signals` when there are manual signals that tracking cannot see.",
    "Good signal: any comment, DM, Marketplace users/opens lift, CTA click, or form submission.",
    "Weak signal: 0 comments, 0 DMs, 0 tracked clicks/forms, and 0 Marketplace lift after 48 hours; revise the hook before posting lower-priority content.",
    "No-value signal: 0 comments, 0 DMs, 0 tracked clicks/forms, 0 Marketplace lift, and 0 replies/opportunities after 72 hours; deprioritize Community behind Marketplace, directory, and partner/resource channels.",
  ];
}

function decisionRules() {
  return [
    {
      window: "24h",
      continue_if: "Any comment, DM/profile reply, CTA event, form submission, or Marketplace users/opens lift.",
      action: "Reply first, record manual comments/DMs/opportunities/revenue, then rerun `pnpm lead:community-review -- --comments <comments> --dms <dms> --opportunities <opportunities> --revenue-signals <revenue_events>`.",
    },
    {
      window: "48h",
      continue_if: "Total signal score is greater than 0.",
      stop_if: "No manual signal, no tracked CTA/form, and no Marketplace lift.",
      action: "Continue only if signal exists; otherwise rewrite priority 1 before any priority 2 post.",
    },
    {
      window: "72h",
      continue_if: "Any qualified comment, DM, tracked CTA/form, Marketplace users/opens lift, reply, opportunity, or revenue signal.",
      stop_if: "No manual signal, no tracked CTA/form, no Marketplace lift, and no reply/opportunity/revenue signal.",
      action: "Deprioritize Community behind Marketplace, directories, and partner/resource channels until the hook or visual angle is materially changed.",
    },
    {
      window: "7d",
      continue_if: "At least one form, qualified DM, Marketplace lift plus CTA, or revenue/opportunity signal.",
      stop_if: "Only impressions/likes without comments, CTA, forms, Marketplace lift, or replies.",
      action: "Either promote the thread with replies/assets, or deprioritize Community behind directory/partner channels.",
    },
  ];
}

function guardrails() {
  return [
    "Do not claim guaranteed AI-search citations, rankings, or official Framer endorsement.",
    "Do not publish a text-only Community post; use the selected visual asset or pause.",
    "While production tracking is stale, keep the first priority-1 link on the Framer Marketplace plugin page so the test has Framer-native opens/users evidence.",
    "Mention the plugin only after the useful checklist/problem is clear.",
    "Do not post more than one Community feed post per day from this kit.",
    "Reply to comments before creating another post.",
    "If linking to the Marketplace, disclose that Polyglot AEO is independent and has optional Pro pricing.",
  ];
}

function renderMarkdown(kit) {
  const lines = [
    "# Framer Community Feed Kit",
    "",
    `Generated: ${kit.generated_at}`,
    `Feed: ${kit.feed}`,
    `UTM source: ${kit.source}`,
    `UTM medium: ${kit.medium}`,
    `Marketplace: ${kit.marketplace}`,
    "",
    "## Links",
    "",
    "| Campaign | Link |",
    "|---|---|",
  ];

  for (const campaign of kit.campaigns) {
    lines.push(`| ${campaign.id} | ${campaign.url} |`);
  }

  lines.push("", "## Posting Order", "");
  lines.push("| Priority | Post | Primary link | Visual | Goal | Record command |");
  lines.push("|---:|---|---|---|---|---|");
  for (const post of kit.posts) {
    lines.push(
      `| ${post.priority} | ${post.title} | ${post.primary_link || ""} | ${post.visual_asset?.file || ""} | ${post.post_goal} | \`${actionCommand(post)}\` |`,
    );
  }

  lines.push("", "## Posts", "");
  for (const post of kit.posts) {
    lines.push(`### ${post.title}`, "");
    lines.push(`Channel: ${post.channel}`);
    lines.push(`Campaign: ${post.campaign}`);
    lines.push(`Primary link: ${post.primary_link || "unspecified"}`);
    lines.push(`Goal: ${post.post_goal}`, "");
    if (post.visual_asset) {
      lines.push("Visual asset:", "");
      lines.push(`- File: ${path.resolve(post.visual_asset.file)}`);
      lines.push(`- Alt: ${post.visual_asset.alt}`);
      lines.push(`- Caption: ${post.visual_asset.caption}`, "");
    }
    if (Array.isArray(post.publish_checklist) && post.publish_checklist.length) {
      lines.push("Publish checklist:", "");
      for (const item of post.publish_checklist) lines.push(`- ${item}`);
      lines.push("");
    }
    lines.push("```text");
    lines.push(post.body);
    lines.push("```", "");
    lines.push("Record after publishing:");
    lines.push("");
    lines.push("```bash");
    lines.push(actionCommand(post));
    lines.push("```", "");
  }

  lines.push("## Reply Templates", "");
  for (const reply of kit.replies) {
    lines.push(`### ${reply.trigger}`, "");
    lines.push("```text");
    lines.push(reply.body);
    lines.push("```", "");
  }

  lines.push("## Measurement", "");
  for (const item of kit.measurement) lines.push(`- ${item}`);
  lines.push("", "## Decision Rules", "");
  lines.push("| Window | Continue if | Stop if | Action |");
  lines.push("|---|---|---|---|");
  for (const rule of kit.decision_rules) {
    lines.push(
      `| ${rule.window} | ${rule.continue_if || ""} | ${rule.stop_if || ""} | ${rule.action || ""} |`,
    );
  }
  lines.push("", "## Guardrails", "");
  for (const item of kit.guardrails) lines.push(`- ${item}`);
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm lead:forms && pnpm lead:events && pnpm lead:marketplace-public -- --record && pnpm lead:community-review && pnpm lead:distribution-review && pnpm lead:ops");
  lines.push("```", "");

  return `${lines.join("\n")}\n`;
}

function actionCommand(post) {
  return [
    "pnpm lead:community-record --",
    `--priority ${post.priority}`,
    "--url '<published-framer-community-url>'",
  ].join(" ");
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

  const kit = buildKit(args);
  await writeText(args.output, renderMarkdown(kit));
  await writeText(args.json, `${JSON.stringify(kit, null, 2)}\n`);
  process.stdout.write(`Community posts: ${kit.posts.length}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
