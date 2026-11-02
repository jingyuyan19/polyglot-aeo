import type { ReactNode } from "react"

interface Props {
  children: ReactNode
  className?: string
  onBackdropClick?: () => void
  /** Defaults to `presentation` when backdrop click is wired. */
  role?: "presentation" | "dialog"
  "aria-modal"?: boolean
}

/**
 * Full-plugin scrim + centered flex shell. Always use with
 * {@link useModalBackdrop} on the same `open` flag (or set
 * `data-modal-open` on `.pa-app-main` from the app shell).
 */
export function ModalOverlay({
  children,
  className,
  onBackdropClick,
  role,
  "aria-modal": ariaModal,
}: Props) {
  const resolvedRole = role ?? (onBackdropClick ? "presentation" : undefined)
  return (
    <div
      className={["pa-modal-overlay", className].filter(Boolean).join(" ")}
      role={resolvedRole}
      aria-modal={ariaModal}
      onClick={
        onBackdropClick
          ? (e) => {
              if (e.target === e.currentTarget) onBackdropClick()
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}
