#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ZIP = "plugin.zip";
const DEFAULT_OUTPUT = ".tmp/framer-marketplace-update.md";
const MARKETPLACE_URL =
  "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";
const UPLOAD_EVIDENCE_PLACEHOLDER = "<framer-upload-confirmation-url-or-screenshot>";
const CREATOR_SPACE_EVIDENCE_PLACEHOLDER = "<creator-space-dashboard-snapshot-or-upload-confirmation>";
const CREATOR_SPACE_BASELINE_COMMAND =
  'pnpm lead:marketplace -- --add --users <users> --opens <opens> --version <version> --updated "<updated>" --note "Creator Space baseline before Marketplace upload"';
const DEFAULT_CHANGE_NOTE =
  "Improves the first-run experience by starting with a free project-readiness review and clearly separating optional Pro managed generation. The plugin no longer asks for or stores third-party AI provider API keys, and all managed AI requests use the Polyglot AEO backend.";

function usage() {
  return `
Usage:
  pnpm release:marketplace-brief

Options:
  --zip <file>       Plugin zip to upload. Default: ${DEFAULT_ZIP}
  --output <file>    Markdown handoff brief. Default: ${DEFAULT_OUTPUT}
  --changes <text>   Release note text for Framer's Changes field.
  --help             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    zip: DEFAULT_ZIP,
    output: DEFAULT_OUTPUT,
    changes: DEFAULT_CHANGE_NOTE,
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
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--changes") {
      args.changes = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

async function zipInfo(file) {
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  return {
    file,
    size: info.size,
    modified: info.mtime.toISOString(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function render({ args, zip }) {
  return `# Framer Marketplace Update

Generated: ${new Date().toISOString()}
Plugin: Polyglot AEO
Marketplace page: ${MARKETPLACE_URL}
Package: ${zip.file}
Modified: ${zip.modified}
Size: ${zip.size} bytes
SHA256: ${zip.sha256}

## Pre-upload Gate

Run these immediately before opening Framer. Do not upload if either command fails.

\`\`\`bash
pnpm release:plugin-check
pnpm lead:creem-compliance
pnpm lead:checkout-origin
pnpm lead:site-check
pnpm lead:marketplace-preflight
pnpm lead:tracking-freshness
pnpm lead:netlify-recovery
\`\`\`

Required proof:

- \`plugin.zip\` contains the checkout bridge markers for \`https://polyglotaeo.com/go/checkout/\`.
- Production \`https://polyglotaeo.com/go/checkout/\` returns 200 with the checkout bridge markers.
- Creem compliance is clear: no open payment/store/domain warnings are logged, and production checkout traffic points at \`https://license.polyglotaeo.com/checkout\`.
- \`pnpm lead:checkout-origin\` reports \`Status: ready\`; this proves the plugin zip, local static export, Worker custom domain, production pricing page, and production checkout bridge all use the approved checkout origin.
- Production site checks pass even while new Netlify deploys are blocked.
- \`pnpm lead:marketplace-preflight\` reports \`Upload allowed: yes\`; \`lead:marketplace-record\` will refuse to mark the upload done if the preflight is missing, blocked, for a different zip SHA, or missing external upload evidence.
- \`pnpm lead:tracking-freshness\` and \`pnpm lead:netlify-recovery\` are diagnostic gates for follow-on distribution. If tracking is stale but Marketplace preflight is ready, the Marketplace upload can proceed; pause Community and directory traffic until a fresh deploy passes strict tracking.

## Creator Space Baseline

Before uploading, copy the current Creator Space users/opens/version/updated values and record them:

\`\`\`bash
${CREATOR_SPACE_BASELINE_COMMAND}
\`\`\`

This baseline makes the after-upload users/opens delta measurable even if website attribution is stale.

## Browser Path

1. Open ${MARKETPLACE_URL}
2. Record the Creator Space baseline above.
3. Click **More options**.
4. Click **New Version**.
5. Click **Upload** and choose \`${path.resolve(zip.file)}\`.
6. Paste the Changes text below.
7. Submit only after confirming the uploaded file is the current \`plugin.zip\`.

## Changes

${args.changes}

## After Submit

\`\`\`bash
pnpm lead:marketplace-record -- --plugin-zip "${zip.file}" --evidence "${UPLOAD_EVIDENCE_PLACEHOLDER}" --note "uploaded from Framer Marketplace New Version flow"
pnpm lead:marketplace-record -- --plugin-zip "${zip.file}" --evidence "${CREATOR_SPACE_EVIDENCE_PLACEHOLDER}" --users <users> --opens <opens> --version <version> --updated "<updated>"
pnpm lead:marketplace-public -- --record
pnpm lead:marketplace-review
pnpm lead:forms && pnpm lead:events
pnpm lead:tracking-freshness
pnpm lead:netlify-recovery
pnpm lead:marketplace-postflight
pnpm lead:community-preflight
pnpm lead:action-review && pnpm lead:channel-priority
pnpm lead:ops && pnpm lead:report
\`\`\`

Watch for checkout events where \`utm_campaign=plugin_upgrade\` and \`reason\` is populated.
If \`lead:tracking-freshness\` still reports stale production tracking, do not publish the Framer Community post or submit directory forms yet.
`;
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

  const zip = await zipInfo(args.zip);
  const markdown = render({ args, zip });
  await writeText(args.output, markdown);
  process.stdout.write(markdown);
  process.stdout.write(`Brief written to ${args.output}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
