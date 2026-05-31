import { useEffect } from "react"

/**
 * Lightweight keyboard shortcut binding. Skips activation when the user is
 * typing in a form control so ESC inside an `<input>` clears the field
 * (browser default) instead of navigating away.
 *
 * Usage:
 *   useKeyboardShortcut("Escape", onBack)
 *   useKeyboardShortcut("Enter", handleSubmit, { ctrlOrMeta: true })
 */
export function useKeyboardShortcut(
  key: string,
  handler: () => void,
  options: { ctrlOrMeta?: boolean; allowInForm?: boolean } = {},
) {
  const { ctrlOrMeta = false, allowInForm = false } = options

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== key) return
      if (ctrlOrMeta && !(event.metaKey || event.ctrlKey)) return
      if (!allowInForm && isTypingTarget(event.target)) return
      event.preventDefault()
      handler()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [key, handler, ctrlOrMeta, allowInForm])
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  return false
}
