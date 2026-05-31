import { framer } from "framer-plugin"

export interface CollectionSummary {
  id: string
  name: string
  /**
   * URL-friendly path segment used to compose item URLs.
   *
   * The Framer Plugin SDK does not expose a collection-level slug — collections
   * own a `slugFieldName` (the human-friendly name of the field whose value
   * becomes each item's slug) but the URL prefix is decided at site-render
   * time. We surface a best-effort approximation that the user can override
   * via the llms.txt UI's base path field.
   */
  slug: string
  itemCount: number
  /**
   * Field NAMES (human labels, e.g. "Title", "Headline", "Description")
   * suitable for use as the title or summary of an llms.txt entry.
   *
   * Filtered to ONLY string-like field types — `string` and
   * `formattedText` — because those are the only types whose value
   * makes sense as a Markdown link label or trailing summary. Image
   * / Date / Link / CollectionReference fields are intentionally
   * excluded: picking them as a summary field would emit a URL,
   * timestamp, or `[object]` literal into llms.txt, which is the
   * exact UX bug this filter exists to prevent.
   *
   * Empty array when the SDK call fails — callers should treat that
   * as "unknown schema" and fall back to a free-form input where
   * the designer types the field name.
   */
  fieldNames: string[]
}

/**
 * Field `.type` values that surface usable text for llms.txt
 * generation. The Framer SDK exposes 13+ field variants
 * (boolean, color, number, image, link, date, file, enum,
 * collectionReference, multiCollectionReference, array, divider,
 * unsupported); only these two are guaranteed to expose a string
 * value via `entry.value` and per-locale `valueByLocale`.
 *
 * Kept private to this module — exposing it to callers would
 * leak SDK type discriminators into UI code that doesn't otherwise
 * need to know about field internals.
 */
const STRING_LIKE_FIELD_TYPES = new Set(["string", "formattedText"])

export interface CollectionItemRow {
  id: string
  slug: string
  /**
   * `true` when the item is unpublished — author saved it in the CMS
   * but hasn't published it to the live site. Draft items DO appear in
   * `getItems()` but their slug may be empty AND they have no public
   * URL, so callers should typically skip them when generating
   * site-facing artifacts (schema, llms.txt, sitemap).
   */
  draft: boolean
  /**
   * Default-locale field values, keyed by field NAME (the human label,
   * e.g. "Title"). Kept as the legacy default to preserve existing
   * call-sites; per-locale lookups use {@link fieldValuesByLocale}.
   */
  fieldValues: Record<string, unknown>
  /**
   * Per-locale field values, keyed by LocaleId then by field NAME.
   *
   *   fieldValuesByLocale["fr-FR"]?.["Title"] // localized title or undefined
   *
   * Populated only for fields that expose `valueByLocale` (string,
   * formattedText, image — see Framer SDK `InlineLocalizationValueByLocale`).
   * Entries are present ONLY when the localization status is
   * "done" / "needsReview" / "warning" AND the value is a non-null
   * string. The `"new"` status (LocalizationValueNew) is the SDK's
   * "explicit fallback to the default locale" signal; we deliberately
   * omit those keys so callers can detect "actually localized" vs
   * "explicit fallback" simply by checking presence.
   *
   * The "fall back to default-locale content" decision belongs to the
   * caller (e.g. llms.txt skips, schema may want to preserve the
   * default value). Centralizing the decision here would silently
   * leak default-locale text into surfaces that should reject it —
   * the bug this field exists to fix.
   */
  fieldValuesByLocale: Record<string, Record<string, unknown>>
  /** Per-locale variant of the slug, when available. */
  localeSlugs: Record<string, string>
}

export async function listCollections(): Promise<CollectionSummary[]> {
  const collections = await framer.getCollections()
  const summaries: CollectionSummary[] = []
  for (const c of collections) {
    const items = await c.getItems()
    // Field names are surfaced for the picker UI so it can show
    // designers which fields the auto-detector matched. Failures
    // (rare, but possible if a collection migration is mid-flight)
    // become an empty list — caller treats that as "schema unknown"
    // and the heuristic still runs against whatever fields are
    // present at read time.
    //
    // We narrow to string-like field types here so the picker
    // dropdown doesn't list Image / Date / Link / CollectionReference
    // entries the designer can't sensibly use as a title or summary.
    // Some Field variants (FieldDivider) have no `.name` property —
    // filtering by type also removes those without a separate guard.
    let fieldNames: string[] = []
    try {
      const fields = await c.getFields()
      fieldNames = fields
        .filter((f): f is typeof f & { name: string } => {
          const type = (f as { type?: unknown }).type
          if (typeof type !== "string") return false
          if (!STRING_LIKE_FIELD_TYPES.has(type)) return false
          return typeof (f as { name?: unknown }).name === "string"
        })
        .map((f) => f.name)
    } catch {
      fieldNames = []
    }
    summaries.push({
      id: c.id,
      name: c.name,
      slug: slugify(c.name),
      itemCount: items.length,
      fieldNames,
    })
  }
  return summaries
}

