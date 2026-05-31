export interface JsonLdVerification {
  schemaCount: number
  parseErrorCount: number
  languages: string[]
}

function stripTags(script: string): string {
  return script
    .replace(/^<script\b[^>]*>/i, "")
    .replace(/<\/script>$/i, "")
    .trim()
}

export function extractJsonLdScripts(html: string): string[] {
  const scripts: string[] = []
  const pattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    scripts.push(stripTags(match[0]))
  }
  return scripts
}

function collectLanguages(value: unknown, out: Set<string>): void {
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const item of value) collectLanguages(item, out)
    return
  }
  const obj = value as Record<string, unknown>
  const language = obj.inLanguage
  if (typeof language === "string" && language.trim()) {
    out.add(language.trim())
  } else if (Array.isArray(language)) {
    for (const item of language) {
      if (typeof item === "string" && item.trim()) out.add(item.trim())
    }
  }
  for (const nested of Object.values(obj)) {
    collectLanguages(nested, out)
  }
}

export function verifyJsonLdHtml(html: string): JsonLdVerification {
  const scripts = extractJsonLdScripts(html)
  const languages = new Set<string>()
  let parseErrorCount = 0

  for (const script of scripts) {
    try {
      collectLanguages(JSON.parse(script), languages)
    } catch {
      parseErrorCount += 1
    }
  }

  return {
    schemaCount: scripts.length,
    parseErrorCount,
    languages: Array.from(languages).sort(),
  }
}

export function llmsFilenameForLocale(locale: {
  code: string
  isDefault: boolean
}): string {
  return locale.isDefault ? "llms.txt" : `llms-${locale.code.toLowerCase()}.txt`
}
