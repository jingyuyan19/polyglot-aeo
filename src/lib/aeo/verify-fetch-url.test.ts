import { describe, expect, it } from "vitest"

import { isPublicHttpsUrl } from "./verify-fetch-url"

describe("isPublicHttpsUrl", () => {
  it("allows public https URLs", () => {
    expect(isPublicHttpsUrl("https://jimmyjing.framer.website")).toBe(true)
    expect(isPublicHttpsUrl("https://jimmyjing.framer.website/llms.txt")).toBe(
      true,
    )
  })

  it("rejects non-https and private hosts", () => {
    expect(isPublicHttpsUrl("http://example.com")).toBe(false)
    expect(isPublicHttpsUrl("https://localhost")).toBe(false)
    expect(isPublicHttpsUrl("https://127.0.0.1")).toBe(false)
    expect(isPublicHttpsUrl("https://10.0.0.1")).toBe(false)
    expect(isPublicHttpsUrl("https://192.168.1.1")).toBe(false)
    expect(isPublicHttpsUrl("https://[::1]")).toBe(false)
    expect(isPublicHttpsUrl("https://[fd00::1]")).toBe(false)
    expect(isPublicHttpsUrl("not-a-url")).toBe(false)
  })
})
