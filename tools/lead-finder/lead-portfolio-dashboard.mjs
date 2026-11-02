#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  annotateComplianceWarning,
  isOpenCreemComplianceWarning,
} from "./compliance-scope.mjs";

const DEFAULT_ACTIONS = "tools/lead-finder/actions.local.csv";
const DEFAULT_REVENUE = "tools/lead-finder/revenue.local.csv";
const DEFAULT_MARKETPLACE = "tools/lead-finder/marketplace-snapshots.local.csv";
const DEFAULT_POLYGLOT_MARKETPLACE_PUBLIC = ".tmp/framer-marketplace-public.json";
const DEFAULT_POLYGLOT_MARKETPLACE_PREFLIGHT = ".tmp/framer-marketplace-preflight.json";
const DEFAULT_POLYGLOT_PAYMENT = ".tmp/framer-payment-compliance-recovery.json";
const DEFAULT_POLYGLOT_CHECKOUT = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_POLYGLOT_TRACKING = ".tmp/framer-tracking-freshness.json";
const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_CREEM = ".tmp/framer-creem-compliance-review.json";
const DEFAULT_OUTPUT = ".tmp/framer-portfolio-growth-dashboard.md";
const DEFAULT_JSON = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_PLUGIN_DIR = "docs/growth/plugins";

const PLUGINS = [
  {
    id: "polyglot_aeo",
    slug: "polyglot-aeo",
    name: "Polyglot AEO",
    marketplace_url: "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/",
    category: "Localization, SEO, AI",
    pricing: "Paid",
    icp: "Framer agencies and multilingual site teams preparing AI/search handoff QA.",
    pain: "Localized sites launch with missing schema, llms.txt, CMS gaps, and weak AI/search readiness.",
    positioning: "Multilingual AEO QA for Framer before client handoff.",
    free_value: "Audit locale coverage, schema status, llms.txt readiness, CMS gaps, and published-site basics.",
    paid_value: "Full multilingual generation, unlimited schema installs, localized llms.txt, verification, history, and reports.",
    best_channels: ["Framer Marketplace", "Framer Community", "Agency outreach", "SEO/AEO partner content", "Directories"],
    priority_reason: "Newest strategic plugin with assets and launch system, but blocked before traffic scaling.",
  },
  {
    id: "ally_auditor",
    slug: "ally-auditor",
    name: "Ally Auditor",
    marketplace_url: "https://www.framer.com/community/marketplace/plugins/ally-auditor/",
    category: "Utilities",
    pricing: "Paid",
    icp: "Framer designers, agencies, and template sellers who need WCAG checks inside the canvas.",
    pain: "Accessibility QA is easy to skip until late and is hard to inspect across canvas nodes.",
    positioning: "WCAG accessibility audit and fix workflow inside Framer.",
    free_value: "Preview accessibility issue categories and get a canvas-level compliance score.",
    paid_value: "Unlimited issue details, AI alt text, color-blind simulation, export reports, history, and ignore rules.",
    best_channels: ["Existing customer feedback", "Marketplace refresh", "Accessibility content", "Framer Community", "Template seller outreach"],
    priority_reason: "Recent real paid customer means the fastest path is feedback, proof, and listing refresh.",
  },
  {
    id: "loka_pro",
    slug: "loka-localization-hub",
    name: "Loka - Localization Hub",
    marketplace_url: "https://www.framer.com/community/marketplace/plugins/loka-localization-hub/",
    category: "Localization",
    pricing: "Paid",
    icp: "Designers and small teams who want simple multilingual Framer sites using Google Sheets.",
    pain: "Framer localization can feel heavy when a team only needs quick translation extraction, review, and switching.",
    positioning: "Localize Framer with Google Sheets.",
    free_value: "Two languages, limited translation keys, and a basic switcher.",
    paid_value: "Unlimited languages and keys, full text extraction, auto-detection, and switcher styles.",
    best_channels: ["Compliance recovery", "Existing customer feedback", "Marketplace refresh", "Localization tutorials", "Framer Community"],
    priority_reason: "Active revenue plus an open Creem warning makes this the highest-risk account-protection item.",
  },
  {
    id: "gaode_maps_assistant",
    slug: "gaode-maps-assistant",
    name: "Gaode Maps",
    marketplace_url: "https://www.framer.com/community/marketplace/plugins/gaode-maps-assistant/",
    category: "Integrations",
    pricing: "Free",
    icp: "Framer builders making China-facing landing pages, location pages, stores, or local service sites.",
    pain: "China location pages need AMap/Gaode rather than generic map embeds, but designers do not want code setup.",
    positioning: "Visual Gaode/AMap component generator for Framer.",
    free_value: "Generate configurable Gaode map code components with markers, routes, styles, and bilingual UI.",
    paid_value: "No paid tier yet; monetization can come later through templates, services, or a pro map kit.",
    best_channels: ["China-focused SEO tutorials", "Framer Community", "Template partnerships", "Directory listing", "Docs content"],
    priority_reason: "Useful niche free utility, but lower immediate revenue until tracking or partner interest appears.",
  },
];

