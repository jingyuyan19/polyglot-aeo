import { readJson, writeJson } from "../storage"
import {
  ALL_PROVIDERS,
  materializeCustomProvider,
  type CustomProviderConfig,
  type Provider,
  type ProviderId,
} from "./providers"
import {
  callManagedAi,
  isManagedAiEnabled,
  isManagedProviderId,
  MANAGED_AI_KEY_SENTINEL,
} from "./managed"
import type { MetaPromptOutput } from "./prompts"

export type {
  CustomProviderConfig,
  Model,
  Provider,
  ProviderId,
} from "./providers"

/** Backward-compatible alias for stored provider ids. */
export type AiProvider = ProviderId

export interface AiCallOptions {
  providerId: ProviderId
  modelId: string
  apiKey: string
  prompt: MetaPromptOutput
  /** Server-side quota bucket. Used only by Polyglot Managed AI. */
  feature?: string
  /** Maximum tokens for the response. Defaults vary by provider. */
  maxTokens?: number
  /** When provided, overrides the registry — used by custom providers. */
  customProvider?: Provider
}

export interface AiCallResult {
  rawText: string
  parsed: unknown
  estimatedCostUsd?: number
  estimatedCostRmb?: number
  tokensIn?: number
  tokensOut?: number
}

/**
 * Resolve a provider by id. Looks up the built-in registry first, then
 * materializes from the user's custom-provider list (passed in to keep
 * this function pure — no plugin-data side effects).
 */
export function resolveProvider(
  providerId: ProviderId,
  customConfigs: CustomProviderConfig[] = [],
): Provider | null {
  const builtin = ALL_PROVIDERS.find((p) => p.id === providerId)
  if (builtin) return builtin
  const customConfig = customConfigs.find((c) => c.id === providerId)
  return customConfig ? materializeCustomProvider(customConfig) : null
}

/**
 * Provider-agnostic AI invocation. Resolves the provider from the
 * registry, calls its adapter, and returns a normalized result.
 */
export async function callAi(options: AiCallOptions): Promise<AiCallResult> {
  if (isManagedAiEnabled()) {
    return callManagedAi({
      prompt: options.prompt,
      maxTokens: options.maxTokens,
      feature: options.feature,
    })
  }

  const provider =
    options.customProvider ?? resolveProvider(options.providerId)
  if (!provider) {
    throw new Error(`Unknown AI provider: ${options.providerId}`)
  }

  const result = await provider.call({
    apiKey: options.apiKey,
    modelId: options.modelId,
    prompt: options.prompt,
    maxTokens: options.maxTokens,
  })

  return result
}

/** Read the managed AI sentinel used by older call sites' readiness checks. */
export async function readProviderKey(
  providerId: ProviderId,
): Promise<string | null> {
  return isManagedAiEnabled() && isManagedProviderId(providerId)
    ? MANAGED_AI_KEY_SENTINEL
    : null
}

export async function writeProviderKey(
  providerId: ProviderId,
  value: string | null,
): Promise<boolean> {
  void providerId
  void value
  return true
}

const CUSTOM_PROVIDERS_KEY = "custom-providers"

export async function readCustomProviders(): Promise<CustomProviderConfig[]> {
  return readJson<CustomProviderConfig[]>(CUSTOM_PROVIDERS_KEY, [])
}

export async function writeCustomProviders(
  configs: CustomProviderConfig[],
): Promise<void> {
  await writeJson(CUSTOM_PROVIDERS_KEY, configs)
}

/**
 * Pick the provider to surface as the active selection on view mount.
 *
 * A designer who already has a usable managed provider should never see an
 * unconfigured warning out of the box. So:
 *   1. If `preferred` is set AND has a key, use it (respects explicit choice).
 *   2. Otherwise, use the first `candidate` that has a key.
 *   3. Otherwise, fall back: `preferred` if set (so the dropdown still
 *      shows their stored choice), else `fallback`.
 *
 * Pure with respect to storage — `lookupKey` is injected so this is
 * unit-testable without a framer mock. Production callers pass
 * `readProviderKey`.
 */
export async function resolveInitialProvider(
  preferred: ProviderId | null,
  candidates: readonly ProviderId[],
  fallback: ProviderId,
  lookupKey: (id: ProviderId) => Promise<string | null>,
): Promise<ProviderId> {
  if (preferred) {
    const key = await lookupKey(preferred)
    if (key) return preferred
  }
  for (const id of candidates) {
    const key = await lookupKey(id)
    if (key) return id
  }
  return preferred ?? fallback
}
