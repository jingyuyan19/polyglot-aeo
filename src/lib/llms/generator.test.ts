import { describe, expect, it } from "vitest"

import type { CollectionItemRow, CollectionSummary } from "../framer/cms"
import type { LocaleInfo } from "../framer/locales"
import {
  buildSectionFromCollection,
  renderLlmsTxt,
  type LlmsTxtSection,
} from "./generator"

const COLLECTION: CollectionSummary = {
  id: "col-blog",
  name: "Articles",
  slug: "blog",
  itemCount: 2,
  fieldNames: ["Title", "Summary"],
}

const EN_LOCALE: LocaleInfo = {
  id: "loc-en",
  code: "en-US",
  name: "English",
  slug: "en",
  isDefault: true,
}

const JA_LOCALE: LocaleInfo = {
  id: "loc-ja",
  code: "ja",
  name: "日本語",
  slug: "ja",
  isDefault: false,
}

const FR_LOCALE: LocaleInfo = {
  id: "loc-fr",
  code: "fr-FR",
  name: "Français",
  slug: "fr",
  isDefault: false,
}

/**
 * The motivating scenario:
 *   - Item A has BOTH default-locale (English) AND Japanese values.
 *   - Item B has only English filled in (Japanese row left empty).
 * Expected:
 *   - llms.txt (default) contains both items in English.
 *   - llms-ja.txt contains only item A.
 *   - The skipped report flags item B for the JA build.
 */
const ROWS: CollectionItemRow[] = [
  {
    id: "item-a",
    slug: "a",
    draft: false,
    fieldValues: {
      Title: "Getting Started",
      Summary: "A guide on setting up your CMS.",
    },
    fieldValuesByLocale: {
      "loc-ja": {
        Title: "はじめに",
        Summary: "CMS のセットアップガイド。",
      },
    },
    localeSlugs: { "loc-ja": "hajimeni" },
  },
  {
    id: "item-b",
    slug: "b",
    draft: false,
    fieldValues: {
      Title: "Advanced Workflows",
      Summary: "Patterns we recommend in production.",
    },
    fieldValuesByLocale: {
      // No JA entry → must skip in JA build, must NOT leak into JA file.
    },
    localeSlugs: {},
  },
]

describe("buildSectionFromCollection — default locale", () => {
  it("uses default-locale fieldValues for the default locale", () => {
    const result = buildSectionFromCollection(
      COLLECTION,
      ROWS,
      EN_LOCALE,
      "https://example.com/",
      { titleField: "Title", summaryField: "Summary", localizedPaths: true },
    )

    expect(result.skipped).toEqual([])
    expect(result.section.title).toBe("Articles")
    expect(result.section.links).toEqual([
      {
        label: "Getting Started",
        url: "https://example.com/blog/a",
        summary: "A guide on setting up your CMS.",
      },
      {
        label: "Advanced Workflows",
        url: "https://example.com/blog/b",
        summary: "Patterns we recommend in production.",
      },
    ])
  })
})

