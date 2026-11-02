import { framer } from "framer-plugin"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"

import { useFeatureGate } from "../components/entitlement-hooks"
import { CopyIconButton } from "../components/CopyIconButton"
import { HelpIcon } from "../components/HelpIcon"
import { SchemaIcon, VerifyIcon } from "../components/icons"
import { ProposalEditor } from "../components/ProposalEditor"
import { SiteIdentityCard } from "../components/SiteIdentityCard"
import { TopBar } from "../components/TopBar"
import { useLocales } from "../hooks/useLocales"
import { useI18n, type TranslationKey } from "../i18n"
import {
  readCustomProviders,
  readProviderKey,
  resolveInitialProvider,
  type ProviderId,
} from "../lib/ai/client"
import { isManagedProviderId } from "../lib/ai/managed"
import {
  BUILTIN_PROVIDERS,
  materializeCustomProvider,
  type CustomProviderConfig,
  type Provider,
} from "../lib/ai/providers"
import {
  deriveSiteIdentity,
  translateSiteIdentity,
} from "../lib/ai/identity-scan"
import {
  orchestrateScan,
  orchestrateTranslate,
  type AiCredentials,
  type UntranslatedCell,
  type UntranslatedReason,
} from "../lib/ai/schema-scan"
import {
  bulkInstall,
  type LocalizedOverrides,
} from "../lib/framer/bulk-install"
import {
  readHeadEndRaw,
  readInstalledStatus,
  restoreHeadEndRaw,
} from "../lib/framer/customCode"
import {
  getAllLocales,
  localeFlagEmoji,
  type LocaleInfo,
} from "../lib/framer/locales"
import { hashPageContent, scanSite, type SiteMap } from "../lib/framer/site-scan"
import {
  buildSnapshot,
  deriveInstallButtonState,
  diffAgainstSnapshot,
  reconcileSnapshot,
  type InstallSnapshot,
  type SnapshotDiff,
} from "../lib/framer/snapshot"
import {
  hostnameFallbackIdentity,
  mergeIdentityTranslations,
  pickIdentityTranslationTargets,
  type SiteIdentity,
  type SiteIdentityTranslations,
} from "../lib/schema/identity"
import {
  buildAuditSessionSnapshot,
  isRestorableAuditSession,
  type SchemaAuditSession,
} from "../lib/schema/audit-session"
import { isEditedFromOriginal } from "../lib/schema/proposal-edit"
import type { SchemaProposal } from "../lib/schema/proposal"
import {
  proposalToJsonLd,
  schemaInputToJsonLd,
  schemaPrimaryText,
} from "../lib/schema/proposal"
import type { SchemaInput } from "../lib/schema/types"
import {
  countDistinctInstallPages,
  FREE_SCHEMA_INSTALL_PAGE_LIMIT,
} from "../lib/license/entitlements"
import { readJson, readString, StorageKeys, writeJson, writeString } from "../lib/storage"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onOpenOnboarding?: () => void
  onSwitchToManual: () => void
  /** App-level session cache — restored after Back / Settings within one panel open. */
  restoredSession: SchemaAuditSession | null
  onPersistSession: (session: SchemaAuditSession | null) => void
}

/** Drives scroll + preview expansion when jumping from Translation health. */
type FocusIssue = { pageId: string; localeCode: string }

type ProposalFilterStatus =
  | "all"
  | "new"
  | "changed"
  | "disabled"
  | "needs-retranslate"

/**
 * Resolve the site identity for the current scan, using the cached
 * value when the source pages haven't changed and the user hasn't
 * taken ownership of the identity. Always returns a usable
 * `SiteIdentity` (worst case: hostname fallback).
 *
 * Called from `handleScan` so the result drives:
 *   - The identity card UI (immediately).
 *   - Phase 0.5 (when refreshed → re-translate).
 *   - bulkInstall (publisher/author injection at render time).
 *
 * `refreshed: true` ⇒ caller should re-run Phase 0.5 + persist.
 * `refreshed: false` ⇒ identity reused unchanged from the cache;
 * existing translations stay valid.
 */
async function ensureSiteIdentity(params: {
  siteMap: SiteMap
  ai: AiCredentials
  cached: { identity: SiteIdentity | null; hash: string | null }
  onPhase0Start: () => void
  onPhase0End: () => void
}): Promise<{
  identity: SiteIdentity
  sourceHash: string
  refreshed: boolean
}> {
  const { siteMap, ai, cached, onPhase0Start, onPhase0End } = params

  // User-edited identities are sacred — they win even when the
  // page content changes. The user took explicit ownership; we
  // never auto-overwrite. Compute the current hash so the caller
  // still has a fresh staleness anchor.
  if (cached.identity?.source === "user-edit") {
    const fallback = hostnameFallbackIdentity(safeHostname(siteMap.baseUrl))
    void fallback // avoid unused warning if compiler narrows it
    return {
      identity: cached.identity,
      sourceHash: cached.hash ?? "",
      refreshed: false,
    }
  }

  onPhase0Start()
  try {
    const result = await deriveSiteIdentity(siteMap, ai)
    // If the cached result is byte-equivalent (same source pages,
    // same brand/author), keep the cached object reference to avoid
    // a useless re-render and re-persist.
    if (
      cached.identity &&
      cached.hash === result.sourceHash &&
      cached.identity.brandName === result.identity.brandName &&
      cached.identity.defaultAuthor === result.identity.defaultAuthor
    ) {
      return {
        identity: cached.identity,
        sourceHash: result.sourceHash,
        refreshed: false,
      }
    }
    return { ...result, refreshed: true }
  } finally {
    onPhase0End()
  }
}

