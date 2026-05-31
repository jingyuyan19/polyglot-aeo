import { useState } from "react"

import { useI18n, type TranslationKey } from "../i18n"
import {
  addFaqQuestion,
  cloneInputs,
  removeFaqQuestion,
  updateFaqQuestion,
} from "../lib/schema/proposal-edit"
import type {
  ArticleInput,
  FaqPageInput,
  LocalBusinessInput,
  OrganizationInput,
  ProductInput,
  SchemaInput,
} from "../lib/schema/types"

interface Props {
  /** The current inputs. We deep-clone before editing so a Cancel returns to this. */
  initial: SchemaInput
  /** Original AI suggestion — used for the "Reset to AI suggestion" button. */
  original: SchemaInput
  onSave: (next: SchemaInput) => void
  onCancel: () => void
}

/**
 * Inline editor for a single proposal's structured fields.
 *
 * Designed for the audit list — sits inside an expanded ProposalCard, NOT
 * a modal. We render a kind-specific subset of fields rather than a giant
 * dump of every property: pragmatically, the fields that matter for SEO
 * (headline, description, brand, telephone, …) are usually the only ones
 * the designer needs to fix when AI gets something wrong.
 *
 * If a designer needs to edit fields not surfaced here (e.g. obscure
 * Article fields like `dateModified`), they can switch to manual mode,
 * which renders the full per-kind form.
 */
export function ProposalEditor({ initial, original, onSave, onCancel }: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<SchemaInput>(() => cloneInputs(initial))

  const handleReset = () => setDraft(cloneInputs(original))

  return (
    <div className="pa-editor">
      <p className="pa-section-helper">
        {t("schema.audit.editorHelper", { kind: draft.kind })}
      </p>
      {renderFieldsForKind(draft, setDraft, t)}
      <div className="pa-row" style={{ gap: 6 }}>
        <button
          type="button"
          className="pa-button-primary"
          onClick={() => onSave(draft)}
          style={{ width: "auto", padding: "0 12px" }}
        >
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ width: "auto", padding: "0 12px" }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="pa-link"
          onClick={handleReset}
          style={{
            width: "auto",
            marginLeft: "auto",
            padding: 0,
            background: "transparent",
          }}
        >
          {t("schema.audit.editorReset")}
        </button>
      </div>
    </div>
  )
}

type T = <K extends TranslationKey>(
  key: K,
  vars?: Record<string, string | number>,
) => string

function renderFieldsForKind(
  draft: SchemaInput,
  set: (next: SchemaInput) => void,
  t: T,
): React.ReactNode {
  switch (draft.kind) {
    case "Article":
      return <ArticleFields draft={draft} set={set} t={t} />
    case "Product":
      return <ProductFields draft={draft} set={set} t={t} />
    case "LocalBusiness":
      return <LocalBusinessFields draft={draft} set={set} t={t} />
    case "FAQPage":
      return <FaqPageFields draft={draft} set={set} t={t} />
    case "Organization":
      return <OrganizationFields draft={draft} set={set} t={t} />
  }
}

// ────────────────────────────────────────────────────────────────────
// Per-kind field renderers. Each takes the draft (already typed
// narrowly) and a setter that replaces the entire draft.
// ────────────────────────────────────────────────────────────────────

function ArticleFields({
  draft,
  set,
  t,
}: {
  draft: ArticleInput
  set: (next: SchemaInput) => void
  t: T
}) {
  const upd = (patch: Partial<ArticleInput>) => set({ ...draft, ...patch })
  return (
    <>
      <Text label={t("schema.fields.headline")} value={draft.headline} onChange={(v) => upd({ headline: v })} />
      <TextArea label={t("schema.fields.description")} value={draft.description ?? ""} onChange={(v) => upd({ description: v || undefined })} />
      <Text label={t("schema.fields.image")} value={draft.image ?? ""} onChange={(v) => upd({ image: v || undefined })} />
      <Text label={t("schema.fields.author")} value={draft.authorName} onChange={(v) => upd({ authorName: v })} />
      <Text label={t("schema.fields.publisher")} value={draft.publisherName} onChange={(v) => upd({ publisherName: v })} />
      <Text label={t("schema.fields.datePublished")} value={draft.datePublished} onChange={(v) => upd({ datePublished: v })} placeholder="YYYY-MM-DD" />
    </>
  )
}

function ProductFields({
  draft,
  set,
  t,
}: {
  draft: ProductInput
  set: (next: SchemaInput) => void
  t: T
}) {
  const upd = (patch: Partial<ProductInput>) => set({ ...draft, ...patch })
  return (
    <>
      <Text label={t("schema.fields.name")} value={draft.name} onChange={(v) => upd({ name: v })} />
      <TextArea label={t("schema.fields.description")} value={draft.description ?? ""} onChange={(v) => upd({ description: v || undefined })} />
      <Text label={t("schema.fields.brand")} value={draft.brand ?? ""} onChange={(v) => upd({ brand: v || undefined })} />
      <Text label={t("schema.fields.image")} value={draft.image ?? ""} onChange={(v) => upd({ image: v || undefined })} />
      <Text label={t("schema.fields.sku")} value={draft.sku ?? ""} onChange={(v) => upd({ sku: v || undefined })} />
      <NumberField label={t("schema.fields.price")} value={draft.price} onChange={(v) => upd({ price: v })} />
      <Text label={t("schema.fields.currency")} value={draft.priceCurrency ?? ""} onChange={(v) => upd({ priceCurrency: v || undefined })} placeholder="USD" />
    </>
  )
}

