import { scriptCounts } from "./script-counts"

export function stripQuotedRegions(text: string): string {
  return text
    .replace(/「[^」]*」/g, "")
    .replace(/『[^』]*』/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/'[^']*'/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\u201c[^\u201d]*\u201d/g, "")
    .replace(/\u2018[^\u2019]*\u2019/g, "")
    .replace(/\[[^\]]*\]/g, "")
}

/** Latin brand/title lines often mix caps + lowercase ("Apex clothing Co."). */
const BRAND_LOOKBACK = 48
const CAPITALIZED_LATIN_BEFORE = /\b[A-Z][A-Za-z]{1,}\b/

export function hasLatinEmbeddedInCjk(text: string, minRun = 5): boolean {
  const stripped = stripQuotedRegions(text)
  const counts = scriptCounts(stripped)
  const hasTargetScript =
    counts.hiragana + counts.katakana + counts.han + counts.hangul > 0
  if (!hasTargetScript) return false

  const re = /[a-zA-Z][a-zA-Z_-]*[a-zA-Z]|[a-zA-Z]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(stripped)) !== null) {
    const run = match[0]
    if (run.length < minRun) continue
    const letters = run.replace(/[^a-zA-Z]/g, "")
    if (letters !== letters.toLowerCase()) continue
    const idx = match.index ?? 0
    const before = stripped.slice(
      Math.max(0, idx - BRAND_LOOKBACK),
      idx,
    )
    if (CAPITALIZED_LATIN_BEFORE.test(before)) continue
    return true
  }
  return false
}
