import { describe, expect, it } from "vitest"

import {
  buildAuditSessionSnapshot,
  isRestorableAuditSession,
} from "./audit-session"

describe("audit-session", () => {
  it("isRestorableAuditSession requires siteMap and proposals", () => {
    expect(isRestorableAuditSession(null)).toBe(false)
    expect(
      isRestorableAuditSession({
        siteMap: {
          baseUrl: "https://example.com",
          brandName: null,
          pages: [],
          scannedAt: 0,
          partial: false,
        },
        proposals: [],
        untranslated: [],
        lastTranslations: {},
        installUndo: null,
        filterQuery: "",
        filterStatus: "all",
      }),
    ).toBe(false)
  })

  it("buildAuditSessionSnapshot returns null when workspace is empty", () => {
    expect(
      buildAuditSessionSnapshot({
        siteMap: null,
        proposals: [],
        untranslated: [],
        lastTranslations: {},
        installUndo: null,
        filterQuery: "",
        filterStatus: "all",
      }),
    ).toBe(null)
  })
})
