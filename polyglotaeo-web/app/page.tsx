import Link from "next/link"

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div>
          <div className="eyebrow">For Framer multilingual launches</div>
          <h1>The AEO control center for Framer teams.</h1>
          <p className="lead">
            Polyglot AEO helps agencies and founders prepare multilingual
            Framer sites for answer engines with localized schema, metadata,
            llms.txt files, CMS gap checks, and published-site verification.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/pricing">
              View pricing
            </Link>
            <Link className="button" href="/#workflow">
              See workflow
            </Link>
          </div>
          <div className="proof">
            <span>Free plugin on Framer Marketplace</span>
            <span>BYOK AI providers</span>
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
              <strong>llms.txt generated</strong>
              <span>Needs publish</span>
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
            <h3>Multilingual llms.txt</h3>
            <p>
              Build default and locale-specific llms files, catch untranslated
              rows, and export files ready for deployment.
            </p>
          </article>
          <article className="card">
            <h3>CMS gap manager</h3>
            <p>
              Find missing localized titles, summaries, slugs, and duplicate
              records before they quietly damage answer-engine quality.
            </p>
          </article>
          <article className="card">
            <h3>Published-site verifier</h3>
            <p>
              Check the live site for schema, meta descriptions, language
              coverage, and llms files after deployment.
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
            <h3>Bring your own AI key</h3>
            <p>
              Use supported AI providers from plugin settings. Keys stay in the
              Framer project environment.
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="workflow">
        <h2>A narrow, practical launch workflow.</h2>
        <p className="section-intro">
          The product is intentionally focused: make multilingual Framer sites
          understandable, citeable, and verifiable without turning your team into
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
                Create schema, meta suggestions, and llms.txt variants with
                native-language output where Pro is enabled.
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
                After publish, verify that schema, meta, language coverage, and
                llms files are reachable from the production domain.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="section narrow">
        <div className="callout">
          <h2>Free is useful. Pro is built for real multilingual launches.</h2>
          <p>
            Start free for default-locale schema and a single llms.txt. Upgrade
            when you need every locale, bulk installs, CMS gap exports, verifier
            reports, and client-ready launch QA.
          </p>
          <Link className="button primary" href="/pricing">
            Compare plans
          </Link>
        </div>
      </section>
    </main>
  )
}
