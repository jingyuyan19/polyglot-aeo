import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Mini audit request received",
  description:
    "Confirmation page for a Polyglot AEO Framer mini-audit request.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function AuditThanksPage() {
  return (
    <main className="legal-layout">
      <div className="eyebrow">Request received</div>
      <h1>Thanks. I will check the public Framer site.</h1>
      <div className="legal-card">
        <p>
          I will review the submitted URL for the multilingual AEO issues that
          usually matter most: locale URLs, canonicals, hreflang, localized
          schema, metadata drift, and published-site verification.
        </p>
        <p>
          If the URL is public and relevant, I will reply with a short mini
          audit or one practical next step.
        </p>
        <div className="success-actions">
          <Link className="button primary" href="/">
            Back to Polyglot AEO
          </Link>
          <Link className="button" href="/pricing/">
            See Pro workflow
          </Link>
        </div>
      </div>
    </main>
  )
}
