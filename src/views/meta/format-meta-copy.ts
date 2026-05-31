import type { GeneratedMeta } from "./types"

export interface MetaFieldLabels {
  title: string
  metaDescription: string
  ogTitle: string
  ogDescription: string
  twitterTitle: string
  twitterDescription: string
}

/** Plain-text block for pasting into Framer Page SEO fields. */
export function formatMetaCopyBlock(
  parsed: GeneratedMeta,
  labels: MetaFieldLabels,
): string {
  const lines: string[] = []
  const add = (label: string, value?: string) => {
    if (value?.trim()) lines.push(`${label}\n${value.trim()}`)
  }
  add(labels.title, parsed.title)
  add(labels.metaDescription, parsed.metaDescription)
  add(labels.ogTitle, parsed.ogTitle)
  add(labels.ogDescription, parsed.ogDescription)
  add(labels.twitterTitle, parsed.twitterTitle)
  add(labels.twitterDescription, parsed.twitterDescription)
  return lines.join("\n\n")
}
