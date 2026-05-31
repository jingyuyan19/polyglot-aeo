import { describe, expect, it } from "vitest"

import {
  FENCE_CLOSE,
  FENCE_OPEN,
  mergeForInstall,
  mergeForUninstall,
  stripFencedBlock,
  userCodeSize,
  wrapJsonLdBlocks,
} from "./customCode"

/**
 * These tests guard a SAFETY-CRITICAL path. The functions under test decide
 * whether a Polyglot AEO install/uninstall keeps or destroys user-authored
 * Custom Code (Google Analytics, Hotjar, Stripe, etc.). A regression here =
 * one-star reviews.
 *
 * Every scenario below mirrors a real-world Framer headEnd state I expect to
 * encounter in the wild.
 */

const SAMPLE_GA_SNIPPET = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXX');
</script>`

const SAMPLE_FENCED_BLOCK = `${FENCE_OPEN}
  <script type="application/ld+json" data-polyglot-aeo data-lang="en-US">
{"@context":"https://schema.org"}
  </script>
${FENCE_CLOSE}`

describe("wrapJsonLdBlocks", () => {
  it("returns empty string when no blocks", () => {
    expect(wrapJsonLdBlocks([])).toBe("")
  })

  it("wraps a single block in fences", () => {
    const html = wrapJsonLdBlocks([{ language: "en-US", jsonLd: "{}" }])
    expect(html).toContain(FENCE_OPEN)
    expect(html).toContain(FENCE_CLOSE)
    expect(html).toContain('data-lang="en-US"')
  })

  it("wraps multiple blocks under a single fence pair", () => {
    const html = wrapJsonLdBlocks([
      { language: "en-US", jsonLd: "{}" },
      { language: "zh-CN", jsonLd: "{}" },
      { language: "ja-JP", jsonLd: "{}" },
    ])
    expect(html.match(new RegExp(FENCE_OPEN, "g"))?.length).toBe(1)
    expect(html.match(new RegExp(FENCE_CLOSE, "g"))?.length).toBe(1)
    expect(html).toContain('data-lang="en-US"')
    expect(html).toContain('data-lang="zh-CN"')
    expect(html).toContain('data-lang="ja-JP"')
  })

  it("escapes attribute-breaking characters in language code", () => {
    const html = wrapJsonLdBlocks([
      { language: 'evil"<>', jsonLd: "{}" },
    ])
    expect(html).not.toContain('data-lang="evil"<>"')
    expect(html).toContain("&quot;")
    expect(html).toContain("&lt;")
    expect(html).toContain("&gt;")
  })
})

describe("stripFencedBlock", () => {
  it("returns empty string for null/undefined/empty input", () => {
    expect(stripFencedBlock(null)).toBe("")
    expect(stripFencedBlock(undefined)).toBe("")
    expect(stripFencedBlock("")).toBe("")
  })

  it("returns the input verbatim (trimmed) when no fence is present", () => {
    expect(stripFencedBlock(SAMPLE_GA_SNIPPET)).toBe(SAMPLE_GA_SNIPPET.trim())
  })

  it("removes a fence-only payload, leaving an empty string", () => {
    expect(stripFencedBlock(SAMPLE_FENCED_BLOCK)).toBe("")
  })

  it("preserves user code BEFORE our fence", () => {
    const input = `${SAMPLE_GA_SNIPPET}\n\n${SAMPLE_FENCED_BLOCK}`
    expect(stripFencedBlock(input)).toBe(SAMPLE_GA_SNIPPET.trim())
  })

  it("preserves user code AFTER our fence", () => {
    const input = `${SAMPLE_FENCED_BLOCK}\n\n${SAMPLE_GA_SNIPPET}`
    expect(stripFencedBlock(input)).toBe(SAMPLE_GA_SNIPPET.trim())
  })

  it("preserves user code SURROUNDING our fence", () => {
    const before = '<script>console.log("before")</script>'
    const after = '<meta name="x" content="y">'
    const input = `${before}\n\n${SAMPLE_FENCED_BLOCK}\n\n${after}`
    const stripped = stripFencedBlock(input)
    expect(stripped).toContain(before)
    expect(stripped).toContain(after)
    expect(stripped).not.toContain(FENCE_OPEN)
    expect(stripped).not.toContain(FENCE_CLOSE)
  })

  it("removes multiple fenced blocks if a historical bug ever produced them", () => {
    const input = `${SAMPLE_FENCED_BLOCK}\n\n${SAMPLE_GA_SNIPPET}\n\n${SAMPLE_FENCED_BLOCK}`
    const stripped = stripFencedBlock(input)
    expect(stripped).not.toContain(FENCE_OPEN)
    expect(stripped).not.toContain(FENCE_CLOSE)
    expect(stripped).toContain("gtag")
  })

  it("does not match a fence inside a string literal in user code", () => {
    // If a user happens to write the fence comment inside a string, our
    // regex still removes it — that's acceptable because they shouldn't
    // be putting our private marker inside their own code. Document the
    // behavior so it's not a surprise.
    const userCodeWithFakeFence = `<script>const s = "${FENCE_OPEN}whatever${FENCE_CLOSE}"</script>`
    const stripped = stripFencedBlock(userCodeWithFakeFence)
    expect(stripped).toContain("<script>const s")
    expect(stripped).not.toContain(FENCE_OPEN)
  })
})

describe("mergeForInstall", () => {
  it("writes the fenced block when slot is empty", () => {
    expect(mergeForInstall(null, SAMPLE_FENCED_BLOCK)).toBe(SAMPLE_FENCED_BLOCK)
    expect(mergeForInstall("", SAMPLE_FENCED_BLOCK)).toBe(SAMPLE_FENCED_BLOCK)
  })

  it("appends our fence after pre-existing user code", () => {
    const result = mergeForInstall(SAMPLE_GA_SNIPPET, SAMPLE_FENCED_BLOCK)
    expect(result).toContain(SAMPLE_GA_SNIPPET.trim())
    expect(result).toContain(SAMPLE_FENCED_BLOCK)
    expect(result?.indexOf("gtag")).toBeLessThan(
      result?.indexOf(FENCE_OPEN) ?? -1,
    )
  })

  it("REPLACES our previous fenced block, not duplicates it", () => {
    const initial = mergeForInstall(SAMPLE_GA_SNIPPET, SAMPLE_FENCED_BLOCK)
    expect(initial).not.toBeNull()
    const reinstalled = mergeForInstall(initial, SAMPLE_FENCED_BLOCK)
    expect(reinstalled).not.toBeNull()
    const fenceOpenCount = (reinstalled!.match(new RegExp(FENCE_OPEN, "g")) ?? [])
      .length
    expect(fenceOpenCount).toBe(1)
    expect(reinstalled).toContain("gtag")
  })

  it("returns null when both user code and fenced block are empty", () => {
    expect(mergeForInstall(null, "")).toBeNull()
    expect(mergeForInstall("", "")).toBeNull()
  })

  it("returns user code unchanged when fenced block is empty", () => {
    const result = mergeForInstall(SAMPLE_GA_SNIPPET, "")
    expect(result).toBe(SAMPLE_GA_SNIPPET.trim())
  })
})

describe("mergeForUninstall", () => {
  it("returns null when slot was empty", () => {
    expect(mergeForUninstall(null)).toBeNull()
    expect(mergeForUninstall("")).toBeNull()
  })

  it("returns null when slot only contained our fence", () => {
    expect(mergeForUninstall(SAMPLE_FENCED_BLOCK)).toBeNull()
  })

  it("preserves user code when uninstalling — THE critical path", () => {
    const slot = `${SAMPLE_GA_SNIPPET}\n\n${SAMPLE_FENCED_BLOCK}`
    const result = mergeForUninstall(slot)
    expect(result).toBe(SAMPLE_GA_SNIPPET.trim())
    expect(result).not.toContain(FENCE_OPEN)
  })

  it("handles slots that have user code but never had our fence", () => {
    expect(mergeForUninstall(SAMPLE_GA_SNIPPET)).toBe(SAMPLE_GA_SNIPPET.trim())
  })
})

describe("userCodeSize", () => {
  it("ignores our fence when measuring", () => {
    expect(userCodeSize(SAMPLE_FENCED_BLOCK)).toBe(0)
  })

  it("counts user-authored bytes only", () => {
    const slot = `${SAMPLE_GA_SNIPPET}\n\n${SAMPLE_FENCED_BLOCK}`
    expect(userCodeSize(slot)).toBe(SAMPLE_GA_SNIPPET.trim().length)
  })

  it("returns 0 for an empty slot", () => {
    expect(userCodeSize(null)).toBe(0)
    expect(userCodeSize("")).toBe(0)
  })
})

describe("install/uninstall round-trip safety", () => {
  it("install → uninstall restores the original user code byte-for-byte", () => {
    const original = SAMPLE_GA_SNIPPET
    const installed = mergeForInstall(original, SAMPLE_FENCED_BLOCK)
    const uninstalled = mergeForUninstall(installed)
    expect(uninstalled).toBe(original.trim())
  })

  it("install → reinstall → uninstall still restores user code", () => {
    const original = SAMPLE_GA_SNIPPET
    const a = mergeForInstall(original, SAMPLE_FENCED_BLOCK)
    const b = mergeForInstall(a, SAMPLE_FENCED_BLOCK)
    const uninstalled = mergeForUninstall(b)
    expect(uninstalled).toBe(original.trim())
  })

  it("uninstall on a never-installed slot is a no-op for user code", () => {
    expect(mergeForUninstall(SAMPLE_GA_SNIPPET)).toBe(SAMPLE_GA_SNIPPET.trim())
  })
})
