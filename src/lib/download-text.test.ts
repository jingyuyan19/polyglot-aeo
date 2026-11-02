import { describe, expect, it } from "vitest"

import { encodeUtf8TextFile } from "./download-text"

describe("encodeUtf8TextFile", () => {
  it("prefixes UTF-8 BOM and encodes Japanese correctly", () => {
    const bytes = encodeUtf8TextFile("デジタルデザイン")
    expect(bytes[0]).toBe(0xef)
    expect(bytes[1]).toBe(0xbb)
    expect(bytes[2]).toBe(0xbf)
    const decoded = new TextDecoder("utf-8").decode(bytes)
    expect(decoded).toBe("デジタルデザイン")
  })
})
