import { JA_GLYPH_PROMPT_SAMPLES } from "../locale-script/prompt-samples"

/**
 * Prompt templates for AI-assisted multilingual SEO meta generation.
 *
 * These prompts encode language-specific SEO heuristics that generic AI tools
 * miss. They are exposed as functions (not raw strings) so consumers can
 * compose them safely without string-concat bugs.
 */

export interface MetaPromptInput {
  pageContext: string
  productOrPageType: string
  targetLanguage: string
  targetRegion: string
  brandVoice?: string
  primaryKeyword?: string
}

export interface MetaPromptOutput {
  system: string
  user: string
}

const LANGUAGE_RULES: Record<string, string> = {
  "en": "Title 50–60 chars. Write in active voice. Avoid em dashes.",
  "de": "Title 55 chars max. Avoid compound words longer than 20 chars. Use formal Sie unless brandVoice says otherwise.",
  "ja": "Title 30 chars max (full-width). Avoid literal English translations; rewrite for Japanese reading patterns. Use 「」 for product names.",
  "zh-CN": "Title 30 chars max (Chinese chars). Avoid 'free direct translation'; rewrite for native idioms. Use Simplified characters only.",
  "zh-TW": "Title 30 chars max (Chinese chars). Use Traditional characters. Use Taiwan-specific terminology (e.g. 軟體 not 软件).",
  "fr": "Title 60 chars max. Use 'vous' form. Avoid English loanwords when a French equivalent exists.",
  "es": "Title 60 chars max. Use neutral Spanish unless region is specified. Avoid voseo.",
  "es-MX": "Title 60 chars max. Use Mexican Spanish vocabulary. Currency in MXN format.",
  "es-ES": "Title 60 chars max. Use Castilian Spanish. Use vosotros where applicable.",
  "pt-BR": "Title 60 chars max. Use Brazilian Portuguese. Avoid Portugal-specific vocabulary.",
  "ko": "Title 30 chars max (full-width). Use 합니다 form by default.",
  "ar": "Title 60 chars max. Right-to-left composition. Use Modern Standard Arabic unless region is specified.",
  "ru": "Title 60 chars max. Avoid English loanwords when a Russian equivalent is established.",
  "it": "Title 60 chars max. Use 'tu' for casual brands, 'Lei' for enterprise.",
}

function rulesFor(language: string): string {
  if (LANGUAGE_RULES[language]) return LANGUAGE_RULES[language]
  const [base] = language.split("-")
  return LANGUAGE_RULES[base] ?? "Title 50–60 chars. Description 140–160 chars. Native, not translated."
}

/**
 * Strict, target-locale-aware script-purity rules that go into every
 * translation prompt's "LANGUAGE-SCRIPT INTEGRITY" block.
 *
 * Why this exists as its own helper (instead of repeating a paragraph
 * in every prompt): the post-call validator
 * ({@link validateLocaleScript} in locale-script) hard-rejects 5 specific failure
 * modes — each one corresponds to a real production bug we shipped:
 *
 *   1. Cross-CJK pollution (hangul in JA, kana in KO, etc.) — the AI
 *      conflated locales mid-batch.
 *   2. Cyrillic mid-prose ("ユーザー視点の сайте design を") — the AI
 *      bled Russian / Bulgarian glyphs into a Japanese sentence.
 *   3. Simplified-Chinese-only kanji in JA (诀 / 网 / 选 / 决) — the AI
 *      auto-converted JP shinjitai to mainland forms.
 *   4. Lowercase English loanwords mid-prose ("design", "launch",
 *      "identity") — the AI failed to transliterate to katakana /
 *      hangul.
 *   5. Brand names that should stay Latin — the AI over-translated
 *      LYNIQ / Notion / Figma into native-script gibberish.
 *
 * Each rule below tells the model what to do for one failure mode,
 * with concrete BEFORE/AFTER examples. We've found that listing
 * specific glyphs or words (not just "be careful with scripts") is
 * the difference between a 90% pass rate and a 99% pass rate.
 *
 * Locale-specific output: we customize the rules for `ja` / `ko` /
 * `zh*` because those have different "what's allowed" semantics.
 * Latin-target locales (en / fr / es / …) get a no-op string —
 * there's no contamination signal to police when the target is
 * already Latin.
 *
 * Pure.
 */
function scriptIntegrityRules(targetLanguage: string): string {
  const base = (targetLanguage.split("-")[0] || targetLanguage).toLowerCase()

  if (base === "ja") {
    const glyphExamples = JA_GLYPH_PROMPT_SAMPLES.map(
      (s) => `${s.expected} (not ${s.wrong})`,
    ).join(", ")
    return `LANGUAGE-SCRIPT INTEGRITY (CRITICAL — output is hard-rejected if violated):
1. ALL prose MUST be in Japanese script (hiragana / katakana / 漢字 shinjitai). The post-call validator rejects:
   - Hangul characters (한국어) — never appear in modern JP.
   - Cyrillic characters (сайте, дизайн) — never appear in JP.
   - Simplified-Chinese / wrong-form kanji (OpenCC-derived check). Examples — use the JP form: ${glyphExamples}.
2. English loanwords MUST be transliterated to katakana, NOT left as lowercase Latin:
   - "design" → デザイン (NOT "design")
   - "launch" → ローンチ (NOT ".launch" or "launch")
   - "identity" → アイデンティティ (NOT "identity")
   - "responsive design" → レスポンシブデザイン (NOT "Responsive Design")
3. Brand names KEEP Latin (this is the ONLY legitimate Latin in JP output):
   - "LYNIQ", "Notion", "Figma", "iPhone" — pass through verbatim.
   - Optionally surround with 「...」 corner brackets when adjacent to JP text: 「LYNIQ」のデザイン.
4. Short uppercase abbreviations (URL, SEO, AI, API) MAY remain Latin — they're standard in JP tech prose.`
  }

  if (base === "ko") {
    return `LANGUAGE-SCRIPT INTEGRITY (CRITICAL — output is hard-rejected if violated):
1. ALL prose MUST be in Korean script (hangul, with occasional hanja). The post-call validator rejects:
   - Hiragana / katakana characters — never appear in modern KO.
   - Cyrillic characters — never appear in KO.
2. English loanwords MUST be transliterated to hangul, NOT left as lowercase Latin:
   - "identity" → 아이덴티티 (NOT "identity")
   - "design" → 디자인 (NOT "design")
   - "launch" → 런칭 (NOT "launch")
3. Brand names KEEP Latin (this is the ONLY legitimate Latin in KO output):
   - "LYNIQ", "Notion", "Figma" — pass through verbatim.
4. Short uppercase abbreviations (URL, SEO, AI) MAY remain Latin.`
  }

  if (base === "zh") {
    return `LANGUAGE-SCRIPT INTEGRITY (CRITICAL — output is hard-rejected if violated):
1. ALL prose MUST be in Chinese characters (Simplified for zh-CN, Traditional for zh-TW). The post-call validator rejects:
   - Hangul / hiragana / katakana characters — never appear in CN/TW.
   - Cyrillic characters — never appear in CN/TW.
2. English loanwords SHOULD be translated, NOT left as lowercase Latin:
   - "design" → 设计 / 設計 (NOT "design")
   - "launch" → 推出 / 發布 (NOT "launch")
3. Brand names KEEP Latin: "LYNIQ", "Notion", "Figma" — pass through verbatim.
4. Short uppercase abbreviations (URL, SEO, AI, API) MAY remain Latin.`
  }

  if (base === "ar") {
    return `LANGUAGE-SCRIPT INTEGRITY (CRITICAL): All prose in Arabic script. Brand names may remain Latin. RTL layout — preserve word order semantics.`
  }

  if (base === "ru" || base === "uk" || base === "bg") {
    return `LANGUAGE-SCRIPT INTEGRITY (CRITICAL): All prose in Cyrillic script. Brand names may remain Latin.`
  }

  // Latin-target locales — no contamination check fires post-call,
  // so the prompt also has nothing locale-specific to enforce.
  return ""
}

