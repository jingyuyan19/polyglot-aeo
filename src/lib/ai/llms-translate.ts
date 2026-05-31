import type { CollectionItemRow } from "../framer/cms"
import type { LocaleInfo } from "../framer/locales"
import type { StaticPageEntry } from "../framer/static-pages"
import type { SkippedItem } from "../llms/generator"
import { callAi, type AiProvider } from "./client"
import { scriptCounts, validateLocaleScript } from "../locale-script"
import {
  buildLlmsHeaderTranslatePrompt,
  buildLlmsLongDescriptionTranslatePrompt,
  buildLlmsTranslatePrompt,
} from "./prompts"
import type { Provider, ProviderId } from "./providers"
import { stripReasoningBlocks } from "./providers/types"
import { looksUntranslatedText } from "./translation-quality"

/**
 * llms.txt AI auto-translation orchestrator.
 *
 * Why this module exists: Schema offers AI auto-translation per
 * locale; llms.txt did not. Designers reasonably asked "why does
 * Schema fill in my Japanese translations but llms.txt produces an
 * empty file?". The mechanic is the same — read default-locale
 * content, ask the AI to localize, validate, stitch into output —
 * just at a different surface.
 *
 * Architectural notes:
 *   - The translation result is NOT written back to the Framer CMS.
 *     We synthesize a `fieldValuesByLocale` overlay and feed it to
 *     the existing pure `buildSectionFromCollection`. Designer's
 *     CMS rows are untouched, so they can review, regenerate, or
 *     discard freely.
 *   - We piggy-back on the Schema V2 quality machinery: every
 *     translated string is run through `validateLocaleScript`, and
 *     a byte-equal pass-through check (`looksUntranslatedText`)
 *     catches the "AI returned the source verbatim" failure mode.
 *     Failing items become {@link SkippedItem}s so the existing
 *     LlmsTxtView UI surfaces them — no new error UI to maintain.
 *   - Single batched AI call per locale, not per item. 5 items in
 *     one prompt costs ~the same as 1 item (output dominates) and
 *     is 5x faster. We cap at {@link MAX_ITEMS_PER_BATCH} to keep
 *     the model honest; beyond that we split into multiple calls.
 */

/**
 * Practical ceiling on how many items we cram into a single
 * translate prompt. In live Framer projects we saw DeepSeek drop
 * a couple of items from a 26-entry mixed CMS/pages batch even with
 * retry enabled. Fifteen keeps the latency win from batching while
 * giving smaller models less room to merge, omit, or reorder rows.
 */
const MAX_ITEMS_PER_BATCH = 15
const LLMS_TRANSLATE_MIN_TOKENS = 1536
const LLMS_TRANSLATE_MAX_TOKENS = 5000

/**
 * Quality reasons surfaced to the UI when an AI translation fails
 * validation. Aligned with Schema's `MetaQualityReason` so the two
 * surfaces share copy and visual treatment.
 */
export type LlmsTranslateQualityReason =
  | "mixed-script"
  | "untranslated"
  /** AI response could not be parsed (common with json_object + array mismatch). */
  | "parse-failed"

/**
 * Subset of `AiCredentials` from `schema-scan.ts` — duplicated here
 * to avoid a cross-module dependency between two parallel surfaces
 * (Schema and llms.txt). Identical shape on purpose.
 */
export interface LlmsTranslateAiCredentials {
  providerId: ProviderId
  modelId: string
  apiKey: string
  customProvider?: Provider
}

export interface TranslateLlmsItemsParams {
  /**
   * The CMS rows the caller plans to feed into
   * `buildSectionFromCollection`. We read default-locale fields off
   * `fieldValues` and emit a NEW object per row with an augmented
   * `fieldValuesByLocale[locale.id]` populated for ones the AI
   * translated. Original rows are not mutated — pure return.
   */
  rows: ReadonlyArray<CollectionItemRow>
  /** Target locale. Translation is skipped when isDefault. */
  locale: LocaleInfo
  /**
   * Field-name keys, identical to the ones the generator uses for
   * the same row set. Source-of-truth for which fields to translate.
   */
  titleField: string
  summaryField?: string
  /** Optional brand voice hint, persisted in plugin storage. */
  brandVoice?: string
  ai: LlmsTranslateAiCredentials
}

export interface TranslateLlmsItemsResult {
  /**
   * Rows with `fieldValuesByLocale[locale.id]` populated for items
   * the AI translated successfully. Items already populated in the
   * input pass through untouched (we only fill gaps). Items the AI
   * failed on are returned unmodified so the generator's existing
   * "missing-localized-title" path picks them up — no two ways to
   * skip an item.
   */
  rows: CollectionItemRow[]
  /**
   * Items whose AI output failed quality validation. Surfaced to
   * the UI alongside the generator's skipped report so designers
   * see a unified "items that didn't make it into this locale" list.
   */
  failed: Array<{
    item: SkippedItem
    reason: LlmsTranslateQualityReason
  }>
  /** USD cost rolled up across all batches. */
  costUsd: number
  /** Total items the AI processed (translated OR failed). */
  attempted: number
  /** Items AI returned but we accepted as good. */
  succeeded: number
}

export interface LlmsTranslateEntryInput {
  id: string
  title: string
  summary?: string
  path?: string
}

export interface TranslateLlmsEntriesParams {
  items: ReadonlyArray<LlmsTranslateEntryInput>
  locale: LocaleInfo
  brandVoice?: string
  ai: LlmsTranslateAiCredentials
}

export interface TranslateLlmsEntriesResult {
  translated: Map<string, { title: string; summary?: string }>
  failed: Array<{
    item: SkippedItem
    reason: LlmsTranslateQualityReason
  }>
  costUsd: number
  attempted: number
  succeeded: number
}

