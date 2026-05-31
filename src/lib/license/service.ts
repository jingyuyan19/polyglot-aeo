import { framer } from "framer-plugin"

import {
  activateLicense,
  deactivateLicense,
  devProBypass,
  validateLicense,
} from "./api"
import {
  CACHE_TTL_MS,
  clearLicenseRecord,
  isCacheValid,
  readBillingMode,
  readLicenseRecord,
  tierFromRecord,
  writeBillingMode,
  writeLicenseRecord,
} from "./storage"
import type { BillingMode, LicenseRecord, Tier } from "./types"

export async function resolveProjectInstanceId(): Promise<string> {
  try {
    const info = await framer.getProjectInfo()
    return info.id
  } catch {
    return "unknown-project"
  }
}

export async function resolveCurrentTier(): Promise<{
  tier: Tier
  record: LicenseRecord | null
}> {
  if (devProBypass()) {
    return { tier: "pro", record: null }
  }
  const mode = await readBillingMode()
  const record = await readLicenseRecord(mode)
  return {
    tier: tierFromRecord(record, false),
    record,
  }
}

export async function resolveBillingMode(): Promise<BillingMode> {
  return readBillingMode()
}

export async function setLicenseBillingMode(
  mode: BillingMode,
): Promise<boolean> {
  return writeBillingMode(mode)
}

/**
 * Validate license when cache expired or forced. Falls back to cached Pro
 * tier for up to {@link CACHE_TTL_MS} when the network fails.
 */
export async function refreshLicenseTier(options?: {
  force?: boolean
}): Promise<{ tier: Tier; record: LicenseRecord | null; error?: string }> {
  if (devProBypass()) {
    return { tier: "pro", record: null }
  }

  const mode = await readBillingMode()
  const record = await readLicenseRecord(mode)
  if (!record) {
    return { tier: "free", record: null }
  }

  if (!options?.force && isCacheValid(record) && record.tier === "pro") {
    return { tier: "pro", record }
  }

  const instanceId = record.instanceId
  const result = await validateLicense({
    key: record.key,
    instanceId,
    billingMode: mode,
  })

  if (result.ok && result.tier === "pro") {
    const next: LicenseRecord = {
      ...record,
      billingMode: mode,
      instanceId,
      tier: "pro",
      validatedAt: Date.now(),
      cacheExpiresAt: Date.now() + CACHE_TTL_MS,
    }
    await writeLicenseRecord(next)
    return { tier: "pro", record: next }
  }

  if (result.ok && result.tier !== "pro") {
    await clearLicenseRecord(mode)
    return { tier: "free", record: null }
  }

  // Network / server error — offline grace while cache valid
  if (isCacheValid(record) && record.tier === "pro") {
    return { tier: "pro", record, error: result.error }
  }

  await clearLicenseRecord(mode)
  return { tier: "free", record: null, error: result.error }
}

export async function activateLicenseForProject(
  key: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = key.trim()
  if (!trimmed) {
    return { ok: false, error: "Enter a license key" }
  }

  const mode = await readBillingMode()
  const instanceId = await resolveProjectInstanceId()
  let instanceName = instanceId
  try {
    const info = await framer.getProjectInfo()
    instanceName = info.name || instanceId
  } catch {
    // use id
  }

  const result = await activateLicense({
    key: trimmed,
    projectId: instanceId,
    instanceName,
    billingMode: mode,
  })

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Activation failed" }
  }

  if (!result.instance_id) {
    return {
      ok: false,
      error: "Activation succeeded but no Creem instance id was returned",
    }
  }

  const storedInstanceId = result.instance_id

  await writeLicenseRecord({
    key: trimmed,
    instanceId: storedInstanceId,
    projectId: instanceId,
    billingMode: mode,
    tier: result.tier === "pro" ? "pro" : "free",
    validatedAt: Date.now(),
  })

  if (result.tier !== "pro") {
    return { ok: false, error: "License is not active for Pro" }
  }

  return { ok: true }
}

export async function deactivateLicenseForProject(
  record: LicenseRecord,
): Promise<{ ok: boolean; error?: string }> {
  if (!record.key || !record.instanceId) {
    return { ok: false, error: "No active license to deactivate" }
  }

  const result = await deactivateLicense({
    key: record.key,
    instanceId: record.instanceId,
    billingMode: record.billingMode ?? (await readBillingMode()),
  })

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Deactivation failed" }
  }

  return { ok: true }
}
