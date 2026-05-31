import { useEffect, useState } from "react"

import type { ToolRoute } from "../App"
import { HelpIcon } from "../components/HelpIcon"
import {
  ChevronRightIcon,
  LlmsIcon,
  MetaIcon,
  SchemaIcon,
  SettingsIcon,
  VerifyIcon,
} from "../components/icons"
import { LocaleSwitcher } from "../components/LocaleSwitcher"
import { FRAMER_LOCALIZATION_DOCS } from "../lib/links"
import { useEntitlement } from "../components/entitlement-hooks"
import { QuickStart } from "../components/QuickStart"
import { useLocales } from "../hooks/useLocales"
import { useI18n } from "../i18n"
import { readCustomProviders, readProviderKey } from "../lib/ai/client"
import { BUILTIN_PROVIDERS } from "../lib/ai/providers"
import { readInstalledStatus } from "../lib/framer/customCode"
import type { OnboardingSignals } from "../lib/onboarding"
import { readJson, readString, StorageKeys, writeString } from "../lib/storage"

interface Props {
  onOpen: (route: ToolRoute) => void
  onOpenSettings: () => void
  /** Optional. When provided, hero shows a `?` icon that opens the
   * keyboard shortcut overlay. Helps designers discover the `?`
   * key without first having to know it exists. */
  onOpenShortcuts?: () => void
}

interface DashboardSignals extends OnboardingSignals {
  /** Whether the user has explicitly dismissed Quick Start. */
  dismissed: boolean
  /** Whether at least one Meta AI result has been generated. */
  metaGenerated: boolean
  /** Loaded flag — avoids flashing a Quick Start that's about to be hidden. */
  loaded: boolean
}