/**
 * Identify CMS rows whose `titleField` value is missing for the
 * target locale. These are the items the generator would otherwise
 * skip — and the ones AI auto-translate is meant to rescue.
 *
 * Pure helper, exported for tests.
 */
export function pickRowsNeedingTranslation(
  rows: ReadonlyArray<CollectionItemRow>,
  locale: LocaleInfo,
  titleField: string,
): CollectionItemRow[] {
  if (locale.isDefault) return []
  return rows.filter((row) => {
    const localized = row.fieldValuesByLocale[locale.id]
    const localizedTitle = localized
      ? String(localized[titleField] ?? "").trim()
      : ""
    if (localizedTitle.length > 0) return false
    const defaultTitle = String(row.fieldValues[titleField] ?? "").trim()
    return defaultTitle.length > 0
  })
}

/**
 * Estimate per-item AI cost. Called by the UI to render an "Est.
 * cost" line BEFORE the user clicks Generate. Heuristic: each item
 * is ~50 input tokens (id+title+summary) and ~80 output tokens
 * (translated title+summary). Assumes a healthy ~600 input token
 * prompt overhead amortized across the batch.
 *
 * Pure.
 */
export function estimateLlmsTranslateCost(
  itemCount: number,
  pricePerMTokenInput: number,
  pricePerMTokenOutput: number,
): number {
  if (itemCount <= 0) return 0
  const promptOverheadTokensIn = 600
  const perItemTokensIn = 50
  const perItemTokensOut = 80
  const totalTokensIn = promptOverheadTokensIn + perItemTokensIn * itemCount
  const totalTokensOut = perItemTokensOut * itemCount
  return (
    (totalTokensIn * pricePerMTokenInput +
      totalTokensOut * pricePerMTokenOutput) /
    1_000_000
  )
}

export function estimateLlmsBatchMaxTokens(
  items: ReadonlyArray<{
    id: string
    title: string
    summary?: string
    path?: string
  }>,
): number {
  const chars = JSON.stringify(items).length
  return Math.min(
    LLMS_TRANSLATE_MAX_TOKENS,
    Math.max(LLMS_TRANSLATE_MIN_TOKENS, Math.ceil(chars * 0.8) + 900),
  )
}

function cjkLocaleBase(localeCode: string): string {
  return (localeCode.split("-")[0] || localeCode).toLowerCase()
}

function isCjkLocale(localeCode: string): boolean {
  const base = cjkLocaleBase(localeCode)
  return base === "ja" || base === "ko" || base === "zh"
}

/** True when Latin letters dominate (used for CJK passthrough labeling). */
function isMostlyLatin(text: string): boolean {
  const counts = scriptCounts(text.trim())
  const latin = counts.latin
  const native =
    counts.hiragana +
    counts.katakana +
    counts.han +
    counts.hangul
  return latin > 0 && latin >= native
}

function titleLooksUntranslated(
  translatedTitle: string,
  sourceTitle: string,
): boolean {
  return looksUntranslatedText(
    { headline: translatedTitle, description: undefined },
    { headline: sourceTitle, description: undefined },
  )
}

function summaryAcceptable(
  translatedSummary: string | undefined,
  sourceSummary: string | undefined,
  localeCode: string,
): boolean {
  const summary = translatedSummary?.trim() ?? ""
  if (!summary) return false
  const source = sourceSummary?.trim() ?? ""
  if (
    source &&
    looksUntranslatedText(
      { headline: undefined, description: summary },
      { headline: undefined, description: source },
    )
  ) {
    return false
  }
  return validateLocaleScript(summary, localeCode)
}

export type AcceptTranslatedItemResult =
  | { ok: true; title: string; summary?: string }
  | { ok: false; reason: LlmsTranslateQualityReason }

/**
 * llms.txt CMS rows: **title must pass**; a bad summary is dropped so
 * the generator can fall back to the default-locale summary.
 */
export function acceptTranslatedItem(
  translated: { title: string; summary?: string },
  source: { title: string; summary?: string },
  localeCode: string,
): AcceptTranslatedItemResult {
  const title = translated.title.trim()
  if (!title) {
    return { ok: false, reason: "untranslated" }
  }

  if (titleLooksUntranslated(title, source.title)) {
    return { ok: false, reason: "untranslated" }
  }

  if (
    isCjkLocale(localeCode) &&
    title === source.title.trim() &&
    isMostlyLatin(title)
  ) {
    return { ok: false, reason: "untranslated" }
  }

  if (!validateLocaleScript(title, localeCode)) {
    return { ok: false, reason: "mixed-script" }
  }

  const summary = summaryAcceptable(
    translated.summary,
    source.summary,
    localeCode,
  )
    ? translated.summary?.trim()
    : undefined

  return { ok: true, title, summary: summary || undefined }
}

interface TranslatedItemRaw {
  id: string
  title: string
  summary?: string
}

const TRANSLATE_ARRAY_KEYS = [
  "items",
  "translations",
  "results",
  "data",
  "output",
] as const

function entryHasTitle(value: unknown): value is { title?: unknown } {
  return Boolean(value && typeof value === "object" && "title" in value)
}

/**
 * Normalize provider JSON into an array of item objects. OpenAI-
 * compatible endpoints use `response_format: json_object`, so models
 * often wrap the list in `{ "items": [...] }` even when older prompts
 * asked for a bare array.
 */
