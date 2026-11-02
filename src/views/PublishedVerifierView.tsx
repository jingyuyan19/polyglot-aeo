import { framer } from "framer-plugin"
import { type CSSProperties, useEffect, useMemo, useState } from "react"

import { TopBar } from "../components/TopBar"
import { LlmsIcon, MetaIcon, SchemaIcon, VerifyIcon } from "../components/icons"
import { useI18n, type TranslationKey } from "../i18n"
import {
  publishedCheckDetail,
  publishedCheckLabel,
} from "../lib/aeo/published-verifier-labels"
import {
  resolvePublishedBaseUrl,
  runPublishedVerification,
  type PublishedVerificationCheck,
} from "../lib/aeo/run-published-verification"
import { isPublicHttpsUrl } from "../lib/aeo/verify-fetch-url"
import { downloadTextFile } from "../lib/download-text"
import { getAllLocales, type LocaleInfo } from "../lib/framer/locales"
import { licenseApiBase } from "../lib/license/api"
import type { ToolRoute } from "../lib/routeStack"
import { readJson, StorageKeys, writeJson } from "../lib/storage"

interface Props {
  onBack: () => void
  onOpen?: (route: ToolRoute) => void
  onOpenSettings: () => void
  onOpenOnboarding?: () => void
  restoredSession?: PublishedVerifierSession | null
  onPersistSession?: (session: PublishedVerifierSession | null) => void
}

type CheckStatus = "pass" | "fail" | "warn"

interface VerifyCheck {
  id: string
  status: CheckStatus
  label: string
  detail: string
}

interface VerifySummary {
  pass: number
  warn: number
  fail: number
  score: number
  llmsTotal: number
  llmsPass: number
  schema: CheckStatus | "missing"
  meta: CheckStatus | "missing"
}

interface StoredPublishedVerify {
  failureCount: number
  checkedAt: string
  baseUrl: string
  checks?: PublishedVerificationCheck[]
}

export interface PublishedVerifierSession {
  baseUrl: string
  locales: LocaleInfo[]
  rawChecks: PublishedVerificationCheck[]
  checkedAt: string | null
  checkedBaseUrl: string | null
}

function normalizePublishedUrl(url: string): string {
  return url.trim().replace(/\/$/, "")
}

function statusMarker(status: CheckStatus): string {
  if (status === "pass") return "✓"
  if (status === "fail") return "!"
  return "?"
}

function summarizeChecks(checks: ReadonlyArray<VerifyCheck>): VerifySummary {
  const pass = checks.filter((check) => check.status === "pass").length
  const warn = checks.filter((check) => check.status === "warn").length
  const fail = checks.filter((check) => check.status === "fail").length
  const weighted = pass * 100 + warn * 55
  const score = checks.length ? Math.round(weighted / checks.length) : 0
  const llmsChecks = checks.filter((check) => check.id.startsWith("llms:"))
  return {
    pass,
    warn,
    fail,
    score,
    llmsTotal: llmsChecks.length,
    llmsPass: llmsChecks.filter((check) => check.status === "pass").length,
    schema: checks.find((check) => check.id === "schema")?.status ?? "missing",
    meta: checks.find((check) => check.id === "meta")?.status ?? "missing",
  }
}

function statusTone(summary: VerifySummary, hasResults: boolean) {
  if (!hasResults) return "accent"
  if (summary.fail > 0) return "danger"
  if (summary.warn > 0) return "warning"
  return undefined
}

function statusTextKey(summary: VerifySummary, hasResults: boolean) {
  if (!hasResults) return "verify.statusIdle"
  if (summary.fail > 0) return "verify.statusNotReady"
  if (summary.warn > 0) return "verify.statusWarnings"
  return "verify.statusReady"
}

function routeForCheck(check: VerifyCheck): ToolRoute | null {
  if (check.status === "pass") return null
  if (
    check.id === "schema" ||
    check.id === "inLanguage" ||
    check.id === "inlanguage"
  ) {
    return "schema"
  }
  if (check.id === "meta") return "meta"
  if (check.id === "llms" || check.id.startsWith("llms:")) return "llms"
  return null
}

function actionKeyForRoute(route: ToolRoute): TranslationKey {
  if (route === "schema") return "verify.openSchemaAudit"
  if (route === "meta") return "verify.openMetaGenerator"
  if (route === "llms") return "verify.openLlmsGenerator"
  return "verify.openTool"
}

