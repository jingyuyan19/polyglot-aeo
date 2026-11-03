import { framer, isWebPageNode } from "framer-plugin"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useFeatureGate } from "../components/entitlement-hooks"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { MetaStepBar } from "../components/MetaStepBar"
import { TopBar } from "../components/TopBar"
import { useFormDraft } from "../hooks/useFormDraft"
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut"
import { useLocales } from "../hooks/useLocales"
import { useI18n } from "../i18n"
import {
  callAi,
  readCustomProviders,
  readProviderKey,
  resolveInitialProvider,
  type ProviderId,
} from "../lib/ai/client"
import {
  parseFailedFlag,
  parseMetaFromAi,
} from "../lib/ai/meta-parse"
import {
  validateMetaFields,
  type MetaQualityFlag,
} from "../lib/ai/meta-quality"
import { metaSuggestMatchesCurrent } from "../lib/ai/meta-suggest-match"
import {
  generateMetaSetupSuggestion,
  type MetaSetupSuggestField,
} from "../lib/ai/meta-setup-suggest"
import { estimateMetaBatchCost } from "../lib/ai/meta-cost-estimate"
import { buildMetaPrompt, type MetaPromptInput } from "../lib/ai/prompts"
import {
  BUILTIN_PROVIDERS,
  materializeCustomProvider,
  type CustomProviderConfig,
  type Provider,
} from "../lib/ai/providers"
import { downloadTextFile } from "../lib/download-text"
import { focusFramerEditorCanvas } from "../lib/framer/project"
import { extractStaticPageContent } from "../lib/framer/site-scan"
import {
  scanStaticPages,
  type StaticPageEntry,
} from "../lib/framer/static-pages"
import { toSchemaLanguage } from "../lib/framer/locales"
import { buildPageContextFromScan } from "../lib/meta/page-context"
import {
  clearMetaSessionPersist,
  flushMetaSessionPersist,
  fromMetaSessionRows,
  readMetaSessionPersist,
} from "../lib/meta/session-persist"
import {
  readString,
  StorageKeys,
  writeString,
} from "../lib/storage"
import {
  buildMetaZipArchive,
  formatMetaLocaleExport,
  metaLocaleFilename,
} from "./meta/format-meta-export"
import { MetaGenerateStep } from "./meta/MetaGenerateStep"
import {
  deriveMetaFlowStepDone,
  MetaPageStep,
} from "./meta/MetaPageStep"
import { MetaReviewStep } from "./meta/MetaReviewStep"
import {
  metaDraftSignature,
  type MetaDraft,
  type MetaResult,
  type MetaStep,
  type MetaWizardSession,
} from "./meta/types"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onOpenOnboarding?: () => void
  /** Survives pop → Dashboard → push Meta (plugin data budget is too small). */
  restoredSession?: MetaWizardSession | null
  onPersistSession?: (session: MetaWizardSession | null) => void
}

const DEFAULT_META_DRAFT: MetaDraft = {
  pageContext: "",
  pageType: "",
  primaryKeyword: "",
  providerId: BUILTIN_PROVIDERS[0].id,
  modelId: BUILTIN_PROVIDERS[0].models[0].id,
}

const META_AI_CONCURRENCY = 3

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
  shouldAbort?: () => boolean,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, limit), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        if (shouldAbort?.()) break
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(items[index]!, index)
      }
    }),
  )

  return results
}

