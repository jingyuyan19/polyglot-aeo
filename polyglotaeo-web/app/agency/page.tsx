import type { Metadata } from "next"
import Link from "next/link"
import { FormAttributionFields } from "../FormAttributionFields"
import { FramerInstallButton } from "../components"

export const metadata: Metadata = {
  title: "Framer agency AEO handoff checklist",
  description:
    "A reusable AEO QA checklist and client-facing mini audit workflow for Framer agencies shipping multilingual client sites.",
}

const checklist = [
  {
    step: "1",
    title: "Verify locale URLs and canonicals",
    detail:
      "Check that every published language has a stable URL, matching HTML language, self-canonical, and reciprocal hreflang set.",
  },
  {
    step: "2",
    title: "Verify localized schema",
    detail:
      "Review Organization, WebSite, Article, Product, and inLanguage values from the public site, not the editor preview.",
  },
  {
    step: "3",
    title: "Catch CMS content gaps",
    detail:
      "Flag missing translated summaries, repeated titles, empty meta descriptions, and locale pages that drift from the default.",
  },
  {
    step: "4",
    title: "Send a client-facing audit note",
    detail:
      "Turn the QA pass into a short handoff note with findings, first fixes, and what to monitor after launch.",
  },
]

const workflows = [
  {
    title: "Before publish",
    body: "Run the checklist while final content is still moving, so schema and metadata fixes do not become a post-launch scramble.",
  },
  {
    title: "At handoff",
    body: "Give the client a concise proof-of-work note that explains what was checked and which public AEO risks remain.",
  },
  {
    title: "After launch",
    body: "Use the same checks for retainer updates, new locales, CMS migrations, and public readiness reviews.",
  },
]

const templateFields = [
  ["Client URL", "Published domain and priority locale paths"],
  ["Launch state", "Pre-launch, handoff, retainer review, or locale update"],
  ["Locales checked", "Default language plus every visible locale"],
  ["Owner", "Designer, developer, PM, or client-side approver"],
]

const templateFindings = [
  {
    check: "Locale discovery",
    finding: "A locale canonical points to the default page or its hreflang set is incomplete.",
    fix: "Use a self-canonical and the same reciprocal hreflang set on every locale page.",
  },
  {
    check: "Localized schema language",
    finding: "Schema is missing inLanguage values or reuses default-locale context.",
    fix: "Set locale-specific inLanguage fields and verify JSON-LD on the published site.",
  },
  {
    check: "CMS metadata drift",
    finding: "Translated CMS pages still share default titles, summaries, or descriptions.",
    fix: "Review collection fields for repeated copy before client handoff.",
  },
]

const supportEmail = "jimmymjing@gmail.com"
const mailtoSubject = "Framer agency AEO handoff request"
const mailtoBody = `Hi Jimmy,

Please send a 3-point agency AEO QA handoff note for this Framer client site:

Agency:
Client site URL:
Visible locales:
Launch or handoff context:

Thanks!`
const mailtoHref = `mailto:${supportEmail}?subject=${encodeURIComponent(
  mailtoSubject,
)}&body=${encodeURIComponent(mailtoBody)}`

