import { HelpIcon } from "../../components/HelpIcon"
import { useI18n } from "../../i18n"
import type { Provider, ProviderId } from "../../lib/ai/providers"

interface Props {
  pageContext: string
  localeCount: number
  providerId: ProviderId
  modelId: string
  allProviders: Provider[]
  currentProvider: Provider
  currentModel: Provider["models"][number]
  hasApiKey: boolean
  perCallEstimate: number
  totalEstimate: number
  showCostEstimate: boolean
  onProviderChange: (id: ProviderId) => void
  onModelChange: (id: string) => void
}

export function MetaGenerateStep({
  pageContext,
  localeCount,
  providerId,
  modelId,
  allProviders,
  currentProvider,
  currentModel,
  hasApiKey,
  perCallEstimate,
  totalEstimate,
  showCostEstimate,
  onProviderChange,
  onModelChange,
}: Props) {
  const { t } = useI18n()
  const summaryParts = [
    currentModel.name,
    showCostEstimate
      ? `~$${totalEstimate.toFixed(4)} × ${localeCount}`
      : null,
  ].filter(Boolean)

  return (
    <section className="pa-section">
      <p className="pa-section-helper" style={{ marginTop: 0 }}>
        {pageContext.trim()
          ? t("meta.generateReady", { n: localeCount })
          : t("meta.addContextWarning")}
      </p>

      <details className="pa-llms-fold">
        <summary>
          {t("common.aiSettingsTitle")}
          {summaryParts.length > 0 ? ` · ${summaryParts.join(" · ")}` : ""}
        </summary>
        <div className="pa-llms-fold-body">
          <HelpIcon termId="byok" />
          <div className="pa-label-row">
            <label className="pa-label">
              {t("meta.providerTitle")}
              <select
                className="pa-select"
                value={providerId}
                onChange={(e) =>
                  onProviderChange(e.target.value as ProviderId)
                }
              >
                {allProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pa-label">
              {t("meta.modelTitle")}
              <select
                className="pa-select"
                value={modelId}
                onChange={(e) => onModelChange(e.target.value)}
              >
                {currentProvider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.badge ? ` · ${m.badge}` : ""}
                    {m.pricePerMTokenInput > 0
                      ? ` · $${m.pricePerMTokenInput}/$${m.pricePerMTokenOutput}/M`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!hasApiKey && (
            <p className="pa-section-helper" style={{ margin: 0 }}>
              <span className="pa-pill" data-tone="warning">
                {t("common.apiKeyMissing")}
              </span>{" "}
              {t("meta.providerKeyMissing", { provider: currentProvider.name })}
            </p>
          )}
          {showCostEstimate && hasApiKey && (
            <p className="pa-section-helper" style={{ margin: 0 }}>
              {t("meta.estimatedCost")}:{" "}
              <strong>~${totalEstimate.toFixed(4)}</strong> ({localeCount} × ~
              {perCallEstimate.toFixed(4)})
            </p>
          )}
        </div>
      </details>
    </section>
  )
}
