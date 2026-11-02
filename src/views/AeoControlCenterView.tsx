import { useCallback, useEffect, useState, type CSSProperties } from "react"

import type { ToolRoute } from "../App"
import { CmsCollectionGapCard } from "../components/CmsCollectionGapCard"
import { TopBar } from "../components/TopBar"
import { useEntitlement } from "../components/entitlement-hooks"
import { CmsIcon, LlmsIcon, SchemaIcon, VerifyIcon } from "../components/icons"
import { useI18n, type TranslationKey } from "../i18n"
import {
  readCustomProviders,
  readProviderKey,
} from "../lib/ai/client"
import { BUILTIN_PROVIDERS } from "../lib/ai/providers"
import {
  analyzeCmsCollectionLocalization,
  summarizeCmsGapReports,
  type CmsCollectionGapReport,
  type CmsGapSummary,
} from "../lib/aeo/cms-gaps"
import {
  buildAeoIssues,
  countAeoIssuesBySeverity,
  scoreAeoIssues,
  type AeoIssue,
  type AeoIssueId,
} from "../lib/aeo/issues"
import {
  listCollections,
  readCollectionItems,
} from "../lib/framer/cms"
import { readInstalledStatus } from "../lib/framer/customCode"
import { getAllLocales, type LocaleInfo } from "../lib/framer/locales"
import {
  runPublishedVerificationForProject,
  type PublishedVerificationResult,
} from "../lib/aeo/run-published-verification"
import { licenseApiBase } from "../lib/license/api"
import { readJson, StorageKeys, writeJson } from "../lib/storage"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onOpenOnboarding?: () => void
  onOpen: (route: ToolRoute) => void
}

interface ControlState {
  loading: boolean
  hasLoaded: boolean
  errorMessage: string | null
  locales: LocaleInfo[]
  issues: AeoIssue[]
  score: number
  cmsReports: CmsCollectionGapReport[]
  cmsSummary: CmsGapSummary
  publishedVerify: PublishedVerificationResult | null
  liveVerifySkipped: boolean
}

const EMPTY_CMS_SUMMARY: CmsGapSummary = {
  rowCount: 0,
  collectionCount: 0,
  missingTitleCount: 0,
  missingSummaryCount: 0,
  missingSlugCount: 0,
  duplicateTitleCount: 0,
}

const EMPTY_CONTROL_STATE: ControlState = {
  loading: true,
  hasLoaded: false,
  errorMessage: null,
  locales: [],
  issues: [],
  score: 0,
  cmsReports: [],
  cmsSummary: EMPTY_CMS_SUMMARY,
  publishedVerify: null,
  liveVerifySkipped: false,
}

let cachedControlState: ControlState | null = null

function issueTone(severity: AeoIssue["severity"]): "danger" | "warning" | "accent" {
  if (severity === "critical") return "danger"
  if (severity === "warning") return "warning"
  return "accent"
}

function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success"
  if (score >= 45) return "warning"
  return "danger"
}

function englishCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function controlSummaryText(
  translate: ReturnType<typeof useI18n>["t"],
  activeLocale: ReturnType<typeof useI18n>["locale"],
  counts: ReturnType<typeof countAeoIssuesBySeverity>,
) {
  if (activeLocale !== "en") {
    return translate("control.summary", {
      critical: counts.critical,
      warning: counts.warning,
      info: counts.info,
    })
  }
  return [
    englishCount(counts.critical, "critical issue"),
    englishCount(counts.warning, "warning"),
    englishCount(counts.info, "note"),
  ].join(" · ")
}

