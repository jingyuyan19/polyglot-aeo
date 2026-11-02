#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT = ".tmp/framer-directory-submit-kit.md";
const DEFAULT_JSON = ".tmp/framer-directory-submit-kit.json";
const SITE = "https://polyglotaeo.com";
const MARKETPLACE = "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";

const PRODUCT = {
  name: "Polyglot AEO",
  category: "SEO / AI",
  pricing: "Free Framer Marketplace plugin with optional Pro upgrade",
  contact: "jimmymjing@gmail.com",
  short_description:
    "Check whether a published Framer site is readable to AI agents across /llms.txt, metadata, schema, localized pages, CMS gaps, and launch handoff QA.",
  long_description: `Polyglot AEO helps Framer builders and agencies run an AI-readiness QA pass before client handoff. It checks /llms.txt reachability, priority page coverage, localized metadata/schema consistency, CMS title and description gaps, and published-domain readiness. The workflow is useful for SEO, AEO, multilingual sites, and client launch QA.`,
  tags: ["framer", "seo", "ai", "aeo", "llms.txt", "schema", "multilingual", "qa"],
};

const TARGETS = [
  {
    id: "frameplate_plugin",
    name: "Frameplate plugin directory",
    channel: "frameplate",
    submit_url: "https://frameplate.co/submit/framer-plugin",
    campaign: "frameplate_plugin",
    priority: 1,
    action: "Submit Polyglot AEO as a Framer plugin.",
    status: "manual_confirmation_required",
    evidence_hint: "<frameplate-submission-confirmation-or-screenshot>",
  },
  {
    id: "frameplate_resource",
    name: "Frameplate resource directory",
    channel: "frameplate",
    submit_url: "https://frameplate.co/submit/framer-resource",
    campaign: "frameplate_resource",
    priority: 2,
    action: "Submit the public Framer AEO benchmark as a resource.",
    status: "manual_confirmation_required",
    evidence_hint: "<frameplate-resource-confirmation-or-screenshot>",
  },
  {
    id: "frameplugins_tally",
    name: "Frameplugins submit form",
    channel: "frameplugins",
    submit_url: "https://tally.so/r/w4okxO",
    campaign: "frameplugins_directory",
    priority: 3,
    action: "Use only if the directory owner asks for the Tally submission after the email pitch.",
    status: "wait_for_reply_or_confirmation",
    evidence_hint: "<frameplugins-tally-confirmation-or-screenshot>",
  },
  {
    id: "allframer_submit",
    name: "All Framer product submission",
    channel: "allframer",
    submit_url: "https://allframer.club/submit-product/",
    campaign: "allframer_directory",
    priority: 4,
    action: "Submit Polyglot AEO to the plugin directory, using SEO/Analytics and AI Plugin as category context.",
    status: "manual_confirmation_required",
    evidence_hint: "<allframer-submission-confirmation-or-screenshot>",
  },
  {
    id: "hyperframer_resource",
    name: "HyperFramer resource library",
    channel: "hyperframer",
    submit_url: "https://www.hyperframer.com/",
    campaign: "hyperframer_resource",
    priority: 5,
    action: "Follow up only if the email pitch gets a reply or if a public submit page is confirmed.",
    status: "email_pitch_sent",
    evidence_hint: "<hyperframer-resource-url-or-reply-id>",
  },
];

