import { useState, type ReactNode } from "react"

import { HelpIcon } from "../../components/HelpIcon"
import { useI18n } from "../../i18n"
import { metaSuggestMatchesCurrent } from "../../lib/ai/meta-suggest-match"
import type { MetaSetupSuggestField } from "../../lib/ai/meta-setup-suggest"
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
  const pagesLoaded = staticPages !== null
  const pageSelected = Boolean(selectedPageId)

  const selectedPage = staticPages?.find((p) => p.id === selectedPageId)

  return (
    <section className="pa-section">
      <span className="pa-section-title">{t("meta.sourceTitle")}</span>
      <p className="pa-section-helper" style={{ margin: "0 0 10px" }}>
        {t("meta.pageFlowIntro")}
      </p>

      <ol className="pa-meta-page-flow" aria-label={t("meta.pageFlowTitle")}>
        <FlowStepItem
          index={1}
          done={pagesLoaded || manualOnly}
          active={phase === "load"}
          label={
            pagesLoaded || manualOnly
              ? t("meta.pageFlowLoadDone")
              : t("meta.pageFlowLoad")
          }
        />
        <FlowStepItem
          index={2}
          done={pageSelected || manualOnly}
          active={phase === "select"}
          label={
            pageSelected && selectedPage
              ? t("meta.pageFlowSelectDone", { title: selectedPage.title })
              : manualOnly
                ? t("meta.pageFlowManualDone")
                : t("meta.pageFlowSelect")
          }
        />
        <FlowStepItem
          index={3}
          done={hasContext}
          active={phase === "content"}
          label={t("meta.pageFlowContent")}
          hint={phase === "content" ? t("meta.pageFlowContentHint") : undefined}
        />
      </ol>

      {phase === "load" && (
        <div className="pa-card pa-meta-page-phase">
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
          <button
            type="button"
            className="pa-link"
            style={{ marginTop: 10, alignSelf: "flex-start" }}
            onClick={() => onManualOnlyChange(true)}
          >
            {t("meta.pageFlowManual")}
          </button>
        </div>
      )}

      {phase === "select" && staticPages && (
        <div className="pa-card pa-meta-page-phase">
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
          {!manualOnly && selectedPage && (
            <p className="pa-section-helper" style={{ margin: "0 0 8px" }}>
              {t("meta.pageFlowSelectedPage", {
                title: selectedPage.title,
                path: selectedPage.rawPath,
              })}
            </p>
          )}
          {manualOnly && (
            <div className="pa-button-row" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="pa-link"
                onClick={() => onManualOnlyChange(false)}
              >
                {t("meta.pageFlowBackToPick")}
              </button>
            </div>
          )}

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
        </>
      )}
    </section>
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
    <li data-done={done ? true : undefined} data-active={active ? true : undefined}>
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
    </li>
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
      {showResult && isSame && (
        <div
          className="pa-ai-panel pa-ai-panel-same"
          style={{ marginTop: 6 }}
          data-tone="info"
        >
          <p className="pa-section-helper" style={{ margin: 0 }}>
            <span className="pa-pill" data-tone="info">
              {t("meta.suggestSameBadge")}
            </span>
          </p>
          <p className="pa-section-helper" style={{ margin: "8px 0 0" }}>
            {t("meta.suggestSameAsCurrent", { value: suggestion!.text })}
          </p>
          <div className="pa-button-row" style={{ marginTop: 8 }}>
            <button type="button" onClick={onDismissSuggestion}>
              {t("meta.suggestSameDismiss")}
            </button>
            <button
              type="button"
              onClick={() => onSuggestField(field, { ignoreDraft: true })}
              disabled={busy}
            >
              {t("meta.suggestRetryFresh")}
            </button>
          </div>
        </div>
      )}
      {showResult && !isSame && (
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
          <pre className="pa-code" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
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
  )
}
