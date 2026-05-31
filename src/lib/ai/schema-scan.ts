import type { LocaleInfo } from "../framer/locales"
import type { ScannedPage, SiteMap } from "../framer/site-scan"
import {
  aiInputsToSchemaInput,
  buildProposal,
  type SchemaProposal,
  type SchemaDetectAiResult,
} from "../schema/proposal"
import type { SchemaInput, SchemaKind } from "../schema/types"
import type { Provider, ProviderId } from "./providers"
import { callAi } from "./client"

/**
 * Slim subset of AiCallOptions shared between scan + translate orchestrators.
 * We don't reuse `Pick<AiCallOptions, ...>` because AiCallOptions also
 * requires the `prompt` field, which we generate per-page inside the loop.
 */
export interface AiCredentials {
  providerId: ProviderId
  modelId: string
  apiKey: string
  /** When set, bypasses the registry lookup (custom user-defined providers). */
  customProvider?: Provider
}
import { validateLocaleScript } from "../locale-script"
import {
  buildSchemaDetectPrompt,
  buildSchemaTranslatePrompt,
} from "./prompts"
import { looksUntranslated } from "./translation-quality"
import type { LocalizedOverrides } from "../framer/bulk-install"

/**
 * Run the script integrity check against every translated text
 * field on a SchemaInput. Returns `true` when every field passes
 * (the AI honored the locale's script) or there's nothing to
 * check. Returns `false` when any high-signal field is dominated
 * by the wrong script — caller flags the cell as `"mixed-script"`.
 *
 * We intentionally only check the user-visible content fields
 * (headlines, names, descriptions, FAQ Q&A). URLs, ISO codes,
 * dates, and addresses (which often legitimately stay in the
 * original script — addressLocality "Tokyo" or country code "US")
 * are excluded.
 *
 * Pure.
 */
export function validateTranslatedFields(
  input: SchemaInput,
  localeCode: string,
): boolean {
  const ok = (s: string | undefined): boolean =>
    !s || s.trim() === "" || validateLocaleScript(s, localeCode)

  switch (input.kind) {
    case "Article":
      return ok(input.headline) && ok(input.description)
    case "Product":
    case "LocalBusiness":
      return ok(input.name) && ok(input.description)
    case "Organization":
      // Name comes from identity at render time, so we don't
      // validate it here — only the description (the page-level
      // signal V2 still translates per-Organization-page).
      return ok(input.description)
    case "FAQPage":
      return input.questions.every(
        (q) => ok(q.question) && ok(q.answer),
      )
    default: {
      // Exhaustiveness: when SchemaKind grows we want a compile
      // error here, not a silent "everything passes" pass-through.
      const _exhaustive: never = input
      void _exhaustive
      return true
    }
  }
}

/**
 * Strip site-identity-owned fields from a SchemaInput before
 * sending it to the per-page translation prompt. V2's separation:
 * publisher/author/Organization name are translated ONCE in Phase
 * 0.5 and injected at render time, not per-page.
 *
 * Excluding them from the translation payload prevents the AI from
 * regenerating/drifting these values across articles (the V1 bug).
 * The fields are restored to their default-locale values via the
 * `aiInputsToSchemaInput` post-merge step in
 * {@link orchestrateTranslate}, so downstream code that still
 * reads them sees consistent (un-translated) values, which the
 * render-time identity injector then overwrites with the locale
 * translation from Phase 0.5.
 *
 * Pure. Returns a shallow-cloned object; never mutates the input.
 */
export function stripIdentityFieldsForTranslation(
  input: SchemaInput,
): SchemaInput {
  switch (input.kind) {
    case "Article": {
      // We KEEP authorName so a real per-page byline ("Jane Smith")
      // gets a chance to be translated for non-Latin locales (e.g.
      // "ジェーン・スミス"). The render-time injector decides
      // whether to use the per-page or identity author. Strip the
      // publisher fields though — those are 100% site-identity.
      // Re-add publisherName as empty so the ArticleInput type
      // stays valid; the merge step downstream ignores empty
      // publisherName, and the render-time injector replaces it
      // with the canonical identity value regardless.
      return {
        ...input,
        publisherName: "",
        publisherLogo: undefined,
      }
    }
    case "Organization": {
      // Organization.name is the canonical brand — never per-page.
      // We DO keep description because page-level Organization
      // (homepage, about) carries a meaningful site description
      // worth translating.
      return { ...input, name: "" }
    }
    default:
      return input
  }
}

