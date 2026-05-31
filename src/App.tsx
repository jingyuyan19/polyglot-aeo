import { framer } from "framer-plugin"
import { useCallback, useRef, useState } from "react"

import type { SchemaAuditSession } from "./lib/schema/audit-session"

import { EntitlementProvider } from "./components/EntitlementProvider"
import { KeyboardOverlay } from "./components/KeyboardOverlay"
import { UpgradeModal } from "./components/UpgradeModal"
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut"
import type { UpgradeReason } from "./lib/license/types"
import {
  popRoute,
  pushRoute,
  topOf,
  type ToolRoute,
} from "./lib/routeStack"
import { Dashboard } from "./views/Dashboard"
import { AeoControlCenterView } from "./views/AeoControlCenterView"
import { CmsGapManagerView } from "./views/CmsGapManagerView"
import { LlmsTxtView } from "./views/LlmsTxtView"
import { MetaAiView } from "./views/MetaAiView"
import { PublishedVerifierView } from "./views/PublishedVerifierView"
import { SchemaView } from "./views/SchemaView"
import { SettingsView } from "./views/SettingsView"

framer.showUI({
  position: "top right",
  width: 320,
  height: 540,
  resizable: true,
  minWidth: 300,
  minHeight: 460,
  maxWidth: 480,
})

/** Re-export the stack-managed route type for any view that types its own props. */
export type { ToolRoute } from "./lib/routeStack"

/**
 * Route stack so navigation is depth-aware. The Dashboard is the implicit
 * empty state at the bottom of the stack; pushing "schema" or "settings"
 * onto the stack drills in, and `onBack` pops the top entry.
 */
function AppRoutes() {
  const [stack, setStack] = useState<ToolRoute[]>([])
  const [showShortcuts, setShowShortcuts] = useState(false)
  const schemaAuditSessionRef = useRef<SchemaAuditSession | null>(null)
  const persistSchemaAuditSession = useCallback(
    (session: SchemaAuditSession | null) => {
      schemaAuditSessionRef.current = session
    },
    [],
  )

  useKeyboardShortcut("?", () => setShowShortcuts(true))

  const push = useCallback((route: ToolRoute) => {
    setStack((prev) => pushRoute(prev, route))
  }, [])

  const pop = useCallback(() => {
    setStack((prev) => popRoute(prev))
  }, [])

  const openSettings = useCallback(() => push("settings"), [push])

  const top = topOf(stack)

  return (
    <main className="pa-app">
      {top === null ? (
        <Dashboard
          onOpen={push}
          onOpenSettings={openSettings}
          onOpenShortcuts={() => setShowShortcuts(true)}
        />
      ) : top === "control" ? (
        <AeoControlCenterView
          onBack={pop}
          onOpenSettings={openSettings}
          onOpen={push}
        />
      ) : top === "cms" ? (
        <CmsGapManagerView onBack={pop} onOpenSettings={openSettings} />
      ) : top === "schema" ? (
        <SchemaView
          onBack={pop}
          onOpenSettings={openSettings}
          restoredAuditSession={schemaAuditSessionRef.current}
          onPersistAuditSession={persistSchemaAuditSession}
        />
      ) : top === "llms" ? (
        <LlmsTxtView onBack={pop} onOpenSettings={openSettings} />
      ) : top === "meta" ? (
        <MetaAiView onBack={pop} onOpenSettings={openSettings} />
      ) : top === "verify" ? (
        <PublishedVerifierView onBack={pop} onOpenSettings={openSettings} />
      ) : (
        <SettingsView onBack={pop} />
      )}
      <KeyboardOverlay
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </main>
  )
}

export function App() {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(
    null,
  )
  const [checkoutUrl, setCheckoutUrl] = useState(
    "https://polyglotaeo.com/pricing",
  )

  const onUpgradeRequest = useCallback(
    (reason: UpgradeReason, url: string) => {
      setUpgradeReason(reason)
      setCheckoutUrl(url)
      setUpgradeOpen(true)
    },
    [],
  )

  return (
    <EntitlementProvider onUpgradeRequest={onUpgradeRequest}>
      <AppRoutes />
      <UpgradeModal
        open={upgradeOpen}
        reason={upgradeReason}
        checkoutUrl={checkoutUrl}
        onClose={() => setUpgradeOpen(false)}
      />
    </EntitlementProvider>
  )
}
