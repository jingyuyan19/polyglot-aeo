import { framer } from "framer-plugin"

import { fetchPublishedText } from "./fetch-published-url"
import {
  llmsFilenameForLocale,
  verifyJsonLdHtml,
} from "./published-verifier"
import type { LocaleInfo } from "../framer/locales"
import { readString, StorageKeys } from "../storage"

export type PublishedCheckStatus = "pass" | "fail" | "warn"

export interface PublishedVerificationCheck {
  id: string
  status: PublishedCheckStatus
  /** HTTP status when a fetch completed. */
  httpStatus?: number
  /** Homepage-only: JSON-LD probe. */
  schemaCount?: number
  parseErrorCount?: number
  languages?: string[]
  /** llms:* checks. */
  filename?: string
  fetchReason?: "blocked" | "invalid_url" | "http" | "network"
}

export interface PublishedVerificationResult {
  baseUrl: string
  checkedAt: string
  checks: PublishedVerificationCheck[]
  failureCount: number
  /** True when no URL was available — do not treat as "all passed". */
  skipped: boolean
}

export async function resolvePublishedBaseUrl(): Promise<string | null> {
  try {
    const info = await framer.getPublishInfo()
    const url = info.production?.url
    if (url) return url.replace(/\/$/, "")
  } catch {
    // fall through to stored llms setup URL
  }
  const stored = await readString(StorageKeys.BaseUrl)
  const trimmed = stored?.trim().replace(/\/$/, "")
  return trimmed || null
}

export function countPublishedVerificationFailures(
  checks: ReadonlyArray<PublishedVerificationCheck>,
): number {
  return checks.filter((check) => check.status !== "pass").length
}

/**
 * Lightweight published-site probe for the control center and verifier.
 * Does not build UI strings — callers map `checks` to localized labels.
 */
export async function runPublishedVerification(
  baseUrl: string,
  locales: ReadonlyArray<LocaleInfo>,
): Promise<PublishedVerificationResult> {
  const normalized = baseUrl.trim().replace(/\/$/, "")
  const checkedAt = new Date().toISOString()
  const checks: PublishedVerificationCheck[] = []

  const home = await fetchPublishedText(normalized)

  if (home.ok) {
    const jsonLd = verifyJsonLdHtml(home.text)
    const hasDescription = /<meta[^>]+name=["']description["']/i.test(home.text)
    checks.push({
      id: "homepage",
      status: "pass",
      httpStatus: home.status,
    })
    checks.push({
      id: "schema",
      status:
        jsonLd.schemaCount === 0
          ? "fail"
          : jsonLd.parseErrorCount > 0
            ? "warn"
            : "pass",
      schemaCount: jsonLd.schemaCount,
      parseErrorCount: jsonLd.parseErrorCount,
    })
    checks.push({
      id: "inlanguage",
      status: jsonLd.languages.length > 0 ? "pass" : "warn",
      languages: jsonLd.languages,
    })
    checks.push({
      id: "meta",
      status: hasDescription ? "pass" : "warn",
    })
  } else if (home.reason === "invalid_url") {
    checks.push({ id: "homepage", status: "fail", fetchReason: "invalid_url" })
  } else if (home.reason === "blocked") {
    checks.push({ id: "homepage", status: "warn", fetchReason: "blocked" })
    checks.push({ id: "schema", status: "warn" })
    checks.push({ id: "meta", status: "warn" })
  } else {
    checks.push({
      id: "homepage",
      status: "warn",
      httpStatus: home.status,
      fetchReason: "http",
    })
    checks.push({ id: "schema", status: "warn" })
    checks.push({ id: "meta", status: "warn" })
  }

  const llmsResults = await Promise.all(
    locales.map(async (locale) => {
      const filename = llmsFilenameForLocale(locale)
      const res = await fetchPublishedText(`${normalized}/${filename}`)
      return { locale, filename, res }
    }),
  )

  for (const { locale, filename, res } of llmsResults) {
    let status: PublishedCheckStatus
    if (res.ok) {
      status = "pass"
    } else if (res.status === 404) {
      status = locale.isDefault ? "fail" : "warn"
    } else if (res.reason === "blocked") {
      status = "warn"
    } else if (res.status) {
      status = "warn"
    } else {
      status = locale.isDefault ? "fail" : "warn"
    }
    checks.push({
      id: `llms:${filename}`,
      status,
      filename,
      httpStatus: res.ok || res.status ? res.status : undefined,
      fetchReason: res.ok
        ? undefined
        : res.reason === "blocked"
          ? "blocked"
          : res.status
            ? "http"
            : "network",
    })
  }

  return {
    baseUrl: normalized,
    checkedAt,
    checks,
    failureCount: countPublishedVerificationFailures(checks),
    skipped: false,
  }
}

export async function runPublishedVerificationForProject(
  locales: ReadonlyArray<LocaleInfo>,
): Promise<PublishedVerificationResult | null> {
  const baseUrl = await resolvePublishedBaseUrl()
  if (!baseUrl) return null
  return runPublishedVerification(baseUrl, locales)
}
