import { describe, expect, it } from "vitest"

import {
  isValidGeneratedMeta,
  parseMetaFromAi,
  parseFailedFlag,
} from "./meta-parse"

describe("parseMetaFromAi", () => {
  it("accepts flat meta object", () => {
    const meta = parseMetaFromAi({
      title: "Hello",
      metaDescription: "World",
    })
    expect(meta?.title).toBe("Hello")
    expect(meta?.metaDescription).toBe("World")
  })

  it("unwraps nested meta envelope", () => {
    const meta = parseMetaFromAi({
      meta: { title: "Nested", metaDescription: "Desc" },
    })
    expect(meta?.title).toBe("Nested")
  })

  it("returns null when no title or description", () => {
    expect(parseMetaFromAi({ ogTitle: "Only OG" })).toBeNull()
    expect(parseMetaFromAi(null)).toBeNull()
  })

  it("salvages fields from truncated JSON when provider parse is null", () => {
    const truncated = `{
  "title": "디지털 디자인 스튜디오",
  "metaDescription": "브랜드를 더 빠르게 성장시키는 디지털 디자인.",
  "ogTitle": "디지털 디자인 스튜디오",
  "ogDescription": "전환율 높은 웹과 브랜드.",
  "twitterTitle": "디지털 디자인",
  "twitterDescription": "성과 중심 디자인.",
  "primaryKeyword": "디지털 디자인",
  "secondaryKeywords": ["UX/UI 디자인", "브랜드 아이덴티티",`

    const meta = parseMetaFromAi(null, truncated)
    expect(meta?.title).toBe("디지털 디자인 스튜디오")
    expect(meta?.metaDescription).toContain("브랜드")
    expect(meta?.secondaryKeywords).toEqual([
      "UX/UI 디자인",
      "브랜드 아이덴티티",
    ])
  })

  it("repairs truncated JSON by closing brackets", () => {
    const truncated = `{"title":"A","metaDescription":"B","secondaryKeywords":["x",`
    const meta = parseMetaFromAi(null, truncated)
    expect(meta?.title).toBe("A")
    expect(meta?.metaDescription).toBe("B")
  })
})

describe("isValidGeneratedMeta", () => {
  it("requires title or metaDescription", () => {
    expect(isValidGeneratedMeta({ title: "x" })).toBe(true)
    expect(isValidGeneratedMeta({ metaDescription: "y" })).toBe(true)
    expect(isValidGeneratedMeta({ ogTitle: "z" })).toBe(false)
  })
})

describe("parseFailedFlag", () => {
  it("is card-level", () => {
    expect(parseFailedFlag()).toEqual({
      field: null,
      reason: "parse-failed",
    })
  })
})
