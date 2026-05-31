import { describe, expect, it } from "vitest"

import { deriveMetaPagePhase } from "./MetaPageStep"

describe("deriveMetaPagePhase", () => {
  it("starts at load when pages not scanned", () => {
    expect(deriveMetaPagePhase(false, null, undefined)).toBe("load")
  })

  it("requires select after scan without selection", () => {
    expect(deriveMetaPagePhase(false, [], undefined)).toBe("select")
  })

  it("shows content after page selected", () => {
    expect(deriveMetaPagePhase(false, [{ id: "a" } as never], "a")).toBe(
      "content",
    )
  })

  it("skips load/select in manual mode", () => {
    expect(deriveMetaPagePhase(true, null, undefined)).toBe("content")
  })
})
