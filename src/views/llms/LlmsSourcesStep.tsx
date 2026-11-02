import { useMemo } from "react"
import type { Dispatch, SetStateAction } from "react"

import { HelpIcon } from "../../components/HelpIcon"
import { useFeatureGate } from "../../components/entitlement-hooks"
import { CmsIcon, LlmsIcon } from "../../components/icons"
import { useI18n } from "../../i18n"
import type { CollectionSummary } from "../../lib/framer/cms"
import type { LocaleInfo } from "../../lib/framer/locales"
import type { Provider } from "../../lib/ai/providers"
import type { StaticPageEntry } from "../../lib/framer/static-pages"
import { LlmsAiTranslateFold } from "./LlmsAiTranslateFold"
import { resolveCollectionFields } from "./resolveCollectionFields"
import type { LlmsConfig } from "./llms-config"

interface Props {
  config: LlmsConfig
  setConfig: Dispatch<SetStateAction<LlmsConfig>>
  locales: LocaleInfo[]
  collections: CollectionSummary[]
  collectionsLoading: boolean
  onReloadCollections: () => void
  staticPages: StaticPageEntry[] | null
  pagesScanning: boolean
  pagesScanPartial: boolean
  onScanPages: () => void
  onToggleCollection: (id: string) => void
  onTogglePage: (id: string) => void
  allProviders: Provider[]
  currentProvider: Provider
  currentModel: Provider["models"][number]
  hasAiKey: boolean
  totalItemsAcrossCollections: number
}

