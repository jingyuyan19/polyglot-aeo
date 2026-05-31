import { deriveBrandName } from "../framer/site-scan"

/**
 * Site-wide identity fields shared across all JSON-LD blocks for a
 * project. Derived once via {@link deriveSiteIdentity} (1 AI call),
 * translated once per locale via {@link translateSiteIdentity}, then
 * injected into Article publisher / Organization name / etc. at
 * render time.
 *
 * This is the V2 architecture's source-of-truth for site-identity.
 * Per-page proposals never carry these fields — they're resolved
 * deterministically at install time from this struct, so the same
 * brand/publisher/author appears in every Article in every locale.
 *
 * Compact by design: the persisted bundle (identity + per-locale
 * translations) must round-trip through Framer's plugin data store
 * (2 KB per key, 4 KB combined). At ~250 B per locale × ~5 locales
 * ≈ 1.25 KB, leaving ~2 KB headroom for InstallSnapshot + prefs.
 *
 * See `docs/SCHEMA-ARCHITECTURE-V2.md` §4.1 for design rationale.
 */
export interface SiteIdentity {
  /**
   * Display name used for `Organization.name` and
   * `Article.publisher.name`. Should match the visible logo /
   * header brand on the live site.
   */
  brandName: string

  /**
   * Generic byline for Articles whose underlying content has no
   * specific author. Real bylines (per-page) override this at
   * render time.
   */
  defaultAuthor: string

  /** Optional Organization description for the homepage schema. */
  organizationDescription?: string

  /**
   * Optional canonical URL for `Article.publisher.url` and
   * `Organization.url`. Defaults to the site's hostname; only
   * differs when the org has a separate marketing domain or the
   * user customised it.
   */
  publisherUrl?: string

  /**
   * Optional logo URL for `Article.publisher.logo` and
   * `Organization.logo`. Google Rich Results expects a single
   * site-wide image; we never per-page it.
   */
  publisherLogo?: string

  /**
   * AI's confidence in the derived values, 0..1. Below 0.5 the
   * UI surfaces a "Review brand identity" warning before install.
   * 1.0 indicates the user typed the value themselves.
   */
  confidence: number

  /**
   * How the identity was determined. Drives staleness rules and
   * UI badges.
   *
   *   - `ai`: Phase 0 ran successfully and the AI returned values
   *     above the rejection threshold.
   *   - `hostname-fallback`: AI failed or returned unusable values
   *     and we synthesised an identity from the hostname only.
   *   - `user-edit`: the user manually edited the values; we
   *     never auto-invalidate user edits, even if the underlying
   *     pages change.
   */
  source: SiteIdentitySource

  /** Unix ms when this identity was last computed. */
  derivedAt: number
}

export type SiteIdentitySource = "ai" | "hostname-fallback" | "user-edit"

/**
 * Per-locale translation of the user-visible identity fields.
 *
 * Keys are BCP-47 locale codes (e.g. `"ja"`, `"zh-CN"`,
 * `"en-CA"`). Values intentionally exclude `confidence`,
 * `source`, and `derivedAt` — those are global metadata about
 * the identity itself, not about its translations.
 *
 * Missing locales fall back to the default-locale `SiteIdentity`
 * at render time (so a translation hiccup for one locale doesn't
 * break Install for the others).
 */
export type SiteIdentityTranslations = Record<
  string,
  Pick<
    SiteIdentity,
    "brandName" | "defaultAuthor" | "organizationDescription"
  >
>

/**
 * Persisted bundle: the identity, its per-locale translations, and
 * a hash of the input pages we used to derive it. The hash drives
 * the staleness check on re-scan — if the homepage / about content
 * is unchanged, we skip Phase 0/0.5 entirely.
 */
export interface SiteIdentityBundle {
  identity: SiteIdentity
  translations: SiteIdentityTranslations
  /**
   * Hash of the canonical pages used as Phase 0 input (homepage +
   * about + footer-y pages). Compared on re-scan to detect content
   * drift; matches → reuse cached identity. See `hashIdentityInputs`.
   */
  sourceHash: string
}

/**
 * Construct an instant fallback identity from the project's
 * hostname. Used when:
 *   - First plugin mount (no persisted identity yet) — gives the
 *     UI something to render before Phase 0 has a chance to run.
 *   - Phase 0 fails / returns garbage / returns generic placeholders
 *     that we reject downstream.
 *   - Tests that don't want to mock an AI call.
 *
 * Always succeeds: even an unparseable URL produces a generic
 * `{ brandName: "Site" }` identity that's better than crashing.
 *
 * Pure — no I/O, no SDK calls.
 */
