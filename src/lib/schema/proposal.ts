import type { ScannedPage } from "../framer/site-scan"
import { hashPageContent } from "../framer/site-scan"
import { buildSchema, serializeJsonLd } from "./index"
import type {
  ArticleInput,
  FaqPageInput,
  LocalBusinessInput,
  OrganizationInput,
  ProductInput,
  SchemaInput,
  SchemaKind,
} from "./types"

/**
 * SchemaProposal — one row in the audit list. Bound to a single ScannedPage.
 * Exists at "proposed" status (right after AI scan), is mutated by the user
 * (toggle `enabled`, future: edit `inputs`), and is the unit of bulk install.
 */
export interface SchemaProposal {
  /** Matches ScannedPage.id for snapshot diffing. */
  pageId: string
  /** Display label propagated from the page (so UI doesn't need the page). */
  pageLabel: string
  /** Source URL — the page's canonical URL the proposal applies to. */
  url: string
  /** AI-detected schema kind. */
  kind: SchemaKind
  /** Fully-normalized SchemaInput ready for `buildSchema(...)`. */
  inputs: SchemaInput
  /**
   * The AI's original suggestion for `inputs`, frozen at build time.
   * Used by the inline editor's "Reset to AI suggestion" button so users
   * can recover the unedited proposal even after multiple manual edits.
   * Same shape as `inputs`; equal by value when the user hasn't edited.
   */
  originalInputs: SchemaInput
  /** Did the user enable this proposal in the audit list? Default: true. */
  enabled: boolean
  /** Hash of the source content the AI saw — drives `snapshot diff`. */
  sourceHash: string
  /** AI confidence 0-1; surfaced as a small badge in the UI. */
  confidence: number
  /** Single-sentence rationale from the AI. */
  rationale: string
  /** Lower-confidence fallback path: AI failed; user should review/disable. */
  aiError?: string
}

/**
 * Result shape we accept from `buildSchemaDetectPrompt`. Loosely typed because
 * AI might omit fields or include extras — we normalize defensively.
 */
export interface SchemaDetectAiResult {
  kind?: string
  confidence?: number
  rationale?: string
  inputs?: Record<string, unknown>
}

const ALLOWED_KINDS: ReadonlyArray<SchemaKind> = [
  "Article",
  "Product",
  "LocalBusiness",
  "FAQPage",
  "Organization",
]

function s(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

function n(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function arr<T>(value: unknown, mapper: (item: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) return []
  const out: T[] = []
  for (const item of value) {
    const mapped = mapper(item)
    if (mapped !== undefined) out.push(mapped)
  }
  return out
}

/**
 * Names AI sometimes emits as a placeholder when it can't find a real
 * brand on the page. Translating these literally produces meaningless
 * JSON-LD across locales (`"Organization"` → 「組織」 → "Organisatie"),
 * so we treat them as missing-value sentinels and fall back to the
 * brand name derived from the project's hostname.
 *
 * Lowercased for the comparison.
 */
const GENERIC_ORG_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "organization",
  "organisation",
  "site",
  "website",
  "company",
  "brand",
])

/**
 * Reject a generic placeholder org-like name from the AI and pick
 * the first usable fallback instead. Shared by Organization.name and
 * Article.publisher.name — both fields are "who publishes this?"
 * slots where AI defaults like "Site" / "Organization" survive into
 * JSON-LD and then get translated into 4 different generic words
 * across 4 locales ("Site" → "サイト" → "Siteniz" …), polluting the
 * structured data.
 *
 * Returns `undefined` only when the AI gave a placeholder AND every
 * fallback was empty — caller decides the literal-string safety net.
 *
 * Order semantics: we return the first non-empty fallback in the
 * order callers pass them. That lets each call site encode its own
 * priority (Organization wants page-title before brand; Article's
 * publisher field has no page-level identity, so brand wins).
 */
export function resolveOrgLikeName(
  aiName: string | undefined,
  ...fallbacks: (string | null | undefined)[]
): string | undefined {
  const trimmed = aiName?.trim()
  if (trimmed && !GENERIC_ORG_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    return trimmed
  }
  for (const fb of fallbacks) {
    const candidate = s(fb)
    if (candidate) return candidate
  }
  return undefined
}

