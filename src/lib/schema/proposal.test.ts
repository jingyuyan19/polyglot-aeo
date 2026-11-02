import { describe, expect, it } from "vitest"

import type { ScannedPage } from "../framer/site-scan"
import {
  aiInputsToSchemaInput,
  buildProposal,
  normalizeKind,
  proposalToJsonLd,
} from "./proposal"

const PAGE_FIXTURE: ScannedPage = {
  id: "page-1",
  label: "How to AEO",
  rawPath: "/blog/aeo",
  url: "https://acme.com/blog/aeo",
  isHomepage: false,
  source: "static",
  content: {
    title: "How to AEO",
    description: "A guide to AI search optimization.",
    bodyText: "AEO is the practice of...",
    headings: ["How to AEO", "What is AEO?"],
  },
}

describe("normalizeKind", () => {
  it("accepts exact-match canonical kinds", () => {
    expect(normalizeKind("Article").kind).toBe("Article")
    expect(normalizeKind("Article").confident).toBe(true)
    expect(normalizeKind("FAQPage").kind).toBe("FAQPage")
    expect(normalizeKind("Organization").kind).toBe("Organization")
  })

  it("accepts case-insensitive match", () => {
    expect(normalizeKind("article").kind).toBe("Article")
    expect(normalizeKind("FAQPAGE").kind).toBe("FAQPage")
  })

  it("maps common AI synonyms confidently", () => {
    expect(normalizeKind("BlogPosting").kind).toBe("Article")
    expect(normalizeKind("blog post").kind).toBe("Article")
    expect(normalizeKind("Tutorial").kind).toBe("Article")
    expect(normalizeKind("AboutPage").kind).toBe("Organization")
    expect(normalizeKind("Restaurant").kind).toBe("LocalBusiness")
  })

  it("falls back to Article with low confidence for unknowns", () => {
    const r = normalizeKind("MedicalEntity")
    expect(r.kind).toBe("Article")
    expect(r.confident).toBe(false)
  })

  it("handles empty / non-string input safely", () => {
    expect(normalizeKind("").confident).toBe(false)
    expect(normalizeKind(null).kind).toBe("Article")
    expect(normalizeKind(undefined).kind).toBe("Article")
    expect(normalizeKind(42).kind).toBe("Article")
  })
})