export function buildMetaPrompt(input: MetaPromptInput): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const voice = input.brandVoice
    ? `Brand voice: ${input.brandVoice}.`
    : "Brand voice: confident, concise, helpful."
  const keyword = input.primaryKeyword
    ? `Primary keyword to include naturally (do NOT stuff): "${input.primaryKeyword}".`
    : ""

  const system = `You are a senior multilingual SEO copywriter who writes natively in ${input.targetLanguage} (${input.targetRegion}). You never literally translate; you rewrite for native search and AI-search behaviour. You optimize for both Google and AI engines (ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews).

LANGUAGE RULES: ${rules}
${voice}
${keyword}

OUTPUT FORMAT — return ONLY one complete, valid JSON object (must end with a closing brace), no prose, no markdown fences:
{
  "title": "...",
  "metaDescription": "...",
  "ogTitle": "...",
  "ogDescription": "...",
  "twitterTitle": "...",
  "twitterDescription": "...",
  "primaryKeyword": "...",
  "secondaryKeywords": ["...", "..."]
}
Use at most 3 short secondaryKeywords. If running out of space, omit secondaryKeywords entirely but still close the JSON.`

  const user = `Page type: ${input.productOrPageType}

Source content (default locale):
"""
${input.pageContext}
"""

Generate the SEO meta in ${input.targetLanguage}.`

  return { system, user }
}

export type MetaSetupSuggestField =
  | "pageType"
  | "primaryKeyword"
  | "brandVoice"

export interface MetaSetupSuggestPromptInput {
  field: MetaSetupSuggestField
  pageContext: string
  /** Existing value for optimize mode. */
  draft?: string
  /** BCP-47 / schema language for the project's default locale. */
  targetLanguage: string
}

const META_PAGE_TYPES = [
  "Landing page",
  "Blog post",
  "Product page",
  "About page",
  "Contact page",
  "FAQ page",
  "Pricing page",
  "Documentation page",
  "Legal page",
] as const

/**
 * Prompt for Step 1 setup fields (page type, keyword, brand voice) before
 * per-locale meta generation. One field per call keeps outputs short and
 * parseable.
 */
export function buildMetaSetupSuggestPrompt(
  input: MetaSetupSuggestPromptInput,
): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const hasDraft = !!input.draft?.trim()
  const mode = hasDraft ? "OPTIMIZE" : "GENERATE"

  const fieldSpec =
    input.field === "pageType"
      ? `Pick exactly ONE page type from this list (copy the label verbatim): ${META_PAGE_TYPES.join(", ")}, or "Other" if none fit.`
      : input.field === "primaryKeyword"
        ? "A single primary SEO keyword phrase (2–6 words). Concrete noun phrase, not a sentence. No quotes."
        : "A short brand-voice line (under 120 chars): tone + vocabulary hints for SEO copy. No bullet list."

  const jsonKey = input.field

  const system = `You help designers prepare multilingual SEO meta generation in Framer.

MODE: ${mode}.
${
  hasDraft
    ? "Rewrite the DRAFT to be sharper while preserving intent."
    : "No draft — infer from PAGE CONTEXT only. Do not invent facts not supported by the text."
}

FIELD: ${input.field}.
${fieldSpec}

LANGUAGE: write in ${input.targetLanguage}.
LANGUAGE RULES: ${rules}

OUTPUT — return ONLY valid JSON, no markdown fences:
{ "${jsonKey}": "..." }`

  const user = `PAGE CONTEXT:
"""
${input.pageContext}
"""
${hasDraft ? `\nDRAFT:\n"""\n${input.draft!.trim()}\n"""` : ""}

Fill the ${input.field} field.`

  return { system, user }
}

/**
 * Schema-detection prompt input. Drives the "AI scans your site and proposes
 * the right schema for every page" experience. We feed the AI a short,
 * structured snapshot of one page (URL, headings, sample body) and ask it
 * to:
 *   1) Pick the most appropriate schema.org kind from a fixed allow-list.
 *   2) Fill the matching SchemaInput fields from the content.
 *   3) Justify the pick in one sentence so the user can audit.
 *
 * We constrain the kind list explicitly because schema.org has hundreds of
 * types and unconstrained selection produces obscure picks the user can't
 * validate. The five we accept also match what our generator can render.
 */
