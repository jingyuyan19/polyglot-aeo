import { describe, expect, it } from "vitest"

import { resolveProvider } from "../client"
import {
  ALL_PROVIDERS,
  BUILTIN_PROVIDERS,
  generateCustomProviderId,
  materializeCustomProvider,
  type CustomProviderConfig,
} from "./index"
import {
  ensureJsonKeywordPrompt,
  estimateCost,
  safeJsonParse,
  stripReasoningBlocks,
  type Model,
} from "./types"

describe("BUILTIN_PROVIDERS", () => {
  it("includes the expected providers in display order", () => {
    const ids = BUILTIN_PROVIDERS.map((p) => p.id)
    expect(ids).toEqual(["polyglot-managed"])
  })

  it("does not bundle legacy direct-call providers in Marketplace builds", () => {
    expect(ALL_PROVIDERS.map((p) => p.id)).toEqual(["polyglot-managed"])
  })

  it("every provider has at least one model", () => {
    for (const p of BUILTIN_PROVIDERS) {
      expect(p.models.length).toBeGreaterThan(0)
    }
  })

  it("every model has non-negative pricing", () => {
    for (const p of BUILTIN_PROVIDERS) {
      for (const m of p.models) {
        expect(m.pricePerMTokenInput).toBeGreaterThanOrEqual(0)
        expect(m.pricePerMTokenOutput).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it("every provider exposes a console URL for product details", () => {
    for (const p of BUILTIN_PROVIDERS) {
      expect(p.consoleUrl).toMatch(/^https?:\/\//)
    }
  })
})

describe("resolveProvider", () => {
  it("returns null for unknown ids", () => {
    expect(resolveProvider("nope" as never)).toBeNull()
  })

  it("returns the built-in for a known id", () => {
    const p = resolveProvider("polyglot-managed")
    expect(p?.name).toBe("Polyglot Managed AI")
  })

  it("materializes a custom provider when listed in customConfigs", () => {
    const config: CustomProviderConfig = {
      id: "custom:test123",
      name: "My LLM",
      baseUrl: "https://x.example.com/v1",
      modelIds: "model-a, model-b",
    }
    const p = resolveProvider("custom:test123", [config])
    expect(p?.name).toBe("My LLM")
    expect(p?.custom).toBe(true)
    expect(p?.models.map((m) => m.id)).toEqual(["model-a", "model-b"])
  })

  it("does not return custom providers that aren't in the configs list", () => {
    expect(resolveProvider("custom:missing")).toBeNull()
  })
})

describe("materializeCustomProvider", () => {
  it("falls back to a single 'default' model when no model ids are provided", () => {
    const config: CustomProviderConfig = {
      id: "custom:abc",
      name: "Edge Case",
      baseUrl: "https://e.example.com/v1",
      modelIds: "",
    }
    const p = materializeCustomProvider(config)
    expect(p.models).toEqual([
      { id: "default", name: "default", pricePerMTokenInput: 0, pricePerMTokenOutput: 0 },
    ])
  })

  it("trims whitespace from comma-separated model ids", () => {
    const config: CustomProviderConfig = {
      id: "custom:abc",
      name: "X",
      baseUrl: "https://x/v1",
      modelIds: " model-a , model-b ,  ,model-c",
    }
    const p = materializeCustomProvider(config)
    expect(p.models.map((m) => m.id)).toEqual(["model-a", "model-b", "model-c"])
  })

  it("keeps historical custom providers readable but disables browser calls", async () => {
    const config: CustomProviderConfig = {
      id: "custom:abc",
      name: "Historical Provider",
      baseUrl: "https://x/v1",
      modelIds: "model-a",
    }
    const p = materializeCustomProvider(config)
    await expect(
      p.call({
        apiKey: "ignored",
        modelId: "model-a",
        prompt: { system: "Return JSON.", user: "ping" },
      }),
    ).rejects.toThrow(/Marketplace build/)
  })
})

describe("generateCustomProviderId", () => {
  it("produces ids prefixed with 'custom:'", () => {
    const id = generateCustomProviderId()
    expect(id.startsWith("custom:")).toBe(true)
  })

  it("produces unique ids on repeated calls", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(generateCustomProviderId())
    expect(seen.size).toBe(100)
  })
})

describe("estimateCost", () => {
  const model: Model = {
    id: "x",
    name: "x",
    pricePerMTokenInput: 1,
    pricePerMTokenOutput: 5,
  }

  it("returns undefined when both token counts are missing", () => {
    expect(estimateCost(model, undefined, undefined)).toBeUndefined()
  })

  it("treats missing input or output as 0", () => {
    expect(estimateCost(model, 1_000_000, undefined)).toBe(1)
    expect(estimateCost(model, undefined, 1_000_000)).toBe(5)
  })

  it("computes per-million-token cost correctly", () => {
    expect(estimateCost(model, 500_000, 200_000)).toBeCloseTo(0.5 + 1.0, 6)
  })
})

describe("ensureJsonKeywordPrompt", () => {
  it("leaves prompts that already mention JSON unchanged", () => {
    const prompt = {
      system: "Return only JSON.",
      user: "Generate metadata.",
    }
    expect(ensureJsonKeywordPrompt(prompt)).toBe(prompt)
  })

  it("adds a JSON instruction for tiny connectivity prompts", () => {
    const out = ensureJsonKeywordPrompt({
      system: "Reply with ok.",
      user: "ping",
    })
    expect(out.system).toContain("JSON object")
    expect(out.user).toBe("ping")
  })
})

describe("stripReasoningBlocks", () => {
  it("removes a closed <think> block", () => {
    expect(stripReasoningBlocks("<think>analyzing…</think>\n{\"a\":1}")).toBe(
      '{"a":1}',
    )
  })

  it("removes a closed <thinking> block (Anthropic-style)", () => {
    expect(
      stripReasoningBlocks("<thinking>let me see</thinking>\n{\"b\":2}"),
    ).toBe('{"b":2}')
  })

  it("drops everything from an unterminated <think> opener", () => {
    expect(
      stripReasoningBlocks("Here we go\n<think>still reasoning when truncated"),
    ).toBe("Here we go")
  })

  it("returns the original text when there's no think block", () => {
    expect(stripReasoningBlocks('{"a":1}')).toBe('{"a":1}')
  })

  it("removes multiple think blocks in one response", () => {
    expect(
      stripReasoningBlocks(
        "<think>first</think>\n{\"step\":1}\n<think>second</think>\n{\"step\":2}",
      ),
    ).toBe('{"step":1}\n\n{"step":2}')
  })

  it("is case-insensitive", () => {
    expect(stripReasoningBlocks("<THINK>x</THINK>{\"a\":1}")).toBe('{"a":1}')
  })
})

describe("safeJsonParse", () => {
  it("parses pure JSON", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 })
  })

  it("strips a <think> block before parsing", () => {
    expect(
      safeJsonParse('<think>let me think…</think>\n{"title":"OK"}'),
    ).toEqual({ title: "OK" })
  })

  it("returns null when only a truncated <think> block is present", () => {
    expect(safeJsonParse("<think>still going when cut off")).toBeNull()
  })

  it("extracts JSON from a markdown fence", () => {
    expect(safeJsonParse("```json\n{\"b\":2}\n```")).toEqual({ b: 2 })
  })

  it("extracts JSON from a fence without a language tag", () => {
    expect(safeJsonParse("```\n{\"c\":3}\n```")).toEqual({ c: 3 })
  })

  it("extracts JSON when wrapped in prose", () => {
    expect(safeJsonParse('Here is your meta: {"title":"Hi"} hope this helps')).toEqual({
      title: "Hi",
    })
  })

  it("returns null on garbage input", () => {
    expect(safeJsonParse("totally not json")).toBeNull()
  })

  it("handles nested objects when extracting from prose", () => {
    expect(safeJsonParse('Result: {"a": {"b": 1, "c": [1,2,3]}, "d": "x"}')).toEqual({
      a: { b: 1, c: [1, 2, 3] },
      d: "x",
    })
  })
})
