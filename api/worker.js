/**
 * Polyglot AEO — Creem license proxy (Cloudflare Worker)
 *
 * Same pattern as Loka: plugin never holds CREEM_API_KEY.
 *
 * GET  /checkout?plan=monthly|yearly&project_id=...
 * POST /activate  { key, instance_name?, project_id?, test_mode? }
 * POST /validate  { key, instance_id, test_mode? }
 * POST /deactivate { key, instance_id, test_mode? }
 * GET  /health
 *
 * Secrets: wrangler secret put CREEM_API_KEY
 *          wrangler secret put CREEM_TEST_API_KEY
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  })
}

function errorResponse(message, status = 400) {
  return jsonResponse({ ok: false, error: message }, status)
}

function redirectResponse(location, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      ...CORS_HEADERS,
    },
  })
}

function creemBaseUrl(testMode) {
  return testMode ? "https://test-api.creem.io/v1" : "https://api.creem.io/v1"
}

function safeMetadataValue(value, maxLength = 160) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function licenseActive(data) {
  if (!data || typeof data !== "object") return false
  const status = data.status ?? data.license_status
  if (status === "active" || status === "valid") return true
  if (data.valid === true || data.is_valid === true) return true
  return false
}

function licenseInstanceId(data) {
  if (!data || typeof data !== "object") return null

  const direct = data.instance_id ?? data.instanceId
  if (typeof direct === "string" && direct.trim()) return direct.trim()

  const instance = data.instance
  if (Array.isArray(instance)) {
    const active = instance.find((item) => item?.status === "active")
    const chosen = active ?? instance[0]
    return typeof chosen?.id === "string" && chosen.id.trim()
      ? chosen.id.trim()
      : null
  }

  if (instance && typeof instance === "object") {
    return typeof instance.id === "string" && instance.id.trim()
      ? instance.id.trim()
      : null
  }

  return null
}

async function createCheckout({ env, url, testMode }) {
  const apiKey = testMode ? env.CREEM_TEST_API_KEY : env.CREEM_API_KEY
  if (!apiKey) {
    return errorResponse("Server configuration error: API key not set", 500)
  }

  const plan = url.searchParams.get("plan") === "yearly" ? "yearly" : "monthly"
  const productId = testMode
    ? plan === "yearly"
      ? env.CREEM_TEST_PRODUCT_YEARLY
      : env.CREEM_TEST_PRODUCT_MONTHLY
    : plan === "yearly"
      ? env.CREEM_PRODUCT_YEARLY
      : env.CREEM_PRODUCT_MONTHLY

  if (!productId) {
    return errorResponse(
      testMode
        ? "Server configuration error: test product id not set"
        : "Server configuration error: product id not set",
      500,
    )
  }

  const projectId = safeMetadataValue(url.searchParams.get("project_id"))
  const discountCode = safeMetadataValue(url.searchParams.get("discount"), 64)
  const successUrl =
    safeMetadataValue(url.searchParams.get("success_url"), 512) ||
    env.CREEM_SUCCESS_URL ||
    "https://polyglotaeo.com/success"

  const requestId = [
    "polyglot-aeo",
    plan,
    projectId ?? "no-project",
    Date.now().toString(36),
  ].join("-")

  const payload = {
    product_id: productId,
    request_id: requestId,
    units: 1,
    success_url: successUrl,
    metadata: {
      source: "framer_plugin",
      plan,
      ...(projectId ? { projectId } : {}),
    },
    ...(discountCode ? { discount_code: discountCode } : {}),
  }

  const result = await callCreemAPI(
    `${creemBaseUrl(testMode)}/checkouts`,
    apiKey,
    payload,
  )

  if (!result.success) {
    return errorResponse(result.error, 502)
  }

  const checkoutUrl = result.data?.checkout_url
  if (typeof checkoutUrl !== "string" || !checkoutUrl.trim()) {
    return errorResponse("Creem checkout did not return a checkout URL", 502)
  }

  return redirectResponse(checkoutUrl)
}

async function callCreemAPI(endpoint, apiKey, body) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        success: false,
        error: data.message || data.error || `Creem API error (${res.status})`,
      }
    }

    return { success: true, data }
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === "AbortError") {
      return { success: false, error: "License server timeout" }
    }
    return { success: false, error: err.message || "Network error" }
  }
}

const CACHE_MS = 24 * 60 * 60 * 1000

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/$/, "") || "/"

    if (path === "/health" && request.method === "GET") {
      return jsonResponse({ status: "ok", service: "polyglot-license" })
    }

    if (path === "/checkout" && request.method === "GET") {
      const testMode = url.searchParams.get("test_mode") === "true"
      return createCheckout({ env, url, testMode })
    }

    if (request.method !== "POST") {
      return errorResponse("Method not allowed", 405)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return errorResponse("Invalid JSON body")
    }

    const { key, instance_id, instance_name, project_id, test_mode } = body

    if (!key || typeof key !== "string") {
      return errorResponse("License key is required")
    }

    const apiKey = test_mode ? env.CREEM_TEST_API_KEY : env.CREEM_API_KEY
    if (!apiKey) {
      return errorResponse("Server configuration error: API key not set", 500)
    }

    const baseUrl = creemBaseUrl(test_mode)

    const expiresAt = Date.now() + CACHE_MS

    if (path === "/activate") {
      const creemBody = {
        key: key.trim(),
        instance_name: instance_name || project_id || "Framer project",
      }

      const result = await callCreemAPI(
        `${baseUrl}/licenses/activate`,
        apiKey,
        creemBody,
      )

      if (!result.success) {
        return errorResponse(result.error)
      }

      const active = licenseActive(result.data)
      const creemInstanceId = licenseInstanceId(result.data)
      if (active && !creemInstanceId) {
        return errorResponse("Creem activation did not return an instance id", 502)
      }
      return jsonResponse({
        ok: active,
        tier: active ? "pro" : "free",
        expiresAt,
        instance_id: creemInstanceId,
      })
    }

    if (path === "/validate") {
      if (!instance_id) {
        return errorResponse("instance_id is required")
      }

      const result = await callCreemAPI(
        `${baseUrl}/licenses/validate`,
        apiKey,
        { key: key.trim(), instance_id },
      )

      if (!result.success) {
        return jsonResponse({
          ok: false,
          tier: "free",
          error: result.error,
        })
      }

      const active = licenseActive(result.data)
      return jsonResponse({
        ok: active,
        tier: active ? "pro" : "free",
        expiresAt,
      })
    }

    if (path === "/deactivate") {
      if (!instance_id) {
        return errorResponse("instance_id is required")
      }

      const result = await callCreemAPI(
        `${baseUrl}/licenses/deactivate`,
        apiKey,
        { key: key.trim(), instance_id },
      )

      if (!result.success) {
        return errorResponse(result.error)
      }

      return jsonResponse({ ok: true, tier: "free" })
    }

    return errorResponse("Not found", 404)
  },
}
