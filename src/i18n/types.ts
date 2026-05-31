/**
 * Supported UI locales for Polyglot AEO itself.
 *
 * To add a new language: see `docs/I18N.md`. The short version:
 *   1. Add the BCP-47 code here.
 *   2. Add a metadata entry in `LOCALE_METADATA`.
 *   3. Create `src/i18n/locales/<code>.ts` mirroring `en.ts`.
 *   4. Register it in `src/i18n/index.ts`.
 *
 * Plugin UI language is independent of the project's content locales —
 * a designer can use the plugin in Chinese while authoring an English site.
 */
export type SupportedLocale = "en" | "zh-CN" | "ja"

export interface LocaleMetadata {
  /** Native-script display name shown in the picker (e.g. "中文", "日本語"). */
  nativeName: string
  /** Latin-script English name as a stable label (e.g. "Chinese", "Japanese"). */
  englishName: string
  /** BCP-47 prefixes that should auto-resolve to this locale. */
  matchPrefixes: string[]
}

export const LOCALE_METADATA: Record<SupportedLocale, LocaleMetadata> = {
  en: {
    nativeName: "English",
    englishName: "English",
    matchPrefixes: ["en"],
  },
  "zh-CN": {
    nativeName: "简体中文",
    englishName: "Simplified Chinese",
    matchPrefixes: ["zh-CN", "zh-Hans", "zh"],
  },
  ja: {
    nativeName: "日本語",
    englishName: "Japanese",
    matchPrefixes: ["ja"],
  },
}

/**
 * Recursively flatten a nested string record into dot-separated path keys.
 *
 * Given `{ a: { b: "x", c: { d: "y" } } }` this produces `"a.b" | "a.c.d"`.
 * Used to derive the union of every legal `t(key)` call from the English
 * source of truth — change `en.ts` and TypeScript will report every
 * downstream call site that became invalid.
 */
export type FlatKeyOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends Record<string, unknown>
      ? FlatKeyOf<T[K], `${Prefix}${K}.`>
      : never
}[keyof T & string]
