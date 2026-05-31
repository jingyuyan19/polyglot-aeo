import { describe, expect, it, vi } from "vitest"

import type { CollectionItemRow } from "../framer/cms"
import type { LocaleInfo } from "../framer/locales"
import type { AiCallOptions, AiCallResult } from "./client"
import { buildLlmsTranslatePrompt } from "./prompts"
import {
  acceptTranslatedItem,
  chunk,
  estimateLlmsBatchMaxTokens,
  estimateLlmsTranslateCost,
  extractTranslateItemsArray,
  parseTranslateResponse,
  pickRowsNeedingTranslation,
  translateLlmsEntries,
  translateLlmsHeader,
  translateLlmsItems,
} from "./llms-translate"

const EN_LOCALE: LocaleInfo = {
  id: "loc-en",
  code: "en-US",
  name: "English",
  slug: "en",
  isDefault: true,
}

const JA_LOCALE: LocaleInfo = {
  id: "loc-ja",
  code: "ja",
  name: "日本語",
  slug: "ja",
  isDefault: false,
}

const FR_LOCALE: LocaleInfo = {
  id: "loc-fr",
  code: "fr-FR",
  name: "Français",
  slug: "fr",
  isDefault: false,
}

function makeRow(
  overrides: Partial<CollectionItemRow> = {},
): CollectionItemRow {
  return {
    id: "row-default",
    slug: "row",
    draft: false,
    fieldValues: {},
    fieldValuesByLocale: {},
    localeSlugs: {},
    ...overrides,
  }
}

const AI = {
  providerId: "anthropic" as const,
  modelId: "claude-haiku",
  apiKey: "test-key",
}

/**
 * Build a fake `callAi` that returns a canned response. The
 * orchestrator round-trips item ids, so the canned response is
 * keyed by the input items' ids.
 */
function fakeAi(response: { rawText?: string; parsed?: unknown; cost?: number }) {
  return vi.fn(
    async (): Promise<AiCallResult> => ({
      rawText: response.rawText ?? "",
      parsed: response.parsed ?? null,
      estimatedCostUsd: response.cost ?? 0.0001,
    }),
  ) as unknown as (opts: AiCallOptions) => Promise<AiCallResult>
}

describe("pickRowsNeedingTranslation", () => {
  const rows: CollectionItemRow[] = [
    makeRow({
      id: "a",
      fieldValues: { Title: "Already Localized" },
      fieldValuesByLocale: { "loc-ja": { Title: "翻訳済み" } },
    }),
    makeRow({
      id: "b",
      fieldValues: { Title: "Needs Translation" },
      fieldValuesByLocale: {},
    }),
    makeRow({
      id: "c",
      fieldValues: { Title: "" }, // blank in default — generator's other skip path
      fieldValuesByLocale: {},
    }),
  ]

  it("returns rows missing the locale-specific title field", () => {
    const result = pickRowsNeedingTranslation(rows, JA_LOCALE, "Title")
    expect(result.map((r) => r.id)).toEqual(["b"])
  })

  it("returns nothing for the default locale (no translation step)", () => {
    expect(pickRowsNeedingTranslation(rows, EN_LOCALE, "Title")).toEqual([])
  })

  it("treats whitespace-only localized titles as missing", () => {
    const ws = [
      makeRow({
        id: "x",
        fieldValues: { Title: "Source" },
        fieldValuesByLocale: { "loc-ja": { Title: "  \n " } },
      }),
    ]
    expect(pickRowsNeedingTranslation(ws, JA_LOCALE, "Title").map((r) => r.id)).toEqual([
      "x",
    ])
  })
})

describe("estimateLlmsTranslateCost", () => {
  // Cost is NOT strictly proportional to item count because of the
  // fixed prompt-overhead constant (~600 input tokens for the system
  // prompt), so a linear-scale assertion would over-specify. We just
  // verify the right shape: more items → strictly more cost.
  it("grows monotonically with item count", () => {
    const c1 = estimateLlmsTranslateCost(1, 1, 5)
    const c10 = estimateLlmsTranslateCost(10, 1, 5)
    const c30 = estimateLlmsTranslateCost(30, 1, 5)
    expect(c10).toBeGreaterThan(c1)
    expect(c30).toBeGreaterThan(c10)
  })

  it("returns 0 for zero items", () => {
    expect(estimateLlmsTranslateCost(0, 1, 5)).toBe(0)
  })

  it("returns 0 when both prices are 0 (free tier)", () => {
    expect(estimateLlmsTranslateCost(10, 0, 0)).toBe(0)
  })
})