/**
 * Run AI proposal for a single ScannedPage. Returns either a parsed proposal
 * or a low-confidence fallback proposal so the caller can include it in the
 * audit list with an error badge.
 *
 * This is broken out from the orchestrator so it can be retried / unit-tested
 * independently.
 */
export async function proposeSchemaForPage(
  page: ScannedPage,
  defaultLocale: LocaleInfo,
  ai: AiCredentials,
  /**
   * Site-wide context bundle threaded through from {@link orchestrateScan}.
   * Optional so unit tests / one-off callers can omit it; production
   * callers should always pass `{ brandName: siteMap.brandName }` so
   * Organization proposals get a real brand-name fallback.
   */
  context: { brandName?: string | null } = {},
): Promise<SchemaProposal> {
  const { system, user } = buildSchemaDetectPrompt({
    url: page.url,
    rawPath: page.rawPath,
    isHomepage: page.isHomepage,
    source: page.source,
    collectionName: page.cms?.collectionName,
    title: page.content.title,
    description: page.content.description,
    headings: page.content.headings,
    bodyText: page.content.bodyText,
    publishedDate: page.content.publishedDate,
    image: page.content.image ?? null,
    isCollectionLanding: page.collectionLanding,
    brandFallbackName: context.brandName ?? null,
  })

  try {
    const result = await callAi({
      ...ai,
      prompt: { system, user },
      maxTokens: 1024,
    })
    const aiJson = (result.parsed ?? null) as SchemaDetectAiResult | null
    return buildProposal(page, aiJson, defaultLocale.code, {
      brandName: context.brandName ?? null,
    })
  } catch (e) {
    const fallback = buildProposal(page, null, defaultLocale.code, {
      brandName: context.brandName ?? null,
    })
    return {
      ...fallback,
      aiError: (e as Error).message,
    }
  }
}

export interface OrchestrateScanParams {
  siteMap: SiteMap
  defaultLocale: LocaleInfo
  ai: AiCredentials
  /**
   * Bound concurrency to avoid rate-limit hammering. 4 is a sweet spot for
   * most providers — they tolerate it without throttling and the wall-clock
   * for a 20-page scan stays under 10s on Claude Haiku.
   */
  concurrency?: number
  /** Progress callback so the UI can render `3 of 14` while we work. */
  onProgress?: (done: number, total: number, label?: string) => void
}

/**
 * Orchestrate proposal generation for an entire SiteMap. Bounded concurrency,
 * isolated failures, progress callbacks. Returns the populated SchemaProposal
 * array — the caller decides what to do with it (show in audit list, persist
 * to plugin data, etc.).
 */
export async function orchestrateScan(
  params: OrchestrateScanParams,
): Promise<SchemaProposal[]> {
  const concurrency = Math.max(1, params.concurrency ?? 4)
  const proposals: SchemaProposal[] = new Array(params.siteMap.pages.length)
  let cursor = 0
  let done = 0

  const total = params.siteMap.pages.length
  if (total === 0) return []

  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= total) return
      const page = params.siteMap.pages[i]
      params.onProgress?.(done, total, page.label)
      proposals[i] = await proposeSchemaForPage(
        page,
        params.defaultLocale,
        params.ai,
        { brandName: params.siteMap.brandName },
      )
      done++
      params.onProgress?.(done, total, page.label)
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  return proposals
}

