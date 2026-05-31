import type { FaqPageInput, SchemaInput } from "./types"

/**
 * Pure helpers used by `ProposalEditor` and `ProposalCard`.
 *
 * Lives outside the React component so the invariants the user-visible
 * behavior depends on (Reset returns originalInputs verbatim, Cancel
 * is a no-op vs Save, FAQ row mutations don't lose adjacent rows) are
 * unit-testable without mounting the component tree.
 */

/**
 * Deep-clone a `SchemaInput` for use as form draft state.
 *
 * `structuredClone` handles the nested `questions` array (FAQPage) and
 * `contactPoint` object (Organization) without surprises. Using it here
 * keeps callers from needing to know which kind has nested data.
 */
export function cloneInputs(input: SchemaInput): SchemaInput {
  return structuredClone(input)
}

/**
 * Has the user edited `inputs` away from the AI's `originalInputs`?
 *
 * We compare via JSON serialization rather than deep-equal because:
 *   - SchemaInput is JSON-serializable by construction (no Date / Map / Set)
 *   - Cost is O(payload size), well under a millisecond per card
 *   - Field order is stable inside a single session — the editor only
 *     ever spreads patches onto the existing draft, never reorders keys
 *
 * Returns true even for trivial whitespace-only edits — that's the
 * point. A user who adds a stray space and clicks Save deserves the
 * "Edited" pill so they remember what they did.
 */
export function isEditedFromOriginal(
  inputs: SchemaInput,
  originalInputs: SchemaInput,
): boolean {
  return JSON.stringify(inputs) !== JSON.stringify(originalInputs)
}

// ────────────────────────────────────────────────────────────────────
// FAQPage row helpers — the only kind whose editor mutates nested
// arrays. Extracted because the +/- semantics (don't drop adjacent
// rows, never let questions go empty) are easy to break by accident.
// ────────────────────────────────────────────────────────────────────

const EMPTY_QUESTION = { question: "", answer: "" }

/**
 * Append a new blank question. Returns a new array; original is not
 * mutated.
 */
export function addFaqQuestion(
  questions: FaqPageInput["questions"],
): FaqPageInput["questions"] {
  return [...questions, { ...EMPTY_QUESTION }]
}

/**
 * Remove the question at `idx`. Refuses to remove the only remaining
 * question — callers should disable the Remove button when length ≤ 1
 * (the editor does), but this is a defensive belt-and-braces guard.
 */
export function removeFaqQuestion(
  questions: FaqPageInput["questions"],
  idx: number,
): FaqPageInput["questions"] {
  if (questions.length <= 1) return questions
  if (idx < 0 || idx >= questions.length) return questions
  return questions.filter((_, i) => i !== idx)
}

/**
 * Patch one field of one question. Other rows are returned by
 * reference — no unnecessary clones — so React's reconciliation only
 * re-renders the touched row.
 */
export function updateFaqQuestion(
  questions: FaqPageInput["questions"],
  idx: number,
  patch: Partial<{ question: string; answer: string }>,
): FaqPageInput["questions"] {
  if (idx < 0 || idx >= questions.length) return questions
  return questions.map((q, i) => (i === idx ? { ...q, ...patch } : q))
}
