import type { Dispatch, ReactNode, SetStateAction } from "react"

import { HelpIcon } from "../../components/HelpIcon"
import { useI18n } from "../../i18n"
import type { LocaleInfo } from "../../lib/framer/locales"
import type { LlmsConfig } from "./llms-config"

interface Props {
  config: LlmsConfig
  setConfig: Dispatch<SetStateAction<LlmsConfig>>
  locales: LocaleInfo[]
  renderSuggestPanel: (target: "summary" | "longDescription") => ReactNode
  onToggleSuggest: (target: "summary" | "longDescription") => void
}

export function LlmsSetupStep({
  config,
  setConfig,
  locales,
  renderSuggestPanel,
  onToggleSuggest,
}: Props) {
  const { t } = useI18n()

  const fileNames =
    locales.length > 0
      ? locales.map((locale) =>
          locale.isDefault
            ? "llms.txt"
            : `llms-${locale.code.toLowerCase()}.txt`,
        )
      : ["llms.txt"]
  const fileCount = fileNames.length

  return (
    <section className="pa-section pa-llms-setup">
      <div className="pa-llms-setup-hero-grid">
        <div className="pa-llms-setup-hero">
          <span className="pa-card-title">{t("llms.setupHeroEyebrow")}</span>
          <h2>{t("llms.setupHeroTitle")}</h2>
          <p>{t("llms.setupHeroBody")}</p>
          <div className="pa-llms-file-chip-row" aria-label={t("llms.outputFilesLabel")}>
            {fileNames.slice(0, 4).map((filename) => (
              <span className="pa-pill" key={filename}>
                {filename}
              </span>
            ))}
            {fileNames.length > 4 && (
              <span className="pa-pill">
                {t("llms.outputFilesMore", { n: fileNames.length - 4 })}
              </span>
            )}
          </div>
        </div>

        <div className="pa-llms-setup-metrics">
          <div className="pa-llms-setup-metric">
            <span className="pa-llms-setup-metric-icon">{fileCount}</span>
            <span>
              <strong>{t("llms.setupFilesMetric", { n: fileCount })}</strong>
              <small>{t("llms.setupFilesMetricHelper")}</small>
            </span>
          </div>
          <div className="pa-llms-setup-metric">
            <span className="pa-llms-setup-metric-icon">3</span>
            <span>
              <strong>{t("llms.setupTimeMetric")}</strong>
              <small>{t("llms.setupTimeMetricHelper")}</small>
            </span>
          </div>
        </div>
      </div>

      <div className="pa-llms-section-head">
        <span className="pa-section-title">{t("llms.siteProfileTitle")}</span>
        <span className="pa-pill" data-tone="success">
          {t("llms.setupAutoSaveBadge")}
        </span>
      </div>

      <div className="pa-card pa-llms-profile-card">
        <label className="pa-label pa-llms-field-card">
          <span className="pa-row-spread">
            <span>{t("llms.siteName")}</span>
            <span className="pa-pill">{t("llms.setupEditHint")}</span>
          </span>
          <input
            className="pa-input"
            type="text"
            value={config.siteName}
            onChange={(e) =>
              setConfig({ ...config, siteName: e.target.value })
            }
            placeholder={t("llms.siteNamePlaceholder")}
          />
        </label>

        <label className="pa-label pa-llms-field-card">
          <span className="pa-row-spread">
            <span>{t("llms.baseUrl")}</span>
            <span className="pa-pill">{t("llms.setupEditHint")}</span>
          </span>
          <input
            className="pa-input"
            type="text"
            value={config.baseUrl}
            onChange={(e) =>
              setConfig({ ...config, baseUrl: e.target.value })
            }
            placeholder={t("llms.baseUrlPlaceholder")}
          />
        </label>

        <label className="pa-label pa-llms-field-card">
          <span
            className="pa-row-spread"
            style={{ alignItems: "center" }}
          >
            <span>{t("llms.siteSummary")}</span>
            <button
              type="button"
              className="pa-pill-button pa-llms-ai-refine"
              onClick={() => onToggleSuggest("summary")}
              title={t("llms.suggestHint")}
              aria-label={t("llms.suggestHint")}
            >
              {t("llms.aiRefine")}
            </button>
          </span>
          <textarea
            className="pa-textarea pa-llms-textarea-compact"
            value={config.siteSummary}
            onChange={(e) =>
              setConfig({ ...config, siteSummary: e.target.value })
            }
            placeholder={t("llms.siteSummaryPlaceholder")}
            rows={2}
          />
          {renderSuggestPanel("summary")}
        </label>

        <details className="pa-llms-fold pa-llms-fold--profile">
          <summary>
            {t("llms.longDescription")}
            <span className="pa-pill">{t("llms.longDescriptionOptional")}</span>
            <HelpIcon termId="llmsTxt" />
          </summary>
          <div className="pa-llms-fold-body">
            <label className="pa-label pa-llms-field-card">
              <span
                className="pa-row-spread"
                style={{ alignItems: "center" }}
              >
                <span>{t("llms.longDescription")}</span>
                <button
                  type="button"
                  className="pa-pill-button pa-llms-ai-refine"
                  onClick={() => onToggleSuggest("longDescription")}
                  title={t("llms.longSuggestHint")}
                  aria-label={t("llms.longSuggestHint")}
                >
                  {t("llms.aiRefine")}
                </button>
              </span>
              <textarea
                className="pa-textarea pa-llms-textarea-compact pa-llms-textarea-long"
                value={config.longDescription}
                onChange={(e) =>
                  setConfig({ ...config, longDescription: e.target.value })
                }
                placeholder={t("llms.longDescriptionPlaceholder")}
                rows={4}
              />
              {renderSuggestPanel("longDescription")}
            </label>
          </div>
        </details>

        <label className="pa-checkbox-row pa-llms-path-row">
          <input
            type="checkbox"
            checked={config.localizedPaths}
            onChange={(e) =>
              setConfig({ ...config, localizedPaths: e.target.checked })
            }
          />
          <span>{t("llms.localizedPathsLabel")}</span>
        </label>
      </div>

      <div className="pa-card pa-llms-output-card">
        <div className="pa-row-spread">
          <div>
            <span className="pa-section-title">{t("llms.outputPreviewTitle")}</span>
            <p className="pa-section-helper">
              {t("llms.outputPreviewHelper")}
            </p>
          </div>
          <span className="pa-pill" data-tone="success">
            {t("llms.outputPreviewReady")}
          </span>
        </div>
        <div className="pa-llms-next-card">
          <div>
            <strong>{t("llms.outputNextTitle")}</strong>
            <p>{t("llms.outputNextBody")}</p>
          </div>
          <span aria-hidden="true">→</span>
        </div>
      </div>
    </section>
  )
}
