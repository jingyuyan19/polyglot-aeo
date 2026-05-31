import { anthropicProvider } from "./anthropic"
import { geminiProvider } from "./gemini"
import {
  createOpenAiCompatibleProvider,
  deepseekProvider,
  glmProvider,
  minimaxCnProvider,
  minimaxGlobalProvider,
  moonshotProvider,
  qwenProvider,
} from "./openai-compat"
import { openaiProvider } from "./openai"
import type { CustomProviderConfig, Provider, ProviderId } from "./types"

export type {
  CustomProviderConfig,
  Model,
  Provider,
  ProviderCallOptions,
  ProviderCallResult,
  ProviderId,
} from "./types"
export { estimateCost, safeJsonParse } from "./types"

/**
 * Built-in provider list. Order matters — it's also the display order in
 * the UI dropdown. Anthropic + OpenAI lead because they have the broadest
 * baseline quality, followed by the China-market favorites that give
 * Polyglot AEO its differentiation.
 */
export const BUILTIN_PROVIDERS: Provider[] = [
  anthropicProvider,
  openaiProvider,
  geminiProvider,
  deepseekProvider,
  glmProvider,
  moonshotProvider,
  qwenProvider,
  minimaxGlobalProvider,
  minimaxCnProvider,
]

/**
 * Materialize a custom (user-created) provider from its persisted config.
 * The custom provider always uses the OpenAI-compatible adapter, since
 * that's the only protocol shape we can usefully target without code.
 */
export function materializeCustomProvider(
  config: CustomProviderConfig,
): Provider {
  const modelIds = config.modelIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  return createOpenAiCompatibleProvider({
    id: config.id,
    name: config.name,
    description: config.description ?? "Custom OpenAI-compatible endpoint",
    consoleUrl: config.baseUrl,
    baseUrl: config.baseUrl,
    custom: true,
    builtin: false,
    // Custom providers don't ship pricing data — show 0/0 and the UI will
    // hide the cost pill rather than mislead the user with a $0 estimate.
    models:
      modelIds.length > 0
        ? modelIds.map((id) => ({
            id,
            name: id,
            pricePerMTokenInput: 0,
            pricePerMTokenOutput: 0,
          }))
        : [
            {
              id: "default",
              name: "default",
              pricePerMTokenInput: 0,
              pricePerMTokenOutput: 0,
            },
          ],
  })
}

/**
 * Generate a fresh custom-provider id. Uses crypto.randomUUID where
 * available, otherwise falls back to a timestamp + random suffix.
 */
export function generateCustomProviderId(): ProviderId {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `custom:${uuid}` as ProviderId
}
