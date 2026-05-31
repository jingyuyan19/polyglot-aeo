import { describe, expect, it } from "vitest"

import type { CollectionItemRow, CollectionSummary } from "../framer/cms"
import type { LocaleInfo } from "../framer/locales"
import {
  analyzeCmsCollectionLocalization,
  summarizeCmsGapReports,
} from "./cms-gaps"

const collection: CollectionSummary = {
  id: "articles",
  name: "Article",
  slug: "article",
  itemCount: 2,
  fieldNames: ["Title", "Description"],
}

const locales: LocaleInfo[] = [
  { id: "en", code: "en", name: "English", slug: "", isDefault: true },
  { id: "ja", code: "ja", name: "Japanese", slug: "ja", isDefault: false },
]

function row(
  id: string,
  title: string,
  jaTitle?: string,
): CollectionItemRow {
  return {
    id,
    slug: id,
    draft: false,
    fieldValues: {
      Title: title,
      Description: "Source summary",
    },
    fieldValuesByLocale: jaTitle
      ? { ja: { Title: jaTitle } }
      : {},
    localeSlugs: {},
  }
}

describe("CMS localization gaps", () => {
  it("counts missing locale titles, summaries, slugs, and duplicate titles", () => {
    const report = analyzeCmsCollectionLocalization(
      collection,
      [row("a", "Same", "同じ"), row("b", "Same")],
      locales,
    )
    expect(report.localeGaps[0]).toMatchObject({
      localeCode: "ja",
      missingTitles: 1,
      missingSummaries: 2,
      missingSlugs: 2,
    })
    expect(report.duplicateTitles).toEqual([
      { title: "Same", rowIds: ["a", "b"] },
    ])
  })

  it("summarizes multiple collection reports", () => {
    const report = analyzeCmsCollectionLocalization(
      collection,
      [row("a", "A"), row("b", "B")],
      locales,
    )
    expect(summarizeCmsGapReports([report])).toMatchObject({
      collectionCount: 1,
      rowCount: 2,
      missingTitleCount: 2,
      missingSummaryCount: 2,
    })
  })
})
