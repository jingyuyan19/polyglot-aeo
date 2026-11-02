import { CheckoutButtons, FramerInstallButton } from "../components"

export default function PricingPage() {
  return (
    <main className="section">
      <h1>Pricing</h1>
      <p className="lead">
        Install the plugin free from the Framer Marketplace. Free helps you find
        multilingual launch risk; Pro fixes and verifies every locale.
      </p>

      <div className="pricing-grid">
        <section className="price-card">
          <h2>Free</h2>
          <div className="price">$0</div>
          <p>Best for proving the workflow and finding default-locale AEO risk.</p>
          <ul className="feature-list">
            <li>Manual schema for unlimited pages</li>
            <li>Default-locale AI schema preview</li>
            <li>Optional single-language llms.txt export</li>
            <li>Limited Meta AI generation samples</li>
            <li>Managed AI workflow preview</li>
          </ul>
          <FramerInstallButton>Install free on Framer</FramerInstallButton>
        </section>

        <section className="price-card">
          <h2>Pro</h2>
          <div className="price">
            $19 <small>/ month</small>
          </div>
          <p>For agencies, founders, and teams shipping multilingual Framer sites.</p>
          <ul className="feature-list">
            <li>Every locale: schema, metadata, and optional llms variants</li>
            <li>Unlimited schema installs and bulk workflows</li>
            <li>AEO Control Center readiness score</li>
            <li>CMS gap manager and CSV export</li>
            <li>Published-site verifier and client report export</li>
            <li>Managed AI generation with quota controls</li>
            <li>One Framer project activation per subscription</li>
          </ul>
          <CheckoutButtons />
          <p>
            Annual plan: $190/year. Subscriptions and license delivery are
            processed by Creem.
          </p>
        </section>
      </div>

      <section className="callout">
        <h2>Refund policy</h2>
        <p>
          If Polyglot AEO Pro is not a fit, contact support within 14 days of
          the first purchase. See the refund policy for details and abuse
          limits.
        </p>
      </section>
    </main>
  )
}
