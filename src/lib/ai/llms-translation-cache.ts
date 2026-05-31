import type { LocaleInfo } from "../framer/locales"
import type { LlmsTranslateEntryInput } from "./llms-translate"

const STORAGE_KEY = "polyglot-aeo:llms-translation-cache:v1"
const MAX_CACHE_ENTRIES = 400

interface CacheEntry {
  key: string
  title: string
  summary?: string
  updatedAt: number
}

type CacheShape = Record<string, CacheEntry>

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readCache(): CacheShape {
  const s = storage()
  if (!s) return {}
  try {
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as CacheShape
  } catch {
    return {}
  }
}

function writeCache(cache: CacheShape): void {
  const s = storage()
  if (!s) return
  const entries = Object.values(cache)
    .filter((entry) => entry.key && entry.title)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CACHE_ENTRIES)
  try {
    s.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries.map((e) => [e.key, e]))),
    )
  } catch {
    // Best-effort only. Generation correctness never depends on cache writes.
  }
}

function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ")
}

export function llmsTranslationCacheKey(
  item: LlmsTranslateEntryInput,
  locale: LocaleInfo,
  brandVoice?: string,
): string {
  return hashString(
    JSON.stringify({
      locale: locale.code,
      brandVoice: normalize(brandVoice),
      title: normalize(item.title),
      summary: normalize(item.summary),
    }),
  )
}

export function readCachedLlmsTranslations(
  items: ReadonlyArray<LlmsTranslateEntryInput>,
  locale: LocaleInfo,
  brandVoice?: string,
): {
  translated: Map<string, { title: string; summary?: string }>
  missing: LlmsTranslateEntryInput[]
} {
  const cache = readCache()
  const translated = new Map<string, { title: string; summary?: string }>()
  const missing: LlmsTranslateEntryInput[] = []

  for (const item of items) {
    const key = llmsTranslationCacheKey(item, locale, brandVoice)
    const cached = cache[key]
    const needsSummary = Boolean(normalize(item.summary))
    if (cached?.title && (!needsSummary || cached.summary)) {
      translated.set(item.id, {
        title: cached.title,
        summary: cached.summary,
      })
    } else {
      missing.push(item)
    }
  }

  return { translated, missing }
}

export function rememberLlmsTranslations(
  items: ReadonlyArray<LlmsTranslateEntryInput>,
  locale: LocaleInfo,
  translated: ReadonlyMap<string, { title: string; summary?: string }>,
  brandVoice?: string,
): void {
  if (translated.size === 0) return
  const cache = readCache()
  const now = Date.now()

  for (const item of items) {
    const result = translated.get(item.id)
    if (!result?.title) continue
    const key = llmsTranslationCacheKey(item, locale, brandVoice)
    cache[key] = {
      key,
      title: result.title,
      summary: result.summary,
      updatedAt: now,
    }
  }

  writeCache(cache)
}