function LocalBusinessFields({
  draft,
  set,
  t,
}: {
  draft: LocalBusinessInput
  set: (next: SchemaInput) => void
  t: T
}) {
  const upd = (patch: Partial<LocalBusinessInput>) => set({ ...draft, ...patch })
  return (
    <>
      <Text label={t("schema.fields.businessName")} value={draft.name} onChange={(v) => upd({ name: v })} />
      <TextArea label={t("schema.fields.description")} value={draft.description ?? ""} onChange={(v) => upd({ description: v || undefined })} />
      <Text label={t("schema.fields.telephone")} value={draft.telephone ?? ""} onChange={(v) => upd({ telephone: v || undefined })} />
      <Text label={t("schema.fields.streetAddress")} value={draft.streetAddress ?? ""} onChange={(v) => upd({ streetAddress: v || undefined })} />
      <Text label={t("schema.fields.city")} value={draft.addressLocality ?? ""} onChange={(v) => upd({ addressLocality: v || undefined })} />
      <Text label={t("schema.fields.countryIso")} value={draft.addressCountry ?? ""} onChange={(v) => upd({ addressCountry: v || undefined })} placeholder="US" />
    </>
  )
}

function FaqPageFields({
  draft,
  set,
  t,
}: {
  draft: FaqPageInput
  set: (next: SchemaInput) => void
  t: T
}) {
  const upd = (questions: FaqPageInput["questions"]) =>
    set({ ...draft, questions })

  const addQuestion = () => upd(addFaqQuestion(draft.questions))

  const removeQuestion = (idx: number) =>
    upd(removeFaqQuestion(draft.questions, idx))

  const updateQuestion = (
    idx: number,
    patch: Partial<{ question: string; answer: string }>,
  ) => upd(updateFaqQuestion(draft.questions, idx, patch))

  return (
    <>
      {draft.questions.map((q, i) => (
        <div key={i} className="pa-editor-faq-row">
          <div className="pa-row-spread">
            <span className="pa-stack-label">
              {t("schema.fields.question", { n: i + 1 })}
            </span>
            <button
              type="button"
              className="pa-pill-button"
              onClick={() => removeQuestion(i)}
              disabled={draft.questions.length <= 1}
            >
              {t("schema.audit.editorRemoveRow")}
            </button>
          </div>
          <Text
            label=""
            value={q.question}
            onChange={(v) => updateQuestion(i, { question: v })}
          />
          <TextArea
            label=""
            value={q.answer}
            onChange={(v) => updateQuestion(i, { answer: v })}
          />
        </div>
      ))}
      <button
        type="button"
        className="pa-pill-button"
        onClick={addQuestion}
      >
        + {t("schema.audit.editorAddRow")}
      </button>
    </>
  )
}

function OrganizationFields({
  draft,
  set,
  t,
}: {
  draft: OrganizationInput
  set: (next: SchemaInput) => void
  t: T
}) {
  const upd = (patch: Partial<OrganizationInput>) => set({ ...draft, ...patch })
  const sameAsCsv = (draft.sameAs ?? []).join(", ")
  return (
    <>
      <Text label={t("schema.fields.name")} value={draft.name} onChange={(v) => upd({ name: v })} />
      <Text label={t("schema.fields.siteUrl")} value={draft.url} onChange={(v) => upd({ url: v })} />
      <TextArea label={t("schema.fields.description")} value={draft.description ?? ""} onChange={(v) => upd({ description: v || undefined })} />
      <Text label={t("schema.fields.logoUrl")} value={draft.logo ?? ""} onChange={(v) => upd({ logo: v || undefined })} />
      <Text
        label={t("schema.fields.sameAs")}
        value={sameAsCsv}
        onChange={(v) =>
          upd({
            sameAs: v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        placeholder="https://twitter.com/x, https://github.com/x"
      />
    </>
  )
}

// ────────────────────────────────────────────────────────────────────
// Atomic input primitives — share a single label+input layout so
// every field gets consistent vertical rhythm and CJK label wrapping.
// ────────────────────────────────────────────────────────────────────

function Text({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="pa-label">
      {label && <span className="pa-stack-label">{label}</span>}
      <input
        className="pa-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="pa-label">
      {label && <span className="pa-stack-label">{label}</span>}
      <textarea
        className="pa-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <label className="pa-label">
      <span className="pa-stack-label">{label}</span>
      <input
        className="pa-input"
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value
          onChange(raw === "" ? undefined : Number(raw))
        }}
      />
    </label>
  )
}
