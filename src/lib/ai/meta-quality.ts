import {
  requireTargetScript,
  validateLocaleScript,
} from "../locale-script"
import { looksUntranslatedText } from "./translation-quality"

/**
 * Meta-AI translation quality validators.
 *
 * Ports the V2 Schema mechanisms (script validation + byte-equal
 * passthrough detection) onto the Meta AI surface so that designers
 * see the same quality signals on Meta cards that they already see
 * on Schema proposals. We deliberately *do not* call any AI here —
 * these are pure heuristics over already-fetched output, mirroring
 * `translation-quality.ts` and the script validators in
 * `identity-scan.ts`.
 *
 * Why a dedicated module instead of inlining into MetaAiView:
 *  - Pure functions are unit-testable without a React/Framer harness.
 *  - The exact same logic will land on llms.txt v2 once we wire AI
 *    summaries there. Centralizing now avoids the drift we'd get
 *    from copy-pasting validators into each view.
 */

/**
 * Names of the meta fields the AI returns. Matches the GeneratedMeta
 * shape in MetaAiView. Kept as a string-literal union (not derived
 * from the type) so a typo in the union is a compile error in
 * `validateMetaFields`.
 */
export type MetaQualityField =
  | "title"
  | "metaDescription"
  | "ogTitle"
  | "ogDescription"
  | "twitterTitle"
  | "twitterDescription"

/**
 * Why a flag fired. The UI maps each reason to a one-line warning
 * tooltip (see `meta.qualityReasonMixedScript` /
 * `meta.qualityReasonUntranslated` in i18n).
 *
 *  - `mixed-script`: the field's content is in the wrong script for
 *    the target locale (e.g. Hangul leaking into a `ja` description,
 *    Latin-only `Editorial Team` placeholder surviving into `ja`).
 *    Per-field, surfaced inline next to the offending field.
 *
 *  - `untranslated`: the AI output for this LOCALE is byte-equal to
 *    the source (the user's pageContext blob and pageType label).
 *    Card-level — applies to the whole result. The single most
 *    common AI-translation failure mode we see in production.
 */
export type MetaQualityReason =
  | "mixed-script"
  | "untranslated"
  | "parse-failed"

/**
 * One quality issue. Either:
 *   - `field !== null` → per-field flag, render inline near that field.
 *   - `field === null` → card-level flag, render in the card header.
 *
 * Discriminated by `reason` so the UI can decide which icon/message
 * to use without re-deriving from field+reason combos.
 */
export interface MetaQualityFlag {
  /**
   * Specific meta field that's broken, or `null` for a card-level
   * issue (currently only `untranslated`, which compares the
   * headline+description pair as a unit).
   */
  field: MetaQualityField | null
  reason: MetaQualityReason
}

/**
 * Subset of GeneratedMeta this module reads from. Avoiding an import
 * from MetaAiView (which is the consumer) keeps the dependency arrow
 * pointing the right way.
 */
export interface MetaToValidate {
  title?: string
  metaDescription?: string
  ogTitle?: string
  ogDescription?: string
  twitterTitle?: string
  twitterDescription?: string
}

export interface ValidateMetaParams {
  parsed: MetaToValidate
  /**
   * BCP-47 (or locale-id) code of the target locale. Drives both
   * script validation and the placeholder-strict requirement on
   * `title`.
   */
  localeCode: string
  /**
   * The source text the AI was asked to translate FROM. We compare
   * the parsed title/metaDescription against `pageType + pageContext`
   * for byte-equal pass-through detection. When omitted, the
   * `untranslated` check is skipped (e.g. for the default locale,
   * where there is no translation step).
   */
  source?: { pageContext: string; pageType?: string }
  /**
   * When true, this is the project's default locale and no
   * translation has happened — script + untranslated checks both
   * become noise. Caller decides; the validator just respects it.
   */
  isDefaultLocale: boolean
}

