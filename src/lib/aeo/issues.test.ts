import { describe, expect, it } from "vitest"

import {
  buildAeoIssues,
  countAeoIssuesBySeverity,
  scoreAeoIssues,
  type AeoIssueSignals,
} from "./issues"

const READY: AeoIssueSignals = {
  localeCount: 3,
  isPro: true,
  schemaInstalled: true,
  schemaDisabled: false,
  llmsGenerated: true,
  metaGenerated: true,
  hasApiKey: true,
  cmsLocaleGapCount: 0,
  cmsDuplicateTitleCount: 0,
  publishedFailureCount: 0,
}

describe("AEO issues", () => {
  it("returns no issues and a perfect score for a ready project", () => {
    const issues = buildAeoIssues(READY)
    expect(issues).toEqual([])
    expect(scoreAeoIssues(issues)).toBe(100)
  })

  it("prioritizes critical launch blockers before paid coverage notes", () => {
    const issues = buildAeoIssues({
      ...READY,
      isPro: false,
      schemaInstalled: false,
      llmsGenerated: false,
      localeCount: 4,
    })
    expect(issues.map((issue) => issue.id).slice(0, 2)).toEqual([
      "schema_missing",
      "llms_missing",
    ])
    expect(issues.at(-1)).toMatchObject({
      id: "multi_locale_locked",
      severity: "info",
    })
    expect(scoreAeoIssues(issues)).toBeLessThan(70)
  })

  it("counts issues by severity", () => {
    const counts = countAeoIssuesBySeverity(
      buildAeoIssues({
        ...READY,
        hasApiKey: false,
        cmsLocaleGapCount: 5,
      }),
    )
    expect(counts).toEqual({ critical: 0, warning: 1, info: 1 })
  })

  it("penalizes high-volume CMS gaps more than a single missing row", () => {
    const oneGapScore = scoreAeoIssues(
      buildAeoIssues({
        ...READY,
        cmsLocaleGapCount: 1,
      }),
    )
    const manyGapsScore = scoreAeoIssues(
      buildAeoIssues({
        ...READY,
        cmsLocaleGapCount: 72,
      }),
    )

    expect(manyGapsScore).toBeLessThan(oneGapScore)
    expect(manyGapsScore).toBeLessThan(50)
  })
})