describe("buildSectionFromCollection — non-default locale", () => {
  it("emits localized titles AND skips items whose JA title is missing", () => {
    const result = buildSectionFromCollection(
      COLLECTION,
      ROWS,
      JA_LOCALE,
      "https://example.com/",
      { titleField: "Title", summaryField: "Summary", localizedPaths: true },
    )

    // Item A: localized title + summary, JA-prefixed URL with localized slug.
    expect(result.section.links).toEqual([
      {
        label: "はじめに",
        url: "https://example.com/ja/blog/hajimeni",
        summary: "CMS のセットアップガイド。",
      },
    ])

    // Item B was excluded — and the report tells the UI which row to nudge
    // the designer about.
    expect(result.skipped).toEqual([
      {
        itemId: "item-b",
        defaultTitle: "Advanced Workflows",
        reason: "missing-localized-title",
      },
    ])
  })

  it("does NOT leak default-locale titles into a non-default locale file", () => {
    // The exact regression we're fixing: previous versions read
    // fieldValues[titleField] for every locale, producing English
    // titles in llms-ja.txt. Make sure no English title slipped
    // into the link list.
    const result = buildSectionFromCollection(
      COLLECTION,
      ROWS,
      JA_LOCALE,
      "https://example.com/",
      { titleField: "Title", summaryField: "Summary", localizedPaths: true },
    )
    const labels = result.section.links.map((l) => l.label)
    expect(labels).not.toContain("Getting Started")
    expect(labels).not.toContain("Advanced Workflows")
  })

  it("falls back to default summary when localized summary is missing", () => {
    const rowsWithMissingJaSummary: CollectionItemRow[] = [
      {
        ...ROWS[0],
        fieldValuesByLocale: {
          "loc-ja": {
            Title: "はじめに",
            // Summary intentionally omitted → falls back to default.
          },
        },
      },
    ]

    const result = buildSectionFromCollection(
      COLLECTION,
      rowsWithMissingJaSummary,
      JA_LOCALE,
      "https://example.com/",
      { titleField: "Title", summaryField: "Summary", localizedPaths: true },
    )

    expect(result.skipped).toEqual([])
    expect(result.section.links[0]?.summary).toBe(
      "A guide on setting up your CMS.",
    )
  })

  it("flags missing-default-title separately from missing-localized-title", () => {
    const rowsWithBlankTitle: CollectionItemRow[] = [
      {
        id: "item-c",
        slug: "c",
        draft: false,
        fieldValues: { Title: "" }, // Misconfigured / empty in default too.
        fieldValuesByLocale: {},
        localeSlugs: {},
      },
    ]

    const result = buildSectionFromCollection(
      COLLECTION,
      rowsWithBlankTitle,
      JA_LOCALE,
      "https://example.com/",
      { titleField: "Title", summaryField: "Summary", localizedPaths: true },
    )

    expect(result.skipped).toEqual([
      {
        itemId: "item-c",
        defaultTitle: "",
        reason: "missing-default-title",
      },
    ])
  })

  it("skips localized-prefix when localizedPaths=false", () => {
    const result = buildSectionFromCollection(
      COLLECTION,
      ROWS,
      JA_LOCALE,
      "https://example.com/",
      {
        titleField: "Title",
        summaryField: "Summary",
        localizedPaths: false,
      },
    )
    expect(result.section.links[0]?.url).toBe(
      "https://example.com/blog/hajimeni",
    )
  })

  it("Latin-script non-default locales also get localized lookups (no JA-only assumption)", () => {
    // The bug was script-agnostic — we want to make sure French
    // would also fail-skip when the FR row is empty, not silently
    // accept English content as French content.
    const rowsWithFrTranslation: CollectionItemRow[] = [
      {
        ...ROWS[0],
        fieldValuesByLocale: {
          "loc-fr": {
            Title: "Premiers pas",
            Summary: "Un guide pour configurer votre CMS.",
          },
        },
      },
      ROWS[1], // No FR translation → should skip.
    ]

    const result = buildSectionFromCollection(
      COLLECTION,
      rowsWithFrTranslation,
      FR_LOCALE,
      "https://example.com/",
      { titleField: "Title", summaryField: "Summary", localizedPaths: true },
    )

    expect(result.section.links).toEqual([
      {
        label: "Premiers pas",
        url: "https://example.com/fr/blog/a",
        summary: "Un guide pour configurer votre CMS.",
      },
    ])
    expect(result.skipped.map((s) => s.itemId)).toEqual(["item-b"])
  })
})

describe("buildSectionFromCollection — duplicate title detection", () => {
  // Real-world failure pulled from a generated llms.txt: two CMS
  // articles authored with the SAME `Title` ("How we redesigned a
  // local brand's website") but different slugs/URLs. AI engines
  // dedupe by label and silently drop one — so we surface this in
  // the UI as a yellow pill so the designer can fix the CMS.

  it("groups rows that share an identical title", () => {
    const rows: CollectionItemRow[] = [
      {
        id: "item-a",
        slug: "a-slug",
        draft: false,
        fieldValues: { Title: "How we redesigned a website", Summary: "" },
        fieldValuesByLocale: {},
        localeSlugs: {},
      },
      {
        id: "item-b",
        slug: "b-slug",
        draft: false,
        fieldValues: { Title: "How we redesigned a website", Summary: "" },
        fieldValuesByLocale: {},
        localeSlugs: {},
      },
      {
        id: "item-c",
        slug: "c-slug",
        draft: false,
        fieldValues: { Title: "Unique title", Summary: "" },
        fieldValuesByLocale: {},
        localeSlugs: {},
      },
    ]
    const result = buildSectionFromCollection(
      COLLECTION,
      rows,
      EN_LOCALE,
      "https://example.com/",
      { titleField: "Title", summaryField: "Summary", localizedPaths: false },
    )
    expect(result.duplicateTitles).toHaveLength(1)
    expect(result.duplicateTitles[0]).toMatchObject({
      title: "How we redesigned a website",
      itemIds: ["item-a", "item-b"],
      slugs: ["a-slug", "b-slug"],
    })
    // Duplicate rows STILL emit bullets — the user's data is what
    // it is, we don't drop them.
    expect(result.section.links).toHaveLength(3)
  })

  it("treats title comparison as case-insensitive + trim", () => {
    // " Web Design " and "web design" are the same label as far as
    // AI dedup is concerned — group them.
    const rows: CollectionItemRow[] = [
      {
        id: "item-a",
        slug: "a",
        draft: false,
        fieldValues: { Title: " Web Design " },
        fieldValuesByLocale: {},
        localeSlugs: {},
      },
      {
        id: "item-b",
        slug: "b",
        draft: false,
        fieldValues: { Title: "web design" },
        fieldValuesByLocale: {},
        localeSlugs: {},
      },
    ]
    const result = buildSectionFromCollection(
      COLLECTION,
      rows,
      EN_LOCALE,
      "https://example.com/",
      { titleField: "Title", localizedPaths: false },
    )
    expect(result.duplicateTitles).toHaveLength(1)
    expect(result.duplicateTitles[0].itemIds).toEqual(["item-a", "item-b"])
  })

  it("uses LOCALIZED titles for grouping (en-only duplicate may be ja-unique)", () => {
    // Item A and B share an English title but have unique JA titles —
    // the JA build should NOT flag them as duplicates.
    const rows: CollectionItemRow[] = [
      {
        id: "item-a",
        slug: "a",
        draft: false,
        fieldValues: { Title: "Same English Title" },
        fieldValuesByLocale: {
          "loc-ja": { Title: "日本語タイトルA" },
        },
        localeSlugs: {},
      },
      {
        id: "item-b",
        slug: "b",
        draft: false,
        fieldValues: { Title: "Same English Title" },
        fieldValuesByLocale: {
          "loc-ja": { Title: "日本語タイトルB" },
        },
        localeSlugs: {},
      },
    ]
    const en = buildSectionFromCollection(
      COLLECTION,
      rows,
      EN_LOCALE,
      "https://example.com/",
      { titleField: "Title", localizedPaths: false },
    )
    const ja = buildSectionFromCollection(
      COLLECTION,
      rows,
      JA_LOCALE,
      "https://example.com/",
      { titleField: "Title", localizedPaths: false },
    )
    expect(en.duplicateTitles).toHaveLength(1)
    expect(ja.duplicateTitles).toHaveLength(0)
  })

  it("returns empty array when no duplicates exist (clean case)", () => {
    const result = buildSectionFromCollection(
      COLLECTION,
      ROWS,
      EN_LOCALE,
      "https://example.com/",
      { titleField: "Title", summaryField: "Summary", localizedPaths: false },
    )
    expect(result.duplicateTitles).toEqual([])
  })
})

