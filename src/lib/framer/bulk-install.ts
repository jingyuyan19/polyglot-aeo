import type { LocaleInfo } from "./locales"
import { injectIntoHeadEnd, wrapJsonLdBlocks } from "./customCode"
import {
  buildSchema,
  localizeSchemaInput,
  serializeJsonLd,
  type SchemaInput,
} from "../schema"
import {
  resolveIdentityForLocale,
  type SiteIdentity,
  type SiteIdentityTranslations,
} from "../schema/identity"
import type { SchemaProposal } from "../schema/proposal"
import { isAuthorPlaceholder } from "../schema/site-identity"

/**
 * Per-proposal × per-locale schema input override map.
 *
 * Key: proposal.pageId
 * Value: locale.code → SchemaInput (translated/overridden values)
 *
 * When a key/locale pair is missing, we fall back to the proposal's default
 * inputs with only `language` and `canonicalUrl` swapped — same shape as the
 * old single-page install path.
 */
export type LocalizedOverrides = Record<string, Record<string, SchemaInput>>

export interface BulkInstallParams {
  proposals: SchemaProposal[]
  locales: LocaleInfo[]
  defaultLocale: LocaleInfo
  /** Optional translated inputs (one entry per proposal × non-default locale). */
  translations?: LocalizedOverrides
  /**
   * V2 site identity. When provided, drives Article publisher/author
   * AND Organization name/url/logo for every block — replacing the
   * per-proposal fields that used to drift across calls.
   *
   * When omitted (legacy / tests), expandProposalsToBlocks falls
   * back to the proposal's own inputs unchanged. This keeps the
   * Manual Schema view working without touching identity.
   */
  identity?: SiteIdentity
  /**
   * Per-locale identity translations (V2 Phase 0.5 output). Used at
   * render time to localize publisher.name, author.name, and
   * Organization fields without re-translating per-page.
   */
  identityTranslations?: SiteIdentityTranslations
}

export interface BulkInstallResult {
  preservedUserBytes: number
  installedBlocks: number
  enabledProposalCount: number
}

/**
 * Compose a localized canonical URL from the default URL + locale.
 *
 * Framer's localized routing convention is `/{slug}/path` — non-default
 * locales prefix the path with their slug. We respect the default locale
 * by leaving its URL unchanged.
 */
function localizedUrlFor(defaultUrl: string, locale: LocaleInfo): string {
  if (locale.isDefault) return defaultUrl
  try {
    const u = new URL(defaultUrl)
    const cleanPath = u.pathname === "/" ? "" : u.pathname
    u.pathname = `/${locale.slug}${cleanPath}`
    return u.toString().replace(/\/$/, "") || defaultUrl
  } catch {
    return defaultUrl
  }
}

/**
 * Inject site-identity fields into a localized SchemaInput. Pure.
 *
 * Resolution rules per kind:
 *
 *   • **Article**:
 *     - `publisherName` — ALWAYS from identity for the locale.
 *       Schema.org treats Article.publisher as the site-publishing
 *       organization, not a per-article concept; locking it kills
 *       cross-article drift.
 *     - `authorName` — decided by the SOURCE proposal's default-
 *       locale value (passed via `sourceArticleAuthor`), NOT the
 *       current `input.authorName`. The current input has already
 *       been through the AI translator, so a placeholder like
 *       "Editorial Team" comes back as "編集チーム" / "편집팀" /
 *       "Équipe de rédaction" — none of which match the English
 *       placeholder set, so without this signal the V2 contract
 *       breaks: 5 ko articles ended up with 4 different
 *       "editorial team" translations in production. With the
 *       source-as-truth check, we know upfront whether the byline
 *       is identity (placeholder source → all locales injected
 *       from identityTranslations) or per-page (real source →
 *       all locales keep the AI translation, including names like
 *       "Jane Smith" → "ジェーン・スミス").
 *     - `publisherLogo` — identity wins; per-page override only
 *       when explicitly set.
 *
 *   • **Organization**:
 *     - `name` — ALWAYS from identity (single canonical brand).
 *     - `description` — identity wins when present; otherwise the
 *       per-page value. The page-level Organization proposal
 *       (homepage / about) is the authoritative description, so we
 *       don't usually overwrite.
 *     - `url` — synced to `canonicalUrl` so the locale prefix gets
 *       through. Without this every Organization block emits the
 *       default-locale URL as `url` even on `/ja/` / `/ko/` pages,
 *       which Google flags as a localization mismatch.
 *
 *   • Other kinds (`Product`, `LocalBusiness`, `FAQPage`) are
 *     untouched — they have no site-identity-shaped fields.
 *
 * Returns the original input unchanged when no identity is provided
 * (caller is in legacy / Manual mode). The function never mutates
 * its input.
 */
