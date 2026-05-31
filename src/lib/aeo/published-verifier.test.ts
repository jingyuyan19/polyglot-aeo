import { describe, expect, it } from "vitest"

import {
  extractJsonLdScripts,
  llmsFilenameForLocale,
  verifyJsonLdHtml,
} from "./published-verifier"

describe("published verifier helpers", () => {
  it("extracts JSON-LD scripts", () => {
    const scripts = extractJsonLdScripts(`
      <script type="application/ld+json">{"@type":"WebSite"}</script>
      <script>ignore()</script>
    `)
    expect(scripts).toEqual(['{"@type":"WebSite"}'])
  })

  it("counts parse errors and collects nested inLanguage values", () => {
    const result = verifyJsonLdHtml(`
      <script type="application/ld+json">{"@graph":[{"inLanguage":"en"},{"publisher":{"inLanguage":"ja"}}]}</script>
      <script type="application/ld+json">{bad</script>
    `)
    expect(result).toEqual({
      schemaCount: 2,
      parseErrorCount: 1,
      languages: ["en", "ja"],
    })
  })

  it("matches generated llms filenames", () => {
    expect(llmsFilenameForLocale({ code: "en", isDefault: true })).toBe(
      "llms.txt",
    )
    expect(llmsFilenameForLocale({ code: "zh-CN", isDefault: false })).toBe(
      "llms-zh-cn.txt",
    )
  })
})
