import { CheckoutButtons } from "../components"

export default function PricingPage() {
  return (
    <main className="section">
      <h1>Pricing</h1>
      <p className="lead">
        Install the plugin free from the Framer Marketplace. Upgrade to Pro when
        the site needs real multilingual AEO coverage across every locale.
      </p>

      <div className="pricing-grid">
        <section className="price-card">
          <h2>Free</h2>
          <div className="price">$0</div>
          <p>Best for testing one Framer project and proving the workflow.</p>
          <ul className="feature-list">
            <li>Manual schema for unlimited pages</li>
            <li>Default-locale AI schema preview</li>
            <li>Single default-language llms.txt</li>
            <li>Limited Meta AI generation samples</li>
            <li>BYOK provider settings</li>
          </ul>
        </section>

        <section className="price-card">
          <h2>Pro</h2>
          <div className="price">
            $19 <small>/ month</small>
          </div>
          <p>For agencies, founders, and teams shipping multilingual sites.</p>
          <ul className="feature-list">
            <li>Every locale: schema, metadata, and llms variants</li>
            <li>Unlimited schema installs and bulk workflows</li>
            <li>AEO Control Center readiness score</li>
            <li>CMS gap manager and CSV export</li>
            <li>Published-site verifier and client report export</li>
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
