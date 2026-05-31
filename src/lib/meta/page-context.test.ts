import { describe, expect, it } from "vitest"

import {
  buildPageContextFromScan,
  suggestPageTypeFromContext,
} from "./page-context"

describe("buildPageContextFromScan", () => {
  it("combines title, description, and body", () => {
    const out = buildPageContextFromScan({
      title: "Acme Studio",
      description: "We build multilingual sites.",
      bodyText: "Extra paragraph about services and pricing.",
    })
    expect(out).toContain("# Acme Studio")
    expect(out).toContain("We build multilingual sites.")
    expect(out).toContain("Extra paragraph")
  })

  it("omits duplicate body when same as description", () => {
    const out = buildPageContextFromScan({
      title: "About",
      description: "Same text.",
      bodyText: "Same text.",
    })
    expect(out.split("Same text.").length).toBe(2)
  })
})

describe("suggestPageTypeFromContext", () => {
  it("detects pricing pages", () => {
    expect(
      suggestPageTypeFromContext("Our pricing plans start at $9"),
    ).toBe("Product page")
  })

  it("returns null for generic copy", () => {
    expect(suggestPageTypeFromContext("Welcome to our studio.")).toBeNull()
  })
})
