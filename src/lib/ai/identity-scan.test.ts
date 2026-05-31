import { describe, expect, it, vi } from "vitest"

import {
  deriveSiteIdentity,
  type IdentityAiCall,
  pickIdentityPages,
  translateSiteIdentity,
} from "./identity-scan"
import type { LocaleInfo } from "../framer/locales"
import type { ScannedPage, SiteMap } from "../framer/site-scan"
import type { AiCredentials } from "./schema-scan"

// ---------- Test scaffolding ----------

function page(opts: Partial<ScannedPage> & { id: string }): ScannedPage {
  return {
    id: opts.id,
    label: opts.label ?? opts.id,
    rawPath: opts.rawPath ?? `/${opts.id}`,
    url: opts.url ?? `https://acme.com/${opts.id}`,
    isHomepage: opts.isHomepage ?? false,
    source: opts.source ?? "static",
    cms: opts.cms,
    content: opts.content ?? {
      title: opts.id,
      description: null,
      bodyText: opts.id,
      headings: [],
    },
  }
}

function siteMap(...pages: ScannedPage[]): SiteMap {
  return {
    baseUrl: "https://acme.com",
    scannedAt: 0,
    pages,
    partial: false,
    brandName: "Acme",
  }
}

const ai: AiCredentials = {
  providerId: "openai",
  modelId: "gpt-4o-mini",
  apiKey: "sk-test",
}

const locale = (
  code: string,
  isDefault = false,
): LocaleInfo => ({
  id: code,
  code,
  name: code,
  slug: code.split("-")[0],
  isDefault,
})

function fakeAi(parsed: unknown): IdentityAiCall {
  return vi.fn(async () => ({
    raw: JSON.stringify(parsed),
    parsed,
  })) as unknown as IdentityAiCall
}

function failingAi(): IdentityAiCall {
  return vi.fn(async () => {
    throw new Error("network")
  }) as unknown as IdentityAiCall
}

// ---------- pickIdentityPages ----------

describe("pickIdentityPages", () => {
  it("prioritises homepage when present", () => {
    const home = page({ id: "home", isHomepage: true })
    const about = page({ id: "about", rawPath: "/about" })
    const blog = page({ id: "post", rawPath: "/blog/post" })
    const picks = pickIdentityPages([blog, about, home])
    expect(picks[0]).toBe(home)
  })

  it("includes about-style pages after homepage", () => {
    const home = page({ id: "home", isHomepage: true })
    const about = page({ id: "about", rawPath: "/about" })
    const team = page({ id: "team", rawPath: "/team" })
    const picks = pickIdentityPages([home, about, team])
    expect(picks).toContain(about)
    expect(picks).toContain(team)
  })

  it("caps at 3 pages", () => {
    const pages = [
      page({ id: "home", isHomepage: true }),
      page({ id: "about", rawPath: "/about" }),
      page({ id: "team", rawPath: "/team" }),
      page({ id: "company", rawPath: "/company" }),
      page({ id: "contact", rawPath: "/contact" }),
    ]
    expect(pickIdentityPages(pages).length).toBe(3)
  })

  it("excludes CMS pages from identity derivation", () => {
    // CMS pages are per-item content, not identity-bearing. A site
    // with 50 blog posts shouldn't have its brand derived from one.
    const home = page({ id: "home", isHomepage: true })
    const cms = page({
      id: "post1",
      source: "cms",
      cms: { collectionId: "c", collectionName: "Blog", itemId: "i" },
    })
    const picks = pickIdentityPages([home, cms])
    expect(picks).toEqual([home])
  })

  it("falls back to other static pages when no homepage/about exists", () => {
    // Sites without a clear homepage (e.g. landing-page-only) still
    // need SOMETHING to derive identity from. Take any static page.
    const random = page({ id: "random", rawPath: "/random" })
    const picks = pickIdentityPages([random])
    expect(picks).toEqual([random])
  })

  it("returns empty when only CMS pages exist", () => {
    // Edge case: the site has no static pages at all (rare, but
    // possible during a partial scan). deriveSiteIdentity will see
    // an empty list and skip the AI call entirely.
    const cms = page({
      id: "p",
      source: "cms",
      cms: { collectionId: "c", collectionName: "Blog", itemId: "i" },
    })
    expect(pickIdentityPages([cms])).toEqual([])
  })
})

// ---------- deriveSiteIdentity ----------

