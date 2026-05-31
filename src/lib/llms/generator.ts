import type { CollectionItemRow, CollectionSummary } from "../framer/cms"
import type { LocaleInfo } from "../framer/locales"

export interface LlmsTxtSection {
  /** Section heading, e.g. "Articles", "Products". */
  title: string
  /** Optional one-line section description. */
  description?: string
  /** List of {label, url, summary} entries. */
  links: Array<{ label: string; url: string; summary?: string }>
}

export interface LlmsTxtConfig {
  siteName: string
  siteSummary: string
  baseUrl: string
  locale: LocaleInfo
  /** When true, prefix all URLs with `/{locale.slug}` per Framer's localized path convention. */
  localizedPaths: boolean
  sections: LlmsTxtSection[]
  /**
   * Optional multi-paragraph elaboration emitted between the `>`
   * blockquote and the first `##` section, mirroring Framer's own
   * llms.txt structure (https://framer.com/llms.txt).
   *
   * Why a free-form string and not a structured array of bullets:
   * the [llms.txt spec](https://llmstxt.org/#format) explicitly
   * encourages "any markdown" between the summary and the first
   * section heading. Our renderer therefore preserves the user's
   * paragraphs / bullets / soft line breaks verbatim — they're
   * the AEO signal density a one-line summary can't carry. We
   * leak-proof against accidental `##` headings inside the long
   * description by NOT escaping them: if a designer types a
   * heading they intended one, and the spec accepts it.
   *
   * Empty / whitespace-only → omitted entirely (no blank lines
   * accumulate between summary and sections).
   */
  longDescription?: string
}

/**
 * Renders a llms.txt file per the spec at https://llmstxt.org.
 *
 * The format is intentionally Markdown-compatible so that AI crawlers
 * (ChatGPT, Perplexity, Claude, Gemini) can ingest it without HTML noise.
 */
