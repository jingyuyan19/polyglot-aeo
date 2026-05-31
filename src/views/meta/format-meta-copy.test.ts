import { describe, expect, it } from "vitest"

import { formatMetaCopyBlock } from "./format-meta-copy"

describe("formatMetaCopyBlock", () => {
  it("formats labeled fields", () => {
    const text = formatMetaCopyBlock(
      { title: "T", metaDescription: "D" },
      {
        title: "Title",
        metaDescription: "Desc",
        ogTitle: "OG",
        ogDescription: "OGD",
        twitterTitle: "TW",
        twitterDescription: "TWD",
      },
    )
    expect(text).toContain("Title\nT")
    expect(text).toContain("Desc\nD")
  })
})
