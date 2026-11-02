export interface BundledSchemaRules {
  version: string
  allowedSchemaKinds: string[]
  promptVersion: string
}

const BUNDLED_SCHEMA_RULES: BundledSchemaRules = {
  version: "2026-07-07",
  allowedSchemaKinds: [
    "WebSite",
    "Organization",
    "WebPage",
    "Article",
    "FAQPage",
    "Product",
    "LocalBusiness",
    "BreadcrumbList",
  ],
  promptVersion: "v2",
}

export async function loadBundledSchemaRules(): Promise<BundledSchemaRules> {
  return BUNDLED_SCHEMA_RULES
}

export function readBundledRulesVersion(): string {
  return BUNDLED_SCHEMA_RULES.version
}

export { BUNDLED_SCHEMA_RULES }
