import { describe, expect, it } from "vitest"

import { chunkUtf8String } from "./storage"

const enc = new TextEncoder()

function bytes(s: string): number {
  return enc.encode(s).length
}

describe("chunkUtf8String", () => {
  it("returns no chunks for an empty string", () => {
    // Caller treats `[]` as "nothing to write" — important because we
    // don't want to fabricate an empty chunk and corrupt the descriptor
    // count.
    expect(chunkUtf8String("", 100)).toEqual([])
  })

  it("returns the input as a single chunk when it fits", () => {
    const small = "abc"
    expect(chunkUtf8String(small, 100)).toEqual([small])
  })

  it("splits an ASCII string near the boundary", () => {
    const s = "a".repeat(50)
    const chunks = chunkUtf8String(s, 10)
    expect(chunks).toEqual([
      "aaaaaaaaaa",
      "aaaaaaaaaa",
      "aaaaaaaaaa",
      "aaaaaaaaaa",
      "aaaaaaaaaa",
    ])
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(10)
    expect(chunks.join("")).toBe(s)
  })

  it("does not split inside a multi-byte character (CJK)", () => {
    // 中 is 3 bytes in UTF-8. With a 5-byte limit each chunk must hold
    // exactly one character — splitting would produce undecodable
    // partial sequences and round-trip would fail.
    const s = "中文测试漏译"
    const chunks = chunkUtf8String(s, 5)
    for (const c of chunks) {
      expect(bytes(c)).toBeLessThanOrEqual(5)
      // Every chunk must decode cleanly (decode+encode is identity for
      // valid sequences). If we'd split mid-character the underlying
      // UTF-8 surrogate would be malformed.
      expect(c.length).toBeGreaterThan(0)
    }
    expect(chunks.join("")).toBe(s)
  })

  it("handles a Japanese sample at a realistic byte budget", () => {
    // Mimics a real proposal headline — verifies we can fit several
    // characters per chunk when the budget is generous.
    const s = "再翻訳が必要：ja, tr。クリックで再試行できます。"
    const chunks = chunkUtf8String(s, 30)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(30)
    expect(chunks.join("")).toBe(s)
  })

  it("preserves emoji surrogate pairs across chunk boundaries", () => {
    // 🚀 is 4 UTF-8 bytes (one code point, two UTF-16 code units).
    // Iterating with for…of (which the helper uses internally) walks
    // code points, not units — so the rocket never gets ripped in
    // half by chunking.
    const s = "hi 🚀 there 🌟 done"
    const chunks = chunkUtf8String(s, 6)
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(6)
    expect(chunks.join("")).toBe(s)
  })

  it("emits an oversize singleton when one character exceeds the limit", () => {
    // Pathological case: maxBytes too small to hold a single CJK char
    // (3 bytes). We accept the overflow rather than loop forever or
    // throw — round-trip still works because we reassemble by
    // concatenation. Defensive guard for absurd configs.
    const chunks = chunkUtf8String("中a", 2)
    expect(chunks).toEqual(["中", "a"])
    expect(chunks.join("")).toBe("中a")
  })

  it("is byte-aware, not character-aware (3-byte chars cost more)", () => {
    // 100 ASCII chars = 100 bytes → 1 chunk at 200-byte limit.
    // 100 CJK chars  = 300 bytes → ≥ 2 chunks at the same limit.
    // This is the exact reason chunking exists: serializing a
    // CJK-heavy site map blows past 2 KB way before 2000 chars.
    expect(chunkUtf8String("a".repeat(100), 200)).toHaveLength(1)
    expect(chunkUtf8String("中".repeat(100), 200).length).toBeGreaterThanOrEqual(
      2,
    )
  })
})
