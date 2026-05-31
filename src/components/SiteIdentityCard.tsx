import { useState } from "react"

import { useI18n } from "../i18n"
import type {
  SiteIdentity,
  SiteIdentityTranslations,
} from "../lib/schema/identity"

interface Props {
  identity: SiteIdentity | null
  translations: SiteIdentityTranslations
  /** True while Phase 0 is in flight — renders a skeleton + spinner. */
  deriving: boolean
  /**
   * Persist the user's edits. Caller is responsible for writing to
   * `framer.setPluginData` and updating local state. We expect the
   * caller to flip `source` to `"user-edit"` so future scans don't
   * auto-overwrite.
   */
  onSave: (next: SiteIdentity) => void
}

/**
 * Compact, always-visible card showing the brand identity used
 * across all schema. Sits above the proposals list in the audit
 * view. Three visual states:
 *
 *   1. **Deriving** (Phase 0 running): skeleton + small spinner.
 *      Tells the user "the AI is figuring out my brand right now"
 *      so the empty card doesn't look stuck.
 *   2. **Identified** (identity present): one-line summary
 *      with brand name + a confidence/source badge. Click to
 *      expand into a small inline edit form.
 *   3. **Edit mode**: form with brand name, default byline, logo
 *      URL, site URL. Save commits + flips source to "user-edit".
 *
 * The card intentionally does NOT show every locale's translation
 * — that would explode in size and is rarely the source of user
 * confusion. We surface a one-line "Translated for N locales"
 * count and trust the user to inspect the JSON-LD to see them.
 */
export function SiteIdentityCard({
  identity,
  translations,
  deriving,
  onSave,
}: Props) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SiteIdentity | null>(null)

  if (deriving && !identity) {
    return (
      <div className="pa-identity-card pa-identity-card--deriving">
        <div className="pa-identity-spinner" aria-hidden />
        <div className="pa-identity-deriving-text">
          {t("schema.audit.identityCardDeriving")}
        </div>
      </div>
    )
  }

  if (!identity) return null

  const sourceLabel =
    identity.source === "user-edit"
      ? t("schema.audit.identityCardSourceUserEdit")
      : identity.source === "ai"
        ? t("schema.audit.identityCardSourceAi")
        : t("schema.audit.identityCardSourceFallback")

  const lowConfidence =
    identity.source !== "user-edit" && identity.confidence < 0.5

  if (editing && draft) {
    const updateDraft = (patch: Partial<SiteIdentity>) =>
      setDraft({ ...draft, ...patch })
    const handleSave = () => {
      // Force `source: "user-edit"` so future scans don't auto-
      // overwrite. The user took explicit ownership the moment
      // they hit Save — even if they didn't change anything.
      const trimmedBrand = draft.brandName.trim()
      if (!trimmedBrand) return // empty brand isn't a valid identity
      onSave({ ...draft, brandName: trimmedBrand, source: "user-edit" })
      setEditing(false)
    }
    return (
      <div className="pa-identity-card pa-identity-card--editing">
        <div className="pa-identity-form">
          <label className="pa-field">
            <span>{t("schema.audit.identityCardBrandLabel")}</span>
            <input
              type="text"
              value={draft.brandName}
              onChange={(e) => updateDraft({ brandName: e.target.value })}
              maxLength={60}
            />
          </label>
          <label className="pa-field">
            <span>{t("schema.audit.identityCardAuthorLabel")}</span>
            <input
              type="text"
              value={draft.defaultAuthor}
              onChange={(e) => updateDraft({ defaultAuthor: e.target.value })}
              maxLength={60}
            />
          </label>
          <label className="pa-field">
            <span>{t("schema.audit.identityCardUrlLabel")}</span>
            <input
              type="url"
              value={draft.publisherUrl ?? ""}
              onChange={(e) =>
                updateDraft({ publisherUrl: e.target.value || undefined })
              }
              placeholder="https://example.com"
            />
          </label>
          <label className="pa-field">
            <span>{t("schema.audit.identityCardLogoLabel")}</span>
            <input
              type="url"
              value={draft.publisherLogo ?? ""}
              onChange={(e) =>
                updateDraft({ publisherLogo: e.target.value || undefined })
              }
              placeholder="https://example.com/logo.png"
            />
          </label>
          <div className="pa-identity-form-actions">
            <button
              type="button"
              className="framer-button-secondary"
              onClick={() => {
                setDraft(null)
                setEditing(false)
              }}
            >
              {t("schema.audit.identityCardCancel")}
            </button>
            <button
              type="button"
              className="framer-button-primary"
              onClick={handleSave}
              disabled={!draft.brandName.trim()}
            >
              {t("schema.audit.identityCardSave")}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const localeCount = Object.keys(translations).length

  return (
    <div
      className={`pa-identity-card${
        lowConfidence ? " pa-identity-card--warning" : ""
      }`}
    >
      <div className="pa-identity-row">
        <div className="pa-identity-summary">
          <div className="pa-identity-title">
            {t("schema.audit.identityCardTitle")}
            <span className={`pa-identity-source pa-identity-source--${identity.source}`}>
              {sourceLabel}
            </span>
          </div>
          <div className="pa-identity-brand">{identity.brandName}</div>
          <div className="pa-identity-meta">
            {localeCount > 0
              ? t("schema.audit.identityCardTranslationsCount", {
                  n: localeCount,
                })
              : t("schema.audit.identityCardNoTranslations")}
          </div>
        </div>
        <button
          type="button"
          className="framer-button-secondary pa-identity-edit-btn"
          onClick={() => {
            setDraft(identity)
            setEditing(true)
          }}
        >
          {t("schema.audit.identityCardEdit")}
        </button>
      </div>
      {lowConfidence && (
        <div className="pa-identity-warning">
          {t("schema.audit.identityCardLowConfidence")}
        </div>
      )}
    </div>
  )
}
