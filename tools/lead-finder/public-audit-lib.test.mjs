import assert from "node:assert/strict";
import test from "node:test";

import {
  auditPublicSite,
  emailMatchesSiteDomain,
  isCompanyDomainEmail,
  isOutreachMailbox,
  isPublicAuditUrl,
  renderReportFirstEmail,
  scorePublicAuditChecks,
} from "./public-audit-lib.mjs";

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
    if (!route) return response(url, 404, "not found");
    return response(route.finalUrl || url, route.status ?? 200, route.body ?? "");
  };
}

const enHtml = `<!doctype html>
<html lang="en"><head>
<title>Acme — English</title><meta name="description" content="English description">
<link rel="canonical" href="https://acme.example/">
<link rel="alternate" hreflang="en" href="https://acme.example/">
<link rel="alternate" hreflang="fr" href="https://acme.example/fr/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","inLanguage":"en"}</script>
</head><body><a href="/fr/">Français</a></body></html>`;

const frHtml = `<!doctype html>
<html lang="fr"><head>
<title>Acme — Français</title><meta name="description" content="Description française">
<link rel="canonical" href="https://acme.example/fr/">
<link rel="alternate" hreflang="en" href="https://acme.example/">
<link rel="alternate" hreflang="fr" href="https://acme.example/fr/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme France","inLanguage":"fr"}</script>
</head><body>Bonjour</body></html>`;

test("public URL and company-email guards reject local and free-provider targets", () => {
  assert.equal(isPublicAuditUrl("https://example.com"), true);
  assert.equal(isPublicAuditUrl("http://127.0.0.1"), false);
  assert.equal(isPublicAuditUrl("http://192.168.1.4"), false);
  assert.equal(isCompanyDomainEmail("mailto:qa@acme.example"), true);
  assert.equal(isCompanyDomainEmail("person@gmail.com"), false);
  assert.equal(emailMatchesSiteDomain("hello@acme.example", "https://www.acme.example/fr/"), true);
  assert.equal(emailMatchesSiteDomain("builder@agency.example", "https://acme.example"), false);
  assert.equal(isOutreachMailbox("hello@acme.example"), true);
  assert.equal(isOutreachMailbox("support@acme.example"), false);
  assert.equal(isOutreachMailbox("suporte@acme.example"), false);
});

test("transparent score excludes unknown checks and withholds low-coverage totals", () => {
  const checks = [
    { dimension: "crawl", status: "pass", max_points: 8 },
    { dimension: "crawl", status: "warning", max_points: 7 },
    { dimension: "crawl", status: "not_observed", max_points: 6 },
    { dimension: "crawl", status: "not_observed", max_points: 4 },
    { dimension: "localization", status: "not_observed", max_points: 8 },
    { dimension: "localization", status: "not_observed", max_points: 7 },
    { dimension: "localization", status: "not_observed", max_points: 7 },
    { dimension: "localization", status: "not_observed", max_points: 8 },
    { dimension: "structured_data", status: "not_observed", max_points: 9 },
    { dimension: "structured_data", status: "not_observed", max_points: 6 },
    { dimension: "structured_data", status: "not_observed", max_points: 10 },
    { dimension: "metadata", status: "not_observed", max_points: 6 },
    { dimension: "metadata", status: "not_observed", max_points: 6 },
    { dimension: "metadata", status: "not_observed", max_points: 4 },
    { dimension: "metadata", status: "not_observed", max_points: 4 },
  ];
  const result = scorePublicAuditChecks(checks);
  assert.equal(result.coverage_pct, 15);
  assert.equal(result.score, null);
  assert.equal(result.rating, "Evidence incomplete");
});

test("complete multilingual fixture earns a high score and llms.txt never affects it", async () => {
  const baseRoutes = {
    "https://acme.example/": { body: enHtml },
    "https://acme.example/fr/": { body: frHtml },
    "https://acme.example/robots.txt": { body: "User-agent: *\nDisallow:" },
    "https://acme.example/llms.txt": { status: 404, body: "not found" },
  };
  const withoutLlms = await auditPublicSite("https://acme.example/", {
    fetchImpl: fixtureFetch(baseRoutes),
    retries: 0,
    checkedAt: "2026-07-12T00:00:00.000Z",
  });
  const withLlms = await auditPublicSite("https://acme.example/", {
    fetchImpl: fixtureFetch({
      ...baseRoutes,
      "https://acme.example/llms.txt": { body: "# Acme\n\nA sufficiently long optional agent handoff file." },
    }),
    retries: 0,
    checkedAt: "2026-07-12T00:00:00.000Z",
  });

  assert.ok(withoutLlms.score >= 80);
  assert.equal(withoutLlms.rating, "Strong");
  assert.equal(withoutLlms.score, withLlms.score);
  const observedDimensions = withoutLlms.dimensions.filter((dimension) => dimension.earned_points !== null);
  assert.equal(
    withoutLlms.score,
    Math.round(
      (observedDimensions.reduce((sum, dimension) => sum + dimension.earned_points, 0) /
        observedDimensions.reduce((sum, dimension) => sum + dimension.max_points, 0)) *
        100,
    ),
  );
  assert.equal(withoutLlms.optional_signals.llms_txt.scored, false);
  assert.equal(withoutLlms.checks.some((check) => check.id.includes("llms")), false);
});

