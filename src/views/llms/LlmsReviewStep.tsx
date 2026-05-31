import { useMemo } from "react"

import { useI18n } from "../../i18n"
import type { LlmsTranslateQualityReason } from "../../lib/ai/llms-translate"
import { localeFlagEmoji } from "../../lib/framer/locales"
import {
  partitionLocaleIssues,
  type GeneratedLlmsFile,
} from "./types"

interface Props {
  generated: GeneratedLlmsFile[]
  resultLocaleCode: string
  onResultLocaleChange: (code: string) => void
  defaultLocaleCode: string | undefined
  useAiTranslate: boolean
  busy: boolean
  progressLabel: string
  onRegenerateLocale: (localeCode: string) => void
  onCopy: (text: string) => void
  onDownload: (filename: string, content: string) => void
}

export function LlmsReviewStep({
  generated,
  resultLocaleCode,
  onResultLocaleChange,
  defaultLocaleCode,
  useAiTranslate,
  busy,
  progressLabel,
  onRegenerateLocale,
  onCopy,
  onDownload,
}: Props) {
  const { t } = useI18n()

  const active =
    generated.find((g) => g.localeCode === resultLocaleCode) ?? generated[0]

  const summaryLine = useMemo(() => {
    const parts = [t("llms.reviewFileCount", { n: generated.length })]
    for (const g of generated) {
      const partitioned = partitionLocaleIssues(g)
      if (partitioned.hasIssues) {
        const cmsCount =
          g.aiFailed.length + partitioned.missingLocalized.length
        parts.push(
          t("llms.reviewLocaleNeedsAttention", {
            locale: g.localeCode,
            n: cmsCount,
          }),
        )
      }
    }
    return parts.join(" · ")
  }, [generated, t])

  if (!active) {
    return (
      <p className="pa-section-helper">{t("llms.reviewEmpty")}</p>
    )
  }

  const issues = partitionLocaleIssues(active)
  const isDefaultLocale = active.localeCode === defaultLocaleCode
  const canRetryItems =
    useAiTranslate &&
    !isDefaultLocale &&
    (active.aiFailed.length > 0 || issues.missingLocalized.length > 0)
  const canRetry =
    canRetryItems ||
    active.headerFlag !== null ||
    active.longDescriptionFlag !== null

  return (
    <section className="pa-section">
      <span className="pa-section-title">{t("llms.generatedTitle")}</span>
      <p className="pa-section-helper" style={{ marginTop: 0 }}>
        {summaryLine}
      </p>

      <div
        className="pa-locale-tab-row"
        role="tablist"
        aria-label={t("llms.reviewLocaleTabs")}
      >
        {generated.map((g) => {
          const { hasIssues } = partitionLocaleIssues(g)
          return (
            <button
              key={g.localeCode}
              type="button"
              role="tab"
              aria-selected={g.localeCode === active.localeCode}
              className="pa-locale-tab"
              data-active={g.localeCode === active.localeCode}
              onClick={() => onResultLocaleChange(g.localeCode)}
            >
              <span className="pa-locale-tab-flag" aria-hidden="true">
                {localeFlagEmoji(g.localeCode)}
              </span>
              {g.localeCode}
              {hasIssues && <span aria-hidden="true"> ⚠</span>}
            </button>
          )
        })}
      </div>

      <div className="pa-card">
        <div className="pa-row-spread">
          <span style={{ fontWeight: 600 }}>{active.filename}</span>
          <div className="pa-button-row" style={{ flex: "0 0 auto" }}>
            {canRetry && (
              <button
                type="button"
                className="pa-pill-button"
                data-tone="accent"
                disabled={busy}
                onClick={() => onRegenerateLocale(active.localeCode)}
                title={t("llms.regenerateLocaleHint", {
                  locale: active.localeName,
                })}
              >
                {busy && progressLabel
                  ? t("llms.regenerateLocaleBusy")
                  : t("llms.regenerateLocale")}
              </button>
            )}
            <button type="button" onClick={() => onCopy(active.content)}>
              {t("common.copy")}
            </button>
            <button
              type="button"
              onClick={() => onDownload(active.filename, active.content)}
            >
              {t("common.download")}
            </button>
          </div>
        </div>

        {issues.hasIssues ? (
          <details className="pa-section" open>
            <summary
              className="pa-row"
              style={{ alignItems: "center", gap: 6, cursor: "pointer" }}
            >
              <span className="pa-pill" data-tone="warning">
                {t("llms.issuesTitle")}
              </span>
            </summary>
            <LocaleIssuesPanel
              g={active}
              issues={issues}
              reasonLabel={reasonLabel(t)}
            />
          </details>
        ) : (
          <p className="pa-section-helper--inline" style={{ margin: 0 }}>
            {t("llms.reviewNoIssues")}
          </p>
        )}

        <details className="pa-section">
          <summary
            className="pa-row"
            style={{ alignItems: "center", gap: 6, cursor: "pointer" }}
          >
            <span style={{ fontWeight: 500, fontSize: 12 }}>
              {t("llms.previewTitle")}
            </span>
          </summary>
          <pre className="pa-code" style={{ marginTop: 8 }}>
            {active.content}
          </pre>
        </details>
      </div>
    </section>
  )
}

