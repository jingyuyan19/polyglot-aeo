import { useCallback, useState } from "react"

import { ProBadge } from "../components/ProBadge"
import { useEntitlement } from "../components/entitlement-hooks"
import { useI18n } from "../i18n"
import { canUseTestBillingMode } from "../lib/license/environment"
import { maskLicenseKey } from "../lib/license/storage"
import type { BillingMode } from "../lib/license/types"

export function LicenseSettingsSection() {
  const { t } = useI18n()
  const {
    tier,
    license,
    validating,
    lastError,
    billingMode,
    setBillingMode,
    activate,
    deactivate,
    refresh,
    requestUpgrade,
  } = useEntitlement()
  const [keyInput, setKeyInput] = useState("")
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle")
  const showBillingModeSelector = canUseTestBillingMode()

  const handleActivate = useCallback(async () => {
    setStatus("idle")
    const result = await activate(keyInput)
    if (result.ok) {
      setStatus("ok")
      setKeyInput("")
    } else {
      setStatus("error")
    }
  }, [activate, keyInput])

  const isPro = tier === "pro"
  const activeKeyHint = license ? maskLicenseKey(license.key) : ""
  const changeBillingMode = useCallback(
    (mode: BillingMode) => {
      if (mode !== billingMode) void setBillingMode(mode)
    },
    [billingMode, setBillingMode],
  )

  return (
    <section className="pa-section pa-license-section">
      <div className="pa-row-spread">
        <span className="pa-section-title">{t("license.settingsTitle")}</span>
        {isPro ? <ProBadge /> : null}
      </div>
      <p className="pa-section-helper">{t("license.settingsHelper")}</p>

      {showBillingModeSelector ? (
        <div className="pa-field-block">
          <span className="pa-label">{t("license.billingModeLabel")}</span>
          <div className="pa-segmented" role="group" aria-label="Billing mode">
            <button
              type="button"
              data-selected={billingMode === "production"}
              disabled={validating}
              onClick={() => changeBillingMode("production")}
            >
              {t("license.productionMode")}
            </button>
            <button
              type="button"
              data-selected={billingMode === "test"}
              disabled={validating}
              onClick={() => changeBillingMode("test")}
            >
              {t("license.testMode")}
            </button>
          </div>
          <p className="pa-section-helper">
            {billingMode === "test"
              ? t("license.testModeHelper")
              : t("license.productionModeHelper")}
          </p>
        </div>
      ) : null}

      {isPro && license ? (
        <>
          <p className="pa-section-helper">
            {t("license.activeKey", { hint: activeKeyHint })}
          </p>
          <div className="pa-license-actions">
            <button
              type="button"
              className="pa-button"
              disabled={validating}
              onClick={() => void refresh()}
            >
              {validating ? t("license.validating") : t("license.refresh")}
            </button>
            <button
              type="button"
              className="pa-button pa-button-danger"
              onClick={() => void deactivate()}
            >
              {t("license.deactivate")}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="pa-label" htmlFor="pa-license-key">
            {t("license.keyLabel")}
          </label>
          <input
            id="pa-license-key"
            className="pa-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={t("license.keyPlaceholder")}
          />
          <div className="pa-license-actions">
            <button
              type="button"
              className="pa-button pa-button-primary"
              disabled={validating || !keyInput.trim()}
              onClick={() => void handleActivate()}
            >
              {validating ? t("license.activating") : t("license.activate")}
            </button>
            <button
              type="button"
              className="pa-button"
              onClick={() => {
                requestUpgrade("generic_pro")
              }}
            >
              {t("license.getPro")}
            </button>
          </div>
          {status === "ok" ? (
            <p className="pa-success-text">{t("license.activateSuccess")}</p>
          ) : null}
          {(status === "error" || lastError) && !isPro ? (
            <p className="pa-error-text">
              {lastError ?? t("license.activateFailed")}
            </p>
          ) : null}
        </>
      )}

      {!isPro ? (
        <button
          type="button"
          className="pa-link-button"
          style={{ marginTop: 8 }}
          onClick={() => requestUpgrade("generic_pro")}
        >
          {t("license.comparePlans")}
        </button>
      ) : null}
    </section>
  )
}
