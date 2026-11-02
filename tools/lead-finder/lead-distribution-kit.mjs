#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT = ".tmp/framer-distribution-kit.md";
const DEFAULT_JSON = ".tmp/framer-distribution-kit.json";
const SITE = "https://polyglotaeo.com";
const MARKETPLACE =
  "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";
const OFFICIAL_CONTEXT = [
  {
    title: "Framer: Make your site readable by AI agents",
    url: "https://www.framer.com/help/articles/make-site-readable-by-ai-agents/",
    note:
      "Framer documents automatic markdown delivery for optimized pages, AI-agent discovery paths, llms.txt support, and its AEO scanner.",
    updated: "2026-06-15",
  },
  {
    title: "Framer: Add an llms.txt file to your site",
    url: "https://www.framer.com/help/articles/llms-txt-framer/",
    note:
      "Framer documents root llms.txt hosting and verification on Pro, Scale, and Enterprise sites.",
    updated: "2026-06-15",
  },
  {
    title: "Framer AEO scanner",
    url: "https://www.framer.com/aeo",
    note:
      "Framer positions AEO as making content easier for ChatGPT, Perplexity, Gemini, and other AI systems to find, understand, and quote.",
    updated: "2026",
  },
];

const CAMPAIGNS = [
  {
    id: "framer_aeo_benchmark",
    title: "Framer AEO benchmark",
    path: "/framer-aeo-benchmark/",
    anchor: "benchmark-request",
    audience: "Framer builders, agencies, and founders checking AI-search readiness.",
    offer: "A public benchmark for llms.txt, localized schema, CMS metadata drift, and published-domain QA.",
  },
  {
    id: "agency_partner",
    title: "Framer agency handoff",
    path: "/agency/",
    anchor: "agency-request",
    audience: "Framer agencies, experts, and studios",
    offer: "A free 3-point client handoff QA note for one active Framer launch.",
  },
  {
    id: "llms_txt_workflow",
    title: "Framer llms.txt workflow",
    path: "/llms-txt/",
    audience: "Framer builders shipping sites that need AI-search-readable docs.",
    offer: "A practical checklist for putting a clean llms.txt flow around Framer sites.",
  },
  {
    id: "mini_audit",
    title: "Free mini audit",
    path: "/audit/",
    audience: "Founders and creators with a public Framer site.",
    offer: "A lightweight 3-point public-site AEO mini audit request.",
  },
];

function usage() {
  return `
Usage:
  pnpm lead:distribution

Options:
  --source <source>   UTM source. Default: framer_community
  --medium <medium>   UTM medium. Default: post
  --output <file>     Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>       JSON output. Default: ${DEFAULT_JSON}
  --help              Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    source: "framer_community",
    medium: "post",
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

  return {
    generated_at: new Date().toISOString(),
    source: args.source,
    medium: args.medium,
    marketplace: MARKETPLACE,
    official_context: OFFICIAL_CONTEXT,
    campaigns,
    posts: posts(campaigns),
  };
}

function posts(campaigns) {
  const byId = Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign]));
  return [
    {
      priority: 1,
      channel: "Framer Community / X / LinkedIn",
      action_channel: "framer_community",
      campaign: "framer_aeo_benchmark",
      title: "Framer AEO benchmark post",
      body: `Framer is now very explicit about AI-agent readability: markdown delivery, llms.txt, and the AEO scanner are part of the official conversation.\n\nI put together a public Framer AEO benchmark for the handoff layer that still gets missed after a site goes live: root /llms.txt, localized JSON-LD, CMS metadata drift, and whether the published domain matches what the team reviewed before client handoff.\n\nUse it here: ${byId.framer_aeo_benchmark.url}`,
    },
    {
      priority: 2,
      channel: "Framer Community / X / LinkedIn",
      action_channel: "framer_community",
      campaign: "agency_partner",
      title: "Agency handoff post",
      body: `Framer agencies: the platform now gives clients a stronger baseline for AI-agent readability, but the client handoff still needs proof.\n\nI am offering a free 3-point AEO QA note for one active client launch. The format is intentionally small: observed issue, client risk, and next fix across /llms.txt, localized schema/metadata, CMS gaps, and published-page checks.\n\nSend one public Framer client URL here: ${byId.agency_partner.url}\n\nThe free plugin behind the workflow is here if you want to inspect it: ${MARKETPLACE}`,
    },
    {
      priority: 3,
      channel: "Framer Community / X / LinkedIn",
      action_channel: "framer_community",
      campaign: "llms_txt_workflow",
      title: "llms.txt tactical post",
      body: `Framer's docs now cover llms.txt and markdown delivery for AI agents. The practical project question is what gets written into the file, whether it is reachable at the root, and whether localized pages/CMS pages are represented cleanly.\n\nI wrote down the Framer workflow I use here: ${byId.llms_txt_workflow.url}`,
    },
    {
      priority: 4,
      channel: "Founder / creator communities",
      action_channel: "community",
      campaign: "mini_audit",
      title: "Mini audit offer",
      body: `I am doing a few quick 3-point AEO checks for public Framer sites now that AI-agent readability, llms.txt, and AEO scanning are becoming part of the standard launch conversation.\n\nThe check covers schema, llms.txt, localized metadata, and one published-domain risk.\n\nDrop one public URL here: ${byId.mini_audit.url}`,
    },
    {
      priority: 5,
      channel: "Direct partner note",
      action_channel: "dm",
      campaign: "agency_partner",
      title: "Partner DM",
      body: `Useful thing for your next Framer client handoff: Framer has made AI-agent readability and llms.txt part of the official conversation, and I am doing a few free 3-point AEO QA notes for active client launches.\n\nSend one public client URL here and I will return the note format: ${byId.agency_partner.url}\n\nIt covers /llms.txt, localized schema/metadata, CMS gaps, and published-page checks without needing a meeting.`,
    },
  ];
}