function reasonLabel(
  t: ReturnType<typeof useI18n>["t"],
): (r: LlmsTranslateQualityReason) => string {
  return (r) =>
    r === "mixed-script"
      ? t("llms.aiFailedReasonMixedScript")
      : r === "parse-failed"
        ? t("llms.aiFailedReasonParseFailed")
        : t("llms.aiFailedReasonUntranslated")
}

function LocaleIssuesPanel({
  g,
  issues,
  reasonLabel: reason,
}: {
  g: GeneratedLlmsFile
  issues: ReturnType<typeof partitionLocaleIssues>
  reasonLabel: (r: LlmsTranslateQualityReason) => string
}) {
  const { t } = useI18n()

  return (
    <div className="pa-stack" style={{ gap: 10, marginTop: 8 }}>
      {g.aiFailed.length > 0 && (
        <div>
          <p className="pa-section-helper" style={{ margin: "0 0 4px" }}>
            {t("llms.aiFailedPill", { n: g.aiFailed.length })} —{" "}
            {t("llms.aiFailedHelper")}
          </p>
          <ul style={{ margin: "0 0 0 20px", padding: 0 }}>
            {g.aiFailed.map((s) => (
              <li key={s.itemId} style={{ marginBottom: 2 }}>
                {s.defaultTitle}{" "}
                <span className="pa-pill" data-tone="warning">
                  {reason(s.reason)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {issues.missingLocalized.length > 0 && (
        <div>
          <p className="pa-section-helper" style={{ margin: "0 0 4px" }}>
            {t("llms.skippedLocalizedPill", {
              n: issues.missingLocalized.length,
            })}{" "}
            — {t("llms.skippedLocalizedHelper", { locale: g.localeName })}
          </p>
          <ul style={{ margin: 0, padding: "0 0 0 20px" }}>
            {issues.missingLocalized.map((s) => (
              <li key={s.itemId}>{s.defaultTitle}</li>
            ))}
          </ul>
        </div>
      )}

      {issues.missingDefault.length > 0 && (
        <p className="pa-section-helper">
          <span className="pa-pill" data-tone="warning">
            {t("llms.skippedDefaultPill", {
              n: issues.missingDefault.length,
            })}
          </span>{" "}
          {t("llms.skippedDefaultHelperGeneric")}
        </p>
      )}

      {g.headerFlag && (
        <p className="pa-section-helper">
          <span className="pa-pill" data-tone="warning">
            {t("llms.headerFlagPill")}
          </span>{" "}
          {g.headerFlag === "mixed-script"
            ? t("llms.headerFlagHintMixedScript")
            : t("llms.headerFlagHintUntranslated")}
        </p>
      )}

      {g.longDescriptionFlag && (
        <p className="pa-section-helper">
          <span className="pa-pill" data-tone="warning">
            {t("llms.longDescriptionFlagPill")}
          </span>{" "}
          {g.longDescriptionFlag === "mixed-script"
            ? t("llms.longDescriptionFlagHintMixedScript")
            : t("llms.longDescriptionFlagHintUntranslated")}
        </p>
      )}

      {g.duplicateTitles.length > 0 && (
        <div>
          <p className="pa-section-helper" style={{ margin: "0 0 4px" }}>
            <span className="pa-pill" data-tone="warning">
              {t("llms.duplicateTitlesPill", {
                n: g.duplicateTitles.length,
              })}
            </span>{" "}
            {t("llms.duplicateTitlesHelper")}
          </p>
          <ul style={{ margin: 0, padding: "0 0 0 20px" }}>
            {g.duplicateTitles.map((dup, i) => (
              <li key={`${dup.collectionName}-${i}`} style={{ marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{dup.collectionName}</span>
                  {": "}
                  <span style={{ fontStyle: "italic" }}>"{dup.title}"</span>{" "}
                  <span className="pa-pill" data-tone="warning">
                    {t("llms.duplicateTitlesSharedBy", {
                      n: dup.itemIds.length,
                    })}
                  </span>
                </div>
                {dup.slugs.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    <span className="pa-section-helper" style={{ margin: 0 }}>
                      {t("llms.duplicateTitlesSlugsLabel")}
                    </span>
                    {dup.slugs.map((slug, slugIndex) => (
                      <span
                        key={`${dup.collectionName}-${i}-${slug}-${slugIndex}`}
                        className="pa-pill"
                        title={slug}
                      >
                        {slug}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
