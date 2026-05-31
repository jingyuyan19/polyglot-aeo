import { useEffect } from "react"

import { useI18n } from "../i18n"

interface Props {
  open: boolean
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Lightweight confirmation modal. We avoid `window.confirm` for two reasons:
 *   1. Native `confirm()` shows the host page's URL in the dialog title,
 *      which inside Framer plugin iframes leaks "localhost:5173" / our
 *      plugin URL — looks unprofessional.
 *   2. We can't style or i18n the native button labels.
 *
 * Keyboard: Enter confirms, Escape cancels. Focus trap is intentionally
 * minimal — we only have two buttons, so Tab cycles between them naturally.
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel()
      } else if (e.key === "Enter") {
        e.preventDefault()
        onConfirm()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("keydown", handleKey)
    }
  }, [open, onConfirm, onCancel])

  if (!open) return null

  return (
    <div
      className="pa-confirm-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="pa-confirm-dialog">
        <p className="pa-confirm-message">{message}</p>
        <div className="pa-confirm-actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel ?? t("common.back")}
          </button>
          <button
            type="button"
            className={destructive ? "pa-button-danger" : "pa-button-primary"}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel ?? t("common.remove")}
          </button>
        </div>
      </div>
    </div>
  )
}
