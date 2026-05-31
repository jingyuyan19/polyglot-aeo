import { useI18n } from "../i18n"
import type { LlmsStep } from "../views/llms/types"

const STEPS: LlmsStep[] = ["setup", "sources", "review", "deploy"]

interface Props {
  step: LlmsStep
  hasGenerated: boolean
  onStepChange: (step: LlmsStep) => void
}

export function LlmsStepBar({ step, hasGenerated, onStepChange }: Props) {
  const { t } = useI18n()
  const stepIndex = STEPS.indexOf(step)

  return (
    <div
      className="pa-llms-step-bar"
      role="navigation"
      aria-label={t("llms.stepNavLabel")}
    >
      <div className="pa-llms-step-dots" role="tablist">
        {STEPS.map((s, i) => {
          const needsGenerate =
            (s === "review" || s === "deploy") && !hasGenerated
          return (
            <button
              key={s}
              type="button"
              role="tab"
              className="pa-llms-step-dot"
              data-active={step === s}
              data-done={i < stepIndex}
              disabled={needsGenerate}
              aria-selected={step === s}
              aria-label={t(`llms.step.${s}` as const)}
              title={t(`llms.step.${s}` as const)}
              onClick={() => onStepChange(s)}
            />
          )
        })}
      </div>
      <span className="pa-llms-step-caption">
        {t("llms.stepProgress", {
          current: stepIndex + 1,
          total: STEPS.length,
          label: t(`llms.step.${step}` as const),
        })}
      </span>
    </div>
  )
}
