import { describe, expect, it } from "vitest"

import {
  computeProgress,
  computeSteps,
  isAllDone,
  type OnboardingSignals,
} from "./onboarding"

const EMPTY: OnboardingSignals = {
  localeCount: 0,
  schemaInstalled: false,
  llmsGenerated: false,
  hasApiKey: false,
}

const FULLY_SETUP: OnboardingSignals = {
  localeCount: 3,
  schemaInstalled: true,
  llmsGenerated: true,
  hasApiKey: true,
}

describe("computeSteps", () => {
  it("returns 5 steps in stable order regardless of state", () => {
    const a = computeSteps(EMPTY).map((s) => s.id)
    const b = computeSteps(FULLY_SETUP).map((s) => s.id)
    expect(a).toEqual(b)
    expect(a).toHaveLength(5)
  })

  it("marks addLocales done only when there are 2+ locales", () => {
    expect(stateOf("addLocales", { ...EMPTY, localeCount: 0 })).toBe("pending")
    expect(stateOf("addLocales", { ...EMPTY, localeCount: 1 })).toBe("pending")
    expect(stateOf("addLocales", { ...EMPTY, localeCount: 2 })).toBe("done")
    expect(stateOf("addLocales", { ...EMPTY, localeCount: 14 })).toBe("done")
  })

  it("marks addApiKey as optional when missing — never blocks dismissal", () => {
    expect(stateOf("addApiKey", EMPTY)).toBe("optional")
    expect(stateOf("addApiKey", FULLY_SETUP)).toBe("done")
  })

  it("verify is only relevant after schema is installed", () => {
    expect(stateOf("verify", { ...EMPTY, schemaInstalled: false })).toBe(
      "pending",
    )
    expect(stateOf("verify", { ...EMPTY, schemaInstalled: true })).toBe(
      "optional",
    )
  })
})

describe("computeProgress", () => {
  it("counts done + optional as completed toward total", () => {
    const steps = computeSteps(EMPTY)
    const progress = computeProgress(steps)
    // EMPTY → addApiKey is optional (1), the rest are pending (4)
    expect(progress.total).toBe(5)
    expect(progress.done).toBe(1)
    expect(progress.ratio).toBeCloseTo(1 / 5)
  })

  it("hits 5/5 when fully set up", () => {
    const steps = computeSteps(FULLY_SETUP)
    const progress = computeProgress(steps)
    expect(progress.done).toBe(5)
    expect(progress.total).toBe(5)
    expect(progress.ratio).toBe(1)
  })
})

describe("isAllDone", () => {
  it("returns false on a fresh project", () => {
    expect(isAllDone(computeSteps(EMPTY))).toBe(false)
  })

  it("returns true once core steps (locales + schema + llms) are done, regardless of API key", () => {
    const noKey: OnboardingSignals = {
      localeCount: 3,
      schemaInstalled: true,
      llmsGenerated: true,
      hasApiKey: false,
    }
    expect(isAllDone(computeSteps(noKey))).toBe(true)
  })
})

function stateOf(id: string, signals: OnboardingSignals) {
  return computeSteps(signals).find((s) => s.id === id)?.state
}
