import { useState } from "react"

import type { SchemaAuditSession } from "../lib/schema/audit-session"
import { SchemaAuditView } from "./SchemaAuditView"
import { SchemaManualView } from "./SchemaManualView"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onOpenOnboarding?: () => void
  restoredAuditSession: SchemaAuditSession | null
  onPersistAuditSession: (session: SchemaAuditSession | null) => void
}

type Mode = "audit" | "manual"

/**
 * Schema feature router. Defaults to AI audit (the headline experience). The
 * legacy form-based "manual" mode is reachable from the audit view's link
 * and exists for power users who need surgical control or to add schema
 * kinds the auditor doesn't propose.
 *
 * Mode is local React state — we deliberately don't persist it. Every plugin
 * open lands users in the AI flow first. The manual link is one click away
 * for those who prefer it.
 */
export function SchemaView({
  onBack,
  onOpenSettings,
  onOpenOnboarding,
  restoredAuditSession,
  onPersistAuditSession,
}: Props) {
  const [mode, setMode] = useState<Mode>("audit")

  if (mode === "manual") {
    return (
      <SchemaManualView
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        onOpenOnboarding={onOpenOnboarding}
        onSwitchToAudit={() => setMode("audit")}
      />
    )
  }
  return (
    <SchemaAuditView
      onBack={onBack}
      onOpenSettings={onOpenSettings}
      onOpenOnboarding={onOpenOnboarding}
      onSwitchToManual={() => setMode("manual")}
      restoredSession={restoredAuditSession}
      onPersistSession={onPersistAuditSession}
    />
  )
}