export interface SchemaDetectPromptInput {
  url: string
  rawPath: string
  isHomepage: boolean
  source: "static" | "cms"
  collectionName?: string
  title: string | null
  description: string | null
  headings: string[]
  bodyText: string
  publishedDate?: string
  /**
   * Set when this static page is the parent of CMS detail pages — i.e.
   * a Collection-list landing. Without this hint, AI almost always
   * proposes Article (because the page renders item titles via the
   * Collection List preview) and the resulting JSON-LD duplicates the
   * actual articles' headlines. The prompt uses this to steer toward
   * Organization (or low-confidence Article) instead.
   */
  isCollectionLanding?: { collectionName: string; itemCount: number }
  /**
   * Brand-name fallback for the project (derived from publish hostname).
   * Used by the prompt to prefer a real brand string over the literal
   * type word "Organization" when the page yields no explicit name.
   * Null/undefined when no brand could be inferred.
   */
  brandFallbackName?: string | null
  /**
   * Best-guess hero image URL extracted deterministically from the
   * canvas / CMS in the scan step. Surfaced to the model as a hint
   * so it can decide whether to echo it into the proposed inputs
   * (Article / Product / LocalBusiness all benefit from a real
   * `image` for Google rich results). The model never invents a
   * URL; the deterministic value is also threaded through
   * `aiInputsToSchemaInput`'s fallback chain in case the model
   * silently drops the field.
   */
  image?: string | null
}

/**
 * Schema-translation prompt input. After the user accepts the AI's proposed
 * schemas in the default locale, we re-run the AI per non-default locale to
 * REWRITE each text-bearing field (headline, description, FAQ Q&A, etc.)
 * natively. Without this step the JSON-LD's `inLanguage: "ja-JP"` would
 * still contain English `headline` — which is misleading to AI engines.
 *
 * We pass the kind + inputs as JSON so the model emits a parallel JSON
 * structure with translated values.
 */
export interface SchemaTranslatePromptInput {
  kind: string
  inputs: unknown
  targetLanguage: string
  brandVoice?: string
  retryReason?: "ai-error" | "mixed-script" | "no-content-change"
}

export function buildSchemaDetectPrompt(
  input: SchemaDetectPromptInput,
): MetaPromptOutput {
  const ctx: string[] = [
    `URL: ${input.url}`,
    `Path: ${input.rawPath}`,
    `Source: ${input.source}${input.collectionName ? ` (${input.collectionName})` : ""}`,
    `Is homepage: ${input.isHomepage ? "yes" : "no"}`,
  ]
  if (input.isCollectionLanding) {
    // Phrased as a strong directive — Article is so frequently
    // (incorrectly) chosen for these pages that a soft hint isn't
    // enough; we tell the model exactly why Article is wrong here.
    ctx.push(
      `Page kind: COLLECTION LANDING (lists ${input.isCollectionLanding.itemCount} ${input.isCollectionLanding.collectionName} items at children of this URL)`,
    )
  }
  if (input.brandFallbackName) {
    // Sneak the brand name into the user-visible context too — some
    // models attend to the user message more than the system rules.
    ctx.push(`Brand fallback name: ${input.brandFallbackName}`)
  }
  if (input.title) ctx.push(`Title: ${input.title}`)
  if (input.description) ctx.push(`Description: ${input.description}`)
  if (input.publishedDate) ctx.push(`Published: ${input.publishedDate}`)
  if (input.image) ctx.push(`Hero image: ${input.image}`)
  if (input.headings.length > 0) {
    ctx.push(`Headings: ${input.headings.slice(0, 8).join(" / ")}`)
  }

  const system = `You are an SEO/AEO expert. Given a single page from a website, pick the schema.org kind that best matches what the page IS, and extract the fields needed to render that schema.

ALLOWED KINDS (pick exactly ONE):
- Article — long-form text content: blog post, news, guide, tutorial.
- Product — an item the site sells with price/brand. Includes services if priced.
- LocalBusiness — physical location with address: store, restaurant, agency, clinic.
- FAQPage — page whose primary purpose is Q&A pairs. Detect by 3+ heading-then-paragraph patterns asking questions.
- Organization — homepage or About page that establishes the entity itself.

DECISION RULES:
- Homepage usually maps to Organization. If it's clearly a single-product landing page, Product is acceptable.
- CMS detail pages (the "source: cms" hint) usually map to Article (blog) or Product (catalog) — use the collection name as the strongest signal.
- About/Contact/Privacy pages map to Organization, unless content is heavily Q&A → FAQPage.
- COLLECTION LANDING pages (the "Page kind: COLLECTION LANDING" hint) MUST NOT be Article — the actual articles will be tagged separately at their own URLs. Prefer Organization (treat the page as a section of the brand) or set confidence very low (≤0.3) so a human reviews. Never repeat an Article headline that lives at a child URL.
- If you can't confidently fit one of the five, pick whichever is closest and lower the confidence score.

SITE-IDENTITY FIELDS — DO NOT extract these per-page. They are derived once for the entire site separately and injected at render time:
- Article.publisher.* (do not output a publisher object)
- Organization.name (do not output a name; we set it from site identity)
- Organization.logoUrl (do not output)
- Organization.url (do not output)

PER-PAGE AUTHOR — only output Article.author if the page CLEARLY shows a real human byline (e.g. "By Jane Smith" near the headline). If absent or ambiguous, omit the field; the site default will fill in.

OUTPUT FORMAT — return ONLY valid JSON, no prose:
{
  "kind": "Article" | "Product" | "LocalBusiness" | "FAQPage" | "Organization",
  "confidence": 0.0-1.0,
  "rationale": "one short sentence",
  "inputs": {
    // Populate ONLY the fields for the chosen kind:
    // Article: { canonicalUrl, headline, description, image?, author?, datePublished? }   // no publisher
    // Product: { canonicalUrl, name, description?, image?, price?, currency?, brand? }
    // LocalBusiness: { canonicalUrl, businessName, image?, streetAddress?, city?, countryIso?, telephone? }
    // FAQPage: { canonicalUrl, questions: [{question, answer}, ...] (3-6 items) }
    // Organization: { canonicalUrl, description?, sameAs?: [...] }                 // no name/url/logo
  }
}

ALWAYS set canonicalUrl to the URL given in the input.
NEVER fabricate addresses, prices, or telephone numbers — leave the field absent if not present in the source.
IMAGE: when a "Hero image" line appears in the input, copy that URL verbatim into the chosen kind's "image" field (Article / Product / LocalBusiness only; Organization gets its logo from site identity, not per-page). Never invent or modify image URLs; if no Hero image was provided, omit the field.
For FAQPage: if you don't see explicit Q&A in the body, generate 3-5 plausible Q&A pairs in the page's language based on the topic — these will be reviewed by a human.`

  const user = `Page snapshot:
${ctx.join("\n")}

Body sample (truncated):
"""
${input.bodyText || "(no extracted text — page is mostly images/components)"}
"""

Pick the best schema kind and fill its inputs. Use the URL above as canonicalUrl exactly as given.`

  return { system, user }
}

