#!/usr/bin/env node

import http from "node:http";
import https from "node:https";

const DEFAULT_SITE_URL = "https://polyglotaeo.com/";
const DEFAULT_DESTINATION = "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/";
const DEFAULT_CAMPAIGN = "tracking_pipeline_test";

function usage() {
  return `
Usage:
  pnpm lead:event-test

Options:
  --site-url <url>      Site root receiving the Netlify form POST. Default: ${DEFAULT_SITE_URL}
  --event-type <type>   Event type to submit. Default: install_click
  --cta <label>         CTA label to submit. Default: tracking_pipeline_test
  --campaign <name>     UTM campaign. Default: ${DEFAULT_CAMPAIGN}
  --destination <url>   Destination URL. Default: ${DEFAULT_DESTINATION}
  --help                Show this help message.

The submitted event always includes test_mode=true. Run:
  pnpm lead:events -- --include-test
  pnpm lead:events
`;
}

function parseArgs(argv) {
  const args = {
    siteUrl: DEFAULT_SITE_URL,
    eventType: "install_click",
    cta: "tracking_pipeline_test",
    campaign: DEFAULT_CAMPAIGN,
    destination: DEFAULT_DESTINATION,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--site-url") {
      args.siteUrl = value;
      index += 1;
      continue;
    }
    if (key === "--event-type") {
      args.eventType = value;
      index += 1;
      continue;
    }
    if (key === "--cta") {
      args.cta = value;
      index += 1;
      continue;
    }
    if (key === "--campaign") {
      args.campaign = value;
      index += 1;
      continue;
    }
    if (key === "--destination") {
      args.destination = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

function buildBody(args) {
  const body = new URLSearchParams();
  body.set("form-name", "framer-aeo-event");
  body.set("event_type", args.eventType);
  body.set("cta", args.cta);
  body.set("destination", args.destination);
  body.set("source_path", `/__tracking-test?utm_source=codex_test&utm_medium=ops&utm_campaign=${encodeURIComponent(args.campaign)}`);
  body.set("referrer", "codex-event-test");
  body.set("ts", new Date().toISOString());
  body.set("utm_source", "codex_test");
  body.set("utm_medium", "ops");
  body.set("utm_campaign", args.campaign);
  body.set("test_mode", "true");
  return body;
}

function postForm(siteUrl, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(siteUrl);
    const encoded = body.toString();
    const transport = url.protocol === "http:" ? http : https;
    const request = transport.request(
      {
        method: "POST",
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname || "/"}${url.search || ""}`,
        timeout: 30000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(encoded),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 0,
            location: response.headers.location || "",
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("event test POST timed out")));
    request.on("error", reject);
    request.end(encoded);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const response = await postForm(args.siteUrl, buildBody(args));
  if (response.statusCode < 200 || response.statusCode >= 400) {
    throw new Error(`Event test POST failed with HTTP ${response.statusCode}: ${response.body.slice(0, 200)}`);
  }

  process.stdout.write(`Submitted test event to ${args.siteUrl} (HTTP ${response.statusCode}).\n`);
  process.stdout.write("Next: pnpm lead:events -- --include-test\n");
  process.stdout.write("Then: pnpm lead:events\n");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
