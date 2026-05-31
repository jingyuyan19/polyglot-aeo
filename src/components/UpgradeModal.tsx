import { useEffect } from "react"

import { useI18n } from "../i18n"
import type { UpgradeReason } from "../lib/license/types"

interface Props {
  open: boolean
  reason: UpgradeReason | null
  checkoutUrl: string
  onClose: () => void
}

const REASON_KEYS: Record<
  UpgradeReason,
  keyof typeof import("../i18n/locales/en").en.license.upgrade
> = {
  multi_locale: "multi_locale",
  schema_install_limit: "schema_install_limit",
  schema_install_all: "schema_install_all",
  schema_translate: "schema_translate",
  llms_generate: "llms_generate",
  llms_multi_locale: "llms_multi_locale",
  llms_ai_translate: "llms_ai_translate",
  meta_generate: "meta_generate",
  schema_audit_persist: "schema_audit_persist",
  remote_schema_rules: "remote_schema_rules",
  generic_pro: "generic_pro",
}

export function UpgradeModal({ open, reason, checkoutUrl, onClose }: Props) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  const subKey = reason ? REASON_KEYS[reason] : "generic"
  const body = t(`license.upgrade.${subKey}` as "license.upgrade.generic")

  return (
    <div
      className="pa-confirm-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="pa-confirm-dialog pa-upgrade-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pa-upgrade-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pa-upgrade-title" className="pa-upgrade-title">
          {t("license.upgrade.title")}
        </h2>
        <p className="pa-confirm-message">{body}</p>
        <ul className="pa-upgrade-bullets">
          <li>{t("license.upgrade.bulletLocales")}</li>
          <li>{t("license.upgrade.bulletQuality")}</li>
          <li>{t("license.upgrade.bulletAgency")}</li>
        </ul>
        <div className="pa-upgrade-actions">
          <a
            className="pa-button pa-button-primary pa-upgrade-cta"
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="pa-upgrade-cta-main">
              {t("license.upgrade.ctaLabel")}
            </span>
            <span className="pa-upgrade-cta-sub">
              {t("license.upgrade.ctaPrice")}
            </span>
          </a>
          <button type="button" className="pa-button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        <p className="pa-upgrade-pricing-hint">
          {t("license.upgrade.pricingHint")}
        </p>
      </div>
    </div>
  )
}
