import {
  estimateCost,
  safeJsonParse,
  type Model,
  type Provider,
  type ProviderCallOptions,
  type ProviderCallResult,
} from "./types"

/**
 * Anthropic Claude.
 *
 * Pricing snapshot (USD per million tokens, input / output):
 *   claude-sonnet-4-5: 3 / 15
 *   claude-haiku-4:    0.8 / 4   (estimated; update when published)
 *
 * Pricing changes over time — verify against
 * https://docs.anthropic.com/en/docs/about-claude/pricing once a quarter.
 */
const MODELS: Model[] = [
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    badge: "smart",
    pricePerMTokenInput: 3,
    pricePerMTokenOutput: 15,
  },
  {
    id: "claude-haiku-4",
    name: "Claude Haiku 4",
    badge: "fast",
    pricePerMTokenInput: 0.8,
    pricePerMTokenOutput: 4,
  },
]

export const anthropicProvider: Provider = {
  id: "anthropic",
  name: "Anthropic",
  description: "Claude — best non-English output",
  consoleUrl: "https://console.anthropic.com/",
  models: MODELS,
  builtin: true,
  call: callAnthropic,
}

async function callAnthropic(
  options: ProviderCallOptions,
): Promise<ProviderCallResult> {
  const model = MODELS.find((m) => m.id === options.modelId) ?? MODELS[0]

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      // Anthropic blocks browser-origin requests by default; this header is
      // the documented opt-in for plugins/extensions that legitimately call
      // from a browser context. Kept only for the legacy direct-call adapter.
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: options.maxTokens ?? 2048,
      system: options.prompt.system,
      messages: [{ role: "user", content: options.prompt.user }],
    }),
  })

  if (!response.ok) {
    throw new Error(
      `Anthropic API error ${response.status}: ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>
    usage?: { input_tokens: number; output_tokens: number }
  }

  const text = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")

  return {
    rawText: text,
    parsed: safeJsonParse(text),
    estimatedCostUsd: estimateCost(
      model,
      data.usage?.input_tokens,
      data.usage?.output_tokens,
    ),
    tokensIn: data.usage?.input_tokens,
    tokensOut: data.usage?.output_tokens,
  }
}
