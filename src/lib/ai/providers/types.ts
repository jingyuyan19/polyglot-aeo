import type { MetaPromptOutput } from "../prompts"

/**
 * AI provider abstraction. Each provider (Anthropic, OpenAI, DeepSeek, ...)
 * implements this interface. New providers can be added without touching
 * the call site by registering them in `providers/index.ts`.
 *
 * For providers that conform to OpenAI's Chat Completions API (the de-facto
 * industry standard — DeepSeek, Moonshot, Qwen, Minimax, Together, Groq,
 * Ollama, LiteLLM, etc.), use `createOpenAiCompatibleProvider` to share a
 * single adapter implementation.
 */
export interface Provider {
  /** Stable, machine-friendly id used in storage and routing. */
  id: ProviderId
  /** Display name shown in the UI dropdown. */
  name: string
  /** One-line description shown next to the name in the picker. */
  description: string
  /** External URL where users get an API key. */
  consoleUrl: string
  /** Models offered by this provider. The first one is the default. */
  models: Model[]
  /**
   * True when this provider was created by the user (custom OpenAI-compatible
   * endpoint). Built-ins are read-only — you can't delete or reconfigure them.
   */
  builtin: boolean
  /** True when this provider only ships generic models (custom endpoints). */
  custom?: boolean
  /** Performs the actual HTTP call. */
  call: (options: ProviderCallOptions) => Promise<ProviderCallResult>
}

export interface Model {
  /** Provider-specific model identifier (e.g. "claude-sonnet-4-5"). */
  id: string
  /** Human label (e.g. "Claude Sonnet 4.5"). */
  name: string
  /** Optional one-word badge: "fast" | "balanced" | "smart" | "cheap". */
  badge?: string
  /** Per-million-tokens USD price for input. Use 0 if unknown. */
  pricePerMTokenInput: number
  /** Per-million-tokens USD price for output. Use 0 if unknown. */
  pricePerMTokenOutput: number
}

export interface ProviderCallOptions {
  apiKey: string
  modelId: string
  prompt: MetaPromptOutput
  /** Override the default base URL. Used by custom providers. */
  baseUrl?: string
  /** Cap on output tokens; defaults vary per provider. */
  maxTokens?: number
}

export interface ProviderCallResult {
  rawText: string
  parsed: unknown
  estimatedCostUsd?: number
  /** Raw token usage as reported by the provider, when available. */
  tokensIn?: number
  tokensOut?: number
}

/**
 * Providers that implement OpenAI-style JSON mode reject requests unless
 * at least one message explicitly mentions "json". Most production prompts
 * already do, but tiny connectivity checks ("ping") are easy to forget.
 *
 * Keep this adapter-level so every OpenAI-compatible provider inherits the
 * safety net, including custom endpoints.
 */
export function ensureJsonKeywordPrompt(
  prompt: MetaPromptOutput,
): MetaPromptOutput {
  if (/\bjson\b/i.test(`${prompt.system}\n${prompt.user}`)) return prompt
  return {
    ...prompt,
    system: `${prompt.system}\n\nReturn the final answer as a JSON object.`,
  }
}

/**
 * Built-in provider ids. Custom (user-created) providers use ids like
 * `custom:<uuid>` so they never collide with these.
 */
export type BuiltinProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepseek"
  | "glm"
  | "moonshot"
  | "qwen"
  | "minimax-global"
  | "minimax-cn"

export type ProviderId = BuiltinProviderId | `custom:${string}`

/**
 * Persisted user configuration for a custom OpenAI-compatible provider.
 * Stored as an array under StorageKeys.CustomProviders.
 */
export interface CustomProviderConfig {
  /** "custom:<uuid>" — generated on creation, stable forever. */
  id: ProviderId
  name: string
  /** Required: full base URL ending in /v1 (or wherever /chat/completions sits). */
  baseUrl: string
  /** Comma-separated list of model ids, parsed by the registry. */
  modelIds: string
  /** Optional human label shown in the picker. Defaults to "Custom". */
  description?: string
}

/**
 * Compute the dollar cost of a single call given a model's pricing.
 * Returns undefined when neither token count is available — the UI then
 * hides the cost pill rather than showing $0.
 */
export function estimateCost(
  model: Model,
  tokensIn: number | undefined,
  tokensOut: number | undefined,
): number | undefined {
  if (tokensIn === undefined && tokensOut === undefined) return undefined
  const i = tokensIn ?? 0
  const o = tokensOut ?? 0
  return (
    (i * model.pricePerMTokenInput + o * model.pricePerMTokenOutput) / 1_000_000
  )
}

/**
 * Strip reasoning / thinking blocks from LLM output. Many 2026-era models
 * (DeepSeek R1, Kimi K2-Thinking, Qwen3-reasoning, MiniMax M-series) emit
 * `<think>…</think>` (or `<thinking>…</thinking>`) chain-of-thought blocks
 * before the actual answer. We don't display those in the UI, and they
 * would also confuse JSON extraction, so we drop them up front.
 *
 * Also handles unterminated `<think>` (truncated mid-reasoning when
 * max_tokens is too small) — in that case the entire trailing reasoning
 * is dropped and an empty string is returned, which safeJsonParse then
 * correctly reports as null.
 */
export function stripReasoningBlocks(text: string): string {
  let out = text
  // Closed reasoning blocks first.
  out = out.replace(/<(think(?:ing)?)>[\s\S]*?<\/\1>/gi, "")
  // Then any unterminated opener — drop everything from <think> to end.
  out = out.replace(/<think(?:ing)?>[\s\S]*$/i, "")
  return out.trim()
}

/**
 * Resilient JSON extraction. Handles four common LLM output shapes:
 *   1. Pure JSON: `{"title": "..."}`
 *   2. Markdown-fenced: ```json\n{...}\n```
 *   3. JSON with surrounding prose ("Here you go: {...}")
 *   4. Reasoning-prefixed: `<think>...</think>\n{...}`
 */
export function safeJsonParse(text: string): unknown {
  const cleaned = stripReasoningBlocks(text)
  if (!cleaned) return null

  try {
    return JSON.parse(cleaned)
  } catch {
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
    if (fenced) {
      try {
        return JSON.parse(fenced[1])
      } catch {
        // fall through to brace-scan
      }
    }
    // Last resort: find the first { and the matching } by brace counting.
    const start = cleaned.indexOf("{")
    if (start >= 0) {
      let depth = 0
      for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === "{") depth++
        else if (cleaned[i] === "}") {
          depth--
          if (depth === 0) {
            try {
              return JSON.parse(cleaned.slice(start, i + 1))
            } catch {
              return null
            }
          }
        }
      }
    }
    return null
  }
}
