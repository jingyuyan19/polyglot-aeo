#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  REDDIT_ACTIVITY_HEADERS,
  readJson,
  writeRows,
} from "./reddit-pilot-lib.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

async function run(script, args, expectFailure = false) {
  try {
    return await execFileAsync(process.execPath, [path.join(ROOT, script), ...args], {
      cwd: ROOT,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (expectFailure) return error;
    throw error;
  }
}

function activityRow(overrides = {}) {
  return Object.fromEntries(
    REDDIT_ACTIVITY_HEADERS.map((header) => [header, overrides[header] ?? ""]),
  );
}

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "framer-reddit-smoke-"));
  try {
    const config = await readJson(path.join(ROOT, "tools/lead-finder/reddit-pilot-config.json"));
    config.pilot.public_health_max_age_hours = 9999999;
    const configFile = path.join(directory, "config.json");
    const ledgerFile = path.join(directory, "activity.csv");
    const publicHealthFile = path.join(directory, "public-health.json");
    const marketplaceFile = path.join(directory, "marketplace.csv");
    await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await writeFile(
      publicHealthFile,
      `${JSON.stringify({
        generated_at: new Date().toISOString(),
        profiles: Object.values(config.plugins).map((plugin) => ({
          id: plugin.public_health_id,
          status: "ready_for_small_tracked_experiment",
          blockers: [],
          next_action: "fixture ready",
        })),
      }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      marketplaceFile,
      [
        "date,slug,ok,url",
        "2026-07-24,polyglot-aeo,true,https://www.framer.com/community/marketplace/plugins/polyglot-aeo/",
      ].join("\n") + "\n",
      "utf8",
    );

    const rows = [
      activityRow({
        date: "2026-07-24",
        timestamp: "2026-07-24T00:00:00.000Z",
        event_type: "profile",
        status: "done",
        url: "https://www.reddit.com/user/example/",
        evidence: "profile-proof.png",
      }),
      activityRow({
        date: "2026-07-24",
        timestamp: "2026-07-24T00:01:00.000Z",
        event_type: "rules_check",
        subreddit: "nocode",
        status: "done",
        evidence: "https://www.reddit.com/r/nocode/",
      }),
      activityRow({
        date: "2026-07-24",
        timestamp: "2026-07-24T00:02:00.000Z",
        event_type: "rules_check",
        subreddit: "framer",
        status: "done",
        evidence: "https://www.reddit.com/r/framer/",
      }),
    ];
    for (let index = 0; index < 9; index += 1) {
      rows.push(activityRow({
        date: `2026-07-${String(15 + index).padStart(2, "0")}`,
        timestamp: `2026-07-${String(15 + index).padStart(2, "0")}T09:00:00.000Z`,
        event_type: "contribution",
        subreddit: index % 2 ? "nocode" : "framer",
        status: "done",
        promotional: "false",
        topic: `fixture contribution ${index + 1}`,
        url: `https://www.reddit.com/r/framer/comments/fixture-${index + 1}/`,
      }));
    }
    await writeRows(ledgerFile, rows);

    const preflightJson = path.join(directory, "preflight.json");
    await run("tools/lead-finder/lead-reddit-preflight.mjs", [
      "--config", configFile,
      "--ledger", ledgerFile,
      "--public-health", publicHealthFile,
      "--marketplace-history", marketplaceFile,
      "--plugin", "polyglot-aeo",
      "--subreddit", "nocode",
      "--today", "2026-07-24",
      "--output", path.join(directory, "preflight.md"),
      "--json", preflightJson,
    ]);
    assert.equal((await readJson(preflightJson)).decision, "ready_manual_publish");

    const blockedJson = path.join(directory, "framer-blocked.json");
    await run("tools/lead-finder/lead-reddit-preflight.mjs", [
      "--config", configFile,
      "--ledger", ledgerFile,
      "--public-health", publicHealthFile,
      "--marketplace-history", marketplaceFile,
      "--plugin", "polyglot-aeo",
      "--subreddit", "framer",
      "--today", "2026-07-24",
      "--output", path.join(directory, "framer-blocked.md"),
      "--json", blockedJson,
    ]);
    assert.equal((await readJson(blockedJson)).decision, "blocked");

    rows.push(activityRow({
      date: "2026-07-24",
      timestamp: "2026-07-24T00:03:00.000Z",
      event_type: "modmail",
      subreddit: "framer",
      status: "approved",
      evidence: "moderator-approval.png",
    }));
    await writeRows(ledgerFile, rows);
    const approvedJson = path.join(directory, "framer-approved.json");
    await run("tools/lead-finder/lead-reddit-preflight.mjs", [
      "--config", configFile,
      "--ledger", ledgerFile,
      "--public-health", publicHealthFile,
      "--marketplace-history", marketplaceFile,
      "--plugin", "polyglot-aeo",
      "--subreddit", "framer",
      "--today", "2026-07-24",
      "--output", path.join(directory, "framer-approved.md"),
      "--json", approvedJson,
    ]);
    const approved = await readJson(approvedJson);
    assert.equal(
      approved.decision,
      "ready_manual_publish",
      JSON.stringify(approved.gates.filter((item) => !item.pass), null, 2),
    );

    rows.push(
      activityRow({
        date: "2026-07-24",
        timestamp: "2026-07-24T10:00:00.000Z",
        event_type: "post",
        subreddit: "nocode",
        plugin: "polyglot-aeo",
        campaign: config.plugins["polyglot-aeo"].campaign,
        status: "done",
        post_id: "polyglot-fixture",
        promotional: "true",
        disclosed: "true",
      }),
      activityRow({
        date: "2026-07-31",
        timestamp: "2026-07-31T10:00:00.000Z",
        event_type: "snapshot",
        subreddit: "nocode",
        plugin: "polyglot-aeo",
        campaign: config.plugins["polyglot-aeo"].campaign,
        status: "observation",
        post_id: "polyglot-fixture",
        review_window: "7d",
        installs: "5",
        activations: "2",
      }),
      activityRow({
        date: "2026-08-07",
        timestamp: "2026-08-07T10:00:00.000Z",
        event_type: "post",
        subreddit: "nocode",
        plugin: "ally-auditor",
        campaign: config.plugins["ally-auditor"].campaign,
        status: "done",
        post_id: "ally-fixture",
        promotional: "true",
        disclosed: "true",
      }),
      activityRow({
        date: "2026-08-14",
        timestamp: "2026-08-14T10:00:00.000Z",
        event_type: "snapshot",
        subreddit: "nocode",
        plugin: "ally-auditor",
        campaign: config.plugins["ally-auditor"].campaign,
        status: "observation",
        post_id: "ally-fixture",
        review_window: "7d",
        installs: "5",
        activations: "2",
      }),
    );
    for (let index = 0; index < 5; index += 1) {
      rows.push(activityRow({
        date: "2026-08-14",
        timestamp: `2026-08-14T11:0${index}:00.000Z`,
        event_type: "insight",
        subreddit: "nocode",
        plugin: index < 3 ? "polyglot-aeo" : "ally-auditor",
        campaign: index < 3 ? config.plugins["polyglot-aeo"].campaign : config.plugins["ally-auditor"].campaign,
        status: "done",
        topic: `fixture insight ${index + 1}`,
      }));
    }
    await writeRows(ledgerFile, rows);
    const reviewJson = path.join(directory, "review.json");
    await run("tools/lead-finder/lead-reddit-review.mjs", [
      "--config", configFile,
      "--ledger", ledgerFile,
      "--public-health", publicHealthFile,
      "--today", "2026-08-21",
      "--output", path.join(directory, "review.md"),
      "--json", reviewJson,
    ]);
    const review = await readJson(reviewJson);
    assert.equal(review.review.decision, "scale_next_cycle");
    assert.equal(review.review.totals.installs, 10);
    assert.equal(review.review.totals.activations, 4);
    assert.equal(review.loka.eligible, true);

    const activityLedger = path.join(directory, "activity-command.csv");
    const activityArgs = [
      "--config", configFile,
      "--ledger", activityLedger,
      "--output", path.join(directory, "activity-command.md"),
      "--json", path.join(directory, "activity-command.json"),
      "--init",
      "--add",
      "--event", "contribution",
      "--subreddit", "framer",
      "--url", "https://www.reddit.com/r/framer/comments/fixture/",
      "--topic", "Specific fixture answer",
      "--date", "2026-07-10",
      "--timestamp", "2026-07-10T10:00:00.000Z",
    ];
    await run("tools/lead-finder/lead-reddit-activity.mjs", activityArgs);
    const duplicate = await run("tools/lead-finder/lead-reddit-activity.mjs", activityArgs, true);
    assert.notEqual(duplicate.code, 0);
    assert.match(String(duplicate.stderr), /already exists/);

    const written = await readFile(activityLedger, "utf8");
    assert.match(written, /Specific fixture answer/);
    process.stdout.write("Reddit pilot smoke: PASS\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
