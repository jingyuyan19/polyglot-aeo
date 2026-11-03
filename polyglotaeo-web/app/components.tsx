import Link from "next/link"
import Image from "next/image"
import type { ReactNode } from "react"
import { TrackedLink } from "./TrackedLink"

export const FRAMER_MARKETPLACE_URL =
  process.env.NEXT_PUBLIC_FRAMER_MARKETPLACE_URL ??
  "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/"

export const LICENSE_API_BASE = (
  process.env.NEXT_PUBLIC_LICENSE_API_BASE ??
  process.env.VITE_LICENSE_API_BASE ??
  "https://license.polyglotaeo.com"
).replace(/\/$/, "")

export function FramerInstallButton({
  className = "button primary",
  children = "Install free",
  trackingLabel = "Install free",
}: {
  className?: string
  children?: ReactNode
  trackingLabel?: string
}) {
  return (
    <TrackedLink
      className={className}
      href={FRAMER_MARKETPLACE_URL}
      target="_blank"
      rel="noopener noreferrer"
      eventType="install_click"
      trackingLabel={trackingLabel}
    >
      {children}
    </TrackedLink>
  )
}

export function SiteNav() {
  return (
    <header className="nav">
      <Link className="brand" href="/">
        <Image
          className="brand-mark"
          src="/icon.svg"
          alt=""
          width={32}
          height={32}
          priority
        />
        <span>Polyglot AEO</span>
      </Link>
      <nav className="nav-links" aria-label="Main navigation">
        <Link href="/#features">Features</Link>
        <Link href="/#workflow">Workflow</Link>
        <Link href="/framer-aeo-benchmark/">Benchmark</Link>
        <Link href="/llms-txt/">llms.txt</Link>
        <Link href="/check/">Free check</Link>
        <Link href="/audit/">Mini audit</Link>
        <Link href="/agency/">Agencies</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/contact">Contact</Link>
        <FramerInstallButton />
      </nav>
    </header>
  )
}

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div>© {year} Polyglot AEO. Built for Framer teams shipping multilingual sites.</div>
      <div className="footer-links">
        <TrackedLink
          href={FRAMER_MARKETPLACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          eventType="install_click"
          trackingLabel="Footer Framer Marketplace"
        >
          Framer Marketplace
        </TrackedLink>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/refund">Refunds</Link>
        <Link href="/contact">Contact</Link>
      </div>
    </footer>
  )
}

export function CheckoutButtons() {
  const monthly = checkoutBridgeHref("monthly")
  const yearly = checkoutBridgeHref("yearly")

  return (
    <div className="card-actions">
      <TrackedLink
        className="button primary"
        href={monthly}
        eventType="checkout_click"
        trackingLabel="Start monthly"
      >
        Start monthly
      </TrackedLink>
      <TrackedLink
        className="button soft"
        href={yearly}
        eventType="checkout_click"
        trackingLabel="Save with annual"
      >
        Save with annual
      </TrackedLink>
    </div>
  )
}

function checkoutBridgeHref(plan: "monthly" | "yearly") {
  const target = `${LICENSE_API_BASE}/checkout?plan=${plan}`
  const params = new URLSearchParams({
    plan,
    target,
    utm_source: "owned_site",
    utm_medium: "pricing_page",
    utm_campaign: "polyglot_aeo_pro",
  })

  return `/go/checkout/?${params.toString()}`
}
