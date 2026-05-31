import { describe, expect, it } from "vitest"

import {
  expandProposalsToBlocks,
  type BulkInstallParams,
} from "../framer/bulk-install"
import type { LocaleInfo } from "../framer/locales"
import type { SiteIdentity, SiteIdentityTranslations } from "./identity"
import type { SchemaProposal } from "./proposal"
import type { ArticleInput, OrganizationInput } from "./types"

/**
 * V2 architecture integration test.
 *
 * Pins the headline guarantees of the V2 redesign at the
 * highest-level public API boundary the plugin uses (the JSON-LD
 * blocks the install would write to Custom Code). Where the
 * narrower unit tests verify each stage in isolation, this file
 * proves they compose into the cross-article consistency promise
 * V2 was redesigned to deliver.
 *
 * Each test simulates a small site with multiple articles + an
 * organization, and asserts that the rendered JSON-LD blocks
 * across all (article × locale) combinations agree on
 * site-identity fields BY CONSTRUCTION — without any post-hoc
 * normalization pass.
 */

const EN: LocaleInfo = {
  id: "en",
  code: "en-US",
  name: "English",
  slug: "en",
  isDefault: true,
}
const JA: LocaleInfo = {
  id: "ja",
  code: "ja-JP",
  name: "Japanese",
  slug: "ja",
  isDefault: false,
}
const NL: LocaleInfo = {
  id: "nl",
  code: "nl",
  name: "Dutch",
  slug: "nl",
  isDefault: false,
}

function articleProposal(opts: {
  pageId: string
  url: string
  authorName?: string
}): SchemaProposal {
  const inputs: ArticleInput = {
    kind: "Article",
    canonicalUrl: opts.url,
    language: "en",
    headline: opts.pageId,
    description: "Body.",
    authorName: opts.authorName ?? "Editorial Team",
    publisherName: "Acme",
    datePublished: "2026-01-01",
  }
  return {
    pageId: opts.pageId,
    pageLabel: opts.pageId,
    url: opts.url,
    kind: "Article",
    inputs,
    originalInputs: inputs,
    enabled: true,
    sourceHash: "h",
    confidence: 0.9,
    rationale: "test",
  }
}

function orgProposal(): SchemaProposal {
  const inputs: OrganizationInput = {
    kind: "Organization",
    canonicalUrl: "https://acme.com",
    language: "en",
    name: "Acme",
    description: "We make widgets.",
    url: "https://acme.com",
  }
  return {
    pageId: "home",
    pageLabel: "Home",
    url: "https://acme.com",
    kind: "Organization",
    inputs,
    originalInputs: inputs,
    enabled: true,
    sourceHash: "h",
    confidence: 0.95,
    rationale: "homepage",
  }
}

const IDENTITY: SiteIdentity = {
  brandName: "Acme",
  defaultAuthor: "Editorial Team",
  organizationDescription: "We make widgets.",
  publisherUrl: "https://acme.com",
  publisherLogo: "https://acme.com/logo.png",
  confidence: 0.95,
  source: "ai",
  derivedAt: 0,
}

const ID_TRANSLATIONS: SiteIdentityTranslations = {
  "ja-JP": {
    brandName: "アクメ",
    defaultAuthor: "編集チーム",
    organizationDescription: "私たちはウィジェットを作っています。",
  },
  nl: {
    brandName: "Acme",
    defaultAuthor: "Redactieteam",
    organizationDescription: "Wij maken widgets.",
  },
}

function buildAndParse(params: BulkInstallParams): Array<{
  language: string
  payload: Record<string, unknown>
  pageHint: string
}> {
  return expandProposalsToBlocks(params).map((b) => {
    const payload = JSON.parse(b.jsonLd) as Record<string, unknown>
    const url = String(
      payload.url ??
        (payload.mainEntityOfPage as Record<string, unknown> | undefined)?.[
          "@id"
        ] ??
        "",
    )
    return { language: b.language, payload, pageHint: url }
  })
}

