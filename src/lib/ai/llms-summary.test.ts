import { describe, expect, it, vi } from "vitest"

import type { AiCallOptions, AiCallResult } from "./client"
import { generateLlmsSummary } from "./llms-summary"

const AI = {
  providerId: "anthropic" as const,
  modelId: "claude-haiku",
  apiKey: "test-key",
}

function fakeAi(response: { rawText?: string; parsed?: unknown; cost?: number }) {
  return vi.fn(
    async (): Promise<AiCallResult> => ({
      rawText: response.rawText ?? "",
      parsed: response.parsed ?? null,
      estimatedCostUsd: response.cost ?? 0.0001,
    }),
  ) as unknown as (opts: AiCallOptions) => Promise<AiCallResult>
}

describe("generateLlmsSummary — happy paths", () => {
  it("generates a summary from scratch when no draft is provided", async () => {
    const ai = fakeAi({
      parsed: {
        summary:
          "LYNIQ is a small design studio building branding and visual identity for early-stage products.",
      },
      cost: 0.0009,
    })

    const out = await generateLlmsSummary(
      {
        siteName: "LYNIQ",
        targetLanguage: "en-US",
        ai: AI,
      },
      ai,
    )

    expect(ai).toHaveBeenCalledTimes(1)
    expect(out.summary).toContain("LYNIQ")
    expect(out.qualityOk).toBe(true)
    expect(out.costUsd).toBeCloseTo(0.0009)
  })

  it("optimizes an existing draft", async () => {
    const ai = fakeAi({
      parsed: {
        summary:
          "Branding and visual identity studio for ambitious early-stage products.",
      },
    })

    const out = await generateLlmsSummary(
      {
        siteName: "LYNIQ",
        draft:
          "We are an innovative leading design studio that transforms brands.",
        targetLanguage: "en-US",
        ai: AI,
      },
      ai,
    )

    expect(out.summary).not.toContain("innovative")
    expect(out.qualityOk).toBe(true)
  })

  it("strips outer quotes the model wraps around the summary", async () => {
    const ai = fakeAi({
      parsed: {
        summary:
          '"LYNIQ — Branding studio for product-led startups."',
      },
    })

    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
      ai,
    )
    expect(out.summary.startsWith('"')).toBe(false)
    expect(out.summary.endsWith('"')).toBe(false)
  })

  it("tolerates markdown-fenced JSON", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText:
        '```json\n{"summary":"LYNIQ — Branding studio for early-stage products."}\n```',
    })
    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
      ai,
    )
    expect(out.qualityOk).toBe(true)
    expect(out.summary).toContain("LYNIQ")
  })

  it("forwards optional keywords into the prompt context", async () => {
    // We don't assert on the system prompt's content here — that's
    // covered indirectly by the prompt unit tests. We just verify
    // the orchestrator passes a single AI call regardless of
    // whether keywords are present (no batching, no extra calls).
    const ai = fakeAi({
      parsed: { summary: "Branding studio for AEO-conscious indie products." },
    })
    await generateLlmsSummary(
      {
        siteName: "LYNIQ",
        keywords: "branding, AEO, indie products",
        targetLanguage: "en-US",
        ai: AI,
      },
      ai,
    )
    expect(ai).toHaveBeenCalledTimes(1)
  })
})

describe("generateLlmsSummary — quality validation", () => {
  it("flags qualityOk=false when AI returns the source draft verbatim (optimize mode)", async () => {
    const ai = fakeAi({
      parsed: {
        summary:
          "We are an innovative leading design studio that transforms brands.",
      },
    })
    const out = await generateLlmsSummary(
      {
        siteName: "LYNIQ",
        draft:
          "We are an innovative leading design studio that transforms brands.",
        targetLanguage: "en-US",
        ai: AI,
      },
      ai,
    )
    // Still returns the AI text — the user can read and decide.
    expect(out.summary).toBeTruthy()
    expect(out.qualityOk).toBe(false)
  })

  it("flags qualityOk=false when AI returns wrong-script output for the target locale", async () => {
    // CJK locale, AI returned a long Latin sentence past the
    // 16-char "brand-name" escape hatch — script validator will
    // hard-reject.
    const ai = fakeAi({
      parsed: {
        summary:
          "An entirely Latin sentence that does not belong in a Japanese llms.txt summary.",
      },
    })
    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "ja", ai: AI },
      ai,
    )
    expect(out.qualityOk).toBe(false)
    expect(out.summary).toContain("Latin")
  })

  it("accepts a Latin-with-brand-token output for CJK locales when the rest is in target script", async () => {
    const ai = fakeAi({
      parsed: {
        summary: "LYNIQはパーソナルなデザインスタジオです。",
      },
    })
    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "ja", ai: AI },
      ai,
    )
    expect(out.qualityOk).toBe(true)
  })
})

