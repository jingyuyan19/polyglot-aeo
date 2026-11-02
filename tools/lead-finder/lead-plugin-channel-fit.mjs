#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORTFOLIO = ".tmp/framer-portfolio-growth-dashboard.json";
const DEFAULT_EXPERIMENTS = ".tmp/framer-portfolio-experiments.json";
const DEFAULT_ASSET_COVERAGE = ".tmp/framer-asset-coverage.json";
const DEFAULT_LANDING_BASELINE = ".tmp/framer-landing-baseline.json";
const DEFAULT_CUSTOMER_FEEDBACK = ".tmp/framer-customer-feedback-queue.json";
const DEFAULT_TODAY = ".tmp/framer-today.json";
const DEFAULT_PARTNER_REVIEW = ".tmp/framer-partner-review.json";
const DEFAULT_DIRECTORY_REVIEW = ".tmp/framer-directory-review.json";
const DEFAULT_ACTION_REVIEW = ".tmp/framer-action-review.json";
const DEFAULT_OUTPUT = ".tmp/framer-plugin-channel-fit.md";
const DEFAULT_JSON = ".tmp/framer-plugin-channel-fit.json";

const CHANNELS = [
  "existing_customer",
  "marketplace",
  "owned_landing_seo",
  "framer_community",
  "directory",
  "partner_content",
  "agency_outreach",
  "cross_promotion",
];

