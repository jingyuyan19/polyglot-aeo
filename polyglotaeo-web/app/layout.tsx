import type { Metadata } from "next"
import "./globals.css"
import { SiteFooter, SiteNav } from "./components"

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://polyglotaeo.com",
  ),
  title: {
    default: "Polyglot AEO — AEO control center for Framer",
    template: "%s · Polyglot AEO",
  },
  description:
    "Launch and maintain multilingual Framer sites with schema, metadata, llms.txt, CMS gap checks, and published-site AEO verification.",
  openGraph: {
    title: "Polyglot AEO",
    description:
      "AEO quality control for multilingual Framer sites before and after launch.",
    url: "/",
    siteName: "Polyglot AEO",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <SiteNav />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
