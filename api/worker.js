/**
 * Polyglot AEO — Creem license proxy (Cloudflare Worker)
 *
 * Same pattern as Loka: plugin never holds CREEM_API_KEY.
 *
 * GET  /checkout?plan=monthly|yearly&project_id=...
 * POST /activate  { key, instance_name?, project_id? }
 * POST /validate  { key, instance_id }
 * POST /deactivate { key, instance_id }
 * POST /ai/session { key, instance_id, project_id? }
 *
 * Creem does not expire a license when its subscription ends, so
 * POST /webhooks/creem (re-read from the Creem API, never trusted as sent)
 * keeps license -> subscription links and revocations in the LICENSE_STATE KV
 * namespace; a daily cron re-syncs every link. Revoked licenses fail
 * /validate, /activate and managed-AI sessions.
 *
 * Client-supplied test_mode is ignored. Creem test mode is used only when
 * CREEM_TEST_MODE=true and ENVIRONMENT is an explicit non-production value.
 * A missing ENVIRONMENT is treated as production.
 * POST /ai/generate { feature, prompt, max_tokens?, idempotency_key? }
 * GET  /health
 * GET  /verify-fetch?url=https://example.com/path
 *
 * Secrets: wrangler secret put CREEM_API_KEY
 *          wrangler secret put CREEM_TEST_API_KEY
 *          wrangler secret put MINIMAX_API_KEY
 *          wrangler secret put AI_SESSION_SECRET
 *          wrangler secret put AI_USAGE_SALT
 */

const ALLOWED_CHECKOUT_HOSTS = ["polyglotaeo.com"]

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

const NON_PRODUCTION_ENVIRONMENTS = new Set([
  "development",
  "dev",
  "staging",
  "preview",
  "test",
  "local",
])

function deploymentEnvironment(env) {
  const raw =
    env && typeof env.ENVIRONMENT === "string"
      ? env.ENVIRONMENT.trim().toLowerCase()
      : ""
  return raw || "production"
}

function envFlagEnabled(value) {
  return (
    value === true ||
    (typeof value === "string" && value.trim().toLowerCase() === "true")
  )
}

/**
 * Test Creem credentials are never selected from a client test_mode flag.
 * They are used only when this Worker is opted in, and only outside production.
 */
function serverTestModeEnabled(env) {
  if (!envFlagEnabled(env?.CREEM_TEST_MODE)) return false
  return NON_PRODUCTION_ENVIRONMENTS.has(deploymentEnvironment(env))
}

function configuredProductIds(env, testMode) {
  const keys = testMode
    ? ["CREEM_TEST_PRODUCT_MONTHLY", "CREEM_TEST_PRODUCT_YEARLY"]
    : ["CREEM_PRODUCT_MONTHLY", "CREEM_PRODUCT_YEARLY"]
  return keys
    .map((key) => (typeof env?.[key] === "string" ? env[key].trim() : ""))
    .filter(Boolean)
}

function readLicenseProductId(data) {
  if (!data || typeof data !== "object") return ""
  for (const candidate of [data.product_id, data.productId]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
  }
  const product = data.product
  if (typeof product === "string" && product.trim()) return product.trim()
  if (product && typeof product === "object") {
    const nested = product.id ?? product.product_id ?? product.productId
    if (typeof nested === "string" && nested.trim()) return nested.trim()
  }
  return ""
}

function licenseProductConfigurationError(env, testMode) {
  if (configuredProductIds(env, testMode).length === 0) {
    return {
      status: 500,
      error: testMode
        ? "Server configuration error: test product id not set"
        : "Server configuration error: product id not set",
    }
  }
  return null
}

function licenseProductError(data, env, testMode) {
  const configurationError = licenseProductConfigurationError(env, testMode)
  if (configurationError) return configurationError
  const allowed = configuredProductIds(env, testMode)
  const productId = readLicenseProductId(data)
  if (!productId) {
    return { status: 403, error: "License product could not be verified" }
  }
  if (!allowed.includes(productId)) {
    return { status: 403, error: "License is not valid for this product" }
  }
  return null
}

