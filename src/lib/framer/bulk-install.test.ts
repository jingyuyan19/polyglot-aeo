import { describe, expect, it } from "vitest"

import {
  applyIdentityToInput,
  expandProposalsToBlocks,
} from "./bulk-install"
import type { LocaleInfo } from "./locales"
import type { SiteIdentity, SiteIdentityTranslations } from "../schema/identity"
import type { SchemaProposal } from "../schema/proposal"
import type { SchemaInput } from "../schema/types"

function articleProposal(
  pageId: string,
  enabled: boolean,
  url = "https://acme.com/blog/post",
): SchemaProposal {
  const inputs: SchemaInput = {
    kind: "Article",
    canonicalUrl: url,
    language: "en-US",
    headline: `Headline ${pageId}`,
    description: "Body.",
    authorName: "Editor",
    publisherName: "Acme",
    datePublished: "2026-01-01",
  }
  return {
    pageId,
    pageLabel: pageId,
    url,
    kind: "Article",
    inputs,
    originalInputs: inputs,
    enabled,
    sourceHash: "h",
    confidence: 0.9,
    rationale: "test",
  }
}

const EN: LocaleInfo = {
  id: "en-id",
  code: "en-US",
  name: "English",
  slug: "en",
  isDefault: true,
}
const JA: LocaleInfo = {
  id: "ja-id",
  code: "ja-JP",
  name: "Japanese",
  slug: "ja",
  isDefault: false,
}

describe("expandProposalsToBlocks", () => {
  it("emits one block per (enabled proposal × locale)", () => {
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", true), articleProposal("b", true)],
      locales: [EN, JA],
      defaultLocale: EN,
    })
    expect(blocks.length).toBe(4)
  })

  it("skips disabled proposals entirely", () => {
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", false), articleProposal("b", true)],
      locales: [EN, JA],
      defaultLocale: EN,
    })
    expect(blocks.length).toBe(2)
    for (const b of blocks) {
      const parsed = JSON.parse(b.jsonLd)
      expect(parsed.headline).toBe("Headline b")
    }
  })

  it("returns empty list when no proposals enabled", () => {
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", false)],
      locales: [EN, JA],
      defaultLocale: EN,
    })
    expect(blocks).toEqual([])
  })

  it("default locale URL stays unchanged; non-default locale URL gets prefixed", () => {
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", true, "https://acme.com/blog/post")],
      locales: [EN, JA],
      defaultLocale: EN,
    })
    const enBlock = blocks.find((b) => b.language === "en-US")!
    const jaBlock = blocks.find((b) => b.language === "ja-JP")!
    const enParsed = JSON.parse(enBlock.jsonLd)
    const jaParsed = JSON.parse(jaBlock.jsonLd)
    expect(enParsed.url ?? enParsed.mainEntityOfPage?.["@id"]).toContain(
      "https://acme.com/blog/post",
    )
    expect(JSON.stringify(jaParsed)).toContain("/ja/blog/post")
  })

  it("homepage URL localizes to /ja for non-default locale", () => {
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("home", true, "https://acme.com/")],
      locales: [EN, JA],
      defaultLocale: EN,
    })
    const jaBlock = blocks.find((b) => b.language === "ja-JP")!
    const jaParsed = JSON.parse(jaBlock.jsonLd)
    expect(JSON.stringify(jaParsed)).toContain("https://acme.com/ja")
  })

  it("uses translation overrides for non-default locales when provided", () => {
    const translatedJa: SchemaInput = {
      kind: "Article",
      canonicalUrl: "https://acme.com/blog/post",
      language: "ja-JP",
      headline: "日本語の見出し",
      authorName: "編集者",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    }

    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", true)],
      locales: [EN, JA],
      defaultLocale: EN,
      translations: {
        a: { "ja-JP": translatedJa },
      },
    })
    const jaBlock = blocks.find((b) => b.language === "ja-JP")!
    const jaParsed = JSON.parse(jaBlock.jsonLd)
    expect(jaParsed.headline).toBe("日本語の見出し")
    expect(jaParsed.inLanguage).toBe("ja-JP")
  })

  it("translation override's canonicalUrl is overridden by locale-prefixed URL", () => {
    // Defensive: even if the AI returns a wrong canonicalUrl in the translated
    // payload, bulk-install always recomputes the localized URL.
    const translatedJa: SchemaInput = {
      kind: "Article",
      canonicalUrl: "https://wrong.example/oops",
      language: "ja-JP",
      headline: "日本語",
      authorName: "編集者",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    }
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", true, "https://acme.com/blog/post")],
      locales: [EN, JA],
      defaultLocale: EN,
      translations: { a: { "ja-JP": translatedJa } },
    })
    const jaBlock = blocks.find((b) => b.language === "ja-JP")!
    expect(jaBlock.jsonLd).not.toContain("wrong.example")
    expect(jaBlock.jsonLd).toContain("/ja/blog/post")
  })
})

