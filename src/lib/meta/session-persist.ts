import type { MetaQualityFlag } from "../ai/meta-quality"
import {
  readProjectJsonCache,
  writeProjectJsonCache,
} from "../project-cache"
import { StorageKeys } from "../storage"
import type {
  GeneratedMeta,
  MetaResult,
  MetaStep,
} from "../../views/meta/types"

const PERSIST_VERSION = 1 as const
const MAX_ERROR_RAW = 400

export interface MetaSessionPersist {
  version: typeof PERSIST_VERSION
  savedAt: number
  draftSignature: string
  selectedPageId?: string
  step?: MetaStep
  resultLocaleId?: string
  results: MetaSessionResultRow[]
}

/** Persisted row — omits full AI `rawText` unless parse failed (truncated). */
export interface MetaSessionResultRow {
  localeId: string
  localeCode: string
  localeName: string
  language: string
  isDefaultLocale: boolean
  parsed: GeneratedMeta | null
  rawText: string
  costUsd?: number
  qualityFlags: MetaQualityFlag[]
}

export function toMetaSessionRows(results: MetaResult[]): MetaSessionResultRow[] {
  return results.map((r) => ({
    localeId: r.localeId,
    localeCode: r.localeCode,
    localeName: r.localeName,
    language: r.language,
    isDefaultLocale: r.isDefaultLocale,
    parsed: r.parsed,
    rawText: r.parsed
      ? ""
      : r.rawText.length > MAX_ERROR_RAW
        ? `${r.rawText.slice(0, MAX_ERROR_RAW)}…`
        : r.rawText,
    costUsd: r.costUsd,
    qualityFlags: r.qualityFlags,
  }))
}

export function fromMetaSessionRows(rows: MetaSessionResultRow[]): MetaResult[] {
  return rows.map((r) => ({ ...r }))
}

export function buildMetaSessionPayload(input: {
  draftSignature: string
  selectedPageId?: string
  step: MetaStep
  resultLocaleId: string
  results: MetaResult[]
}): MetaSessionPersist {
  return {
    version: PERSIST_VERSION,
    savedAt: Date.now(),
    draftSignature: input.draftSignature,
    selectedPageId: input.selectedPageId,
    step: input.step,
    resultLocaleId: input.resultLocaleId || input.results[0]?.localeId,
    results: toMetaSessionRows(input.results),
  }
}

/** Pre-v1 blob written before `version` field existed. */
interface LegacyMetaSessionPersist {
  savedAt?: number
  draftSignature?: string
  selectedPageId?: string
  step?: MetaStep
  resultLocaleId?: string
  results: MetaResult[]
}

function normalizePersisted(raw: unknown): MetaSessionPersist | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as LegacyMetaSessionPersist & { version?: number }
  if (!Array.isArray(o.results) || o.results.length === 0) return null

  if (o.version === PERSIST_VERSION) {
    return o as MetaSessionPersist
  }

  return {
    version: PERSIST_VERSION,
    savedAt: o.savedAt ?? Date.now(),
    draftSignature: o.draftSignature ?? "",
    selectedPageId: o.selectedPageId,
    step: o.step,
    resultLocaleId: o.resultLocaleId,
    results: toMetaSessionRows(o.results),
  }
}

export async function readMetaSessionPersist(): Promise<MetaSessionPersist | null> {
  const raw = await readProjectJsonCache<unknown>(
    StorageKeys.LastMetaResults,
    null,
  )
  return normalizePersisted(raw)
}

export async function writeMetaSessionPersist(
  payload: MetaSessionPersist,
): Promise<boolean> {
  return writeProjectJsonCache(StorageKeys.LastMetaResults, payload, {
    pluginDataMaxBytes: 900,
  })
}

export async function clearMetaSessionPersist(): Promise<boolean> {
  return writeProjectJsonCache(StorageKeys.LastMetaResults, null, {
    pluginDataMaxBytes: 900,
  })
}

export async function flushMetaSessionPersist(input: {
  draftSignature: string
  selectedPageId?: string
  step: MetaStep
  resultLocaleId: string
  results: MetaResult[]
}): Promise<boolean> {
  if (input.results.length === 0) {
    return clearMetaSessionPersist()
  }
  return writeMetaSessionPersist(buildMetaSessionPayload(input))
}
