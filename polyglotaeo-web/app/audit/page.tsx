import type { Metadata } from "next"
import Link from "next/link"
import { FormAttributionFields } from "../FormAttributionFields"

export const metadata: Metadata = {
  title: "Free Framer AEO mini audit",
  description:
    "Request a short public readiness audit for a multilingual Framer site: locale URLs, canonicals, hreflang, schema, metadata, and live checks.",
}

const supportEmail = "jimmymjing@gmail.com"
const mailtoSubject = "Framer AEO mini audit request"
const mailtoBody = `Hi Jimmy,

Please send a short Framer AEO mini audit for this site:

Site URL:
Locales:
Main launch or SEO concern:

Thanks!`
const mailtoHref = `mailto:${supportEmail}?subject=${encodeURIComponent(
  mailtoSubject,
)}&body=${encodeURIComponent(mailtoBody)}`

export default function AuditPage() {
  return (
    <main>
      <section className="audit-hero">
        <div>
          <div className="eyebrow">Free public-site check</div>
          <h1>Get a short AEO mini audit for your Framer site.</h1>
          <p className="lead">
            Send the public URL for a multilingual Framer site. I will check the
            same launch risks Polyglot AEO was built to fix: locale discovery,
            canonicals, localized schema, metadata drift, and live verification.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#audit-request">
              Request mini audit
            </a>
            <Link className="button" href="/audit/sample/">
              See sample report
            </Link>
            <Link className="button" href="/pricing">
              See Pro workflow
            </Link>
          </div>
          <p className="audit-note">
            Public pages only. Do not send API keys, client credentials, or
            private Framer project access.
          </p>
        </div>

        <aside className="audit-panel" aria-label="Mini audit contents">
          <h2>What you get</h2>
          <ul className="audit-checklist">
            <li>Two or three concrete findings from the public site.</li>
            <li>A fix checklist your Framer team can act on.</li>
            <li>A note on whether Free is enough or Pro would save time.</li>
          </ul>
          <Link className="audit-panel-link" href="/audit/sample/">
            Preview the report format
          </Link>
        </aside>
      </section>

      <section className="section">
        <h2>Checks focused on multilingual launch risk.</h2>
        <p className="section-intro">
          This is not a generic SEO scan. The audit is scoped to issues that
          often break when a Framer site ships multiple locales.
        </p>
        <div className="grid">
          <article className="card">
            <h3>Locale discovery</h3>
            <p>
              Confirm that each public language URL has matching HTML language,
              canonical, and reciprocal hreflang declarations.
            </p>
          </article>
          <article className="card">
            <h3>Localized schema</h3>
            <p>
              Check whether JSON-LD exists and whether language fields match the
              visible locale structure.
            </p>
          </article>
          <article className="card">
            <h3>Metadata drift</h3>
            <p>
              Look for repeated titles, missing descriptions, and localized
              pages that still look like the default version.
            </p>
          </article>
        </div>
      </section>

      <section className="section narrow" id="audit-request">
        <div className="audit-request">
          <h2>Send the URL and context.</h2>
          <p>
            The fastest request includes the public site URL, visible locales,
            and whether the site is pre-launch, newly published, or already live
            with traffic.
          </p>
          <form
            className="audit-form"
            name="framer-aeo-mini-audit"
            method="POST"
            action="/audit/thanks/"
            data-netlify="true"
            data-netlify-honeypot="bot-field"
          >
            <input type="hidden" name="form-name" value="framer-aeo-mini-audit" />
            <input type="hidden" name="request_type" value="mini_audit" />
            <input type="hidden" name="source_page" value="/audit/" />
            <FormAttributionFields />
            <p className="hidden-field">
              <label>
                Do not fill this out: <input name="bot-field" />
              </label>
            </p>
            <label>
              Public site URL
              <input
                name="site_url"
                type="url"
                placeholder="https://example.framer.website"
                required
              />
            </label>
            <label>
              Your email
              <input
                name="contact_email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Visible locales
              <input name="locales" type="text" placeholder="English, French, German" />
            </label>
            <label>
              Main launch or SEO concern
              <textarea
                name="concern"
                rows={4}
                placeholder="New launch, localized pages, canonical or hreflang concerns, client handoff..."
              />
            </label>
            <button className="button primary" type="submit">
              Send audit request
            </button>
          </form>
          <p className="audit-fallback">
            Prefer email?{" "}
            <a href={mailtoHref}>Send the same request to {supportEmail}</a>.
          </p>
        </div>
      </section>
    </main>
  )
}
