import {
  ensureJsonKeywordPrompt,
  estimateCost,
  safeJsonParse,
  type Model,
  type Provider,
  type ProviderCallOptions,
  type ProviderCallResult,
} from "./types"

/**
 * OpenAI.
 *
 * Pricing snapshot (USD per million tokens, input / output):
 *   gpt-4o:        2.50 / 10
 *   gpt-4o-mini:   0.15 / 0.60
 *   gpt-4-turbo:  10    / 30
 *
 * Verify quarterly against https://openai.com/api/pricing/
 */
const MODELS: Model[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    badge: "cheap",
    pricePerMTokenInput: 0.15,
    pricePerMTokenOutput: 0.6,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    badge: "balanced",
    pricePerMTokenInput: 2.5,
    pricePerMTokenOutput: 10,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    badge: "smart",
    pricePerMTokenInput: 10,
    pricePerMTokenOutput: 30,
  },
]

export const openaiProvider: Provider = {
  id: "openai",
  name: "OpenAI",
  description: "GPT — most popular, JSON mode reliable",
  consoleUrl: "https://platform.openai.com/api-keys",
  models: MODELS,
  builtin: true,
  call: callOpenAi,
}

async function callOpenAi(
  options: ProviderCallOptions,
): Promise<ProviderCallResult> {
  const model = MODELS.find((m) => m.id === options.modelId) ?? MODELS[0]
  const prompt = ensureJsonKeywordPrompt(options.prompt)

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: options.maxTokens ?? 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(
      `OpenAI API error ${response.status}: ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens: number; completion_tokens: number }
  }

  const text = data.choices[0]?.message.content ?? ""

  return {
    rawText: text,
    parsed: safeJsonParse(text),
    estimatedCostUsd: estimateCost(
      model,
      data.usage?.prompt_tokens,
      data.usage?.completion_tokens,
    ),
    tokensIn: data.usage?.prompt_tokens,
    tokensOut: data.usage?.completion_tokens,
  }
}