describe("deriveSiteIdentity", () => {
  it("returns AI-derived identity on happy path", async () => {
    const home = page({ id: "home", isHomepage: true })
    const map = siteMap(home)
    const aiCall = fakeAi({
      brandName: "Acme Industries",
      defaultAuthor: "Acme Newsroom",
      organizationDescription: "We make widgets.",
      confidence: 0.95,
    })
    const { identity, sourceHash } = await deriveSiteIdentity(map, ai, {
      aiCall,
    })
    expect(identity.brandName).toBe("Acme Industries")
    expect(identity.defaultAuthor).toBe("Acme Newsroom")
    expect(identity.organizationDescription).toBe("We make widgets.")
    expect(identity.confidence).toBeCloseTo(0.95)
    expect(identity.source).toBe("ai")
    expect(sourceHash.length).toBeGreaterThan(0)
  })

  it("falls back to hostname identity when AI throws", async () => {
    // Network failures must not block the audit pipeline. We
    // synthesise an identity from the hostname so the user can
    // continue to install (with a low-confidence warning surfaced
    // by the UI).
    const home = page({ id: "home", isHomepage: true })
    const map = siteMap(home)
    const { identity } = await deriveSiteIdentity(map, ai, {
      aiCall: failingAi(),
    })
    expect(identity.source).toBe("hostname-fallback")
    expect(identity.brandName).toBe("Acme")
  })

  it("falls back to hostname when AI returns a placeholder brand", async () => {
    // The AI sometimes ignores the prompt and returns the type
    // word. We catch this client-side and fall back rather than
    // ship the literal placeholder into JSON-LD.
    const home = page({ id: "home", isHomepage: true })
    const map = siteMap(home)
    const { identity } = await deriveSiteIdentity(map, ai, {
      aiCall: fakeAi({ brandName: "Organization", confidence: 0.8 }),
    })
    expect(identity.source).toBe("hostname-fallback")
    expect(identity.brandName).toBe("Acme")
    // Preserve the AI's confidence as an "AI tried but failed"
    // hint — UI surfaces this as "Low confidence".
    expect(identity.confidence).toBeCloseTo(0.8)
  })

  it("falls back when AI returns malformed (non-object) JSON", async () => {
    const home = page({ id: "home", isHomepage: true })
    const map = siteMap(home)
    const { identity } = await deriveSiteIdentity(map, ai, {
      aiCall: fakeAi("just a string"),
    })
    expect(identity.source).toBe("hostname-fallback")
  })

  it("skips the AI call when no usable pages exist", async () => {
    // An empty/CMS-only site map has nothing to anchor on. We
    // return the hostname fallback synchronously without spending
    // an AI call on guaranteed garbage.
    const map = siteMap()
    const aiCall = fakeAi({ brandName: "Should never be used" })
    const { identity } = await deriveSiteIdentity(map, ai, { aiCall })
    expect(identity.source).toBe("hostname-fallback")
    expect(aiCall).not.toHaveBeenCalled()
  })

  it("clamps confidence to [0, 1]", async () => {
    // AI sometimes returns out-of-range numbers (1.5, -0.2) due
    // to model quirks. We clamp defensively so downstream
    // confidence-based UI gates work.
    const home = page({ id: "home", isHomepage: true })
    const map = siteMap(home)
    const { identity } = await deriveSiteIdentity(map, ai, {
      aiCall: fakeAi({ brandName: "Acme", confidence: 1.7 }),
    })
    expect(identity.confidence).toBe(1)
  })

  it("yields stable sourceHash for unchanged pages", async () => {
    // Cache invalidation depends on this. Two identical scans must
    // produce identical hashes.
    const home = page({
      id: "home",
      isHomepage: true,
      content: { title: "Acme", description: null, bodyText: "Hi", headings: [] },
    })
    const map = siteMap(home)
    const r1 = await deriveSiteIdentity(map, ai, {
      aiCall: fakeAi({ brandName: "Acme", confidence: 0.9 }),
    })
    const r2 = await deriveSiteIdentity(map, ai, {
      aiCall: fakeAi({ brandName: "Different", confidence: 0.9 }),
    })
    expect(r1.sourceHash).toBe(r2.sourceHash)
  })
})

// ---------- translateSiteIdentity ----------

