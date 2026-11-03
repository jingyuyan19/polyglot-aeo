import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import worker, { syncAllSubscriptions } from "./worker.js"

const originalFetch = globalThis.fetch

class MemoryKV {
  map = new Map()
  async get(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  async put(key, value) {
    this.map.set(key, value)
  }
  async delete(key) {
    this.map.delete(key)
  }
  async list({ prefix = "" } = {}) {
    return { keys: [...this.map.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })), list_complete: true }
  }
}

function makeEnv() {
  return {
    ENVIRONMENT: "production",
    CREEM_API_KEY: "live-key",
    CREEM_PRODUCT_MONTHLY: "prod_monthly",
    CREEM_PRODUCT_YEARLY: "prod_yearly",
    AI_SESSION_SECRET: "session-secret",
    AI_USAGE_SALT: "usage-salt",
    LICENSE_STATE: new MemoryKV(),
  }
}

/** Fake Creem: checkout ch_1 issued PG-KEY for sub_1, whose status the test controls. */
function fakeCreem(state) {
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (target.includes("/checkouts?checkout_id=")) {
      return Response.json({ id: "ch_1", subscription: { id: "sub_1" }, license_keys: [{ key: "PG-KEY" }] })
    }
    if (target.includes("/subscriptions?subscription_id=")) {
      return Response.json({ id: "sub_1", status: state.subscriptionStatus })
    }
    return Response.json({ status: "active", product_id: "prod_monthly", instance: { id: "inst_1", status: "active" } })
  }
}

async function post(path, body, env) {
  const response = await worker.fetch(
    new Request(`https://license.polyglotaeo.com${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  )
  return { status: response.status, payload: await response.json() }
}

describe("subscription revocation", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("a canceled subscription loses Pro, activation, and managed AI", async () => {
    const env = makeEnv()
    const state = { subscriptionStatus: "active" }
    fakeCreem(state)
    await post("/webhooks/creem", { eventType: "checkout.completed", object: { id: "ch_1" } }, env)
    assert.equal((await post("/validate", { key: "PG-KEY", instance_id: "inst_1" }, env)).payload.tier, "pro")

    state.subscriptionStatus = "canceled"
    await post("/webhooks/creem", { eventType: "subscription.canceled", object: { id: "sub_1" } }, env)

    const validate = await post("/validate", { key: "PG-KEY", instance_id: "inst_1" }, env)
    assert.deepEqual(validate.payload, { ok: false, tier: "free", status: "canceled" })
    assert.equal((await post("/activate", { key: "PG-KEY", project_id: "p1" }, env)).status, 403)
    const session = await post("/ai/session", { key: "PG-KEY", instance_id: "inst_1", project_id: "p1" }, env)
    assert.equal(session.status, 403)
  })

  it("a forged cancel event is ignored while Creem reports the subscription active", async () => {
    const env = makeEnv()
    fakeCreem({ subscriptionStatus: "active" })
    await post("/webhooks/creem", { eventType: "checkout.completed", object: { id: "ch_1" } }, env)
    await post("/webhooks/creem", { eventType: "subscription.canceled", object: { id: "sub_1", status: "canceled" } }, env)
    assert.equal((await post("/validate", { key: "PG-KEY", instance_id: "inst_1" }, env)).payload.tier, "pro")
  })

  it("the daily sync catches a missed webhook and renewal restores Pro", async () => {
    const env = makeEnv()
    const state = { subscriptionStatus: "active" }
    fakeCreem(state)
    await post("/webhooks/creem", { eventType: "checkout.completed", object: { id: "ch_1" } }, env)
    state.subscriptionStatus = "expired"
    assert.deepEqual(await syncAllSubscriptions(env), { synced: 1 })
    assert.ok(await env.LICENSE_STATE.get("revoked:PG-KEY"))

    state.subscriptionStatus = "active"
    await post("/webhooks/creem", { eventType: "subscription.paid", object: { id: "sub_1" } }, env)
    assert.equal(await env.LICENSE_STATE.get("revoked:PG-KEY"), null)
  })
})
