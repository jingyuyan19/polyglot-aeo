import { useI18n } from "../i18n"

interface Props {
  onClick?: () => void
}

export function ProBadge({ onClick }: Props) {
  const { t } = useI18n()
  if (onClick) {
    return (
      <button type="button" className="pa-pro-badge" onClick={onClick}>
        {t("license.proBadge")}
      </button>
    )
  }
  return <span className="pa-pro-badge">{t("license.proBadge")}</span>
}