describe("aiInputsToSchemaInput — Article", () => {
  it("populates required fields with sensible defaults", () => {
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello" },
      "https://acme.com/x",
      "en-US",
    )
    expect(input.kind).toBe("Article")
    expect(input.canonicalUrl).toBe("https://acme.com/x")
    expect(input.language).toBe("en-US")
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.headline).toBe("Hello")
    expect(input.authorName).toBe("Editorial Team")
    expect(input.publisherName).toBe("Site")
    expect(input.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("uses fallback title when AI omits headline", () => {
    const input = aiInputsToSchemaInput(
      "Article",
      {},
      "https://acme.com/x",
      "en-US",
      { title: "Fallback Title", description: null },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.headline).toBe("Fallback Title")
  })

  it("accepts URL field as canonicalUrl synonym", () => {
    const input = aiInputsToSchemaInput(
      "Article",
      { url: "https://acme.com/y" },
      "https://acme.com/x",
      "en-US",
    )
    expect(input.canonicalUrl).toBe("https://acme.com/y")
  })

  // Regression target: in a real scan we observed the same site
  // emitting publisher names of "Site" (literal AI placeholder),
  // "サイト" (the same literal translated), and "Your Site" (the
  // brand-name fallback) across different articles in different
  // locales. The schema is then internally inconsistent — Google's
  // Rich Results parser will see N publishers for one site. The
  // fix mirrors the Organization placeholder rejection: any AI
  // value matching GENERIC_ORG_PLACEHOLDERS falls through to
  // brandName, then to the literal "Site" only as last resort.

  it("rejects placeholder publisher 'Site' in favor of brandName", () => {
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello", publisher: "Site" },
      "https://acme.com/x",
      "en-US",
      { title: null, description: null, brandName: "Acme" },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.publisherName).toBe("Acme")
  })

  it("rejects placeholder publisher 'Organization' in favor of brandName", () => {
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello", publisher: "Organization" },
      "https://acme.com/x",
      "en-US",
      { title: null, description: null, brandName: "Acme" },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.publisherName).toBe("Acme")
  })

  it("preserves a real AI-provided publisher name", () => {
    // We must not clobber a legitimate publisher the AI extracted
    // from a byline / About page (e.g. "The New York Times"). Only
    // generic placeholders trigger the fallback.
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello", publisher: "The New York Times" },
      "https://nyt.com/x",
      "en-US",
      { title: null, description: null, brandName: "Acme" },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.publisherName).toBe("The New York Times")
  })

  it("uses literal 'Site' only when AI gave placeholder AND brandName missing", () => {
    // Last-resort safety net so the JSON-LD still parses; this
    // matches the legacy default before brand-name threading.
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello", publisher: "Website" },
      "https://acme.com/x",
      "en-US",
      { title: null, description: null, brandName: null },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.publisherName).toBe("Site")
  })

  it("uses brandName when AI omits publisher entirely", () => {
    // The previous default ("Site") leaked literally into JSON-LD
    // when the AI's response object didn't include a publisher
    // field at all. brandName is a strictly better default.
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello" },
      "https://acme.com/x",
      "en-US",
      { title: null, description: null, brandName: "Acme" },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.publisherName).toBe("Acme")
  })

  // Regression target: AI cross-field contamination — observed in
  // the wild when "Importing Content" got `author: "Your Site"`,
  // which then survived translation untouched as a proper noun
  // across all four locales. A brand isn't a person; we drop the
  // value rather than emit a brand string in author position.

  it("rejects author that matches brandName exactly (case-insensitive)", () => {
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello", author: "Your Site" },
      "https://your-site.framer.website/x",
      "en-US",
      { title: null, description: null, brandName: "Your Site" },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.authorName).toBe("Editorial Team")
  })

  it("rejects author that matches brandName regardless of casing/whitespace", () => {
    // The AI sometimes echoes brand identity with stray spaces or
    // a different case ("YOUR SITE", "  your site\n"). All count as
    // contamination.
    for (const variant of ["YOUR SITE", "  your site  ", "Your Site"]) {
      const input = aiInputsToSchemaInput(
        "Article",
        { headline: "Hello", author: variant },
        "https://acme.com/x",
        "en-US",
        { title: null, description: null, brandName: "Your Site" },
      )
      if (input.kind !== "Article") throw new Error("not Article")
      expect(input.authorName).toBe("Editorial Team")
    }
  })

  it("preserves a real author byline that doesn't match brandName", () => {
    // We must NOT clobber a legitimate author byline. The
    // contamination check is strictly an exact-match against
    // brandName; any other value passes through.
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello", author: "John Doe" },
      "https://acme.com/x",
      "en-US",
      { title: null, description: null, brandName: "Acme" },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.authorName).toBe("John Doe")
  })

  it("does not reject author when brandName is missing", () => {
    // No brand to compare against → the contamination check is
    // structurally inapplicable. The author value passes through
    // untouched (this preserves backwards compat for older flows
    // that didn't thread brandName).
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Hello", author: "Acme" },
      "https://acme.com/x",
      "en-US",
      { title: null, description: null, brandName: null },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.authorName).toBe("Acme")
  })
})

