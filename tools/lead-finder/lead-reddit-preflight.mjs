#!/usr/bin/env node

import {
  addDays,
  contentHash,
  dateInRange,
  extractTextBlock,
  hoursSince,
  pipe,
  readJson,
  readRows,
  readText,
  toBoolean,
  toNumber,
  todayLocal,
  writeText,
} from "./reddit-pilot-lib.mjs";

const DEFAULT_CONFIG = "tools/lead-finder/reddit-pilot-config.json";
const DEFAULT_LEDGER = "tools/lead-finder/reddit-activity.local.csv";
const DEFAULT_PUBLIC_HEALTH = ".tmp/framer-public-health.json";
const DEFAULT_MARKETPLACE_HISTORY = "tools/lead-finder/marketplace-public-snapshots.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-reddit-preflight.md";
const DEFAULT_JSON = ".tmp/framer-reddit-preflight.json";

function usage() {
  return `
Usage:
  pnpm lead:reddit-preflight
  pnpm lead:reddit-preflight -- --plugin polyglot-aeo --subreddit nocode
  pnpm lead:reddit-preflight -- --plugin ally-auditor --subreddit nocode

Options:
  --config <file>              Pilot config. Default: ${DEFAULT_CONFIG}
  --ledger <file>              Reddit activity ledger. Default: ${DEFAULT_LEDGER}
  --public-health <file>       Portfolio public health JSON. Default: ${DEFAULT_PUBLIC_HEALTH}
  --marketplace-history <file> Marketplace public snapshot CSV. Default: ${DEFAULT_MARKETPLACE_HISTORY}
  --output <file>              Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                JSON output. Default: ${DEFAULT_JSON}
  --plugin <id>                Plugin config key. Default: polyglot-aeo
  --subreddit <id>             Subreddit config key. Default: nocode
  --today <YYYY-MM-DD>         Evaluation date. Default: today in pilot timezone.
  --draft <file>               Override the configured final-copy draft.
  --help                       Show this help.
`;
}

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG,
    ledger: DEFAULT_LEDGER,
    publicHealth: DEFAULT_PUBLIC_HEALTH,
    marketplaceHistory: DEFAULT_MARKETPLACE_HISTORY,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    plugin: "polyglot-aeo",
    subreddit: "nocode",
  };
  const valueOptions = new Map([
    ["--config", "config"],
    ["--ledger", "ledger"],
    ["--public-health", "publicHealth"],
    ["--marketplace-history", "marketplaceHistory"],
    ["--output", "output"],
    ["--json", "json"],
    ["--plugin", "plugin"],
    ["--subreddit", "subreddit"],
    ["--today", "today"],
    ["--draft", "draft"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") args.help = true;
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

function currentPhase(config, today) {
  return config.pilot.phases.find((phase) => dateInRange(today, phase.start_date, phase.end_date)) || null;
}

function gate(id, label, pass, detail, severity = "blocker") {
  return { id, label, pass: Boolean(pass), detail, severity };
}

function latest(rows, predicate) {
  return [...rows]
    .filter(predicate)
    .sort((a, b) => String(b.timestamp || b.date).localeCompare(String(a.timestamp || a.date)))[0] || null;
}

function pluginHealth(publicHealth, id) {
  return publicHealth?.profiles?.find((profile) => profile.id === id) || null;
}

function latestMarketplaceSnapshot(rows, slug) {
  return latest(rows, (row) => row.slug === slug && toBoolean(row.ok));
}

function lintDraft({ text, plugin, subreddit }) {
  const body = extractTextBlock(text);
  const urls = body.match(/https?:\/\/[^\s)]+/g) || [];
  const parsedUrls = urls.map((value) => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }).filter(Boolean);
  const shortenerHosts = new Set(["bit.ly", "t.co", "tinyurl.com", "buff.ly", "rebrand.ly"]);
  const lower = body.toLowerCase();
  const claimsOnly = lower
    .replace(/cannot guarantee[^.]*\./g, "")
    .replace(/not (?:a replacement|to claim)[^.]*\./g, "")
    .replace(/does not guarantee[^.]*\./g, "");
  const disclosurePattern = new RegExp(`i['’]m the developer of ${plugin.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const marketplaceUrl = parsedUrls.find(
    (url) => url.hostname === "www.framer.com" && url.pathname.includes(`/marketplace/plugins/${plugin.marketplace_slug}/`),
  );
  const directMarketplacePass = subreddit.max_product_links === 0
    ? parsedUrls.length === 0
    : Boolean(marketplaceUrl);
  const prohibitedClaims = [
    /guarantee(?:d|s)?\s+(?:ai\s+)?citations?/i,
    /guarantee(?:d|s)?\s+(?:seo\s+)?rankings?/i,
    /guarantee(?:d|s)?\s+(?:wcag\s+)?compliance/i,
    /100%\s+(?:compliant|accessible|guaranteed)/i,
    /\bdiscount\b|\bcoupon\b|\bpromo code\b/i,
  ].filter((pattern) => pattern.test(claimsOnly));
  const checks = [
    gate("draft_text", "Final text block exists", Boolean(body), body ? `${body.length} characters` : "No ```text block found."),
    gate("disclosure", "Developer affiliation disclosed", disclosurePattern.test(body), `Required phrase: I'm the developer of ${plugin.name}.`),
    gate("single_link", "At most one product link", urls.length <= subreddit.max_product_links, `${urls.length}/${subreddit.max_product_links} link(s)`),
    gate("direct_marketplace", subreddit.max_product_links === 0 ? "No CTA in this community" : "CTA is a direct Marketplace URL", directMarketplacePass, subreddit.max_product_links === 0 ? `${parsedUrls.length} URL(s); community maximum is zero.` : marketplaceUrl?.toString() || "Missing direct Framer Marketplace CTA."),
    gate("no_shorteners", "No short links", !parsedUrls.some((url) => shortenerHosts.has(url.hostname)), parsedUrls.map((url) => url.hostname).join(", ") || "No URL found."),
    gate("no_disallowed_claims", "No guarantees, discounts, or compliance promises", prohibitedClaims.length === 0, prohibitedClaims.length ? `Matched ${prohibitedClaims.length} prohibited pattern(s).` : "Pass"),
    gate("value_first", "Value-first checklist structure", /\b1\.|\b1\)/.test(body) && /\b5\.|\b5\)/.test(body), "Expected a five-point checklist."),
    gate("human_edit_marker", "Final human-edit reminder retained outside body", /human-edit|required human edit|final human pass/i.test(text), "Draft pack must explicitly require a final human rewrite."),
  ];
  return { body, body_hash: contentHash(body), urls, checks, lower };
}