async function resolveProjectBaseUrl(): Promise<string> {
  try {
    const info = await framer.getPublishInfo()
    const url = info.production?.url
    if (url) return url.replace(/\/$/, "")
  } catch {
    // pre-publish or permission denied
  }
  const stored = await readString(StorageKeys.BaseUrl)
  if (stored?.trim()) return stored.trim().replace(/\/$/, "")
  return "https://your-site.framer.website"
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export function MetaAiView({
  onBack,
  onOpenSettings,
  onOpenOnboarding,
  restoredSession = null,
  onPersistSession,
}: Props) {
  const { t } = useI18n()
  const { locales } = useLocales()
  const gate = useFeatureGate()
  const draft = useFormDraft<Partial<MetaDraft> & { provider?: string }>({
    storageKey: StorageKeys.DraftMeta,
    initialValue: () => DEFAULT_META_DRAFT,
  })

  const pageContext = draft.value.pageContext ?? DEFAULT_META_DRAFT.pageContext
  const pageType = draft.value.pageType ?? DEFAULT_META_DRAFT.pageType
  const primaryKeyword =
    draft.value.primaryKeyword ?? DEFAULT_META_DRAFT.primaryKeyword
  const selectedPageId = draft.value.selectedPageId
  const selectedPagePath = draft.value.selectedPagePath
  const providerId =
    (draft.value.providerId ??
      (draft.value.provider as ProviderId | undefined) ??
      DEFAULT_META_DRAFT.providerId) as ProviderId
  const modelId = draft.value.modelId ?? DEFAULT_META_DRAFT.modelId

  const setField = useCallback(
    <K extends keyof MetaDraft>(key: K, val: MetaDraft[K]) =>
      draft.setValue((prev) => {
        const { provider: _legacy, ...rest } = prev
        void _legacy
        return { ...rest, [key]: val }
      }),
    [draft],
  )

  const [step, setStep] = useState<MetaStep>(
    () => restoredSession?.step ?? "page",
  )
  const [brandVoice, setBrandVoice] = useState("")
  const [results, setResults] = useState<MetaResult[]>(
    () => restoredSession?.results ?? [],
  )
  const [copiedMetaLocaleIds, setCopiedMetaLocaleIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [resultLocaleId, setResultLocaleId] = useState(
    () =>
      restoredSession?.resultLocaleId ??
      restoredSession?.results[0]?.localeId ??
      "",
  )
  const [busy, setBusy] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [customConfigs, setCustomConfigs] = useState<CustomProviderConfig[]>([])
  const [staticPages, setStaticPages] = useState<StaticPageEntry[] | null>(
    null,
  )
  const [pagesScanning, setPagesScanning] = useState(false)
  const [pagesScanPartial, setPagesScanPartial] = useState(false)
  const [pageContentLoading, setPageContentLoading] = useState(false)
  const [manualPageMode, setManualPageMode] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  const [generateStartedAt, setGenerateStartedAt] = useState<number | null>(
    null,
  )
  const [generateNowMs, setGenerateNowMs] = useState(() => Date.now())
  const [generateCurrentLocaleLabel, setGenerateCurrentLocaleLabel] =
    useState("")
  const [suggestBusy, setSuggestBusy] = useState<MetaSetupSuggestField | null>(
    null,
  )
  const [suggestion, setSuggestion] = useState<{
    field: MetaSetupSuggestField
    text: string
  } | null>(null)
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false)
  const cancelGenerateRef = useRef(false)
  const generateProgressPanelRef = useRef<HTMLDivElement>(null)
  const lastGenerateSignatureRef = useRef<string | null>(
    restoredSession?.draftSignature ?? null,
  )
  const didNotifySessionRestoreRef = useRef(false)
  const didRestoreSessionRef = useRef(
    Boolean(restoredSession?.results.length),
  )
  const sessionSnapshotRef = useRef({
    results: [] as MetaResult[],
    step: "page" as MetaStep,
    resultLocaleId: "",
    draftSignature: "",
    selectedPageId: undefined as string | undefined,
  })

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

  const draftSignature = useMemo(
    () =>
      metaDraftSignature({
        pageContext,
        pageType,
        primaryKeyword,
        selectedPageId,
      }),
    [pageContext, pageType, primaryKeyword, selectedPageId],
  )

  const configChangedSinceGenerate = useMemo(() => {
    if (results.length === 0 || !lastGenerateSignatureRef.current) {
      return false
    }
    return draftSignature !== lastGenerateSignatureRef.current
  }, [draftSignature, results.length])

  const ensureActiveProviderHasKey = useCallback(async (): Promise<{
    providerId: ProviderId
    apiKey: string | null
    hasKey: boolean
  }> => {
    const customs = await readCustomProviders()
    setCustomConfigs(customs)
    const preferredRaw = await readString(StorageKeys.PreferredProvider)
    const preferred = preferredRaw?.trim()
      ? (preferredRaw.trim() as ProviderId)
      : null
    const candidates: ProviderId[] = [
      ...BUILTIN_PROVIDERS.map((p) => p.id),
      ...customs.map((c) => c.id),
    ]

    let activeId = providerId
    let key = await readProviderKey(activeId)
    if (!key) {
      activeId = await resolveInitialProvider(
        preferred,
        candidates,
        DEFAULT_META_DRAFT.providerId,
        readProviderKey,
      )
      key = await readProviderKey(activeId)
      if (activeId !== providerId) {
        setField("providerId", activeId)
      }
    }
    const hasKey = Boolean(key)
    setHasApiKey(hasKey)
    return { providerId: activeId, apiKey: key, hasKey }
  }, [providerId, setField])

  const syncWizardSession = useCallback(() => {
    if (!onPersistSession) return
    if (results.length === 0) {
      onPersistSession(null)
      return
    }
    onPersistSession({
      draftSignature,
      selectedPageId,
      step,
      resultLocaleId: resultLocaleId || results[0]?.localeId || "",
      results,
    })
  }, [
    draftSignature,
    onPersistSession,
    resultLocaleId,
    results,
    selectedPageId,
    step,
  ])

  useEffect(() => {
    syncWizardSession()
  }, [syncWizardSession])

  useEffect(() => {
    if (draft.status === "loading" || didRestoreSessionRef.current) return
    let cancelled = false
    void Promise.all([
      readString(StorageKeys.BrandVoice),
      readMetaSessionPersist(),
    ]).then(([voice, persisted]) => {
      if (cancelled) return
      if (voice) setBrandVoice(voice)
      if (results.length > 0) return
      if (!persisted?.results.length) return
      didRestoreSessionRef.current = true
      const restored = fromMetaSessionRows(persisted.results)
      setResults(restored)
      lastGenerateSignatureRef.current = persisted.draftSignature || null
      const localeId =
        persisted.resultLocaleId ?? restored[0]?.localeId ?? ""
      setResultLocaleId(localeId)
      const restoredStep =
        persisted.step === "page" ||
        persisted.step === "generate" ||
        persisted.step === "review"
          ? persisted.step
          : "review"
      setStep(restoredStep)
      if (!didNotifySessionRestoreRef.current) {
        didNotifySessionRestoreRef.current = true
        const stale =
          persisted.draftSignature.length > 0 &&
          persisted.draftSignature !== draftSignature
        framer.notify(
          t(stale ? "meta.sessionRestoredStale" : "meta.sessionRestored"),
          { variant: stale ? "warning" : "info" },
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [draft.status, draftSignature, results.length, t])

  useEffect(() => {
    sessionSnapshotRef.current = {
      results,
      step,
      resultLocaleId,
      draftSignature,
      selectedPageId,
    }
  }, [results, step, resultLocaleId, draftSignature, selectedPageId])

  useEffect(() => {
    return () => {
      const snap = sessionSnapshotRef.current
      if (snap.results.length === 0) return
      void flushMetaSessionPersist({
        draftSignature: snap.draftSignature,
        selectedPageId: snap.selectedPageId,
        step: snap.step,
        resultLocaleId: snap.resultLocaleId,
        results: snap.results,
      })
    }
  }, [pageContext, selectedPageId, staticPages])

  useEffect(() => {
    if (draft.status === "loading") return
    let cancelled = false
    void ensureActiveProviderHasKey().then(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
  }, [draft.status, providerId, ensureActiveProviderHasKey])

  useEffect(() => {
    if (step !== "generate") return
    void ensureActiveProviderHasKey()
  }, [step, ensureActiveProviderHasKey])

  useEffect(() => {
    if (!busy || step !== "generate") return
    const id = window.setInterval(() => setGenerateNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [busy, step])

  useEffect(() => {
    if (!busy || step !== "generate") return
    const id = window.setTimeout(() => {
      generateProgressPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }, 80)
    return () => window.clearTimeout(id)
  }, [busy, step])

  useEffect(() => {
    if (!currentProvider.models.some((m) => m.id === modelId)) {
      setField("modelId", currentProvider.models[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProvider, modelId])

  useEffect(() => {
    if (
      manualPageMode ||
      staticPages !== null ||
      pagesScanning ||
      !selectedPageId
    ) {
      return
    }
    void handleScanPages()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore page list once
  }, [selectedPageId])

  useEffect(() => {
    if (selectedPageId || !pageContext.trim()) return
    if (staticPages !== null) return
    setManualPageMode(true)
  }, [pageContext, selectedPageId, staticPages])

  const flushSession = useCallback(async () => {
    if (results.length === 0) {
      await clearMetaSessionPersist()
      return
    }
    const ok = await flushMetaSessionPersist({
      draftSignature,
      selectedPageId,
      step,
      resultLocaleId: resultLocaleId || results[0]?.localeId || "",
      results,
    })
    if (ok) {
      lastGenerateSignatureRef.current = draftSignature
    }
  }, [draftSignature, selectedPageId, step, resultLocaleId, results])

  useEffect(() => {
    if (results.length === 0) return
    void flushSession()
  }, [results, step, resultLocaleId, flushSession])

  useEffect(() => {
    setCopiedMetaLocaleIds((prev) => {
      const validIds = new Set(results.map((r) => r.localeId))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [results])

  const handleLeaveMeta = useCallback(() => {
    syncWizardSession()
    void flushMetaSessionPersist({
      draftSignature,
      selectedPageId,
      step,
      resultLocaleId: resultLocaleId || results[0]?.localeId || "",
      results,
    })
    onBack()
  }, [
    draftSignature,
    onBack,
    resultLocaleId,
    results,
    selectedPageId,
    step,
    syncWizardSession,
  ])

  const generateForLocale = async (
    locale: { id: string; code: string; name: string; isDefault: boolean },
    apiKey: string,
  ): Promise<MetaResult> => {
    const language = toSchemaLanguage(locale.code)
    const promptInput: MetaPromptInput = {
      pageContext,
      productOrPageType: pageType.trim() || "Landing page",
      targetLanguage: language,
      targetRegion: locale.name,
      brandVoice: brandVoice || undefined,
      primaryKeyword: primaryKeyword || undefined,
    }
    const prompt = buildMetaPrompt(promptInput)
    try {
      const result = await callAi({
        providerId,
        modelId,
        apiKey,
        feature: "meta_generate",
        prompt,
        customProvider: currentProvider.custom ? currentProvider : undefined,
        // CJK meta JSON is token-heavy; truncation mid-array caused ko parse-failed.
        maxTokens: 2800,
      })
      const parsed = parseMetaFromAi(result.parsed, result.rawText)
      const qualityFlags: MetaQualityFlag[] = []
      if (!parsed) {
        qualityFlags.push(parseFailedFlag())
      } else if (!locale.isDefault) {
        qualityFlags.push(
          ...validateMetaFields({
            parsed,
            localeCode: locale.code,
            source: { pageContext, pageType },
            isDefaultLocale: false,
          }),
        )
      }
      return {
        localeId: locale.id,
        localeCode: locale.code,
        localeName: locale.name,
        language,
        isDefaultLocale: locale.isDefault,
        parsed,
        rawText: result.rawText,
        costUsd: result.estimatedCostUsd,
        qualityFlags,
      }
    } catch (e) {
      return {
        localeId: locale.id,
        localeCode: locale.code,
        localeName: locale.name,
        language,
        isDefaultLocale: locale.isDefault,
        parsed: null,
        rawText: `Error: ${(e as Error).message}`,
        qualityFlags: [parseFailedFlag()],
      }
    }
  }

  const handleScanPages = async () => {
    setPagesScanning(true)
    try {
      const baseUrl = await resolveProjectBaseUrl()
      const { pages, partial } = await scanStaticPages(baseUrl)
      setStaticPages(pages)
      setPagesScanPartial(partial)
      if (pages.length === 0) {
        framer.notify(t("meta.noStaticPages"), { variant: "warning" })
      }
    } finally {
      setPagesScanning(false)
    }
  }

  const handleRescanPages = async () => {
    setField("selectedPageId", undefined)
    setField("selectedPagePath", undefined)
    await handleScanPages()
  }

  const handleManualPageMode = (manual: boolean) => {
    setManualPageMode(manual)
    if (manual) {
      setField("selectedPageId", undefined)
      setField("selectedPagePath", undefined)
    }
  }

  const defaultLocale = useMemo(
    () => locales.find((l) => l.isDefault) ?? locales[0] ?? null,
    [locales],
  )

  const handleSuggestField = async (
    field: MetaSetupSuggestField,
    options?: { ignoreDraft?: boolean },
  ) => {
    if (!pageContext.trim()) {
      framer.notify(t("meta.suggestNeedsContext"), { variant: "warning" })
      return
    }
    if (!defaultLocale) {
      framer.notify(t("meta.suggestNoDefaultLocale"), { variant: "warning" })
      return
    }
    const resolved = await ensureActiveProviderHasKey()
    if (!resolved.hasKey || !resolved.apiKey) {
      const name =
        allProviders.find((p) => p.id === resolved.providerId)?.name ??
        currentProvider.name
      framer.notify(t("meta.providerKeyMissing", { provider: name }), {
        variant: "warning",
      })
      return
    }

    const suggestProvider =
      allProviders.find((p) => p.id === resolved.providerId) ??
      currentProvider

    setSuggestBusy(field)
    setSuggestion(null)
    try {
      const draftRaw =
        field === "pageType"
          ? pageType
          : field === "primaryKeyword"
            ? primaryKeyword
            : brandVoice
      const draft =
        options?.ignoreDraft || !draftRaw.trim()
          ? undefined
          : draftRaw.trim()
      const result = await generateMetaSetupSuggestion({
        field,
        pageContext,
        draft,
        targetLanguage: toSchemaLanguage(defaultLocale.code),
        ai: {
          providerId: resolved.providerId,
          modelId,
          apiKey: resolved.apiKey,
          customProvider: suggestProvider.custom
            ? suggestProvider
            : undefined,
        },
      })
      setSuggestion({ field, text: result.value })
    } catch (e) {
      framer.notify(
        t("meta.suggestFailed", { error: (e as Error).message }),
        { variant: "error" },
      )
    } finally {
      setSuggestBusy(null)
    }
  }

  const handleAcceptSuggestion = () => {
    if (!suggestion) return
    const current =
      suggestion.field === "pageType"
        ? pageType
        : suggestion.field === "primaryKeyword"
          ? primaryKeyword
          : brandVoice
    if (
      metaSuggestMatchesCurrent(suggestion.field, suggestion.text, current)
    ) {
      setSuggestion(null)
      framer.notify(t("meta.suggestSameApplied"), { variant: "info" })
      return
    }
    if (suggestion.field === "pageType") {
      setField("pageType", suggestion.text)
    } else if (suggestion.field === "primaryKeyword") {
      setField("primaryKeyword", suggestion.text)
    } else {
      setBrandVoice(suggestion.text)
      void writeString(StorageKeys.BrandVoice, suggestion.text || null)
    }
    setSuggestion(null)
    framer.notify(t("meta.suggestApplied"), { variant: "success" })
  }

  const handleSelectPage = async (page: StaticPageEntry) => {
    setManualPageMode(false)
    setField("selectedPageId", page.id)
    setField("selectedPagePath", page.rawPath)
    setPageContentLoading(true)
    try {
      const node = await framer.getNode(page.id)
      if (!node || !isWebPageNode(node)) {
        framer.notify(t("meta.pageLoadFailed"), { variant: "warning" })
        return
      }
      const content = await extractStaticPageContent(node)
      const built = buildPageContextFromScan(content)
      if (built) setField("pageContext", built)
    } catch {
      framer.notify(t("meta.pageLoadFailed"), { variant: "warning" })
    } finally {
      setPageContentLoading(false)
    }
  }

  const handleGenerate = async (options?: {
    goToReview?: boolean
    localeId?: string
  }) => {
    if (!pageContext.trim()) {
      framer.notify(t("meta.addContextWarning"), { variant: "warning" })
      return
    }

    let targetLocales = options?.localeId
      ? locales.filter((l) => l.id === options.localeId)
      : locales

    if (!gate.isPro) {
      targetLocales = targetLocales.filter((l) => l.isDefault)
    }

    if (targetLocales.length === 0) {
      gate.check("meta_generate", {
        localeCount: 1,
        nonDefaultLocale: true,
      })
      return
    }

    const freeMetaGenerateCount = gate.isPro
      ? 0
      : Number(
          (await readString(StorageKeys.FreeMetaGenerateCount)) ?? "0",
        ) || 0
    const nonDefault = targetLocales.some((l) => !l.isDefault)
    if (
      !gate.check("meta_generate", {
        localeCount: targetLocales.length,
        nonDefaultLocale: nonDefault,
        metaGenerateCount: freeMetaGenerateCount,
      })
    ) {
      return
    }

    const apiKey = await readProviderKey(providerId)
    if (!apiKey) {
      framer.notify(
        t("meta.providerKeyMissing", { provider: currentProvider.name }),
        { variant: "warning" },
      )
      return
    }

    void writeString(StorageKeys.PreferredProvider, providerId)
    void writeString(StorageKeys.PreferredModel, modelId)

    const isSingleRegen = Boolean(options?.localeId)
    if (!isSingleRegen) {
      cancelGenerateRef.current = false
      setBusy(true)
      setResults([])
      setCopiedMetaLocaleIds(new Set())
      setGenerateProgress(0)
      setGenerateStartedAt(Date.now())
      setGenerateNowMs(Date.now())
      const firstLocale = targetLocales[0]
      setGenerateCurrentLocaleLabel(
        firstLocale ? `${firstLocale.name} (${firstLocale.code})` : "",
      )
    } else {
      setCopiedMetaLocaleIds((prev) => {
        const next = new Set(prev)
        next.delete(options!.localeId!)
        return next
      })
      setRegeneratingId(options!.localeId!)
    }

    try {
      let done = 0
      const rows = await mapWithConcurrency(
        targetLocales,
        META_AI_CONCURRENCY,
        async (locale) => {
          if (!isSingleRegen && !cancelGenerateRef.current) {
            setGenerateCurrentLocaleLabel(`${locale.name} (${locale.code})`)
          }
          const row = await generateForLocale(locale, apiKey)
          if (!isSingleRegen && !cancelGenerateRef.current) {
            done += 1
            setGenerateProgress(done)
            setResults((prev) => [...prev, row])
          }
          return row
        },
        () => cancelGenerateRef.current,
      )

      if (cancelGenerateRef.current && !isSingleRegen) {
        framer.notify(t("meta.generateCancelled"), { variant: "warning" })
        return
      }

      if (isSingleRegen && options?.localeId) {
        const fresh = rows[0]
        if (!fresh) return
        if (!gate.isPro) {
          void writeString(
            StorageKeys.FreeMetaGenerateCount,
            String(freeMetaGenerateCount + 1),
          )
        }
        setResults((prev) =>
          prev.map((r) => (r.localeId === fresh.localeId ? fresh : r)),
        )
      } else {
        const completed = rows.filter(
          (r): r is MetaResult => r !== undefined && r !== null,
        )
        if (!gate.isPro && completed.length > 0) {
          void writeString(
            StorageKeys.FreeMetaGenerateCount,
            String(freeMetaGenerateCount + 1),
          )
        }
        setResults(completed)
        if (completed[0]) setResultLocaleId(completed[0].localeId)
        const issueCount = completed.filter(
          (r) => r.qualityFlags.length > 0,
        ).length
        const singleResult = completed.length === 1
        framer.notify(
          issueCount > 0
            ? singleResult
              ? t("meta.generatedSuccessWithIssuesOne")
              : t("meta.generatedSuccessWithIssues", {
                  n: completed.length,
                  issues: issueCount,
                })
            : singleResult
              ? t("meta.generatedSuccessOne")
              : t("meta.generatedSuccess", { n: completed.length }),
          { variant: issueCount > 0 ? "warning" : "success" },
        )
        if (options?.goToReview !== false) setStep("review")
      }
    } finally {
      setBusy(false)
      if (!isSingleRegen) {
        setGenerateStartedAt(null)
        setGenerateCurrentLocaleLabel("")
      }
      setRegeneratingId(null)
    }
  }

  const handleCancelGenerate = () => {
    cancelGenerateRef.current = true
  }

  const openFramerProject = () => {
    void focusFramerEditorCanvas().then(() => {
      framer.notify(t("meta.openProjectEditorHint"), { variant: "info" })
    })
  }

  const metaFieldLabels = useMemo(
    () => ({
      title: t("meta.fields.title"),
      metaDescription: t("meta.fields.metaDescription"),
      ogTitle: t("meta.fields.ogTitle"),
      ogDescription: t("meta.fields.ogDescription"),
      twitterTitle: t("meta.fields.twitterTitle"),
      twitterDescription: t("meta.fields.twitterDescription"),
    }),
    [t],
  )

  const reviewPageTitle =
    staticPages?.find((p) => p.id === selectedPageId)?.title ?? selectedPagePath

  const reviewCopiedLocaleCount = useMemo(
    () => results.filter((r) => copiedMetaLocaleIds.has(r.localeId)).length,
    [copiedMetaLocaleIds, results],
  )
  const generateElapsedMs =
    busy && generateStartedAt ? generateNowMs - generateStartedAt : 0

  const handleFinishHandoff = useCallback(() => {
    if (results.length > 0 && reviewCopiedLocaleCount < results.length) {
      setFinishConfirmOpen(true)
      return
    }
    handleLeaveMeta()
  }, [handleLeaveMeta, results.length, reviewCopiedLocaleCount])

  const handleDownloadLocale = useCallback(() => {
    const active =
      results.find((r) => r.localeId === resultLocaleId) ?? results[0]
    if (!active?.parsed && !active?.rawText) return
    const text = formatMetaLocaleExport(active, metaFieldLabels, {
      pageTitle: reviewPageTitle,
      pagePath: selectedPagePath,
    })
    downloadTextFile(
      metaLocaleFilename(active.localeCode, reviewPageTitle),
      text,
    )
    framer.notify(t("meta.downloadSuccess"), { variant: "success" })
  }, [
    metaFieldLabels,
    resultLocaleId,
    results,
    reviewPageTitle,
    selectedPagePath,
    t,
  ])

  const handleDownloadAll = useCallback(() => {
    const withContent = results.filter((r) => r.parsed || r.rawText)
    if (withContent.length === 0) return
    const zip = buildMetaZipArchive(withContent, metaFieldLabels, {
      pageTitle: reviewPageTitle,
      pagePath: selectedPagePath,
    })
    const ab = new ArrayBuffer(zip.byteLength)
    new Uint8Array(ab).set(zip)
    const blob = new Blob([ab], { type: "application/zip" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `polyglot-meta-${(reviewPageTitle ?? "page").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "page"}.zip`
    a.click()
    URL.revokeObjectURL(url)
    framer.notify(t("meta.downloadAllSuccess", { n: withContent.length }), {
      variant: "success",
    })
  }, [metaFieldLabels, results, reviewPageTitle, selectedPagePath, t])

  useEffect(() => {
    if (!restoredSession?.results.length || didNotifySessionRestoreRef.current) {
      return
    }
    didNotifySessionRestoreRef.current = true
    framer.notify(t("meta.sessionRestored"), { variant: "info" })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on memory restore
  }, [])

  const totalCost = results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)

  const generateLocaleCount = gate.isPro
    ? locales.length
    : Math.min(locales.length || 1, 1)

  const generateLocaleCodes = useMemo(() => {
    if (gate.isPro) {
      return locales.map((l) => l.code)
    }
    const def = locales.find((l) => l.isDefault) ?? locales[0]
    return def ? [def.code] : ["en"]
  }, [gate.isPro, locales])

  const metaCostEstimate = useMemo(
    () =>
      estimateMetaBatchCost(
        currentModel,
        providerId,
        generateLocaleCodes,
        {
          pageContext,
          pageType,
          primaryKeyword,
          brandVoice,
        },
      ),
    [
      brandVoice,
      currentModel,
      generateLocaleCodes,
      pageContext,
      pageType,
      primaryKeyword,
      providerId,
    ],
  )

  const generateLabel =
    generateLocaleCount === 1
      ? t("meta.generateButton", { n: 1 })
      : t("meta.generateButtonPlural", { n: generateLocaleCount })

  const pageFlowStepDone = useMemo(
    () =>
      deriveMetaFlowStepDone(
        manualPageMode,
        staticPages,
        selectedPageId,
        pageContext,
      ),
    [manualPageMode, pageContext, selectedPageId, staticPages],
  )
  const canProceedFromPage = pageFlowStepDone.content
  const canGenerate = canProceedFromPage && hasApiKey

  const generateNextBlockReason = useMemo(() => {
    if (canGenerate) return null
    if (!canProceedFromPage) return t("meta.stepNextNeedContext")
    return t("meta.generateNeedKey", { provider: currentProvider.name })
  }, [canGenerate, canProceedFromPage, currentProvider.name, t])

  const pageNextBlockReason = useMemo(() => {
    if (canProceedFromPage) return null
    if (!manualPageMode && staticPages === null) {
      return t("meta.stepNextNeedLoad")
    }
    if (!manualPageMode && !selectedPageId) {
      return t("meta.stepNextNeedSelect")
    }
    return t("meta.stepNextNeedContext")
  }, [
    canProceedFromPage,
    manualPageMode,
    selectedPageId,
    staticPages,
    t,
  ])

  const pageNextLabel = useMemo(() => {
    if (canProceedFromPage) return t("meta.stepNextGenerate")
    if (!manualPageMode && staticPages === null) {
      return t("meta.stepNextLoadFirst")
    }
    if (!manualPageMode && !selectedPageId) {
      return t("meta.stepNextSelectFirst")
    }
    return t("meta.stepNextAddContext")
  }, [
    canProceedFromPage,
    manualPageMode,
    selectedPageId,
    staticPages,
    t,
  ])

  useKeyboardShortcut(
    "Enter",
    () => {
      if (step === "generate") void handleGenerate()
    },
    { ctrlOrMeta: true, allowInForm: true },
  )

  const goNextStep = () => {
    if (step === "page") {
      setSuggestion(null)
      void ensureActiveProviderHasKey().then(() => setStep("generate"))
    } else if (step === "generate") void handleGenerate({ goToReview: true })
  }

  const goBackStep = () => {
    if (step === "generate") setStep("page")
    else if (step === "review") setStep("generate")
  }

  const handleStepChange = (next: MetaStep) => {
    if (next === "review" && results.length === 0) {
      return
    }
    setStep(next)
    if (next === "review" && !resultLocaleId && results[0]) {
      setResultLocaleId(results[0].localeId)
    }
  }

  return (
    <>
      <TopBar
        title={t("meta.title")}
        onBack={handleLeaveMeta}
        onOpenSettings={onOpenSettings}
        onOpenOnboarding={onOpenOnboarding}
      />
      <MetaStepBar
        step={step}
        hasGenerated={results.length > 0}
        onStepChange={handleStepChange}
      />
      <div className="pa-scroll pa-scroll--with-footer">
        {configChangedSinceGenerate &&
          (step === "page" || step === "generate") && (
            <p className="pa-section-helper" style={{ margin: "0 0 8px" }}>
              <span className="pa-pill" data-tone="warning">
                {t("meta.configChangedHint")}
              </span>
            </p>
          )}

        {step === "page" && (
          <MetaPageStep
            pageType={pageType}
            pageContext={pageContext}
            primaryKeyword={primaryKeyword}
            brandVoice={brandVoice}
            selectedPageId={selectedPageId}
            staticPages={staticPages}
            pagesScanning={pagesScanning}
            pagesScanPartial={pagesScanPartial}
            pageContentLoading={pageContentLoading}
            manualOnly={manualPageMode}
            onPageTypeChange={(v) => setField("pageType", v)}
            onPageContextChange={(v) => setField("pageContext", v)}
            onPrimaryKeywordChange={(v) => setField("primaryKeyword", v)}
            onBrandVoiceChange={(v) => {
              setBrandVoice(v)
              void writeString(StorageKeys.BrandVoice, v || null)
            }}
            onSelectPage={(p) => void handleSelectPage(p)}
            onScanPages={() => void handleScanPages()}
            onRescanPages={() => void handleRescanPages()}
            onManualOnlyChange={handleManualPageMode}
            suggestBusy={suggestBusy}
            suggestion={suggestion}
            localeCount={generateLocaleCount}
            providerId={providerId}
            modelId={modelId}
            allProviders={allProviders}
            currentProvider={currentProvider}
            currentModel={currentModel}
            onSuggestField={(f, opts) => void handleSuggestField(f, opts)}
            selectedPageIsHomepage={staticPages?.find(
              (p) => p.id === selectedPageId,
            )?.isHomepage}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={() => setSuggestion(null)}
            onProviderChange={(id) => setField("providerId", id)}
            onModelChange={(id) => setField("modelId", id)}
          />
        )}

        {step === "generate" && (
          <MetaGenerateStep
            pageContext={pageContext}
            localeCount={generateLocaleCount}
            providerId={providerId}
            modelId={modelId}
            allProviders={allProviders}
            currentProvider={currentProvider}
            currentModel={currentModel}
            hasApiKey={hasApiKey}
            costEstimate={metaCostEstimate}
            busy={busy}
            progress={generateProgress}
            elapsedLabel={formatElapsed(generateElapsedMs)}
            currentLocaleLabel={generateCurrentLocaleLabel}
            isSlow={generateElapsedMs > 30_000}
            progressPanelRef={generateProgressPanelRef}
            onProviderChange={(id) => setField("providerId", id)}
            onModelChange={(id) => setField("modelId", id)}
          />
        )}

        {step === "review" && (
          <MetaReviewStep
            results={results}
            resultLocaleId={resultLocaleId || results[0]?.localeId || ""}
            copiedLocaleIds={copiedMetaLocaleIds}
            selectedPageTitle={
              staticPages?.find((p) => p.id === selectedPageId)?.title
            }
            selectedPagePath={selectedPagePath}
            onResultLocaleChange={setResultLocaleId}
            onCopiedLocaleIdsChange={setCopiedMetaLocaleIds}
            onOpenFramerProject={openFramerProject}
            totalCost={totalCost}
            providerId={providerId}
            busy={busy}
            regeneratingId={regeneratingId}
            onRegenerateLocale={(id) =>
              void handleGenerate({ localeId: id, goToReview: false })
            }
            onRegenerateAll={() => void handleGenerate({ goToReview: false })}
            onDownloadLocale={handleDownloadLocale}
            onDownloadAll={handleDownloadAll}
          />
        )}
      </div>

      <div className="pa-footer pa-footer-row">
        {(step === "generate" || step === "review") && (
          <button
            type="button"
            className="pa-footer-secondary"
            onClick={goBackStep}
            disabled={busy}
          >
            {t("meta.stepBack")}
          </button>
        )}
        {step === "page" && (
          <div className="pa-footer-primary-col">
            {pageNextBlockReason && (
              <p className="pa-footer-hint">{pageNextBlockReason}</p>
            )}
            <button
              type="button"
              className="pa-button-primary"
              onClick={goNextStep}
              disabled={!canProceedFromPage}
            >
              {pageNextLabel}
            </button>
          </div>
        )}
        {step === "generate" && (
          <>
            {busy && (
              <button
                type="button"
                className="pa-footer-secondary"
                onClick={handleCancelGenerate}
              >
                {t("common.cancel")}
              </button>
            )}
            <div className="pa-footer-primary-col">
              {generateNextBlockReason && (
                <p className="pa-footer-hint">{generateNextBlockReason}</p>
              )}
              <button
                type="button"
                className="pa-button-primary"
                onClick={() => void handleGenerate({ goToReview: true })}
                disabled={busy || !canGenerate}
              >
                {busy
                  ? t("meta.generatingProgress", {
                      current: generateProgress,
                      total: generateLocaleCount,
                    })
                  : generateLabel}
              </button>
            </div>
          </>
        )}
        {step === "review" && (
          <button
            type="button"
            className="pa-button-primary"
            onClick={handleFinishHandoff}
            disabled={busy}
          >
            {t("meta.finishHandoff")}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={finishConfirmOpen}
        message={t("meta.finishUncopiedConfirm", {
          done: reviewCopiedLocaleCount,
          total: results.length,
        })}
        confirmLabel={t("common.close")}
        onConfirm={() => {
          setFinishConfirmOpen(false)
          handleLeaveMeta()
        }}
        onCancel={() => setFinishConfirmOpen(false)}
      />
    </>
  )
}
