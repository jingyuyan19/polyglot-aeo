import Link from "next/link"
import Image from "next/image"

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
        <Link href="/pricing">Pricing</Link>
        <Link href="/contact">Contact</Link>
        <Link className="button primary" href="/pricing">
          Get Pro
        </Link>
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
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/refund">Refunds</Link>
        <Link href="/contact">Contact</Link>
      </div>
    </footer>
  )
}

export function CheckoutButtons() {
  const monthly =
    process.env.NEXT_PUBLIC_CHECKOUT_MONTHLY ??
    "/contact"
  const yearly = process.env.NEXT_PUBLIC_CHECKOUT_YEARLY ?? monthly

  return (
    <div className="card-actions">
      <a className="button primary" href={monthly}>
        Start monthly
      </a>
      <a className="button soft" href={yearly}>
        Save with annual
      </a>
    </div>
  )
}
