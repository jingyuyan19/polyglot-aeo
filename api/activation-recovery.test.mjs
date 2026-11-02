import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import worker from "./worker.js"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const env = {
  ENVIRONMENT: "production",
  CREEM_API_KEY: "live-key",
  CREEM_TEST_API_KEY: "test-key",
  CREEM_PRODUCT_MONTHLY: "prod_monthly",
  CREEM_PRODUCT_YEARLY: "prod_yearly",
  CREEM_TEST_PRODUCT_MONTHLY: "prod_test_monthly",
}

function provider({ productId = "prod_other", cleanupFails = false, instanceId = "inst_created" } = {}) {
  const active = new Set()
  const calls = []
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    const path = new URL(url).pathname
    calls.push({ url: String(url), body, apiKey: init.headers["x-api-key"] })
    if (path.endsWith("/activate")) {
      if (instanceId) active.add(instanceId)
      return Response.json({
        status: "active", product_id: productId,
        instance: instanceId ? { id: instanceId, status: "active" } : null,
      })
    }
    assert.equal(path, "/v1/licenses/deactivate")
    if (cleanupFails) return Response.json({ message: "Temporarily unavailable" }, { status: 503 })
    assert.equal(body.key, "license-fixture")
    active.delete(body.instance_id)
    return Response.json({ status: "inactive" })
  }
  return { active, calls }
}

function activate(overrides = {}) {
  return worker.fetch(new Request("https://worker.test/activate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "license-fixture", instance_name: "Review fixture" }),
  }), { ...env, ...overrides })
}

test("a rejected product leaves no activation behind", async () => {
  const state = provider()
  const response = await activate()
  assert.equal(response.status, 403)
  assert.equal(state.active.size, 0)
  assert.deepEqual(state.calls.map(call => new URL(call.url).pathname), [
    "/v1/licenses/activate", "/v1/licenses/deactivate",
  ])
  assert.deepEqual(state.calls[1].body, { key: "license-fixture", instance_id: "inst_created" })
})

test("a missing product ID also compensates the new activation", async () => {
  const state = provider({ productId: "" })
  assert.equal((await activate()).status, 403)
  assert.equal(state.active.size, 0)
})

test("missing product configuration fails before creating an activation", async () => {
  const state = provider()
  assert.equal((await activate({ CREEM_PRODUCT_MONTHLY: "", CREEM_PRODUCT_YEARLY: "" })).status, 500)
  assert.equal(state.calls.length, 0)
  assert.equal(state.active.size, 0)
})

test("cleanup failure returns a recovery reference without granting Pro", async () => {
  const state = provider({ cleanupFails: true })
  const response = await activate()
  const body = await response.json()
  assert.equal(response.status, 502)
  assert.equal(body.ok, false)
  assert.equal(body.activation_cleanup_required, true)
  assert.equal(body.recovery_instance_id, "inst_created")
  assert.equal(body.tier, undefined)
  assert.equal(state.active.size, 1)
})

test("a malformed activation without an instance ID reports unresolved cleanup", async () => {
  const state = provider({ instanceId: null })
  const response = await activate()
  const body = await response.json()
  assert.equal(response.status, 502)
  assert.equal(body.activation_cleanup_required, true)
  assert.equal(state.calls.length, 1)
})

test("sandbox compensation uses the same sandbox API and credentials", async () => {
  const state = provider()
  assert.equal((await activate({ ENVIRONMENT: "test", CREEM_TEST_MODE: "true" })).status, 403)
  assert.equal(state.active.size, 0)
  assert.ok(state.calls.every(call => call.url.startsWith("https://test-api.creem.io/")))
  assert.ok(state.calls.every(call => call.apiKey === "test-key"))
})

test("an accepted product keeps exactly its own activation", async () => {
  const state = provider({ productId: "prod_monthly" })
  const response = await activate()
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.instance_id, "inst_created")
  assert.equal(state.active.size, 1)
  assert.equal(state.calls.length, 1)
})
