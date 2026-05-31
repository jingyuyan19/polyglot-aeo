import { describe, expect, it } from "vitest"

import { popRoute, pushRoute, topOf, type ToolRoute } from "./routeStack"

describe("routeStack", () => {
  describe("topOf", () => {
    it("returns null for empty stack (Dashboard)", () => {
      expect(topOf([])).toBe(null)
    })

    it("returns the last entry", () => {
      expect(topOf(["schema"])).toBe("schema")
      expect(topOf(["schema", "settings"])).toBe("settings")
    })
  })

  describe("pushRoute", () => {
    it("appends to an empty stack", () => {
      expect(pushRoute([], "schema")).toEqual(["schema"])
    })

    it("appends after the previous top", () => {
      expect(pushRoute(["schema"], "settings")).toEqual([
        "schema",
        "settings",
      ])
    })

    it("is a no-op when the new route equals the current top", () => {
      // Critical: double-clicking the gear icon while already on Settings
      // must not deepen the stack; a single Back should still return to
      // the previous tool.
      const before: ToolRoute[] = ["schema", "settings"]
      const after = pushRoute(before, "settings")
      expect(after).toBe(before) // referential equality, React bails out
      expect(after).toEqual(["schema", "settings"])
    })

    it("does push when the duplicate is below the top, not on it", () => {
      // Schema → Settings → Schema is allowed. Only the *immediate* top
      // is deduped, intentionally — users can revisit a tool from
      // Settings without a special-case.
      const before: ToolRoute[] = ["schema", "settings"]
      expect(pushRoute(before, "schema")).toEqual([
        "schema",
        "settings",
        "schema",
      ])
    })
  })

  describe("popRoute", () => {
    it("removes the top entry", () => {
      expect(popRoute(["schema", "settings"])).toEqual(["schema"])
    })

    it("returns an empty stack when popping the last entry", () => {
      expect(popRoute(["schema"])).toEqual([])
    })

    it("does not crash on an empty stack", () => {
      expect(popRoute([])).toEqual([])
    })
  })

  describe("integration: regression scenarios", () => {
    it("Dashboard → Schema → Settings → Back lands on Schema (not Dashboard)", () => {
      // This is the headline regression case for the gear-icon
      // refactor. Before the route stack existed, the single-`route`
      // state would lose history and Back would always go to Dashboard.
      let stack: ToolRoute[] = []
      stack = pushRoute(stack, "schema")
      stack = pushRoute(stack, "settings")
      stack = popRoute(stack)
      expect(topOf(stack)).toBe("schema")
    })

    it("Dashboard → Schema → Settings → Back → Back lands on Dashboard", () => {
      let stack: ToolRoute[] = []
      stack = pushRoute(stack, "schema")
      stack = pushRoute(stack, "settings")
      stack = popRoute(stack)
      stack = popRoute(stack)
      expect(topOf(stack)).toBe(null)
    })

    it("Schema → Settings (twice) keeps depth at 2, not 3", () => {
      let stack: ToolRoute[] = []
      stack = pushRoute(stack, "schema")
      stack = pushRoute(stack, "settings")
      stack = pushRoute(stack, "settings")
      expect(stack).toEqual(["schema", "settings"])
    })

    it("does not mutate the input stack", () => {
      const original: ToolRoute[] = ["schema"]
      const frozen = Object.freeze([...original])
      // Both operations should accept frozen input without throwing.
      expect(() => pushRoute(frozen, "settings")).not.toThrow()
      expect(() => popRoute(frozen)).not.toThrow()
      expect(original).toEqual(["schema"])
    })
  })
})
