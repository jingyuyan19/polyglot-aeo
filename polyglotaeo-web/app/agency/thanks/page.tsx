import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Agency handoff note request received",
  description:
    "Confirmation page for a Polyglot AEO Framer agency handoff note request.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function AgencyThanksPage() {
  return (
    <main className="legal-layout">
      <div className="eyebrow">Request received</div>
      <h1>Thanks. I will check the client URL for a handoff-ready note.</h1>
      <div className="legal-card">
        <p>
          I will review the public Framer site for the checks that make a client
          handoff useful: locale discovery, localized schema and metadata, CMS
          content gaps, and published-page verification.
        </p>
        <p>
          If the URL is public and relevant, I will reply with a compact
          3-point note your team can adapt for the client.
        </p>
        <div className="success-actions">
          <Link className="button primary" href="/agency/#template">
            See the handoff template
          </Link>
          <Link className="button" href="/audit/sample/">
            See a sample mini audit
          </Link>
        </div>
      </div>
    </main>
  )
}
