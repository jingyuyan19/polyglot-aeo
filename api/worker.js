/**
 * Polyglot AEO — Creem license proxy (Cloudflare Worker)
 *
 * Same pattern as Loka: plugin never holds CREEM_API_KEY.
 *
 * GET  /checkout?plan=monthly|yearly&project_id=...
 * POST /activate  { key, instance_name?, project_id?, test_mode? }
 * POST /validate  { key, instance_id, test_mode? }
 * POST /deactivate { key, instance_id, test_mode? }
 * POST /ai/session { key, instance_id, project_id?, test_mode? }
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
  const result = await callCreemAPI(
    `${creemBaseUrl(testMode)}/licenses/validate`,
    apiKey,
    { key: key.trim(), instance_id: instanceId },
  )
  if (!result.success) {
    return { ok: false, status: 403, error: "License validation failed" }
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
  const testMode = body.test_mode === true || body.test_mode === "true"

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

export default {
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
      const testMode = url.searchParams.get("test_mode") === "true"
      return createCheckout({ request, env, url, testMode })
    }

    if (path === "/verify-fetch" && request.method === "GET") {
      return verifyFetchPublished(url)
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
