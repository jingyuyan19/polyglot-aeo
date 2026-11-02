import { useEffect } from "react"

let modalBackdropCount = 0

function syncModalBackdropAttribute() {
  const main = document.querySelector(".pa-app-main")
  if (!main) return
  if (modalBackdropCount > 0) {
    main.setAttribute("data-modal-open", "")
  } else {
    main.removeAttribute("data-modal-open")
  }
}

/**
 * Dims `.pa-app-main` while a modal is open. Pair with `.pa-modal-overlay`
 * on the modal scrim. Ref-counted so nested/overlapping modals stay safe.
 */
export function useModalBackdrop(open: boolean): void {
  useEffect(() => {
    if (!open) return
    modalBackdropCount += 1
    syncModalBackdropAttribute()
    return () => {
      modalBackdropCount = Math.max(0, modalBackdropCount - 1)
      syncModalBackdropAttribute()
    }
  }, [open])
}
