import { callAi, type AiProvider } from "./client"
import type { LlmsTranslateAiCredentials } from "./llms-translate"
import {
  buildMetaSetupSuggestPrompt,
  type MetaSetupSuggestField,
} from "./prompts"
import { stripReasoningBlocks } from "./providers/types"

export type { MetaSetupSuggestField }

export interface GenerateMetaSetupSuggestParams {
  field: MetaSetupSuggestField
  pageContext: string
  draft?: string
  targetLanguage: string
  ai: LlmsTranslateAiCredentials
}

export interface GenerateMetaSetupSuggestResult {
  value: string
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

/**
 * Parse `{ pageType | primaryKeyword | brandVoice: "..." }` from AI output.
 */
export function parseMetaSetupSuggestResponse(
  field: MetaSetupSuggestField,
  parsed: unknown,
  rawText: string,
): string | null {
  const keys = [field, "value", "result", "text", "output"] as const

  const tryObject = (obj: Record<string, unknown>): string | null => {
    for (const k of keys) {
      const v = pickString(obj[k])
      if (v) return v
    }
    return null
  }

  if (parsed && typeof parsed === "object") {
    const direct = tryObject(parsed as Record<string, unknown>)
    if (direct) return direct
    const nested = (parsed as Record<string, unknown>).data
    if (nested && typeof nested === "object") {
      const fromNested = tryObject(nested as Record<string, unknown>)
      if (fromNested) return fromNested
    }
  }

  const stripped = stripReasoningBlocks(rawText)
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()

  try {
    const obj = JSON.parse(stripped) as Record<string, unknown>
    const fromJson = tryObject(obj)
    if (fromJson) return fromJson
  } catch {
    // fall through
  }

  const start = stripped.indexOf("{")
  const end = stripped.lastIndexOf("}")
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(stripped.slice(start, end + 1)) as Record<
        string,
        unknown
      >
      const sliced = tryObject(obj)
      if (sliced) return sliced
    } catch {
      // ignore
    }
  }

  if (stripped.length > 0 && stripped.length < 500 && !stripped.startsWith("{")) {
    return stripped.replace(/^["']+|["']+$/g, "").trim() || null
  }

  return null
}

export async function generateMetaSetupSuggestion(
  params: GenerateMetaSetupSuggestParams,
  callAiFn: typeof callAi = callAi,
): Promise<GenerateMetaSetupSuggestResult> {
  const prompt = buildMetaSetupSuggestPrompt({
    field: params.field,
    pageContext: params.pageContext,
    draft: params.draft?.trim() || undefined,
    targetLanguage: params.targetLanguage,
  })

  const result = await callAiFn({
    providerId: params.ai.providerId as AiProvider,
    modelId: params.ai.modelId,
    apiKey: params.ai.apiKey,
    feature: "meta_ai_suggest",
    prompt,
    customProvider: params.ai.customProvider,
    maxTokens: 800,
  })

  const value = parseMetaSetupSuggestResponse(
    params.field,
    result.parsed,
    result.rawText,
  )
  if (!value) {
    throw new Error(
      "AI returned an unparseable response. Try again or switch model.",
    )
  }

  return { value }
}
