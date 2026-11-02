#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_WRANGLER_DIR = "api";
const DEFAULT_WRANGLER = "api/wrangler.toml";
const DEFAULT_CHECKOUT = ".tmp/framer-checkout-origin-readiness.json";
const DEFAULT_TARGET_ORIGIN = "https://license.polyglotaeo.com";
const DEFAULT_OUTPUT = ".tmp/framer-cloudflare-recovery.md";
const DEFAULT_JSON = ".tmp/framer-cloudflare-recovery.json";
const REQUEST_TIMEOUT_MS = Number(process.env.CLOUDFLARE_RECOVERY_TIMEOUT_MS || 15000);

function usage() {
  return `
Usage:
  pnpm lead:cloudflare-recovery

Options:
  --wrangler-dir <dir>    Wrangler working directory. Default: ${DEFAULT_WRANGLER_DIR}
  --wrangler <file>       Wrangler config. Default: ${DEFAULT_WRANGLER}
  --checkout <file>       Checkout origin readiness JSON. Default: ${DEFAULT_CHECKOUT}
  --target-origin <url>   Target Worker origin. Default: ${DEFAULT_TARGET_ORIGIN}
  --output <file>         Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>           JSON output. Default: ${DEFAULT_JSON}
  --help                  Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    wranglerDir: DEFAULT_WRANGLER_DIR,
    wrangler: DEFAULT_WRANGLER,
    checkout: DEFAULT_CHECKOUT,
    targetOrigin: DEFAULT_TARGET_ORIGIN,
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
    if (key === "--wrangler-dir") {
      args.wranglerDir = value;
      index += 1;
      continue;
    }
    if (key === "--wrangler") {
      args.wrangler = value;
      index += 1;
      continue;
    }
    if (key === "--checkout") {
      args.checkout = value;
      index += 1;
      continue;
    }
    if (key === "--target-origin") {
      args.targetOrigin = value.replace(/\/+$/, "");
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

  args.targetOrigin = args.targetOrigin.replace(/\/+$/, "");
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

async function runWrangler(args, wranglerArgs) {
  try {
    const { stdout, stderr } = await execFileAsync("npx", ["wrangler", ...wranglerArgs], {
      cwd: args.wranglerDir,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr, error: "" };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
      error: error?.message || String(error),
    };
  }
}

function parseJsonOutput(result, fallback) {
  if (!result.ok) return fallback;
  const text = String(result.stdout || "").trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("[");
    const objectStart = text.indexOf("{");
    const first = [start, objectStart].filter((index) => index >= 0).sort((a, b) => a - b)[0];
    if (first === undefined) return fallback;
    try {
      return JSON.parse(text.slice(first));
    } catch {
      return fallback;
    }
  }
}

async function fetchHead(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "PolyglotAEO-CloudflareRecovery/1.0" },
      signal: controller.signal,
    });
    return {
      url,
      final_url: response.url || url,
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      error: "",
    };
  } catch (error) {
    return {
      url,
      final_url: url,
      status: 0,
      ok: false,
      error: error?.name === "AbortError" ? "timeout" : error?.message || String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function dnsCheck(origin) {
  const host = new URL(origin).hostname;
  const [v4, v6] = await Promise.allSettled([dns.resolve4(host), dns.resolve6(host)]);
  const addresses = [
    ...(v4.status === "fulfilled" ? v4.value : []),
    ...(v6.status === "fulfilled" ? v6.value : []),
  ];
  const reserved = addresses.filter((address) => isReservedAddress(address));
  const publicAddresses = addresses.filter((address) => !isReservedAddress(address));
  return {
    host,
    ok: addresses.length > 0,
    public_ok: publicAddresses.length > 0 && reserved.length === 0,
    addresses,
    public_addresses: publicAddresses,
    reserved_addresses: reserved,
    error: addresses.length
      ? ""
      : [v4, v6]
          .filter((item) => item.status === "rejected")
          .map((item) => item.reason?.code || item.reason?.message || String(item.reason))
          .join("; "),
  };
}

function isReservedAddress(address) {
  const version = net.isIP(address);
  if (version === 4) return isReservedIpv4(address);
  if (version === 6) return isReservedIpv6(address);
  return true;
}

function isReservedIpv4(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isReservedIpv6(address) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:")
  );
}

function latestDeployment(deployments) {
  return Array.isArray(deployments)
    ? [...deployments].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)))[0] || null
    : null;
}

function latestVersion(versions) {
  return Array.isArray(versions)
    ? [...versions].sort((a, b) => Number(b.number || 0) - Number(a.number || 0))[0] || null
    : null;
}

function has(text, needle) {
  return String(text || "").includes(needle);
}

function statusFor({ configReady, secretsReady, healthOk }) {
  if (configReady && secretsReady && healthOk) return "ready";
  return "blocked";
}

function recommendationFor({ configReady, secretsReady, dnsPublic, healthOk, latestDeploy }) {
  if (!configReady) {
    return "Fix api/wrangler.toml so workers_dev is false and license.polyglotaeo.com is configured as a Worker custom domain.";
  }
  if (!secretsReady) {
    return "Add the required Worker secrets before routing production checkout traffic.";
  }
  if (!healthOk) {
    const suffix = latestDeploy?.created_on
      ? ` Latest Cloudflare deployment evidence is ${latestDeploy.created_on}; deploy/apply the current custom-domain config after explicit confirmation.`
      : " Deploy/apply the current custom-domain config after explicit confirmation.";
    return `Cloudflare custom domain is not serving production traffic yet.${suffix}`;
  }
  if (!dnsPublic) {
    return "Cloudflare Worker custom domain health is reachable, but local DNS resolves through a reserved/proxy address. Treat Cloudflare as ready and verify from another network if needed.";
  }
  return "Cloudflare Worker custom domain is ready. Rerun payment compliance recovery and Marketplace preflight.";
}

async function build(args) {
  const wranglerText = await readText(args.wrangler);
  const checkout = await readJson(args.checkout, null);
  const [whoamiResult, deploymentsResult, versionsResult, secretsResult, dns, health] = await Promise.all([
    runWrangler(args, ["whoami"]),
    runWrangler(args, ["deployments", "list", "--json"]),
    runWrangler(args, ["versions", "list", "--json"]),
    runWrangler(args, ["secret", "list", "--format", "json"]),
    dnsCheck(args.targetOrigin),
    fetchHead(`${args.targetOrigin}/health`),
  ]);

  const deployments = parseJsonOutput(deploymentsResult, []);
  const versions = parseJsonOutput(versionsResult, []);
  const secrets = parseJsonOutput(secretsResult, []);
  const latestDeploy = latestDeployment(deployments);
  const latest = latestVersion(versions);
  const secretNames = Array.isArray(secrets) ? secrets.map((item) => item.name) : [];
  const configReady =
    has(wranglerText, "workers_dev = false") &&
    has(wranglerText, `pattern = "${new URL(args.targetOrigin).hostname}"`) &&
    has(wranglerText, "custom_domain = true");
  const secretsReady = ["CREEM_API_KEY", "CREEM_TEST_API_KEY"].every((name) => secretNames.includes(name));
  const dnsPublic = dns.public_ok;
  const healthOk = health.ok;
  const checkoutBlockers = Array.isArray(checkout?.blockers)
    ? checkout.blockers.filter((item) => ["target_dns_public", "target_health"].includes(item.id))
    : [];
  const status = statusFor({ configReady, secretsReady, healthOk });

  return {
    generated_at: new Date().toISOString(),
    status,
    target_origin: args.targetOrigin,
    wrangler: {
      file: args.wrangler,
      worker_name: extractWorkerName(wranglerText),
      config_ready: configReady,
      workers_dev_false: has(wranglerText, "workers_dev = false"),
      custom_domain: has(wranglerText, "custom_domain = true"),
      target_pattern: has(wranglerText, `pattern = "${new URL(args.targetOrigin).hostname}"`),
    },
    account: {
      readable: whoamiResult.ok,
      summary: summarizeWhoami(whoamiResult.stdout),
      error: whoamiResult.ok ? "" : whoamiResult.error || whoamiResult.stderr,
    },
    deployments: {
      readable: deploymentsResult.ok,
      count: Array.isArray(deployments) ? deployments.length : 0,
      latest: latestDeploy,
      error: deploymentsResult.ok ? "" : deploymentsResult.error || deploymentsResult.stderr,
    },
    versions: {
      readable: versionsResult.ok,
      count: Array.isArray(versions) ? versions.length : 0,
      latest,
      error: versionsResult.ok ? "" : versionsResult.error || versionsResult.stderr,
    },
    secrets: {
      readable: secretsResult.ok,
      required_present: secretsReady,
      names: secretNames,
      error: secretsResult.ok ? "" : secretsResult.error || secretsResult.stderr,
    },
    dns,
    health,
    checkout_blockers: checkoutBlockers,
    recommendation: recommendationFor({ configReady, secretsReady, dnsPublic, healthOk, latestDeploy }),
    confirmation_gated_commands: [
      "cd api",
      "npx wrangler deploy",
      `curl -I ${args.targetOrigin}/health`,
      "cd ..",
      "pnpm lead:checkout-origin",
      "pnpm lead:payment-compliance-recovery",
      "pnpm lead:marketplace-preflight",
    ],
  };
}

function extractWorkerName(text) {
  const match = String(text || "").match(/^name\s*=\s*"([^"]+)"/m);
  return match?.[1] || "";
}

function summarizeWhoami(text) {
  const email = String(text || "").match(/email\s+([^.\s]+@[^.\s]+\.[^\s.]+)/i)?.[1] || "";
  const account = String(text || "").match(/│\s+([^│]+Account)\s+│\s+([a-f0-9]{32})\s+│/) || null;
  return [email, account ? `${account[1].trim()} ${account[2]}` : ""].filter(Boolean).join("; ");
}

function renderMarkdown(data) {
  const lines = [
    "# Cloudflare Recovery",
    "",
    `Generated: ${data.generated_at}`,
    `Status: ${data.status}`,
    `Target origin: ${data.target_origin}`,
    "",
    "## Recommendation",
    "",
    data.recommendation,
    "",
    "## Evidence",
    "",
    `- Wrangler config ready: ${data.wrangler.config_ready ? "yes" : "no"}`,
    `- Worker name: ${data.wrangler.worker_name || "unknown"}`,
    `- Account readable: ${data.account.readable ? "yes" : "no"}`,
    `- Deployments readable: ${data.deployments.readable ? "yes" : "no"} (${data.deployments.count})`,
    `- Latest deployment: ${data.deployments.latest?.created_on || "unknown"}`,
    `- Versions readable: ${data.versions.readable ? "yes" : "no"} (${data.versions.count})`,
    `- Latest version: ${data.versions.latest?.id || "unknown"} (#${data.versions.latest?.number || "?"})`,
    `- Required secrets present: ${data.secrets.required_present ? "yes" : "no"} (${data.secrets.names.join(", ") || "none"})`,
    `- DNS addresses: ${data.dns.addresses.join(", ") || data.dns.error || "none"}`,
    `- Public DNS: ${data.dns.public_ok ? "yes" : "no"}; reserved: ${data.dns.reserved_addresses.join(", ") || "none"}`,
    `- Health: ${data.health.ok ? "pass" : "fail"} (status ${data.health.status}; ${data.health.error || data.health.final_url})`,
    "",
  ];

  if (data.checkout_blockers.length) {
    lines.push("## Checkout-Origin Blockers", "");
    for (const blocker of data.checkout_blockers) {
      lines.push(`- ${blocker.label || blocker.id}: ${blocker.detail || ""}`);
    }
    lines.push("");
  }

  lines.push(
    "## Confirmation-Gated Commands",
    "",
    "Run only after explicit deploy confirmation:",
    "",
    "```bash",
    ...data.confirmation_gated_commands,
    "```",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const data = await build(args);
  await Promise.all([
    writeText(args.output, renderMarkdown(data)),
    writeText(args.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);

  process.stdout.write(`Cloudflare recovery: ${data.status}\n`);
  process.stdout.write(`Recommendation: ${data.recommendation}\n`);
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
