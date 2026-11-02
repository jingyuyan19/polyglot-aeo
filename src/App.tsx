import { framer } from "framer-plugin"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react"

import type { SchemaAuditSession } from "./lib/schema/audit-session"
import type { MetaWizardSession } from "./views/meta/types"

import { EntitlementProvider } from "./components/EntitlementProvider"
import { KeyboardOverlay } from "./components/KeyboardOverlay"
import { UpgradeModal } from "./components/UpgradeModal"
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut"
import type { CheckoutPlanUrls, UpgradeReason } from "./lib/license/types"
import { popRoute, pushRoute, topOf, type ToolRoute } from "./lib/routeStack"
import { readString, StorageKeys } from "./lib/storage"
import { Dashboard } from "./views/Dashboard"
import { AeoControlCenterView } from "./views/AeoControlCenterView"
import { CmsGapManagerView } from "./views/CmsGapManagerView"
import { LlmsTxtView } from "./views/LlmsTxtView"
import { MetaAiView } from "./views/MetaAiView"
import { OnboardingWizardView } from "./views/OnboardingWizardView"
import {
  PublishedVerifierView,
  type PublishedVerifierSession,
} from "./views/PublishedVerifierView"
import { SchemaView } from "./views/SchemaView"
import { SettingsView } from "./views/SettingsView"

framer.showUI({
  position: "top right",
  width: 360,
  height: 580,
  resizable: true,
  minWidth: 300,
  minHeight: 460,
  maxWidth: 480,
})

/** Re-export the stack-managed route type for any view that types its own props. */
export type { ToolRoute } from "./lib/routeStack"

function renderToolView(
  top: ToolRoute,
  ctx: {
    pop: () => void
    push: (route: ToolRoute) => void
    openSettings: () => void
    openOnboarding: (review?: boolean) => void
    schemaAuditSessionRef: MutableRefObject<SchemaAuditSession | null>
    persistSchemaAuditSession: (session: SchemaAuditSession | null) => void
    metaWizardSessionRef: MutableRefObject<MetaWizardSession | null>
    persistMetaWizardSession: (session: MetaWizardSession | null) => void
    publishedVerifierSessionRef: MutableRefObject<PublishedVerifierSession | null>
    persistPublishedVerifierSession: (
      session: PublishedVerifierSession | null,
    ) => void
  },
) {
  const {
    pop,
    push,
    openSettings,
    openOnboarding,
    schemaAuditSessionRef,
    persistSchemaAuditSession,
    metaWizardSessionRef,
    persistMetaWizardSession,
    publishedVerifierSessionRef,
    persistPublishedVerifierSession,
  } = ctx

  switch (top) {
    case "control":
      return (
        <AeoControlCenterView
          onBack={pop}
          onOpenSettings={openSettings}
          onOpenOnboarding={() => openOnboarding(true)}
          onOpen={push}
        />
      )
    case "cms":
      return (
        <CmsGapManagerView
          onBack={pop}
          onOpenSettings={openSettings}
          onOpenOnboarding={() => openOnboarding(true)}
        />
      )
    case "schema":
      return (
        <SchemaView
          onBack={pop}
          onOpenSettings={openSettings}
          onOpenOnboarding={() => openOnboarding(true)}
          restoredAuditSession={schemaAuditSessionRef.current}
          onPersistAuditSession={persistSchemaAuditSession}
        />
      )
    case "llms":
      return (
        <LlmsTxtView
          onBack={pop}
          onOpenSettings={openSettings}
          onOpenOnboarding={() => openOnboarding(true)}
        />
      )
    case "meta":
      return (
        <MetaAiView
          onBack={pop}
          onOpenSettings={openSettings}
          onOpenOnboarding={() => openOnboarding(true)}
          restoredSession={metaWizardSessionRef.current}
          onPersistSession={persistMetaWizardSession}
        />
      )
    case "verify":
      return (
        <PublishedVerifierView
          onBack={pop}
          onOpen={push}
          onOpenSettings={openSettings}
          onOpenOnboarding={() => openOnboarding(true)}
          restoredSession={publishedVerifierSessionRef.current}
          onPersistSession={persistPublishedVerifierSession}
        />
      )
    case "settings":
      return <SettingsView onBack={pop} />
  }
}

