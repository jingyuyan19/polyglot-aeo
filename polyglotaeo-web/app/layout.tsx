import type { Metadata } from "next"
import "./globals.css"
import { SiteFooter, SiteNav } from "./components"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://polyglotaeo.com"
const marketplaceUrl =
  process.env.NEXT_PUBLIC_FRAMER_MARKETPLACE_URL ??
  "https://www.framer.com/community/marketplace/plugins/polyglot-aeo/"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Polyglot AEO — AEO control center for Framer",
    template: "%s · Polyglot AEO",
  },
  description:
    "Launch and maintain multilingual Framer sites with schema, metadata, locale QA, CMS gap checks, published-site verification, and optional llms.txt exports.",
  // "./" resolves to each page's own URL, so every route gets a self canonical.
  alternates: {
    canonical: "./",
  },
  openGraph: {
    title: "Polyglot AEO",
    description:
      "AEO quality control for multilingual Framer sites before and after launch.",
    url: "./",
    siteName: "Polyglot AEO",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Polyglot AEO" }],
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
}

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "Polyglot AEO",
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
    contactPoint: {
      "@type": "ContactPoint",
      email: "jimmymjing@gmail.com",
      contactType: "customer support",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: "Polyglot AEO",
    url: siteUrl,
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
    inLanguage: "en",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${siteUrl}/#software`,
    name: "Polyglot AEO",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Framer",
    url: siteUrl,
    installUrl: marketplaceUrl,
    description:
      "A Framer plugin for multilingual QA: localized schema, metadata, locale checks, CMS gaps, published-site verification, and optional llms.txt exports.",
    creator: {
      "@id": `${siteUrl}/#organization`,
    },
    offers: [
      {
        "@type": "Offer",
        name: "Polyglot AEO Free",
        price: "0",
        priceCurrency: "USD",
        url: marketplaceUrl,
      },
      {
        "@type": "Offer",
        name: "Polyglot AEO Pro",
        price: "19",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "19",
          priceCurrency: "USD",
          unitText: "MONTH",
        },
        url: `${siteUrl}/pricing/`,
      },
    ],
  },
]

function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
      }}
    />
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <JsonLd />
        <div className="site-shell">
          <SiteNav />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
