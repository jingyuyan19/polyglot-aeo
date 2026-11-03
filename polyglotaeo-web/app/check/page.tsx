import type { Metadata } from "next"

import { CheckerClient } from "./CheckerClient"

export const metadata: Metadata = {
  title: "Free AEO checker for Framer sites",
  description:
    "Check any published site in seconds: structured data, llms.txt, hreflang, metadata and AI crawler access. Built for multilingual Framer sites.",
}

export default function CheckPage() {
  return (
    <main>
      <section className="checker-hero">
        <div className="eyebrow">Free instant check</div>
        <h1>Is your site ready for AI answers?</h1>
        <p className="lead">
          Enter a published URL. We check what answer engines read first:
          structured data, llms.txt, language versions, metadata and whether AI
          crawlers are allowed in.
        </p>
        <CheckerClient />
      </section>
    </main>
  )
}