function toVerifyChecks(
  rawChecks: ReadonlyArray<PublishedVerificationCheck>,
  locales: ReadonlyArray<LocaleInfo>,
  t: (
    key: TranslationKey,
    params?: Record<string, string | number>,
  ) => string,
): VerifyCheck[] {
  return rawChecks.map((check) => ({
    id: check.id,
    status: check.status,
    label: publishedCheckLabel(check, locales, t),
    detail: publishedCheckDetail(check, t),
  }))
}

function isStoredPublishedVerify(
  value: StoredPublishedVerify | null,
): value is StoredPublishedVerify {
  return Boolean(value?.baseUrl && value.checkedAt)
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement("textarea")
  ta.value = text
  ta.style.position = "fixed"
  ta.style.opacity = "0"
  document.body.appendChild(ta)
  ta.select()
  document.execCommand("copy")
  document.body.removeChild(ta)
}

export function PublishedVerifierView({
  onBack,
  onOpen,
  onOpenSettings,
  onOpenOnboarding,
  restoredSession = null,
  onPersistSession,
}: Props) {
  const { t } = useI18n()
  const [baseUrl, setBaseUrl] = useState(restoredSession?.baseUrl ?? "")
  const [busy, setBusy] = useState(false)
  const [locales, setLocales] = useState<LocaleInfo[]>(
    restoredSession?.locales ?? [],
  )
  const [rawChecks, setRawChecks] = useState<PublishedVerificationCheck[]>(
    restoredSession?.rawChecks ?? [],
  )
  const [checkedAt, setCheckedAt] = useState<string | null>(
    restoredSession?.checkedAt ?? null,
  )
  const [checkedBaseUrl, setCheckedBaseUrl] = useState<string | null>(
    restoredSession?.checkedBaseUrl ?? null,
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [url, nextLocales, stored] = await Promise.all([
        resolvePublishedBaseUrl(),
        getAllLocales(),
        readJson<StoredPublishedVerify | null>(
          StorageKeys.LastPublishedVerify,
          null,
        ),
      ])
      if (cancelled) return
      setLocales(nextLocales)
      if (restoredSession?.baseUrl) {
        setBaseUrl(restoredSession.baseUrl)
      } else if (url) {
        setBaseUrl(url)
      } else if (isStoredPublishedVerify(stored)) {
        setBaseUrl(stored.baseUrl)
      }
      if (restoredSession?.rawChecks.length) {
        setRawChecks(restoredSession.rawChecks)
        setCheckedAt(restoredSession.checkedAt)
        setCheckedBaseUrl(restoredSession.checkedBaseUrl)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [restoredSession])

  useEffect(() => {
    onPersistSession?.({
      baseUrl,
      locales,
      rawChecks,
      checkedAt,
      checkedBaseUrl,
    })
  }, [
    baseUrl,
    checkedAt,
    checkedBaseUrl,
    locales,
    onPersistSession,
    rawChecks,
  ])

  const normalizedUrl = normalizePublishedUrl(baseUrl)
  const hasUrl = normalizedUrl.length > 0
  const urlIsValid = !hasUrl || isPublicHttpsUrl(normalizedUrl)
  const hasProxy = Boolean(licenseApiBase())
  const checks = useMemo(
    () => toVerifyChecks(rawChecks, locales, t),
    [locales, rawChecks, t],
  )
  const summary = useMemo(() => summarizeChecks(checks), [checks])
  const hasResults = checks.length > 0
  const blockers = useMemo(
    () => checks.filter((check) => check.status === "fail"),
    [checks],
  )
  const warnings = useMemo(
    () => checks.filter((check) => check.status === "warn"),
    [checks],
  )
  const passed = useMemo(
    () => checks.filter((check) => check.status === "pass"),
    [checks],
  )
  const scoreStyle = {
    "--pa-score": `${summary.score}%`,
  } as CSSProperties
  const checkedTimeLabel =
    checkedAt && checkedBaseUrl
      ? t("verify.lastChecked", {
          time: new Date(checkedAt).toLocaleString(),
          url: checkedBaseUrl,
        })
      : null

  const runVerify = async () => {
    if (!normalizedUrl) return
    if (!isPublicHttpsUrl(normalizedUrl)) {
      framer.notify(t("verify.invalidUrl"), { variant: "warning" })
      return
    }
    setBusy(true)
    try {
      const activeLocales = locales.length ? locales : await getAllLocales()
      if (!locales.length) setLocales(activeLocales)
      const result = await runPublishedVerification(normalizedUrl, activeLocales)
      setRawChecks(result.checks)
      setCheckedAt(result.checkedAt)
      setCheckedBaseUrl(result.baseUrl)
      void writeJson(StorageKeys.LastPublishedVerify, {
        failureCount: result.failureCount,
        checkedAt: result.checkedAt,
        baseUrl: result.baseUrl,
      })
    } catch (error) {
      framer.notify(
        t("verify.verifyFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
        { variant: "error" },
      )
    } finally {
      setBusy(false)
    }
  }

  const reportText = useMemo(() => {
    const lines = [
      "Polyglot AEO published-site verification",
      "",
      `Site: ${checkedBaseUrl || normalizedUrl || "—"}`,
      checkedAt ? `Checked: ${new Date(checkedAt).toLocaleString()}` : null,
      "",
      `Summary: ${summary.fail} failed · ${summary.warn} warnings · ${summary.pass} passed`,
      "",
      ...checks.map(
        (check) =>
          `[${check.status.toUpperCase()}] ${check.label}\n${check.detail}`,
      ),
    ].filter(Boolean)
    return lines.join("\n")
  }, [checkedAt, checkedBaseUrl, checks, normalizedUrl, summary])

  const copyReport = async () => {
    if (!hasResults) return
    await copyText(reportText)
    framer.notify(t("verify.reportCopied"), { variant: "success" })
  }

  const downloadReport = () => {
    if (!hasResults) return
    downloadTextFile("polyglot-aeo-published-site-report.txt", reportText)
    framer.notify(t("verify.reportDownloaded"), { variant: "success" })
  }

  const renderCheck = (check: VerifyCheck) => {
    const actionRoute = routeForCheck(check)
    const actionLabel = actionRoute ? t(actionKeyForRoute(actionRoute)) : ""
    return (
      <div key={check.id} className="pa-verify-item" data-state={check.status}>
        <span className="pa-health-marker" aria-hidden="true">
          {statusMarker(check.status)}
        </span>
        <span className="pa-stack">
          <span className="pa-health-title">{check.label}</span>
          <span className="pa-section-helper">{check.detail}</span>
          {actionRoute && onOpen && (
            <button
              type="button"
              className="pa-verify-item-action"
              aria-label={`${actionLabel}: ${check.label}`}
              data-testid={`verify-fix-${check.id}`}
              onClick={() => onOpen(actionRoute)}
            >
              {actionLabel}
              <span aria-hidden="true">→</span>
            </button>
          )}
        </span>
      </div>
    )
  }

  return (
    <>
      <TopBar
        title={t("verify.title")}
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        onOpenOnboarding={onOpenOnboarding}
      />
      <div className="pa-scroll pa-scroll--with-footer">
        <section
          className="pa-card pa-control-hero pa-verify-hero"
          data-tone={statusTone(summary, hasResults)}
          aria-busy={busy}
          aria-live="polite"
        >
          <div className="pa-control-hero-main">
            <div className="pa-score-ring" style={scoreStyle}>
              <span className="pa-score-ring-value">
                {hasResults ? summary.score : "—"}
              </span>
              <span className="pa-score-ring-label">
                {t("verify.ringLabel")}
              </span>
            </div>
            <div className="pa-control-hero-copy">
              <span className="pa-eyebrow">{t("verify.heroEyebrow")}</span>
              <h2 className="pa-hero-title">
                {t(statusTextKey(summary, hasResults))}
              </h2>
              <p className="pa-control-summary-line">
                {hasResults
                  ? t("verify.summaryLine", {
                      fail: summary.fail,
                      warn: summary.warn,
                      pass: summary.pass,
                    })
                  : t("verify.emptySummaryLine")}
              </p>
              <p className="pa-section-helper">{t("verify.heroBody")}</p>
            </div>
          </div>
          <div className="pa-metric-grid">
            <div className="pa-metric-tile">
              <VerifyIcon />
              <span>
                <strong>{hasResults ? summary.fail : "—"}</strong>
                <small>{t("verify.metricFailures")}</small>
              </span>
            </div>
            <div className="pa-metric-tile">
              <LlmsIcon />
              <span>
                <strong>
                  {hasResults
                    ? `${summary.llmsPass}/${summary.llmsTotal}`
                    : "—"}
                </strong>
                <small>{t("verify.metricLlms")}</small>
              </span>
            </div>
            <div className="pa-metric-tile">
              <SchemaIcon />
              <span>
                <strong>
                  {summary.schema === "pass"
                    ? t("verify.metricOk")
                    : summary.schema === "missing"
                      ? "—"
                      : t("verify.metricReview")}
                </strong>
                <small>{t("verify.metricSchema")}</small>
              </span>
            </div>
            <div className="pa-metric-tile">
              <MetaIcon />
              <span>
                <strong>
                  {summary.meta === "pass"
                    ? t("verify.metricOk")
                    : summary.meta === "missing"
                      ? "—"
                      : t("verify.metricReview")}
                </strong>
                <small>{t("verify.metricMeta")}</small>
              </span>
            </div>
          </div>
          <div className="pa-action-strip">
            <button
              type="button"
              className="pa-control-action"
              onClick={() => void runVerify()}
              disabled={busy || !hasUrl}
            >
              {busy
                ? t("verify.running")
                : hasResults
                  ? t("verify.rerun")
                  : t("verify.runShort")}
            </button>
            <button
              type="button"
              className="pa-control-action"
              onClick={() => void copyReport()}
              disabled={!hasResults}
            >
              {t("verify.copyReport")}
            </button>
            <button
              type="button"
              className="pa-control-action"
              onClick={downloadReport}
              disabled={!hasResults}
            >
              {t("verify.downloadReport")}
            </button>
          </div>
          {checkedTimeLabel && (
            <p className="pa-section-helper pa-verify-last-check">
              {checkedTimeLabel}
            </p>
          )}
        </section>

        <section className="pa-card pa-verify-url-card">
          <label className="pa-label">
            {t("verify.siteUrl")}
            <input
              className="pa-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
          <p className="pa-section-helper">{t("verify.helperShort")}</p>
          {!urlIsValid && (
            <div className="pa-verify-note" data-tone="danger">
              <strong>{t("verify.invalidUrl")}</strong>
            </div>
          )}
          {!hasProxy && (
            <div className="pa-verify-note" data-tone="warning">
              <strong>{t("verify.proxyHintTitle")}</strong>
              <span>{t("verify.proxyHint")}</span>
            </div>
          )}
        </section>

        {!hasResults && (
          <section className="pa-card pa-verify-empty">
            <span className="pa-section-title">
              {t("verify.beforeRunTitle")}
            </span>
            <p className="pa-section-helper">{t("verify.beforeRunBody")}</p>
            <div className="pa-verify-check-grid">
              <span>{t("verify.checkHomepage")}</span>
              <span>{t("verify.checkSchema")}</span>
              <span>{t("verify.checkMeta")}</span>
              <span>{t("verify.checkLlms")}</span>
            </div>
          </section>
        )}

        {hasResults && (
          <>
            {(blockers.length > 0 || warnings.length > 0) && (
              <section className="pa-card pa-verify-group">
                <div className="pa-section-row">
                  <span className="pa-section-title">
                    {t("verify.fixFirst")}
                  </span>
                  <span className="pa-pill pa-pill--soft">
                    {blockers.length + warnings.length}
                  </span>
                </div>
                <div className="pa-health-list">
                  {blockers.map(renderCheck)}
                  {warnings.map(renderCheck)}
                </div>
              </section>
            )}

            {passed.length > 0 && (
              <details className="pa-card pa-verify-passed">
                <summary>
                  <span>{t("verify.passedChecks")}</span>
                  <span className="pa-pill pa-pill--soft">{passed.length}</span>
                </summary>
                <div className="pa-health-list">{passed.map(renderCheck)}</div>
              </details>
            )}
          </>
        )}
      </div>
      <div className="pa-footer">
        <button
          type="button"
          className="pa-button-primary"
          onClick={() => void runVerify()}
          disabled={busy || !hasUrl}
        >
          {busy
            ? t("verify.running")
            : hasResults
              ? t("verify.rerun")
              : t("verify.run")}
        </button>
      </div>
    </>
  )
}
