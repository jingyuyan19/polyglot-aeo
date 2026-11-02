import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import worker from "./worker.js"

const originalFetch = globalThis.fetch

function baseEnv(overrides = {}) {
  return {
    ENVIRONMENT: "production",
    CREEM_API_KEY: "live-key",
    CREEM_TEST_API_KEY: "test-key",
    CREEM_PRODUCT_MONTHLY: "prod_monthly",
    CREEM_PRODUCT_YEARLY: "prod_yearly",
    CREEM_TEST_PRODUCT_MONTHLY: "prod_test_monthly",
    CREEM_TEST_PRODUCT_YEARLY: "prod_test_yearly",
    CREEM_SUCCESS_URL: "https://polyglotaeo.com/success",
    AI_SESSION_SECRET: "session-secret",
    AI_USAGE_SALT: "usage-salt",
    ...overrides,
  }
}

function licensePayload(overrides = {}) {
  return {
    status: "active",
    product_id: "prod_monthly",
    instance: { id: "inst_1", status: "active" },
    ...overrides,
  }
}

function mockFetch(payload, status = 200) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    const headers = init?.headers ?? {}
    calls.push({
      url: String(url),
      method: init?.method,
      body: init?.body ? JSON.parse(init.body) : null,
      apiKey: headers["x-api-key"],
    })
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }
  return calls
}

function checkoutRequest(query) {
  return new Request(`https://license.polyglotaeo.com/checkout?${query}`, {
    headers: { Origin: "https://polyglotaeo.com" },
  })
}

