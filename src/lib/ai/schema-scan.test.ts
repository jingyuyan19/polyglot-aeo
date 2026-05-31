import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  estimateSchemaTranslateMaxTokens,
  orchestrateTranslate,
  stripIdentityFieldsForTranslation,
} from "./schema-scan"
import type { SchemaInput } from "../schema/types"
import { callAi } from "./client"
import type { SchemaProposal } from "../schema/proposal"

vi.mock("./client", () => ({
  callAi: vi.fn(),
}))

const mockCallAi = vi.mocked(callAi)

beforeEach(() => {
  mockCallAi.mockReset()
})

describe("stripIdentityFieldsForTranslation", () => {
  // Regression target: the V1 cross-page drift was caused by per-
  // page translation of publisher/author. V2 strips these from the
  // translation payload so the AI can't drift them. The tests pin
  // the contract: payload sent to AI for translation must NOT
  // include identity-owned fields, but original (caller) input
  // must remain untouched.

  it("strips publisherName from Article translate payload", () => {
    const input: SchemaInput = {
      kind: "Article",
      canonicalUrl: "https://acme.com/x",
      language: "en",
      headline: "h",
      authorName: "Jane Smith",
      publisherName: "Acme",
      publisherLogo: "https://acme.com/logo.png",
      datePublished: "2026-01-01",
    }
    const out = stripIdentityFieldsForTranslation(input)
    if (out.kind !== "Article") throw new Error("not Article")
    expect(out.publisherName).toBe("")
    expect(out.publisherLogo).toBeUndefined()
  })

  it("preserves Article author for translation", () => {
    // We KEEP authorName so a real per-page byline can be
    // localized (Jane Smith → ジェーン・スミス). Render-time
    // identity injection still has the final say between
    // identity.defaultAuthor vs per-page byline.
    const input: SchemaInput = {
      kind: "Article",
      canonicalUrl: "https://acme.com/x",
      language: "en",
      headline: "h",
      authorName: "Jane Smith",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    }
    const out = stripIdentityFieldsForTranslation(input)
    if (out.kind !== "Article") throw new Error("not Article")
    expect(out.authorName).toBe("Jane Smith")
  })

  it("strips Organization name", () => {
    // Organization.name is the canonical brand — must NEVER be
    // translated per-page.
    const input: SchemaInput = {
      kind: "Organization",
      canonicalUrl: "https://acme.com",
      language: "en",
      name: "Acme",
      description: "We make widgets.",
      url: "https://acme.com",
    }
    const out = stripIdentityFieldsForTranslation(input)
    if (out.kind !== "Organization") throw new Error("not Organization")
    expect(out.name).toBe("")
    expect(out.description).toBe("We make widgets.")
  })

  it("does not mutate the original input", () => {
    // Pure function — caller's reference must remain intact for
    // the post-translation merge fallback in orchestrateTranslate.
    const input: SchemaInput = {
      kind: "Article",
      canonicalUrl: "https://acme.com/x",
      language: "en",
      headline: "h",
      authorName: "Jane",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    }
    const before = JSON.stringify(input)
    stripIdentityFieldsForTranslation(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it("passes through Product/FAQPage/LocalBusiness unchanged", () => {
    // No identity-shaped fields → nothing to strip.
    const product: SchemaInput = {
      kind: "Product",
      canonicalUrl: "https://acme.com/widget",
      language: "en",
      name: "Widget",
    }
    expect(stripIdentityFieldsForTranslation(product)).toBe(product)

    const faq: SchemaInput = {
      kind: "FAQPage",
      canonicalUrl: "https://acme.com/faq",
      language: "en",
      questions: [{ question: "Q", answer: "A" }],
    }
    expect(stripIdentityFieldsForTranslation(faq)).toBe(faq)
  })
})

describe("estimateSchemaTranslateMaxTokens", () => {
  it("uses a safer floor than the old 1024 token cap", () => {
    const input: SchemaInput = {
      kind: "Article",
      canonicalUrl: "https://acme.com/post",
      language: "en",
      headline: "A practical guide to launch design systems",
      description: "A short description that should be translated.",
      authorName: "Editorial Team",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    }

    expect(estimateSchemaTranslateMaxTokens(input)).toBeGreaterThanOrEqual(
      2048,
    )
  })

  it("scales up for larger FAQ payloads without becoming unbounded", () => {
    const input: SchemaInput = {
      kind: "FAQPage",
      canonicalUrl: "https://acme.com/faq",
      language: "en",
      questions: Array.from({ length: 6 }, (_, i) => ({
        question: `How does the platform handle enterprise workflow number ${i + 1}?`,
        answer:
          "The platform combines strategy, design, implementation, and measurement into a repeatable process for launch teams. ".repeat(
            8,
          ),
      })),
    }

    expect(estimateSchemaTranslateMaxTokens(input)).toBeGreaterThan(2048)
    expect(estimateSchemaTranslateMaxTokens(input)).toBeLessThanOrEqual(6000)
  })
})

describe("orchestrateTranslate", () => {
  const defaultLocale = {
    id: "default",
    code: "en",
    name: "English",
    slug: "",
    isDefault: true,
  }
  const jaLocale = {
    id: "ja",
    code: "ja",
    name: "Japanese",
    slug: "ja",
    isDefault: false,
  }
  const proposal: SchemaProposal = {
    pageId: "home",
    pageLabel: "Home",
    url: "https://acme.com",
    kind: "Article",
    inputs: {
      kind: "Article",
      canonicalUrl: "https://acme.com",
      language: "en",
      headline: "Launch systems for modern teams",
      description: "We help teams launch stronger brands and websites.",
      authorName: "Editorial Team",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    },
    originalInputs: {
      kind: "Article",
      canonicalUrl: "https://acme.com",
      language: "en",
      headline: "Launch systems for modern teams",
      description: "We help teams launch stronger brands and websites.",
      authorName: "Editorial Team",
      publisherName: "Acme",
      datePublished: "2026-01-01",
    },
    enabled: true,
    sourceHash: "hash",
    confidence: 0.9,
    rationale: "Article-like content.",
  }

  it("automatically retries a passthrough translation once with a reinforced prompt", async () => {
    mockCallAi
      .mockResolvedValueOnce({
        rawText: "{}",
        parsed: {
          canonicalUrl: "https://acme.com",
          headline: "Launch systems for modern teams",
          description: "We help teams launch stronger brands and websites.",
          authorName: "Editorial Team",
          publisherName: "",
          datePublished: "2026-01-01",
        },
      })
      .mockResolvedValueOnce({
        rawText: "{}",
        parsed: {
          canonicalUrl: "https://acme.com",
          headline: "現代チームのためのローンチシステム",
          description:
            "チームがより強いブランドとウェブサイトを立ち上げられるよう支援します。",
          authorName: "編集チーム",
          publisherName: "",
          datePublished: "2026-01-01",
        },
      })

    const result = await orchestrateTranslate({
      proposals: [proposal],
      defaultLocale,
      targetLocales: [jaLocale],
      ai: {
        providerId: "deepseek",
        modelId: "deepseek-v4-pro",
        apiKey: "test",
      },
      concurrency: 1,
    })

    expect(mockCallAi).toHaveBeenCalledTimes(2)
    expect(mockCallAi.mock.calls[1][0].prompt.system).toContain(
      "RETRY CONTEXT",
    )
    expect(result.untranslated).toEqual([])
    expect(result.overrides.home?.ja).toMatchObject({
      kind: "Article",
      headline: "現代チームのためのローンチシステム",
    })
  })

  it("keeps reporting the cell when the reinforced retry still fails", async () => {
    mockCallAi.mockResolvedValue({
      rawText: "{}",
      parsed: {
        canonicalUrl: "https://acme.com",
        headline: "Launch systems for modern teams",
        description: "We help teams launch stronger brands and websites.",
        authorName: "Editorial Team",
        publisherName: "",
        datePublished: "2026-01-01",
      },
    })

    const result = await orchestrateTranslate({
      proposals: [proposal],
      defaultLocale,
      targetLocales: [jaLocale],
      ai: {
        providerId: "deepseek",
        modelId: "deepseek-v4-pro",
        apiKey: "test",
      },
      concurrency: 1,
    })

    expect(mockCallAi).toHaveBeenCalledTimes(2)
    expect(result.untranslated).toEqual([
      { pageId: "home", localeCode: "ja", reason: "mixed-script" },
    ])
  })
})
