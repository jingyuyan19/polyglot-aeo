import type { InstallSnapshot } from "../framer/snapshot"
import { readJson, StorageKeys, writeJson } from "../storage"

/**
 * Pro-only compact audit workspace. Stores enough to show install
 * summary and enabled-page map after panel reload — not full proposals.
 */
export interface AuditWorkspacePersist {
  version: 1
  savedAt: number
  /** Hash of site scan inputs when audit last completed. */
  sourceHash: string
  pageCount: number
  enabledPageIds: string[]
  snapshot: InstallSnapshot | null
}

export async function readAuditWorkspacePersist(): Promise<AuditWorkspacePersist | null> {
  const raw = await readJson<AuditWorkspacePersist | null>(
    StorageKeys.AuditWorkspacePersist,
    null,
  )
  if (!raw || raw.version !== 1) return null
  return raw
}

export async function writeAuditWorkspacePersist(
  data: Omit<AuditWorkspacePersist, "version" | "savedAt">,
): Promise<boolean> {
  const payload: AuditWorkspacePersist = {
    version: 1,
    savedAt: Date.now(),
    ...data,
  }
  const json = JSON.stringify(payload)
  if (new TextEncoder().encode(json).length > 900) {
    return false
  }
  return writeJson(StorageKeys.AuditWorkspacePersist, payload)
}

export async function clearAuditWorkspacePersist(): Promise<boolean> {
  return writeJson(StorageKeys.AuditWorkspacePersist, null)
}