function safeHostname(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname || null
  } catch {
    return null
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`
}

function normalizeProgressLabel(
  label: string,
  fallback: string,
  homepage: string,
): string {
  const trimmed = label.trim()
  if (!trimmed) return fallback
  if (trimmed === "/" || trimmed.toLowerCase() === "home") return homepage
  try {
    const url = new URL(trimmed)
    return url.pathname === "/" ? homepage : url.pathname
  } catch {
    return trimmed
  }
}

function confidenceTone(
  confidencePct: number,
): "success" | "accent" | "warning" | undefined {
  if (confidencePct >= 85) return "success"
  if (confidencePct >= 70) return "accent"
  if (confidencePct >= 40) return "warning"
  return undefined
}

type Phase =
  | { kind: "idle" }
  | { kind: "scanning-site"; startedAt: number }
  | {
      kind: "scanning-ai"
      current: number
      total: number
      label: string
      startedAt: number
    }
  | {
      kind: "translating"
      current: number
      total: number
      label: string
      startedAt: number
    }
  | { kind: "installing" }

/**
 * AI-driven audit flow: scan → propose → review → install.
 *
 * State machine:
 *   idle ──[Scan]──► scanning-site ──► scanning-ai ──► (translate?) ──► review
 *   review ──[Install]──► installing ──► review (with snapshot updated)
 *   review ──[Re-scan]──► scanning-site (preserves snapshot for diff)
 */
export function SchemaAuditView({
  onBack,
  onOpenSettings,
  onOpenOnboarding,
  onSwitchToManual,
  restoredSession,
  onPersistSession,
}: Props) {
  const { t, locale: uiLocale } = useI18n()
  void uiLocale
  const { locales } = useLocales()
  const gate = useFeatureGate()
  const initial = isRestorableAuditSession(restoredSession)
    ? restoredSession
    : null
  const [siteMap, setSiteMap] = useState<SiteMap | null>(
    () => initial?.siteMap ?? null,
  )
  const [proposals, setProposals] = useState<SchemaProposal[]>(
    () => initial?.proposals ?? [],
  )
  const [snapshot, setSnapshot] = useState<InstallSnapshot | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const [nowMs, setNowMs] = useState(() => Date.now())
  const progressPanelRef = useRef<HTMLElement | null>(null)
  // Which proposal is currently retrying its translations. Drives the
  // inline "Translating…" affordance on that card. We need this in
  // addition to the global `phase` because all cards otherwise share
  // the `isWorking` flag and the user has no way to know which card
  // their click is acting on — the per-card click feels frozen.
  // `null` ⇒ no per-card retry in flight.
  const [retryingPageId, setRetryingPageId] = useState<string | null>(null)
  const [translateContent, setTranslateContent] = useState(true)
  // Cells that the most recent install couldn't translate cleanly.
  // Surfaced as per-card pills + a footer "Re-translate" affordance.
  const [untranslated, setUntranslated] = useState<UntranslatedCell[]>(
    () => initial?.untranslated ?? [],
  )
  // Last install's `LocalizedOverrides` kept in memory so a partial
  // re-translate can merge new translations onto the existing ones
  // without re-paying for the cells that already worked. Survives
  // navigation within the same plugin panel via App session cache.
  const [lastTranslations, setLastTranslations] = useState<LocalizedOverrides>(
    () => initial?.lastTranslations ?? {},
  )

  /**
   * One-step undo for the most recent install (or re-install after
   * retry). Kept in memory so the install toast can prioritize a
   * "Re-translate" button when some cells failed, while Undo still
   * lives in the Translation health panel below.
   */
  const [installUndo, setInstallUndo] = useState<{
    headEndRaw: string | null
    snapshot: InstallSnapshot | null
    untranslated: UntranslatedCell[]
    lastTranslations: LocalizedOverrides
  } | null>(() => initial?.installUndo ?? null)

  // V2 site identity. Persists across plugin reloads (small, ~250 B
  // for identity + ~250 B per locale translation). Drives Article
  // publisher/author and Organization name/url/logo at render time.
  // `null` until the first scan runs Phase 0; after that, never null
  // (we always synthesise a hostname fallback if the AI failed).
  const [identity, setIdentity] = useState<SiteIdentity | null>(null)
  const [identityTranslations, setIdentityTranslations] =
    useState<SiteIdentityTranslations>({})
  // Hash of the pages used to derive the cached identity. On re-scan
  // we compare against `siteMap`'s identity inputs and skip Phase
  // 0/0.5 when they match (saves an AI call per re-scan).
  const [identityHash, setIdentityHash] = useState<string | null>(null)
  // True while Phase 0 (deriveSiteIdentity) is running. The identity
  // card surfaces a skeleton-with-spinner during this window so the
  // user understands "AI is figuring out my brand" rather than "the
  // card is silently stuck".
  const [identityDeriving, setIdentityDeriving] = useState(false)

  // Provider selection — same pattern as MetaAiView.
  const [providerId, setProviderId] = useState<ProviderId>("openai")
  const [modelId, setModelId] = useState<string>("")
  const [hasApiKey, setHasApiKey] = useState(false)
  const [customConfigs, setCustomConfigs] = useState<CustomProviderConfig[]>([])

  const allProviders: Provider[] = useMemo(
    () => [
      ...BUILTIN_PROVIDERS,
      ...customConfigs.map((c) => materializeCustomProvider(c)),
    ],
    [customConfigs],
  )
  const currentProvider = useMemo(
    () => allProviders.find((p) => p.id === providerId) ?? allProviders[0],
    [allProviders, providerId],
  )
  const currentModel = useMemo(
    () =>
      currentProvider.models.find((m) => m.id === modelId) ??
      currentProvider.models[0],
    [currentProvider, modelId],
  )

  // Restore persisted state on mount.
  //
  // Framer's plugin data store has TWO hard limits:
  //   - 2 KB per key  (worked around earlier by transparent chunking)
  //   - 4 KB combined per node  (cannot be worked around)
  //
  // A 7-page site map with body text samples is ~14 KB on its own; a
  // 32-proposal list with `originalInputs` is another 10–20 KB. Either
  // alone exceeds the combined budget, so persisting them is impossible.
  // We instead persist ONLY:
  //   - InstallSnapshot      → small, drives "Last installed" UI + diff
  //   - User preferences     → tiny
  //
  // AuditUntranslated is INTENTIONALLY NOT persisted (since rN). It's
  // a derivative of `proposals`, which are session-only by necessity
  // (4 KB budget). After a reload the retry button can't act on those
  // cells without a freshly-scanned proposal/siteMap pair, so a panel
  // backed only by persisted untranslated data was a dead UI: visible
  // count, dead button, mounting confusion when paired with snapshot
  // drift. We let it live and die with the in-memory proposals set.
  //
  // Re-opening the plugin (panel closed) shows an empty proposal list and
  // a snapshot summary; the user clicks "Re-scan" to rebuild proposals.
  // Returning from Dashboard/Settings within the same panel session
  // restores proposals from App-level `restoredSession` instead.
  // The snapshot's pageHashes still let us flag pages whose content
  // changed since the last install.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Best-effort migration: nuke the previous "we used to persist
      // this" keys to release combined-budget bytes for callers that
      // arrive after an older build. Failure is silent — these keys
      // will simply linger and cost a few hundred bytes.
      void writeJson(StorageKeys.LastSiteMap, null).catch(() => {})
      void writeJson(StorageKeys.LastProposals, null).catch(() => {})
      // AuditUntranslated is no longer persisted (see comment above).
      // Strip any old payload so the panel doesn't render with stale
      // counts on the very next mount — and so the bytes get freed
      // back to the 4 KB combined budget.
      void writeJson(StorageKeys.AuditUntranslated, null).catch(() => {})
      // V2: OrganizationDefaults was reserved-but-unused in V1 and
      // is fully replaced by the Identity bundle. Free the bytes.
      void writeJson(StorageKeys.OrganizationDefaults, null).catch(() => {})
      // Earlier Pro builds attempted to persist a compact workspace,
      // but in practice it duplicated install snapshot data and could
      // still push Framer's combined plugin-data budget over 4 KB.
      void writeJson(StorageKeys.AuditWorkspacePersist, null).catch(() => {})
      void writeJson(StorageKeys.LastSchemaSnapshot, null).catch(() => {})

      const [
        persistedSnapshot,
        prefProvider,
        prefModel,
        customs,
        translatePref,
        persistedIdentity,
        persistedIdentityTranslations,
        persistedIdentityHash,
      ] = await Promise.all([
        readJson<InstallSnapshot | null>(StorageKeys.InstallSnapshot, null),
        readString(StorageKeys.PreferredProvider),
        readString(StorageKeys.PreferredModel),
        readCustomProviders(),
        readString(StorageKeys.ScanTranslateContent),
        readJson<SiteIdentity | null>(StorageKeys.Identity, null),
        readJson<SiteIdentityTranslations>(
          StorageKeys.IdentityTranslations,
          {},
        ),
        readString(StorageKeys.IdentitySourceHash),
      ])
      if (cancelled) return

      // Hydrate identity state. Missing identity is normal on first
      // run; a hostname fallback is synthesised lazily inside
      // `handleScan` once we know the project's baseUrl. We DO NOT
      // pre-fill from `framer.getPublishInfo()` here because that's
      // an SDK call that costs time on every plugin open and the
      // empty card render is fine until the user scans.
      if (persistedIdentity) {
        setIdentity(persistedIdentity)
        setIdentityTranslations(persistedIdentityTranslations)
        setIdentityHash(persistedIdentityHash ?? null)
      }

      // Reconcile the persisted snapshot against actual Custom Code.
      // The user can wipe `<head>`-end content from Framer's UI
      // independently of the plugin; without this check we'd render
      // "Installed" pills and a "Last installed N blocks" card for
      // schema that no longer lives on the published site. We notify
      // when drift is detected so the user understands why the badges
      // disappeared (silently dropping them looks like a bug).
      if (persistedSnapshot) {
        try {
          const status = await readInstalledStatus()
          if (cancelled) return
          const reconciled = reconcileSnapshot(
            persistedSnapshot,
            status.installed,
          )
          setSnapshot(reconciled.snapshot)
          if (reconciled.drift) {
            void writeJson(StorageKeys.InstallSnapshot, null)
            framer.notify(t("schema.audit.snapshotResetByDrift"), {
              variant: "info",
              durationMs: 6000,
            })
          }
        } catch {
          // Permission denied or transient SDK error — fall back to
          // trusting the persisted snapshot. Worst case the user sees
          // stale "Installed" pills until next install/scan; better
          // than crashing the audit on mount.
          setSnapshot(persistedSnapshot)
        }
      } else {
        setSnapshot(null)
      }
      // `untranslated` intentionally starts empty — see the persistence
      // comment above. Each fresh scan repopulates it.
      setCustomConfigs(customs)
      if (prefModel) setModelId(prefModel)
      if (translatePref !== null) {
        setTranslateContent(translatePref === "1")
      }

      // Resolve the initial provider AFTER customs load, so user-defined
      // providers participate in the "first configured" search. If the
      // user has a managed provider available, we pick that provider so the
      // unavailable-warning does not appear on first load.
      const candidates: ProviderId[] = [
        ...BUILTIN_PROVIDERS.map((p) => p.id),
        ...customs.map((c) => c.id),
      ]
      const chosen = await resolveInitialProvider(
        (prefProvider as ProviderId | null) ?? null,
        candidates,
        "openai",
        readProviderKey,
      )
      if (cancelled) return
      setProviderId(chosen)
    })()
    return () => {
      cancelled = true
    }
    // `t` is intentionally omitted — the mount effect runs once and
    // captures whatever locale is active at boot. The drift toast
    // only fires when reconciliation surfaces an inconsistency, and
    // re-running this entire effect on every locale change would
    // re-issue API calls and re-load preferences, which is far worse
    // than a one-frame stale toast string for users who change their
    // UI language between launching and the (rare) first toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (
      phase.kind !== "scanning-site" &&
      phase.kind !== "scanning-ai" &&
      phase.kind !== "translating"
    ) {
      return
    }
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [phase.kind])

  useEffect(() => {
    if (
      phase.kind !== "scanning-site" &&
      phase.kind !== "scanning-ai" &&
      phase.kind !== "translating"
    ) {
      return
    }
    const frame = requestAnimationFrame(() => {
      progressPanelRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [phase.kind])

  // Re-check API-key presence whenever provider changes.
  useEffect(() => {
    let cancelled = false
    void readProviderKey(providerId).then((key) => {
      if (cancelled) return
      setHasApiKey(Boolean(key))
    })
    return () => {
      cancelled = true
    }
  }, [providerId])

  // Snap modelId to the current provider's first model when out of sync.
  useEffect(() => {
    if (
      currentProvider &&
      !currentProvider.models.some((m) => m.id === modelId)
    ) {
      setModelId(currentProvider.models[0].id)
    }
  }, [currentProvider, modelId])

  // Persist ONLY the small, durable state. siteMap (14+ KB) and
  // proposals (10–20 KB) cannot fit in Framer's 4 KB combined plugin
  // data budget, so we keep them in memory only — re-opening the
  // plugin shows the snapshot card (durable) and an empty proposal
  // list until the user clicks "Re-scan".
  //
  // `untranslated` is also session-only: it's a derivative of
  // `proposals`, and the retry button can't act on it without that
  // ephemeral co-data. Persisting it would resurrect a dead panel on
  // reload (see mount-effect comment), so we skip the write.
  useEffect(() => {
    void writeJson(StorageKeys.InstallSnapshot, snapshot)
  }, [snapshot])

  const enabledProposals = useMemo(
    () => proposals.filter((p) => p.enabled),
    [proposals],
  )

  /**
   * Lookup: pageId → locale code → failure reason. ProposalCard uses
   * this in the preview panel to explain *why* ja failed, not just
   * that it failed.
   */
  const untranslatedByPageId = useMemo(() => {
    const out: Record<string, Record<string, UntranslatedReason>> = {}
    for (const cell of untranslated) {
      ;(out[cell.pageId] ??= {})[cell.localeCode] = cell.reason
    }
    return out
  }, [untranslated])

  // ────────────────────────────────────────────────────────────────────
  // Filter / search state
  //
  // Only surfaced when the audit list has ≥ 6 proposals; below that
  // the filter UI is more noise than signal. Filters apply purely
  // client-side and don't mutate the underlying proposal array — that
  // way "Enable all" / "Disable all" continue to operate on the full
  // set, which matches user intent.
  // ────────────────────────────────────────────────────────────────────
  const [filterQuery, setFilterQuery] = useState(
    () => initial?.filterQuery ?? "",
  )
  const [filterStatus, setFilterStatus] = useState<ProposalFilterStatus>(
    () =>
      (initial?.filterStatus as ProposalFilterStatus | undefined) ?? "all",
  )

  // Diff vs last snapshot — drives the per-proposal status badges.
  const diff: SnapshotDiff | null = useMemo(() => {
    if (!siteMap) return null
    return diffAgainstSnapshot(siteMap, snapshot, hashPageContent)
  }, [siteMap, snapshot])

  const diffByPageId = useMemo(() => {
    const map: Record<string, "new" | "changed" | "unchanged"> = {}
    if (!diff) return map
    for (const p of diff.added) map[p.id] = "new"
    for (const p of diff.changed) map[p.id] = "changed"
    for (const p of diff.unchanged) map[p.id] = "unchanged"
    return map
  }, [diff])

  const [editingPageId, setEditingPageId] = useState<string | null>(null)

  const filteredProposals = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    return proposals.filter((p) => {
      if (q) {
        const haystack = `${p.url} ${p.pageLabel ?? ""}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (filterStatus === "all") return true
      if (filterStatus === "disabled") return !p.enabled
      if (filterStatus === "needs-retranslate") {
        return Boolean(untranslatedByPageId[p.pageId])
      }
      return diffByPageId[p.pageId] === filterStatus
    })
  }, [
    proposals,
    filterQuery,
    filterStatus,
    diffByPageId,
    untranslatedByPageId,
  ])

  const showProposalFilters =
    proposals.length >= 6 || untranslated.length > 0

  const proposalFilterSegments = useMemo((): ProposalFilterStatus[] => {
    const base: ProposalFilterStatus[] = [
      "all",
      "new",
      "changed",
      "disabled",
    ]
    if (untranslated.length > 0) {
      return ["all", "needs-retranslate", ...base.slice(1)]
    }
    return base
  }, [untranslated.length])

  const proposalLabelByPageId = useMemo(() => {
    const out = new Map<string, string>()
    for (const p of proposals) {
      out.set(p.pageId, p.pageLabel?.trim() || p.url)
    }
    return out
  }, [proposals])

  /** Stable review queue: page list order, then project locale order. */
  const sortedUntranslated = useMemo(() => {
    const pageOrder = new Map(proposals.map((p, i) => [p.pageId, i]))
    const localeOrder = new Map(locales.map((l, i) => [l.code, i]))
    return [...untranslated].sort((a, b) => {
      const pa = pageOrder.get(a.pageId) ?? 9999
      const pb = pageOrder.get(b.pageId) ?? 9999
      if (pa !== pb) return pa - pb
      const la = localeOrder.get(a.localeCode) ?? 9999
      const lb = localeOrder.get(b.localeCode) ?? 9999
      return la - lb
    })
  }, [untranslated, proposals, locales])

  const [focusIssue, setFocusIssue] = useState<FocusIssue | null>(null)
  const [issueNavIndex, setIssueNavIndex] = useState(0)

  const focusUntranslatedCell = useCallback(
    (cell: UntranslatedCell, navIndex: number) => {
      setFilterQuery("")
      setFilterStatus("needs-retranslate")
      setIssueNavIndex(navIndex)
      setFocusIssue({ pageId: cell.pageId, localeCode: cell.localeCode })
    },
    [],
  )

  const handleNextIssue = useCallback(() => {
    if (sortedUntranslated.length === 0) return
    const nextIndex = (issueNavIndex + 1) % sortedUntranslated.length
    focusUntranslatedCell(sortedUntranslated[nextIndex], nextIndex)
  }, [sortedUntranslated, issueNavIndex, focusUntranslatedCell])

  useEffect(() => {
    if (!focusIssue) return
    const id = `audit-card-${focusIssue.pageId}`
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusIssue, filteredProposals])

  useEffect(() => {
    if (untranslated.length === 0) {
      setFocusIssue(null)
      setIssueNavIndex(0)
    }
  }, [untranslated.length])

  useEffect(() => {
    if (
      untranslated.length === 0 &&
      filterStatus === "needs-retranslate"
    ) {
      setFilterStatus("all")
    }
  }, [untranslated.length, filterStatus])

  useEffect(() => {
    if (
      issueNavIndex >= sortedUntranslated.length &&
      sortedUntranslated.length > 0
    ) {
      setIssueNavIndex(sortedUntranslated.length - 1)
    }
  }, [issueNavIndex, sortedUntranslated.length])

  const auditSessionPersistRef = useRef({
    siteMap,
    proposals,
    untranslated,
    lastTranslations,
    installUndo,
    filterQuery,
    filterStatus,
  })
  useEffect(() => {
    auditSessionPersistRef.current = {
      siteMap,
      proposals,
      untranslated,
      lastTranslations,
      installUndo,
      filterQuery,
      filterStatus,
    }
  })

  useEffect(() => {
    return () => {
      onPersistSession(
        buildAuditSessionSnapshot(auditSessionPersistRef.current),
      )
    }
  }, [onPersistSession])

  // ────────────────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────────────────

  // Free users would otherwise run a full scan that ends in 0%-confidence
  // proposals because managed AI refuses them; ask for Pro up front instead.
  const needsProForScan = isManagedProviderId(providerId) && !gate.isPro

  const handleScan = async () => {
    if (!hasApiKey) {
      framer.notify(t("schema.audit.aiNeeded"), { variant: "warning" })
      return
    }
    if (needsProForScan && !gate.check("managed_ai")) return
    const apiKey = await readProviderKey(providerId)
    if (!apiKey) return

    void writeString(StorageKeys.PreferredProvider, providerId)
    void writeString(StorageKeys.PreferredModel, modelId)

    const ai: AiCredentials = {
      providerId,
      modelId,
      apiKey,
      customProvider: currentProvider.custom ? currentProvider : undefined,
    }

    const scanStartedAt = Date.now()
    setPhase({ kind: "scanning-site", startedAt: scanStartedAt })
    let map: SiteMap
    try {
      map = await scanSite()
    } catch (e) {
      framer.notify(
        t("schema.audit.scanFailed", { error: (e as Error).message }),
        { variant: "error" },
      )
      setPhase({ kind: "idle" })
      return
    }
    setSiteMap(map)

    // Reconcile snapshot against current Custom Code (again — the user
    // might have edited it AFTER the plugin opened). Doing this here
    // means the diff badges and install button shown post-scan reflect
    // the live install state, not whatever was on disk at mount.
    if (snapshot) {
      try {
        const status = await readInstalledStatus()
        const reconciled = reconcileSnapshot(snapshot, status.installed)
        if (reconciled.drift) {
          setSnapshot(null)
          void writeJson(StorageKeys.InstallSnapshot, null)
          framer.notify(t("schema.audit.snapshotResetByDrift"), {
            variant: "info",
            durationMs: 6000,
          })
        }
      } catch {
        // Same permission/transient policy as the mount path: keep
        // the snapshot rather than risking a false-positive reset.
      }
    }

    if (map.pages.length === 0) {
      framer.notify(t("schema.audit.scanEmpty"), { variant: "warning" })
      setPhase({ kind: "idle" })
      return
    }

    const allLocales = await getAllLocales()
    const defaultLocale = allLocales.find((l) => l.isDefault) ?? allLocales[0]
    if (!defaultLocale) {
      framer.notify(t("dashboard.localesEmpty"), { variant: "warning" })
      setPhase({ kind: "idle" })
      return
    }

    // V2 Phase 0 + 0.5: derive site identity, then localize it. We
    // resolve identity BEFORE the per-page scan so:
    //   1. Phase 0 typically runs only once across re-scans (cached
    //      by `identityHash`); subsequent scans skip it entirely.
    //   2. Phase 0.5 runs in parallel with Phase 1 for cold-path
    //      latency parity with V1 (no extra wall-clock cost).
    //   3. Identity is ready by the time orchestrateTranslate fires
    //      (Phase 2), so the per-page translation prompt's stripped
    //      identity fields (publisher.name, etc.) are seamlessly
    //      restored at render time from this identity.
    //
    // User-edited identities (`source === "user-edit"`) are NEVER
    // re-derived — the user explicitly took ownership.
    const targetLocales = allLocales.filter((l) => !l.isDefault)
    const identityResult = await ensureSiteIdentity({
      siteMap: map,
      ai,
      cached: { identity, hash: identityHash },
      onPhase0Start: () => setIdentityDeriving(true),
      onPhase0End: () => setIdentityDeriving(false),
    })
    const resolvedIdentity = identityResult.identity
    setIdentity(resolvedIdentity)
    setIdentityHash(identityResult.sourceHash)
    if (identityResult.refreshed) {
      void writeJson(StorageKeys.Identity, resolvedIdentity)
      void writeString(StorageKeys.IdentitySourceHash, identityResult.sourceHash)
    }

    // Run Phase 0.5 + Phase 1 in parallel. Each task isolates its
    // own failures: a flaky locale translation never blocks the
    // per-page audit from completing.
    setPhase({
      kind: "scanning-ai",
      current: 0,
      total: map.pages.length,
      label: "",
      startedAt: scanStartedAt,
    })

    const identityTranslationTargets = pickIdentityTranslationTargets(
      targetLocales,
      identityTranslations,
      identityResult.refreshed,
    )
    const phase05Promise =
      identityTranslationTargets.length > 0
        ? translateSiteIdentity(resolvedIdentity, identityTranslationTargets, ai, {
            brandVoice:
              (await readString(StorageKeys.BrandVoice)) ?? undefined,
            concurrency: 4,
          })
        : Promise.resolve(null)

    const fresh = await orchestrateScan({
      siteMap: map,
      defaultLocale,
      ai,
      concurrency: 4,
      onProgress: (done, total, label) => {
        setPhase({
          kind: "scanning-ai",
          current: done,
          total,
          label: label ?? "",
          startedAt: scanStartedAt,
        })
      },
    })
    // Preserve the user's curation work across re-scans:
    //   1. Their enabled/disabled toggle (so 3 disabled pages stay
    //      disabled after re-scan).
    //   2. Their inline edits, but ONLY if the source content for the
    //      page is unchanged. If the page content changed, the AI's
    //      fresh proposal is more relevant than the user's old edits
    //      (which referenced stale content), so we drop the edits and
    //      surface a "Changed" badge.
    //   3. The original AI suggestion (`originalInputs`) — always
    //      reverts to the new fresh proposal so Reset gives the user
    //      the latest AI take.
    //
    // Brand-new pages (added since last scan) keep the AI's defaults
    // wholesale.
    const prevByPageId = new Map(proposals.map((p) => [p.pageId, p]))
    const merged = fresh.map((p) => {
      const prev = prevByPageId.get(p.pageId)
      if (!prev) return p
      const contentUnchanged = prev.sourceHash === p.sourceHash
      const wasEdited = isEditedFromOriginal(prev.inputs, prev.originalInputs)
      const shouldFailClosed = Boolean(p.aiError) || p.confidence < 0.7
      return {
        ...p,
        enabled: shouldFailClosed ? false : prev.enabled,
        inputs: contentUnchanged && wasEdited ? prev.inputs : p.inputs,
      }
    })
    setProposals(merged)

    // Phase 0.5: await translations now that Phase 1 has finished.
    // We persist on success only; failures are silent (the locale
    // simply renders source-language identity at install time —
    // strictly better than an empty publisher.name).
    const phase05Result = await phase05Promise
    if (phase05Result) {
      const nextTranslations = mergeIdentityTranslations(
        identityTranslations,
        phase05Result.translations,
        identityResult.refreshed,
      )
      setIdentityTranslations(nextTranslations)
      void writeJson(
        StorageKeys.IdentityTranslations,
        nextTranslations,
      )
      if (phase05Result.failed.length > 0) {
        framer.notify(
          t("schema.audit.identityPartialTranslate", {
            n: phase05Result.failed.length,
          }),
          { variant: "warning" },
        )
      }
    }

    if (map.partial) {
      framer.notify(t("schema.audit.partial"), { variant: "warning" })
    } else {
      framer.notify(t("schema.audit.scanSummary", { n: map.pages.length }), {
        variant: "success",
      })
    }

    setPhase({ kind: "idle" })

    // Keep the freshly scanned proposal queue in memory only. Framer's
    // plugin data has a 4 KB combined budget, so persisting even a
    // compact workspace alongside the install snapshot can break later
    // dashboard/control-center writes and leave users stuck on loading.
  }

  const applyInstallUndo = async (undo: NonNullable<typeof installUndo>) => {
    await restoreHeadEndRaw(undo.headEndRaw)
    setSnapshot(undo.snapshot)
    setUntranslated(undo.untranslated)
    setLastTranslations(undo.lastTranslations)
    setInstallUndo(null)
    framer.notify(t("schema.audit.installUndoDone"), { variant: "success" })
  }

  const handleInstall = async () => {
    if (!siteMap || enabledProposals.length === 0) return
    const installPageCount = countDistinctInstallPages(
      Object.keys(snapshot?.pageHashes ?? {}),
      enabledProposals.map((p) => p.pageId),
    )
    if (
      !gate.check("schema_install_unlimited", { installPageCount })
    ) {
      return
    }
    if (!hasApiKey) {
      framer.notify(t("schema.audit.aiNeeded"), { variant: "warning" })
      return
    }
    const apiKey = await readProviderKey(providerId)
    if (!apiKey) return

    const allLocales = await getAllLocales()
    const defaultLocale = allLocales.find((l) => l.isDefault) ?? allLocales[0]
    if (!defaultLocale) return
    const targetLocales = allLocales.filter((l) => !l.isDefault)

    if (
      translateContent &&
      targetLocales.length > 0 &&
      !gate.check("schema_translate", { localeCount: locales.length })
    ) {
      return
    }

    const ai: AiCredentials = {
      providerId,
      modelId,
      apiKey,
      customProvider: currentProvider.custom ? currentProvider : undefined,
    }

    let translations: LocalizedOverrides = {}
    let freshUntranslated: UntranslatedCell[] = []
    if (translateContent && targetLocales.length > 0) {
      const totalTranslations = enabledProposals.length * targetLocales.length
      const translationStartedAt = Date.now()
      setPhase({
        kind: "translating",
        current: 0,
        total: totalTranslations,
        label: "",
        startedAt: translationStartedAt,
      })
      const brandVoice = (await readString(StorageKeys.BrandVoice)) ?? undefined
      const result = await orchestrateTranslate({
        proposals: enabledProposals,
        defaultLocale,
        targetLocales,
        brandVoice,
        ai,
        concurrency: 4,
        onProgress: (done, total, label) => {
          setPhase({
            kind: "translating",
            current: done,
            total,
            label: label ?? "",
            startedAt: translationStartedAt,
          })
        },
      })
      // V2: site-identity fields (publisher.name, default author,
      // Organization name) are NOT in the per-page translations
      // anymore — they were stripped before the AI saw them and
      // are injected at render time from the SiteIdentity bundle.
      // No post-hoc normalization needed; cross-article drift is
      // eliminated by construction.
      translations = result.overrides
      freshUntranslated = result.untranslated
    }

    // Snapshot the slot AND the InstallSnapshot record BEFORE writing
    // anything, so the Undo button in the success toast can revert
    // both atomically. The previous snapshot may be null (first ever
    // install) — restoring null wipes our record cleanly.
    const previousHeadEnd = await readHeadEndRaw()
    const previousSnapshot = snapshot
    const preInstallUntranslated = untranslated
    const preInstallLastTranslations = lastTranslations

    setPhase({ kind: "installing" })
    try {
      const result = await bulkInstall({
        proposals: enabledProposals,
        locales: allLocales,
        defaultLocale,
        translations,
        identity: identity ?? undefined,
        identityTranslations,
      })

      const newSnapshot = buildSnapshot(
        enabledProposals.map((p) => ({
          pageId: p.pageId,
          sourceHash: p.sourceHash,
        })),
        allLocales.map((l) => l.code),
      )
      setSnapshot(newSnapshot)
      // Persist the translation outcome so re-translate can do partial
      // retries and so per-card warning pills survive a plugin reopen.
      setLastTranslations(translations)
      setUntranslated(freshUntranslated)

      const undoState = {
        headEndRaw: previousHeadEnd,
        snapshot: previousSnapshot,
        untranslated: preInstallUntranslated,
        lastTranslations: preInstallLastTranslations,
      }
      setInstallUndo(undoState)

      const baseMessage =
        result.preservedUserBytes > 0
          ? t("schema.audit.installSuccessWithPreserved", {
              blocks: result.installedBlocks,
              bytes: result.preservedUserBytes,
            })
          : t("schema.audit.installSuccess", {
              blocks: result.installedBlocks,
              pages: result.enabledProposalCount,
            })

      // When some cells still fail after the built-in per-cell auto-
      // retry, the toast's single button slot goes to Re-translate
      // (semi-auto UX). Undo moves to the Translation health panel so
      // we don't bury the primary recovery action behind Undo.
      const hasTranslationFailures =
        translateContent && freshUntranslated.length > 0
      const message = hasTranslationFailures
        ? `${baseMessage} ${t("schema.audit.installSuccessWithUntranslated", {
            n: freshUntranslated.length,
          })}`
        : baseMessage

      framer.notify(message, {
        variant: hasTranslationFailures ? "warning" : "success",
        durationMs: 30_000,
        button: hasTranslationFailures
          ? {
              text: t("schema.audit.installToastRetry", {
                n: freshUntranslated.length,
              }),
              onClick: () => {
                void handleRetryTranslations()
              },
            }
          : {
              text: t("schema.audit.installUndo"),
              onClick: () => {
                void (async () => {
                  try {
                    await applyInstallUndo(undoState)
                  } catch (err) {
                    framer.notify(
                      t("schema.audit.installUndoFailed", {
                        error: (err as Error).message,
                      }),
                      { variant: "error" },
                    )
                  }
                })()
              },
            },
      })
    } catch (e) {
      framer.notify(
        t("schema.audit.installFailed", { error: (e as Error).message }),
        { variant: "error" },
      )
    } finally {
      setPhase({ kind: "idle" })
    }
  }

  const toggleProposal = (pageId: string) => {
    setProposals((prev) =>
      prev.map((p) =>
        p.pageId === pageId ? { ...p, enabled: !p.enabled } : p,
      ),
    )
  }

  const toggleAll = (enable: boolean) => {
    if (
      enable &&
      proposals.length > FREE_SCHEMA_INSTALL_PAGE_LIMIT &&
      !gate.check("schema_install_all", { enableAll: true })
    ) {
      return
    }
    setProposals((prev) =>
      prev.map((p) => ({
        ...p,
        enabled:
          enable && (Boolean(p.aiError) || p.confidence < 0.7)
            ? false
            : enable,
      })),
    )
  }

  /**
   * Replace one proposal's `inputs` with a user-edited version. The
   * `originalInputs` field is preserved untouched so the editor's
   * "Reset to AI suggestion" button still works after multiple edits.
   * Translations cached in `LocalizedOverrides` are NOT invalidated
   * here — they live in install-time state and the next install will
   * re-translate from the current `inputs`.
   */
  const saveProposalEdits = (
    pageId: string,
    nextInputs: SchemaProposal["inputs"],
  ) => {
    setProposals((prev) =>
      prev.map((p) =>
        p.pageId === pageId
          ? { ...p, inputs: nextInputs, kind: nextInputs.kind }
          : p,
      ),
    )
    setEditingPageId(null)
  }

  /**
   * Re-translate failed cells, then merge the fresh translations into
   * the existing overrides and reinstall. Costs a few cents on average
   * — only the failed cells get a second AI call, not the whole
   * proposal × locale matrix.
   *
   * Two call patterns:
   *   - `handleRetryTranslations()` — every untranslated cell on the
   *     site (the global "Translation health" CTA).
   *   - `handleRetryTranslations([pageId])` — only one proposal's
   *     failed cells (the inline retry button on a ProposalCard).
   *
   * Per-card retry exists because the failure pill lives on the card
   * but the global section sits high up in the view; designers
   * scrolling through proposals would otherwise see a warning with no
   * adjacent action. Single-card retries also let users probe whether
   * a translation issue is a one-off page or a systemic provider
   * issue without paying for a full-site retry.
   *
   * We keep the previous Custom Code snapshot for Undo, same as a
   * normal install, so a botched retry can still be reverted.
   */
  const handleRetryTranslations = async (pageIdsFilter?: string[]) => {
    // Narrow the cell set to retry. When `pageIdsFilter` is undefined
    // the caller wants the global retry (every failed cell). When set,
    // only retry cells whose pageId is in the filter.
    const cellsToRetry = pageIdsFilter
      ? untranslated.filter((c) => pageIdsFilter.includes(c.pageId))
      : untranslated
    if (cellsToRetry.length === 0) return
    if (!siteMap || enabledProposals.length === 0) return
    if (!hasApiKey) {
      framer.notify(t("schema.audit.aiNeeded"), { variant: "warning" })
      return
    }
    const apiKey = await readProviderKey(providerId)
    if (!apiKey) return

    // Light up the inline spinner on the originating card. We pick
    // the FIRST id in the filter as the visual anchor — per-card
    // retries always pass exactly one page id, and the global retry
    // intentionally leaves this null so global progress lives in the
    // sticky footer instead of a single arbitrary card.
    const visualAnchorPageId = pageIdsFilter?.[0] ?? null
    setRetryingPageId(visualAnchorPageId)

    const allLocales = await getAllLocales()
    const defaultLocale = allLocales.find((l) => l.isDefault) ?? allLocales[0]
    if (!defaultLocale) return
    const targetLocales = allLocales.filter((l) => !l.isDefault)

    const ai: AiCredentials = {
      providerId,
      modelId,
      apiKey,
      customProvider: currentProvider.custom ? currentProvider : undefined,
    }

    const retryStartedAt = Date.now()
    setPhase({
      kind: "translating",
      current: 0,
      total: cellsToRetry.length,
      label: "",
      startedAt: retryStartedAt,
    })
    const brandVoice = (await readString(StorageKeys.BrandVoice)) ?? undefined
    const result = await orchestrateTranslate({
      proposals: enabledProposals,
      defaultLocale,
      targetLocales,
      brandVoice,
      ai,
      concurrency: 4,
      retryCells: cellsToRetry.map((c) => ({
        pageId: c.pageId,
        localeCode: c.localeCode,
      })),
      onProgress: (done, total, label) => {
        setPhase({
          kind: "translating",
          current: done,
          total,
          label: label ?? "",
          startedAt: retryStartedAt,
        })
      },
    })

    // Merge the fresh translations on top of the previous ones — same
    // shape, keyed by pageId → localeCode. The previous translation
    // for each retried cell is overwritten by the new one.
    //
    // V2 note: no post-hoc identity normalization needed. The
    // per-page translation prompt strips publisher/author/org-name,
    // so retried cells can't introduce drift; render-time injection
    // (`applyIdentityToInput`) supplies the canonical values from
    // the persisted identity bundle.
    const mergedTranslations: LocalizedOverrides = { ...lastTranslations }
    for (const [pageId, byLocale] of Object.entries(result.overrides)) {
      mergedTranslations[pageId] = {
        ...(mergedTranslations[pageId] ?? {}),
        ...byLocale,
      }
    }
    const normalizedTranslations = mergedTranslations

    // Compute the post-retry untranslated set. For per-card retries,
    // cells from OTHER pages were never re-attempted, so their failure
    // status is unchanged — preserve them. Cells from this retry's
    // page set are fully replaced by `result.untranslated`. For the
    // global retry, `pageIdsFilter` is undefined and `otherPageCells`
    // is empty, which collapses to the previous behavior.
    const otherPageCells = pageIdsFilter
      ? untranslated.filter((c) => !pageIdsFilter.includes(c.pageId))
      : []
    const nextUntranslated = [...otherPageCells, ...result.untranslated]

    const previousHeadEnd = await readHeadEndRaw()
    const previousSnapshot = snapshot
    const preRetryUntranslated = untranslated
    const preRetryLastTranslations = lastTranslations

    setPhase({ kind: "installing" })
    try {
      const installResult = await bulkInstall({
        proposals: enabledProposals,
        locales: allLocales,
        defaultLocale,
        translations: normalizedTranslations,
        identity: identity ?? undefined,
        identityTranslations,
      })
      setLastTranslations(normalizedTranslations)
      setUntranslated(nextUntranslated)

      const retryUndoState = {
        headEndRaw: previousHeadEnd,
        snapshot: previousSnapshot,
        untranslated: preRetryUntranslated,
        lastTranslations: preRetryLastTranslations,
      }
      setInstallUndo(retryUndoState)

      const stillFailing = result.untranslated.length
      const recovered = cellsToRetry.length - stillFailing
      const message =
        stillFailing === 0
          ? t("schema.audit.retryAllOk", { n: recovered })
          : t("schema.audit.retryPartial", {
              recovered,
              remaining: stillFailing,
            })

      const retryToastButton =
        stillFailing > 0
          ? {
              text: t("schema.audit.installToastRetry", {
                n: stillFailing,
              }),
              onClick: () => {
                void handleRetryTranslations(pageIdsFilter)
              },
            }
          : {
              text: t("schema.audit.installUndo"),
              onClick: () => {
                void (async () => {
                  try {
                    await applyInstallUndo(retryUndoState)
                  } catch (err) {
                    framer.notify(
                      t("schema.audit.installUndoFailed", {
                        error: (err as Error).message,
                      }),
                      { variant: "error" },
                    )
                  }
                })()
              },
            }

      framer.notify(message, {
        variant: stillFailing === 0 ? "success" : "warning",
        durationMs: 30_000,
        button: retryToastButton,
      })
      void installResult
    } catch (e) {
      framer.notify(
        t("schema.audit.installFailed", { error: (e as Error).message }),
        { variant: "error" },
      )
    } finally {
      setPhase({ kind: "idle" })
      setRetryingPageId(null)
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────

  const isWorking = phase.kind !== "idle"
  const totalLocales = locales.length || 1
  const totalBlocks = enabledProposals.length * totalLocales
  const selectedReviewCount = enabledProposals.filter(
    (p) => Boolean(p.aiError) || p.confidence < 0.7,
  ).length

  // Adaptive install-button copy. Computed against the ENABLED proposal
  // set (not the full siteMap) so the label can never overpromise:
  // a disabled proposal that's "new on the site" doesn't count as an
  // install change because the next click won't ship it. See
  // {@link deriveInstallButtonState} + {@link summarizeInstallDiff}
  // for the install-vs-site diff distinction.
  const installState = useMemo(
    () =>
      deriveInstallButtonState({
        enabledProposals: enabledProposals.map((p) => ({
          pageId: p.pageId,
          sourceHash: p.sourceHash,
        })),
        localeCount: totalLocales,
        snapshot,
      }),
    [enabledProposals, totalLocales, snapshot],
  )

  /**
   * Build a localized "3 new · 2 changed · 1 removed" summary from
   * an `update` button state. Returns an empty string for fragments
   * with zero count so the joined output stays terse.
   */
  const formatDiffSummary = (state: {
    added: number
    changed: number
    removed: number
  }): string => {
    const parts: string[] = []
    if (state.added > 0) {
      parts.push(t("schema.audit.diffFragmentAdded", { n: state.added }))
    }
    if (state.changed > 0) {
      parts.push(t("schema.audit.diffFragmentChanged", { n: state.changed }))
    }
    if (state.removed > 0) {
      parts.push(t("schema.audit.diffFragmentRemoved", { n: state.removed }))
    }
    return parts.join(" · ")
  }

  // Footer promotes Re-translate when install left failed cells — same
  // muscle-memory slot as Scan → Install without scrolling to the
  // Translation health card.
  const showFooterRetry =
    translateContent && untranslated.length > 0

  const installFooterShortLabel =
    phase.kind === "translating"
      ? t("schema.audit.translateProgress", {
          current: phase.current,
          total: phase.total,
        })
      : phase.kind === "installing"
        ? t("common.installing")
        : installState.kind === "first-install"
          ? t("schema.audit.footerInstallShort")
          : installState.kind === "reinstall"
            ? t("schema.audit.footerReinstallShort")
            : installState.kind === "update"
              ? t("schema.audit.footerUpdateInstallShort")
              : t("schema.audit.footerInstallShort")

  const installFooterTitle =
    phase.kind === "translating" || phase.kind === "installing"
      ? undefined
      : installState.kind === "reinstall"
        ? t("schema.audit.footerReinstallTitle", {
            n: installState.totalBlocks,
            proposals: installState.proposalCount,
            locales: installState.localeCount,
            hint: t("schema.audit.reinstallButtonHint"),
          })
        : installState.kind === "update"
          ? t("schema.audit.updateInstallButtonHint", {
              summary: formatDiffSummary(installState),
            })
          : installState.kind === "first-install"
            ? t("schema.audit.footerInstallTitle", {
                n: installState.totalBlocks,
                proposals: installState.proposalCount,
                locales: installState.localeCount,
              })
            : t("schema.audit.footerInstallTitle", {
                n: totalBlocks,
                proposals: enabledProposals.length,
                locales: totalLocales,
              })

  const retryFooterLabel =
    phase.kind === "translating"
      ? t("schema.audit.translateProgress", {
          current: phase.current,
          total: phase.total,
        })
      : phase.kind === "installing"
        ? t("common.installing")
        : t("schema.audit.footerRetryLabel", { n: untranslated.length })

  // Cost estimate: ~700 input tokens, ~400 output for detect + translate.
  const perCallEstimate =
    (700 * (currentModel?.pricePerMTokenInput ?? 0) +
      400 * (currentModel?.pricePerMTokenOutput ?? 0)) /
    1_000_000
  const detectCalls = siteMap?.pages.length ?? 0
  const translateCalls = translateContent
    ? enabledProposals.length * Math.max(0, totalLocales - 1)
    : 0
  const estimatedTotalCost = perCallEstimate * (detectCalls + translateCalls)
  const showCostEstimate = perCallEstimate > 0 && (detectCalls + translateCalls) > 0
  const activeProgress =
    phase.kind === "scanning-site" ||
    phase.kind === "scanning-ai" ||
    phase.kind === "translating"
      ? {
          title:
            phase.kind === "scanning-site"
              ? t("schema.audit.progressSiteTitle")
              : phase.kind === "scanning-ai"
                ? t("schema.audit.progressAiTitle")
                : t("schema.audit.progressTranslateTitle"),
          helper:
            phase.kind === "scanning-site"
              ? t("schema.audit.progressSiteHelper")
              : phase.kind === "scanning-ai"
                ? t("schema.audit.progressAiHelper")
                : t("schema.audit.progressTranslateHelper"),
          current:
            phase.kind === "scanning-site"
              ? t("schema.audit.progressReadingFramer")
              : normalizeProgressLabel(
                  phase.label,
                  t("schema.audit.progressWaitingForProvider"),
                  t("schema.audit.homepageLabel"),
                ),
          currentCount:
            phase.kind === "scanning-site"
              ? null
              : t("schema.audit.scanProgress", {
                  current: phase.current,
                  total: phase.total,
                }),
          elapsedLabel: formatElapsed(nowMs - phase.startedAt),
          isSlow: nowMs - phase.startedAt > 45_000,
          value: phase.kind === "scanning-site" ? undefined : phase.current,
          max: phase.kind === "scanning-site" ? undefined : phase.total,
        }
      : null
  const readyProposalCount = proposals.filter(
    (p) => p.enabled && !p.aiError && p.confidence >= 0.7,
  ).length
  const reviewProposalCount = proposals.filter(
    (p) =>
      Boolean(p.aiError) ||
      p.confidence < 0.7 ||
      Object.keys(untranslatedByPageId[p.pageId] ?? {}).length > 0,
  ).length
  const disabledProposalCount = proposals.filter((p) => !p.enabled).length
  const hasNoEnabledProposals =
    proposals.length > 0 && enabledProposals.length === 0
  const isSnapshotOnly = Boolean(snapshot && proposals.length === 0)
  const auditSummaryTone =
    isSnapshotOnly
      ? "accent"
      : hasNoEnabledProposals ||
          !hasApiKey ||
          reviewProposalCount > 0 ||
          untranslated.length > 0
      ? "warning"
      : "accent"
  const auditSummaryScore =
    isSnapshotOnly
      ? 100
      : hasNoEnabledProposals
        ? 0
      : proposals.length > 0
      ? Math.max(
          0,
          Math.round(
            ((readyProposalCount + disabledProposalCount * 0.25) /
              proposals.length) *
              100,
          ),
        )
      : 0
  const auditRingValue = isSnapshotOnly
    ? String(snapshot?.totalBlocks ?? 0)
    : String(auditSummaryScore)
  const auditRingLabel = isSnapshotOnly
    ? t("schema.audit.blocksRingLabel")
    : "AEO"
  const auditScanMetricValue = isSnapshotOnly
    ? (snapshot?.totalBlocks ?? 0)
    : detectCalls
  const auditScanMetricLabel = isSnapshotOnly
    ? t("schema.audit.installedBlocksMetric")
    : t("schema.audit.scanCalls")
  const auditTranslateMetricValue = isSnapshotOnly
    ? (snapshot?.locales.length ?? 0)
    : translateCalls
  const auditTranslateMetricLabel = isSnapshotOnly
    ? t("schema.audit.localeVariantsMetric")
    : t("schema.audit.translateCalls")
  const auditEnabledMetricValue = isSnapshotOnly
    ? t("schema.audit.scanNeededMetricValue")
    : enabledProposals.length
  const auditEnabledMetricLabel = isSnapshotOnly
    ? t("schema.audit.reviewQueueMetric")
    : t("schema.audit.enabledPagesMetric")
  const auditSummaryStatus =
    phase.kind === "scanning-site" || phase.kind === "scanning-ai"
      ? t("schema.audit.summaryScanning")
      : proposals.length > 0
        ? hasNoEnabledProposals
          ? t("schema.audit.summaryNoInstallable")
          : reviewProposalCount > 0 || untranslated.length > 0
          ? t("schema.audit.summaryNeedsReview")
          : t("schema.audit.summaryReady")
        : snapshot
          ? t("schema.audit.summaryInstalled")
          : t("schema.audit.summaryNotScanned")
  const auditSummaryLine =
    proposals.length > 0
      ? t("schema.audit.summaryLine", {
          enabled: enabledProposals.length,
          ready: readyProposalCount,
          review: reviewProposalCount,
          disabled: disabledProposalCount,
        })
      : snapshot
        ? t("schema.audit.summarySnapshotLine", {
            blocks: snapshot.totalBlocks,
            locales: snapshot.locales.length,
          })
        : t("schema.audit.summaryEmptyLine")
  const installScopeLabel =
    installState.kind === "disabled"
      ? t("schema.audit.installScopeDisabled")
      : selectedReviewCount > 0
        ? t("schema.audit.installScopeWithReview", {
            n: totalBlocks,
            proposals: enabledProposals.length,
            locales: totalLocales,
            review: selectedReviewCount,
          })
      : t("schema.audit.installScope", {
          n: totalBlocks,
          proposals: enabledProposals.length,
          locales: totalLocales,
        })
  const installFooterActionLabel =
    phase.kind === "translating" || phase.kind === "installing"
      ? installFooterShortLabel
      : installState.kind === "first-install"
        ? t("schema.audit.footerInstallSelected", {
            n: enabledProposals.length,
          })
        : installState.kind === "reinstall"
          ? t("schema.audit.footerReinstallSelected", {
              n: enabledProposals.length,
            })
          : installState.kind === "update"
            ? t("schema.audit.footerUpdateSelected", {
                n: enabledProposals.length,
              })
            : installFooterShortLabel

  return (
    <>
      <TopBar
        title={t("schema.audit.title")}
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        onOpenOnboarding={onOpenOnboarding}
      />
      <div className="pa-scroll pa-scroll--with-footer">
        {/* Hero block — first-time-only intro. We show this when there
          * is no in-memory site map AND no snapshot from a prior
          * install. Returning users who already have a snapshot get
          * the snapshot card (with a re-scan hint) instead — the
          * marketing copy here would be redundant noise to them.
          *
          * The manual-mode link lives INSIDE the hero (not in its
          * own section above the sticky footer) so it doesn't compete
          * visually with the primary "Scan site" button. Framing it
          * as "or use manual mode" — alternative path, not next step
          * — also helps. After a scan the hero hides and so does
          * this link, which is correct: once the user has AI
          * proposals, switching modes would discard curation work. */}
        {!siteMap && !snapshot && (
          <section className="pa-section">
            <div className="pa-card pa-control-hero">
              <div className="pa-row-spread">
                <div className="pa-section-headline">
                  <span className="pa-section-title">{t("schema.audit.title")}</span>
                  <h2 className="pa-card-title">{t("schema.audit.heroTitle")}</h2>
                </div>
                <span className="pa-pill" data-tone="accent">
                  <SchemaIcon size={14} />
                  JSON-LD
                </span>
              </div>
              <p className="pa-section-helper">{t("schema.audit.heroBody")}</p>
              <p className="pa-stack-help">{t("schema.audit.wizardTimeHint")}</p>
              <button
                type="button"
                className="pa-link"
                onClick={onSwitchToManual}
                style={{ alignSelf: "flex-start", marginTop: 4 }}
              >
                {t("schema.audit.manualLink")}
              </button>
            </div>
          </section>
        )}

        {/* Readiness summary + AI provider picker. Always visible — user adjusts
          * before scan, but the first visual answer is now "what will happen and
          * how risky is this run?", not a raw provider form. */}
        <section className="pa-section">
          <div className="pa-row-spread">
            <span className="pa-section-title">
              {t("schema.audit.auditSetupTitle")}
              <HelpIcon termId="managedAi" />
            </span>
            <span className="pa-pill" data-tone={hasApiKey ? "success" : "warning"}>
              {hasApiKey ? currentProvider.name : t("common.apiKeyMissing")}
            </span>
          </div>
          <div
            className="pa-card pa-console-card pa-schema-audit-summary"
            data-tone={auditSummaryTone}
          >
            <div className="pa-control-hero-main">
              <div
                className="pa-score-ring"
                style={
	                  {
	                    "--pa-score": `${auditSummaryScore}%`,
	                  } as CSSProperties
	                }
	              >
	                <span className="pa-score-ring-value">{auditRingValue}</span>
	                <span className="pa-score-ring-label">{auditRingLabel}</span>
	              </div>
	              <div className="pa-control-hero-copy">
	                <span className="pa-section-title pa-schema-audit-eyebrow">
	                  {isSnapshotOnly
	                    ? t("schema.audit.auditSetupSnapshotEyebrow")
	                    : t("schema.audit.auditSetupEyebrow")}
	                </span>
                <h2 className="pa-card-title">{auditSummaryStatus}</h2>
                <p className="pa-control-summary-line">{auditSummaryLine}</p>
                <p className="pa-section-helper pa-schema-audit-summary-copy">
                  {isSnapshotOnly
                    ? t("schema.audit.auditSetupSnapshotHelper")
                    : t("schema.audit.auditSetupHelper")}
                </p>
              </div>
            </div>
            <div className="pa-metric-grid">
	              <span className="pa-metric-tile">
	                <SchemaIcon size={15} />
	                <span>
	                  <strong>{auditScanMetricValue}</strong>
	                  <small>{auditScanMetricLabel}</small>
	                </span>
	              </span>
	              <span className="pa-metric-tile">
	                <VerifyIcon size={15} />
	                <span>
	                  <strong>{auditTranslateMetricValue}</strong>
	                  <small>{auditTranslateMetricLabel}</small>
	                </span>
	              </span>
	              <span className="pa-metric-tile">
	                <SchemaIcon size={15} />
	                <span>
	                  <strong>{auditEnabledMetricValue}</strong>
	                  <small>{auditEnabledMetricLabel}</small>
	                </span>
	              </span>
              <span className="pa-metric-tile">
                <VerifyIcon size={15} />
                <span>
                  <strong>
                    {showCostEstimate
                      ? `~$${estimatedTotalCost.toFixed(3)}`
                      : "—"}
                  </strong>
                  <small>{t("schema.audit.estimatedCostMetric")}</small>
                </span>
              </span>
            </div>
            <div className="pa-schema-audit-config-grid">
              <label className="pa-label">
                {t("schema.audit.providerLabel")}
                <select
                  className="pa-select"
                  value={providerId}
                  disabled={isWorking}
                  onChange={(e) => setProviderId(e.target.value as ProviderId)}
                >
                  {allProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pa-label">
                {t("schema.audit.modelLabel")}
                <select
                  className="pa-select"
                  value={modelId || currentProvider.models[0].id}
                  disabled={isWorking}
                  onChange={(e) => setModelId(e.target.value)}
                >
                  {currentProvider.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.pricePerMTokenInput > 0
                        ? ` · $${m.pricePerMTokenInput}/$${m.pricePerMTokenOutput}/M`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="pa-checkbox-row">
              <input
                type="checkbox"
                checked={translateContent}
                disabled={isWorking}
                onChange={(e) => {
                  const checked = e.target.checked
                  if (
                    checked &&
                    locales.length > 1 &&
                    !gate.check("schema_translate", {
                      localeCount: locales.length,
                    })
                  ) {
                    return
                  }
                  setTranslateContent(checked)
                  void writeString(
                    StorageKeys.ScanTranslateContent,
                    checked ? "1" : "0",
                  )
                }}
              />
              <span className="pa-stack">
                <span className="pa-stack-label">
                  {t("schema.audit.translateContentLabel")}
                </span>
                <span className="pa-stack-help">
                  {t("schema.audit.translateContentHelper")}
                </span>
              </span>
            </label>
          </div>
          {!hasApiKey && (
            <p className="pa-section-helper">
              <span className="pa-pill" data-tone="warning">
                {t("common.apiKeyMissing")}
              </span>{" "}
              {t("schema.audit.aiNeeded")}
            </p>
          )}
        </section>

        {/* Durable status cards. Keeping "Last installed" and brand identity
          * side-by-side turns this from a long settings page into a compact
          * audit console: what is installed, and which canonical identity will
          * be used across every JSON-LD block. */}
        {(snapshot || identity || identityDeriving) && (
          <section className="pa-section pa-schema-status-grid">
            {snapshot && (
              <div className="pa-card pa-schema-status-card">
                <div className="pa-row-spread">
                  <span className="pa-section-title">
                    {t("schema.audit.snapshotTitle")}
                  </span>
                  {diff &&
                    (diff.needsReinstall ? (
                      <span className="pa-pill" data-tone="warning">
                        {t("schema.audit.snapshotNeedsUpdate")}
                      </span>
                    ) : (
                      <span className="pa-pill" data-tone="success">
                        {t("schema.audit.snapshotUpToDate")}
                      </span>
                    ))}
                </div>
                <p className="pa-section-helper">
                  {t("schema.audit.snapshotInstalledAt", {
                    time: relativeTime(snapshot.installedAt, t),
                    n: snapshot.totalBlocks,
                    locales: snapshot.locales.length,
                  })}
                </p>
                {diff?.needsReinstall && (
                  <div className="pa-status-pill-row">
                    {diff.added.length > 0 && (
                      <span className="pa-pill" data-tone="accent">
                        {t("schema.audit.snapshotAdded", {
                          n: diff.added.length,
                        })}
                      </span>
                    )}
                    {diff.changed.length > 0 && (
                      <span className="pa-pill" data-tone="warning">
                        {t("schema.audit.snapshotChanges", {
                          n: diff.changed.length,
                        })}
                      </span>
                    )}
                    {diff.removed.length > 0 && (
                      <span className="pa-pill">
                        {t("schema.audit.snapshotRemoved", {
                          n: diff.removed.length,
                        })}
                      </span>
                    )}
                  </div>
                )}
                {!siteMap && (
                  <p className="pa-stack-help">
                    {t("schema.audit.snapshotRestoreHintShort")}
                  </p>
                )}
              </div>
            )}
            {(identity || identityDeriving) && (
              <SiteIdentityCard
                identity={identity}
                translations={identityTranslations}
                deriving={identityDeriving}
                onSave={(next) => {
                  const owned: SiteIdentity = {
                    ...next,
                    confidence: 1,
                    source: "user-edit",
                    derivedAt: Date.now(),
                  }
                  setIdentity(owned)
                  setIdentityTranslations({})
                  setIdentityHash(null)
                  void writeJson(StorageKeys.Identity, owned)
                  void writeJson(StorageKeys.IdentityTranslations, {})
                  void writeString(StorageKeys.IdentitySourceHash, null)
                }}
              />
            )}
          </section>
        )}

        {/* Translation health — informational only; the Re-translate CTA
          * lives in the sticky footer (same slot as Scan → Install). */}
        {untranslated.length > 0 && (
          <section className="pa-section">
            <div className="pa-row-spread">
              <span className="pa-section-title">
                {t("schema.audit.translationHealthTitle")}
              </span>
              {sortedUntranslated.length > 0 && (
                <button
                  type="button"
                  className="pa-pill-button"
                  onClick={handleNextIssue}
                  disabled={isWorking}
                >
                  {t("schema.audit.nextIssue", {
                    current: issueNavIndex + 1,
                    total: sortedUntranslated.length,
                  })}
                </button>
              )}
            </div>
            <div className="pa-card">
              <p className="pa-section-helper">
                {t("schema.audit.translationHealthBody", {
                  n: untranslated.length,
                })}
              </p>
              <p
                className="pa-section-helper--inline"
                style={{ fontStyle: "italic", marginTop: 4 }}
              >
                {t("schema.audit.translationHealthAutoRetryNote")}
              </p>
              <p className="pa-section-helper" style={{ marginTop: 4 }}>
                {t("schema.audit.translationHealthFooterHint")}
              </p>
              <p
                className="pa-section-helper"
                style={{ marginTop: 8, marginBottom: 4 }}
              >
                {t("schema.audit.translationHealthIssueListTitle")}
              </p>
              <ul className="pa-issue-list" role="list">
                {sortedUntranslated.map((cell, index) => {
                  const label =
                    proposalLabelByPageId.get(cell.pageId) ?? cell.pageId
                  const isActive =
                    focusIssue?.pageId === cell.pageId &&
                    focusIssue.localeCode === cell.localeCode
                  return (
                    <li key={`${cell.pageId}-${cell.localeCode}`}>
                      <button
                        type="button"
                        className="pa-issue-jump"
                        data-active={isActive || undefined}
                        onClick={() => focusUntranslatedCell(cell, index)}
                      >
                        {label} · {cell.localeCode} ·{" "}
                        {t(untranslatedReasonPillKey(cell.reason))}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p
                className="pa-section-helper--inline"
                style={{ marginTop: 8, marginBottom: 4 }}
              >
                {t("schema.audit.translationHealthLocaleSummary")}
              </p>
              <div
                className="pa-row"
                style={{ flexWrap: "wrap", gap: 6 }}
              >
                {Object.entries(
                  untranslated.reduce<Record<string, number>>((acc, c) => {
                    acc[c.localeCode] = (acc[c.localeCode] ?? 0) + 1
                    return acc
                  }, {}),
                ).map(([code, count]) => (
                  <span
                    key={code}
                    className="pa-pill"
                    data-tone="warning"
                  >
                    {code}: {count}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeProgress && (
          <section
            ref={progressPanelRef}
            className="pa-section pa-debug-progress"
          >
            <div className="pa-debug-progress-head">
              <div>
                <p className="pa-section-eyebrow">{activeProgress.title}</p>
                <p className="pa-section-helper">{activeProgress.helper}</p>
              </div>
              <span className="pa-pill">{activeProgress.elapsedLabel}</span>
            </div>
            <div className="pa-debug-progress-grid">
              <div>
                <span className="pa-stack-help">
                  {t("schema.audit.progressCurrentItem")}
                </span>
                <strong>{activeProgress.current}</strong>
              </div>
              <div>
                <span className="pa-stack-help">
                  {t("schema.audit.progressProvider")}
                </span>
                <strong>{currentProvider.name}</strong>
              </div>
              <div>
                <span className="pa-stack-help">
                  {t("schema.audit.progressModel")}
                </span>
                <strong className="pa-truncate">{currentModel?.name}</strong>
              </div>
              <div>
                <span className="pa-stack-help">
                  {t("schema.audit.progressCalls")}
                </span>
                <strong>
                  {activeProgress.currentCount ??
                    t("schema.audit.progressPreparing")}
                </strong>
              </div>
            </div>
            {activeProgress.max !== undefined && (
              <progress
                className="pa-progress"
                value={activeProgress.value}
                max={activeProgress.max}
              />
            )}
            {activeProgress.isSlow && (
              <div className="pa-debug-progress-note">
                <strong>{t("schema.audit.progressSlowTitle")}</strong>
                <p>{t("schema.audit.progressSlowHelper")}</p>
              </div>
            )}
          </section>
        )}

        {/* Audit list — shown once we have proposals. */}
        {proposals.length > 0 && (
          <section className="pa-section pa-schema-review-section">
            <div className="pa-schema-review-head">
              <div className="pa-section-headline">
                <span className="pa-section-title">
                  {t("schema.audit.proposalsTitle")}
                </span>
                <p className="pa-section-helper">
                  {t("schema.audit.reviewQueueSummary", {
                    enabled: enabledProposals.length,
                    ready: readyProposalCount,
                    review: reviewProposalCount,
                    disabled: disabledProposalCount,
                  })}
                </p>
              </div>
              <span className="pa-pill">
                {t("schema.audit.proposalsCount", {
                  enabled: enabledProposals.length,
                  total: proposals.length,
                })}
              </span>
            </div>
            <div className="pa-schema-review-toolbar">
              <span className="pa-stack-help">{installScopeLabel}</span>
              <div className="pa-row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="pa-pill-button"
                  onClick={() => toggleAll(true)}
                  disabled={isWorking}
                >
                  {t("schema.audit.enableAll")}
                </button>
                <button
                  type="button"
                  className="pa-pill-button"
                  onClick={() => toggleAll(false)}
                  disabled={isWorking}
                >
                  {t("schema.audit.disableAll")}
                </button>
              </div>
            </div>

            {/* Filter / search row — appears only when the list is long
              * enough to be hard to scan. Search matches both URL and
              * page label, so designers can grep by either. */}
            {showProposalFilters && (
              <div className="pa-filter-row">
                <input
                  className="pa-input pa-filter-input"
                  type="search"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={t("schema.audit.filterSearchPlaceholder")}
                  spellCheck={false}
                />
                <div className="pa-filter-segments">
                  {proposalFilterSegments.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="pa-filter-segment"
                      data-active={filterStatus === s}
                      onClick={() => setFilterStatus(s)}
                    >
                      {t(proposalFilterSegmentKey(s))}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredProposals.length === 0 ? (
              <p className="pa-section-helper">
                {t("schema.audit.filterNoMatch")}
              </p>
            ) : (
              <div className="pa-schema-review-list">
                {filteredProposals.map((p) => (
                  <ProposalCard
                    key={p.pageId}
                    proposal={p}
                    diffStatus={diffByPageId[p.pageId]}
                    installed={Boolean(snapshot?.pageHashes[p.pageId])}
                    untranslatedByLocale={untranslatedByPageId[p.pageId] ?? {}}
                    pageTranslations={lastTranslations[p.pageId]}
                    locales={locales}
                    focusIssue={focusIssue}
                    canRetry={!isWorking && hasApiKey}
                    isRetrying={retryingPageId === p.pageId}
                    onToggle={() => toggleProposal(p.pageId)}
                    onRetry={() => {
                      void handleRetryTranslations([p.pageId])
                    }}
                    isEditing={editingPageId === p.pageId}
                    onStartEdit={() => setEditingPageId(p.pageId)}
                    onCancelEdit={() => setEditingPageId(null)}
                    onSaveEdit={(next) => saveProposalEdits(p.pageId, next)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

      </div>

      {/* Sticky footer: primary action depends on current state. */}
      <div className="pa-footer">
        {!siteMap || proposals.length === 0 ? (
          <button
            type="button"
            className="pa-button-primary"
            onClick={handleScan}
            disabled={isWorking || !hasApiKey}
          >
            {phase.kind === "scanning-site" || phase.kind === "scanning-ai"
              ? t("schema.audit.scanning")
              : needsProForScan
                ? t("schema.audit.scanButtonPro")
                : t("schema.audit.scanButton")}
          </button>
        ) : installState.kind === "disabled" ? (
          <div className="pa-footer-stack">
            <button
              type="button"
              className="pa-button-primary"
              onClick={handleScan}
              disabled={isWorking || !hasApiKey}
            >
              {t("schema.audit.rescan")}
            </button>
            {!isWorking && (
              <p className="pa-footer-hint">{installScopeLabel}</p>
            )}
          </div>
        ) : showFooterRetry ? (
          <div className="pa-footer-stack">
            <button
              type="button"
              className="pa-button-primary"
              onClick={() => {
                void handleRetryTranslations()
              }}
              disabled={isWorking || !hasApiKey}
            >
              {retryFooterLabel}
            </button>
            <div className="pa-footer-toolbar">
              <button
                type="button"
                className="pa-link"
                onClick={handleScan}
                disabled={isWorking}
              >
                {t("schema.audit.rescan")}
              </button>
              <div className="pa-footer-toolbar-end">
                <button
	                  type="button"
	                  className="pa-link"
	                  onClick={handleInstall}
	                  disabled={isWorking}
                  title={`${installFooterTitle ?? ""} ${t("schema.audit.footerRetryHint")}`.trim()}
                >
                  {t("schema.audit.footerReinstallShort")}
                </button>
                {installUndo && (
                  <button
                    type="button"
                    className="pa-link"
                    disabled={isWorking}
                    onClick={() => {
                      void (async () => {
                        try {
                          await applyInstallUndo(installUndo)
                        } catch (err) {
                          framer.notify(
                            t("schema.audit.installUndoFailed", {
                              error: (err as Error).message,
                            }),
                            { variant: "error" },
                          )
                        }
                      })()
                    }}
                  >
                    {t("schema.audit.installUndoInPanel")}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="pa-footer-row">
            <button
              type="button"
              className="pa-footer-secondary"
              onClick={handleScan}
              disabled={isWorking}
            >
              {t("schema.audit.rescan")}
            </button>
            <div className="pa-footer-primary-col">
              <button
	                type="button"
	                className="pa-button-primary"
	                onClick={handleInstall}
	                disabled={isWorking}
                title={installFooterTitle}
              >
                {installFooterActionLabel}
              </button>
              {!isWorking && (
                <p className="pa-footer-hint">{installScopeLabel}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const PROPOSAL_AI_ERROR_DETAIL_MAX = 96

function proposalAiErrorLines(
  aiError: string,
  t: (key: TranslationKey) => string,
): { summary: string; detail: string } {
  const summary = t("schema.audit.proposalAiError")
  if (aiError === "no-response") {
    return { summary, detail: t("schema.audit.proposalAiErrorNoResponse") }
  }
  const trimmed = aiError.trim()
  if (/insufficient\s+balance|402/i.test(trimmed)) {
    return {
      summary: t("schema.audit.proposalAiProviderBilling"),
      detail: summarizeProviderAiError(trimmed),
    }
  }
  const detail =
    trimmed.length > PROPOSAL_AI_ERROR_DETAIL_MAX
      ? `${trimmed.slice(0, PROPOSAL_AI_ERROR_DETAIL_MAX)}…`
      : trimmed
  return { summary, detail: detail || t("schema.audit.proposalAiErrorNoResponse") }
}

function summarizeProviderAiError(error: string): string {
  const status = error.match(/\bAPI error\s+(\d{3})\b/i)?.[1]
  const message = error.match(/"message"\s*:\s*"([^"]+)"/)?.[1]
  const provider = error.match(/^([A-Za-z][A-Za-z0-9 _.-]+?)\s+API error/i)?.[1]
  const parts = [
    provider ? provider.trim() : null,
    status ? `HTTP ${status}` : null,
    message ? message.trim() : "Insufficient Balance",
  ].filter(Boolean)
  return parts.join(" · ")
}

interface ProposalCardProps {
  proposal: SchemaProposal
  diffStatus: "new" | "changed" | "unchanged" | undefined
  installed: boolean
  /**
   * Locales where the most recent install failed quality checks for
   * this page, keyed by locale code → {@link UntranslatedReason}.
   */
  untranslatedByLocale: Record<string, UntranslatedReason>
  /**
   * Installed per-locale schema inputs from the last bulk install.
   * When present, the preview panel can show translated headline /
   * description per locale instead of only the default proposal.
   */
  pageTranslations?: Record<string, SchemaInput>
  /** Project locales — drives preview tabs and labels. */
  locales: LocaleInfo[]
  /**
   * Whether the per-card retry button can fire right now. Disabled
   * during scans / installs / when no API key is configured. The
   * parent owns this because the busy state spans many concerns
   * (scanning, installing, translating) the card itself can't see.
   */
  canRetry: boolean
  /**
   * True while THIS card's retry is in flight. Replaces the button's
   * label with a "Translating…" affordance so the user has unambiguous
   * confirmation that their click registered. Without this, the only
   * feedback during the 3–10 second AI call is a globally-disabled
   * button — which reads as "frozen UI" to most users.
   *
   * Mutually exclusive with `canRetry` in practice (the parent sets
   * `canRetry = !isWorking`), but we keep them as independent props
   * so the disabled and busy states stay semantically distinct.
   */
  isRetrying: boolean
  onToggle: () => void
  /** Triggered by the inline retry button next to the failure pill. */
  onRetry: () => void
  /** When set for this page, expand preview and select the locale tab. */
  focusIssue: FocusIssue | null
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (next: SchemaProposal["inputs"]) => void
}

function ProposalCard({
  proposal,
  diffStatus,
  installed,
  untranslatedByLocale,
  pageTranslations,
  locales,
  canRetry,
  isRetrying,
  onToggle,
  onRetry,
  focusIssue,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: ProposalCardProps) {
  const { t } = useI18n()
  const untranslatedLocales = useMemo(
    () => Object.keys(untranslatedByLocale),
    [untranslatedByLocale],
  )
  const [showPreview, setShowPreview] = useState(false)
  const defaultLocale = locales.find((l) => l.isDefault) ?? locales[0]
  const previewLocales = useMemo(() => {
    if (!pageTranslations || Object.keys(pageTranslations).length === 0) {
      return []
    }
    return locales.filter(
      (l) => l.isDefault || pageTranslations[l.code] !== undefined,
    )
  }, [locales, pageTranslations])
  const [previewLocaleCode, setPreviewLocaleCode] = useState(
    () => defaultLocale?.code ?? "",
  )

  useEffect(() => {
    if (focusIssue?.pageId !== proposal.pageId) return
    setShowPreview(true)
    setPreviewLocaleCode(focusIssue.localeCode)
  }, [focusIssue, proposal.pageId])

  const previewInput: SchemaInput | null = useMemo(() => {
    if (previewLocales.length === 0) return null
    const code = previewLocaleCode || defaultLocale?.code
    const loc = locales.find((l) => l.code === code)
    if (!loc) return proposal.inputs
    if (loc.isDefault) return proposal.inputs
    return pageTranslations?.[loc.code] ?? proposal.inputs
  }, [
    previewLocales.length,
    previewLocaleCode,
    defaultLocale?.code,
    locales,
    pageTranslations,
    proposal.inputs,
  ])
  const untranslatedSet = useMemo(
    () => new Set(untranslatedLocales),
    [untranslatedLocales],
  )
  const previewFailureReason = untranslatedByLocale[previewLocaleCode]
  const previewCopyText = useMemo(
    () =>
      buildSchemaPreviewCopyText({
        localeCode:
          previewLocales.length > 0 ? previewLocaleCode : undefined,
        failureReason: previewFailureReason,
        previewInput,
        proposal,
      }),
    [
      previewLocales.length,
      previewLocaleCode,
      previewFailureReason,
      previewInput,
      proposal,
    ],
  )
  const confidencePct = Math.round(proposal.confidence * 100)
  const isEdited = isEditedFromOriginal(proposal.inputs, proposal.originalInputs)
  const needsReview =
    Boolean(proposal.aiError) ||
    confidencePct < 70 ||
    untranslatedLocales.length > 0
  const isCompact = !needsReview && !showPreview && !isEditing && !isEdited
  const aiErrorLines = proposal.aiError
    ? proposalAiErrorLines(proposal.aiError, t)
    : null

  return (
    <div
      id={`audit-card-${proposal.pageId}`}
      className="pa-card pa-proposal-card"
      data-disabled={!proposal.enabled}
      data-review={needsReview ? "true" : undefined}
      data-compact={isCompact ? "true" : undefined}
    >
      <div className="pa-proposal-card-head">
        <label
          className="pa-checkbox-row pa-proposal-card-checkbox"
        >
          <input
            type="checkbox"
            checked={proposal.enabled}
            onChange={onToggle}
          />
          <span className="pa-stack">
            <span className="pa-stack-label pa-truncate">
              {proposal.pageLabel}
            </span>
            <span className="pa-stack-help pa-truncate">{proposal.url}</span>
          </span>
        </label>
        <div
          className="pa-row pa-proposal-card-badges"
        >
          {installed && diffStatus === "unchanged" && (
            <span className="pa-pill" data-tone="success">
              {t("schema.audit.badgeInstalled")}
            </span>
          )}
          {diffStatus === "new" && (
            <span className="pa-pill" data-tone="accent">
              {t("schema.audit.badgeNew")}
            </span>
          )}
          {diffStatus === "changed" && (
            <span className="pa-pill" data-tone="warning">
              {t("schema.audit.badgeChanged")}
            </span>
          )}
        </div>
      </div>
      <div className="pa-proposal-meta-row">
        <span className="pa-pill" data-tone="accent">
          {proposal.kind}
        </span>
        <span
          className="pa-pill"
          data-tone={confidenceTone(confidencePct)}
        >
          {t("schema.audit.proposalConfidence", { n: confidencePct })}
        </span>
        {/* Surface the *reason* behind low/error proposals as a pill, so
          * users see at a glance why this row was auto-skipped (or why
          * we'd rather they review before enabling). The italic rationale
          * line below explains in detail. */}
        {(proposal.aiError || confidencePct < 70) && (
          <span className="pa-pill" data-tone="warning">
            {t("schema.audit.proposalReviewBadge")}
          </span>
        )}
        {/* Translation health: locales that didn't translate cleanly on
          * the most recent install. We list the codes (e.g. "ja, tr")
          * so the designer knows exactly which locale to retry or hand-
          * edit, without scrolling JSON. The inline retry button sits
          * RIGHT NEXT TO the warning pill — not in a global section
          * far up the page — because the warning is per-card and the
          * fix should be too. Designers complained that scrolling to
          * a card, seeing the pill, then scrolling back up to find
          * a "retry" CTA broke their flow.
          *
          * The button uses `pa-inline-action` (filled accent, square
          * corners) instead of `pa-pill-button` (capsule, soft tint)
          * so it reads as a CTA, not as another tag in the row. The
          * ↻ glyph reinforces the "click to retry" affordance. */}
        {untranslatedLocales.length > 0 && (
          <>
            <span className="pa-pill" data-tone="warning">
              {t("schema.audit.cardUntranslated", {
                locales: untranslatedLocales.join(", "),
              })}
            </span>
            <button
              type="button"
              className="pa-inline-action"
              onClick={onRetry}
              disabled={!canRetry || isRetrying}
              data-busy={isRetrying || undefined}
              aria-busy={isRetrying || undefined}
              title={t("schema.audit.cardRetryHint")}
            >
              {isRetrying ? (
                <>
                  <span className="pa-inline-action-spin" aria-hidden="true">
                    ↻
                  </span>{" "}
                  {t("schema.audit.cardRetrying")}
                </>
              ) : (
                <>
                  ↻{" "}
                  {t("schema.audit.cardRetry", {
                    n: untranslatedLocales.length,
                  })}
              </>
            )}
          </button>
        </>
      )}
      </div>
      {!isCompact &&
        (aiErrorLines ? (
          <div className="pa-proposal-rationale-block">
            <p
              className="pa-section-helper--inline"
              style={{ fontStyle: "italic", margin: 0 }}
            >
              {aiErrorLines.summary}
            </p>
            <p className="pa-proposal-ai-error-detail">{aiErrorLines.detail}</p>
          </div>
        ) : (
          <p
            className="pa-section-helper--inline"
            style={{ fontStyle: "italic" }}
          >
            {confidencePct < 70
              ? t("schema.audit.proposalLowConfidence")
              : proposal.rationale}
          </p>
        ))}
      <div className="pa-proposal-actions">
        <button
          type="button"
          className="pa-link pa-proposal-link"
          onClick={() => setShowPreview((v) => !v)}
        >
            {showPreview
              ? t("common.hide")
              : previewLocales.length > 0
                ? t("schema.audit.previewToggleTranslated")
                : t("schema.audit.previewToggle")}
        </button>
        {!isEditing && (
          <button
            type="button"
            className="pa-link pa-proposal-link"
            onClick={onStartEdit}
          >
            {t(needsReview ? "schema.audit.editorReview" : "schema.audit.editorOpen")}
          </button>
        )}
        {isEdited && (
          <span className="pa-pill" data-tone="warning">
            {t("schema.audit.editorEdited")}
          </span>
        )}
      </div>
      {isEditing && (
        <ProposalEditor
          initial={proposal.inputs}
          original={proposal.originalInputs}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      )}
      {showPreview && !isEditing && (
        <div className="pa-stack" style={{ gap: 8 }}>
          {previewLocales.length > 0 && (
            <>
              <div
                className="pa-locale-tab-row"
                role="tablist"
                aria-label={t("schema.audit.previewLocaleTabs")}
              >
                {previewLocales.map((loc) => (
                  <button
                    key={loc.code}
                    type="button"
                    role="tab"
                    aria-selected={previewLocaleCode === loc.code}
                    className="pa-locale-tab"
                    data-active={previewLocaleCode === loc.code}
                    onClick={() => setPreviewLocaleCode(loc.code)}
                    title={
                      untranslatedByLocale[loc.code]
                        ? `${loc.name} — ${t(untranslatedReasonPillKey(untranslatedByLocale[loc.code]))}`
                        : loc.name
                    }
                  >
                    <span className="pa-locale-tab-flag" aria-hidden="true">
                      {localeFlagEmoji(loc.code)}
                    </span>
                    {loc.code}
                    {untranslatedSet.has(loc.code) && (
                      <span aria-hidden="true"> ⚠</span>
                    )}
                  </button>
                ))}
              </div>
              {previewInput && (
                <p
                  className="pa-section-helper"
                  style={{ whiteSpace: "pre-wrap", margin: 0 }}
                >
                  {schemaPrimaryText(previewInput)}
                </p>
              )}
              {previewInput && previewFailureReason && (
                <div className="pa-stack" style={{ gap: 6 }}>
                  <span className="pa-pill" data-tone="warning">
                    {t(untranslatedReasonPillKey(previewFailureReason))}
                  </span>
                  <p
                    className="pa-section-helper"
                    style={{ margin: 0 }}
                  >
                    {t(untranslatedReasonHintKey(previewFailureReason))}
                  </p>
                </div>
              )}
            </>
          )}
          <div className="pa-code-block">
            <div className="pa-code-block-header">
              <span className="pa-code-block-label">JSON-LD</span>
              <CopyIconButton
                text={previewCopyText}
                label={t("common.copy")}
                onCopied={() =>
                  framer.notify(t("common.copied"), { variant: "success" })
                }
              />
            </div>
            <pre className="pa-code">
              {previewInput
                ? schemaInputToJsonLd(previewInput)
                : proposalToJsonLd(proposal)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function buildSchemaPreviewCopyText(args: {
  localeCode: string | undefined
  failureReason: UntranslatedReason | undefined
  previewInput: SchemaInput | null
  proposal: SchemaProposal
}): string {
  const json = args.previewInput
    ? schemaInputToJsonLd(args.previewInput)
    : proposalToJsonLd(args.proposal)
  const lines: string[] = []
  if (args.localeCode) {
    lines.push(`locale: ${args.localeCode}`)
  }
  if (args.failureReason) {
    lines.push(`quality: ${args.failureReason}`)
  }
  if (args.previewInput) {
    lines.push("", "--- fields ---", schemaPrimaryText(args.previewInput))
  }
  lines.push("", "--- json-ld ---", json)
  return lines.join("\n")
}

function proposalFilterSegmentKey(
  status: ProposalFilterStatus,
): TranslationKey {
  if (status === "needs-retranslate") {
    return "schema.audit.filter.needsRetranslate"
  }
  return `schema.audit.filter.${status}` as TranslationKey
}

function untranslatedReasonPillKey(
  reason: UntranslatedReason,
): TranslationKey {
  switch (reason) {
    case "mixed-script":
      return "schema.audit.untranslatedReasonPillMixedScript"
    case "no-content-change":
      return "schema.audit.untranslatedReasonPillNoContentChange"
    case "ai-error":
      return "schema.audit.untranslatedReasonPillAiError"
  }
}

function untranslatedReasonHintKey(
  reason: UntranslatedReason,
): TranslationKey {
  switch (reason) {
    case "mixed-script":
      return "schema.audit.untranslatedReasonHintMixedScript"
    case "no-content-change":
      return "schema.audit.untranslatedReasonHintNoContentChange"
    case "ai-error":
      return "schema.audit.untranslatedReasonHintAiError"
  }
}

/**
 * Render `installedAt` as a relative-time label. Lightweight — we don't pull
 * in a date library since this is the only place we need it.
 */
function relativeTime(
  installedAtMs: number,
  t: <K extends TranslationKey>(
    key: K,
    vars?: Record<string, string | number>,
  ) => string,
): string {
  const diffMs = Date.now() - installedAtMs
  if (diffMs < 60_000) return t("schema.audit.timeJustNow")
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return t("schema.audit.timeMinutesAgo", { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("schema.audit.timeHoursAgo", { n: hours })
  const days = Math.floor(hours / 24)
  return t("schema.audit.timeDaysAgo", { n: days })
}
