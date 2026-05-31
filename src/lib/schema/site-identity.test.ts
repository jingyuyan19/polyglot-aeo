import { describe, expect, it } from "vitest"

import { isAuthorPlaceholder } from "./site-identity"

describe("isAuthorPlaceholder", () => {
  // Regression target: the V1 generic-author fallbacks ("Editor",
  // "Editorial Team", "Admin", …) must be detected case- and
  // whitespace-insensitively, while real bylines pass through.
  // V2's render-time identity injector relies on this distinction
  // to decide whether to substitute the locale-aware default.

  it("flags the canonical V1 default", () => {
    expect(isAuthorPlaceholder("Editorial Team")).toBe(true)
  })

  it("flags every member of the placeholder set", () => {
    for (const placeholder of [
      "Editorial Team",
      "Editorial",
      "Editor",
      "Editors",
      "Author",
      "Admin",
      "Team",
      "Staff",
    ]) {
      expect(isAuthorPlaceholder(placeholder)).toBe(true)
    }
  })

  it("is case- and whitespace-insensitive", () => {
    expect(isAuthorPlaceholder("EDITOR")).toBe(true)
    expect(isAuthorPlaceholder("  editorial team  ")).toBe(true)
    expect(isAuthorPlaceholder("Editorial   ")).toBe(true)
  })

  it("does NOT flag real bylines", () => {
    // Critical: "Jane Smith" is the canonical example of a real
    // byline V2 must preserve. If this test ever fails the render-
    // time injector will overwrite genuine attributions with the
    // generic editorial fallback.
    expect(isAuthorPlaceholder("Jane Smith")).toBe(false)
    expect(isAuthorPlaceholder("Patagonia Newsroom")).toBe(false)
    expect(isAuthorPlaceholder("田中太郎")).toBe(false)
  })

  it("returns false for empty / undefined", () => {
    // Empty author = "missing", not "placeholder". The render
    // injector treats those as "missing → use identity" via a
    // separate codepath (`existingAuthor === ""`).
    expect(isAuthorPlaceholder("")).toBe(false)
    expect(isAuthorPlaceholder(undefined)).toBe(false)
  })

  it("does not flag values that include but are not in the set", () => {
    // "Editor in chief" is a real role, not a placeholder. We
    // deliberately use exact (lowercased trimmed) match so that
    // longer, real titles aren't false-positive flagged.
    expect(isAuthorPlaceholder("Editor in chief")).toBe(false)
    expect(isAuthorPlaceholder("Authoritative Voice")).toBe(false)
  })
})