export interface OrchestrateTranslateParams {
  proposals: SchemaProposal[]
  defaultLocale: LocaleInfo
  /** All non-default locales we should translate for. */
  targetLocales: LocaleInfo[]
  brandVoice?: string
  ai: AiCredentials
  concurrency?: number
  onProgress?: (done: number, total: number, label?: string) => void
  /**
   * When provided, restrict translation to ONLY these (proposal, locale)
   * pairs — used by the "Re-translate failed cells" retry path so we
   * don't pay to re-translate cells that already succeeded.
   *
   * `pageId` matches `SchemaProposal.pageId`; `localeCode` matches
   * `LocaleInfo.code`. Cells outside this set are skipped entirely.
   */
  retryCells?: ReadonlyArray<{ pageId: string; localeCode: string }>
}

/**
 * Why a translation cell ended up in the "untranslated" bucket. Both
 * reasons block real translation but require slightly different user
 * action: an AI error usually means "try a different model"; a
 * passthrough means "the model isn't taking the source seriously —
 * try a stronger model OR edit by hand".
 */
export type UntranslatedReason =
  | "ai-error"
  | "no-content-change"
  /**
   * AI returned text whose dominant script doesn't match the
   * target locale (e.g. Han characters in a `ja-JP` payload, or
   * Cyrillic in `ko`). The override IS written so the user can
   * see the bad output in the audit list, but flagged so the UI
   * surfaces a Re-translate button. Catches the well-known
   * "AI bleeds Chinese into Japanese" failure mode that V1's
   * post-hoc normalization couldn't see.
   */
  | "mixed-script"

export interface UntranslatedCell {
  pageId: string
  localeCode: string
  reason: UntranslatedReason
}

export interface TranslateResult {
  /** Successfully-translated cells, keyed by pageId → localeCode. */
  overrides: LocalizedOverrides
  /**
   * Cells where translation either threw or returned source-unchanged
   * content. Cells in `untranslated` are STILL written to `overrides`
   * with whatever the AI returned (so we ship a partial win) — the UI
   * uses this list separately to surface a "needs review" pill.
   */
  untranslated: UntranslatedCell[]
}

const SCHEMA_TRANSLATE_MIN_TOKENS = 2048
const SCHEMA_TRANSLATE_MAX_TOKENS = 6000

export function estimateSchemaTranslateMaxTokens(input: SchemaInput): number {
  const chars = JSON.stringify(input).length
  return Math.min(
    SCHEMA_TRANSLATE_MAX_TOKENS,
    Math.max(SCHEMA_TRANSLATE_MIN_TOKENS, Math.ceil(chars * 0.75) + 1024),
  )
}

function classifyTranslatedInput(
  translated: SchemaInput,
  original: SchemaInput,
  localeCode: string,
): UntranslatedReason | null {
  if (!validateTranslatedFields(translated, localeCode)) {
    return "mixed-script"
  }
  if (looksUntranslated(translated, original)) {
    return "no-content-change"
  }
  return null
}

/**
 * Translate every enabled proposal's `inputs` into every target locale.
 *
 * Returns both the `overrides` map (consumed by bulk-install) and a list
 * of `untranslated` cells (consumed by the audit UI as a quality
 * warning). The two lists overlap: an AI passthrough goes into BOTH —
 * we ship the partial win AND tell the user it needs review.
 *
 * Failures are non-fatal: if one cell errors, others continue. AI errors
 * are recorded as `reason: "ai-error"`; AI returned the source unchanged
 * is recorded as `reason: "no-content-change"`.
 */
