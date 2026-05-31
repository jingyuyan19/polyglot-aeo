import type { SchemaInput } from "../schema/types"

/**
 * Pure heuristics for detecting failed AI translations.
 *
 * The problem: any AI provider — including the strongest frontier models
 * — will occasionally return the source text unchanged when asked to
 * translate. The plugin used to silently install these as `inLanguage:
 * <target>` blocks, producing JSON-LD that Google reads as "this page
 * declares Japanese but the content is English" — a soft SEO penalty
 * because Google interprets it as locale-tag fraud.
 *
 * The fix is detection, not retry. Retry is the user's choice — they
 * may want to re-run with a different model, edit manually, or just
 * disable the locale for that page. We give them visibility.
 *
 * Why heuristics, not a "did the model translate?" probe call: a
 * dedicated probe doubles AI cost. The byte-equal check is essentially
 * free, runs on already-fetched results, and catches the failure mode
 * we actually see in production (full passthrough).
 */

const MIN_LENGTH_FOR_CHECK = 8

/**
 * Generic "headline + description" pair the heuristic operates on.
 *
 * Lifted out of {@link extractTranslatableText} so callers that aren't
 * dealing with `SchemaInput` (Meta AI, llms.txt, future surfaces) can
 * feed the same byte-equal heuristic without needing to fabricate a
 * SchemaInput-shaped object. Both fields are optional — empty originals
 * make the pass-through check vacuously false (see {@link
 * looksUntranslatedText}).
 */
export interface TranslatableTextPair {
  headline?: string
  description?: string
}

/**
 * Pull human-readable text fields off a SchemaInput, regardless of kind.
 *
 * Schema kinds carry their "title" + "body" content under different
 * field names (`headline`/`description` for Article, `name`/`description`
 * for Product/Organization, `questions[0]` for FAQ). We normalize them
 * so the heuristic doesn't need a per-kind branch.
 *
 * Fields like `canonicalUrl`, `sku`, `price`, `addressCountry` are
 * deliberately excluded — they SHOULD be byte-equal across locales
 * (URLs are routed by prefix, currency is universal, country codes
 * are ISO).
 */
export function extractTranslatableText(input: SchemaInput): TranslatableTextPair {
  switch (input.kind) {
    case "Article":
      return { headline: input.headline, description: input.description }
    case "Product":
      return { headline: input.name, description: input.description }
    case "LocalBusiness":
      return { headline: input.name, description: input.description }
    case "Organization":
      return { headline: input.name, description: input.description }
    case "FAQPage": {
      // FAQ has no top-level title — fold the first Q+A as its
      // representative content. Most FAQ pages are translated wholesale
      // (all rows or none), so checking the first row is a reliable
      // signal.
      const first = input.questions[0]
      return first
        ? { headline: first.question, description: first.answer }
        : {}
    }
  }
}

/**
 * Did the AI actually translate, or did it pass the source through?
 *
 * Generic, schema-agnostic core. Operates on a {@link
 * TranslatableTextPair} so it can be used for SchemaInput (via
 * {@link looksUntranslated}), Meta AI results (via `validateMetaFields`
 * in `meta-quality.ts`), or any future surface that emits a
 * "headline + description" pair.
 *
 * Strategy:
 *  1. When BOTH headline and description exist in the original AND BOTH
 *     are byte-equal in the translation AND each is ≥ {@link
 *     MIN_LENGTH_FOR_CHECK} chars, we flag it. Two-field equality makes
 *     false positives vanishingly rare — a real translation always
 *     changes at least one of these.
 *  2. When only ONE of the two exists in the original, we accept some
 *     false-positive risk (brand-only headlines like "Apple" are rare
 *     but possible) and flag if that single field is byte-equal AND
 *     long enough.
 *  3. Empty originals are vacuously translated — return false rather
 *     than spam the user with warnings on content-less pages.
 *
 * The 8-char minimum exists to avoid flagging short labels ("OK",
 * "FAQ", brand acronyms) that legitimately stay the same across
 * languages.
 *
 * Returns true when the translation appears to have failed.
 */
export function looksUntranslatedText(
  translated: TranslatableTextPair,
  original: TranslatableTextPair,
): boolean {
  const haveHeadline = Boolean(original.headline)
  const haveDescription = Boolean(original.description)

  if (!haveHeadline && !haveDescription) return false

  if (haveHeadline && haveDescription) {
    // Strict: both must be byte-equal AND meaningfully long.
    const headlineLooksUntranslated =
      translated.headline === original.headline &&
      (original.headline?.length ?? 0) >= MIN_LENGTH_FOR_CHECK
    const descriptionLooksUntranslated =
      translated.description === original.description &&
      (original.description?.length ?? 0) >= MIN_LENGTH_FOR_CHECK
    return headlineLooksUntranslated && descriptionLooksUntranslated
  }

  // Single-field case. Compare the only existing field.
  const onlyOriginal = original.headline ?? original.description ?? ""
  if (onlyOriginal.length < MIN_LENGTH_FOR_CHECK) return false
  const onlyTranslated = translated.headline ?? translated.description ?? ""
  return onlyTranslated === onlyOriginal
}

/**
 * SchemaInput-shaped overload of {@link looksUntranslatedText}. Kept
 * for backwards compatibility with the schema audit pipeline — strips
 * the kind-specific field aliasing (Article.headline vs Product.name
 * vs FAQPage.questions[0]) before delegating to the generic core.
 */
export function looksUntranslated(
  translated: SchemaInput,
  original: SchemaInput,
): boolean {
  return looksUntranslatedText(
    extractTranslatableText(translated),
    extractTranslatableText(original),
  )
}