function usage() {
  return `
Usage:
  pnpm lead:portfolio

Options:
  --actions <file>             Action log CSV. Default: ${DEFAULT_ACTIONS}
  --revenue <file>             Revenue CSV. Default: ${DEFAULT_REVENUE}
  --marketplace <file>         Creator Space snapshot CSV. Default: ${DEFAULT_MARKETPLACE}
  --polyglot-public <file>     Polyglot public listing JSON. Default: ${DEFAULT_POLYGLOT_MARKETPLACE_PUBLIC}
  --polyglot-preflight <file>  Polyglot Marketplace preflight JSON. Default: ${DEFAULT_POLYGLOT_MARKETPLACE_PREFLIGHT}
  --polyglot-payment <file>    Polyglot payment recovery JSON. Default: ${DEFAULT_POLYGLOT_PAYMENT}
  --polyglot-checkout <file>   Polyglot checkout origin JSON. Default: ${DEFAULT_POLYGLOT_CHECKOUT}
  --polyglot-tracking <file>   Polyglot tracking freshness JSON. Default: ${DEFAULT_POLYGLOT_TRACKING}
  --public-health <file>       Public landing/checkout health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --creem <file>               Creem compliance JSON. Default: ${DEFAULT_CREEM}
  --output <file>              Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                JSON output. Default: ${DEFAULT_JSON}
  --plugin-dir <dir>           Per-plugin growth files directory. Default: ${DEFAULT_PLUGIN_DIR}
  --skip-fetch                 Do not fetch live Marketplace pages.
  --help                       Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    actions: DEFAULT_ACTIONS,
    revenue: DEFAULT_REVENUE,
    marketplace: DEFAULT_MARKETPLACE,
    polyglotPublic: DEFAULT_POLYGLOT_MARKETPLACE_PUBLIC,
    polyglotPreflight: DEFAULT_POLYGLOT_MARKETPLACE_PREFLIGHT,
    polyglotPayment: DEFAULT_POLYGLOT_PAYMENT,
    polyglotCheckout: DEFAULT_POLYGLOT_CHECKOUT,
    polyglotTracking: DEFAULT_POLYGLOT_TRACKING,
    publicHealth: DEFAULT_PUBLIC_HEALTH,
    creem: DEFAULT_CREEM,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    pluginDir: DEFAULT_PLUGIN_DIR,
    skipFetch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--skip-fetch") {
      args.skipFetch = true;
      continue;
    }
    const map = {
      "--actions": "actions",
      "--revenue": "revenue",
      "--marketplace": "marketplace",
      "--polyglot-public": "polyglotPublic",
      "--polyglot-preflight": "polyglotPreflight",
      "--polyglot-payment": "polyglotPayment",
      "--polyglot-checkout": "polyglotCheckout",
      "--polyglot-tracking": "polyglotTracking",
      "--public-health": "publicHealth",
      "--creem": "creem",
      "--output": "output",
      "--json": "json",
      "--plugin-dir": "pluginDir",
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
      } else if (char === '"') quoted = false;
      else cell += char;
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
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values, index) => ({
      ...Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""])),
      __index: index,
    }));
}

async function readRows(file) {
  const text = await readText(file);
  return text ? parseCsv(text) : [];
}

async function fetchMarketplace(plugin, skipFetch) {
  if (skipFetch) return { ok: false, skipped: true, url: plugin.marketplace_url };
  try {
    const response = await fetch(plugin.marketplace_url, {
      headers: { "user-agent": "FramerPortfolioGrowthOps/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await response.text();
    const text = htmlToText(html);
    return {
      ok: response.ok,
      status: response.status,
      url: plugin.marketplace_url,
      title: decode(match(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || ""),
      headline: match(text, new RegExp(`${escapeRegExp(plugin.name.split(" - ")[0])}[^\\n]{0,120}`, "i")) || "",
      published: match(text, /Published\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/) || "",
      updated: match(text, /Updated\s+([^.\n]{1,40}?)\s*View activity/) || match(text, /Updated\s+([^.\n]{1,40})/) || "",
      pricing: match(text, /Pricing\s+(Paid|Free)/) || plugin.pricing,
      readable: text.length > 200,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: plugin.marketplace_url,
      error: error?.message || String(error),
    };
  }
}

function htmlToText(html) {
  return decode(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function match(value, pattern) {
  const result = String(value || "").match(pattern);
  return result ? (result[1] || result[0] || "").trim() : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function revenueFor(plugin, rows) {
  const terms = {
    polyglot_aeo: ["polyglot"],
    ally_auditor: ["ally auditor"],
    loka_pro: ["loka"],
    gaode_maps_assistant: ["gaode"],
  }[plugin.id] || [plugin.name.toLowerCase()];
  return rows.filter((row) => terms.some((term) => String(row.product || "").toLowerCase().includes(term)));
}

function positiveExternalRevenue(rows) {
  return rows.filter((row) => Number(row.amount_usd || 0) > 0 && !/test/i.test(row.product || "") && !/jimmymjing@gmail\.com/i.test(row.customer || ""));
}

function latestMarketplaceFor(plugin, rows) {
  return [...rows]
    .filter((row) => (row.plugin || "").toLowerCase() === plugin.name.toLowerCase())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

function actionMatches(plugin, row) {
  const text = `${row.campaign || ""}\n${row.target || ""}\n${row.evidence || ""}\n${row.note || ""}`.toLowerCase();
  if (plugin.id === "polyglot_aeo") return text.includes("polyglot") || text.includes("framer_aeo") || text.includes("plugin_upgrade");
  if (plugin.id === "ally_auditor") return text.includes("ally");
  if (plugin.id === "loka_pro") return text.includes("loka") || text.includes("getloka");
  if (plugin.id === "gaode_maps_assistant") return text.includes("gaode");
  return false;
}

function pluginTerms(plugin) {
  const text = `${plugin?.id || ""} ${plugin?.name || ""} ${plugin?.slug || ""}`.toLowerCase();
  if (/gaode|amap/.test(text)) return ["gaode", "gaode maps", "gaodemaps", "amap"];
  if (/ally/.test(text)) return ["ally", "ally auditor", "allyauditor"];
  if (/loka/.test(text)) return ["loka", "loka pro", "getloka"];
  if (/polyglot/.test(text)) return ["polyglot", "polyglot aeo", "polyglotaeo"];
  return text.trim() ? [text.trim()] : [];
}

function actionText(row) {
  return [
    row.type,
    row.channel,
    row.campaign,
    row.status,
    row.target,
    row.evidence,
    row.note,
  ].join(" ").toLowerCase();
}

function isOpenAction(row) {
  return !/done|resolved|closed|skipped|cancelled|canceled/i.test(row.status || "");
}

function openHostingWarningsForPlugin(actionRows, plugin) {
  const terms = pluginTerms(plugin);
  if (!terms.length) return [];
  return (actionRows || []).filter((row) => {
    if (!/hosting_warning/i.test(row.type || "")) return false;
    if (!isOpenAction(row)) return false;
    const haystack = actionText(row);
    return terms.some((term) => haystack.includes(term));
  });
}

function hostingWarningBlocker(row) {
  return [
    "Open hosting warning blocks publish/deploy execution",
    row.campaign,
    row.status,
    row.target,
    row.evidence,
    row.note,
  ].filter(Boolean).join(": ").replace(/\r?\n/g, " ").trim();
}

function latestGmailNote(actionRows) {
  return [...actionRows]
    .filter((row) => row.type === "email_monitor" && row.channel === "gmail")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.__index || 0) - (a.__index || 0))[0]?.note ||
    "No Gmail signal sweep has been recorded in the action log yet.";
}

function buildProfile({ plugin, marketplace, revenueRows, actionRows, creatorSnapshot, polyglot, publicHealth, creem }) {
  const pluginRevenue = revenueFor(plugin, revenueRows);
  const externalRevenue = positiveExternalRevenue(pluginRevenue);
  const pluginActions = actionRows.filter((row) => actionMatches(plugin, row));
  const warnings = actionRows
    .filter(isOpenCreemComplianceWarning)
    .map(annotateComplianceWarning)
    .filter((row) => row.product_scope === plugin.id);
  const hostingWarnings = openHostingWarningsForPlugin(actionRows, plugin);

  const signals = [];
  if (creatorSnapshot) signals.push(`Creator Space baseline: users ${creatorSnapshot.users}, opens ${creatorSnapshot.opens}, version ${creatorSnapshot.version}, updated ${creatorSnapshot.updated}.`);
  if (externalRevenue.length) signals.push(`External Creem revenue evidence: ${externalRevenue.length} payment(s), $${externalRevenue.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0).toFixed(2)}.`);
  if (marketplace?.ok) signals.push(`Public Marketplace page reachable: ${marketplace.status}; updated ${marketplace.updated || "unknown"}.`);
  if (publicHealth) signals.push(`Public health: ${publicHealth.status}; ${publicHealth.signals?.length || 0} signal(s), ${publicHealth.blockers?.length || 0} blocker(s), ${publicHealth.gaps?.length || 0} gap(s).`);
  if (!signals.length) signals.push("No install, open, reply, or revenue signal has been imported yet.");

  const blockers = blockersFor(plugin, { warnings, hostingWarnings, polyglot, marketplace, publicHealth });
  const nextActions = nextActionsFor(plugin, { warnings, hostingWarnings, polyglot, externalRevenue, marketplace });

  return {
    ...plugin,
    marketplace,
    creator_snapshot: creatorSnapshot,
    revenue_rows: pluginRevenue,
    external_revenue_rows: externalRevenue,
    actions_count: pluginActions.length,
    open_warnings: warnings,
    open_hosting_warnings: hostingWarnings,
    public_health: publicHealth,
    signals,
    blockers,
    next_actions: nextActions,
    priority: priorityFor(plugin, { warnings, externalRevenue, polyglot }),
    assets: assetsFor(plugin),
  };
}

function blockersFor(plugin, context) {
  const blockers = [];
  for (const warning of context.hostingWarnings || []) {
    blockers.push(hostingWarningBlocker(warning));
  }
  if (plugin.id === "polyglot_aeo") {
    if (context.polyglot.payment?.status && context.polyglot.payment.status !== "ready_for_marketplace_confirmation") {
      blockers.push(`Payment recovery is ${context.polyglot.payment.status}: ${context.polyglot.payment.recommendation}`);
    }
    if (context.polyglot.preflight?.upload_allowed !== true) {
      blockers.push(`Marketplace upload preflight is blocked: ${(context.polyglot.preflight?.blockers || []).slice(0, 3).join("; ")}`);
    }
    if (context.polyglot.tracking?.status && context.polyglot.tracking.status !== "fresh") {
      blockers.push(`Production tracking is ${context.polyglot.tracking.status}.`);
    }
  }
  if (plugin.id === "loka_pro" && context.warnings.length) {
    blockers.push("Open Creem unregistered checkout traffic warning scoped to Loka Pro; support request sent, awaiting human origin/referrer.");
  }
  if (context.publicHealth?.blockers?.length) {
    blockers.push(...context.publicHealth.blockers.slice(0, 3));
  }
  if (!context.marketplace?.ok) {
    blockers.push(`Marketplace page fetch did not verify cleanly (${context.marketplace?.status || context.marketplace?.error || "unknown"}).`);
  }
  if (!blockers.length) blockers.push("No hard blocker recorded; needs fresh Creator Space metrics and tracking baseline.");
  return blockers;
}

function nextActionsFor(plugin, context) {
  if (context.hostingWarnings?.length) {
    return [
      "Resolve the open hosting warning before publishing/deploying owned-site or use-case traffic.",
      "After Netlify credits/billing are restored or reset, record closure in the action log and rerun portfolio ops.",
      "Only then proceed with the smallest tracked owned-site or use-case page experiment.",
    ];
  }
  if (plugin.id === "loka_pro") {
    return [
      "Resolve Creem warning first: identify exact referrer/origin, then either register that source in Creem or move all checkout clicks through https://getloka.dev.",
      "Search Loka code/site/listings for direct Creem payment links and replace third-party/plugin direct links with a getloka.dev checkout bridge.",
      "After human Creem confirmation, request feedback from a recent Loka customer and turn it into Marketplace proof.",
    ];
  }
  if (plugin.id === "ally_auditor") {
    return [
      "Treat the recent Ally Auditor sale as the fastest learning loop: draft a support/feedback email for the customer, but send only after confirmation.",
      "Refresh Marketplace screenshots/copy around WCAG score, AI alt text, and report export.",
      "Create one accessibility QA Community post with no hard sell and record Marketplace/users baseline first.",
    ];
  }
  if (plugin.id === "polyglot_aeo") {
    return [
      "Refresh Cloudflare dry-run, then use the existing confirmation gate before any Worker deploy.",
      "Restore Netlify deploy ability so production checkout/tracking matches the local fresh build.",
      "After preflight passes, upload current plugin.zip, record Creator Space evidence, then run one Community experiment.",
    ];
  }
  return [
    "Create a simple China-location Framer tutorial page and link the free plugin as the implementation path.",
    "Collect Creator Space users/opens baseline before investing in outreach.",
    "Test one Framer Community utility post aimed at China-facing location pages.",
  ];
}

function priorityFor(plugin, context) {
  if (plugin.id === "loka_pro" && context.warnings.length) return { rank: 1, label: "Protect revenue/compliance" };
  if (plugin.id === "ally_auditor" && context.externalRevenue.length) return { rank: 2, label: "Exploit recent paid signal" };
  if (plugin.id === "polyglot_aeo") return { rank: 3, label: "Unblock strategic launch system" };
  return { rank: 4, label: "Maintain organic utility channel" };
}

function assetsFor(plugin) {
  const map = {
    polyglot_aeo: {
      community: "What should Framer teams check before a multilingual site is ready for AI search?",
      directory: "AEO, llms.txt, schema, localization QA plugin for Framer.",
      partner: "Offer a Framer AEO benchmark/resource for agency SEO or llms.txt guides.",
      customer: "Ask installers where multilingual handoff breaks and which report proof would help them.",
      demo: "Run a before/after multilingual handoff QA pass on one Framer site.",
      seo: "Framer llms.txt and schema checklist for multilingual sites.",
    },
    ally_auditor: {
      community: "A compact WCAG checklist for Framer canvas QA before handoff.",
      directory: "Accessibility checker and WCAG audit utility for Framer.",
      partner: "Pitch accessibility QA resource to template sellers and Framer agencies.",
      customer: "Ask paid users which audit category drove purchase and what report they need.",
      demo: "Scan a template page and fix alt text, headings, contrast, and touch targets.",
      seo: "Framer accessibility audit checklist for WCAG handoff.",
    },
    loka_pro: {
      community: "How to localize a small Framer site with Google Sheets instead of a full CMS.",
      directory: "Google Sheets localization workflow for Framer.",
      partner: "Pitch no-CMS localization workflow to template and micro-SaaS Framer creators.",
      customer: "Ask paid users what language count, key count, and switcher style they need next.",
      demo: "Extract text, translate in Sheets, connect, and publish a language switcher.",
      seo: "Localize Framer with Google Sheets tutorial.",
    },
    gaode_maps_assistant: {
      community: "Building a China-facing location page in Framer with Gaode/AMap.",
      directory: "Free Gaode Maps component generator for Framer.",
      partner: "Pitch China-market location page tutorial to Framer builders and local business templates.",
      customer: "Ask users whether they need routes, POI search, or map style presets.",
      demo: "Generate a Framer Code Component with Gaode markers and route planning.",
      seo: "Add Gaode Maps to Framer without coding.",
    },
  };
  return map[plugin.id];
}

function renderDashboard(data) {
  const lines = [
    "# Framer Plugin Portfolio Growth Dashboard",
    "",
    `Generated: ${data.generated_at}`,
    "",
    "## Portfolio Priority",
    "",
    "| Rank | Plugin | Priority | Current signal | Main blocker | Next action |",
    "|---:|---|---|---|---|---|",
  ];
  for (const profile of [...data.profiles].sort((a, b) => a.priority.rank - b.priority.rank)) {
    lines.push(`| ${profile.priority.rank} | ${link(profile.name, profile.marketplace_url)} | ${profile.priority.label} | ${pipe(profile.signals[0])} | ${pipe(profile.blockers[0])} | ${pipe(profile.next_actions[0])} |`);
  }

  lines.push("", "## Cross-Portfolio Readout", "");
  lines.push(`- Public Marketplace pages checked: ${data.marketplace_ok}/${data.profiles.length}.`);
  lines.push(`- Open Polyglot Creem warnings: ${data.polyglot_creem_open}.`);
  lines.push(`- Open other-store Creem warnings: ${data.other_creem_open}.`);
  lines.push(`- External paid signals in ledger: ${data.external_revenue_count}.`);
  lines.push(`- Latest Gmail signal note: ${data.gmail_note}.`);
  lines.push("");

  for (const profile of data.profiles) {
    lines.push(renderProfile(profile));
  }
  return `${lines.join("\n")}\n`;
}

function renderProfile(profile) {
  const lines = [
    `## ${profile.name}`,
    "",
    `- Marketplace: ${link(profile.marketplace_url, profile.marketplace_url)}`,
    `- Status: live public page ${profile.marketplace?.ok ? "verified" : "not verified"}; pricing ${profile.marketplace?.pricing || profile.pricing}; category ${profile.category}.`,
    `- Published/updated: ${profile.marketplace?.published || "unknown"} / ${profile.marketplace?.updated || "unknown"}.`,
    `- Creator Space: ${creatorSummary(profile)}.`,
    `- Priority: ${profile.priority?.rank || "?"}. ${profile.priority?.label || "unranked"}.`,
    `- Revenue/customer evidence: ${revenueSummary(profile)}.`,
    `- ICP: ${profile.icp}`,
    `- Pain: ${profile.pain}`,
    `- Positioning: ${profile.positioning}`,
    `- Free value: ${profile.free_value}`,
    `- Paid value: ${profile.paid_value}`,
    `- Best channels: ${profile.best_channels.join(", ")}`,
    `- Public health: ${profile.public_health?.status || "not refreshed"}`,
    "",
    "Signals:",
    ...profile.signals.map((item) => `- ${item}`),
    "",
    "Blockers:",
    ...profile.blockers.map((item) => `- ${item}`),
    "",
    "Next actions:",
    ...profile.next_actions.map((item) => `- ${item}`),
    "",
    "Promotion assets:",
    `- Community: ${profile.assets.community}`,
    `- Directory: ${profile.assets.directory}`,
    `- Partner pitch: ${profile.assets.partner}`,
    `- Customer template: ${profile.assets.customer}`,
    `- Demo angle: ${profile.assets.demo}`,
    `- SEO/AEO angle: ${profile.assets.seo}`,
    "",
    "Public health:",
    ...(profile.public_health
      ? [
          `- Status: ${profile.public_health.status}`,
          `- Pages checked: ${profile.public_health.pages?.length || 0}`,
          ...(profile.public_health.gaps || []).slice(0, 3).map((item) => `- Gap: ${item}`),
        ]
      : ["- Not refreshed. Run `pnpm lead:public-health`."]),
    "",
  ];
  return lines.join("\n");
}

