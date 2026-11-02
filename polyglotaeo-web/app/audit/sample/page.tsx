import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Sample Framer AEO mini audit",
  description:
    "See the format of a short Polyglot AEO mini audit for a multilingual Framer site.",
}

const findings = [
  {
    label: "Finding 1",
    title: "French page canonical points to the English URL",
    evidence: "https://example.com/fr",
    checked: "2026-07-12 06:00 UTC",
    confidence: "High",
    impact:
      "The localized page can be consolidated into the default URL instead of remaining a distinct language version.",
    fix: "Give the French page a self-referencing canonical URL and verify it again after publish.",
  },
  {
    label: "Finding 2",
    title: "hreflang links are only partially reciprocal",
    evidence: "https://example.com/fr",
    checked: "2026-07-12 06:00 UTC",
    confidence: "High",
    impact:
      "Google may ignore incomplete annotations when it maps equivalent language or regional pages.",
    fix: "Place the same complete, self-inclusive hreflang set on every locale page.",
  },
  {
    label: "Finding 3",
    title: "Localized JSON-LD still declares the default language",
    evidence: "https://example.com/fr",
    checked: "2026-07-12 06:00 UTC",
    confidence: "High",
    impact:
      "The structured description conflicts with the language visitors see on the localized page.",
    fix: "Set matching inLanguage values and localize schema names and descriptions for each locale.",
  },
]

const dimensions = [
  ["Crawl & indexability", "18/25"],
  ["Locale discovery", "16/30"],
  ["Structured data", "14/25"],
  ["Metadata consistency", "14/20"],
]

export default function AuditSamplePage() {
  return (
    <main>
      <section className="audit-hero sample-hero">
        <div>
          <div className="eyebrow">Sample mini audit</div>
          <h1>What the 3-point Framer AEO audit looks like.</h1>
          <p className="lead">
            This is the short format I send after checking a public multilingual
            Framer site. It focuses on launch risks that can be verified without
            private project access.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/audit/#audit-request">
              Request this for your site
            </Link>
            <Link className="button" href="/pricing/">
              See Pro workflow
            </Link>
          </div>
        </div>

        <aside className="sample-summary" aria-label="Sample audit summary">
          <div className="sample-score">
            <span>Public readiness · Needs attention</span>
            <strong>62</strong>
          </div>
          <dl>
            <div>
              <dt>Site type</dt>
              <dd>Multilingual Framer launch</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>Public pages only</dd>
            </div>
            <div>
              <dt>Evidence coverage</dt>
              <dd>93%</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>4 dimensions · 3 findings</dd>
            </div>
            {dimensions.map(([label, score]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{score}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </section>

      <section className="section">
        <h2>Example findings.</h2>
        <p className="section-intro">
          The real audit uses the submitted URL and visible locale structure.
          The score uses public evidence across crawlability, locale discovery,
          structured data, and metadata. Unknown checks are excluded rather
          than treated as failures.
        </p>
        <div className="sample-findings">
          {findings.map((finding) => (
            <article className="sample-finding" key={finding.title}>
              <div className="sample-label">{finding.label}</div>
              <h3>{finding.title}</h3>
              <dl>
                <div>
                  <dt>Evidence URL</dt>
                  <dd>{finding.evidence}</dd>
                </div>
                <div>
                  <dt>Checked</dt>
                  <dd>{finding.checked}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{finding.confidence}</dd>
                </div>
                <div>
                  <dt>Why it matters</dt>
                  <dd>{finding.impact}</dd>
                </div>
                <div>
                  <dt>First fix</dt>
                  <dd>{finding.fix}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="section narrow">
        <div className="callout">
          <h2>Want this for a live site?</h2>
          <p>
            Send the public URL and visible locales. If the site is relevant, I
            will reply with a short audit or one practical next step.
          </p>
          <Link className="button primary" href="/audit/#audit-request">
            Request mini audit
          </Link>
        </div>
      </section>
    </main>
  )
}
