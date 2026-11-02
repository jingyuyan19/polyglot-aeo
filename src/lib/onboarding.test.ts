import { describe, expect, it } from "vitest"

import {
  computeCoreProgress,
  computeProgress,
  computeSteps,
  getNextPendingStep,
  isAllDone,
  shouldOfferControlCenter,
  type OnboardingSignals,
} from "./onboarding"

const EMPTY: OnboardingSignals = {
  localeCount: 0,
  schemaInstalled: false,
  llmsGenerated: false,
  llmsDeployAcknowledged: false,
  hasApiKey: false,
  metaGenerated: false,
  publishedVerifyRan: false,
}

const FULLY_SETUP: OnboardingSignals = {
  localeCount: 3,
  schemaInstalled: true,
  llmsGenerated: true,
  llmsDeployAcknowledged: true,
  hasApiKey: true,
  metaGenerated: true,
  publishedVerifyRan: true,
}

describe("computeSteps", () => {
  it("returns 7 steps in stable order", () => {
    const ids = computeSteps(EMPTY).map((s) => s.id)
    expect(ids).toHaveLength(7)
    expect(ids[0]).toBe("addLocales")
    expect(ids[6]).toBe("verifyPublished")
  })

  it("marks addLocales done at 2+ locales, optional at 1, pending at 0", () => {
    expect(stateOf("addLocales", { ...EMPTY, localeCount: 0 })).toBe("pending")
    expect(stateOf("addLocales", { ...EMPTY, localeCount: 1 })).toBe("optional")
    expect(stateOf("addLocales", { ...EMPTY, localeCount: 2 })).toBe("done")
  })

  it("deployLlms pending until ack after generate", () => {
    expect(stateOf("deployLlms", EMPTY)).toBe("pending")
    expect(
      stateOf("deployLlms", { ...EMPTY, llmsGenerated: true }),
    ).toBe("pending")
    expect(
      stateOf("deployLlms", {
        ...EMPTY,
        llmsGenerated: true,
        llmsDeployAcknowledged: true,
      }),
    ).toBe("done")
  })

  it("verifyPublished done after run, pending when schema installed", () => {
    expect(stateOf("verifyPublished", EMPTY)).toBe("optional")
    expect(
      stateOf("verifyPublished", { ...EMPTY, schemaInstalled: true }),
    ).toBe("pending")
    expect(
      stateOf("verifyPublished", {
        ...EMPTY,
        schemaInstalled: true,
        publishedVerifyRan: true,
      }),
    ).toBe("done")
  })
})

describe("isAllDone", () => {
  it("returns true for single-locale project with core + optional steps", () => {
    const single: OnboardingSignals = {
      localeCount: 1,
      schemaInstalled: true,
      llmsGenerated: true,
      llmsDeployAcknowledged: true,
      hasApiKey: false,
      metaGenerated: false,
      publishedVerifyRan: true,
    }
    expect(isAllDone(computeSteps(single))).toBe(true)
  })

  it("returns true when fully set up", () => {
    expect(isAllDone(computeSteps(FULLY_SETUP))).toBe(true)
  })
})

describe("shouldOfferControlCenter", () => {
  it("is true when all done", () => {
    expect(shouldOfferControlCenter(computeSteps(FULLY_SETUP))).toBe(true)
  })
})

describe("computeProgress", () => {
  it("hits 7/7 when fully set up", () => {
    const progress = computeProgress(computeSteps(FULLY_SETUP))
    expect(progress.done).toBe(7)
    expect(progress.total).toBe(7)
  })
})

describe("computeCoreProgress", () => {
  it("counts only core steps as done", () => {
    const steps = computeSteps({
      ...EMPTY,
      localeCount: 1,
      schemaInstalled: true,
      llmsGenerated: true,
      llmsDeployAcknowledged: true,
      publishedVerifyRan: false,
    })
    const core = computeCoreProgress(steps)
    expect(core.total).toBe(4)
    expect(core.done).toBe(3)
  })
})

describe("getNextPendingStep", () => {
  it("returns first pending step id", () => {
    const steps = computeSteps({ ...EMPTY, localeCount: 1 })
    expect(getNextPendingStep(steps)).toBe("installSchema")
  })
})

function stateOf(id: string, signals: OnboardingSignals) {
  return computeSteps(signals).find((s) => s.id === id)?.state
}