async function rejectCreatedActivation({ data, key, apiKey, baseUrl, rejection }) {
  const instanceId = licenseInstanceId(data)
  if (instanceId) {
    const cleanup = await callCreemAPI(`${baseUrl}/licenses/deactivate`, apiKey, {
      key,
      instance_id: instanceId,
    })
    if (cleanup.success) return errorResponse(rejection.error, rejection.status)
  }
  return jsonResponse({
    ok: false,
    error: "License could not be accepted and activation cleanup could not be confirmed. Contact support before trying again.",
    activation_cleanup_required: true,
    ...(instanceId ? { recovery_instance_id: instanceId } : {}),
  }, 502)
}

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase()
  return ALLOWED_CHECKOUT_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  )
}

function isAllowedCheckoutRequest(request) {
  const origin = request.headers.get("Origin")
  if (origin) {
    try {
      return isAllowedHost(new URL(origin).hostname)
    } catch {
      return false
    }
  }

  const referer = request.headers.get("Referer")
  if (referer) {
    try {
      return isAllowedHost(new URL(referer).hostname)
    } catch {
      return false
    }
  }

  return false
}

function safeMetadataValue(value, maxLength = 160) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function safeSuccessUrl(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== "https:") return fallback
    if (!isAllowedHost(parsed.hostname)) return fallback
    return parsed.toString()
  } catch {
    return fallback
  }
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

async function createCheckout({ request, env, url, testMode }) {
  if (!isAllowedCheckoutRequest(request)) {
    return errorResponse("Checkout must be started from polyglotaeo.com", 403)
  }

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
  const defaultSuccessUrl =
    safeSuccessUrl(env.CREEM_SUCCESS_URL, "https://polyglotaeo.com/success") ||
    "https://polyglotaeo.com/success"
  const successUrl = safeSuccessUrl(
    safeMetadataValue(url.searchParams.get("success_url"), 512),
    defaultSuccessUrl,
  )

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

const AI_SESSION_TTL_SECONDS = 15 * 60
const AI_MINIMAX_BASE_URL = "https://api.minimaxi.com/v1"
const AI_MINIMAX_MODEL = "MiniMax-M3"
const AI_MINIMAX_INPUT_RMB_PER_M = 2.1
const AI_MINIMAX_OUTPUT_RMB_PER_M = 8.4
const AI_DEFAULT_LICENSE_DAY_RMB_CAP = 1.5
const AI_DEFAULT_LICENSE_MONTH_RMB_CAP = 8
const AI_DEFAULT_GLOBAL_DAY_RMB_CAP = 80
const AI_DEFAULT_GLOBAL_MONTH_RMB_CAP = 500
const AI_DEFAULT_REQUESTS_PER_MINUTE = 6
const AI_MAX_PROMPT_CHARS = 80_000
const AI_DEFAULT_MAX_OUTPUT_TOKENS = 2_800
const AI_MAX_OUTPUT_TOKENS = 6_000

const AI_FEATURE_LIMITS = {
  meta_generate: { maxOutputTokens: 2_800 },
  meta_ai_suggest: { maxOutputTokens: 900 },
  schema_scan: { maxOutputTokens: 1_400 },
  schema_translate: { maxOutputTokens: 2_400 },
  llms_translate: { maxOutputTokens: 2_200 },
  llms_summary: { maxOutputTokens: 1_400 },
  generic_generation: { maxOutputTokens: 2_800 },
}

function envNumber(env, key, fallback) {
  const raw = env[key]
  if (typeof raw !== "string" || !raw.trim()) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function base64UrlEncodeBytes(bytes) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlEncodeJson(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)))
}

function base64UrlDecodeJson(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  )
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  )
  return new Uint8Array(sig)
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function signAiToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" }
  const encodedHeader = base64UrlEncodeJson(header)
  const encodedPayload = base64UrlEncodeJson(payload)
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const sig = await hmacSha256(secret, signingInput)
  return `${signingInput}.${base64UrlEncodeBytes(sig)}`
}

