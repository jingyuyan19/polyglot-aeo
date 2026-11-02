import { useMemo, useState, type ReactNode } from "react"

import { CopyableField } from "../../components/CopyableField"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { MetaIcon } from "../../components/icons"
import { useI18n } from "../../i18n"
import {
  flagsForField,
  hasMetaQualityIssue,
  type MetaQualityFlag,
} from "../../lib/ai/meta-quality"
import { localeFlagEmoji } from "../../lib/framer/locales"
import { formatMetaCopyBlock } from "./format-meta-copy"
import { MetaApplyGuide } from "./MetaApplyStep"
import type { ProviderId } from "../../lib/ai/providers"
import type { MetaResult } from "./types"

const TITLE_SOFT_MAX = 60
const DESC_SOFT_MAX = 155

interface Props {
  results: MetaResult[]
  resultLocaleId: string
  copiedLocaleIds: Set<string>
  selectedPageTitle?: string
  selectedPagePath?: string
  onResultLocaleChange: (localeId: string) => void
  onCopiedLocaleIdsChange: (ids: Set<string>) => void
  onOpenFramerProject: () => void
  totalCost: number
  busy: boolean
  regeneratingId: string | null
  onRegenerateLocale: (localeId: string) => void
  onRegenerateAll: () => void
  onDownloadLocale: () => void
  onDownloadAll: () => void
  providerId: ProviderId
}

