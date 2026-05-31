/**
 * Onboarding state machine.
 *
 * Polyglot AEO's "Quick Start" surface is a 5-step state-aware checklist.
 * Each step's completion is derived from real environment signals at render
 * time — never persisted. Persisting "I completed step N" creates stale
 * state when users uninstall schema, swap projects, or revoke API keys.
 *
 * The only piece of state we DO persist is whether the user explicitly
 * dismissed the panel. Everything else is computed.
 *
 * The pure helpers in this module are unit-tested in `onboarding.test.ts`.
 */

export type StepId =
  | "addLocales"
  | "installSchema"
  | "generateLlms"
  | "addApiKey"
  | "verify"

export interface OnboardingSignals {
  /** Number of locales detected in the Framer project (default + others). */
  localeCount: number
  /** Whether Polyglot AEO has installed schema into headEnd. */
  schemaInstalled: boolean
  /** Whether the user has saved at least one llms.txt run. */
  llmsGenerated: boolean
  /** Whether at least one AI provider key is configured. */
  hasApiKey: boolean
}

export interface OnboardingStep {
  id: StepId
  /**
   * Steps fall into one of three states:
   *  - `done`     ✓ user has done this; render muted with checkmark
   *  - `pending`  ○ next or upcoming action; render with action button
   *  - `optional` ◇ skippable but recommended (e.g. AI key for Meta tool)
   *               — counted as "complete" toward overall progress so the
   *                 panel can be dismissed without forcing this step
   */
  state: "done" | "pending" | "optional"
}

const STEP_ORDER: StepId[] = [
  "addLocales",
  "installSchema",
  "generateLlms",
  "addApiKey",
  "verify",
]

/**
 * Compute the steps array given environment signals.
 *
 * `verify` is the trickiest step: we have no way to programmatically check
 * whether the user actually clicked through to Google Rich Results Test, so
 * we mark it `pending` only when schema is installed (otherwise there's
 * nothing to verify yet) and treat it as `optional` once it appears so the
 * checklist can reach 100% without it.
 */
export function computeSteps(signals: OnboardingSignals): OnboardingStep[] {
  return STEP_ORDER.map((id) => ({
    id,
    state: deriveState(id, signals),
  }))
}

function deriveState(
  id: StepId,
  signals: OnboardingSignals,
): OnboardingStep["state"] {
  switch (id) {
    case "addLocales":
      // 2+ locales is the threshold where Polyglot AEO becomes valuable.
      // 1 locale is technically "fine" but the plugin's pitch falls apart.
      return signals.localeCount >= 2 ? "done" : "pending"
    case "installSchema":
      return signals.schemaInstalled ? "done" : "pending"
    case "generateLlms":
      return signals.llmsGenerated ? "done" : "pending"
    case "addApiKey":
      // Optional because the Schema and llms.txt tools work without it.
      return signals.hasApiKey ? "done" : "optional"
    case "verify":
      // Only meaningful after schema is installed.
      return signals.schemaInstalled ? "optional" : "pending"
  }
}

/**
 * Progress tuple for rendering "{done} / {total}" and a progress bar.
 * Optional steps that are still "optional" (not yet `done`) count as
 * complete toward the total, because they can't block dismissal.
 */
export function computeProgress(steps: OnboardingStep[]): {
  done: number
  total: number
  ratio: number
} {
  const total = steps.length
  const done = steps.filter(
    (s) => s.state === "done" || s.state === "optional",
  ).length
  return { done, total, ratio: total === 0 ? 0 : done / total }
}

/** True when every step is either complete or skippable. */
export function isAllDone(steps: OnboardingStep[]): boolean {
  return steps.every((s) => s.state === "done" || s.state === "optional")
}
