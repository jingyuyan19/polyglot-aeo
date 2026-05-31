import type { GeneratedMeta } from "../../views/meta/types"
import { safeJsonParse, stripReasoningBlocks } from "./providers/types"
import type { MetaQualityFlag } from "./meta-quality"

/**
 * Validate AI meta JSON. Requires at least one primary SEO field so we
 * don't run untranslated heuristics on empty/garbage parses (llms lesson).
 */
export function isValidGeneratedMeta(value: unknown): value is GeneratedMeta {
  if (!value || typeof value !== "object") return false
  const o = value as GeneratedMeta
  const title = typeof o.title === "string" ? o.title.trim() : ""
  const desc =
    typeof o.metaDescription === "string" ? o.metaDescription.trim() : ""
  return title.length > 0 || desc.length > 0
}

const STRING_FIELDS = [
  "title",
  "metaDescription",
  "ogTitle",
  "ogDescription",
  "twitterTitle",
  "twitterDescription",
  "primaryKeyword",
] as const

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

function pickStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  )
  return out.length > 0 ? out : undefined
}

function normalizeMetaObject(source: Record<string, unknown>): GeneratedMeta | null {
  const meta: GeneratedMeta = {
    title: pickString(source.title),
    metaDescription: pickString(source.metaDescription),
    ogTitle: pickString(source.ogTitle),
    ogDescription: pickString(source.ogDescription),
    twitterTitle: pickString(source.twitterTitle),
    twitterDescription: pickString(source.twitterDescription),
    primaryKeyword: pickString(source.primaryKeyword),
    secondaryKeywords: pickStringArray(source.secondaryKeywords),
  }
  return isValidGeneratedMeta(meta) ? meta : null
}

function unwrapRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.meta && typeof o.meta === "object") {
    return o.meta as Record<string, unknown>
  }
  if (o.data && typeof o.data === "object") {
    return o.data as Record<string, unknown>
  }
  return o
}

/**
 * Extract `"key": "value"` pairs from broken/truncated JSON text.
 * CJK and Latin content inside strings are supported.
 */
function extractJsonStringField(text: string, key: string): string | undefined {
  const re = new RegExp(
    `"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"(?:\\s*[,}])`,
    "s",
  )
  const m = text.match(re)
  if (!m?.[1]) return undefined
  return m[1]
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim()
}

/**
 * Close truncated `{"title":...` responses (common when output hits max
 * tokens mid-`secondaryKeywords` array — seen on ko with CJK output).
 */
function tryRepairTruncatedJsonObject(text: string): unknown {
  const cleaned = stripReasoningBlocks(text)
  const start = cleaned.indexOf("{")
  if (start < 0) return null
  let slice = cleaned.slice(start).trimEnd()

  // Trailing comma after a complete value (truncated mid-array).
  slice = slice.replace(/,\s*$/, "")
  // Unclosed string at end: ,"partial…  (no closing quote)
  slice = slice.replace(/,\s*"[^"]*$/s, "")

  let braces = 0
  let brackets = 0
  for (const ch of slice) {
    if (ch === "{") braces++
    else if (ch === "}") braces--
    else if (ch === "[") brackets++
    else if (ch === "]") brackets--
  }
  let repair = slice
  while (brackets > 0) {
    repair += "]"
    brackets--
  }
  while (braces > 0) {
    repair += "}"
    braces--
  }

  try {
    return JSON.parse(repair)
  } catch {
    return null
  }
}

function salvageMetaFromText(rawText: string): GeneratedMeta | null {
  const cleaned = stripReasoningBlocks(rawText)
  const meta: GeneratedMeta = {}
  for (const key of STRING_FIELDS) {
    const v = extractJsonStringField(cleaned, key)
    if (v) meta[key] = v
  }
  const kwMatch = cleaned.match(
    /"secondaryKeywords"\s*:\s*\[([\s\S]*?)(?:\]|$)/,
  )
  if (kwMatch?.[1]) {
    const items: string[] = []
    const itemRe = /"((?:\\.|[^"\\])*)"/g
    let m: RegExpExecArray | null
    while ((m = itemRe.exec(kwMatch[1])) !== null) {
      const item = m[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim()
      if (item) items.push(item)
    }
    if (items.length > 0) meta.secondaryKeywords = items
  }
  return isValidGeneratedMeta(meta) ? meta : null
}

/**
 * Normalize provider output into GeneratedMeta.
 * Tries parsed JSON, then rawText parse/repair/salvage.
 */
export function parseMetaFromAi(
  parsed: unknown,
  rawText?: string,
): GeneratedMeta | null {
  const fromParsed = unwrapRecord(parsed)
  if (fromParsed) {
    const norm = normalizeMetaObject(fromParsed)
    if (norm) return norm
  }

  if (!rawText?.trim()) return null

  const fromSafe = safeJsonParse(rawText)
  const fromSafeRecord = unwrapRecord(fromSafe)
  if (fromSafeRecord) {
    const norm = normalizeMetaObject(fromSafeRecord)
    if (norm) return norm
  }

  const repaired = tryRepairTruncatedJsonObject(rawText)
  const fromRepaired = unwrapRecord(repaired)
  if (fromRepaired) {
    const norm = normalizeMetaObject(fromRepaired)
    if (norm) return norm
  }

  return salvageMetaFromText(rawText)
}

export function parseFailedFlag(): MetaQualityFlag {
  return { field: null, reason: "parse-failed" }
}