describe("aiInputsToSchemaInput — FAQPage", () => {
  it("preserves valid Q&A pairs", () => {
    const input = aiInputsToSchemaInput(
      "FAQPage",
      {
        questions: [
          { question: "What?", answer: "A thing." },
          { question: "Why?", answer: "Because." },
        ],
      },
      "https://acme.com/faq",
      "en-US",
    )
    if (input.kind !== "FAQPage") throw new Error("not FAQPage")
    expect(input.questions.length).toBe(2)
    expect(input.questions[0].question).toBe("What?")
  })

  it("filters out malformed pairs (missing q or a)", () => {
    const input = aiInputsToSchemaInput(
      "FAQPage",
      {
        questions: [
          { question: "Good", answer: "Yes" },
          { question: "Bad" }, // no answer
          { answer: "Orphan" }, // no question
          "not even an object",
        ],
      },
      "https://acme.com/faq",
      "en-US",
    )
    if (input.kind !== "FAQPage") throw new Error("not FAQPage")
    expect(input.questions.length).toBe(1)
    expect(input.questions[0].question).toBe("Good")
  })

  it("synthesizes a placeholder when no valid pairs come back", () => {
    const input = aiInputsToSchemaInput(
      "FAQPage",
      { questions: [] },
      "https://acme.com/faq",
      "en-US",
      { title: "FAQ", description: "Frequent questions." },
    )
    if (input.kind !== "FAQPage") throw new Error("not FAQPage")
    expect(input.questions.length).toBe(1)
    expect(input.questions[0].question).toBe("FAQ")
  })
})

describe("aiInputsToSchemaInput — Product", () => {
  it("coerces price strings into numbers", () => {
    const input = aiInputsToSchemaInput(
      "Product",
      { name: "Widget", price: "29.99", currency: "USD" },
      "https://acme.com/widget",
      "en-US",
    )
    if (input.kind !== "Product") throw new Error("not Product")
    expect(input.price).toBe(29.99)
    expect(input.priceCurrency).toBe("USD")
  })

  it("drops invalid prices silently", () => {
    const input = aiInputsToSchemaInput(
      "Product",
      { name: "Widget", price: "free" },
      "https://acme.com/widget",
      "en-US",
    )
    if (input.kind !== "Product") throw new Error("not Product")
    expect(input.price).toBeUndefined()
  })
})

describe("aiInputsToSchemaInput — image fallback", () => {
  // Why: the AI rarely "sees" image content (we don't ship binaries),
  // so deterministic extraction in the scan step is the canonical
  // source of `Article.image` / `Product.image` / `LocalBusiness.image`.
  // Translation re-runs aiInputsToSchemaInput with the source image as
  // fallback so non-default-locale JSON-LD doesn't lose the field.

  const HERO = "https://framerusercontent.com/images/hero.jpg"
  const AI_PICK = "https://framerusercontent.com/images/body-figure.jpg"

  it("uses scan-extracted image fallback when AI omits it (Article)", () => {
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Post" },
      "https://acme.com/blog/x",
      "en-US",
      { title: null, description: null, image: HERO },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.image).toBe(HERO)
  })

  it("prefers AI image over fallback when both are present", () => {
    // The AI sometimes picks a contextually richer image (e.g. an
    // in-body figure over the page hero). When it does, we trust
    // its choice; the fallback only fires for the omission case.
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Post", image: AI_PICK },
      "https://acme.com/blog/x",
      "en-US",
      { title: null, description: null, image: HERO },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.image).toBe(AI_PICK)
  })

  it("populates Product.image from scan fallback", () => {
    const input = aiInputsToSchemaInput(
      "Product",
      { name: "Widget" },
      "https://acme.com/p/widget",
      "en-US",
      { title: null, description: null, image: HERO },
    )
    if (input.kind !== "Product") throw new Error("not Product")
    expect(input.image).toBe(HERO)
  })

  it("populates LocalBusiness.image from scan fallback", () => {
    const input = aiInputsToSchemaInput(
      "LocalBusiness",
      { name: "Cafe" },
      "https://cafe.com",
      "en-US",
      { title: null, description: null, image: HERO },
    )
    if (input.kind !== "LocalBusiness") throw new Error("not LocalBusiness")
    expect(input.image).toBe(HERO)
  })

  it("leaves image undefined when neither AI nor scan provided one", () => {
    // Explicit "no image" is the third valid state — schema still
    // parses, just without the optional `image` field. Tests guard
    // against accidentally fabricating an empty-string URL.
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Post" },
      "https://acme.com/blog/x",
      "en-US",
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.image).toBeUndefined()
  })

  it("ignores empty-string image fallback (treats as absent)", () => {
    // Defensive: scan-step might pass `""` if the upstream extraction
    // regressed. Empty strings should never make it into JSON-LD.
    const input = aiInputsToSchemaInput(
      "Article",
      { headline: "Post" },
      "https://acme.com/blog/x",
      "en-US",
      { title: null, description: null, image: "" },
    )
    if (input.kind !== "Article") throw new Error("not Article")
    expect(input.image).toBeUndefined()
  })
})

