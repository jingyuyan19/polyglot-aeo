import { describe, expect, it } from "vitest"

import { metaSuggestMatchesCurrent } from "./meta-suggest-match"

describe("metaSuggestMatchesCurrent", () => {
  it("matches pageType case-insensitively", () => {
    expect(
      metaSuggestMatchesCurrent("pageType", "landing page", "Landing page"),
    ).toBe(true)
  })

  it("does not match when suggestion differs", () => {
    expect(
      metaSuggestMatchesCurrent("pageType", "Blog post", "Landing page"),
    ).toBe(false)
  })

  it("matches keywords exactly", () => {
    expect(
      metaSuggestMatchesCurrent(
        "primaryKeyword",
        "multilingual SEO",
        "multilingual SEO",
      ),
    ).toBe(true)
  })
})
