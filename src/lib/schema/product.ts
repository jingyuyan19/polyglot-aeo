import type { ProductInput } from "./types"

export function buildProductSchema(input: ProductInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    inLanguage: input.language,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    ...(input.brand ? { brand: { "@type": "Brand", name: input.brand } } : {}),
    url: input.canonicalUrl,
  }

  if (typeof input.price === "number" && input.priceCurrency) {
    schema.offers = {
      "@type": "Offer",
      price: input.price,
      priceCurrency: input.priceCurrency,
      availability: `https://schema.org/${input.availability ?? "InStock"}`,
      url: input.canonicalUrl,
    }
  }

  if (typeof input.ratingValue === "number" && typeof input.ratingCount === "number") {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.ratingValue,
      ratingCount: input.ratingCount,
    }
  }

  return schema
}