export function extractTranslateItemsArray(candidate: unknown): unknown[] | null {
  if (Array.isArray(candidate)) return candidate
  if (!candidate || typeof candidate !== "object") return null

  const record = candidate as Record<string, unknown>
  for (const key of TRANSLATE_ARRAY_KEYS) {
    const nested = record[key]
    if (Array.isArray(nested)) return nested
    if (nested && typeof nested === "object") {
      const nestedItems = extractTranslateItemsArray(nested)
      if (nestedItems) return nestedItems
    }
  }

  if (typeof record.title === "string") return [record]

  const values = Object.entries(record).map(([id, value]) => {
    if (!value || typeof value !== "object") return value
    const item = value as Record<string, unknown>
    return item.id == null ? { id, ...item } : item
  })
  if (
    values.length > 0 &&
    values.every((v) => entryHasTitle(v) && typeof (v as { title?: unknown }).title === "string")
  ) {
    return values
  }

  return null
}

function normalizeTranslatedEntry(entry: unknown): TranslatedItemRaw | null {
  if (!entry || typeof entry !== "object") return null
  const e = entry as { id?: unknown; title?: unknown; summary?: unknown }
  const title = typeof e.title === "string" ? e.title.trim() : ""
  if (!title) return null
  const id = e.id != null ? String(e.id).trim() : ""
  if (!id) return null
  const item: TranslatedItemRaw = { id, title }
  if (typeof e.summary === "string" && e.summary.trim().length > 0) {
    item.summary = e.summary.trim()
  }
  return item
}

/**
 * Best-effort parse of the AI's JSON response. Defensive against:
 *  1. Markdown-fenced JSON.
 *  2. `{ "items": [...] }` envelopes (json_object APIs).
 *  3. Bare `[...]` arrays (legacy / Anthropic).
 *  4. Reasoning tags before the JSON payload.
 *
 * Returns null on unrecoverable shape — caller treats every input
 * item as failed in that case.
 */
/** Exported for unit tests — production callers use {@link translateLlmsItems}. */
export function parseTranslateResponse(
  parsed: unknown,
  rawText: string,
): TranslatedItemRaw[] | null {
  const candidates: unknown[] = []
  if (parsed !== null && parsed !== undefined) candidates.push(parsed)

  const stripped = stripReasoningBlocks(rawText)
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
  if (stripped) {
    try {
      candidates.push(JSON.parse(stripped))
    } catch {
      // fall through
    }
    const firstBracket = stripped.indexOf("[")
    const lastBracket = stripped.lastIndexOf("]")
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      try {
        candidates.push(
          JSON.parse(stripped.slice(firstBracket, lastBracket + 1)),
        )
      } catch {
        // ignore
      }
    }
  }

  for (const c of candidates) {
    const arr = extractTranslateItemsArray(c)
    if (!arr) continue

    const result: TranslatedItemRaw[] = []
    for (const entry of arr) {
      const item = normalizeTranslatedEntry(entry)
      if (item) result.push(item)
    }
    if (result.length > 0) return result
  }

  return null
}

function applyParsedTranslation(
  out: TranslatedItemRaw,
  rowId: string,
  source: { title: string; summary?: string },
  localeCode: string,
  acceptedById: Map<string, { title: string; summary?: string }>,
  failed: TranslateLlmsItemsResult["failed"],
): boolean {
  const accepted = acceptTranslatedItem(
    { title: out.title, summary: out.summary },
    source,
    localeCode,
  )
  if (!accepted.ok) {
    failed.push({
      item: {
        itemId: rowId,
        defaultTitle: source.title,
        reason: "missing-localized-title",
      },
      reason: accepted.reason,
    })
    return false
  }
  acceptedById.set(rowId, {
    title: accepted.title,
    summary: accepted.summary,
  })
  return true
}

