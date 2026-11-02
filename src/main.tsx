import "framer-plugin/framer.css"
import "./globals.css"

import React from "react"
import ReactDOM from "react-dom/client"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

function render(element: React.ReactElement) {
  ReactDOM.createRoot(root!).render(
    <React.StrictMode>{element}</React.StrictMode>,
  )
}

function isPreviewMode() {
  const params = new URLSearchParams(window.location.search)
  return (
    params.get("preview") === "1" ||
    params.get("preview") === "true" ||
    window.location.hash === "#preview"
  )
}

/**
 * Boot order matters here: we must load the persisted UI-language preference
 * (and resolve the browser default) BEFORE the first render, otherwise the
 * plugin would flash English for one frame and then swap to the user's
 * language. Reading plugin data is cheap (~1ms), so we await it synchronously.
 */
async function bootstrap() {
  if (isPreviewMode()) {
    const { PreviewApp } = await import("./preview/PreviewApp")
    render(<PreviewApp />)
    return
  }

  const [
    { App },
    {
      AUTO_LOCALE,
      detectBrowserLocale,
      initI18n,
      resolveLocale,
    },
    { registerProtectedMethodChecks },
    { initSentry },
    { StorageKeys, readString },
  ] = await Promise.all([
    import("./App"),
    import("./i18n"),
    import("./lib/framer/permissions"),
    import("./lib/sentry"),
    import("./lib/storage"),
  ])

  // Pre-register every protected SDK method we'll ever call. This
  // satisfies the SDK's "checked-set" invariant and silences the
  // dev-mode "Invoking protected message type ... without checking
  // permissions first" toast that otherwise fires on every storage
  // write or Custom Code mutation. Helper-level guards in storage.ts
  // and customCode.ts re-check on each call to handle live permission
  // revocation cleanly.
  registerProtectedMethodChecks()
  initSentry()

  const detected = detectBrowserLocale()

  const stored = await readString(StorageKeys.UiLocalePreference)
  const preference =
    stored === null || stored === AUTO_LOCALE
      ? AUTO_LOCALE
      : resolveLocale(stored)

  initI18n({ preference, detected })

  render(<App />)
}

void bootstrap()