export function Dashboard({ onOpen, onOpenSettings, onOpenShortcuts }: Props) {
  const { t } = useI18n()
  const { locales, loading } = useLocales()
  const { tier, requestUpgrade } = useEntitlement()
  const [installed, setInstalled] = useState<{
    installed: boolean
    disabled: boolean
  } | null>(null)
  const [signals, setSignals] = useState<DashboardSignals>({
    localeCount: 0,
    schemaInstalled: false,
    llmsGenerated: false,
    hasApiKey: false,
    dismissed: false,
    metaGenerated: false,
    loaded: false,
  })

  useEffect(() => {
    readInstalledStatus().then(setInstalled)
  }, [])

  // Recompute onboarding signals whenever the underlying state could have
  // changed: locale list arrives, schema install status arrives, or the
  // component remounts (e.g. user navigates back from a tool).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const customConfigs = await readCustomProviders()
      // The "has API key" signal flips once *any* provider key is set —
      // we don't need every key, just at least one. Read in parallel so
      // this stays sub-100ms regardless of how many providers exist.
      const allIds = [
        ...BUILTIN_PROVIDERS.map((p) => p.id),
        ...customConfigs.map((c) => c.id),
      ]
      const [keys, lastLlms, lastMeta, dismissedRaw] = await Promise.all([
        Promise.all(allIds.map((id) => readProviderKey(id))),
        readJson<unknown>(StorageKeys.LastLlmsTxt, null),
        readJson<unknown>(StorageKeys.LastMetaResults, null),
        readString(StorageKeys.OnboardingDismissed),
      ])
      if (cancelled) return
      setSignals({
        localeCount: locales.length,
        schemaInstalled: Boolean(installed?.installed),
        llmsGenerated: lastLlms !== null,
        hasApiKey: keys.some((k) => Boolean(k)),
        dismissed: dismissedRaw === "true",
        metaGenerated: lastMeta !== null,
        loaded: true,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [locales.length, installed?.installed])

  const installPill = installed?.installed
    ? installed.disabled
      ? { tone: "warning" as const, label: t("dashboard.statusDisabled") }
      : { tone: "success" as const, label: t("dashboard.statusInstalled") }
    : { tone: "accent" as const, label: t("dashboard.statusNotInstalled") }

  const showQuickStart = signals.loaded && !signals.dismissed
  const schemaReady = Boolean(installed?.installed && !installed.disabled)
  const healthItems = [
    {
      done: schemaReady,
      title: schemaReady
        ? t("dashboard.healthSchemaDone")
        : t("dashboard.healthSchemaTodo"),
      action: () => onOpen("schema"),
    },
    {
      done: signals.llmsGenerated,
      title: signals.llmsGenerated
        ? t("dashboard.healthLlmsDone")
        : t("dashboard.healthLlmsTodo"),
      action: () => onOpen("llms"),
    },
    {
      done: signals.metaGenerated,
      title: signals.metaGenerated
        ? t("dashboard.healthMetaDone")
        : tier === "pro"
          ? t("dashboard.healthMetaTodoPro")
          : t("dashboard.healthMetaTodoFree"),
      action: () => onOpen("meta"),
    },
    {
      done: signals.hasApiKey,
      title: signals.hasApiKey
        ? t("dashboard.healthKeyDone")
        : t("dashboard.healthKeyTodo"),
      action: onOpenSettings,
    },
    ...(locales.length > 1
      ? [
          {
            done: tier === "pro",
            title:
              tier === "pro"
                ? t("dashboard.healthLocalesDone")
                : t("dashboard.healthLocalesTodo"),
            action: () => requestUpgrade("multi_locale"),
          },
        ]
      : []),
  ]
  const healthDone = healthItems.filter((item) => item.done).length
  const healthScore = signals.loaded
    ? Math.round((healthDone / Math.max(healthItems.length, 1)) * 100)
    : 0
  const healthTone =
    healthScore >= 80 ? "success" : healthScore >= 40 ? "warning" : "accent"

  const handleDismiss = async () => {
    setSignals((s) => ({ ...s, dismissed: true }))
    await writeString(StorageKeys.OnboardingDismissed, "true")
  }

  const handleDownloadReport = () => {
    const today = new Date().toISOString().slice(0, 10)
    const report = [
      `# Polyglot AEO Report`,
      ``,
      `Date: ${today}`,
      `AEO health: ${healthScore}%`,
      `Plan: ${tier === "pro" ? "Pro" : "Free"}`,
      `Locales: ${locales.length}`,
      ``,
      `## Checks`,
      ...healthItems.map((item) => `- ${item.done ? "[x]" : "[ ]"} ${item.title}`),
      ``,
      `## Notes`,
      `Generated by Polyglot AEO inside Framer.`,
    ].join("\n")
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `polyglot-aeo-report-${today}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pa-scroll">
      <header className="pa-hero">
        <div className="pa-row-spread">
          <span className="pa-hero-title">Polyglot AEO</span>
          <div className="pa-row" style={{ gap: 6, width: "auto", flex: "0 0 auto" }}>
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
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                ?
              </button>
            )}
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

      {!loading && locales.length > 1 && tier === "free" && (
        <div className="pa-upgrade-banner">
          {t("license.dashboardLocaleBanner", { count: locales.length })}
          <button
            type="button"
            className="pa-link-button"
            onClick={() => requestUpgrade("multi_locale")}
          >
            {t("license.upgrade.ctaLabel")}
          </button>
        </div>
      )}

      {showQuickStart && (
        <section className="pa-section">
          <QuickStart
            signals={signals}
            onOpen={onOpen}
            onDismiss={handleDismiss}
          />
        </section>
      )}

      <section className="pa-card pa-health-card">
        <div className="pa-row-spread">
          <span className="pa-section-title">{t("dashboard.healthTitle")}</span>
          <span className="pa-pill" data-tone={healthTone}>
            {t("dashboard.healthScore", { score: healthScore })}
          </span>
        </div>
        <div
          className="pa-quickstart-progress-bar"
          role="progressbar"
          aria-valuenow={healthScore}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className="pa-quickstart-progress-fill"
            style={{ width: `${healthScore}%` }}
          />
        </div>
        <div className="pa-health-list">
          {healthItems.map((item) => (
            <button
              key={item.title}
              type="button"
              className="pa-health-item"
              data-state={item.done ? "done" : "todo"}
              onClick={item.action}
            >
              <span className="pa-health-marker" aria-hidden="true">
                {item.done ? "✓" : "!"}
              </span>
              <span className="pa-health-title">{item.title}</span>
            </button>
          ))}
        </div>
        {signals.loaded && !signals.metaGenerated && signals.hasApiKey ? (
          <p className="pa-section-helper pa-health-meta-hint">
            {t("dashboard.healthMetaHint")}
          </p>
        ) : null}
        <button
          type="button"
          className="pa-button"
          onClick={() => onOpen("control")}
        >
          {t("dashboard.openControl")}
        </button>
        <button
          type="button"
          className="pa-button"
          onClick={handleDownloadReport}
        >
          {t("dashboard.reportDownload")}
        </button>
      </section>

      <section className="pa-card">
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
        {!loading && locales.length > 0 && (
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
      </section>

      <section className="pa-section">
        <span className="pa-section-title">{t("dashboard.toolsTitle")}</span>
        <div className="pa-tool-list">
          <ToolRow
            icon={<VerifyIcon />}
            title={t("dashboard.controlTool")}
            desc={t("dashboard.controlToolDesc")}
            onClick={() => onOpen("control")}
          />
          <ToolRow
            icon={<SchemaIcon />}
            title={t("dashboard.schemaTool")}
            desc={t("dashboard.schemaToolDesc")}
            onClick={() => onOpen("schema")}
          />
          <ToolRow
            icon={<LlmsIcon />}
            title={t("dashboard.llmsTool")}
            desc={t("dashboard.llmsToolDesc")}
            onClick={() => onOpen("llms")}
          />
          <ToolRow
            icon={<LlmsIcon />}
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
        </div>
      </section>

      <section className="pa-card pa-card--inset">
        <span className="pa-section-title">
          {t("dashboard.whyTitle")}
          <HelpIcon termId="aeo" />
        </span>
        <p className="pa-section-helper">
          {t("dashboard.whyBody", { code: "inLanguage" })}
        </p>
      </section>
    </div>
  )
}

function ToolRow({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button type="button" className="pa-tool-row" onClick={onClick}>
      <span className="pa-tool-row-icon">{icon}</span>
      <span className="pa-tool-row-body">
        <span className="pa-tool-row-title">{title}</span>
        <span className="pa-tool-row-desc">{desc}</span>
      </span>
      <span className="pa-tool-row-chevron">
        <ChevronRightIcon />
      </span>
    </button>
  )
}
