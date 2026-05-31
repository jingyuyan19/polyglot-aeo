import "framer-plugin/framer.css"
import "./globals.css"

import React from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App"
import {
  AUTO_LOCALE,
  detectBrowserLocale,
  initI18n,
  resolveLocale,
  type LocalePreference,
  type SupportedLocale,
} from "./i18n"
import { registerProtectedMethodChecks } from "./lib/framer/permissions"
import { initSentry } from "./lib/sentry"
import { StorageKeys, readString } from "./lib/storage"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

/**
 * Boot order matters here: we must load the persisted UI-language preference
 * (and resolve the browser default) BEFORE the first render, otherwise the
 * plugin would flash English for one frame and then swap to the user's
 * language. Reading plugin data is cheap (~1ms), so we await it synchronously.
 */
async function bootstrap() {
  // Pre-register every protected SDK method we'll ever call. This
  // satisfies the SDK's "checked-set" invariant and silences the
  // dev-mode "Invoking protected message type ... without checking
  // permissions first" toast that otherwise fires on every storage
  // write or Custom Code mutation. Helper-level guards in storage.ts
  // and customCode.ts re-check on each call to handle live permission
  // revocation cleanly.
  registerProtectedMethodChecks()
  initSentry()

  const detected: SupportedLocale = detectBrowserLocale()

  const stored = await readString(StorageKeys.UiLocalePreference)
  const preference: LocalePreference =
    stored === null || stored === AUTO_LOCALE
      ? AUTO_LOCALE
      : (resolveLocale(stored) as LocalePreference)

  initI18n({ preference, detected })

  ReactDOM.createRoot(root!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()