describe("generateLlmsSummary — parser resilience", () => {
  it("accepts alternate JSON keys (`result`) when the model picks the wrong field name", async () => {
    const ai = fakeAi({
      parsed: { result: "LYNIQ — Branding studio for product-led teams." },
    })
    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
      ai,
    )
    expect(out.summary).toContain("LYNIQ")
  })

  it("falls back to bare text when the model drops the JSON envelope (zh-CN-style failure)", async () => {
    // This is the exact failure from the first live zh-CN test:
    // Claude Haiku given a Chinese prompt returned plain prose with
    // no JSON wrapper. Pre-fix: parse error → user sees "建议失败".
    // Post-fix: bare text is sanitized + accepted.
    const ai = fakeAi({
      parsed: null,
      rawText: "Acme — 面向设计师的全球产品工作室，帮你把想法做成真东西。",
    })
    const out = await generateLlmsSummary(
      { siteName: "Acme", targetLanguage: "zh-CN", ai: AI },
      ai,
    )
    expect(out.summary).toContain("Acme")
    expect(out.qualityOk).toBe(true)
  })

  it("strips common AI preambles from bare-text fallback output", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText:
        'Sure! Here\'s a tighter summary:\n"LYNIQ — Branding studio for early-stage products."',
    })
    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
      ai,
    )
    expect(out.summary.toLowerCase()).not.toContain("sure")
    expect(out.summary.toLowerCase()).not.toContain("here")
    expect(out.summary).toContain("LYNIQ")
  })

  it("collapses a multi-line bare-text response to its first paragraph", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText:
        "LYNIQ — Branding studio for product-led startups.\n\nLet me know if you'd like alternatives.",
    })
    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
      ai,
    )
    expect(out.summary).not.toContain("alternatives")
    expect(out.summary).toContain("LYNIQ")
  })

  it("strips <think>…</think> reasoning blocks (DeepSeek R1 / Qwen QwQ pattern)", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText:
        '<think>\nThe brand is LYNIQ. They make products for designers. Let me write something tight... maybe lead with "Branding"?\n</think>\n\n{ "summary": "LYNIQ — Branding studio for product-led teams." }',
    })
    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
      ai,
    )
    expect(out.summary).toContain("LYNIQ")
    expect(out.summary).not.toContain("<think>")
    expect(out.summary).not.toContain("Let me write")
  })

  it("strips orphan <think> tags from truncated thinking-model output", async () => {
    // This is the exact failure from the live test — the user's
    // reasoning model ran out of token budget mid-think, emitting
    // only the opening `<think>` tag with no answer following.
    // Pre-fix: the bare-text fallback accepted "<think>" as the
    // summary. Post-fix: the tag is stripped → empty rawText →
    // parser returns null → orchestrator throws a useful error.
    const ai = fakeAi({
      parsed: null,
      rawText: "<think>",
    })
    await expect(
      generateLlmsSummary(
        { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
        ai,
      ),
    ).rejects.toThrow(/unparseable/i)
  })

  it("recovers content even when both <think> AND markdown fences are present", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText:
        '<think>reasoning chain here</think>\n```json\n{"summary":"LYNIQ studio."}\n```',
    })
    const out = await generateLlmsSummary(
      { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
      ai,
    )
    expect(out.summary).toBe("LYNIQ studio.")
  })
})

describe("generateLlmsSummary — failure modes", () => {
  it("throws when the AI returns literally nothing (empty string + null parsed)", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText: "",
    })

    await expect(
      generateLlmsSummary(
        { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
        ai,
      ),
    ).rejects.toThrow(/unparseable/i)
  })

  it("propagates AI provider network errors so the UI can notify the user", async () => {
    const ai = vi.fn(async () => {
      throw new Error("rate-limited")
    }) as unknown as (opts: AiCallOptions) => Promise<AiCallResult>

    await expect(
      generateLlmsSummary(
        { siteName: "LYNIQ", targetLanguage: "en-US", ai: AI },
        ai,
      ),
    ).rejects.toThrow(/rate-limited/)
  })

  it("treats a draft of only whitespace as 'no draft' (generate mode)", async () => {
    const ai = fakeAi({
      parsed: { summary: "Branding studio for product-led teams." },
    })
    const out = await generateLlmsSummary(
      {
        siteName: "LYNIQ",
        draft: "   \n  \t",
        targetLanguage: "en-US",
        ai: AI,
      },
      ai,
    )
    // The whitespace draft was treated as empty, so the
    // passthrough check is skipped and quality is fine.
    expect(out.qualityOk).toBe(true)
  })
})