// ---------- V2 identity injection ----------

const ID: SiteIdentity = {
  brandName: "Acme",
  defaultAuthor: "Editorial Team",
  organizationDescription: "We make widgets.",
  publisherUrl: "https://acme.com",
  publisherLogo: "https://acme.com/logo.png",
  confidence: 0.9,
  source: "ai",
  derivedAt: 0,
}

const ID_TRANSLATIONS: SiteIdentityTranslations = {
  "ja-JP": {
    brandName: "アクメ",
    defaultAuthor: "編集チーム",
    organizationDescription: "私たちはウィジェットを作っています。",
  },
}

describe("applyIdentityToInput", () => {
  // Direct unit tests for the resolution rules. Important enough to
  // pin separately from the `expandProposalsToBlocks` integration
  // tests so a regression in the rules surfaces with a precise
  // failure message.

  function articleInput(
    overrides: Partial<{
      authorName: string
      publisherName: string
      publisherUrl: string
      publisherLogo: string
    }> = {},
  ): SchemaInput {
    return {
      kind: "Article",
      canonicalUrl: "https://acme.com/x",
      language: "en",
      headline: "h",
      datePublished: "2026-01-01",
      authorName: overrides.authorName ?? "Editorial Team",
      publisherName: overrides.publisherName ?? "Acme",
      publisherUrl: overrides.publisherUrl,
      publisherLogo: overrides.publisherLogo,
    }
  }

  it("returns input unchanged when identity is missing", () => {
    // Manual mode / pre-V2 callers: no identity → no rewrite.
    const input = articleInput()
    expect(applyIdentityToInput(input, undefined, undefined)).toBe(input)
  })

  it("locks Article publisher.name to identity brand", () => {
    const out = applyIdentityToInput(articleInput(), ID, ID)
    expect(out.kind).toBe("Article")
    if (out.kind !== "Article") throw new Error("not Article")
    expect(out.publisherName).toBe("Acme")
  })

  it("injects Article publisher.url from identity", () => {
    const out = applyIdentityToInput(
      articleInput({ publisherUrl: "https://wrong.example" }),
      ID,
      ID,
    )
    if (out.kind !== "Article") throw new Error("not Article")
    expect(out.publisherUrl).toBe("https://acme.com")
  })

  it("replaces placeholder author with identity defaultAuthor", () => {
    // The literal V1 default ("Editorial Team") is treated as a
    // placeholder so V2 can collapse it to the locale-translated
    // value.
    const out = applyIdentityToInput(
      articleInput({ authorName: "Editorial Team" }),
      ID,
      ID,
    )
    if (out.kind !== "Article") throw new Error("not Article")
    expect(out.authorName).toBe("Editorial Team") // identity default in default locale
  })

  it("preserves a real per-page author byline", () => {
    // "Jane Smith" is clearly a real byline — V2 must not clobber
    // it with the site default. This is the headline guarantee for
    // the per-page-override semantics.
    const out = applyIdentityToInput(
      articleInput({ authorName: "Jane Smith" }),
      ID,
      ID,
    )
    if (out.kind !== "Article") throw new Error("not Article")
    expect(out.authorName).toBe("Jane Smith")
  })

  it("replaces empty author with identity default", () => {
    const out = applyIdentityToInput(
      articleInput({ authorName: "" }),
      ID,
      ID,
    )
    if (out.kind !== "Article") throw new Error("not Article")
    expect(out.authorName).toBe("Editorial Team")
  })

  it("Organization name comes from identity brand", () => {
    const orgInput: SchemaInput = {
      kind: "Organization",
      canonicalUrl: "https://acme.com",
      language: "en",
      name: "Old Name",
      url: "https://acme.com",
    }
    const out = applyIdentityToInput(orgInput, ID, ID)
    if (out.kind !== "Organization") throw new Error("not Organization")
    expect(out.name).toBe("Acme")
    expect(out.url).toBe("https://acme.com")
  })

  it("non-Article/Organization kinds pass through unchanged", () => {
    // Product, FAQPage, LocalBusiness don't have publisher/author
    // site-identity fields. We don't touch them.
    const product: SchemaInput = {
      kind: "Product",
      canonicalUrl: "https://acme.com/widget",
      language: "en",
      name: "Widget",
    }
    expect(applyIdentityToInput(product, ID, ID)).toBe(product)
  })
})

