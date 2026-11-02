#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_INVENTORY = ".tmp/framer-creem-link-inventory.json";
const DEFAULT_OUTPUT = ".tmp/framer-creem-store-verification-brief.md";
const DEFAULT_JSON = ".tmp/framer-creem-store-verification-brief.json";

function usage() {
  return `
Usage:
  pnpm lead:creem-store-verification

Options:
  --inventory <file> Creem link inventory JSON. Default: ${DEFAULT_INVENTORY}
  --output <file>    Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>      JSON output. Default: ${DEFAULT_JSON}
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    inventory: DEFAULT_INVENTORY,
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
      "--inventory": "inventory",
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

function clean(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function recordCommand(row) {
  const campaign = `${slug(row.plugin)}_store_domain_verification`;
  const product = row.product_ids.join(", ") || "no direct product id";
  return [
    "pnpm lead:actions -- --add",
    "--type payment_verification",
    "--channel creem_dashboard",
    `--campaign '${campaign}'`,
    "--status done",
    `--target '${row.plugin} Creem store/domain approval'`,
    "--evidence '<store-id-or-screenshot-path>'",
    `--note 'Verified read-only that Creem store Website URL/business matches ${row.expected_domain} for product ${product} before scaling owned traffic.'`,
  ].join(" ");
}

function classify(row) {
  if (row.status === "needs_store_domain_verification") {
    return {
      verification_status: "needs_read_only_dashboard_verification",
      readiness: "manual_read_only_check_required",
      priority: 1,
      action: "Open the matching Creem store in dashboard, inspect Settings > General and product checkout fields, and confirm the Website URL/business represents the owned domain.",
      risk: "Scaling direct checkout traffic before store/domain approval is evidenced can create another unregistered-traffic compliance warning.",
      expected_benefit: "Lets the owned site keep a direct checkout path without guessing, while preserving proof for later compliance questions.",
      verification: "Capture store id, store name, Website URL, business name, product id, and an approval/approved-state screenshot or support note.",
    };
  }
  if (row.status === "blocked_compliance") {
    return {
      verification_status: "blocked_wait_provider_origin",
      readiness: "waiting_provider",
      priority: 2,
      action: "Do not change the store or scale promotion. Wait for Creem to identify the exact origin/referrer, then record closure evidence.",
      risk: "Changing unrelated settings can blur the root cause and risk offboarding the wrong store.",
      expected_benefit: "Keeps Loka isolated from Ally/Gaode and avoids guessing which traffic triggered the warning.",
      verification: "Provider reply naming the origin/referrer, or Creem dashboard/support evidence that the warning is closed.",
    };
  }
  if (row.status === "blocked_checkout") {
    return {
      verification_status: "blocked_checkout_gate",
      readiness: "blocked",
      priority: 3,
      action: "Resolve the checkout/custom-domain gate before driving purchase traffic.",
      risk: "Promotion can waste demand if visitors cannot complete checkout cleanly.",
      expected_benefit: "Restores a trustworthy paid conversion path before traffic increases.",
      verification: "Live checkout/custom-domain smoke test plus action log evidence.",
    };
  }
  if (row.status === "direct_checkout_with_local_approval_evidence") {
    return {
      verification_status: "verified_by_local_evidence",
      readiness: "verified",
      priority: 4,
      action: "Keep the approval evidence attached and monitor payments/refunds.",
      risk: "Low, as long as evidence remains current after website or store changes.",
      expected_benefit: "Direct checkout can remain in promotion paths with lower compliance uncertainty.",
      verification: "Existing action log approval evidence plus recurring Creem/payment monitoring.",
    };
  }
  if (row.status === "direct_checkout_with_local_store_domain_evidence") {
    return {
      verification_status: "verified_by_local_store_domain_evidence",
      readiness: "verified",
      priority: 4,
      action: "Keep the local Creem dashboard store/domain evidence attached and monitor for new provider warnings.",
      risk: "Moderate-low: the store/domain pairing is locally evidenced, but no separate provider closure/approval note was captured.",
      expected_benefit: "Allows owned-site checkout promotion to proceed more confidently while keeping evidence ready if Creem asks again.",
      verification: "Action log payment_verification row plus local dashboard evidence screenshots; capture provider closure if Creem sends one.",
    };
  }
  return {
    verification_status: "no_direct_checkout_action",
    readiness: "no_action_needed",
    priority: 5,
    action: "No Creem store/domain action needed for this inspected URL.",
    risk: "Low from direct Creem links because none were found on this URL.",
    expected_benefit: "Keeps attention on plugins with active checkout risk.",
    verification: "Creem link inventory remains clean for this owned URL.",
  };
}

function buildRow(row) {
  const expectedDomain = hostFromUrl(row.target_url);
  const classified = classify(row);
  return {
    plugin: row.plugin || "",
    target_url: row.target_url || "",
    expected_domain: expectedDomain,
    inventory_status: row.status || "",
    verification_status: classified.verification_status,
    readiness: classified.readiness,
    priority: classified.priority,
    product_ids: Array.isArray(row.product_ids) ? row.product_ids : [],
    expected_product_ids: Array.isArray(row.expected_product_ids) ? row.expected_product_ids : [],
    direct_creem_unique_links: Number(row.direct_creem_unique_links || 0),
    direct_creem_occurrences: Number(row.direct_creem_occurrences || 0),
    open_compliance_warnings: Number(row.open_compliance_warnings || 0),
    approval_evidence_count: Number(row.approval_evidence_count || 0),
    action: classified.action,
    risk: classified.risk,
    expected_benefit: classified.expected_benefit,
    verification: classified.verification,
    dashboard_fields: [
      "Store ID",
      "Store Name",
      "Business Name",
      "Website URL",
      "Product ID",
      "Product checkout link",
      "Approval/status indicator or support evidence",
    ],
    evidence_needed: [
      `Website URL/domain equals or explicitly covers ${expectedDomain || "the owned domain"}`,
      "Product ID matches the direct Creem link used on the owned site",
      "Store/business name matches the plugin or approved business represented on the site",
      "Screenshot or support note is saved before marking verification done",
    ],
    record_command: classified.verification_status === "needs_read_only_dashboard_verification" ? recordCommand({
      plugin: row.plugin || "",
      expected_domain: expectedDomain,
      product_ids: Array.isArray(row.product_ids) ? row.product_ids : [],
    }) : "",
  };
}

function recommendationFor(rows) {
  const manual = rows.filter((row) => row.readiness === "manual_read_only_check_required");
  if (manual.length) {
    return `Do read-only Creem store/domain verification for ${manual.map((row) => row.plugin).join(" and ")} before scaling owned-site checkout traffic.`;
  }
  const waiting = rows.find((row) => row.readiness === "waiting_provider");
  if (waiting) return `Keep ${waiting.plugin} gated until Creem provides origin/referrer or closure evidence.`;
  const blocked = rows.find((row) => row.readiness === "blocked");
  if (blocked) return `Resolve ${blocked.plugin} checkout gate before paid promotion.`;
  return "No open Creem store/domain verification packet is required by the current inventory.";
}

async function build({ inventory }) {
  const sourceRows = Array.isArray(inventory?.rows) ? inventory.rows : [];
  const rows = sourceRows.map(buildRow).sort((a, b) => a.priority - b.priority || a.plugin.localeCompare(b.plugin));
  const counts = rows.reduce((acc, row) => {
    acc[row.readiness] = (acc[row.readiness] || 0) + 1;
    acc[row.verification_status] = (acc[row.verification_status] || 0) + 1;
    acc.rows += 1;
    return acc;
  }, { rows: 0 });
  return {
    generated_at: new Date().toISOString(),
    status: rows.length ? "ready" : "missing_inventory_rows",
    source_inventory_status: inventory?.status || "missing",
    recommendation: recommendationFor(rows),
    counts,
    rows,
    guardrails: [
      "This is a read-only verification brief. It does not log into Creem, change payment settings, modify websites, send email, or deploy anything.",
      "Do not close needs_read_only_dashboard_verification from memory; attach dashboard/support evidence in the action log.",
      "Keep Loka compliance handling separate from Ally/Gaode store-domain verification unless Creem explicitly links them.",
    ],
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Creem Store/Domain Verification Brief",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Source inventory: ${report.source_inventory_status}`,
    "",
    "## Recommendation",
    "",
    report.recommendation,
    "",
    "## Counts",
    "",
    `- Manual read-only checks: ${report.counts.manual_read_only_check_required || 0}`,
    `- Waiting provider: ${report.counts.waiting_provider || 0}`,
    `- Blocked checkout: ${report.counts.blocked || 0}`,
    `- Verified: ${report.counts.verified || 0}`,
    `- No action needed: ${report.counts.no_action_needed || 0}`,
    "",
    "## Matrix",
    "",
    "| Readiness | Plugin | Owned domain | Inventory status | Product IDs | Links | Warnings | Approval evidence | Action |",
    "|---|---|---|---|---|---:|---:|---:|---|",
  ];

  for (const row of report.rows) {
    lines.push(`| ${clean(row.readiness)} | ${clean(row.plugin)} | ${clean(row.expected_domain)} | ${clean(row.inventory_status)} | ${clean(row.product_ids.join(", ") || "none")} | ${row.direct_creem_unique_links} | ${row.open_compliance_warnings} | ${row.approval_evidence_count} | ${clean(row.action)} |`);
  }
  if (!report.rows.length) lines.push("| none |  |  |  |  |  |  |  |  |");

  lines.push("", "## Manual Check Steps", "");
  for (const row of report.rows.filter((item) => item.readiness === "manual_read_only_check_required")) {
    lines.push(`### ${row.plugin}`, "");
    lines.push(`- Owned site: ${row.target_url}`);
    lines.push(`- Expected domain: ${row.expected_domain || "unknown"}`);
    lines.push(`- Product IDs: ${row.product_ids.join(", ") || "none"}`);
    lines.push(`- Risk: ${row.risk}`);
    lines.push(`- Expected benefit: ${row.expected_benefit}`);
    lines.push(`- Verification: ${row.verification}`);
    lines.push(`- Dashboard fields: ${row.dashboard_fields.join(", ")}`);
    lines.push("- Evidence needed:");
    for (const item of row.evidence_needed) lines.push(`  - ${item}`);
    lines.push("- Record after verification:");
    lines.push("");
    lines.push("```bash");
    lines.push(row.record_command);
    lines.push("```");
    lines.push("");
  }
  if (!report.rows.some((row) => row.readiness === "manual_read_only_check_required")) {
    lines.push("No manual store/domain checks are currently required.", "");
  }

  lines.push("## Held Or Blocked", "", "| Readiness | Plugin | Why | Verification to clear |", "|---|---|---|---|");
  let heldRows = 0;
  for (const row of report.rows.filter((item) => item.readiness === "waiting_provider" || item.readiness === "blocked")) {
    lines.push(`| ${clean(row.readiness)} | ${clean(row.plugin)} | ${clean(row.risk)} | ${clean(row.verification)} |`);
    heldRows += 1;
  }
  if (!heldRows) lines.push("| none |  |  |  |");

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
  const inventory = await readJson(args.inventory, null);
  const report = await build({ inventory });
  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`Creem store/domain verification brief: ${report.status}\n`);
  process.stdout.write(`Recommendation: ${report.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
