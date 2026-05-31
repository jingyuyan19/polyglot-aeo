import { framer, isWebPageNode } from "framer-plugin"

import { listCollections, readCollectionItems, shouldSkipCmsRow } from "./cms"

/**
 * SiteMap is the result of scanning a Framer project for everything that has
 * a public URL — static WebPages plus every CMS item that materializes into a
 * detail-page URL. Every entry is fully self-contained: enough metadata to
 * propose a schema kind and enough content to fill its fields.
 *
 * We keep the structure flat ("pages") rather than nested by source because
 * downstream callers (AI proposal, install, snapshot diff) all want to iterate
 * pages uniformly. The `source` discriminator lets the UI group / badge them.
 */
export interface ScannedPage {
  /**
   * Stable, deterministic id used as the snapshot key.
   *
   * - Static page: the WebPageNode id.
   * - CMS detail page item: `${webPageNodeId}::${itemId}` so the same
   *   template producing 50 blog posts yields 50 distinct ids without
   *   colliding with the template's own row.
   */
  id: string
  /** UI label — H1 → CMS title field → page name → derived from path. */
  label: string
  /** Path as Framer stores it, e.g. `/`, `/about`, `/blog/[slug]`. */
  rawPath: string
  /** Final canonical URL. CMS slugs substituted into `[slug]` placeholders. */
  url: string
  /** Convenience: rawPath === "/". */
  isHomepage: boolean
  /** Where this entry came from. */
  source: "static" | "cms"
  /** Populated when source === "cms". */
  cms?: {
    collectionId: string
    collectionName: string
    itemId: string
  }
  /**
   * Heuristic content distilled from the canvas / CMS. Whatever's null /
   * empty means we couldn't find it — the AI step will work with what's
   * available and ask for fewer fields.
   */
  content: {
    /** Best-guess title. Priority: first H1 > CMS title field > page name > slug. */
    title: string | null
    /** First non-empty paragraph that looks like body copy. */
    description: string | null
    /** Concatenated text sample (capped) for downstream LLM context. */
    bodyText: string
    /** All H1-H3 in encounter order. Useful for FAQPage detection. */
    headings: string[]
    /** Optional ISO date if the page is a dated CMS item. */
    publishedDate?: string
    /**
     * Best-guess hero image URL for the page, used to populate
     * `Article.image`, `Product.image`, `LocalBusiness.image`, etc.
     *
     * Resolution priority:
     *   - CMS items: first image-shaped field whose name matches
     *     `cover` / `image` / `thumbnail` / `featured` / `hero` /
     *     `photo`. Most blog templates use one of these names; we
     *     match them case-insensitively.
     *   - Static pages: first `FrameNode.backgroundImage.url` we hit
     *     while walking the page subtree (DOM order ≈ rendering
     *     order, so the hero usually comes first).
     *
     * Absent (`undefined`) is the explicit "no image found" case —
     * downstream code keeps the schema field optional so JSON-LD
     * stays valid. We never fabricate a URL.
     *
     * Why deterministic instead of asking the AI: image URLs are
     * structured data the model can't see anyway (we don't ship
     * binary content), and the model has been observed to
     * hallucinate plausible-looking URLs that 404. Reading the
     * canvas / CMS directly is both cheaper and more reliable.
     */
    image?: string
  }
  /**
   * Set on a STATIC page when its path is the parent of one or more
   * CMS detail pages — e.g. the `/blog` index page that lists items
   * scanned at `/blog/getting-started`, `/blog/whats-new`, etc.
   *
   * Why this matters: Framer's TextNode walker often picks up an H1
   * from inside a Collection List preview ("Getting Started") and
   * makes the parent page LOOK like a long-form article. AI then
   * confidently proposes Article — but `mainEntityOfPage.@id =
   * "/blog"` collides with the real Article at `/blog/getting-started`,
   * and Google sees two pages claiming the same headline.
   *
   * Downstream the prompt and proposal layers use this flag to:
   *   - Tell the AI to prefer Organization or low-confidence Article.
   *   - Auto-disable an Article proposal so the user must opt in.
   */
  collectionLanding?: {
    /** Display name of the collection(s) listed on this page. */
    collectionName: string
    /** How many CMS items live under this path. */
    itemCount: number
  }
}

