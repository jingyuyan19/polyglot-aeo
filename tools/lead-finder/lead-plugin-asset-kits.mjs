#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_OUTPUT = ".tmp/framer-plugin-asset-kits.md";
const DEFAULT_JSON = ".tmp/framer-plugin-asset-kits.json";
const DEFAULT_ASSET_DIR = "docs/growth/assets";

const ASSET_KITS = {
  "Polyglot AEO": {
    marketplace: {
      title: "Polyglot AEO",
      subtitle: "Multilingual AEO QA, schema, and llms.txt checks for Framer handoff.",
      categories: ["Localization", "SEO", "AI"],
      description: [
        "Polyglot AEO helps Framer teams audit multilingual AI-search readiness before publishing or handing off a client site.",
        "Use it to check locale coverage, structured data, CMS gaps, llms.txt readiness, and published-site proof from one workflow.",
      ],
      bullets: [
        "Audit multilingual pages for AI/search readiness.",
        "Find missing schema, metadata, locale, and CMS handoff gaps.",
        "Generate handoff proof for agencies and client teams.",
      ],
      screenshot_storyboard: [
        "Dashboard showing multilingual AEO score and locale coverage.",
        "CMS gap manager with missing fields highlighted.",
        "llms.txt setup/review step with generated output.",
        "Published verifier showing pass/fail proof.",
      ],
      video_script: "Open a multilingual Framer site, run the AEO audit, fix one schema or CMS gap, then export/present the handoff proof.",
      faq: [
        ["Who is this for?", "Framer agencies and teams launching multilingual sites that need SEO/AEO handoff confidence."],
        ["Does it publish changes automatically?", "Keep publication controlled: review generated outputs and only apply changes you choose."],
        ["What is the paid value?", "Unlimited multilingual generation, schema installs, localized llms.txt, history, and reporting."],
      ],
    },
    landing: {
      url_path: "/framer-aeo-benchmark/",
      headline: "Framer AEO readiness before multilingual handoff",
      sections: [
        "Problem: multilingual Framer launches often miss schema, llms.txt, locale, and CMS handoff details.",
        "Workflow: audit, fix, verify, and hand off with proof.",
        "Proof: show before/after gaps and published-site checks.",
        "CTA: run the benchmark or install Polyglot AEO from Marketplace.",
      ],
    },
    community: {
      title: "What should you check before a multilingual Framer site is ready for AI search?",
      body: [
        "I put together a compact checklist for Framer teams shipping multilingual sites: locale coverage, schema, CMS field gaps, llms.txt, and published-page verification.",
        "Curious where other Framer teams see the most handoff pain: translated metadata, CMS collections, or proving the live page is ready?",
      ],
      primary_link: "Framer Marketplace listing or benchmark page after checkout/tracking gates pass.",
    },
    directory: {
      short_description: "Multilingual AEO, schema, and llms.txt QA plugin for Framer.",
      submission_note: "Best fit for SEO, AI, localization, and agency workflow directories.",
    },
    partner: {
      target: "Framer SEO/GEO/llms.txt guide owners and agency resource pages.",
      pitch: "I noticed your Framer SEO/AI resource. I built a free benchmark and plugin workflow for checking multilingual schema, llms.txt, and AI-search handoff gaps in Framer. Would a concise checklist/resource link be useful for your readers?",
    },
    customer: {
      subject: "Quick question about multilingual Framer handoff",
      body: "What is the one multilingual handoff issue you most want proof for before publishing: schema, CMS fields, translated metadata, llms.txt, or live-page verification?",
    },
    demo: "Run a before/after audit on one multilingual agency landing page.",
    seo: "Framer llms.txt and schema checklist for multilingual sites",
  },
  "Ally Auditor": {
    marketplace: {
      title: "Ally Auditor",
      subtitle: "WCAG accessibility checks and client-ready reports inside Framer.",
      categories: ["Utilities"],
      description: [
        "Ally Auditor helps Framer designers and agencies catch accessibility issues before client handoff.",
        "Audit alt text, headings, contrast, touch targets, and report-ready issue categories without leaving the Framer workflow.",
      ],
      bullets: [
        "Find WCAG issues directly in the Framer workflow.",
        "Prioritize alt text, contrast, headings, and report exports.",
        "Turn accessibility QA into a repeatable handoff step.",
      ],
      screenshot_storyboard: [
        "Canvas audit score with issue categories.",
        "Issue detail panel showing alt text or contrast fixes.",
        "Color-blind simulation or visual contrast check.",
        "Export/report screen for client handoff.",
      ],
      video_script: "Open a Framer page, run an accessibility scan, fix one high-impact issue, then export a concise QA report.",
      faq: [
        ["Who should use it?", "Framer designers, agencies, and template sellers who need a fast accessibility QA pass."],
        ["What should the free tier show?", "A useful score and issue categories so users understand the gaps."],
        ["What should Pro unlock?", "Full details, AI alt text, simulations, exports, history, and ignore rules."],
      ],
    },
    landing: {
      url_path: "/ally-auditor-accessibility-checklist/",
      headline: "Accessibility QA for Framer before client handoff",
      sections: [
        "Problem: accessibility checks are often left until late in the design process.",
        "Workflow: scan, prioritize, fix, and export proof.",
        "Use case: template sellers and agencies preparing client handoff.",
        "CTA: install Ally Auditor and run the first audit.",
      ],
    },
    community: {
      title: "A practical accessibility QA checklist for Framer handoff",
      body: [
        "I am refining a Framer accessibility workflow and would love feedback from people shipping client sites or templates.",
        "Which issue is most painful to catch late: alt text, contrast, headings, focus order, or report proof?",
      ],
      primary_link: "Marketplace listing after customer feedback baseline is recorded.",
    },
    directory: {
      short_description: "Accessibility checker and WCAG audit workflow for Framer.",
      submission_note: "Best fit for accessibility, QA, design tools, and Framer utility directories.",
    },
    partner: {
      target: "Template sellers, Framer agencies, and accessibility checklist publishers.",
      pitch: "I built Ally Auditor to make Framer accessibility QA easier before handoff. If you maintain a Framer/template/accessibility resource, I can share a concise WCAG handoff checklist and plugin workflow for your readers.",
    },
    customer: {
      subject: "Quick question about Ally Auditor Pro",
      body: "What were you hoping Ally Auditor would help you check or fix first: alt text, contrast, headings, client reports, or something else?",
    },
    demo: "Scan a template page and fix alt text, headings, contrast, and touch targets.",
    seo: "Framer accessibility audit checklist for WCAG handoff",
  },
  "Loka - Localization Hub": {
    marketplace: {
      title: "Loka - Localization Hub",
      subtitle: "Localize Framer sites with Google Sheets and simple text replacement.",
      categories: ["Localization"],
      description: [
        "Loka helps Framer builders connect a Google Sheets translation table to a site without a heavy localization system.",
        "Use it to extract text, manage translation keys, and install language switching components for small multilingual sites.",
      ],
      bullets: [
        "Connect a public Google Sheet as your translation source.",
        "Replace selected text layers with translation keys.",
        "Add a lightweight language switcher for small Framer sites.",
      ],
      screenshot_storyboard: [
        "Google Sheets connection setup.",
        "Detected languages and translation keys.",
        "Selected Framer text replacement workflow.",
        "Language switcher component preview.",
      ],
      video_script: "Connect a Google Sheet, replace a few text layers, add a language switcher, then preview two languages.",
      faq: [
        ["Who is this for?", "Designers and small teams who want simple Framer localization without a large CMS workflow."],
        ["What should be free?", "A small language/key limit that proves the workflow."],
        ["What should Pro unlock?", "Unlimited languages and keys, extraction, auto-detection, and switcher styles."],
      ],
    },
    landing: {
      url_path: "https://getloka.dev/",
      headline: "Localize a Framer site with Google Sheets",
      sections: [
        "Problem: small multilingual sites need simple translation workflows.",
        "Workflow: connect Sheet, detect keys, replace text, add switcher.",
        "Compliance note: checkout surfaces must stay on approved Creem/Loka origins.",
        "CTA: install Loka after Creem origin/referrer is verified.",
      ],
    },
    community: {
      title: "How do you localize a small Framer site without a full CMS workflow?",
      body: [
        "For small Framer sites, Google Sheets can be enough: keys, languages, review, and replacement without a heavy setup.",
        "Curious what people prefer for 2-5 language sites: CMS localization, manual pages, or a Sheets-driven workflow?",
      ],
      primary_link: "Use after Creem warning is resolved and checkout origin is verified.",
    },
    directory: {
      short_description: "Google Sheets localization workflow for Framer.",
      submission_note: "Best fit for localization, no-code, and Framer workflow directories after compliance closure.",
    },
    partner: {
      target: "Framer template creators and localization tutorial publishers.",
      pitch: "I built a lightweight Google Sheets localization workflow for Framer. If you cover multilingual templates or simple localization workflows, I can share a short tutorial and working plugin path.",
    },
    customer: {
      subject: "Quick question about Loka Pro",
      body: "What language count, key count, or switcher style did you need most when upgrading to Loka Pro?",
    },
    demo: "Extract text, translate in Sheets, connect, and publish a language switcher.",
    seo: "Localize Framer with Google Sheets tutorial",
  },
  "Gaode Maps": {
    marketplace: {
      title: "Gaode Maps",
      subtitle: "Generate Gaode/AMap Framer components for China-facing location pages.",
      categories: ["Integrations"],
      description: [
        "Gaode Maps helps Framer builders create China-ready map components without hand-coding AMap setup.",
        "Use it for local business pages, store locators, landing pages, and China-facing location sections.",
      ],
      bullets: [
        "Generate configurable Gaode/AMap code components.",
        "Add markers, routes, map styles, and bilingual UI details.",
        "Support China-facing location pages where generic map embeds are not enough.",
      ],
      screenshot_storyboard: [
        "Map generator controls for API key, location, and marker.",
        "Route or marker settings.",
        "Generated Framer Code Component preview.",
        "Mobile location page example.",
      ],
      video_script: "Choose a China-facing location, configure marker and style, generate the component, then preview it in a Framer page.",
      faq: [
        ["Who is this for?", "Framer builders creating China-facing local business, event, or store location pages."],
        ["Is there a paid tier?", "Not yet; the free plugin can seed future templates, services, or a pro map kit."],
        ["What should users prepare?", "A Gaode/AMap API key and the location or coordinates they want to display."],
      ],
    },
    landing: {
      url_path: "/gaode-maps-framer-tutorial/",
      headline: "Add Gaode Maps to a Framer site without coding",
      sections: [
        "Problem: China-facing location pages often need Gaode/AMap instead of generic embeds.",
        "Workflow: choose location, configure marker/route/style, generate Framer component.",
        "Use case: local services, stores, events, and China-market landing pages.",
        "CTA: install the free Gaode Maps plugin.",
      ],
    },
    community: {
      title: "Building a China-facing location page in Framer with Gaode/AMap",
      body: [
        "For China-facing Framer pages, Gaode/AMap can be a better fit than a generic map embed.",
        "I am collecting use cases: store locator, event page, route planning, or simple marker map?",
      ],
      primary_link: "Marketplace listing plus tutorial page after tracking plan is ready.",
    },
    directory: {
      short_description: "Free Gaode/AMap component generator for Framer.",
      submission_note: "Best fit for integrations, maps, China-market, and free Framer utility directories.",
    },
    partner: {
      target: "China-market Framer template creators and local business page builders.",
      pitch: "I built a free Gaode/AMap component generator for Framer. If you publish China-market landing pages or local business templates, I can share a concise tutorial for adding Gaode Maps without coding.",
    },
    customer: {
      subject: "Quick question about Gaode Maps for Framer",
      body: "Which map workflow would help most next: multiple markers, route planning, POI search, custom styles, or bilingual controls?",
    },
    demo: "Generate a Framer Code Component with Gaode markers and route planning.",
    seo: "Add Gaode Maps to Framer without coding",
  },
};