export function renderLlmsTxt(config: LlmsTxtConfig): string {
  const lines: string[] = []
  lines.push(`# ${config.siteName}`)
  lines.push("")
  lines.push(`> ${config.siteSummary}`)
  lines.push("")
  lines.push(`Language: ${config.locale.code} (${config.locale.name})`)
  lines.push("")

  // Long description: emitted after the locale header, before the
  // first `##`. We trim trailing whitespace so a designer's textarea
  // input (which often ends in a stray newline from "Enter pressed")
  // doesn't leak a double blank line into the file.
  const longDescription = (config.longDescription ?? "").trim()
  if (longDescription) {
    lines.push(longDescription)
    lines.push("")
  }

  for (const section of config.sections) {
    lines.push(`## ${section.title}`)
    if (section.description) {
      lines.push("")
      lines.push(section.description)
    }
    lines.push("")
    for (const link of section.links) {
      const summary = link.summary ? `: ${link.summary}` : ""
      lines.push(`- [${link.label}](${link.url})${summary}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * One row that was excluded from a locale's llms.txt section, plus the
 * reason. Surfaced to the UI so designers know the file is partial and
 * can go fill the missing CMS field in Framer's CMS panel.
 */
export interface SkippedItem {
  /** CMS row id, for cross-referencing. */
  itemId: string
  /** The default-locale title, when we have it — useful for "go fix
   * this item" affordances in the UI. Empty when even the default
   * value was missing. */
  defaultTitle: string
  /** Why we skipped it. */
  reason:
    | "missing-localized-title"
    | "missing-default-title"
    | "draft-or-no-slug"
}

/**
 * A group of CMS rows that share an identical title within the SAME
 * collection. Surfaced separately from `SkippedItem` because the rows
 * are NOT skipped — they're emitted as bullets, but the duplication
 * is a data-quality flag the designer should see and fix in Framer's
 * CMS panel.
 *
 * Why this matters: AI search engines weight `[Label](URL)` lines as
 * a label-to-link mapping. Two bullets with the SAME label but
 * DIFFERENT URLs creates ambiguity ("which one is the canonical?")
 * and the engine usually picks one — typically the first — and
 * silently drops the rest from its citation graph. This is a real
 * SEO loss the designer probably didn't notice when authoring the
 * CMS.
 *
 * Comparison is whitespace-trimmed and case-insensitive — "Web
 * Design" and "web design  " count as duplicates because that's how
 * the AI engine deduplication code treats them.
 */
export interface DuplicateTitleGroup {
  /** The shared title (preserves the first occurrence's casing). */
  title: string
  /**
   * The CMS row ids that share this title, in document order. ≥ 2
   * by construction — a group of size 1 is not a duplicate.
   */
  itemIds: string[]
  /**
   * The slugs the duplicate rows resolved to — useful for the UI
   * "go fix item with slug X" affordance, and for distinguishing
   * "two real CMS rows with the same title" from "two rows with the
   * same title AND same slug" (the latter is a route conflict).
   */
  slugs: string[]
}

export interface BuildSectionResult {
  section: LlmsTxtSection
  skipped: SkippedItem[]
  /**
   * Groups of rows that emitted bullets with the SAME title but
   * different URLs. Empty when the section is duplicate-clean.
   * Always per-locale (a row's localized title might be unique even
   * when its default-locale title is duplicated).
   */
  duplicateTitles: DuplicateTitleGroup[]
}

/**
 * Build a llms.txt section from a Framer CMS collection for ONE locale.
 *
 * Localization-correctness contract (the bug this version fixes):
 *
 *   - The default locale reads from `row.fieldValues` (the SDK's
 *     default-locale view).
 *   - Non-default locales read EXCLUSIVELY from
 *     `row.fieldValuesByLocale[locale.id]`. We do NOT silently fall
 *     back to `fieldValues` — that's how previous versions ended up
 *     emitting English titles in `llms-ja.txt`. If the localized
 *     value is missing, we SKIP the row and surface it as a
 *     {@link SkippedItem} so the UI can prompt the designer to fill
 *     it in.
 *   - Summary is "soft": missing localized summary still produces a
 *     link entry, just without the summary. Skipping items that
 *     happen to lack a summary would over-trim sections.
 */
export function buildSectionFromCollection(
  collection: CollectionSummary,
  rows: CollectionItemRow[],
  locale: LocaleInfo,
  baseUrl: string,
  options: {
    titleField: string
    summaryField?: string
    localizedPaths: boolean
  },
): BuildSectionResult {
  const links: LlmsTxtSection["links"] = []
  const skipped: SkippedItem[] = []

  for (const row of rows) {
    const defaultTitle = String(row.fieldValues[options.titleField] ?? "").trim()

    // Pick the per-locale view: default locale uses fieldValues
    // directly (it IS the default-locale view); non-default reads
    // from fieldValuesByLocale only.
    const localeView = locale.isDefault
      ? row.fieldValues
      : row.fieldValuesByLocale[locale.id]

    const title = localeView
      ? String(localeView[options.titleField] ?? "").trim()
      : ""

    if (!title) {
      // Two distinct failure modes — the UI can label them differently
      // ("translate this item" vs "title field is empty even in
      // default locale, fix the CMS").
      if (defaultTitle) {
        skipped.push({
          itemId: row.id,
          defaultTitle,
          reason: "missing-localized-title",
        })
      } else {
        skipped.push({
          itemId: row.id,
          defaultTitle: "",
          reason: "missing-default-title",
        })
      }
      continue
    }

    // Slugs follow Framer's own per-locale routing: prefer the
    // locale's slug if one exists, fall back to the default slug.
    // This is intentional — Framer ITSELF falls back here, so the
    // resulting URL is what visitors will land on.
    const slug = row.localeSlugs[locale.id] ?? row.slug
    const localePrefix = options.localizedPaths && !locale.isDefault ? `/${locale.slug}` : ""
    const url = `${stripTrailingSlash(baseUrl)}${localePrefix}/${collection.slug}/${slug}`

    // Summary: localized first, default-locale fallback when the
    // localized field is empty (soft fallback, see contract above).
    const localizedSummary = options.summaryField
      ? String(localeView?.[options.summaryField] ?? "").trim()
      : ""
    const fallbackSummary = options.summaryField
      ? String(row.fieldValues[options.summaryField] ?? "").trim()
      : ""
    const summary = localizedSummary || fallbackSummary

    links.push({
      label: title,
      url,
      summary: summary.length > 0 ? summary : undefined,
    })
  }

  // Detect bullets that share the same title within this section.
  // We track itemIds + slugs so the UI can show "row A vs row B"
  // when the designer goes to deduplicate. Comparison is
  // case-insensitive + trim because that's how AI engines fold
  // labels when building their citation graph.
  const seen = new Map<
    string,
    { title: string; itemIds: string[]; slugs: string[] }
  >()
  // Iterate `rows` directly (NOT `links`) so we have row.id/row.slug —
  // links don't carry the source-row identifiers. Use the same
  // localeView resolution as the main loop so we group on the
  // localized title (a row that has a UNIQUE localized title shouldn't
  // be flagged just because its default-locale title is duplicated).
  for (const row of rows) {
    const localeViewForDup = locale.isDefault
      ? row.fieldValues
      : row.fieldValuesByLocale[locale.id]
    const titleForDup = localeViewForDup
      ? String(localeViewForDup[options.titleField] ?? "").trim()
      : ""
    if (!titleForDup) continue
    const key = titleForDup.toLowerCase()
    let bucket = seen.get(key)
    if (!bucket) {
      bucket = { title: titleForDup, itemIds: [], slugs: [] }
      seen.set(key, bucket)
    }
    bucket.itemIds.push(row.id)
    bucket.slugs.push(row.localeSlugs[locale.id] ?? row.slug)
  }
  const duplicateTitles: DuplicateTitleGroup[] = []
  for (const bucket of seen.values()) {
    if (bucket.itemIds.length >= 2) {
      duplicateTitles.push(bucket)
    }
  }

  return {
    section: {
      title: collection.name,
      links,
    },
    skipped,
    duplicateTitles,
  }
}

function stripTrailingSlash(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input
}