test("a missing canonical remains missing instead of becoming an /undefined URL", async () => {
  const audit = await auditPublicSite("https://single.example/", {
    fetchImpl: fixtureFetch({
      "https://single.example/": {
        body: '<!doctype html><html lang="en"><head><title>Single</title><meta name="description" content="Single description"></head><body>Single</body></html>',
      },
      "https://single.example/robots.txt": { status: 404 },
      "https://single.example/llms.txt": { status: 404 },
    }),
    retries: 0,
    checkedAt: "2026-07-12T00:00:00.000Z",
  });
  assert.equal(audit.pages_checked[0].canonical, "");
  const canonical = audit.checks.find((check) => check.id === "canonical");
  assert.equal(canonical.status, "warning");
  assert.doesNotMatch(canonical.evidence_url, /undefined/);
  assert.equal(audit.checks.find((check) => check.id === "http_status").status, "pass");
});

test("locale candidates that redirect to the same final URL are sampled once", async () => {
  const root = `<!doctype html><html lang="en"><head><title>Redirect EN</title>
    <meta name="description" content="English description">
    <link rel="canonical" href="https://redirect.example/">
    <link rel="alternate" hreflang="en" href="https://redirect.example/en/">
    <link rel="alternate" hreflang="fr" href="https://redirect.example/fr/">
  </head></html>`;
  const french = `<!doctype html><html lang="fr"><head><title>Redirect FR</title>
    <meta name="description" content="Description française">
    <link rel="canonical" href="https://redirect.example/fr/">
  </head></html>`;
  const audit = await auditPublicSite("https://redirect.example/", {
    fetchImpl: fixtureFetch({
      "https://redirect.example/": { body: root },
      "https://redirect.example/en/": { body: root, finalUrl: "https://redirect.example/" },
      "https://redirect.example/fr/": { body: french },
      "https://redirect.example/robots.txt": { status: 404 },
      "https://redirect.example/llms.txt": { status: 404 },
    }),
    retries: 0,
  });
  assert.equal(audit.pages_checked.length, 2);
  assert.deepEqual(audit.pages_checked.map((page) => page.url), [
    "https://redirect.example/",
    "https://redirect.example/fr/",
  ]);
});

test("broken locale fixture exposes canonical, hreflang, metadata, and schema evidence", async () => {
  const brokenFr = frHtml
    .replace('lang="fr"', 'lang="en"')
    .replace("Acme — Français", "Acme — English")
    .replace("Description française", "English description")
    .replace('href="https://acme.example/fr/"', 'href="https://acme.example/"')
    .replace(/<link rel="alternate"[\s\S]*?<script/, "<script")
    .replace('"inLanguage":"fr"', '"inLanguage":"en"');
  const audit = await auditPublicSite("https://acme.example/", {
    fetchImpl: fixtureFetch({
      "https://acme.example/": { body: enHtml },
      "https://acme.example/fr/": { body: brokenFr },
      "https://acme.example/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://acme.example/llms.txt": { status: 404 },
    }),
    retries: 0,
    checkedAt: "2026-07-12T00:00:00.000Z",
  });
  const ids = new Set(audit.checks.filter((check) => check.status === "fail").map((check) => check.id));
  assert.equal(ids.has("canonical"), true);
  assert.equal(ids.has("html_lang"), true);
  assert.equal(ids.has("titles_unique"), true);
  assert.equal(ids.has("descriptions_unique"), true);
  assert.equal(ids.has("jsonld_language"), true);
  assert.equal(audit.checks.find((check) => check.id === "hreflang_reciprocal").status, "warning");
  assert.equal(audit.findings.length, 3);
  assert.ok(audit.findings.every((finding) => finding.evidence_url && finding.checked_at));
});

test("noindex and invalid JSON-LD are scored as observable failures", async () => {
  const invalidRoot = enHtml
    .replace("<html lang=\"en\">", '<html lang="en"><head><meta name="robots" content="noindex">')
    .replace("<head>", "")
    .replace(
      '{"@context":"https://schema.org","@type":"Organization","name":"Acme","inLanguage":"en"}',
      '{"@context":"https://schema.org",',
    );
  const invalidFr = frHtml.replace(
    '{"@context":"https://schema.org","@type":"Organization","name":"Acme France","inLanguage":"fr"}',
    '{"@context":"https://schema.org",',
  );
  const audit = await auditPublicSite("https://acme.example/", {
    fetchImpl: fixtureFetch({
      "https://acme.example/": { body: invalidRoot },
      "https://acme.example/fr/": { body: invalidFr },
      "https://acme.example/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://acme.example/llms.txt": { status: 404 },
    }),
    retries: 0,
    checkedAt: "2026-07-12T00:00:00.000Z",
  });
  assert.equal(audit.checks.find((check) => check.id === "indexability").status, "fail");
  assert.equal(audit.checks.find((check) => check.id === "jsonld_parseable").status, "fail");
});

