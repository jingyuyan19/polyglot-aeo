import { describe, expect, it } from "vitest"

import {
  canUseFeature,
  countDistinctInstallPages,
  FREE_META_GENERATE_LIMIT,
  FREE_SCHEMA_INSTALL_PAGE_LIMIT,
} from "./entitlements"

describe("canUseFeature", () => {
  it("allows everything on pro", () => {
    expect(canUseFeature("pro", "meta_generate")).toBe(true)
    expect(canUseFeature("pro", "llms_ai_translate")).toBe(true)
  })

  it("allows limited default-locale meta generation on free", () => {
    expect(
      canUseFeature("free", "meta_generate", {
        localeCount: 1,
        metaGenerateCount: FREE_META_GENERATE_LIMIT - 1,
      }),
    ).toBe(true)
    expect(
      canUseFeature("free", "meta_generate", {
        localeCount: 1,
        metaGenerateCount: FREE_META_GENERATE_LIMIT,
      }),
    ).toBe(false)
    expect(
      canUseFeature("free", "meta_generate", {
        localeCount: 2,
        metaGenerateCount: 0,
      }),
    ).toBe(false)
  })

  it("blocks schema translate with multiple locales", () => {
    expect(
      canUseFeature("free", "schema_translate", { localeCount: 2 }),
    ).toBe(false)
  })

  it("allows schema install up to limit", () => {
    expect(
      canUseFeature("free", "schema_install_unlimited", {
        installPageCount: FREE_SCHEMA_INSTALL_PAGE_LIMIT,
      }),
    ).toBe(true)
    expect(
      canUseFeature("free", "schema_install_unlimited", {
        installPageCount: FREE_SCHEMA_INSTALL_PAGE_LIMIT + 1,
      }),
    ).toBe(false)
  })
})

describe("countDistinctInstallPages", () => {
  it("merges existing and new ids", () => {
    expect(
      countDistinctInstallPages(["a", "b"], ["b", "c"]),
    ).toBe(3)
  })
})