function usage() {
  return `
Usage:
  pnpm lead:directory

Options:
  --source <source>   UTM source. Default: directory_submission
  --medium <medium>   UTM medium. Default: directory
  --output <file>     Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>       JSON output. Default: ${DEFAULT_JSON}
  --help              Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    source: "directory_submission",
    medium: "directory",
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

function campaignUrl(pathname, campaign, args) {
  const url = new URL(pathname, SITE);
  url.searchParams.set("utm_source", args.source);
  url.searchParams.set("utm_medium", args.medium);
  url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

function buildKit(args) {
  const links = {
    benchmark: campaignUrl("/framer-aeo-benchmark/", "directory_benchmark", args),
    agency: campaignUrl("/agency/", "directory_agency", args),
    llms: campaignUrl("/llms-txt/", "directory_llms_txt", args),
    marketplace: MARKETPLACE,
  };

  return {
    generated_at: new Date().toISOString(),
    source: args.source,
    medium: args.medium,
    product: PRODUCT,
    links,
    targets: TARGETS,
    field_values: fieldValues(links),
    guardrails: guardrails(),
  };
}

function fieldValues(links) {
  return [
    ["Product name", PRODUCT.name],
    ["Marketplace URL", links.marketplace],
    ["Website / landing page", links.benchmark],
    ["Category", PRODUCT.category],
    ["Pricing", PRODUCT.pricing],
    ["Short description", PRODUCT.short_description],
    ["Long description", PRODUCT.long_description],
    ["Tags", PRODUCT.tags.join(", ")],
    ["Contact email", PRODUCT.contact],
  ];
}

function guardrails() {
  return [
    "Do not submit third-party forms without explicit confirmation at action time.",
    "Use Frameplate plugin submission first; submit the benchmark as a resource only after the plugin submission is done.",
    "Do not claim guaranteed AI-search rankings, citations, or official Framer endorsement.",
    "If a directory asks for screenshots, use current Marketplace or plugin screenshots rather than inventing listing media.",
    "After any accepted listing or form submission, record the evidence URL or screenshot with `pnpm lead:directory-record`.",
  ];
}

function renderMarkdown(kit) {
  const lines = [
    "# Framer Directory Submission Kit",
    "",
    `Generated: ${kit.generated_at}`,
    `UTM source: ${kit.source}`,
    `UTM medium: ${kit.medium}`,
    "",
    "## Product",
    "",
  ];

  for (const [label, value] of kit.field_values) {
    lines.push(`- ${label}: ${value}`);
  }

  lines.push("", "## Target Order", "");
  lines.push("| Priority | Target | Status | Submit URL | Action | Record command |");
  lines.push("|---:|---|---|---|---|---|");
  for (const target of kit.targets) {
    lines.push(
      `| ${target.priority} | ${target.name} | ${target.status} | ${target.submit_url} | ${target.action} | \`${actionCommand(target)}\` |`,
    );
  }

  lines.push("", "## Copy Blocks", "");
  lines.push("### Directory Short Description", "");
  lines.push("```text");
  lines.push(kit.product.short_description);
  lines.push("```", "");
  lines.push("### Directory Long Description", "");
  lines.push("```text");
  lines.push(kit.product.long_description);
  lines.push("```", "");
  lines.push("### Category/Tag Suggestion", "");
  lines.push("```text");
  lines.push(`${kit.product.category}; ${kit.product.tags.join(", ")}`);
  lines.push("```", "");

  lines.push("## Links", "");
  lines.push(`- Marketplace: ${kit.links.marketplace}`);
  lines.push(`- Benchmark: ${kit.links.benchmark}`);
  lines.push(`- Agency handoff: ${kit.links.agency}`);
  lines.push(`- llms.txt workflow: ${kit.links.llms}`);
  lines.push("");

  lines.push("## Record Commands", "");
  for (const target of kit.targets) {
    lines.push(`### ${target.name}`, "");
    lines.push("```bash");
    lines.push(actionCommand(target));
    lines.push("```", "");
  }

  lines.push("## Guardrails", "");
  for (const item of kit.guardrails) lines.push(`- ${item}`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function actionCommand(target) {
  const parts = [
    "pnpm lead:directory-record --",
    `--campaign ${shellQuote(target.campaign)}`,
    `--evidence ${shellQuote(target.evidence_hint)}`,
    `--note ${shellQuote(`submitted or confirmed ${PRODUCT.name} for ${target.name}`)}`,
  ];
  if (target.status !== "manual_confirmation_required") {
    parts.push("--force");
  }
  return parts.join(" ");
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
  process.stdout.write(`Directory targets: ${kit.targets.length}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
