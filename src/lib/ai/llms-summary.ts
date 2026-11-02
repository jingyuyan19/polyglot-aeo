import { callAi, type AiProvider } from "./client"
import { validateLocaleScript } from "../locale-script"
import type { LlmsTranslateAiCredentials } from "./llms-translate"
import {
  buildLlmsLongDescriptionPrompt,
  buildLlmsSummaryPrompt,
} from "./prompts"
import { stripReasoningBlocks } from "./providers/types"
import { looksUntranslatedText } from "./translation-quality"

/**
 * llms.txt site-summary AI suggestion orchestrator.
 *
 * Surfaces a single ✨ "AI suggest" affordance in LlmsTxtView that
 * handles BOTH "generate from scratch" and "optimize my draft" via
 * the same prompt — see {@link buildLlmsSummaryPrompt} for the
 * dual-mode rationale.
 *
 * Why this lives next to `llms-translate.ts` instead of in a
 * generic `ai/` summary module: the prompt is heavily AEO-tuned
 * (length targets, anti-filler rules, llms.txt format awareness)
 * and shares the same provider-agnostic credential bundle that
 * llms.txt translation uses. Co-locating the two surfaces keeps
 * llms.txt-related AI logic in one folder, which matches how
 * `meta-quality.ts` lives next to `meta-quality.test.ts`.
 *
 * No CMS / storage writes. Caller decides whether to persist the
 * suggestion (in our case: only after the user clicks "Use this").
 */

export interface GenerateLlmsSummaryParams {
  /** Brand identifier — primary signal for the summary. */
  siteName: string
  /**
   * Existing draft, if any. Empty/whitespace → "generate from
   * scratch" mode; non-empty → "optimize" mode.
   */
  draft?: string
  /** Optional keywords / freeform instructions. */
  keywords?: string
  /** BCP-47 code of the default locale — drives script validation. */
  targetLanguage: string
  /** Optional brand-voice hint, persisted in plugin storage. */
  brandVoice?: string
  /** AI credentials. Same shape as llms-translate uses. */
  ai: LlmsTranslateAiCredentials
}

export interface GenerateLlmsSummaryResult {
  summary: string
  /**
   * `true` when the AI's output passed both script validation
   * AND, in optimize mode, the byte-equal-passthrough check.
   * Used by the UI to choose whether to suggest "Try a stronger
   * model" alongside the result.
   *
   * False does NOT mean we returned the user's draft — we still
   * surface the AI text so the user can read it. It just means
   * "low confidence — review carefully".
   */
  qualityOk: boolean
  /** True when optimize mode produced a material change from the draft. */
  changed: boolean
  costUsd: number
}

interface ParsedSummary {
  summary: string
}

/**
 * Best-effort parse of the AI's `{ "summary": "..." }` response.
 *
 * In production we see four failure modes — handled in the order
 * we trust them, most-trusted first:
 *
 *   1. Provider pre-parsed the JSON for us → use it directly.
 *   2. Markdown-fenced JSON (```json {...} ```) → strip the fence,
 *      parse, then accept multiple alias keys for the value
 *      (`summary` / `result` / `text` / `output`) since smaller
 *      models pick whichever is closer to "answer" in their
 *      training data even when the prompt names a specific key.
 *   3. Prose-preamble + JSON (model wrote "Here's the summary:" then
 *      a JSON object) → bracket-slice the first `{...}` and parse.
 *   4. **Bare text** (model ignored the JSON envelope entirely and
 *      just returned the summary as plain text) → take the rawText
 *      as-is, sanitized. This is what kicked us live with the
 *      first zh-CN user test — Chinese-prompted Claude Haiku is
 *      noticeably more likely to drop the JSON shell because
 *      "JSON" is a non-Chinese token in a Chinese prompt and
 *      doesn't get reinforced as strongly.
 *
 * The bare-text fallback was the missing tier — surfacing a
 * "couldn't parse" error to a designer whose AI clearly produced
 * a usable summary is worse than relaxing the parser. Quality
 * checks downstream still gate on script integrity etc., so we
 * don't accept truly garbage strings.
 *
 * Returns `null` only when there's literally no usable text at all
 * (empty rawText AND no parsed payload). Callers should treat
 * that as a real failure.
 */
