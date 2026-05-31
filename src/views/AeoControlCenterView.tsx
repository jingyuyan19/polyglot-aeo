import { useCallback, useEffect, useState } from "react"

import type { ToolRoute } from "../App"
import { TopBar } from "../components/TopBar"
import { useEntitlement } from "../components/entitlement-hooks"
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
import { readJson, StorageKeys } from "../lib/storage"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onOpen: (route: ToolRoute) => void
}

interface ControlState {
  loading: boolean
  locales: LocaleInfo[]
  issues: AeoIssue[]
  score: number
  cmsReports: CmsCollectionGapReport[]
  cmsSummary: CmsGapSummary
}

const EMPTY_CMS_SUMMARY: CmsGapSummary = {
  rowCount: 0,
  collectionCount: 0,
  missingTitleCount: 0,
  missingSummaryCount: 0,
  missingSlugCount: 0,
  duplicateTitleCount: 0,
}

function issueTone(severity: AeoIssue["severity"]): "warning" | "accent" {
  return severity === "critical" ? "warning" : "accent"
}

export function AeoControlCenterView({
  onBack,
  onOpenSettings,
  onOpen,
}: Props) {
  const { t } = useI18n()
  const { tier, requestUpgrade } = useEntitlement()
  const [state, setState] = useState<ControlState>({
    loading: true,
    locales: [],
    issues: [],
    score: 0,
    cmsReports: [],
    cmsSummary: EMPTY_CMS_SUMMARY,
  })

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    const [
      locales,
      installed,
      lastLlms,
      lastMeta,
      customProviders,
      collections,
    ] = await Promise.all([
      getAllLocales(),
      readInstalledStatus(),
      readJson<unknown>(StorageKeys.LastLlmsTxt, null),
      readJson<unknown>(StorageKeys.LastMetaResults, null),
      readCustomProviders(),
      listCollections(),
    ])

    const allProviderIds = [
      ...BUILTIN_PROVIDERS.map((provider) => provider.id),
      ...customProviders.map((provider) => provider.id),
    ]
    const keys = await Promise.all(allProviderIds.map((id) => readProviderKey(id)))

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
      publishedFailureCount: 0,
    })

    setState({
      loading: false,
      locales,
      issues,
      score: scoreAeoIssues(issues),
      cmsReports,
      cmsSummary,
    })
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
        break
    }
  }

  const counts = countAeoIssuesBySeverity(state.issues)
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
      `- ${t("control.openVerifier")}: ${t("verify.helper")}`,
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
      />
      <div className="pa-scroll">
        <section className="pa-card pa-health-card">
          <div className="pa-row-spread">
            <span className="pa-section-title">{t("control.readiness")}</span>
            <span
              className="pa-pill"
              data-tone={
                state.score >= 80
                  ? "success"
                  : state.score >= 45
                    ? "warning"
                    : "accent"
              }
            >
              {t("dashboard.healthScore", { score: state.score })}
            </span>
          </div>
          <div className="pa-quickstart-progress-bar">
            <span
              className="pa-quickstart-progress-fill"
              style={{ width: `${state.score}%` }}
            />
          </div>
          <p className="pa-section-helper" style={{ margin: 0 }}>
            {state.loading
              ? t("control.scanning")
              : t("control.summary", {
                  critical: counts.critical,
                  warning: counts.warning,
                  info: counts.info,
                })}
          </p>
          <button
            type="button"
            className="pa-button"
            onClick={() => void load()}
            disabled={state.loading}
          >
            {state.loading ? t("control.scanning") : t("control.rescan")}
          </button>
          <button
            type="button"
            className="pa-button"
            onClick={downloadReport}
            disabled={state.loading}
          >
            {t("control.downloadReport")}
          </button>
        </section>

        <section className="pa-card">
          <span className="pa-section-title">{t("control.issuesTitle")}</span>
          {state.issues.length === 0 && !state.loading ? (
            <p className="pa-section-helper">{t("control.noIssues")}</p>
          ) : (
            <div className="pa-health-list">
              {state.issues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className="pa-health-item"
                  data-state="todo"
                  onClick={() => handleIssueClick(issue.id)}
                >
                  <span className="pa-health-marker" aria-hidden="true">
                    !
                  </span>
                  <span className="pa-stack">
                    <span className="pa-health-title">
                      {t(`control.issue.${issue.id}.title` as TranslationKey, {
                        count: issue.count ?? 0,
                      })}
                    </span>
                    <span className="pa-section-helper" style={{ margin: 0 }}>
                      <span className="pa-pill" data-tone={issueTone(issue.severity)}>
                        {t(`control.severity.${issue.severity}` as TranslationKey)}
                      </span>{" "}
                      {t(`control.issue.${issue.id}.body` as TranslationKey, {
                        count: issue.count ?? 0,
                      })}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="pa-card">
          <div className="pa-row-spread">
            <span className="pa-section-title">{t("control.cmsTitle")}</span>
            <span className="pa-pill">
              {t("control.cmsCollections", {
                n: state.cmsSummary.collectionCount,
              })}
            </span>
          </div>
          <p className="pa-section-helper">
            {t("control.cmsSummary", {
              titles: state.cmsSummary.missingTitleCount,
              summaries: state.cmsSummary.missingSummaryCount,
              slugs: state.cmsSummary.missingSlugCount,
              duplicates: state.cmsSummary.duplicateTitleCount,
            })}
          </p>
          {topCmsReports.length > 0 ? (
            <div className="pa-health-list">
              {topCmsReports.map((report) => (
                <div key={report.collectionId} className="pa-verify-item">
                  <span className="pa-health-marker" aria-hidden="true">
                    !
                  </span>
                  <span className="pa-stack">
                    <span className="pa-health-title">
                      {report.collectionName}
                    </span>
                    <span className="pa-section-helper" style={{ margin: 0 }}>
                      {report.localeGaps
                        .filter(
                          (gap) =>
                            gap.missingTitles +
                              gap.missingSummaries +
                              gap.missingSlugs >
                            0,
                        )
                        .map((gap) =>
                          t("control.cmsLocaleLine", {
                            locale: gap.localeCode,
                            titles: gap.missingTitles,
                            summaries: gap.missingSummaries,
                            slugs: gap.missingSlugs,
                          }),
                        )
                        .join(" · ")}
                      {report.duplicateTitles.length > 0
                        ? ` · ${t("control.cmsDuplicates", {
                            n: report.duplicateTitles.length,
                          })}`
                        : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="pa-section-helper">{t("control.cmsNoGaps")}</p>
          )}
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
          onClick={() => onOpen("schema")}
        >
          {t("control.fixPrimary")}
        </button>
      </div>
    </>
  )
}
