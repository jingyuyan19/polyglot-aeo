/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState, type ReactNode } from "react"

import { HelpIcon } from "../../components/HelpIcon"
import { useI18n } from "../../i18n"
import { metaSuggestMatchesCurrent } from "../../lib/ai/meta-suggest-match"
import type { MetaSetupSuggestField } from "../../lib/ai/meta-setup-suggest"
import type { Provider, ProviderId } from "../../lib/ai/providers"
import type { StaticPageEntry } from "../../lib/framer/static-pages"

export type MetaPageSetupPhase = "load" | "select" | "content"

interface Props {
  pageType: string
  pageContext: string
  primaryKeyword: string
  brandVoice: string
  selectedPageId: string | undefined
  staticPages: StaticPageEntry[] | null
  pagesScanning: boolean
  pagesScanPartial: boolean
  pageContentLoading: boolean
  manualOnly: boolean
  suggestBusy: MetaSetupSuggestField | null
  suggestion: { field: MetaSetupSuggestField; text: string } | null
  localeCount: number
  providerId: ProviderId
  modelId: string
  allProviders: Provider[]
  currentProvider: Provider
  currentModel: Provider["models"][number]
  onPageTypeChange: (v: string) => void
  onPageContextChange: (v: string) => void
  onPrimaryKeywordChange: (v: string) => void
  onBrandVoiceChange: (v: string) => void
  onSelectPage: (page: StaticPageEntry) => void
  onScanPages: () => void
  onRescanPages: () => void
  onManualOnlyChange: (manual: boolean) => void
  selectedPageIsHomepage?: boolean
  onSuggestField: (
    field: MetaSetupSuggestField,
    options?: { ignoreDraft?: boolean },
  ) => void
  onAcceptSuggestion: () => void
  onDismissSuggestion: () => void
  onProviderChange: (id: ProviderId) => void
  onModelChange: (id: string) => void
}

export function deriveMetaPagePhase(
  manualOnly: boolean,
  staticPages: StaticPageEntry[] | null,
  selectedPageId: string | undefined,
): MetaPageSetupPhase {
  if (manualOnly) return "content"
  if (staticPages === null) return "load"
  if (!selectedPageId) return "select"
  return "content"
}

/** Checklist “done” must follow phase order — draft-restored context must not skip steps 1–2. */
export function deriveMetaFlowStepDone(
  manualOnly: boolean,
  staticPages: StaticPageEntry[] | null,
  selectedPageId: string | undefined,
  pageContext: string,
): { load: boolean; select: boolean; content: boolean } {
  const pagesLoaded = staticPages !== null
  const pageSelected = Boolean(selectedPageId)
  const hasContext = pageContext.trim().length > 0
  if (manualOnly) {
    return { load: true, select: true, content: hasContext }
  }
  return {
    load: pagesLoaded,
    select: pagesLoaded && pageSelected,
    content: pagesLoaded && pageSelected && hasContext,
  }
}

