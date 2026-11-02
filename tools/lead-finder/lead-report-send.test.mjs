import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildResendPayload,
  executePreparedBatch,
  prepareReportBatch,
} from "./lead-report-send.mjs";
import { refreshDueAudits } from "./lead-report-refresh.mjs";

function reportBody(domain, postalAddress) {
  return `Hi ${domain} team,

PUBLIC FRAMER READINESS · NEEDS ATTENTION · 62/100

1. Locale discovery · fail · high confidence · 2026-07-13
Observed: missing reciprocal hreflang Impact: locale discovery is ambiguous Fix: add reciprocal tags
Evidence: https://${domain}/
2. Canonical · warning · high confidence · 2026-07-13
Observed: locale canonical points home Impact: locale may consolidate Fix: self-canonicalize
Evidence: https://${domain}/de
3. Metadata · warning · high confidence · 2026-07-13
Observed: descriptions repeat Impact: locale result is unclear Fix: localize descriptions
Evidence: https://${domain}/fr

Public pages only—no Framer project or private CMS access. I ran it with Polyglot AEO, the Framer QA plugin I'm building.

Reply “fix” for the smallest Framer-side fix to item #1—no call.

Best,
Jimmy

Polyglot AEO · one-to-one business outreach
${postalAddress}
Reply “no” to opt out.`;
}

function fixture() {
  const postalAddress = "123 Example Street, Example City";
  const domains = ["acme.com", "beta.com"];
  const audits = domains.map((domain, index) => ({
    domain,
    score: 62,
    rating: "Needs attention",
    checked_at: "2026-07-13T02:00:00.000Z",
    audit_version: "public-v1",
    source_row: {
      domain,
      contact_email: `hello@${domain}`,
      contact_url: `mailto:hello@${domain}`,
      subject: `3 public Framer checks for ${domain}`,
      email_body: reportBody(domain, postalAddress),
      next_followup: "2026-07-13",
      scheduled_order: `2026-07-13-${index + 1}`,
      send_ready: "true",
      send_blockers: [],
      report_campaign: "report-first-v1",
      report_cohort: index === 0 ? "old" : "new",
    },
  }));
  const crmRows = domains.map((domain) => ({
    domain,
    status: "report_ready",
    contact_url: `mailto:hello@${domain}`,
  }));
  const preflight = {
    status: "pass",
    valid_until: "2026-07-14T03:00:00.000Z",
    checks: [
      "sender_identity",
      "postal_address",
      "spf",
      "dmarc",
      "dkim",
      "pilot_present",
      "pilot_company_contacts",
      "suppression",
      "pilot_report_ready",
    ].map((id) => ({ id, status: "pass" })),
  };
  const review = {
    campaign: "report-first-v1",
    date: "2026-07-13",
    reviewed_at: "2026-07-13T03:00:00.000Z",
    reviews: domains.map((domain) => ({
      domain,
      approved: true,
      brand_confirmed: true,
      contact_confirmed: true,
      evidence_urls_confirmed: 3,
      current_site_confirmed: true,
      suppression_confirmed: true,
      unsubscribe_confirmed: true,
    })),
  };
  const args = {
    date: "2026-07-13",
    expectedCount: 2,
    scheduleAt: "2026-07-13T08:30:00.000Z",
    spacingMinutes: 17,
    senderEmail: "jimmy@polyglotaeo.com",
    senderName: "Polyglot AEO",
    execute: true,
    crm: "unused.csv",
  };
  return { postalAddress, audits, crmRows, preflight, review, args };
}

test("report sender requires current per-contact review and builds text-only Resend payloads", () => {
  const data = fixture();
  process.env.SENDER_POSTAL_ADDRESS = data.postalAddress;
  const prepared = prepareReportBatch({
    bundle: { campaign: "report-first-v1", audits: data.audits },
    crmRows: data.crmRows,
    preflight: data.preflight,
    review: data.review,
    ledger: { entries: [] },
    args: data.args,
    now: new Date("2026-07-13T04:00:00.000Z"),
  });
  assert.equal(prepared.length, 2);
  assert.equal(prepared[0].scheduled_at, "2026-07-13T08:30:00.000Z");
  assert.equal(prepared[1].scheduled_at, "2026-07-13T08:47:00.000Z");
  const payload = buildResendPayload(prepared[0], data.args);
  assert.equal(payload.text, data.audits[0].source_row.email_body);
  assert.equal(payload.html, undefined);
  assert.equal(payload.attachments, undefined);
  assert.equal(payload.to.length, 1);
  assert.match(payload.headers["List-Unsubscribe"], /^<mailto:/);
  assert.equal(payload.scheduled_at, "2026-07-13T08:30:00.000Z");

  const invalidReview = structuredClone(data.review);
  invalidReview.reviews[0].suppression_confirmed = false;
  assert.throws(
    () => prepareReportBatch({
      bundle: { campaign: "report-first-v1", audits: data.audits },
      crmRows: data.crmRows,
      preflight: data.preflight,
      review: invalidReview,
      ledger: { entries: [] },
      args: data.args,
      now: new Date("2026-07-13T04:00:00.000Z"),
    }),
    /suppression_confirmed/,
  );
});