export function buildSchemaTranslatePrompt(
  input: SchemaTranslatePromptInput,
): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const voice = input.brandVoice
    ? `Brand voice: ${input.brandVoice}.`
    : "Brand voice: confident, concise, native-sounding."

  const retryBlock = input.retryReason
    ? `\nRETRY CONTEXT — the previous output was rejected for "${input.retryReason}".
- If "${input.retryReason}" is "no-content-change", you copied English text unchanged. Rewrite EVERY human-readable sentence into ${input.targetLanguage}; do not leave English prose in translated fields.
- If "${input.retryReason}" is "mixed-script", the output used the wrong writing system. Follow the script rules below exactly.
- If "${input.retryReason}" is "ai-error", the previous response was missing/invalid JSON. Return a complete JSON object with every input key present.\n`
    : ""

  const system = `You localize a JSON-LD payload from English into ${input.targetLanguage}. You REWRITE for native readers, not literally translate. The output JSON must have the EXACT same shape and keys as the input — only translate values that are human-readable text.

DO NOT translate:
- URLs (canonicalUrl, logoUrl, sameAs entries)
- Currency codes ("USD", "EUR")
- ISO country/language codes ("US", "DE")
- Numeric prices
- Dates in ISO format
- Brand names
- Empty strings — keep them empty

DO translate:
- Headlines, descriptions, names of conceptual things (e.g. product feature names, FAQ questions/answers, business taglines)
- Real per-page author bylines (e.g. "By Jane Smith" → "ジェーン・スミス著") if present
- Every complete English sentence in headline/name/description/question/answer fields. Never copy these sentences unchanged unless they are a brand name, URL, code, number, or ISO value.

NOTE: Site-identity fields (publisher.name, organization name, default editorial bylines) are translated separately at the site level and will be injected at render time. If you see empty values for those fields in the input, leave them empty in the output — do not invent values.

${scriptIntegrityRules(input.targetLanguage) || `LANGUAGE-SCRIPT INTEGRITY: Output text must be in the script of ${input.targetLanguage}. Do NOT mix unrelated scripts.`}
${retryBlock}
COMPLETENESS RULES:
- Return every key from the input JSON. Do not omit description, headline, name, questions, or answers.
- Preserve arrays with the same number of items and the same item order.
- Preserve empty strings as empty strings.
- If a field is human-readable prose, translate/rewrite it even when it is short.

LANGUAGE RULES: ${rules}
${voice}

OUTPUT FORMAT — return ONLY the same JSON shape with translated string values. No prose, no explanation.`

  const user = `Schema kind: ${input.kind}
Source JSON (English):
${JSON.stringify(input.inputs, null, 2)}

Translate text values to ${input.targetLanguage}. Keep all keys, structure, and non-text values identical.`

  return { system, user }
}

/**
 * Site-identity extraction prompt input. V2 Phase 0 — runs ONCE per
 * scan against a small set of identity-rich pages (homepage, about,
 * footer-y content). Output drives `Article.publisher`,
 * `Article.author` (default), and `Organization.*` fields for the
 * entire site, so the AI gets one shot to set the brand correctly.
 *
 * See `docs/SCHEMA-ARCHITECTURE-V2.md` §4.2 for context.
 */
export interface SiteIdentityPromptInput {
  /** 1–3 representative pages, in priority order (homepage first). */
  pages: ReadonlyArray<{
    path: string
    title: string | null
    bodyText: string
  }>
  /**
   * Hostname-derived brand fallback (e.g. `acme-store.framer.website`
   * → `Acme Store`). Used as a soft hint for the model and as a
   * deterministic fallback if the AI returns a generic placeholder.
   */
  brandFallbackName: string | null
  /** Production hostname, for the `publisherUrl` default. */
  hostname: string | null
}

/**
 * Site-identity translation prompt input. V2 Phase 0.5 — runs once
 * per non-default locale to localize the canonical SiteIdentity.
 * Smaller payload than the per-page translate prompt because we
 * only translate user-visible strings.
 */
export interface SiteIdentityTranslatePromptInput {
  brandName: string
  defaultAuthor: string
  organizationDescription?: string
  targetLanguage: string
  brandVoice?: string
}

export function buildSiteIdentityPrompt(
  input: SiteIdentityPromptInput,
): MetaPromptOutput {
  const pageDump = input.pages
    .map(
      (p, i) =>
        `Page ${i + 1} — ${p.path}\nTitle: ${p.title ?? "(untitled)"}\nBody:\n"""\n${p.bodyText.slice(0, 1200)}\n"""`,
    )
    .join("\n\n")

  const fallbackHint = input.brandFallbackName
    ? `Hostname-derived brand fallback (use only if no signal in the pages): "${input.brandFallbackName}"`
    : "No hostname brand fallback available."

  const system = `You extract a website's brand identity from a small set of representative pages. The output drives Schema.org publisher/author fields across the ENTIRE site, so accuracy and consistency are critical — wrong values will appear on every Article in every locale.

OUTPUT FIELDS:
- brandName            REQUIRED. The site's display name as it would appear in a header, logo, or footer. 1–60 chars.
- defaultAuthor        OPTIONAL. A generic byline for articles without a specific named author. If pages show real bylines (real names like "Jane Smith"), OMIT this field — we'll keep our placeholder. 1–60 chars.
- organizationDescription OPTIONAL. A 1–280 char site-level description suitable for Organization.description.
- publisherUrl         OPTIONAL. The canonical site URL ("https://acme.com"). Default: derive from the hostname.
- publisherLogo        OPTIONAL. URL of the site's logo image, if visible in the page content. Never fabricate.
- confidence           REQUIRED, 0.0-1.0. How confident are you the extracted brandName is the actual brand vs. a guess?

REJECTION RULES — never output any of these as brandName:
- "Site", "Website", "Your Site", "Your Website" — these are placeholders.
- "Organization", "Company", "Brand" — these are type words.
- The exact page title (a page is not a brand).
- "Untitled" or empty.
- Lorem ipsum / template content.

If you cannot find a real brand name in the input pages, fall back to the hostname-derived value provided below (set confidence ≤ 0.4). If even that is missing, use "Site" with confidence 0.0 and the user will be prompted to fix it.

OUTPUT FORMAT — return ONLY valid JSON, no prose:
{
  "brandName": "...",
  "defaultAuthor": "..." | null,
  "organizationDescription": "..." | null,
  "publisherUrl": "..." | null,
  "publisherLogo": "..." | null,
  "confidence": 0.0-1.0
}`

  const user = `${fallbackHint}
Hostname: ${input.hostname ?? "(unknown)"}

Representative pages:
${pageDump}

Extract the brand identity. Return JSON.`

  return { system, user }
}

