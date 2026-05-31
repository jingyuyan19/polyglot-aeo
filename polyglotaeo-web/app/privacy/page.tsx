export default function PrivacyPage() {
  return (
    <main className="legal-layout">
      <h1>Privacy Policy</h1>
      <p className="lead">Last updated: May 30, 2026</p>
      <section className="legal-card">
        <h2>Overview</h2>
        <p>
          Polyglot AEO is a Framer plugin and website operated by an independent
          developer. This policy explains what information we collect, how we use
          it, and the choices available to customers and visitors.
        </p>

        <h2>Information We Collect</h2>
        <ul>
          <li>Account and billing details processed through Creem.</li>
          <li>License activation metadata, such as license key status, project identifier, and activation timestamp.</li>
          <li>Support messages you send to us, including your email address and any project context you choose to include.</li>
          <li>Basic website analytics and server logs used to keep the service secure and reliable.</li>
        </ul>

        <h2>Plugin Content and AI Providers</h2>
        <p>
          The plugin is designed for bring-your-own-key AI usage. API keys are
          stored in the Framer project environment. When you choose to run AI
          generation, selected page or CMS content may be sent to the AI provider
          you configured so the provider can return schema, metadata, or llms.txt
          content.
        </p>

        <h2>How We Use Information</h2>
        <ul>
          <li>Provide license activation, validation, and subscription access.</li>
          <li>Respond to support requests and product feedback.</li>
          <li>Improve product reliability, security, and onboarding.</li>
          <li>Comply with legal, tax, payment, and fraud-prevention obligations.</li>
        </ul>

        <h2>Subprocessors</h2>
        <p>
          We may use Creem for checkout and subscription management, Cloudflare
          for license infrastructure, Netlify for website hosting, Framer for
          plugin distribution, and configured AI providers only when you choose
          to use them through your own account.
        </p>

        <h2>Data Retention</h2>
        <p>
          We keep billing and license records as long as needed to provide the
          service, resolve disputes, prevent abuse, and meet legal obligations.
          Support messages may be retained for product quality and continuity.
        </p>

        <h2>Your Choices</h2>
        <p>
          You may request access, correction, or deletion of personal information
          by contacting jimmymjing@gmail.com. Some records may be retained if
          required for legal, security, or accounting reasons.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy can be sent to jimmymjing@gmail.com.
        </p>
      </section>
    </main>
  )
}
