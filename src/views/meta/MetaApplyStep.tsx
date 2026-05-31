import { useI18n } from "../../i18n"
import {
  FRAMER_LOCALIZATION_DOCS,
  FRAMER_PAGE_META_DOCS,
} from "../../lib/links"

interface Props {
  /** Display name from scan, e.g. "Home". */
  selectedPageTitle?: string
  selectedPagePath?: string
  onOpenFramerProject: () => void
}

/** Compact “paste into Framer” guide — shown above copy fields on the review step. */
export function MetaApplyGuide({
  selectedPageTitle,
  selectedPagePath,
  onOpenFramerProject,
}: Props) {
  const { t } = useI18n()
  const pageLabel =
    selectedPageTitle?.trim() ||
    selectedPagePath?.trim() ||
    t("meta.applyPageFallback")

  return (
    <div className="pa-deploy-guide pa-meta-apply-guide">
      <p className="pa-section-helper" style={{ margin: 0 }}>
        {t("meta.reviewIntro")}
      </p>
      <p className="pa-section-helper" style={{ margin: "8px 0 0" }}>
        <span className="pa-pill" data-tone="warning">
          {t("meta.applyNotSeoTab")}
        </span>
      </p>
      <p className="pa-section-helper" style={{ margin: "6px 0 0" }}>
        {t("meta.applySiteVsPage")}
      </p>

      <ol className="pa-deploy-guide-steps" style={{ marginTop: 10 }}>
        <li>
          {t("meta.applyStepLocale")}
          <div className="pa-deploy-action-row">
            <a
              href={FRAMER_LOCALIZATION_DOCS}
              target="_blank"
              rel="noreferrer noopener"
              className="pa-link"
            >
              {t("meta.applyStepLocaleLink")}
            </a>
          </div>
        </li>
        <li>
          {t("meta.applyStepOpenPagePanel", { page: pageLabel })}
          <p className="pa-section-helper" style={{ margin: "6px 0 0" }}>
            {t("meta.applyStepOpenPagePanelHow")}
          </p>
        </li>
        <li>{t("meta.applyStepFieldMapping")}</li>
        <li>{t("meta.applyStepCopyBelow")}</li>
        <li>{t("meta.applyStepRepeatLocales")}</li>
      </ol>

      <div className="pa-deploy-action-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="pa-link"
          onClick={onOpenFramerProject}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {t("meta.applyStepOpenProject")}
        </button>
        <span aria-hidden="true" style={{ color: "var(--framer-color-text-tertiary)" }}>
          ·
        </span>
        <a
          href={FRAMER_PAGE_META_DOCS}
          target="_blank"
          rel="noreferrer noopener"
          className="pa-link"
        >
          {t("meta.applyStepFramerMetaDocs")}
        </a>
      </div>

      <p className="pa-section-helper" style={{ margin: "8px 0 0" }}>
        {t("meta.applyHelper")}
      </p>
    </div>
  )
}

/** @deprecated Use MetaApplyGuide inside MetaReviewStep. */
export function MetaApplyStep(props: Props) {
  const { t } = useI18n()
  return (
    <section className="pa-section">
      <span className="pa-section-title">{t("meta.applyTitle")}</span>
      <MetaApplyGuide {...props} />
    </section>
  )
}
