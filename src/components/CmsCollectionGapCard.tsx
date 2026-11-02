import { framer } from "framer-plugin"
import { useEffect, useMemo, useRef, useState } from "react"

import { useI18n } from "../i18n"
import type { CmsCollectionGapReport } from "../lib/aeo/cms-gaps"
import { openCmsCollection } from "../lib/framer/cms"

interface Props {
  report: CmsCollectionGapReport
}

export function CmsCollectionGapCard({ report }: Props) {
  const { t, locale } = useI18n()
  const [opening, setOpening] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const detailRef = useRef<HTMLDivElement | null>(null)

  const gapsWithMissingContent = report.localeGaps.filter(
    (gap) => gap.missingTitles + gap.missingSummaries + gap.missingSlugs > 0,
  )
  const missingTitleTotal = report.localeGaps.reduce(
    (sum, gap) => sum + gap.missingTitles,
    0,
  )
  const missingSummaryTotal = report.localeGaps.reduce(
    (sum, gap) => sum + gap.missingSummaries,
    0,
  )
  const missingSlugTotal = report.localeGaps.reduce(
    (sum, gap) => sum + gap.missingSlugs,
    0,
  )
  const missingFields = [
    missingTitleTotal > 0 ? t("cmsGaps.fieldTitles") : null,
    missingSummaryTotal > 0 ? t("cmsGaps.fieldSummaries") : null,
    missingSlugTotal > 0 ? t("cmsGaps.fieldSlugs") : null,
  ].filter((field): field is string => field !== null)
  const listFormatter = new Intl.ListFormat(locale, {
    style: "long",
    type: "conjunction",
  })
  const missingFieldsLabel =
    missingFields.length > 0
      ? listFormatter.format(missingFields)
      : t("cmsGaps.fieldContent")
  const affectedLocales =
    gapsWithMissingContent.length > 0
      ? listFormatter.format(gapsWithMissingContent.map((gap) => gap.localeCode))
      : "—"
  const hasGap = gapsWithMissingContent.length > 0
  const hasDuplicates = report.duplicateTitles.length > 0
  const issueCount = report.localeIssues.length
  const affectedRowCount = new Set(report.localeIssues.map((issue) => issue.rowId))
    .size
  const groupedIssues = useMemo(() => {
    const groups = new Map<
      string,
      {
        rowId: string
        rowTitle: string
        defaultSlug: string
        locales: Array<{ localeCode: string; fields: string[] }>
      }
    >()

    for (const issue of report.localeIssues) {
      const group =
        groups.get(issue.rowId) ??
        {
          rowId: issue.rowId,
          rowTitle: issue.rowTitle,
          defaultSlug: issue.defaultSlug,
          locales: [],
        }
      const fields = [
        issue.missingTitle ? t("cmsGaps.fieldTitle") : null,
        issue.missingSummary ? t("cmsGaps.fieldSummary") : null,
        issue.missingSlug ? t("cmsGaps.fieldSlug") : null,
      ].filter((field): field is string => field !== null)
      group.locales.push({ localeCode: issue.localeCode, fields })
      groups.set(issue.rowId, group)
    }

    return Array.from(groups.values())
  }, [report.localeIssues, t])
  const shownIssues = groupedIssues.slice(0, 6)
  const hiddenIssueCount = Math.max(0, groupedIssues.length - shownIssues.length)
  const issueCountByRow = useMemo(() => {
    const map = new Map<string, number>()
    for (const issue of report.localeIssues) {
      map.set(issue.rowId, (map.get(issue.rowId) ?? 0) + 1)
    }
    return map
  }, [report.localeIssues])

  useEffect(() => {
    if (!expanded) return

    const scrollId = window.setTimeout(() => {
      detailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    }, 40)

    return () => window.clearTimeout(scrollId)
  }, [expanded])

  const handleOpen = async () => {
    setOpening(true)
    try {
      const result = await openCmsCollection(report.collectionId)
      if (result.ok) {
        framer.notify(
          result.navigated
            ? t("cmsGaps.opened", { name: report.collectionName })
            : t("cmsGaps.openedSelectOnly", { name: report.collectionName }),
          { variant: result.navigated ? "success" : "info" },
        )
        return
      }
      framer.notify(t("cmsGaps.openManualSteps", { name: report.collectionName }), {
        variant: "warning",
        durationMs: 8000,
      })
    } finally {
      setOpening(false)
    }
  }

  return (
    <article
      className="pa-cms-gap-card"
      data-state={hasGap || hasDuplicates ? "needs-work" : "done"}
    >
      <div className="pa-cms-gap-card-head">
        <span className="pa-health-marker" aria-hidden="true">
          {hasGap || hasDuplicates ? "!" : "✓"}
        </span>
        <div className="pa-stack">
          <span className="pa-health-title">
            {report.collectionName} · {t("cmsGaps.rows", { n: report.rowCount })}
          </span>
          {hasGap ? (
            <span className="pa-section-helper" style={{ margin: 0 }}>
              {t("cmsGaps.needsLocalized", {
                fields: missingFieldsLabel,
                locales: affectedLocales,
              })}
            </span>
          ) : (
            <span className="pa-section-helper" style={{ margin: 0 }}>
              {t("cmsGaps.collectionClean")}
            </span>
          )}
        </div>
        <div className="pa-cms-gap-card-actions">
          {issueCount > 0 ? (
            <span className="pa-pill" data-tone="warning">
              {t("cmsGaps.rowIssueCount", { n: affectedRowCount })}
            </span>
          ) : null}
          <button
            type="button"
            className="pa-pill-button"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t("common.hide") : t("cmsGaps.showFixes")}
          </button>
        </div>
      </div>

      <div className="pa-cms-locale-chip-row">
        {gapsWithMissingContent.map((gap) => (
          <span className="pa-pill" data-tone="warning" key={gap.localeId}>
            {t("cmsGaps.localeFixCount", {
              locale: gap.localeCode,
              count: gap.missingTitles + gap.missingSummaries + gap.missingSlugs,
            })}
          </span>
        ))}
        {hasDuplicates ? (
          <span className="pa-pill" data-tone="warning">
            {t("cmsGaps.duplicateFixCount", {
              n: report.duplicateTitles.length,
            })}
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="pa-cms-gap-detail" ref={detailRef}>
          {shownIssues.length > 0 ? (
            <div className="pa-cms-gap-subsection">
              <span className="pa-section-title">{t("cmsGaps.rowIssuesTitle")}</span>
              <div className="pa-cms-row-issue-list">
                {shownIssues.map((issue) => {
                  return (
                    <div
                      className="pa-cms-row-issue"
                      key={issue.rowId}
                    >
                      <div>
                        <strong>{issue.rowTitle}</strong>
                        <small>
                          {t("cmsGaps.defaultSlug", {
                            slug: issue.defaultSlug || "-",
                          })}
                        </small>
                      </div>
                      <div className="pa-cms-row-issue-tags">
                        {issue.locales.map((localeIssue) => (
                          <span
                            className="pa-cms-row-locale-group"
                            key={localeIssue.localeCode}
                          >
                            <span className="pa-pill">
                              {localeIssue.localeCode}
                            </span>
                            {localeIssue.fields.map((field) => (
                              <span
                                className="pa-pill"
                                data-tone="warning"
                                key={`${localeIssue.localeCode}:${field}`}
                              >
                                {field}
                              </span>
                            ))}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {hiddenIssueCount > 0 ? (
                <p className="pa-section-helper" style={{ margin: 0 }}>
                  {t("cmsGaps.moreRowIssues", { n: hiddenIssueCount })}
                </p>
              ) : null}
            </div>
          ) : null}

          {hasDuplicates ? (
            <div className="pa-cms-gap-subsection">
              <span className="pa-section-title">
                {t("cmsGaps.duplicateRowsTitle")}
              </span>
              <div className="pa-cms-duplicate-list">
                {report.duplicateTitles.slice(0, 4).map((group) => (
                  <div className="pa-cms-duplicate-group" key={group.title}>
                    <strong>{group.title}</strong>
                    <span className="pa-section-helper" style={{ margin: 0 }}>
                      {t("cmsGaps.duplicateRowsShared", {
                        n: group.rows.length,
                      })}
                    </span>
                    <div className="pa-cms-locale-chip-row">
                      {group.rows.map((row) => (
                        <span
                          className="pa-pill"
                          data-tone={
                            issueCountByRow.has(row.rowId) ? "warning" : undefined
                          }
                          key={row.rowId}
                        >
                          /{row.defaultSlug}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {report.duplicateTitles.length > 4 ? (
                  <p className="pa-section-helper" style={{ margin: 0 }}>
                    {t("cmsGaps.moreDuplicateGroups", {
                      n: report.duplicateTitles.length - 4,
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className="pa-task-action pa-cms-open-action"
        onClick={() => void handleOpen()}
        disabled={opening}
        aria-label={t("cmsGaps.openInFramer", { name: report.collectionName })}
      >
        {t("cmsGaps.openCollectionAction", {
          name: report.collectionName,
        })}
        <span aria-hidden="true">→</span>
      </button>
    </article>
  )
}
