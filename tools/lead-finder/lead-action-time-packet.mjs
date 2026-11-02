#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIRMATIONS = ".tmp/framer-confirmation-queue.json";
const DEFAULT_CUSTOMER_FEEDBACK = ".tmp/framer-customer-feedback-brief.json";
const DEFAULT_OWNED_SITE_DROP_PATCH = ".tmp/framer-owned-site-drop-patches.json";
const DEFAULT_USE_CASE_PAGE_PACKAGES = ".tmp/framer-use-case-page-packages.json";
const DEFAULT_EXECUTIVE = ".tmp/framer-growth-executive-brief.json";
const DEFAULT_OUTPUT = ".tmp/framer-action-time-packet.md";
const DEFAULT_JSON = ".tmp/framer-action-time-packet.json";

function usage() {
  return `
Usage:
  pnpm lead:action-time-packet

Options:
  --confirmations <file>          Confirmation queue JSON. Default: ${DEFAULT_CONFIRMATIONS}
  --customer-feedback <file>      Customer feedback brief JSON. Default: ${DEFAULT_CUSTOMER_FEEDBACK}
  --owned-site-drop-patch <file>  Owned-site drop patch JSON. Default: ${DEFAULT_OWNED_SITE_DROP_PATCH}
  --use-case-page-packages <file> Use-case page package JSON. Default: ${DEFAULT_USE_CASE_PAGE_PACKAGES}
  --executive <file>              Executive brief JSON. Default: ${DEFAULT_EXECUTIVE}
  --output <file>                 Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>                   JSON output. Default: ${DEFAULT_JSON}
  --help                          Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    confirmations: DEFAULT_CONFIRMATIONS,
    customerFeedback: DEFAULT_CUSTOMER_FEEDBACK,
    ownedSiteDropPatch: DEFAULT_OWNED_SITE_DROP_PATCH,
    useCasePagePackages: DEFAULT_USE_CASE_PAGE_PACKAGES,
    executive: DEFAULT_EXECUTIVE,
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
      "--confirmations": "confirmations",
      "--customer-feedback": "customerFeedback",
      "--owned-site-drop-patch": "ownedSiteDropPatch",
      "--use-case-page-packages": "useCasePagePackages",
      "--executive": "executive",
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

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-localization-hub$/, "")
    .replace(/-assistant$/, "");
}

function samePlugin(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function sortedReadyRows(queue, executive) {
  const topConfirmation = executive?.top_action?.confirmation || "";
  return (Array.isArray(queue?.rows) ? queue.rows : [])
    .filter((row) => row.readiness === "ready_confirmation_required")
    .sort((a, b) =>
      (b.confirmation === topConfirmation ? 1 : 0) - (a.confirmation === topConfirmation ? 1 : 0) ||
      Number(a.priority || 999) - Number(b.priority || 999)
    );
}

function waitingRows(queue) {
  return (Array.isArray(queue?.rows) ? queue.rows : [])
    .filter((row) => row.readiness === "waiting_provider" || row.readiness === "blocked")
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
}

function packageFor(item, packages) {
  return (packages?.packages || []).find((row) => samePlugin(row.plugin, item.plugin)) || null;
}

function patchFor(item, patches) {
  return (patches?.patches || []).find((row) => samePlugin(row.plugin, item.plugin)) || null;
}

function supportingAssets(item, sources) {
  const assets = [];
  if (item.kind === "customer_feedback" && sources.customerFeedback?.item) {
    assets.push({
      type: "gmail_draft_preview",
      subject: sources.customerFeedback.item.draft?.subject || item.draft?.subject || "",
      body: sources.customerFeedback.item.draft?.body || item.draft?.body || "",
      gmail_query: sources.customerFeedback.gmail_query || item.gmail_query || "",
    });
  }
  const patch = patchFor(item, sources.ownedSiteDropPatch);
  if (patch && /landing_baseline|owned_site/i.test(item.kind || item.channel || "")) {
    assets.push({
      type: "owned_site_patch",
      html_file: patch.index_file,
      snippet_file: patch.snippet_file,
      links_file: patch.text_file,
      primary_cta_url: patch.primary_cta_url,
    });
  }
  const pagePackage = packageFor(item, sources.useCasePagePackages);
  if (pagePackage && /use_case_page|owned_seo/i.test(item.kind || item.channel || "")) {
    assets.push({
      type: "use_case_page_package",
      html_file: pagePackage.html_file,
      copy_file: pagePackage.copy_file,
      links_file: pagePackage.links_file,
      primary_cta_url: pagePackage.primary_cta_url,
    });
  }
  return assets;
}

function packetRow(item, sources) {
  return {
    plugin: item.plugin,
    kind: item.kind,
    channel: item.channel,
    priority: item.priority,
    action: item.action,
    target: item.target,
    risk: item.risk,
    expected_benefit: item.expected_benefit,
    confirmation: item.confirmation,
    verification: item.verification,
    preconditions: item.preconditions || [],
    execution_commands: item.execution_commands || [],
    record_command: item.record_command || "",
    reviews: item.reviews || [],
    gmail_query: item.gmail_query || "",
    draft: item.draft || null,
    verification_commands: item.verification_commands || [],
    supporting_assets: supportingAssets(item, sources),
  };
}

function build({ confirmationQueue, customerFeedback, ownedSiteDropPatch, useCasePagePackages, executive }) {
  const readyRows = sortedReadyRows(confirmationQueue, executive);
  const blockedRows = waitingRows(confirmationQueue);
  const sources = { customerFeedback, ownedSiteDropPatch, useCasePagePackages };
  const rows = readyRows.map((row) => packetRow(row, sources));
  const next = rows[0] || null;
  return {
    generated_at: new Date().toISOString(),
    status: next ? "ready_confirmation_required" : "no_ready_confirmation",
    recommendation: next
      ? `Ask for or wait for the exact confirmation phrase before executing: ${next.confirmation}.`
      : "No ready external action is available; continue local monitoring and blocker resolution.",
    executive_recommendation: executive?.recommendation || "",
    counts: {
      ready_confirmations: readyRows.length,
      blocked_or_waiting: blockedRows.length,
      supporting_assets: rows.reduce((sum, row) => sum + row.supporting_assets.length, 0),
    },
    next,
    rows,
    blocked_or_waiting: blockedRows.map((row) => ({
      plugin: row.plugin,
      kind: row.kind,
      status: row.status,
      readiness: row.readiness,
      target: row.target,
      confirmation: row.confirmation,
      risk: row.risk,
      expected_benefit: row.expected_benefit,
    })),
    guardrails: [
      "This packet is local-only and does not send Gmail, publish pages, submit forms, upload Marketplace files, deploy, or modify payment settings.",
      "Only execute a row after the user provides the exact confirmation phrase shown for that row.",
      "After execution, replace evidence placeholders and record the action in the action log.",
      "Rows marked waiting_provider or blocked are not executable confirmations.",
    ],
  };
}

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function codeBlock(value, lang = "") {
  if (!value) return "";
  return ["```" + lang, String(value).trim(), "```"].join("\n");
}

function renderAssets(assets) {
  if (!assets?.length) return ["- none"].join("\n");
  const lines = [];
  for (const asset of assets) {
    if (asset.type === "gmail_draft_preview") {
      lines.push("- Gmail draft preview");
      lines.push(`  - Subject: ${asset.subject}`);
      lines.push("  - Body:");
      lines.push(codeBlock(asset.body, "text"));
      if (asset.gmail_query) lines.push("  - Read-only reply check:", codeBlock(asset.gmail_query, "text"));
      continue;
    }
    if (asset.type === "owned_site_patch") {
      lines.push("- Owned-site patch package");
      lines.push(`  - HTML: ${asset.html_file}`);
      lines.push(`  - Snippet: ${asset.snippet_file}`);
      lines.push(`  - Links: ${asset.links_file}`);
      lines.push(`  - CTA: ${asset.primary_cta_url}`);
      continue;
    }
    if (asset.type === "use_case_page_package") {
      lines.push("- Use-case page package");
      lines.push(`  - HTML: ${asset.html_file}`);
      lines.push(`  - Copy: ${asset.copy_file}`);
      lines.push(`  - Links: ${asset.links_file}`);
      lines.push(`  - CTA: ${asset.primary_cta_url}`);
    }
  }
  return lines.join("\n");
}

function renderMarkdown(report) {
  const lines = [
    "# Action-Time Confirmation Packet",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    report.executive_recommendation ? `Executive brief: ${report.executive_recommendation}` : "",
    "",
    "## Counts",
    "",
    `- Ready confirmations: ${report.counts.ready_confirmations}`,
    `- Blocked/waiting rows: ${report.counts.blocked_or_waiting}`,
    `- Supporting assets attached: ${report.counts.supporting_assets}`,
    "",
  ].filter((line) => line !== "");

  if (report.next) {
    lines.push(
      "## Next Action Card",
      "",
      `- Plugin: ${report.next.plugin}`,
      `- Action: ${report.next.action}`,
      `- Target: ${report.next.target}`,
      `- Risk: ${report.next.risk}`,
      `- Expected benefit: ${report.next.expected_benefit}`,
      `- Verification: ${report.next.verification}`,
      `- Exact confirmation phrase: ${report.next.confirmation}`,
      "",
      "Preconditions:",
      "",
      ...(report.next.preconditions.length ? report.next.preconditions.map((item) => `- ${item}`) : ["- none"]),
      "",
      "Supporting assets:",
      "",
      renderAssets(report.next.supporting_assets),
      "",
      "Execution command(s) after exact confirmation:",
      "",
      codeBlock(report.next.execution_commands?.length ? report.next.execution_commands.join("\n") : "# no execution command", "bash"),
      "",
      "Record after execution:",
      "",
      codeBlock(report.next.record_command || "# no record command", "bash"),
      "",
      "Verification command(s) after execution:",
      "",
      codeBlock(report.next.verification_commands?.length ? report.next.verification_commands.join("\n") : "# no verification command", "bash"),
      "",
    );
  }

  lines.push(
    "## Ready Confirmation Rows",
    "",
    "| Priority | Plugin | Kind | Target | Confirmation | Assets |",
    "|---:|---|---|---|---|---:|",
  );
  for (const row of report.rows) {
    lines.push(`| ${row.priority} | ${clean(row.plugin)} | ${clean(row.kind)} | ${clean(row.target)} | ${clean(row.confirmation)} | ${row.supporting_assets.length} |`);
  }
  if (!report.rows.length) lines.push("| - | - | - | - | - | 0 |");

  lines.push("", "## Waiting Or Blocked", "", "| Plugin | Kind | Readiness | Target | Reason/Risk |", "|---|---|---|---|---|");
  for (const row of report.blocked_or_waiting) {
    lines.push(`| ${clean(row.plugin)} | ${clean(row.kind)} | ${clean(row.readiness)} | ${clean(row.target)} | ${clean(row.risk || row.expected_benefit)} |`);
  }
  if (!report.blocked_or_waiting.length) lines.push("| - | - | - | - | - |");

  lines.push("", "## Guardrails", "");
  for (const rule of report.guardrails) lines.push(`- ${rule}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const [
    confirmationQueue,
    customerFeedback,
    ownedSiteDropPatch,
    useCasePagePackages,
    executive,
  ] = await Promise.all([
    readJson(args.confirmations, null),
    readJson(args.customerFeedback, null),
    readJson(args.ownedSiteDropPatch, null),
    readJson(args.useCasePagePackages, null),
    readJson(args.executive, null),
  ]);
  const report = build({
    confirmationQueue,
    customerFeedback,
    ownedSiteDropPatch,
    useCasePagePackages,
    executive,
  });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Action-time packet: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
