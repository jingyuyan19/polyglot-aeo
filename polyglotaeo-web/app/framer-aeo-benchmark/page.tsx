import type { Metadata } from "next"
import Link from "next/link"
import { FormAttributionFields } from "../FormAttributionFields"
import { FramerInstallButton } from "../components"

export const metadata: Metadata = {
  title: "Framer AEO benchmark and public-site checklist",
  description:
    "A transparent public-site benchmark for multilingual Framer launches: crawlability, locale discovery, structured data, metadata, and live verification.",
}

const supportEmail = "jimmymjing@gmail.com"
const mailtoSubject = "Framer AEO benchmark check request"
const mailtoBody = `Hi Jimmy,

Please benchmark this Framer site against the public AEO checklist:

Site URL:
Visible locales:
Launch context:
Main concern:

Thanks!`
const mailtoHref = `mailto:${supportEmail}?subject=${encodeURIComponent(
  mailtoSubject,
)}&body=${encodeURIComponent(mailtoBody)}`

const metrics = [
  ["4", "scored dimensions with visible weights"],
  ["15", "public checks behind the readiness score"],
  ["75%", "minimum evidence coverage before a score is shown"],
]

const risks = [
  {
    title: "Locale canonicals collapse to the default URL",
    signal:
      "A translated page declares the default-language page as canonical instead of referencing itself.",
    outcome:
      "The localized URL can be consolidated into a different page instead of remaining a distinct public variant.",
  },
  {
    title: "hreflang is missing or not reciprocal",
    signal:
      "Locale pages expose different or incomplete alternate-language URL sets.",
    outcome:
      "Google may ignore incomplete annotations when mapping equivalent language or regional pages.",
  },
  {
    title: "Localized schema or metadata drifts",
    signal:
      "Translated CMS pages still share repeated titles, summaries, descriptions, or empty fields from the default locale.",
    outcome:
      "The public machine-readable description can conflict with the language visitors actually see.",
  },
  {
    title: "Preview QA is treated as launch QA",
    signal:
      "Teams review inside Framer or staging, but skip a final check against the published production domain.",
    outcome:
      "Client handoff misses the exact public state that search engines and answer engines can actually fetch.",
  },
]

const benchmarkRows = [
  ["Crawl & indexability · 25", "HTTP status, robots/noindex directives, and self-referencing canonicals"],
  ["Locale discovery · 30", "Distinct locale URLs, HTML lang, valid hreflang, and reciprocal annotations"],
  ["Structured data · 25", "Parseable JSON-LD, relevant types, and matching inLanguage values"],
  ["Metadata · 20", "Present and distinct titles and descriptions across sampled locale pages"],
  ["Handoff proof", "The client receives a short note with findings, risk, and first fix"],
]

export default function FramerAeoBenchmarkPage() {
  return (
    <main>
      <section className="benchmark-hero">
        <div>
          <div className="eyebrow">Framer AEO benchmark</div>
          <h1>Check the public language signals behind a Framer handoff.</h1>
          <p className="lead">
            This is the public benchmark behind the Polyglot AEO outreach and
            agency handoff workflow: crawlability, locale discovery, localized
            schema, metadata consistency, and production-domain verification.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#benchmark-request">
              Request benchmark check
            </a>
            <Link className="button" href="/agency/">
              Agency handoff template
            </Link>
            <FramerInstallButton className="button">
              Install free
            </FramerInstallButton>
          </div>
        </div>

        <aside className="benchmark-panel" aria-label="Framer AEO benchmark snapshot">
          <div className="benchmark-panel-top">
            <span>Field notes</span>
            <strong>July 2026</strong>
          </div>
          <div className="benchmark-metrics">
            {metrics.map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p>
            The pattern is consistent: teams can ship polished Framer sites and
            still leave language declarations and public metadata inconsistent.
          </p>
        </aside>
      </section>

      <section className="section">
        <h2>The four gaps worth checking first.</h2>
        <p className="section-intro">
          The benchmark is intentionally small. It is meant to create a useful
          pre-launch or handoff note, not a long SEO export no one reads.
        </p>
        <div className="grid">
          {risks.map((risk) => (
            <article className="card" key={risk.title}>
              <h3>{risk.title}</h3>
              <p>{risk.signal}</p>
              <p>
                <strong>Why it matters: </strong>
                {risk.outcome}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">Benchmark checklist</div>
        <h2>What gets checked on the public site.</h2>
        <p className="section-intro">
          Each check maps to a concrete handoff line: public evidence, client
          risk, and the first fix your team can apply.
        </p>
        <div className="benchmark-table">
          {benchmarkRows.map(([label, body]) => (
            <div className="benchmark-table-row" key={label}>
              <strong>{label}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className="callout">
          <h3>How the public score works</h3>
          <p>
            Pass earns full points, warning earns half, fail earns zero, and a
            check that cannot be observed is excluded. Below 75% evidence
            coverage, the report shows “evidence incomplete” instead of a
            number. Ratings are fixed: 80–100 Strong, 60–79 Needs attention,
            and 0–59 Limited public signals.
          </p>
          <p>
            The implementation follows Google&apos;s guidance for{" "}
            <a href="https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites">
              multilingual sites
            </a>{" "}
            and{" "}
            <a href="https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data">
              structured data
            </a>. llms.txt is an optional handoff signal, is never scored, and is
            not used by Google Search or its generative AI features.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button primary" href="/audit/sample/">
            See sample mini audit
          </Link>
          <Link className="button" href="/audit/">
            Request a public check
          </Link>
        </div>
      </section>

      <section className="section narrow">
        <div className="handoff-note">
          <div className="eyebrow">Useful output</div>
          <h2>Turn the benchmark into a client-ready handoff.</h2>
          <p>
            For agencies, the deliverable is a short note with three public
            findings, first fixes, and a client summary. For founders, the same
            benchmark becomes a focused fix list before the next launch.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#benchmark-request">
              Send one public URL
            </a>
            <Link className="button" href="/agency/#template">
              Use handoff template
            </Link>
          </div>
        </div>
      </section>

      <section className="section narrow" id="benchmark-request">
        <div className="audit-request">
          <div className="eyebrow">Free benchmark check</div>
          <h2>Send one Framer URL for a public AEO benchmark check.</h2>
          <p>
            I will check the published site against the benchmark and send back
            the highest-impact findings across crawlability, locale discovery,
            localized schema, metadata, and public-domain verification.
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
            <input type="hidden" name="request_type" value="benchmark_check" />
            <input type="hidden" name="source_page" value="/framer-aeo-benchmark/" />
            <FormAttributionFields />
            <p className="hidden-field">
              <label>
                Do not fill this out: <input name="bot-field" />
              </label>
            </p>
            <label>
              Team or agency <span className="field-hint">optional</span>
              <input name="agency_name" type="text" placeholder="Your team name" />
            </label>
            <label>
              Public Framer site URL
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
              Visible locales <span className="field-hint">optional</span>
              <input name="locales" type="text" placeholder="English, French, German" />
            </label>
            <label>
              Launch context or concern <span className="field-hint">optional</span>
              <textarea
                name="concern"
                rows={4}
                placeholder="Pre-launch, client handoff, canonical or hreflang issue, new locale launch..."
              />
            </label>
            <button className="button primary" type="submit">
              Send benchmark request
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
