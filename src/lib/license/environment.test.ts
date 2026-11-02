import { afterEach, describe, expect, it, vi } from "vitest"

import {
  canUseTestBillingMode,
  defaultBillingMode,
  isBillingTestMode,
  normalizeBillingMode,
} from "./environment"

describe("license billing environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("hides test billing and normalizes stale test state in release builds", () => {
    vi.stubEnv("DEV", false)
    vi.stubEnv("VITE_CREEM_TEST_MODE", undefined)
    vi.stubEnv("VITE_SHOW_BILLING_TEST_MODE", undefined)

    expect(canUseTestBillingMode()).toBe(false)
    expect(defaultBillingMode()).toBe("production")
    expect(normalizeBillingMode("test")).toBe("production")
    expect(isBillingTestMode("test")).toBe(false)
  })

  it("does not enable test billing from Vite dev mode alone", () => {
    vi.stubEnv("DEV", true)
    vi.stubEnv("VITE_CREEM_TEST_MODE", undefined)
    vi.stubEnv("VITE_SHOW_BILLING_TEST_MODE", undefined)

    expect(canUseTestBillingMode()).toBe(false)
    expect(normalizeBillingMode("test")).toBe("production")
  })

  it("allows test billing when explicitly enabled", () => {
    vi.stubEnv("DEV", false)
    vi.stubEnv("VITE_SHOW_BILLING_TEST_MODE", "true")

    expect(canUseTestBillingMode()).toBe(true)
    expect(normalizeBillingMode("test")).toBe("test")
    expect(isBillingTestMode("test")).toBe(true)
  })

  it("uses test as the default only for explicit Creem sandbox builds", () => {
    vi.stubEnv("DEV", false)
    vi.stubEnv("VITE_CREEM_TEST_MODE", "true")

    expect(canUseTestBillingMode()).toBe(true)
    expect(defaultBillingMode()).toBe("test")
  })
})
