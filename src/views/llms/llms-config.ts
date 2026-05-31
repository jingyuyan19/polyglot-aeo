import type { ProviderId } from "../../lib/ai/providers"

/** Persisted llms.txt configuration (see migrateConfig in LlmsTxtView). */
export interface LlmsConfig {
  siteName: string
  siteSummary: string
  longDescription: string
  baseUrl: string
  localizedPaths: boolean
  collectionIds: string[]
  pageIds: string[]
  collectionFieldOverrides: Record<
    string,
    { titleField?: string; summaryField?: string }
  >
  useAiTranslate: boolean
  aiProviderId: ProviderId
  aiModelId: string
}