export function MetaPageStep({
  pageType,
  pageContext,
  primaryKeyword,
  brandVoice,
  selectedPageId,
  staticPages,
  pagesScanning,
  pagesScanPartial,
  pageContentLoading,
  manualOnly,
  suggestBusy,
  suggestion,
  localeCount,
  providerId,
  modelId,
  allProviders,
  currentProvider,
  currentModel,
  onPageTypeChange,
  onPageContextChange,
  onPrimaryKeywordChange,
  onBrandVoiceChange,
  onSelectPage,
  onScanPages,
  onRescanPages,
  onManualOnlyChange,
  onSuggestField,
  onAcceptSuggestion,
  onDismissSuggestion,
  onProviderChange,
  onModelChange,
  selectedPageIsHomepage,
}: Props) {
  const { t } = useI18n()
  const [optionalOpen, setOptionalOpen] = useState(
    Boolean(brandVoice.trim() || primaryKeyword.trim()),
  )

  const phase = deriveMetaPagePhase(
    manualOnly,
    staticPages,
    selectedPageId,
  )
  const hasContext = pageContext.trim().length > 0
  const stepDone = deriveMetaFlowStepDone(
    manualOnly,
    staticPages,
    selectedPageId,
    pageContext,
  )

  const selectedPage = staticPages?.find((p) => p.id === selectedPageId)
  const sourceLabel = manualOnly
    ? t("meta.sourceManual")
    : selectedPage
      ? t("meta.sourceProjectSelected", { title: selectedPage.title })
      : staticPages
        ? t("meta.sourceProjectReady")
        : t("meta.sourceProject")
  const hasThinContext = hasContext && pageContext.trim().length < 24
  const selectedPageLooksUtility =
    !manualOnly &&
    Boolean(
      selectedPage &&
        (/^\/?404\/?$/i.test(selectedPage.rawPath) ||
          /404|not found/i.test(selectedPage.title)),
    )

  return (
    <section className="pa-section">
      <div className="pa-meta-setup-grid" aria-label={t("meta.pageFlowTitle")}>
        <div className="pa-meta-setup-hero">
          <span className="pa-pill" data-tone="accent">
            {t("meta.setupHeroEyebrow")}
          </span>
          <h2>{t("meta.setupHeroTitle")}</h2>
          <p>{t("meta.setupHeroBody")}</p>
          <div className="pa-meta-file-chips" aria-label={t("meta.setupFiles")}>
            <span>
              {localeCount === 1
                ? t("meta.setupLocaleOne")
                : t("meta.setupLocaleMany", { n: localeCount })}
            </span>
            <span>{t("meta.setupFileDefault")}</span>
            <span>{t("meta.setupFileSearch")}</span>
            <span>{t("meta.setupFileSocial")}</span>
          </div>
        </div>
      </div>

      <div className="pa-meta-compact-flow">
        <FlowStepItem
          index={1}
          done={stepDone.load}
          active={phase === "load"}
          label={
            stepDone.load
              ? t("meta.pageFlowLoadDoneShort")
              : t("meta.pageFlowLoadShort")
          }
        />
        <FlowStepItem
          index={2}
          done={stepDone.select}
          active={phase === "select"}
          label={
            stepDone.select && selectedPage
              ? t("meta.pageFlowSelectDoneShort", { title: selectedPage.title })
              : manualOnly && stepDone.select
                ? t("meta.pageFlowManualDoneShort")
                : t("meta.pageFlowSelectShort")
          }
        />
        <FlowStepItem
          index={3}
          done={stepDone.content}
          active={phase === "content"}
          label={t("meta.pageFlowContentShort")}
        />
      </div>

      {phase === "load" && (
        <div className="pa-card pa-meta-page-phase">
          <div className="pa-meta-source-switch" role="group">
            <button type="button" data-active="true">
              {t("meta.sourceProject")}
            </button>
            <button type="button" onClick={() => onManualOnlyChange(true)}>
              {t("meta.sourceManual")}
            </button>
          </div>
          <p className="pa-section-helper" style={{ margin: 0 }}>
            {t("meta.pageFlowLoadHint")}
          </p>
          <button
            type="button"
            className="pa-button-primary"
            style={{ width: "100%", marginTop: 10 }}
            onClick={onScanPages}
            disabled={pagesScanning}
          >
            {pagesScanning ? t("meta.scanningPages") : t("meta.scanPages")}
          </button>
        </div>
      )}

      {phase === "select" && staticPages && (
        <div className="pa-card pa-meta-page-phase">
          <div className="pa-meta-source-switch" role="group">
            <button type="button" data-active="true">
              {t("meta.sourceProject")}
            </button>
            <button type="button" onClick={() => onManualOnlyChange(true)}>
              {t("meta.sourceManual")}
            </button>
          </div>
          <p className="pa-section-helper" style={{ margin: 0 }}>
            {t("meta.pageFlowSelectHint")}
          </p>
          {pagesScanPartial && (
            <p className="pa-section-helper" style={{ margin: "8px 0 0" }}>
              {t("meta.pagesScanPartial")}
            </p>
          )}
          <label className="pa-label" style={{ marginTop: 10 }}>
            {t("meta.pickPage")}
            <select
              className="pa-select"
              value={selectedPageId ?? ""}
              onChange={(e) => {
                const page = staticPages.find((p) => p.id === e.target.value)
                if (page) onSelectPage(page)
              }}
            >
              <option value="">{t("meta.pageFlowSelectPlaceholder")}</option>
              {staticPages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isHomepage
                    ? `${p.title} (${t("meta.homepageBadge")})`
                    : `${p.title} — ${p.rawPath}`}
                </option>
              ))}
            </select>
          </label>
          <div className="pa-button-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="pa-link"
              onClick={onRescanPages}
              disabled={pagesScanning}
            >
              {t("meta.pageFlowRescan")}
            </button>
            <span
              aria-hidden="true"
              style={{ color: "var(--framer-color-text-tertiary)" }}
            >
              ·
            </span>
            <button
              type="button"
              className="pa-link"
              onClick={() => onManualOnlyChange(true)}
            >
              {t("meta.pageFlowManual")}
            </button>
          </div>
        </div>
      )}

      {phase === "content" && (
        <>
          <div className="pa-meta-source-card">
            <div>
              <span>{t("meta.sourceCurrent")}</span>
              <strong>{sourceLabel}</strong>
              {!manualOnly && selectedPage && (
                <small>{selectedPage.rawPath}</small>
              )}
            </div>
            <button
              type="button"
              className="pa-pill-button"
              onClick={() => onManualOnlyChange(!manualOnly)}
            >
              {manualOnly ? t("meta.pageFlowBackToPick") : t("meta.pageFlowManual")}
            </button>
          </div>
          {selectedPageLooksUtility && (
            <div className="pa-meta-context-warning" role="status">
              <strong>{t("meta.utilityPageTitle")}</strong>
              <span>{t("meta.utilityPageBody")}</span>
            </div>
          )}

          <AiModelPicker
            providerId={providerId}
            modelId={modelId}
            allProviders={allProviders}
            currentProvider={currentProvider}
            currentModel={currentModel}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
          />

          <div className="pa-card pa-meta-page-phase">
            <div className="pa-label">
              <span className="pa-row-spread" style={{ alignItems: "center" }}>
                <span>{t("meta.pageContext")}</span>
                {pageContentLoading && (
                  <span className="pa-pill" data-tone="info">
                    {t("meta.pageContentLoading")}
                  </span>
                )}
              </span>
              <textarea
                className="pa-textarea"
                value={pageContext}
                onChange={(e) => onPageContextChange(e.target.value)}
                rows={4}
                placeholder={t("meta.pageContextPlaceholder")}
                disabled={pageContentLoading}
              />
            </div>
            {hasThinContext && (
              <div className="pa-meta-context-warning" role="status">
                <strong>{t("meta.contextThinTitle")}</strong>
                <span>{t("meta.contextThinBody")}</span>
              </div>
            )}

            <SuggestableField
              label={t("meta.pageType")}
              value={pageType}
              onChange={onPageTypeChange}
              placeholder={t("meta.pageTypePlaceholder")}
              field="pageType"
              hasContext={hasContext}
              suggestBusy={suggestBusy}
              suggestion={suggestion}
              helperText={
                selectedPageIsHomepage
                  ? t("meta.pageTypeHomeHint")
                  : t("meta.pageTypeHelper")
              }
              onSuggestField={onSuggestField}
              onAcceptSuggestion={onAcceptSuggestion}
              onDismissSuggestion={onDismissSuggestion}
            />
          </div>

          <details
            className="pa-llms-fold"
            open={optionalOpen}
            onToggle={(e) => setOptionalOpen(e.currentTarget.open)}
          >
            <summary>{t("meta.setupOptionalTitle")}</summary>
            <div className="pa-llms-fold-body">
              <SuggestableField
                label={t("meta.primaryKeyword")}
                value={primaryKeyword}
                onChange={onPrimaryKeywordChange}
                placeholder={t("meta.primaryKeywordPlaceholder")}
                field="primaryKeyword"
                hasContext={hasContext}
                suggestBusy={suggestBusy}
                suggestion={suggestion}
                onSuggestField={onSuggestField}
                onAcceptSuggestion={onAcceptSuggestion}
                onDismissSuggestion={onDismissSuggestion}
              />
              <SuggestableField
                label={
                  <span className="pa-row" style={{ gap: 4, width: "auto" }}>
                    {t("meta.brandVoice")}
                    <HelpIcon termId="brandVoice" />
                  </span>
                }
                value={brandVoice}
                onChange={onBrandVoiceChange}
                placeholder={t("meta.brandVoicePlaceholder")}
                field="brandVoice"
                hasContext={hasContext}
                suggestBusy={suggestBusy}
                suggestion={suggestion}
                onSuggestField={onSuggestField}
                onAcceptSuggestion={onAcceptSuggestion}
                onDismissSuggestion={onDismissSuggestion}
              />
            </div>
          </details>

          <div className="pa-meta-output-preview">
            <div className="pa-row-spread">
              <span className="pa-section-title">
                {t("meta.outputPreviewTitle")}
              </span>
              <span className="pa-pill" data-tone={hasContext ? "success" : "warning"}>
                {hasContext ? t("meta.outputReady") : t("meta.outputNeedsContext")}
              </span>
            </div>
            <p className="pa-section-helper" style={{ margin: 0 }}>
              {t("meta.outputPreviewBody")}
            </p>
            <div className="pa-meta-output-next">
              <strong>{t("meta.outputNextTitle")}</strong>
              <span>
                {localeCount === 1
                  ? t("meta.outputNextBodyOne")
                  : t("meta.outputNextBody", { n: localeCount })}
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function AiModelPicker({
  providerId,
  modelId,
  allProviders,
  currentProvider,
  currentModel,
  onProviderChange,
  onModelChange,
}: {
  providerId: ProviderId
  modelId: string
  allProviders: Provider[]
  currentProvider: Provider
  currentModel: Provider["models"][number]
  onProviderChange: (id: ProviderId) => void
  onModelChange: (id: string) => void
}) {
  const { t } = useI18n()

  return (
    <div className="pa-meta-ai-picker">
      <div className="pa-meta-ai-picker-heading">
        <div>
          <strong>{t("meta.aiModelTitle")}</strong>
          <span>{t("meta.aiModelBody")}</span>
        </div>
        <span className="pa-pill" data-tone="info">
          {currentModel.name}
        </span>
      </div>
      <div className="pa-meta-ai-picker-grid">
        <label className="pa-label">
          {t("meta.providerTitle")}
          <select
            className="pa-select"
            value={providerId}
            onChange={(e) => {
              const next = allProviders.find((p) => p.id === e.target.value)
              if (!next) return
              onProviderChange(next.id)
              onModelChange(next.models[0]?.id ?? "")
            }}
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
    </div>
  )
}

function FlowStepItem({
  index,
  done,
  active,
  label,
  hint,
}: {
  index: number
  done: boolean
  active: boolean
  label: string
  hint?: string
}) {
  return (
    <div
      className="pa-meta-flow-chip"
      data-done={done ? true : undefined}
      data-active={active ? true : undefined}
    >
      <span className="pa-meta-page-flow-step" aria-hidden="true">
        {done && !active ? "✓" : index}
      </span>
      <span>
        <span>{label}</span>
        {hint && active && (
          <span
            className="pa-section-helper"
            style={{ display: "block", marginTop: 2, fontWeight: 400 }}
          >
            {hint}
          </span>
        )}
      </span>
    </div>
  )
}

function SuggestableField({
  label,
  value,
  onChange,
  placeholder,
  field,
  hasContext,
  helperText,
  suggestBusy,
  suggestion,
  onSuggestField,
  onAcceptSuggestion,
  onDismissSuggestion,
}: {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  placeholder: string
  field: MetaSetupSuggestField
  hasContext: boolean
  helperText?: string
  suggestBusy: MetaSetupSuggestField | null
  suggestion: { field: MetaSetupSuggestField; text: string } | null
  onSuggestField: (
    field: MetaSetupSuggestField,
    options?: { ignoreDraft?: boolean },
  ) => void
  onAcceptSuggestion: () => void
  onDismissSuggestion: () => void
}) {
  const { t } = useI18n()
  const busy = suggestBusy === field
  const showResult = suggestion?.field === field
  const hasValue = value.trim().length > 0
  const isSame =
    showResult &&
    metaSuggestMatchesCurrent(field, suggestion!.text, value)
  const actionLabel = hasValue
    ? t("meta.suggestActionImprove")
    : t("meta.suggestActionInfer")
  const actionTitle = hasValue
    ? t("meta.suggestHintImprove")
    : t("meta.suggestHintInfer")

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showResult) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        panelRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        })
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [showResult, isSame, suggestion?.text])

  return (
    <div className="pa-label">
      <span className="pa-row-spread" style={{ alignItems: "center" }}>
        <span>{label}</span>
        <button
          type="button"
          className="pa-inline-action"
          disabled={!hasContext || (suggestBusy !== null && !busy)}
          data-busy={busy ? true : undefined}
          title={hasContext ? actionTitle : t("meta.suggestNeedsContext")}
          aria-label={hasContext ? actionTitle : t("meta.suggestNeedsContext")}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSuggestField(field)
          }}
        >
          {busy ? (
            <>
              <span className="pa-inline-action-spin" aria-hidden="true">
                ↻
              </span>
              {t("meta.suggestBusy")}
            </>
          ) : (
            <>✨ {actionLabel}</>
          )}
        </button>
      </span>
      {helperText && (
        <p className="pa-section-helper" style={{ margin: "4px 0 0" }}>
          {helperText}
        </p>
      )}
      <input
        className="pa-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {showResult && (
        <div ref={panelRef}>
          {isSame ? (
            <div
              className="pa-ai-panel pa-ai-panel-same"
              style={{ marginTop: 6 }}
              data-tone="info"
              role="status"
            >
              <p className="pa-section-helper" style={{ margin: 0 }}>
                <span className="pa-pill" data-tone="info">
                  {t("meta.suggestSameBadge")}
                </span>
              </p>
              <p className="pa-section-helper" style={{ margin: "8px 0 0" }}>
                {t("meta.suggestSameAsCurrent", { value: suggestion!.text })}
              </p>
              <div className="pa-ai-panel-same-actions">
                <button
                  type="button"
                  className="pa-link"
                  onClick={() => onSuggestField(field, { ignoreDraft: true })}
                  disabled={busy}
                >
                  {t("meta.suggestRetryFresh")}
                </button>
              </div>
            </div>
          ) : (
            <div className="pa-ai-panel" style={{ marginTop: 6 }}>
              {hasValue && (
                <p className="pa-section-helper" style={{ margin: "0 0 6px" }}>
                  {t("meta.suggestChangeFrom", {
                    from: value.trim(),
                    to: suggestion!.text.trim(),
                  })}
                </p>
              )}
              {!hasValue && (
                <p className="pa-section-helper" style={{ margin: "0 0 6px" }}>
                  {t("meta.suggestNewValue")}
                </p>
              )}
              <pre
                className="pa-code"
                style={{ margin: 0, whiteSpace: "pre-wrap" }}
              >
                {suggestion!.text}
              </pre>
              <div className="pa-button-row" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="pa-button-primary"
                  onClick={onAcceptSuggestion}
                >
                  {t("meta.suggestUse")}
                </button>
                <button
                  type="button"
                  onClick={() => onSuggestField(field)}
                  disabled={busy}
                >
                  {t("meta.suggestRetry")}
                </button>
                <button type="button" onClick={onDismissSuggestion}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
