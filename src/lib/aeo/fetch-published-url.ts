import { licenseApiBase } from "../license/api"
import { isPublicHttpsUrl } from "./verify-fetch-url"

export type FetchPublishedResult =
  | { ok: true; status: number; text: string; via: "direct" | "proxy" }
  | {
      ok: false
      status?: number
      reason: "http" | "blocked" | "invalid_url" | "network"
      error?: string
    }

const MAX_TEXT_CHARS = 1_500_000

async function parseProxyResponse(
  res: Response,
): Promise<FetchPublishedResult> {
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    status?: number
    text?: string
    error?: string
  }
  if (data.ok && typeof data.text === "string") {
    return {
      ok: true,
      status: data.status ?? res.status,
      text: data.text.slice(0, MAX_TEXT_CHARS),
      via: "proxy",
    }
  }
  return {
    ok: false,
    status: data.status,
    reason: "http",
    error: data.error ?? `HTTP ${res.status}`,
  }
}

async function fetchViaProxy(targetUrl: string): Promise<FetchPublishedResult> {
  const base = licenseApiBase()
  if (!base) return { ok: false, reason: "network", error: "no_proxy" }

  const proxyUrl = `${base}/verify-fetch?url=${encodeURIComponent(targetUrl)}`
  try {
    const res = await fetch(proxyUrl, { cache: "no-store" })
    if (!res.ok && res.status >= 500) {
      return {
        ok: false,
        reason: "network",
        error: `Proxy HTTP ${res.status}`,
      }
    }
    return parseProxyResponse(res)
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      error: e instanceof Error ? e.message : "Proxy fetch failed",
    }
  }
}

async function fetchDirect(targetUrl: string): Promise<FetchPublishedResult> {
  try {
    const res = await fetch(targetUrl, { cache: "no-store" })
    const text = (await res.text().catch(() => "")).slice(0, MAX_TEXT_CHARS)
    if (!res.ok) {
      return { ok: false, status: res.status, reason: "http", error: text }
    }
    return { ok: true, status: res.status, text, via: "direct" }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fetch failed"
    const blocked =
      /failed to fetch/i.test(message) ||
      /networkerror/i.test(message) ||
      /cors/i.test(message)
    return {
      ok: false,
      reason: blocked ? "blocked" : "network",
      error: message,
    }
  }
}

/**
 * Fetch a published URL for verification. Uses the license Worker proxy when
 * configured (Framer sites often block cross-origin reads from the plugin).
 */
export async function fetchPublishedText(
  targetUrl: string,
): Promise<FetchPublishedResult> {
  if (!isPublicHttpsUrl(targetUrl)) {
    return { ok: false, reason: "invalid_url" }
  }

  if (licenseApiBase()) {
    const proxied = await fetchViaProxy(targetUrl)
    if (proxied.ok || proxied.reason === "http") return proxied
  }

  return fetchDirect(targetUrl)
}