export function AeoControlCenterView({
  onBack,
  onOpenSettings,
  onOpenOnboarding,
  onOpen,
}: Props) {
  const { t, locale } = useI18n()
  const { tier, requestUpgrade } = useEntitlement()
  const [state, setState] = useState<ControlState>(() =>
    cachedControlState ? { ...cachedControlState, loading: false } : EMPTY_CONTROL_STATE,
  )

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, errorMessage: null }))
    try {
      const locales = await getAllLocales()
      const [
        installed,
        lastLlms,
        lastMeta,
        customProviders,
        collections,
        publishedVerify,
      ] = await Promise.all([
        readInstalledStatus(),
        readJson<unknown>(StorageKeys.LastLlmsTxt, null),
        readJson<unknown>(StorageKeys.LastMetaResults, null),
        readCustomProviders(),
        listCollections(),
        runPublishedVerificationForProject(locales),
      ])

      const allProviderIds = [
        ...BUILTIN_PROVIDERS.map((provider) => provider.id),
        ...customProviders.map((provider) => provider.id),
      ]
      const keys = await Promise.all(
        allProviderIds.map((id) => readProviderKey(id)),
      )

      const cmsReports = await Promise.all(
        collections.map(async (collection) =>
          analyzeCmsCollectionLocalization(
            collection,
            await readCollectionItems(collection.id),
            locales,
          ),
        ),
      )
      const cmsSummary = summarizeCmsGapReports(cmsReports)
      const issues = buildAeoIssues({
        localeCount: locales.length,
        isPro: tier === "pro",
        schemaInstalled: installed.installed,
        schemaDisabled: installed.disabled,
        llmsGenerated: lastLlms !== null,
        metaGenerated: lastMeta !== null,
        hasApiKey: keys.some(Boolean),
        cmsLocaleGapCount:
          cmsSummary.missingTitleCount + cmsSummary.missingSummaryCount,
        cmsDuplicateTitleCount: cmsSummary.duplicateTitleCount,
        publishedFailureCount: publishedVerify?.failureCount ?? 0,
      })

      if (publishedVerify) {
        void writeJson(StorageKeys.LastPublishedVerify, {
          failureCount: publishedVerify.failureCount,
          checkedAt: publishedVerify.checkedAt,
          baseUrl: publishedVerify.baseUrl,
        })
      }

      const nextState: ControlState = {
        loading: false,
        hasLoaded: true,
        errorMessage: null,
        locales,
        issues,
        score: scoreAeoIssues(issues),
        cmsReports,
        cmsSummary,
        publishedVerify: publishedVerify ?? null,
        liveVerifySkipped: publishedVerify === null,
      }
      cachedControlState = nextState
      setState(nextState)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn("Polyglot AEO control scan failed.", error)
      setState((prev) => ({
        ...prev,
        loading: false,
        hasLoaded: prev.hasLoaded,
        errorMessage: message,
      }))
    }
  }, [tier])

  useEffect(() => {
    void load()
  }, [load])

  const handleIssueClick = (id: AeoIssueId) => {
    switch (id) {
      case "schema_missing":
      case "schema_disabled":
        onOpen("schema")
        break
      case "llms_missing":
        onOpen("llms")
        break
      case "meta_missing":
        onOpen("meta")
        break
      case "api_key_missing":
        onOpenSettings()
        break
      case "multi_locale_locked":
        requestUpgrade("multi_locale")
        break
      case "published_failures":
        onOpen("verify")
        break
      case "cms_locale_gaps":
      case "cms_duplicate_titles":
        onOpen("cms")
        break
    }
  }

  const counts = countAeoIssuesBySeverity(state.issues)
  const isInitialLoading = state.loading && !state.hasLoaded
  const metricValue = (value: number) => (state.hasLoaded ? value : "—")
  const scoreRingStyle = {
    "--pa-score": `${state.hasLoaded ? Math.max(0, Math.min(100, state.score)) : 0}%`,
  } as CSSProperties
  const proCoverageIssue =
    state.issues.find((issue) => issue.id === "multi_locale_locked") ?? null
  const taskIssues = state.issues.filter(
    (issue) => issue.id !== "multi_locale_locked",
  )
  const launchBlockerCount = counts.critical
  const taskCount = taskIssues.length
  const cmsLaunchGapCount =
    state.cmsSummary.missingTitleCount + state.cmsSummary.missingSummaryCount
  const liveFailureCount = state.publishedVerify?.failureCount ?? 0
  const primaryIssue = taskIssues[0] ?? null
  const primaryCtaLabel = state.loading
    ? t("control.scanning")
    : primaryIssue
      ? t(`control.issue.${primaryIssue.id}.action` as TranslationKey, {
          count: primaryIssue.count ?? 0,
        })
      : t("control.runVerifier")
  const readinessStatus = isInitialLoading
    ? t("control.scanning")
    : counts.critical > 0
      ? t("control.status.blocked")
      : counts.warning > 0
        ? t("control.status.needsWork")
        : counts.info > 0
          ? t("control.status.readyWithNotes")
          : t("control.status.ready")
  const readinessSummary = controlSummaryText(t, locale, counts)
  const liveStatusLine = isInitialLoading
    ? t("control.scanning")
    : state.publishedVerify
    ? t("control.liveVerifyCompact", {
        failures: state.publishedVerify.failureCount,
        url: state.publishedVerify.baseUrl,
      })
    : state.liveVerifySkipped
      ? t("control.liveVerifySkipped")
      : t("control.verifyRescanNote")
  const topCmsReports = state.cmsReports
    .filter(
      (report) =>
        report.localeGaps.some(
          (gap) =>
            gap.missingTitles > 0 ||
            gap.missingSummaries > 0 ||
            gap.missingSlugs > 0,
        ) || report.duplicateTitles.length > 0,
    )
    .slice(0, 6)

  const downloadReport = () => {
    const today = new Date().toISOString().slice(0, 10)
    const issueLines =
      state.issues.length > 0
        ? state.issues.map(
            (issue) =>
              `- [${issue.severity}] ${t(
                `control.issue.${issue.id}.title` as TranslationKey,
                { count: issue.count ?? 0 },
              )}`,
          )
        : [`- ${t("control.noIssues")}`]
    const cmsLines = state.cmsReports.flatMap((report) => [
      `- ${report.collectionName}: ${t("cmsGaps.rows", { n: report.rowCount })}`,
      ...report.localeGaps.map(
        (gap) =>
          `  - ${t("control.cmsLocaleLine", {
            locale: gap.localeCode,
            titles: gap.missingTitles,
            summaries: gap.missingSummaries,
            slugs: gap.missingSlugs,
          })}`,
      ),
      ...(report.duplicateTitles.length > 0
        ? [
            `  - ${t("control.cmsDuplicates", {
              n: report.duplicateTitles.length,
            })}`,
          ]
        : []),
    ])
    const markdown = [
      "# Polyglot AEO Control Report",
      "",
      `Date: ${today}`,
      `Readiness: ${state.score}%`,
      `Locales: ${state.locales.map((locale) => locale.code).join(", ") || "none"}`,
      "",
      "## Launch blockers",
      ...issueLines,
      "",
      "## CMS localization gaps",
      t("control.cmsSummary", {
        titles: state.cmsSummary.missingTitleCount,
        summaries: state.cmsSummary.missingSummaryCount,
        slugs: state.cmsSummary.missingSlugCount,
        duplicates: state.cmsSummary.duplicateTitleCount,
      }),
      "",
      ...(cmsLines.length > 0 ? cmsLines : [`- ${t("control.cmsNoGaps")}`]),
      "",
      "## Post-publish",
      state.liveVerifySkipped
        ? `- ${t("control.liveVerifySkipped")}`
        : state.publishedVerify
          ? `- ${t("control.liveVerifySummary", {
              failures: state.publishedVerify.failureCount,
              time: new Date(state.publishedVerify.checkedAt).toLocaleString(),
              url: state.publishedVerify.baseUrl,
            })}`
          : `- ${t("control.openVerifier")}: ${t("verify.helper")}`,
    ].join("\n")
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `polyglot-aeo-control-report-${today}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <TopBar
        title={t("control.title")}
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        onOpenOnboarding={onOpenOnboarding}
      />
      <div className="pa-scroll pa-scroll--with-footer">
        <section
          className="pa-card pa-control-hero"
          data-tone={state.loading ? "accent" : scoreTone(state.score)}
        >
          <div className="pa-control-hero-main">
            <div
              className="pa-score-ring"
              style={scoreRingStyle}
              aria-label={t("dashboard.healthScore", { score: state.score })}
            >
              <span className="pa-score-ring-value">
                {state.hasLoaded ? state.score : "—"}
              </span>
              <span className="pa-score-ring-label">AEO</span>
            </div>
            <div className="pa-control-hero-copy">
              <span className="pa-section-title">{t("control.readiness")}</span>
              <h2 className="pa-card-title">{readinessStatus}</h2>
              {state.hasLoaded && (
                <p className="pa-control-summary-line">
                  {readinessSummary}
                </p>
              )}
              <p className="pa-section-helper" style={{ margin: 0 }}>
                {t("control.readinessHint")}
              </p>
            </div>
          </div>
          <div className="pa-metric-grid">
            <span className="pa-metric-tile">
              <SchemaIcon size={15} />
              <span>
                <strong>{metricValue(launchBlockerCount)}</strong>
                <small>{t("control.metricLaunchBlockers")}</small>
              </span>
            </span>
            <span className="pa-metric-tile">
              <CmsIcon size={15} />
              <span>
                <strong>{metricValue(cmsLaunchGapCount)}</strong>
                <small>{t("control.metricCmsGaps")}</small>
              </span>
            </span>
            <span className="pa-metric-tile">
              <LlmsIcon size={15} />
              <span>
                <strong>{metricValue(state.locales.length)}</strong>
                <small>{t("control.metricLocales")}</small>
              </span>
            </span>
            <span className="pa-metric-tile">
              <VerifyIcon size={15} />
              <span>
                <strong>{metricValue(liveFailureCount)}</strong>
                <small>{t("control.metricLiveFailures")}</small>
              </span>
            </span>
          </div>
          <div className="pa-action-strip">
            <button
              type="button"
              className="pa-control-action"
              data-variant="primary"
              onClick={() => void load()}
              disabled={state.loading}
            >
              {state.loading ? t("control.scanning") : t("control.rescan")}
            </button>
            <button
              type="button"
              className="pa-control-action"
              onClick={downloadReport}
              disabled={state.loading || !state.hasLoaded}
            >
              {t("control.downloadReport")}
            </button>
          </div>
          <p className="pa-section-helper" style={{ margin: 0 }}>
            {liveStatusLine}
          </p>
          {!licenseApiBase() && (
            <p className="pa-section-helper" style={{ margin: "6px 0 0" }}>
              {t("control.verifyNoProxy")}
            </p>
          )}
          {state.errorMessage && (
            <p className="pa-section-helper" style={{ margin: "6px 0 0" }}>
              {t("control.scanFailed", { error: state.errorMessage })}
            </p>
          )}
        </section>

        <section className="pa-card pa-control-section">
          <div className="pa-row-spread">
            <span className="pa-section-title">{t("control.taskQueueTitle")}</span>
            <span
              className="pa-pill"
              data-tone={
                launchBlockerCount > 0
                  ? "danger"
                  : counts.warning > 0
                    ? "warning"
                    : taskCount > 0
                      ? "accent"
                      : "success"
              }
            >
              {state.hasLoaded ? taskCount : "—"}
            </span>
          </div>
          <p className="pa-section-helper">{t("control.taskQueueHelper")}</p>
          {isInitialLoading ? (
            <p className="pa-section-helper">{t("control.scanning")}</p>
          ) : taskIssues.length === 0 ? (
            <p className="pa-section-helper">{t("control.noIssues")}</p>
          ) : (
            <div className="pa-health-list">
              {taskIssues.map((issue, index) => (
                <button
                  key={issue.id}
                  type="button"
                  className="pa-health-item"
                  data-state="todo"
                  data-severity={issue.severity}
                  onClick={() => handleIssueClick(issue.id)}
                >
                  <span className="pa-health-marker" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="pa-stack">
                    <span className="pa-task-step">
                      {t("control.taskStep", { n: index + 1 })}
                    </span>
                    <span className="pa-health-title">
                      {t(`control.issue.${issue.id}.title` as TranslationKey, {
                        count: issue.count ?? 0,
                      })}
                    </span>
                    <span
                      className="pa-section-helper pa-health-item-body"
                      style={{ margin: 0 }}
                    >
                      <span className="pa-pill" data-tone={issueTone(issue.severity)}>
                        {t(`control.severity.${issue.severity}` as TranslationKey)}
                      </span>
                      <span className="pa-health-item-body-text">
                        {t(`control.issue.${issue.id}.body` as TranslationKey, {
                          count: issue.count ?? 0,
                        })}
                      </span>
                    </span>
                    <span className="pa-task-action">
                      {t(
                        `control.issue.${issue.id}.action` as TranslationKey,
                        { count: issue.count ?? 0 },
                      )}
                      <span aria-hidden="true">→</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {proCoverageIssue && !state.loading ? (
            <button
              type="button"
              className="pa-pro-coverage-card"
              onClick={() => handleIssueClick(proCoverageIssue.id)}
            >
              <span className="pa-pro-coverage-badge">{t("control.proBadge")}</span>
              <span className="pa-stack">
                <span className="pa-health-title">
                  {t("control.proCoverageTitle", {
                    count: proCoverageIssue.count ?? 0,
                  })}
                </span>
                <span className="pa-section-helper" style={{ margin: 0 }}>
                  {t("control.proCoverageBody")}
                </span>
                <span className="pa-task-action">
                  {t("control.proCoverageAction")}
                  <span aria-hidden="true">→</span>
                </span>
              </span>
            </button>
          ) : null}
        </section>

        <section className="pa-card pa-control-section">
          <div className="pa-row-spread">
            <span className="pa-section-title">{t("control.cmsTitle")}</span>
            <span className="pa-pill">
              {state.hasLoaded
                ? t("control.cmsCollections", {
                    n: state.cmsSummary.collectionCount,
                  })
                : t("control.scanning")}
            </span>
          </div>
          {isInitialLoading ? (
            <p className="pa-section-helper">{t("control.scanning")}</p>
          ) : (
            <>
              <p className="pa-section-helper">
                {t("control.cmsSummary", {
                  titles: state.cmsSummary.missingTitleCount,
                  summaries: state.cmsSummary.missingSummaryCount,
                  slugs: state.cmsSummary.missingSlugCount,
                  duplicates: state.cmsSummary.duplicateTitleCount,
                })}
              </p>
              <p className="pa-section-helper" style={{ marginTop: 6 }}>
                {t("control.cmsGapCountExplain")}
              </p>
            </>
          )}
          {!isInitialLoading && topCmsReports.length > 0 ? (
            <div className="pa-health-list">
              {topCmsReports.map((report) => (
                <CmsCollectionGapCard
                  key={report.collectionId}
                  report={report}
                />
              ))}
            </div>
          ) : !isInitialLoading ? (
            <p className="pa-section-helper">{t("control.cmsNoGaps")}</p>
          ) : null}
        </section>
      </div>
      <div className="pa-footer pa-footer-row">
        <button
          type="button"
          className="pa-footer-secondary"
          onClick={() => onOpen("cms")}
        >
          {t("control.openCmsGaps")}
        </button>
        <button
          type="button"
          className="pa-footer-secondary"
          onClick={() => onOpen("verify")}
        >
          {t("control.openVerifier")}
        </button>
        <button
          type="button"
          className="pa-button-primary"
          onClick={() => {
            if (primaryIssue) {
              handleIssueClick(primaryIssue.id)
            } else {
              onOpen("verify")
            }
          }}
          disabled={state.loading || !state.hasLoaded}
        >
          {primaryCtaLabel}
        </button>
      </div>
    </>
  )
}
