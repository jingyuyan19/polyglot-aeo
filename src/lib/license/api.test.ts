import { afterEach, describe, expect, it, vi } from "vitest"

import { PRODUCTION_LICENSE_API_BASE, buildCheckoutUrl, licenseApiBase } from "./api"

function parseBridge(url: string) {
  const bridge = new URL(url)
  return {
    bridge,
    target: bridge.searchParams.get("target"),
  }
}

describe("license checkout URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("does not append test_mode when sandbox billing is hidden", () => {
    vi.stubEnv("DEV", false)
    vi.stubEnv("VITE_LICENSE_API_BASE", "https://worker.example")
    vi.stubEnv("VITE_CREEM_TEST_MODE", undefined)
    vi.stubEnv("VITE_SHOW_BILLING_TEST_MODE", undefined)

    const { bridge, target } = parseBridge(
      buildCheckoutUrl("monthly", "project-1", "test", "generic_pro"),
    )
    expect(bridge.origin + bridge.pathname).toBe(
      "https://polyglotaeo.com/go/checkout/",
    )
    expect(target).toBe(
      "https://worker.example/checkout?plan=monthly&project_id=project-1",
    )
    expect(bridge.searchParams.get("test_mode")).toBe(null)
    expect(bridge.searchParams.get("reason")).toBe("generic_pro")
    expect(bridge.searchParams.get("utm_source")).toBe("framer_plugin")
  })

  it("builds separate monthly and yearly checkout URLs", () => {
    vi.stubEnv("DEV", false)
    vi.stubEnv("VITE_LICENSE_API_BASE", "https://worker.example")

    expect(
      parseBridge(buildCheckoutUrl("monthly", "project-1", "production"))
        .target,
    ).toBe(
      "https://worker.example/checkout?plan=monthly&project_id=project-1",
    )
    expect(
      parseBridge(buildCheckoutUrl("yearly", "project-1", "production"))
        .target,
    ).toBe(
      "https://worker.example/checkout?plan=yearly&project_id=project-1",
    )
  })

  it("appends test_mode only for explicit sandbox builds", () => {
    vi.stubEnv("DEV", false)
    vi.stubEnv("VITE_LICENSE_API_BASE", "https://worker.example")
    vi.stubEnv("VITE_SHOW_BILLING_TEST_MODE", "true")

    const { bridge, target } = parseBridge(
      buildCheckoutUrl("yearly", "project-1", "test", "llms_generate"),
    )
    expect(target).toBe(
      "https://worker.example/checkout?plan=yearly&project_id=project-1&test_mode=true",
    )
    expect(bridge.searchParams.get("test_mode")).toBe("true")
    expect(bridge.searchParams.get("utm_content")).toBe("llms_generate")
  })
})

describe("licenseApiBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("falls back to the production Worker in production builds", () => {
    vi.stubEnv("PROD", true)
    vi.stubEnv("VITE_LICENSE_API_BASE", "")
    expect(licenseApiBase()).toBe(PRODUCTION_LICENSE_API_BASE)
  })

  it("stays unset in dev builds without an override", () => {
    vi.stubEnv("PROD", false)
    vi.stubEnv("VITE_LICENSE_API_BASE", "")
    expect(licenseApiBase()).toBeNull()
  })

  it("prefers an explicit override without a trailing slash", () => {
    vi.stubEnv("PROD", true)
    vi.stubEnv("VITE_LICENSE_API_BASE", "https://worker.example/")
    expect(licenseApiBase()).toBe("https://worker.example")
  })
})
