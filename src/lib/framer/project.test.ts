import { describe, expect, it } from "vitest"

import { FRAMER_PROJECTS_HUB } from "../links"
import { isHashedFramerProjectId } from "./project"

describe("isHashedFramerProjectId", () => {
  it("matches 64-char hex ids from getProjectInfo", () => {
    expect(
      isHashedFramerProjectId(
        "50719464af8edee1e5131847a673974bb4d380ce47b621430c84fcec4f0de831",
      ),
    ).toBe(true)
  })

  it("rejects human-readable project slugs", () => {
    expect(isHashedFramerProjectId("MySite--a1b2c3d4e5")).toBe(false)
  })
})

describe("FRAMER_PROJECTS_HUB", () => {
  it("points at the dashboard, not a hashed id path", () => {
    expect(FRAMER_PROJECTS_HUB).toBe("https://framer.com/projects/")
  })
})
