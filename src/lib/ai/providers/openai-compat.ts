import {
  ensureJsonKeywordPrompt,
  estimateCost,
  safeJsonParse,
  type Model,
  type Provider,
  type ProviderCallOptions,
  type ProviderCallResult,
  type ProviderId,
} from "./types"

/**
 * OpenAI-compatible HTTP request shape used by ~90% of non-OpenAI LLM
 * providers in 2025–2026. Differences across providers are small enough to
 * fold into a single adapter:
 *
 *   - Auth header style: most use `Authorization: Bearer <key>`. Some
 *     (e.g. Minimax, Qwen older versions) accept the same; we'd add a
 *     `authStyle` switch if needed.
 *   - JSON mode: not all providers support `response_format`; we send it
 *     anyway and rely on safeJsonParse to clean fenced/prefixed output.
 *   - Token usage shape: `{prompt_tokens, completion_tokens}` is the OpenAI
 *     standard and is mirrored by every compatible provider I've checked.
 */
export interface OpenAiCompatibleConfig {
  id: ProviderId
  name: string
  description: string
  consoleUrl: string
  baseUrl: string
  models: Model[]
  /** Whether the provider supports `response_format: {type: "json_object"}`. */
  supportsJsonMode?: boolean
  /** Set when the provider was created from a user CustomProviderConfig. */
  custom?: boolean
  builtin?: boolean
}

/**
 * Build a Provider object from a config. Used both for built-in providers
 * (DeepSeek, GLM, Moonshot, Qwen, Minimax) and user-created custom ones.
 */
export function createOpenAiCompatibleProvider(
  config: OpenAiCompatibleConfig,
): Provider {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    consoleUrl: config.consoleUrl,
    models: config.models,
    builtin: config.builtin ?? !config.custom,
    custom: config.custom,
    call: (options) => callOpenAiCompatible(config, options),
  }
}

