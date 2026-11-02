"use client"

import type { MouseEvent, ReactNode } from "react"

import { UTM_KEYS, getAttributionSnapshot } from "./attribution"

type TrackedLinkProps = {
  href: string
  className?: string
  children: ReactNode
  target?: string
  rel?: string
  eventType: "install_click" | "checkout_click"
  trackingLabel: string
}

const EVENT_FORM_NAME = "framer-aeo-event"

function currentParams() {
  if (typeof window === "undefined") return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function eventBody({
  href,
  eventType,
  trackingLabel,
}: {
  href: string
  eventType: string
  trackingLabel: string
}) {
  const query = currentParams()
  const body = new URLSearchParams()
  body.set("form-name", EVENT_FORM_NAME)
  body.set("event_type", eventType)
  body.set("cta", trackingLabel)
  body.set("destination", href)
  body.set("source_path", `${window.location.pathname}${window.location.search}`)
  const attribution = getAttributionSnapshot()
  body.set("landing_path", attribution.landing_path)
  body.set("referrer", attribution.referrer || document.referrer || "")
  body.set("ts", new Date().toISOString())

  for (const key of UTM_KEYS) {
    body.set(key, query.get(key) || attribution[key] || "")
  }

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

export function TrackedLink({
  href,
  className,
  children,
  target,
  rel,
  eventType,
  trackingLabel,
}: TrackedLinkProps) {
  function onClick(_event: MouseEvent<HTMLAnchorElement>) {
    submitEvent(eventBody({ href, eventType, trackingLabel }))
  }

  return (
    <a className={className} href={href} target={target} rel={rel} onClick={onClick}>
      {children}
    </a>
  )
}
