import { framer } from "framer-plugin"

import { isAllowedTo } from "./permissions"

export type CodeLocation = "headStart" | "headEnd" | "bodyStart" | "bodyEnd"

/**
 * Error thrown when the plugin lacks `setCustomCode` permission. Distinct
 * class so the UI layer can render a permission-specific recovery hint
 * (e.g. "ask the project owner to grant Custom Code permission") rather
 * than a generic "install failed" message.
 *
 * The error code (`name`) is stable so i18n lookup keys can map to it.
 */
export class CustomCodePermissionError extends Error {
  override name = "CustomCodePermissionError"
}

/**
 * Fence markers used to identify Polyglot AEO–owned blocks inside Framer's
 * Custom Code slots.
 *
 * Framer's `setCustomCode` API replaces an entire slot at a time, so the only
 * way to coexist with user-authored snippets (GA, Hotjar, Stripe, etc.) is to
 * read the existing slot, surgically remove our previous fenced block (if
 * any), append the new one, and write the merged result back.
 *
 * Never change these constants without a migration path — older installs in
 * the wild will have written blocks fenced by the old strings.
 */
export const FENCE_OPEN = "<!-- polyglot-aeo:start -->"
export const FENCE_CLOSE = "<!-- polyglot-aeo:end -->"

/**
 * Pre-compiled regex matching one fenced block, including the surrounding
 * whitespace/newlines. The `g` flag lets us strip multiple fences if a
 * historical bug ever produced duplicates.
 *
 * `[\s\S]*?` is the lazy "match anything across newlines" trick — JS regex
 * has no `s` flag in older targets, so we use the character class union.
 */
const FENCE_REGEX = new RegExp(
  `\\s*${escapeRegex(FENCE_OPEN)}[\\s\\S]*?${escapeRegex(FENCE_CLOSE)}\\s*`,
  "g",
)

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// ─────────────────────────────────────────────────────────────────────
// Pure functions — no Framer API access. These are unit-tested in
// `customCode.test.ts` because they are the safety-critical core.
// ─────────────────────────────────────────────────────────────────────

export interface JsonLdBlock {
  language: string
  jsonLd: string
}

const MAX_JSON_LD_LENGTH = 64_000
const MAX_JSON_LD_DEPTH = 16
// Framer locale codes ("en", "zh-CN", "default"): never quotes or brackets.
const LANGUAGE_CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,34}$/
const SCHEMA_TYPE = /^[A-Za-z][A-Za-z0-9]{0,63}$/
const SCHEMA_CONTEXT = /^https?:\/\/schema\.org\/?$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasSchemaType(node: Record<string, unknown>): boolean {
  const type = node["@type"]
  if (typeof type === "string") return SCHEMA_TYPE.test(type)
  return Array.isArray(type) && type.length > 0 &&
    type.every((t) => typeof t === "string" && SCHEMA_TYPE.test(t))
}

function hasSchemaContext(node: Record<string, unknown>): boolean {
  const context = node["@context"]
  if (typeof context === "string") return SCHEMA_CONTEXT.test(context)
  return Array.isArray(context) && typeof context[0] === "string" &&
    SCHEMA_CONTEXT.test(context[0])
}

function depthOf(value: unknown): number {
  if (Array.isArray(value)) return 1 + Math.max(0, ...value.map(depthOf))
  if (isPlainObject(value)) return 1 + Math.max(0, ...Object.values(value).map(depthOf))
  return 0
}

/**
 * Central guard for everything Polyglot AEO writes into the page head: only a
 * schema.org JSON-LD document (an object with a schema.org @context and either
 * a @type or a non-empty @graph of typed objects) may pass.
 */
export function assertSchemaOrgJsonLd(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error("Polyglot AEO refused to install non-object JSON-LD.")
  }
  if (!hasSchemaContext(value)) {
    throw new Error("Polyglot AEO refused to install JSON-LD without a schema.org @context.")
  }
  const graph = value["@graph"]
  const typed = graph === undefined
    ? hasSchemaType(value)
    : Array.isArray(graph) && graph.length > 0 &&
      graph.every((node) => isPlainObject(node) && hasSchemaType(node))
  if (!typed) {
    throw new Error("Polyglot AEO refused to install JSON-LD without a valid schema.org @type.")
  }
  if (depthOf(value) > MAX_JSON_LD_DEPTH) {
    throw new Error("Polyglot AEO refused to install JSON-LD nested too deeply.")
  }
}

/**
 * Wrap N JSON-LD blocks into one fenced HTML string ready to inject.
 * Returns an empty string when given no blocks (caller should treat that
 * as "do not write anything").
 */
export function wrapJsonLdBlocks(blocks: JsonLdBlock[]): string {
  if (blocks.length === 0) return ""

  const inner = blocks
    .map(
      ({ language, jsonLd }) => {
        if (!LANGUAGE_CODE.test(language)) {
          throw new Error("Polyglot AEO refused to install JSON-LD for an invalid language code.")
        }
        const normalized = normalizeJsonLdForScript(jsonLd)
        return `  <script type="application/ld+json" data-polyglot-aeo data-lang="${escapeAttr(
          language,
        )}">\n${normalized}\n  </script>`
      },
    )
    .join("\n")

  return `${FENCE_OPEN}\n${inner}\n${FENCE_CLOSE}`
}

export function normalizeJsonLdForScript(jsonLd: string): string {
  if (jsonLd.length > MAX_JSON_LD_LENGTH) {
    throw new Error("Polyglot AEO refused to install oversized JSON-LD.")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonLd)
  } catch {
    throw new Error("Polyglot AEO refused to install invalid JSON-LD.")
  }
  assertSchemaOrgJsonLd(parsed)
  // JSON unicode escapes keep the payload valid JSON-LD while making it
  // impossible for any string value to open or close an HTML tag.
  return JSON.stringify(parsed, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
}