export interface SiteMap {
  baseUrl: string
  scannedAt: number
  pages: ScannedPage[]
  /** True when scan succeeded but a few pages errored out. */
  partial: boolean
  /**
   * Brand-name fallback derived from the project's production hostname.
   * Used by the AI prompt + Organization proposal as a last resort when
   * the page itself yields no recognizable brand signal — without this
   * the Organization schema's `name` defaults to the literal string
   * "Organization" which then gets translated into 4 different generic
   * words (組織, Organisatie, Kuruluş, …) and pollutes the JSON-LD.
   *
   * `null` when we couldn't derive anything sensible (e.g. permission
   * denied on `getPublishInfo`); callers must treat this as "no brand
   * signal" and either skip Organization or surface the gap in UI.
   */
  brandName: string | null
}

/** How many text characters to keep per page sample before passing to AI. */
const BODY_SAMPLE_MAX_CHARS = 2000

/**
 * Resolve the project's production base URL. We fall back to a sensible
 * default rather than throwing — pre-publish projects don't have one yet,
 * but users still want to scan and see proposed schemas with placeholder
 * URLs.
 */
async function resolveBaseUrl(): Promise<string> {
  try {
    const info = await framer.getPublishInfo()
    const url = info.production?.url
    if (url) return url.replace(/\/$/, "")
  } catch {
    // ignore — pre-publish or permission denied
  }
  return "https://your-site.framer.website"
}

/**
 * Derive a human-friendly brand-name fallback from a hostname. Used as
 * a last-resort `name` for Organization schema proposals when the page
 * content itself yields no usable brand signal.
 *
 * Heuristic, intentionally simple:
 *
 *   - Framer staging subdomain (`<sub>.framer.website` or `.framer.app`)
 *     → "Title-cased <sub>", with kebab-case dashes turned into spaces.
 *     ("your-site.framer.website" → "Your Site")
 *
 *   - Custom domain → first label, kebab-cased dashes → spaces, title
 *     cased. ("my-site.com" → "My Site"). We deliberately ignore TLDs
 *     and the public suffix list — the cost of getting "myco.co.uk"
 *     wrong (we'd say "Myco" instead of "Myco UK") is small and the
 *     user can always type the real Organization name in manual edit.
 *
 *   - `null` input or unrecognizable shape → `null`. Callers MUST
 *     handle null by skipping the Organization fallback rather than
 *     using a placeholder.
 *
 * We strip `www.` because nobody reads brand names with the protocol
 * subdomain in them, and lowercasing everything before splitting keeps
 * `"Acme.com"` and `"acme.com"` from producing different brands.
 */
export function deriveBrandName(hostname: string | null | undefined): string | null {
  if (!hostname) return null
  const h = hostname.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
  if (!h) return null

  const framerMatch = /^([^.]+)\.framer\.(?:website|app)$/.exec(h)
  if (framerMatch) {
    return titleCase(framerMatch[1])
  }

  const firstLabel = h.split(".")[0]
  if (!firstLabel) return null
  return titleCase(firstLabel)
}

function titleCase(slug: string): string {
  // Split on dashes/underscores so "your-site" -> "Your Site" and
  // "your_site" -> "Your Site". We keep individual words short (no
  // recasing inside a word) so acronyms like "AEO" survive when a
  // future caller passes them in pre-formatted.
  const parts = slug.split(/[-_]+/).filter(Boolean)
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}

