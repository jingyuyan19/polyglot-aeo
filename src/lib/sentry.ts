/**
 * Optional error reporting when VITE_SENTRY_DSN is set at build time.
 * Posts to Sentry ingest via beacon — no extra bundle dependency.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

export function initSentry(): void {
  if (!DSN?.trim() || import.meta.env.DEV) return

  window.addEventListener("error", (event) => {
    captureException(event.error ?? event.message)
  })
  window.addEventListener("unhandledrejection", (event) => {
    captureException(event.reason)
  })
}

export function captureException(error: unknown): void {
  if (!DSN?.trim()) return
  try {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown")
    const body = JSON.stringify({
      message,
      platform: "framer-plugin",
      release: "polyglot-aeo",
    })
    const endpoint = DSN.trim()
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, body)
    }
  } catch {
    // ignore
  }
}
