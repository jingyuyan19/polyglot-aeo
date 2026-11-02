import Link from "next/link"
import { FramerInstallButton } from "./components"

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div>
          <div className="eyebrow">For Framer multilingual launches</div>
          <h1>The AEO control center for Framer teams.</h1>
          <p className="lead">
            Polyglot AEO helps agencies and founders run pre-launch and
            post-publish AEO QA for multilingual Framer sites: localized
            schema, metadata, CMS gap checks, live verification, and optional
            llms.txt exports for teams that use them.
          </p>
          <div className="hero-actions">
            <FramerInstallButton>Install free on Framer</FramerInstallButton>
            <Link className="button" href="/audit/">
              Request mini audit
            </Link>
            <Link className="button" href="/#workflow">
              See workflow
            </Link>
          </div>
          <div className="proof">
            <span>Free plugin on Framer Marketplace</span>
            <span>Managed AI for Pro</span>
            <span>Pro subscriptions via Creem</span>
          </div>
        </div>

        <aside className="console" aria-label="AEO control center preview">
          <div className="console-top">
            <strong>AEO Control Center</strong>
            <span>Pre-launch readiness</span>
          </div>
          <div className="score">
            <div className="score-ring">82</div>
            <div>
              <h3>Ready with warnings</h3>
              <p>
                French and Japanese pages are indexed, but 3 CMS records still
                need localized titles before handoff.
              </p>
            </div>
          </div>
          <div className="issue-list">
            <div className="issue">
              <strong>Schema installed</strong>
              <span>4 locales</span>
            </div>
            <div className="issue">
              <strong>Locale canonicals</strong>
              <span>1 conflict</span>
            </div>
            <div className="issue">
              <strong>CMS title gaps</strong>
              <span>3 records</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="section" id="features">
        <h2>Built for the work right before and right after launch.</h2>
        <p className="section-intro">
          Most SEO tools start after a site is public. Polyglot AEO lives where
          Framer teams actually make the final fixes: inside the project, across
          every locale, with checks that lead directly to publishable changes.
        </p>
        <div className="grid">
          <article className="card">
            <h3>Localized structured data</h3>
            <p>
              Generate and install JSON-LD for pages and CMS content, including
              native titles and descriptions per locale.
            </p>
          </article>
          <article className="card">
            <h3>Optional multilingual llms.txt</h3>
            <p>
              Build default and locale-specific handoff files, catch
              untranslated rows, and export them for systems that consume the
              emerging format. They are not a Google Search ranking signal.
            </p>
            <Link className="text-link" href="/llms-txt/">
              Use the llms.txt checklist
            </Link>
          </article>
          <article className="card">
            <h3>CMS gap manager</h3>
            <p>
              Find missing localized titles, summaries, slugs, and duplicate
              records before they leak into public metadata and schema.
            </p>
          </article>
          <article className="card">
            <h3>Published-site verifier</h3>
            <p>
              Check the live site for schema, meta descriptions, canonicals,
              language coverage, and optional llms files after deployment.
            </p>
          </article>
          <article className="card">
            <h3>Client-ready reports</h3>
            <p>
              Export a concise readiness report for clients, teammates, and
              launch QA records.
            </p>
          </article>
          <article className="card">
            <h3>Managed AI generation</h3>
            <p>
              Pro requests run through Polyglot AEO&apos;s backend with license
              checks, short-lived session tokens, and usage quotas.
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="workflow">
        <h2>A narrow, practical launch workflow.</h2>
        <p className="section-intro">
          The product is intentionally focused: make multilingual Framer sites
          distinct, consistent, and verifiable without turning your team into
          technical SEO operators.
        </p>
        <div className="steps">
          <article className="step">
            <div>
              <h3>Scan the Framer project</h3>
              <p>
                Identify pages, locales, CMS collections, content fields, and
                missing metadata.
              </p>
            </div>
          </article>
          <article className="step">
            <div>
              <h3>Generate AEO assets</h3>
              <p>
                Create schema and meta suggestions with native-language output,
                plus optional llms.txt variants where Pro is enabled.
              </p>
            </div>
          </article>
          <article className="step">
            <div>
              <h3>Fix gaps before handoff</h3>
              <p>
                Use the control center to resolve blockers, CMS localization
                gaps, duplicate titles, and publish readiness issues.
              </p>
            </div>
          </article>
          <article className="step">
            <div>
              <h3>Verify the live site</h3>
              <p>
                After publish, verify schema, metadata, canonicals, language
                coverage, and any optional llms files from the production domain.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="section narrow">
        <div className="callout">
          <h2>Free finds the risk. Pro fixes every locale.</h2>
          <p>
            Start free to run the Control Center, preview CMS gaps, install a
            small default-locale schema set, and generate an optional llms.txt. Upgrade
            when the launch depends on every locale, bulk installs, verifier
            reports, and client-ready QA.
          </p>
          <Link className="button primary" href="/pricing">
            Compare plans
          </Link>
          <FramerInstallButton className="button soft">
            Install free first
          </FramerInstallButton>
        </div>
      </section>
    </main>
  )
}