/**
 * Convert an arbitrary AI JSON blob into a typed SchemaInput for the chosen
 * kind. We default missing required fields to safe placeholders so the
 * generated JSON-LD always parses — the user can refine in manual mode if
 * needed.
 *
 * For Organization, `fallback.brandName` (when supplied) takes precedence
 * over the literal "Organization" placeholder so we never emit nonsense
 * generic names that would then be translated into 4 different generic
 * words in 4 different languages.
 */
export function aiInputsToSchemaInput(
  kind: SchemaKind,
  raw: Record<string, unknown> | undefined,
  fallbackUrl: string,
  defaultLanguage: string,
  fallback: {
    title?: string | null
    description?: string | null
    brandName?: string | null
    /**
     * Deterministic image URL extracted from the canvas / CMS in the
     * scan step. Wins over the AI's own `image` only when the AI
     * omitted one — the AI rarely "sees" image content (we don't ship
     * binary), so when it returns an image string at all it's usually
     * a copy of a URL it found in the bodyText, which we already
     * captured. Either source is preserved when both are non-empty.
     */
    image?: string | null
  } = {},
): SchemaInput {
  const x = raw ?? {}
  const canonicalUrl = s(x.canonicalUrl) ?? s(x.url) ?? fallbackUrl
  const description = s(x.description) ?? fallback.description ?? undefined
  // Image resolution chain: AI value → scan-captured URL → undefined.
  // We accept the AI's choice when it has one (it might be a
  // contextually richer pick — e.g. picking a body figure over a
  // header logo) but fall back to deterministic extraction otherwise.
  const image = s(x.image) ?? s(fallback.image)

  switch (kind) {
    case "Article": {
      // Publisher.name suffers the same generic-placeholder bug as
      // Organization.name (AI returns "Site"/"Organization" which
      // then gets translated 4 different ways). We apply the same
      // rejection + brand-name fallback. There's no page-level
      // signal for "who is the publisher of this article" — the
      // entire site shares one publisher — so brandName is the only
      // sensible fallback before the literal "Site" safety net.
      const aiPublisher = s(x.publisher) ?? s(x.publisherName)
      const publisherName =
        resolveOrgLikeName(aiPublisher, fallback.brandName) ?? "Site"

      // Cross-field contamination guard: AI sometimes hallucinates
      // the brand name into the author field (observed in the wild:
      // "Importing Content" article got `author = "Your Site"`,
      // which then survived translation untouched as a proper noun
      // across all locales). A brand isn't a person; the safest
      // recovery is to drop it and use our generic editorial
      // placeholder. The brand-name fallback only triggers when
      // brandName is non-empty and the AI value matches it
      // (case-insensitive); a real author whose name happens to
      // match the brand exactly is an extreme edge case we accept.
      const aiAuthor = s(x.author) ?? s(x.authorName)
      const brandLower = fallback.brandName?.trim().toLowerCase()
      const aiAuthorMatchesBrand =
        !!brandLower &&
        !!aiAuthor &&
        aiAuthor.trim().toLowerCase() === brandLower
      const authorName =
        aiAuthor && !aiAuthorMatchesBrand ? aiAuthor : "Editorial Team"

      const out: ArticleInput = {
        kind: "Article",
        canonicalUrl,
        language: defaultLanguage,
        headline:
          s(x.headline) ?? s(x.title) ?? s(x.name) ?? fallback.title ?? "Untitled",
        description,
        image,
        authorName,
        publisherName,
        publisherLogo: s(x.publisherLogo) ?? s(x.logoUrl),
        datePublished:
          s(x.datePublished) ?? s(x.publishedDate) ?? new Date().toISOString().slice(0, 10),
        dateModified: s(x.dateModified),
      }
      return out
    }
    case "Product": {
      const out: ProductInput = {
        kind: "Product",
        canonicalUrl,
        language: defaultLanguage,
        name: s(x.name) ?? s(x.title) ?? fallback.title ?? "Product",
        description,
        image,
        sku: s(x.sku),
        brand: s(x.brand),
        price: n(x.price),
        priceCurrency: s(x.currency) ?? s(x.priceCurrency),
      }
      return out
    }
    case "LocalBusiness": {
      const out: LocalBusinessInput = {
        kind: "LocalBusiness",
        canonicalUrl,
        language: defaultLanguage,
        name:
          s(x.businessName) ?? s(x.name) ?? fallback.title ?? "Business",
        description,
        image,
        telephone: s(x.telephone) ?? s(x.phone),
        streetAddress: s(x.streetAddress),
        addressLocality: s(x.city) ?? s(x.addressLocality),
        addressRegion: s(x.region) ?? s(x.addressRegion),
        postalCode: s(x.postalCode) ?? s(x.zip),
        addressCountry: s(x.countryIso) ?? s(x.addressCountry) ?? s(x.country),
      }
      return out
    }
    case "FAQPage": {
      const questions = arr(x.questions, (item) => {
        if (typeof item !== "object" || item === null) return undefined
        const q = s((item as Record<string, unknown>).question)
        const a = s((item as Record<string, unknown>).answer)
        if (!q || !a) return undefined
        return { question: q, answer: a }
      })
      const out: FaqPageInput = {
        kind: "FAQPage",
        canonicalUrl,
        language: defaultLanguage,
        questions:
          questions.length > 0
            ? questions
            : [
                {
                  question:
                    fallback.title ?? "What is this page about?",
                  answer:
                    fallback.description ?? "(No FAQ content yet — edit in manual mode.)",
                },
              ],
      }
      return out
    }
    case "Organization": {
      // Resolve the name with placeholder rejection: AI placeholders
      // like "Organization" / "Site" are treated as missing, falling
      // through to title → brand-name fallback → the literal as a
      // last resort. The literal is preserved at the very end purely
      // so the JSON-LD parses; the buildProposal layer above will
      // also force confidence/enabled to safe defaults for this case.
      // Page title outranks brandName — a single Organization page
      // might intentionally surface a sub-brand the hostname can't
      // capture (see Organization tests).
      const resolvedName =
        resolveOrgLikeName(
          s(x.name),
          fallback.title,
          fallback.brandName,
        ) ?? "Organization"
      const out: OrganizationInput = {
        kind: "Organization",
        canonicalUrl,
        language: defaultLanguage,
        name: resolvedName,
        description,
        url: s(x.url) ?? canonicalUrl,
        logo: s(x.logoUrl) ?? s(x.logo),
        sameAs: arr(x.sameAs, (v) => s(v)),
      }
      return out
    }
  }
}

