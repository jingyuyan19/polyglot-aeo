import { zipSync } from "fflate"

import { encodeUtf8TextFile } from "../../lib/download-text"
import type { MetaFieldLabels } from "./format-meta-copy"
import { formatMetaCopyBlock } from "./format-meta-copy"
import type { MetaResult } from "./types"

function safeSlug(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "page"
}

/** One locale — ready to paste into Framer page SEO fields. */
export function formatMetaLocaleExport(
  result: MetaResult,
  labels: MetaFieldLabels,
  options?: { pageTitle?: string; pagePath?: string },
): string {
  const header = [
    `# Polyglot AEO — Meta (${result.localeCode})`,
    options?.pageTitle
      ? `Page: ${options.pageTitle}${options.pagePath ? ` (${options.pagePath})` : ""}`
      : null,
    `Locale: ${result.localeName} (${result.language})`,
    "",
  ].filter((line): line is string => line !== null)

  if (!result.parsed) {
    return [...header, result.rawText || "(parse failed)"].join("\n")
  }

  return [...header, formatMetaCopyBlock(result.parsed, labels)].join("\n")
}

export function metaLocaleFilename(
  localeCode: string,
  pageTitle?: string,
): string {
  return `meta-${safeSlug(pageTitle ?? "page")}-${localeCode}.txt`
}

export function buildMetaZipArchive(
  results: MetaResult[],
  labels: MetaFieldLabels,
  options?: { pageTitle?: string; pagePath?: string },
): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  for (const row of results) {
    if (!row.parsed && !row.rawText) continue
    const name = metaLocaleFilename(row.localeCode, options?.pageTitle)
    files[name] = encodeUtf8TextFile(
      formatMetaLocaleExport(row, labels, options),
    )
  }
  return zipSync(files)
}
