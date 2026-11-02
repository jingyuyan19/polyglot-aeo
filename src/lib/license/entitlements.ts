import type {
  Feature,
  FeatureContext,
  Tier,
  UpgradeReason,
} from "./types"

/** Free tier: max distinct pages with schema installed via AI audit. */
export const FREE_SCHEMA_INSTALL_PAGE_LIMIT = 5
/** Free tier: real default-locale Meta AI generations for the first aha. */
export const FREE_META_GENERATE_LIMIT = 3

export function isProTier(tier: Tier): boolean {
  return tier === "pro"
}

/**
 * Central Free vs Pro policy. Pro bypasses all limits; Free checks
 * per-feature rules from the Creem launch plan.
 */
export function canUseFeature(
  tier: Tier,
  feature: Feature,
  ctx: FeatureContext = {},
): boolean {
  if (isProTier(tier)) return true

  const localeCount = ctx.localeCount ?? 1
  const nonDefault = ctx.nonDefaultLocale ?? false

  switch (feature) {
    case "schema_translate":
      return localeCount <= 1 && !nonDefault

    case "schema_install_unlimited":
      return (ctx.installPageCount ?? 0) <= FREE_SCHEMA_INSTALL_PAGE_LIMIT

    case "schema_install_all":
      return !ctx.enableAll

    case "llms_multi_locale":
      return localeCount <= 1 && !nonDefault

    case "llms_ai_translate":
      return false

    case "llms_generate":
      // Free: default-locale llms without AI; Pro: full pipeline.
      if (ctx.nonDefaultLocale) return false
      return true

    case "meta_generate":
      return false

    case "meta_ai_suggest":
      return false

    case "schema_audit_persist":
    case "remote_schema_rules":
      return false

    case "custom_openai_endpoint":
      return false

    case "managed_ai":
      // Managed generation spends server-side model quota.
      return false

    default:
      return false
  }
}

export function upgradeReasonForFeature(feature: Feature): UpgradeReason {
  switch (feature) {
    case "schema_translate":
      return "schema_translate"
    case "schema_install_unlimited":
      return "schema_install_limit"
    case "schema_install_all":
      return "schema_install_all"
    case "llms_multi_locale":
      return "llms_multi_locale"
    case "llms_ai_translate":
      return "llms_ai_translate"
    case "llms_generate":
      return "llms_generate"
    case "meta_generate":
      return "meta_generate"
    case "schema_audit_persist":
      return "schema_audit_persist"
    case "remote_schema_rules":
      return "remote_schema_rules"
    default:
      return "generic_pro"
  }
}

export function countDistinctInstallPages(
  existingPageIds: Iterable<string>,
  newPageIds: Iterable<string>,
): number {
  const set = new Set(existingPageIds)
  for (const id of newPageIds) set.add(id)
  return set.size
}
