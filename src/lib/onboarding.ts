/**
 * Launch checklist (Quick Start) state machine.
 *
 * Completion is derived from real signals at render time — not persisted
 * step flags. Only panel dismiss is persisted (`OnboardingDismissed`).
 */

export type StepId =
  | "addLocales"
  | "installSchema"
  | "generateLlms"
  | "deployLlms"
  | "addApiKey"
  | "generateMeta"
  | "verifyPublished"

export interface OnboardingSignals {
  localeCount: number
  schemaInstalled: boolean
  llmsGenerated: boolean
  llmsDeployAcknowledged: boolean
  hasApiKey: boolean
  metaGenerated: boolean
  /** True after at least one in-plugin published-site verify run. */
  publishedVerifyRan: boolean
}

export interface OnboardingStep {
  id: StepId
  state: "done" | "pending" | "optional"
}

const STEP_ORDER: StepId[] = [
  "addLocales",
  "installSchema",
  "generateLlms",
  "deployLlms",
  "addApiKey",
  "generateMeta",
  "verifyPublished",
]

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
      if (signals.localeCount >= 2) return "done"
      if (signals.localeCount === 1) return "optional"
      return "pending"
    case "installSchema":
      return signals.schemaInstalled ? "done" : "pending"
    case "generateLlms":
      return signals.llmsGenerated ? "done" : "pending"
    case "deployLlms":
      if (signals.llmsDeployAcknowledged) return "done"
      if (!signals.llmsGenerated) return "pending"
      return "pending"
    case "addApiKey":
      return signals.hasApiKey ? "done" : "optional"
    case "generateMeta":
      return signals.metaGenerated ? "done" : "optional"
    case "verifyPublished":
      if (signals.publishedVerifyRan) return "done"
      if (signals.schemaInstalled) return "pending"
      return "optional"
  }
}

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

export function isAllDone(steps: OnboardingStep[]): boolean {
  return steps.every((s) => s.state === "done" || s.state === "optional")
}

/** Show control-center CTA when checklist is nearly complete. */
export function shouldOfferControlCenter(steps: OnboardingStep[]): boolean {
  const progress = computeProgress(steps)
  return isAllDone(steps) || progress.ratio >= 0.85
}

/** Launch blockers counted in the dashboard progress pill (excludes optional). */
export const CORE_STEP_IDS: readonly StepId[] = [
  "installSchema",
  "generateLlms",
  "deployLlms",
  "verifyPublished",
] as const

export function computeCoreProgress(steps: OnboardingStep[]): {
  done: number
  total: number
  ratio: number
} {
  const core = steps.filter((s) =>
    (CORE_STEP_IDS as readonly string[]).includes(s.id),
  )
  const total = core.length
  const done = core.filter((s) => s.state === "done").length
  return { done, total, ratio: total === 0 ? 0 : done / total }
}

/** First checklist row still requiring action (for highlight in Quick Start). */
export function getNextPendingStep(steps: OnboardingStep[]): StepId | null {
  const pending = steps.find((s) => s.state === "pending")
  return pending?.id ?? null
}
