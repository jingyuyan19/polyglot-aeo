import { useCallback, useEffect, useState } from "react"

import { CmsCollectionGapCard } from "../components/CmsCollectionGapCard"
import { TopBar } from "../components/TopBar"
import { CmsIcon, VerifyIcon } from "../components/icons"
import { useI18n } from "../i18n"
import {
  analyzeCmsCollectionLocalization,
  summarizeCmsGapReports,
  type CmsCollectionGapReport,
  type CmsGapSummary,
} from "../lib/aeo/cms-gaps"
import {
  listCollections,
  readCollectionItems,
} from "../lib/framer/cms"
import { getAllLocales } from "../lib/framer/locales"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onOpenOnboarding?: () => void
}

const EMPTY_SUMMARY: CmsGapSummary = {
  rowCount: 0,
  collectionCount: 0,
  missingTitleCount: 0,
  missingSummaryCount: 0,
  missingSlugCount: 0,
  duplicateTitleCount: 0,
}

function csvEscape(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function CmsGapManagerView({
  onBack,
  onOpenSettings,
  onOpenOnboarding,
}: Props) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<CmsCollectionGapReport[]>([])
  const [summary, setSummary] = useState<CmsGapSummary>(EMPTY_SUMMARY)
  const launchBlockerCount =
    summary.missingTitleCount + summary.missingSummaryCount
  const affectedCmsRowCount = new Set(
    reports.flatMap((report) =>
      report.localeIssues.map((issue) => `${report.collectionId}:${issue.rowId}`),
    ),
  ).size

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [locales, collections] = await Promise.all([
        getAllLocales(),
        listCollections(),
      ])
      const next = await Promise.all(
        collections.map(async (collection) =>
          analyzeCmsCollectionLocalization(
            collection,
            await readCollectionItems(collection.id),
            locales,
          ),
        ),
      )
      setReports(next)
      setSummary(summarizeCmsGapReports(next))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const downloadCsv = () => {
    const duplicateTitleByRowId = new Map<string, string>()
    for (const report of reports) {
      for (const group of report.duplicateTitles) {
        for (const row of group.rows) {
          duplicateTitleByRowId.set(
            `${report.collectionId}:${row.rowId}`,
            group.title,
          )
        }
      }
    }
    const issueRows = reports.flatMap((report) =>
      report.localeIssues.map((issue) => [
        report.collectionName,
        issue.rowId,
        issue.rowTitle,
        issue.defaultSlug,
        issue.localeCode,
        issue.missingTitle ? "yes" : "",
        issue.missingSummary ? "yes" : "",
        issue.missingSlug ? "yes" : "",
        duplicateTitleByRowId.get(`${report.collectionId}:${issue.rowId}`) ??
          "",
      ]),
    )
    const issueRowKeys = new Set(
      reports.flatMap((report) =>
        report.localeIssues.map(
          (issue) => `${report.collectionId}:${issue.rowId}`,
        ),
      ),
    )
    const duplicateOnlyRows = reports.flatMap((report) =>
      report.duplicateTitles.flatMap((group) =>
        group.rows
          .filter(
            (row) => !issueRowKeys.has(`${report.collectionId}:${row.rowId}`),
          )
          .map((row) => [
            report.collectionName,
            row.rowId,
            row.rowTitle,
            row.defaultSlug,
            "",
            "",
            "",
            "",
            group.title,
          ]),
      ),
    )
    const rows = [
      [
        "collection",
        "row_id",
        "row_title",
        "default_slug",
        "locale",
        "missing_title",
        "missing_summary",
        "missing_slug",
        "duplicate_title",
      ],
      ...issueRows,
      ...duplicateOnlyRows,
    ]
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "polyglot-aeo-cms-gaps.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <TopBar
        title={t("cmsGaps.title")}
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        onOpenOnboarding={onOpenOnboarding}
      />
      <div className="pa-scroll">
        <section className="pa-card pa-control-hero">
          <div className="pa-row-spread">
            <div className="pa-section-headline">
              <span className="pa-section-title">{t("cmsGaps.summaryTitle")}</span>
              <h2 className="pa-card-title">{t("control.cmsTitle")}</h2>
            </div>
            <span className="pa-pill">
              {t("control.cmsCollections", { n: summary.collectionCount })}
            </span>
          </div>
          <div className="pa-metric-grid">
            <span className="pa-metric-tile">
              <CmsIcon size={15} />
              <span>
                <strong>{launchBlockerCount}</strong>
                <small>{t("cmsGaps.metricLaunchBlockers")}</small>
              </span>
            </span>
            <span className="pa-metric-tile">
              <CmsIcon size={15} />
              <span>
                <strong>{affectedCmsRowCount}</strong>
                <small>{t("cmsGaps.metricRowFixes")}</small>
              </span>
            </span>
            <span className="pa-metric-tile">
              <VerifyIcon size={15} />
              <span>
                <strong>{summary.missingSlugCount}</strong>
                <small>{t("cmsGaps.metricSlugs")}</small>
              </span>
            </span>
            <span className="pa-metric-tile">
              <VerifyIcon size={15} />
              <span>
                <strong>{summary.duplicateTitleCount}</strong>
                <small>{t("cmsGaps.metricDuplicates")}</small>
              </span>
            </span>
          </div>
          <p className="pa-section-helper pa-health-meta-hint">
            {t("cmsGaps.summaryHint")}
          </p>
          <div className="pa-action-strip">
            <button
              type="button"
              className="pa-footer-secondary"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? t("control.scanning") : t("control.rescan")}
            </button>
            <button
              type="button"
              className="pa-footer-secondary"
              onClick={downloadCsv}
              disabled={reports.length === 0}
            >
              {t("cmsGaps.downloadCsv")}
            </button>
          </div>
        </section>

        <section className="pa-card pa-control-section">
          <span className="pa-section-title">{t("cmsGaps.detailsTitle")}</span>
          <p className="pa-section-helper">{t("cmsGaps.detailsHint")}</p>
          <p className="pa-section-helper">{t("cmsGaps.csvHint")}</p>
          {reports.length === 0 && !loading ? (
            <p className="pa-section-helper">{t("cmsGaps.empty")}</p>
          ) : (
            <div className="pa-health-list">
              {reports.map((report) => (
                <CmsCollectionGapCard
                  key={report.collectionId}
                  report={report}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