export async function translateLlmsEntries(
  params: TranslateLlmsEntriesParams,
  callAiFn: CallAi = callAi,
): Promise<TranslateLlmsEntriesResult> {
  const empty: TranslateLlmsEntriesResult = {
    translated: new Map(),
    failed: [],
    costUsd: 0,
    attempted: 0,
    succeeded: 0,
  }
  if (params.locale.isDefault) return empty
  if (params.items.length === 0) return empty

  const sourceById = new Map<string, { title: string; summary?: string }>()
  const promptItems = params.items.map((item) => {
    const title = item.title.trim()
    const summary = item.summary?.trim()
    sourceById.set(item.id, {
      title,
      summary: summary || undefined,
    })
    return {
      id: item.id,
      title,
      summary: summary || undefined,
      path: item.path,
    }
  })

  const translated = new Map<string, { title: string; summary?: string }>()
  const failed: TranslateLlmsEntriesResult["failed"] = []
  let costUsd = 0

  const requestBatch = async (
    batch: LlmsTranslateEntryInput[],
    retryReason?: LlmsTranslateQualityReason,
  ): Promise<TranslatedItemRaw[] | null> => {
    const prompt = buildLlmsTranslatePrompt({
      targetLanguage: params.locale.code,
      targetRegion: params.locale.name,
      brandVoice: params.brandVoice,
      items: batch,
      retryReason,
    })
    const result = await callAiFn({
      providerId: params.ai.providerId as AiProvider,
      modelId: params.ai.modelId,
      apiKey: params.ai.apiKey,
      prompt,
      customProvider: params.ai.customProvider,
      maxTokens: estimateLlmsBatchMaxTokens(batch),
    })
    costUsd += result.estimatedCostUsd ?? 0
    return parseTranslateResponse(result.parsed, result.rawText)
  }

  const applyEntry = (
    out: TranslatedItemRaw,
    itemId: string,
    batchFailed: TranslateLlmsEntriesResult["failed"],
  ) => {
    const source = sourceById.get(itemId)
    if (!source) return
    const accepted = acceptTranslatedItem(
      { title: out.title, summary: out.summary },
      source,
      params.locale.code,
    )
    if (!accepted.ok) {
      batchFailed.push({
        item: {
          itemId,
          defaultTitle: source.title,
          reason: "missing-localized-title",
        },
        reason: accepted.reason,
      })
      return
    }
    translated.set(itemId, {
      title: accepted.title,
      summary: accepted.summary,
    })
  }

  const processBatch = async (
    batch: LlmsTranslateEntryInput[],
    retryReason?: LlmsTranslateQualityReason,
  ): Promise<void> => {
    const parsed = await requestBatch(batch, retryReason)

    if (!parsed) {
      if (!retryReason) {
        await processBatch(batch, "parse-failed")
        return
      }
      if (batch.length > 1) {
        for (const item of batch) {
          await processBatch([item], "parse-failed")
        }
        return
      }
      const item = batch[0]!
      failed.push({
        item: {
          itemId: item.id,
          defaultTitle: item.title,
          reason: "missing-localized-title",
        },
        reason: "parse-failed",
      })
      return
    }

    let matchedById = 0
    const batchSeenById = new Set<string>()
    const batchFailed: TranslateLlmsEntriesResult["failed"] = []
    for (const out of parsed) {
      if (!sourceById.has(out.id)) continue
      matchedById++
      batchSeenById.add(out.id)
      applyEntry(out, out.id, batchFailed)
    }

    if (matchedById === 0 && parsed.length === batch.length) {
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i]!
        batchSeenById.add(item.id)
        applyEntry(parsed[i]!, item.id, batchFailed)
      }
    }

    for (const item of batch) {
      if (batchSeenById.has(item.id)) continue
      batchSeenById.add(item.id)
      batchFailed.push({
        item: {
          itemId: item.id,
          defaultTitle: item.title,
          reason: "missing-localized-title",
        },
        reason: "untranslated",
      })
    }

    if (!retryReason && batchFailed.length > 0) {
      const retryByReason = new Map<
        LlmsTranslateQualityReason,
        LlmsTranslateEntryInput[]
      >()
      for (const failure of batchFailed) {
        const item = batch.find((candidate) => candidate.id === failure.item.itemId)
        if (!item) continue
        const group = retryByReason.get(failure.reason) ?? []
        group.push(item)
        retryByReason.set(failure.reason, group)
      }
      for (const [reason, retryItems] of retryByReason) {
        await processBatch(retryItems, reason)
      }
      return
    }

    if (retryReason && batchFailed.length > 0 && batch.length > 1) {
      const failedIds = new Set(batchFailed.map((failure) => failure.item.itemId))
      for (const item of batch) {
        if (failedIds.has(item.id)) {
          await processBatch([item], retryReason)
        }
      }
      return
    }

    failed.push(...batchFailed)
  }

  for (const batch of chunk(promptItems, MAX_ITEMS_PER_BATCH)) {
    await processBatch(batch)
  }

  return {
    translated,
    failed,
    costUsd,
    attempted: params.items.length,
    succeeded: translated.size,
  }
}

/**
 * Slice an array into chunks of at most `size` elements. Pure.
 * Exported only for tests so we can verify batch behaviour without
 * mocking the AI call.
 */
export function chunk<T>(input: ReadonlyArray<T>, size: number): T[][] {
  if (size <= 0) return [Array.from(input)]
  const out: T[][] = []
  for (let i = 0; i < input.length; i += size) {
    out.push(input.slice(i, i + size))
  }
  return out
}

/**
 * Inject for unit tests — defaults to the real `callAi`. Identical
 * pattern to schema-scan.ts which also overrides this in tests.
 */
type CallAi = typeof callAi

/**
 * Translate the missing-locale title/summary fields for a set of
 * CMS rows in one batched AI call (or several when row count
 * exceeds {@link MAX_ITEMS_PER_BATCH}).
 *
 * Side effects: AI network calls only. No CMS writes, no plugin
 * storage writes. Caller decides what to do with the result.
 */