export function buildSiteIdentityTranslatePrompt(
  input: SiteIdentityTranslatePromptInput,
): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const voice = input.brandVoice
    ? `Brand voice: ${input.brandVoice}.`
    : "Brand voice: confident, concise, native-sounding."

  const system = `You localize a brand identity into ${input.targetLanguage}. This is one-time site-level work: the values you produce will appear on EVERY page of the site for this locale, so consistency across the rest of the site's content depends on you nailing it.

DO NOT translate:
- Registered/recognized brand names that are conventionally left in source language (Apple, Sony, Nike, IKEA, …).
- URLs.

DO translate:
- Generic placeholders like "Editorial Team" → "編集チーム".
- The organizationDescription if it's natural prose (not a brand tagline).
- Common-word brand names that DO have an idiomatic equivalent (e.g. "Your Site" → "あなたのサイト" is acceptable since "Your Site" is a placeholder, not a brand).

${scriptIntegrityRules(input.targetLanguage)}

LANGUAGE RULES: ${rules}
${voice}

OUTPUT FORMAT — return ONLY valid JSON with the same keys as the input:
{
  "brandName": "...",
  "defaultAuthor": "...",
  "organizationDescription": "..." | null
}`

  const user = `Source identity (English):
{
  "brandName": "${input.brandName}",
  "defaultAuthor": "${input.defaultAuthor}"${input.organizationDescription ? `,\n  "organizationDescription": ${JSON.stringify(input.organizationDescription)}` : ""}
}

Translate into ${input.targetLanguage}.`

  return { system, user }
}

export interface FaqPromptInput {
  topic: string
  productContext: string
  targetLanguage: string
  numberOfQuestions?: number
}

/**
 * Generate FAQ Q&A pairs in a target language. FAQ schema is the highest-leverage
 * AEO format because ChatGPT/Perplexity directly extract answers from it.
 */
export function buildFaqPrompt(input: FaqPromptInput): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const count = input.numberOfQuestions ?? 6

  const system = `You generate FAQ Q&A pairs that AI search engines (ChatGPT, Perplexity, Claude, Gemini) will cite verbatim. You write natively in ${input.targetLanguage}, never as a translation.

LANGUAGE RULES: ${rules}

QUALITY RULES:
- Each question must be a real question a user would type into an AI assistant.
- Each answer must be 40–80 words. Self-contained. No "see above" references.
- Lead each answer with the direct answer in the first sentence (AI engines truncate).
- Include the product/topic name in at least 3 answers (helps brand citation).

OUTPUT FORMAT — return ONLY valid JSON:
{
  "questions": [
    { "question": "...", "answer": "..." }
  ]
}`

  const user = `Topic: ${input.topic}
Product/page context:
"""
${input.productContext}
"""

Generate ${count} FAQ pairs in ${input.targetLanguage}.`

  return { system, user }
}

/**
 * llms.txt batch translation prompt input.
 *
 * Used when generating per-locale `llms-{locale}.txt` files for a
 * site whose CMS items are missing localized title / summary fields.
 * Mirrors the Schema "AI auto-translate" UX so designers don't have
 * to maintain two mental models.
 *
 * The translation is generation-time only — we do NOT write back to
 * Framer's CMS. The localized strings are stitched into the llms.txt
 * output, the file is downloaded, and the source CMS rows stay
 * exactly as the designer left them. Three reasons:
 *   1. Writing to CMS requires `setItem` permissions on every
 *      collection field, which is invasive for a "generate llms.txt"
 *      action.
 *   2. Designers told us they want to *audit* AI translations before
 *      they become canonical content. Embedding in the file is
 *      reviewable; CMS write-back is silent.
 *   3. The Schema feature parallel: Schema also synthesizes
 *      translations into JSON-LD without touching the original page
 *      content. Same model.
 */
export interface LlmsTranslatePromptInput {
  /** BCP-47 of the target locale, drives LANGUAGE_RULES lookup. */
  targetLanguage: string
  /** Human-readable locale name for the prompt context. */
  targetRegion: string
  /** Optional brand-voice hint, persisted in plugin storage. */
  brandVoice?: string
  /**
   * Items to translate. `id` is opaque (CMS row id) and round-trips
   * through the model so the orchestrator can reconcile output even
   * when the model reorders or drops items. `summary` is optional —
   * not every CMS has a summary field.
   *
   * Capped at ~30 items per call by the orchestrator. Beyond that we
   * batch — see `llms-translate.ts`. The model handles 30 well; at
   * 100+ it starts dropping items silently.
   */
  items: ReadonlyArray<{
    id: string
    title: string
    summary?: string
    /**
     * Optional URL path / CMS slug used only as context. Models get
     * confused by repeated template titles; the path often carries
     * the real topic ("boosting-site-speed...").
     */
    path?: string
  }>
  retryReason?: "mixed-script" | "untranslated" | "parse-failed"
}

/**
 * Build the prompt for batch-translating CMS items into a target
 * locale's title + summary fields.
 *
 * Emits a JSON-array response keyed by the original `id` so the
 * orchestrator can match outputs back to inputs deterministically.
 * The system prompt explicitly forbids URL / brand-name translation
 * (titles like "Project Apollo" must stay "Project Apollo" in fr,
 * but the rest of the title is rewritten natively) and demands the
 * target script (catches passthrough failures the same way the
 * Schema validator does post-call).
 */
