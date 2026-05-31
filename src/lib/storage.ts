import { framer } from "framer-plugin"

import { isAllowedTo } from "./framer/permissions"

/**
 * Typed wrapper around Framer's per-project plugin data store.
 *
 * Plugin data is scoped to (plugin × project) and persists across sessions.
 * It is NOT user-global, so each Framer project will see its own settings.
 * This is the right boundary for things like API keys, schema templates,
 * and brand voice — they belong to the site, not to the editor.
 *
 * Reads (`getPluginData`) are NOT protected by Framer's permission system,
 * so `readJson` / `readString` always go through. Writes (`setPluginData`)
 * ARE protected — we check `isAllowedTo("setPluginData")` per call so a
 * permission revocation surfaces as a no-op rather than an SDK error.
 *
 * The write helpers return `boolean` so callers that care about save
 * confirmation (e.g. settings UI) can react. Most call sites (debounced
 * draft persistence, telemetry-style toggles) treat persistence as best-
 * effort and ignore the return value — that's fine; the worst case is
 * a setting reverts to its default on next reload.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Capacity & strategy
 *
 * Framer's plugin data store has TWO hard limits:
 *   1. **2 KB per key** — assertion error on `setPluginData`.
 *   2. **4 KB combined per node** — assertion error after the cumulative
 *      payload across every key on the same node passes 4096 bytes.
 *
 * (1) is worked around here by transparent chunking (see below).
 * (2) is a fixed budget we cannot expand. Callers MUST treat plugin
 * data as a place for small, durable state only:
 *   - User settings (provider keys, brand voice, preferences).
 *   - Lightweight pointers (snapshot hashes, draft form values, etc.).
 * Heavy intermediates (full site maps, AI proposal lists with body
 * samples) MUST be kept in memory only and recomputed on demand.
 *
 * Chunking (per-key):
 * Larger values (a 7-page site map with body samples easily exceeds
 * 14 KB) trigger an SDK assertion that crashes the renderer. To survive
 * realistic state we transparently split values that cross
 * {@link CHUNK_BYTE_LIMIT} into multiple sibling keys. Note that
 * chunking only solves limit (1); (2) still applies to the SUM of
 * every chunk, so chunking large blobs is NOT a path to storing them.
 *
 * Wire format:
 *   - Small value (≤ limit): stored verbatim under `polyglot-aeo:<key>`,
 *     identical to the pre-chunking layout. No reader code change.
 *   - Large value (> limit): the primary key holds a tiny descriptor
 *     `{"__pa_chunks": N}` and chunks 0…N-1 live under
 *     `polyglot-aeo:<key>__c0` … `polyglot-aeo:<key>__cN-1`.
 *
 * The descriptor uses an unlikely-to-collide marker (`__pa_chunks`,
 * starting with double underscore) and we sniff for it via `startsWith`
 * to avoid a redundant `JSON.parse` on every read of a small value.
 * ─────────────────────────────────────────────────────────────────────
 */

const KEY_PREFIX = "polyglot-aeo:"

/**
 * Per-chunk byte budget. We aim well below the SDK's 2048 byte ceiling
 * so JSON wrappers, base64 expansion, and surrogate-pair edge cases
 * never push us over. 1500 leaves ~25% headroom which covers the worst
 * realistic case of dense Cyrillic / CJK content where every code
 * point is 3 UTF-8 bytes.
 */
const CHUNK_BYTE_LIMIT = 1500

const CHUNK_DESCRIPTOR_PREFIX = '{"__pa_chunks":'

/**
 * Encode `value` (which the SDK accepts as a UTF-16 string) and report
 * its UTF-8 byte length — that's what Framer counts toward the 2 KB
 * limit. `Blob` is the cheapest portable byte counter that doesn't
 * allocate a typed array.
 */
function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * Split a string into substrings each ≤ `maxBytes` of UTF-8, never
 * cutting across a code point. Iterating with `for…of` walks code
 * points (correctly pairing surrogates), and per-character byte cost
 * is computed by re-encoding — fine for our payload sizes (< 50 KB
 * total), and far simpler than maintaining a manual byte-counter.
 *
 * Empty input returns `[]` (caller treats that as "nothing to write").
 */
export function chunkUtf8String(value: string, maxBytes: number): string[] {
  if (!value) return []
  const enc = new TextEncoder()
  const out: string[] = []
  let buf = ""
  let bufBytes = 0
  for (const ch of value) {
    const chBytes = enc.encode(ch).length
    // A single character that exceeds the limit (theoretically possible
    // only with an absurd `maxBytes` < 4) would loop forever. Defensive:
    // emit it as its own oversize chunk; the caller's descriptor still
    // round-trips correctly because we reassemble by concatenation.
    if (chBytes > maxBytes) {
      if (buf) {
        out.push(buf)
        buf = ""
        bufBytes = 0
      }
      out.push(ch)
      continue
    }
    if (bufBytes + chBytes > maxBytes) {
      out.push(buf)
      buf = ch
      bufBytes = chBytes
    } else {
      buf += ch
      bufBytes += chBytes
    }
  }
  if (buf) out.push(buf)
  return out
}

