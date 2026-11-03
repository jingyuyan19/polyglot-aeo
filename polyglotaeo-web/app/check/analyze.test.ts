import { describe, expect, it } from "vitest"

import { analyzeSite, blockedAiCrawlers, normalizeSiteUrl, type SiteSnapshot } from "./analyze"

const GOOD_PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>Acme Studio — Framer agency</title>
  <meta name="description" content="Acme Studio builds multilingual Framer sites for brands launching in Europe and Asia.">
  <meta name="generator" content="Framer 1a2b3c">
  <meta property="og:title" content="Acme Studio">
  <meta property="og:description" content="Multilingual Framer sites">
  <meta property="og:image" content="https://acme.example/og.png">
  <link rel="canonical" href="https://acme.example/">
  <link rel="alternate" hreflang="en" href="https://acme.example/">
  <link rel="alternate" hreflang="de" href="https://acme.example/de/">
  <link rel="alternate" hreflang="x-default" href="https://acme.example/">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme"},{"@type":"WebSite"}]}</script>
</head>
<body></body>
</html>`

function snapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  return {
    page: { status: 200, text: GOOD_PAGE },
    llms: { status: 200, text: "# Acme Studio\n\n> Multilingual Framer sites" },
    robots: { status: 200, text: "User-agent: *\nAllow: /" },
    sitemap: { status: 200, text: '<?xml version="1.0"?><urlset></urlset>' },
    ...overrides,
  }
}

describe("analyzeSite", () => {
  it("scores a well-prepared multilingual Framer site at 100", () => {
    const report = analyzeSite(snapshot())
    expect(report.findings.filter((f) => f.status !== "pass")).toEqual([])
    expect(report.score).toBe(100)
    expect(report.isFramer).toBe(true)
    expect(report.locales).toEqual(["en", "de"])
    expect(report.schemaTypes).toEqual(["Organization", "WebSite"])
  })

  it("flags a bare page and marks what Polyglot fixes", () => {
    const report = analyzeSite(snapshot({
      page: { status: 200, text: "<html><head></head><body>Hi</body></html>" },
      llms: { status: 404, text: "" },
      robots: null,
      sitemap: { status: 404, text: "" },
    }))
    const byId = Object.fromEntries(report.findings.map((f) => [f.id, f]))
    expect(byId.lang.status).toBe("fail")
    expect(byId.title.status).toBe("fail")
    expect(byId.jsonld.status).toBe("fail")
    expect(byId.jsonld.polyglotFixes).toBe(true)
    expect(byId.llms.status).toBe("fail")
    expect(byId.hreflang.status).toBe("warn")
    expect(byId["ai-crawlers"].status).toBe("pass")
    expect(report.score).toBeLessThan(30)
  })

  it("treats an HTML fallback page at /llms.txt as missing", () => {
    const report = analyzeSite(snapshot({ llms: { status: 200, text: "<!doctype html><html></html>" } }))
    expect(report.findings.find((f) => f.id === "llms")?.status).toBe("fail")
  })

  it("reports invalid JSON-LD and a missing x-default as warnings", () => {
    const page = GOOD_PAGE
      .replace('<link rel="alternate" hreflang="x-default" href="https://acme.example/">', "")
      .replace("</head>", '<script type="application/ld+json">{not json}</script></head>')
    const report = analyzeSite(snapshot({ page: { status: 200, text: page } }))
    const byId = Object.fromEntries(report.findings.map((f) => [f.id, f]))
    expect(byId.jsonld.status).toBe("warn")
    expect(byId.hreflang.status).toBe("warn")
  })

  it("stops at an unreachable page", () => {
    const report = analyzeSite(snapshot({ page: { status: 404, text: "Not found" } }))
    expect(report.reachable).toBe(false)
    expect(report.score).toBe(0)
    expect(report.findings).toHaveLength(1)
  })
})

describe("blockedAiCrawlers", () => {
  it("finds crawlers blocked by their own group or by a catch-all", () => {
    expect(blockedAiCrawlers("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /")).toEqual(["GPTBot"])
    expect(blockedAiCrawlers("User-agent: *\nDisallow: /")).toHaveLength(5)
    expect(blockedAiCrawlers("User-agent: *\nDisallow: /admin")).toEqual([])
  })

  it("lets a crawler's own group override a blocking catch-all", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nUser-agent: GPTBot\nAllow: /"
    expect(blockedAiCrawlers(robots)).toEqual(["OAI-SearchBot", "PerplexityBot", "Google-Extended"])
  })
})

describe("normalizeSiteUrl", () => {
  it("accepts bare domains and upgrades to https", () => {
    expect(normalizeSiteUrl("acme.example")?.toString()).toBe("https://acme.example/")
    expect(normalizeSiteUrl("http://acme.example/de/#x")?.toString()).toBe("https://acme.example/de/")
  })

  it("rejects things that are not public web addresses", () => {
    expect(normalizeSiteUrl("")).toBeNull()
    expect(normalizeSiteUrl("localhost")).toBeNull()
    expect(normalizeSiteUrl("ftp://acme.example")).toBeNull()
  })
})
