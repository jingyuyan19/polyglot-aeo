import { useEffect, useState } from "react"

import type { ToolRoute } from "../App"
import { HelpIcon, type HelpTermId } from "../components/HelpIcon"
import {
  ChevronRightIcon,
  CmsIcon,
  ControlIcon,
  HelpCircleIcon,
  LlmsIcon,
  MetaIcon,
  SchemaIcon,
  SettingsIcon,
  VerifyIcon,
} from "../components/icons"
import { OnboardingNavButton } from "../components/OnboardingNavButton"
import { LocaleSwitcher } from "../components/LocaleSwitcher"
import { useOnboardingSignals } from "../hooks/useOnboardingSignals"
import {
  FRAMER_AEO_SCANNER,
  FRAMER_LOCALIZATION_DOCS,
  LOKA_FRAMER_MARKETPLACE,
} from "../lib/links"
import { useEntitlement } from "../components/entitlement-hooks"
import { QuickStart } from "../components/QuickStart"
import { useLocales } from "../hooks/useLocales"
import { useI18n } from "../i18n"
import { readInstalledStatus } from "../lib/framer/customCode"
import { readString, StorageKeys, writeString } from "../lib/storage"

interface Props {
  onOpen: (route: ToolRoute) => void
  onOpenSettings: () => void
  onOpenOnboarding: () => void
  onOpenShortcuts?: () => void
}

