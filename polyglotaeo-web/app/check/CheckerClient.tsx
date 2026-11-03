"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"

import { FramerInstallButton, LICENSE_API_BASE } from "../components"
import { analyzeSite, normalizeSiteUrl, type Fetched, type SiteReport } from "./analyze"

type State =
  | { phase: "idle" }
  | { phase: "checking"; url: string }
  | { phase: "done"; url: string; report: SiteReport }
  | { phase: "error"; message: string }

const STATUS_LABEL = { pass: "Pass", warn: "Improve", fail: "Missing" } as const

/** Fetch one public URL through the Polyglot verify proxy (browsers cannot read other sites directly). */
async function fetchPublic(url: string): Promise<Fetched> {
  try {
    const res = await fetch(`${LICENSE_API_BASE}/verify-fetch?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const data = (await res.json()) as { status?: number; text?: string }
    return typeof data.status === "number" ? { status: data.status, text: data.text ?? "" } : null
  } catch {
    return null
  }
}

export function CheckerClient() {
  const [input, setInput] = useState("")
  const [state, setState] = useState<State>({ phase: "idle" })

  const run = useCallback(async (raw: string) => {
    const target = normalizeSiteUrl(raw)
    if (!target) {
      setState({ phase: "error", message: "Enter a public web address, like example.com." })
      return
    }
    const url = target.toString()
    setState({ phase: "checking", url })
    window.history.replaceState(null, "", `?url=${encodeURIComponent(url)}`)

    const [page, llms, robots, sitemap] = await Promise.all([
      fetchPublic(url),
      fetchPublic(new URL("/llms.txt", target).toString()),
      fetchPublic(new URL("/robots.txt", target).toString()),
      fetchPublic(new URL("/sitemap.xml", target).toString()),
    ])
    setState({ phase: "done", url, report: analyzeSite({ page, llms, robots, sitemap }) })
  }, [])

  // A shared link (?url=...) runs the check straight away.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get("url")
    if (shared) {
      setInput(shared)
      void run(shared)
    }
  }, [run])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void run(input)
  }

  return (
    <div className="checker">
      <form className="checker-form" onSubmit={onSubmit}>
        <input
          aria-label="Site URL"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yoursite.com"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button className="button primary" type="submit" disabled={state.phase === "checking"}>
          {state.phase === "checking" ? "Checking…" : "Check site"}
        </button>
      </form>
      <p className="fine-print">
        Public pages only: the URL you enter plus its /llms.txt, /robots.txt and
        /sitemap.xml. Nothing is stored.
      </p>

      {state.phase === "error" && <p className="checker-error" role="alert">{state.message}</p>}
      {state.phase === "checking" && <p className="checker-status" role="status">Reading {state.url}…</p>}
      {state.phase === "done" && <Report url={state.url} report={state.report} />}
    </div>
  )
}

function Report({ url, report }: { url: string; report: SiteReport }) {
  const fixable = report.findings.filter((f) => f.status !== "pass" && f.polyglotFixes).length
  return (
    <section className="checker-report" aria-live="polite">
      <div className="checker-summary">
        <div className={`checker-score checker-score-${report.score >= 80 ? "good" : report.score >= 50 ? "mid" : "low"}`}>
          <strong>{report.score}</strong>
          <span>/ 100</span>
        </div>
        <div>
          <h2>{new URL(url).hostname}</h2>
          <p className="checker-meta">
            {report.reachable
              ? [
                  report.isFramer ? "Built with Framer" : null,
                  report.locales.length > 1 ? `${report.locales.length} languages` : "1 language found",
                  report.schemaTypes.length ? `Schema: ${report.schemaTypes.join(", ")}` : "No schema",
                ].filter(Boolean).join(" · ")
              : "Page could not be read"}
          </p>
        </div>
      </div>

      <ul className="checker-findings">
        {report.findings.map((item) => (
          <li key={item.id} className={`checker-finding checker-${item.status}`}>
            <span className="checker-pill">{STATUS_LABEL[item.status]}</span>
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
              {item.status !== "pass" && item.polyglotFixes && (
                <p className="checker-fix">Polyglot AEO can fix this inside Framer.</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {report.reachable && (
        <div className="checker-cta">
          <p>
            {fixable > 0
              ? `Polyglot AEO can fix ${fixable} of these from inside Framer: per-language schema, llms.txt, metadata and hreflang checks.`
              : "Nice work. Polyglot AEO keeps it this way as you add languages and CMS content."}
          </p>
          <div className="hero-actions">
            <FramerInstallButton trackingLabel="Checker install">Install Polyglot AEO free</FramerInstallButton>
            <Link className="button" href="/audit/">Get a human mini audit</Link>
          </div>
        </div>
      )}
    </section>
  )
}
