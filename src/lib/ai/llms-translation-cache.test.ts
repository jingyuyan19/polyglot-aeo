import { afterEach, describe, expect, it, vi } from "vitest"

import type { LocaleInfo } from "../framer/locales"
import {
  llmsTranslationCacheKey,
  readCachedLlmsTranslations,
  rememberLlmsTranslations,
} from "./llms-translation-cache"
import type { LlmsTranslateEntryInput } from "./llms-translate"

const JA: LocaleInfo = {
  id: "ja",
  code: "ja",
  name: "Japanese",
  slug: "ja",
  isDefault: false,
}

function installStorage() {
  const data = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
  } satisfies Storage)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("llms translation cache", () => {
  it("keys by locale, brand voice, title and summary", () => {
    const item: LlmsTranslateEntryInput = {
      id: "1",
      title: "Hello world",
      summary: "A summary",
    }
    expect(llmsTranslationCacheKey(item, JA, "Warm")).toBe(
      llmsTranslationCacheKey({ ...item, id: "2" }, JA, "Warm"),
    )
    expect(llmsTranslationCacheKey(item, JA, "Warm")).not.toBe(
      llmsTranslationCacheKey(item, JA, "Formal"),
    )
  })

  it("reuses accepted translations and leaves misses for AI", () => {
    installStorage()
    const item: LlmsTranslateEntryInput = {
      id: "cms:a",
      title: "Radiant skincare branding",
      summary: "Identity work for a skincare studio.",
    }
    rememberLlmsTranslations(
      [item],
      JA,
      new Map([
        [
          item.id,
          {
            title: "輝くスキンケアのブランディング",
            summary: "スキンケアスタジオのアイデンティティ制作。",
          },
        ],
      ]),
      "Warm",
    )

    const out = readCachedLlmsTranslations(
      [item, { id: "cms:b", title: "New item" }],
      JA,
      "Warm",
    )

    expect(out.translated.get(item.id)?.title).toContain("スキンケア")
    expect(out.missing.map((x) => x.id)).toEqual(["cms:b"])
  })
})
