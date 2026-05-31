import { describe, expect, it } from "vitest"

import {
  composeUrl,
  deriveBrandName,
  isTemplatePath,
  markCollectionLandings,
  pickImageUrl,
  type ScannedPage,
} from "./site-scan"

const BASE = "https://example.com"

describe("composeUrl", () => {
  describe("colon-style placeholders (Framer current SDK)", () => {
    it("substitutes :slug with the actual item slug", () => {
      // The headline regression: prior to the fix, /blog/:slug was passed
      // through verbatim, producing `mainEntityOfPage.@id =
      // .../blog/:slug` for every CMS article — Google would dedupe them
      // into one phantom page.
      expect(composeUrl(BASE, "/blog/:slug", "getting-started")).toBe(
        "https://example.com/blog/getting-started",
      )
    })

    it("substitutes :slug across multiple segments", () => {
      // Hypothetical /blog/:category/:slug — both placeholders get the
      // same value (we only have one slug to substitute). Defensible
      // because if a route uses two distinct fields, both ought to
      // resolve to per-item values; a single slug is the best signal we
      // have without per-field metadata.
      expect(
        composeUrl(BASE, "/blog/:category/:slug", "getting-started"),
      ).toBe("https://example.com/blog/getting-started/getting-started")
    })

    it("substitutes a colon placeholder with a non-`slug` field name", () => {
      expect(composeUrl(BASE, "/products/:productSlug", "abc-123")).toBe(
        "https://example.com/products/abc-123",
      )
    })
  })

  describe("bracket-style placeholders (legacy)", () => {
    it("substitutes [slug]", () => {
      expect(composeUrl(BASE, "/blog/[slug]", "hello")).toBe(
        "https://example.com/blog/hello",
      )
    })

    it("substitutes [fieldName]", () => {
      expect(composeUrl(BASE, "/team/[memberSlug]", "ada")).toBe(
        "https://example.com/team/ada",
      )
    })
  })

  describe("static paths (no placeholder)", () => {
    it("leaves /about unchanged", () => {
      expect(composeUrl(BASE, "/about", null)).toBe(
        "https://example.com/about",
      )
    })

    it("collapses the root path so the URL has no trailing slash", () => {
      // Important: trailing slashes split SEO ranking. Google considers
      // `/` and the bare host as equivalent but the JSON-LD `@id` should
      // exactly match the canonical link.
      expect(composeUrl(BASE, "/", null)).toBe("https://example.com")
    })

    it("prepends a leading slash if the raw path is missing one", () => {
      expect(composeUrl(BASE, "about", null)).toBe(
        "https://example.com/about",
      )
    })
  })

  describe("safety", () => {
    it("does not corrupt protocol-like sequences if a path accidentally contains `://`", () => {
      // Defensive: composeUrl receives a path, not a full URL. But if a
      // caller leaks a stray colon, our regex requires a letter
      // immediately after the colon — `://` (slash, not letter) is left
      // alone.
      expect(composeUrl(BASE, "/oops://x", "y")).toBe(
        "https://example.com/oops://x",
      )
    })

    it("ignores the slug arg when null and leaves placeholders intact", () => {
      // We only substitute when there's a slug. Static-page callers pass
      // null and rely on the path being literal.
      expect(composeUrl(BASE, "/blog/:slug", null)).toBe(
        "https://example.com/blog/:slug",
      )
    })
  })
})

describe("isTemplatePath", () => {
  // Regression target: scanSite was using `path.includes("[")` to decide
  // whether a CMS detail-page node should also be emitted as a static
  // page. That check missed the current SDK's colon-style placeholder
  // (`/blog/:slug`), so a template URL with literal `:slug` ended up in
  // the install output as a phantom Article block.

  it("flags legacy bracket placeholders as templates", () => {
    expect(isTemplatePath("/blog/[slug]")).toBe(true)
    expect(isTemplatePath("/team/[memberSlug]")).toBe(true)
  })

  it("flags current colon placeholders as templates", () => {
    expect(isTemplatePath("/blog/:slug")).toBe(true)
    expect(isTemplatePath("/products/:productSlug")).toBe(true)
  })

  it("flags multi-placeholder paths as templates", () => {
    expect(isTemplatePath("/blog/:category/:slug")).toBe(true)
  })

  it("does NOT flag static paths", () => {
    expect(isTemplatePath("/")).toBe(false)
    expect(isTemplatePath("/about")).toBe(false)
    expect(isTemplatePath("/blog")).toBe(false)
    expect(isTemplatePath("/blog/getting-started")).toBe(false)
  })

  it("does NOT confuse `://` for a placeholder", () => {
    // Defensive — paths shouldn't contain protocols, but if a caller
    // leaks one we must not classify it as a template (the colon is
    // followed by `/`, not a letter, so the regex rejects it).
    expect(isTemplatePath("/oops://x")).toBe(false)
  })
})

