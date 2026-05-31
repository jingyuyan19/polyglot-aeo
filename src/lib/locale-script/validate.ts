import { hasHanGlyphViolations } from "./han-glyph"
import { hasLatinEmbeddedInCjk } from "./latin-embed"
import { scriptCounts } from "./script-counts"

export function validateLocaleScript(
  text: string,
  localeCode: string,
): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false

  const base = (localeCode.split("-")[0] || localeCode).toLowerCase()
  const counts = scriptCounts(trimmed)

  switch (base) {
    case "ja":
      if (counts.hangul > 0) return false
      if (counts.cyrillic > 0) return false
      if (hasHanGlyphViolations(trimmed, localeCode)) return false
      if (hasLatinEmbeddedInCjk(trimmed)) return false
      if (counts.hiragana + counts.katakana > 0) return true
      // Kanji-only Japanese (利用規約, 会社概要) is valid; Layer B catches
      // simplified/traditional glyph bleed. Do not require kana.
      if (counts.han > 0) return true
      if (trimmed.length <= 16) return true
      return false

    case "ko":
      if (counts.hiragana + counts.katakana > 0) return false
      if (counts.cyrillic > 0) return false
      if (hasLatinEmbeddedInCjk(trimmed)) return false
      if (counts.hangul > 0) return true
      if (trimmed.length <= 16 && counts.han === 0) return true
      return false

    case "zh": {
      if (counts.hangul > 0) return false
      if (counts.cyrillic > 0) return false
      if (counts.hiragana + counts.katakana > counts.han) return false
      if (hasHanGlyphViolations(trimmed, localeCode)) return false
      if (hasLatinEmbeddedInCjk(trimmed)) return false
      return true
    }

    case "ar":
      return counts.arabic > 0 || trimmed.length <= 16

    case "ru":
    case "uk":
    case "bg":
      return counts.cyrillic > 0 || trimmed.length <= 16

    default:
      return true
  }
}

export function requireTargetScript(
  text: string,
  localeCode: string,
): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false

  const base = (localeCode.split("-")[0] || localeCode).toLowerCase()
  const counts = scriptCounts(trimmed)

  switch (base) {
    case "ja":
      if (counts.hangul > 0) return false
      if (counts.cyrillic > 0) return false
      if (hasHanGlyphViolations(trimmed, localeCode)) return false
      if (hasLatinEmbeddedInCjk(trimmed)) return false
      if (counts.hiragana + counts.katakana > 0) return true
      if (counts.han > 0) return true
      return false

    case "ko":
      if (counts.hiragana + counts.katakana > 0) return false
      if (counts.cyrillic > 0) return false
      if (hasLatinEmbeddedInCjk(trimmed)) return false
      return counts.hangul > 0

    case "zh":
      if (counts.hangul > 0) return false
      if (counts.cyrillic > 0) return false
      if (counts.hiragana + counts.katakana > counts.han) return false
      if (hasHanGlyphViolations(trimmed, localeCode)) return false
      if (hasLatinEmbeddedInCjk(trimmed)) return false
      return counts.han > 0

    case "ar":
      return counts.arabic > 0

    case "ru":
    case "uk":
    case "bg":
      return counts.cyrillic > 0

    default:
      return validateLocaleScript(text, localeCode)
  }
}