function renderMarkdown(kit) {
  const lines = [
    "# Framer Distribution Kit",
    "",
    `Generated: ${kit.generated_at}`,
    `UTM source: ${kit.source}`,
    `UTM medium: ${kit.medium}`,
    "",
    "## Links",
    "",
    "| Campaign | Audience | Link |",
    "|---|---|---|",
  ];

  for (const campaign of kit.campaigns) {
    lines.push(`| ${campaign.id} | ${campaign.audience} | ${campaign.url} |`);
  }

  lines.push("", "## Official Context", "");
  lines.push("| Source | Updated | Why it matters |");
  lines.push("|---|---|---|");
  for (const context of kit.official_context) {
    lines.push(`| [${context.title}](${context.url}) | ${context.updated} | ${context.note} |`);
  }

  lines.push("", "## Publishing Order", "");
  lines.push("| Priority | Post | Why first | Record command |");
  lines.push("|---:|---|---|---|");
  for (const post of [...kit.posts].sort((a, b) => a.priority - b.priority)) {
    lines.push(
      `| ${post.priority} | ${post.title} | ${priorityReason(post)} | \`${actionCommand(post)}\` |`,
    );
  }

  lines.push("", "## Posts", "");
  for (const post of kit.posts) {
    lines.push(`### ${post.title}`, "");
    lines.push(`Channel: ${post.channel}`);
    lines.push(`Campaign: ${post.campaign}`, "");
    lines.push("```text");
    lines.push(post.body);
    lines.push("```", "");
    lines.push("Record after publishing:");
    lines.push("");
    lines.push("```bash");
    lines.push(actionCommand(post));
    lines.push("```", "");
  }

  lines.push("## Measurement", "");
  lines.push("- Publish priority 1 and 2 first. Do not wait to publish all five posts before measuring.");
  lines.push("- Run `pnpm lead:events` after posting to pull CTA clicks.");
  lines.push("- Run `pnpm lead:forms` after posting to pull mini-audit requests.");
  lines.push("- Run `pnpm lead:ops` to see whether the campaign produced install, checkout, or form intent.");
  lines.push("- If CTA and form counts are still 0 after priority 1 and 2, revise the hook before publishing priorities 3-5.");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm lead:forms && pnpm lead:events && pnpm lead:report && pnpm lead:ops");
  lines.push("```");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function priorityReason(post) {
  if (post.campaign === "framer_aeo_benchmark") {
    return "Highest-trust public proof asset; drives benchmark form intent.";
  }
  if (post.title === "Agency handoff post") {
    return "Best path to service revenue via one active client URL.";
  }
  if (post.campaign === "llms_txt_workflow") {
    return "Tactical education post after the benchmark has context.";
  }
  if (post.campaign === "mini_audit") {
    return "Broader creator offer once the proof asset is visible.";
  }
  return "Manual partner follow-up after public posts exist.";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function actionCommand(post) {
  return [
    "pnpm lead:actions -- --add",
    "--type post",
    `--channel ${shellQuote(post.action_channel || post.channel)}`,
    `--campaign ${shellQuote(post.campaign)}`,
    "--status done",
    `--target ${shellQuote(post.title)}`,
    "--evidence '<published-url-or-thread-id>'",
    `--note ${shellQuote(`published ${post.title} from distribution kit`)}`,
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
  process.stdout.write(`Distribution posts: ${kit.posts.length}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
