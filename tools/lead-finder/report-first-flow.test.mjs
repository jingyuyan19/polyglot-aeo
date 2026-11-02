import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { auditPublicSite, renderReportFirstEmail } from "./public-audit-lib.mjs";
import { scheduleCohorts } from "./lead-report-pilot.mjs";

const execFileAsync = promisify(execFile);
const toolDir = path.dirname(new URL(import.meta.url).pathname);

test("an approved 1-old/9-new pilot stays at two contacts across five business days", () => {
  const oldRows = [{ cohort: "old", source: { domain: "old.example" } }];
  const newRows = Array.from({ length: 9 }, (_, index) => ({
    cohort: "new",
    source: { domain: `new-${index + 1}.example` },
  }));
  const schedule = scheduleCohorts(oldRows, newRows, {
    startDate: "2026-07-12",
    seed: "report-first-v1",
  });

  assert.deepEqual(
    schedule.map((day) => [day.date, day.entries.length]),
    [
      ["2026-07-13", 2],
      ["2026-07-14", 2],
      ["2026-07-15", 2],
      ["2026-07-16", 2],
      ["2026-07-17", 2],
    ],
  );
  assert.equal(schedule.flatMap((day) => day.entries).length, 10);
  assert.deepEqual(
    schedule[0].entries.map((entry) => entry.cohort).sort(),
    ["new", "old"],
  );
  assert.ok(schedule.slice(1).every((day) => day.entries.every((entry) => entry.cohort === "new")));
});

function response(url, status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    async text() {
      return body;
    },
  };
}

function fixtureFetch(routes) {
  return async (rawUrl) => {
    const url = new URL(rawUrl).href;
    const route = routes[url];
    return route ? response(url, route.status ?? 200, route.body ?? "") : response(url, 404, "not found");
  };
}

