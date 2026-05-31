"use client"

import { useEffect, useState } from "react"

const FRAMER_PLUGIN_OPEN = "https://framer.com/plugins/open"
const CREEM_DASHBOARD = "https://creem.io/dashboard"

export function SuccessClient() {
  const [checkoutId, setCheckoutId] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [testCheckout, setTestCheckout] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCheckoutId(params.get("checkout_id"))
    setRequestId(params.get("request_id"))
    const id = params.get("checkout_id") ?? ""
    setTestCheckout(id.includes("cs_test_") || id.includes("test"))
  }, [])

  return (
    <main className="legal-layout success-page">
      <h1>Thank you — Pro is on the way</h1>

      {testCheckout ? (
        <p className="success-badge">Test mode purchase</p>
      ) : null}

      <section className="legal-card success-card">
        <h2 className="success-subtitle">Next steps</h2>
        <ol className="success-steps">
          <li>
            <strong>Get your license key</strong> — Creem sends it by email
            (usually within a few minutes). You can also open{" "}
            <a href={CREEM_DASHBOARD} target="_blank" rel="noopener noreferrer">
              Creem Dashboard
            </a>
            , turn on <strong>Test Mode</strong> if this was a test purchase,
            then find the order under <strong>Transactions</strong> or{" "}
            <strong>Licenses</strong> and copy the key.
          </li>
          <li>
            <strong>Open Framer</strong> and run Polyglot AEO on the project
            you want to license.
          </li>
          <li>
            In the plugin go to <strong>Settings</strong> →{" "}
            <strong>Polyglot AEO Pro</strong>. If you bought in test mode, set
            billing to <strong>Test</strong> (not Production).
          </li>
          <li>
            Paste the license key and click <strong>Activate</strong>. Pro
            unlocks for this Framer project only (one activation per
            subscription).
          </li>
        </ol>

        <div className="success-actions">
          <a
            className="button primary"
            href={FRAMER_PLUGIN_OPEN}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Framer plugins
          </a>
          <a
            className="button secondary"
            href={CREEM_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
          >
            Creem Dashboard
          </a>
        </div>

        {(checkoutId || requestId) && (
          <div className="success-refs">
            <p className="success-refs-title">Support reference (optional)</p>
            {checkoutId ? (
              <p>
                <span className="success-refs-label">Checkout</span>{" "}
                <code>{checkoutId}</code>
              </p>
            ) : null}
            {requestId ? (
              <p>
                <span className="success-refs-label">Order</span>{" "}
                <code>{requestId}</code>
              </p>
            ) : null}
            <p className="success-refs-hint">
              Include these if you email{" "}
              <a href="mailto:jimmyjing@gmail.com">jimmyjing@gmail.com</a> and
              the key has not arrived.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
