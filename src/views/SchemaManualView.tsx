import { framer } from "framer-plugin"
import { useEffect, useMemo, useState } from "react"

import { HelpIcon } from "../components/HelpIcon"
import { TopBar } from "../components/TopBar"
import { useFormDraft } from "../hooks/useFormDraft"
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut"
import { useLocales } from "../hooks/useLocales"
import { useI18n, type TranslationKey } from "../i18n"
import { injectIntoHeadEnd, wrapJsonLdBlocks } from "../lib/framer/customCode"
import { toSchemaLanguage } from "../lib/framer/locales"
import {
  buildSchema,
  localizeSchemaInput,
  SCHEMA_KINDS,
  serializeJsonLd,
  type FaqPageInput,
  type SchemaInput,
  type SchemaKind,
} from "../lib/schema"
import { StorageKeys } from "../lib/storage"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onSwitchToAudit: () => void
}

/**
 * Persisted draft shape: one input per schema kind plus the last-active kind.
 * Per-kind storage is deliberate — switching schema types should preserve
 * what the user has filled in for the *other* type, not wipe it.
 */
interface SchemaDraft {
  kind: SchemaKind
  inputs: Partial<Record<SchemaKind, SchemaInput>>
}

const FALLBACK_KIND: SchemaKind = "FAQPage"

function makeInitialDraft(): SchemaDraft {
  return { kind: FALLBACK_KIND, inputs: {} }
}

function urlIsSuspicious(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol !== "https:" && parsed.protocol !== "http:"
  } catch {
    return true
  }
}

/**
 * Manual-mode schema builder: pick a kind, fill the form, install one block
 * per locale. This is the "v0" behaviour preserved for power users who want
 * surgical control or edge-case schema kinds the AI auditor doesn't propose.
 */
