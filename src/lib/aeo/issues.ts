export type AeoIssueSeverity = "critical" | "warning" | "info"

export type AeoIssueCategory =
  | "schema"
  | "llms"
  | "meta"
  | "cms"
  | "license"
  | "publish"
  | "setup"

export type AeoIssueId =
  | "schema_missing"
  | "schema_disabled"
  | "llms_missing"
  | "meta_missing"
  | "api_key_missing"
  | "multi_locale_locked"
  | "cms_locale_gaps"
  | "cms_duplicate_titles"
  | "published_failures"

export interface AeoIssue {
  id: AeoIssueId
  severity: AeoIssueSeverity
  category: AeoIssueCategory
  count?: number
}

export interface AeoIssueSignals {
  localeCount: number
  isPro: boolean
  schemaInstalled: boolean
  schemaDisabled: boolean
  llmsGenerated: boolean
  metaGenerated: boolean
  hasApiKey: boolean
  cmsLocaleGapCount: number
  cmsDuplicateTitleCount: number
  publishedFailureCount: number
}

const SEVERITY_ORDER: Record<AeoIssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const SCORE_WEIGHTS: Record<AeoIssueSeverity, number> = {
  critical: 24,
  warning: 14,
  info: 7,
}

export function buildAeoIssues(signals: AeoIssueSignals): AeoIssue[] {
  const issues: AeoIssue[] = []

  if (signals.schemaDisabled) {
    issues.push({
      id: "schema_disabled",
      severity: "critical",
      category: "schema",
    })
  } else if (!signals.schemaInstalled) {
    issues.push({
      id: "schema_missing",
      severity: "critical",
      category: "schema",
    })
  }

  if (!signals.llmsGenerated) {
    issues.push({
      id: "llms_missing",
      severity: "warning",
      category: "llms",
    })
  }

  if (!signals.metaGenerated) {
    issues.push({
      id: "meta_missing",
      severity: "warning",
      category: "meta",
    })
  }

  if (!signals.hasApiKey) {
    issues.push({
      id: "api_key_missing",
      severity: "info",
      category: "setup",
    })
  }

  if (signals.localeCount > 1 && !signals.isPro) {
    issues.push({
      id: "multi_locale_locked",
      severity: "critical",
      category: "license",
      count: signals.localeCount,
    })
  }

  if (signals.cmsLocaleGapCount > 0) {
    issues.push({
      id: "cms_locale_gaps",
      severity: "warning",
      category: "cms",
      count: signals.cmsLocaleGapCount,
    })
  }

  if (signals.cmsDuplicateTitleCount > 0) {
    issues.push({
      id: "cms_duplicate_titles",
      severity: "warning",
      category: "cms",
      count: signals.cmsDuplicateTitleCount,
    })
  }

  if (signals.publishedFailureCount > 0) {
    issues.push({
      id: "published_failures",
      severity: "critical",
      category: "publish",
      count: signals.publishedFailureCount,
    })
  }

  return issues.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.category.localeCompare(b.category) ||
      a.id.localeCompare(b.id),
  )
}

export function scoreAeoIssues(issues: ReadonlyArray<AeoIssue>): number {
  const penalty = issues.reduce(
    (sum, issue) => sum + SCORE_WEIGHTS[issue.severity],
    0,
  )
  return Math.max(0, Math.min(100, 100 - penalty))
}

export function countAeoIssuesBySeverity(
  issues: ReadonlyArray<AeoIssue>,
): Record<AeoIssueSeverity, number> {
  return issues.reduce(
    (acc, issue) => {
      acc[issue.severity] += 1
      return acc
    },
    { critical: 0, warning: 0, info: 0 },
  )
}
