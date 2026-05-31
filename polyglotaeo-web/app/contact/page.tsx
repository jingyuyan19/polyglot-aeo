export default function ContactPage() {
  return (
    <main className="legal-layout">
      <h1>Contact</h1>
      <p className="lead">
        Need license help, billing support, or product guidance for a Framer
        launch? Send a note and include the project context you are comfortable
        sharing.
      </p>
      <section className="legal-card">
        <h2>Support</h2>
        <p>
          Email: <a href="mailto:jimmymjing@gmail.com">jimmymjing@gmail.com</a>
        </p>
        <p>
          For license activation issues, include the email used at checkout and
          the Framer project name. Do not send API keys or private client data.
        </p>

        <h2>Billing</h2>
        <p>
          Subscription checkout, invoices, and payment records are processed by
          Creem. For fastest support, include the checkout email and approximate
          purchase date.
        </p>
      </section>
    </main>
  )
}