export function SchemaManualView({
  onBack,
  onOpenSettings,
  onSwitchToAudit,
}: Props) {
  const { t } = useI18n()
  const { locales } = useLocales()

  const draft = useFormDraft<SchemaDraft>({
    storageKey: StorageKeys.DraftSchema,
    initialValue: makeInitialDraft,
  })

  const currentInput =
    draft.value.inputs[draft.value.kind] ??
    defaultInputFor(draft.value.kind)
  const kind = draft.value.kind

  const [selectedLocaleIds, setSelectedLocaleIds] = useState<Set<string>>(
    new Set(),
  )
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    setSelectedLocaleIds((prev) => {
      if (prev.size === 0) return new Set(locales.map((l) => l.id))
      const localeIds = new Set(locales.map((l) => l.id))
      const next = new Set<string>()
      for (const id of prev) {
        if (localeIds.has(id)) next.add(id)
      }
      return next
    })
  }, [locales])

  const localesToUse = useMemo(
    () => locales.filter((l) => selectedLocaleIds.has(l.id)),
    [locales, selectedLocaleIds],
  )

  const allSelected =
    locales.length > 0 && selectedLocaleIds.size === locales.length

  const previews = useMemo(() => {
    return localesToUse.map((locale) => {
      const language = toSchemaLanguage(locale.code)
      const localized = localizeSchemaInput(
        currentInput,
        language,
        currentInput.canonicalUrl,
      )
      return { locale, language, json: serializeJsonLd(buildSchema(localized)) }
    })
  }, [localesToUse, currentInput])

  const toggleLocale = (id: string) => {
    setSelectedLocaleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedLocaleIds(
      allSelected ? new Set() : new Set(locales.map((l) => l.id)),
    )
  }

  const handleKindChange = (next: SchemaKind) => {
    draft.setValue((prev) => ({
      ...prev,
      kind: next,
      inputs: {
        ...prev.inputs,
        [next]: prev.inputs[next] ?? defaultInputFor(next),
      },
    }))
  }

  const handleInputChange = (next: SchemaInput) => {
    draft.setValue((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [prev.kind]: next },
    }))
  }

  const handleInstall = async () => {
    if (previews.length === 0) {
      framer.notify(t("schema.selectLocaleWarning"), { variant: "warning" })
      return
    }
    setInstalling(true)
    try {
      const html = wrapJsonLdBlocks(
        previews.map((p) => ({ language: p.language, jsonLd: p.json })),
      )
      const { preservedUserBytes } = await injectIntoHeadEnd(html)
      const message =
        preservedUserBytes > 0
          ? t("schema.installSuccessWithPreserved", {
              n: previews.length,
              bytes: preservedUserBytes,
            })
          : t("schema.installSuccess", { n: previews.length })
      framer.notify(message, { variant: "success" })
    } catch (e) {
      framer.notify(t("schema.installFailed", { error: (e as Error).message }), {
        variant: "error",
      })
    } finally {
      setInstalling(false)
    }
  }

  useKeyboardShortcut("Enter", () => void handleInstall(), {
    ctrlOrMeta: true,
    allowInForm: true,
  })

  const installLabel =
    previews.length === 1
      ? t("schema.installButton", { n: 1 })
      : t("schema.installButtonPlural", { n: previews.length })

  const localeToggleLabel = allSelected
    ? t("schema.localesClear", { n: selectedLocaleIds.size })
    : selectedLocaleIds.size === 0
      ? t("schema.localesSelectAll", { n: locales.length })
      : t("schema.localesPartial", {
          n: selectedLocaleIds.size,
          total: locales.length,
        })

  return (
    <>
      <TopBar
        title={t("schema.manual.title")}
        onBack={onBack}
        onOpenSettings={onOpenSettings}
      />
      <div className="pa-scroll">
        <section className="pa-section">
          <div className="pa-card pa-card--inset">
            <p className="pa-section-helper">{t("schema.manual.helper")}</p>
            <button
              type="button"
              className="pa-link"
              onClick={onSwitchToAudit}
            >
              ← {t("schema.manual.backToAudit")}
            </button>
          </div>
        </section>

        <section className="pa-section">
          <span className="pa-section-title">
            {t("schema.schemaTypeTitle")}
          </span>
          <div className="pa-chip-grid">
            {SCHEMA_KINDS.map((s) => (
              <button
                key={s}
                type="button"
                className="pa-chip"
                data-selected={kind === s}
                onClick={() => handleKindChange(s)}
              >
                <span className="pa-chip-title">
                  {t(`schema.kinds.${s}` as TranslationKey)}
                </span>
                <span className="pa-chip-desc">
                  {t(`schema.kinds.${s}Helper` as TranslationKey)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="pa-section">
          <span className="pa-section-title">
            {t("schema.sourceContentTitle")}
            <HelpIcon termId="canonicalUrl" />
          </span>
          <SchemaForm input={currentInput} onChange={handleInputChange} />
        </section>

        <section className="pa-section">
          <div className="pa-row-spread">
            <span className="pa-section-title">
              {t("schema.localesTitle")}
              <HelpIcon termId="inLanguage" />
            </span>
            {locales.length > 0 && (
              <button
                type="button"
                className="pa-pill-button"
                data-tone={allSelected ? "accent" : undefined}
                onClick={toggleAll}
                aria-label={localeToggleLabel}
              >
                {localeToggleLabel}
              </button>
            )}
          </div>
          {locales.length > 0 ? (
            <div className="pa-locale-grid">
              {locales.map((l) => {
                const checked = selectedLocaleIds.has(l.id)
                return (
                  <div
                    key={l.id}
                    className="pa-locale-cell"
                    data-checked={checked}
                    onClick={() => toggleLocale(l.id)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault()
                        toggleLocale(l.id)
                      }
                    }}
                    role="checkbox"
                    aria-checked={checked}
                    tabIndex={0}
                  >
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
                    <span className="pa-pill">{l.code}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="pa-section-helper">{t("dashboard.localesEmpty")}</p>
          )}
        </section>

        <section className="pa-section">
          <div className="pa-row-spread">
            <span className="pa-section-title">{t("schema.previewTitle")}</span>
            <span className="pa-pill">{previews.length}</span>
          </div>
          {previews.length > 1 && (
            <p className="pa-section-helper">
              {t("schema.previewMultilingualHelper")}
            </p>
          )}
          {previews.length === 0 && (
            <p className="pa-section-helper">{t("schema.previewEmpty")}</p>
          )}
          {previews.map((p) => (
            <div key={p.locale.id} className="pa-card">
              <div className="pa-row-spread">
                <span
                  className="pa-locale-cell-name"
                  style={{ fontWeight: 600 }}
                >
                  {p.locale.name}
                  {p.locale.isDefault && (
                    <span
                      className="pa-default-badge"
                      style={{ marginLeft: 6 }}
                    >
                      {t("common.default")}
                    </span>
                  )}
                </span>
                <span className="pa-pill" data-tone="accent">
                  {p.language}
                </span>
              </div>
              <pre className="pa-code">{p.json}</pre>
            </div>
          ))}
        </section>
      </div>

      <div className="pa-footer">
        <button
          type="button"
          className="pa-button-primary"
          onClick={handleInstall}
          disabled={installing || previews.length === 0}
        >
          {installing ? t("common.installing") : installLabel}
        </button>
      </div>
    </>
  )
}

function defaultInputFor(kind: SchemaKind): SchemaInput {
  const common = {
    canonicalUrl: "https://example.com/page",
    language: "en-US",
  }
  switch (kind) {
    case "Article":
      return {
        kind,
        ...common,
        headline: "How to do X with Framer",
        description: "A practical guide to X with Framer.",
        authorName: "Jane Designer",
        publisherName: "Example Studio",
        datePublished: new Date().toISOString().slice(0, 10),
      }
    case "Product":
      return {
        kind,
        ...common,
        name: "Premium Plan",
        description: "Everything you need to launch globally.",
        priceCurrency: "USD",
        price: 29,
        availability: "InStock",
      }
    case "LocalBusiness":
      return {
        kind,
        ...common,
        name: "Example Studio",
        addressLocality: "San Francisco",
        addressRegion: "CA",
        addressCountry: "US",
      }
    case "FAQPage":
      return {
        kind,
        ...common,
        questions: [
          {
            question: "Does Polyglot AEO replace my existing SEO plugin?",
            answer:
              "No. It complements them. Generic SEO plugins handle the default locale; Polyglot AEO multiplies that work across every locale you have in Framer.",
          },
          {
            question: "Will my schema show up in ChatGPT and Perplexity?",
            answer:
              "Yes. AI search engines crawl JSON-LD just like Google. Per-locale schema increases the odds your localized pages get cited when users ask in that language.",
          },
        ],
      } satisfies FaqPageInput
    case "Organization":
      return {
        kind,
        ...common,
        name: "Example Studio",
        url: "https://example.com",
        logo: "https://example.com/logo.png",
      }
  }
}

function SchemaForm({
  input,
  onChange,
}: {
  input: SchemaInput
  onChange: (input: SchemaInput) => void
}) {
  const { t } = useI18n()
  const urlWarn = urlIsSuspicious(input.canonicalUrl)

  switch (input.kind) {
    case "Article":
      return (
        <div className="pa-card">
          <Field
            label={t("schema.fields.canonicalUrl")}
            value={input.canonicalUrl}
            onChange={(v) => onChange({ ...input, canonicalUrl: v })}
            warning={urlWarn}
          />
          <Field
            label={t("schema.fields.headline")}
            value={input.headline}
            onChange={(v) => onChange({ ...input, headline: v })}
          />
          <Field
            label={t("schema.fields.description")}
            value={input.description ?? ""}
            onChange={(v) => onChange({ ...input, description: v })}
            multiline
          />
          <div className="pa-label-row">
            <Field
              label={t("schema.fields.author")}
              value={input.authorName}
              onChange={(v) => onChange({ ...input, authorName: v })}
            />
            <Field
              label={t("schema.fields.publisher")}
              value={input.publisherName}
              onChange={(v) => onChange({ ...input, publisherName: v })}
            />
          </div>
          <Field
            label={t("schema.fields.datePublished")}
            value={input.datePublished}
            onChange={(v) => onChange({ ...input, datePublished: v })}
          />
        </div>
      )
    case "Product":
      return (
        <div className="pa-card">
          <Field
            label={t("schema.fields.canonicalUrl")}
            value={input.canonicalUrl}
            onChange={(v) => onChange({ ...input, canonicalUrl: v })}
            warning={urlWarn}
          />
          <Field
            label={t("schema.fields.name")}
            value={input.name}
            onChange={(v) => onChange({ ...input, name: v })}
          />
          <Field
            label={t("schema.fields.description")}
            value={input.description ?? ""}
            onChange={(v) => onChange({ ...input, description: v })}
            multiline
          />
          <div className="pa-label-row">
            <Field
              label={t("schema.fields.price")}
              value={input.price?.toString() ?? ""}
              onChange={(v) =>
                onChange({ ...input, price: v ? Number(v) : undefined })
              }
            />
            <Field
              label={t("schema.fields.currency")}
              value={input.priceCurrency ?? ""}
              onChange={(v) => onChange({ ...input, priceCurrency: v })}
            />
          </div>
        </div>
      )
    case "LocalBusiness":
      return (
        <div className="pa-card">
          <Field
            label={t("schema.fields.canonicalUrl")}
            value={input.canonicalUrl}
            onChange={(v) => onChange({ ...input, canonicalUrl: v })}
            warning={urlWarn}
          />
          <Field
            label={t("schema.fields.businessName")}
            value={input.name}
            onChange={(v) => onChange({ ...input, name: v })}
          />
          <Field
            label={t("schema.fields.streetAddress")}
            value={input.streetAddress ?? ""}
            onChange={(v) => onChange({ ...input, streetAddress: v })}
          />
          <div className="pa-label-row">
            <Field
              label={t("schema.fields.city")}
              value={input.addressLocality ?? ""}
              onChange={(v) => onChange({ ...input, addressLocality: v })}
            />
            <Field
              label={t("schema.fields.countryIso")}
              value={input.addressCountry ?? ""}
              onChange={(v) => onChange({ ...input, addressCountry: v })}
            />
          </div>
        </div>
      )
    case "FAQPage":
      return (
        <div className="pa-card">
          <Field
            label={t("schema.fields.canonicalUrl")}
            value={input.canonicalUrl}
            onChange={(v) => onChange({ ...input, canonicalUrl: v })}
            warning={urlWarn}
          />
          {input.questions.map((q, i) => (
            <div
              key={i}
              className="pa-card pa-card--inset"
              style={{ gap: 8, padding: 10 }}
            >
              <Field
                label={t("schema.fields.question", { n: i + 1 })}
                value={q.question}
                onChange={(v) => {
                  const next = [...input.questions]
                  next[i] = { ...next[i], question: v }
                  onChange({ ...input, questions: next })
                }}
              />
              <Field
                label={t("schema.fields.answer")}
                value={q.answer}
                onChange={(v) => {
                  const next = [...input.questions]
                  next[i] = { ...next[i], answer: v }
                  onChange({ ...input, questions: next })
                }}
                multiline
              />
              <button
                type="button"
                className="pa-button-danger"
                onClick={() => {
                  onChange({
                    ...input,
                    questions: input.questions.filter((_, idx) => idx !== i),
                  })
                }}
              >
                {t("schema.fields.removeQuestion")}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...input,
                questions: [
                  ...input.questions,
                  { question: "", answer: "" },
                ],
              })
            }
          >
            {t("schema.fields.addQuestion")}
          </button>
        </div>
      )
    case "Organization":
      return (
        <div className="pa-card">
          <Field
            label={t("schema.fields.canonicalUrl")}
            value={input.canonicalUrl}
            onChange={(v) => onChange({ ...input, canonicalUrl: v })}
            warning={urlWarn}
          />
          <Field
            label={t("schema.fields.name")}
            value={input.name}
            onChange={(v) => onChange({ ...input, name: v })}
          />
          <Field
            label={t("schema.fields.siteUrl")}
            value={input.url}
            onChange={(v) => onChange({ ...input, url: v })}
          />
          <Field
            label={t("schema.fields.logoUrl")}
            value={input.logo ?? ""}
            onChange={(v) => onChange({ ...input, logo: v })}
          />
        </div>
      )
  }
}

function Field({
  label,
  value,
  onChange,
  multiline,
  warning,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  warning?: boolean
}) {
  return (
    <label className="pa-label">
      {label}
      {multiline ? (
        <textarea
          className="pa-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          className="pa-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={warning ? "true" : undefined}
          style={
            warning
              ? { borderColor: "var(--framer-color-tint, #ffa500)" }
              : undefined
          }
        />
      )}
    </label>
  )
}
