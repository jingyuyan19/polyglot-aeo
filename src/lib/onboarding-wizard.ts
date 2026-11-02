/**
 * Setup wizard (3 screens) — prerequisites only.
 *
 * Launch work (schema, llms, verify) lives on the Dashboard checklist.
 * Actionable completion for API key uses {@link OnboardingSignals}.hasApiKey.
 */

import type { OnboardingSignals } from "./onboarding"

export type WizardScreenId = "welcome" | "aiSetup" | "done"

export const WIZARD_SCREEN_ORDER: readonly WizardScreenId[] = [
  "welcome",
  "aiSetup",
  "done",
] as const

export const WIZARD_SCREEN_COUNT = WIZARD_SCREEN_ORDER.length

export function wizardScreenIndex(id: WizardScreenId): number {
  return WIZARD_SCREEN_ORDER.indexOf(id)
}

export function wizardScreenAt(index: number): WizardScreenId {
  const clamped = Math.max(0, Math.min(index, WIZARD_SCREEN_COUNT - 1))
  return WIZARD_SCREEN_ORDER[clamped]!
}

/**
 * Default screen when the wizard opens and no {@link StorageKeys.OnboardingWizardLastScreen}
 * is saved. Always welcome on first visit; mid-flow resume uses persisted index instead.
 */
export function getResumeScreenIndex(signals: OnboardingSignals): number {
  void signals
  return wizardScreenIndex("welcome")
}

export function getReviewStartIndex(): number {
  return 0
}

export function clampScreenIndex(index: number): number {
  return Math.max(0, Math.min(index, WIZARD_SCREEN_COUNT - 1))
}
