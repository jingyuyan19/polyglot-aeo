import { licenseApiBase } from "../license/api"
import type { TranslationKey } from "../../i18n"
import type { LocaleInfo } from "../framer/locales"
import { llmsFilenameForLocale } from "./published-verifier"
import type { PublishedVerificationCheck } from "./run-published-verification"

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string

export function publishedCheckLabel(
  check: PublishedVerificationCheck,
  locales: ReadonlyArray<LocaleInfo>,
  t: Translate,
): string {
  if (check.id === "homepage") return t("verify.homepage")
  if (check.id === "schema") return t("verify.schema")
  if (check.id === "inlanguage") return t("verify.inLanguage")
  if (check.id === "meta") return t("verify.meta")
  if (check.id.startsWith("llms:")) {
    const filename = check.filename ?? check.id.slice("llms:".length)
    if (filename === "llms.txt") return t("verify.llms")
    const locale = locales.find(
      (l) => llmsFilenameForLocale(l) === filename,
    )
    return t("verify.llmsLocale", {
      locale: locale?.code ?? filename.replace(/^llms-|-\.txt$/g, ""),
    })
  }
  return check.id
}

export function publishedCheckDetail(
  check: PublishedVerificationCheck,
  t: Translate,
): string {
  const filename =
    check.filename ?? (check.id.startsWith("llms:") ? check.id.slice(5) : "")

  switch (check.id) {
    case "homepage":
      if (check.status === "pass" && check.httpStatus != null) {
        return t("verify.homepageOk", { status: check.httpStatus })
      }
      if (check.fetchReason === "invalid_url") return t("verify.invalidUrl")
      if (check.fetchReason === "blocked") {
        return licenseApiBase()
          ? t("verify.homepageBlocked")
          : t("verify.homepageBlockedNoProxy")
      }
      return t("verify.homepageHttpError", { status: check.httpStatus ?? 0 })
    case "schema":
      if (check.status === "pass" && check.schemaCount != null) {
        return t("verify.schemaOk", { n: check.schemaCount })
      }
      if (check.schemaCount === 0) return t("verify.schemaMissing")
      if (check.parseErrorCount && check.parseErrorCount > 0) {
        return t("verify.schemaParseWarning", { n: check.parseErrorCount })
      }
      return t("verify.schemaUnknown")
    case "inlanguage":
      if (check.languages && check.languages.length > 0) {
        return t("verify.inLanguageOk", {
          languages: check.languages.join(", "),
        })
      }
      return t("verify.inLanguageMissing")
    case "meta":
      if (check.status === "pass") return t("verify.metaOk")
      if (check.status === "fail") return t("verify.metaMissing")
      return t("verify.metaUnknown")
    default:
      if (check.id.startsWith("llms:")) {
        if (check.status === "pass" && check.httpStatus != null) {
          return t("verify.llmsLocaleOk", {
            filename,
            status: check.httpStatus,
          })
        }
        if (check.fetchReason === "blocked") {
          return t("verify.llmsFetchBlocked", { filename })
        }
        if (check.httpStatus === 404) {
          return filename === "llms.txt"
            ? t("verify.llmsMissing")
            : t("verify.llmsLocale404", { filename })
        }
        if (check.httpStatus) {
          return t("verify.llmsHttpError", {
            filename,
            status: check.httpStatus,
          })
        }
        return t("verify.llmsLocaleMissing", { filename })
      }
      return ""
  }
}