async function verifyAiToken(token, secret) {
  if (typeof token !== "string") return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const signingInput = `${parts[0]}.${parts[1]}`
  const expected = base64UrlEncodeBytes(await hmacSha256(secret, signingInput))
  if (expected !== parts[2]) return null
  const payload = base64UrlDecodeJson(parts[1])
  if (!payload || typeof payload !== "object") return null
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null
  }
  if (payload.tier !== "pro" || typeof payload.sub !== "string") return null
  return payload
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function normalizeAiPrompt(prompt) {
  if (!prompt || typeof prompt !== "object") return null
  const system = typeof prompt.system === "string" ? prompt.system : ""
  const user = typeof prompt.user === "string" ? prompt.user : ""
  if (!system.trim() || !user.trim()) return null
  const total = system.length + user.length
  if (total > AI_MAX_PROMPT_CHARS) return null
  return { system, user }
}

function normalizeAiFeature(feature) {
  if (typeof feature !== "string" || !feature.trim()) return "generic_generation"
  return AI_FEATURE_LIMITS[feature] ? feature : "generic_generation"
}

function normalizeMaxTokens(feature, requested) {
  const featureCap =
    AI_FEATURE_LIMITS[feature]?.maxOutputTokens ?? AI_DEFAULT_MAX_OUTPUT_TOKENS
  const raw = Number(requested)
  const wanted = Number.isFinite(raw) && raw > 0 ? raw : featureCap
  return Math.min(Math.floor(wanted), featureCap, AI_MAX_OUTPUT_TOKENS)
}

function approxTokensFromText(text) {
  return Math.max(1, Math.ceil(text.length / 4))
}

function costRmb(tokensIn, tokensOut, env) {
  const inputRate = envNumber(env, "MINIMAX_INPUT_RMB_PER_M", AI_MINIMAX_INPUT_RMB_PER_M)
  const outputRate = envNumber(env, "MINIMAX_OUTPUT_RMB_PER_M", AI_MINIMAX_OUTPUT_RMB_PER_M)
  return (tokensIn * inputRate + tokensOut * outputRate) / 1_000_000
}

function aiQuotaConfig(env) {
  return {
    licenseDayCapRmb: envNumber(
      env,
      "AI_LICENSE_DAY_RMB_CAP",
      AI_DEFAULT_LICENSE_DAY_RMB_CAP,
    ),
    licenseMonthCapRmb: envNumber(
      env,
      "AI_LICENSE_MONTH_RMB_CAP",
      AI_DEFAULT_LICENSE_MONTH_RMB_CAP,
    ),
    globalDayCapRmb: envNumber(
      env,
      "AI_GLOBAL_DAY_RMB_CAP",
      AI_DEFAULT_GLOBAL_DAY_RMB_CAP,
    ),
    globalMonthCapRmb: envNumber(
      env,
      "AI_GLOBAL_MONTH_RMB_CAP",
      AI_DEFAULT_GLOBAL_MONTH_RMB_CAP,
    ),
    requestsPerMinute: envNumber(
      env,
      "AI_REQUESTS_PER_MINUTE",
      AI_DEFAULT_REQUESTS_PER_MINUTE,
    ),
  }
}

async function validateActiveLicense({ key, instanceId, testMode, env }) {
  const apiKey = testMode ? env.CREEM_TEST_API_KEY : env.CREEM_API_KEY
  if (!apiKey) {
    return { ok: false, status: 500, error: "Server configuration error" }
  }
  if (await revokedLicense(env, key)) {
    return { ok: false, status: 403, error: "Active Pro license required" }
  }
  const result = await callCreemAPI(
    `${creemBaseUrl(testMode)}/licenses/validate`,
    apiKey,
    { key: key.trim(), instance_id: instanceId },
  )
  if (!result.success) {
    return { ok: false, status: 403, error: "License validation failed" }
  }
  const productError = licenseProductError(result.data, env, testMode)
  if (productError) {
    return { ok: false, status: productError.status, error: productError.error }
  }
  if (!licenseActive(result.data)) {
    return { ok: false, status: 403, error: "Active Pro license required" }
  }
  return { ok: true }
}

