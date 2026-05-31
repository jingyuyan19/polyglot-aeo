import { buildArticleSchema } from "./article"
import { buildFaqPageSchema } from "./faqPage"
import { buildLocalBusinessSchema } from "./localBusiness"
import { buildOrganizationSchema } from "./organization"
import { buildProductSchema } from "./product"
import type { SchemaInput, SchemaKind } from "./types"

export type { SchemaInput, SchemaKind } from "./types"
export type {
  ArticleInput,
  FaqPageInput,
  LocalBusinessInput,
  OrganizationInput,
  ProductInput,
} from "./types"

/**
 * Ordered list of supported schema kinds, surface-shape only — labels and
 * helper text live in the i18n layer (`schema.kinds.*`) so they can be
 * translated. This module stays language-agnostic.
 */
export const SCHEMA_KINDS: readonly SchemaKind[] = [
  "Article",
  "Product",
  "LocalBusiness",
  "FAQPage",
  "Organization",
] as const

export function buildSchema(input: SchemaInput): Record<string, unknown> {
  switch (input.kind) {
    case "Article":
      return buildArticleSchema(input)
    case "Product":
      return buildProductSchema(input)
    case "LocalBusiness":
      return buildLocalBusinessSchema(input)
    case "FAQPage":
      return buildFaqPageSchema(input)
    case "Organization":
      return buildOrganizationSchema(input)
  }
}

/**
 * Localize a schema input for a target locale by overriding `language`,
 * `canonicalUrl`, and any text fields supplied via `localizedFields`.
 *
 * The base input represents the default-locale source of truth; this function
 * produces a per-locale variant that can be passed to `buildSchema`.
 */
export function localizeSchemaInput<T extends SchemaInput>(
  base: T,
  targetLanguage: string,
  localizedCanonicalUrl: string,
  localizedFields: Partial<Record<keyof T, unknown>> = {},
): T {
  return {
    ...base,
    ...localizedFields,
    language: targetLanguage,
    canonicalUrl: localizedCanonicalUrl,
  } as T
}

export function serializeJsonLd(schema: Record<string, unknown>): string {
  return JSON.stringify(schema, null, 2)
}