/**
 * Route stack for tool views. The Dashboard is the implicit empty-stack state.
 * Onboarding is a centered modal overlay (not a stack route).
 */
interface AppRoutesProps {
  upgradeOpen: boolean
}

function AppRoutes({ upgradeOpen }: AppRoutesProps) {
  const [stack, setStack] = useState<ToolRoute[]>([])
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardReviewMode, setWizardReviewMode] = useState(true)
  const autoWizardChecked = useRef(false)
  const schemaAuditSessionRef = useRef<SchemaAuditSession | null>(null)
  const persistSchemaAuditSession = useCallback(
    (session: SchemaAuditSession | null) => {
      schemaAuditSessionRef.current = session
    },
    [],
  )
  const metaWizardSessionRef = useRef<MetaWizardSession | null>(null)
  const persistMetaWizardSession = useCallback(
    (session: MetaWizardSession | null) => {
      metaWizardSessionRef.current = session
    },
    [],
  )
  const publishedVerifierSessionRef = useRef<PublishedVerifierSession | null>(
    null,
  )
  const persistPublishedVerifierSession = useCallback(
    (session: PublishedVerifierSession | null) => {
      publishedVerifierSessionRef.current = session
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

  const openOnboarding = useCallback((review = true) => {
    setWizardReviewMode(review)
    setWizardOpen(true)
  }, [])

  const closeOnboarding = useCallback(() => {
    setWizardOpen(false)
  }, [])

  useEffect(() => {
    if (autoWizardChecked.current) return
    autoWizardChecked.current = true
    void (async () => {
      const [completed, skipped] = await Promise.all([
        readString(StorageKeys.OnboardingWizardCompleted),
        readString(StorageKeys.OnboardingWizardSkippedAll),
      ])
      if (completed === "true" || skipped === "true") return
      setWizardReviewMode(false)
      setWizardOpen(true)
    })()
  }, [])

  const modalBackdropOpen = wizardOpen || showShortcuts || upgradeOpen

  const top = topOf(stack)
  const toolCtx = {
    pop,
    push,
    openSettings,
    openOnboarding,
    schemaAuditSessionRef,
    persistSchemaAuditSession,
    metaWizardSessionRef,
    persistMetaWizardSession,
    publishedVerifierSessionRef,
    persistPublishedVerifierSession,
  }

  return (
    <main className="pa-app">
      <div
        className="pa-app-main"
        data-modal-open={modalBackdropOpen ? "" : undefined}
        aria-hidden={modalBackdropOpen || undefined}
      >
        {top === null ? (
          <Dashboard
            onOpen={push}
            onOpenSettings={openSettings}
            onOpenOnboarding={() => openOnboarding(true)}
            onOpenShortcuts={() => setShowShortcuts(true)}
          />
        ) : (
          renderToolView(top, toolCtx)
        )}
      </div>
      {wizardOpen && (
        <OnboardingWizardView
          onClose={closeOnboarding}
          reviewMode={wizardReviewMode}
          onOpenSettings={() => {
            setWizardOpen(false)
            openSettings()
          }}
        />
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
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null)
  const [checkoutUrls, setCheckoutUrls] = useState<CheckoutPlanUrls>({
    monthly: "https://polyglotaeo.com/pricing",
    yearly: "https://polyglotaeo.com/pricing",
  })

  const onUpgradeRequest = useCallback(
    (reason: UpgradeReason, urls: CheckoutPlanUrls) => {
      setUpgradeReason(reason)
      setCheckoutUrls(urls)
      setUpgradeOpen(true)
    },
    [],
  )

  return (
    <EntitlementProvider onUpgradeRequest={onUpgradeRequest}>
      <AppRoutes upgradeOpen={upgradeOpen} />
      <UpgradeModal
        open={upgradeOpen}
        reason={upgradeReason}
        checkoutUrls={checkoutUrls}
        onClose={() => setUpgradeOpen(false)}
      />
    </EntitlementProvider>
  )
}
