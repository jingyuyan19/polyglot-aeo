import { describe, expect, it } from "vitest"

import {
  hashIdentityInputs,
  hostnameFallbackIdentity,
  isPlaceholderIdentity,
  mergeIdentityTranslations,
  pickIdentityTranslationTargets,
  resolveIdentityForLocale,
  type SiteIdentity,
  type SiteIdentityTranslations,
} from "./identity"

// ---------- hostnameFallbackIdentity ----------

describe("hostnameFallbackIdentity", () => {
  // Regression target: this function is the safety net for the
  // entire V2 pipeline. If Phase 0 ever fails, we fall here. So
  // the contract MUST be "always returns a usable SiteIdentity",
  // never throws, never returns null.

  it("derives a brand from a typical Framer subdomain", () => {
    const id = hostnameFallbackIdentity("acme-store.framer.website")
    expect(id.brandName).toBe("Acme Store")
    expect(id.defaultAuthor).toBe("Editorial Team")
    expect(id.confidence).toBe(0)
    expect(id.source).toBe("hostname-fallback")
    expect(id.derivedAt).toBeGreaterThan(0)
  })

  it("returns a generic identity when hostname is null", () => {
    // Phase 0 callers can pass undefined hostname (project not
    // published yet, no URL available). We must still produce a
    // SiteIdentity so the audit view can render something.
    const id = hostnameFallbackIdentity(null)
    expect(id.brandName).toBe("Site")
    expect(id.source).toBe("hostname-fallback")
  })

  it("returns a generic identity when hostname is undefined", () => {
    const id = hostnameFallbackIdentity(undefined)
    expect(id.brandName).toBe("Site")
  })

  it("never throws on malformed hostnames", () => {
    // deriveBrandName already handles malformed input but we
    // double-check the contract here — defensive testing for the
    // "fallback for the fallback" path.
    expect(() => hostnameFallbackIdentity("")).not.toThrow()
    expect(() => hostnameFallbackIdentity("   ")).not.toThrow()
    expect(() => hostnameFallbackIdentity("not a domain")).not.toThrow()
  })

  it("populates derivedAt with a recent timestamp", () => {
    const before = Date.now()
    const id = hostnameFallbackIdentity("acme.com")
    const after = Date.now()
    expect(id.derivedAt).toBeGreaterThanOrEqual(before)
    expect(id.derivedAt).toBeLessThanOrEqual(after)
  })
})

// ---------- isPlaceholderIdentity ----------

describe("isPlaceholderIdentity", () => {
  // Regression target: AI sometimes returns the type word
  // ("Organization", "Site") as the brand name. We must catch this
  // and fall through to the hostname fallback rather than ship the
  // literal placeholder into JSON-LD across every locale.

  function id(brandName: string): SiteIdentity {
    return {
      brandName,
      defaultAuthor: "Editorial Team",
      confidence: 0.9,
      source: "ai",
      derivedAt: 0,
    }
  }

  it("flags literal placeholder brand names", () => {
    for (const placeholder of [
      "Site",
      "Website",
      "Your Site",
      "Your Website",
      "Organization",
      "Company",
      "Brand",
      "Untitled",
    ]) {
      expect(isPlaceholderIdentity(id(placeholder))).toBe(true)
    }
  })

  it("is case-insensitive and trims whitespace", () => {
    // AI output is unreliable about casing/whitespace — match the
    // upstream `GENERIC_ORG_PLACEHOLDERS` semantics exactly.
    expect(isPlaceholderIdentity(id("SITE"))).toBe(true)
    expect(isPlaceholderIdentity(id("  organization  "))).toBe(true)
    expect(isPlaceholderIdentity(id("Your SITE"))).toBe(true)
  })

  it("flags empty brand names", () => {
    // An empty brand is unusable — same fallback path as a literal
    // placeholder. We never want to emit `{name: ""}` JSON-LD.
    expect(isPlaceholderIdentity(id(""))).toBe(true)
    expect(isPlaceholderIdentity(id("   "))).toBe(true)
  })

  it("does NOT flag real brand names", () => {
    for (const real of [
      "Acme",
      "Patagonia",
      "ACME Industries",
      "株式会社Acme",
      "Café Patagonia",
    ]) {
      expect(isPlaceholderIdentity(id(real))).toBe(false)
    }
  })
})