export function applyIdentityToInput(
  input: SchemaInput,
  identity: SiteIdentity | undefined,
  localeIdentity: SiteIdentity | undefined,
  /**
   * Source proposal's default-locale `Article.authorName`. Only
   * meaningful for Article inputs. Pass `undefined` for Manual mode
   * or when the caller doesn't track the source — we fall back to
   * checking `input.authorName` (works for the default locale; not
   * for non-default locales where the value is already translated).
   */
  sourceArticleAuthor?: string,
): SchemaInput {
  if (!identity || !localeIdentity) return input

  if (input.kind === "Article") {
    // Decide ONCE per article whether the byline is identity-owned
    // or page-owned, using the default-locale source value (which
    // hasn't been touched by translation). All locales for this
    // article inherit the same decision, so we can't end up with
    // (en: "Editorial Team", ja: "編集チーム", ko: "편집부") within
    // the same article and call it consistent.
    const sourceForCheck =
      sourceArticleAuthor !== undefined ? sourceArticleAuthor : input.authorName
    const sourceTrimmed =
      typeof sourceForCheck === "string" ? sourceForCheck.trim() : ""
    const useIdentityAuthor =
      sourceTrimmed === "" || isAuthorPlaceholder(sourceTrimmed)

    return {
      ...input,
      authorName: useIdentityAuthor
        ? localeIdentity.defaultAuthor
        : input.authorName,
      publisherName: localeIdentity.brandName,
      publisherUrl: localeIdentity.publisherUrl ?? input.publisherUrl,
      publisherLogo: input.publisherLogo ?? localeIdentity.publisherLogo,
    }
  }

  if (input.kind === "Organization") {
    return {
      ...input,
      name: localeIdentity.brandName,
      description: input.description ?? localeIdentity.organizationDescription,
      // Always sync url to canonicalUrl so locale-prefixed URLs
      // (https://acme.com/ja/web-design) reach Google as the
      // Organization's url, not the unprefixed default-locale value
      // we received from the source proposal.
      url: input.canonicalUrl,
      logo: input.logo ?? localeIdentity.publisherLogo,
    }
  }

  return input
}

/**
 * Convert the enabled proposals × all locales matrix into a list of
 * `{ language, jsonLd }` blocks ready for `wrapJsonLdBlocks`. Pure — caller
 * passes in the data and gets a flat block list back. Tested.
 *
 * V2: site identity (when provided) is injected after locale-merging
 * but before JSON-LD serialization, so every Article/Organization
 * across every locale shares one canonical publisher/author/brand.
 * See `applyIdentityToInput` for the field-level resolution rules.
 */
export function expandProposalsToBlocks(
  params: BulkInstallParams,
): Array<{ language: string; jsonLd: string }> {
  const out: Array<{ language: string; jsonLd: string }> = []
  for (const proposal of params.proposals) {
    if (!proposal.enabled) continue
    for (const locale of params.locales) {
      const localizedUrl = localizedUrlFor(proposal.url, locale)
      const overrides = params.translations?.[proposal.pageId]?.[locale.code]

      const merged: SchemaInput = overrides
        ? {
            ...overrides,
            language: locale.code,
            canonicalUrl: localizedUrl,
          }
        : localizeSchemaInput(proposal.inputs, locale.code, localizedUrl)

      const localeIdentity = params.identity
        ? resolveIdentityForLocale(
            params.identity,
            params.identityTranslations ?? {},
            locale.code,
            locale.isDefault,
          )
        : undefined
      const localizedIdentity =
        localeIdentity && params.identity?.publisherUrl
          ? {
              ...localeIdentity,
              publisherUrl: localizedUrlFor(params.identity.publisherUrl, locale),
            }
          : localeIdentity

      // Read the source author from the ORIGINAL proposal inputs
      // (default-locale, untranslated). For Articles this lets
      // applyIdentityToInput do its placeholder check against a
      // stable English value rather than an AI-translated string
      // that won't match the placeholder set in non-default locales.
      const sourceArticleAuthor =
        proposal.kind === "Article" && proposal.inputs.kind === "Article"
          ? proposal.inputs.authorName
          : undefined

      const localized = applyIdentityToInput(
        merged,
        params.identity,
        localizedIdentity,
        sourceArticleAuthor,
      )

      const schema = buildSchema(localized)
      out.push({ language: locale.code, jsonLd: serializeJsonLd(schema) })
    }
  }
  return out
}

/**
 * Top-level bulk install. Generates all blocks, wraps them in our fence,
 * injects via `injectIntoHeadEnd` (which preserves user code).
 *
 * Returns counts the UI uses for its success toast.
 */
export async function bulkInstall(
  params: BulkInstallParams,
): Promise<BulkInstallResult> {
  const blocks = expandProposalsToBlocks(params)
  if (blocks.length === 0) {
    // Defensive: if the caller passed only disabled proposals or no locales,
    // do nothing rather than zeroing out the slot.
    return { preservedUserBytes: 0, installedBlocks: 0, enabledProposalCount: 0 }
  }
  const wrapped = wrapJsonLdBlocks(blocks)
  const { preservedUserBytes } = await injectIntoHeadEnd(wrapped)
  return {
    preservedUserBytes,
    installedBlocks: blocks.length,
    enabledProposalCount: params.proposals.filter((p) => p.enabled).length,
  }
}