describe("buildProposal — image propagation", () => {
  // The integration point: ScannedPage.content.image needs to flow
  // automatically into the proposal's SchemaInput without callers
  // having to opt in. Otherwise the AI-driven pipeline silently
  // drops images even when the scan extracted them perfectly.

  it("reads page.content.image into Article proposal", () => {
    const HERO = "https://framerusercontent.com/images/hero.jpg"
    const page: ScannedPage = {
      ...PAGE_FIXTURE,
      content: { ...PAGE_FIXTURE.content, image: HERO },
    }
    const proposal = buildProposal(
      page,
      { kind: "Article", confidence: 0.9, inputs: { headline: "X" } },
      "en-US",
    )
    if (proposal.inputs.kind !== "Article") throw new Error("not Article")
    expect(proposal.inputs.image).toBe(HERO)
  })

  it("falls through gracefully when page has no image", () => {
    // Without an image the proposal still builds; we just don't
    // emit the optional field downstream. Regression check: a
    // missing `page.content.image` must not coerce into "" or null.
    const proposal = buildProposal(
      PAGE_FIXTURE,
      { kind: "Article", confidence: 0.9, inputs: { headline: "X" } },
      "en-US",
    )
    if (proposal.inputs.kind !== "Article") throw new Error("not Article")
    expect(proposal.inputs.image).toBeUndefined()
  })
})

describe("buildProposal", () => {
  it("returns a low-confidence fallback when AI response is null", () => {
    const proposal = buildProposal(PAGE_FIXTURE, null, "en-US")
    expect(proposal.kind).toBe("Article")
    expect(proposal.confidence).toBe(0)
    expect(proposal.enabled).toBe(false)
    expect(proposal.aiError).toBe("no-response")
    expect(proposal.pageId).toBe(PAGE_FIXTURE.id)
  })

  it("auto-disables proposals below 0.7 confidence", () => {
    const proposal = buildProposal(
      PAGE_FIXTURE,
      { kind: "Article", confidence: 0.5, inputs: { headline: "X" } },
      "en-US",
    )
    expect(proposal.enabled).toBe(false)
  })

  it("auto-enables proposals at or above 0.7 confidence", () => {
    const proposal = buildProposal(
      PAGE_FIXTURE,
      { kind: "Article", confidence: 0.85, inputs: { headline: "X" } },
      "en-US",
    )
    expect(proposal.enabled).toBe(true)
  })

  it("clamps confidence to 0..1 range", () => {
    const high = buildProposal(
      PAGE_FIXTURE,
      { kind: "Article", confidence: 5, inputs: {} },
      "en-US",
    )
    const low = buildProposal(
      PAGE_FIXTURE,
      { kind: "Article", confidence: -1, inputs: {} },
      "en-US",
    )
    expect(high.confidence).toBeLessThanOrEqual(1)
    expect(low.confidence).toBeGreaterThanOrEqual(0)
  })

  it("halves confidence when AI returns an unknown kind", () => {
    const proposal = buildProposal(
      PAGE_FIXTURE,
      { kind: "WeirdType", confidence: 0.9, inputs: {} },
      "en-US",
    )
    // Falls back to Article with halved confidence (0.45).
    expect(proposal.kind).toBe("Article")
    expect(proposal.confidence).toBeCloseTo(0.45, 2)
  })

  it("computes a deterministic sourceHash from page content", () => {
    const a = buildProposal(PAGE_FIXTURE, null, "en-US")
    const b = buildProposal(PAGE_FIXTURE, null, "en-US")
    expect(a.sourceHash).toBe(b.sourceHash)
    expect(a.sourceHash.length).toBe(8)
  })
})

