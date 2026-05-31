import cnToJpMap from "./data/cn-to-jp.json"
import cnToTwMap from "./data/cn-to-tw.json"
import jaPhrases from "./data/ja-phrases.json"
import twToCnMap from "./data/tw-to-cn.json"
import twToJpMap from "./data/tw-to-jp.json"
import { stripQuotedRegions } from "./latin-embed"
import { isHanChar } from "./script-counts"
import type { HanGlyphViolation, JaPhraseViolation } from "./types"

const cnToJp = cnToJpMap as Record<string, string>
const twToJp = twToJpMap as Record<string, string>
const cnToTw = cnToTwMap as Record<string, string>
const twToCn = twToCnMap as Record<string, string>
const jaPhraseList = jaPhrases as JaPhraseViolation[]

function zhTargetVariant(localeCode: string): "cn" | "tw" {
  const lower = localeCode.toLowerCase()
  if (
    lower.includes("tw") ||
    lower.includes("hk") ||
    lower.includes("hant")
  ) {
    return "tw"
  }
  return "cn"
}

function lookupGlyph(
  map: Record<string, string>,
  ch: string,
  kind: HanGlyphViolation["kind"],
): HanGlyphViolation | null {
  const expected = map[ch]
  if (!expected || expected === ch) return null
  return { found: ch, expected, kind }
}

function findJaPhraseViolations(text: string): JaPhraseViolation[] {
  const stripped = stripQuotedRegions(text)
  const hits: JaPhraseViolation[] = []
  for (const entry of jaPhraseList) {
    if (stripped.includes(entry.found)) hits.push(entry)
  }
  return hits
}

/**
 * OpenCC-derived glyph violations for a locale. Only Han codepoints are
 * checked; shared glyphs absent from the maps pass through.
 */
export function findHanGlyphViolations(
  text: string,
  localeCode: string,
): HanGlyphViolation[] {
  const base = (localeCode.split("-")[0] || localeCode).toLowerCase()
  const violations: HanGlyphViolation[] = []
  const seen = new Set<string>()

  const push = (v: HanGlyphViolation | null) => {
    if (!v || seen.has(v.found)) return
    seen.add(v.found)
    violations.push(v)
  }

  if (base === "ja") {
    for (const phrase of findJaPhraseViolations(text)) {
      push({
        found: phrase.found,
        expected: phrase.expected,
        kind: phrase.kind,
      })
    }
    for (const ch of text) {
      if (!isHanChar(ch)) continue
      push(lookupGlyph(cnToJp, ch, "simplified"))
      push(lookupGlyph(twToJp, ch, "traditional"))
    }
    return violations
  }

  if (base === "zh") {
    const variant = zhTargetVariant(localeCode)
    for (const ch of text) {
      if (!isHanChar(ch)) continue
      if (variant === "cn") {
        push(lookupGlyph(twToCn, ch, "traditional"))
      } else {
        push(lookupGlyph(cnToTw, ch, "simplified"))
      }
    }
    return violations
  }

  return violations
}

export function hasHanGlyphViolations(
  text: string,
  localeCode: string,
): boolean {
  return findHanGlyphViolations(text, localeCode).length > 0
}