export function buildLlmsTranslatePrompt(
  input: LlmsTranslatePromptInput,
): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const voice = input.brandVoice
    ? `Brand voice: ${input.brandVoice}.`
    : "Brand voice: confident, concise, native-sounding."

  const retryBlock = input.retryReason
    ? `\nRETRY CONTEXT — the previous output failed validation for "${input.retryReason}".
- If "${input.retryReason}" is "parse-failed", return ONLY the JSON object shown below. No prose, no markdown, no alternate keys.
- If "${input.retryReason}" is "untranslated", the previous output either copied English unchanged OR omitted an item. Return every input item exactly once, and rewrite every title and summary into ${input.targetLanguage}.
- If "${input.retryReason}" is "mixed-script", the output used the wrong writing system. Follow the script rules exactly. Keep brand names Latin, but translate/transliterate generic words.\n`
    : ""

  const system = `You localize a list of CMS-driven blog/article/product entries from English into ${input.targetLanguage} (${input.targetRegion}). The translations will appear in an llms.txt file consumed by AI search engines (ChatGPT, Perplexity, Claude, Gemini). Quality matters: terse, natural, native-feeling phrasing wins over literal translation.

DO translate:
- Article / product titles (REWRITE for native readers; do not literal-translate)
- One-line summaries
- Every complete English sentence. Never copy an English title or summary unchanged unless it is only a brand name, URL, version number, or code token.
- If multiple inputs have identical or near-identical titles, DO NOT merge, deduplicate, or give them the same translated title. Use the summary and path as topic context to create distinct native titles.
- If the title and path/summary conflict, trust the path + summary as the stronger topic signal and rewrite the title to match the actual item.
- For brand-heavy short titles, keep the brand name but localize the generic words:
  - "Radiant skincare branding" -> ja: "「Radiant」スキンケアブランディング"; ko: "Radiant 스킨케어 브랜딩"; fr: "Identité de marque Radiant Skincare"
  - "Apex clothing Co. rebrand" -> ja: "「Apex Clothing Co.」リブランディング"; ko: "Apex Clothing Co. 리브랜딩"; fr: "Refonte de marque Apex Clothing Co."
  - "Building trust online: the importance of testimonials" -> ja: "オンラインで信頼を築く：お客様の声の重要性"; ko: "온라인 신뢰 구축: 고객 후기의 중요성"; fr: "Renforcer la confiance en ligne : l’importance des témoignages"
  - Do NOT leave generic words like "skincare", "clothing", "branding", "rebrand", "launch", "design", or "identity" as lowercase English unless they are truly part of a registered brand.

DO NOT translate:
- Proper brand names that are already English-Latin and globally recognized (keep "Notion", "Figma", "Stripe" etc. as-is)
- URLs (none should appear in inputs, but defensively: leave any URL unchanged)
- Numeric tokens, version numbers, hashtags
- The "path" field. It is context only and MUST NOT appear in the output.

${scriptIntegrityRules(input.targetLanguage)}
${retryBlock}

LANGUAGE RULES: ${rules}
${voice}

OUTPUT FORMAT — return ONLY a valid JSON object (required by the API). No prose, no markdown fences. The "items" array MUST contain exactly one object per input item, with the same "id" values, in the same order. Items missing from the input must NOT appear in the output. Do NOT output "path". If you cannot translate an item, still return the object but copy the source values verbatim (the orchestrator will flag it).

{
  "items": [
    { "id": "<original id>", "title": "<translated>", "summary": "<translated, omit field if no input summary>" }
  ]
}`

  const user = `Translate the following ${input.items.length} item(s) into ${input.targetLanguage}.

Source items (default-locale, JSON):
${JSON.stringify(input.items, null, 2)}

Return { "items": [ ... ] } — one object per input item, keys "id" / "title" / "summary?" — translated.`

  return { system, user }
}

/**
 * llms.txt site-header translation prompt.
 *
 * Why this exists in addition to {@link buildLlmsTranslatePrompt}:
 * the site name is a brand identifier and should NOT translate
 * (e.g. "LYNIQ" stays "LYNIQ" in every locale), but the site
 * tagline / summary IS user-visible prose and the file becomes
 * incoherent when it contradicts the locale header (we shipped
 * a build where the en-US file said `Language: en` but the
 * tagline was Chinese — first-day bug). Translating both in one
 * prompt with explicit "do/don't translate" rules avoids that.
 *
 * Single-shot: one AI call per non-default locale, ~30 input + 30
 * output tokens. Sub-cent cost across all locales combined.
 */
export interface LlmsHeaderTranslatePromptInput {
  /** BCP-47 of the target locale. */
  targetLanguage: string
  /** Human-readable locale name. */
  targetRegion: string
  /** Optional brand-voice hint, persisted in plugin storage. */
  brandVoice?: string
  /**
   * The site name as the designer entered it (default locale).
   * Treated as a brand string — never translated. Echoed back in
   * the output so the orchestrator can validate the model didn't
   * silently change it.
   */
  siteName: string
  /**
   * The site tagline / summary as the designer entered it
   * (default locale). The model rewrites this natively into the
   * target locale.
   */
  siteSummary: string
}

/**
 * llms.txt site-summary suggestion prompt input.
 *
 * Powers the ✨ "AI suggest" affordance next to the site-summary
 * field. The same prompt handles two related-but-distinct asks:
 *
 *   1. **Generate from scratch** — designer hasn't written a
 *      summary yet. AI uses `siteName` + optional `keywords` to
 *      propose a one-liner.
 *   2. **Optimize a draft** — designer has written something. AI
 *      rewrites it tighter / more AEO-effective while preserving
 *      meaning. We don't want a second prompt path because the
 *      "do you have a draft?" branch is trivial enough to live
 *      inside the system prompt — keeping a single prompt makes
 *      it easier to tune copy in one place when AI search engines
 *      change their preferences.
 *
 * Output is a JSON-wrapped single string (`{ "summary": "..." }`)
 * not bare prose because providers occasionally wrap output in
 * markdown fences or quotes; the JSON envelope is a forcing
 * function that makes parse failures easy to detect.
 *
 * Length target: 80–160 characters. AEO research suggests AI
 * search engines downweight summaries that read like marketing
 * pages — short, factual, and concrete wins. We tell the model
 * explicitly to avoid filler.
 */
export interface LlmsSummaryPromptInput {
  /** Brand identifier, used as primary signal for the summary. */
  siteName: string
  /**
   * Existing draft, if any. When non-empty the model is in
   * "optimize" mode and must preserve the user's core meaning.
   * When empty/undefined the model writes from scratch.
   */
  draft?: string
  /** Optional keywords or freeform instructions from the user. */
  keywords?: string
  /** BCP-47 of the default locale — drives tone + script rules. */
  targetLanguage: string
  /** Optional brand-voice hint, persisted in plugin storage. */
  brandVoice?: string
  /**
   * Set after a first optimize pass returns near-verbatim text. This
   * tightens the instruction without changing the public call shape.
   */
  forceRewrite?: boolean
}

