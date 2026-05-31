import { framer, isWebPageNode } from "framer-plugin"

import {
  composeUrl,
  extractStaticPageContent,
  isTemplatePath,
} from "./site-scan"

/**
 * llms.txt-focused static page enumeration.
 *
 * Why this lives separately from the heavier {@link import("./site-scan").scanSite}:
 *   - llms.txt only needs **static** WebPages (the existing CMS items
 *     are already covered by the multi-collection picker in
 *     LlmsTxtView). Re-running CMS expansion here would double-count.
 *   - The Schema audit's full scan reads every collection's items
 *     (potentially hundreds). When the designer just wants to add
 *     `/about` and `/contact` to their llms.txt, we want a fast
 *     no-CMS pass.
 *   - Failure-tolerant: a single bad WebPageNode shouldn't fail the
 *     whole scan. We swallow per-page errors and surface partial
 *     results so the picker still works.
 *
 * Filtering rules (intentional, not configurable):
 *   - Pages without a published `path` are skipped (drafts / legacy
 *     CMS detail templates with `null` path). They have no public URL.
 *   - Template paths (`[slug]`, `:slug`) are skipped — those represent
 *     CMS detail pages whose URLs only materialize once we substitute
 *     a slug, which we don't have here.
 *   - Pages bound to a CMS collection (`wp.collectionId`) ARE skipped
 *     for the same reason: they're not the "static page about the
 *     studio" pages — they're collection templates. The collection's
 *     items have already been added via the multi-collection picker,
 *     and the COLLECTION LANDING (e.g. `/blog`) we leave to the
 *     designer to add manually if they want.
 *   - The homepage (`/`) is included in the result so the UI can
 *     render it with a "(homepage)" badge — but it's NOT preselected
 *     by default (see {@link defaultPickedPageIds}). The H1 + `>`
 *     blockquote at the top of llms.txt already plays the homepage
 *     role; emitting `/` again as a link is redundant.
 */
export interface StaticPageEntry {
  /** Stable WebPageNode id — the React-key for the picker. */
  id: string
  /** Original Framer path, e.g. `/about`, `/services/branding`. */
  rawPath: string
  /** Final canonical URL with the project base URL applied. */
  url: string
  /**
   * Best-effort title for the page. Priority: H1 → page name → path
   * basename. Always non-empty (we fall back to the path when even
   * the H1 walk yields nothing). The picker UI shows this; the
   * generator emits it as the `[label](url)` text.
   */
  title: string
  /**
   * Best-effort one-line description. May be empty when the page
   * is mostly hero / image and has no body paragraph the SDK can
   * read. The generator omits the `: …` suffix when empty.
   */
  description: string
  /**
   * Useful as a UI badge ("Home"). The homepage is *always* in the
   * result so the picker can show it, but it's not in
   * {@link defaultPickedPageIds}.
   */
  isHomepage: boolean
}

/**
 * Scan the project for static-only WebPage entries suitable for the
 * llms.txt "Pages" section. Reuses the canvas content extractor
 * from `site-scan.ts` so title/description quality matches the
 * Schema scanner.
 *
 * Pure (modulo SDK reads). Errors per-page are swallowed and
 * surfaced as `partial = true` so the caller can offer a "we
 * skipped some pages" hint. Returns an empty list (not throws)
 * when the SDK read fails entirely — calling code already shows
 * an "empty state" UI for "no static pages" so it doesn't need a
 * separate error mode.
 */
export interface ScanStaticPagesResult {
  pages: StaticPageEntry[]
  /** True when at least one page errored during scan. */
  partial: boolean
}