export function MetaReviewStep({
  results,
  resultLocaleId,
  copiedLocaleIds,
  selectedPageTitle,
  selectedPagePath,
  onResultLocaleChange,
  onCopiedLocaleIdsChange,
  onOpenFramerProject,
  totalCost,
  busy,
  regeneratingId,
  onRegenerateLocale,
  onRegenerateAll,
  onDownloadLocale,
  onDownloadAll,
  providerId,
}: Props) {
  const { t } = useI18n()
  const [copyAllFeedbackLocaleId, setCopyAllFeedbackLocaleId] = useState<
    string | null
  >(null)
  const [regenerateAllConfirmOpen, setRegenerateAllConfirmOpen] =
    useState(false)

  const active =
    results.find((r) => r.localeId === resultLocaleId) ?? results[0]

  const summaryLine = useMemo(() => {
    const parts = [
      results.length === 1
        ? t("meta.reviewLocaleCountOne")
        : t("meta.reviewLocaleCount", { n: results.length }),
    ]
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
  const copiedLocaleCount = results.filter((r) =>
    copiedLocaleIds.has(r.localeId),
  ).length
  const copyAllText = active.parsed
    ? formatMetaCopyBlock(active.parsed, fieldLabels)
    : active.rawText ?? ""
  const activeLocaleCopied = copiedLocaleIds.has(active.localeId)
  const markActiveLocaleCopied = () => {
    const next = new Set(copiedLocaleIds)
    next.add(active.localeId)
    onCopiedLocaleIdsChange(next)
  }
  const handleCopyAll = async () => {
    if (!copyAllText.trim()) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyAllText)
      } else {
        const ta = document.createElement("textarea")
        ta.value = copyAllText
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      markActiveLocaleCopied()
      setCopyAllFeedbackLocaleId(active.localeId)
      window.setTimeout(() => setCopyAllFeedbackLocaleId(null), 1400)
    } catch {
      // Individual fields are still selectable/copyable below.
    }
  }

  return (
    <>
    <section className="pa-section">
      <div className="pa-meta-review-hero">
        <div className="pa-meta-review-hero-main">
          <span className="pa-section-title">{t("meta.reviewHeroEyebrow")}</span>
          <h2>{t("meta.reviewHeroTitle")}</h2>
          <p>{t("meta.reviewHeroBody")}</p>
        </div>
        <div className="pa-meta-review-facts">
          <div>
            <span>{t("meta.reviewCurrentPage")}</span>
            <strong>{selectedPageTitle || selectedPagePath || t("meta.applyPageFallback")}</strong>
          </div>
          <div>
            <span>{t("meta.reviewCurrentLocale")}</span>
            <strong>
              {localeFlagEmoji(active.localeCode)} {active.localeName}
            </strong>
          </div>
          <div>
            <span>{t("meta.reviewCopiedProgressLabel")}</span>
            <strong>
              {t("meta.reviewCopiedProgress", {
                done: copiedLocaleCount,
                total: results.length,
              })}
            </strong>
          </div>
        </div>
        <div className="pa-meta-review-action-row">
          <button
            type="button"
            className="pa-button-primary"
            onClick={() => void handleCopyAll()}
            disabled={!copyAllText.trim()}
          >
            {copyAllFeedbackLocaleId === active.localeId
              ? t("meta.copyAllFieldsDone")
              : activeLocaleCopied
                ? t("meta.copyAllFieldsAgain")
                : t("meta.copyAllFields")}
          </button>
          <button
            type="button"
            className="pa-footer-secondary"
            onClick={onOpenFramerProject}
          >
            {t("meta.openFramerSettings")}
          </button>
        </div>
      </div>

      <div className="pa-row-spread" style={{ marginTop: 12 }}>
        <span className="pa-section-title">{t("meta.copyFieldsTitle")}</span>
        {totalCost > 0 && (
          <span className="pa-pill">~${totalCost.toFixed(4)}</span>
        )}
      </div>
      <p className="pa-section-helper" style={{ marginTop: 0 }}>
        {summaryLine}
      </p>
      {totalCost > 0 && (
        <p
          className="pa-section-helper pa-meta-cost-disclaimer"
          style={{ marginTop: 4 }}
        >
          {providerId === "deepseek"
            ? t("meta.reviewCostDisclaimerDeepSeek")
            : t("meta.reviewCostDisclaimer")}
        </p>
      )}

      {results.length > 1 && (
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
                copiedLocaleIds.has(r.localeId) ? (
                  <span
                    className="pa-locale-tab-copied"
                    aria-label={t("meta.localeCopied")}
                  >
                    ✓
                  </span>
                ) : (
                  <span className="pa-locale-tab-dot" data-tone="warning" />
                )
              )}
              {!hasMetaQualityIssue(r.qualityFlags) &&
                copiedLocaleIds.has(r.localeId) && (
                  <span
                    className="pa-locale-tab-copied"
                    aria-label={t("meta.localeCopied")}
                  >
                    ✓
                  </span>
                )}
            </button>
          ))}
        </div>
      )}

      <div className="pa-card pa-file-card">
        <div className="pa-file-card-header">
          <div className="pa-file-title-stack">
            <span className="pa-file-title">
              <MetaIcon size={15} /> {active.localeName}
            </span>
            <span className="pa-section-helper" style={{ margin: 0 }}>
              {selectedPageTitle || selectedPagePath || t("meta.resultsTitle")}
            </span>
            <div className="pa-row" style={{ flexWrap: "wrap", gap: 6 }}>
              <span className="pa-pill" data-tone="accent">
                {active.language}
              </span>
              {hasMetaQualityIssue(active.qualityFlags) ? (
                <span
                  className="pa-pill"
                  data-tone="warning"
                  title={t("meta.qualityIssueHint")}
                >
                  {t("meta.qualityIssuePill", {
                    n: active.qualityFlags.length,
                  })}
                </span>
              ) : (
                <span className="pa-pill" data-tone="success">
                  {t("llms.reviewNoIssues")}
                </span>
              )}
            </div>
          </div>
          <div className="pa-file-actions">
            <span className="pa-pill" data-tone="accent">
              {active.localeCode}
            </span>
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
                multiline
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
                  multiline
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
                  multiline
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

      <details className="pa-llms-fold pa-meta-apply-fold">
        <summary>{t("meta.applyFoldTitle")}</summary>
        <div className="pa-llms-fold-body">
          <MetaApplyGuide
            selectedPageTitle={selectedPageTitle}
            selectedPagePath={selectedPagePath}
            onOpenFramerProject={onOpenFramerProject}
          />
        </div>
      </details>

      <details className="pa-llms-fold pa-meta-review-more">
        <summary>{t("meta.reviewMoreActions")}</summary>
        <div className="pa-llms-fold-body">
          <div className="pa-button-row">
            <button
              type="button"
              className="pa-pill-button"
              data-tone="accent"
              onClick={onDownloadLocale}
            >
              {t("meta.downloadLocale")}
            </button>
            {results.length > 1 && (
              <button
                type="button"
                className="pa-pill-button"
                onClick={onDownloadAll}
                title={t("meta.downloadAllHint")}
              >
                {t("meta.downloadAll", { n: results.length })}
              </button>
            )}
            <button
              type="button"
              className="pa-pill-button"
              onClick={() => setRegenerateAllConfirmOpen(true)}
              disabled={busy || regeneratingId !== null}
            >
              {t("meta.regenerateAll")}
            </button>
          </div>
        </div>
      </details>
    </section>
    <ConfirmDialog
      open={regenerateAllConfirmOpen}
      message={t("meta.regenerateAllConfirm")}
      confirmLabel={t("meta.regenerateAll")}
      onConfirm={() => {
        setRegenerateAllConfirmOpen(false)
        onRegenerateAll()
      }}
      onCancel={() => setRegenerateAllConfirmOpen(false)}
    />
    </>
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
  multiline,
  onCopied,
}: {
  label: string
  value?: string
  flags?: MetaQualityFlag[]
  softMax?: number
  multiline?: boolean
  onCopied?: () => void
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
      <CopyableField value={value} multiline={multiline} onCopied={onCopied} />
    </div>
  )
}
