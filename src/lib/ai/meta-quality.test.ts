import { describe, expect, it } from "vitest"

import {
  flagsForField,
  hasMetaQualityIssue,
  validateMetaFields,
  type MetaQualityFlag,
  type MetaToValidate,
} from "./meta-quality"

const SOURCE = {
  pageType: "Landing page",
  pageContext:
    "Polyglot AEO is a Framer plugin that ships per-locale schema, " +
    "meta, and llms.txt so AI search engines cite your site in every " +
    "language you publish.",
}

/** Realistic Japanese meta result — uses native script throughout. */
const JA_OK: MetaToValidate = {
  title: "Polyglot AEO で多言語 SEO を自動化",
  metaDescription:
    "Framer プラグインで、各言語ごとのスキーマ、メタ、llms.txt を一発で生成。",
  ogTitle: "Polyglot AEO で多言語 SEO を自動化",
  ogDescription:
    "AI 検索エンジンに引用されやすい多言語サイト構造を、Framer 上で構築。",
  twitterTitle: "Polyglot AEO で多言語 SEO",
  twitterDescription: "Framer プラグインで多言語 AEO を自動化。",
}

describe("validateMetaFields — locale & isDefaultLocale gating", () => {
  it("returns no flags for the default locale (no translation happened)", () => {
    expect(
      validateMetaFields({
        parsed: { title: "Editorial Team — Pricing" }, // would fail JA strict check
        localeCode: "ja",
        source: SOURCE,
        isDefaultLocale: true,
      }),
    ).toEqual([])
  })

  it("returns no flags for fully native-script Japanese output", () => {
    expect(
      validateMetaFields({
        parsed: JA_OK,
        localeCode: "ja",
        source: SOURCE,
        isDefaultLocale: false,
      }),
    ).toEqual([])
  })
})

describe("validateMetaFields — mixed-script per field", () => {
  it("flags `title` (strict) when output is Latin-only for a JA locale", () => {
    // The motivating bug: AI returns "Polyglot AEO — Pricing" verbatim
    // for `ja`. The lenient validator accepts short Latin strings
    // (escape hatch for brand-only headlines), but the strict variant
    // applied to `title` does not — page titles in `ja` SERP almost
    // always pick up at least a katakana suffix, and a Latin-only
    // title is the loudest indicator of a passthrough failure.
    const result = validateMetaFields({
      parsed: {
        ...JA_OK,
        title: "Polyglot AEO — Multilingual SEO",
      },
      localeCode: "ja",
      isDefaultLocale: false,
    })
    expect(result).toContainEqual<MetaQualityFlag>({
      field: "title",
      reason: "mixed-script",
    })
  })

  it("flags `metaDescription` when Hangul leaks into Japanese output", () => {
    const result = validateMetaFields({
      parsed: {
        ...JA_OK,
        metaDescription:
          "Framer 플러그인으로 다국어 SEO를 자동화 — leaked Hangul should fail JA validation.",
      },
      localeCode: "ja",
      isDefaultLocale: false,
    })
    expect(flagsForField(result, "metaDescription")).toEqual([
      { field: "metaDescription", reason: "mixed-script" },
    ])
  })

  it("flags `metaDescription` when Chinese-only kanji bleed into Japanese output", () => {
    const result = validateMetaFields({
      parsed: {
        ...JA_OK,
        metaDescription:
          "Framer プラグインで多言語の网站 SEO を自动化（多言語 AEO を一発生成）。",
      },
      localeCode: "ja",
      isDefaultLocale: false,
    })
    expect(flagsForField(result, "metaDescription")).toEqual([
      { field: "metaDescription", reason: "mixed-script" },
    ])
  })

  it("does not flag short Latin og:title (under SCRIPT_CHECK_MIN_LENGTH)", () => {
    // Brand-only og:title is fine. The 6-char minimum keeps "Acme",
    // "Pricing", "About" out of the warning stream.
    const result = validateMetaFields({
      parsed: { ...JA_OK, ogTitle: "Acme" },
      localeCode: "ja",
      isDefaultLocale: false,
    })
    expect(flagsForField(result, "ogTitle")).toEqual([])
  })

  it("does not flag a Latin og:description that mostly contains native script", () => {
    // Tech / SaaS copy frequently mixes loanwords. Lenient validator
    // accepts this; only the loud cross-script failures (hangul-in-ja)
    // should fire on description fields.
    const result = validateMetaFields({
      parsed: {
        ...JA_OK,
        ogDescription:
          "Framer プラグインで AI 検索向けの SEO を一発で自動化。",
      },
      localeCode: "ja",
      isDefaultLocale: false,
    })
    expect(flagsForField(result, "ogDescription")).toEqual([])
  })

  it("does not flag any Latin-locale meta — script question is moot", () => {
    // For `fr`/`es`/`de` etc, the lenient validator returns true
    // unconditionally and the strict validator on `title` defers to
    // it. Latin source + Latin target = no script-level signal.
    const result = validateMetaFields({
      parsed: {
        title: "Polyglot AEO — SEO multilingue automatisé",
        metaDescription:
          "Plugin Framer pour générer schema, meta et llms.txt par langue.",
      },
      localeCode: "fr",
      source: SOURCE,
      isDefaultLocale: false,
    })
    expect(result).toEqual([])
  })
})

