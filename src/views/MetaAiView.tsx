import { framer, isWebPageNode } from "framer-plugin"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useFeatureGate } from "../components/entitlement-hooks"
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
import { buildMetaPrompt, type MetaPromptInput } from "../lib/ai/prompts"
import {
  BUILTIN_PROVIDERS,
  materializeCustomProvider,
  type CustomProviderConfig,
  type Provider,
} from "../lib/ai/providers"
import { openCurrentFramerProject } from "../lib/framer/project"
import { extractStaticPageContent } from "../lib/framer/site-scan"
import {
  scanStaticPages,
  type StaticPageEntry,
} from "../lib/framer/static-pages"
import { toSchemaLanguage } from "../lib/framer/locales"
import { buildPageContextFromScan } from "../lib/meta/page-context"
import {
  readJson,
  readString,
  StorageKeys,
  writeJson,
  writeString,
} from "../lib/storage"
import { MetaGenerateStep } from "./meta/MetaGenerateStep"
import { MetaPageStep } from "./meta/MetaPageStep"
import { MetaReviewStep } from "./meta/MetaReviewStep"
import {
  metaDraftSignature,
  type MetaDraft,
  type MetaResult,
  type MetaStep,
  type PersistedMetaResults,
} from "./meta/types"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
}

const DEFAULT_META_DRAFT: MetaDraft = {
  pageContext: "",
  pageType: "",
  primaryKeyword: "",
  providerId: "anthropic",
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

export function MetaAiView({ onBack, onOpenSettings }: Props) {
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

  const setField = <K extends keyof MetaDraft>(key: K, val: MetaDraft[K]) =>
    draft.setValue((prev) => {
      const { provider: _legacy, ...rest } = prev
      void _legacy
      return { ...rest, [key]: val }
    })

  const [step, setStep] = useState<MetaStep>("page")
  const [brandVoice, setBrandVoice] = useState("")
  const [results, setResults] = useState<MetaResult[]>([])
  const [resultLocaleId, setResultLocaleId] = useState("")
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
  const [suggestBusy, setSuggestBusy] = useState<MetaSetupSuggestField | null>(
    null,
  )
  const [suggestion, setSuggestion] = useState<{
    field: MetaSetupSuggestField
    text: string
  } | null>(null)
  const cancelGenerateRef = useRef(false)
  const lastGenerateSignatureRef = useRef<string | null>(null)
  const didNotifySessionRestoreRef = useRef(false)

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

  useEffect(() => {
    if (draft.status === "loading") return
    let cancelled = false
    void Promise.all([
      readString(StorageKeys.BrandVoice),
      readJson<PersistedMetaResults | null>(StorageKeys.LastMetaResults, null),
    ]).then(([voice, persisted]) => {
      if (cancelled) return
      if (voice) setBrandVoice(voice)
      if (
        persisted?.results?.length &&
        persisted.draftSignature === draftSignature
      ) {
        setResults(persisted.results)
        lastGenerateSignatureRef.current = persisted.draftSignature
        const localeId =
          persisted.resultLocaleId ?? persisted.results[0]?.localeId ?? ""
        setResultLocaleId(localeId)
        const restoredStep =
          persisted.step === "page" ||
          persisted.step === "generate" ||
          persisted.step === "review"
            ? persisted.step
            : "review"
        if (persisted.results.length > 0) {
          setStep(restoredStep)
        }
        if (!didNotifySessionRestoreRef.current) {
          didNotifySessionRestoreRef.current = true
          framer.notify(t("meta.sessionRestored"), { variant: "info" })
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [draft.status, draftSignature, t])

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
  }, [])

  const persistSession = useCallback(
    (
      nextResults: MetaResult[],
      sessionStep: MetaStep,
      localeId: string,
    ) => {
      if (nextResults.length === 0) {
        void writeJson(StorageKeys.LastMetaResults, null)
        return
      }
      const payload: PersistedMetaResults = {
        savedAt: Date.now(),
        selectedPageId,
        draftSignature,
        step: sessionStep,
        resultLocaleId: localeId || nextResults[0]?.localeId,
        results: nextResults,
      }
      void writeJson(StorageKeys.LastMetaResults, payload)
      lastGenerateSignatureRef.current = draftSignature
    },
    [draftSignature, selectedPageId],
  )

  useEffect(() => {
    if (results.length === 0) return
    persistSession(
      results,
      step,
      resultLocaleId || results[0]?.localeId || "",
    )
  }, [results, step, resultLocaleId, persistSession])

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
      setGenerateProgress(0)
    } else {
      setRegeneratingId(options!.localeId!)
    }

    try {
      let done = 0
      const rows = await mapWithConcurrency(
        targetLocales,
        META_AI_CONCURRENCY,
        async (locale) => {
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
        framer.notify(
          issueCount > 0
            ? t("meta.generatedSuccessWithIssues", {
                n: completed.length,
                issues: issueCount,
              })
            : t("meta.generatedSuccess", { n: completed.length }),
          { variant: issueCount > 0 ? "warning" : "success" },
        )
        if (options?.goToReview !== false) setStep("review")
      }
    } finally {
      setBusy(false)
      setRegeneratingId(null)
    }
  }

  const handleCancelGenerate = () => {
    cancelGenerateRef.current = true
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      framer.notify(t("meta.copyAllSuccess"), { variant: "success" })
    } catch {
      framer.notify(t("meta.copyAllFailed"), { variant: "warning" })
    }
  }

  const openFramerProject = () => {
    void openCurrentFramerProject()
  }

  const totalCost = results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)

  const perCallEstimate =
    (600 * currentModel.pricePerMTokenInput +
      250 * currentModel.pricePerMTokenOutput) /
    1_000_000
  const generateLocaleCount = gate.isPro
    ? locales.length
    : Math.min(locales.length || 1, 1)
  const totalEstimate = perCallEstimate * generateLocaleCount
  const showCostEstimate = perCallEstimate > 0

  const generateLabel =
    generateLocaleCount === 1
      ? t("meta.generateButton", { n: 1 })
      : t("meta.generateButtonPlural", { n: generateLocaleCount })

  const canProceedFromPage = pageContext.trim().length > 0
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

  useKeyboardShortcut(
    "Enter",
    () => {
      if (step === "generate") void handleGenerate()
    },
    { ctrlOrMeta: true, allowInForm: true },
  )

  const goNextStep = () => {
    if (step === "page") {
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
        onBack={onBack}
        onOpenSettings={onOpenSettings}
      />
      <MetaStepBar
        step={step}
        hasGenerated={results.length > 0}
        onStepChange={handleStepChange}
      />
      <div className="pa-scroll">
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
            onSuggestField={(f, opts) => void handleSuggestField(f, opts)}
            selectedPageIsHomepage={staticPages?.find(
              (p) => p.id === selectedPageId,
            )?.isHomepage}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={() => setSuggestion(null)}
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
            perCallEstimate={perCallEstimate}
            totalEstimate={totalEstimate}
            showCostEstimate={showCostEstimate}
            onProviderChange={(id) => setField("providerId", id)}
            onModelChange={(id) => setField("modelId", id)}
          />
        )}

        {step === "review" && (
          <MetaReviewStep
            results={results}
            resultLocaleId={resultLocaleId || results[0]?.localeId || ""}
            selectedPageTitle={
              staticPages?.find((p) => p.id === selectedPageId)?.title
            }
            selectedPagePath={selectedPagePath}
            onResultLocaleChange={setResultLocaleId}
            onOpenFramerProject={openFramerProject}
            totalCost={totalCost}
            busy={busy}
            regeneratingId={regeneratingId}
            onRegenerateLocale={(id) =>
              void handleGenerate({ localeId: id, goToReview: false })
            }
            onCopyAll={(text) => void copyToClipboard(text)}
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
              {t("meta.stepNext")}
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
          <>
            <button
              type="button"
              className="pa-footer-secondary"
              onClick={() => void handleGenerate({ goToReview: false })}
              disabled={busy || !canGenerate}
            >
              {busy
                ? t("meta.generatingProgress", {
                    current: generateProgress,
                    total: generateLocaleCount,
                  })
                : t("meta.regenerateAll")}
            </button>
            <button
              type="button"
              className="pa-button-primary"
              onClick={onBack}
              disabled={busy}
            >
              {t("meta.reviewDone")}
            </button>
          </>
        )}
      </div>
    </>
  )
}
