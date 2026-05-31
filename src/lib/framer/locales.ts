import { framer, type Locale } from "framer-plugin"

export interface LocaleInfo {
  id: string
  code: string
  name: string
  slug: string
  isDefault: boolean
}

/**
 * Returns every locale configured on the project, including the default one.
 * Framer's `getLocales()` excludes the default — we merge it back in so
 * downstream code can iterate over the full set without special-casing.
 */
export async function getAllLocales(): Promise<LocaleInfo[]> {
  const [defaultLocale, others] = await Promise.all([
    framer.getDefaultLocale(),
    framer.getLocales(),
  ])

  const result: LocaleInfo[] = []

  if (defaultLocale) {
    result.push(localeToInfo(defaultLocale, true))
  }

  for (const locale of others) {
    if (defaultLocale && locale.id === defaultLocale.id) continue
    result.push(localeToInfo(locale, false))
  }

  return result
}

export async function getActiveLocaleInfo(): Promise<LocaleInfo | null> {
  const active = await framer.getActiveLocale()
  if (!active) {
    const def = await framer.getDefaultLocale()
    return def ? localeToInfo(def, true) : null
  }
  const def = await framer.getDefaultLocale()
  return localeToInfo(active, def?.id === active.id)
}

function localeToInfo(locale: Locale, isDefault: boolean): LocaleInfo {
  return {
    id: locale.id,
    code: locale.code,
    name: locale.name,
    slug: locale.slug,
    isDefault,
  }
}

/**
 * Convert a BCP-47 code to the schema.org `inLanguage` value.
 * schema.org accepts BCP-47 directly, so this is mostly identity, but we
 * normalize casing (`zh-cn` → `zh-CN`) for consistency.
 */
export function toSchemaLanguage(code: string): string {
  const [lang, region] = code.split("-")
  if (region) return `${lang.toLowerCase()}-${region.toUpperCase()}`
  return lang.toLowerCase()
}

/** ISO 3166-1 alpha-2 when BCP-47 has no region subtag. */
const LANG_TO_REGION: Record<string, string> = {
  en: "US",
  ja: "JP",
  ko: "KR",
  fr: "FR",
  de: "DE",
  es: "ES",
  it: "IT",
  pt: "PT",
  nl: "NL",
  pl: "PL",
  ru: "RU",
  zh: "CN",
  ar: "SA",
  hi: "IN",
  tr: "TR",
  vi: "VN",
  th: "TH",
  id: "ID",
}

/**
 * Regional-indicator flag emoji for a Framer / BCP-47 locale code.
 * Uses the region subtag when present (`zh-CN` → 🇨🇳), otherwise a
 * language→country fallback (`ja` → 🇯🇵). Returns 🌐 when unknown.
 */
export function localeFlagEmoji(code: string): string {
  const trimmed = code.trim()
  if (!trimmed) return "🌐"

  const [langPart, regionPart] = trimmed.split("-")
  const lang = (langPart ?? "").toLowerCase()
  const regionRaw = regionPart?.toUpperCase()

  const iso =
    regionRaw && regionRaw.length === 2
      ? regionRaw
      : LANG_TO_REGION[lang]

  // BCP-47 uses 3-letter regions sometimes — not valid for flag emoji.
  if (!iso || iso.length !== 2 || !/^[A-Z]{2}$/.test(iso)) {
    return "🌐"
  }

  const base = 0x1f1e6
  return [...iso]
    .map((char) => String.fromCodePoint(base + (char.charCodeAt(0) - 65)))
    .join("")
}