/**
 * Read the previously written chunk count for `key`, returning 0 when
 * the value isn't (or wasn't) chunked. Used during writes to clear
 * leftover chunks when a value shrinks back below the limit, so we
 * don't leak stale tail bytes that would corrupt a later large write.
 */
async function readPriorChunkCount(key: string): Promise<number> {
  const raw = await framer.getPluginData(`${KEY_PREFIX}${key}`)
  if (!raw || !raw.startsWith(CHUNK_DESCRIPTOR_PREFIX)) return 0
  try {
    const meta = JSON.parse(raw) as { __pa_chunks?: number }
    return typeof meta.__pa_chunks === "number" ? meta.__pa_chunks : 0
  } catch {
    return 0
  }
}

/**
 * Erase chunks `[from, to)` on best effort. Errors are swallowed so a
 * partial GC doesn't cascade into a write failure. Called both when a
 * value shrinks and when a value is cleared.
 */
async function clearChunkRange(
  key: string,
  from: number,
  to: number,
): Promise<void> {
  for (let i = from; i < to; i++) {
    try {
      await framer.setPluginData(`${KEY_PREFIX}${key}__c${i}`, null)
    } catch {
      // ignore — best effort
    }
  }
}

/**
 * Internal: write any string value with transparent chunking. Both
 * `writeString` (raw strings) and `writeJson` (post-stringify) funnel
 * through here so the chunking invariant lives in one place.
 *
 * `value === null` clears the primary key AND every prior chunk.
 */
async function writeChunked(
  key: string,
  value: string | null,
): Promise<void> {
  const priorChunks = await readPriorChunkCount(key)

  if (value === null) {
    await framer.setPluginData(`${KEY_PREFIX}${key}`, null)
    await clearChunkRange(key, 0, priorChunks)
    return
  }

  const bytes = utf8ByteLength(value)
  if (bytes <= CHUNK_BYTE_LIMIT) {
    await framer.setPluginData(`${KEY_PREFIX}${key}`, value)
    // GC any leftover chunks from a previously larger value.
    await clearChunkRange(key, 0, priorChunks)
    return
  }

  const chunks = chunkUtf8String(value, CHUNK_BYTE_LIMIT)
  // Write chunks FIRST, descriptor LAST: a reader racing with us sees
  // either the old descriptor (consistent with old chunks) or the new
  // descriptor (consistent with new chunks). We can't be fully atomic
  // across N keys, but ordering this way avoids the worst failure mode
  // of "descriptor says 5 chunks, only 2 written".
  for (let i = 0; i < chunks.length; i++) {
    await framer.setPluginData(`${KEY_PREFIX}${key}__c${i}`, chunks[i])
  }
  await framer.setPluginData(
    `${KEY_PREFIX}${key}`,
    JSON.stringify({ __pa_chunks: chunks.length }),
  )
  // Drop any chunks that existed in the previous (larger) value.
  if (priorChunks > chunks.length) {
    await clearChunkRange(key, chunks.length, priorChunks)
  }
}

/**
 * Internal: read any string value with transparent chunk reassembly.
 * Returns the original raw string — callers that need JSON parse it
 * themselves.
 */
