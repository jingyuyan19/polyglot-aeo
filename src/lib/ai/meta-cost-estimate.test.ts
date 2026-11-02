import { describe, expect, it } from "vitest"

import { deepseekProvider } from "./providers/openai-compat"
import {
  estimateMetaBatchCost,
  estimateMetaPromptTokensPerLocale,
  estimateTextTokens,
} from "./meta-cost-estimate"

describe("estimateTextTokens", () => {
  it("allocates more tokens per char for Japanese", () => {
    const ja = estimateTextTokens("デジタルデザインスタジオ", "ja")
    const en = estimateTextTokens("digital design studio", "en")
    expect(ja).toBeGreaterThan(en / 2)
    expect(ja).toBeLessThan(en * 2)
  })
})

describe("estimateMetaPromptTokensPerLocale", () => {
  it("exceeds the legacy 600-token input heuristic for real page context", () => {
    const context =
      "We create digital designs that help brands move faster and convert better. Your business deserves more than just a website. It needs results."
    const en = estimateMetaPromptTokensPerLocale("en", {
      pageContext: context,
      pageType: "Landing page",
    })
    const ja = estimateMetaPromptTokensPerLocale("ja", {
      pageContext: context,
      pageType: "Landing page",
    })
    expect(en).toBeGreaterThan(600)
    expect(ja).toBeGreaterThan(en)
  })
})

describe("estimateMetaBatchCost", () => {
  const flash = deepseekProvider.models[0]!

  it("returns listed and DeepSeek console upper bound", () => {
    const est = estimateMetaBatchCost(
      flash,
      "deepseek",
      ["en", "ja", "ko", "fr"],
      {
        pageContext: "x".repeat(400),
        pageType: "Landing page",
      },
    )
    expect(est).not.toBeNull()
    expect(est!.localeCount).toBe(4)
    expect(est!.costUsdListed).toBeGreaterThan(0.0004)
    expect(est!.costUsdConsoleUpper).toBeGreaterThan(est!.costUsdListed)
  })

  it("scales with locale count", () => {
    const one = estimateMetaBatchCost(flash, "deepseek", ["en"], {
      pageContext: "hello",
    })!
    const four = estimateMetaBatchCost(flash, "deepseek", ["en", "ja", "ko", "fr"], {
      pageContext: "hello",
    })!
    expect(four.costUsdListed).toBeGreaterThan(one.costUsdListed * 3)
  })
})
