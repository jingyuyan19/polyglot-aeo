import type { Dispatch, ReactNode, SetStateAction } from "react"

import { HelpIcon } from "../../components/HelpIcon"
import { useI18n } from "../../i18n"
import type { LlmsConfig } from "./llms-config"

interface Props {
  config: LlmsConfig
  setConfig: Dispatch<SetStateAction<LlmsConfig>>
  renderSuggestPanel: (target: "summary" | "longDescription") => ReactNode
  onToggleSuggest: (target: "summary" | "longDescription") => void
}

export function LlmsSetupStep({
  config,
  setConfig,
  renderSuggestPanel,
  onToggleSuggest,
}: Props) {
  const { t } = useI18n()

  const hasLongDescription = config.longDescription.trim().length > 0

  return (
    <section className="pa-section">
      <div className="pa-card">
        <label className="pa-label">
          {t("llms.siteName")}
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

        <label className="pa-label">
          <span
            className="pa-row-spread"
            style={{ alignItems: "center" }}
          >
            <span>{t("llms.siteSummary")}</span>
            <button
              type="button"
              className="pa-pill-button"
              onClick={() => onToggleSuggest("summary")}
              title={t("llms.suggestHint")}
              aria-label={t("llms.suggestHint")}
            >
              ✨
            </button>
          </span>
          <textarea
            className="pa-textarea"
            value={config.siteSummary}
            onChange={(e) =>
              setConfig({ ...config, siteSummary: e.target.value })
            }
            placeholder={t("llms.siteSummaryPlaceholder")}
            rows={2}
          />
          {renderSuggestPanel("summary")}
        </label>

        <label className="pa-label">
          {t("llms.baseUrl")}
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

        <details className="pa-llms-fold" open={hasLongDescription}>
          <summary>
            {t("llms.setupOptionalTitle")}
            <HelpIcon termId="llmsTxt" />
          </summary>
          <div className="pa-llms-fold-body">
            <label className="pa-label">
              <span
                className="pa-row-spread"
                style={{ alignItems: "center" }}
              >
                <span>{t("llms.longDescription")}</span>
                <button
                  type="button"
                  className="pa-pill-button"
                  onClick={() => onToggleSuggest("longDescription")}
                  title={t("llms.longSuggestHint")}
                  aria-label={t("llms.longSuggestHint")}
                >
                  ✨
                </button>
              </span>
              <textarea
                className="pa-textarea pa-textarea--tall"
                value={config.longDescription}
                onChange={(e) =>
                  setConfig({ ...config, longDescription: e.target.value })
                }
                placeholder={t("llms.longDescriptionPlaceholder")}
                rows={4}
              />
              {renderSuggestPanel("longDescription")}
            </label>

            <label className="pa-checkbox-row">
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
        </details>
      </div>
    </section>
  )
}
