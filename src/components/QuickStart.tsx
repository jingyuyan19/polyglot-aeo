import { useEffect, useState } from "react"

import type { ToolRoute } from "../App"
import { useI18n, type TranslationKey } from "../i18n"
import {
  computeProgress,
  computeSteps,
  isAllDone,
  type OnboardingSignals,
  type StepId,
} from "../lib/onboarding"

interface Props {
  signals: OnboardingSignals
  onOpen: (route: ToolRoute) => void
  onDismiss: () => void
}

/**
 * The 5-row Quick Start checklist. Visual rules:
 *   - Header acts as a collapse toggle and shows progress {done}/{total}
 *     plus a thin progress bar.
 *   - Each step shows a marker (filled / hollow / dashed for optional),
 *     a title, a one-line description, and a single action button that
 *     either routes inside the plugin or opens an external URL.
 *   - When every step is `done` or `optional`, a "You're all set" footer
 *     appears with a Dismiss button.
 *
 * Collapsed-state preference is local to this component (per session) —
 * we deliberately don't persist it. If the user dismisses, that's
 * persisted in plugin data via the parent's `onDismiss`.
 */
export function QuickStart({ signals, onOpen, onDismiss }: Props) {
  const { t } = useI18n()
  const steps = computeSteps(signals)
  const progress = computeProgress(steps)
  const allDone = isAllDone(steps)

  // Auto-collapse once the user has reached "all done" — they don't need to
  // see the full panel, but they can still expand it back if they want.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (allDone) setCollapsed(true)
  }, [allDone])

  return (
    <div className="pa-quickstart" data-collapsed={collapsed}>
      <button
        type="button"
        className="pa-quickstart-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("dashboard.quickStartExpand") : t("dashboard.quickStartCollapse")}
      >
        <div className="pa-quickstart-header-text">
          <div className="pa-row-spread">
            <span className="pa-quickstart-title">
              {t("dashboard.quickStartTitle")}
            </span>
            <span className="pa-pill" data-tone={allDone ? "success" : undefined}>
              {t("dashboard.quickStartProgress", {
                done: progress.done,
                total: progress.total,
              })}
            </span>
          </div>
          <div
            className="pa-quickstart-progress-bar"
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
          >
            <div
              className="pa-quickstart-progress-fill"
              style={{ width: `${progress.ratio * 100}%` }}
            />
          </div>
        </div>
        <span className="pa-quickstart-chevron" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 3.5L5 6.5L8 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      <div className="pa-quickstart-body">
        {steps.map((step) => (
          <Step
            key={step.id}
            id={step.id}
            state={step.state}
            onAction={() => handleAction(step.id, onOpen)}
          />
        ))}
        {allDone && (
          <div className="pa-quickstart-footer">
            <span
              className="pa-quickstart-footer-status"
              data-tone="success"
            >
              ✓ {t("dashboard.quickStartAllDone")}
            </span>
            <button
              type="button"
              className="pa-quickstart-dismiss"
              onClick={onDismiss}
            >
              {t("dashboard.quickStartDismiss")}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Step({
  id,
  state,
  onAction,
}: {
  id: StepId
  state: "done" | "pending" | "optional"
  onAction: () => void
}) {
  const { t } = useI18n()
  const titleKey = `dashboard.quickStartSteps.${id}Title` as TranslationKey
  const descKey = `dashboard.quickStartSteps.${id}Desc` as TranslationKey
  const actionKey = `dashboard.quickStartSteps.${id}Action` as TranslationKey

  return (
    <div className="pa-quickstart-step" data-state={state}>
      <span className="pa-quickstart-step-marker" aria-hidden="true">
        {state === "done" ? <CheckIcon /> : null}
      </span>
      <div className="pa-quickstart-step-body">
        <span className="pa-quickstart-step-title">{t(titleKey)}</span>
        <span className="pa-quickstart-step-desc">{t(descKey)}</span>
      </div>
      {state !== "done" && (
        <button
          type="button"
          className="pa-quickstart-step-action"
          onClick={onAction}
        >
          {t(actionKey)}
        </button>
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M2 5L4 7L8 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Map a step id to its action: either an internal route or an external URL.
 * Kept in one place so the wiring is auditable.
 */
function handleAction(id: StepId, onOpen: (route: ToolRoute) => void) {
  switch (id) {
    case "addLocales":
      window.open("https://www.framer.com/help/articles/localization/", "_blank")
      return
    case "installSchema":
      onOpen("schema")
      return
    case "generateLlms":
      onOpen("llms")
      return
    case "addApiKey":
      onOpen("settings")
      return
    case "verify":
      window.open("https://search.google.com/test/rich-results", "_blank")
      return
  }
}
