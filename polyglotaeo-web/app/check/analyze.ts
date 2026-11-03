/**
 * Pure analysis for the free AEO checker at /check/. Takes what the public
 * site served (fetched through the Polyglot verify proxy) and returns
 * findings. No DOM APIs, so it runs and is tested in Node.
 */

export type FindingStatus = "pass" | "warn" | "fail"

export interface Finding {
  id: string
  label: string
  status: FindingStatus
  detail: string
  /** True when Polyglot AEO can fix or generate this from inside Framer. */
  polyglotFixes: boolean
}

/** What one fetch returned; null when the request itself failed. */
export type Fetched = { status: number; text: string } | null

export interface SiteSnapshot {
  page: Fetched
  llms: Fetched
  robots: Fetched
  sitemap: Fetched
}

export interface SiteReport {
  reachable: boolean
  score: number
  findings: Finding[]
  isFramer: boolean
  locales: string[]
  schemaTypes: string[]
}

const WEIGHTS: Record<string, number> = {
  lang: 2,
  title: 2,
  description: 2,
  canonical: 1,
  hreflang: 2,
  jsonld: 3,
  identity: 1,
  opengraph: 1,
  llms: 2,
  "ai-crawlers": 2,
  sitemap: 1,
}

const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]

type Attrs = Record<string, string>

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .trim()
}

function parseAttrs(source: string): Attrs {
  const attrs: Attrs = {}
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  for (const match of source.matchAll(pattern)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "")
  }
  return attrs
}

function tags(html: string, name: string): Attrs[] {
  const pattern = new RegExp(`<${name}\\b([^>]*)>`, "gi")
  return [...html.matchAll(pattern)].map((match) => parseAttrs(match[1]))
}

function relIncludes(attrs: Attrs, rel: string): boolean {
  return (attrs.rel ?? "").toLowerCase().split(/\s+/).includes(rel)
}

function metaContent(html: string, key: string): string {
  const tag = tags(html, "meta").find(
    (attrs) => (attrs.name ?? attrs.property ?? "").toLowerCase() === key,
  )
  return tag?.content ?? ""
}

function servedOk(fetched: Fetched): fetched is { status: number; text: string } {
  return fetched !== null && fetched.status >= 200 && fetched.status < 300
}

function looksLikeHtml(text: string): boolean {
  return /^\s*(<!doctype html|<html)/i.test(text)
}

function schemaTypesOf(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) schemaTypesOf(item, out)
    return
  }
  if (value === null || typeof value !== "object") return
  const node = value as Record<string, unknown>
  const type = node["@type"]
  for (const t of Array.isArray(type) ? type : [type]) {
    if (typeof t === "string") out.add(t)
  }
  if (Array.isArray(node["@graph"])) schemaTypesOf(node["@graph"], out)
}

/** Which AI crawlers robots.txt shuts out of the whole site. */
export function blockedAiCrawlers(robots: string): string[] {
  const groups: Array<{ agents: string[]; disallowAll: boolean }> = []
  let current: { agents: string[]; disallowAll: boolean } | null = null
  let lastWasAgent = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim()
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!match) continue
    const field = match[1].toLowerCase()
    const value = match[2].trim()
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallowAll: false }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (current && field === "disallow" && value === "/") current.disallowAll = true
  }

  return AI_CRAWLERS.filter((crawler) => {
    const own = groups.find((group) => group.agents.includes(crawler.toLowerCase()))
    const group = own ?? groups.find((g) => g.agents.includes("*"))
    return Boolean(group?.disallowAll)
  })
}

function finding(
  id: string,
  label: string,
  status: FindingStatus,
  detail: string,
  polyglotFixes = false,
): Finding {
  return { id, label, status, detail, polyglotFixes }
}