function post(path, body) {
  return new Request(`https://license.polyglotaeo.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function decodeJwtPayload(token) {
  const part = token.split(".")[1]
  const padded = part
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(part.length / 4) * 4, "=")
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"))
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("checkout test mode", () => {
  it("rejects public test checkout in production without calling Creem", async () => {
    const calls = mockFetch({ checkout_url: "https://www.creem.io/should-not-be-used" })
    const response = await worker.fetch(
      checkoutRequest("plan=monthly&test_mode=true"),
      baseEnv(),
    )
    const body = await response.json()

    assert.equal(response.status, 403)
    assert.equal(body.ok, false)
    assert.equal(body.error, "Test checkout is disabled")
    assert.equal(calls.length, 0)
  })

  it("ignores CREEM_TEST_MODE when ENVIRONMENT is production or missing", async () => {
    for (const environment of ["production", "", undefined]) {
      const calls = mockFetch({ checkout_url: "https://www.creem.io/should-not-be-used" })
      const response = await worker.fetch(
        checkoutRequest("plan=yearly&project_id=project-1&test_mode=true"),
        baseEnv({
          ENVIRONMENT: environment,
          CREEM_TEST_MODE: "true",
        }),
      )
      assert.equal(response.status, 403)
      assert.equal(calls.length, 0)
    }
  })

  it("keeps live checkout unchanged when test_mode is absent", async () => {
    const calls = mockFetch({
      checkout_url: "https://www.creem.io/checkout/live-session",
    })
    const response = await worker.fetch(
      checkoutRequest("plan=yearly&project_id=project-1"),
      baseEnv({ CREEM_TEST_MODE: "true" }),
    )

    assert.equal(response.status, 302)
    assert.equal(
      response.headers.get("Location"),
      "https://www.creem.io/checkout/live-session",
    )
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.creem.io/v1/checkouts")
    assert.equal(calls[0].apiKey, "live-key")
    assert.equal(calls[0].body.product_id, "prod_yearly")
  })

  it("still requires an allowed checkout origin for live checkout", async () => {
    const calls = mockFetch({ checkout_url: "https://www.creem.io/checkout/live-session" })
    const response = await worker.fetch(
      new Request("https://license.polyglotaeo.com/checkout?plan=monthly"),
      baseEnv(),
    )
    const body = await response.json()

    assert.equal(response.status, 403)
    assert.equal(body.error, "Checkout must be started from polyglotaeo.com")
    assert.equal(calls.length, 0)
  })

  it("uses Creem test products only when the server flag is set outside production", async () => {
    const calls = mockFetch({
      checkout_url: "https://www.creem.io/checkout/test-session",
    })
    const response = await worker.fetch(
      checkoutRequest("plan=monthly&project_id=project-1&test_mode=true"),
      baseEnv({
        ENVIRONMENT: "development",
        CREEM_TEST_MODE: "true",
      }),
    )

    assert.equal(response.status, 302)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://test-api.creem.io/v1/checkouts")
    assert.equal(calls[0].apiKey, "test-key")
    assert.equal(calls[0].body.product_id, "prod_test_monthly")
  })

  it("does not enable test checkout from a non-production ENVIRONMENT alone", async () => {
    const calls = mockFetch({ checkout_url: "https://www.creem.io/should-not-be-used" })
    const response = await worker.fetch(
      checkoutRequest("plan=monthly&test_mode=true"),
      baseEnv({ ENVIRONMENT: "staging" }),
    )
    assert.equal(response.status, 403)
    assert.equal(calls.length, 0)
  })
})

describe("license product binding", () => {
  it("activates a license for the monthly or yearly product", async () => {
    for (const productId of ["prod_monthly", "prod_yearly"]) {
      const calls = mockFetch(licensePayload({ product_id: productId }))
      const response = await worker.fetch(
        post("/activate", {
          key: "lic_live",
          instance_name: "Site",
          project_id: "project-1",
          test_mode: true,
        }),
        baseEnv(),
      )
      const body = await response.json()

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.tier, "pro")
      assert.equal(body.instance_id, "inst_1")
      assert.equal(calls[0].url, "https://api.creem.io/v1/licenses/activate")
      assert.equal(calls[0].apiKey, "live-key")
      assert.equal(calls[0].body.key, "lic_live")
      assert.equal(Object.hasOwn(calls[0].body, "test_mode"), false)
    }
  })

  it("rejects activate when product_id mismatches or is missing", async () => {
    const cases = [
      licensePayload({ product_id: "prod_other" }),
      licensePayload({ product_id: "prod_test_monthly" }),
      licensePayload({ product_id: "" }),
      licensePayload({ product_id: undefined }),
      { status: "active", instance: { id: "inst_1", status: "active" } },
    ]

    for (const payload of cases) {
      const calls = mockFetch(payload)
      const response = await worker.fetch(
        post("/activate", { key: "lic_other", instance_name: "Site" }),
        baseEnv(),
      )
      const body = await response.json()

      assert.equal(response.status, 403)
      assert.equal(body.ok, false)
      assert.equal(body.tier, undefined)
      assert.equal(calls[0].url, "https://api.creem.io/v1/licenses/activate")
      assert.equal(calls[0].apiKey, "live-key")
    }
  })

  it("accepts product id aliases and still rejects an unknown alias", async () => {
    const accepted = [
      { productId: "prod_monthly" },
      { product: { id: "prod_yearly" } },
    ]
    for (const extra of accepted) {
      mockFetch(licensePayload({ product_id: undefined, ...extra }))
      const response = await worker.fetch(
        post("/activate", { key: "lic_live", instance_name: "Site" }),
        baseEnv(),
      )
      assert.equal(response.status, 200)
    }

    mockFetch(licensePayload({ product_id: undefined, product: { id: "prod_other" } }))
    const rejected = await worker.fetch(
      post("/activate", { key: "lic_other", instance_name: "Site" }),
      baseEnv(),
    )
    assert.equal(rejected.status, 403)
  })

  it("keeps an inactive license for this product on the existing validate response", async () => {
    mockFetch(licensePayload({ status: "inactive" }))
    const response = await worker.fetch(
      post("/validate", { key: "lic_live", instance_id: "inst_1" }),
      baseEnv(),
    )
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, false)
    assert.equal(body.tier, "free")
  })

  it("rejects validate when product_id mismatches or is missing", async () => {
    for (const payload of [
      licensePayload({ product_id: "prod_other" }),
      { status: "active", instance: { id: "inst_1" } },
    ]) {
      const calls = mockFetch(payload)
      const response = await worker.fetch(
        post("/validate", {
          key: "lic_other",
          instance_id: "inst_1",
          test_mode: "true",
        }),
        baseEnv({ CREEM_TEST_MODE: "true" }),
      )
      const body = await response.json()

      assert.equal(response.status, 403)
      assert.equal(body.ok, false)
      assert.match(body.error, /product/)
      assert.equal(calls[0].url, "https://api.creem.io/v1/licenses/validate")
      assert.equal(calls[0].apiKey, "live-key")
    }
  })

  it("validates test-product licenses only in non-production test mode", async () => {
    const calls = mockFetch(
      licensePayload({ product_id: "prod_test_yearly" }),
    )
    const response = await worker.fetch(
      post("/validate", { key: "lic_test", instance_id: "inst_1" }),
      baseEnv({ ENVIRONMENT: "staging", CREEM_TEST_MODE: "true" }),
    )
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.tier, "pro")
    assert.equal(calls[0].url, "https://test-api.creem.io/v1/licenses/validate")
    assert.equal(calls[0].apiKey, "test-key")

    mockFetch(licensePayload({ product_id: "prod_monthly" }))
    const liveOnTestWorker = await worker.fetch(
      post("/validate", { key: "lic_live", instance_id: "inst_1" }),
      baseEnv({ ENVIRONMENT: "local", CREEM_TEST_MODE: true }),
    )
    assert.equal(liveOnTestWorker.status, 403)
  })

  it("returns 500 when this plugin's product ids are not configured", async () => {
    mockFetch(licensePayload())
    const response = await worker.fetch(
      post("/activate", { key: "lic_live", instance_name: "Site" }),
      baseEnv({
        CREEM_PRODUCT_MONTHLY: "",
        CREEM_PRODUCT_YEARLY: "   ",
      }),
    )
    const body = await response.json()
    assert.equal(response.status, 500)
    assert.match(body.error, /product id not set/)
  })
})

describe("managed AI session", () => {
  it("ignores client test_mode and will not mint a session for another product", async () => {
    const calls = mockFetch(
      licensePayload({ product_id: "prod_test_monthly" }),
    )
    const response = await worker.fetch(
      post("/ai/session", {
        key: "lic_test",
        instance_id: "inst_1",
        project_id: "project-1",
        test_mode: "true",
      }),
      baseEnv(),
    )
    const body = await response.json()

    assert.equal(response.status, 403)
    assert.equal(body.token, undefined)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.creem.io/v1/licenses/validate")
    assert.equal(calls[0].apiKey, "live-key")
    assert.deepEqual(calls[0].body, { key: "lic_test", instance_id: "inst_1" })
  })

  it("rejects a session when product_id is missing", async () => {
    mockFetch({ status: "active", instance: { id: "inst_1", status: "active" } })
    const response = await worker.fetch(
      post("/ai/session", {
        key: "lic_live",
        instance_id: "inst_1",
        test_mode: true,
      }),
      baseEnv({ ENVIRONMENT: "production", CREEM_TEST_MODE: "true" }),
    )
    const body = await response.json()
    assert.equal(response.status, 403)
    assert.equal(body.error, "License product could not be verified")
  })

  it("issues a production session for this plugin's product even if the client asks for test mode", async () => {
    const calls = mockFetch(licensePayload())
    const response = await worker.fetch(
      post("/ai/session", {
        key: "lic_live",
        instance_id: "inst_1",
        test_mode: true,
      }),
      baseEnv(),
    )
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(typeof body.token, "string")
    assert.equal(decodeJwtPayload(body.token).mode, "production")
    assert.equal(calls[0].url, "https://api.creem.io/v1/licenses/validate")
    assert.equal(calls[0].apiKey, "live-key")
  })

  it("issues a test session only for the configured test products", async () => {
    const calls = mockFetch(licensePayload({ product_id: "prod_test_monthly" }))
    const response = await worker.fetch(
      post("/ai/session", {
        key: "lic_test",
        instance_id: "inst_1",
      }),
      baseEnv({ ENVIRONMENT: "dev", CREEM_TEST_MODE: "true" }),
    )
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(decodeJwtPayload(body.token).mode, "test")
    assert.equal(calls[0].url, "https://test-api.creem.io/v1/licenses/validate")
    assert.equal(calls[0].apiKey, "test-key")
  })
})
