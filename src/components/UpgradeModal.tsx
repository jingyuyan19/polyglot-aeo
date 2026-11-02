import { useEffect } from "react"
import { createPortal } from "react-dom"

import { ModalOverlay } from "./ModalOverlay"
import { useI18n } from "../i18n"
import type { CheckoutPlanUrls, UpgradeReason } from "../lib/license/types"

interface Props {
  open: boolean
  reason: UpgradeReason | null
  checkoutUrls: CheckoutPlanUrls
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

export function UpgradeModal({ open, reason, checkoutUrls, onClose }: Props) {
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

  const root = document.getElementById("root")
  if (!root) return null

  const subKey = reason ? REASON_KEYS[reason] : "generic"
  const body = t(`license.upgrade.${subKey}` as "license.upgrade.generic")

  return createPortal(
    <ModalOverlay onBackdropClick={onClose}>
      <div
        className="pa-confirm-dialog pa-upgrade-dialog"
        role="dialog"
        aria-modal={true}
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
        <div className="pa-upgrade-plan-list">
          <a
            className="pa-upgrade-plan"
            data-featured="true"
            href={checkoutUrls.yearly}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("license.upgrade.yearlyPlanCta")}
          >
            <span className="pa-upgrade-plan-top">
              <span className="pa-upgrade-plan-name">
                {t("license.upgrade.yearlyPlanLabel")}
              </span>
              <span className="pa-upgrade-plan-badge">
                {t("license.upgrade.yearlyBadge")}
              </span>
            </span>
            <span className="pa-upgrade-plan-price">
              {t("license.upgrade.yearlyPlanPrice")}
            </span>
            <span className="pa-upgrade-plan-helper">
              {t("license.upgrade.yearlyPlanHelper")}
            </span>
            <span className="pa-upgrade-plan-cta">
              {t("license.upgrade.yearlyPlanCta")}
            </span>
          </a>
          <a
            className="pa-upgrade-plan"
            href={checkoutUrls.monthly}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("license.upgrade.monthlyPlanCta")}
          >
            <span className="pa-upgrade-plan-top">
              <span className="pa-upgrade-plan-name">
                {t("license.upgrade.monthlyPlanLabel")}
              </span>
            </span>
            <span className="pa-upgrade-plan-price">
              {t("license.upgrade.monthlyPlanPrice")}
            </span>
            <span className="pa-upgrade-plan-helper">
              {t("license.upgrade.monthlyPlanHelper")}
            </span>
            <span className="pa-upgrade-plan-cta">
              {t("license.upgrade.monthlyPlanCta")}
            </span>
          </a>
        </div>
        <div className="pa-upgrade-actions">
          <button type="button" className="pa-button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        <p className="pa-upgrade-pricing-hint">
          {t("license.upgrade.pricingHint")}
        </p>
      </div>
    </ModalOverlay>,
    root,
  )
}
