import { useEffect, useState } from "react"

import type { ToolRoute } from "../App"
import { useI18n, type TranslationKey } from "../i18n"
import {
  computeCoreProgress,
  computeSteps,
  getNextPendingStep,
  isAllDone,
  shouldOfferControlCenter,
  type OnboardingSignals,
  type StepId,
} from "../lib/onboarding"

interface Props {
  signals: OnboardingSignals
  onOpen: (route: ToolRoute) => void
  onDismiss: () => void
}

export function QuickStart({ signals, onOpen, onDismiss }: Props) {
  const { t } = useI18n()
  const steps = computeSteps(signals)
  const coreProgress = computeCoreProgress(steps)
  const nextPending = getNextPendingStep(steps)
  const nextPreviewStep = nextPending
    ? steps.find((step) => step.id === nextPending)
    : null
  const allDone = isAllDone(steps)
  const showControlCta = shouldOfferControlCenter(steps)

  const [collapsed, setCollapsed] = useState(true)
  useEffect(() => {
    if (allDone) setCollapsed(true)
  }, [allDone])

  return (
    <div className="pa-quickstart" data-collapsed={collapsed}>
      <div className="pa-quickstart-header-wrap">
        <button
          type="button"
          className="pa-quickstart-header"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? t("dashboard.quickStartExpand")
              : t("dashboard.quickStartCollapse")
          }
        >
          <div className="pa-quickstart-header-text">
            <div className="pa-row-spread pa-quickstart-title-row">
              <span className="pa-quickstart-title">
                {t("dashboard.launchChecklistTitle")}
              </span>
              <span
                className="pa-pill"
                data-tone={allDone ? "success" : undefined}
              >
                {t("dashboard.quickStartCoreProgress", {
                  done: coreProgress.done,
                  total: coreProgress.total,
                })}
              </span>
            </div>
            <div
              className="pa-quickstart-progress-bar"
              role="progressbar"
              aria-valuenow={coreProgress.done}
              aria-valuemin={0}
              aria-valuemax={coreProgress.total}
            >
              <div
                className="pa-quickstart-progress-fill"
                style={{ width: `${coreProgress.ratio * 100}%` }}
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
        {collapsed && nextPreviewStep && (
          <div className="pa-quickstart-next-preview">
            <span className="pa-pill pa-quickstart-step-next">
              {t("dashboard.quickStartNextUp")}
            </span>
            <div className="pa-quickstart-next-copy">
              <span className="pa-quickstart-step-title">
                {t(
                  `dashboard.quickStartSteps.${nextPreviewStep.id}Title` as TranslationKey,
                )}
              </span>
              <span className="pa-quickstart-step-desc">
                {t(
                  `dashboard.quickStartSteps.${nextPreviewStep.id}Desc` as TranslationKey,
                )}
              </span>
            </div>
            <button
              type="button"
              className="pa-quickstart-step-action"
              onClick={() => handleAction(nextPreviewStep.id, onOpen)}
            >
              {t(
                `dashboard.quickStartSteps.${nextPreviewStep.id}Action` as TranslationKey,
              )}
            </button>
          </div>
        )}
        {collapsed && !nextPreviewStep && showControlCta && (
          <div className="pa-quickstart-next-preview">
            <span className="pa-quickstart-footer-status" data-tone="success">
              ✓ {t("dashboard.quickStartAllDone")}
            </span>
            <button
              type="button"
              className="pa-quickstart-step-action"
              onClick={() => onOpen("control")}
            >
              {t("dashboard.openControl")}
            </button>
          </div>
        )}
        {!collapsed && (
          <div className="pa-quickstart-control-hint">
            <p className="pa-section-helper" style={{ margin: 0 }}>
              {t("dashboard.launchChecklistControlHint")}
            </p>
            {showControlCta && (
              <button
                type="button"
                className="pa-quickstart-step-action"
                style={{ marginTop: 8 }}
                onClick={() => onOpen("control")}
              >
                {t("dashboard.openControl")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="pa-quickstart-body">
        {steps.map((step) => (
          <Step
            key={step.id}
            id={step.id}
            state={step.state}
            highlighted={
              step.id === nextPending && step.state === "pending"
            }
            onAction={() => handleAction(step.id, onOpen)}
          />
        ))}
        {(allDone || showControlCta) && (
          <div className="pa-quickstart-footer">
            {allDone && (
              <span
                className="pa-quickstart-footer-status"
                data-tone="success"
              >
                ✓ {t("dashboard.quickStartAllDone")}
              </span>
            )}
            <div className="pa-quickstart-footer-actions">
              {allDone && (
                <button
                  type="button"
                  className="pa-quickstart-dismiss"
                  onClick={onDismiss}
                >
                  {t("dashboard.quickStartDismiss")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Step({
  id,
  state,
  highlighted,
  onAction,
}: {
  id: StepId
  state: "done" | "pending" | "optional"
  highlighted?: boolean
  onAction: () => void
}) {
  const { t } = useI18n()
  const titleKey = `dashboard.quickStartSteps.${id}Title` as TranslationKey
  const descKey = `dashboard.quickStartSteps.${id}Desc` as TranslationKey
  const actionKey = `dashboard.quickStartSteps.${id}Action` as TranslationKey

  return (
    <div
      className="pa-quickstart-step"
      data-state={state}
      data-highlighted={highlighted ? "true" : undefined}
    >
      <span className="pa-quickstart-step-marker" aria-hidden="true">
        {state === "done" ? <CheckIcon /> : null}
      </span>
      <div className="pa-quickstart-step-body">
        <span className="pa-quickstart-step-title-row">
          <span className="pa-quickstart-step-title">{t(titleKey)}</span>
          {highlighted && (
            <span className="pa-pill pa-quickstart-step-next">
              {t("dashboard.quickStartNext")}
            </span>
          )}
        </span>
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

function handleAction(id: StepId, onOpen: (route: ToolRoute) => void) {
  switch (id) {
    case "addLocales":
      window.open("https://www.framer.com/help/articles/localization/", "_blank")
      return
    case "installSchema":
      onOpen("schema")
      return
    case "generateLlms":
    case "deployLlms":
      onOpen("llms")
      return
    case "addApiKey":
      onOpen("settings")
      return
    case "generateMeta":
      onOpen("meta")
      return
    case "verifyPublished":
      onOpen("verify")
      return
  }
}
