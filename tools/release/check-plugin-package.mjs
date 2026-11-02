#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_ZIP = "plugin.zip";
const DEFAULT_DIST = "dist";

const REQUIRED_ENTRIES = [
  "framer.json",
  "framer-plugin-packed.txt",
  "icon.svg",
  "index.html",
];

const REQUIRED_MARKERS = [
  "https://polyglotaeo.com/go/checkout/",
  "https://license.polyglotaeo.com",
  "framer_plugin",
  "plugin_upgrade",
  "utm_content",
  "project_id",
];

const FORBIDDEN_MARKERS = [
  "https://polyglot-license.jimmymjing.workers.dev",
];

const FORBIDDEN_AI_BUNDLE_PATTERNS = [
  ["OpenAI direct endpoint", /api\.openai/i],
  ["Anthropic direct endpoint", /api\.anthropic|anthropic\.com\/v1/i],
  ["Gemini direct endpoint", /generativelanguage/i],
  ["DeepSeek direct endpoint", /api\.deepseek/i],
  ["MiniMax direct endpoint", /api\.minimaxi|api\.minimax/i],
  ["DashScope direct endpoint", /dashscope/i],
  ["Moonshot direct endpoint", /moonshot/i],
  ["Zhipu direct endpoint", /open\.bigmodel/i],
  ["Browser chat-completions adapter", /chat\/completions/i],
  ["BYOK copy", /\bbyok\b/i],
  ["API-key copy", /\bapi key\b/i],
  ["Provider-key copy", /provider key/i],
  ["AI-provider-key copy", /ai provider api/i],
  ["Custom OpenAI copy", /custom openai/i],
  ["Japanese API-key copy", /api キー/i],
  ["Chinese custom OpenAI copy", /自定义 openai/i],
  ["Japanese custom OpenAI copy", /カスタム openai/i],
];

function usage() {
  return `
Usage:
  pnpm release:plugin-check

Options:
  --zip <file>       Plugin zip to inspect. Default: ${DEFAULT_ZIP}
  --dist <dir>       Dist directory used for freshness check. Default: ${DEFAULT_DIST}
  --skip-freshness   Do not require plugin.zip to be newer than dist assets.
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    zip: DEFAULT_ZIP,
    dist: DEFAULT_DIST,
    skipFreshness: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--zip") {
      args.zip = value;
      index += 1;
      continue;
    }
    if (key === "--dist") {
      args.dist = value;
      index += 1;
      continue;
    }
    if (key === "--skip-freshness") {
      args.skipFreshness = true;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

async function unzipList(zipFile) {
  const { stdout } = await execFileAsync("unzip", ["-Z1", zipFile], {
    maxBuffer: 5 * 1024 * 1024,
  });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function unzipText(zipFile, entry) {
  const { stdout } = await execFileAsync("unzip", ["-p", zipFile, entry], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function newestMtimeMs(dir) {
  let newest = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await newestMtimeMs(file));
    } else if (entry.isFile()) {
      const info = await stat(file);
      newest = Math.max(newest, info.mtimeMs);
    }
  }
  return newest;
}

function requireEntries(entries) {
  const missing = REQUIRED_ENTRIES.filter((entry) => !entries.includes(entry));
  if (missing.length) {
    throw new Error(`Missing required plugin.zip entries: ${missing.join(", ")}`);
  }

  if (!entries.some((entry) => entry.endsWith(".mjs"))) {
    throw new Error("plugin.zip has no bundled .mjs entry.");
  }
  if (!entries.some((entry) => /^assets\/.+\.js$/.test(entry))) {
    throw new Error("plugin.zip has no bundled assets/*.js entry.");
  }
}

async function checkFramerManifest(zipFile) {
  const manifest = JSON.parse(await unzipText(zipFile, "framer.json"));
  if (!manifest.id) throw new Error("framer.json is missing id.");
  if (manifest.name !== "Polyglot AEO") {
    throw new Error(`Unexpected plugin name: ${manifest.name || "(empty)"}`);
  }
  if (!Array.isArray(manifest.modes) || !manifest.modes.includes("canvas")) {
    throw new Error("framer.json must include canvas mode.");
  }
  return manifest;
}

async function checkBridgeMarkers(zipFile, entries) {
  const jsEntries = entries.filter((entry) => /\.(?:mjs|js)$/.test(entry));
  const js = (
    await Promise.all(jsEntries.map((entry) => unzipText(zipFile, entry)))
  ).join("\n");
  const missing = REQUIRED_MARKERS.filter((marker) => !js.includes(marker));
  if (missing.length) {
    throw new Error(`Missing checkout bridge markers in plugin bundle: ${missing.join(", ")}`);
  }
  const forbidden = FORBIDDEN_MARKERS.filter((marker) => js.includes(marker));
  if (forbidden.length) {
    throw new Error(`Forbidden legacy checkout origins in plugin bundle: ${forbidden.join(", ")}`);
  }
  return js;
}

function checkManagedAiGuardrails(js) {
  const matches = FORBIDDEN_AI_BUNDLE_PATTERNS
    .filter(([, pattern]) => pattern.test(js))
    .map(([label]) => label);
  if (matches.length) {
    throw new Error(
      `Forbidden browser-side AI markers in plugin bundle: ${matches.join(", ")}`,
    );
  }
}

async function checkFreshness(zipFile, distDir) {
  const [zipInfo, distMtime] = await Promise.all([
    stat(zipFile),
    newestMtimeMs(distDir),
  ]);
  if (zipInfo.mtimeMs + 1000 < distMtime) {
    throw new Error(
      `${zipFile} is older than ${distDir}; run \`pnpm run pack\` before submitting.`,
    );
  }
  return {
    zipMtime: zipInfo.mtime,
    distMtime: new Date(distMtime),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const entries = await unzipList(args.zip);
  requireEntries(entries);
  const manifest = await checkFramerManifest(args.zip);
  const js = await checkBridgeMarkers(args.zip, entries);
  checkManagedAiGuardrails(js);
  const freshness = args.skipFreshness
    ? null
    : await checkFreshness(args.zip, args.dist);

  process.stdout.write("# Plugin Package Check\n\n");
  process.stdout.write(`Zip: ${args.zip}\n`);
  process.stdout.write(`Entries: ${entries.length}\n`);
  process.stdout.write(`Plugin: ${manifest.name} (${manifest.id})\n`);
  process.stdout.write(`Modes: ${manifest.modes.join(", ")}\n`);
  if (freshness) {
    process.stdout.write(`Zip modified: ${freshness.zipMtime.toISOString()}\n`);
    process.stdout.write(`Newest dist file: ${freshness.distMtime.toISOString()}\n`);
  }
  process.stdout.write("Checkout bridge markers: present\n");
  process.stdout.write("Managed AI bundle guardrails: passed\n");
  process.stdout.write("\nResult: PASS\n");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
