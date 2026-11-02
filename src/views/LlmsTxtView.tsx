import { framer } from "framer-plugin"
import { zipSync, strToU8 } from "fflate"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { LlmsStepBar } from "../components/LlmsStepBar"
import { useFeatureGate } from "../components/entitlement-hooks"
import { TopBar } from "../components/TopBar"
import { openFramerProjectsHub } from "../lib/framer/project"
import { useCollections } from "../hooks/useCollections"
import { useLocales } from "../hooks/useLocales"
import { useI18n } from "../i18n"
import {
  readCustomProviders,
  readProviderKey,
  resolveInitialProvider,
  type ProviderId,
} from "../lib/ai/client"
import {
  generateLlmsLongDescription,
  generateLlmsSummary,
} from "../lib/ai/llms-summary"
import {
  pickRowsNeedingTranslation,
  translateLlmsEntries,
  translateLlmsHeader,
  translateLlmsLongDescription,
  type LlmsTranslateEntryInput,
} from "../lib/ai/llms-translate"
import {
  readCachedLlmsTranslations,
  rememberLlmsTranslations,
} from "../lib/ai/llms-translation-cache"
import {
  BUILTIN_PROVIDERS,
  materializeCustomProvider,
  type CustomProviderConfig,
  type Provider,
} from "../lib/ai/providers"
import {
  readCollectionItems,
  type CollectionItemRow,
} from "../lib/framer/cms"
import {
  defaultPickedPageIds,
  scanStaticPages,
  type StaticPageEntry,
} from "../lib/framer/static-pages"
import type { LocaleInfo } from "../lib/framer/locales"
import {
  buildSectionFromCollection,
  renderLlmsTxt,
  type DuplicateTitleGroup,
  type LlmsTxtSection,
  type SkippedItem,
} from "../lib/llms/generator"
import { buildLlmsDeployReadme } from "../lib/llms/deploy-readme"
import { FRAMER_STATIC_FILES_DOCS } from "../lib/links"
import {
  readProjectJsonCache,
  writeProjectJsonCache,
} from "../lib/project-cache"
import {
  readString,
  StorageKeys,
  writeString,
} from "../lib/storage"
import { LlmsDeployStep } from "./llms/LlmsDeployStep"
import { LlmsReviewStep } from "./llms/LlmsReviewStep"
import { LlmsSetupStep } from "./llms/LlmsSetupStep"
import { LlmsSourcesStep } from "./llms/LlmsSourcesStep"
import { resolveCollectionFields } from "./llms/resolveCollectionFields"
import type { LlmsConfig } from "./llms/llms-config"
import type {
  AiFailedItem,
  GeneratedLlmsFile,
  LlmsStep,
} from "./llms/types"
import type { LlmsTranslateQualityReason } from "../lib/ai/llms-translate"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onOpenOnboarding?: () => void
}

const LLMS_AI_CONCURRENCY = 3

type LlmsBatchEntryMeta =
  | {
      kind: "cms"
      collectionId: string
      rowId: string
      titleField: string
      summaryField?: string
    }
  | {
      kind: "page"
      pageId: string
    }

interface LlmsTranslateJob {
  locale: LocaleInfo
  entries: LlmsTranslateEntryInput[]
  metaById: Map<string, LlmsBatchEntryMeta>
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, limit), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(items[index]!, index)
      }
    }),
  )

  return results
}

/**
 * Persisted llms.txt configuration. Backwards-compat note:
 *
 *   v1 stored a single `collectionId: string | null`. v2 (this version)
 *   stores `collectionIds: string[]`. The migration runs at read time
 *   in {@link migrateConfig} so existing users see their previous
 *   single-collection selection preserved as a one-element array.
 *
 * Same migration shape we used for the SchemaScan v1→v2 split, kept
 * intentionally simple — the storage layer is small enough that a
 * one-pass adapter at config-load is cheaper than versioned schemas.
 */
/**
 * Legacy config shape — only relevant during read-side migration.
 * Once migrated, `LlmsConfig` is the only shape that reaches state.
 */
interface LegacyLlmsConfig {
  collectionId?: string | null
  titleField?: string
  summaryField?: string
}

const DEFAULTS: LlmsConfig = {
  siteName: "",
  siteSummary: "",
  longDescription: "",
  baseUrl: "",
  localizedPaths: true,
  collectionIds: [],
  pageIds: [],
  collectionFieldOverrides: {},
  useAiTranslate: false,
  aiProviderId: BUILTIN_PROVIDERS[0].id,
  aiModelId: BUILTIN_PROVIDERS[0].models[0].id,
}

/**
 * Read-time migration from v1 (`collectionId`) to v2 (`collectionIds[]`).
 * Returns the migrated config; never throws — falls back to DEFAULTS
 * on any unexpected shape.
 */
function migrateConfig(raw: unknown): LlmsConfig {
  if (!raw || typeof raw !== "object") return DEFAULTS
  const r = raw as Partial<LlmsConfig> & LegacyLlmsConfig
  const collectionIds: string[] = Array.isArray(r.collectionIds)
    ? r.collectionIds
    : r.collectionId
      ? [r.collectionId]
      : []
  // v1's global titleField/summaryField are dropped — see the
  // collectionFieldOverrides JSDoc for rationale. The new
  // auto-detect heuristic covers nearly every default schema, so
  // most v1 users will see no behaviour change at all.
  const overrides =
    r.collectionFieldOverrides &&
    typeof r.collectionFieldOverrides === "object"
      ? r.collectionFieldOverrides
      : {}
  const providerIds = new Set(BUILTIN_PROVIDERS.map((p) => p.id))
  const aiProviderId =
    r.aiProviderId && providerIds.has(r.aiProviderId)
      ? r.aiProviderId
      : DEFAULTS.aiProviderId
  const currentProvider =
    BUILTIN_PROVIDERS.find((p) => p.id === aiProviderId) ??
    BUILTIN_PROVIDERS[0]
  const modelIds = new Set(currentProvider.models.map((m) => m.id))
  return {
    siteName: r.siteName ?? DEFAULTS.siteName,
    siteSummary: r.siteSummary ?? DEFAULTS.siteSummary,
    longDescription: r.longDescription ?? DEFAULTS.longDescription,
    baseUrl: r.baseUrl ?? DEFAULTS.baseUrl,
    localizedPaths: r.localizedPaths ?? DEFAULTS.localizedPaths,
    collectionIds,
    pageIds: Array.isArray(r.pageIds) ? r.pageIds : DEFAULTS.pageIds,
    collectionFieldOverrides: overrides,
    useAiTranslate: r.useAiTranslate ?? DEFAULTS.useAiTranslate,
    aiProviderId,
    aiModelId:
      r.aiModelId && modelIds.has(r.aiModelId)
        ? r.aiModelId
        : currentProvider.models[0]?.id ?? DEFAULTS.aiModelId,
  }
}

function llmsConfigSignature(config: LlmsConfig): string {
  return JSON.stringify(config)
}