// ---------- hashIdentityInputs ----------

describe("hashIdentityInputs", () => {
  // Regression target: this hash drives the staleness check. False
  // positives (different content → same hash) skip a needed re-
  // derivation; false negatives (same content → different hash)
  // burn AI tokens for nothing. Both bad. Tests pin the contract.

  it("produces stable hashes for identical input", () => {
    const a = hashIdentityInputs([
      { path: "/", title: "Home", bodyText: "Welcome to Acme" },
    ])
    const b = hashIdentityInputs([
      { path: "/", title: "Home", bodyText: "Welcome to Acme" },
    ])
    expect(a).toBe(b)
  })

  it("changes when path differs", () => {
    const a = hashIdentityInputs([
      { path: "/", title: "Home", bodyText: "Welcome" },
    ])
    const b = hashIdentityInputs([
      { path: "/about", title: "Home", bodyText: "Welcome" },
    ])
    expect(a).not.toBe(b)
  })

  it("changes when title differs", () => {
    const a = hashIdentityInputs([
      { path: "/", title: "Home", bodyText: "Welcome" },
    ])
    const b = hashIdentityInputs([
      { path: "/", title: "About", bodyText: "Welcome" },
    ])
    expect(a).not.toBe(b)
  })

  it("changes when body text differs", () => {
    const a = hashIdentityInputs([
      { path: "/", title: "Home", bodyText: "Welcome to Acme" },
    ])
    const b = hashIdentityInputs([
      { path: "/", title: "Home", bodyText: "Welcome to Patagonia" },
    ])
    expect(a).not.toBe(b)
  })

  it("only considers the first 800 chars of body text", () => {
    // Long bodies are truncated for hash stability — small edits
    // beyond char 800 (e.g. footer copy tweaks, late additions)
    // won't bust the cache. Saves AI calls; small risk a meaningful
    // brand-relevant edit lives at char 850 and we miss it.
    const truncatedBody = "x".repeat(800)
    const longerBody = "x".repeat(800) + "different content here"
    const a = hashIdentityInputs([
      { path: "/", title: "Home", bodyText: truncatedBody },
    ])
    const b = hashIdentityInputs([
      { path: "/", title: "Home", bodyText: longerBody },
    ])
    expect(a).toBe(b)
  })

  it("treats null titles as empty for hashing", () => {
    // Defensive: a missing title shouldn't crash; treat as "".
    expect(() =>
      hashIdentityInputs([{ path: "/", title: null, bodyText: "x" }]),
    ).not.toThrow()
  })

  it("input order matters (caller responsibility)", () => {
    // Stable hashes require stable input order. We encode this in
    // the test so future maintainers know not to sort inputs in
    // the function — that would break the contract for callers
    // that want order-sensitive hashing.
    const a = hashIdentityInputs([
      { path: "/", title: "A", bodyText: "x" },
      { path: "/about", title: "B", bodyText: "y" },
    ])
    const b = hashIdentityInputs([
      { path: "/about", title: "B", bodyText: "y" },
      { path: "/", title: "A", bodyText: "x" },
    ])
    expect(a).not.toBe(b)
  })
})

// ---------- resolveIdentityForLocale ----------

