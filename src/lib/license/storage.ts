import {
  readJson,
  readString,
  StorageKeys,
  writeJson,
  writeString,
} from "../storage"
import { defaultBillingMode, normalizeBillingMode } from "./environment"
import type { BillingMode, LicenseRecord, Tier } from "./types"

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function maskLicenseKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 8) return "••••••••"
  return `••••-${trimmed.slice(-4)}`
}

function licenseStorageKey(mode: BillingMode): string {
  return mode === "test" ? StorageKeys.LicenseTest : StorageKeys.License
}

export async function readBillingMode(): Promise<BillingMode> {
  const stored = await readString(StorageKeys.LicenseBillingMode)
  if (stored === "test" || stored === "production") {
    return normalizeBillingMode(stored)
  }
  return defaultBillingMode()
}

export async function writeBillingMode(mode: BillingMode): Promise<boolean> {
  return writeString(StorageKeys.LicenseBillingMode, normalizeBillingMode(mode))
}

export async function readLicenseRecord(
  mode: BillingMode = "production",
): Promise<LicenseRecord | null> {
  const raw = await readJson<LicenseRecord | null>(
    licenseStorageKey(mode),
    null,
  )
  if (!raw?.key || !raw.instanceId) return null
  return { ...raw, billingMode: raw.billingMode ?? mode }
}

export async function writeLicenseRecord(
  input: Omit<LicenseRecord, "keyHint" | "cacheExpiresAt"> & {
    cacheExpiresAt?: number
  },
): Promise<boolean> {
  const mode = input.billingMode ?? "production"
  const record: LicenseRecord = {
    ...input,
    billingMode: mode,
    keyHint: maskLicenseKey(input.key),
    cacheExpiresAt: input.cacheExpiresAt ?? Date.now() + CACHE_TTL_MS,
  }
  return writeJson(licenseStorageKey(mode), record)
}

export async function clearLicenseRecord(
  mode: BillingMode = "production",
): Promise<boolean> {
  return writeString(licenseStorageKey(mode), null)
}

export function isCacheValid(record: LicenseRecord): boolean {
  return Date.now() < record.cacheExpiresAt
}

export function tierFromRecord(
  record: LicenseRecord | null,
  devPro: boolean,
): Tier {
  if (devPro) return "pro"
  if (!record) return "free"
  return record.tier === "pro" ? "pro" : "free"
}

export { CACHE_TTL_MS }