describe("deriveBrandName", () => {
  // Regression target: Organization schema's `name` field used to fall
  // back to the literal "Organization" when AI couldn't find a brand,
  // which then got translated into 4 different generic words across
  // locales (組織 / Organisatie / Kuruluş / …). A real brand-name
  // fallback derived from the project hostname avoids that pollution.

  describe("Framer staging subdomains", () => {
    it("title-cases a kebab subdomain into a brand", () => {
      expect(deriveBrandName("your-site.framer.website")).toBe("Your Site")
    })

    it("handles single-word subdomains too", () => {
      expect(deriveBrandName("acme.framer.website")).toBe("Acme")
    })

    it("recognizes the framer.app variant", () => {
      expect(deriveBrandName("acme.framer.app")).toBe("Acme")
    })
  })

  describe("custom domains", () => {
    it("uses the first label of a .com", () => {
      expect(deriveBrandName("acme.com")).toBe("Acme")
    })

    it("ignores deeper subdomains and pulls the first label", () => {
      // Pragmatic — we don't bother with PSL parsing. Users with
      // www-fronted shops still see a sensible brand.
      expect(deriveBrandName("shop.acme.com")).toBe("Shop")
    })

    it("strips a leading www. before parsing", () => {
      expect(deriveBrandName("www.acme.com")).toBe("Acme")
    })

    it("title-cases kebab labels", () => {
      expect(deriveBrandName("my-tiny-shop.com")).toBe("My Tiny Shop")
    })

    it("title-cases underscore labels too", () => {
      expect(deriveBrandName("my_tiny_shop.com")).toBe("My Tiny Shop")
    })
  })

  describe("safety", () => {
    it("returns null for missing input", () => {
      expect(deriveBrandName(null)).toBeNull()
      expect(deriveBrandName(undefined)).toBeNull()
      expect(deriveBrandName("")).toBeNull()
    })

    it("strips a leading protocol if a URL was passed by mistake", () => {
      expect(deriveBrandName("https://acme.com")).toBe("Acme")
    })

    it("strips a trailing path if a URL was passed by mistake", () => {
      expect(deriveBrandName("acme.com/about")).toBe("Acme")
    })
  })
})

describe("markCollectionLandings", () => {
  // Regression target: a static `/blog` index page renders Collection
  // List previews of every CMS article below it; our TextNode walker
  // picks the first preview's H1 as the page's title, AI happily
  // proposes Article, and the install duplicates the children's
  // headlines at the parent URL. We post-process the scan result to
  // flag those parent pages so the proposal layer can handle them
  // defensively.

  function makeStatic(
    id: string,
    rawPath: string,
    overrides: Partial<ScannedPage> = {},
  ): ScannedPage {
    return {
      id,
      label: rawPath,
      rawPath,
      url: `https://example.com${rawPath}`,
      isHomepage: rawPath === "/",
      source: "static",
      content: { title: null, description: null, bodyText: "", headings: [] },
      ...overrides,
    }
  }

  function makeCms(
    id: string,
    rawPath: string,
    collectionName: string,
  ): ScannedPage {
    return {
      id,
      label: rawPath,
      rawPath,
      url: `https://example.com${rawPath}`,
      isHomepage: false,
      source: "cms",
      cms: {
        collectionId: "col1",
        collectionName,
        itemId: id,
      },
      content: { title: null, description: null, bodyText: "", headings: [] },
    }
  }

  it("flags `/blog` when CMS items live at `/blog/{slug}`", () => {
    const pages = [
      makeStatic("home", "/"),
      makeStatic("blog-index", "/blog"),
      makeCms("p1", "/blog/getting-started", "Articles"),
      makeCms("p2", "/blog/whats-new", "Articles"),
      makeCms("p3", "/blog/best-practices", "Articles"),
    ]
    const out = markCollectionLandings(pages)
    const blogIndex = out.find((p) => p.id === "blog-index")
    expect(blogIndex?.collectionLanding).toEqual({
      collectionName: "Articles",
      itemCount: 3,
    })
  })

  it("does not flag the homepage just because some CMS exists deeper", () => {
    // `/` should NOT be a "collection landing" of `/blog/x` items —
    // we only flag direct parents (one slash deeper).
    const pages = [
      makeStatic("home", "/"),
      makeCms("p1", "/blog/x", "Articles"),
    ]
    const out = markCollectionLandings(pages)
    expect(out.find((p) => p.id === "home")?.collectionLanding).toBeUndefined()
  })

  it("leaves the CMS items themselves unflagged", () => {
    // The flag is a STATIC-page property — items are the children,
    // not the landings.
    const pages = [
      makeStatic("blog-index", "/blog"),
      makeCms("p1", "/blog/post", "Articles"),
    ]
    const out = markCollectionLandings(pages)
    expect(out.find((p) => p.id === "p1")?.collectionLanding).toBeUndefined()
  })

  it("returns the input unchanged when no CMS items exist", () => {
    const pages = [
      makeStatic("home", "/"),
      makeStatic("about", "/about"),
    ]
    const out = markCollectionLandings(pages)
    expect(out).toBe(pages) // same reference: cheap fast-path
  })

  it("handles multiple distinct landings independently", () => {
    const pages = [
      makeStatic("blog-index", "/blog"),
      makeStatic("shop-index", "/shop"),
      makeCms("a1", "/blog/a", "Articles"),
      makeCms("p1", "/shop/widget", "Products"),
      makeCms("p2", "/shop/gadget", "Products"),
    ]
    const out = markCollectionLandings(pages)
    expect(out.find((p) => p.id === "blog-index")?.collectionLanding).toEqual({
      collectionName: "Articles",
      itemCount: 1,
    })
    expect(out.find((p) => p.id === "shop-index")?.collectionLanding).toEqual({
      collectionName: "Products",
      itemCount: 2,
    })
  })

  it("ignores trailing slashes when matching parents", () => {
    // A CMS rawPath like "/blog/post/" should still resolve to the
    // "/blog" landing — defensive against SDK / user input variations.
    const pages = [
      makeStatic("blog-index", "/blog"),
      makeCms("p1", "/blog/post/", "Articles"),
    ]
    const out = markCollectionLandings(pages)
    expect(
      out.find((p) => p.id === "blog-index")?.collectionLanding?.itemCount,
    ).toBe(1)
  })
})