describe("aiInputsToSchemaInput — Organization", () => {
  // Regression target: AI sometimes returns `name: "Organization"` (the
  // type word) when it can't find a real brand. That literal then gets
  // translated into 4 different generic words across locales, polluting
  // the JSON-LD. The brand-name fallback prevents this by recognizing
  // generic placeholders and substituting the project's hostname-derived
  // brand instead.

  it("uses brand-name fallback when AI returns the literal 'Organization'", () => {
    const input = aiInputsToSchemaInput(
      "Organization",
      { name: "Organization" },
      "https://acme.com",
      "en-US",
      { title: null, description: null, brandName: "Acme" },
    )
    if (input.kind !== "Organization") throw new Error("not Organization")
    expect(input.name).toBe("Acme")
  })

  it("uses brand-name fallback for other generic placeholders", () => {
    // We treat several common placeholder words as "missing" — site /
    // website / company / brand are all things the AI emits when the
    // page yields no real signal.
    for (const placeholder of ["Site", "Website", "Company", "brand"]) {
      const input = aiInputsToSchemaInput(
        "Organization",
        { name: placeholder },
        "https://acme.com",
        "en-US",
        { title: null, description: null, brandName: "Acme" },
      )
      if (input.kind !== "Organization") throw new Error("not Organization")
      expect(input.name).toBe("Acme")
    }
  })

  it("preserves a real AI-provided name when one is given", () => {
    // We must NOT clobber a legit brand name that the AI extracted
    // from the page (e.g. an H1 or About copy). Only generic
    // placeholders trigger the fallback.
    const input = aiInputsToSchemaInput(
      "Organization",
      { name: "Patagonia" },
      "https://patagonia.com",
      "en-US",
      { title: null, description: null, brandName: "Some Other" },
    )
    if (input.kind !== "Organization") throw new Error("not Organization")
    expect(input.name).toBe("Patagonia")
  })

  it("falls back to fallback.title before brandName", () => {
    // The page's own title ranks above the project-wide brand name —
    // a single page might be tagged for a sub-brand the user wants
    // to surface, and our hostname can't capture that.
    const input = aiInputsToSchemaInput(
      "Organization",
      {},
      "https://acme.com/sub",
      "en-US",
      { title: "Sub Brand", description: null, brandName: "Acme" },
    )
    if (input.kind !== "Organization") throw new Error("not Organization")
    expect(input.name).toBe("Sub Brand")
  })

  it("uses literal 'Organization' only when EVERY fallback is missing", () => {
    // The literal stays as a last-resort safety net so the JSON-LD
    // still parses; the buildProposal layer is responsible for
    // marking such proposals as low-confidence / disabled.
    const input = aiInputsToSchemaInput(
      "Organization",
      {},
      "https://acme.com",
      "en-US",
      { title: null, description: null, brandName: null },
    )
    if (input.kind !== "Organization") throw new Error("not Organization")
    expect(input.name).toBe("Organization")
  })
})