/**
 * Coerce an AI-returned `kind` string into our typed enum. Falls back to
 * Article (the most common content kind) when the AI returns something
 * unrecognised, but flags low confidence so the UI shows a warning.
 */
export function normalizeKind(value: unknown): {
  kind: SchemaKind
  confident: boolean
} {
  const v = typeof value === "string" ? value.trim() : ""
  for (const k of ALLOWED_KINDS) {
    if (v === k || v.toLowerCase() === k.toLowerCase()) {
      return { kind: k, confident: true }
    }
  }
  // Common AI synonyms.
  if (/blog|news|post|tutorial|guide/i.test(v)) return { kind: "Article", confident: true }
  if (/store|shop|sale/i.test(v)) return { kind: "Product", confident: true }
  if (/restaurant|cafe|store|business/i.test(v)) return { kind: "LocalBusiness", confident: true }
  if (/^faq/i.test(v) || /q.?and.?a/i.test(v)) return { kind: "FAQPage", confident: true }
  if (/about|home|brand|company/i.test(v)) return { kind: "Organization", confident: true }
  return { kind: "Article", confident: false }
}

export interface BuildProposalOptions {
  /**
   * Site-wide brand-name fallback for the Organization schema's `name`
   * field when the AI couldn't find a real one on the page. See
   * {@link aiInputsToSchemaInput} for the resolution chain.
   */
  brandName?: string | null
}

/**
 * Build a complete SchemaProposal from a ScannedPage + AI JSON response.
 * Pure function: never throws. If anything is unparseable, returns a low-
 * confidence Article fallback the user can review or disable.
 *
 * Two domain-specific guards run after the AI response is parsed:
 *
 *   1. **Collection landing safety net**: if the page is a
 *      `collectionLanding` (e.g. `/blog` listing CMS articles below)
 *      and the AI insisted on Article anyway, we force `enabled: false`
 *      and downgrade confidence — the AI's pick would have
 *      duplicated the children's headlines at the parent URL and Google
 *      treats that as canonical confusion. The proposal still appears
 *      in the audit list (so users keep visibility) but is unchecked
 *      with an explicit rationale.
 *
 *   2. **Brand-name fallback**: passed through to
 *      {@link aiInputsToSchemaInput} so Organization proposals that
 *      lacked a name on the page get the project's brand instead of
 *      the literal placeholder "Organization".
 */