/**
 * Mark static pages whose path is the immediate parent of one or more
 * CMS detail-page items. Returns a NEW array — does not mutate the
 * input. Pages without a matching CMS landing relationship pass
 * through unchanged.
 *
 * Algorithm:
 *   1. Collect (parentPath → { collectionName, itemCount }) from every
 *      CMS-source page in the input.
 *   2. For each STATIC page, look up its rawPath in that map and copy
 *      the (collectionName, itemCount) onto the page as
 *      `collectionLanding`. CMS pages themselves never get the flag —
 *      they ARE the items, not the landing.
 *
 * Why parent-of-immediate-child only: deeper nesting (e.g. `/blog`
 * landing for `/blog/2024/post` is rare in Framer projects and risks
 * over-flagging unrelated routes. We can extend the matcher later if
 * users need it.
 *
 * Pure / deterministic so it can be unit-tested without SDK mocks.
 */
export function markCollectionLandings(pages: ScannedPage[]): ScannedPage[] {
  // parentPath -> aggregate
  const landings = new Map<string, { collectionName: string; itemCount: number }>()
  for (const p of pages) {
    if (p.source !== "cms") continue
    const parent = parentPathOf(p.rawPath)
    if (!parent) continue
    const existing = landings.get(parent)
    if (existing) {
      existing.itemCount += 1
    } else {
      landings.set(parent, {
        collectionName: p.cms?.collectionName ?? "items",
        itemCount: 1,
      })
    }
  }

  if (landings.size === 0) return pages

  return pages.map((p) => {
    if (p.source !== "static") return p
    const landing = landings.get(p.rawPath)
    if (!landing) return p
    return { ...p, collectionLanding: landing }
  })
}

/**
 * Strip the last path segment to compute the parent path. Returns
 * `null` if there is no parent (path is "/" or has no slash).
 *
 * Examples:
 *   "/blog/getting-started" → "/blog"
 *   "/products/widget"      → "/products"
 *   "/about"                → null  (parent would be "/", but a CMS
 *                                     item rarely lives at root level
 *                                     and treating "/" as a landing
 *                                     for any CMS would over-flag the
 *                                     homepage)
 *   "/"                     → null
 */
function parentPathOf(rawPath: string): string | null {
  if (!rawPath || rawPath === "/") return null
  const trimmed = rawPath.replace(/\/$/, "")
  const lastSlash = trimmed.lastIndexOf("/")
  if (lastSlash <= 0) return null
  return trimmed.slice(0, lastSlash)
}

/**
 * Compose a ScannedPage `url` from the project base + path, substituting any
 * placeholder segments with the resolved CMS slug.
 *
 * Framer's path serialization has used two placeholder styles across SDK
 * versions:
 *   - Legacy `[fieldName]` — bracket-style (e.g. `/blog/[slug]`)
 *   - Current `:fieldName` — colon-style (e.g. `/blog/:slug`)
 *
 * We replace BOTH unconditionally so a CMS detail-page URL becomes the
 * actual published URL (`/blog/getting-started`) rather than a template
 * literal (`/blog/:slug`) that Google would treat as a single duplicate
 * page across all items.
 *
 * Why include the colon form: as of Framer Plugin SDK ~3.10, `WebPageNode.path`
 * returns `:slug`. The old bracket regex silently no-op'd against this form,
 * causing every CMS Article to get the same broken `mainEntityOfPage.@id`.
 */
/**
 * Returns true when a path contains an unresolved placeholder segment
 * (legacy `[name]` or current `:name`). Such paths are CMS detail-page
 * templates that need a slug to materialize into a real URL — they
 * should NEVER be emitted as a static page entry on their own.
 *
 * Mirrors the placeholder shape accepted by {@link composeUrl}.
 */
export function isTemplatePath(path: string): boolean {
  return /\[[^\]]+\]|:[a-zA-Z]\w*/.test(path)
}