test("timeouts produce status-zero evidence and withhold a low-coverage score", async () => {
  const timeoutFetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("timed out");
        error.name = "AbortError";
        reject(error);
      });
    });
  const audit = await auditPublicSite("https://timeout.example/", {
    fetchImpl: timeoutFetch,
    timeoutMs: 5,
    retries: 0,
    checkedAt: "2026-07-12T00:00:00.000Z",
  });
  assert.equal(audit.pages_checked[0].status, 0);
  assert.ok(audit.coverage_pct < 75);
  assert.equal(audit.score, null);
  assert.equal(audit.rating, "Evidence incomplete");
});

test("report-first email is plain, has three checks, one reply CTA, and compliance blockers", async () => {
  const brokenFr = frHtml
    .replace('lang="fr"', 'lang="en"')
    .replace("Acme — Français", "Acme — English")
    .replace("Description française", "English description")
    .replace('href="https://acme.example/fr/"', 'href="https://acme.example/"')
    .replace(/<link rel="alternate"[\s\S]*?<script/, "<script")
    .replace('"inLanguage":"fr"', '"inLanguage":"en"');
  const audit = await auditPublicSite("https://acme.example/", {
    fetchImpl: fixtureFetch({
      "https://acme.example/": { body: enHtml },
      "https://acme.example/fr/": { body: brokenFr },
      "https://acme.example/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://acme.example/llms.txt": { status: 404 },
    }),
    retries: 0,
    checkedAt: "2026-07-12T00:00:00.000Z",
  });
  const email = renderReportFirstEmail(
    audit,
    { contact_email: "hello@acme.example", brand: "Acme" },
    { postalAddress: "123 Example Street, Example City", senderName: "Jimmy" },
  );
  assert.equal(email.subject, "3 public Framer checks for Acme");
  assert.equal(email.checks.length, 3);
  assert.match(email.body, /Reply “fix”/);
  assert.match(email.body, /public pages only/i);
  assert.match(email.body, /Reply “no” to opt out/);
  assert.match(email.body, /123 Example Street/);
  assert.match(email.body, /Observed:/);
  assert.match(email.body, /Impact:/);
  assert.match(email.body, /Fix:/);
  assert.match(email.body, /Evidence: https:\/\/acme\.example/);
  assert.match(email.body, /high confidence · 2026-07-12/);
  assert.doesNotMatch(email.body, /<img|tracking pixel|guarantee|rankings|citations/i);
  assert.equal((email.body.match(/polyglotaeo\.com/g) || []).length, 0);
  const wordCount = email.body.split(/\s+/).filter(Boolean).length;
  assert.ok(wordCount >= 150 && wordCount <= 230, `expected a concise inline report, got ${wordCount} words`);
  assert.deepEqual(email.blockers, []);

  const linked = renderReportFirstEmail(
    audit,
    { contact_email: "hello@acme.example", brand: "Acme" },
    {
      postalAddress: "123 Example Street, Example City",
      senderName: "Jimmy",
      includeProductLink: true,
      productUrl: "https://polyglotaeo.com/?utm_campaign=report-first-v1",
    },
  );
  assert.equal((linked.body.match(/https:\/\/polyglotaeo\.com/g) || []).length, 1);

  const blocked = renderReportFirstEmail(audit, { contact_email: "person@gmail.com" }, {});
  assert.ok(blocked.blockers.some((item) => item.includes("SENDER_POSTAL_ADDRESS")));
  assert.ok(blocked.blockers.some((item) => item.includes("company-domain")));
  const missingContact = renderReportFirstEmail(audit, {}, { postalAddress: "123 Example Street" });
  assert.ok(missingContact.blockers.some((item) => item.includes("contact is missing")));
  const supportContact = renderReportFirstEmail(
    audit,
    { contact_email: "support@acme.example" },
    { postalAddress: "123 Example Street" },
  );
  assert.ok(supportContact.blockers.some((item) => item.includes("reserved for support")));
  const builderContact = renderReportFirstEmail(
    audit,
    { contact_email: "hello@builder.example" },
    { postalAddress: "123 Example Street" },
  );
  assert.ok(builderContact.blockers.some((item) => item.includes("does not match")));
  const offlineLocaleAudit = {
    ...audit,
    pages_checked: audit.pages_checked.map((page, index) =>
      index === 0 ? page : { ...page, status: 404 }),
  };
  const offlineLocale = renderReportFirstEmail(
    offlineLocaleAudit,
    { contact_email: "hello@acme.example" },
    { postalAddress: "123 Example Street" },
  );
  assert.ok(offlineLocale.blockers.some((item) => item.includes("live locale families")));
});