describe("pickImageUrl", () => {
  // Why this exists: CMS image-field values arrive in three flavors
  // depending on Framer SDK version, field migration history, and
  // test mocks. Each flavor reaches us through `cms.ts`'s
  // `entry.value` extraction, so we accept all three rather than
  // forcing a single shape upstream. A regression here means
  // schemas silently lose `image` for CMS articles — the most
  // visible Google rich-result loss for blog sites.

  it("returns the URL string from a Framer ImageAsset-shaped object", () => {
    // Production path: SDK returns an ImageAsset class; reading
    // `entry.value` exposes it as `{ url, altText, thumbnailUrl, ... }`.
    const value = {
      id: "asset-1",
      url: "https://framerusercontent.com/images/cover.png",
      thumbnailUrl: "https://framerusercontent.com/images/cover-thumb.png",
      altText: "Cover image",
    }
    expect(pickImageUrl(value)).toBe(
      "https://framerusercontent.com/images/cover.png",
    )
  })

  it("accepts a bare URL string (legacy / migrated fields)", () => {
    // Migration path: a String field renamed to Image keeps its raw
    // string value until the user re-uploads. Don't force a re-upload
    // for the schema to work.
    expect(pickImageUrl("https://cdn.example.com/hero.jpg")).toBe(
      "https://cdn.example.com/hero.jpg",
    )
  })

  it("trims whitespace from string URLs", () => {
    // Defensive against CMS authors pasting URLs with stray padding.
    expect(pickImageUrl("  https://cdn.example.com/x.jpg \n")).toBe(
      "https://cdn.example.com/x.jpg",
    )
  })

  it("unwraps `{ value: ImageAsset }` array-field shapes", () => {
    // Array-of-images CMS fields surface entries as
    // `{ value: ImageAsset }` rather than the asset directly.
    const value = {
      type: "image",
      value: { url: "https://cdn.example.com/a.png", altText: "A" },
    }
    expect(pickImageUrl(value)).toBe("https://cdn.example.com/a.png")
  })

  it("returns undefined for empty / null / non-image inputs", () => {
    // We never throw, never coerce numbers/booleans/random objects
    // into URLs — the schema field is optional and absent is
    // semantically correct here.
    expect(pickImageUrl(undefined)).toBeUndefined()
    expect(pickImageUrl(null)).toBeUndefined()
    expect(pickImageUrl("")).toBeUndefined()
    expect(pickImageUrl("   ")).toBeUndefined()
    expect(pickImageUrl(42)).toBeUndefined()
    expect(pickImageUrl({})).toBeUndefined()
    expect(pickImageUrl({ url: "" })).toBeUndefined()
    expect(pickImageUrl({ url: 123 })).toBeUndefined()
  })

  it("returns undefined when value.url is set but empty", () => {
    // Some templates pre-create CMS items with a placeholder image
    // field whose `url` is an empty string. We treat that as
    // "absent" so the schema doesn't emit `image: ""`.
    expect(pickImageUrl({ url: "  " })).toBeUndefined()
  })
})