async function createAiSession({ body, env }) {
  if (!env.AI_SESSION_SECRET || !env.AI_USAGE_SALT) {
    return errorResponse("Managed AI is not configured", 503)
  }

  const key = typeof body.key === "string" ? body.key.trim() : ""
  const instanceId =
    typeof body.instance_id === "string" ? body.instance_id.trim() : ""
  const projectId =
    typeof body.project_id === "string" ? body.project_id.trim().slice(0, 160) : ""
  const testMode = serverTestModeEnabled(env)

  if (!key || !instanceId) {
    return errorResponse("License key and instance_id are required", 400)
  }

  const license = await validateActiveLicense({
    key,
    instanceId,
    testMode,
    env,
  })
  if (!license.ok) return errorResponse(license.error, license.status)

  const now = Math.floor(Date.now() / 1000)
  const subject = await sha256Hex(
    `${env.AI_USAGE_SALT}:${testMode ? "test" : "production"}:${key}:${instanceId}`,
  )
  const token = await signAiToken(
    {
      iss: "polyglot-aeo",
      aud: "polyglot-managed-ai",
      sub: subject,
      instance_id: instanceId,
      project_id: projectId || undefined,
      mode: testMode ? "test" : "production",
      tier: "pro",
      iat: now,
      exp: now + AI_SESSION_TTL_SECONDS,
    },
    env.AI_SESSION_SECRET,
  )

  return jsonResponse({
    ok: true,
    token,
    expiresAt: (now + AI_SESSION_TTL_SECONDS) * 1000,
    provider: "Polyglot Managed AI",
    model: env.MINIMAX_MODEL || AI_MINIMAX_MODEL,
    quotas: aiQuotaConfig(env),
  })
}

function usageLimiter(env) {
  if (!env.AI_USAGE_LIMITER) return null
  const id = env.AI_USAGE_LIMITER.idFromName("polyglot-ai-usage-v1")
  return env.AI_USAGE_LIMITER.get(id)
}

async function limiterAction(env, payload) {
  const limiter = usageLimiter(env)
  if (!limiter) {
    return {
      ok: false,
      status: 503,
      error: "Managed AI quota limiter is not configured",
    }
  }
  const res = await limiter.fetch("https://limiter/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, ...data }
}

async function callMiniMax({ env, prompt, maxTokens }) {
  const apiKey = env.MINIMAX_API_KEY
  if (!apiKey) return { ok: false, status: 503, error: "MiniMax API key not configured" }

  const baseUrl = (env.MINIMAX_BASE_URL || AI_MINIMAX_BASE_URL).replace(/\/+$/, "")
  const model = env.MINIMAX_MODEL || AI_MINIMAX_MODEL
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    envNumber(env, "AI_UPSTREAM_TIMEOUT_MS", 45_000),
  )

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        max_tokens: maxTokens,
        service_tier: "standard",
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (!res.ok) {
      return {
        ok: false,
        status: res.status >= 500 ? 502 : 400,
        error: data.error?.message || data.message || `MiniMax API error (${res.status})`,
      }
    }
    const rawText = data.choices?.[0]?.message?.content ?? ""
    return {
      ok: true,
      rawText,
      usage: data.usage ?? {},
      model,
    }
  } catch (err) {
    return {
      ok: false,
      status: err?.name === "AbortError" ? 504 : 502,
      error: err?.name === "AbortError" ? "MiniMax request timed out" : "MiniMax request failed",
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function generateAi({ request, body, env }) {
  if (!env.AI_SESSION_SECRET) return errorResponse("Managed AI is not configured", 503)

  const token = bearerToken(request) || (typeof body.token === "string" ? body.token : "")
  const session = await verifyAiToken(token, env.AI_SESSION_SECRET)
  if (!session) return errorResponse("Invalid or expired AI session", 401)

  const prompt = normalizeAiPrompt(body.prompt)
  if (!prompt) return errorResponse("Invalid or oversized prompt", 400)

  const feature = normalizeAiFeature(body.feature)
  const maxTokens = normalizeMaxTokens(feature, body.max_tokens)
  const requestId =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 160)
      : crypto.randomUUID()

  const estimatedTokensIn =
    approxTokensFromText(prompt.system) + approxTokensFromText(prompt.user)
  const estimatedCostRmb = costRmb(estimatedTokensIn, maxTokens, env)

  const reserve = await limiterAction(env, {
    action: "reserve",
    sub: session.sub,
    requestId,
    estimatedCostRmb,
    feature,
    quota: aiQuotaConfig(env),
  })
  if (!reserve.ok) {
    return errorResponse(reserve.error || "AI quota exceeded", reserve.status || 429)
  }

  const upstream = await callMiniMax({ env, prompt, maxTokens })
  if (!upstream.ok) {
    await limiterAction(env, {
      action: "release",
      sub: session.sub,
      requestId,
      estimatedCostRmb,
    })
    return errorResponse(upstream.error, upstream.status)
  }

  const tokensIn =
    Number(upstream.usage.prompt_tokens ?? upstream.usage.input_tokens) ||
    estimatedTokensIn
  const tokensOut =
    Number(upstream.usage.completion_tokens ?? upstream.usage.output_tokens) ||
    approxTokensFromText(upstream.rawText)
  const actualCostRmb = costRmb(tokensIn, tokensOut, env)

  await limiterAction(env, {
    action: "commit",
    sub: session.sub,
    requestId,
    estimatedCostRmb,
    actualCostRmb,
    feature,
  })

  return jsonResponse({
    ok: true,
    rawText: upstream.rawText,
    tokensIn,
    tokensOut,
    estimatedCostRmb: actualCostRmb,
    model: upstream.model,
  })
}

const CACHE_MS = 24 * 60 * 60 * 1000

const VERIFY_MAX_BYTES = 1_500_000
const VERIFY_TIMEOUT_MS = 12_000

/** Mirror src/lib/aeo/verify-fetch-url.ts */
function isAllowedVerifyUrl(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  if (parsed.username || parsed.password) return false

  const host = parsed.hostname.toLowerCase()
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return false
  }
  if (host.startsWith("[") && host.endsWith("]")) return false
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") {
    return false
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) return false

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    if (a === 10) return false
    if (a === 127) return false
    if (a === 0) return false
    if (a === 169 && b === 254) return false
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
  }

  return true
}

