import type { OrganizationInput } from "./types"

export function buildOrganizationSchema(input: OrganizationInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    inLanguage: input.language,
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.sameAs && input.sameAs.length > 0 ? { sameAs: input.sameAs } : {}),
  }

  if (input.contactPoint) {
    schema.contactPoint = {
      "@type": "ContactPoint",
      telephone: input.contactPoint.telephone,
      contactType: input.contactPoint.contactType,
      ...(input.contactPoint.email ? { email: input.contactPoint.email } : {}),
      ...(input.contactPoint.areaServed
        ? { areaServed: input.contactPoint.areaServed }
        : {}),
      ...(input.contactPoint.availableLanguage
        ? { availableLanguage: input.contactPoint.availableLanguage }
        : {}),
    }
  }

  return schema
}