export async function translateLlmsItems(
  params: TranslateLlmsItemsParams,
  callAiFn: CallAi = callAi,
): Promise<TranslateLlmsItemsResult> {
  // Default locale needs no translation step — short-circuit before
  // we even consider AI cost.
  if (params.locale.isDefault) {
    return {
      rows: params.rows.map((r) => ({ ...r })),
      failed: [],
      costUsd: 0,
      attempted: 0,
      succeeded: 0,
    }
  }

  const candidates = pickRowsNeedingTranslation(
    params.rows,
    params.locale,
    params.titleField,
  )

  if (candidates.length === 0) {
    return {
      rows: params.rows.map((r) => ({ ...r })),
      failed: [],
      costUsd: 0,
      attempted: 0,
      succeeded: 0,
    }
  }

  // Build the lookup of source values once. We translate the title
  // in every batch and the summary when the row has one — the
  // generator's summary fallback will keep behaviour reasonable when
  // we can't translate.
  const sourceById = new Map<
    string,
    { title: string; summary?: string }
  >()
  const promptItems = candidates.map((row) => {
    const title = String(row.fieldValues[params.titleField] ?? "").trim()
    const summary = params.summaryField
      ? String(row.fieldValues[params.summaryField] ?? "").trim()
      : ""
    const item: {
      id: string
      title: string
      summary?: string
      path?: string
    } = {
      id: row.id,
      title,
      path: row.slug,
    }
    if (summary) item.summary = summary
    sourceById.set(row.id, {
      title,
      summary: summary || undefined,
    })
    return item
  })

  // Track per-id outcomes so we can update rows + report failures
  // in one pass at the end.
  const acceptedById = new Map<string, { title: string; summary?: string }>()
  const failed: TranslateLlmsItemsResult["failed"] = []

  let costUsd = 0
  const requestBatch = async (
    batch: Array<{
      id: string
      title: string
      summary?: string
      path?: string
    }>,
    retryReason?: LlmsTranslateQualityReason,
  ): Promise<TranslatedItemRaw[] | null> => {
    const prompt = buildLlmsTranslatePrompt({
      targetLanguage: params.locale.code,
      targetRegion: params.locale.name,
      brandVoice: params.brandVoice,
      items: batch,
      retryReason,
    })

    const result = await callAiFn({
      providerId: params.ai.providerId as AiProvider,
      modelId: params.ai.modelId,
      apiKey: params.ai.apiKey,
      prompt,
      customProvider: params.ai.customProvider,
      maxTokens: estimateLlmsBatchMaxTokens(batch),
    })
    costUsd += result.estimatedCostUsd ?? 0
    return parseTranslateResponse(result.parsed, result.rawText)
  }

  const processBatch = async (
    batch: Array<{
      id: string
      title: string
      summary?: string
      path?: string
    }>,
    retryReason?: LlmsTranslateQualityReason,
  ): Promise<void> => {
    const parsed = await requestBatch(batch, retryReason)

    if (!parsed) {
      if (!retryReason) {
        await processBatch(batch, "parse-failed")
        return
      }
      if (batch.length > 1) {
        for (const item of batch) {
          await processBatch([item], "parse-failed")
        }
        return
      }
      const item = batch[0]!
      failed.push({
        item: {
          itemId: item.id,
          defaultTitle: item.title,
          reason: "missing-localized-title",
        },
        reason: "parse-failed",
      })
      return
    }

    let matchedById = 0
    const batchSeenById = new Set<string>()
    const batchFailed: TranslateLlmsItemsResult["failed"] = []
    for (const out of parsed) {
      const source = sourceById.get(out.id)
      if (!source) continue
      batchSeenById.add(out.id)
      matchedById++
      applyParsedTranslation(
        out,
        out.id,
        source,
        params.locale.code,
        acceptedById,
        batchFailed,
      )
    }

    // Some models return items in order but rewrite ids ("1", "2"…).
    // Recover when every id missed yet counts match.
    if (matchedById === 0 && parsed.length === batch.length) {
      for (let i = 0; i < batch.length; i++) {
        const out = parsed[i]!
        const item = batch[i]!
        const source = sourceById.get(item.id)
        if (!source) continue
        batchSeenById.add(item.id)
        applyParsedTranslation(
          out,
          item.id,
          source,
          params.locale.code,
          acceptedById,
          batchFailed,
        )
      }
    }

    for (const item of batch) {
      if (batchSeenById.has(item.id)) continue
      batchSeenById.add(item.id)
      batchFailed.push({
        item: {
          itemId: item.id,
          defaultTitle: item.title,
          reason: "missing-localized-title",
        },
        reason: "untranslated",
      })
    }

    if (!retryReason && batchFailed.length > 0) {
      const retryByReason = new Map<
        LlmsTranslateQualityReason,
        Array<{
          id: string
          title: string
          summary?: string
          path?: string
        }>
      >()
      for (const failure of batchFailed) {
        const item = batch.find((candidate) => candidate.id === failure.item.itemId)
        if (!item) continue
        const group = retryByReason.get(failure.reason) ?? []
        group.push(item)
        retryByReason.set(failure.reason, group)
      }
      for (const [reason, retryItems] of retryByReason) {
        await processBatch(retryItems, reason)
      }
      return
    }

    if (retryReason && batchFailed.length > 0 && batch.length > 1) {
      const failedIds = new Set(batchFailed.map((failure) => failure.item.itemId))
      for (const item of batch) {
        if (failedIds.has(item.id)) {
          await processBatch([item], retryReason)
        }
      }
      return
    }

    failed.push(...batchFailed)
  }

  for (const batch of chunk(promptItems, MAX_ITEMS_PER_BATCH)) {
    await processBatch(batch)
  }

  // Stitch accepted translations back into a fresh copy of rows.
  // We never mutate inputs — the generator and other consumers may
  // run in parallel against the same row set.
  const updatedRows: CollectionItemRow[] = params.rows.map((row) => {
    const accepted = acceptedById.get(row.id)
    if (!accepted) return { ...row }
    const existingForLocale = row.fieldValuesByLocale[params.locale.id] ?? {}
    const merged: Record<string, unknown> = { ...existingForLocale }
    merged[params.titleField] = accepted.title
    if (params.summaryField && accepted.summary) {
      merged[params.summaryField] = accepted.summary
    }
    return {
      ...row,
      fieldValuesByLocale: {
        ...row.fieldValuesByLocale,
        [params.locale.id]: merged,
      },
    }
  })

  return {
    rows: updatedRows,
    failed,
    costUsd,
    attempted: candidates.length,
    succeeded: acceptedById.size,
  }
}

export interface TranslateLlmsHeaderParams {
  /** Site name (brand identifier). Echoed; never translated. */
  siteName: string
  /** Site tagline / summary in the default locale. */
  siteSummary: string
  /** Target locale. Caller must skip when isDefault. */
  locale: LocaleInfo
  brandVoice?: string
  ai: LlmsTranslateAiCredentials
}

export interface TranslateLlmsHeaderResult {
  /**
   * Translated site summary, OR the original source if validation
   * failed (caller can read `qualityFlag` to decide what to do —
   * see {@link TranslateLlmsHeaderResult.qualityFlag}).
   */
  siteSummary: string
  /**
   * `null` on success. When non-null, the AI output was rejected
   * and `siteSummary` falls back to the source string. Same
   * vocabulary as {@link LlmsTranslateQualityReason} so the UI
   * can render one badge style across items + header.
   */
  qualityFlag: LlmsTranslateQualityReason | null
  /** USD cost of the single AI call. */
  costUsd: number
}

