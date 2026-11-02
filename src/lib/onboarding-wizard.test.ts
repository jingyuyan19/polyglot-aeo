import { describe, expect, it } from "vitest"

import type { OnboardingSignals } from "./onboarding"
import {
  getResumeScreenIndex,
  getReviewStartIndex,
  WIZARD_SCREEN_COUNT,
  wizardScreenAt,
  wizardScreenIndex,
} from "./onboarding-wizard"

const EMPTY: OnboardingSignals = {
  localeCount: 1,
  schemaInstalled: false,
  llmsGenerated: false,
  llmsDeployAcknowledged: false,
  hasApiKey: false,
  metaGenerated: false,
  publishedVerifyRan: false,
}

describe("onboarding-wizard", () => {
  it("has 3 screens", () => {
    expect(WIZARD_SCREEN_COUNT).toBe(3)
    expect(wizardScreenAt(0)).toBe("welcome")
    expect(wizardScreenAt(2)).toBe("done")
  })

  it("starts at welcome when no API key and no saved screen", () => {
    expect(getResumeScreenIndex(EMPTY)).toBe(wizardScreenIndex("welcome"))
  })

  it("still starts at welcome when API key is already present", () => {
    expect(
      getResumeScreenIndex({ ...EMPTY, hasApiKey: true }),
    ).toBe(wizardScreenIndex("welcome"))
  })

  it("does not skip welcome based on schemaInstalled alone", () => {
    expect(
      getResumeScreenIndex({
        ...EMPTY,
        schemaInstalled: true,
        hasApiKey: false,
      }),
    ).toBe(wizardScreenIndex("welcome"))
  })

  it("review starts at start", () => {
    expect(getReviewStartIndex()).toBe(0)
  })
})
