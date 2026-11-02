import { callAi, type AiCallResult } from "./client"
import {
  buildSiteIdentityPrompt,
  buildSiteIdentityTranslatePrompt,
} from "./prompts"
import type { LocaleInfo } from "../framer/locales"
import type { ScannedPage, SiteMap } from "../framer/site-scan"
import {
  hashIdentityInputs,
  hostnameFallbackIdentity,
  isPlaceholderIdentity,
  type SiteIdentity,
  type SiteIdentityTranslations,
} from "../schema/identity"
import type { AiCredentials } from "./schema-scan"

import {
  requireTargetScript,
  validateLocaleScript,
} from "../locale-script"

export {
  findHanGlyphViolations,
  hasHanGlyphViolations,
  hasLatinEmbeddedInCjk,
  requireTargetScript,
  stripQuotedRegions,
  validateLocaleScript,
} from "../locale-script"

// ---------- Public surface ----------

/**
 * Injectable AI-call shape. Production code uses {@link callAi}; tests
 * pass a deterministic fake to avoid real network calls. The single-
 * parameter signature keeps mocks trivial — `(prompt) => fakeResult`.
 */
export type IdentityAiCall = (params: {
  ai: AiCredentials
  prompt: { system: string; user: string }
  maxTokens: number
}) => Promise<AiCallResult>

const defaultAiCall: IdentityAiCall = (params) =>
  callAi({
    ...params.ai,
    feature: "schema_scan",
    prompt: params.prompt,
    maxTokens: params.maxTokens,
  })

export interface DeriveSiteIdentityResult {
  identity: SiteIdentity
  /** Hash of the input pages — caller persists alongside identity. */
  sourceHash: string
}

/**
 * Phase 0 — derive site-wide identity from a representative subset
 * of pages. Runs ONCE per scan (or on cache miss).
 *
 * Resolution chain:
 *
 *   1. Pick up to 3 identity-rich pages from the SiteMap (homepage,
 *      about-style paths, then any non-CMS page as fallback).
 *   2. Call the AI once with a focused prompt and short payload.
 *   3. Parse + validate the response. Reject placeholder brand names
 *      (`isPlaceholderIdentity`).
 *   4. On any failure, return `hostnameFallbackIdentity()`. The
 *      function NEVER throws — Phase 0 not working must not block
 *      the rest of the audit pipeline.
 *
 * Pure-ish: the only side effect is the AI call itself. Side-effect-
 * free callers (tests) inject a mock through the optional `aiCall`
 * parameter to avoid hitting a real provider.
 */
export async function deriveSiteIdentity(
  siteMap: SiteMap,
  ai: AiCredentials,
  options: { aiCall?: IdentityAiCall } = {},
): Promise<DeriveSiteIdentityResult> {
  const aiCall = options.aiCall ?? defaultAiCall
  const candidates = pickIdentityPages(siteMap.pages)
  const inputsForHash = candidates.map((p) => ({
    path: p.rawPath,
    title: p.label || null,
    bodyText: pageBodyExtract(p),
  }))
  const sourceHash = hashIdentityInputs(inputsForHash)

  const hostname = safeHostname(siteMap.baseUrl)
  const fallback = hostnameFallbackIdentity(hostname)

  // No usable pages? No AI call worth making.
  if (candidates.length === 0) {
    return { identity: fallback, sourceHash }
  }

  const { system, user } = buildSiteIdentityPrompt({
    pages: inputsForHash,
    brandFallbackName: siteMap.brandName,
    hostname,
  })

  try {
    const result = await aiCall({
      ai,
      prompt: { system, user },
      maxTokens: 600,
    })
    const parsed = result.parsed
    const identity = parseIdentityResponse(parsed, fallback)
    if (isPlaceholderIdentity(identity)) {
      // AI returned a placeholder despite the prompt forbidding
      // it. Fall back to hostname; preserve confidence as a hint
      // ("AI tried but failed") so the UI can surface it.
      return {
        identity: { ...fallback, confidence: identity.confidence },
        sourceHash,
      }
    }
    return { identity, sourceHash }
  } catch {
    // Network / provider / parse failure. Hostname fallback is
    // always usable, so the audit view continues to work.
    return { identity: fallback, sourceHash }
  }
}

export interface TranslateSiteIdentityResult {
  translations: SiteIdentityTranslations
  /** Locales that returned unparseable / mixed-script output. */
  failed: string[]
}

/**
 * Phase 0.5 — translate the canonical identity into each non-default
 * locale. M parallel calls, one per locale; failures isolated.
 *
 * The output is shallow-merged with the source identity at render
 * time (`resolveIdentityForLocale`), so missing locales fall back
 * to the source values automatically. We don't retry on failure —
 * the user can re-translate manually from the identity card.
 */