/**
 * Best-effort parse of the AI's site-header JSON response.
 *
 * Tolerates the same three failure modes as {@link
 * parseTranslateResponse}: markdown fence, prose preamble, missing
 * keys. Returns `null` when unrecoverable so the caller can fall
 * back to the source string with a clear quality flag.
 */
function parseHeaderResponse(
  parsed: unknown,
  rawText: string,
): { siteName: string; siteSummary: string } | null {
  const candidates: unknown[] = []
  if (parsed !== null && parsed !== undefined) candidates.push(parsed)

  const stripped = rawText
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
  if (stripped) {
    try {
      candidates.push(JSON.parse(stripped))
    } catch {
      // ignore — try sliced parse below
    }
    const firstBrace = stripped.indexOf("{")
    const lastBrace = stripped.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        candidates.push(
          JSON.parse(stripped.slice(firstBrace, lastBrace + 1)),
        )
      } catch {
        // ignore
      }
    }
  }

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue
    const obj = c as { siteName?: unknown; siteSummary?: unknown }
    if (typeof obj.siteSummary !== "string") continue
    const summary = obj.siteSummary.trim()
    if (summary.length === 0) continue
    return {
      siteName:
        typeof obj.siteName === "string" ? obj.siteName.trim() : "",
      siteSummary: summary,
    }
  }
  return null
}

/**
 * Translate a site header (name + summary) for one non-default
 * locale.
 *
 * Why this function exists separately from {@link
 * translateLlmsItems}: the header has different rules — siteName
 * must NOT translate (it's a brand string), only the summary
 * does. Mixing the two into the items prompt risked the model
 * translating brand names. Cleaner as a focused helper. Cost is
 * ~50 input + 50 output tokens per locale, sub-cent.
 *
 * Failure handling: when the AI is unparseable, returns the
 * source `siteSummary` with `qualityFlag: "untranslated"`. When
 * the output fails script validation, same fallback with
 * `qualityFlag: "mixed-script"`. Caller decides whether to
 * surface the flag — the file ALWAYS gets a value, never empty.
 *
 * Pure (other than the AI network call). No CMS or storage
 * writes.
 */
export async function translateLlmsHeader(
  params: TranslateLlmsHeaderParams,
  callAiFn: typeof callAi = callAi,
): Promise<TranslateLlmsHeaderResult> {
  if (params.locale.isDefault || !params.siteSummary.trim()) {
    return {
      siteSummary: params.siteSummary,
      qualityFlag: null,
      costUsd: 0,
    }
  }

  const prompt = buildLlmsHeaderTranslatePrompt({
    targetLanguage: params.locale.code,
    targetRegion: params.locale.name,
    brandVoice: params.brandVoice,
    siteName: params.siteName,
    siteSummary: params.siteSummary,
  })

  let rawText = ""
  let parsedRaw: unknown = null
  let costUsd = 0
  try {
    const result = await callAiFn({
      providerId: params.ai.providerId as AiProvider,
      modelId: params.ai.modelId,
      apiKey: params.ai.apiKey,
      prompt,
      customProvider: params.ai.customProvider,
    })
    rawText = result.rawText
    parsedRaw = result.parsed
    costUsd = result.estimatedCostUsd ?? 0
  } catch {
    // Network / provider error — fall back to source so the file
    // still ships, but flag the failure.
    return {
      siteSummary: params.siteSummary,
      qualityFlag: "untranslated",
      costUsd: 0,
    }
  }

  const parsed = parseHeaderResponse(parsedRaw, rawText)
  if (!parsed) {
    return {
      siteSummary: params.siteSummary,
      qualityFlag: "untranslated",
      costUsd,
    }
  }

  // Validate against the source: AI returning the source verbatim is
  // a passthrough failure.
  const passthrough = looksUntranslatedText(
    { description: parsed.siteSummary },
    { description: params.siteSummary },
  )
  if (passthrough) {
    return {
      siteSummary: params.siteSummary,
      qualityFlag: "untranslated",
      costUsd,
    }
  }

  // Script integrity — generic-field strictness via the lenient
  // validator (the brand name in siteName is allowed to stay Latin
  // even in CJK locales, so we don't strict-require here).
  if (!validateLocaleScript(parsed.siteSummary, params.locale.code)) {
    return {
      siteSummary: params.siteSummary,
      qualityFlag: "mixed-script",
      costUsd,
    }
  }

  return {
    siteSummary: parsed.siteSummary,
    qualityFlag: null,
    costUsd,
  }
}

/**
 * ---------------------------------------------------------------
 * Static page translation
 * ---------------------------------------------------------------
 *
 * The "Pages" section of llms.txt mirrors the multi-section CMS
 * model: each picked static page becomes one `[label](url): summary`
 * line. For non-default locales, label and summary need to be
 * translated, but **the URL must stay default-locale-prefixed**
 * (we add the `/{locale.slug}` prefix at render time, same as the
 * CMS path).
 *
 * Why a separate function from {@link translateLlmsItems}: pages
 * don't have CMS rows (no `fieldValuesByLocale` overlay to merge
 * into), and we don't try to read per-locale H1 content from
 * Framer's localized canvas — that data is accessible via
 * `framer.getLocalizedNodeText` but only for one locale at a
 * time, and walking N pages × M locales would be expensive AND
 * still incomplete (Framer's auto-translation is pre-publish,
 * static text on canvas isn't always localized). Asking the AI
 * directly is faster, cheaper, and more uniform — at the cost of
 * losing any hand-tuned localized titles the designer set up in
 * Framer's Localization panel. We call this trade-off out in the
 * UI helper text so designers can choose.
 *
 * Same quality bar as items: script integrity + byte-equal
 * passthrough detection. Failed pages fall back to source
 * label/summary so the file always renders something.
 */