export function composeUrl(
  baseUrl: string,
  rawPath: string,
  slug: string | null,
): string {
  let path = rawPath
  if (slug) {
    // [name] (legacy) OR :name (current). The colon form requires a leading
    // letter so we don't accidentally eat parts of `://` if a caller passes
    // a full URL by mistake.
    path = path.replace(/\[[^\]]+\]|:[a-zA-Z]\w*/g, slug)
  }
  if (!path.startsWith("/")) path = "/" + path
  return `${baseUrl}${path === "/" ? "" : path}`
}

/**
 * Scan all WebPageNodes for TextNodes and pull content out. Used for static
 * pages (homepage, /about, etc.) where we don't have CMS field values to
 * lean on.
 *
 * We use the `tag` heuristic encoded in TextStyle to find the H1 — that's
 * almost always the page title. We collect H2/H3 as `headings` for FAQ
 * detection. The first paragraph after the H1 becomes our `description`
 * candidate; if there isn't one we fall back to the first non-heading line.
 */
export async function extractStaticPageContent(
  webPage: import("framer-plugin").WebPageNode,
): Promise<ScannedPage["content"]> {
  const textNodes = await webPage.getNodesWithType("TextNode")
  const all: Array<{ tag: string | null; text: string }> = []
  for (const tn of textNodes) {
    try {
      const text = await tn.getText()
      if (!text) continue
      const trimmed = text.replace(/\s+/g, " ").trim()
      if (!trimmed) continue
      // The TextNode SDK doesn't expose `tag` directly on every node — we
      // peek at the underlying name when present (Framer often uses node
      // names like "Heading 1"). This is best-effort; AI compensates when
      // structure is unclear.
      const tag = guessTagFromName(tn.name)
      all.push({ tag, text: trimmed })
    } catch {
      // Skip unreadable nodes — usually placeholder/locked content.
    }
  }

  const headings = all.filter((n) => n.tag?.startsWith("h")).map((n) => n.text)
  const title = headings[0] ?? null
  const description =
    all.find((n) => n.tag === "p" && n.text.length > 40)?.text ??
    all.find((n) => n.text.length > 40)?.text ??
    null

  const bodyText = all
    .map((n) => n.text)
    .join("\n")
    .slice(0, BODY_SAMPLE_MAX_CHARS)

  const image = await extractStaticPageImage(webPage)

  return { title, description, bodyText, headings, image }
}

/**
 * Walk a static page's FrameNode subtree looking for the first frame
 * with a non-null `backgroundImage` — that's almost always the hero /
 * cover image in DOM order. Best-effort: returns `undefined` when no
 * frames carry an image, when the SDK call throws, or when the page
 * is genuinely image-less.
 *
 * Caveats:
 *
 *   - We only inspect `backgroundImage` (the most common Framer pattern
 *     for hero artwork). Inline `<img>` rendered through
 *     ComponentInstanceNode props is NOT covered today — that path
 *     would require resolving each component's own image controls.
 *   - We bail at the first match. A page with a small icon as its
 *     first frame (rare; iconography is usually deeper in the tree)
 *     would surface the icon instead of a real hero. AI gets the
 *     fallback chance via the `image` field in the proposal step,
 *     and the user can still edit in manual mode.
 */
async function extractStaticPageImage(
  webPage: import("framer-plugin").WebPageNode,
): Promise<string | undefined> {
  try {
    const frames = await webPage.getNodesWithType("FrameNode")
    for (const frame of frames) {
      const url = frame.backgroundImage?.url
      if (typeof url === "string" && url.trim()) return url.trim()
    }
  } catch {
    // SDK errors here aren't fatal — the schema is still valid without
    // an image, just slightly less rich.
  }
  return undefined
}

function guessTagFromName(name: string | null): string | null {
  if (!name) return null
  const lower = name.toLowerCase()
  if (/h1|heading\s*1|title/.test(lower)) return "h1"
  if (/h2|heading\s*2/.test(lower)) return "h2"
  if (/h3|heading\s*3/.test(lower)) return "h3"
  if (/(paragraph|body|description|p\b)/.test(lower)) return "p"
  return null
}

