import { afterEach, describe, expect, it, vi } from "vitest"

const setAsActive = vi.fn()
const collectionNavigateTo = vi.fn()

vi.mock("framer-plugin", () => ({
  framer: {
    getCollections: vi.fn(),
    navigateTo: vi.fn(),
    isAllowedTo: vi.fn(() => false),
  },
}))

import { framer } from "framer-plugin"

import { openCmsCollection } from "./open-cms-collection"

describe("openCmsCollection", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("succeeds when only setAsActive works", async () => {
    vi.mocked(framer.getCollections).mockResolvedValue([
      {
        id: "col-1",
        name: "Project",
        navigateTo: collectionNavigateTo,
        setAsActive,
      },
    ] as never)
    collectionNavigateTo.mockRejectedValue(new Error("no navigate"))
    vi.mocked(framer.navigateTo).mockRejectedValue(new Error("no nav"))
    setAsActive.mockResolvedValue(undefined)

    const result = await openCmsCollection("col-1")
    expect(result).toEqual({ ok: true, navigated: false })
    expect(setAsActive).toHaveBeenCalled()
  })

  it("reports navigated when collection.navigateTo works", async () => {
    vi.mocked(framer.getCollections).mockResolvedValue([
      {
        id: "col-1",
        name: "Project",
        navigateTo: collectionNavigateTo,
        setAsActive,
      },
    ] as never)
    collectionNavigateTo.mockResolvedValue(undefined)

    const result = await openCmsCollection("col-1")
    expect(result).toEqual({ ok: true, navigated: true })
  })
})