export interface TranslateLlmsPagesParams {
  /** Default-locale page entries from {@link scanStaticPages}. */
  pages: ReadonlyArray<StaticPageEntry>
  /** Target locale. Caller must skip when isDefault. */
  locale: LocaleInfo
  brandVoice?: string
  ai: LlmsTranslateAiCredentials
}

export interface TranslateLlmsPagesResult {
  /**
   * Per-page translated label + description. The Map key is
   * `StaticPageEntry.id`. Pages that failed translation are
   * **omitted** from the map — caller falls back to the source
   * entry, surfacing the failure via {@link failed}.
   */
  translated: Map<string, { title: string; description: string }>
  /**
   * Pages whose AI output failed validation. The shape mirrors
   * the items `failed` shape so the UI can render one list of
   * "didn't make it" entries across pages and items.
   */
  failed: Array<{
    item: SkippedItem
    reason: LlmsTranslateQualityReason
  }>
  costUsd: number
  attempted: number
  succeeded: number
}

export async function translateLlmsPages(
  params: TranslateLlmsPagesParams,
  callAiFn: typeof callAi = callAi,
): Promise<TranslateLlmsPagesResult> {
  const empty: TranslateLlmsPagesResult = {
    translated: new Map(),
    failed: [],
    costUsd: 0,
    attempted: 0,
    succeeded: 0,
  }
  if (params.locale.isDefault) return empty
  if (params.pages.length === 0) return empty

  const sourceById = new Map<
    string,
    { title: string; summary?: string }
  >()
  const promptItems: Array<{
    id: string
    title: string
    summary?: string
    path?: string
  }> = []
  for (const page of params.pages) {
    const item: {
      id: string
      title: string
      summary?: string
      path?: string
    } = {
      id: page.id,
      title: page.title,
      path: page.rawPath,
    }
    if (page.description) item.summary = page.description
    sourceById.set(page.id, {
      title: page.title,
      summary: page.description || undefined,
    })
    promptItems.push(item)
  }

  const translated = new Map<string, { title: string; description: string }>()
  const failed: TranslateLlmsPagesResult["failed"] = []
  let costUsd = 0

  const requestBatch = async (
    batch: Array<{
      id: string
      title: string
      summary?: string
      path?: string
    }>,
    retryReason?: LlmsTranslateQualityReason,
  ): Promise<TranslatedItemRaw[] | null> => {
    const prompt = buildLlmsTranslatePrompt({
      targetLanguage: params.locale.code,
      targetRegion: params.locale.name,
      brandVoice: params.brandVoice,
      items: batch,
      retryReason,
    })
    const result = await callAiFn({
      providerId: params.ai.providerId as AiProvider,
      modelId: params.ai.modelId,
      apiKey: params.ai.apiKey,
      prompt,
      customProvider: params.ai.customProvider,
      maxTokens: estimateLlmsBatchMaxTokens(batch),
    })
    costUsd += result.estimatedCostUsd ?? 0
    return parseTranslateResponse(result.parsed, result.rawText)
  }

  const processBatch = async (
    batch: Array<{
      id: string
      title: string
      summary?: string
      path?: string
    }>,
    retryReason?: LlmsTranslateQualityReason,
  ): Promise<void> => {
    const parsed = await requestBatch(batch, retryReason)

    if (!parsed) {
      if (!retryReason) {
        await processBatch(batch, "parse-failed")
        return
      }
      if (batch.length > 1) {
        for (const item of batch) {
          await processBatch([item], "parse-failed")
        }
        return
      }
      const item = batch[0]!
      failed.push({
        item: {
          itemId: item.id,
          defaultTitle: item.title,
          reason: "missing-localized-title",
        },
        reason: "parse-failed",
      })
      return
    }

    let matchedById = 0
    const batchSeenById = new Set<string>()
    const batchFailed: TranslateLlmsPagesResult["failed"] = []
    const applyPage = (out: TranslatedItemRaw, rowId: string) => {
      const source = sourceById.get(rowId)
      if (!source) return
      batchSeenById.add(rowId)
      const accepted = acceptTranslatedItem(
        { title: out.title, summary: out.summary },
        source,
        params.locale.code,
      )
      if (!accepted.ok) {
        batchFailed.push({
          item: {
            itemId: rowId,
            defaultTitle: source.title,
            reason: "missing-localized-title",
          },
          reason: accepted.reason,
        })
        return
      }
      translated.set(rowId, {
        title: accepted.title,
        description: accepted.summary ?? "",
      })
    }

    for (const out of parsed) {
      if (!sourceById.has(out.id)) continue
      matchedById++
      applyPage(out, out.id)
    }

    if (matchedById === 0 && parsed.length === batch.length) {
      for (let i = 0; i < batch.length; i++) {
        applyPage(parsed[i]!, batch[i]!.id)
      }
    }

    for (const item of batch) {
      if (batchSeenById.has(item.id)) continue
      batchSeenById.add(item.id)
      batchFailed.push({
        item: {
          itemId: item.id,
          defaultTitle: item.title,
          reason: "missing-localized-title",
        },
        reason: "untranslated",
      })
    }

    if (!retryReason && batchFailed.length > 0) {
      const retryByReason = new Map<
        LlmsTranslateQualityReason,
        Array<{
          id: string
          title: string
          summary?: string
          path?: string
        }>
      >()
      for (const failure of batchFailed) {
        const item = batch.find((candidate) => candidate.id === failure.item.itemId)
        if (!item) continue
        const group = retryByReason.get(failure.reason) ?? []
        group.push(item)
        retryByReason.set(failure.reason, group)
      }
      for (const [reason, retryItems] of retryByReason) {
        await processBatch(retryItems, reason)
      }
      return
    }

    if (retryReason && batchFailed.length > 0 && batch.length > 1) {
      const failedIds = new Set(batchFailed.map((failure) => failure.item.itemId))
      for (const item of batch) {
        if (failedIds.has(item.id)) {
          await processBatch([item], retryReason)
        }
      }
      return
    }

    failed.push(...batchFailed)
  }

  for (const batch of chunk(promptItems, MAX_ITEMS_PER_BATCH)) {
    await processBatch(batch)
  }

  return {
    translated,
    failed,
    costUsd,
    attempted: params.pages.length,
    succeeded: translated.size,
  }
}

