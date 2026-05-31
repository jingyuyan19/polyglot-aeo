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
  rowIds: string[]
}

export interface CmsCollectionGapReport {
  collectionId: string
  collectionName: string
  titleField: string | null
  summaryField: string | null
  rowCount: number
  localeGaps: CmsLocaleGap[]
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
  for (const locale of locales) {
    if (locale.isDefault) continue
    let missingTitles = 0
    let missingSummaries = 0
    let missingSlugs = 0
    for (const row of publicRows) {
      if (!titleField) {
        missingTitles += 1
      } else if (
        !stringValue(row.fieldValuesByLocale[locale.id]?.[titleField])
      ) {
        missingTitles += 1
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
      }

      if (row.slug && !row.localeSlugs[locale.id]) {
        missingSlugs += 1
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

  const titleGroups = new Map<string, { title: string; rowIds: string[] }>()
  if (titleField) {
    for (const row of publicRows) {
      const title = stringValue(row.fieldValues[titleField])
      if (!title) continue
      const key = normalizedTitle(title)
      const group = titleGroups.get(key) ?? { title, rowIds: [] }
      group.rowIds.push(row.id)
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
    duplicateTitles: Array.from(titleGroups.values()).filter(
      (group) => group.rowIds.length > 1,
    ),
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