function usage() {
  return `
Usage:
  pnpm lead:plugin-channel-fit

Options:
  --portfolio <file>          Portfolio dashboard JSON. Default: ${DEFAULT_PORTFOLIO}
  --experiments <file>        Portfolio experiments JSON. Default: ${DEFAULT_EXPERIMENTS}
  --asset-coverage <file>     Asset coverage JSON. Default: ${DEFAULT_ASSET_COVERAGE}
  --landing-baseline <file>   Landing baseline JSON. Default: ${DEFAULT_LANDING_BASELINE}
  --customer-feedback <file>  Customer feedback queue JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK}
  --today-plan <file>         Today plan JSON. Default: ${DEFAULT_TODAY}
  --partner-review <file>     Partner review JSON. Default: ${DEFAULT_PARTNER_REVIEW}
  --directory-review <file>   Directory review JSON. Default: ${DEFAULT_DIRECTORY_REVIEW}
  --action-review <file>      Public action review JSON. Default: ${DEFAULT_ACTION_REVIEW}
  --output <file>             Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>               JSON output. Default: ${DEFAULT_JSON}
  --help                      Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    portfolio: DEFAULT_PORTFOLIO,
    experiments: DEFAULT_EXPERIMENTS,
    assetCoverage: DEFAULT_ASSET_COVERAGE,
    landingBaseline: DEFAULT_LANDING_BASELINE,
    customerFeedback: DEFAULT_CUSTOMER_FEEDBACK,
    todayPlan: DEFAULT_TODAY,
    partnerReview: DEFAULT_PARTNER_REVIEW,
    directoryReview: DEFAULT_DIRECTORY_REVIEW,
    actionReview: DEFAULT_ACTION_REVIEW,
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
    const map = {
      "--portfolio": "portfolio",
      "--experiments": "experiments",
      "--asset-coverage": "assetCoverage",
      "--landing-baseline": "landingBaseline",
      "--customer-feedback": "customerFeedback",
      "--today-plan": "todayPlan",
      "--partner-review": "partnerReview",
      "--directory-review": "directoryReview",
      "--action-review": "actionReview",
      "--output": "output",
      "--json": "json",
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

function normalize(value) {
  return slugify(value)
    .replace(/-localization-hub$/, "")
    .replace(/-assistant$/, "");
}

function samePlugin(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function findByPlugin(rows, plugin) {
  return rows.find((row) => samePlugin(row.plugin || row.name || row.product || "", plugin)) || null;
}

function hardBlockers(profile) {
  return (Array.isArray(profile?.blockers) ? profile.blockers : [])
    .filter((item) => !/^no hard blocker recorded/i.test(String(item || "")))
    .filter((item) => /blocked|warning|compliance|not serving|payment|checkout|legacy|unregistered/i.test(item));
}

function parseUsersOpens(profile) {
  const text = Array.isArray(profile?.signals) ? profile.signals.join(" ") : "";
  const users = Number((text.match(/users\s+(\d+)/i) || [])[1] || 0);
  const opens = Number((text.match(/opens\s+(\d+)/i) || [])[1] || 0);
  return { users, opens };
}

function externalRevenue(profile) {
  const text = Array.isArray(profile?.signals) ? profile.signals.join(" ") : "";
  const match = text.match(/External Creem revenue evidence:\s*(\d+)\s*payment\(s\),\s*\$?([\d.]+)/i);
  return {
    count: Number(match?.[1] || 0),
    amount_usd: Number(match?.[2] || 0),
  };
}

function isConcreteUrl(value) {
  const text = String(value || "");
  return /^https?:\/\//i.test(text) && !text.includes("<") && !text.includes(">");
}

function card({ channel, decision, score, reason, nextStep, confirmation = "", verification = "", evidence = "" }) {
  return {
    channel,
    decision,
    score,
    reason,
    next_step: nextStep,
    confirmation,
    verification,
    evidence,
  };
}

function buildCards({ profile, experiment, coverage, landing, customerItem, todayPlan, partnerReview, directoryReview, actionReview }) {
  const blockers = hardBlockers(profile);
  const blocked = blockers.length > 0;
  const { users, opens } = parseUsersOpens(profile);
  const revenue = externalRevenue(profile);
  const priorityRank = profile?.priority?.rank ?? 99;
  const priorityBoost = Math.max(0, 20 - priorityRank * 3);
  const checks = coverage?.checks || {};
  const customerStatus = customerItem?.status || checks.customer?.status || "";
  const landingConcrete = isConcreteUrl(landing?.proposed_url);
  const landingReady = landing?.status === "ready_to_spec";
  const landingBlocked = landing?.status === "blocked";
  const nextConfirmation = todayPlan?.next_confirmation || "";
  const experimentConfirmation = experiment?.confirmation || "";
  const pluginName = profile?.name || "";
  const cards = [];

  if (customerItem?.status === "ready_confirmation_required") {
    cards.push(card({
      channel: "existing_customer",
      decision: "go_confirmation",
      score: 95 + priorityBoost,
      reason: `Real paid user is queued for feedback: ${customerItem.customer_name || customerItem.customer_email}.`,
      nextStep: "Send the concise customer feedback email only after exact confirmation.",
      confirmation: customerItem.confirmation || experimentConfirmation || nextConfirmation,
      verification: customerItem.verification || "Gmail sent id, then reply/no-reply review at 24h/48h/72h/7d.",
      evidence: customerItem.source_email_id ? `source email ${customerItem.source_email_id}` : "",
    }));
  } else if (/hold|blocked/i.test(customerStatus)) {
    cards.push(card({
      channel: "existing_customer",
      decision: "hold_blocked",
      score: 30 + priorityBoost,
      reason: checks.customer?.reason || "Customer feedback is held by a risk gate.",
      nextStep: "Resolve the blocker before asking the customer for feedback.",
      confirmation: customerItem?.confirmation || experimentConfirmation,
      verification: "Compliance/payment blocker closed and customer feedback brief is ready.",
    }));
  } else if (revenue.count > 0) {
    cards.push(card({
      channel: "existing_customer",
      decision: "prepare",
      score: 70 + priorityBoost,
      reason: `External revenue exists (${revenue.count} payment, $${revenue.amount_usd.toFixed(2)}), but no ready feedback send is queued.`,
      nextStep: "Prepare a customer feedback brief from revenue/Gmail evidence.",
      confirmation: experimentConfirmation,
      verification: "Customer feedback queue has ready_confirmation_required row.",
    }));
  } else {
    cards.push(card({
      channel: "existing_customer",
      decision: "low_priority",
      score: 20 + priorityBoost,
      reason: "No real paid/free customer contact is ready for feedback.",
      nextStep: "Wait for a support/payment/reply signal, or use marketplace/SEO channels first.",
    }));
  }

  if (blocked) {
    cards.push(card({
      channel: "marketplace",
      decision: "hold_blocked",
      score: 20 + priorityBoost,
      reason: blockers[0],
      nextStep: profile?.next_actions?.[0] || "Resolve the blocker before pushing Marketplace traffic.",
      confirmation: experimentConfirmation,
      verification: "Public health, checkout, payment, and Marketplace preflight are clean.",
    }));
  } else if (coverage?.promotion_ready === true) {
    cards.push(card({
      channel: "marketplace",
      decision: "monitor_or_refresh",
      score: 65 + priorityBoost,
      reason: `Marketplace is live with ${users} users and ${opens} opens.`,
      nextStep: "Refresh listing copy/screenshots only if customer or traffic evidence supports the change.",
      verification: "Creator Space users/opens snapshot before and after the change.",
    }));
  } else {
    cards.push(card({
      channel: "marketplace",
      decision: "prepare",
      score: 55 + priorityBoost,
      reason: coverage?.top_blocker || "Marketplace page exists, but promotion readiness is incomplete.",
      nextStep: coverage?.next_local_step || "Complete asset coverage and tracking before broader promotion.",
      verification: "Asset coverage promotion_ready becomes true, or the blocker is explicitly accepted.",
    }));
  }

  if (blocked) {
    cards.push(card({
      channel: "owned_landing_seo",
      decision: "hold_blocked",
      score: 25 + priorityBoost,
      reason: blockers[0],
      nextStep: profile?.next_actions?.[0] || "Resolve the blocker before adding owned traffic.",
      confirmation: landing?.confirmation || experimentConfirmation,
      verification: "Profile blockers are closed and landing/publish preflight passes.",
    }));
  } else if (landingBlocked) {
    cards.push(card({
      channel: "owned_landing_seo",
      decision: "hold_blocked",
      score: 25 + priorityBoost,
      reason: landing?.current_issue || checks.landing_baseline?.reason || "Landing baseline is blocked.",
      nextStep: "Resolve public-health/payment/compliance blocker before adding owned traffic.",
      confirmation: landing?.confirmation || experimentConfirmation,
      verification: "Landing baseline no longer blocked.",
    }));
  } else if (landingReady && landingConcrete) {
    cards.push(card({
      channel: "owned_landing_seo",
      decision: "go_confirmation",
      score: 78 + priorityBoost,
      reason: `Landing baseline target is concrete: ${landing.proposed_url}.`,
      nextStep: "Create/deploy the tracked tutorial page only after exact confirmation.",
      confirmation: landing?.confirmation || experimentConfirmation,
      verification: "URL 200, CTA UTM present, action log evidence, same-day/24h/7d review.",
    }));
  } else if (landingReady) {
    cards.push(card({
      channel: "owned_landing_seo",
      decision: "prepare_target",
      score: 68 + priorityBoost,
      reason: `Landing spec exists but target URL is not concrete: ${landing?.proposed_url || "missing"}.`,
      nextStep: "Fill tools/lead-finder/landing-targets.local.csv with a real owned target URL.",
      confirmation: landing?.confirmation || experimentConfirmation,
      verification: "Landing brief moves to ready_confirmation_required.",
    }));
  } else {
    cards.push(card({
      channel: "owned_landing_seo",
      decision: "monitor",
      score: 35 + priorityBoost,
      reason: "No landing baseline is currently required or ready.",
      nextStep: "Use Marketplace as the public surface and keep tracking snapshots current.",
    }));
  }

  const communityAsset = profile?.assets?.community || "";
  if (blocked) {
    cards.push(card({
      channel: "framer_community",
      decision: "hold_blocked",
      score: 15 + priorityBoost,
      reason: "Community traffic should wait while payment/compliance/checkout blockers are open.",
      nextStep: "Keep the Community post as a local draft until public-health gates pass.",
      confirmation: experimentConfirmation,
      verification: "Community preflight publish_allowed is true and action log can record URL.",
    }));
  } else if (landingReady && !landingConcrete) {
    cards.push(card({
      channel: "framer_community",
      decision: "prepare",
      score: 50 + priorityBoost,
      reason: "Community angle exists, but tracked owned landing URL is not concrete yet.",
      nextStep: "Finalize the landing target or use Marketplace-only link with baseline snapshot.",
      confirmation: experimentConfirmation,
      verification: "Marketplace/public snapshot recorded before post.",
      evidence: communityAsset,
    }));
  } else {
    cards.push(card({
      channel: "framer_community",
      decision: "prepare_controlled_test",
      score: 58 + priorityBoost,
      reason: communityAsset || "Community asset exists in the plugin kit.",
      nextStep: "Prepare one problem/case-style post, publish only after confirmation and preflight.",
      confirmation: experimentConfirmation,
      verification: "Post URL, comments/DMs/replies, CTA/form events, Marketplace lift at 24h/48h/72h.",
    }));
  }

  const directoryAsset = profile?.assets?.directory || "";
  cards.push(card({
    channel: "directory",
    decision: blocked ? "hold_blocked" : landingConcrete ? "prepare_submission" : "prepare",
    score: blocked ? 18 + priorityBoost : landingConcrete ? 55 + priorityBoost : 42 + priorityBoost,
    reason: blocked ? blockers[0] : directoryAsset || directoryReview?.recommendation || "Directory copy exists.",
    nextStep: blocked
      ? "Do not submit directory traffic until the blocker is closed."
      : landingConcrete
        ? "Prepare one manual directory submission with screenshot/confirmation evidence."
        : "Choose a concrete landing or Marketplace URL before directory submission.",
    confirmation: experimentConfirmation,
    verification: "Submission confirmation/listing URL or owner reply; 7d/14d action review.",
  }));

  const partnerAsset = profile?.assets?.partner || "";
  cards.push(card({
    channel: "partner_content",
    decision: blocked ? "local_only" : "prepare_or_review",
    score: blocked ? 30 + priorityBoost : 52 + priorityBoost,
    reason: blocked ? blockers[0] : partnerAsset || partnerReview?.recommendation || "Partner pitch exists.",
    nextStep: blocked
      ? "Draft or refine partner copy locally only; do not send or create traffic until the blocker is closed."
      : partnerReview?.due_reviews > 0
        ? "Review due partner/resource actions before starting another pitch."
        : "Prepare one tightly matched resource pitch; send only after confirmation.",
    confirmation: blocked ? "" : experimentConfirmation,
    verification: blocked ? "Blocker closed plus a fresh confirmation packet." : "Partner reply/listing/backlink or scheduled review row.",
  }));

  const agencyFit = /agency|handoff|client|template|localization|accessibility|AEO|SEO/i.test(`${profile?.icp || ""} ${profile?.assets?.partner || ""} ${profile?.assets?.demo || ""}`);
  cards.push(card({
    channel: "agency_outreach",
    decision: blocked ? "hold_blocked" : agencyFit ? "prepare_personalized" : "low_priority",
    score: blocked ? 14 + priorityBoost : agencyFit ? 50 + priorityBoost : 22 + priorityBoost,
    reason: blocked ? blockers[0] : agencyFit ? "ICP and demo angle can support a personalized agency note." : "Agency fit is weaker than owned content or Marketplace.",
    nextStep: blocked
      ? "Do not start or expand agency outreach until the blocker is closed."
      : agencyFit
        ? "Use one concrete audit/handoff offer; do not start broad cold email until signal improves."
        : "Keep this behind SEO/Marketplace experiments.",
    confirmation: blocked ? "" : experimentConfirmation,
    verification: blocked ? "Blocker closed plus a fresh confirmation packet." : "Reply/opportunity or CRM action log row with no broad-batch expansion.",
  }));

  cards.push(card({
    channel: "cross_promotion",
    decision: blocked ? "local_only" : "prepare",
    score: blocked ? 25 + priorityBoost : 45 + priorityBoost,
    reason: "Portfolio has overlapping Framer builder audiences; cross-links should stay relevant and tracked.",
    nextStep: blocked
      ? "Draft local cross-promotion copy only; do not drive traffic into blocked checkout/payment surfaces."
      : "Add measured related-plugin links after landing/CTA tracking is concrete.",
    verification: "Tracked CTA/click event and action log evidence.",
  }));

  return cards.sort((a, b) => b.score - a.score || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel));
}

function buildReport({ portfolio, experiments, assetCoverage, landingBaseline, customerFeedback, todayPlan, partnerReview, directoryReview, actionReview }) {
  const profiles = Array.isArray(portfolio?.profiles) ? portfolio.profiles : [];
  const experimentRows = Array.isArray(experiments?.experiments) ? experiments.experiments : [];
  const coverageRows = Array.isArray(assetCoverage?.rows) ? assetCoverage.rows : [];
  const landingRows = Array.isArray(landingBaseline?.rows) ? landingBaseline.rows : [];
  const feedbackRows = Array.isArray(customerFeedback?.items) ? customerFeedback.items : [];
  const rows = [];

  for (const profile of profiles) {
    const experiment = findByPlugin(experimentRows, profile.name);
    const coverage = findByPlugin(coverageRows, profile.name);
    const landing = findByPlugin(landingRows, profile.name);
    const customerItem = findByPlugin(feedbackRows, profile.name);
    const cards = buildCards({ profile, experiment, coverage, landing, customerItem, todayPlan, partnerReview, directoryReview, actionReview });
    rows.push({
      plugin: profile.name,
      marketplace_url: profile.marketplace_url || "",
      priority_rank: profile.priority?.rank ?? 99,
      priority: profile.priority?.label || "",
      top_channel: cards[0] || null,
      channels: cards,
    });
  }

  rows.sort((a, b) => a.priority_rank - b.priority_rank || (b.top_channel?.score || 0) - (a.top_channel?.score || 0));
  const allCards = rows.flatMap((row) => row.channels.map((item) => ({ plugin: row.plugin, marketplace_url: row.marketplace_url, ...item })));
  const actionable = allCards
    .filter((item) => /go_confirmation|prepare|prepare_target|prepare_controlled_test|prepare_submission|prepare_personalized|prepare_or_review|monitor_or_refresh/i.test(item.decision))
    .sort((a, b) => b.score - a.score);
  const next = actionable[0] || allCards.sort((a, b) => b.score - a.score)[0] || null;

  return {
    generated_at: new Date().toISOString(),
    status: rows.length ? "ready" : "missing_portfolio",
    recommendation: next
      ? `Top channel move: ${next.plugin} / ${next.channel} (${next.decision}). ${next.next_step}`
      : "Run portfolio and asset reports first.",
    next_channel: next,
    plugins: rows,
    matrix: allCards,
    source_state: {
      portfolio: profiles.length ? "ready" : "missing",
      experiments: experimentRows.length ? "ready" : "missing",
      asset_coverage: coverageRows.length ? "ready" : "missing",
      landing_baseline: landingRows.length ? "ready" : "missing",
      customer_feedback: feedbackRows.length ? "ready" : "missing",
      today_recommendation: todayPlan?.recommendation || "",
      partner_review: partnerReview?.recommendation || "",
      directory_review: directoryReview?.recommendation || "",
      action_review: actionReview?.recommendation || "",
    },
  };
}

function renderReport(report) {
  const lines = [
    "# Framer Plugin Channel Fit",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Plugin Top Channels",
    "",
    "| Plugin | Priority | Top channel | Decision | Score | Next step | Confirmation |",
    "|---|---|---|---|---:|---|---|",
  ];
  for (const row of report.plugins) {
    const top = row.top_channel || {};
    lines.push(`| ${link(row.plugin, row.marketplace_url)} | ${pipe(row.priority)} | ${pipe(top.channel)} | ${pipe(top.decision)} | ${top.score ?? ""} | ${pipe(top.next_step)} | ${pipe(top.confirmation)} |`);
  }

  lines.push("", "## Channel Matrix", "", "| Plugin | Channel | Decision | Score | Reason | Next step | Verification |", "|---|---|---|---:|---|---|---|");
  for (const item of report.matrix.sort((a, b) => a.plugin.localeCompare(b.plugin) || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel))) {
    lines.push(`| ${link(item.plugin, item.marketplace_url)} | ${pipe(item.channel)} | ${pipe(item.decision)} | ${item.score} | ${pipe(item.reason)} | ${pipe(item.next_step)} | ${pipe(item.verification)} |`);
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This report does not send Gmail, publish Community posts, submit directories, upload Marketplace files, deploy, or modify payment settings.",
    "- Any channel row with a confirmation phrase still requires exact user confirmation before external action.",
    "- Use this as a routing matrix; Today remains the action-time confirmation queue.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function link(label, url) {
  return url ? `[${label}](${url})` : label;
}

function pipe(value) {
  return String(value || "")
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, " ")
    .trim();
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
  const [portfolio, experiments, assetCoverage, landingBaseline, customerFeedback, todayPlan, partnerReview, directoryReview, actionReview] = await Promise.all([
    readJson(args.portfolio, null),
    readJson(args.experiments, null),
    readJson(args.assetCoverage, null),
    readJson(args.landingBaseline, null),
    readJson(args.customerFeedback, null),
    readJson(args.todayPlan, null),
    readJson(args.partnerReview, null),
    readJson(args.directoryReview, null),
    readJson(args.actionReview, null),
  ]);
  const report = buildReport({ portfolio, experiments, assetCoverage, landingBaseline, customerFeedback, todayPlan, partnerReview, directoryReview, actionReview });
  await Promise.all([
    writeText(args.output, renderReport(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Plugin channel fit: ${args.output}\n`);
  process.stdout.write(`Status: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
