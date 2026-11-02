import type { Model, ProviderId } from "./providers/types"
import { estimateCost } from "./providers/types"

/** Typical JSON meta output (six fields + keywords). */
const META_OUTPUT_TOKENS_TYPICAL = 650
/** Base system prompt (rules + JSON schema), Latin locales. */
const META_SYSTEM_BASE_TOKENS = 520
/** Extra script-integrity block (ja / ko / zh). */
const META_SYSTEM_CJK_EXTRA_TOKENS = 1150

/**
 * DeepSeek console bills input/output separately and often at cache-miss
 * rates on fresh prompts. Plugin model cards use list/promo USD/M — this
 * table is for an honest "upper reference" only (from platform export).
 */
const DEEPSEEK_CONSOLE_USD_PER_M: Record<
  string,
  { inputMiss: number; output: number }
> = {
  "deepseek-v4-flash": { inputMiss: 1.0, output: 2.0 },
  "deepseek-v4-pro": { inputMiss: 3.0, output: 6.0 },
  "deepseek-r1": { inputMiss: 0.55, output: 2.19 },
}

export interface MetaCostEstimateInput {
  pageContext: string
  pageType?: string
  primaryKeyword?: string
  brandVoice?: string
}

export interface MetaCostEstimate {
  localeCount: number
  /** Prompt tokens per locale (system + page context). */
  tokensInPerLocale: number
  /** Completion tokens per locale (typical JSON meta). */
  tokensOutPerLocale: number
  /** Sum at prices shown in the model picker (USD). */
  costUsdListed: number
  /**
   * Optional upper reference when provider is DeepSeek — same token
   * counts at console cache-miss/output rates.
   */
  costUsdConsoleUpper?: number
}

function languageBase(code: string): string {
  return (code.split("-")[0] || code).toLowerCase()
}

function isCjkLanguage(code: string): boolean {
  const base = languageBase(code)
  return base === "ja" || base === "ko" || base === "zh"
}

/** Rough chars → tokens; CJK packs more meaning per token. */
export function estimateTextTokens(text: string, language: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const chars = trimmed.length
  if (isCjkLanguage(language)) {
    return Math.ceil(chars / 1.6)
  }
  return Math.ceil(chars / 4)
}

/**
 * System + user prompt tokens for one meta generation call.
 * Calibrated above the old fixed 600/250 heuristic.
 */
export function estimateMetaPromptTokensPerLocale(
  language: string,
  input: MetaCostEstimateInput,
): number {
  const system =
    META_SYSTEM_BASE_TOKENS +
    (isCjkLanguage(language) ? META_SYSTEM_CJK_EXTRA_TOKENS : 0)

  const pageType = estimateTextTokens(input.pageType ?? "Landing page", language)
  const context = estimateTextTokens(input.pageContext, language)
  const keyword = estimateTextTokens(input.primaryKeyword ?? "", language)
  const voice = estimateTextTokens(input.brandVoice ?? "", language)

  // User message wrapper + labels (~80–120 tokens Latin).
  const userShell = isCjkLanguage(language) ? 70 : 45

  return system + context + pageType + keyword + voice + userShell
}

export function estimateMetaOutputTokensPerLocale(): number {
  return META_OUTPUT_TOKENS_TYPICAL
}

function costAtRates(
  tokensIn: number,
  tokensOut: number,
  localeCount: number,
  inputPerM: number,
  outputPerM: number,
): number {
  const totalIn = tokensIn * localeCount
  const totalOut = tokensOut * localeCount
  return (totalIn * inputPerM + totalOut * outputPerM) / 1_000_000
}

/**
 * Batch estimate for the Meta generate step (all target locales).
 * Uses the heaviest system prompt among locales (CJK > Latin).
 */
export function estimateMetaBatchCost(
  model: Model,
  providerId: ProviderId,
  localeCodes: string[],
  input: MetaCostEstimateInput,
): MetaCostEstimate | null {
  const localeCount = Math.max(1, localeCodes.length)
  if (model.pricePerMTokenInput <= 0 && model.pricePerMTokenOutput <= 0) {
    return null
  }

  const languages =
    localeCodes.length > 0 ? localeCodes : ["en"]
  const tokensInPerLocale = Math.max(
    ...languages.map((code) =>
      estimateMetaPromptTokensPerLocale(code, input),
    ),
  )
  const tokensOutPerLocale = estimateMetaOutputTokensPerLocale()

  const costUsdListed =
    estimateCost(model, tokensInPerLocale * localeCount, tokensOutPerLocale * localeCount) ??
    costAtRates(
      tokensInPerLocale,
      tokensOutPerLocale,
      localeCount,
      model.pricePerMTokenInput,
      model.pricePerMTokenOutput,
    )

  let costUsdConsoleUpper: number | undefined
  if (providerId === "deepseek") {
    const consoleRates = DEEPSEEK_CONSOLE_USD_PER_M[model.id]
    if (consoleRates) {
      costUsdConsoleUpper = costAtRates(
        tokensInPerLocale,
        tokensOutPerLocale,
        localeCount,
        consoleRates.inputMiss,
        consoleRates.output,
      )
    }
  }

  return {
    localeCount,
    tokensInPerLocale,
    tokensOutPerLocale,
    costUsdListed,
    costUsdConsoleUpper,
  }
}

/** Step-1 ✨ infer/improve — short output, smaller than full meta. */
export function estimateMetaSuggestCostUsd(
  model: Model,
  pageContext: string,
  defaultLocaleCode: string,
): number | null {
  if (model.pricePerMTokenInput <= 0) return null
  const tokensIn =
    400 + estimateTextTokens(pageContext, defaultLocaleCode) + 40
  const tokensOut = 120
  return (
    estimateCost(model, tokensIn, tokensOut) ??
    costAtRates(tokensIn, tokensOut, 1, model.pricePerMTokenInput, model.pricePerMTokenOutput)
  )
}