test("report sender uses idempotency headers, records each acceptance, and updates CRM", async () => {
  const data = fixture();
  process.env.SENDER_POSTAL_ADDRESS = data.postalAddress;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "polyglot-resend-"));
  data.args.ledger = path.join(tempDir, "ledger.json");
  const prepared = prepareReportBatch({
    bundle: { campaign: "report-first-v1", audits: data.audits },
    crmRows: data.crmRows,
    preflight: data.preflight,
    review: data.review,
    ledger: { entries: [] },
    args: data.args,
    now: new Date("2026-07-13T04:00:00.000Z"),
  });
  const requests = [];
  const crmUpdates = [];
  const results = await executePreparedBatch(prepared, data.args, {
    apiKey: "re_abcdefghijklmnopqrstuvwxyz123456",
    fetchImpl: async (url, request) => {
      requests.push({ url, request, payload: JSON.parse(request.body) });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ id: `email-${requests.length}` });
        },
      };
    },
    updateCrm: async (row, id) => crmUpdates.push({ domain: row.row.domain, id }),
  });
  assert.equal(results.length, 2);
  assert.equal(crmUpdates.length, 2);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.match(requests[0].request.headers["Idempotency-Key"], /^report-first-v1\/2026-07-13\//);
  assert.equal(requests[0].payload.html, undefined);
  assert.equal(requests[0].payload.attachments, undefined);
  const ledger = JSON.parse(await readFile(data.args.ledger, "utf8"));
  assert.equal(ledger.entries.length, 2);
  assert.ok(ledger.entries.every((entry) => entry.crm_updated === true));

  await assert.rejects(
    executePreparedBatch(prepared, data.args, {
      apiKey: "re_abcdefghijklmnopqrstuvwxyz123456",
      fetchImpl: async () => {
        throw new Error("should not call Resend twice");
      },
      updateCrm: async () => {},
    }),
    /already exists in the Resend ledger/,
  );
});

test("daily refresh keeps the fixed cohort and updates only the requested date", async () => {
  const postalAddress = "123 Example Street, Example City";
  const sourceRow = {
    domain: "acme.com",
    final_url: "https://acme.com/",
    contact_email: "hello@acme.com",
    contact_url: "mailto:hello@acme.com",
    next_followup: "2026-07-14",
    scheduled_order: "2026-07-14-1",
    report_campaign: "report-first-v1",
    report_cohort: "new",
    status: "report_ready",
  };
  const oldDueAudit = { domain: "acme.com", requested_url: "https://acme.com/", source_row: sourceRow };
  const untouched = {
    domain: "later.com",
    requested_url: "https://later.com/",
    source_row: { domain: "later.com", next_followup: "2026-07-15" },
  };
  const freshAudit = {
    audit_version: "public-framer-v1",
    checked_at: "2026-07-14T02:00:00.000Z",
    domain: "acme.com",
    requested_url: "https://acme.com/",
    final_url: "https://acme.com/",
    score: 62,
    rating: "Needs attention",
    coverage_pct: 100,
    locales_checked: ["en", "de"],
    pages_checked: [
      { url: "https://acme.com/", status: 200, expected_locale: "en" },
      { url: "https://acme.com/de/", status: 200, expected_locale: "de" },
    ],
    dimensions: [
      { id: "crawl", earned_points: 25, max_points: 25 },
      { id: "localization", earned_points: 15, max_points: 30 },
      { id: "structured_data", earned_points: 12.5, max_points: 25 },
      { id: "metadata", earned_points: 10, max_points: 20 },
    ],
    checks: [
      { id: "locale", label: "Locale discovery", status: "fail", confidence: "high", max_points: 10, observed: "Missing locale links", impact: "Discovery is ambiguous", first_fix: "Add locale links", evidence_url: "https://acme.com/", dimension: "localization" },
      { id: "schema", label: "Localized schema", status: "warning", confidence: "high", max_points: 10, observed: "Missing inLanguage", impact: "Schema language is unclear", first_fix: "Add inLanguage", evidence_url: "https://acme.com/de/", dimension: "structured_data" },
      { id: "canonical", label: "Canonical URLs", status: "pass", confidence: "high", max_points: 10, observed: "Self canonicals found", impact: "Canonical mapping is clear", first_fix: "Keep current mapping", evidence_url: "https://acme.com/", dimension: "crawl" },
    ],
    findings: [
      { id: "locale", status: "fail", severity: "high", confidence: "high", observed: "Missing locale links", impact: "Discovery is ambiguous", first_fix: "Add locale links", evidence_url: "https://acme.com/", dimension: "localization" },
      { id: "schema", status: "warning", severity: "medium", confidence: "high", observed: "Missing inLanguage", impact: "Schema language is unclear", first_fix: "Add inLanguage", evidence_url: "https://acme.com/de/", dimension: "structured_data" },
    ],
  };
  const result = await refreshDueAudits(
    { campaign: "report-first-v1", audits: [oldDueAudit, untouched] },
    {
      date: "2026-07-14",
      timeoutMs: 100,
      retries: 0,
      maxPages: 4,
      senderName: "Jimmy",
      postalAddress,
    },
    { auditFn: async () => freshAudit },
  );
  assert.equal(result.refreshed.length, 1);
  assert.equal(result.bundle.audits.length, 2);
  assert.equal(result.bundle.audits[1], untouched);
  assert.equal(result.refreshed[0].source_row.domain, "acme.com");
  assert.equal(result.refreshed[0].source_row.send_ready, "true");
  assert.match(result.refreshed[0].source_row.email_body, /3\. Canonical URLs/);
  assert.match(result.refreshed[0].source_row.email_body, /123 Example Street/);
});