function renderPluginFile(profile) {
  return [
    `# ${profile.name} Growth File`,
    "",
    "## Profile Snapshot",
    "",
    `Plugin: ${profile.name}`,
    `Marketplace: ${profile.marketplace_url}`,
    `Status: live public page ${profile.marketplace?.ok ? "verified" : "not verified"}; public health ${profile.public_health?.status || "not refreshed"}`,
    `Category: ${profile.category}`,
    `Pricing: ${profile.marketplace?.pricing || profile.pricing}`,
    `Version: ${profile.creator_snapshot?.version || "unknown"}`,
    `Creator Space: ${creatorSummary(profile)}`,
    `Priority: ${profile.priority?.rank || "?"}. ${profile.priority?.label || "unranked"}`,
    `Revenue/customer evidence: ${revenueSummary(profile)}`,
    `Published: ${profile.marketplace?.published || "unknown"}`,
    `Updated: ${profile.marketplace?.updated || "unknown"}`,
    "",
    "## Positioning",
    "",
    `ICP: ${profile.icp}`,
    `Core pain: ${profile.pain}`,
    `One-line positioning: ${profile.positioning}`,
    `Free value: ${profile.free_value}`,
    `Paid value: ${profile.paid_value}`,
    `Public health: ${profile.public_health?.status || "not refreshed"}`,
    "",
    "## Current Evidence",
    "",
    ...profile.signals.map((item) => `- ${item}`),
    "",
    "## Blockers",
    "",
    ...profile.blockers.map((item) => `- ${item}`),
    "",
    "## Channel Fit",
    "",
    ...profile.best_channels.map((item) => `- ${item}`),
    "",
    "## Public Health",
    "",
    ...(profile.public_health
      ? [
          `Status: ${profile.public_health.status}`,
          "",
          "Signals:",
          ...(profile.public_health.signals?.length ? profile.public_health.signals.map((item) => `- ${item}`) : ["- None"]),
          "",
          "Blockers:",
          ...(profile.public_health.blockers?.length ? profile.public_health.blockers.map((item) => `- ${item}`) : ["- None"]),
          "",
          "Gaps:",
          ...(profile.public_health.gaps?.length ? profile.public_health.gaps.map((item) => `- ${item}`) : ["- None"]),
        ]
      : ["Not refreshed. Run `pnpm lead:public-health`."]),
    "",
    "## Assets",
    "",
    `Marketplace angle: ${profile.positioning}`,
    `Community post: ${profile.assets.community}`,
    `Directory submission: ${profile.assets.directory}`,
    `Partner outreach: ${profile.assets.partner}`,
    `Customer/support template: ${profile.assets.customer}`,
    `Short demo: ${profile.assets.demo}`,
    `SEO/AEO content: ${profile.assets.seo}`,
    "",
    "## Next Actions",
    "",
    ...profile.next_actions.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function creatorSummary(profile) {
  const snapshot = profile.creator_snapshot;
  if (!snapshot) return "not imported";
  const parts = [
    `users ${snapshot.users || "?"}`,
    `opens ${snapshot.opens || "?"}`,
    `version ${snapshot.version || "?"}`,
    `updated ${snapshot.updated || "?"}`,
  ];
  if (snapshot.date) parts.push(`captured ${snapshot.date}`);
  return parts.join(", ");
}

function revenueSummary(profile) {
  const rows = Array.isArray(profile.external_revenue_rows) ? profile.external_revenue_rows : [];
  if (!rows.length) return "no external payment or customer reply signal imported yet";
  const amount = rows.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
  const customerCount = new Set(rows.map((row) => String(row.customer || "").trim()).filter(Boolean)).size;
  return `${rows.length} external payment(s), ${customerCount || rows.length} customer record(s), $${amount.toFixed(2)}`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/");
}

function link(label, url) {
  return `[${label}](${url})`;
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
    actionRows,
    revenueRows,
    creatorRows,
    polyglotPublic,
    polyglotPreflight,
    polyglotPayment,
    polyglotCheckout,
    polyglotTracking,
    publicHealth,
    creem,
  ] = await Promise.all([
    readRows(args.actions),
    readRows(args.revenue),
    readRows(args.marketplace),
    readJson(args.polyglotPublic, null),
    readJson(args.polyglotPreflight, null),
    readJson(args.polyglotPayment, null),
    readJson(args.polyglotCheckout, null),
    readJson(args.polyglotTracking, null),
    readJson(args.publicHealth, null),
    readJson(args.creem, null),
  ]);

  const marketplaceResults = await Promise.all(PLUGINS.map((plugin) => fetchMarketplace(plugin, args.skipFetch)));
  const polyglot = {
    public: polyglotPublic,
    preflight: polyglotPreflight,
    payment: polyglotPayment,
    checkout: polyglotCheckout,
    tracking: polyglotTracking,
  };
  const profiles = PLUGINS.map((plugin, index) =>
    buildProfile({
      plugin,
      marketplace: marketplaceResults[index],
      revenueRows,
      actionRows,
      creatorSnapshot: latestMarketplaceFor(plugin, creatorRows),
      polyglot,
      publicHealth: publicHealth?.profiles?.find((profile) => profile.id === plugin.id) || null,
      creem,
    }),
  );

  const data = {
    generated_at: new Date().toISOString(),
    profiles,
    marketplace_ok: profiles.filter((profile) => profile.marketplace?.ok).length,
    polyglot_creem_open: Array.isArray(creem?.open_warnings) ? creem.open_warnings.length : 0,
    other_creem_open: Array.isArray(creem?.out_of_scope_warnings) ? creem.out_of_scope_warnings.length : 0,
    external_revenue_count: positiveExternalRevenue(revenueRows).length,
    gmail_note: latestGmailNote(actionRows),
  };

  const dashboard = renderDashboard(data);
  const writes = [
    writeText(args.output, dashboard),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
    ...profiles.map((profile) => writeText(path.join(args.pluginDir, `${profile.slug}.md`), renderPluginFile(profile))),
  ];
  await Promise.all(writes);

  process.stdout.write(`Portfolio dashboard: ${args.output}\n`);
  process.stdout.write(`Profiles: ${profiles.map((profile) => profile.name).join(", ")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
