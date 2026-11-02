import { HelpIcon } from "../../components/HelpIcon"
import { MetaIcon, VerifyIcon } from "../../components/icons"
import { useI18n } from "../../i18n"
import type { MetaCostEstimate } from "../../lib/ai/meta-cost-estimate"
import type { Provider, ProviderId } from "../../lib/ai/providers"
import type { RefObject } from "react"

interface Props {
  pageContext: string
  localeCount: number
  providerId: ProviderId
  modelId: string
  allProviders: Provider[]
  currentProvider: Provider
  currentModel: Provider["models"][number]
  hasApiKey: boolean
  costEstimate: MetaCostEstimate | null
  busy: boolean
  progress: number
  elapsedLabel: string
  currentLocaleLabel: string
  isSlow: boolean
  progressPanelRef?: RefObject<HTMLDivElement>
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
  costEstimate,
  busy,
  progress,
  elapsedLabel,
  currentLocaleLabel,
  isSlow,
  progressPanelRef,
  onProviderChange,
  onModelChange,
}: Props) {
  const { t } = useI18n()
  const summaryParts = [
    currentModel.name,
    costEstimate
      ? `~$${costEstimate.costUsdListed.toFixed(4)} × ${localeCount}`
      : null,
  ].filter(Boolean)
  const normalizedProgress = Math.min(Math.max(progress, 0), localeCount)
  const readyLabel =
    localeCount === 1
      ? t("meta.generateReadyOne")
      : t("meta.generateReady", { n: localeCount })
  const estimatedCostLabel = costEstimate
    ? t(
        localeCount === 1
          ? "meta.estimatedCostListedOne"
          : "meta.estimatedCostListed",
        {
          total: costEstimate.costUsdListed.toFixed(4),
          n: costEstimate.localeCount,
          tokensIn: costEstimate.tokensInPerLocale,
          tokensOut: costEstimate.tokensOutPerLocale,
        },
      )
    : null
  const trimmedContext = pageContext.trim()
  const contextPreview = trimmedContext
    .replace(/\s+/g, " ")
    .slice(0, 220)
  const contextLength = trimmedContext.length
  const providerSummary = `${currentProvider.name} · ${currentModel.name}`
  const estimatedCostMetric = costEstimate
    ? `~$${costEstimate.costUsdListed.toFixed(4)}`
    : "—"

  return (
    <section className="pa-section">
      <div className="pa-meta-generate-hero">
        <div className="pa-meta-generate-hero-main">
          <span className="pa-section-title">{t("meta.generateHeroEyebrow")}</span>
          <h2>{t("meta.generateHeroTitle")}</h2>
          <p>
            {pageContext.trim()
              ? t("meta.generateHeroHelper")
              : t("meta.addContextWarning")}
          </p>
        </div>
        <div className="pa-metric-grid">
          <div className="pa-metric-tile">
            <MetaIcon size={16} />
            <span>
              <strong>{localeCount}</strong>
              <small>{t("meta.generateMetricLocales")}</small>
            </span>
          </div>
          <div className="pa-metric-tile">
            <VerifyIcon size={16} />
            <span>
              <strong>{contextLength}</strong>
              <small>{t("meta.generateMetricContext")}</small>
            </span>
          </div>
          <div className="pa-metric-tile">
            <MetaIcon size={16} />
            <span>
              <strong className="pa-truncate">{currentProvider.name}</strong>
              <small>{t("meta.generateMetricProvider")}</small>
            </span>
          </div>
          <div className="pa-metric-tile">
            <VerifyIcon size={16} />
            <span>
              <strong>{estimatedCostMetric}</strong>
              <small>{t("meta.generateMetricCost")}</small>
            </span>
          </div>
        </div>
      </div>

      {busy && (
        <div ref={progressPanelRef} className="pa-debug-progress">
          <div className="pa-debug-progress-head">
            <div>
              <p className="pa-section-eyebrow">
                {t("meta.generateProgressTitle")}
              </p>
              <p className="pa-section-helper">
                {t("meta.generateProgressHelper")}
              </p>
            </div>
            <span className="pa-pill">{elapsedLabel}</span>
          </div>
          <div className="pa-debug-progress-grid">
            <div>
              <span className="pa-stack-help">
                {t("meta.generateProgressCurrentLocale")}
              </span>
              <strong>{currentLocaleLabel || t("meta.generateProgressPreparing")}</strong>
            </div>
            <div>
              <span className="pa-stack-help">
                {t("meta.generateProgressProvider")}
              </span>
              <strong>{currentProvider.name}</strong>
            </div>
            <div>
              <span className="pa-stack-help">
                {t("meta.generateProgressModel")}
              </span>
              <strong className="pa-truncate">{currentModel.name}</strong>
            </div>
            <div>
              <span className="pa-stack-help">
                {t("meta.generateProgressCount")}
              </span>
              <strong>
                {t("meta.generatingProgress", {
                  current: normalizedProgress,
                  total: localeCount,
                })}
              </strong>
            </div>
          </div>
          <progress
            className="pa-progress"
            value={normalizedProgress}
            max={Math.max(1, localeCount)}
          />
          {isSlow && (
            <div className="pa-debug-progress-note">
              <strong>{t("meta.generateProgressSlowTitle")}</strong>
              <p>{t("meta.generateProgressSlowHelper")}</p>
            </div>
          )}
        </div>
      )}

      <div className="pa-meta-generate-preflight">
        <div className="pa-meta-output-preview">
          <div className="pa-row-spread">
            <span className="pa-section-title">
              {t("meta.generateContextPreviewTitle")}
            </span>
            <span className="pa-pill" data-tone="success">
              {pageContext.trim()
                ? t("meta.generateContextReady")
                : t("meta.generateContextDraft")}
            </span>
          </div>
          <p className="pa-section-helper" style={{ margin: 0 }}>
            {contextPreview || t("meta.generateContextPreviewEmpty")}
          </p>
          <div className="pa-meta-output-next">
            <strong>{readyLabel}</strong>
            <span>
              {t("meta.generateReviewHelper", {
                locales: String(localeCount),
                provider: providerSummary,
              })}
            </span>
          </div>
        </div>

        <div className="pa-meta-ai-picker">
          <div className="pa-meta-ai-picker-heading">
            <div>
              <strong>{t("meta.generateAiSettingsTitle")}</strong>
              <span>
                {summaryParts.length > 0
                  ? summaryParts.join(" · ")
                  : providerSummary}
              </span>
            </div>
            <HelpIcon termId="managedAi" />
          </div>
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
          {costEstimate && hasApiKey && (
            <div className="pa-meta-cost-estimate">
              <p className="pa-section-helper" style={{ margin: 0 }}>
                {estimatedCostLabel}
              </p>
              {costEstimate.costUsdConsoleUpper !== undefined &&
                providerId === "deepseek" && (
                  <p className="pa-section-helper" style={{ margin: "6px 0 0" }}>
                    {t("meta.estimatedCostConsoleUpper", {
                      total: costEstimate.costUsdConsoleUpper.toFixed(4),
                    })}
                  </p>
                )}
              <p
                className="pa-section-helper pa-meta-cost-disclaimer"
                style={{ margin: "6px 0 0" }}
              >
                {t("meta.estimatedCostDisclaimer")}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
