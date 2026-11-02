import type { LocaleInfo } from "../framer/locales"
import {
  pickSummaryField,
  pickTitleField,
  type CollectionItemRow,
  type CollectionSummary,
} from "../framer/cms"

export interface CmsLocaleGap {
  localeId: string
  localeCode: string
  missingTitles: number
  missingSummaries: number
  missingSlugs: number
}

export interface CmsDuplicateTitleGroup {
  title: string
  rows: Array<{
    rowId: string
    rowTitle: string
    defaultSlug: string
  }>
  /** @deprecated use rows instead. Kept so older callers/tests remain simple. */
  rowIds: string[]
}

export interface CmsLocaleGapIssue {
  rowId: string
  rowTitle: string
  defaultSlug: string
  localeId: string
  localeCode: string
  missingTitle: boolean
  missingSummary: boolean
  missingSlug: boolean
}

export interface CmsCollectionGapReport {
  collectionId: string
  collectionName: string
  titleField: string | null
  summaryField: string | null
  rowCount: number
  localeGaps: CmsLocaleGap[]
  localeIssues: CmsLocaleGapIssue[]
  duplicateTitles: CmsDuplicateTitleGroup[]
}

export interface CmsGapSummary {
  rowCount: number
  collectionCount: number
  missingTitleCount: number
  missingSummaryCount: number
  missingSlugCount: number
  duplicateTitleCount: number
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isPublicRow(row: CollectionItemRow): boolean {
  return !row.draft && row.slug.trim().length > 0
}

function normalizedTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase()
}

export function analyzeCmsCollectionLocalization(
  collection: CollectionSummary,
  rows: ReadonlyArray<CollectionItemRow>,
  locales: ReadonlyArray<LocaleInfo>,
): CmsCollectionGapReport {
  const titleField = pickTitleField(collection.fieldNames)
  const summaryField = pickSummaryField(collection.fieldNames)
  const publicRows = rows.filter(isPublicRow)

  const localeGaps: CmsLocaleGap[] = []
  const localeIssues: CmsLocaleGapIssue[] = []
  for (const locale of locales) {
    if (locale.isDefault) continue
    let missingTitles = 0
    let missingSummaries = 0
    let missingSlugs = 0
    for (const row of publicRows) {
      const rowTitle = titleField
        ? stringValue(row.fieldValues[titleField]) || row.slug || row.id
        : row.slug || row.id
      let missingTitle = false
      let missingSummary = false
      let missingSlug = false
      if (!titleField) {
        missingTitles += 1
        missingTitle = true
      } else if (
        !stringValue(row.fieldValuesByLocale[locale.id]?.[titleField])
      ) {
        missingTitles += 1
        missingTitle = true
      }

      const sourceSummary = summaryField
        ? stringValue(row.fieldValues[summaryField])
        : ""
      if (
        summaryField &&
        sourceSummary &&
        !stringValue(row.fieldValuesByLocale[locale.id]?.[summaryField])
      ) {
        missingSummaries += 1
        missingSummary = true
      }

      if (row.slug && !row.localeSlugs[locale.id]) {
        missingSlugs += 1
        missingSlug = true
      }

      if (missingTitle || missingSummary || missingSlug) {
        localeIssues.push({
          rowId: row.id,
          rowTitle,
          defaultSlug: row.slug,
          localeId: locale.id,
          localeCode: locale.code,
          missingTitle,
          missingSummary,
          missingSlug,
        })
      }
    }
    localeGaps.push({
      localeId: locale.id,
      localeCode: locale.code,
      missingTitles,
      missingSummaries,
      missingSlugs,
    })
  }

  const titleGroups = new Map<
    string,
    {
      title: string
      rows: Array<{ rowId: string; rowTitle: string; defaultSlug: string }>
    }
  >()
  if (titleField) {
    for (const row of publicRows) {
      const title = stringValue(row.fieldValues[titleField])
      if (!title) continue
      const key = normalizedTitle(title)
      const group = titleGroups.get(key) ?? { title, rows: [] }
      group.rows.push({
        rowId: row.id,
        rowTitle: title,
        defaultSlug: row.slug,
      })
      titleGroups.set(key, group)
    }
  }

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    titleField,
    summaryField,
    rowCount: publicRows.length,
    localeGaps,
    localeIssues,
    duplicateTitles: Array.from(titleGroups.values())
      .filter((group) => group.rows.length > 1)
      .map((group) => ({
        ...group,
        rowIds: group.rows.map((row) => row.rowId),
      })),
  }
}

export function summarizeCmsGapReports(
  reports: ReadonlyArray<CmsCollectionGapReport>,
): CmsGapSummary {
  return reports.reduce<CmsGapSummary>(
    (acc, report) => {
      acc.rowCount += report.rowCount
      acc.collectionCount += 1
      acc.duplicateTitleCount += report.duplicateTitles.reduce(
        (sum, group) => sum + group.rowIds.length,
        0,
      )
      for (const gap of report.localeGaps) {
        acc.missingTitleCount += gap.missingTitles
        acc.missingSummaryCount += gap.missingSummaries
        acc.missingSlugCount += gap.missingSlugs
      }
      return acc
    },
    {
      rowCount: 0,
      collectionCount: 0,
      missingTitleCount: 0,
      missingSummaryCount: 0,
      missingSlugCount: 0,
      duplicateTitleCount: 0,
    },
  )
}