describe("resolveIdentityForLocale", () => {
  const baseIdentity: SiteIdentity = {
    brandName: "Acme",
    defaultAuthor: "Editorial Team",
    organizationDescription: "We make widgets.",
    confidence: 0.9,
    source: "ai",
    derivedAt: 0,
  }

  it("returns the source identity unchanged for the default locale", () => {
    // Default-locale render reads straight from `identity` — we
    // never look up a translation, even if one happens to exist
    // for that locale code (would be a misconfiguration).
    const out = resolveIdentityForLocale(baseIdentity, {}, "en-US", true)
    expect(out).toBe(baseIdentity)
  })

  it("merges translation values on top of source identity for non-default locale", () => {
    const translations: SiteIdentityTranslations = {
      ja: {
        brandName: "株式会社Acme",
        defaultAuthor: "編集チーム",
        organizationDescription: "私たちはウィジェットを作っています。",
      },
    }
    const out = resolveIdentityForLocale(baseIdentity, translations, "ja", false)
    expect(out.brandName).toBe("株式会社Acme")
    expect(out.defaultAuthor).toBe("編集チーム")
    expect(out.organizationDescription).toBe("私たちはウィジェットを作っています。")
    // Confidence/source/derivedAt are NOT translated — they're
    // metadata about the identity itself, locale-invariant.
    expect(out.confidence).toBe(0.9)
    expect(out.source).toBe("ai")
  })

  it("falls back to source identity when no translation exists for the locale", () => {
    // Translation hiccup for one locale (Phase 0.5 failed) must
    // not block install — we ship the source-language identity
    // there rather than emit an empty publisher.name.
    const out = resolveIdentityForLocale(baseIdentity, {}, "ja", false)
    expect(out).toBe(baseIdentity)
  })

  it("falls back to source identity when translation has empty brandName", () => {
    // AI returning an empty brand for one locale means we can't
    // trust that locale's translation — bail to source instead of
    // emitting empty `{name: ""}` JSON-LD.
    const translations: SiteIdentityTranslations = {
      ja: { brandName: "", defaultAuthor: "編集チーム" },
    }
    const out = resolveIdentityForLocale(baseIdentity, translations, "ja", false)
    expect(out).toBe(baseIdentity)
  })

  it("preserves source defaultAuthor when translation omits it", () => {
    // Partial translations are common (AI returns brandName but
    // can't translate "Editorial Team" satisfactorily). Each
    // field falls back independently.
    const translations: SiteIdentityTranslations = {
      ja: { brandName: "Acme JP", defaultAuthor: "" },
    }
    const out = resolveIdentityForLocale(baseIdentity, translations, "ja", false)
    expect(out.brandName).toBe("Acme JP")
    expect(out.defaultAuthor).toBe("Editorial Team") // source default kept
  })
})

// ---------- identity translation cache helpers ----------

describe("pickIdentityTranslationTargets", () => {
  const EN = { code: "en-US", isDefault: true }
  const JA = { code: "ja-JP", isDefault: false }
  const NL = { code: "nl", isDefault: false }

  it("targets every non-default locale after identity refresh", () => {
    const out = pickIdentityTranslationTargets(
      [EN, JA, NL],
      { "ja-JP": { brandName: "アクメ", defaultAuthor: "編集チーム" } },
      true,
    )
    expect(out.map((l) => l.code)).toEqual(["ja-JP", "nl"])
  })

  it("targets only missing non-default locales when identity is cached", () => {
    const out = pickIdentityTranslationTargets(
      [EN, JA, NL],
      { "ja-JP": { brandName: "アクメ", defaultAuthor: "編集チーム" } },
      false,
    )
    expect(out.map((l) => l.code)).toEqual(["nl"])
  })

  it("treats empty brandName translations as missing", () => {
    const out = pickIdentityTranslationTargets(
      [JA],
      { "ja-JP": { brandName: " ", defaultAuthor: "編集チーム" } },
      false,
    )
    expect(out.map((l) => l.code)).toEqual(["ja-JP"])
  })
})

describe("mergeIdentityTranslations", () => {
  const current: SiteIdentityTranslations = {
    "ja-JP": { brandName: "旧ブランド", defaultAuthor: "編集チーム" },
  }
  const fresh: SiteIdentityTranslations = {
    nl: { brandName: "Acme NL", defaultAuthor: "Redactie" },
  }

  it("drops old translations when identity was refreshed", () => {
    expect(mergeIdentityTranslations(current, fresh, true)).toEqual(fresh)
  })

  it("preserves existing translations when filling missing locales", () => {
    expect(mergeIdentityTranslations(current, fresh, false)).toEqual({
      ...current,
      ...fresh,
    })
  })
})