async function readChunked(key: string): Promise<string | null> {
  const raw = await framer.getPluginData(`${KEY_PREFIX}${key}`)
  if (raw === null || raw === undefined) return null

  if (!raw.startsWith(CHUNK_DESCRIPTOR_PREFIX)) {
    // Fast path: small value stored verbatim. Identical to the
    // pre-chunking layout — no reader migration needed.
    return raw
  }

  let meta: { __pa_chunks?: number }
  try {
    meta = JSON.parse(raw) as { __pa_chunks?: number }
  } catch {
    // Looked like a descriptor but isn't — treat as literal so we
    // don't lose data on an accidental collision.
    return raw
  }
  if (typeof meta.__pa_chunks !== "number") return raw

  const parts: string[] = []
  for (let i = 0; i < meta.__pa_chunks; i++) {
    const part = await framer.getPluginData(`${KEY_PREFIX}${key}__c${i}`)
    if (part === null || part === undefined) {
      // Missing chunk — value is corrupt. Returning null lets the
      // caller fall back to defaults rather than feed partial data
      // into a state machine.
      return null
    }
    parts.push(part)
  }
  return parts.join("")
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await readChunked(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJson<T>(key: string, value: T): Promise<boolean> {
  if (!isAllowedTo("setPluginData")) return false
  await writeChunked(key, JSON.stringify(value))
  return true
}

export async function readString(key: string): Promise<string | null> {
  return readChunked(key)
}

export async function writeString(
  key: string,
  value: string | null,
): Promise<boolean> {
  if (!isAllowedTo("setPluginData")) return false
  await writeChunked(key, value)
  return true
}

export const StorageKeys = {
  /** @deprecated Use `provider-key:anthropic` via apiKeyStorageKeyFor(). */
  AnthropicKey: "anthropic-key",
  /** @deprecated Use `provider-key:openai` via apiKeyStorageKeyFor(). */
  OpenAiKey: "openai-key",
  PreferredProvider: "preferred-provider",
  PreferredModel: "preferred-model",
  CustomProviders: "custom-providers",
  BrandVoice: "brand-voice",
  BaseUrl: "base-url",
  /**
   * @deprecated The reserved-but-unused slot from V1. V2 splits
   * site identity across the three keys below. Kept here only for
   * migration null-out (free up combined-budget bytes).
   */
  OrganizationDefaults: "organization-defaults",
  /**
   * V2 site identity — single canonical SiteIdentity for the
   * whole project. Drives Article publisher/author injection at
   * render time. Survives plugin reloads. ~250 B.
   *
   * See `docs/SCHEMA-ARCHITECTURE-V2.md` §5 for the persistence
   * model (staleness rules via `IdentitySourceHash`).
   */
  Identity: "identity",
  /**
   * V2 per-locale translations of the site identity. Keyed by
   * BCP-47 locale code (e.g. `ja`, `zh-CN`). Re-translated only
   * when brand changes or a new locale appears. ~250 B per locale.
   */
  IdentityTranslations: "identity-translations",
  /**
   * Hash of the input pages used to derive the cached identity.
   * On re-scan we recompute and short-circuit Phase 0/0.5 if
   * unchanged (`source !== "user-edit"`). ~64 B.
   */
  IdentitySourceHash: "identity-source-hash",
  LastSchemaSnapshot: "last-schema-snapshot",
  LastLlmsTxt: "last-llms-txt",
  /**
   * @deprecated SiteMap is too large for the 4 KB combined plugin
   * data budget — never persist it. Kept here only so the migration
   * step in SchemaAuditView can null this key out for users upgrading
   * from a build that mistakenly tried to persist it.
   */
  LastSiteMap: "last-sitemap",
  /**
   * @deprecated SchemaProposal arrays are too large for the 4 KB
   * combined plugin data budget — never persist. Kept here for the
   * migration null-out only. Re-scanning regenerates proposals.
   */
  LastProposals: "last-proposals",
  /** InstallSnapshot recording what's currently installed. */
  InstallSnapshot: "install-snapshot",
  /**
   * @deprecated Untranslated cells are derivative of `proposals`,
   * which we cannot persist (4 KB combined budget — see SchemaAuditView
   * mount comment). A persisted untranslated set without proposals
   * means the Translation Health panel renders with a dead retry
   * button (the handler bails on `!siteMap || !enabledProposals`),
   * which surfaced as user-reported drift. Now session-only. Kept
   * here for the migration null-out only.
   */
  AuditUntranslated: "audit-untranslated",
  /** UI preference: should we translate schema content per locale on install? */
  ScanTranslateContent: "scan-translate-content",
  UiLocalePreference: "ui-locale-preference",
  OnboardingDismissed: "onboarding-dismissed",
  DraftSchema: "draft-schema",
  DraftMeta: "draft-meta",
  /**
   * Last AI meta generation results (per locale). Small enough to persist
   * when N locales × ~1 KB JSON stays under plugin data budget.
   */
  LastMetaResults: "last-meta-results",
  /** Free-tier Meta AI sample generation count for this project. */
  FreeMetaGenerateCount: "free-meta-generate-count",
  /** Creem license record (key, instanceId, tier, cache TTL). ~300 B. */
  License: "license",
  /** Creem sandbox license record, isolated from production licenses. */
  LicenseTest: "license-test",
  /** Runtime billing environment for plugin-side checkout/license testing. */
  LicenseBillingMode: "license-billing-mode",
  /**
   * Pro-only compact schema audit workspace (snapshot hash + enabled map).
   * Must stay under combined 4 KB budget with other keys.
   */
  AuditWorkspacePersist: "audit-workspace-persist",
  /** Version string of last-applied remote schema rules (Pro). */
  RemoteSchemaRulesVersion: "remote-schema-rules-version",
} as const
