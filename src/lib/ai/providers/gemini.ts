import {
  estimateCost,
  safeJsonParse,
  type Model,
  type Provider,
  type ProviderCallOptions,
  type ProviderCallResult,
} from "./types"

/**
 * Google Gemini.
 *
 * Pricing snapshot (USD per million tokens, input / output):
 *   gemini-2.0-flash:    0.10 / 0.40
 *   gemini-1.5-pro:      1.25 / 5.00  (≤128k context)
 *   gemini-1.5-flash:    0.075 / 0.30
 *
 * Verify against https://ai.google.dev/pricing
 */
const MODELS: Model[] = [
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    badge: "fast",
    pricePerMTokenInput: 0.1,
    pricePerMTokenOutput: 0.4,
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    badge: "smart",
    pricePerMTokenInput: 1.25,
    pricePerMTokenOutput: 5,
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    badge: "cheap",
    pricePerMTokenInput: 0.075,
    pricePerMTokenOutput: 0.3,
  },
]

export const geminiProvider: Provider = {
  id: "gemini",
  name: "Google Gemini",
  description: "Gemini — Google ecosystem, generous free tier",
  consoleUrl: "https://aistudio.google.com/apikey",
  models: MODELS,
  builtin: true,
  call: callGemini,
}

async function callGemini(
  options: ProviderCallOptions,
): Promise<ProviderCallResult> {
  const model = MODELS.find((m) => m.id === options.modelId) ?? MODELS[0]
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${encodeURIComponent(options.apiKey)}`

  // Gemini wants the system instruction in a separate field, and JSON mode
  // is enabled via `responseMimeType` instead of OpenAI's `response_format`.
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: options.prompt.system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: options.prompt.user }],
        },
      ],
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 2048,
        responseMimeType: "application/json",
      },
    }),
  })

  if (!response.ok) {
    throw new Error(
      `Gemini API error ${response.status}: ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
    }
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    ""

  return {
    rawText: text,
    parsed: safeJsonParse(text),
    estimatedCostUsd: estimateCost(
      model,
      data.usageMetadata?.promptTokenCount,
      data.usageMetadata?.candidatesTokenCount,
    ),
    tokensIn: data.usageMetadata?.promptTokenCount,
    tokensOut: data.usageMetadata?.candidatesTokenCount,
  }
}
