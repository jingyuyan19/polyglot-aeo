import type { FaqPageInput } from "./types"

export function buildFaqPageSchema(input: FaqPageInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: input.language,
    url: input.canonicalUrl,
    mainEntity: input.questions.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  }
}
