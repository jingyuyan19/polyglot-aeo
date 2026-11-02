import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchPublishedText } from "./fetch-published-url"

vi.mock("../license/api", () => ({
  licenseApiBase: vi.fn(),
}))

import { licenseApiBase } from "../license/api"

describe("fetchPublishedText", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(licenseApiBase).mockReturnValue(null)
  })

  it("rejects invalid URLs", async () => {
    const result = await fetchPublishedText("http://example.com")
    expect(result).toEqual({ ok: false, reason: "invalid_url" })
  })

  it("uses proxy when license API base is set", async () => {
    vi.mocked(licenseApiBase).mockReturnValue("https://worker.test")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, status: 200, text: "<html></html>" }),
        { status: 200 },
      ),
    )

    const result = await fetchPublishedText("https://example.com")
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      via: "proxy",
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.test/verify-fetch?url=https%3A%2F%2Fexample.com",
      { cache: "no-store" },
    )
  })
})