function parseSummaryResponse(
  parsed: unknown,
  rawText: string,
): ParsedSummary | null {
  const candidates: unknown[] = []
  if (parsed !== null && parsed !== undefined) candidates.push(parsed)

  // Reasoning-model preprocess. Some providers (DeepSeek R1, Qwen
  // QwQ / Qwen3 thinking mode, GLM-Z1, Kimi K2-Thinking, MiniMax
  // M-series) emit chain-of-thought wrapped in `<think>` (or
  // `<thinking>`) tags before the answer. We share the same
  // stripper the provider adapters already use for JSON extraction,
  // so the behaviour stays consistent across surfaces and we get
  // truncated-mid-think handling (drop everything after an unclosed
  // `<think>`) for free.
  const dethought = stripReasoningBlocks(rawText)

  const stripped = dethought
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
  if (stripped) {
    try {
      candidates.push(JSON.parse(stripped))
    } catch {
      // ignore — fall through to bracket-slice parse
    }
    const firstBrace = stripped.indexOf("{")
    const lastBrace = stripped.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        candidates.push(JSON.parse(stripped.slice(firstBrace, lastBrace + 1)))
      } catch {
        // ignore
      }
    }
  }

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue
    const obj = c as Record<string, unknown>
    // Try the canonical key first, then common aliases. Models
    // sometimes pick `result` even when the prompt says `summary`
    // — checking aliases is cheaper than re-prompting.
    for (const key of ["summary", "result", "text", "output"]) {
      const v = obj[key]
      if (typeof v === "string" && v.trim().length > 0) {
        return { summary: v.trim() }
      }
    }
  }

  // Fallback tier: bare text. The model dropped the JSON envelope
  // and just returned prose. Strip JSON-ish leading/trailing
  // garbage and quotes, collapse to one line, and use it directly.
  // Quality validation downstream will still catch wrong-script
  // and passthrough failures, so this isn't a quality regression
  // — just a parse-resilience win.
  if (stripped) {
    const bare = sanitizeBareText(stripped)
    if (bare.length > 0) {
      return { summary: bare }
    }
  }

  return null
}

/**
 * Convert raw model output (which may include markdown fences,
 * stray quotes, or multi-line prose) into a single-line summary
 * suitable for the `>` blockquote in llms.txt.
 *
 * Pure helper — exported by name only inside the module.
 */
/**
 * Lines that look like preambles or section headers, not the
 * actual summary. Detected and skipped so the multi-line response
 *
 *   Sure! Here's a tighter summary:
 *   "LYNIQ — Branding studio for ..."
 *
 * resolves to the second line, not the first.
 *
 * Match logic: short prose ending in a colon, OR an obvious
 * preamble token in either English or Chinese/Japanese. We bias
 * toward false-negatives (don't drop a line that might be content)
 * because dropping a real summary is worse than keeping a verbose
 * one.
 */
const PREAMBLE_LINE_RE =
  /^(sure[!,.]?\s*|here['']?s\s+|here is\s+|summary[:：]|以下是|建议[:：]|这是|これは|以下に).*?[:：]\s*$/i

