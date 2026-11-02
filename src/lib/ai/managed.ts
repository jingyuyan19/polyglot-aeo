import { licenseApiBase } from "../license/api"
import { readBillingMode, readLicenseRecord } from "../license/storage"
import type { MetaPromptOutput } from "./prompts"
import { safeJsonParse } from "./providers/types"

export const MANAGED_PROVIDER_ID = "polyglot-managed"
export const MANAGED_MODEL_ID = "MiniMax-M3"
export const MANAGED_AI_KEY_SENTINEL = "__polyglot_managed_ai__"

interface ManagedAiSession {
  token: string
  expiresAt: number
  mode: "production" | "test"
  instanceId: string
}

interface ManagedAiResponse {
  ok: boolean
  rawText?: string
  tokensIn?: number
  tokensOut?: number
  estimatedCostRmb?: number
  model?: string
  error?: string
}

let cachedSession: ManagedAiSession | null = null

export function isManagedAiEnabled(): boolean {
  const explicit = import.meta.env.VITE_MANAGED_AI?.trim().toLowerCase()
  if (explicit === "false" || explicit === "0") return false
  if (explicit === "true" || explicit === "1") return true
  return Boolean(licenseApiBase())
}

export function isManagedProviderId(providerId: string): boolean {
  return providerId === MANAGED_PROVIDER_ID
}

function requestId(feature: string, prompt: MetaPromptOutput): string {
  const seed = `${feature}:${prompt.system.length}:${prompt.user.length}:${Date.now()}:${Math.random()}`
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `pa-${btoa(seed).replace(/[^a-z0-9]/gi, "").slice(0, 48)}`
}

async function postManagedJson<T>(
  path: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const base = licenseApiBase()
  if (!base) {
    throw new Error("Managed AI backend is not configured.")
  }
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.error || `Managed AI error (${res.status})`)
  }
  return data
}

async function getManagedAiSession(): Promise<ManagedAiSession> {
  const mode = await readBillingMode()
  const record = await readLicenseRecord(mode)
  if (!record || record.tier !== "pro") {
    throw new Error("Polyglot Managed AI requires an active Pro license.")
  }

  if (
    cachedSession &&
    cachedSession.mode === mode &&
    cachedSession.instanceId === record.instanceId &&
    cachedSession.expiresAt - Date.now() > 60_000
  ) {
    return cachedSession
  }

  const data = await postManagedJson<{
    ok: boolean
    token: string
    expiresAt: number
  }>("/ai/session", {
    key: record.key,
    instance_id: record.instanceId,
    project_id: record.projectId ?? "",
    ...(mode === "test" ? { test_mode: "true" } : {}),
  })

  if (!data.ok || !data.token || !data.expiresAt) {
    throw new Error("Managed AI session could not be created.")
  }

  cachedSession = {
    token: data.token,
    expiresAt: data.expiresAt,
    mode,
    instanceId: record.instanceId,
  }
  return cachedSession
}

export async function callManagedAi(options: {
  prompt: MetaPromptOutput
  maxTokens?: number
  feature?: string
}): Promise<{
  rawText: string
  parsed: unknown
  tokensIn?: number
  tokensOut?: number
  estimatedCostUsd?: number
  estimatedCostRmb?: number
}> {
  const feature = options.feature ?? "generic_generation"
  const session = await getManagedAiSession()
  const data = await postManagedJson<ManagedAiResponse>(
    "/ai/generate",
    {
      feature,
      prompt: options.prompt,
      max_tokens: options.maxTokens,
      idempotency_key: requestId(feature, options.prompt),
    },
    session.token,
  )

  if (!data.ok) {
    throw new Error(data.error || "Managed AI request failed.")
  }

  const rawText = data.rawText ?? ""
  return {
    rawText,
    parsed: safeJsonParse(rawText),
    tokensIn: data.tokensIn,
    tokensOut: data.tokensOut,
    estimatedCostRmb: data.estimatedCostRmb,
    // UI expects USD in existing cost pills. RMB/7.2 is only a display
    // approximation; backend quota accounting uses RMB.
    estimatedCostUsd:
      typeof data.estimatedCostRmb === "number"
        ? data.estimatedCostRmb / 7.2
        : undefined,
  }
}
