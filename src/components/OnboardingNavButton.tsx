import { OnboardingIcon } from "./icons"
import { useI18n } from "../i18n"

interface Props {
  onClick: () => void
}

export function OnboardingNavButton({ onClick }: Props) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className="pa-topbar-icon-button"
      onClick={onClick}
      aria-label={t("wizard.reopen")}
      title={t("wizard.reopen")}
    >
      <OnboardingIcon size={14} />
    </button>
  )
}