export function Dashboard({
  onOpen,
  onOpenSettings,
  onOpenOnboarding,
  onOpenShortcuts,
}: Props) {
  const { t } = useI18n()
  const { locales, loading } = useLocales()
  const { tier, requestUpgrade } = useEntitlement()
  const onboarding = useOnboardingSignals()
  const [installed, setInstalled] = useState<{
    installed: boolean
    disabled: boolean
  } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [checklistLoaded, setChecklistLoaded] = useState(false)
  const [localesExpanded, setLocalesExpanded] = useState(false)

  useEffect(() => {
    readInstalledStatus().then(setInstalled)
  }, [])

  useEffect(() => {
    let cancelled = false
    void readString(StorageKeys.OnboardingDismissed).then((raw) => {
      if (!cancelled) {
        setDismissed(raw === "true")
        setChecklistLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [onboarding.loaded])

  const installPill = installed?.installed
    ? installed.disabled
      ? { tone: "warning" as const, label: t("dashboard.statusDisabled") }
      : { tone: "success" as const, label: t("dashboard.statusInstalled") }
    : { tone: "accent" as const, label: t("dashboard.statusNotInstalled") }

  const checklistSignals = {
    localeCount: onboarding.localeCount,
    schemaInstalled: onboarding.schemaInstalled,
    llmsGenerated: onboarding.llmsGenerated,
    llmsDeployAcknowledged: onboarding.llmsDeployAcknowledged,
    hasApiKey: onboarding.hasApiKey,
    metaGenerated: onboarding.metaGenerated,
    publishedVerifyRan: onboarding.publishedVerifyRan,
  }

  const showQuickStart =
    onboarding.loaded && checklistLoaded && !dismissed

  const handleDismiss = async () => {
    setDismissed(true)
    await writeString(StorageKeys.OnboardingDismissed, "true")
  }

  return (
    <div className="pa-scroll pa-dashboard-scroll">
      <header className="pa-hero pa-dashboard-hero">
        <div className="pa-row-spread">
          <span className="pa-hero-title">Polyglot AEO</span>
          <div className="pa-row pa-dashboard-actions">
            <span className="pa-pill" data-tone={installPill.tone}>
              {installPill.label}
            </span>
            <LocaleSwitcher />
            {onOpenShortcuts && (
              <button
                type="button"
                className="pa-topbar-icon-button"
                onClick={onOpenShortcuts}
                aria-label={t("shortcuts.title")}
                title={t("shortcuts.title")}
              >
                <HelpCircleIcon size={14} />
              </button>
            )}
            <OnboardingNavButton onClick={onOpenOnboarding} />
            <button
              type="button"
              className="pa-topbar-icon-button"
              onClick={onOpenSettings}
              aria-label={t("common.openSettings")}
              title={t("common.openSettings")}
            >
              <SettingsIcon size={14} />
            </button>
          </div>
        </div>
        <p className="pa-hero-subtitle">{t("dashboard.subtitle")}</p>
        <p className="pa-hero-tagline">{t("dashboard.subtitleSecondary")}</p>
      </header>

      {showQuickStart && (
        <section className="pa-section">
          <QuickStart
            signals={checklistSignals}
            onOpen={onOpen}
            onDismiss={handleDismiss}
          />
        </section>
      )}

      <section className="pa-section">
        <span className="pa-section-title">{t("dashboard.toolsTitle")}</span>
        <div className="pa-tool-list">
          <ToolRow
            icon={<ControlIcon />}
            title={t("dashboard.controlTool")}
            desc={t("dashboard.controlToolDesc")}
            featured
            onClick={() => onOpen("control")}
          />
          <ToolRow
            icon={<SchemaIcon />}
            title={t("dashboard.schemaTool")}
            desc={t("dashboard.schemaToolDesc")}
            helpTermId="perLocaleSchema"
            onClick={() => onOpen("schema")}
          />
          <ToolRow
            icon={<LlmsIcon />}
            title={t("dashboard.llmsTool")}
            desc={t("dashboard.llmsToolDesc")}
            onClick={() => onOpen("llms")}
          />
          <ToolRow
            icon={<CmsIcon />}
            title={t("dashboard.cmsGapsTool")}
            desc={t("dashboard.cmsGapsToolDesc")}
            onClick={() => onOpen("cms")}
          />
          <ToolRow
            icon={<MetaIcon />}
            title={t("dashboard.metaTool")}
            desc={t("dashboard.metaToolDesc")}
            onClick={() => onOpen("meta")}
          />
          <ToolRow
            icon={<VerifyIcon />}
            title={t("dashboard.verifyTool")}
            desc={t("dashboard.verifyToolDesc")}
            onClick={() => onOpen("verify")}
          />
          <ToolRow
            icon={<SettingsIcon />}
            title={t("dashboard.settingsTool")}
            desc={t("dashboard.settingsToolDesc")}
            onClick={onOpenSettings}
          />
        </div>
      </section>

      {!loading && locales.length > 1 && tier === "free" && (
        <div className="pa-upgrade-banner">
          <span className="pa-pill" data-tone="accent">
            {t("dashboard.proBannerPlan")}
          </span>
          <div className="pa-upgrade-banner-copy">
            <strong>{t("dashboard.proBannerTitle")}</strong>
            <span>
              {t("dashboard.proBannerBody", { count: locales.length })}
            </span>
          </div>
          <button
            type="button"
            className="pa-upgrade-banner-action"
            onClick={() => requestUpgrade("multi_locale")}
          >
            {t("dashboard.proBannerAction")}
          </button>
        </div>
      )}

      <section className="pa-card pa-workflow-card">
        <div className="pa-row-spread">
          <span className="pa-section-title">{t("dashboard.stackTitle")}</span>
          <span className="pa-pill" data-tone="accent">
            {t("dashboard.stackBadge")}
          </span>
        </div>
        <p className="pa-section-helper pa-workflow-lead">
          {t("dashboard.stackIntro")}
        </p>
        <div className="pa-workflow-stack">
          <div className="pa-workflow-item">
            <span className="pa-workflow-item-index">1</span>
            <span className="pa-workflow-item-role">
              {t("dashboard.stackScannerRole")}
            </span>
            <a
              href={FRAMER_AEO_SCANNER}
              target="_blank"
              rel="noreferrer noopener"
              className="pa-workflow-item-title"
            >
              {t("dashboard.stackScannerLink")}
            </a>
            <p className="pa-stack-help">{t("dashboard.stackScannerDesc")}</p>
          </div>
          <div className="pa-workflow-item">
            <span className="pa-workflow-item-index">2</span>
            <span className="pa-workflow-item-role">
              {t("dashboard.stackLokaRole")}
            </span>
            <a
              href={LOKA_FRAMER_MARKETPLACE}
              target="_blank"
              rel="noreferrer noopener"
              className="pa-workflow-item-title"
            >
              {t("dashboard.stackLokaLink")}
            </a>
            <p className="pa-stack-help">{t("dashboard.stackLokaDesc")}</p>
          </div>
          <div className="pa-workflow-item pa-workflow-item-current">
            <span className="pa-workflow-item-index">3</span>
            <span className="pa-workflow-item-role">
              {t("dashboard.stackPolyglotRole")}
            </span>
            <span className="pa-workflow-item-title">Polyglot AEO</span>
            <p className="pa-stack-help">{t("dashboard.stackPolyglotDesc")}</p>
          </div>
        </div>
      </section>

      <section className="pa-card pa-locales-compact">
        <div className="pa-row-spread">
          <span className="pa-section-title">{t("dashboard.localesTitle")}</span>
          <span className="pa-pill">
            {loading
              ? "…"
              : locales.length === 0
                ? t("dashboard.localesNone")
                : t("dashboard.localesActive", { n: locales.length })}
          </span>
        </div>
        {!loading && locales.length === 0 && (
          <>
            <p className="pa-section-helper">{t("dashboard.localesEmpty")}</p>
            <a
              className="pa-link"
              href={FRAMER_LOCALIZATION_DOCS}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("dashboard.localesAddCta")} →
            </a>
          </>
        )}
        {!loading && locales.length > 0 && (
          <>
            <div className="pa-locale-chip-row">
              {locales.slice(0, 6).map((l) => (
                <span
                  key={l.id}
                  className="pa-pill"
                  data-tone={l.isDefault ? "accent" : undefined}
                  title={l.name}
                >
                  {l.code}
                </span>
              ))}
              {locales.length > 6 && (
                <span className="pa-pill">
                  {t("dashboard.localesMore", { n: locales.length - 6 })}
                </span>
              )}
            </div>
            <button
              type="button"
              className="pa-locales-toggle"
              onClick={() => setLocalesExpanded((e) => !e)}
              aria-expanded={localesExpanded}
            >
              {localesExpanded
                ? t("dashboard.localesHide")
                : t("dashboard.localesShow")}
            </button>
            {localesExpanded && (
              <div className="pa-locale-grid">
                {locales.map((l) => (
                  <div key={l.id} className="pa-locale-cell">
                    <span className="pa-locale-cell-name">
                      {l.name}
                      {l.isDefault && (
                        <span
                          className="pa-default-badge"
                          style={{ marginLeft: 6 }}
                        >
                          {t("common.default")}
                        </span>
                      )}
                    </span>
                    <span
                      className="pa-pill"
                      data-tone={l.isDefault ? "accent" : undefined}
                    >
                      {l.code}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function ToolRow({
  icon,
  title,
  desc,
  helpTermId,
  featured,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  helpTermId?: HelpTermId
  featured?: boolean
  onClick: () => void
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className="pa-tool-row"
      data-featured={featured ? "true" : undefined}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <span className="pa-tool-row-icon">{icon}</span>
      <span className="pa-tool-row-body">
        <span className="pa-tool-row-title-line">
          <span className="pa-tool-row-title">{title}</span>
          {helpTermId && (
            <span
              className="pa-tool-row-title-help"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <HelpIcon termId={helpTermId} />
            </span>
          )}
        </span>
        <span className="pa-tool-row-desc">{desc}</span>
      </span>
      <span className="pa-tool-row-chevron">
        <ChevronRightIcon />
      </span>
    </div>
  )
}
