import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock the framer-plugin module BEFORE importing the helper so the
// import binding sees the mocked surface. The vi.mock factory must be
// hoist-safe (no closure references), so we expose the spy through a
// module-level handle that the test bodies can re-assign.
type AllowedToFn = (...methods: string[]) => boolean
let isAllowedToSpy: AllowedToFn = () => true
const isAllowedToCalls: string[][] = []

vi.mock("framer-plugin", () => ({
  framer: {
    isAllowedTo: (...args: string[]) => {
      isAllowedToCalls.push(args)
      return isAllowedToSpy(...args)
    },
  },
}))

// Import under test AFTER the mock so the helper picks up our stub.
const { isAllowedTo, registerProtectedMethodChecks } = await import(
  "./permissions"
)

beforeEach(() => {
  isAllowedToSpy = () => true
  isAllowedToCalls.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("registerProtectedMethodChecks", () => {
  it("calls framer.isAllowedTo with both protected methods we use", () => {
    // Single multi-arg call is what registers the checked-set in the
    // SDK's dev warning system. If we ever split this into multiple
    // calls, the bootstrap stops suppressing warnings for whichever
    // method runs second.
    registerProtectedMethodChecks()
    expect(isAllowedToCalls[0]).toEqual(["setPluginData", "setCustomCode"])
  })

  it("returns per-method allowed booleans", () => {
    // The helper re-queries individually so callers can decide which
    // UI affordances to dim — multi-arg form returns an AND, which
    // would be wrong for that use case.
    isAllowedToSpy = (m: string) => m === "setPluginData"
    const state = registerProtectedMethodChecks()
    expect(state).toEqual({
      setPluginData: true,
      setCustomCode: false,
    })
  })

  it("returns true/true when all permissions are granted", () => {
    isAllowedToSpy = () => true
    expect(registerProtectedMethodChecks()).toEqual({
      setPluginData: true,
      setCustomCode: true,
    })
  })
})

describe("isAllowedTo", () => {
  it("delegates to framer.isAllowedTo with a single method name", () => {
    isAllowedToSpy = () => true
    expect(isAllowedTo("setPluginData")).toBe(true)
    expect(isAllowedToCalls.at(-1)).toEqual(["setPluginData"])
  })

  it("returns false when the underlying SDK denies", () => {
    isAllowedToSpy = () => false
    expect(isAllowedTo("setCustomCode")).toBe(false)
  })
})
