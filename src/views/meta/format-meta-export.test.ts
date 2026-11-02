import { describe, expect, it } from "vitest"

import type { MetaResult } from "./types"
import {
  buildMetaZipArchive,
  formatMetaLocaleExport,
  metaLocaleFilename,
} from "./format-meta-export"
import { unzipSync } from "fflate"

const labels = {
  title: "Title",
  metaDescription: "Meta Description",
  ogTitle: "OG Title",
  ogDescription: "OG Description",
  twitterTitle: "Twitter Title",
  twitterDescription: "Twitter Description",
}

function sampleResult(overrides: Partial<MetaResult> = {}): MetaResult {
  return {
    localeId: "loc-ja",
    localeCode: "ja",
    localeName: "Japanese",
    language: "ja",
    isDefaultLocale: false,
    parsed: {
      title: "デジタルデザインスタジオ",
      metaDescription: "高コンバージョンのデザインを提供します。",
    },
    rawText: "",
    qualityFlags: [],
    ...overrides,
  }
}

describe("formatMetaLocaleExport", () => {
  it("includes labeled fields for Framer paste", () => {
    const result = sampleResult({
      localeCode: "en",
      localeName: "English",
      language: "en",
      isDefaultLocale: true,
      parsed: {
        title: "Hello",
        metaDescription: "World description",
      },
    })
    const text = formatMetaLocaleExport(result, labels, {
      pageTitle: "Home",
      pagePath: "/",
    })
    expect(text).toContain("Title\nHello")
    expect(text).toContain("Meta Description\nWorld description")
    expect(text).toContain("Page: Home (/)")
  })
})

describe("metaLocaleFilename", () => {
  it("slugifies page title for safe filenames", () => {
    expect(metaLocaleFilename("en", "Home Page")).toBe("meta-home-page-en.txt")
  })
})

describe("buildMetaZipArchive", () => {
  it("stores Japanese locale as valid UTF-8 in zip entries", () => {
    const zip = buildMetaZipArchive([sampleResult()], labels, {
      pageTitle: "Home",
    })
    const name = metaLocaleFilename("ja", "Home")
    const files = unzipSync(zip)
    const raw = files[name]
    expect(raw).toBeDefined()
    const text = new TextDecoder("utf-8").decode(raw!)
    expect(text).toContain("デジタルデザインスタジオ")
    expect(text).toContain("高コンバージョン")
  })
})