function sanitizeBareText(input: string): string {
  let s = input
    // Strip any remaining markdown fences (we already pre-stripped
    // outer ones above, but a stray ``` mid-text breaks display).
    .replace(/```/g, "")
    .trim()

  // Multi-line → walk lines, skip preamble-shaped ones, take the
  // first content-shaped one. We can't just take "longest line"
  // because a chatty trailing "Let me know if you'd like ..." is
  // sometimes longer than the summary itself.
  const lines = s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  for (const line of lines) {
    if (PREAMBLE_LINE_RE.test(line)) continue
    s = line
    break
  }

  // Strip outer quote pairs (straight + curly + Chinese brackets)
  // — models often quote the whole sentence as "decoration" even
  // though the JSON envelope already does that.
  s = s.replace(/^["「"」'']+|["「"」'']+$/g, "").trim()

  // Final pass: drop a leading "Summary: " or "总结：" prefix that
  // sometimes survives when the entire response is one line.
  s = s.replace(/^\s*(summary|总结|まとめ)\s*[:：]\s*/i, "").trim()
  return s
}

function normalizeForSimilarity(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenOverlapRatio(a: string, b: string): number {
  const aTokens = new Set(a.split(" ").filter(Boolean))
  const bTokens = new Set(b.split(" ").filter(Boolean))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let overlap = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1
  }
  return overlap / Math.max(aTokens.size, bTokens.size)
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  // Long descriptions can be hundreds of characters. Token overlap is
  // enough there; avoid an expensive O(n*m) edit-distance matrix.
  if (maxLen > 800) return tokenOverlapRatio(a, b)

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      )
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]
  }
  return 1 - prev[b.length] / maxLen
}

function isNearIdenticalDraft(candidate: string, draft: string): boolean {
  const normalizedCandidate = normalizeForSimilarity(candidate)
  const normalizedDraft = normalizeForSimilarity(draft)
  if (!normalizedCandidate || !normalizedDraft) return false
  if (normalizedCandidate === normalizedDraft) return true

  const maxLen = Math.max(normalizedCandidate.length, normalizedDraft.length)
  const minLen = Math.min(normalizedCandidate.length, normalizedDraft.length)
  const lengthRatio = minLen / maxLen

  if (maxLen < 24) {
    return (
      lengthRatio > 0.92 &&
      levenshteinRatio(normalizedCandidate, normalizedDraft) > 0.92
    )
  }

  const overlap = tokenOverlapRatio(normalizedCandidate, normalizedDraft)
  const editSimilarity = levenshteinRatio(
    normalizedCandidate,
    normalizedDraft,
  )
  return lengthRatio > 0.82 && (overlap >= 0.9 || editSimilarity >= 0.88)
}

function summaryQualityFor(
  cleaned: string,
  trimmedDraft: string,
  targetLanguage: string,
): { qualityOk: boolean; changed: boolean } {
  let qualityOk = true
  if (!validateLocaleScript(cleaned, targetLanguage)) {
    qualityOk = false
  }

  let changed = true
  if (trimmedDraft) {
    changed = !isNearIdenticalDraft(cleaned, trimmedDraft)
    const passthrough = looksUntranslatedText(
      { description: cleaned },
      { description: trimmedDraft },
    )
    if (passthrough || !changed) qualityOk = false
  }

  return { qualityOk, changed }
}

/**
 * Generate or optimize the site-summary line for an llms.txt file.
 *
 * Throws on AI provider errors so the calling component can show a
 * notify with the message — the failure mode is "we couldn't
 * suggest anything, please try again", not "fall back to source"
 * (which is what the translate path does, because translate has a
 * source to fall back to; here we have nothing).
 *
 * Quality validation:
 *   - Script integrity for the target locale (lenient validator —
 *     short brand-token Latin in CJK output is allowed).
 *   - In optimize mode, also detect byte-equal passthroughs (model
 *     returned the user's draft verbatim — fine if intentional,
 *     surfaced as `qualityOk=false` so we can hint).
 */
export async function generateLlmsSummary(
  params: GenerateLlmsSummaryParams,
  callAiFn: typeof callAi = callAi,
): Promise<GenerateLlmsSummaryResult> {
  const trimmedDraft = (params.draft ?? "").trim()
  const trimmedKeywords = (params.keywords ?? "").trim()

  const attempt = async (forceRewrite: boolean) => {
    const prompt = buildLlmsSummaryPrompt({
      siteName: params.siteName,
      draft: trimmedDraft || undefined,
      keywords: trimmedKeywords || undefined,
      targetLanguage: params.targetLanguage,
      brandVoice: params.brandVoice,
      forceRewrite,
    })

    const result = await callAiFn({
      providerId: params.ai.providerId as AiProvider,
      modelId: params.ai.modelId,
      apiKey: params.ai.apiKey,
      feature: "llms_summary",
      prompt,
      customProvider: params.ai.customProvider,
      // Summaries are short, but two budgets force this cap higher
      // than the visible-output size:
      //
      //   1. CJK languages use ~2-3 tokens/char of output.
      //   2. "Reasoning" models (DeepSeek R1, Qwen QwQ / Qwen3-think,
      //      GLM-Z1) emit a long `<think>…</think>` chain BEFORE the
      //      answer. With a 400-token cap they get cut off mid-think
      //      and our parser sees a truncated `<think>` tag with no
      //      payload (we shipped a build that did exactly this).
      //
      // 1500 tokens is enough thinking budget for every reasoning
      // model we've tested. Cost is unaffected — providers only bill
      // for actual output tokens, not the cap.
      maxTokens: 1500,
    })

    const parsed = parseSummaryResponse(result.parsed, result.rawText)
    if (!parsed) {
      throw new Error(
        "AI returned an unparseable response. Try again or switch to a stronger model.",
      )
    }

    const cleaned = parsed.summary
      .replace(/^["「"」'']+|["「"」'']+$/g, "")
      .trim()
    const quality = summaryQualityFor(
      cleaned,
      trimmedDraft,
      params.targetLanguage,
    )
    return {
      summary: cleaned,
      costUsd: result.estimatedCostUsd ?? 0,
      ...quality,
    }
  }

  const first = await attempt(false)
  if (trimmedDraft && !first.changed) {
    const second = await attempt(true)
    return {
      ...second,
      costUsd: first.costUsd + second.costUsd,
    }
  }

  return first
}

/**
 * Generate or optimize the multi-paragraph LONG DESCRIPTION block
 * for an llms.txt file. Output target: a paragraph + bullet list
 * with 5-12 bullets, total 300-1200 chars. This is the higher-density
 * block between the `>` summary and the first `##` section heading,
 * benchmarked against Framer's own llms.txt.
 *
 * Same parser/validator stack as {@link generateLlmsSummary} —
 * stripReasoningBlocks first, JSON envelope with alias keys
 * (`longDescription` / `description` / `text` / `output`), bare-text
 * fallback as last resort. Multi-line responses are kept intact
 * (unlike summaries which collapse to one line) because the long
 * description IS multi-line by spec.
 */
export interface GenerateLlmsLongDescriptionParams {
  siteName: string
  /** One-line summary the designer already wrote (context). */
  siteSummary?: string
  draft?: string
  keywords?: string
  /**
   * Optional list of static page paths discovered on the site.
   * Passed through to the prompt as factual scaffolding.
   */
  knownPaths?: ReadonlyArray<string>
  targetLanguage: string
  brandVoice?: string
  ai: LlmsTranslateAiCredentials
}

export interface GenerateLlmsLongDescriptionResult {
  longDescription: string
  qualityOk: boolean
  /** True when optimize mode produced a material change from the draft. */
  changed: boolean
  costUsd: number
}

/**
 * Best-effort parse of the long-description response. Same envelope
 * tolerance as {@link parseSummaryResponse} but accepts a different
 * primary key (`longDescription`) and DOES NOT collapse to a single
 * line — the long description is multi-paragraph by definition.
 */
function parseLongDescriptionResponse(
  parsed: unknown,
  rawText: string,
): { longDescription: string } | null {
  const candidates: unknown[] = []
  if (parsed !== null && parsed !== undefined) candidates.push(parsed)

  const dethought = stripReasoningBlocks(rawText)
  const stripped = dethought
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
  if (stripped) {
    try {
      candidates.push(JSON.parse(stripped))
    } catch {
      // ignore — try sliced parse below
    }
    const firstBrace = stripped.indexOf("{")
    const lastBrace = stripped.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        candidates.push(
          JSON.parse(stripped.slice(firstBrace, lastBrace + 1)),
        )
      } catch {
        // ignore
      }
    }
  }

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue
    const obj = c as Record<string, unknown>
    for (const key of [
      "longDescription",
      "long_description",
      "description",
      "text",
      "output",
    ]) {
      const v = obj[key]
      if (typeof v === "string" && v.trim().length > 0) {
        return { longDescription: v.trim() }
      }
    }
  }

  // Bare-text fallback: model dropped the JSON envelope entirely.
  // Same rationale as summary path — a usable response shouldn't
  // bubble up as a parse failure when we can recover it.
  if (stripped) {
    // Strip trailing ``` defensively. Otherwise keep multi-line
    // structure intact — long descriptions ARE multi-line.
    const bare = stripped.replace(/```/g, "").trim()
    if (bare.length > 0) {
      return { longDescription: bare }
    }
  }

  return null
}

export async function generateLlmsLongDescription(
  params: GenerateLlmsLongDescriptionParams,
  callAiFn: typeof callAi = callAi,
): Promise<GenerateLlmsLongDescriptionResult> {
  const trimmedDraft = (params.draft ?? "").trim()
  const trimmedKeywords = (params.keywords ?? "").trim()

  const attempt = async (forceRewrite: boolean) => {
    const prompt = buildLlmsLongDescriptionPrompt({
      siteName: params.siteName,
      siteSummary: params.siteSummary,
      draft: trimmedDraft || undefined,
      keywords: trimmedKeywords || undefined,
      targetLanguage: params.targetLanguage,
      brandVoice: params.brandVoice,
      knownPaths: params.knownPaths,
      forceRewrite,
    })

    const result = await callAiFn({
      providerId: params.ai.providerId as AiProvider,
      modelId: params.ai.modelId,
      apiKey: params.ai.apiKey,
      feature: "llms_summary",
      prompt,
      customProvider: params.ai.customProvider,
      // Long descriptions are 300-1200 chars in the source. CJK
      // outputs use ~2-3 tokens/char. Reasoning models (DeepSeek R1
      // etc.) need extra budget for `<think>` chains. 3000 covers
      // every case we've tested without leaving the model truncated
      // mid-bullet.
      maxTokens: 3000,
    })

    const parsed = parseLongDescriptionResponse(result.parsed, result.rawText)
    if (!parsed) {
      throw new Error(
        "AI returned an unparseable response. Try again or switch to a stronger model.",
      )
    }

    const cleaned = parsed.longDescription.trim()
    const quality = summaryQualityFor(
      cleaned,
      trimmedDraft,
      params.targetLanguage,
    )
    return {
      longDescription: cleaned,
      costUsd: result.estimatedCostUsd ?? 0,
      ...quality,
    }
  }

  const first = await attempt(false)
  if (trimmedDraft && !first.changed) {
    const second = await attempt(true)
    return {
      ...second,
      costUsd: first.costUsd + second.costUsd,
    }
  }

  return first
}
