import { useI18n } from "../i18n"
import type { MetaStep } from "../views/meta/types"

const STEPS: MetaStep[] = ["page", "generate", "review"]

interface Props {
  step: MetaStep
  hasGenerated: boolean
  onStepChange: (step: MetaStep) => void
}

export function MetaStepBar({ step, hasGenerated, onStepChange }: Props) {
  const { t } = useI18n()
  const stepIndex = STEPS.indexOf(step)

  return (
    <div
      className="pa-llms-step-bar"
      role="navigation"
      aria-label={t("meta.stepNavLabel")}
    >
      <div className="pa-llms-step-dots" role="tablist">
        {STEPS.map((s, i) => {
          const needsGenerate = s === "review" && !hasGenerated
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
              aria-label={t(`meta.step.${s}` as const)}
              title={t(`meta.step.${s}` as const)}
              onClick={() => onStepChange(s)}
            />
          )
        })}
      </div>
      <span className="pa-llms-step-caption">
        {t("meta.stepProgress", {
          current: stepIndex + 1,
          total: STEPS.length,
          label: t(`meta.step.${step}` as const),
        })}
      </span>
    </div>
  )
}