export function analyzeSite(snapshot: SiteSnapshot): SiteReport {
  if (!servedOk(snapshot.page) || !snapshot.page.text) {
    const status = snapshot.page ? `HTTP ${snapshot.page.status}` : "no response"
    return {
      reachable: false,
      score: 0,
      isFramer: false,
      locales: [],
      schemaTypes: [],
      findings: [
        finding("reachable", "Page reachable", "fail", `The page could not be loaded (${status}). Check the URL and that the site is published.`),
      ],
    }
  }

  const html = snapshot.page.text
  const findings: Finding[] = []

  const htmlTag = tags(html, "html")[0] ?? {}
  findings.push(
    htmlTag.lang
      ? finding("lang", "Page language", "pass", `<html lang="${htmlTag.lang}"> tells search and AI engines the page language.`)
      : finding("lang", "Page language", "fail", "The <html> tag has no lang attribute, so engines have to guess the language."),
  )

  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
  findings.push(
    !title
      ? finding("title", "Title tag", "fail", "No <title>. Answer engines use it as the page's name.", true)
      : title.length < 10 || title.length > 65
        ? finding("title", "Title tag", "warn", `"${title}" is ${title.length} characters; 10–65 reads best in results.`, true)
        : finding("title", "Title tag", "pass", `"${title}"`),
  )

  const description = metaContent(html, "description")
  findings.push(
    !description
      ? finding("description", "Meta description", "fail", "No meta description, so engines write their own summary.", true)
      : description.length < 50 || description.length > 170
        ? finding("description", "Meta description", "warn", `${description.length} characters; 50–170 is the useful range.`, true)
        : finding("description", "Meta description", "pass", `${description.length} characters.`),
  )

  const links = tags(html, "link")
  const canonical = links.find((attrs) => relIncludes(attrs, "canonical"))
  findings.push(
    canonical?.href
      ? finding("canonical", "Canonical URL", "pass", canonical.href)
      : finding("canonical", "Canonical URL", "warn", "No canonical link, so duplicate URLs can split ranking signals."),
  )

  const alternates = links.filter((attrs) => relIncludes(attrs, "alternate") && attrs.hreflang)
  const locales = [...new Set(alternates.map((attrs) => attrs.hreflang))]
  const realLocales = locales.filter((locale) => locale.toLowerCase() !== "x-default")
  findings.push(
    realLocales.length < 2
      ? finding("hreflang", "Language versions (hreflang)", "warn", "No hreflang alternates found. If the site has other languages, engines cannot connect them.", true)
      : !locales.some((locale) => locale.toLowerCase() === "x-default")
        ? finding("hreflang", "Language versions (hreflang)", "warn", `${realLocales.length} languages linked (${realLocales.join(", ")}), but no x-default fallback.`, true)
        : finding("hreflang", "Language versions (hreflang)", "pass", `${realLocales.length} languages linked with an x-default: ${realLocales.join(", ")}.`),
  )

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
    (match) => (parseAttrs(match[1]).type ?? "").toLowerCase() === "application/ld+json",
  )
  const types = new Set<string>()
  let invalidBlocks = 0
  for (const match of scripts) {
    try {
      schemaTypesOf(JSON.parse(match[2]), types)
    } catch {
      invalidBlocks += 1
    }
  }
  const schemaTypes = [...types].sort()
  findings.push(
    scripts.length === 0
      ? finding("jsonld", "Structured data (JSON-LD)", "fail", "No JSON-LD found. Structured data is how answer engines learn what the page is about.", true)
      : invalidBlocks > 0
        ? finding("jsonld", "Structured data (JSON-LD)", "warn", `${invalidBlocks} of ${scripts.length} JSON-LD blocks are not valid JSON.`, true)
        : finding("jsonld", "Structured data (JSON-LD)", "pass", `${scripts.length} block${scripts.length === 1 ? "" : "s"}: ${schemaTypes.join(", ") || "untyped"}.`),
  )

  const hasIdentity = types.has("Organization") || types.has("WebSite") || types.has("LocalBusiness") || types.has("Person")
  findings.push(
    hasIdentity
      ? finding("identity", "Brand identity schema", "pass", "Organization / WebSite schema tells engines who is behind the site.")
      : finding("identity", "Brand identity schema", "warn", "No Organization, WebSite, LocalBusiness or Person schema to identify the brand.", true),
  )

  const og = ["og:title", "og:description", "og:image"].filter((key) => !metaContent(html, key))
  findings.push(
    og.length === 0
      ? finding("opengraph", "Open Graph tags", "pass", "Title, description and image are set for link previews.")
      : finding("opengraph", "Open Graph tags", "warn", `Missing ${og.join(", ")}.`, true),
  )

  const llms = snapshot.llms
  findings.push(
    servedOk(llms) && llms.text.trim() && !looksLikeHtml(llms.text)
      ? finding("llms", "llms.txt", "pass", llms.text.trim().startsWith("#") ? "Present, with a Markdown title." : "Present.")
      : finding("llms", "llms.txt", "fail", "No /llms.txt. It gives AI assistants a curated map of the site.", true),
  )

  const blocked = servedOk(snapshot.robots) ? blockedAiCrawlers(snapshot.robots.text) : []
  findings.push(
    blocked.length > 0
      ? finding("ai-crawlers", "AI crawler access", "fail", `robots.txt blocks ${blocked.join(", ")}, so those assistants cannot read the site.`)
      : finding("ai-crawlers", "AI crawler access", "pass", servedOk(snapshot.robots) ? "robots.txt does not block the major AI crawlers." : "No robots.txt, so crawlers are allowed by default."),
  )

  const sitemap = snapshot.sitemap
  findings.push(
    servedOk(sitemap) && /<(urlset|sitemapindex)\b/i.test(sitemap.text)
      ? finding("sitemap", "XML sitemap", "pass", "/sitemap.xml is published.")
      : finding("sitemap", "XML sitemap", "warn", "No /sitemap.xml found."),
  )

  let earned = 0
  let total = 0
  for (const item of findings) {
    const weight = WEIGHTS[item.id] ?? 1
    total += weight
    earned += item.status === "pass" ? weight : item.status === "warn" ? weight / 2 : 0
  }

  const generator = metaContent(html, "generator")
  return {
    reachable: true,
    score: Math.round((earned / total) * 100),
    findings,
    isFramer: /framer/i.test(generator) || /framerusercontent\.com/.test(html),
    locales: realLocales,
    schemaTypes,
  }
}

/** Normalize what a visitor typed into an https origin + path, or null. */
export function normalizeSiteUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    url.protocol = "https:"
    url.hash = ""
    return url.hostname.includes(".") ? url : null
  } catch {
    return null
  }
}