describe("V2 architecture — site-identity consistency", () => {
  // The whole point of V2: identity fields converge across all
  // articles in all locales by construction. No mode-pick, no
  // post-hoc normalization — render-time injection from a single
  // SiteIdentity bundle is the source of truth.

  it("publisher.name is identical across every article in every locale", () => {
    // Worst-case input shape: per-page translations contain
    // wildly drifted publisher names (the V1 bug). V2 ignores
    // them and uses the SiteIdentity.
    const articles: SchemaProposal[] = []
    for (let i = 0; i < 5; i++) {
      articles.push(
        articleProposal({
          pageId: `post-${i}`,
          url: `https://acme.com/blog/post-${i}`,
        }),
      )
    }
    const driftyTranslations: BulkInstallParams["translations"] = {}
    articles.forEach((a, i) => {
      const driftJa: ArticleInput = {
        kind: "Article",
        canonicalUrl: a.url,
        language: "ja-JP",
        headline: `日本語の記事 ${i}`,
        authorName: "編集者",
        publisherName: `DRIFTED PUBLISHER ${i}`, // V1 would ship this
        datePublished: "2026-01-01",
      }
      driftyTranslations![a.pageId] = { "ja-JP": driftJa }
    })

    const blocks = buildAndParse({
      proposals: articles,
      locales: [EN, JA],
      defaultLocale: EN,
      translations: driftyTranslations,
      identity: IDENTITY,
      identityTranslations: ID_TRANSLATIONS,
    })

    const enPublishers = new Set<string>()
    const jaPublishers = new Set<string>()
    for (const b of blocks) {
      const pub = (b.payload.publisher as Record<string, unknown>)?.name
      if (b.language === "en-US") enPublishers.add(String(pub))
      if (b.language === "ja-JP") jaPublishers.add(String(pub))
    }
    // The V1 bug was: 5 publishers across 5 articles. V2 must
    // collapse them to exactly 1 per locale.
    expect(enPublishers.size).toBe(1)
    expect(jaPublishers.size).toBe(1)
    expect(enPublishers.has("Acme")).toBe(true)
    expect(jaPublishers.has("アクメ")).toBe(true)
  })

  it("default-author placeholder collapses to one canonical translation per locale", () => {
    // 4 articles all use the V1 default ("Editorial Team"). V2
    // injects the locale-translated identity defaultAuthor into
    // every one of them — no mode-pick needed.
    const articles = [
      articleProposal({ pageId: "a", url: "https://acme.com/a" }),
      articleProposal({ pageId: "b", url: "https://acme.com/b" }),
      articleProposal({ pageId: "c", url: "https://acme.com/c" }),
      articleProposal({ pageId: "d", url: "https://acme.com/d" }),
    ]
    const blocks = buildAndParse({
      proposals: articles,
      locales: [EN, JA, NL],
      defaultLocale: EN,
      identity: IDENTITY,
      identityTranslations: ID_TRANSLATIONS,
    })
    const byLocale: Record<string, Set<string>> = {}
    for (const b of blocks) {
      const auth = (b.payload.author as Record<string, unknown>)?.name
      ;(byLocale[b.language] ??= new Set()).add(String(auth))
    }
    expect(byLocale["en-US"]).toEqual(new Set(["Editorial Team"]))
    expect(byLocale["ja-JP"]).toEqual(new Set(["編集チーム"]))
    expect(byLocale["nl"]).toEqual(new Set(["Redactieteam"]))
  })

  it("real per-page bylines bypass identity injection", () => {
    // V2 must NOT clobber a real "Jane Smith" with the site
    // default. The placeholder check (`isAuthorPlaceholder`) is
    // the contract — bylines outside the placeholder set survive
    // unchanged through render.
    const articles = [
      articleProposal({
        pageId: "interview",
        url: "https://acme.com/interview",
        authorName: "Jane Smith",
      }),
      articleProposal({
        pageId: "editorial",
        url: "https://acme.com/editorial",
        authorName: "Editorial Team", // placeholder
      }),
    ]
    const blocks = buildAndParse({
      proposals: articles,
      locales: [EN, JA],
      defaultLocale: EN,
      identity: IDENTITY,
      identityTranslations: ID_TRANSLATIONS,
    })

    const interviewEn = blocks.find(
      (b) =>
        b.language === "en-US" &&
        String(b.payload.headline).includes("interview"),
    )!
    const editorialEn = blocks.find(
      (b) =>
        b.language === "en-US" &&
        String(b.payload.headline).includes("editorial"),
    )!
    expect(
      (interviewEn.payload.author as Record<string, unknown>).name,
    ).toBe("Jane Smith")
    expect(
      (editorialEn.payload.author as Record<string, unknown>).name,
    ).toBe("Editorial Team")
  })

  it("Organization.name comes from identity, not the per-page proposal", () => {
    // Even if the user/AI fills in a wrong / outdated org name on
    // the homepage proposal, identity overrides it at render time.
    const org = orgProposal()
    ;(org.inputs as OrganizationInput).name = "OUTDATED NAME"

    const blocks = buildAndParse({
      proposals: [org],
      locales: [EN, JA],
      defaultLocale: EN,
      identity: IDENTITY,
      identityTranslations: ID_TRANSLATIONS,
    })
    const enOrg = blocks.find((b) => b.language === "en-US")!
    const jaOrg = blocks.find((b) => b.language === "ja-JP")!
    expect(enOrg.payload.name).toBe("Acme")
    expect(jaOrg.payload.name).toBe("アクメ")
  })

  it("missing locale translation falls back to source identity (no broken JSON-LD)", () => {
    // Phase 0.5 failed for `nl`. We must STILL emit a valid
    // publisher.name for that locale's blocks rather than empty
    // string / undefined. Source-language brand is the safety
    // net.
    const articles = [
      articleProposal({ pageId: "a", url: "https://acme.com/a" }),
    ]
    const blocks = buildAndParse({
      proposals: articles,
      locales: [EN, NL], // no `nl` in identityTranslations below
      defaultLocale: EN,
      identity: IDENTITY,
      identityTranslations: {}, // empty — phase 0.5 failed entirely
    })
    const nlBlock = blocks.find((b) => b.language === "nl")!
    expect(
      (nlBlock.payload.publisher as Record<string, unknown>).name,
    ).toBe("Acme")
    // Author falls back to source identity defaultAuthor too.
    expect(
      (nlBlock.payload.author as Record<string, unknown>).name,
    ).toBe("Editorial Team")
  })

  it("user-edited identity is respected and propagates to all blocks", () => {
    // The user manually set their brand to "Acme Industries" via
    // the identity card. Even if Phase 0 would have suggested
    // "Acme", install must use the user's edit.
    const userIdentity: SiteIdentity = {
      ...IDENTITY,
      brandName: "Acme Industries",
      source: "user-edit",
      confidence: 1.0,
    }
    const blocks = buildAndParse({
      proposals: [
        articleProposal({ pageId: "a", url: "https://acme.com/a" }),
        articleProposal({ pageId: "b", url: "https://acme.com/b" }),
        orgProposal(),
      ],
      locales: [EN],
      defaultLocale: EN,
      identity: userIdentity,
      identityTranslations: {},
    })
    for (const b of blocks) {
      const name =
        (b.payload.publisher as Record<string, unknown>)?.name ??
        b.payload.name
      expect(name).toBe("Acme Industries")
    }
  })

  it("placeholder source author yields identity in all locales — even when AI translated the placeholder", () => {
    // Reproduces the production drift seen on jimmyjing.framer.website:
    //   ko: "편집팀" / "편집부" / "에디터팀" / "Editorial Team"
    //   fr: "Équipe de rédaction" / "Équipe éditoriale" / "Editorial Team"
    // Each article's per-locale translate call independently picked
    // a different rendering of "Editorial Team". The English source
    // value IS the placeholder, so V2 must collapse to one canonical
    // identity-translated value per locale, regardless of what the
    // AI returned for that field.
    const articles = [
      articleProposal({ pageId: "a", url: "https://acme.com/a" }), // source = "Editorial Team"
      articleProposal({ pageId: "b", url: "https://acme.com/b" }),
      articleProposal({ pageId: "c", url: "https://acme.com/c" }),
    ]
    // Simulate what the AI actually did in production: returned
    // three different translations for "Editorial Team" across the
    // three articles in `ko` and `fr`.
    const koDrift1: ArticleInput = {
      kind: "Article",
      canonicalUrl: "https://acme.com/a",
      language: "ko",
      headline: "한글 제목",
      authorName: "편집팀",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    }
    const koDrift2: ArticleInput = { ...koDrift1, authorName: "편집부" }
    const koDrift3: ArticleInput = {
      ...koDrift1,
      authorName: "Editorial Team", // AI didn't translate at all
    }
    const KO: LocaleInfo = {
      id: "ko",
      code: "ko",
      name: "Korean",
      slug: "ko",
      isDefault: false,
    }
    const blocks = buildAndParse({
      proposals: articles,
      locales: [EN, KO],
      defaultLocale: EN,
      translations: {
        a: { ko: koDrift1 },
        b: { ko: koDrift2 },
        c: { ko: koDrift3 },
      },
      identity: IDENTITY,
      identityTranslations: {
        ...ID_TRANSLATIONS,
        ko: {
          brandName: "Acme",
          defaultAuthor: "편집팀", // canonical value
        },
      },
    })

    const koAuthors = new Set(
      blocks
        .filter((b) => b.language === "ko")
        .map(
          (b) => (b.payload.author as Record<string, unknown>).name as string,
        ),
    )
    // V2 contract: ALL three articles in ko share ONE author name —
    // the identity-translated default ("편집팀"). The AI's drifted
    // versions are ignored because the SOURCE is a placeholder.
    expect(koAuthors).toEqual(new Set(["편집팀"]))
  })

  it("real per-page byline still survives even when localized translation differs across articles", () => {
    // Belt-and-suspenders for the source-as-truth check. If the
    // source authorName is "Jane Smith" (a real byline), V2 keeps
    // the AI translation as-is per-locale — that's a feature, not
    // a bug. We accept that two different real authors on two
    // different articles produce two different ja translations.
    const interviewArticle = articleProposal({
      pageId: "interview",
      url: "https://acme.com/interview",
      authorName: "Jane Smith",
    })
    const editorialArticle = articleProposal({
      pageId: "editorial",
      url: "https://acme.com/editorial",
      authorName: "John Doe",
    })

    const janeJa: ArticleInput = {
      kind: "Article",
      canonicalUrl: "https://acme.com/interview",
      language: "ja-JP",
      headline: "日本語",
      authorName: "ジェーン・スミス",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    }
    const johnJa: ArticleInput = {
      ...janeJa,
      authorName: "ジョン・ドゥ",
    }
    const blocks = buildAndParse({
      proposals: [interviewArticle, editorialArticle],
      locales: [EN, JA],
      defaultLocale: EN,
      translations: {
        interview: { "ja-JP": janeJa },
        editorial: { "ja-JP": johnJa },
      },
      identity: IDENTITY,
      identityTranslations: ID_TRANSLATIONS,
    })

    const interviewJa = blocks.find(
      (b) =>
        b.language === "ja-JP" &&
        String((b.payload.mainEntityOfPage as Record<string, unknown>)?.["@id"]).includes(
          "interview",
        ),
    )!
    const editorialJa = blocks.find(
      (b) =>
        b.language === "ja-JP" &&
        String((b.payload.mainEntityOfPage as Record<string, unknown>)?.["@id"]).includes(
          "editorial",
        ),
    )!
    expect(
      (interviewJa.payload.author as Record<string, unknown>).name,
    ).toBe("ジェーン・スミス")
    expect(
      (editorialJa.payload.author as Record<string, unknown>).name,
    ).toBe("ジョン・ドゥ")
  })

  it("Organization.url syncs to locale-prefixed canonicalUrl", () => {
    // Reproduces /web-design Organization in production, where
    // url stayed unprefixed across all locales. With V2's url
    // sync, the Organization.url for the ja block must contain
    // /ja/ — Google rejects org.url ≠ canonical of the locale
    // page as a localization mismatch.
    const orgInputs: OrganizationInput = {
      kind: "Organization",
      canonicalUrl: "https://acme.com/web-design",
      language: "en",
      name: "Acme",
      url: "https://acme.com/web-design",
      description: "Web design",
    }
    const orgPage: SchemaProposal = {
      pageId: "web-design",
      pageLabel: "Web Design",
      url: "https://acme.com/web-design",
      kind: "Organization",
      inputs: orgInputs,
      originalInputs: orgInputs,
      enabled: true,
      sourceHash: "h",
      confidence: 0.9,
      rationale: "service page",
    }
    const blocks = buildAndParse({
      proposals: [orgPage],
      locales: [EN, JA],
      defaultLocale: EN,
      identity: IDENTITY,
      identityTranslations: ID_TRANSLATIONS,
    })
    const enBlock = blocks.find((b) => b.language === "en-US")!
    const jaBlock = blocks.find((b) => b.language === "ja-JP")!
    expect(enBlock.payload.url).toBe("https://acme.com/web-design")
    // V2 must localize the Organization.url, not just the
    // mainEntityOfPage.@id.
    expect(jaBlock.payload.url).toBe("https://acme.com/ja/web-design")
  })

  it("works with no identity (Manual mode / pre-V2 callers)", () => {
    // Manual schema mode never goes through Phase 0 — the
    // identity arg is undefined. The output should still be
    // valid JSON-LD with whatever publisher/author the caller
    // provided in the proposal inputs (back-compat contract).
    const articles = [
      articleProposal({
        pageId: "a",
        url: "https://acme.com/a",
        authorName: "Jane Smith",
      }),
    ]
    const blocks = buildAndParse({
      proposals: articles,
      locales: [EN],
      defaultLocale: EN,
      // identity intentionally omitted
    })
    const enBlock = blocks[0]
    expect((enBlock.payload.publisher as Record<string, unknown>).name).toBe(
      "Acme",
    )
    expect((enBlock.payload.author as Record<string, unknown>).name).toBe(
      "Jane Smith",
    )
  })
})