function previousExperimentGate({ rows, config, plugin }) {
  const previousId = plugin.requires_previous_plugin;
  if (!previousId) return { pass: true, detail: "No previous plugin experiment required." };
  const previous = config.plugins[previousId];
  const post = latest(rows, (row) => row.event_type === "post" && row.plugin === previousId && row.status === "done");
  if (!post) return { pass: false, detail: `${previous.name} has no completed Reddit post.` };
  const sevenDay = latest(rows, (row) => row.event_type === "snapshot" && row.post_id === post.post_id && row.review_window === "7d");
  if (!sevenDay) return { pass: false, detail: `${previous.name} is missing its 7d snapshot.` };
  const insights = rows.filter((row) => row.event_type === "insight" && row.campaign === previous.campaign).length;
  const signal = toNumber(sevenDay.installs) >= config.thresholds.single_experiment_min_installs || insights >= config.thresholds.single_experiment_min_insights;
  return {
    pass: signal,
    detail: signal
      ? `${previous.name} reviewed at 7d: installs=${toNumber(sevenDay.installs)}, insights=${insights}.`
      : `${previous.name} did not reach the minimum single-experiment signal.`,
  };
}

function moderationGate(rows) {
  const issue = latest(rows, (row) => row.event_type === "moderation" && ["warning", "removed", "banned"].includes(row.status));
  if (!issue) return { pass: true, detail: "No Reddit moderation issue recorded." };
  const cleared = latest(rows, (row) => row.event_type === "moderation" && row.subreddit === issue.subreddit && row.status === "cleared");
  return cleared && String(cleared.timestamp).localeCompare(String(issue.timestamp)) > 0
    ? { pass: true, detail: `Earlier ${issue.status} was cleared with evidence ${cleared.evidence || cleared.url}.` }
    : { pass: false, detail: `${issue.subreddit} moderation status is ${issue.status}; stop for 30 days and do not repost.` };
}

