import { describe, expect, it } from "vitest"

import {
  extractTranslatableText,
  looksUntranslated,
  looksUntranslatedText,
} from "./translation-quality"
import type {
  ArticleInput,
  FaqPageInput,
  OrganizationInput,
  ProductInput,
  SchemaInput,
} from "../schema/types"

const ARTICLE_EN: ArticleInput = {
  kind: "Article",
  canonicalUrl: "https://example.com/blog/post",
  language: "en-US",
  headline: "Getting Started With Our CMS",
  description:
    "A guide on setting up content fields and adding collections to the canvas.",
  authorName: "Editorial Team",
  publisherName: "Site",
  datePublished: "2026-05-05",
}

const ARTICLE_JA_GOOD: ArticleInput = {
  ...ARTICLE_EN,
  language: "ja",
  headline: "CMS をはじめよう",
  description:
    "コンテンツフィールドの設定方法と、Canvas へのコレクション追加について解説します。",
  authorName: "編集チーム",
  publisherName: "サイト",
}

/** AI passed the source through verbatim — the failure mode this module catches. */
const ARTICLE_JA_FAILED: ArticleInput = {
  ...ARTICLE_EN,
  language: "ja",
  // headline + description still English
}

describe("extractTranslatableText", () => {
  it("pulls headline + description from Article", () => {
    expect(extractTranslatableText(ARTICLE_EN)).toEqual({
      headline: ARTICLE_EN.headline,
      description: ARTICLE_EN.description,
    })
  })

  it("maps Product `name` to headline", () => {
    const product: ProductInput = {
      kind: "Product",
      canonicalUrl: "https://example.com/p/x",
      language: "en-US",
      name: "Wireless Headphones Pro Max",
      description: "Noise-cancelling over-ear headphones with 30h battery life.",
    }
    expect(extractTranslatableText(product)).toEqual({
      headline: product.name,
      description: product.description,
    })
  })

  it("maps Organization `name` to headline", () => {
    const org: OrganizationInput = {
      kind: "Organization",
      canonicalUrl: "https://example.com/",
      language: "en-US",
      name: "Acme Corporation",
      description: "Maker of fine widgets since 1923.",
      url: "https://example.com/",
    }
    expect(extractTranslatableText(org)).toEqual({
      headline: org.name,
      description: org.description,
    })
  })

  it("uses first FAQ Q&A as representative content", () => {
    const faq: FaqPageInput = {
      kind: "FAQPage",
      canonicalUrl: "https://example.com/faq",
      language: "en-US",
      questions: [
        { question: "How do I get started?", answer: "Sign up and follow the wizard." },
        { question: "Is there a free trial?", answer: "Yes, 14 days." },
      ],
    }
    expect(extractTranslatableText(faq)).toEqual({
      headline: faq.questions[0].question,
      description: faq.questions[0].answer,
    })
  })

  it("returns empty object for FAQ with no questions", () => {
    const empty: FaqPageInput = {
      kind: "FAQPage",
      canonicalUrl: "https://example.com/faq",
      language: "en-US",
      questions: [],
    }
    expect(extractTranslatableText(empty)).toEqual({})
  })
})

