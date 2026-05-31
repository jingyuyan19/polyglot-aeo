import type { LocalBusinessInput } from "./types"

export function buildLocalBusinessSchema(input: LocalBusinessInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    inLanguage: input.language,
    name: input.name,
    url: input.canonicalUrl,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.priceRange ? { priceRange: input.priceRange } : {}),
  }

  if (
    input.streetAddress ||
    input.addressLocality ||
    input.addressRegion ||
    input.postalCode ||
    input.addressCountry
  ) {
    schema.address = {
      "@type": "PostalAddress",
      ...(input.streetAddress ? { streetAddress: input.streetAddress } : {}),
      ...(input.addressLocality ? { addressLocality: input.addressLocality } : {}),
      ...(input.addressRegion ? { addressRegion: input.addressRegion } : {}),
      ...(input.postalCode ? { postalCode: input.postalCode } : {}),
      ...(input.addressCountry ? { addressCountry: input.addressCountry } : {}),
    }
  }

  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: input.latitude,
      longitude: input.longitude,
    }
  }

  if (input.openingHours && input.openingHours.length > 0) {
    schema.openingHoursSpecification = input.openingHours
  }

  return schema
}
