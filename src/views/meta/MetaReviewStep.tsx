import { useMemo, type ReactNode } from "react"

import { CopyableField } from "../../components/CopyableField"
import { useI18n } from "../../i18n"
import {
  flagsForField,
  hasMetaQualityIssue,
  type MetaQualityFlag,
} from "../../lib/ai/meta-quality"
import { localeFlagEmoji } from "../../lib/framer/locales"
import { MetaApplyGuide } from "./MetaApplyStep"
import { formatMetaCopyBlock } from "./format-meta-copy"
import type { MetaResult } from "./types"

const TITLE_SOFT_MAX = 60
const DESC_SOFT_MAX = 155

interface Props {
  results: MetaResult[]
  resultLocaleId: string
  selectedPageTitle?: string
  selectedPagePath?: string
  onResultLocaleChange: (localeId: string) => void
  onOpenFramerProject: () => void
  totalCost: number
  busy: boolean
  regeneratingId: string | null
  onRegenerateLocale: (localeId: string) => void
  onCopyAll: (text: string) => void
}

export function MetaReviewStep({
  results,
  resultLocaleId,
  selectedPageTitle,
  selectedPagePath,
  onResultLocaleChange,
  onOpenFramerProject,
  totalCost,
  busy,
  regeneratingId,
  onRegenerateLocale,
  onCopyAll,
}: Props) {
  const { t } = useI18n()

  const active =
    results.find((r) => r.localeId === resultLocaleId) ?? results[0]

  const summaryLine = useMemo(() => {
    const parts = [t("meta.reviewLocaleCount", { n: results.length })]
    const attention = results
      .filter((r) => hasMetaQualityIssue(r.qualityFlags))
      .map((r) => r.localeCode)
    if (attention.length > 0) {
      parts.push(
        t("meta.reviewLocalesNeedAttention", {
          locales: attention.join(", "),
        }),
      )
    }
    return parts.join(" · ")
  }, [results, t])

  if (!active) {
    return (
      <p className="pa-section-helper">{t("meta.reviewEmpty")}</p>
    )
  }

  const cardLevelFlags = active.qualityFlags.filter((f) => f.field === null)
  const hasParseFailed = cardLevelFlags.some(
    (f) => f.reason === "parse-failed",
  )
  const hasUntranslated = cardLevelFlags.some(
    (f) => f.reason === "untranslated",
  )

  const fieldLabels = {
    title: t("meta.fields.title"),
    metaDescription: t("meta.fields.metaDescription"),
    ogTitle: t("meta.fields.ogTitle"),
    ogDescription: t("meta.fields.ogDescription"),
    twitterTitle: t("meta.fields.twitterTitle"),
    twitterDescription: t("meta.fields.twitterDescription"),
  }

  const handleCopyAll = () => {
    if (!active.parsed) return
    onCopyAll(formatMetaCopyBlock(active.parsed, fieldLabels))
  }

  return (
    <section className="pa-section">
      <MetaApplyGuide
        selectedPageTitle={selectedPageTitle}
        selectedPagePath={selectedPagePath}
        onOpenFramerProject={onOpenFramerProject}
      />

      <div className="pa-row-spread" style={{ marginTop: 12 }}>
        <span className="pa-section-title">{t("meta.resultsTitle")}</span>
        {totalCost > 0 && (
          <span className="pa-pill">~${totalCost.toFixed(4)}</span>
        )}
      </div>
      <p className="pa-section-helper" style={{ marginTop: 0 }}>
        {summaryLine}
      </p>

      <div
        className="pa-locale-tab-row"
        role="tablist"
        aria-label={t("meta.reviewLocaleTabs")}
      >
        {results.map((r) => (
          <button
            key={r.localeId}
            type="button"
            role="tab"
            aria-selected={r.localeId === active.localeId}
            className="pa-locale-tab"
            data-active={r.localeId === active.localeId}
            onClick={() => onResultLocaleChange(r.localeId)}
          >
            <span className="pa-locale-tab-flag" aria-hidden="true">
              {localeFlagEmoji(r.localeCode)}
            </span>
            <span>{r.localeCode}</span>
            {hasMetaQualityIssue(r.qualityFlags) && (
              <span className="pa-locale-tab-dot" data-tone="warning" />
            )}
          </button>
        ))}
      </div>

      <div className="pa-card">
        <div className="pa-row-spread">
          <span style={{ fontWeight: 600 }}>{active.localeName}</span>
          <div
            className="pa-row"
            style={{ gap: 6, width: "auto", flex: "0 0 auto" }}
          >
            <span className="pa-pill" data-tone="accent">
              {active.language}
            </span>
            {hasMetaQualityIssue(active.qualityFlags) && (
              <span
                className="pa-pill"
                data-tone="warning"
                title={t("meta.qualityIssueHint")}
              >
                {t("meta.qualityIssuePill", {
                  n: active.qualityFlags.length,
                })}
              </span>
            )}
            <button
              type="button"
              className="pa-pill-button"
              onClick={() => onRegenerateLocale(active.localeId)}
              disabled={busy || regeneratingId !== null}
              title={t("meta.regenerateOne")}
            >
              {regeneratingId === active.localeId
                ? t("meta.regenerating")
                : `↻ ${t("meta.regenerate")}`}
            </button>
          </div>
        </div>

        {hasParseFailed && (
          <div className="pa-row" style={{ alignItems: "flex-start", gap: 6 }}>
            <span className="pa-pill" data-tone="warning">
              {t("meta.qualityParseFailedPill")}
            </span>
            <span
              className="pa-section-helper--inline"
              style={{ fontStyle: "italic" }}
            >
              {t("meta.qualityParseFailedHelper")}
            </span>
          </div>
        )}
        {hasUntranslated && (
          <div className="pa-row" style={{ alignItems: "flex-start", gap: 6 }}>
            <span className="pa-pill" data-tone="warning">
              {t("meta.qualityUntranslatedPill")}
            </span>
            <span
              className="pa-section-helper--inline"
              style={{ fontStyle: "italic" }}
            >
              {t("meta.qualityUntranslatedHelper")}
            </span>
          </div>
        )}

        {active.parsed ? (
          <>
            <div className="pa-button-row" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="pa-pill-button"
                data-tone="accent"
                onClick={handleCopyAll}
              >
                {t("meta.copyAll")}
              </button>
            </div>
            <MetaFieldGroup title={t("meta.fieldGroupSearch")}>
              <MetaFieldRow
                label={fieldLabels.title}
                value={active.parsed.title}
                flags={flagsForField(active.qualityFlags, "title")}
                softMax={TITLE_SOFT_MAX}
              />
              <MetaFieldRow
                label={fieldLabels.metaDescription}
                value={active.parsed.metaDescription}
                flags={flagsForField(
                  active.qualityFlags,
                  "metaDescription",
                )}
                softMax={DESC_SOFT_MAX}
              />
            </MetaFieldGroup>
            <details className="pa-llms-fold">
              <summary>{t("meta.fieldGroupSocial")}</summary>
              <div className="pa-llms-fold-body">
                <MetaFieldRow
                  label={fieldLabels.ogTitle}
                  value={active.parsed.ogTitle}
                  flags={flagsForField(active.qualityFlags, "ogTitle")}
                />
                <MetaFieldRow
                  label={fieldLabels.ogDescription}
                  value={active.parsed.ogDescription}
                  flags={flagsForField(
                    active.qualityFlags,
                    "ogDescription",
                  )}
                />
                <MetaFieldRow
                  label={fieldLabels.twitterTitle}
                  value={active.parsed.twitterTitle}
                  flags={flagsForField(
                    active.qualityFlags,
                    "twitterTitle",
                  )}
                />
                <MetaFieldRow
                  label={fieldLabels.twitterDescription}
                  value={active.parsed.twitterDescription}
                  flags={flagsForField(
                    active.qualityFlags,
                    "twitterDescription",
                  )}
                />
              </div>
            </details>
            {active.parsed.secondaryKeywords &&
              active.parsed.secondaryKeywords.length > 0 && (
                <div
                  className="pa-row"
                  style={{ flexWrap: "wrap", gap: 4, marginTop: 8 }}
                >
                  {active.parsed.secondaryKeywords.map((k) => (
                    <span key={k} className="pa-pill">
                      {k}
                    </span>
                  ))}
                </div>
              )}
          </>
        ) : (
          <pre className="pa-code">{active.rawText}</pre>
        )}
      </div>
    </section>
  )
}

function MetaFieldGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="pa-section" style={{ marginTop: 8 }}>
      <span
        className="pa-section-title"
        style={{ fontSize: 11, marginBottom: 4, display: "block" }}
      >
        {title}
      </span>
      {children}
    </div>
  )
}

function MetaFieldRow({
  label,
  value,
  flags,
  softMax,
}: {
  label: string
  value?: string
  flags?: MetaQualityFlag[]
  softMax?: number
}) {
  const { t } = useI18n()
  if (!value) return null
  const hasMixedScript = (flags ?? []).some((f) => f.reason === "mixed-script")
  const overLength =
    softMax !== undefined && value.length > softMax

  return (
    <div className="pa-kv">
      <span className="pa-kv-label">
        {label}{" "}
        <span className="pa-pill">{t("common.chars", { n: value.length })}</span>
        {overLength && (
          <span
            className="pa-pill"
            data-tone="warning"
            title={t("meta.lengthSoftHint", { max: softMax })}
            style={{ marginLeft: 4 }}
          >
            {t("meta.lengthSoftPill", { max: softMax })}
          </span>
        )}
        {hasMixedScript && (
          <span
            className="pa-pill"
            data-tone="warning"
            title={t("meta.qualityMixedScriptHint")}
            style={{ marginLeft: 4 }}
          >
            ⚠ {t("meta.qualityMixedScriptPill")}
          </span>
        )}
      </span>
      <CopyableField value={value} />
    </div>
  )
}