describe("renderLlmsTxt", () => {
  it("renders the section title, summary, and links in spec order", () => {
    const section: LlmsTxtSection = {
      title: "Articles",
      links: [
        { label: "Hello", url: "https://example.com/blog/hello", summary: "Hi." },
        { label: "World", url: "https://example.com/blog/world" },
      ],
    }
    const output = renderLlmsTxt({
      siteName: "Acme",
      siteSummary: "Acme studio.",
      baseUrl: "https://example.com/",
      locale: EN_LOCALE,
      localizedPaths: true,
      sections: [section],
    })
    expect(output).toContain("# Acme")
    expect(output).toContain("> Acme studio.")
    expect(output).toContain("Language: en-US (English)")
    expect(output).toContain("## Articles")
    expect(output).toContain("- [Hello](https://example.com/blog/hello): Hi.")
    expect(output).toContain("- [World](https://example.com/blog/world)")
  })

  it("emits multiple sections in input order, each with their own ## heading", () => {
    const sections: LlmsTxtSection[] = [
      {
        title: "Articles",
        links: [{ label: "A", url: "https://x.com/a" }],
      },
      {
        title: "Products",
        links: [{ label: "P", url: "https://x.com/p" }],
      },
    ]
    const output = renderLlmsTxt({
      siteName: "Acme",
      siteSummary: "S.",
      baseUrl: "https://x.com",
      locale: EN_LOCALE,
      localizedPaths: false,
      sections,
    })
    // Both headings appear, and "Articles" comes BEFORE "Products"
    // because we promised input-order in the JSDoc.
    const articlesIdx = output.indexOf("## Articles")
    const productsIdx = output.indexOf("## Products")
    expect(articlesIdx).toBeGreaterThan(0)
    expect(productsIdx).toBeGreaterThan(articlesIdx)
  })

  it("emits longDescription between the > summary and the first ## section", () => {
    const output = renderLlmsTxt({
      siteName: "Acme",
      siteSummary: "Acme studio.",
      baseUrl: "https://x.com",
      locale: EN_LOCALE,
      localizedPaths: false,
      longDescription:
        "Acme is a global studio building tools for designers.\n\nKey capabilities:\n- Branding\n- Web design",
      sections: [
        { title: "Work", links: [{ label: "X", url: "https://x.com/x" }] },
      ],
    })
    // Order: > summary -> Language -> longDescription -> ## section.
    const summaryIdx = output.indexOf("> Acme studio.")
    const longIdx = output.indexOf("Acme is a global studio")
    const sectionIdx = output.indexOf("## Work")
    expect(summaryIdx).toBeGreaterThanOrEqual(0)
    expect(longIdx).toBeGreaterThan(summaryIdx)
    expect(sectionIdx).toBeGreaterThan(longIdx)
    // Markdown content (bullets) survives verbatim.
    expect(output).toContain("- Branding")
  })

  it("omits longDescription block when empty/whitespace, no blank-line drift", () => {
    const output = renderLlmsTxt({
      siteName: "Acme",
      siteSummary: "Acme studio.",
      baseUrl: "https://x.com",
      locale: EN_LOCALE,
      localizedPaths: false,
      longDescription: "   \n\n  ",
      sections: [
        { title: "Work", links: [{ label: "X", url: "https://x.com/x" }] },
      ],
    })
    // The exact-string check enforces "no double blank between locale
    // header and first ##" — the whole point of trimming.
    expect(output).not.toMatch(/Language: [^\n]+\n\n\n## Work/)
    expect(output).toMatch(/Language: [^\n]+\n\n## Work/)
  })
})
