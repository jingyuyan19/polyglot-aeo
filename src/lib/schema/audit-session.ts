import type { UntranslatedCell } from "../ai/schema-scan"
import type { LocalizedOverrides } from "../framer/bulk-install"
import type { InstallSnapshot } from "../framer/snapshot"
import type { SiteMap } from "../framer/site-scan"
import type { SchemaProposal } from "./proposal"

/**
 * In-memory audit workspace for the current plugin panel session.
 * Too large for Framer's 4 KB plugin-data budget — kept in App state
 * and restored when the user returns to Schema audit (Dashboard,
 * Settings, or Back) without closing the panel.
 */
export interface SchemaAuditSession {
  siteMap: SiteMap
  proposals: SchemaProposal[]
  untranslated: UntranslatedCell[]
  lastTranslations: LocalizedOverrides
  installUndo: {
    headEndRaw: string | null
    snapshot: InstallSnapshot | null
    untranslated: UntranslatedCell[]
    lastTranslations: LocalizedOverrides
  } | null
  filterQuery: string
  filterStatus: string
}

export function isRestorableAuditSession(
  session: SchemaAuditSession | null | undefined,
): session is SchemaAuditSession {
  return Boolean(session?.siteMap && session.proposals.length > 0)
}

export function buildAuditSessionSnapshot(input: {
  siteMap: SiteMap | null
  proposals: SchemaProposal[]
  untranslated: UntranslatedCell[]
  lastTranslations: LocalizedOverrides
  installUndo: SchemaAuditSession["installUndo"]
  filterQuery: string
  filterStatus: string
}): SchemaAuditSession | null {
  if (!input.siteMap || input.proposals.length === 0) return null
  return {
    siteMap: input.siteMap,
    proposals: input.proposals,
    untranslated: input.untranslated,
    lastTranslations: input.lastTranslations,
    installUndo: input.installUndo,
    filterQuery: input.filterQuery,
    filterStatus: input.filterStatus,
  }
}