export function hostnameFallbackIdentity(
  hostname: string | null | undefined,
): SiteIdentity {
  const brand = deriveBrandName(hostname) ?? "Site"
  return {
    brandName: brand,
    defaultAuthor: "Editorial Team",
    confidence: 0,
    source: "hostname-fallback",
    derivedAt: Date.now(),
  }
}

/**
 * Generic placeholder names we treat as "AI couldn't extract a real
 * brand". Identical semantics to `GENERIC_ORG_PLACEHOLDERS` in
 * `proposal.ts`, deliberately duplicated here to avoid a circular
 * import — both files are leaves of the schema dependency graph.
 *
 * Lowercased; compared against the trimmed brandName.
 */
const PLACEHOLDER_BRAND_NAMES: ReadonlySet<string> = new Set([
  "site",
  "website",
  "your site",
  "your website",
  "organization",
  "organisation",
  "company",
  "brand",
  "untitled",
  "untitled site",
])

/**
 * Detect identities that look unusable — a literal placeholder, an
 * empty brand, or an "AI returned the type word" failure mode. The
 * caller (Phase 0) decides what to do: substitute the hostname
 * fallback, lower confidence, or surface a warning.
 *
 * Pure.
 */
export function isPlaceholderIdentity(identity: SiteIdentity): boolean {
  const brand = identity.brandName.trim().toLowerCase()
  if (brand.length === 0) return true
  return PLACEHOLDER_BRAND_NAMES.has(brand)
}

/**
 * Build the deterministic hash of the pages used to derive identity.
 * Hash is the concatenation of `(path|title|first 800 chars of body)`
 * tuples for each input page, joined by ASCII unit-separator. Order
 * matters; callers MUST pass pages in a stable order.
 *
 * Implementation uses the same djb2 string-hash family that powers
 * `hashPageContent` for consistency. We stringify each tuple
 * defensively against undefined fields.
 *
 * Pure.
 */
export function hashIdentityInputs(
  inputs: ReadonlyArray<{
    path: string
    title: string | null
    bodyText: string
  }>,
): string {
  const SEP = "\u001F"
  const joined = inputs
    .map(
      (p) =>
        `${p.path}${SEP}${p.title ?? ""}${SEP}${(p.bodyText ?? "").slice(0, 800)}`,
    )
    .join(SEP)
  let h = 5381
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

/**
 * Resolve the identity to use for a specific locale.
 *
 * Resolution order:
 *   1. The per-locale translation entry (if present and has
 *      `brandName`).
 *   2. The default-locale identity itself — used when translation
 *      hasn't run for this locale yet, or when this IS the default
 *      locale.
 *
 * Returns the same `SiteIdentity` shape (with translation values
 * shallow-merged on top of the default identity) so render-time
 * code has a uniform API regardless of locale.
 *
 * Pure.
 */
export function resolveIdentityForLocale(
  identity: SiteIdentity,
  translations: SiteIdentityTranslations,
  localeCode: string,
  isDefaultLocale: boolean,
): SiteIdentity {
  if (isDefaultLocale) return identity
  const t = translations[localeCode]
  if (!t || !t.brandName?.trim()) return identity
  return {
    ...identity,
    brandName: t.brandName,
    defaultAuthor: t.defaultAuthor || identity.defaultAuthor,
    organizationDescription:
      t.organizationDescription ?? identity.organizationDescription,
  }
}

/**
 * Decide which non-default locales need Phase 0.5 identity translation.
 *
 * Rules:
 *   - Fresh identity (new brand/default author) invalidates every old
 *     translation, so all non-default locales are targets.
 *   - Cached identity only translates missing locales. This is the
 *     "user added Japanese after the first scan" path; without this,
 *     the new locale would silently fall back to source-language
 *     publisher/author forever.
 *
 * Pure and generic over the locale shape so UI code can pass the
 * Framer `LocaleInfo` objects directly while tests can use tiny
 * fixtures.
 */
export function pickIdentityTranslationTargets<
  T extends { code: string; isDefault: boolean },
>(
  locales: ReadonlyArray<T>,
  translations: SiteIdentityTranslations,
  identityRefreshed: boolean,
): T[] {
  const nonDefault = locales.filter((locale) => !locale.isDefault)
  if (identityRefreshed) return nonDefault
  return nonDefault.filter(
    (locale) => !translations[locale.code]?.brandName?.trim(),
  )
}

/**
 * Merge Phase 0.5 output into the cached identity translation map.
 *
 * When identity was refreshed, old translations belong to the old brand
 * and must be dropped. When identity was cached, Phase 0.5 is filling
 * only missing locales, so preserve existing entries and overlay the
 * fresh ones.
 */
export function mergeIdentityTranslations(
  current: SiteIdentityTranslations,
  fresh: SiteIdentityTranslations,
  identityRefreshed: boolean,
): SiteIdentityTranslations {
  return identityRefreshed ? fresh : { ...current, ...fresh }
}
