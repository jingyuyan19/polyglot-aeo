import type { Metadata } from "next"

import { CheckoutRedirectClient } from "./CheckoutRedirectClient"

export const dynamic = "force-static"

export const metadata: Metadata = {
  title: "Plugin checkout | Polyglot AEO",
  robots: {
    index: false,
    follow: false,
  },
}

export default function CheckoutRedirectPage() {
  return <CheckoutRedirectClient />
}