describe("buildLlmsTranslatePrompt", () => {
  it("passes path context so duplicate CMS titles can be disambiguated", () => {
    const prompt = buildLlmsTranslatePrompt({
      targetLanguage: "ja",
      targetRegion: "Japanese",
      items: [
        {
          id: "a",
          title: "How we redesigned a local brand's website from scratch to launch",
          summary: "Learn effective strategies for reducing load times.",
          path: "boosting-site-speed-key-tips-for-faster-load-times",
        },
        {
          id: "b",
          title: "How we redesigned a local brand's website from scratch to launch",
          summary: "A checklist for launching a website successfully.",
          path: "the-ultimate-checklist-for-launching-a-successful-website",
        },
      ],
    })

    expect(prompt.system).toContain("DO NOT merge")
    expect(prompt.system).toContain("trust the path + summary")
    expect(prompt.system).toContain("Do NOT output \"path\"")
    expect(prompt.user).toContain("boosting-site-speed-key-tips")
    expect(prompt.user).toContain("the-ultimate-checklist")
  })

  it("teaches brand-heavy short titles without allowing generic English passthrough", () => {
    const prompt = buildLlmsTranslatePrompt({
      targetLanguage: "ko",
      targetRegion: "Korean",
      items: [
        {
          id: "project-a",
          title: "Apex clothing Co. rebrand",
          path: "apex-clothing-co-rebrand",
        },
      ],
    })

    expect(prompt.system).toContain("Apex Clothing Co. 리브랜딩")
    expect(prompt.system).toContain("Radiant 스킨케어 브랜딩")
    expect(prompt.system).toContain("온라인 신뢰 구축")
    expect(prompt.system).toContain("Do NOT leave generic words")
  })

  it("makes untranslated retries cover omitted items, not just copied text", () => {
    const prompt = buildLlmsTranslatePrompt({
      targetLanguage: "ja",
      targetRegion: "Japanese",
      retryReason: "untranslated",
      items: [
        {
          id: "article-testimonials",
          title: "Building trust online: the importance of testimonials",
          path: "building-trust-online-the-importance-of-testimonials",
        },
      ],
    })

    expect(prompt.system).toContain("omitted an item")
    expect(prompt.system).toContain("Return every input item exactly once")
    expect(prompt.system).toContain("オンラインで信頼を築く")
  })
})

describe("chunk", () => {
  it("splits an array into evenly-sized batches", () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })
  it("returns an empty array for an empty input", () => {
    expect(chunk([], 5)).toEqual([])
  })
})

describe("extractTranslateItemsArray", () => {
  it("accepts a bare array (Anthropic-style)", () => {
    const arr = [{ id: "a", title: "T" }]
    expect(extractTranslateItemsArray(arr)).toEqual(arr)
  })

  it("unwraps json_object envelopes used by OpenAI-compatible APIs", () => {
    const inner = [{ id: "a", title: "T" }]
    expect(extractTranslateItemsArray({ items: inner })).toEqual(inner)
    expect(extractTranslateItemsArray({ translations: inner })).toEqual(inner)
    expect(extractTranslateItemsArray({ results: inner })).toEqual(inner)
  })

  it("accepts an object map of items keyed by id", () => {
    const out = extractTranslateItemsArray({
      "row-1": { title: "One" },
      "row-2": { title: "Two", summary: "S" },
    })
    expect(out).toHaveLength(2)
    expect(out?.[0]).toMatchObject({ id: "row-1", title: "One" })
  })

  it("unwraps an items object map and preserves ids from object keys", () => {
    const out = parseTranslateResponse(
      {
        items: {
          "cms-a": { title: "翻訳 A" },
          "cms-b": { title: "翻訳 B", summary: "要約 B" },
        },
      },
      "",
    )
    expect(out).toEqual([
      { id: "cms-a", title: "翻訳 A" },
      { id: "cms-b", title: "翻訳 B", summary: "要約 B" },
    ])
  })

  it("returns null for prose or unrelated JSON", () => {
    expect(extractTranslateItemsArray(null)).toBeNull()
    expect(extractTranslateItemsArray({ error: "nope" })).toBeNull()
    expect(extractTranslateItemsArray("not json")).toBeNull()
  })
})