export async function scanStaticPages(
  baseUrl: string,
): Promise<ScanStaticPagesResult> {
  let allPages: import("framer-plugin").WebPageNode[]
  try {
    allPages = await framer.getNodesWithType("WebPageNode")
  } catch {
    return { pages: [], partial: false }
  }

  const out: StaticPageEntry[] = []
  let partial = false

  for (const wp of allPages) {
    if (!isWebPageNode(wp)) continue
    if (!wp.path) continue
    if (isTemplatePath(wp.path)) continue
    // CMS-bound pages: they're collection templates, not static
    // "About" / "Contact" pages. Skip — the multi-collection picker
    // already covers their items.
    if (wp.collectionId) continue

    try {
      const content = await extractStaticPageContent(wp)
      // Title priority: H1 from canvas → derived from path. Framer's
      // `WebPageNode` doesn't expose a `name` field on the public SDK
      // surface, so we can't fall back to a designer-set node label.
      // The path-derived fallback handles the worst case ("/services"
      // → "Services") which is good enough for a picker label.
      const title =
        (content.title ?? "").trim() || deriveTitleFromPath(wp.path)
      const description = (content.description ?? "").trim()

      out.push({
        id: wp.id,
        rawPath: wp.path,
        url: composeUrl(baseUrl, wp.path, null),
        title,
        description,
        isHomepage: wp.path === "/",
      })
    } catch (e) {
      partial = true
      console.warn("[Polyglot AEO] static page scan error", wp.id, e)
    }
  }

  return {
    pages: dedupeAndSort(out),
    partial,
  }
}

/**
 * The set of page ids we preselect when the picker first opens. The
 * heuristic is "depth ≤ 1, not the homepage" — i.e. top-level pages
 * like `/about`, `/services`, `/contact`, but not deep-nested
 * landing pages like `/services/branding/process`. Mirrors how
 * Framer's own llms.txt structures its "Features" / "Resources"
 * sections (top-level entry pages, not every leaf).
 *
 * Pure helper, exported for tests. Designers can always tick more
 * boxes manually — this just gives a sensible starting state
 * instead of an empty checklist.
 */
export function defaultPickedPageIds(
  pages: ReadonlyArray<StaticPageEntry>,
): string[] {
  return pages
    .filter((p) => !p.isHomepage)
    .filter((p) => pathDepth(p.rawPath) <= 1)
    .map((p) => p.id)
}

/**
 * Path depth ≈ number of forward-slash segments. `/` is depth 0,
 * `/about` is 1, `/services/branding` is 2.
 */
function pathDepth(rawPath: string): number {
  if (rawPath === "/" || rawPath === "") return 0
  const trimmed = rawPath.replace(/^\/+|\/+$/g, "")
  return trimmed.split("/").length
}

/**
 * Convert `/services/branding` → "Services Branding" as a last-
 * resort title. Only used when the H1 walk and page-name lookup
 * both come up empty.
 */
function deriveTitleFromPath(rawPath: string): string {
  const trimmed = rawPath.replace(/^\/+|\/+$/g, "")
  if (!trimmed) return "Home"
  return trimmed
    .split("/")
    .map((seg) =>
      seg
        .split(/[-_]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )
    .join(" / ")
}

/**
 * Deduplicate by URL (some Framer projects expose the same page
 * twice via aliases) and sort: homepage first, then by depth, then
 * alphabetical by path. The homepage is always first because the
 * picker badges it specially. Within the same depth alphabetical
 * is stable so the list doesn't reshuffle between scans.
 */
function dedupeAndSort(pages: StaticPageEntry[]): StaticPageEntry[] {
  const seen = new Set<string>()
  const deduped: StaticPageEntry[] = []
  for (const p of pages) {
    if (seen.has(p.url)) continue
    seen.add(p.url)
    deduped.push(p)
  }
  return deduped.sort((a, b) => {
    if (a.isHomepage && !b.isHomepage) return -1
    if (!a.isHomepage && b.isHomepage) return 1
    const da = pathDepth(a.rawPath)
    const db = pathDepth(b.rawPath)
    if (da !== db) return da - db
    return a.rawPath.localeCompare(b.rawPath)
  })
}
