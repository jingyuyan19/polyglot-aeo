import { OnboardingNavButton } from "./OnboardingNavButton"
import { SettingsIcon } from "./icons"
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut"
import { useI18n } from "../i18n"
import { LocaleSwitcher } from "./LocaleSwitcher"

interface Props {
  title: string
  onBack: () => void
  /**
   * When provided, renders a gear icon to the right of the LocaleSwitcher
   * that drills into Settings. Tool views pass this down so users can fix
   * an API key (or anything else config-y) without losing their current
   * view's state — `onBack` from Settings returns here, not Dashboard.
   *
   * Omit (or pass undefined) on the Settings view itself to avoid showing
   * a "go where you already are" button.
   */
  onOpenSettings?: () => void
  /** Re-open the setup wizard (clipboard icon left of Settings). */
  onOpenOnboarding?: () => void
}

export function TopBar({ title, onBack, onOpenSettings, onOpenOnboarding }: Props) {
  const { t } = useI18n()
  // ESC anywhere outside text inputs returns to the previous view. Inside
  // an input, ESC defers to the browser's clear-field behavior.
  useKeyboardShortcut("Escape", onBack)
  return (
    <div className="pa-topbar">
      <button type="button" className="pa-topbar-back" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M9 11.5L4.5 7L9 2.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t("common.back")}
      </button>
      <span className="pa-topbar-title">{title}</span>
      <div className="pa-topbar-actions">
        <LocaleSwitcher />
        {onOpenOnboarding && (
          <OnboardingNavButton onClick={onOpenOnboarding} />
        )}
        {onOpenSettings && (
          <button
            type="button"
            className="pa-topbar-icon-button"
            onClick={onOpenSettings}
            aria-label={t("common.openSettings")}
            title={t("common.openSettings")}
          >
            <SettingsIcon size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