describe("parseTranslateResponse", () => {
  it("parses { items: [...] } from provider pre-parse (DeepSeek json_object)", () => {
    const out = parseTranslateResponse(
      {
        items: [
          { id: "cms-1", title: "ラディアントスキンケア" },
          { id: "cms-2", title: "エイペックス再ブランド" },
        ],
      },
      "",
    )
    expect(out).toEqual([
      { id: "cms-1", title: "ラディアントスキンケア" },
      { id: "cms-2", title: "エイペックス再ブランド" },
    ])
  })

  it("parses a bare array from rawText when parsed is null", () => {
    const out = parseTranslateResponse(
      null,
      '[{"id":"x","title":"翻訳タイトル","summary":"要約"}]',
    )
    expect(out).toEqual([
      { id: "x", title: "翻訳タイトル", summary: "要約" },
    ])
  })

  it("strips reasoning tags before JSON extraction", () => {
    const out = parseTranslateResponse(
      null,
      `internal\n{"items":[{"id":"a","title":"日本語タイトル"}]}`,
    )
    expect(out).toEqual([{ id: "a", title: "日本語タイトル" }])
  })

  it("coerces numeric ids to strings", () => {
    const out = parseTranslateResponse(
      { items: [{ id: 42, title: "タイトル" }] },
      "",
    )
    expect(out?.[0]?.id).toBe("42")
  })

  it("returns null for unrecoverable shapes (batch → parse-failed in orchestrator)", () => {
    expect(parseTranslateResponse(null, "Sorry, I cannot help.")).toBeNull()
    expect(
      parseTranslateResponse({ data: "not-an-array" }, ""),
    ).toBeNull()
  })
})

describe("translateLlmsItems — happy paths", () => {
  it("short-circuits for the default locale (no AI call)", async () => {
    const ai = fakeAi({})
    const rows = [makeRow({ id: "a", fieldValues: { Title: "Source" } })]

    const out = await translateLlmsItems(
      {
        rows,
        locale: EN_LOCALE,
        titleField: "Title",
        ai: AI,
      },
      ai,
    )

    expect(ai).not.toHaveBeenCalled()
    expect(out.attempted).toBe(0)
    expect(out.succeeded).toBe(0)
    expect(out.failed).toEqual([])
    expect(out.rows[0].id).toBe("a")
  })

  it("returns rows untouched when nothing needs translation", async () => {
    const ai = fakeAi({})
    const rows = [
      makeRow({
        id: "a",
        fieldValues: { Title: "Source" },
        fieldValuesByLocale: { "loc-ja": { Title: "翻訳済み" } },
      }),
    ]

    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )

    expect(ai).not.toHaveBeenCalled()
    expect(out.attempted).toBe(0)
    expect(out.succeeded).toBe(0)
  })

  it("translates missing items, stitches into fieldValuesByLocale, leaves others alone", async () => {
    const ai = fakeAi({
      parsed: [
        { id: "b", title: "翻訳されたタイトル", summary: "翻訳された要約" },
      ],
      cost: 0.0023,
    })
    const rows = [
      makeRow({
        id: "a",
        fieldValues: { Title: "Already", Summary: "Done." },
        fieldValuesByLocale: { "loc-ja": { Title: "完了" } },
      }),
      makeRow({
        id: "b",
        fieldValues: { Title: "Needs Translation", Summary: "Pending." },
      }),
    ]

    const out = await translateLlmsItems(
      {
        rows,
        locale: JA_LOCALE,
        titleField: "Title",
        summaryField: "Summary",
        ai: AI,
      },
      ai,
    )

    expect(ai).toHaveBeenCalledTimes(1)
    expect(out.attempted).toBe(1)
    expect(out.succeeded).toBe(1)
    expect(out.failed).toEqual([])
    expect(out.costUsd).toBeCloseTo(0.0023)

    const rowB = out.rows.find((r) => r.id === "b")!
    expect(rowB.fieldValuesByLocale["loc-ja"]).toEqual({
      Title: "翻訳されたタイトル",
      Summary: "翻訳された要約",
    })

    // Existing JA values on row a are preserved exactly.
    const rowA = out.rows.find((r) => r.id === "a")!
    expect(rowA.fieldValuesByLocale["loc-ja"]).toEqual({ Title: "完了" })
  })

  it("does not mutate the input rows", async () => {
    const ai = fakeAi({
      parsed: [{ id: "b", title: "翻訳", summary: "要約" }],
    })
    const original: CollectionItemRow[] = [
      makeRow({
        id: "b",
        fieldValues: { Title: "Original" },
      }),
    ]
    // Snapshot the original by deep-cloning the field structures.
    const beforeFields = { ...original[0].fieldValues }
    const beforeByLocale = { ...original[0].fieldValuesByLocale }

    await translateLlmsItems(
      { rows: original, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )

    expect(original[0].fieldValues).toEqual(beforeFields)
    expect(original[0].fieldValuesByLocale).toEqual(beforeByLocale)
  })

  it("tolerates markdown-fenced JSON output", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText:
        '```json\n[{"id":"b","title":"翻訳されたタイトルです","summary":"これは要約です"}]\n```',
    })
    const rows = [makeRow({ id: "b", fieldValues: { Title: "Source" } })]

    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )

    expect(out.succeeded).toBe(1)
    expect(out.rows[0].fieldValuesByLocale["loc-ja"]).toEqual({
      Title: "翻訳されたタイトルです",
    })
  })

  it("tolerates {items: [...]} envelope shape", async () => {
    const ai = fakeAi({
      parsed: {
        items: [{ id: "b", title: "翻訳されたタイトル" }],
      },
    })
    const rows = [makeRow({ id: "b", fieldValues: { Title: "Source" } })]

    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )
    expect(out.succeeded).toBe(1)
  })
})