describe("translateSiteIdentity", () => {
  const sourceIdentity = {
    brandName: "Acme",
    defaultAuthor: "Editorial Team",
    organizationDescription: "We make widgets.",
    confidence: 0.9,
    source: "ai" as const,
    derivedAt: 0,
  }

  it("returns translations for each non-default locale", async () => {
    const ja = locale("ja")
    const nl = locale("nl")
    const en = locale("en-US", true) // default — should be excluded
    const aiCall = vi.fn(async ({ prompt }) => ({
      raw: "",
      parsed:
        prompt.user.includes("ja")
          ? { brandName: "Acme JA", defaultAuthor: "編集チーム" }
          : { brandName: "Acme NL", defaultAuthor: "Redactieteam" },
    })) as unknown as IdentityAiCall
    const { translations, failed } = await translateSiteIdentity(
      sourceIdentity,
      [en, ja, nl],
      ai,
      { aiCall },
    )
    expect(failed).toEqual([])
    expect(translations.ja?.brandName).toBe("Acme JA")
    expect(translations.nl?.brandName).toBe("Acme NL")
    expect(translations["en-US"]).toBeUndefined()
  })

  it("isolates failures per-locale", async () => {
    // One failed locale must not block the others. The failure
    // surfaces in `failed` so the UI can offer a retry.
    const ja = locale("ja")
    const nl = locale("nl")
    let calls = 0
    const aiCall = vi.fn(async ({ prompt }) => {
      calls++
      if (prompt.user.includes("ja")) throw new Error("rate limit")
      return {
        raw: "",
        parsed: { brandName: "Acme NL", defaultAuthor: "Redactieteam" },
      }
    }) as unknown as IdentityAiCall
    const { translations, failed } = await translateSiteIdentity(
      sourceIdentity,
      [ja, nl],
      ai,
      { aiCall, concurrency: 1 },
    )
    expect(translations.ja).toBeUndefined()
    expect(translations.nl?.brandName).toBe("Acme NL")
    expect(failed).toContain("ja")
    expect(calls).toBe(2)
  })

  it("rejects mixed-script translations as failures", async () => {
    // The validator catches "Han characters in Japanese output".
    // We treat such cells as failed (no override produced) so the
    // render-time fallback uses the source-language identity.
    const ja = locale("ja")
    const aiCall = fakeAi({
      brandName: "我们的网站很棒非常好用", // Chinese in ja position
      defaultAuthor: "編集チーム",
    })
    const { translations, failed } = await translateSiteIdentity(
      sourceIdentity,
      [ja],
      ai,
      { aiCall },
    )
    expect(translations.ja).toBeUndefined()
    expect(failed).toContain("ja")
  })

  it("returns empty result when no non-default locales", async () => {
    const en = locale("en", true)
    const aiCall = fakeAi({ brandName: "Should never use" })
    const { translations, failed } = await translateSiteIdentity(
      sourceIdentity,
      [en],
      ai,
      { aiCall },
    )
    expect(translations).toEqual({})
    expect(failed).toEqual([])
    expect(aiCall).not.toHaveBeenCalled()
  })

  it("rejects translations with empty brandName", async () => {
    // Defensive: an empty brand survives the parser but is
    // unusable downstream. Fail the locale and let render fall
    // back to source.
    const ja = locale("ja")
    const aiCall = fakeAi({ brandName: "", defaultAuthor: "編集チーム" })
    const { translations, failed } = await translateSiteIdentity(
      sourceIdentity,
      [ja],
      ai,
      { aiCall },
    )
    expect(translations.ja).toBeUndefined()
    expect(failed).toContain("ja")
  })

  it("rejects when defaultAuthor isn't translated into target script", async () => {
    // Real production bug: AI returned
    //   { brandName: "Jimmyjing", defaultAuthor: "Editorial Team" }
    // for ja. The OLD validator accepted because both fields passed
    // the length-≤16-no-Han Latin escape hatch (designed for brand
    // names). That meant every Japanese Article landed in the user's
    // site with `author.name = "Editorial Team"` — visibly broken.
    //
    // Fix: defaultAuthor goes through `requireTargetScript`, which
    // demands actual native-script characters. Brand still uses the
    // lenient validator so legit Latin brand names like "Acme" pass.
    const ja = locale("ja")
    const aiCall = fakeAi({
      brandName: "Jimmyjing", // Latin brand — legitimate
      defaultAuthor: "Editorial Team", // not translated — must reject
    })
    const { translations, failed } = await translateSiteIdentity(
      sourceIdentity,
      [ja],
      ai,
      { aiCall },
    )
    expect(translations.ja).toBeUndefined()
    expect(failed).toContain("ja")
  })

  it("accepts when both brand and author are valid for the locale", async () => {
    // Inverse of the above: a properly-translated payload must pass.
    const ja = locale("ja")
    const aiCall = fakeAi({
      brandName: "Jimmyjing",
      defaultAuthor: "編集チーム",
    })
    const { translations, failed } = await translateSiteIdentity(
      sourceIdentity,
      [ja],
      ai,
      { aiCall },
    )
    expect(translations.ja?.brandName).toBe("Jimmyjing")
    expect(translations.ja?.defaultAuthor).toBe("編集チーム")
    expect(failed).not.toContain("ja")
  })

  it("accepts a Latin brand + Latin author for a Latin-script locale", async () => {
    // Strict-mode for Latin locales is a no-op, so a French
    // translation that returns "Rédaction" must pass.
    const fr = locale("fr")
    const aiCall = fakeAi({
      brandName: "Jimmyjing",
      defaultAuthor: "Rédaction",
    })
    const { translations, failed } = await translateSiteIdentity(
      sourceIdentity,
      [fr],
      ai,
      { aiCall },
    )
    expect(translations.fr?.defaultAuthor).toBe("Rédaction")
    expect(failed).not.toContain("fr")
  })
})
