import { describe, expect, it } from "vitest"

import { parseMetaSetupSuggestResponse } from "./meta-setup-suggest"

describe("parseMetaSetupSuggestResponse", () => {
  it("reads pageType from parsed JSON", () => {
    expect(
      parseMetaSetupSuggestResponse(
        "pageType",
        { pageType: "Landing page" },
        "",
      ),
    ).toBe("Landing page")
  })

  it("reads primaryKeyword from nested data", () => {
    expect(
      parseMetaSetupSuggestResponse(
        "primaryKeyword",
        { data: { primaryKeyword: "multilingual SEO" } },
        "",
      ),
    ).toBe("multilingual SEO")
  })

  it("falls back to bare text", () => {
    expect(
      parseMetaSetupSuggestResponse(
        "brandVoice",
        null,
        "Confident, technical, concise",
      ),
    ).toBe("Confident, technical, concise")
  })
})