describe("translateLlmsItems — quality validation", () => {
  it("flags items where AI returned the source verbatim (Latin-target case)", async () => {
    // Use a Latin-script target locale so the script check is a
    // no-op (lenient validator returns true for Latin output in
    // Latin locales). This isolates the byte-equal passthrough
    // detection — what we want to assert here.
    const ai = fakeAi({
      parsed: [
        {
          id: "b",
          title: "Multilingual SEO Plugin",
          summary: "Plugin to localize Framer sites for global audiences.",
        },
      ],
    })
    const rows = [
      makeRow({
        id: "b",
        fieldValues: {
          Title: "Multilingual SEO Plugin",
          Summary: "Plugin to localize Framer sites for global audiences.",
        },
      }),
    ]

    const out = await translateLlmsItems(
      {
        rows,
        locale: FR_LOCALE,
        titleField: "Title",
        summaryField: "Summary",
        ai: AI,
      },
      ai,
    )

    expect(out.succeeded).toBe(0)
    expect(out.failed).toHaveLength(1)
    expect(out.failed[0].reason).toBe("untranslated")
    // Row should NOT have FR fields injected — failed items go through
    // the generator's normal skip path.
    expect(out.rows[0].fieldValuesByLocale["loc-fr"]).toBeUndefined()
  })

  it("labels CJK byte-equal Latin passthrough as untranslated (not mixed-script)", async () => {
    const longSource =
      "An impressively long Latin headline without any Japanese script"
    const ai = fakeAi({
      parsed: [{ id: "b", title: longSource }],
    })
    const rows = [
      makeRow({
        id: "b",
        fieldValues: { Title: longSource },
      }),
    ]
    const out = await translateLlmsItems(
      {
        rows,
        locale: JA_LOCALE,
        titleField: "Title",
        ai: AI,
      },
      ai,
    )
    expect(out.failed).toHaveLength(1)
    expect(out.failed[0].reason).toBe("untranslated")
  })

  it("accepts ja title when summary stays English (summary uses generator fallback)", async () => {
    const source = {
      title: "Why Mobile-First Design is Crucial for Modern Websites",
      summary:
        "Exploring how a mobile-first approach enhances user experience and boosts search rankings.",
    }
    const ai = fakeAi({
      parsed: [
        {
          id: "b",
          title: "モバイルファーストデザインが重要な理由",
          summary: source.summary,
        },
      ],
    })
    const rows = [
      makeRow({
        id: "b",
        fieldValues: { Title: source.title, Summary: source.summary },
      }),
    ]
    const out = await translateLlmsItems(
      {
        rows,
        locale: JA_LOCALE,
        titleField: "Title",
        summaryField: "Summary",
        ai: AI,
      },
      ai,
    )
    expect(out.succeeded).toBe(1)
    expect(out.failed).toEqual([])
    expect(out.rows[0].fieldValuesByLocale["loc-ja"]?.Title).toBe(
      "モバイルファーストデザインが重要な理由",
    )
    expect(out.rows[0].fieldValuesByLocale["loc-ja"]?.Summary).toBeUndefined()
  })

  it("acceptTranslatedItem: title-only passthrough is untranslated", () => {
    const r = acceptTranslatedItem(
      { title: "Same English Title Here", summary: "ignored" },
      { title: "Same English Title Here", summary: "x" },
      "ja",
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("untranslated")
  })

  it("flags items whose AI translation failed script validation (Latin output for ja)", async () => {
    const ai = fakeAi({
      parsed: [
        {
          id: "b",
          title: "A perfectly Latin title that JA would never use",
          summary: "Latin description in JA locale.",
        },
      ],
    })
    const rows = [
      makeRow({
        id: "b",
        fieldValues: { Title: "Source title", Summary: "Source summary." },
      }),
    ]

    const out = await translateLlmsItems(
      {
        rows,
        locale: JA_LOCALE,
        titleField: "Title",
        summaryField: "Summary",
        ai: AI,
      },
      ai,
    )

    expect(out.succeeded).toBe(0)
    expect(out.failed[0].reason).toBe("mixed-script")
  })

  it("accepts Latin output for Latin-script locales (fr) without flagging", async () => {
    const ai = fakeAi({
      parsed: [
        { id: "b", title: "Plugin SEO multilingue pour Framer", summary: "Optimisez votre site pour ChatGPT et Perplexity." },
      ],
    })
    const rows = [
      makeRow({
        id: "b",
        fieldValues: {
          Title: "Multilingual SEO Plugin for Framer",
          Summary: "Optimize your site for ChatGPT and Perplexity.",
        },
      }),
    ]

    const out = await translateLlmsItems(
      {
        rows,
        locale: FR_LOCALE,
        titleField: "Title",
        summaryField: "Summary",
        ai: AI,
      },
      ai,
    )

    expect(out.succeeded).toBe(1)
    expect(out.failed).toEqual([])
    const rowB = out.rows[0]
    expect(rowB.fieldValuesByLocale["loc-fr"]?.Title).toBe(
      "Plugin SEO multilingue pour Framer",
    )
  })
})

describe("translateLlmsItems — failure modes", () => {
  it("treats unparseable AI output as a whole-batch failure (every item flagged)", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText: "I'm sorry, I cannot help with that.",
    })
    const rows = [
      makeRow({ id: "a", fieldValues: { Title: "First" } }),
      makeRow({ id: "b", fieldValues: { Title: "Second" } }),
    ]

    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )

    expect(out.succeeded).toBe(0)
    expect(out.failed).toHaveLength(2)
    expect(out.failed.every((f) => f.reason === "parse-failed")).toBe(true)
  })

  it("automatically retries parse failures with a stricter prompt before surfacing errors", async () => {
    let calls = 0
    const ai = vi.fn(
      async (): Promise<AiCallResult> => {
        calls += 1
        if (calls === 1) {
          return {
            parsed: null,
            rawText: "Sure, here are the translations in prose.",
          }
        }
        return {
          parsed: {
            items: [{ id: "b", title: "翻訳されたタイトルです" }],
          },
          rawText: "",
        }
      },
    ) as unknown as (opts: AiCallOptions) => Promise<AiCallResult>
    const rows = [
      makeRow({ id: "b", fieldValues: { Title: "Source title long enough" } }),
    ]

    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )

    expect(ai).toHaveBeenCalledTimes(2)
    expect(out.succeeded).toBe(1)
    expect(out.failed).toEqual([])
    expect(out.rows[0].fieldValuesByLocale["loc-ja"]?.Title).toBe(
      "翻訳されたタイトルです",
    )
  })

  it("splits validation-failed retry batches into single-item repairs", async () => {
    let calls = 0
    const ai = vi.fn(
      async (opts: AiCallOptions): Promise<AiCallResult> => {
        calls += 1
        const user = opts.prompt.user
        if (calls <= 2) {
          return {
            parsed: {
              items: [
                { id: "a", title: "Radiant skincare branding" },
                { id: "b", title: "Apex clothing Co. rebrand" },
              ],
            },
            rawText: "",
            estimatedCostUsd: 0.0001,
          }
        }
        const isRadiant = user.includes('"id": "a"')
        return {
          parsed: {
            items: [
              isRadiant
                ? { id: "a", title: "「Radiant」スキンケアブランディング" }
                : { id: "b", title: "「Apex Clothing Co.」リブランディング" },
            ],
          },
          rawText: "",
          estimatedCostUsd: 0.0001,
        }
      },
    ) as unknown as (opts: AiCallOptions) => Promise<AiCallResult>
    const rows = [
      makeRow({
        id: "a",
        slug: "radiant-skincare-branding",
        fieldValues: { Title: "Radiant skincare branding" },
      }),
      makeRow({
        id: "b",
        slug: "apex-clothing-co-rebrand",
        fieldValues: { Title: "Apex clothing Co. rebrand" },
      }),
    ]

    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )

    expect(ai).toHaveBeenCalledTimes(4)
    expect(out.succeeded).toBe(2)
    expect(out.failed).toEqual([])
    expect(out.rows[0].fieldValuesByLocale["loc-ja"]?.Title).toBe(
      "「Radiant」スキンケアブランディング",
    )
    expect(out.rows[1].fieldValuesByLocale["loc-ja"]?.Title).toBe(
      "「Apex Clothing Co.」リブランディング",
    )
  })

  it("parses { translations: [...] } envelope (json_object providers)", async () => {
    const ai = fakeAi({
      parsed: {
        translations: [
          { id: "b", title: "翻訳されたタイトルです" },
        ],
      },
    })
    const rows = [
      makeRow({ id: "b", fieldValues: { Title: "Source title long enough" } }),
    ]
    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )
    expect(out.succeeded).toBe(1)
    expect(out.failed).toEqual([])
  })

  it("translateLlmsEntries batches mixed CMS/page-like entries by stable ids", async () => {
    const ai = fakeAi({
      parsed: {
        items: [
          {
            id: "cms:projects:row-a",
            title: "「Radiant」スキンケアブランディング",
            summary: "広告なしのスキンケア体験。",
          },
          {
            id: "page:home",
            title: "ホーム",
            summary: "ブランドの成長を支援します。",
          },
        ],
      },
    })

    const out = await translateLlmsEntries(
      {
        items: [
          {
            id: "cms:projects:row-a",
            title: "Radiant skincare branding",
            summary: "Ad-free skincare experience.",
            path: "radiant-skincare-branding",
          },
          {
            id: "page:home",
            title: "Home",
            summary: "We help brands grow.",
            path: "/",
          },
        ],
        locale: JA_LOCALE,
        ai: AI,
      },
      ai,
    )

    expect(out.succeeded).toBe(2)
    expect(out.failed).toEqual([])
    expect(out.translated.get("cms:projects:row-a")?.title).toBe(
      "「Radiant」スキンケアブランディング",
    )
    expect(out.translated.get("page:home")?.summary).toBe(
      "ブランドの成長を支援します。",
    )
  })

  it("distinguishes parse-failed from English passthrough (untranslated)", async () => {
    const english = "Radiant skincare branding"
    const parseFail = fakeAi({ parsed: null, rawText: "not json at all" })
    const passthrough = fakeAi({
      parsed: {
        items: [{ id: "b", title: english, summary: "Some summary text." }],
      },
    })
    const row = makeRow({
      id: "b",
      fieldValues: { Title: english, Summary: "Some summary text." },
    })

    const parseOut = await translateLlmsItems(
      { rows: [row], locale: JA_LOCALE, titleField: "Title", summaryField: "Summary", ai: AI },
      parseFail,
    )
    expect(parseOut.failed[0]?.reason).toBe("parse-failed")

    const passOut = await translateLlmsItems(
      { rows: [row], locale: JA_LOCALE, titleField: "Title", summaryField: "Summary", ai: AI },
      passthrough,
    )
    expect(passOut.failed[0]?.reason).toBe("untranslated")
  })

  it("recovers when the model returns items in order but wrong ids", async () => {
    const ai = fakeAi({
      parsed: [
        { id: "1", title: "翻訳されたタイトル" },
        { id: "2", title: "もう一つの翻訳タイトル" },
      ],
    })
    const rows = [
      makeRow({
        id: "uuid-a",
        fieldValues: { Title: "First source title long" },
      }),
      makeRow({
        id: "uuid-b",
        fieldValues: { Title: "Second source title long" },
      }),
    ]
    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )
    expect(out.succeeded).toBe(2)
    expect(out.failed).toEqual([])
    expect(out.rows[0].fieldValuesByLocale["loc-ja"]?.Title).toBe(
      "翻訳されたタイトル",
    )
  })

  it("flags items the model dropped from its response", async () => {
    const ai = fakeAi({
      parsed: [
        { id: "a", title: "翻訳されたタイトル" },
        // model omitted "b"
      ],
    })
    const rows = [
      makeRow({ id: "a", fieldValues: { Title: "First long enough" } }),
      makeRow({ id: "b", fieldValues: { Title: "Second long enough" } }),
    ]

    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )

    expect(out.succeeded).toBe(1)
    expect(out.failed).toHaveLength(1)
    expect(out.failed[0].item.itemId).toBe("b")
    expect(out.failed[0].reason).toBe("untranslated")
  })

  it("ignores invented ids the model returns that don't match any input", async () => {
    // Translation must be valid Japanese script (kana or kanji that
    // passes Layer B glyph checks).
    const ai = fakeAi({
      parsed: [
        { id: "a", title: "翻訳されたタイトル" },
        { id: "ghost", title: "幽霊のタイトル" },
      ],
    })
    const rows = [
      makeRow({ id: "a", fieldValues: { Title: "Source long enough" } }),
    ]
    const out = await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )
    expect(out.succeeded).toBe(1)
    expect(out.failed).toEqual([])
    expect(out.attempted).toBe(1)
  })
})

