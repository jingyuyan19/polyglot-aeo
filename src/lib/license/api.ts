import { POLYGLOT_PRICING } from "../links"
import type {
  ActivateResponse,
  BillingMode,
  DeactivateResponse,
  ValidateResponse,
} from "./types"

/**
 * Cloudflare Worker base URL (no trailing slash).
 * Set in release builds — same pattern as Loka's WORKER_URL.
 */
export function licenseApiBase(): string | null {
  const fromEnv = import.meta.env.VITE_LICENSE_API_BASE as string | undefined
  const trimmed = fromEnv?.trim().replace(/\/$/, "")
  return trimmed || null
}

function isTestMode(mode?: BillingMode): boolean {
  if (mode) return mode === "test"
  return import.meta.env.VITE_CREEM_TEST_MODE === "true"
}

/**
 * Upgrade URL.
 *
 * Prefer Worker-generated checkout sessions so each click gets a fresh Creem
 * checkout with project metadata. Direct Creem URLs remain as an emergency
 * fallback for static builds.
 */
export function checkoutUrls(): { monthly: string; yearly: string } {
  const monthly = import.meta.env.VITE_CREEM_CHECKOUT_MONTHLY as
    | string
    | undefined
  const yearly = import.meta.env.VITE_CREEM_CHECKOUT_YEARLY as
    | string
    | undefined
  const base = licenseApiBase()
  const workerCheckout = base ? `${base}/checkout` : POLYGLOT_PRICING
  return {
    monthly: monthly?.trim() || workerCheckout,
    yearly: yearly?.trim() || monthly?.trim() || workerCheckout,
  }
}

export function buildCheckoutUrl(
  plan: "monthly" | "yearly",
  projectId?: string | null,
  billingMode?: BillingMode,
): string {
  const base =
    plan === "yearly" ? checkoutUrls().yearly : checkoutUrls().monthly
  const params = new URLSearchParams()
  if (base.includes("/checkout")) params.set("plan", plan)
  if (projectId) params.set("project_id", projectId)
  if (isTestMode(billingMode)) params.set("test_mode", "true")
  const query = params.toString()
  if (!query) return base
  const sep = base.includes("?") ? "&" : "?"
  return `${base}${sep}${query}`
}

async function postJson<T>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const base = licenseApiBase()
  if (!base) {
    throw new Error(
      "License API not configured. Set VITE_LICENSE_API_BASE to your Cloudflare Worker URL.",
    )
  }

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ||
        `License API error (${res.status})`,
    )
  }
  return data
}

export async function activateLicense(params: {
  key: string
  projectId: string
  instanceName?: string
  billingMode?: BillingMode
}): Promise<ActivateResponse> {
  try {
    const data = await postJson<ActivateResponse & { instance_id?: string }>(
      "/activate",
      {
        key: params.key.trim(),
        project_id: params.projectId,
        instance_name: params.instanceName ?? params.projectId,
        ...(isTestMode(params.billingMode) ? { test_mode: "true" } : {}),
      },
    )
    return data
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Activation failed",
    }
  }
}

export async function validateLicense(params: {
  key: string
  instanceId: string
  billingMode?: BillingMode
}): Promise<ValidateResponse> {
  try {
    return await postJson<ValidateResponse>("/validate", {
      key: params.key.trim(),
      instance_id: params.instanceId,
      ...(isTestMode(params.billingMode) ? { test_mode: "true" } : {}),
    })
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Validation failed",
    }
  }
}

export async function deactivateLicense(params: {
  key: string
  instanceId: string
  billingMode?: BillingMode
}): Promise<DeactivateResponse> {
  try {
    return await postJson<DeactivateResponse>("/deactivate", {
      key: params.key.trim(),
      instance_id: params.instanceId,
      ...(isTestMode(params.billingMode) ? { test_mode: "true" } : {}),
    })
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Deactivation failed",
    }
  }
}

/** Dev-only: treat as Pro when building locally without Creem. */
export function devProBypass(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_PRO === "true"
}
