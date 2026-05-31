import { describe, expect, it } from "vitest"

import { localeFlagEmoji, toSchemaLanguage } from "./locales"

describe("localeFlagEmoji", () => {
  it("maps language-only codes via fallback", () => {
    expect(localeFlagEmoji("ja")).toBe("🇯🇵")
    expect(localeFlagEmoji("ko")).toBe("🇰🇷")
    expect(localeFlagEmoji("fr")).toBe("🇫🇷")
    expect(localeFlagEmoji("en")).toBe("🇺🇸")
  })

  it("prefers region subtag over language fallback", () => {
    expect(localeFlagEmoji("zh-CN")).toBe("🇨🇳")
    expect(localeFlagEmoji("zh-TW")).toBe("🇹🇼")
    expect(localeFlagEmoji("en-GB")).toBe("🇬🇧")
  })

  it("returns globe for unknown codes", () => {
    expect(localeFlagEmoji("xx")).toBe("🌐")
    expect(localeFlagEmoji("")).toBe("🌐")
  })
})

describe("toSchemaLanguage", () => {
  it("normalizes region casing", () => {
    expect(toSchemaLanguage("zh-cn")).toBe("zh-CN")
  })
})