/**
 * Default candidate names we look for when auto-picking the title
 * field of a CMS collection. Order matters — the picker takes the
 * FIRST match, so "Title" wins over "Name" in a schema that has
 * both. Designers can override per-collection in the UI when their
 * schema uses something unusual ("Headline" works out of the box;
 * "ProductHeadline" needs an override).
 *
 * Exported so the LlmsTxtView UI can show the same hint copy without
 * duplicating the list. Mirrors the candidates already in
 * `site-scan.ts:pickStringField` but pulled into a shared constant
 * so future tweaks (adding "Heading"? "Subject"?) flow to both
 * surfaces in one edit.
 */
export const DEFAULT_TITLE_FIELD_CANDIDATES: ReadonlyArray<string> = [
  "Title",
  "Name",
  "Headline",
  "Heading",
]

export const DEFAULT_SUMMARY_FIELD_CANDIDATES: ReadonlyArray<string> = [
  "Summary",
  "Description",
  "Excerpt",
  "Subtitle",
]

/**
 * Pure helper: given the field names declared on a collection (in
 * any case), return the best-guess title field name — preserving
 * the casing of the actual collection field. `null` when nothing
 * matches a known candidate.
 *
 * Why case-insensitive: Framer designers spell field names however
 * they want ("title", "Title", "TITLE"). The collection's actual
 * casing is what the row's `fieldValues` map is keyed by, so we
 * return the original casing for the caller to use as a lookup
 * key.
 */
export function pickTitleField(
  fieldNames: ReadonlyArray<string>,
  candidates: ReadonlyArray<string> = DEFAULT_TITLE_FIELD_CANDIDATES,
): string | null {
  return pickFieldByCandidates(fieldNames, candidates)
}

export function pickSummaryField(
  fieldNames: ReadonlyArray<string>,
  candidates: ReadonlyArray<string> = DEFAULT_SUMMARY_FIELD_CANDIDATES,
): string | null {
  return pickFieldByCandidates(fieldNames, candidates)
}

function pickFieldByCandidates(
  fieldNames: ReadonlyArray<string>,
  candidates: ReadonlyArray<string>,
): string | null {
  for (const candidate of candidates) {
    const match = fieldNames.find(
      (name) => name.toLowerCase() === candidate.toLowerCase(),
    )
    if (match) return match
  }
  return null
}

export async function readCollectionItems(collectionId: string): Promise<CollectionItemRow[]> {
  const collections = await framer.getCollections()
  const collection = collections.find((c) => c.id === collectionId)
  if (!collection) return []

  const items = await collection.getItems()
  const fields = await collection.getFields()

  const rows: CollectionItemRow[] = []
  for (const item of items) {
    const fieldValues: Record<string, unknown> = {}
    const fieldValuesByLocale: Record<string, Record<string, unknown>> = {}
    for (const field of fields) {
      const entry = item.fieldData[field.id]
      if (!entry || typeof entry !== "object") continue

      // Default-locale value (legacy `fieldValues` map).
      if ("value" in entry) {
        fieldValues[field.name] = (entry as { value: unknown }).value
      }

      // Per-locale values. Only present on string-like fields
      // (string, formattedText, image — anything that supports
      // `InlineLocalizationValueByLocale`). We treat the
      // status === "new" rows (LocalizationValueNew) as "no
      // localized content" because the SDK uses `value: null` to
      // mean "explicit fallback to the default locale". Including
      // those would re-introduce the "EN-titles-in-llms-ja.txt"
      // bug we're fixing.
      const valueByLocale = (entry as { valueByLocale?: unknown })
        .valueByLocale
      if (valueByLocale && typeof valueByLocale === "object") {
        for (const [localeId, raw] of Object.entries(
          valueByLocale as Record<string, unknown>,
        )) {
          if (!raw || typeof raw !== "object") continue
          const v = raw as { value?: unknown; status?: unknown }
          // "new" = author hasn't filled in this locale yet → fall
          // back. Any other status with a non-null string value is
          // genuinely localized content.
          if (v.status === "new") continue
          if (typeof v.value !== "string" || v.value.length === 0) continue
          if (!fieldValuesByLocale[localeId]) {
            fieldValuesByLocale[localeId] = {}
          }
          fieldValuesByLocale[localeId][field.name] = v.value
        }
      }
    }

    const localeSlugs: Record<string, string> = {}
    if (item.slugByLocale) {
      for (const [localeId, value] of Object.entries(item.slugByLocale)) {
        if (typeof value === "string") localeSlugs[localeId] = value
      }
    }

    rows.push({
      id: item.id,
      slug: item.slug,
      draft: item.draft ?? false,
      fieldValues,
      fieldValuesByLocale,
      localeSlugs,
    })
  }
  return rows
}

/**
 * `true` when the CMS row should NOT be expanded into a public-facing
 * URL — used by site-scan to avoid emitting JSON-LD with literal
 * `:slug` placeholders for draft / slug-less items.
 *
 * Pure helper, isolated for unit testing. Two skip reasons today:
 *   1. `draft === true` — the author hasn't published the item yet.
 *   2. `slug.trim() === ""` — Framer surfaces freshly created items
 *      with an empty slug until the author types one. The detail
 *      page route still has `:slug` in its path, so without a real
 *      slug the URL would resolve to `/blog/:slug` literally.
 */
export function shouldSkipCmsRow(row: CollectionItemRow): boolean {
  if (row.draft) return true
  if (!row.slug || !row.slug.trim()) return true
  return false
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