describe("expandProposalsToBlocks — identity injection", () => {
  it("publisher.name is identity-derived per locale across all articles", () => {
    // The headline V2 guarantee: every Article block in a given
    // locale shares the same publisher.name, regardless of what
    // the AI translation produced for the per-page publisherName.
    const overrideJa: SchemaInput = {
      kind: "Article",
      canonicalUrl: "x",
      language: "ja-JP",
      headline: "日本語",
      authorName: "編集者",
      publisherName: "DRIFT VALUE THE AI MADE UP",
      datePublished: "2026-01-01",
    }
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", true), articleProposal("b", true)],
      locales: [EN, JA],
      defaultLocale: EN,
      translations: {
        a: { "ja-JP": overrideJa },
        b: { "ja-JP": overrideJa },
      },
      identity: ID,
      identityTranslations: ID_TRANSLATIONS,
    })
    const jaBlocks = blocks.filter((b) => b.language === "ja-JP")
    for (const b of jaBlocks) {
      const parsed = JSON.parse(b.jsonLd)
      expect(parsed.publisher?.name).toBe("アクメ")
    }
    const enBlocks = blocks.filter((b) => b.language === "en-US")
    for (const b of enBlocks) {
      const parsed = JSON.parse(b.jsonLd)
      expect(parsed.publisher?.name).toBe("Acme")
    }
  })

  it("falls back to source identity when locale translation is missing", () => {
    // Only ja-JP is in identityTranslations; if a project adds nl
    // before re-running Phase 0.5, nl should still get a valid
    // (source-language) publisher rather than empty / drift.
    const NL: LocaleInfo = {
      id: "nl",
      code: "nl",
      name: "Dutch",
      slug: "nl",
      isDefault: false,
    }
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", true)],
      locales: [EN, NL],
      defaultLocale: EN,
      identity: ID,
      identityTranslations: ID_TRANSLATIONS,
    })
    const nlBlock = blocks.find((b) => b.language === "nl")!
    const parsed = JSON.parse(nlBlock.jsonLd)
    // Source brandName ("Acme") used as fallback — better than
    // empty or per-article drift.
    expect(parsed.publisher?.name).toBe("Acme")
  })

  it("preserves real author bylines while normalizing the placeholder", () => {
    // Mixed site: one article has a real byline, one uses the
    // placeholder. V2 should leave Jane alone but normalize the
    // placeholder to the locale identity author.
    const realByline = articleProposal("real", true)
    const realArticleInput = realByline.inputs as Extract<
      SchemaInput,
      { kind: "Article" }
    >
    realByline.inputs = {
      ...realArticleInput,
      authorName: "Jane Smith",
    }

    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("placeholder", true), realByline],
      locales: [EN, JA],
      defaultLocale: EN,
      identity: ID,
      identityTranslations: ID_TRANSLATIONS,
    })

    const placeholderJa = blocks.find(
      (b) =>
        b.language === "ja-JP" &&
        JSON.parse(b.jsonLd).headline?.includes("placeholder"),
    )!
    expect(JSON.parse(placeholderJa.jsonLd).author?.name).toBe(
      "編集チーム",
    )

    const realJa = blocks.find(
      (b) =>
        b.language === "ja-JP" &&
        JSON.parse(b.jsonLd).headline?.includes("real"),
    )!
    expect(JSON.parse(realJa.jsonLd).author?.name).toBe("Jane Smith")
  })

  it("default locale uses source identity (no translation lookup)", () => {
    // For en-US (the default), we don't touch identityTranslations
    // — identity itself IS the en-US value. Verify that explicitly
    // so future maintainers don't misroute the default-locale path.
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", true)],
      locales: [EN, JA],
      defaultLocale: EN,
      identity: ID,
      identityTranslations: ID_TRANSLATIONS,
    })
    const enBlock = blocks.find((b) => b.language === "en-US")!
    const parsed = JSON.parse(enBlock.jsonLd)
    expect(parsed.publisher?.name).toBe("Acme")
    expect(parsed.publisher?.url).toBe("https://acme.com")
    expect(parsed.author?.name).toBe("Editorial Team")
  })

  it("localizes identity publisher.url for non-default locales", () => {
    const blocks = expandProposalsToBlocks({
      proposals: [articleProposal("a", true)],
      locales: [EN, JA],
      defaultLocale: EN,
      identity: ID,
      identityTranslations: ID_TRANSLATIONS,
    })
    const jaBlock = blocks.find((b) => b.language === "ja-JP")!
    const parsed = JSON.parse(jaBlock.jsonLd)
    expect(parsed.publisher?.url).toBe("https://acme.com/ja")
  })
})
