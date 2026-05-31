import { useCallback, useEffect, useState } from "react"

import { TopBar } from "../components/TopBar"
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

export function CmsGapManagerView({ onBack, onOpenSettings }: Props) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<CmsCollectionGapReport[]>([])
  const [summary, setSummary] = useState<CmsGapSummary>(EMPTY_SUMMARY)

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
    const rows = [
      [
        "collection",
        "locale",
        "rows",
        "missing_titles",
        "missing_summaries",
        "missing_slugs",
        "duplicate_title_groups",
      ],
      ...reports.flatMap((report) =>
        report.localeGaps.map((gap) => [
          report.collectionName,
          gap.localeCode,
          report.rowCount,
          gap.missingTitles,
          gap.missingSummaries,
          gap.missingSlugs,
          report.duplicateTitles.length,
        ]),
      ),
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
      />
      <div className="pa-scroll">
        <section className="pa-card">
          <div className="pa-row-spread">
            <span className="pa-section-title">{t("cmsGaps.summaryTitle")}</span>
            <span className="pa-pill">
              {t("control.cmsCollections", { n: summary.collectionCount })}
            </span>
          </div>
          <p className="pa-section-helper">
            {t("control.cmsSummary", {
              titles: summary.missingTitleCount,
              summaries: summary.missingSummaryCount,
              slugs: summary.missingSlugCount,
              duplicates: summary.duplicateTitleCount,
            })}
          </p>
          <div className="pa-row" style={{ gap: 8 }}>
            <button
              type="button"
              className="pa-button"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? t("control.scanning") : t("control.rescan")}
            </button>
            <button
              type="button"
              className="pa-button"
              onClick={downloadCsv}
              disabled={reports.length === 0}
            >
              {t("cmsGaps.downloadCsv")}
            </button>
          </div>
        </section>

        <section className="pa-card">
          <span className="pa-section-title">{t("cmsGaps.detailsTitle")}</span>
          {reports.length === 0 && !loading ? (
            <p className="pa-section-helper">{t("cmsGaps.empty")}</p>
          ) : (
            <div className="pa-health-list">
              {reports.map((report) => (
                <div key={report.collectionId} className="pa-verify-item">
                  <span className="pa-health-marker" aria-hidden="true">
                    {report.localeGaps.some(
                      (gap) =>
                        gap.missingTitles +
                          gap.missingSummaries +
                          gap.missingSlugs >
                        0,
                    ) || report.duplicateTitles.length > 0
                      ? "!"
                      : "✓"}
                  </span>
                  <span className="pa-stack">
                    <span className="pa-health-title">
                      {report.collectionName} ·{" "}
                      {t("cmsGaps.rows", { n: report.rowCount })}
                    </span>
                    <span className="pa-section-helper" style={{ margin: 0 }}>
                      {t("cmsGaps.fields", {
                        title: report.titleField ?? t("common.none"),
                        summary: report.summaryField ?? t("common.none"),
                      })}
                    </span>
                    {report.localeGaps.map((gap) => (
                      <span
                        key={gap.localeId}
                        className="pa-section-helper"
                        style={{ margin: 0 }}
                      >
                        {t("control.cmsLocaleLine", {
                          locale: gap.localeCode,
                          titles: gap.missingTitles,
                          summaries: gap.missingSummaries,
                          slugs: gap.missingSlugs,
                        })}
                      </span>
                    ))}
                    {report.duplicateTitles.length > 0 ? (
                      <span className="pa-section-helper" style={{ margin: 0 }}>
                        {t("control.cmsDuplicates", {
                          n: report.duplicateTitles.length,
                        })}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