describe("translateLlmsItems — batching", () => {
  it("splits more than 15 items into multiple AI calls", async () => {
    let calls = 0
    const ai = vi.fn(
      async (opts: AiCallOptions): Promise<AiCallResult> => {
        calls += 1
        const match = opts.prompt.user.match(
          /Source items \(default-locale, JSON\):\n([\s\S]*?)\n\nReturn/,
        )
        const items = match
          ? (JSON.parse(match[1]) as Array<{ id: string }>)
          : []
        return {
          parsed: items.map((item, i) => ({
            id: item.id,
            title: `翻訳されたタイトル${i}`,
          })),
          rawText: "",
          estimatedCostUsd: 0.001,
        }
      },
    ) as unknown as (opts: AiCallOptions) => Promise<AiCallResult>
    const rows: CollectionItemRow[] = []
    for (let i = 0; i < 75; i++) {
      rows.push(
        makeRow({
          id: `r-${i}`,
          fieldValues: { Title: `Source ${i} long enough for check` },
        }),
      )
    }
    await translateLlmsItems(
      { rows, locale: JA_LOCALE, titleField: "Title", ai: AI },
      ai,
    )
    // 75 items @ batch size 15 → 5 calls
    expect(calls).toBe(5)
  })

  it("uses a safer dynamic output-token cap for item batches", () => {
    expect(
      estimateLlmsBatchMaxTokens([
        { id: "a", title: "Radiant skincare branding" },
      ]),
    ).toBeGreaterThanOrEqual(1536)

    const large = Array.from({ length: 15 }, (_, i) => ({
      id: `r-${i}`,
      title: `Long article title ${i} about design systems and conversion`,
      summary:
        "A detailed summary about brand strategy, responsive design, customer trust, and launch execution. ".repeat(
          3,
        ),
    }))
    expect(estimateLlmsBatchMaxTokens(large)).toBeGreaterThan(1536)
    expect(estimateLlmsBatchMaxTokens(large)).toBeLessThanOrEqual(5000)
  })
})