export async function translateSiteIdentity(
  identity: SiteIdentity,
  targetLocales: ReadonlyArray<LocaleInfo>,
  ai: AiCredentials,
  options: {
    brandVoice?: string
    concurrency?: number
    aiCall?: IdentityAiCall
  } = {},
): Promise<TranslateSiteIdentityResult> {
  const aiCall = options.aiCall ?? defaultAiCall
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const work: LocaleInfo[] = targetLocales.filter((l) => !l.isDefault)
  const translations: SiteIdentityTranslations = {}
  const failed: string[] = []

  if (work.length === 0) return { translations, failed }

  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= work.length) return
      const locale = work[i]
      const { system, user } = buildSiteIdentityTranslatePrompt({
        brandName: identity.brandName,
        defaultAuthor: identity.defaultAuthor,
        organizationDescription: identity.organizationDescription,
        targetLanguage: locale.code,
        brandVoice: options.brandVoice,
      })
      try {
        const result = await aiCall({
          ai,
          prompt: { system, user },
          maxTokens: 400,
        })
        const parsed = result.parsed
        const t = parseTranslateResponse(parsed)
        if (!t || !validateLocaleScript(t.brandName, locale.code)) {
          failed.push(locale.code)
          continue
        }
        // The motivating bug: the AI returned `{"brandName":"Jimmyjing",
        // "defaultAuthor":"Editorial Team"}` for ja. brandName passed
        // (length 9 ≤ 16, brand-name escape hatch). defaultAuthor also
        // passed the lenient check (length 14 ≤ 16, no Han) — even
        // though it's a generic placeholder that absolutely should be
        // translated into Japanese script. Apply the strict variant
        // here: defaultAuthor is by definition NOT a brand, so the
        // ≤16-char Latin shortcut shouldn't apply. Failure marks the
        // entire locale as failed → UI shows a warning and the user
        // can re-run identity translation or hand-edit.
        if (!requireTargetScript(t.defaultAuthor, locale.code)) {
          failed.push(locale.code)
          continue
        }
        translations[locale.code] = t
      } catch {
        failed.push(locale.code)
      }
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, work.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return { translations, failed }
}

// ---------- Pure helpers (exported for tests) ----------

/**
 * Pick up to 3 identity-rich pages from the SiteMap, in priority
 * order:
 *
 *   1. Homepage (`isHomepage === true`).
 *   2. Pages whose path contains `about` / `company` / `team` /
 *      `contact` (case-insensitive).
 *   3. Any other non-CMS static page (capped to fill out the slate).
 *
 * Cap at 3 to keep the AI prompt short (~6 KB total content). CMS
 * detail pages are excluded — they're per-item content, not
 * identity-bearing.
 *
 * Pure.
 */
export function pickIdentityPages(
  pages: ReadonlyArray<ScannedPage>,
): ScannedPage[] {
  const MAX = 3
  const ABOUT_HINT = /(\babout\b|\bcompany\b|\bteam\b|\bcontact\b)/i

  const homepage = pages.find((p) => p.isHomepage && p.source === "static")
  const aboutPages = pages.filter(
    (p) =>
      p.source === "static" &&
      !p.isHomepage &&
      ABOUT_HINT.test(p.rawPath),
  )
  const otherStatic = pages.filter(
    (p) =>
      p.source === "static" &&
      !p.isHomepage &&
      !ABOUT_HINT.test(p.rawPath),
  )

  const picks: ScannedPage[] = []
  if (homepage) picks.push(homepage)
  for (const p of aboutPages) {
    if (picks.length >= MAX) break
    picks.push(p)
  }
  for (const p of otherStatic) {
    if (picks.length >= MAX) break
    picks.push(p)
  }
  return picks
}

// ---------- Internals ----------

function pageBodyExtract(p: ScannedPage): string {
  // We concatenate title + description + first chunk of body so the
  // AI gets a coherent identity signal without being buried in nav
  // copy. The 1200-char cap matches the prompt's per-page slice.
  const parts: string[] = []
  if (p.content.title) parts.push(p.content.title)
  if (p.content.description) parts.push(p.content.description)
  if (p.content.bodyText) parts.push(p.content.bodyText)
  return parts.join("\n").slice(0, 1200)
}

function safeHostname(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname || null
  } catch {
    return null
  }
}

function parseIdentityResponse(
  parsed: unknown,
  fallback: SiteIdentity,
): SiteIdentity {
  if (!parsed || typeof parsed !== "object") return fallback
  const obj = parsed as Record<string, unknown>
  const brandName = trimStr(obj.brandName)
  if (!brandName) return fallback
  const confidence = clamp01(numOr(obj.confidence, 0))
  return {
    brandName,
    defaultAuthor: trimStr(obj.defaultAuthor) ?? "Editorial Team",
    organizationDescription:
      trimStr(obj.organizationDescription) ?? undefined,
    publisherUrl: trimStr(obj.publisherUrl) ?? undefined,
    publisherLogo: trimStr(obj.publisherLogo) ?? undefined,
    confidence,
    source: "ai",
    derivedAt: Date.now(),
  }
}

function parseTranslateResponse(
  parsed: unknown,
): SiteIdentityTranslations[string] | null {
  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as Record<string, unknown>
  const brandName = trimStr(obj.brandName)
  if (!brandName) return null
  return {
    brandName,
    defaultAuthor: trimStr(obj.defaultAuthor) ?? "",
    organizationDescription:
      trimStr(obj.organizationDescription) ?? undefined,
  }
}

function trimStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

function numOr(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return fallback
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