/**
 * Pluck a string from a CMS item's field values. We try multiple field-name
 * spellings because users name their fields anything. Returns null if no
 * candidate matches or all candidates are empty.
 */
function pickStringField(
  fields: Record<string, unknown>,
  ...candidates: string[]
): string | null {
  for (const name of candidates) {
    for (const key of Object.keys(fields)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        const value = fields[key]
        if (typeof value === "string" && value.trim()) return value.trim()
      }
    }
  }
  return null
}

/**
 * Coerce an arbitrary CMS field value into a usable image URL string.
 *
 * The Framer Plugin SDK exposes image fields as `ImageAsset | undefined`
 * — a class with `.url`, `.altText`, `.thumbnailUrl`, `.resolution`. But:
 *
 *   - Older sites or upgraded projects sometimes surface raw URL strings
 *     (e.g. when the field type was migrated from String to Image).
 *   - Some array image fields wrap the asset in `{ value: ImageAsset }`.
 *   - Tests mock the SDK with plain object literals.
 *
 * We accept all three shapes defensively. Always returns the absolute
 * URL string or `undefined`; never throws.
 *
 * Pure helper, exported for unit testing.
 */
export function pickImageUrl(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (typeof obj.url === "string" && obj.url.trim()) return obj.url.trim()
    // Some entries arrive as `{ value: ImageAsset }` (array-field shape).
    if (
      typeof obj.value === "object" &&
      obj.value !== null &&
      typeof (obj.value as { url?: unknown }).url === "string"
    ) {
      const url = (obj.value as { url: string }).url.trim()
      return url.length > 0 ? url : undefined
    }
  }
  return undefined
}

/**
 * Find the first image-shaped CMS field whose name matches one of the
 * candidate names (case-insensitive). Iterates candidates in priority
 * order — `cover` before `image` before `photo` — so a Framer template
 * with both "Cover" and "Photo" image fields correctly prefers the
 * curated cover.
 */
function pickImageField(
  fields: Record<string, unknown>,
  ...candidates: string[]
): string | undefined {
  for (const name of candidates) {
    for (const key of Object.keys(fields)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        const url = pickImageUrl(fields[key])
        if (url) return url
      }
    }
  }
  return undefined
}

/**
 * Expand a single CMS detail-page WebPageNode into N ScannedPage rows — one
 * per item in the bound Collection. We read field values to fill content
 * heuristically (Title-ish field for `title`, Summary/Description-ish for
 * `description`, Body for `bodyText`).
 */
async function expandCmsDetailPage(
  webPage: import("framer-plugin").WebPageNode,
  baseUrl: string,
): Promise<ScannedPage[]> {
  if (!webPage.collectionId) return []

  const collections = await listCollections()
  const collection = collections.find((c) => c.id === webPage.collectionId)
  if (!collection) return []

  const items = await readCollectionItems(webPage.collectionId)
  const rows: ScannedPage[] = []

  for (const item of items) {
    // Drafts and slug-less items don't have a public URL — emitting
    // them would produce JSON-LD pointing at literal `:slug` (or
    // `[slug]`) placeholders and Google would treat the broken @id
    // as a single duplicate page across every item. Skip them.
    if (shouldSkipCmsRow(item)) continue

    const title = pickStringField(item.fieldValues, "title", "name", "headline")
    const description = pickStringField(
      item.fieldValues,
      "summary",
      "description",
      "excerpt",
      "subtitle",
    )
    const body = pickStringField(
      item.fieldValues,
      "body",
      "content",
      "article",
    )
    const date = pickStringField(item.fieldValues, "date", "publishedat", "publishdate")
    const image = pickImageField(
      item.fieldValues,
      "cover",
      "coverimage",
      "image",
      "thumbnail",
      "featured",
      "featuredimage",
      "hero",
      "heroimage",
      "photo",
    )

    rows.push({
      id: `${webPage.id}::${item.id}`,
      label: title ?? `${collection.name} — ${item.slug}`,
      rawPath: webPage.path ?? `/${collection.slug}/[slug]`,
      url: composeUrl(baseUrl, webPage.path ?? `/${collection.slug}/[slug]`, item.slug),
      isHomepage: false,
      source: "cms",
      cms: {
        collectionId: collection.id,
        collectionName: collection.name,
        itemId: item.id,
      },
      content: {
        title,
        description,
        bodyText: [title, description, body].filter(Boolean).join("\n\n").slice(
          0,
          BODY_SAMPLE_MAX_CHARS,
        ),
        headings: title ? [title] : [],
        publishedDate: date ?? undefined,
        image,
      },
    })
  }

  return rows
}