/**
 * Resolve the title / summary field names for a given collection,
 * applying override-then-auto-detect. Returns nulls when both
 * paths fail (collection has no overrides AND no field matches a
 * default candidate) — caller surfaces that as a "needs config"
 * warning.
 *
 * Pure / synchronous — used at both render time (to display the
 * detected names in the picker) and generate time (to read the
 * actual field values from CMS rows). Centralizing the resolution
 * here means the picker shows EXACTLY what generation will use.
 */
/**
 * Lifecycle states for the inline ✨ AI suggest panel. We use the
 * same machinery for both the one-line summary and the long
 * description, distinguished by `target`. Single state object so
 * only one panel can be open at a time — opening summary closes
 * long description, and vice versa.
 */
type SuggestTarget = "summary" | "longDescription"

export function LlmsTxtView({
  onBack,
  onOpenSettings,
  onOpenOnboarding,
}: Props) {
  const { t } = useI18n()
  const { locales } = useLocales()
  const gate = useFeatureGate()
  const { collections, loading: collectionsLoading, reload: reloadCollections } =
    useCollections()
  const [config, setConfig] = useState<LlmsConfig>(DEFAULTS)
  const [generated, setGenerated] = useState<GeneratedLlmsFile[]>([])
  const [step, setStep] = useState<LlmsStep>("setup")
  const [resultLocale, setResultLocale] = useState("")
  const [busy, setBusy] = useState(false)
  const [progressLabel, setProgressLabel] = useState<string>("")
  const [hasAiKey, setHasAiKey] = useState(false)
  const [brandVoice, setBrandVoice] = useState<string>("")
  const [customConfigs, setCustomConfigs] = useState<CustomProviderConfig[]>([])

  /**
   * Static page scan state. We don't auto-scan on mount because the
   * scan reads every WebPageNode in the project and may take a beat
   * on large sites — instead the user clicks "Scan pages" to populate
   * the picker. `null` means "haven't scanned yet" (different from
   * `[]` which means "scanned, no static pages found").
   */
  const [staticPages, setStaticPages] = useState<StaticPageEntry[] | null>(null)
  const [pagesScanning, setPagesScanning] = useState(false)
  const [pagesScanPartial, setPagesScanPartial] = useState(false)

  /**
   * AI suggest panel — shared between summary and long description.
   * `null` target means panel closed. Opening one target while
   * another is open replaces it (mutually exclusive).
   */
  const [suggestTarget, setSuggestTarget] = useState<SuggestTarget | null>(null)
  const [suggestKeywords, setSuggestKeywords] = useState("")
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [suggestion, setSuggestion] = useState<{
    text: string
    qualityOk: boolean
    changed: boolean
    target: SuggestTarget
  } | null>(null)
  const suggestPanelRef = useRef<HTMLDivElement | null>(null)
  const suggestResultRef = useRef<HTMLDivElement | null>(null)
  const configLoadedRef = useRef(false)
  const configSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const lastSavedConfigSignatureRef = useRef(llmsConfigSignature(DEFAULTS))
  const lastGenerateConfigSignatureRef = useRef("")

  useEffect(() => {
    let cancelled = false
    void readProjectJsonCache(StorageKeys.LastLlmsTxt, DEFAULTS).then((raw) => {
      if (cancelled) return
      const migrated = migrateConfig(raw)
      setConfig(migrated)
      lastSavedConfigSignatureRef.current = llmsConfigSignature(migrated)
      configLoadedRef.current = true
    })
    void readString(StorageKeys.BrandVoice).then((v) => v && setBrandVoice(v))
    void readCustomProviders().then(setCustomConfigs)

    return () => {
      cancelled = true
      if (configSaveTimerRef.current) {
        clearTimeout(configSaveTimerRef.current)
        configSaveTimerRef.current = null
      }
    }
  }, [])

  const saveConfigNow = useCallback(
    async (options?: { notifyError?: boolean }) => {
      if (!configLoadedRef.current) return true
      if (configSaveTimerRef.current) {
        clearTimeout(configSaveTimerRef.current)
        configSaveTimerRef.current = null
      }

      const signature = llmsConfigSignature(config)
      if (signature === lastSavedConfigSignatureRef.current) return true

      const ok = await writeProjectJsonCache(StorageKeys.LastLlmsTxt, config, {
        pluginDataMaxBytes: 900,
      })
      if (ok) {
        lastSavedConfigSignatureRef.current = signature
      } else if (options?.notifyError) {
        framer.notify(t("llms.configSaveFailed"), { variant: "warning" })
      }
      return ok
    },
    [config, t],
  )

  useEffect(() => {
    if (!configLoadedRef.current) return

    const signature = llmsConfigSignature(config)
    if (signature === lastSavedConfigSignatureRef.current) return

    configSaveTimerRef.current = setTimeout(() => {
      configSaveTimerRef.current = null
      void saveConfigNow({ notifyError: false })
    }, 900)

    return () => {
      if (configSaveTimerRef.current) {
        clearTimeout(configSaveTimerRef.current)
        configSaveTimerRef.current = null
      }
    }
  }, [config, saveConfigNow])

  const allProviders: Provider[] = useMemo(
    () => [
      ...BUILTIN_PROVIDERS,
      ...customConfigs.map((c) => materializeCustomProvider(c)),
    ],
    [customConfigs],
  )
  const currentProvider = useMemo(
    () =>
      allProviders.find((p) => p.id === config.aiProviderId) ??
      allProviders[0],
    [allProviders, config.aiProviderId],
  )
  const currentModel = useMemo(
    () =>
      currentProvider.models.find((m) => m.id === config.aiModelId) ??
      currentProvider.models[0],
    [currentProvider, config.aiModelId],
  )

  useEffect(() => {
    if (!config.useAiTranslate) {
      setHasAiKey(false)
      return
    }
    let cancelled = false
    void readProviderKey(config.aiProviderId).then((key) => {
      if (!cancelled) setHasAiKey(Boolean(key))
    })
    return () => {
      cancelled = true
    }
  }, [config.aiProviderId, config.useAiTranslate])

  useEffect(() => {
    if (config.aiProviderId !== DEFAULTS.aiProviderId) return
    let cancelled = false
    void (async () => {
      const candidates: ProviderId[] = [
        ...BUILTIN_PROVIDERS.map((p) => p.id),
        ...customConfigs.map((c) => c.id),
      ]
      const chosen = await resolveInitialProvider(
        null,
        candidates,
        DEFAULTS.aiProviderId,
        readProviderKey,
      )
      if (cancelled) return
      if (chosen !== config.aiProviderId) {
        setConfig((prev) => ({ ...prev, aiProviderId: chosen }))
      }
    })()
    return () => {
      cancelled = true
    }
    // Run once when customConfigs first lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customConfigs])

  useEffect(() => {
    if (!currentProvider.models.some((m) => m.id === config.aiModelId)) {
      setConfig((prev) => ({
        ...prev,
        aiModelId: currentProvider.models[0].id,
      }))
    }
  }, [currentProvider, config.aiModelId])

  /**
   * Resolve picked CMS collection summaries in display order
   * (matching the order in `config.collectionIds`). We filter out
   * ids that don't resolve — happens when a collection was deleted
   * since the last config save. Stale ids are silently dropped at
   * render time and pruned on next config write.
   */
  const selectedCollections = useMemo(
    () =>
      config.collectionIds
        .map((id) => collections.find((c) => c.id === id) ?? null)
        .filter((c): c is NonNullable<typeof c> => c !== null),
    [collections, config.collectionIds],
  )

  /** Pages picked from the static-page scan, in stable scan order. */
  const selectedPages = useMemo(() => {
    if (!staticPages) return []
    const idSet = new Set(config.pageIds)
    return staticPages.filter((p) => idSet.has(p.id))
  }, [staticPages, config.pageIds])

  /** Total items across all picked collections — drives cost estimate. */
  const totalItemsAcrossCollections = useMemo(
    () =>
      selectedCollections.reduce((sum, c) => sum + c.itemCount, 0) +
      selectedPages.length,
    [selectedCollections, selectedPages],
  )

  const toggleCollection = (id: string) => {
    setConfig((prev) => {
      if (prev.collectionIds.includes(id)) {
        return {
          ...prev,
          collectionIds: prev.collectionIds.filter((x) => x !== id),
        }
      }
      return { ...prev, collectionIds: [...prev.collectionIds, id] }
    })
  }

  const togglePage = (id: string) => {
    setConfig((prev) => {
      if (prev.pageIds.includes(id)) {
        return { ...prev, pageIds: prev.pageIds.filter((x) => x !== id) }
      }
      return { ...prev, pageIds: [...prev.pageIds, id] }
    })
  }

  const handleScanPages = async () => {
    if (!config.baseUrl) {
      framer.notify(t("llms.pagesScanNeedsBaseUrl"), { variant: "warning" })
      return
    }
    setPagesScanning(true)
    setPagesScanPartial(false)
    try {
      const result = await scanStaticPages(config.baseUrl)
      setStaticPages(result.pages)
      setPagesScanPartial(result.partial)
      // First-time scan: preselect top-level pages so the designer
      // sees a sensible starting state. We don't override an
      // already-saved selection — only seed when pageIds is empty.
      setConfig((prev) =>
        prev.pageIds.length === 0
          ? { ...prev, pageIds: defaultPickedPageIds(result.pages) }
          : prev,
      )
      framer.notify(
        t("llms.pagesScanSuccess", { n: result.pages.length }),
        { variant: "success" },
      )
    } catch (e) {
      framer.notify(
        t("llms.pagesScanFailed", { error: (e as Error).message }),
        { variant: "error" },
      )
    } finally {
      setPagesScanning(false)
    }
  }

  /**
   * Generate llms.txt files. With no argument, regenerates all
   * locales (the "primary" footer button). With `onlyLocale` set,
   * regenerates only that one locale and SPLICES the result into
   * `generated[]` at the matching index — used by the per-file
   * "Retry this locale" affordance so designers can re-run AI on a
   * single failed file without re-translating the others.
   *
   * Why partial retry exists:
   *   AI quality validators (mixed-script, untranslated) can reject
   *   individual items / fields. Without per-locale retry, the only
   *   way to fix a failure is to regenerate ALL locales — which
   *   re-translates 4 locales worth of content to fix one. The
   *   strengthened prompts (P3, 2026-05) make retries cheap and
   *   high-quality, so giving the user direct retry control is the
   *   correct UX.
   *
   * Note: this function reads CMS items + AI credentials again on
   * retry. CMS reads are local (instant); credential read is one
   * async storage call. We DO NOT preserve in-memory accepts from
   * the previous run — items the AI succeeded on last time still
   * lack a localized title in CMS, so they get re-translated. With
   * Claude Haiku / GPT-4o-mini the cost is sub-cent per retry, far
   * outweighed by the UX win of "fix 1 file, not 4".
   */
  const handleGenerate = async (onlyLocale?: string) => {
    if (!config.siteName || !config.baseUrl) {
      framer.notify(t("llms.setSiteFirst"), { variant: "warning" })
      return
    }

    const useAiTranslateForRun = config.useAiTranslate && gate.isPro
    if (config.useAiTranslate && !gate.isPro) {
      setConfig((prev) =>
        prev.useAiTranslate ? { ...prev, useAiTranslate: false } : prev,
      )
    }
    if (
      useAiTranslateForRun &&
      !gate.check("llms_ai_translate", { localeCount: locales.length })
    ) {
      return
    }

    let aiApiKey: string | null = null
    if (useAiTranslateForRun) {
      aiApiKey = await readProviderKey(config.aiProviderId)
      if (!aiApiKey) {
        framer.notify(
          t("llms.aiProviderKeyMissing", {
            provider: currentProvider.name,
          }),
          { variant: "warning" },
        )
        return
      }
    }

    // Targeted-retry path filters the locale list once, then every
    // downstream loop iterates `targetLocales`. This keeps the cost
    // proportional to "locales actually being regenerated" rather
    // than always linear in `locales.length`.
    let targetLocales = onlyLocale
      ? locales.filter((l) => l.code === onlyLocale)
      : locales

    if (!gate.isPro) {
      const hasNonDefault = targetLocales.some((l) => !l.isDefault)
      if (onlyLocale && hasNonDefault) {
        if (
          !gate.check("llms_multi_locale", {
            localeCount: locales.length,
            nonDefaultLocale: true,
          })
        ) {
          return
        }
      }
      targetLocales = targetLocales.filter((l) => l.isDefault)
      if (targetLocales.length === 0) {
        if (
          !gate.check("llms_generate", {
            localeCount: locales.length,
            nonDefaultLocale: Boolean(onlyLocale),
          })
        ) {
          return
        }
      }
    }

    if (onlyLocale && targetLocales.length === 0) {
      // Defensive — UI should never produce an unknown locale code.
      framer.notify(t("llms.regenerateLocaleNotFound"), { variant: "error" })
      return
    }

    setBusy(true)
    setProgressLabel("")
    try {
      const aiCredentials = aiApiKey
        ? {
            providerId: config.aiProviderId,
            modelId: config.aiModelId,
            apiKey: aiApiKey,
            customProvider: currentProvider.custom
              ? currentProvider
              : undefined,
          }
        : null

      // Per-locale buckets. Each entry is keyed by locale code so
      // the final loop can stitch the file deterministically.
      const sectionsPerLocale = new Map<string, LlmsTxtSection[]>()
      const skippedPerLocale = new Map<string, SkippedItem[]>()
      // Per-locale duplicate-title groups, tagged with the
      // collection name so the UI can render "Article: 2 rows share
      // the title 'X'". Aggregated across collections; clearing on
      // each generation.
      const duplicateTitlesPerLocale = new Map<
        string,
        Array<DuplicateTitleGroup & { collectionName: string }>
      >()
      const aiFailedPerLocale = new Map<string, AiFailedItem[]>()
      const summaryPerLocale = new Map<string, string>()
      const summaryFlagPerLocale = new Map<
        string,
        LlmsTranslateQualityReason
      >()
      const longDescPerLocale = new Map<string, string>()
      const longDescFlagPerLocale = new Map<
        string,
        LlmsTranslateQualityReason
      >()

      for (const locale of targetLocales) {
        sectionsPerLocale.set(locale.code, [])
        skippedPerLocale.set(locale.code, [])
        duplicateTitlesPerLocale.set(locale.code, [])
        aiFailedPerLocale.set(locale.code, [])
      }

      // ---------- CMS collections (one section per collection) ----------
      // Pre-load every collection's items once. Then per-locale we
      // optionally translate and synthesize a section. Reading the
      // CMS once across all locales avoids N×M reads when the user
      // has many collections × many locales.
      const itemsByCollection = new Map<string, CollectionItemRow[]>()
      const collectionRows = await Promise.all(
        selectedCollections.map(async (collection) => [
          collection.id,
          await readCollectionItems(collection.id),
        ] as const),
      )
      for (const [collectionId, rows] of collectionRows) {
        itemsByCollection.set(collectionId, rows)
      }

      const collectionFieldsById = new Map<
        string,
        { titleField: string; summaryField: string }
      >()
      for (const collection of selectedCollections) {
        const fields = resolveCollectionFields(
          collection,
          config.collectionFieldOverrides,
        )
        collectionFieldsById.set(collection.id, {
          titleField: fields.title ?? "Title",
          summaryField: fields.summary ?? "Summary",
        })
      }

      const rowsByCollectionByLocale = new Map<
        string,
        Map<string, CollectionItemRow[]>
      >()
      const pagesByLocale = new Map<string, StaticPageEntry[]>()
      for (const locale of targetLocales) {
        const rowsByCollection = new Map<string, CollectionItemRow[]>()
        for (const collection of selectedCollections) {
          rowsByCollection.set(
            collection.id,
            itemsByCollection.get(collection.id) ?? [],
          )
        }
        rowsByCollectionByLocale.set(locale.code, rowsByCollection)
        pagesByLocale.set(locale.code, selectedPages)
      }

      if (useAiTranslateForRun && aiCredentials) {
        const translateTargets = targetLocales.filter(
          (locale) => !locale.isDefault,
        )
        const jobs: LlmsTranslateJob[] = []
        for (const locale of translateTargets) {
          for (const collection of selectedCollections) {
            const baseItems = itemsByCollection.get(collection.id) ?? []
            const fields = collectionFieldsById.get(collection.id)
            if (!fields) continue
            const entries: LlmsTranslateEntryInput[] = []
            const metaById = new Map<string, LlmsBatchEntryMeta>()
            const needs = pickRowsNeedingTranslation(
              baseItems,
              locale,
              fields.titleField,
            )
            for (const row of needs) {
              const id = `cms:${collection.id}:${row.id}`
              const title = String(
                row.fieldValues[fields.titleField] ?? "",
              ).trim()
              const summary = String(
                row.fieldValues[fields.summaryField] ?? "",
              ).trim()
              entries.push({
                id,
                title,
                summary: summary || undefined,
                path: row.slug,
              })
              metaById.set(id, {
                kind: "cms",
                collectionId: collection.id,
                rowId: row.id,
                titleField: fields.titleField,
                summaryField: fields.summaryField,
              })
            }
            if (entries.length > 0) {
              jobs.push({ locale, entries, metaById })
            }
          }

          if (selectedPages.length > 0) {
            const entries: LlmsTranslateEntryInput[] = []
            const metaById = new Map<string, LlmsBatchEntryMeta>()
            for (const page of selectedPages) {
              const id = `page:${page.id}`
              entries.push({
                id,
                title: page.title,
                summary: page.description || undefined,
                path: page.rawPath,
              })
              metaById.set(id, {
                kind: "page",
                pageId: page.id,
              })
            }
            jobs.push({ locale, entries, metaById })
          }
        }

        const batchResults = await mapWithConcurrency(
          jobs,
          LLMS_AI_CONCURRENCY,
          async ({ locale, entries, metaById }) => {
            const cacheHit = readCachedLlmsTranslations(
              entries,
              locale,
              brandVoice || undefined,
            )
            let aiResult = {
              translated: cacheHit.translated,
              failed: [] as Awaited<
                ReturnType<typeof translateLlmsEntries>
              >["failed"],
              costUsd: 0,
              attempted: entries.length,
              succeeded: cacheHit.translated.size,
            }

            if (cacheHit.missing.length > 0) {
              setProgressLabel(
                t("llms.aiTranslatingProgress", {
                  locale: locale.name,
                  n: cacheHit.missing.length,
                }),
              )
              const fresh = await translateLlmsEntries({
                items: cacheHit.missing,
                locale,
                brandVoice: brandVoice || undefined,
                ai: aiCredentials,
              })
              rememberLlmsTranslations(
                cacheHit.missing,
                locale,
                fresh.translated,
                brandVoice || undefined,
              )
              aiResult = {
                translated: new Map([
                  ...cacheHit.translated,
                  ...fresh.translated,
                ]),
                failed: fresh.failed,
                costUsd: fresh.costUsd,
                attempted: entries.length,
                succeeded: cacheHit.translated.size + fresh.succeeded,
              }
            }
            return { locale, metaById, aiResult }
          },
        )

        for (const { locale, metaById, aiResult } of batchResults) {
          const rowsByCollection =
            rowsByCollectionByLocale.get(locale.code) ?? new Map()

          const affectedCollectionIds = new Set<string>()
          let hasPageTranslations = false
          for (const meta of metaById.values()) {
            if (meta.kind === "cms") {
              affectedCollectionIds.add(meta.collectionId)
            } else {
              hasPageTranslations = true
            }
          }

          for (const collectionId of affectedCollectionIds) {
            const baseItems: CollectionItemRow[] =
              rowsByCollection.get(collectionId) ??
              itemsByCollection.get(collectionId) ??
              []
            rowsByCollection.set(
              collectionId,
              baseItems.map((row) => {
                const id = `cms:${collectionId}:${row.id}`
                const translated = aiResult.translated.get(id)
                const meta = metaById.get(id)
                if (!translated || meta?.kind !== "cms") return { ...row }
                const existingForLocale =
                  row.fieldValuesByLocale[locale.id] ?? {}
                const merged: Record<string, unknown> = {
                  ...existingForLocale,
                  [meta.titleField]: translated.title,
                }
                if (meta.summaryField && translated.summary) {
                  merged[meta.summaryField] = translated.summary
                }
                return {
                  ...row,
                  fieldValuesByLocale: {
                    ...row.fieldValuesByLocale,
                    [locale.id]: merged,
                  },
                }
              }),
            )
          }
          rowsByCollectionByLocale.set(locale.code, rowsByCollection)

          if (hasPageTranslations) {
            const currentPages = pagesByLocale.get(locale.code) ?? selectedPages
            pagesByLocale.set(
              locale.code,
              currentPages.map((page) => {
                const translated = aiResult.translated.get(`page:${page.id}`)
                if (!translated) return page
                return {
                  ...page,
                  title: translated.title,
                  description: translated.summary ?? page.description,
                }
              }),
            )
          }

          aiFailedPerLocale.get(locale.code)?.push(
            ...aiResult.failed.map((f) => {
              const meta = metaById.get(f.item.itemId)
              return {
                itemId:
                  meta?.kind === "cms"
                    ? meta.rowId
                    : meta?.kind === "page"
                      ? meta.pageId
                      : f.item.itemId,
                defaultTitle: f.item.defaultTitle,
                reason: f.reason,
              }
            }),
          )
        }
      }

      for (const collection of selectedCollections) {
        const baseItems = itemsByCollection.get(collection.id) ?? []
        const fields = collectionFieldsById.get(collection.id)
        const titleField = fields?.titleField ?? "Title"
        const summaryField = fields?.summaryField ?? "Summary"

        for (const locale of targetLocales) {
          const rowsForLocale =
            rowsByCollectionByLocale
              .get(locale.code)
              ?.get(collection.id) ?? baseItems
          const result = buildSectionFromCollection(
            collection,
            rowsForLocale,
            locale,
            config.baseUrl,
            {
              titleField,
              summaryField,
              localizedPaths: config.localizedPaths,
            },
          )
          sectionsPerLocale.get(locale.code)?.push(result.section)
          skippedPerLocale
            .get(locale.code)
            ?.push(...result.skipped)
          duplicateTitlesPerLocale.get(locale.code)?.push(
            ...result.duplicateTitles.map((g) => ({
              ...g,
              collectionName: collection.name,
            })),
          )
        }
      }

      // ---------- Static pages (single ## Pages section) ----------
      if (selectedPages.length > 0) {
        for (const locale of targetLocales) {
            const pagesForLocale =
              pagesByLocale.get(locale.code) ?? selectedPages
            // Localized prefix for non-default locales — same rule
            // as the CMS section, applied at link-emit time. We don't
            // ship per-locale page slugs because Framer's static
            // pages share their default-locale slug across all
            // locales (the prefix changes, the path doesn't).
            const localePrefix =
              config.localizedPaths && !locale.isDefault
                ? `/${locale.slug}`
                : ""

            const pagesSection: LlmsTxtSection = {
              title: t("llms.pagesSectionTitle"),
              links: pagesForLocale.map((p) => ({
                label: p.title,
                url: `${config.baseUrl.replace(/\/$/, "")}${localePrefix}${p.rawPath}`,
                summary: p.description || undefined,
              })),
            }
          sectionsPerLocale.get(locale.code)?.push(pagesSection)
        }
      }

      // ---------- Site summary translation ----------
      if (
        useAiTranslateForRun &&
        aiCredentials &&
        config.siteSummary.trim()
      ) {
        const headerResults = await mapWithConcurrency(
          targetLocales.filter((locale) => !locale.isDefault),
          LLMS_AI_CONCURRENCY,
          async (locale) => {
            setProgressLabel(
              t("llms.aiTranslatingHeader", { locale: locale.name }),
            )
            const headerResult = await translateLlmsHeader({
              siteName: config.siteName,
              siteSummary: config.siteSummary,
              locale,
              brandVoice: brandVoice || undefined,
              ai: aiCredentials,
            })
            return { locale, headerResult }
          },
        )

        for (const { locale, headerResult } of headerResults) {
          summaryPerLocale.set(locale.code, headerResult.siteSummary)
          if (headerResult.qualityFlag) {
            summaryFlagPerLocale.set(locale.code, headerResult.qualityFlag)
          }
        }
      }

      // ---------- Long description translation ----------
      if (
        useAiTranslateForRun &&
        aiCredentials &&
        config.longDescription.trim()
      ) {
        const longDescriptionResults = await mapWithConcurrency(
          targetLocales.filter((locale) => !locale.isDefault),
          LLMS_AI_CONCURRENCY,
          async (locale) => {
            setProgressLabel(
              t("llms.aiTranslatingLongDescription", {
                locale: locale.name,
              }),
            )
            const longResult = await translateLlmsLongDescription({
              siteName: config.siteName,
              longDescription: config.longDescription,
              locale,
              brandVoice: brandVoice || undefined,
              ai: aiCredentials,
            })
            return { locale, longResult }
          },
        )

        for (const { locale, longResult } of longDescriptionResults) {
          longDescPerLocale.set(locale.code, longResult.longDescription)
          if (longResult.qualityFlag) {
            longDescFlagPerLocale.set(locale.code, longResult.qualityFlag)
          }
        }
      }

      const files = targetLocales.map((locale) => {
        const summaryForLocale =
          summaryPerLocale.get(locale.code) ?? config.siteSummary
        const longForLocale =
          longDescPerLocale.get(locale.code) ?? config.longDescription
        const content = renderLlmsTxt({
          siteName: config.siteName,
          siteSummary: summaryForLocale,
          longDescription: longForLocale,
          baseUrl: config.baseUrl,
          locale,
          localizedPaths: config.localizedPaths,
          sections: sectionsPerLocale.get(locale.code) ?? [],
        })
        const filename = locale.isDefault
          ? "llms.txt"
          : `llms-${locale.code.toLowerCase()}.txt`
        return {
          filename,
          content,
          localeCode: locale.code,
          localeName: locale.name,
          skipped: skippedPerLocale.get(locale.code) ?? [],
          duplicateTitles: duplicateTitlesPerLocale.get(locale.code) ?? [],
          aiFailed: aiFailedPerLocale.get(locale.code) ?? [],
          headerFlag: summaryFlagPerLocale.get(locale.code) ?? null,
          longDescriptionFlag: longDescFlagPerLocale.get(locale.code) ?? null,
        }
      })

      // Splice on retry, replace on full generate. The splice path
      // preserves any locales that are still good — the user
      // explicitly clicked "retry THIS locale" and expects the
      // others to stay untouched.
      if (onlyLocale) {
        const retried = files[0]
        if (retried) {
          setGenerated((prev) => {
            const idx = prev.findIndex(
              (g) => g.localeCode === onlyLocale,
            )
            if (idx < 0) return [...prev, retried]
            const next = prev.slice()
            next[idx] = retried
            return next
          })
          // Surface a notification keyed off the new state of the
          // retried file so the designer immediately knows whether
          // the retry actually fixed anything (or just produced new
          // failures of the same kind).
          const stillBad =
            retried.aiFailed.length > 0 ||
            retried.headerFlag !== null ||
            retried.longDescriptionFlag !== null
          framer.notify(
            stillBad
              ? t("llms.regenerateLocaleStillFailed", {
                  locale: retried.localeName,
                })
              : t("llms.regenerateLocaleSuccess", {
                  locale: retried.localeName,
                }),
            { variant: stillBad ? "warning" : "success" },
          )
        }
      } else {
        setGenerated(files)
        setStep("review")
        setResultLocale(files[0]?.localeCode ?? "")
        lastGenerateConfigSignatureRef.current = llmsConfigSignature(config)
      }
      // Skip persistence + the generic success toast on per-locale
      // retries: the config didn't change (retry uses the same
      // selection state) and the targeted toast above already gave
      // the user actionable feedback. Keeping the persistence path
      // for full generations only also avoids a small race where a
      // partial retry could overwrite a freshly-edited config in
      // flight.
      if (!onlyLocale) {
        // Drop any stale ids before persisting — keeps the persisted
        // state honest after a collection is deleted in Framer.
        const prunedConfig: LlmsConfig = {
          ...config,
          collectionIds: config.collectionIds.filter((id) =>
            collections.some((c) => c.id === id),
          ),
          pageIds: staticPages
            ? config.pageIds.filter((id) =>
                staticPages.some((p) => p.id === id),
              )
            : config.pageIds,
        }
        const persisted = await writeProjectJsonCache(
          StorageKeys.LastLlmsTxt,
          prunedConfig,
          { pluginDataMaxBytes: 900 },
        )
        if (persisted) {
          lastSavedConfigSignatureRef.current = llmsConfigSignature(prunedConfig)
          if (llmsConfigSignature(config) !== llmsConfigSignature(prunedConfig)) {
            setConfig(prunedConfig)
          }
        }
        if (useAiTranslateForRun) {
          void writeString(StorageKeys.PreferredProvider, config.aiProviderId)
          void writeString(StorageKeys.PreferredModel, config.aiModelId)
        }
        framer.notify(t("llms.generateSuccess", { n: files.length }), {
          variant: "success",
        })
      }
    } catch (e) {
      framer.notify(t("llms.generationFailed", { error: (e as Error).message }), {
        variant: "error",
      })
    } finally {
      setBusy(false)
      setProgressLabel("")
    }
  }

  const copy = async (content: string) => {
    await navigator.clipboard.writeText(content)
    framer.notify(t("llms.copySuccess"), { variant: "success" })
  }

  const download = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const defaultLocale = useMemo(
    () => locales.find((l) => l.isDefault) ?? locales[0] ?? null,
    [locales],
  )

  /**
   * Open or close the AI suggest panel for a given target. Opening
   * one closes any other open panel and resets the suggestion. We
   * keep both targets reusing the same lifecycle state because at
   * any moment only one panel makes sense to be visible.
   */
  const toggleSuggestPanel = (target: SuggestTarget) => {
    if (suggestTarget === target) {
      setSuggestTarget(null)
      setSuggestion(null)
      setSuggestKeywords("")
    } else {
      setSuggestTarget(target)
      setSuggestion(null)
      setSuggestKeywords("")
    }
  }

  const scrollSuggestPanelIntoView = (block: ScrollLogicalPosition = "nearest") => {
    requestAnimationFrame(() => {
      suggestPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block,
      })
    })
  }

  useEffect(() => {
    if (suggestTarget) {
      scrollSuggestPanelIntoView("center")
    }
  }, [suggestTarget])

  useEffect(() => {
    if (!suggestion || suggestion.target !== suggestTarget) return
    requestAnimationFrame(() => {
      suggestResultRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    })
  }, [suggestTarget, suggestion])

  const requestSuggestion = async (keywordsOverride?: string) => {
    if (suggestBusy) return
    if (!suggestTarget) return
    if (!defaultLocale) {
      framer.notify(t("llms.suggestNoDefaultLocale"), { variant: "warning" })
      return
    }
    if (!config.siteName.trim()) {
      framer.notify(t("llms.suggestNeedsSiteName"), { variant: "warning" })
      return
    }
    const apiKey = await readProviderKey(config.aiProviderId)
    if (!apiKey) {
      framer.notify(
        t("llms.aiProviderKeyMissing", { provider: currentProvider.name }),
        { variant: "warning" },
      )
      return
    }
    setSuggestBusy(true)
    setSuggestion(null)
    scrollSuggestPanelIntoView("center")
    const effectiveKeywords =
      keywordsOverride !== undefined ? keywordsOverride : suggestKeywords
    try {
      if (suggestTarget === "summary") {
        const result = await generateLlmsSummary({
          siteName: config.siteName,
          draft: config.siteSummary || undefined,
          keywords: effectiveKeywords || undefined,
          targetLanguage: defaultLocale.code,
          brandVoice: brandVoice || undefined,
          ai: {
            providerId: config.aiProviderId,
            modelId: config.aiModelId,
            apiKey,
            customProvider: currentProvider.custom ? currentProvider : undefined,
          },
        })
        setSuggestion({
          text: result.summary,
          qualityOk: result.qualityOk,
          changed: result.changed,
          target: "summary",
        })
      } else {
        // Long-description mode pulls scanned page paths in as
        // factual scaffolding for the AI. Without these the model
        // hallucinates generic capabilities; with them the bullets
        // map back to real pages on the site.
        const knownPaths = staticPages
          ? staticPages
              .filter((p) => !p.isHomepage)
              .map((p) => p.rawPath)
          : undefined
        const result = await generateLlmsLongDescription({
          siteName: config.siteName,
          siteSummary: config.siteSummary || undefined,
          draft: config.longDescription || undefined,
          keywords: effectiveKeywords || undefined,
          knownPaths,
          targetLanguage: defaultLocale.code,
          brandVoice: brandVoice || undefined,
          ai: {
            providerId: config.aiProviderId,
            modelId: config.aiModelId,
            apiKey,
            customProvider: currentProvider.custom ? currentProvider : undefined,
          },
        })
        setSuggestion({
          text: result.longDescription,
          qualityOk: result.qualityOk,
          changed: result.changed,
          target: "longDescription",
        })
      }
      void writeString(StorageKeys.PreferredProvider, config.aiProviderId)
      void writeString(StorageKeys.PreferredModel, config.aiModelId)
    } catch (e) {
      framer.notify(
        t("llms.suggestFailed", { error: (e as Error).message }),
        { variant: "error" },
      )
    } finally {
      setSuggestBusy(false)
    }
  }

  const acceptSuggestion = () => {
    if (!suggestion) return
    setConfig((prev) =>
      suggestion.target === "summary"
        ? { ...prev, siteSummary: suggestion.text }
        : { ...prev, longDescription: suggestion.text },
    )
    setSuggestion(null)
    setSuggestTarget(null)
    setSuggestKeywords("")
    framer.notify(
      t(
        suggestion.target === "summary"
          ? "llms.suggestApplied"
          : "llms.suggestAppliedLong",
      ),
      { variant: "success" },
    )
  }

  const dismissSuggestion = () => {
    setSuggestion(null)
    setSuggestTarget(null)
    setSuggestKeywords("")
  }

  const downloadAll = () => {
    if (generated.length === 0) return
    const entries: Record<string, [Uint8Array, { level: 0 }]> = {}
    const filenames = generated.map((f) => f.filename)
    entries["DEPLOY.md"] = [
      strToU8(
        buildLlmsDeployReadme({
          siteName: config.siteName || "Site",
          baseUrl: config.baseUrl || "https://example.com",
          filenames,
          framerStaticFilesUrl: FRAMER_STATIC_FILES_DOCS,
        }),
      ),
      { level: 0 },
    ]
    for (const f of generated) {
      entries[f.filename] = [strToU8(f.content), { level: 0 }]
    }
    const zipped = zipSync(entries, { level: 0 })
    const ab = new ArrayBuffer(zipped.byteLength)
    new Uint8Array(ab).set(zipped)
    const blob = new Blob([ab], { type: "application/zip" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "polyglot-aeo-llms-txt.zip"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    void writeString(StorageKeys.LlmsDeployAcknowledged, "true")
    framer.notify(t("llms.downloadAllSuccess", { n: generated.length }), {
      variant: "success",
    })
  }

  const openFramerProject = () => {
    openFramerProjectsHub()
  }

  const handleBack = async () => {
    const saved = await saveConfigNow({ notifyError: true })
    if (saved) onBack()
  }

  const generateLabel =
    locales.length === 1
      ? t("llms.generateButton", { n: 1 })
      : t("llms.generateButtonPlural", { n: locales.length })
  const defaultOnlyGenerate =
    !gate.isPro && locales.some((locale) => !locale.isDefault)
  const defaultOnlyReview =
    !gate.isPro &&
    generated.length === 1 &&
    generated[0]?.localeCode === defaultLocale?.code &&
    locales.some((locale) => !locale.isDefault)

  const configChangedSinceGenerate = useMemo(() => {
    if (generated.length === 0 || !lastGenerateConfigSignatureRef.current) {
      return false
    }
    return (
      llmsConfigSignature(config) !== lastGenerateConfigSignatureRef.current
    )
  }, [config, generated.length])

  const goNextStep = () => {
    if (step === "setup") setStep("sources")
    else if (step === "sources") void handleGenerate()
    else if (step === "review") setStep("deploy")
  }

  const goBackStep = () => {
    if (step === "sources") setStep("setup")
    else if (step === "review") setStep("sources")
    else if (step === "deploy") setStep("review")
  }

  const handleStepChange = (next: LlmsStep) => {
    if ((next === "review" || next === "deploy") && generated.length === 0) {
      return
    }
    setStep(next)
    if (next === "review" && !resultLocale && generated[0]) {
      setResultLocale(generated[0].localeCode)
    }
  }

  const canGenerate =
    Boolean(config.siteName && config.baseUrl) &&
    !(config.useAiTranslate && !hasAiKey)

  /**
   * Inline AI suggest panel. Shared by both the summary and long
   * description fields — passing the target identifier disambiguates
   * which field accepts the suggestion when "Use this" is clicked.
   * Defined inline (not as a component) because it captures a lot
   * of view-local state and extracting would require threading 12+
   * props for marginal reuse benefit.
   */
  const renderSuggestPanel = (target: SuggestTarget) => {
    if (suggestTarget !== target) return null
    const isOptimize =
      target === "summary"
        ? config.siteSummary.trim().length > 0
        : config.longDescription.trim().length > 0
    // Header label tells the designer WHICH field this panel acts on.
    // Combined with the left accent border + uppercase header, the
    // panel reads as "AI assistant for [field name]" instead of
    // floating between two textareas.
    const targetLabel =
      target === "summary"
        ? t("llms.siteSummary")
        : t("llms.longDescription")
    const currentDraft =
      target === "summary" ? config.siteSummary : config.longDescription
    const suggestionHasNoUsefulChange =
      Boolean(suggestion && suggestion.target === target && !suggestion.changed)
    const quickDirections = [
      {
        label: t("llms.aiQuickTighter"),
        value: t("llms.aiQuickTighterInstruction"),
      },
      {
        label: t("llms.aiQuickAeo"),
        value: t("llms.aiQuickAeoInstruction"),
      },
      {
        label: t("llms.aiQuickBrand"),
        value: t("llms.aiQuickBrandInstruction"),
      },
    ]
    const runQuickDirection = (value: string) => {
      const trimmed = suggestKeywords.trim()
      const nextKeywords = !trimmed
        ? value
        : trimmed.includes(value)
          ? trimmed
          : `${trimmed}; ${value}`
      setSuggestKeywords(nextKeywords)
      void requestSuggestion(nextKeywords)
    }

    return (
      <div className="pa-ai-panel" ref={suggestPanelRef}>
        <div className="pa-ai-panel-header">
          <div>
            <span>{t("llms.aiPanelHeader", { field: targetLabel })}</span>
            <p>
              {target === "summary"
                ? isOptimize
                  ? t("llms.suggestPanelHelperOptimize")
                  : t("llms.suggestPanelHelperGenerate")
                : isOptimize
                  ? t("llms.longSuggestPanelHelperOptimize")
                  : t("llms.longSuggestPanelHelperGenerate")}
            </p>
          </div>
          <span className="pa-pill" data-tone="success">
            {currentProvider.name}
          </span>
        </div>
        <div className="pa-ai-quick-row" aria-label={t("llms.aiQuickLabel")}>
          {quickDirections.map((direction) => (
            <button
              key={direction.label}
              type="button"
              className="pa-ai-chip-button"
              onClick={() => runQuickDirection(direction.value)}
              disabled={suggestBusy}
            >
              {direction.label}
            </button>
          ))}
        </div>
        <label className="pa-label">
          {t("llms.aiPanelKeywordsLabel")}
          <textarea
            className="pa-textarea pa-ai-keywords-input"
            value={suggestKeywords}
            onChange={(e) => setSuggestKeywords(e.target.value)}
            placeholder={
              target === "summary"
                ? t("llms.suggestKeywordsPlaceholder")
                : t("llms.longSuggestKeywordsPlaceholder")
            }
            rows={2}
            disabled={suggestBusy}
          />
        </label>
        <details className="pa-ai-settings-details">
          <summary>
            {t("llms.aiAdvancedSettings")}
            <span>{currentProvider.name} · {currentModel.name}</span>
          </summary>
          <div className="pa-label-row">
            <label className="pa-label">
              {t("meta.providerTitle")}
              <select
                className="pa-select"
                value={config.aiProviderId}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    aiProviderId: e.target.value as ProviderId,
                  })
                }
                disabled={suggestBusy}
              >
                {allProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pa-label">
              {t("meta.modelTitle")}
              <select
                className="pa-select"
                value={config.aiModelId}
                onChange={(e) =>
                  setConfig({ ...config, aiModelId: e.target.value })
                }
                disabled={suggestBusy}
              >
                {currentProvider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.badge ? ` · ${m.badge}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="pa-input-hint" style={{ margin: 0 }}>
            {t("llms.suggestModelHint")}
          </p>
        </details>
        {suggestion && suggestion.target === target && (
          <div className="pa-ai-result" ref={suggestResultRef}>
            <span className="pa-ai-result-title">
              {t("llms.suggestResultTitle")}
            </span>
            <div className="pa-ai-result-compare">
              <div>
                <span>{t("llms.aiResultCurrent")}</span>
                <pre>{currentDraft || "—"}</pre>
              </div>
              <div data-suggested="true">
                <span>{t("llms.aiResultSuggested")}</span>
                <pre>{suggestion.text}</pre>
              </div>
            </div>
            {!suggestion.qualityOk && (
              <p className="pa-section-helper">
                <span className="pa-pill" data-tone="warning">
                  {t("llms.suggestLowQualityPill")}
                </span>{" "}
                {suggestionHasNoUsefulChange
                  ? t("llms.suggestNoChangeHint")
                  : t("llms.suggestLowQualityHint")}
              </p>
            )}
            <div className="pa-button-row" style={{ marginTop: 2 }}>
              <button
                type="button"
                className={!suggestion.qualityOk ? "pa-button-primary" : undefined}
                onClick={() => void requestSuggestion()}
                disabled={suggestBusy}
              >
                {t("llms.suggestRetry")}
              </button>
              <button
                type="button"
                className={suggestion.qualityOk ? "pa-button-primary" : undefined}
                onClick={acceptSuggestion}
                disabled={!suggestion.qualityOk || suggestBusy}
                title={
                  !suggestion.qualityOk
                    ? t("llms.suggestNotUsableHint")
                    : undefined
                }
              >
                {suggestion.qualityOk
                  ? t("llms.suggestUse")
                  : t("llms.suggestNotUsable")}
              </button>
              <button type="button" onClick={dismissSuggestion}>
                {t("llms.aiKeepOriginal")}
              </button>
            </div>
          </div>
        )}
        {!(suggestion && suggestion.target === target) && (
          <div className="pa-button-row">
            <button
              type="button"
              className="pa-button-primary"
              onClick={() => void requestSuggestion()}
              disabled={suggestBusy}
            >
              {suggestBusy
                ? t("llms.suggestBusy")
                : isOptimize
                  ? t("llms.suggestOptimizeAction")
                  : t("llms.suggestGenerateAction")}
            </button>
            <button type="button" onClick={dismissSuggestion}>
              {t("common.cancel")}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <TopBar
        title={t("llms.title")}
        onBack={() => void handleBack()}
        onOpenSettings={onOpenSettings}
        onOpenOnboarding={onOpenOnboarding}
      />
      <LlmsStepBar
        step={step}
        hasGenerated={generated.length > 0}
        onStepChange={handleStepChange}
      />
      <div className="pa-scroll pa-scroll--with-footer">
        {configChangedSinceGenerate &&
          (step === "setup" || step === "sources") && (
            <p className="pa-section-helper" style={{ margin: "0 0 8px" }}>
              <span className="pa-pill" data-tone="warning">
                {t("llms.configChangedHint")}
              </span>
            </p>
          )}

        {step === "setup" && (
          <LlmsSetupStep
            config={config}
            setConfig={setConfig}
            locales={locales}
            renderSuggestPanel={renderSuggestPanel}
            onToggleSuggest={toggleSuggestPanel}
          />
        )}

        {step === "sources" && (
          <LlmsSourcesStep
            config={config}
            setConfig={setConfig}
            locales={locales}
            collections={collections}
            collectionsLoading={collectionsLoading}
            onReloadCollections={reloadCollections}
            staticPages={staticPages}
            pagesScanning={pagesScanning}
            pagesScanPartial={pagesScanPartial}
            onScanPages={() => void handleScanPages()}
            onToggleCollection={toggleCollection}
            onTogglePage={togglePage}
            allProviders={allProviders}
            currentProvider={currentProvider}
            currentModel={currentModel}
            hasAiKey={hasAiKey}
            totalItemsAcrossCollections={totalItemsAcrossCollections}
          />
        )}

        {step === "review" && (
          <LlmsReviewStep
            generated={generated}
            resultLocaleCode={
              resultLocale || generated[0]?.localeCode || ""
            }
            onResultLocaleChange={setResultLocale}
            defaultLocaleCode={defaultLocale?.code}
            useAiTranslate={config.useAiTranslate}
            busy={busy}
            progressLabel={progressLabel}
            onRegenerateLocale={(code) => void handleGenerate(code)}
            onCopy={(text) => void copy(text)}
            onDownload={download}
          />
        )}

        {step === "deploy" && (
          <LlmsDeployStep
            generated={generated}
            onDownloadAll={downloadAll}
            onOpenFramerProject={openFramerProject}
          />
        )}

      </div>

      <div className="pa-footer pa-footer-row">
        {(step === "sources" || step === "review" || step === "deploy") && (
          <button
            type="button"
            className="pa-footer-secondary"
            onClick={goBackStep}
            disabled={busy}
          >
            {step === "deploy" ? t("llms.backToReview") : t("llms.stepBack")}
          </button>
        )}
        {step === "setup" && (
          <button
            type="button"
            className="pa-button-primary"
            onClick={goNextStep}
          >
            {t("llms.stepNextSources")}
          </button>
        )}
        {step === "sources" && (
          <span className="pa-footer-primary-col">
            <button
              type="button"
              className="pa-button-primary"
              onClick={goNextStep}
              disabled={busy || !canGenerate}
            >
              {busy
                ? progressLabel || t("common.generating")
                : defaultOnlyGenerate
                  ? t("llms.stepGenerateDefault")
                  : t("llms.stepGenerate", { n: locales.length })}
            </button>
            {defaultOnlyGenerate && !busy && (
              <span className="pa-footer-hint">
                {t("llms.freeDefaultGenerateHint", { n: locales.length })}
              </span>
            )}
          </span>
        )}
        {step === "review" && (
          <>
            <button
              type="button"
              className="pa-footer-secondary"
              onClick={() => void handleGenerate()}
              disabled={busy || !canGenerate}
            >
              {busy
                ? progressLabel || t("common.generating")
                : generated.length > 0
                  ? defaultOnlyReview
                    ? t("llms.regenerateDefault")
                    : t("llms.regenerateAll")
                  : generateLabel}
            </button>
            <button
              type="button"
              className="pa-button-primary"
              onClick={() => setStep("deploy")}
            >
              {t("llms.goToDeploy")}
            </button>
          </>
        )}
        {step === "deploy" && (
          <>
            {generated.length > 1 && (
              <button
                type="button"
                className="pa-footer-secondary"
                onClick={downloadAll}
              >
                {t("llms.downloadAll", { n: generated.length })}
              </button>
            )}
            <button
              type="button"
              className="pa-button-primary"
              onClick={() => void handleBack()}
            >
              {t("llms.deployDone")}
            </button>
          </>
        )}
      </div>
    </>
  )
}
