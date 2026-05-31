/** Max body characters appended after title + description. */
export const PAGE_CONTEXT_BODY_MAX = 1200

/**
 * Build the page-context blob designers paste (or we auto-fill) for
 * meta generation. Mirrors Schema scan samples: H1, lede, then body.
 */
export function buildPageContextFromScan(content: {
  title: string | null
  description: string | null
  bodyText: string
}): string {
  const parts: string[] = []
  const title = (content.title ?? "").trim()
  const description = (content.description ?? "").trim()
  const body = (content.bodyText ?? "").trim().slice(0, PAGE_CONTEXT_BODY_MAX)

  if (title) parts.push(`# ${title}`)
  if (description) parts.push(description)
  if (body && body !== description) parts.push(body)

  return parts.join("\n\n").trim()
}

/** Lightweight page-type guess from context text (no AI). */
export function suggestPageTypeFromContext(context: string): string | null {
  const lower = context.toLowerCase()
  if (/\b(pricing|price plan|subscription|buy now)\b/.test(lower)) {
    return "Product page"
  }
  if (/\b(blog|article|posted on|read more)\b/.test(lower)) {
    return "Blog post"
  }
  if (/\b(faq|frequently asked)\b/.test(lower)) {
    return "FAQ page"
  }
  if (/\b(contact|get in touch|email us)\b/.test(lower)) {
    return "Contact page"
  }
  if (/\b(about us|our story|who we are)\b/.test(lower)) {
    return "About page"
  }
  return null
}