async function callOpenAiCompatible(
  config: OpenAiCompatibleConfig,
  options: ProviderCallOptions,
): Promise<ProviderCallResult> {
  const model =
    config.models.find((m) => m.id === options.modelId) ?? config.models[0]
  const baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/+$/, "")
  const url = `${baseUrl}/chat/completions`
  const prompt =
    config.supportsJsonMode === false
      ? options.prompt
      : ensureJsonKeywordPrompt(options.prompt)

  const body: Record<string, unknown> = {
    model: options.modelId || model.id,
    max_tokens: options.maxTokens ?? 2048,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  }
  if (config.supportsJsonMode !== false) {
    body.response_format = { type: "json_object" }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(
      `${config.name} API error ${response.status}: ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    choices: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const text = data.choices[0]?.message?.content ?? ""

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

// ─────────────────────────────────────────────────────────────────────
// Built-in OpenAI-compatible providers.
// Pricing snapshots are best-effort; users will tolerate a 20% off-by but
// not 200%, so we err toward published rates rather than estimates.
// ─────────────────────────────────────────────────────────────────────

/**
 * DeepSeek (https://api-docs.deepseek.com).
 *
 * V4 family launched April 2026; the legacy `deepseek-chat` / `deepseek-reasoner`
 * names will be deprecated on 2026-07-24 — they currently route to V4-Flash's
 * non-thinking and thinking modes respectively. We default to V4-Flash because
 * it's the cheapest path and outperforms 2025's flagship V3 on Chinese SEO
 * content. R1 stays on the menu for users who want explicit reasoning.
 *
 * Pricing snapshot (2026-04-26): cache-miss / output per 1M tokens.
 * Cache-hit pricing is 10% of cache-miss; we don't model that here because
 * we don't reliably know whether a given call will hit the cache.
 */
export const deepseekProvider: Provider = createOpenAiCompatibleProvider({
  id: "deepseek",
  name: "DeepSeek",
  description: "DeepSeek V4 — strong Chinese, ~10× cheaper than GPT-4o",
  consoleUrl: "https://platform.deepseek.com/",
  baseUrl: "https://api.deepseek.com/v1",
  models: [
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      badge: "cheap",
      pricePerMTokenInput: 0.14,
      pricePerMTokenOutput: 0.28,
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      badge: "smart",
      // Currently 75% off until 2026-05-31; regular price is $1.74 / $3.48.
      // We list the regular price so users aren't surprised when the promo
      // ends. Update this comment + the numbers next time pricing changes.
      pricePerMTokenInput: 1.74,
      pricePerMTokenOutput: 3.48,
    },
    {
      id: "deepseek-r1",
      name: "DeepSeek R1",
      badge: "balanced",
      pricePerMTokenInput: 0.55,
      pricePerMTokenOutput: 2.19,
    },
  ],
})

/**
 * Zhipu GLM (智谱AI) — https://docs.bigmodel.cn.
 *
 * GLM-4.6 (Sept 2025) is the flagship; it claims parity with Claude Sonnet 4
 * on coding benchmarks and ~30% lower token consumption than GLM-4.5. The
 * older GLM-4-Plus/Air/Flash line was retired in favor of the 4.5 / 4.6 line.
 *
 * Pricing for GLM-4.6 isn't published in USD; we estimate from the official
 * RMB rate at ~7.2 CNY/USD. Update next quarter.
 */
export const glmProvider: Provider = createOpenAiCompatibleProvider({
  id: "glm",
  name: "智谱 GLM",
  description: "Zhipu GLM-4.6 — Chinese SEO leader, compliance-friendly",
  consoleUrl: "https://open.bigmodel.cn/",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  models: [
    {
      id: "glm-4.6",
      name: "GLM-4.6",
      badge: "smart",
      // ~¥4 / ¥16 per M tokens at official RMB pricing ≈ $0.55 / $2.20.
      // Refresh against open.bigmodel.cn/pricing quarterly.
      pricePerMTokenInput: 0.55,
      pricePerMTokenOutput: 2.2,
    },
    {
      id: "glm-4.5",
      name: "GLM-4.5",
      badge: "balanced",
      pricePerMTokenInput: 0.35,
      pricePerMTokenOutput: 1.55,
    },
    {
      id: "glm-4.5-air",
      name: "GLM-4.5 Air",
      badge: "fast",
      pricePerMTokenInput: 0.11,
      pricePerMTokenOutput: 0.28,
    },
  ],
})

/**
 * Moonshot Kimi (https://platform.moonshot.cn / .ai).
 *
 * IMPORTANT: the legacy `moonshot-v1-*` series is the previous-generation
 * product line and is being phased out. The current flagships are the
 * `kimi-k2.6` / `kimi-k2.5` family. Even the early K2 previews
 * (`kimi-k2-0905-preview`, `kimi-k2-thinking`) will be **discontinued
 * 2026-05-25** — we deliberately don't ship those ids.
 *
 * Endpoint: `api.moonshot.cn` (China) and `api.moonshot.ai` (international)
 * are the same API. We default to .cn because that's what the docs link to;
 * users outside China can override via the custom-provider feature if .cn
 * is blocked at their network.
 *
 * Pricing snapshot (April 2026): per 1M tokens, USD.
 */
export const moonshotProvider: Provider = createOpenAiCompatibleProvider({
  id: "moonshot",
  name: "Moonshot Kimi",
  description: "Kimi K2.6 — long context, agent-tuned",
  consoleUrl: "https://platform.moonshot.cn/",
  baseUrl: "https://api.moonshot.cn/v1",
  models: [
    {
      id: "kimi-k2.6",
      name: "Kimi K2.6",
      badge: "smart",
      pricePerMTokenInput: 0.95,
      pricePerMTokenOutput: 4,
    },
    {
      id: "kimi-k2.5",
      name: "Kimi K2.5",
      badge: "balanced",
      pricePerMTokenInput: 0.6,
      pricePerMTokenOutput: 3,
    },
  ],
})

/**
 * Alibaba Qwen on DashScope. Defaults to `qwen-max-latest` so users always
 * get whichever Qwen3 snapshot is current — Alibaba ships dated revisions
 * (`qwen3-max-2026-01-23`, etc.) on a quarterly cadence.
 */
export const qwenProvider: Provider = createOpenAiCompatibleProvider({
  id: "qwen",
  name: "阿里 Qwen",
  description: "Alibaba Qwen3 — Aliyun ecosystem & enterprise China",
  consoleUrl: "https://dashscope.console.aliyun.com/",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  models: [
    {
      id: "qwen-max-latest",
      name: "Qwen Max (latest)",
      badge: "smart",
      pricePerMTokenInput: 1.2,
      pricePerMTokenOutput: 6,
    },
    {
      id: "qwen3-max",
      name: "Qwen3 Max",
      badge: "balanced",
      pricePerMTokenInput: 0.78,
      pricePerMTokenOutput: 3.9,
    },
    {
      id: "qwen-plus",
      name: "Qwen Plus",
      badge: "fast",
      pricePerMTokenInput: 0.56,
      pricePerMTokenOutput: 1.68,
    },
  ],
})

/**
 * MiniMax operates two separate API endpoints with the SAME models:
 *
 *   - Global / international:  https://api.minimax.io/v1
 *     Console: https://platform.minimax.io
 *
 *   - China domestic (国内):    https://api.minimaxi.com/v1
 *     Console: https://platform.minimaxi.com
 *
 * The two are NOT interchangeable — keys are issued per-region and won't
 * cross over. China-mainland users typically need the .com endpoint; users
 * outside need .io. We expose both as separate built-in providers so the
 * picker is unambiguous; everything else (model ids, prompts, prices) is
 * shared via MINIMAX_MODELS below.
 *
 * Legacy `abab6.*` ids have been replaced by the `MiniMax-M2.x` line. The
 * `-highspeed` variants are faster but slightly lower quality; we expose
 * both for power users.
 */
const MINIMAX_MODELS = [
  {
    id: "MiniMax-M2.7",
    name: "MiniMax M2.7",
    badge: "smart" as const,
    // MiniMax doesn't publish per-token USD prices in its console; these
    // approximate from the per-million-token RMB rate (~¥10 / ¥10) at
    // 7.2 CNY/USD. Refresh quarterly.
    pricePerMTokenInput: 1.4,
    pricePerMTokenOutput: 1.4,
  },
  {
    id: "MiniMax-M2.7-highspeed",
    name: "MiniMax M2.7 Highspeed",
    badge: "fast" as const,
    pricePerMTokenInput: 0.7,
    pricePerMTokenOutput: 0.7,
  },
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    badge: "balanced" as const,
    pricePerMTokenInput: 1.1,
    pricePerMTokenOutput: 1.1,
  },
]

export const minimaxGlobalProvider: Provider = createOpenAiCompatibleProvider({
  id: "minimax-global",
  name: "MiniMax (Global)",
  description: "MiniMax — international endpoint, .io (use outside China)",
  consoleUrl: "https://platform.minimax.io/",
  baseUrl: "https://api.minimax.io/v1",
  models: MINIMAX_MODELS,
  // M-series JSON-mode support is uneven; safer to skip and rely on
  // safeJsonParse to clean prose-wrapped output.
  supportsJsonMode: false,
})

export const minimaxCnProvider: Provider = createOpenAiCompatibleProvider({
  id: "minimax-cn",
  name: "MiniMax 国内",
  description: "MiniMax — minimaxi.com 国内端点（中国大陆推荐）",
  consoleUrl: "https://platform.minimaxi.com/",
  baseUrl: "https://api.minimaxi.com/v1",
  models: MINIMAX_MODELS,
  supportsJsonMode: false,
})