export function LlmsSourcesStep({
  config,
  setConfig,
  locales,
  collections,
  collectionsLoading,
  onReloadCollections,
  staticPages,
  pagesScanning,
  pagesScanPartial,
  onScanPages,
  onToggleCollection,
  onTogglePage,
  allProviders,
  currentProvider,
  currentModel,
  hasAiKey,
  totalItemsAcrossCollections,
}: Props) {
  const { t } = useI18n()
  const gate = useFeatureGate()

  const { picked, unpicked } = useMemo(() => {
    const p: CollectionSummary[] = []
    const u: CollectionSummary[] = []
    for (const c of collections) {
      if (config.collectionIds.includes(c.id)) p.push(c)
      else u.push(c)
    }
    return { picked: p, unpicked: u }
  }, [collections, config.collectionIds])

  const pagesPicked = config.pageIds.length
  const pagesLoaded = staticPages !== null
  const hasRememberedPages = pagesPicked > 0 && !pagesLoaded
  const totalSelectedSources = config.collectionIds.length + pagesPicked
  const multiLocaleLocked =
    !gate.isPro && locales.some((locale) => !locale.isDefault)

  const renderCollection = (c: CollectionSummary) => {
    const pickedRow = config.collectionIds.includes(c.id)
    const fields = resolveCollectionFields(c, config.collectionFieldOverrides)
    const titleKnown = fields.title !== null
    const hasOverride =
      (config.collectionFieldOverrides[c.id] ?? null) !== null
    const hasSummary = fields.summary !== null
    const statusLine = !titleKnown
      ? t("llms.collectionFieldsMissing")
      : hasOverride
        ? hasSummary
          ? t("llms.collectionFieldsOverride", {
              title: fields.title ?? "—",
              summary: fields.summary ?? "—",
            })
          : t("llms.collectionFieldsOverrideTitleOnly", {
              title: fields.title ?? "—",
            })
        : hasSummary
          ? t("llms.collectionFieldsAuto", {
              title: fields.title ?? "—",
              summary: fields.summary ?? "—",
            })
          : t("llms.collectionFieldsAutoTitleOnly", {
              title: fields.title ?? "—",
            })

    return (
      <CollectionRow
        key={c.id}
        collection={c}
        picked={pickedRow}
        fields={fields}
        titleKnown={titleKnown}
        statusLine={statusLine}
        hasOverride={hasOverride}
        override={config.collectionFieldOverrides[c.id] ?? null}
        onTogglePicked={() => onToggleCollection(c.id)}
        onSetOverride={(next) => {
          setConfig((prev) => {
            const map = { ...prev.collectionFieldOverrides }
            if (next) map[c.id] = next
            else delete map[c.id]
            return { ...prev, collectionFieldOverrides: map }
          })
        }}
        tFieldsCustomize={t("llms.collectionFieldsCustomize")}
        tFieldsTitleLabel={t("llms.titleField")}
        tFieldsSummaryLabel={t("llms.summaryField")}
        tFieldsResetAuto={t("llms.collectionFieldsResetAuto")}
        tItemCount={t("llms.collectionItemCount", { n: c.itemCount })}
      />
    )
  }

  return (
    <section className="pa-section pa-llms-sources">
      <div className="pa-row-spread">
        <span className="pa-section-title">
          {t("llms.sourcesTitle")}
          <HelpIcon termId="llmsTxt" />
        </span>
        <span className="pa-pill">
          {t("llms.sourcesSelectedPill", { n: totalSelectedSources })}
        </span>
      </div>
      <div className="pa-card pa-llms-sources-card">
        <div className="pa-llms-sources-summary">
          <div>
            <span className="pa-card-title">{t("llms.sourcesHeroTitle")}</span>
            <p className="pa-section-helper">
              {t("llms.sourcesHeroBody")}
            </p>
          </div>
        </div>

        <div className="pa-metric-grid pa-llms-sources-metrics">
          <span className="pa-metric-tile">
            <CmsIcon size={15} />
            <span>
              <strong>{config.collectionIds.length}</strong>
              <small>{t("llms.cmsSourceTitle")}</small>
            </span>
          </span>
          <span className="pa-metric-tile">
            <LlmsIcon size={15} />
            <span>
              <strong>{pagesPicked}</strong>
              <small>{t("llms.pagesSourceTitle")}</small>
            </span>
          </span>
        </div>

        {multiLocaleLocked && (
          <div className="pa-llms-ai-pro-card pa-llms-multi-locale-card">
            <div>
              <span className="pa-pill" data-tone="info">
                {t("llms.freePlanPill")}
              </span>
              <strong>
                {t("llms.multiLocaleProTitle", { n: locales.length })}
              </strong>
              <p>{t("llms.multiLocaleProHelper")}</p>
            </div>
            <button
              type="button"
              className="pa-pill-button"
              onClick={() =>
                gate.check("llms_multi_locale", {
                  localeCount: locales.length,
                  nonDefaultLocale: true,
                })
              }
            >
              {t("llms.multiLocaleProAction")}
            </button>
          </div>
        )}

        <details
          className="pa-llms-fold pa-llms-fold--source"
          open={config.collectionIds.length > 0 || collections.length <= 3}
        >
          <summary>
            {t("llms.cmsFoldSummary", {
              n: config.collectionIds.length,
            })}
          </summary>
          <div className="pa-llms-fold-body">
            <div className="pa-row-spread" style={{ marginBottom: 4 }}>
              <span className="pa-section-helper--inline" style={{ margin: 0 }}>
                {t("llms.collectionShortHelper")}
              </span>
              <button
                type="button"
                className="pa-pill-button"
                onClick={() => onReloadCollections()}
                disabled={collectionsLoading}
              >
                {collectionsLoading
                  ? t("llms.collectionLoading")
                  : t("llms.collectionRefresh")}
              </button>
            </div>
            {!collectionsLoading && collections.length === 0 ? (
              <p className="pa-section-helper pa-section-helper--inline">
                {t("llms.collectionEmptyHelper")}
              </p>
            ) : (
              <div className="pa-llms-cms-list">
                {picked.map(renderCollection)}
                {unpicked.length > 0 && (
                  <details className="pa-llms-fold pa-llms-fold--nested">
                    <summary>
                      {t("llms.showMoreCollections", {
                        n: unpicked.length,
                      })}
                    </summary>
                    <div className="pa-llms-fold-body">
                      {unpicked.map(renderCollection)}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </details>

        <details
          className="pa-llms-fold pa-llms-fold--source"
          open={pagesPicked > 0 || !pagesLoaded || pagesScanning}
        >
          <summary>
            {t("llms.pagesFoldSummary", { n: pagesPicked })}
          </summary>
          <div className="pa-llms-fold-body">
            <div className="pa-row-spread" style={{ marginBottom: 4 }}>
              <span className="pa-section-helper--inline" style={{ margin: 0 }}>
                {pagesLoaded
                  ? t("llms.pagesLoadedHelper", {
                      n: staticPages.length,
                    })
                  : hasRememberedPages
                    ? t("llms.pagesRememberedHelper", { n: pagesPicked })
                    : t("llms.pagesShortHelper")}
              </span>
              <button
                type="button"
                className="pa-pill-button"
                onClick={() => onScanPages()}
                disabled={pagesScanning}
              >
                {pagesScanning
                  ? t("llms.pagesScanBusy")
                  : pagesLoaded || hasRememberedPages
                    ? t("llms.pagesRescan")
                    : t("llms.pagesScan")}
              </button>
            </div>
            {staticPages === null && !pagesScanning && (
              <p className="pa-section-helper pa-section-helper--inline">
                {hasRememberedPages
                  ? t("llms.pagesRememberedNotLoaded", { n: pagesPicked })
                  : t("llms.pagesNotScannedYet")}
              </p>
            )}
            {staticPages !== null && staticPages.length === 0 && (
              <p className="pa-section-helper pa-section-helper--inline">
                {t("llms.pagesEmpty")}
              </p>
            )}
            {staticPages && staticPages.length > 0 && (
              <>
                {pagesScanPartial && (
                  <p className="pa-section-helper" style={{ margin: 0 }}>
                    <span className="pa-pill" data-tone="warning">
                      {t("llms.pagesScanPartialPill")}
                    </span>{" "}
                    {t("llms.pagesScanPartialHelper")}
                  </p>
                )}
                <div className="pa-llms-pages-list">
                  {staticPages.map((p) => (
                    <label key={p.id} className="pa-checkbox-row pa-llms-page-row">
                      <input
                        type="checkbox"
                        checked={config.pageIds.includes(p.id)}
                        onChange={() => onTogglePage(p.id)}
                      />
                      <span className="pa-stack">
                        <span className="pa-stack-label">{p.title}</span>
                        <span className="pa-stack-help">{p.rawPath}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </details>

        <LlmsAiTranslateFold
          config={config}
          setConfig={setConfig}
          locales={locales}
          allProviders={allProviders}
          currentProvider={currentProvider}
          currentModel={currentModel}
          hasAiKey={hasAiKey}
          totalItemsAcrossCollections={totalItemsAcrossCollections}
        />
      </div>
    </section>
  )
}

interface CollectionRowProps {
  collection: CollectionSummary
  picked: boolean
  fields: { title: string | null; summary: string | null }
  titleKnown: boolean
  statusLine: string
  hasOverride: boolean
  override: { titleField?: string; summaryField?: string } | null
  onTogglePicked: () => void
  onSetOverride: (
    next: { titleField?: string; summaryField?: string } | null,
  ) => void
  tFieldsCustomize: string
  tFieldsTitleLabel: string
  tFieldsSummaryLabel: string
  tFieldsResetAuto: string
  tItemCount: string
}

function CollectionRow({
  collection,
  picked,
  fields,
  titleKnown,
  statusLine,
  hasOverride,
  override,
  onTogglePicked,
  onSetOverride,
  tFieldsCustomize,
  tFieldsTitleLabel,
  tFieldsSummaryLabel,
  tFieldsResetAuto,
  tItemCount,
}: CollectionRowProps) {
  return (
    <div className="pa-llms-cms-row" data-picked={picked}>
      <label className="pa-checkbox-row">
        <input type="checkbox" checked={picked} onChange={onTogglePicked} />
        <span className="pa-stack">
          <span className="pa-stack-label">{collection.name}</span>
          <span className="pa-stack-help">
            {tItemCount}
            {picked && (
              <>
                {" · "}
                {!titleKnown ? (
                  <span className="pa-pill" data-tone="warning">
                    {statusLine}
                  </span>
                ) : (
                  <span style={hasOverride ? { fontStyle: "italic" } : undefined}>
                    {statusLine}
                  </span>
                )}
              </>
            )}
          </span>
        </span>
      </label>

      {picked && (
        <details
          className="pa-llms-fold pa-llms-fold--nested"
          open={!titleKnown}
        >
          <summary>{tFieldsCustomize}</summary>
          <div className="pa-llms-fold-body">
            <CollectionFieldSelect
              label={tFieldsTitleLabel}
              value={override?.titleField ?? fields.title ?? ""}
              fieldNames={collection.fieldNames}
              onChange={(next) => {
                const title = next || undefined
                const summary = override?.summaryField
                onSetOverride(
                  title || summary
                    ? { titleField: title, summaryField: summary }
                    : null,
                )
              }}
            />
            <CollectionFieldSelect
              label={tFieldsSummaryLabel}
              value={override?.summaryField ?? fields.summary ?? ""}
              fieldNames={collection.fieldNames}
              onChange={(next) => {
                const title = override?.titleField
                const summary = next || undefined
                onSetOverride(
                  title || summary
                    ? { titleField: title, summaryField: summary }
                    : null,
                )
              }}
            />
            {hasOverride && (
              <button
                type="button"
                className="pa-pill-button"
                onClick={() => onSetOverride(null)}
                style={{ alignSelf: "flex-start" }}
              >
                {tFieldsResetAuto}
              </button>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function CollectionFieldSelect({
  label,
  value,
  fieldNames,
  onChange,
}: {
  label: string
  value: string
  fieldNames: ReadonlyArray<string>
  onChange: (next: string) => void
}) {
  if (fieldNames.length === 0) {
    return (
      <label className="pa-label">
        {label}
        <input
          className="pa-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }
  return (
    <label className="pa-label">
      {label}
      <select
        className="pa-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {fieldNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}
