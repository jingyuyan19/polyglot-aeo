import { useSyncExternalStore } from "react"

import { en, type Translations } from "./locales/en"
import { zhCN } from "./locales/zh-CN"
import { ja } from "./locales/ja"
import {
  LOCALE_METADATA,
  type FlatKeyOf,
  type SupportedLocale,
} from "./types"

export type { SupportedLocale } from "./types"
export { LOCALE_METADATA } from "./types"

const TRANSLATIONS: Record<SupportedLocale, Translations> = {
  en,
  "zh-CN": zhCN,
  ja,
}

/**
 * The set of every legal `t()` key, derived from English at compile time.
 * Translators get free type-checking — if `en.ts` has a key that another
 * locale's file is missing, TypeScript catches it before runtime.
 */
export type TranslationKey = FlatKeyOf<Translations>

/**
 * Sentinel meaning "follow the auto-detected locale instead of forcing one".
 * Stored in plugin data when the user hasn't picked a language explicitly.
 */
export const AUTO_LOCALE = "auto" as const
export type LocalePreference = SupportedLocale | typeof AUTO_LOCALE

/**
 * Pick a supported locale from a BCP-47 string, or fall back to English.
 * Used for both the user's explicit pick and `navigator.language` detection.
 */
export function resolveLocale(input: string | null | undefined): SupportedLocale {
  if (!input) return "en"
  const normalized = input.replace("_", "-")
  for (const [code, meta] of Object.entries(LOCALE_METADATA) as [
    SupportedLocale,
    (typeof LOCALE_METADATA)[SupportedLocale],
  ][]) {
    for (const prefix of meta.matchPrefixes) {
      if (
        normalized === prefix ||
        normalized.toLowerCase().startsWith(prefix.toLowerCase() + "-") ||
        normalized.toLowerCase() === prefix.toLowerCase()
      ) {
        return code
      }
    }
  }
  return "en"
}

/** Resolve from `navigator.language` and the navigator's preference list. */
export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === "undefined") return "en"
  const candidates = [
    ...((navigator.languages as readonly string[] | undefined) ?? []),
    navigator.language,
  ].filter(Boolean) as string[]
  for (const candidate of candidates) {
    const resolved = resolveLocale(candidate)
    if (resolved !== "en" || candidate.toLowerCase().startsWith("en")) {
      return resolved
    }
  }
  return "en"
}

// ─────────────────────────────────────────────────────────────────────
// External store: a tiny pub/sub that pairs with React's useSyncExternalStore
// for global locale state. Not Context — Context would re-render every
// component on each pick, which is fine here but heavier than necessary.
// ─────────────────────────────────────────────────────────────────────

interface I18nState {
  preference: LocalePreference
  detected: SupportedLocale
  active: SupportedLocale
}

let state: I18nState = {
  preference: AUTO_LOCALE,
  detected: "en",
  active: "en",
}

const subscribers = new Set<() => void>()

function notify() {
  for (const fn of subscribers) fn()
}

function computeActive(
  preference: LocalePreference,
  detected: SupportedLocale,
): SupportedLocale {
  return preference === AUTO_LOCALE ? detected : preference
}

/**
 * Boot the i18n store. Call once at startup before rendering.
 *   - `detected` is the locale resolved from the browser/Framer environment.
 *   - `preference` is what the user persisted earlier (or "auto" if they
 *     haven't picked).
 */
export function initI18n(args: {
  preference: LocalePreference
  detected: SupportedLocale
}) {
  state = {
    preference: args.preference,
    detected: args.detected,
    active: computeActive(args.preference, args.detected),
  }
  notify()
}

/** Update the user's explicit preference. Triggers a UI re-render. */
export function setLocalePreference(preference: LocalePreference) {
  state = {
    ...state,
    preference,
    active: computeActive(preference, state.detected),
  }
  notify()
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

function getSnapshot(): I18nState {
  return state
}

/**
 * React hook: returns `{ t, locale, preference, detected, setPreference }`.
 *
 * Usage:
 *   const { t } = useI18n()
 *   <h1>{t("dashboard.title")}</h1>
 *   <p>{t("schema.localesPartial", { n: 2, total: 5 })}</p>
 */
export function useI18n() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    t: makeT(snapshot.active),
    locale: snapshot.active,
    preference: snapshot.preference,
    detected: snapshot.detected,
    setPreference: setLocalePreference,
  }
}

/**
 * Imperative `t()` for places outside React (e.g. notify() calls in async
 * effects). Reads the current store snapshot — no subscription, no re-render.
 */
export function t<K extends TranslationKey>(
  key: K,
  vars?: Record<string, string | number>,
): string {
  return makeT(state.active)(key, vars)
}

// ─────────────────────────────────────────────────────────────────────
// Lookup + interpolation
// ─────────────────────────────────────────────────────────────────────

function makeT(locale: SupportedLocale) {
  const dict = TRANSLATIONS[locale]
  return function translate<K extends TranslationKey>(
    key: K,
    vars?: Record<string, string | number>,
  ): string {
    const template = lookup(dict, key) ?? lookup(en, key) ?? key
    return interpolate(template, vars)
  }
}

function lookup(dict: Translations, key: string): string | undefined {
  let cursor: unknown = dict
  for (const segment of key.split(".")) {
    if (cursor && typeof cursor === "object" && segment in cursor) {
      cursor = (cursor as Record<string, unknown>)[segment]
    } else {
      return undefined
    }
  }
  return typeof cursor === "string" ? cursor : undefined
}

function interpolate(
  template: string,
  vars: Record<string, string | number> | undefined,
): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}
