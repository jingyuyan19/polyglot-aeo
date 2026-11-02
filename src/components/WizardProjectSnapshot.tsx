import { useI18n } from "../i18n"
import { FRAMER_LOCALIZATION_DOCS } from "../lib/links"
import type { OnboardingSignals } from "../lib/onboarding"

interface Props {
  signals: Pick<
    OnboardingSignals,
    "localeCount" | "schemaInstalled"
  >
}

export function WizardProjectSnapshot({ signals }: Props) {
  const { t } = useI18n()

  return (
    <div className="pa-wizard-snapshot">
      <span className="pa-wizard-snapshot-label">
        {t("wizard.snapshot.projectLabel")}
      </span>
      <div className="pa-wizard-snapshot-pills">
        <span className="pa-pill">
          {t("wizard.snapshot.locales", { count: signals.localeCount })}
        </span>
        <span
          className="pa-pill"
          data-tone={signals.schemaInstalled ? "success" : undefined}
        >
          {signals.schemaInstalled
            ? t("wizard.snapshot.schemaInstalled")
            : t("wizard.snapshot.schemaNotInstalled")}
        </span>
        <span className="pa-pill">{t("wizard.snapshot.aiNotConnected")}</span>
      </div>
      {signals.localeCount === 0 && (
        <a
          href={FRAMER_LOCALIZATION_DOCS}
          target="_blank"
          rel="noreferrer noopener"
          className="pa-link pa-wizard-snapshot-link"
        >
          {t("wizard.snapshot.addLocales")}
        </a>
      )}
    </div>
  )
}
