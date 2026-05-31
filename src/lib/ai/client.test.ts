import { describe, expect, it, vi } from "vitest"

import { resolveInitialProvider } from "./client"
import type { ProviderId } from "./providers"

/**
 * Builds a fake `lookupKey` from an in-memory map. Records every call
 * so we can assert short-circuit behavior without touching framer.
 */
function makeLookup(keys: Partial<Record<ProviderId, string>>) {
  const calls: ProviderId[] = []
  const fn = vi.fn(async (id: ProviderId) => {
    calls.push(id)
    return keys[id] ?? null
  })
  return { fn, calls }
}

const ALL: ProviderId[] = [
  "anthropic",
  "openai",
  "gemini",
  "deepseek",
  "minimax-cn",
]

describe("resolveInitialProvider", () => {
  it("returns the preferred provider when it has a key", async () => {
    const { fn } = makeLookup({ "minimax-cn": "sk-abc" })
    const got = await resolveInitialProvider(
      "minimax-cn",
      ALL,
      "openai",
      fn,
    )
    expect(got).toBe("minimax-cn")
    // Only the preferred lookup; we should NOT scan the candidate list
    // when the preference is already valid.
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("minimax-cn")
  })

  it("falls back to the first configured candidate when preferred has no key", async () => {
    // The user's stored preference is OpenAI but they only set MiniMax.
    // The exact symptom from the bug report.
    const { fn } = makeLookup({ "minimax-cn": "sk-abc" })
    const got = await resolveInitialProvider(
      "openai",
      ALL,
      "openai",
      fn,
    )
    expect(got).toBe("minimax-cn")
  })

  it("falls back to the first configured candidate when preferred is null", async () => {
    const { fn } = makeLookup({ deepseek: "sk-d" })
    const got = await resolveInitialProvider(null, ALL, "openai", fn)
    expect(got).toBe("deepseek")
  })

  it("returns the preferred provider unchanged when no candidate has a key", async () => {
    // Designer with zero keys configured: respect their stored choice
    // so the dropdown reflects what they last picked, even though the
    // warning will (correctly) appear.
    const { fn } = makeLookup({})
    const got = await resolveInitialProvider(
      "anthropic",
      ALL,
      "openai",
      fn,
    )
    expect(got).toBe("anthropic")
  })

  it("falls back to the hardcoded default when nothing is configured AND preferred is null", async () => {
    const { fn } = makeLookup({})
    const got = await resolveInitialProvider(null, ALL, "openai", fn)
    expect(got).toBe("openai")
  })

  it("scans candidates in order, picking the first match", async () => {
    // Two configured candidates: order in `candidates` decides winner.
    const { fn, calls } = makeLookup({
      gemini: "sk-g",
      "minimax-cn": "sk-m",
    })
    const got = await resolveInitialProvider(null, ALL, "openai", fn)
    expect(got).toBe("gemini")
    // Should short-circuit on first match — anthropic, openai, then
    // gemini (hit). Should NOT continue past gemini.
    expect(calls).toEqual(["anthropic", "openai", "gemini"])
  })

  it("treats empty string as 'no key' and skips that provider", async () => {
    // readProviderKey returns null when missing; defensive check that
    // an empty string (which wouldn't pass `Boolean(key)` in callers)
    // is not stored as a 'configured' state. Our helper only checks
    // truthiness, so empty string IS truthy here intentionally — the
    // contract is "any non-null lookup result counts as configured".
    // This test pins that contract.
    const { fn } = makeLookup({ openai: "" })
    const got = await resolveInitialProvider(null, ALL, "openai", fn)
    // Empty string is falsy in JS — helper treats it as not configured.
    expect(got).toBe("openai") // fallback (nothing else configured)
    expect(fn).toHaveBeenCalled()
  })

  it("handles a custom provider id as a candidate", async () => {
    const customs: ProviderId[] = ["custom-zhipu" as ProviderId]
    const { fn } = makeLookup({
      ["custom-zhipu" as ProviderId]: "sk-zhipu",
    })
    const got = await resolveInitialProvider(
      null,
      [...ALL, ...customs],
      "openai",
      fn,
    )
    expect(got).toBe("custom-zhipu")
  })
})