/**
 * Top-level entry. Returns a SiteMap with every URL-bearing surface in the
 * project, content-extracted and ready for AI proposal. Errors on individual
 * pages don't fail the whole scan — we mark `partial: true` instead.
 */
export async function scanSite(): Promise<SiteMap> {
  const baseUrl = await resolveBaseUrl()
  // Brand-name fallback: parsed once here so every per-page proposal
  // call below sees a consistent value (and so we don't re-parse the
  // hostname N times during AI orchestration). May be `null` for
  // pre-publish projects or when permission was denied.
  const brandName = deriveBrandName(extractHostname(baseUrl))
  const allPages = await framer.getNodesWithType("WebPageNode")

  const out: ScannedPage[] = []
  let partial = false

  for (const wp of allPages) {
    if (!isWebPageNode(wp)) continue
    if (!wp.path) continue // skip pages with no published path

    try {
      if (wp.collectionId) {
        const cmsRows = await expandCmsDetailPage(wp, baseUrl)
        out.push(...cmsRows)
        // Also include the template page itself only when it has a stable
        // path (e.g. /blog -> CollectionPage). Template patterns like
        // /blog/[slug] (legacy) or /blog/:slug (current) don't represent a
        // real public URL on their own — emitting them produces JSON-LD
        // with literal placeholder URLs that Google would treat as a single
        // duplicate page across every item.
        if (!isTemplatePath(wp.path)) {
          const content = await extractStaticPageContent(wp).catch(() => ({
            title: null,
            description: null,
            bodyText: "",
            headings: [],
          }))
          out.push({
            id: wp.id,
            label: content.title ?? wp.path,
            rawPath: wp.path,
            url: composeUrl(baseUrl, wp.path, null),
            isHomepage: wp.path === "/",
            source: "static",
            content,
          })
        }
      } else {
        const content = await extractStaticPageContent(wp)
        out.push({
          id: wp.id,
          label: content.title ?? wp.path,
          rawPath: wp.path,
          url: composeUrl(baseUrl, wp.path, null),
          isHomepage: wp.path === "/",
          source: "static",
          content,
        })
      }
    } catch (e) {
      partial = true
      console.warn("[Polyglot AEO] page scan error", wp.id, e)
    }
  }

  return {
    baseUrl,
    scannedAt: Date.now(),
    pages: markCollectionLandings(out),
    partial,
    brandName,
  }
}

/**
 * Extract the hostname from a URL string, returning `null` on parse
 * failure. We avoid the `URL` constructor's throwing behavior so the
 * scan never aborts because of a malformed publishInfo URL — better
 * to lose the brand-name fallback than to crash the audit.
 */
function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * Compute a stable hash for a ScannedPage's content so the snapshot diff can
 * detect when something changed without persisting full bodies. We hash the
 * fields the AI actually sees so a re-scan only flags pages where the AI's
 * output would meaningfully differ.
 *
 * Using a tiny, deterministic FNV-1a 32-bit because we don't need crypto-grade
 * resistance — just collision-avoidance across the small number of pages in
 * a single Framer project.
 */
export function hashPageContent(page: ScannedPage): string {
  const payload = [
    page.url,
    page.content.title ?? "",
    page.content.description ?? "",
    page.content.bodyText,
    page.content.headings.join("|"),
  ].join("\u0001")

  let h = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}
