import { describe, expect, it } from "vitest"

import { defaultPickedPageIds, type StaticPageEntry } from "./static-pages"

const HOMEPAGE: StaticPageEntry = {
  id: "wp-home",
  rawPath: "/",
  url: "https://x.com/",
  title: "Home",
  description: "",
  isHomepage: true,
}
const ABOUT: StaticPageEntry = {
  id: "wp-about",
  rawPath: "/about",
  url: "https://x.com/about",
  title: "About",
  description: "We make things.",
  isHomepage: false,
}
const CONTACT: StaticPageEntry = {
  id: "wp-contact",
  rawPath: "/contact",
  url: "https://x.com/contact",
  title: "Contact",
  description: "",
  isHomepage: false,
}
const DEEP: StaticPageEntry = {
  id: "wp-deep",
  rawPath: "/services/branding/process",
  url: "https://x.com/services/branding/process",
  title: "Process",
  description: "",
  isHomepage: false,
}

describe("defaultPickedPageIds", () => {
  it("preselects top-level pages but excludes the homepage", () => {
    const picked = defaultPickedPageIds([HOMEPAGE, ABOUT, CONTACT, DEEP])
    expect(picked).toEqual(["wp-about", "wp-contact"])
  })

  it("does not preselect deep pages (depth > 1)", () => {
    // Designer can opt-in by ticking the box manually. We avoid
    // preselecting deep pages because the resulting llms.txt would
    // bloat with rarely-relevant detail pages.
    const picked = defaultPickedPageIds([DEEP])
    expect(picked).toEqual([])
  })

  it("returns empty when only the homepage is present", () => {
    // The homepage's role is filled by the H1+> blockquote at the
    // top of the file — emitting `/` as a link is redundant.
    const picked = defaultPickedPageIds([HOMEPAGE])
    expect(picked).toEqual([])
  })
})