export function buildLlmsSummaryPrompt(
  input: LlmsSummaryPromptInput,
): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const voice = input.brandVoice
    ? `Brand voice: ${input.brandVoice}.`
    : "Brand voice: confident, concise, factual."
  const hasDraft = !!input.draft && input.draft.trim().length > 0
  const mode = hasDraft ? "OPTIMIZE" : "GENERATE"

  const system = `You write site-level one-line summaries for an llms.txt file consumed by AI search engines (ChatGPT, Perplexity, Claude, Gemini). The summary appears as a single \`> ...\` blockquote line at the top of the file.

LENGTH: 80–160 characters. Single sentence. Period at end.

STYLE — these are AI-search-tuned, NOT human-marketing-tuned:
- Concrete and factual. Tell an AI engine what the site IS and DOES.
- Lead with the most distinctive specific noun (product, category, method).
- AVOID corporate filler: "leading", "innovative", "world-class", "next-generation", "transform". AI engines deprioritize summaries with this language because they're shape-of-marketing-page rather than shape-of-knowledge.
- AVOID literal brand-name padding ("Acme is a company that..."). The brand appears separately in the file header.
- Don't invent capabilities, claims, awards, or facts that weren't given.

MODE: ${mode}.
${
  hasDraft
    ? "You are given a DRAFT. Rewrite it tighter, scan-friendlier, and AEO-aligned. Preserve the user's intended meaning and any concrete facts, but DO NOT return the draft verbatim or near-verbatim. If the draft is already strong, make a conservative but visible improvement."
    : "You are NOT given a draft. Write a summary from scratch using the site name and any provided keywords as primary signals. If keywords are absent, write a generic-but-true summary inferring from the brand name's hint at category."
}
${
  hasDraft && input.forceRewrite
    ? "REPAIR PASS: the previous answer was too similar to the draft. Produce a materially different rewrite now. Shorten, sharpen, change sentence structure, or improve specificity while preserving facts."
    : ""
}

LANGUAGE: write in ${input.targetLanguage}.
LANGUAGE RULES: ${rules}
${voice}

OUTPUT FORMAT — return ONLY this JSON, no prose, no markdown fences, no leading whitespace, no trailing commentary. Do not write "Here's the summary" or any preamble. Your entire response is one JSON object:

{ "summary": "<your one-line summary>" }

Example of a CORRECT response (do not copy the text — it's just shape):
{ "summary": "Indie skincare brand making fragrance-free serums for sensitive skin." }

Example of an INCORRECT response (this is forbidden):
Sure! Here is the summary:
\`\`\`json
{ "summary": "..." }
\`\`\``

  const user = `Site name: ${JSON.stringify(input.siteName)}

Draft (may be empty):
"""
${input.draft ?? ""}
"""

Keywords / instructions (optional, may be empty):
"""
${input.keywords ?? ""}
"""

${hasDraft ? "Material rewrite required: yes. Do not echo the draft." : ""}

Write the one-line site summary now.`

  return { system, user }
}

export function buildLlmsHeaderTranslatePrompt(
  input: LlmsHeaderTranslatePromptInput,
): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const voice = input.brandVoice
    ? `Brand voice: ${input.brandVoice}.`
    : "Brand voice: confident, concise, native-sounding."

  const system = `You localize a website's header for an llms.txt file consumed by AI search engines (ChatGPT, Perplexity, Claude, Gemini). Two fields:

- siteName: BRAND identifier. Echo it back EXACTLY AS GIVEN — do not translate, transliterate, or rephrase. If the brand uses Latin characters, keep Latin in the output even when the target language is non-Latin.
- siteSummary: short tagline/summary describing the site. REWRITE for native readers in ${input.targetLanguage}. Do NOT literal-translate; one or two natural sentences is ideal.

${scriptIntegrityRules(input.targetLanguage)}

LANGUAGE RULES: ${rules}
${voice}

OUTPUT FORMAT — return ONLY valid JSON, no prose, no markdown fences:
{
  "siteName": "<echoed verbatim>",
  "siteSummary": "<translated, native-sounding>"
}`

  const user = `Source (default locale):
{
  "siteName": ${JSON.stringify(input.siteName)},
  "siteSummary": ${JSON.stringify(input.siteSummary)}
}

Localize for ${input.targetLanguage}.`

  return { system, user }
}

/**
 * llms.txt long-description suggestion prompt.
 *
 * Powers the ✨ "AI suggest" affordance for the multi-paragraph
 * long-description field — the section that lives between the `>`
 * one-line summary and the first `##` heading. The motivating
 * benchmark is Framer's own llms.txt, which uses this region to
 * pack ~10-15 high-density bullet points covering capabilities,
 * audiences, and differentiators (https://www.framer.com/llms.txt).
 *
 * Why this is a separate prompt from {@link buildLlmsSummaryPrompt}:
 *   - Different length budget (300-1200 chars vs 80-160).
 *   - Different output shape: an opening paragraph + a labeled
 *     bullet list. The summary is a single sentence.
 *   - Different style: the summary leads with category; the long
 *     description leads with capabilities/benefits/proof points.
 *
 * Output is JSON-wrapped so the parser can detect total failures
 * and so providers don't wrap the response in markdown fences.
 */
export interface LlmsLongDescriptionPromptInput {
  /** Brand identifier — primary signal. */
  siteName: string
  /** One-line summary the designer already wrote (context, never echoed). */
  siteSummary?: string
  /**
   * Existing draft, if any. Empty/whitespace → "generate from
   * scratch" mode; non-empty → "optimize" mode.
   */
  draft?: string
  /** Optional keywords / freeform instructions. */
  keywords?: string
  /** BCP-47 of the default locale. */
  targetLanguage: string
  brandVoice?: string
  /**
   * Optional list of static page paths discovered on the site. We
   * feed this into the prompt as factual scaffolding so the AI
   * grounds its bullet list in real capabilities (e.g. an "About"
   * page becomes a "Studio" bullet) rather than hallucinating
   * generic feature claims.
   */
  knownPaths?: ReadonlyArray<string>
  /**
   * Set after a first optimize pass returns near-verbatim text. This
   * asks the same model for a stricter rewrite before surfacing the
   * result to the user.
   */
  forceRewrite?: boolean
}