/**
 * ---------------------------------------------------------------
 * Long description translation
 * ---------------------------------------------------------------
 *
 * The long description is multi-paragraph markdown the designer
 * wrote (or AI-generated) for the default locale. Translation must
 * preserve the structure (paragraphs, bullet points, soft breaks)
 * because llms.txt parsers treat these as semantic boundaries.
 *
 * We use a focused prompt rather than reusing
 * {@link buildLlmsHeaderTranslatePrompt} because:
 *   - Long descriptions have higher token volume and benefit from
 *     explicit instructions about preserving markdown structure.
 *   - Header summary is one line; a long description's tonal
 *     register and length budget are different.
 *
 * Failure handling: same as the header — fall back to the source
 * with a quality flag. The file always ships a long description
 * (or none, if the designer skipped it).
 */
export interface TranslateLlmsLongDescriptionParams {
  /** Site name. Echoed into the prompt as brand context. */
  siteName: string
  /** Long description in default locale. May be empty → caller short-circuits. */
  longDescription: string
  locale: LocaleInfo
  brandVoice?: string
  ai: LlmsTranslateAiCredentials
}

export interface TranslateLlmsLongDescriptionResult {
  longDescription: string
  qualityFlag: LlmsTranslateQualityReason | null
  costUsd: number
}

/**
 * Parser for the long-description response. Same envelope shape
 * as {@link parseHeaderResponse} but with a single
 * `longDescription` field (allowing `description` / `text` /
 * `output` aliases for model resilience).
 */
function parseLongDescriptionResponse(
  parsed: unknown,
  rawText: string,
): { longDescription: string } | null {
  const candidates: unknown[] = []
  if (parsed !== null && parsed !== undefined) candidates.push(parsed)

  const stripped = rawText
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
  if (stripped) {
    try {
      candidates.push(JSON.parse(stripped))
    } catch {
      // ignore — try sliced parse below
    }
    const firstBrace = stripped.indexOf("{")
    const lastBrace = stripped.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        candidates.push(
          JSON.parse(stripped.slice(firstBrace, lastBrace + 1)),
        )
      } catch {
        // ignore
      }
    }
  }

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue
    const obj = c as Record<string, unknown>
    for (const key of [
      "longDescription",
      "long_description",
      "description",
      "text",
      "output",
    ]) {
      const v = obj[key]
      if (typeof v === "string" && v.trim().length > 0) {
        return { longDescription: v.trim() }
      }
    }
  }
  return null
}

export async function translateLlmsLongDescription(
  params: TranslateLlmsLongDescriptionParams,
  callAiFn: typeof callAi = callAi,
): Promise<TranslateLlmsLongDescriptionResult> {
  if (params.locale.isDefault || !params.longDescription.trim()) {
    return {
      longDescription: params.longDescription,
      qualityFlag: null,
      costUsd: 0,
    }
  }

  const prompt = buildLlmsLongDescriptionTranslatePrompt({
    targetLanguage: params.locale.code,
    targetRegion: params.locale.name,
    brandVoice: params.brandVoice,
    siteName: params.siteName,
    longDescription: params.longDescription,
  })

  let rawText = ""
  let parsedRaw: unknown = null
  let costUsd = 0
  try {
    const result = await callAiFn({
      providerId: params.ai.providerId as AiProvider,
      modelId: params.ai.modelId,
      apiKey: params.ai.apiKey,
      prompt,
      customProvider: params.ai.customProvider,
      // Long descriptions can be ~500-1500 chars in the source. CJK
      // locales output ~2-3 tokens/char. Headroom for reasoning
      // models that wrap output in `<think>`. Same logic as
      // generateLlmsSummary's 1500 cap, just bumped because the
      // surface is longer.
      maxTokens: 3000,
    })
    rawText = result.rawText
    parsedRaw = result.parsed
    costUsd = result.estimatedCostUsd ?? 0
  } catch {
    return {
      longDescription: params.longDescription,
      qualityFlag: "untranslated",
      costUsd: 0,
    }
  }

  const parsed = parseLongDescriptionResponse(parsedRaw, rawText)
  if (!parsed) {
    return {
      longDescription: params.longDescription,
      qualityFlag: "untranslated",
      costUsd,
    }
  }

  // Byte-equal passthrough check. The looksUntranslatedText helper
  // assumes "headline / description" pair semantics; we feed only
  // the description side because there's no headline counterpart.
  const passthrough = looksUntranslatedText(
    { description: parsed.longDescription },
    { description: params.longDescription },
  )
  if (passthrough) {
    return {
      longDescription: params.longDescription,
      qualityFlag: "untranslated",
      costUsd,
    }
  }

  if (!validateLocaleScript(parsed.longDescription, params.locale.code)) {
    return {
      longDescription: params.longDescription,
      qualityFlag: "mixed-script",
      costUsd,
    }
  }

  return {
    longDescription: parsed.longDescription,
    qualityFlag: null,
    costUsd,
  }
}
