import { describe, expect, it } from "vitest"

import type { MetaResult } from "../../views/meta/types"
import {
  buildMetaSessionPayload,
  fromMetaSessionRows,
  toMetaSessionRows,
} from "./session-persist"

function sampleResult(overrides: Partial<MetaResult> = {}): MetaResult {
  return {
    localeId: "loc-en",
    localeCode: "en",
    localeName: "English",
    language: "en",
    isDefaultLocale: true,
    parsed: { title: "Hello", metaDescription: "Desc" },
    rawText: '{"title":"Hello"}',
    qualityFlags: [],
    ...overrides,
  }
}

describe("meta session persist", () => {
  it("drops rawText for successful parses to save plugin-data budget", () => {
    const rows = toMetaSessionRows([sampleResult()])
    expect(rows[0]!.rawText).toBe("")
    const back = fromMetaSessionRows(rows)
    expect(back[0]!.parsed?.title).toBe("Hello")
  })

  it("keeps truncated rawText when parse failed", () => {
    const long = "x".repeat(500)
    const rows = toMetaSessionRows([
      sampleResult({ parsed: null, rawText: long }),
    ])
    expect(rows[0]!.rawText.endsWith("…")).toBe(true)
    expect(rows[0]!.rawText.length).toBeLessThan(500)
  })

  it("builds a payload under the byte budget for four locales", () => {
    const results = ["en", "ja", "ko", "fr"].map((code) =>
      sampleResult({
        localeId: `loc-${code}`,
        localeCode: code,
        localeName: code,
        parsed: {
          title: `Title ${code}`,
          metaDescription: "A".repeat(120),
          ogTitle: `OG ${code}`,
          ogDescription: "B".repeat(120),
        },
        rawText: "",
      }),
    )
    const payload = buildMetaSessionPayload({
      draftSignature: '{"pageContext":"ctx"}',
      step: "review",
      resultLocaleId: "loc-en",
      results,
    })
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length
    expect(bytes).toBeLessThan(3200)
  })
})
