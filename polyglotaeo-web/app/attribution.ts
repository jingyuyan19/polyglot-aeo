"use client"

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const

export type UtmKey = (typeof UTM_KEYS)[number]

export type Attribution = Record<UtmKey, string> & {
  landing_path: string
  referrer: string
}

export const EMPTY_ATTRIBUTION: Attribution = {
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_content: "",
  utm_term: "",
  landing_path: "",
  referrer: "",
}

const STORAGE_KEY = "polyglot-aeo-attribution-v1"

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function readStoredAttribution() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Attribution>
    return {
      ...EMPTY_ATTRIBUTION,
      ...parsed,
    }
  } catch {
    return null
  }
}

function writeStoredAttribution(attribution: Attribution) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution))
  } catch {
    // Attribution should never block a CTA or form.
  }
}

export function getAttributionSnapshot(): Attribution {
  if (typeof window === "undefined") return EMPTY_ATTRIBUTION

  const query = new URLSearchParams(window.location.search)
  const stored = readStoredAttribution()
  const hasCurrentUtm = UTM_KEYS.some((key) => Boolean(query.get(key)))
  const next: Attribution = {
    ...EMPTY_ATTRIBUTION,
    ...(stored || {}),
  }

  if (hasCurrentUtm) {
    for (const key of UTM_KEYS) {
      next[key] = query.get(key) || ""
    }
    next.landing_path = currentPath()
    next.referrer = document.referrer || stored?.referrer || ""
    writeStoredAttribution(next)
    return next
  }

  next.landing_path = stored?.landing_path || currentPath()
  next.referrer = stored?.referrer || document.referrer || ""
  if (!stored) writeStoredAttribution(next)
  return next
}