export function buildProposal(
  page: ScannedPage,
  aiJson: SchemaDetectAiResult | null,
  defaultLanguage: string,
  options: BuildProposalOptions = {},
): SchemaProposal {
  const sourceHash = hashPageContent(page)
  const fallbackContent = {
    title: page.content.title,
    description: page.content.description,
    brandName: options.brandName ?? null,
    image: page.content.image ?? null,
  }

  if (!aiJson) {
    const fallback = aiInputsToSchemaInput(
      "Article",
      undefined,
      page.url,
      defaultLanguage,
      fallbackContent,
    )
    return {
      pageId: page.id,
      pageLabel: page.label,
      url: page.url,
      kind: "Article",
      inputs: fallback,
      originalInputs: fallback,
      enabled: false,
      sourceHash,
      confidence: 0,
      rationale: "AI response missing — defaulted to Article (review manually).",
      aiError: "no-response",
    }
  }

  const kindResult = normalizeKind(aiJson.kind)
  let confidence = clampConfidence(aiJson.confidence) * (kindResult.confident ? 1 : 0.5)
  const inputs = aiInputsToSchemaInput(
    kindResult.kind,
    aiJson.inputs,
    page.url,
    defaultLanguage,
    fallbackContent,
  )

  // Fail closed for launch automation: below 70% the plugin should
  // still surface the proposal, but not include it in one-click install
  // until the user explicitly opts in.
  let enabled = confidence >= 0.7
  let rationale =
    typeof aiJson.rationale === "string" && aiJson.rationale.trim()
      ? aiJson.rationale.trim()
      : `Defaulted to ${kindResult.kind}.`

  // Collection-landing safety net. We do this in code (not in the
  // prompt only) because even with the prompt directive the AI
  // sometimes ignores the hint when the H1 visible on the page is
  // very compelling. Failing closed protects the user's SEO from a
  // "duplicate headline at parent + child URL" footgun.
  if (page.collectionLanding && kindResult.kind === "Article") {
    enabled = false
    confidence = Math.min(confidence, 0.3)
    rationale = `${page.rawPath} is a collection landing page listing ${page.collectionLanding.itemCount} ${page.collectionLanding.collectionName} items below — Article here would duplicate those items' headlines. Disabled by default; switch kind to Organization or skip if unsure.`
  }

  return {
    pageId: page.id,
    pageLabel: page.label,
    url: page.url,
    kind: kindResult.kind,
    inputs,
    originalInputs: inputs,
    enabled,
    sourceHash,
    confidence,
    rationale,
  }
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Render a single proposal into a JSON-LD string. Just a convenience wrapper
 * around `buildSchema` + `serializeJsonLd` so callers don't have to import
 * both.
 */
export function proposalToJsonLd(proposal: SchemaProposal): string {
  return schemaInputToJsonLd(proposal.inputs)
}

/** Render any `SchemaInput` (including a translated override) as JSON-LD. */
export function schemaInputToJsonLd(input: SchemaInput): string {
  return serializeJsonLd(buildSchema(input))
}

/**
 * Human-readable primary text for a schema input — used in the audit
 * preview so designers can verify translations without reading raw
 * JSON-LD. Returns the field most likely to differ across locales.
 */
export function schemaPrimaryText(input: SchemaInput): string {
  switch (input.kind) {
    case "Article":
      return [input.headline, input.description].filter(Boolean).join("\n")
    case "Product":
      return [input.name, input.description].filter(Boolean).join("\n")
    case "LocalBusiness":
      return [input.name, input.description].filter(Boolean).join("\n")
    case "FAQPage":
      return input.questions
        .map((q) => `${q.question}\n${q.answer}`)
        .join("\n\n")
    case "Organization":
      return [input.name, input.description].filter(Boolean).join("\n")
    default:
      return ""
  }
}
