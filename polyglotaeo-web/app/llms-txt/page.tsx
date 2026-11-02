import type { Metadata } from "next"
import Link from "next/link"
import { FormAttributionFields } from "../FormAttributionFields"
import { FramerInstallButton } from "../components"

export const metadata: Metadata = {
  title: "Framer llms.txt checklist",
  description:
    "A practical optional llms.txt handoff checklist for Framer teams, with locale coverage and public verification.",
}

const supportEmail = "jimmymjing@gmail.com"
const mailtoSubject = "Framer llms.txt check request"
const mailtoBody = `Hi Jimmy,

Please check the llms.txt setup for this Framer site:

Site URL:
Visible locales:
Priority pages:
Launch context:

Thanks!`
const mailtoHref = `mailto:${supportEmail}?subject=${encodeURIComponent(
  mailtoSubject,
)}&body=${encodeURIComponent(mailtoBody)}`

const checks = [
  {
    title: "Root file is reachable",
    body: "Publish /llms.txt on the production domain, then verify the file returns a 200 from the public site.",
  },
  {
    title: "Priority pages are listed",
    body: "Include home, pricing, docs, product, contact, and client-critical CMS pages for systems that choose to consume the file.",
  },
  {
    title: "Locales are explicit",
    body: "Group localized paths clearly so downstream tools can connect English, French, German, Japanese, or other locale variants.",
  },
  {
    title: "Schema and metadata agree",
    body: "Use llms.txt as a pointer layer, then check that page titles, descriptions, canonical URLs, and JSON-LD are not drifting by locale.",
  },
]

const workflow = [
  "Collect production URLs from Framer pages and CMS collections.",
  "Choose the pages that downstream tools may reference, summarize, or use as product context.",
  "Generate a short root llms.txt with locale groups and stable descriptions.",
  "Publish it to the root domain and verify it from the public URL.",
  "Recheck after every locale launch, CMS migration, or major content update.",
]

export default function LlmsTxtPage() {
  return (
    <main>
      <section className="llms-hero">
        <div>
          <div className="eyebrow">Framer llms.txt workflow</div>
          <h1>Ship an optional llms.txt handoff file for your Framer site.</h1>
          <p className="lead">
            Use this checklist to decide what belongs in `/llms.txt`, connect
            localized pages to the right public URLs, and verify the file after
            publish for systems that choose to consume it.
          </p>
          <p className="audit-note">
            Google Search does not use llms.txt, so this file is not included in
            Polyglot&apos;s public readiness score and is not presented as a ranking
            signal. See the{" "}
            <a href="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide">
              Google Search guidance
            </a>.
          </p>
          <div className="hero-actions">
            <FramerInstallButton>Install free on Framer</FramerInstallButton>
            <a className="button" href="#llms-request">
              Request llms.txt check
            </a>
            <Link className="button" href="/audit/sample/">
              See sample audit
            </Link>
          </div>
          <div className="proof">
            <span>Optional file QA</span>
            <span>Locale path coverage</span>
            <span>Published-domain verification</span>
          </div>
        </div>

        <aside className="llms-preview" aria-label="llms.txt example">
          <div className="llms-preview-top">
            <span>/llms.txt</span>
            <strong>Public file checklist</strong>
          </div>
          <pre>{`# Polyglot Framer site
Site: https://example.com
Summary: Product pages and localized resources.

## Priority URLs
- https://example.com/
- https://example.com/pricing/
- https://example.com/en/docs/
- https://example.com/fr/docs/

## Locale notes
English: /en/
French: /fr/
German: /de/`}</pre>
        </aside>
      </section>

      <section className="section">
        <h2>A focused pre-publish checklist.</h2>
        <p className="section-intro">
          Framer teams usually do not need a giant crawler export. They need a
          compact handoff file for compatible tools, backed by public pages,
          languages, and context that stay accurate over time.
        </p>
        <div className="grid">
          {checks.map((item) => (
            <article className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="workflow">
        <h2>Use this workflow before handoff.</h2>
        <div className="llms-workflow">
          {workflow.map((item, index) => (
            <article className="step" key={item}>
              <div>
                <h3>{`Step ${index + 1}`}</h3>
                <p>{item}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section narrow">
        <div className="handoff-note">
          <div className="eyebrow">What Polyglot AEO checks</div>
          <h2>Keep llms.txt optional within the full QA pass.</h2>
          <p>
            When a team chooses to maintain the file, it should match the live
            site. Polyglot AEO pairs the optional export with scored checks for
            schema, metadata, locale declarations, CMS gaps, and post-publish QA.
          </p>
          <div className="hero-actions">
            <FramerInstallButton className="button primary">
              Install free plugin
            </FramerInstallButton>
            <Link className="button" href="/pricing/">
              Compare Pro workflow
            </Link>
          </div>
        </div>
      </section>

      <section className="section narrow" id="llms-request">
        <div className="audit-request">
          <div className="eyebrow">Optional file check</div>
          <h2>Send one Framer URL for a scoped llms.txt check.</h2>
          <p>
            I will check whether `/llms.txt` is reachable, whether priority
            localized pages are represented, and whether it matches the public
            site. The result is kept separate from the readiness score.
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
            <input type="hidden" name="request_type" value="llms_txt_check" />
            <input type="hidden" name="source_page" value="/llms-txt/" />
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
                placeholder="https://example.com"
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
              Priority pages or launch context
              <textarea
                name="concern"
                rows={4}
                placeholder="Pages that should be included, missing llms.txt, new locale launch..."
              />
            </label>
            <button className="button primary" type="submit">
              Send llms.txt check request
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
