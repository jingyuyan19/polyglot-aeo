import type { MetaSetupSuggestField } from "./prompts"

/** True when AI output is effectively the same as what the user already has. */
export function metaSuggestMatchesCurrent(
  field: MetaSetupSuggestField,
  suggestion: string,
  current: string,
): boolean {
  const a = suggestion.trim()
  const b = current.trim()
  if (!a || !b) return false
  if (field === "pageType") {
    return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0
  }
  return a === b
}
