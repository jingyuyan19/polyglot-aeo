import { useI18n } from "../i18n"

interface Props {
  onKeySaved: () => void
  onSavedAndTested?: () => void
  onOpenSettings?: () => void
}

export function WizardAiSetupPanel({ onOpenSettings }: Props) {
  const { t } = useI18n()

  return (
    <div className="pa-wizard-ai">
      <div className="pa-wizard-path-list">
        <div className="pa-wizard-path">
          <div className="pa-wizard-path-heading">
            <span className="pa-pill" data-tone="success">
              {t("wizard.firstRun.freeLabel")}
            </span>
            <strong>{t("wizard.firstRun.freeTitle")}</strong>
          </div>
          <p>{t("wizard.firstRun.freeBody")}</p>
        </div>

        <div className="pa-wizard-path">
          <div className="pa-wizard-path-heading">
            <span className="pa-pill">
              {t("wizard.firstRun.proLabel")}
            </span>
            <strong>{t("wizard.firstRun.proTitle")}</strong>
          </div>
          <p>{t("wizard.firstRun.proBody")}</p>
        </div>
      </div>

      <p className="pa-section-helper pa-wizard-managed-note">
        {t("wizard.firstRun.noKey")}
      </p>

      {onOpenSettings && (
        <p className="pa-section-helper pa-wizard-settings-link">
          <button
            type="button"
            className="pa-wizard-footer-link"
            onClick={onOpenSettings}
          >
            {t("settings.managedAiTitle")}
          </button>
        </p>
      )}
    </div>
  )
}