export async function orchestrateTranslate(
  params: OrchestrateTranslateParams,
): Promise<TranslateResult> {
  const concurrency = Math.max(1, params.concurrency ?? 4)

  // Build the retry filter once outside the loop — O(retryCells.length)
  // membership test on each task instead of O(retryCells.length * tasks).
  const retryFilter = params.retryCells
    ? new Set(
        params.retryCells.map((c) => `${c.pageId}\u0001${c.localeCode}`),
      )
    : null

  const tasks: Array<{
    pageId: string
    locale: LocaleInfo
    kind: SchemaKind
    inputs: SchemaInput
  }> = []
  for (const proposal of params.proposals) {
    if (!proposal.enabled) continue
    for (const locale of params.targetLocales) {
      if (locale.id === params.defaultLocale.id) continue
      if (
        retryFilter &&
        !retryFilter.has(`${proposal.pageId}\u0001${locale.code}`)
      ) {
        continue
      }
      tasks.push({
        pageId: proposal.pageId,
        locale,
        kind: proposal.kind,
        inputs: proposal.inputs,
      })
    }
  }

  const overrides: LocalizedOverrides = {}
  const untranslated: UntranslatedCell[] = []
  let cursor = 0
  let done = 0
  const total = tasks.length
  if (total === 0) return { overrides, untranslated }

  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= total) return
      const task = tasks[i]
      params.onProgress?.(done, total, `${task.locale.code}: ${task.pageId}`)
      // V2: strip site-identity-owned fields (publisher.name,
      // author.name, Organization.name, etc.) before sending to
      // AI. Identity is resolved at render time from the once-
      // translated SiteIdentity bundle, so AI doesn't see / can't
      // drift these per-page. The original task.inputs is kept
      // intact for the post-translation merge fallback.
      const translatePayload = stripIdentityFieldsForTranslation(task.inputs)
      const maxTokens = estimateSchemaTranslateMaxTokens(translatePayload)

      const translateOnce = async (
        retryReason?: UntranslatedReason,
      ): Promise<{
        merged?: SchemaInput
        reason: UntranslatedReason | null
      }> => {
        try {
          const { system, user } = buildSchemaTranslatePrompt({
            kind: task.kind,
            inputs: translatePayload,
            targetLanguage: task.locale.code,
            brandVoice: params.brandVoice,
            retryReason,
          })

          const result = await callAi({
            ...params.ai,
            prompt: { system, user },
            maxTokens,
          })
          const parsed = result.parsed
          if (!parsed || typeof parsed !== "object") {
            return { reason: "ai-error" }
          }

          // Re-normalize through aiInputsToSchemaInput in case the model
          // omitted required fields after translation. Pass the original
          // canonicalUrl as the fallback URL — bulk-install will overwrite
          // with the locale-prefixed one anyway.
          // Preserve the source image across translation: the model
          // is instructed to keep URLs verbatim but sometimes drops
          // the field entirely from its JSON output (especially
          // smaller models). We re-feed it through the fallback so
          // every locale's JSON-LD carries the same `image` URL as
          // the default-locale source. Image is per-page, not site
          // identity, so this is the correct merge layer.
          const sourceImage =
            "image" in task.inputs &&
            typeof (task.inputs as { image?: unknown }).image === "string"
              ? ((task.inputs as { image?: string }).image as string)
              : undefined
          const merged = aiInputsToSchemaInput(
            task.kind,
            parsed as Record<string, unknown>,
            task.inputs.canonicalUrl,
            task.locale.code,
            { title: null, description: null, image: sourceImage ?? null },
          )
          return {
            merged,
            reason: classifyTranslatedInput(
              merged,
              task.inputs,
              task.locale.code,
            ),
          }
        } catch {
          return { reason: "ai-error" }
        }
      }

      try {
        const first = await translateOnce()
        let final = first
        if (first.reason) {
          try {
            const retry = await translateOnce(first.reason)
            if (!retry.reason || !first.merged) {
              final = retry
            } else {
              final = retry.merged ? retry : first
            }
          } catch {
            final = first
          }
        }

        if (final.merged) {
          overrides[task.pageId] ??= {}
          overrides[task.pageId][task.locale.code] = final.merged
        }

        if (final.reason) {
          untranslated.push({
            pageId: task.pageId,
            localeCode: task.locale.code,
            reason: final.reason,
          })
        }
      } catch {
        untranslated.push({
          pageId: task.pageId,
          localeCode: task.locale.code,
          reason: "ai-error",
        })
      }
      done++
      params.onProgress?.(done, total, `${task.locale.code}: ${task.pageId}`)
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  return { overrides, untranslated }
}
