import type { ArticleInput } from "./types"

export function buildArticleSchema(input: ArticleInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    inLanguage: input.language,
    headline: input.headline,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": input.canonicalUrl,
    },
    author: {
      "@type": "Person",
      name: input.authorName,
    },
    publisher: {
      "@type": "Organization",
      name: input.publisherName,
      ...(input.publisherUrl ? { url: input.publisherUrl } : {}),
      ...(input.publisherLogo
        ? { logo: { "@type": "ImageObject", url: input.publisherLogo } }
        : {}),
    },
    datePublished: input.datePublished,
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
  }

  if (input.alternateUrls && Object.keys(input.alternateUrls).length > 0) {
    schema.workTranslation = Object.entries(input.alternateUrls).map(([lang, url]) => ({
      "@type": "Article",
      inLanguage: lang,
      url,
    }))
  }

  return schema
}
