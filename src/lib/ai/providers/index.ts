import type { CustomProviderConfig, Provider, ProviderId } from "./types"
import { MANAGED_MODEL_ID, MANAGED_PROVIDER_ID } from "../managed"

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
 * Marketplace builds use Polyglot Managed AI only. Keeping third-party AI
 * adapters out of this registry also keeps browser-call endpoint strings
 * out of the plugin package that Framer reviews.
 */
const managedProvider: Provider = {
  id: MANAGED_PROVIDER_ID,
  name: "Polyglot Managed AI",
  description: "Server-side MiniMax M3 with license checks and quota limits",
  consoleUrl: "https://polyglotaeo.com/privacy",
  models: [
    {
      id: MANAGED_MODEL_ID,
      name: "MiniMax M3",
      badge: "balanced",
      pricePerMTokenInput: 0,
      pricePerMTokenOutput: 0,
    },
  ],
  builtin: true,
  call: async () => {
    throw new Error("Managed AI must be called through Polyglot's backend.")
  },
}

export const ALL_PROVIDERS: Provider[] = [managedProvider]

export const BUILTIN_PROVIDERS: Provider[] = [managedProvider]

/**
 * Materialize historical custom-provider records without importing any
 * browser-side third-party adapter code. The provider remains readable so
 * old saved settings don't crash, but calls are intentionally disabled in
 * Marketplace builds.
 */
export function materializeCustomProvider(
  config: CustomProviderConfig,
): Provider {
  const modelIds = config.modelIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  return {
    id: config.id,
    name: config.name,
    description: config.description ?? "Historical custom provider",
    consoleUrl: config.baseUrl,
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
    call: async () => {
      throw new Error(
        "Custom AI providers are unavailable in the Marketplace build. Use Polyglot Managed AI.",
      )
    },
  }
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