export default function AgencyPage() {
  return (
    <main>
      <section className="agency-hero">
        <div>
          <div className="eyebrow">For Framer agencies</div>
          <h1>A repeatable AEO QA handoff for Framer client launches.</h1>
          <p className="lead">
            Polyglot AEO helps agencies turn locale discovery, localized schema,
            CMS gaps, published-domain checks, and optional llms.txt exports into
            a client-facing launch QA deliverable.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#agency-request">
              Get a free handoff note
            </a>
            <a className="button" href="#template">
              Use the template
            </a>
            <FramerInstallButton className="button">
              Install free
            </FramerInstallButton>
          </div>
        </div>

        <div className="agency-preview" aria-label="Agency handoff preview">
          <div className="agency-preview-top">
            <span>Client handoff QA</span>
            <strong>Ready for review</strong>
          </div>
          <div className="agency-preview-row">
            <span>Locale discovery</span>
            <strong>1 canonical conflict</strong>
          </div>
          <div className="agency-preview-row">
            <span>Localized schema</span>
            <strong>2 locales need inLanguage</strong>
          </div>
          <div className="agency-preview-row">
            <span>CMS metadata</span>
            <strong>3 repeated summaries</strong>
          </div>
          <div className="agency-preview-note">
            Client note: launch can proceed after schema and crawler context are
            fixed on the published domain.
          </div>
        </div>
      </section>

      <section className="agency-strip" aria-label="Agency outcomes">
        <div>
          <strong>15 minutes</strong>
          <span>to run a focused public-site check</span>
        </div>
        <div>
          <strong>3 findings</strong>
          <span>enough for a useful client handoff note</span>
        </div>
        <div>
          <strong>1 workflow</strong>
          <span>repeatable across multilingual Framer launches</span>
        </div>
      </section>

      <section className="section">
        <h2>Make AEO QA part of the agency delivery loop.</h2>
        <p className="section-intro">
          The agency value is not another generic SEO report. It is a compact
          check your team can run before launch, at client handoff, and when new
          locales or CMS collections go live.
        </p>
        <div className="grid">
          {workflows.map((item) => (
            <article className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="checklist">
        <h2>Agency checklist.</h2>
        <p className="section-intro">
          Use this as the lightweight QA pass before sending a client site live
          or closing a Framer handoff.
        </p>
        <div className="agency-checklist">
          {checklist.map((item) => (
            <article className="agency-check" key={item.title}>
              <span>{item.step}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="template">
        <div className="eyebrow">Client handoff template</div>
        <h2>Use this note as the client-facing QA deliverable.</h2>
        <p className="section-intro">
          Keep the deliverable short enough for a launch handoff, but specific
          enough that the client can see what was checked, what changed, and
          what should be monitored after publish.
        </p>
        <div className="agency-template">
          <div className="template-meta" aria-label="Agency QA fields">
            {templateFields.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="template-findings">
            <div className="template-findings-row template-findings-head">
              <span>Public check</span>
              <span>Finding to record</span>
              <span>First fix</span>
            </div>
            {templateFindings.map((item) => (
              <div className="template-findings-row" key={item.check}>
                <strong>{item.check}</strong>
                <p>{item.finding}</p>
                <p>{item.fix}</p>
              </div>
            ))}
          </div>
          <div className="template-note">
            <h3>Client summary</h3>
            <p>
              We checked the public Framer launch for multilingual public readiness across
              the main locale structure. The highest priority fixes are locale
              canonicals, localized schema language fields, and CMS metadata
              that still matches the default language.
            </p>
            <p>
              Recommended next step: apply the fixes above, rerun the public
              check after publish, and repeat the same QA pass when the next
              locale or CMS collection ships.
            </p>
          </div>
        </div>
        <div className="hero-actions">
          <a className="button primary" href="#agency-request">
            Apply it to one URL
          </a>
          <Link className="button" href="/audit/sample/">
            See public mini audit
          </Link>
        </div>
      </section>

      <section className="section narrow">
        <div className="handoff-note">
          <div className="eyebrow">Sample client note</div>
          <h2>What a finished handoff can say.</h2>
          <p>
            We checked the public Framer launch across the main locale structure.
            The highest priority fixes are self-referencing locale canonicals,
            localized schema language fields, and CMS summaries that still match
            the default language.
          </p>
          <p>
            Once those are fixed, the site has clearer public context for
            search engines and answer engines, and the same QA pass can be run
            again when the next locale or content collection ships.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#agency-request">
              Send a client URL
            </a>
            <Link className="button" href="/audit/sample/">
              See public mini audit
            </Link>
          </div>
        </div>
      </section>

      <section className="section narrow" id="agency-request">
        <div className="audit-request">
          <div className="eyebrow">Agency QA note</div>
          <h2>Send one client URL for a 3-point handoff note.</h2>
          <p>
            I will apply the checklist to one public Framer client site and
            send back a short note your team can adapt for client handoff.
          </p>
          <div className="request-proof" aria-label="Agency request output">
            <span>What comes back</span>
            <strong>3 public findings, first fixes, and a client-ready summary.</strong>
          </div>
          <form
            className="audit-form"
            name="framer-aeo-mini-audit"
            method="POST"
            action="/agency/thanks/"
            data-netlify="true"
            data-netlify-honeypot="bot-field"
          >
            <input type="hidden" name="form-name" value="framer-aeo-mini-audit" />
            <input type="hidden" name="request_type" value="agency_template" />
            <input type="hidden" name="source_page" value="/agency/" />
            <FormAttributionFields />
            <p className="hidden-field">
              <label>
                Do not fill this out: <input name="bot-field" />
              </label>
            </p>
            <label>
              Agency or studio <span className="field-hint">optional</span>
              <input name="agency_name" type="text" placeholder="Your agency name" />
            </label>
            <label>
              Client site URL
              <input
                name="site_url"
                type="url"
                placeholder="https://client-site.com"
                required
              />
            </label>
            <label>
              Your email
              <input
                name="contact_email"
                type="email"
                placeholder="you@agency.com"
                required
              />
            </label>
            <label>
              Visible locales <span className="field-hint">optional</span>
              <input name="locales" type="text" placeholder="English, French, German" />
            </label>
            <label>
              Launch or handoff context <span className="field-hint">optional</span>
              <textarea
                name="concern"
                rows={4}
                placeholder="Pre-launch QA, client handoff, new locale launch, retainer review..."
              />
            </label>
            <button className="button primary" type="submit">
              Send client URL for a 3-point note
            </button>
          </form>
          <p className="fine-print">
            I only need a public URL and reply email to start. Locale and launch
            context help me make the note sharper, but they are optional.
          </p>
          <p className="audit-fallback">
            Prefer email?{" "}
            <a href={mailtoHref}>Send the same request to {supportEmail}</a>.
          </p>
        </div>
      </section>
    </main>
  )
}
