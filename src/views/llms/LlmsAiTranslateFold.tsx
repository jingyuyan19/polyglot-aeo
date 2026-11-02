import { useEffect } from "react"
import type { Dispatch, SetStateAction } from "react"

import { useFeatureGate } from "../../components/entitlement-hooks"
import { useI18n } from "../../i18n"
import { estimateLlmsTranslateCost } from "../../lib/ai/llms-translate"
import type { Provider, ProviderId } from "../../lib/ai/providers"
import type { LocaleInfo } from "../../lib/framer/locales"
import type { LlmsConfig } from "./llms-config"

interface Props {
  config: LlmsConfig
  setConfig: Dispatch<SetStateAction<LlmsConfig>>
  locales: LocaleInfo[]
  allProviders: Provider[]
  currentProvider: Provider
  currentModel: Provider["models"][number]
  hasAiKey: boolean
  totalItemsAcrossCollections: number
}

export function LlmsAiTranslateFold({
  config,
  setConfig,
  locales,
  allProviders,
  currentProvider,
  currentModel,
  hasAiKey,
  totalItemsAcrossCollections,
}: Props) {
  const { t } = useI18n()
  const gate = useFeatureGate()
  const hasNonDefaultLocale = locales.some((l) => !l.isDefault)
  const canUseAiTranslate = gate.isPro

  useEffect(() => {
    if (!hasNonDefaultLocale || canUseAiTranslate || !config.useAiTranslate) {
      return
    }
    setConfig((prev) =>
      prev.useAiTranslate ? { ...prev, useAiTranslate: false } : prev,
    )
  }, [
    canUseAiTranslate,
    config.useAiTranslate,
    hasNonDefaultLocale,
    setConfig,
  ])

  if (!hasNonDefaultLocale) return null

  return (
    <details
      className="pa-llms-fold pa-llms-fold--source pa-llms-ai-fold"
      open={canUseAiTranslate && config.useAiTranslate}
    >
      <summary>
        {t("llms.aiTranslateTitle")}
        {canUseAiTranslate && config.useAiTranslate
          ? ` · ${t("llms.setupAiEnabled")}`
          : ""}
        {!canUseAiTranslate && (
          <span className="pa-pill" data-tone="accent">
            Pro
          </span>
        )}
      </summary>
      <div className="pa-llms-fold-body">
        {!canUseAiTranslate ? (
          <div className="pa-llms-ai-pro-card">
            <div>
              <span className="pa-pill" data-tone="accent">
                Pro
              </span>
              <strong>{t("llms.aiTranslateProTitle")}</strong>
              <p>{t("llms.aiTranslateProHelper")}</p>
            </div>
            <button
              type="button"
              className="pa-pill-button"
              onClick={() =>
                gate.check("llms_ai_translate", {
                  localeCount: locales.length,
                })
              }
            >
              {t("llms.aiTranslateUnlock")}
            </button>
          </div>
        ) : (
          <label className="pa-checkbox-row">
            <input
              type="checkbox"
              checked={config.useAiTranslate}
              onChange={(e) => {
                setConfig({
                  ...config,
                  useAiTranslate: e.target.checked,
                })
              }}
            />
            <span>{t("llms.aiTranslateToggle")}</span>
          </label>
        )}

        {canUseAiTranslate && config.useAiTranslate && (
          <>
            <div className="pa-label-row">
              <label className="pa-label">
                {t("meta.providerTitle")}
                <select
                  className="pa-select"
                  value={config.aiProviderId}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      aiProviderId: e.target.value as ProviderId,
                    })
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
                  value={config.aiModelId}
                  onChange={(e) =>
                    setConfig({ ...config, aiModelId: e.target.value })
                  }
                >
                  {currentProvider.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!hasAiKey && (
              <p className="pa-section-helper" style={{ margin: 0 }}>
                <span className="pa-pill" data-tone="warning">
                  {t("common.apiKeyMissing")}
                </span>{" "}
                {t("llms.aiProviderKeyMissing", {
                  provider: currentProvider.name,
                })}
              </p>
            )}
            {hasAiKey &&
              totalItemsAcrossCollections > 0 &&
              currentModel.pricePerMTokenInput > 0 && (
                <p className="pa-section-helper" style={{ margin: 0 }}>
                  {t("llms.aiCostEstimate", {
                    cost: estimateLlmsTranslateCost(
                      totalItemsAcrossCollections *
                        locales.filter((l) => !l.isDefault).length,
                      currentModel.pricePerMTokenInput,
                      currentModel.pricePerMTokenOutput,
                    ).toFixed(4),
                  })}
                </p>
              )}
          </>
        )}
      </div>
    </details>
  )
}