describe("translateLlmsHeader", () => {
  const HEADER_BASE = {
    siteName: "LYNIQ",
    siteSummary: "LYNIQ is a personal design studio.",
    brandVoice: undefined,
    ai: AI,
  }

  it("returns the source unchanged for the default locale (no AI call)", async () => {
    const ai = fakeAi({})
    const out = await translateLlmsHeader(
      { ...HEADER_BASE, locale: EN_LOCALE },
      ai,
    )
    expect(ai).not.toHaveBeenCalled()
    expect(out.siteSummary).toBe(HEADER_BASE.siteSummary)
    expect(out.qualityFlag).toBeNull()
    expect(out.costUsd).toBe(0)
  })

  it("returns the source unchanged when summary is empty (caller's contract)", async () => {
    const ai = fakeAi({})
    const out = await translateLlmsHeader(
      { ...HEADER_BASE, siteSummary: "", locale: JA_LOCALE },
      ai,
    )
    expect(ai).not.toHaveBeenCalled()
    expect(out.siteSummary).toBe("")
    expect(out.qualityFlag).toBeNull()
  })

  it("translates the summary and preserves the brand siteName as a Latin token", async () => {
    const ai = fakeAi({
      parsed: {
        siteName: "LYNIQ",
        siteSummary: "LYNIQはパーソナルなデザインスタジオです。",
      },
      cost: 0.0008,
    })
    const out = await translateLlmsHeader(
      { ...HEADER_BASE, locale: JA_LOCALE },
      ai,
    )
    expect(ai).toHaveBeenCalledTimes(1)
    expect(out.siteSummary).toBe("LYNIQはパーソナルなデザインスタジオです。")
    expect(out.qualityFlag).toBeNull()
    expect(out.costUsd).toBeCloseTo(0.0008)
  })

  it("falls back to source + flags `untranslated` when the AI returns the source verbatim", async () => {
    const ai = fakeAi({
      parsed: {
        siteName: "LYNIQ",
        siteSummary: "LYNIQ is a personal design studio.",
      },
    })
    // Use Latin-script target locale so script validation passes;
    // isolates the byte-equal passthrough detection.
    const out = await translateLlmsHeader(
      { ...HEADER_BASE, locale: FR_LOCALE },
      ai,
    )
    expect(out.qualityFlag).toBe("untranslated")
    // File still ships with a header — never empty.
    expect(out.siteSummary).toBe(HEADER_BASE.siteSummary)
  })

  it("falls back to source + flags `mixed-script` when AI ignores the target script for CJK", async () => {
    const ai = fakeAi({
      parsed: {
        siteName: "LYNIQ",
        // Long Latin sentence, far past the 16-char "brand-name"
        // escape hatch — script validator will hard-reject for ja.
        siteSummary:
          "An entirely Latin sentence that absolutely does not belong in a Japanese llms.txt file at all.",
      },
    })
    const out = await translateLlmsHeader(
      { ...HEADER_BASE, locale: JA_LOCALE },
      ai,
    )
    expect(out.qualityFlag).toBe("mixed-script")
    expect(out.siteSummary).toBe(HEADER_BASE.siteSummary)
  })

  it("treats unparseable AI output as `untranslated` and preserves the source summary", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText: "I'm sorry I can't translate that for you.",
    })
    const out = await translateLlmsHeader(
      { ...HEADER_BASE, locale: JA_LOCALE },
      ai,
    )
    expect(out.qualityFlag).toBe("untranslated")
    expect(out.siteSummary).toBe(HEADER_BASE.siteSummary)
  })

  it("tolerates markdown-fenced JSON output", async () => {
    const ai = fakeAi({
      parsed: null,
      rawText:
        '```json\n{"siteName":"LYNIQ","siteSummary":"LYNIQはパーソナルなデザインスタジオです。"}\n```',
    })
    const out = await translateLlmsHeader(
      { ...HEADER_BASE, locale: JA_LOCALE },
      ai,
    )
    expect(out.qualityFlag).toBeNull()
    expect(out.siteSummary).toBe("LYNIQはパーソナルなデザインスタジオです。")
  })

  it("never throws when the AI provider rejects the call (network error fallback)", async () => {
    const ai = vi.fn(async () => {
      throw new Error("rate-limited")
    }) as unknown as (opts: AiCallOptions) => Promise<AiCallResult>
    const out = await translateLlmsHeader(
      { ...HEADER_BASE, locale: JA_LOCALE },
      ai,
    )
    expect(out.qualityFlag).toBe("untranslated")
    expect(out.siteSummary).toBe(HEADER_BASE.siteSummary)
    expect(out.costUsd).toBe(0)
  })
})
