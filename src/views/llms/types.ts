import type { LlmsTranslateQualityReason } from "../../lib/ai/llms-translate"
import type { DuplicateTitleGroup, SkippedItem } from "../../lib/llms/generator"

export type LlmsStep = "setup" | "sources" | "review" | "deploy"

export interface AiFailedItem {
  itemId: string
  defaultTitle: string
  reason: LlmsTranslateQualityReason
}

export interface GeneratedLlmsFile {
  filename: string
  content: string
  localeCode: string
  localeName: string
  skipped: SkippedItem[]
  duplicateTitles: Array<DuplicateTitleGroup & { collectionName: string }>
  aiFailed: AiFailedItem[]
  headerFlag: LlmsTranslateQualityReason | null
  longDescriptionFlag: LlmsTranslateQualityReason | null
}

export interface LocaleIssueBuckets {
  missingLocalized: SkippedItem[]
  missingDefault: SkippedItem[]
  hasIssues: boolean
}

export function partitionLocaleIssues(g: GeneratedLlmsFile): LocaleIssueBuckets {
  const aiFailedIds = new Set(g.aiFailed.map((f) => f.itemId))
  const missingLocalized = g.skipped.filter(
    (s) =>
      s.reason === "missing-localized-title" && !aiFailedIds.has(s.itemId),
  )
  const missingDefault = g.skipped.filter(
    (s) => s.reason === "missing-default-title",
  )
  const hasIssues =
    g.aiFailed.length > 0 ||
    missingLocalized.length > 0 ||
    missingDefault.length > 0 ||
    g.duplicateTitles.length > 0 ||
    g.headerFlag !== null ||
    g.longDescriptionFlag !== null
  return { missingLocalized, missingDefault, hasIssues }
}
