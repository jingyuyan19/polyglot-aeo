import type { ProviderId } from "../../lib/ai/client"
import type { MetaQualityFlag } from "../../lib/ai/meta-quality"

export type MetaStep = "page" | "generate" | "review"

export interface GeneratedMeta {
  title?: string
  metaDescription?: string
  ogTitle?: string
  ogDescription?: string
  twitterTitle?: string
  twitterDescription?: string
  primaryKeyword?: string
  secondaryKeywords?: string[]
}

export interface MetaResult {
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

export interface MetaDraft {
  pageContext: string
  pageType: string
  primaryKeyword: string
  providerId: ProviderId
  modelId: string
  selectedPageId?: string
  selectedPagePath?: string
}

/** In-memory wizard state (survives Dashboard ↔ Meta navigation). */
export interface MetaWizardSession {
  draftSignature: string
  selectedPageId?: string
  step: MetaStep
  resultLocaleId: string
  results: MetaResult[]
}

export interface PersistedMetaResults {
  savedAt: number
  selectedPageId?: string
  draftSignature: string
  /** Last wizard step while results were valid (restored on re-entry). */
  step?: MetaStep
  resultLocaleId?: string
  results: MetaResult[]
}

export function metaDraftSignature(input: {
  pageContext: string
  pageType: string
  primaryKeyword: string
  selectedPageId?: string
}): string {
  return JSON.stringify({
    pageContext: input.pageContext.trim(),
    pageType: input.pageType.trim(),
    primaryKeyword: input.primaryKeyword.trim(),
    selectedPageId: input.selectedPageId ?? "",
  })
}