async function verifyFetchPublished(url) {
  const target = url.searchParams.get("url")
  if (!target || !isAllowedVerifyUrl(target)) {
    return errorResponse("Invalid or disallowed url", 400)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)

  try {
    const res = await fetch(target, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html,text/plain,*/*" },
    })

    const reader = res.body?.getReader()
    if (!reader) {
      return jsonResponse({
        ok: res.ok,
        status: res.status,
        text: "",
      })
    }

    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > VERIFY_MAX_BYTES) {
        await reader.cancel()
        break
      }
      chunks.push(value)
    }

    const text = new TextDecoder().decode(
      chunks.length === 1
        ? chunks[0]
        : Uint8Array.from(chunks.flatMap((c) => [...c])),
    )

    return jsonResponse({
      ok: res.ok,
      status: res.status,
      text,
    })
  } catch (err) {
    const message =
      err?.name === "AbortError"
        ? "Upstream timeout"
        : err?.message || "Upstream fetch failed"
    return errorResponse(message, 502)
  } finally {
    clearTimeout(timeout)
  }
}

function ymd(date) {
  return date.toISOString().slice(0, 10)
}

function ym(date) {
  return date.toISOString().slice(0, 7)
}

function minuteBucket(date) {
  return Math.floor(date.getTime() / 60_000)
}

function emptyUsageState(now) {
  return {
    day: ymd(now),
    month: ym(now),
    globalDayCostRmb: 0,
    globalMonthCostRmb: 0,
    subjects: {},
  }
}

function subjectState(state, sub, now) {
  let subject = state.subjects[sub]
  if (!subject) {
    subject = {
      day: state.day,
      month: state.month,
      dayCostRmb: 0,
      monthCostRmb: 0,
      minute: minuteBucket(now),
      minuteCount: 0,
      reservations: {},
    }
    state.subjects[sub] = subject
  }
  if (subject.day !== state.day) {
    subject.day = state.day
    subject.dayCostRmb = 0
    subject.minute = minuteBucket(now)
    subject.minuteCount = 0
  }
  if (subject.month !== state.month) {
    subject.month = state.month
    subject.monthCostRmb = 0
    subject.reservations = {}
  }
  const currentMinute = minuteBucket(now)
  if (subject.minute !== currentMinute) {
    subject.minute = currentMinute
    subject.minuteCount = 0
  }
  return subject
}

function pruneOldSubjects(state) {
  const entries = Object.entries(state.subjects)
  if (entries.length <= 1_000) return
  entries
    .filter(([, value]) => value.month !== state.month && value.day !== state.day)
    .slice(0, entries.length - 1_000)
    .forEach(([key]) => {
      delete state.subjects[key]
    })
}

export class AiUsageLimiter {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async readState() {
    const now = new Date()
    const stored = (await this.state.storage.get("usage")) || emptyUsageState(now)
    if (stored.day !== ymd(now)) {
      stored.day = ymd(now)
      stored.globalDayCostRmb = 0
    }
    if (stored.month !== ym(now)) {
      stored.month = ym(now)
      stored.globalMonthCostRmb = 0
      stored.subjects = {}
    }
    pruneOldSubjects(stored)
    return { stored, now }
  }

  async writeState(stored) {
    await this.state.storage.put("usage", stored)
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405)
    }
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return jsonResponse({ ok: false, error: "Invalid body" }, 400)
    }
    const { stored, now } = await this.readState()
    const quota = body.quota || {}
    const sub = typeof body.sub === "string" ? body.sub : ""
    const requestId = typeof body.requestId === "string" ? body.requestId : ""
    if (!sub || !requestId) {
      return jsonResponse({ ok: false, error: "Missing usage identity" }, 400)
    }
    const subject = subjectState(stored, sub, now)
    const action = body.action

    if (action === "reserve") {
      const existing = subject.reservations[requestId]
      if (existing?.status === "pending") {
        return jsonResponse({ ok: false, error: "Duplicate in-flight AI request" }, 409)
      }
      if (existing?.status === "committed") {
        return jsonResponse({ ok: false, error: "Duplicate completed AI request" }, 409)
      }

      const estimated = Math.max(0, Number(body.estimatedCostRmb) || 0)
      const perMinute = Math.max(
        1,
        Math.floor(Number(quota.requestsPerMinute) || AI_DEFAULT_REQUESTS_PER_MINUTE),
      )
      if (subject.minuteCount >= perMinute) {
        return jsonResponse({ ok: false, error: "AI rate limit reached" }, 429)
      }
      if (
        subject.dayCostRmb + estimated >
        (Number(quota.licenseDayCapRmb) || AI_DEFAULT_LICENSE_DAY_RMB_CAP)
      ) {
        return jsonResponse({ ok: false, error: "Daily AI quota reached" }, 429)
      }
      if (
        subject.monthCostRmb + estimated >
        (Number(quota.licenseMonthCapRmb) || AI_DEFAULT_LICENSE_MONTH_RMB_CAP)
      ) {
        return jsonResponse({ ok: false, error: "Monthly AI quota reached" }, 429)
      }
      if (
        stored.globalDayCostRmb + estimated >
        (Number(quota.globalDayCapRmb) || AI_DEFAULT_GLOBAL_DAY_RMB_CAP)
      ) {
        return jsonResponse({ ok: false, error: "Global daily AI budget reached" }, 429)
      }
      if (
        stored.globalMonthCostRmb + estimated >
        (Number(quota.globalMonthCapRmb) || AI_DEFAULT_GLOBAL_MONTH_RMB_CAP)
      ) {
        return jsonResponse({ ok: false, error: "Global monthly AI budget reached" }, 429)
      }

      subject.minuteCount += 1
      subject.dayCostRmb += estimated
      subject.monthCostRmb += estimated
      stored.globalDayCostRmb += estimated
      stored.globalMonthCostRmb += estimated
      subject.reservations[requestId] = {
        status: "pending",
        estimatedCostRmb: estimated,
        feature: typeof body.feature === "string" ? body.feature : "generic_generation",
        createdAt: now.toISOString(),
      }
      await this.writeState(stored)
      return jsonResponse({ ok: true })
    }

    if (action === "release") {
      const reservation = subject.reservations[requestId]
      if (reservation?.status === "pending") {
        const estimated = Math.max(0, Number(reservation.estimatedCostRmb) || 0)
        subject.dayCostRmb = Math.max(0, subject.dayCostRmb - estimated)
        subject.monthCostRmb = Math.max(0, subject.monthCostRmb - estimated)
        stored.globalDayCostRmb = Math.max(0, stored.globalDayCostRmb - estimated)
        stored.globalMonthCostRmb = Math.max(0, stored.globalMonthCostRmb - estimated)
        delete subject.reservations[requestId]
        await this.writeState(stored)
      }
      return jsonResponse({ ok: true })
    }

    if (action === "commit") {
      const reservation = subject.reservations[requestId]
      if (reservation?.status === "pending") {
        const estimated = Math.max(0, Number(reservation.estimatedCostRmb) || 0)
        const actual = Math.max(0, Number(body.actualCostRmb) || 0)
        const delta = actual - estimated
        subject.dayCostRmb = Math.max(0, subject.dayCostRmb + delta)
        subject.monthCostRmb = Math.max(0, subject.monthCostRmb + delta)
        stored.globalDayCostRmb = Math.max(0, stored.globalDayCostRmb + delta)
        stored.globalMonthCostRmb = Math.max(0, stored.globalMonthCostRmb + delta)
        subject.reservations[requestId] = {
          status: "committed",
          estimatedCostRmb: estimated,
          actualCostRmb: actual,
          feature: reservation.feature,
          createdAt: reservation.createdAt,
          committedAt: now.toISOString(),
        }
        await this.writeState(stored)
      }
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: false, error: "Unknown usage action" }, 400)
  }
}

async function getCreemAPI(endpoint, apiKey) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: data.message || data.error || `Creem API error (${res.status})` }
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err?.name === "AbortError" ? "License server timeout" : err?.message }
  } finally {
    clearTimeout(timeout)
  }
}

// Statuses that still pay for (or are recovering payment for) the current period.
const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "scheduled_cancel"])

function readObjectId(value) {
  if (typeof value === "string") return value.trim()
  if (value && typeof value === "object" && typeof value.id === "string") return value.id.trim()
  return ""
}

export async function revokedLicense(env, key) {
  const kv = env?.LICENSE_STATE
  if (!kv || typeof key !== "string") return null
  const raw = await kv.get(`revoked:${key.trim()}`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return { status: "canceled" }
  }
}

/** Re-read one subscription from Creem and revoke or restore every license linked to it. */
async function syncSubscription(env, subscriptionId, baseUrl, apiKey) {
  const kv = env.LICENSE_STATE
  const keys = JSON.parse((await kv.get(`sub:${subscriptionId}`)) || "[]")
  if (keys.length === 0) return { status: 200, body: { synced: 0, unlinked: true } }

  const result = await getCreemAPI(`${baseUrl}/subscriptions?subscription_id=${encodeURIComponent(subscriptionId)}`, apiKey)
  if (!result.success) return { status: 502, body: { error: result.error } }

  const status = typeof result.data?.status === "string" ? result.data.status : "unknown"
  const entitled = ENTITLED_SUBSCRIPTION_STATUSES.has(status)
  for (const key of keys) {
    if (entitled) {
      await kv.delete(`revoked:${key}`)
    } else {
      await kv.put(`revoked:${key}`, JSON.stringify({ subscription_id: subscriptionId, status, at: Date.now() }))
    }
  }
  return { status: 200, body: { synced: keys.length, subscription_status: status, entitled } }
}

async function linkSubscription(env, subscriptionId, keys) {
  const kv = env.LICENSE_STATE
  const existing = JSON.parse((await kv.get(`sub:${subscriptionId}`)) || "[]")
  const merged = [...new Set([...existing, ...keys])]
  await kv.put(`sub:${subscriptionId}`, JSON.stringify(merged))
  for (const key of keys) await kv.put(`key:${key}`, subscriptionId)
}

/**
 * Handle a Creem webhook. The payload only names the object; its state is
 * re-read with this Worker's own API key, so a forged event can at most
 * trigger a resync with true data.
 */
export async function handleCreemEvent(event, env) {
  if (!env?.LICENSE_STATE) return { status: 500, body: { error: "LICENSE_STATE KV binding is missing" } }
  const testMode = serverTestModeEnabled(env)
  const apiKey = testMode ? env.CREEM_TEST_API_KEY : env.CREEM_API_KEY
  if (!apiKey) return { status: 500, body: { error: "Server configuration error: API key not set" } }
  const baseUrl = creemBaseUrl(testMode)

  const type = typeof event?.eventType === "string" ? event.eventType : event?.type
  const objectId = readObjectId(event?.object)
  if (typeof type !== "string" || !objectId) return { status: 400, body: { error: "Event type and object id are required" } }

  if (type === "checkout.completed") {
    const checkout = await getCreemAPI(`${baseUrl}/checkouts?checkout_id=${encodeURIComponent(objectId)}`, apiKey)
    if (!checkout.success) return { status: 502, body: { error: checkout.error } }
    const subscriptionId = readObjectId(checkout.data?.subscription)
    const keys = (Array.isArray(checkout.data?.license_keys) ? checkout.data.license_keys : [])
      .map((license) => (typeof license?.key === "string" ? license.key.trim() : ""))
      .filter(Boolean)
    if (!subscriptionId || keys.length === 0) return { status: 200, body: { linked: 0 } }
    await linkSubscription(env, subscriptionId, keys)
    return syncSubscription(env, subscriptionId, baseUrl, apiKey)
  }

  if (type.startsWith("subscription.")) {
    return syncSubscription(env, objectId, baseUrl, apiKey)
  }

  return { status: 200, body: { ignored: type } }
}

/** Daily safety net for missed webhooks: re-sync every linked subscription. */
export async function syncAllSubscriptions(env) {
  if (!env?.LICENSE_STATE) return { synced: 0 }
  const testMode = serverTestModeEnabled(env)
  const apiKey = testMode ? env.CREEM_TEST_API_KEY : env.CREEM_API_KEY
  if (!apiKey) return { synced: 0 }
  const baseUrl = creemBaseUrl(testMode)
  let cursor
  let synced = 0
  do {
    const page = await env.LICENSE_STATE.list({ prefix: "sub:", cursor })
    for (const { name } of page.keys) {
      await syncSubscription(env, name.slice("sub:".length), baseUrl, apiKey)
      synced += 1
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return { synced }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(syncAllSubscriptions(env))
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/$/, "") || "/"

    if (path === "/health" && request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      })
    }

    if (path === "/health" && request.method === "GET") {
      return jsonResponse({ status: "ok", service: "polyglot-license" })
    }

    if (path === "/checkout" && request.method === "GET") {
      const testMode = serverTestModeEnabled(env)
      if (url.searchParams.get("test_mode") === "true" && !testMode) {
        return errorResponse("Test checkout is disabled", 403)
      }
      return createCheckout({ request, env, url, testMode })
    }

    if (path === "/verify-fetch" && request.method === "GET") {
      return verifyFetchPublished(url)
    }

    if (path === "/webhooks/creem" && request.method === "POST") {
      let event
      try {
        event = await request.json()
      } catch {
        return errorResponse("Invalid JSON body")
      }
      const result = await handleCreemEvent(event, env)
      return jsonResponse({ success: result.status < 400, ...result.body }, result.status)
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

    if (path === "/ai/session") {
      return createAiSession({ body, env })
    }

    if (path === "/ai/generate") {
      return generateAi({ request, body, env })
    }

    const { key, instance_id, instance_name, project_id } = body

    if (!key || typeof key !== "string") {
      return errorResponse("License key is required")
    }

    const testMode = serverTestModeEnabled(env)
    const apiKey = testMode ? env.CREEM_TEST_API_KEY : env.CREEM_API_KEY
    if (!apiKey) {
      return errorResponse("Server configuration error: API key not set", 500)
    }

    const baseUrl = creemBaseUrl(testMode)

    const expiresAt = Date.now() + CACHE_MS

    if (path === "/activate") {
      const configurationError = licenseProductConfigurationError(env, testMode)
      if (configurationError) {
        return errorResponse(configurationError.error, configurationError.status)
      }
      if (await revokedLicense(env, key)) {
        return errorResponse("This license's Polyglot AEO Pro subscription has ended. Renew to keep using Pro.", 403)
      }
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

      const productError = licenseProductError(result.data, env, testMode)
      if (productError) {
        return rejectCreatedActivation({
          data: result.data, key: key.trim(), apiKey, baseUrl, rejection: productError,
        })
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

      const productError = licenseProductError(result.data, env, testMode)
      if (productError) {
        return errorResponse(productError.error, productError.status)
      }

      const revoked = await revokedLicense(env, key)
      if (revoked) {
        return jsonResponse({ ok: false, tier: "free", status: revoked.status || "canceled" })
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
