import { describe, expect, it } from "vitest"

import {
  pickSummaryField,
  pickTitleField,
  shouldSkipCmsRow,
  type CollectionItemRow,
} from "./cms"

function makeRow(overrides: Partial<CollectionItemRow> = {}): CollectionItemRow {
  return {
    id: "row-1",
    slug: "hello-world",
    draft: false,
    fieldValues: {},
    fieldValuesByLocale: {},
    localeSlugs: {},
    ...overrides,
  }
}

describe("shouldSkipCmsRow", () => {
  it("keeps published items with a real slug", () => {
    expect(shouldSkipCmsRow(makeRow())).toBe(false)
  })

  it("skips draft items even when slug is set", () => {
    // Drafts may have a slug but no public URL — emitting JSON-LD for
    // them creates schema for a page Google can't crawl, which is a
    // wasted indexing budget at best and a 404 signal at worst.
    expect(shouldSkipCmsRow(makeRow({ draft: true }))).toBe(true)
  })

  it("skips items with an empty-string slug", () => {
    // Reproduces the headline bug: a freshly added "Title" item that
    // the author hasn't filled in. composeUrl previously left
    // `/blog/:slug` literal in the URL, polluting JSON-LD with a
    // template route. Skipping at the source is the correct fix.
    expect(shouldSkipCmsRow(makeRow({ slug: "" }))).toBe(true)
  })

  it("skips items whose slug is whitespace only", () => {
    // Defensive: trim() handles tabs/newlines that some CMS exports leak.
    expect(shouldSkipCmsRow(makeRow({ slug: "   \n " }))).toBe(true)
  })

  it("skips items missing a slug entirely (defensive)", () => {
    // Type-wise the SDK shouldn't return undefined slugs, but the
    // helper is more robust if it tolerates the shape.
    expect(
      shouldSkipCmsRow({
        ...makeRow(),
        slug: undefined as unknown as string,
      }),
    ).toBe(true)
  })
})

describe("pickTitleField / pickSummaryField", () => {
  it("matches the first candidate present, preserving the collection's casing", () => {
    // The collection authored its field as lowercase "title"; we
    // return that exact string so the caller can use it as a
    // fieldValues lookup key without re-casing.
    expect(pickTitleField(["title", "body"])).toBe("title")
    expect(pickTitleField(["TITLE", "body"])).toBe("TITLE")
    expect(pickSummaryField(["body", "Description"])).toBe("Description")
  })

  it("respects candidate order (Title beats Name when both exist)", () => {
    // The default candidate order encodes a UX preference: a schema
    // with both "Title" and "Name" should pick Title. Reversing
    // would change the picked field for thousands of templates that
    // happen to define both — keep the order stable.
    expect(pickTitleField(["Name", "Title"])).toBe("Title")
  })

  it("falls through candidates until a match (Headline as third choice)", () => {
    expect(pickTitleField(["Headline", "Body"])).toBe("Headline")
  })

  it("returns null when nothing matches a default candidate", () => {
    // The UI surfaces this as a warning — designer must override
    // (or rename their field). Returning null is correct: silently
    // picking the first field would cause invisible field-mismatch
    // bugs at generate time.
    expect(pickTitleField(["Foo", "Bar"])).toBeNull()
    expect(pickSummaryField(["Foo", "Bar"])).toBeNull()
  })

  it("accepts custom candidates for power users / schema migrations", () => {
    // Designers with a non-standard schema can pass their own list
    // (e.g. legacy "Heading_1") through the override pipeline.
    expect(pickTitleField(["Heading_1", "Body"], ["Heading_1"])).toBe(
      "Heading_1",
    )
  })
})