async function brokenAudit() {
  const root = `<!doctype html><html lang="en"><head>
    <title>Acme English</title><meta name="description" content="Same description">
    <link rel="canonical" href="https://acme.example/">
    <link rel="alternate" hreflang="en" href="https://acme.example/">
    <link rel="alternate" hreflang="fr" href="https://acme.example/fr/">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","inLanguage":"en"}</script>
  </head><body><a href="/fr/">French</a></body></html>`;
  const locale = `<!doctype html><html lang="en"><head>
    <title>Acme English</title><meta name="description" content="Same description">
    <link rel="canonical" href="https://acme.example/">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","inLanguage":"en"}</script>
  </head><body>French page</body></html>`;
  return auditPublicSite("https://acme.example/", {
    fetchImpl: fixtureFetch({
      "https://acme.example/": { body: root },
      "https://acme.example/fr/": { body: locale },
      "https://acme.example/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://acme.example/llms.txt": { status: 404 },
    }),
    retries: 0,
    checkedAt: "2026-07-12T00:00:00.000Z",
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

test("sendpack renders the report inline and CRM preserves separate audit fields", async () => {
  const audit = await brokenAudit();
  const email = renderReportFirstEmail(
    audit,
    { brand: "Acme", contact_email: "hello@acme.example" },
    { postalAddress: "123 Example Street, Example City" },
  );
  assert.deepEqual(email.blockers, []);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "polyglot-report-flow-"));
  const crm = path.join(tempDir, "crm.csv");
  const audits = path.join(tempDir, "audits.json");
  const output = path.join(tempDir, "sendpack.md");
  const html = path.join(tempDir, "sendpack.html");
  const outDir = path.join(tempDir, "drafts");
  const markSent = path.join(tempDir, "mark-sent.sh");
  const due = path.join(tempDir, "due.md");
  const senderPreflight = path.join(tempDir, "sender-preflight.json");
  const gmailOutput = path.join(tempDir, "gmail-queue.md");
  const gmailJson = path.join(tempDir, "gmail-queue.json");
  const monitorOutput = path.join(tempDir, "monitor.md");
  const columns = [
    "domain", "final_url", "locales", "score", "audit_score", "audit_rating", "audit_checked_at",
    "audit_version", "report_campaign", "report_cohort", "contact_url", "contact_channel", "status",
    "source", "issue_1", "issue_2", "issue_3", "subject", "email_body", "contact_form_body", "manual_check",
    "created_at", "last_touch", "next_action", "next_followup", "sent_count", "reply_notes", "deal_value_usd",
    "revenue_path",
  ];
  const row = {
    domain: audit.domain,
    final_url: audit.final_url,
    locales: "en|fr",
    score: "90",
    audit_score: audit.score,
    audit_rating: audit.rating,
    audit_checked_at: audit.checked_at,
    audit_version: audit.audit_version,
    report_campaign: "report-first-v1",
    report_cohort: "new",
    contact_url: "mailto:hello@acme.example",
    contact_channel: "email",
    status: "report_ready",
    created_at: "2026-07-12",
    next_action: "manual_review_inline_report",
    next_followup: "2026-07-13",
    sent_count: "0",
  };
  await writeFile(
    crm,
    `${columns.join(",")}\n${columns.map((column) => csvEscape(row[column])).join(",")}\n`,
    "utf8",
  );
  await writeFile(audits, `${JSON.stringify({ audits: [audit] }, null, 2)}\n`, "utf8");
  await writeFile(
    senderPreflight,
    `${JSON.stringify({ status: "pass", valid_until: "2099-01-01T00:00:00.000Z" })}\n`,
    "utf8",
  );

  await execFileAsync(process.execPath, [
    path.join(toolDir, "lead-sendpack.mjs"),
    "--crm", crm,
    "--status", "report_ready",
    "--variant", "report-first-v1",
    "--audits", audits,
    "--sender-preflight", senderPreflight,
    "--postal-address", "123 Example Street, Example City",
    "--verify", path.join(tempDir, "missing-verification.md"),
    "--output", output,
    "--html", html,
    "--out-dir", outDir,
    "--mark-sent", markSent,
  ]);

  const markdown = await readFile(output, "utf8");
  const eml = await readFile(path.join(outDir, "acme-example.eml"), "utf8");
  const manifest = JSON.parse(await readFile(path.join(outDir, ".sendpack-manifest.json"), "utf8"));
  assert.match(markdown, /PUBLIC FRAMER READINESS/);
  assert.match(markdown, /Never attach this pack/);
  assert.match(eml, /Content-Type: text\/plain/);
  assert.doesNotMatch(eml, /Content-Disposition|multipart\/mixed|attachment/i);
  assert.deepEqual(manifest.attachments, []);
  assert.equal(manifest.inline_report_only, true);

  await execFileAsync(process.execPath, [
    path.join(toolDir, "lead-gmail-queue.mjs"),
    "--crm", crm,
    "--status", "report_ready",
    "--sendpack-dir", outDir,
    "--output", gmailOutput,
    "--json", gmailJson,
  ]);
  const gmailQueue = JSON.parse(await readFile(gmailJson, "utf8"));
  assert.equal(gmailQueue.next_status, "report_sent");
  assert.equal(gmailQueue.queue.length, 1);
  assert.match(gmailQueue.queue[0].crm_update_after_sent, /--set-status report_sent/);
  assert.doesNotMatch(gmailQueue.queue[0].crm_update_after_sent, /sent_day_0/);

  await execFileAsync(process.execPath, [
    path.join(toolDir, "lead-crm.mjs"),
    "--crm", crm,
    "--due-md", due,
    "--domain", audit.domain,
    "--set-status", "report_sent",
    "--audit-score", String(audit.score),
    "--audit-rating", audit.rating,
    "--audit-checked-at", audit.checked_at,
    "--audit-version", audit.audit_version,
    "--report-campaign", "report-first-v1",
    "--report-cohort", "new",
    "--today", "2026-07-12",
  ]);
  const updated = await readFile(crm, "utf8");
  assert.match(updated.split("\n")[0], /score,audit_score,audit_rating/);
  assert.match(updated, /report_sent/);
  assert.match(updated, /report-first-v1/);
  assert.match(updated, /review_report_reply_24h_no_followup/);

  await execFileAsync(process.execPath, [
    path.join(toolDir, "lead-monitor.mjs"),
    "--crm", crm,
    "--revenue", path.join(tempDir, "missing-revenue.csv"),
    "--output", monitorOutput,
    "--today", "2026-07-13",
  ]);
  const monitor = await readFile(monitorOutput, "utf8");
  assert.match(monitor, /Report-First Observation/);
  assert.match(monitor, /pnpm lead:report-review/);
  assert.doesNotMatch(monitor, /lead:sendpack -- --status report_sent/);
});

test("report-first sendpack refuses to render without a postal address", async () => {
  const audit = await brokenAudit();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "polyglot-report-block-"));
  const crm = path.join(tempDir, "crm.csv");
  const audits = path.join(tempDir, "audits.json");
  await writeFile(
    crm,
    `domain,final_url,locales,score,contact_url,contact_channel,status,source,issue_1,issue_2,issue_3,subject,email_body,contact_form_body,manual_check,created_at,last_touch,next_action,next_followup,sent_count,reply_notes,deal_value_usd,revenue_path\n${audit.domain},${audit.final_url},en|fr,90,mailto:hello@acme.example,email,report_ready,test,,,,,,,,2026-07-12,,manual_review_inline_report,2026-07-13,0,,,\n`,
    "utf8",
  );
  await writeFile(audits, `${JSON.stringify({ audits: [audit] })}\n`, "utf8");
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(toolDir, "lead-sendpack.mjs"),
      "--crm", crm,
      "--status", "report_ready",
      "--variant", "report-first-v1",
      "--audits", audits,
      "--output", path.join(tempDir, "sendpack.md"),
      "--html", path.join(tempDir, "sendpack.html"),
      "--out-dir", path.join(tempDir, "drafts"),
      "--mark-sent", path.join(tempDir, "mark-sent.sh"),
    ], {
      env: { ...process.env, SENDER_POSTAL_ADDRESS: "" },
    }),
    /SENDER_POSTAL_ADDRESS/,
  );
});