export function buildLlmsLongDescriptionPrompt(
  input: LlmsLongDescriptionPromptInput,
): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const voice = input.brandVoice
    ? `Brand voice: ${input.brandVoice}.`
    : "Brand voice: confident, concise, factual."
  const hasDraft = !!input.draft && input.draft.trim().length > 0
  const mode = hasDraft ? "OPTIMIZE" : "GENERATE"

  const system = `You write the LONG DESCRIPTION block for a website's llms.txt file, consumed by AI search engines (ChatGPT, Perplexity, Claude, Gemini). This block sits between the \`> ...\` one-line summary and the first \`##\` section heading.

Reference benchmark: Framer's own llms.txt uses this region for ~12 dense bullet points covering capabilities, audiences, and differentiators. Aim for that density.

LENGTH: 300–1200 characters total. Two parts:
  1. ONE short opening paragraph (1–2 sentences) — restates the site's value-proposition more concretely than the summary.
  2. A bullet list under a "Key features and benefits:" (or natural-language equivalent) lead-in. 5–12 bullets. Each bullet is one factual sentence — concrete capability, audience, or proof point.

STYLE — AI-search-tuned, NOT human-marketing:
- Concrete and factual. AI engines reward "what it IS / DOES" over "why it's great".
- AVOID corporate filler: "leading", "innovative", "world-class", "next-generation", "transform", "empower". These are downweighted.
- AVOID brand-name padding ("Acme is a company that..."). The brand appears separately in the file.
- Don't invent capabilities, products, integrations, awards, or facts. If you don't know, leave it out.
- Use simple short sentences. AI tokenizers benefit from clean syntax.

MODE: ${mode}.
${
  hasDraft
    ? "You are given a DRAFT. Rewrite it tighter, more bullet-dense, and more factual. Preserve the user's intended meaning and any concrete facts, but DO NOT return the draft verbatim or near-verbatim. If the draft is already strong, make a conservative but visible improvement."
    : "You are NOT given a draft. Use the site name, optional keywords, and any known site paths as your factual scaffolding. Each bullet should map to a real capability you can infer from those signals — never fabricate."
}
${
  hasDraft && input.forceRewrite
    ? "REPAIR PASS: the previous answer was too similar to the draft. Produce a materially different rewrite now. Tighten paragraphs, improve bullet density, and change sentence structure while preserving facts."
    : ""
}

LANGUAGE: write in ${input.targetLanguage}.
LANGUAGE RULES: ${rules}
${voice}

OUTPUT FORMAT — return ONLY this JSON, no prose preamble, no markdown fences. The \`longDescription\` value is a multi-line markdown string with paragraphs separated by \`\\n\\n\` and bullets prefixed by \`- \`:

{ "longDescription": "<paragraph>\\n\\nKey features and benefits:\\n- <bullet 1>\\n- <bullet 2>\\n…" }

Example of a CORRECT response (do not copy the text — it's just shape):
{ "longDescription": "Indie skincare brand making fragrance-free serums for sensitive skin.\\n\\nKey features and benefits:\\n- Pharmacist-formulated\\n- Patch-tested for fragrance allergies\\n- Made in small batches" }`

  const knownPathsBlock =
    input.knownPaths && input.knownPaths.length > 0
      ? `Known paths on this site (factual scaffolding — each may suggest a bullet):
${input.knownPaths.map((p) => `- ${p}`).join("\n")}
`
      : ""

  const user = `Site name: ${JSON.stringify(input.siteName)}

Site summary (one-liner already written):
"""
${input.siteSummary ?? ""}
"""

Draft long description (may be empty):
"""
${input.draft ?? ""}
"""

Keywords / instructions (optional, may be empty):
"""
${input.keywords ?? ""}
"""

${hasDraft ? "Material rewrite required: yes. Do not echo the draft." : ""}

${knownPathsBlock}Write the long description now.`

  return { system, user }
}

/**
 * Translation prompt for the long-description block. Mirrors the
 * `buildLlmsHeaderTranslatePrompt` shape but for a multi-paragraph
 * markdown payload — preserving paragraph breaks and bullet list
 * structure is critical, otherwise the rendered llms.txt collapses
 * into a wall of text.
 */
export interface LlmsLongDescriptionTranslatePromptInput {
  targetLanguage: string
  targetRegion: string
  brandVoice?: string
  /** Brand string — provided as context, never translated by this prompt. */
  siteName: string
  /** Default-locale long description, with paragraphs and bullets. */
  longDescription: string
}

export function buildLlmsLongDescriptionTranslatePrompt(
  input: LlmsLongDescriptionTranslatePromptInput,
): MetaPromptOutput {
  const rules = rulesFor(input.targetLanguage)
  const voice = input.brandVoice
    ? `Brand voice: ${input.brandVoice}.`
    : "Brand voice: confident, concise, native-sounding."

  const system = `You localize a multi-paragraph LONG DESCRIPTION block from an llms.txt file into ${input.targetLanguage} (${input.targetRegion}). This block sits between the \`>\` one-line summary and the first \`##\` heading.

DO translate:
- Opening paragraph(s) — REWRITE for native readers, do not literal-translate
- Bullet list items
- Section labels like "Key features and benefits:" — translate naturally

DO NOT translate:
- The brand name "${input.siteName}" — keep it verbatim wherever it appears
- URLs, version numbers, hashtags, numeric tokens
- The markdown structure: preserve "- " bullet prefixes, blank-line paragraph separators, and the order of bullets

${scriptIntegrityRules(input.targetLanguage)}

LANGUAGE RULES: ${rules}
${voice}

OUTPUT FORMAT — return ONLY valid JSON, no prose, no markdown fences. The \`longDescription\` value is a multi-line markdown string. Use \`\\n\\n\` between paragraphs and \`\\n\` between bullet lines:

{ "longDescription": "<translated paragraph>\\n\\n<translated section label>:\\n- <bullet 1>\\n- <bullet 2>\\n…" }`

  const user = `Source (default locale):
"""
${input.longDescription}
"""

Localize for ${input.targetLanguage}, preserving the markdown structure exactly.`

  return { system, user }
}