/**
 * The minimum length below which we don't bother flagging
 * mixed-script issues. Brand-name og:title strings ("Acme") and
 * sub-10-character labels ("Pricing") legitimately stay Latin
 * across most locales; flagging them would generate persistent
 * false positives that train designers to ignore the warnings.
 *
 * For the `title` field specifically we use `requireTargetScript`
 * which is stricter — see `validateMetaFields`.
 */
const SCRIPT_CHECK_MIN_LENGTH = 6

/**
 * Compute quality flags for one locale's meta result.
 *
 * Returned flags are deduplicated by (field, reason) and ordered
 * by field-priority so the UI can show "{field}" issues first and
 * the card-level untranslated tag at the end.
 *
 * Pure / synchronous / no IO. Safe to call on every render.
 */
export function validateMetaFields(p: ValidateMetaParams): MetaQualityFlag[] {
  if (p.isDefaultLocale) return []

  const flags: MetaQualityFlag[] = []

  // --- Script validation, per field ---
  //
  // The `title` field uses the STRICT validator (`requireTargetScript`)
  // because it doubles as the page's primary localized signal in SERP
  // and AI search panels. A Latin-only `title` for a `ja` locale is
  // almost always a translation failure — even brand names usually get
  // a katakana suffix in Japanese SERP titles ("Acme | アクメ公式サイト").
  //
  // All other fields (metaDescription / ogTitle / ogDescription /
  // twitterTitle / twitterDescription) use the LENIENT validator. They
  // can legitimately mix Latin loanwords with native script, especially
  // for tech/SaaS copy ("Acme で SEO を強化"). Lenient catches the loud
  // failure modes (Hangul in `ja`, wrong Han glyphs in `ja`) without
  // crying wolf on loanwords or kanji-only labels (利用規約).
  const fields: MetaQualityField[] = [
    "title",
    "metaDescription",
    "ogTitle",
    "ogDescription",
    "twitterTitle",
    "twitterDescription",
  ]

  for (const field of fields) {
    const value = (p.parsed[field] ?? "").trim()
    if (value.length < SCRIPT_CHECK_MIN_LENGTH) continue

    const ok =
      field === "title"
        ? requireTargetScript(value, p.localeCode)
        : validateLocaleScript(value, p.localeCode)

    if (!ok) flags.push({ field, reason: "mixed-script" })
  }

  // --- Card-level untranslated check ---
  //
  // Only the description-vs-pageContext pair is meaningful for Meta:
  //   - `pageType` is a Framer page-type label ("Landing page",
  //     "Blog post"). It is structurally too short and too generic
  //     to byte-match an AI-emitted `title`, even when the AI passed
  //     through. So title-vs-pageType is dropped from this check —
  //     `requireTargetScript` on `title` already catches title-level
  //     passthrough loudly enough.
  //   - `pageContext` is the body the user pasted in, and the
  //     dominant Meta failure mode is "AI emitted the first 1–2
  //     sentences of pageContext verbatim as the metaDescription
  //     because it didn't actually translate". Single-field
  //     byte-equality fires precisely on that case.
  //
  // Reuse `looksUntranslatedText` (single-field invocation) so we
  // pick up its built-in MIN_LENGTH gate and don't drift from the
  // Schema heuristic over time.
  if (p.source) {
    const sourceContextSample = (p.source.pageContext ?? "").trim().slice(0, 200)
    const untranslated = looksUntranslatedText(
      { description: p.parsed.metaDescription?.trim() || undefined },
      { description: sourceContextSample || undefined },
    )
    if (untranslated) flags.push({ field: null, reason: "untranslated" })
  }

  return flags
}

/**
 * Convenience predicate for the UI's card header: "does this card
 * have any quality issues at all?". Cheaper than computing flags
 * every render; computed once in MetaAiView and threaded down to
 * the row.
 */
export function hasMetaQualityIssue(flags: MetaQualityFlag[]): boolean {
  return flags.length > 0
}

/**
 * Look up flags relevant to a specific meta field. Used by the row
 * renderer to decide whether to draw a ⚠ badge next to that field.
 */
export function flagsForField(
  flags: MetaQualityFlag[],
  field: MetaQualityField,
): MetaQualityFlag[] {
  return flags.filter((f) => f.field === field)
}
