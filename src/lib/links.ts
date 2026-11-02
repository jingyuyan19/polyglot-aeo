/**
 * Outbound URLs the plugin links to. Centralized so we can swap them in
 * one place when Framer rotates docs paths or we add a localized variant.
 */

/** Framer dashboard — plugins cannot build a per-project editor URL from `getProjectInfo().id`. */
export const FRAMER_PROJECTS_HUB = "https://framer.com/projects/"

export const FRAMER_LOCALIZATION_DOCS =
  "https://www.framer.com/help/articles/localization/"

/** Per-page Title, Page Description, and social preview — not a separate “SEO” tab. */
export const FRAMER_PAGE_META_DOCS =
  "https://www.framer.com/help/articles/how-to-update-page-titles-descriptions-and-social-images/"

export const FRAMER_STATIC_FILES_DOCS =
  "https://www.framer.com/help/articles/llms-txt-framer/"

/** Framer's built-in AEO scanner (diagnose). Polyglot AEO fixes schema / llms / meta. */
export const FRAMER_AEO_SCANNER = "https://www.framer.com/aeo"

/** Loka Localization Hub on Framer Marketplace (translations; pairs with Polyglot AEO). */
export const LOKA_FRAMER_MARKETPLACE =
  "https://www.framer.com/marketplace/plugins/loka-localization-hub/"

export const GOOGLE_RICH_RESULTS_TEST =
  "https://search.google.com/test/rich-results"

export const POLYGLOT_PRICING = "https://polyglotaeo.com/pricing"

export const POLYGLOT_CHECKOUT_BRIDGE =
  "https://polyglotaeo.com/go/checkout/"

export const POLYGLOT_PRIVACY = "https://polyglotaeo.com/privacy"