function usage() {
  return `
Usage:
  pnpm lead:asset-kits

Options:
  --portfolio <file>    Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --experiments <file>  Portfolio experiments JSON. Default: ${DEFAULT_EXPERIMENTS}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --asset-dir <dir>     Per-plugin asset files directory. Default: ${DEFAULT_ASSET_DIR}
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    portfolio: DEFAULT_PORTFOLIO,
    experiments: DEFAULT_EXPERIMENTS,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    assetDir: DEFAULT_ASSET_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    const map = {
      "--portfolio": "portfolio",
      "--experiments": "experiments",
      "--output": "output",
      "--json": "json",
      "--asset-dir": "assetDir",
    };
    if (map[key]) {
      args[map[key]] = value;
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

async function readJson(file, fallback = null) {
  const text = await readText(file);
  return text ? JSON.parse(text) : fallback;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "plugin";
}

function experimentFor(name, experiments) {
  const rows = Array.isArray(experiments?.experiments) ? experiments.experiments : [];
  return rows.find((row) => row.plugin === name) || null;
}

function buildKit(profile, experiments) {
  const base = ASSET_KITS[profile.name] || null;
  const experiment = experimentFor(profile.name, experiments);
  if (!base) return null;
  return {
    plugin: profile.name,
    slug: profile.slug || slugify(profile.name),
    marketplace_url: profile.marketplace_url,
    priority: profile.priority || {},
    current_signal: profile.signals?.[0] || "",
    blocker: profile.blockers?.[0] || "",
    next_action: profile.next_actions?.[0] || "",
    experiment: experiment
      ? {
          channel: experiment.channel || "",
          status: experiment.status || "",
          primary_metric: experiment.primary_metric || "",
          confirmation: experiment.confirmation || "",
          evidence_required: experiment.evidence_required || "",
        }
      : null,
    ...base,
    tracking: trackingPlan(profile, experiment),
    safety: safetyPlan(profile, experiment),
  };
}

function trackingPlan(profile, experiment) {
  const slug = profile.slug || slugify(profile.name);
  return {
    campaign: `${slug}_asset_test`,
    primary_metric: experiment?.primary_metric || "Marketplace users/opens lift plus one qualified reply or form/CTA signal.",
    utm: {
      source: "<channel>",
      medium: "<community|directory|partner|customer_email|seo>",
      campaign: `${slug}_asset_test`,
      content: "<asset_variant>",
    },
    review_windows: experiment?.review_windows || "24h,48h,72h,7d",
  };
}

function safetyPlan(profile, experiment) {
  const blocked = /warning|blocked|compliance|not serving|payment/i.test(`${profile.blockers?.join(" ") || ""} ${experiment?.status || ""}`);
  return {
    external_action_allowed: false,
    reason: blocked
      ? "External action remains gated by the current blocker and requires explicit confirmation."
      : "External action still requires action-time confirmation and tracking evidence.",
    confirmation: experiment?.confirmation || "Explicit confirmation required at action time.",
  };
}

function buildReport({ portfolio, experiments }) {
  const profiles = Array.isArray(portfolio?.profiles) ? portfolio.profiles : [];
  const kits = profiles.map((profile) => buildKit(profile, experiments)).filter(Boolean);
  return {
    generated_at: new Date().toISOString(),
    status: kits.length ? "ready" : "missing_portfolio",
    kits,
    recommendation: kits.length
      ? "Use these asset kits as local review packs; publish/send/submit only through the confirmation gates."
      : "Run pnpm lead:portfolio first.",
  };
}

function renderReport(report) {
  const lines = [
    "# Framer Plugin Asset Kits",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Portfolio Asset Matrix",
    "",
    "| Plugin | Priority | Marketplace | Community | Directory | Partner | Customer | SEO | Confirmation |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const kit of report.kits) {
    lines.push(`| ${link(kit.plugin, kit.marketplace_url)} | ${pipe(kit.priority?.label)} | ${pipe(kit.marketplace.subtitle)} | ${pipe(kit.community.title)} | ${pipe(kit.directory.short_description)} | ${pipe(kit.partner.target)} | ${pipe(kit.customer.subject)} | ${pipe(kit.seo)} | ${pipe(kit.safety.confirmation)} |`);
  }
  lines.push("");
  for (const kit of report.kits) lines.push(renderKit(kit));
  return `${lines.join("\n")}\n`;
}

function renderKit(kit) {
  const lines = [
    `## ${kit.plugin}`,
    "",
    `- Marketplace: ${kit.marketplace_url}`,
    `- Priority: ${kit.priority?.label || ""}`,
    `- Current signal: ${kit.current_signal}`,
    `- Blocker: ${kit.blocker}`,
    `- Next action: ${kit.next_action}`,
    `- Experiment: ${kit.experiment?.channel || "none"} / ${kit.experiment?.status || "none"}`,
    `- Confirmation: ${kit.safety.confirmation}`,
    "",
    "### Marketplace",
    "",
    `Title: ${kit.marketplace.title}`,
    `Subtitle: ${kit.marketplace.subtitle}`,
    `Categories: ${kit.marketplace.categories.join(", ")}`,
    "",
    "Description:",
    ...kit.marketplace.description.map((item) => `- ${item}`),
    "",
    "Bullets:",
    ...kit.marketplace.bullets.map((item) => `- ${item}`),
    "",
    "Screenshot storyboard:",
    ...kit.marketplace.screenshot_storyboard.map((item, index) => `${index + 1}. ${item}`),
    "",
    `Video script: ${kit.marketplace.video_script}`,
    "",
    "FAQ:",
    ...kit.marketplace.faq.map(([question, answer]) => `- ${question}: ${answer}`),
    "",
    "### Landing Page",
    "",
    `Path: ${kit.landing.url_path}`,
    `Headline: ${kit.landing.headline}`,
    ...kit.landing.sections.map((item) => `- ${item}`),
    "",
    "### Framer Community",
    "",
    `Title: ${kit.community.title}`,
    ...kit.community.body.map((item) => `- ${item}`),
    `Primary link: ${kit.community.primary_link}`,
    "",
    "### Directory",
    "",
    `Short description: ${kit.directory.short_description}`,
    `Submission note: ${kit.directory.submission_note}`,
    "",
    "### Partner Outreach",
    "",
    `Target: ${kit.partner.target}`,
    `Pitch: ${kit.partner.pitch}`,
    "",
    "### Customer/Support",
    "",
    `Subject: ${kit.customer.subject}`,
    `Body: ${kit.customer.body}`,
    "",
    "### Demo And SEO",
    "",
    `Short demo: ${kit.demo}`,
    `SEO/AEO angle: ${kit.seo}`,
    "",
    "### Tracking",
    "",
    `Campaign: ${kit.tracking.campaign}`,
    `Primary metric: ${kit.tracking.primary_metric}`,
    `UTM: source=${kit.tracking.utm.source}; medium=${kit.tracking.utm.medium}; campaign=${kit.tracking.utm.campaign}; content=${kit.tracking.utm.content}`,
    `Review windows: ${kit.tracking.review_windows}`,
    "",
    "### Safety",
    "",
    `External action allowed now: ${kit.safety.external_action_allowed ? "yes" : "no"}`,
    `Reason: ${kit.safety.reason}`,
    "",
  ];
  return lines.join("\n");
}

function renderPluginFile(kit) {
  return [`# ${kit.plugin} Asset Kit`, "", renderKit(kit)].join("\n");
}

function link(label, url) {
  return url ? `[${label}](${url})` : label;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
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
  const [portfolio, experiments] = await Promise.all([
    readJson(args.portfolio, null),
    readJson(args.experiments, null),
  ]);
  const report = buildReport({ portfolio, experiments });
  await Promise.all([
    writeText(args.output, renderReport(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
    ...report.kits.map((kit) => writeText(path.join(args.assetDir, `${kit.slug}.md`), renderPluginFile(kit))),
  ]);
  process.stdout.write(`Asset kits: ${args.output}\n`);
  process.stdout.write(`Kits: ${report.kits.map((kit) => kit.plugin).join(", ")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