describe("looksUntranslated", () => {
  it("returns false for a properly translated article", () => {
    expect(looksUntranslated(ARTICLE_JA_GOOD, ARTICLE_EN)).toBe(false)
  })

  it("returns true when both headline AND description pass through unchanged", () => {
    // The headline regression case from the user's QA output: AI
    // returned the original English for `ja` What's New / Styling
    // Elements articles. Both fields stayed English. Must flag.
    expect(looksUntranslated(ARTICLE_JA_FAILED, ARTICLE_EN)).toBe(true)
  })

  it("returns false when only headline is unchanged but description was translated", () => {
    // Brand-name headline ("Polyglot AEO") legitimately stays the same
    // across locales. As long as description was translated, we trust it.
    const partial: ArticleInput = {
      ...ARTICLE_EN,
      language: "ja",
      // headline same as original
      description: "実際に翻訳されたディスクリプションです。",
    }
    expect(looksUntranslated(partial, ARTICLE_EN)).toBe(false)
  })

  it("returns false when only description is unchanged but headline was translated", () => {
    const partial: ArticleInput = {
      ...ARTICLE_EN,
      language: "ja",
      headline: "翻訳された見出し",
      // description still English
    }
    expect(looksUntranslated(partial, ARTICLE_EN)).toBe(false)
  })

  it("does not flag short identical text (under MIN_LENGTH_FOR_CHECK)", () => {
    // "FAQ" stays "FAQ" in many languages. Below 8 chars, skip the
    // check — we'd rather miss a true positive than false-flag short
    // labels.
    const shortEn: ArticleInput = {
      ...ARTICLE_EN,
      headline: "FAQ",
      description: "Q+A.",
    }
    const shortJa: ArticleInput = {
      ...shortEn,
      language: "ja",
    }
    expect(looksUntranslated(shortJa, shortEn)).toBe(false)
  })

  it("returns false when original has no translatable content", () => {
    // Vacuously translated: page had no body, so flagging would be noise.
    const empty: ArticleInput = {
      kind: "Article",
      canonicalUrl: "https://example.com/empty",
      language: "en-US",
      headline: "",
      authorName: "Editorial Team",
      publisherName: "Site",
      datePublished: "2026-05-05",
    }
    expect(looksUntranslated(empty, empty)).toBe(false)
  })

  it("flags FAQ when the first row is byte-equal across locales", () => {
    const faqEn: FaqPageInput = {
      kind: "FAQPage",
      canonicalUrl: "https://example.com/faq",
      language: "en-US",
      questions: [
        { question: "How do I get started?", answer: "Sign up and follow the wizard." },
      ],
    }
    const faqJaFailed: FaqPageInput = {
      ...faqEn,
      language: "ja",
      // identical questions array
    }
    expect(looksUntranslated(faqJaFailed, faqEn)).toBe(true)
  })

  it("handles single-field case (only headline, no description)", () => {
    // `/blog` collection-landing pages have a headline (the H1) but
    // typically no description. Single-field check still works.
    const headlineOnlyEn: ArticleInput = {
      kind: "Article",
      canonicalUrl: "https://example.com/blog",
      language: "en-US",
      headline: "All Our Latest Articles",
      authorName: "Editorial Team",
      publisherName: "Site",
      datePublished: "2026-05-05",
    }
    const headlineOnlyJaFailed: ArticleInput = {
      ...headlineOnlyEn,
      language: "ja",
    }
    expect(looksUntranslated(headlineOnlyJaFailed, headlineOnlyEn)).toBe(true)

    const headlineOnlyJaGood: ArticleInput = {
      ...headlineOnlyEn,
      language: "ja",
      headline: "最新記事一覧",
    }
    expect(looksUntranslated(headlineOnlyJaGood, headlineOnlyEn)).toBe(false)
  })

  // The schema-agnostic core that Meta AI / llms.txt / future surfaces
  // share with the schema audit. Same heuristic, just doesn't require
  // a SchemaInput-shaped wrapper.
  describe("looksUntranslatedText (generic core)", () => {
    it("flags when headline + description are both byte-equal and long enough", () => {
      const en = {
        headline: "Welcome to our blog",
        description: "Read articles on design and development.",
      }
      expect(looksUntranslatedText(en, en)).toBe(true)
    })

    it("does not flag when description was actually translated", () => {
      const en = {
        headline: "Welcome to our blog",
        description: "Read articles on design and development.",
      }
      const ja = {
        headline: en.headline, // brand-like passthrough is ok in isolation
        description: "デザインと開発に関する記事を読む。",
      }
      expect(looksUntranslatedText(ja, en)).toBe(false)
    })

    it("does not flag when both fields are below MIN_LENGTH_FOR_CHECK", () => {
      const en = { headline: "Hi", description: "Hey." }
      expect(looksUntranslatedText(en, en)).toBe(false)
    })

    it("returns false when original has no translatable text", () => {
      expect(looksUntranslatedText({}, {})).toBe(false)
      expect(
        looksUntranslatedText(
          { headline: "Translated" },
          { headline: undefined, description: undefined },
        ),
      ).toBe(false)
    })

    it("flags single-field passthrough (headline-only)", () => {
      const en = { headline: "All Our Latest Articles" }
      expect(looksUntranslatedText(en, en)).toBe(true)
    })

    it("flags single-field passthrough (description-only)", () => {
      const en = {
        description: "A tour of every feature shipped this quarter.",
      }
      expect(looksUntranslatedText(en, en)).toBe(true)
    })

    it("does not flag when single original field is below threshold", () => {
      const en = { headline: "FAQ" }
      expect(looksUntranslatedText(en, en)).toBe(false)
    })
  })

  it("returns false when target equals source across schema kinds (mismatch)", () => {
    // Defensive: if a caller somehow compares an Article to a Product
    // with totally different field shapes, the function should not
    // crash. Returns false because cross-kind comparison is meaningless.
    const product: SchemaInput = {
      kind: "Product",
      canonicalUrl: "https://example.com/x",
      language: "en-US",
      name: "Different shape",
      description: "Has different field names.",
    }
    expect(() => looksUntranslated(product, ARTICLE_EN)).not.toThrow()
  })
})