describe("buildProposal — collection landing safety net", () => {
  // Regression target: AI proposed Article for `/blog` (a Collection-list
  // landing page) because it picked up the H1 of a previewed item.
  // Installing that proposal duplicates the child article's headline at
  // the parent URL, which Google reads as canonical confusion.

  const LANDING_PAGE: ScannedPage = {
    id: "blog-index",
    label: "Blog",
    rawPath: "/blog",
    url: "https://acme.com/blog",
    isHomepage: false,
    source: "static",
    content: {
      title: "Getting Started",
      description: "First post in list",
      bodyText: "Getting Started ...",
      headings: ["Getting Started"],
    },
    collectionLanding: { collectionName: "Articles", itemCount: 5 },
  }

  it("disables Article and lowers confidence when the page is a landing", () => {
    const proposal = buildProposal(
      LANDING_PAGE,
      {
        kind: "Article",
        confidence: 0.92,
        rationale: "H1 looks like an article",
        inputs: { headline: "Getting Started" },
      },
      "en-US",
    )
    expect(proposal.kind).toBe("Article") // we don't change kind, just enabled
    expect(proposal.enabled).toBe(false)
    expect(proposal.confidence).toBeLessThanOrEqual(0.3)
    expect(proposal.rationale).toMatch(/collection landing/i)
    expect(proposal.rationale).toContain("5")
    expect(proposal.rationale).toContain("Articles")
  })

  it("does NOT override when the page is NOT a landing", () => {
    const normalPage: ScannedPage = {
      ...LANDING_PAGE,
      collectionLanding: undefined,
    }
    const proposal = buildProposal(
      normalPage,
      {
        kind: "Article",
        confidence: 0.92,
        rationale: "real article",
        inputs: { headline: "Getting Started" },
      },
      "en-US",
    )
    expect(proposal.enabled).toBe(true)
    expect(proposal.confidence).toBeGreaterThan(0.4)
  })

  it("does NOT override when AI picked Organization (the safer kind)", () => {
    // Only Article triggers the safety net. If the AI correctly picked
    // Organization for the landing page, we keep its decision.
    const proposal = buildProposal(
      LANDING_PAGE,
      {
        kind: "Organization",
        confidence: 0.85,
        rationale: "brand surface",
        inputs: { name: "Acme" },
      },
      "en-US",
    )
    expect(proposal.kind).toBe("Organization")
    expect(proposal.enabled).toBe(true)
  })
})

describe("buildProposal — brand-name option threading", () => {
  it("propagates brandName option into Organization fallback name", () => {
    const homePage: ScannedPage = {
      id: "home",
      label: "Home",
      rawPath: "/",
      url: "https://acme.com",
      isHomepage: true,
      source: "static",
      content: { title: null, description: null, bodyText: "", headings: [] },
    }
    const proposal = buildProposal(
      homePage,
      {
        kind: "Organization",
        confidence: 0.9,
        inputs: { name: "Organization" }, // generic placeholder
      },
      "en-US",
      { brandName: "Acme" },
    )
    if (proposal.inputs.kind !== "Organization") {
      throw new Error("not Organization")
    }
    expect(proposal.inputs.name).toBe("Acme")
  })
})

describe("proposalToJsonLd", () => {
  it("renders an Article schema with correct @type and inLanguage", () => {
    const proposal = buildProposal(
      PAGE_FIXTURE,
      {
        kind: "Article",
        confidence: 0.9,
        inputs: { headline: "Hello", description: "World" },
      },
      "en-US",
    )
    const json = proposalToJsonLd(proposal)
    const parsed = JSON.parse(json)
    expect(parsed["@type"]).toBe("Article")
    expect(parsed.inLanguage).toBe("en-US")
    expect(parsed.headline).toBe("Hello")
  })

  it("renders FAQPage with mainEntity array", () => {
    const proposal = buildProposal(
      PAGE_FIXTURE,
      {
        kind: "FAQPage",
        confidence: 0.9,
        inputs: {
          questions: [
            { question: "Q1?", answer: "A1." },
            { question: "Q2?", answer: "A2." },
          ],
        },
      },
      "en-US",
    )
    const parsed = JSON.parse(proposalToJsonLd(proposal))
    expect(parsed["@type"]).toBe("FAQPage")
    expect(Array.isArray(parsed.mainEntity)).toBe(true)
    expect(parsed.mainEntity.length).toBe(2)
  })
})