describe("validateMetaFields — card-level untranslated", () => {
  it("flags untranslated when metaDescription byte-matches the first 200 chars of pageContext", () => {
    // Dominant production failure mode: AI quoted the source body
    // verbatim as the meta description for every non-English locale
    // because it never actually translated.
    const result = validateMetaFields({
      parsed: {
        title: "Polyglot AEO — Multilingual SEO Automation",
        metaDescription: SOURCE.pageContext.slice(0, 200),
      },
      localeCode: "fr", // Latin target so script check is moot
      source: SOURCE,
      isDefaultLocale: false,
    })
    expect(result).toContainEqual<MetaQualityFlag>({
      field: null,
      reason: "untranslated",
    })
  })

  it("does not flag untranslated when description was actually translated", () => {
    const result = validateMetaFields({
      parsed: JA_OK,
      localeCode: "ja",
      source: SOURCE,
      isDefaultLocale: false,
    })
    expect(result.filter((f) => f.reason === "untranslated")).toEqual([])
  })

  it("does not flag untranslated when only `title` byte-matches the page-type label", () => {
    // pageType is intentionally NOT used as a passthrough source —
    // it's too short/generic and a Latin-locale title can legitimately
    // contain "Landing page". The check is description-only.
    const result = validateMetaFields({
      parsed: {
        title: SOURCE.pageType,
        metaDescription: "Une description correctement traduite en français.",
      },
      localeCode: "fr",
      source: SOURCE,
      isDefaultLocale: false,
    })
    expect(result.filter((f) => f.reason === "untranslated")).toEqual([])
  })

  it("skips untranslated check when source is omitted (caller has no reference)", () => {
    const result = validateMetaFields({
      parsed: { metaDescription: SOURCE.pageContext.slice(0, 200) },
      localeCode: "ja",
      isDefaultLocale: false,
    })
    expect(result.filter((f) => f.reason === "untranslated")).toEqual([])
  })
})

describe("validateMetaFields — combined regressions from production output", () => {
  it("flags both script (per-field) and untranslated (card-level) when the AI passthroughs to JA", () => {
    // Full passthrough into a Japanese locale:
    //   - title: long Latin → strict requireTargetScript fails
    //   - metaDescription: long Latin → lenient validateLocaleScript
    //     fails (no kana, > 16 chars, has nothing but Latin)
    //   - description byte-matches pageContext sample → untranslated
    //     card-level flag fires
    const result = validateMetaFields({
      parsed: {
        title: "Polyglot AEO — Multilingual SEO Automation",
        metaDescription: SOURCE.pageContext.slice(0, 200),
      },
      localeCode: "ja",
      source: SOURCE,
      isDefaultLocale: false,
    })
    expect(result).toContainEqual<MetaQualityFlag>({
      field: "title",
      reason: "mixed-script",
    })
    expect(result).toContainEqual<MetaQualityFlag>({
      field: "metaDescription",
      reason: "mixed-script",
    })
    expect(result).toContainEqual<MetaQualityFlag>({
      field: null,
      reason: "untranslated",
    })
  })
})

describe("flagsForField + hasMetaQualityIssue", () => {
  const flags: MetaQualityFlag[] = [
    { field: "title", reason: "mixed-script" },
    { field: "metaDescription", reason: "mixed-script" },
    { field: null, reason: "untranslated" },
  ]

  it("filters flags by field", () => {
    expect(flagsForField(flags, "title")).toEqual([
      { field: "title", reason: "mixed-script" },
    ])
    expect(flagsForField(flags, "ogTitle")).toEqual([])
  })

  it("hasMetaQualityIssue returns true when any flag exists", () => {
    expect(hasMetaQualityIssue(flags)).toBe(true)
    expect(hasMetaQualityIssue([])).toBe(false)
  })
})