function decisionFor(gates, phase, targetPhase) {
  const failedBlockers = gates.filter((item) => !item.pass && item.severity === "blocker");
  const failedWaiting = gates.filter((item) => !item.pass && item.severity === "waiting");
  if (failedBlockers.length) return "blocked";
  if (failedWaiting.length || phase?.id !== targetPhase) return "foundation_or_waiting";
  return "ready_manual_publish";
}

function render(report) {
  const { config, plugin, subreddit, phase, gates, draft, decision, args } = report;
  const failed = gates.filter((item) => !item.pass);
  const lines = [
    "# Reddit Organic Pilot Preflight",
    "",
    `Generated: ${report.generated_at}`,
    `Evaluation date: ${args.today}`,
    `Current phase: ${phase?.label || "outside configured pilot window"}`,
    `Plugin: ${plugin.name}`,
    `Community: ${subreddit.label}`,
    `Decision: ${decision}`,
    "",
    "## Recommendation",
    "",
  ];
  if (decision === "ready_manual_publish") {
    lines.push("All configured gates pass. Perform one final same-day rules check, manually rewrite the final copy in the developer's voice, publish once, and record the public URL immediately.");
  } else if (decision === "foundation_or_waiting") {
    lines.push(`Do not publish yet. Complete the foundation/waiting gates first. The earliest configured phase for this plugin is ${config.pilot.phases.find((item) => item.id === plugin.phase)?.start_date || "response-only"}.`);
  } else {
    lines.push(`Do not publish. Resolve ${failed.length} failed gate(s), rerun public health and Marketplace baseline checks, then rerun this preflight.`);
  }
  lines.push("", "## Gates", "", "| Gate | Status | Detail |", "|---|---|---|");
  for (const item of gates) lines.push(`| ${pipe(item.label)} | ${item.pass ? "PASS" : item.severity === "waiting" ? "WAIT" : "BLOCK"} | ${pipe(item.detail)} |`);

  lines.push(
    "",
    "## Final Copy Candidate",
    "",
    `Source: ${args.draft}`,
    `Body hash: ${draft.body_hash}`,
    "",
    "```text",
    draft.body || "No valid text block found.",
    "```",
    "",
    "The body above is an operator candidate, not auto-publish copy. Rewrite it manually before posting and keep the disclosure and single direct CTA.",
    "",
    "## Action Commands",
    "",
    "Record a same-day rules check:",
    "",
    "```bash",
    `pnpm lead:reddit-activity -- --add --event rules_check --subreddit '${args.subreddit}' --url '${subreddit.rules_url}' --evidence '${subreddit.rules_url}' --topic 'Same-day pre-post rules check'`,
    "```",
    "",
    "Record the Marketplace baseline:",
    "",
    "```bash",
    `pnpm lead:marketplace-public -- --record --url '${plugin.marketplace_url}' --note '${plugin.name} Reddit pre-post baseline.'`,
    "```",
    "",
    "After a manual publish, record the post:",
    "",
    "```bash",
    `pnpm lead:reddit-activity -- --add --event post --subreddit '${args.subreddit}' --plugin '${args.plugin}' --url '<published-reddit-url>' --post-id '<stable-post-id>' --promotional --disclosed${subreddit.required_flair ? ` --flair '${subreddit.required_flair}'` : ""} --body-file '${args.draft}' --evidence '<published-url-or-screenshot>'`,
    "```",
    "",
    "Record reviews at 24h, 72h, and 7d:",
    "",
    "```bash",
    `pnpm lead:reddit-activity -- --add --event snapshot --subreddit '${args.subreddit}' --plugin '${args.plugin}' --post-id '<stable-post-id>' --window 24h --views <n> --upvotes <n> --comments <n> --installs <n> --activations <n> --evidence '<reddit-and-creator-space-proof>'`,
    `pnpm lead:reddit-activity -- --add --event snapshot --subreddit '${args.subreddit}' --plugin '${args.plugin}' --post-id '<stable-post-id>' --window 72h --views <n> --upvotes <n> --comments <n> --installs <n> --activations <n> --evidence '<reddit-and-creator-space-proof>'`,
    `pnpm lead:reddit-activity -- --add --event snapshot --subreddit '${args.subreddit}' --plugin '${args.plugin}' --post-id '<stable-post-id>' --window 7d --views <n> --upvotes <n> --comments <n> --installs <n> --activations <n> --evidence '<reddit-and-creator-space-proof>'`,
    "pnpm lead:reddit-review",
    "```",
    "",
    "## Non-Negotiable Guardrails",
    "",
    "- No automatic publishing or bulk replies.",
    "- No product mentions or links in communities configured as research-only.",
    "- No unsolicited DMs, vote coordination, reposting after removal, discounts, or ranking/citation/compliance guarantees.",
    "- Keep a seven-day portfolio-wide exclusivity window after each product post.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const config = await readJson(args.config);
  if (!config) throw new Error(`Missing Reddit pilot config: ${args.config}`);
  args.today ||= todayLocal(config.pilot.timezone);
  const plugin = config.plugins?.[args.plugin];
  const subreddit = config.subreddits?.[args.subreddit];
  if (!plugin) throw new Error(`Unknown plugin: ${args.plugin}`);
  if (!subreddit) throw new Error(`Unknown subreddit: ${args.subreddit}`);
  args.draft ||= plugin.community_drafts?.[args.subreddit] || plugin.draft;
  if (!args.draft) throw new Error(`${plugin.name} is response-only and has no standalone post draft.`);

  const [rows, publicHealth, marketplaceRows, draftText] = await Promise.all([
    readRows(args.ledger),
    readJson(args.publicHealth, {}),
    readRows(args.marketplaceHistory),
    readText(args.draft),
  ]);
  const now = new Date();
  const phase = currentPhase(config, args.today);
  const targetPhase = config.pilot.phases.find((item) => item.id === plugin.phase);
  const lookbackStart = addDays(args.today, -(config.pilot.contribution_lookback_days - 1));
  const contributions = rows.filter(
    (row) => row.date >= lookbackStart && row.date <= args.today && row.event_type === "contribution" && row.status === "done" && !toBoolean(row.promotional),
  );
  const profile = latest(rows, (row) => row.event_type === "profile" && row.status === "done" && Boolean(row.evidence));
  const rules = latest(rows, (row) => row.event_type === "rules_check" && row.subreddit === args.subreddit && row.status === "done");
  const recentPromotionStart = addDays(args.today, -(config.pilot.promotion_exclusivity_days - 1));
  const recentPromotion = latest(rows, (row) => row.event_type === "post" && row.status === "done" && toBoolean(row.promotional) && row.date >= recentPromotionStart && row.date <= args.today);
  const modApproval = latest(rows, (row) => row.event_type === "modmail" && row.subreddit === args.subreddit && row.status === "approved" && Boolean(row.evidence));
  const health = pluginHealth(publicHealth, plugin.public_health_id);
  const marketplace = latestMarketplaceSnapshot(marketplaceRows, plugin.marketplace_slug);
  const draft = lintDraft({ text: draftText, plugin, subreddit });
  const previous = previousExperimentGate({ rows, config, plugin });
  const moderation = moderationGate(rows);
  const promotionPolicyPass = subreddit.promotion_allowed || Boolean(modApproval);
  const communityAllowed = plugin.allowed_subreddits.includes(args.subreddit);
  const publicHealthFresh = hoursSince(publicHealth.generated_at, now) <= config.pilot.public_health_max_age_hours;
  const marketplaceFresh = marketplace && marketplace.date === args.today;
  const inTargetPhase = phase?.id === plugin.phase;

  const gates = [
    gate("pilot_window", "Inside the eight-week pilot", Boolean(phase), phase?.label || `${config.pilot.start_date} through ${config.pilot.end_date}`),
    gate("phase", "Plugin phase has started", Boolean(targetPhase && args.today >= targetPhase.start_date && args.today <= config.pilot.end_date), targetPhase ? `${targetPhase.start_date} through ${targetPhase.end_date}` : "Response-only plugin", "waiting"),
    gate("community_fit", "Community is allowed for this plugin", communityAllowed, communityAllowed ? `${subreddit.label} is configured for ${plugin.name}.` : `${subreddit.label} is not in the allowed community list.`),
    gate("promotion_policy", "Community promotion policy permits the post", promotionPolicyPass, promotionPolicyPass ? subreddit.notes : `${subreddit.notes}${subreddit.requires_mod_approval ? " Written moderator approval is required." : ""}`),
    gate("rules_same_day", "Subreddit rules checked today", Boolean(rules && rules.date === args.today && rules.evidence), rules ? `${rules.date}: ${rules.evidence}` : "No same-day rule check recorded."),
    gate("profile", "Transparent developer profile is live", Boolean(profile), profile?.evidence || "Record a profile event with public URL or screenshot evidence.", "waiting"),
    gate("nine_to_one", "9:1 contribution gate", contributions.length >= config.pilot.min_non_promotional_contributions, `${contributions.length}/${config.pilot.min_non_promotional_contributions} non-promotional contributions since ${lookbackStart}.`, "waiting"),
    gate("exclusivity", "Seven-day portfolio exclusivity", !recentPromotion, recentPromotion ? `Recent product post: ${recentPromotion.plugin} on ${recentPromotion.date}.` : "No product post in the current exclusivity window."),
    gate("sequence", "Previous experiment sequence gate", previous.pass, previous.detail, "waiting"),
    gate("moderation", "No unresolved moderation issue", moderation.pass, moderation.detail),
    gate("public_health_exists", "Plugin public health exists", Boolean(health), health ? `${health.status}: ${health.next_action}` : `No profile ${plugin.public_health_id} found.`),
    gate("public_health_fresh", "Public health refreshed in the last 24 hours", publicHealthFresh, publicHealth.generated_at || "Missing public-health timestamp.", inTargetPhase ? "blocker" : "waiting"),
    gate("public_health_ready", "No payment, hosting, or compliance blocker", Boolean(health && health.status !== "blocked" && !(health.blockers || []).length), health ? `${health.status}; ${(health.blockers || []).join(" ") || "no blockers"}` : "Missing public health."),
    gate("marketplace_baseline", "Same-day Marketplace baseline recorded", Boolean(marketplaceFresh), marketplace ? `${marketplace.date}: ${marketplace.url}` : "No successful Marketplace snapshot found.", inTargetPhase ? "blocker" : "waiting"),
    gate("required_flair", "Required flair is configured", !subreddit.required_flair || subreddit.required_flair === "Promoted", subreddit.required_flair || "No flair requirement."),
    ...draft.checks,
  ];
  const decision = decisionFor(gates, phase, plugin.phase);
  const report = {
    generated_at: new Date().toISOString(),
    decision,
    config,
    args,
    phase,
    plugin,
    subreddit,
    health,
    marketplace,
    contribution_window: { start: lookbackStart, end: args.today, count: contributions.length },
    draft,
    gates,
  };
  const markdown = render(report);
  const jsonData = { ...report, config: undefined, draft: { ...draft, lower: undefined } };
  await Promise.all([
    writeText(args.output, markdown),
    writeText(args.json, `${JSON.stringify(jsonData, null, 2)}\n`),
  ]);
  process.stdout.write(`Reddit preflight: ${decision}\n`);
  process.stdout.write(`Plugin/community: ${plugin.name} / ${subreddit.label}\n`);
  process.stdout.write(`Gates: ${gates.filter((item) => item.pass).length} pass, ${gates.filter((item) => !item.pass).length} not ready\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
