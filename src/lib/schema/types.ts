/**
 * Shared types for JSON-LD generation.
 *
 * We model schema as plain objects so they can be serialized with
 * `JSON.stringify(value, null, 2)` and embedded into <script type="application/ld+json">.
 */

export type SchemaKind =
  | "Article"
  | "Product"
  | "LocalBusiness"
  | "FAQPage"
  | "Organization"

export interface BaseSchemaInput {
  /** Canonical URL of the page this schema describes (default locale). */
  canonicalUrl: string
  /** BCP-47 language code, e.g. `en-US`, `zh-CN`. */
  language: string
  /** Optional URL of an alternate-language version of this same page. */
  alternateUrls?: Record<string, string>
}

export interface ArticleInput extends BaseSchemaInput {
  kind: "Article"
  headline: string
  description?: string
  image?: string
  authorName: string
  publisherName: string
  publisherUrl?: string
  publisherLogo?: string
  datePublished: string
  dateModified?: string
}

export interface ProductInput extends BaseSchemaInput {
  kind: "Product"
  name: string
  description?: string
  image?: string
  sku?: string
  brand?: string
  price?: number
  priceCurrency?: string
  availability?: "InStock" | "OutOfStock" | "PreOrder"
  ratingValue?: number
  ratingCount?: number
}

export interface LocalBusinessInput extends BaseSchemaInput {
  kind: "LocalBusiness"
  name: string
  description?: string
  image?: string
  telephone?: string
  streetAddress?: string
  addressLocality?: string
  addressRegion?: string
  postalCode?: string
  addressCountry?: string
  latitude?: number
  longitude?: number
  priceRange?: string
  openingHours?: string[]
}

export interface FaqPageInput extends BaseSchemaInput {
  kind: "FAQPage"
  questions: Array<{ question: string; answer: string }>
}

export interface OrganizationInput extends BaseSchemaInput {
  kind: "Organization"
  name: string
  description?: string
  url: string
  logo?: string
  sameAs?: string[]
  contactPoint?: {
    telephone: string
    contactType: string
    email?: string
    areaServed?: string[]
    availableLanguage?: string[]
  }
}

export type SchemaInput =
  | ArticleInput
  | ProductInput
  | LocalBusinessInput
  | FaqPageInput
  | OrganizationInput
