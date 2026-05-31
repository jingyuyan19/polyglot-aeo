/**
 * Author-placeholder helpers shared between V2's render-time
 * identity injector ({@link applyIdentityToInput}) and any future
 * defense-in-depth normalizer.
 *
 * Why this remains after V2 deleted `normalizeSiteIdentity`: the
 * placeholder set is the single source of truth for "this byline
 * is the V1 generic editorial fallback, not a real person". Both
 * V2 (`applyIdentityToInput` decides whether to substitute identity
 * defaults) and any forward-compat tooling (CSV export, audit
 * reports) need that distinction.
 */

const AUTHOR_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "editorial team",
  "editorial",
  "editor",
  "editors",
  "author",
  "admin",
  "team",
  "staff",
])

/**
 * Returns `true` when the byline looks like the V1 generic-author
 * fallback ("Editor", "Editorial Team", "Admin", …) rather than a
 * real person's name.
 *
 * Used by `applyIdentityToInput` (render time) to decide whether to
 * replace a per-page authorName with the locale-aware identity
 * default. Real bylines like "Jane Smith" return `false` and are
 * preserved unchanged.
 *
 * Pure.
 */
export function isAuthorPlaceholder(name: string | undefined): boolean {
  if (!name) return false
  return AUTHOR_PLACEHOLDERS.has(name.trim().toLowerCase())
}
