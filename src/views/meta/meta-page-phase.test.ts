import { describe, expect, it } from "vitest"

import {
  deriveMetaFlowStepDone,
  deriveMetaPagePhase,
} from "./MetaPageStep"

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

describe("deriveMetaFlowStepDone", () => {
  it("does not mark content done when context restored but pages not loaded", () => {
    expect(
      deriveMetaFlowStepDone(false, null, "page-1", "Some saved context"),
    ).toEqual({ load: false, select: false, content: false })
  })

  it("marks content done only after load, select, and context", () => {
    expect(
      deriveMetaFlowStepDone(
        false,
        [{ id: "a" } as never],
        "a",
        "Homepage copy",
      ),
    ).toEqual({ load: true, select: true, content: true })
  })

  it("keeps content pending when page selected but context empty", () => {
    expect(
      deriveMetaFlowStepDone(false, [{ id: "a" } as never], "a", "  "),
    ).toEqual({ load: true, select: true, content: false })
  })

  it("does not allow stale manual context to skip project page selection", () => {
    expect(
      deriveMetaFlowStepDone(
        false,
        [{ id: "a" } as never],
        undefined,
        "Previously typed manual context",
      ),
    ).toEqual({ load: true, select: false, content: false })
  })

  it("manual mode only checks context for step 3", () => {
    expect(deriveMetaFlowStepDone(true, null, undefined, "")).toEqual({
      load: true,
      select: true,
      content: false,
    })
    expect(deriveMetaFlowStepDone(true, null, undefined, "ctx")).toEqual({
      load: true,
      select: true,
      content: true,
    })
  })
})
