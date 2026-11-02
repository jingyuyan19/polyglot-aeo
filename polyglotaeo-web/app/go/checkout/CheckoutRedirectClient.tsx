"use client"

import { useEffect, useMemo, useState } from "react"

import { UTM_KEYS, getAttributionSnapshot } from "../../attribution"

const EVENT_FORM_NAME = "framer-aeo-event"
const FALLBACK_TARGET = "/pricing/"
const REDIRECT_DELAY_MS = 350

const ALLOWED_TARGETS = [
  {
    host: "license.polyglotaeo.com",
    pathPrefix: "/checkout",
  },
  {
    host: "polyglotaeo.com",
    pathPrefix: "/pricing",
  },
]

function allowedTarget(rawTarget: string | null) {
  if (!rawTarget) return FALLBACK_TARGET

  try {
    const url = new URL(rawTarget)
    const host = url.hostname.toLowerCase()
    const allowed = ALLOWED_TARGETS.some(
      (target) =>
        host === target.host && url.pathname.startsWith(target.pathPrefix),
    )
    return url.protocol === "https:" && allowed ? url.toString() : FALLBACK_TARGET
  } catch {
    return FALLBACK_TARGET
  }
}

function eventBody(destination: string, params: URLSearchParams) {
  const body = new URLSearchParams()
  body.set("form-name", EVENT_FORM_NAME)
  body.set("event_type", "checkout_click")
  body.set("cta", `Plugin ${params.get("plan") || "pro"} checkout`)
  body.set("destination", destination)
  body.set("source_path", `${window.location.pathname}${window.location.search}`)
  const attribution = getAttributionSnapshot()
  body.set("landing_path", attribution.landing_path)
  body.set("referrer", attribution.referrer || document.referrer || "")
  body.set("ts", new Date().toISOString())

  for (const key of UTM_KEYS) {
    body.set(key, params.get(key) || attribution[key] || "")
  }

  if (params.get("reason")) body.set("reason", params.get("reason") || "")
  if (params.get("project_id")) {
    body.set("project_id", params.get("project_id") || "")
  }
  if (params.get("test_mode")) body.set("test_mode", params.get("test_mode") || "")

  return body
}

function submitEvent(body: URLSearchParams) {
  const encoded = body.toString()
  if (navigator.sendBeacon) {
    const blob = new Blob([encoded], {
      type: "application/x-www-form-urlencoded;charset=UTF-8",
    })
    navigator.sendBeacon("/", blob)
    return
  }

  void fetch("/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: encoded,
    keepalive: true,
  }).catch(() => undefined)
}

export function CheckoutRedirectClient() {
  const [destination, setDestination] = useState(FALLBACK_TARGET)
  const [didRedirect, setDidRedirect] = useState(false)

  const params = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams()
    return new URLSearchParams(window.location.search)
  }, [])

  useEffect(() => {
    const target = allowedTarget(params.get("target"))
    setDestination(target)
    submitEvent(eventBody(target, params))

    const timer = window.setTimeout(() => {
      setDidRedirect(true)
      window.location.replace(target)
    }, REDIRECT_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [params])

  return (
    <section className="section checkout-bridge">
      <p className="eyebrow">Plugin checkout</p>
      <h1>Preparing checkout...</h1>
      <p className="lead">
        Redirecting to the secure Polyglot AEO checkout.
      </p>
      <div className="card-actions">
        <a className="button primary" href={destination}>
          Continue to checkout
        </a>
        <a className="button soft" href="/pricing/">
          View pricing
        </a>
      </div>
      <p className="fine-print">
        {didRedirect
          ? "Opening checkout now."
          : "framer-aeo-event is being recorded."}
      </p>
    </section>
  )
}
