import { useEffect } from "react"

import { useI18n } from "../i18n"

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Tiny modal that lists every keyboard shortcut the plugin honors.
 * Triggered by `?` from anywhere outside text inputs. Dismissed by Esc
 * (also listed in the shortcut table — this is intentional, the overlay
 * is its own first reference).
 *
 * We deliberately don't try to scope shortcuts per view: ESC and
 * Cmd/Ctrl+Enter are uniform across the plugin, and listing them in
 * one place keeps the cognitive load low.
 */
export function KeyboardOverlay({ open, onClose }: Props) {
  const { t } = useI18n()

  // ESC dismisses. Bound here (not via useKeyboardShortcut) because the
  // overlay needs to close even if the user is mid-edit in a textarea
  // that ate ESC's default action.
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  // Detect Mac for the modifier symbol. Designers use both, but the
  // overlay matters most on the platform where the shortcut works,
  // and we don't want to show "Cmd" to a Windows user.
  const isMac = navigator.platform.toLowerCase().includes("mac")
  const modKey = isMac ? "⌘" : "Ctrl"

  const rows: Array<{ keys: string; label: string }> = [
    { keys: "Esc", label: t("shortcuts.back") },
    { keys: `${modKey} + ↵`, label: t("shortcuts.submit") },
    { keys: "?", label: t("shortcuts.help") },
  ]

  return (
    <div
      className="pa-overlay-scrim"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="pa-overlay-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pa-row-spread">
          <span className="pa-card-title">{t("shortcuts.title")}</span>
          <button
            type="button"
            className="pa-button-icon"
            onClick={onClose}
            aria-label={t("common.close")}
            style={{ width: 24, padding: 0 }}
          >
            ✕
          </button>
        </div>
        <p className="pa-section-helper">{t("shortcuts.helper")}</p>
        <ul className="pa-shortcut-list">
          {rows.map(({ keys, label }) => (
            <li key={keys} className="pa-shortcut-row">
              <kbd className="pa-kbd">{keys}</kbd>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
