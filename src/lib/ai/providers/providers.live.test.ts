import { describe, expect, it } from "vitest"

import { callAi } from "../client"
import { buildMetaPrompt } from "../prompts"
import { BUILTIN_PROVIDERS } from "./index"
import type { ProviderId } from "./types"

/**
 * Live integration tests — these hit the real provider APIs with the keys
 * supplied via env vars. Run with `npm run test:live`.
 *
 * Each provider has its own env var. Tests for a provider whose env var
 * is empty self-skip via `it.skipIf(...)`, so partial coverage is fine.
 *
 * SECURITY: never commit a `.env` file containing these. The recommended
 * pattern is to set them inline once per shell session, e.g.
 *
 *     export MINIMAX_CN_KEY=sk-...   # session-only, no file written
 *     npm run test:live
 *
 * What we assert:
 *   1. The call doesn't throw — protocol shape is right (auth, base URL,
 *      JSON body all line up).
 *   2. We get back at least one of {parsed JSON, raw text} — the provider
 *      can produce SOMETHING.
 *   3. Token usage is reported when the provider supports it (used to
 *      validate cost estimates).
 *
 * What we deliberately don't assert:
 *   - SEO content quality. That's a manual / human evaluation task.
 *   - Specific model behaviors. That'd lock us into a single snapshot.
 */

interface LiveCase {
  providerId: ProviderId
  /** Env var that supplies the API key. Tests skip if empty. */
  envVar: string
  /** Optional model id override; otherwise uses the provider's default. */
  modelId?: string
}

/**
 * Smoke-test cases. For thinking-heavy models (MiniMax M2.7, DeepSeek R1,
 * Kimi K2.6 thinking variants) we deliberately pick the *non-thinking*
 * sibling for the smoke test because:
 *   1. It runs in <10s instead of 30-60s, keeping CI / dev loops sane.
 *   2. We're testing protocol shape, not reasoning quality.
 *   3. Production users picking the thinking variant will hit the same
 *      protocol path; the JSON-stripping safety net (stripReasoningBlocks)
 *      is unit-tested separately.
 */
const CASES: LiveCase[] = [
  { providerId: "anthropic", envVar: "ANTHROPIC_KEY" },
  { providerId: "openai", envVar: "OPENAI_KEY" },
  { providerId: "gemini", envVar: "GEMINI_KEY" },
  { providerId: "deepseek", envVar: "DEEPSEEK_KEY", modelId: "deepseek-v4-flash" },
  { providerId: "glm", envVar: "GLM_KEY", modelId: "glm-4.5-air" },
  { providerId: "moonshot", envVar: "MOONSHOT_KEY", modelId: "kimi-k2.5" },
  { providerId: "qwen", envVar: "QWEN_KEY", modelId: "qwen-plus" },
  {
    providerId: "minimax-global",
    envVar: "MINIMAX_GLOBAL_KEY",
    modelId: "MiniMax-M2.7-highspeed",
  },
  {
    providerId: "minimax-cn",
    envVar: "MINIMAX_CN_KEY",
    modelId: "MiniMax-M2.7-highspeed",
  },
]

describe("Provider live API smoke tests", () => {
  for (const c of CASES) {
    const provider = BUILTIN_PROVIDERS.find((p) => p.id === c.providerId)
    if (!provider) {
      it.skip(`${c.providerId} — legacy direct-provider adapter is not bundled`, () => {
        expect(provider).toBeUndefined()
      })
      continue
    }

    const apiKey = process.env[c.envVar] ?? ""
    const modelId = c.modelId ?? provider.models[0].id

    it.skipIf(!apiKey)(
      `${provider.name} — generates valid meta JSON via ${modelId}`,
      async () => {
        const prompt = buildMetaPrompt({
          pageContext:
            "A landing page for a coffee shop in downtown Tokyo, serving single-origin pour-overs and Japanese pastries, target audience is remote workers and students.",
          productOrPageType: "Landing page",
          targetLanguage: "ja-JP",
          targetRegion: "Japan",
          primaryKeyword: "tokyo coffee shop",
        })

        const result = await callAi({
          providerId: c.providerId,
          modelId,
          apiKey,
          prompt,
          // Reasoning models (DeepSeek R1, Kimi Thinking, MiniMax M-series)
          // emit a long <think> block before the answer; 600 tokens isn't
          // enough headroom and the response gets truncated mid-think.
          maxTokens: 2500,
        })

        // The provider must return SOMETHING — empty raw text means our
        // request shape is wrong even if HTTP returned 200.
        expect(result.rawText.length).toBeGreaterThan(0)

        // Either parsed JSON or fallback raw is acceptable; failing both
        // means we couldn't extract the structured response from any
        // wrapping the model added (markdown fence, prose, etc.).
        const parsed = result.parsed as Record<string, unknown> | null
        const hasUsableShape =
          parsed !== null &&
          typeof parsed === "object" &&
          ("title" in parsed || "metaDescription" in parsed)

        if (!hasUsableShape) {
          // Surface the raw text on failure so the developer can see what
          // the provider actually returned and adjust the parser.
          console.error(
            `[${provider.name}] no usable JSON shape. raw text:\n${result.rawText.slice(0, 500)}`,
          )
        }
        expect(hasUsableShape).toBe(true)

        // Cost estimate is best-effort; some providers don't return usage
        // metadata. When they do, the number must be non-negative and
        // reasonable for a 600-token completion (well under $1).
        if (result.estimatedCostUsd !== undefined) {
          expect(result.estimatedCostUsd).toBeGreaterThanOrEqual(0)
          expect(result.estimatedCostUsd).toBeLessThan(1)
        }
      },
    )
  }
})