/**
 * Remove every Polyglot AEO–owned fenced block from `existing`, returning
 * everything else verbatim. Whitespace is normalized so that repeatedly
 * installing/uninstalling does not leave trailing blank lines.
 *
 * @param existing  raw HTML currently in the Custom Code slot (may be null)
 * @returns         the user-authored remainder, or an empty string when the
 *                  slot is empty / contains only our fence
 */
export function stripFencedBlock(existing: string | null | undefined): string {
  if (!existing) return ""
  const stripped = existing.replace(FENCE_REGEX, "\n")
  return stripped.trim()
}

/**
 * Compute the next slot value when (re)installing our fenced block.
 *
 * Rules:
 *   1. The user's existing code outside our fence is preserved verbatim.
 *   2. Any previous Polyglot AEO fence is removed before appending the new
 *      one — repeatedly hitting "Install" never compounds blocks.
 *   3. Our fence is always appended *after* user code, so user-priority
 *      analytics scripts that need to load first stay first.
 *   4. Returns `null` when the merged result is empty so we don't leave an
 *      empty string in the slot (Framer treats null as "no code").
 */
export function mergeForInstall(
  existing: string | null | undefined,
  fencedBlock: string,
): string | null {
  const userCode = stripFencedBlock(existing)
  if (fencedBlock.length === 0) {
    return userCode.length > 0 ? userCode : null
  }
  const merged =
    userCode.length > 0 ? `${userCode}\n\n${fencedBlock}` : fencedBlock
  return merged
}

/**
 * Compute the next slot value when uninstalling our fenced block.
 * Always preserves user code; returns `null` if there's nothing left.
 */
export function mergeForUninstall(
  existing: string | null | undefined,
): string | null {
  const userCode = stripFencedBlock(existing)
  return userCode.length > 0 ? userCode : null
}

/**
 * Return the byte size of user-authored code in the slot, ignoring our
 * fence. Useful for surfacing an "X bytes of your code preserved" hint
 * before destructive operations.
 */
export function userCodeSize(existing: string | null | undefined): number {
  return stripFencedBlock(existing).length
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ─────────────────────────────────────────────────────────────────────
// Thin async wrappers around Framer's Custom Code API. All actual safety
// logic lives in the pure functions above so it can be tested in isolation.
// ─────────────────────────────────────────────────────────────────────

async function readSlot(): Promise<string | null> {
  const code = await framer.getCustomCode()
  return code?.headEnd?.html ?? null
}

/**
 * Single chokepoint for every Custom Code mutation — keeps the permission
 * check, the {@link CustomCodePermissionError} mapping, and the actual
 * SDK call in one place. Callers must use this; importing `framer` and
 * calling `setCustomCode` directly bypasses our safety net.
 */
async function writeHeadEnd(html: string | null): Promise<void> {
  if (!isAllowedTo("setCustomCode")) {
    throw new CustomCodePermissionError(
      "Polyglot AEO needs Custom Code permission to install or remove schema. Ask the Framer project owner to grant the plugin Custom Code access.",
    )
  }
  await framer.setCustomCode({ html, location: "headEnd" })
}

/**
 * Install (or reinstall) our fenced block into Framer's `headEnd` slot,
 * preserving any user-authored code that's already there.
 *
 * Takes structured blocks, never HTML: the fenced markup is built here from
 * guarded JSON-LD, so no caller can route arbitrary HTML into the page head.
 *
 * Returns metadata so the UI can show "preserved N bytes of your code".
 *
 * Throws {@link CustomCodePermissionError} when the plugin lacks
 * permission — UI layer should catch and render the recovery hint.
 */
export async function injectIntoHeadEnd(blocks: JsonLdBlock[]): Promise<{
  preservedUserBytes: number
}> {
  const fencedBlock = wrapJsonLdBlocks(blocks)
  const existing = await readSlot()
  const preservedUserBytes = userCodeSize(existing)
  const next = mergeForInstall(existing, fencedBlock)
  await writeHeadEnd(next)
  return { preservedUserBytes }
}

/**
 * Remove every Polyglot AEO–owned fenced block from `headEnd`, leaving
 * the user's own snippets intact.
 *
 * Throws {@link CustomCodePermissionError} when the plugin lacks
 * permission.
 */
export async function clearAllInjected(): Promise<{
  preservedUserBytes: number
}> {
  const existing = await readSlot()
  const preservedUserBytes = userCodeSize(existing)
  const next = mergeForUninstall(existing)
  await writeHeadEnd(next)
  return { preservedUserBytes }
}

/**
 * Snapshot the entire `headEnd` slot verbatim (including any user code
 * AND any previously installed Polyglot AEO fence). Used by the Undo
 * flow — calling `restoreHeadEndRaw(snapshot)` exactly reverts whatever
 * Install just did.
 */
export async function readHeadEndRaw(): Promise<string | null> {
  return readSlot()
}

/**
 * Counterpart to `readHeadEndRaw` — write the slot back verbatim.
 *
 * Throws {@link CustomCodePermissionError} when the plugin lacks
 * permission. Callers (Undo flow) must surface this so the user knows
 * their previous Custom Code has NOT been restored and they should
 * intervene manually.
 */
export async function restoreHeadEndRaw(html: string | null): Promise<void> {
  await writeHeadEnd(html === "" ? null : html)
}

export async function readInstalledStatus(): Promise<{
  installed: boolean
  disabled: boolean
}> {
  const code = await framer.getCustomCode()
  const block = code?.headEnd
  if (!block || !block.html) return { installed: false, disabled: false }
  return {
    installed: block.html.includes(FENCE_OPEN),
    disabled: Boolean(block.disabled),
  }
}
