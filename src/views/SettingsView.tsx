import { framer } from "framer-plugin"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ConfirmDialog } from "../components/ConfirmDialog"
import { HelpIcon } from "../components/HelpIcon"
import { TopBar } from "../components/TopBar"
import {
  AUTO_LOCALE,
  LOCALE_METADATA,
  useI18n,
  type LocalePreference,
  type SupportedLocale,
} from "../i18n"
import {
  callAi,
  readCustomProviders,
  readProviderKey,
  writeCustomProviders,
  writeProviderKey,
} from "../lib/ai/client"
import {
  BUILTIN_PROVIDERS,
  generateCustomProviderId,
  materializeCustomProvider,
  type CustomProviderConfig,
  type ProviderId,
} from "../lib/ai/providers"
import { clearAllInjected, readInstalledStatus } from "../lib/framer/customCode"
import { readString, StorageKeys, writeString } from "../lib/storage"
import { LicenseSettingsSection } from "./LicenseSettingsSection"

interface Props {
  onBack: () => void
}

interface CustomProviderDraft {
  name: string
  baseUrl: string
  modelIds: string
}

const EMPTY_DRAFT: CustomProviderDraft = { name: "", baseUrl: "", modelIds: "" }

type TestStatus =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok" }
  | { kind: "error"; message: string }

type AutosaveStatus = "loading" | "saved" | "dirty" | "saving" | "error"

function settingsSignature(
  keys: Record<string, string>,
  brandVoice: string,
  providerIds: readonly ProviderId[],
): string {
  return JSON.stringify({
    brandVoice: brandVoice.trim() || null,
    keys: providerIds.map((id) => [id, keys[id]?.trim() || null]),
  })
}

export function SettingsView({ onBack }: Props) {
  const { t, preference, detected, setPreference } = useI18n()

  // One slot per provider id, holding the in-progress (unsaved) key value.
  // We track everything in a single Map so adding a new built-in provider
  // doesn't require a new state variable.
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [testStatus, setTestStatus] = useState<
    Record<string, TestStatus>
  >({})
  const [customProviders, setCustomProviders] = useState<CustomProviderConfig[]>([])
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customDraft, setCustomDraft] = useState<CustomProviderDraft>(EMPTY_DRAFT)
  const [confirmRemoveCustomId, setConfirmRemoveCustomId] = useState<string | null>(null)
  /**
   * Set of provider ids that had a non-empty stored key at mount time.
   * We snapshot this ONCE so the Active vs Available grouping stays
   * stable as users type — they shouldn't see cards rearrange while
   * they're filling in a new key.
   */
  const [activeProviderIds, setActiveProviderIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [showAvailable, setShowAvailable] = useState(false)

  const [brandVoice, setBrandVoice] = useState("")
  const [installed, setInstalled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autosaveStatus, setAutosaveStatus] =
    useState<AutosaveStatus>("loading")
  const [confirmRemoveSchemaOpen, setConfirmRemoveSchemaOpen] = useState(false)
  const [confirmDiscardCustomOpen, setConfirmDiscardCustomOpen] =
    useState(false)

  const providerIds = useMemo<ProviderId[]>(
    () => [
      ...BUILTIN_PROVIDERS.map((p) => p.id),
      ...customProviders.map((c) => c.id),
    ],
    [customProviders],
  )

  const loadedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSignatureRef = useRef("")
  const latestSettingsRef = useRef<{
    keys: Record<string, string>
    brandVoice: string
    providerIds: ProviderId[]
  }>({ keys: {}, brandVoice: "", providerIds: [] })

  useEffect(() => {
    latestSettingsRef.current = { keys, brandVoice, providerIds }
  }, [keys, brandVoice, providerIds])

  const saveSettingsNow = useCallback(
    async (options: {
      notifySuccess?: boolean
      notifyError?: boolean
    } = {}): Promise<boolean> => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      const snapshot = latestSettingsRef.current
      const signature = settingsSignature(
        snapshot.keys,
        snapshot.brandVoice,
        snapshot.providerIds,
      )
      if (signature === lastSavedSignatureRef.current) {
        setAutosaveStatus("saved")
        if (options.notifySuccess) {
          framer.notify(t("settings.saveSuccess"), { variant: "success" })
        }
        return true
      }

      setAutosaveStatus("saving")
      try {
        const results = await Promise.all([
          ...snapshot.providerIds.map((id) =>
            writeProviderKey(
              id,
              snapshot.keys[id]?.trim() ? snapshot.keys[id].trim() : null,
            ),
          ),
          writeString(
            StorageKeys.BrandVoice,
            snapshot.brandVoice.trim() || null,
          ),
        ])
        const ok = results.every(Boolean)
        if (!ok) {
          setAutosaveStatus("error")
          if (options.notifyError) {
            framer.notify(t("settings.autoSaveError"), { variant: "error" })
          }
          return false
        }

        lastSavedSignatureRef.current = signature
        setAutosaveStatus("saved")
        if (options.notifySuccess) {
          framer.notify(t("settings.saveSuccess"), { variant: "success" })
        }
        return true
      } catch (err) {
        setAutosaveStatus("error")
        if (options.notifyError) {
          framer.notify(
            `${t("settings.autoSaveError")} ${(err as Error).message}`,
            { variant: "error" },
          )
        }
        return false
      }
    },
    [t],
  )

  useEffect(() => {
    void (async () => {
      const customs = await readCustomProviders()
      setCustomProviders(customs)

      const allIds: ProviderId[] = [
        ...BUILTIN_PROVIDERS.map((p) => p.id),
        ...customs.map((c) => c.id),
      ]
      const entries = await Promise.all(
        allIds.map(async (id) => [id, (await readProviderKey(id)) ?? ""] as const),
      )
      const loadedKeys = Object.fromEntries(entries)
      setKeys(loadedKeys)
      // Snapshot which providers had keys at load time. This drives the
      // Active/Available split for the duration of this Settings open.
      // Custom providers are always Active — adding one is an explicit
      // act and the user expects to see it.
      const active = new Set<string>(customs.map((c) => c.id))
      for (const [id, key] of entries) {
        if (key) active.add(id)
      }
      setActiveProviderIds(active)

      const [voice, status] = await Promise.all([
        readString(StorageKeys.BrandVoice),
        readInstalledStatus(),
      ])
      const loadedBrandVoice = voice ?? ""
      setBrandVoice(loadedBrandVoice)
      setInstalled(status.installed)
      lastSavedSignatureRef.current = settingsSignature(
        loadedKeys,
        loadedBrandVoice,
        allIds,
      )
      latestSettingsRef.current = {
        keys: loadedKeys,
        brandVoice: loadedBrandVoice,
        providerIds: allIds,
      }
      loadedRef.current = true
      setAutosaveStatus("saved")
    })()
  }, [])

  useEffect(() => {
    if (!loadedRef.current) return
    const signature = settingsSignature(keys, brandVoice, providerIds)
    if (signature === lastSavedSignatureRef.current) {
      setAutosaveStatus("saved")
      return
    }

    setAutosaveStatus("dirty")
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void saveSettingsNow()
    }, 700)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [keys, brandVoice, providerIds, saveSettingsNow])

  const save = async () => {
    setSaving(true)
    try {
      await saveSettingsNow({ notifySuccess: true, notifyError: true })
    } finally {
      setSaving(false)
    }
  }

  const customProviderDraftDirty =
    showAddCustom &&
    Boolean(
      customDraft.name.trim() ||
        customDraft.baseUrl.trim() ||
        customDraft.modelIds.trim(),
    )

  const handleBack = async () => {
    if (customProviderDraftDirty) {
      setConfirmDiscardCustomOpen(true)
      return
    }
    const saved = await saveSettingsNow({ notifyError: true })
    if (saved) onBack()
  }

  const discardCustomDraftAndBack = async () => {
    setConfirmDiscardCustomOpen(false)
    setCustomDraft(EMPTY_DRAFT)
    setShowAddCustom(false)
    const saved = await saveSettingsNow({ notifyError: true })
    if (saved) onBack()
  }

  const performRemoveSchema = async () => {
    setConfirmRemoveSchemaOpen(false)
    try {
      const { preservedUserBytes } = await clearAllInjected()
      setInstalled(false)
      framer.notify(
        preservedUserBytes > 0
          ? t("settings.removeSuccessWithPreserved", { bytes: preservedUserBytes })
          : t("settings.removeSuccess"),
        { variant: "success" },
      )
    } catch (err) {
      // Most likely cause: CustomCodePermissionError. The thrown
      // message is already user-actionable, so we surface it as-is
      // rather than swallowing into a generic toast.
      framer.notify((err as Error).message, { variant: "error" })
    }
  }

  const handleLanguageChange = async (next: LocalePreference) => {
    setPreference(next)
    await writeString(
      StorageKeys.UiLocalePreference,
      next === AUTO_LOCALE ? null : next,
    )
  }

  /**
   * Probe a provider with a tiny JSON prompt to verify the typed key
   * actually authenticates. We use the in-progress key from `keys[id]` —
   * the user shouldn't have to Save first, since the whole point is to
   * fail fast before they accept a bad key.
   *
   * The small token cap keeps cost negligible (< $0.0001 on every provider).
   * We deliberately run this off the main key — if a provider rejects our
   * tiny prompt for content-policy reasons we still get a provider response
   * with an actionable error.
   */
  const handleTestKey = async (providerId: ProviderId) => {
    const key = (keys[providerId] ?? "").trim()
    if (!key) {
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: { kind: "error", message: t("settings.testKeyEmpty") },
      }))
      return
    }

    setTestStatus((prev) => ({ ...prev, [providerId]: { kind: "testing" } }))

    const custom = customProviders.find((c) => c.id === providerId)
    const provider = custom ? materializeCustomProvider(custom) : undefined
    const builtin = BUILTIN_PROVIDERS.find((p) => p.id === providerId)
    const modelId = custom
      ? custom.modelIds.split(",")[0]?.trim() ?? ""
      : builtin?.models[0]?.id ?? ""

    try {
      await callAi({
        providerId,
        modelId,
        apiKey: key,
        prompt: {
          system:
            'Return only JSON for this connectivity test, exactly like {"ok":true}.',
          user: "Return a JSON object confirming the API key works.",
        },
        maxTokens: 16,
        customProvider: provider,
      })
      setTestStatus((prev) => ({ ...prev, [providerId]: { kind: "ok" } }))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("settings.testKeyFail")
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: { kind: "error", message },
      }))
    }
  }

  const resetQuickStart = async () => {
    await writeString(StorageKeys.OnboardingDismissed, null)
    framer.notify(t("settings.quickStartResetDone"), { variant: "success" })
  }

  const saveCustomProvider = async () => {
    const trimmedName = customDraft.name.trim()
    const trimmedBaseUrl = customDraft.baseUrl.trim()
    const modelIds = customDraft.modelIds
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
    if (!trimmedName || !trimmedBaseUrl || modelIds.length === 0) {
      framer.notify(t("settings.customProviderInvalid"), { variant: "warning" })
      return
    }
    const config: CustomProviderConfig = {
      id: generateCustomProviderId(),
      name: trimmedName,
      baseUrl: trimmedBaseUrl,
      modelIds: modelIds.join(", "),
    }
    const next = [...customProviders, config]
    await writeCustomProviders(next)
    setCustomProviders(next)
    setCustomDraft(EMPTY_DRAFT)
    setShowAddCustom(false)
    framer.notify(t("settings.customProviderSaved"), { variant: "success" })
  }

  const removeCustomProvider = async (id: string) => {
    const next = customProviders.filter((c) => c.id !== id)
    await writeCustomProviders(next)
    setCustomProviders(next)
    // Clear the persisted key for this provider so it doesn't linger.
    await writeProviderKey(id as ProviderId, null)
    setKeys((prev) => {
      const { [id]: _removed, ...rest } = prev
      void _removed
      return rest
    })
    setConfirmRemoveCustomId(null)
    framer.notify(t("settings.customProviderRemoved"), { variant: "success" })
  }

  return (
    <>
      <TopBar title={t("settings.title")} onBack={() => void handleBack()} />
      <div className="pa-scroll">
        <section className="pa-section">
          <span className="pa-section-title">{t("settings.languageTitle")}</span>
          <p className="pa-section-helper">{t("settings.languageHelper")}</p>
          <select
            className="pa-select"
            value={preference}
            onChange={(e) =>
              handleLanguageChange(e.target.value as LocalePreference)
            }
          >
            <option value={AUTO_LOCALE}>
              {t("settings.languageAuto", {
                detected: LOCALE_METADATA[detected].nativeName,
              })}
            </option>
            {(Object.keys(LOCALE_METADATA) as SupportedLocale[]).map((code) => (
              <option key={code} value={code}>
                {LOCALE_METADATA[code].nativeName} ·{" "}
                {LOCALE_METADATA[code].englishName}
              </option>
            ))}
          </select>
        </section>

        <LicenseSettingsSection />

        <section className="pa-section">
          <span className="pa-section-title">
            {t("settings.apiKeysTitle")}
            <HelpIcon termId="byok" />
          </span>
          <p className="pa-section-helper">{t("settings.apiKeysHelper")}</p>

          {/* Active providers — those with a saved key (or any custom
            * provider). Always expanded. If nothing is active yet, this
            * block doesn't render and we go straight to Available. */}
          {BUILTIN_PROVIDERS.filter((p) => activeProviderIds.has(p.id)).map(
            (p) => (
              <ProviderKeyRow
                key={p.id}
                providerId={p.id}
                providerName={p.name}
                providerDescription={p.description}
                consoleUrl={p.consoleUrl}
                value={keys[p.id] ?? ""}
                onChange={(v) => {
                  setKeys((prev) => ({ ...prev, [p.id]: v }))
                  setTestStatus((prev) => ({
                    ...prev,
                    [p.id]: { kind: "idle" },
                  }))
                }}
                revealed={reveal[p.id] ?? false}
                onToggleReveal={() =>
                  setReveal((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                }
                testStatus={testStatus[p.id] ?? { kind: "idle" }}
                onTest={() => handleTestKey(p.id)}
                onPersistNow={() =>
                  void saveSettingsNow({ notifyError: true })
                }
              />
            ),
          )}

          {customProviders.map((c) => (
            <ProviderKeyRow
              key={c.id}
              providerId={c.id}
              providerName={c.name}
              providerDescription={c.baseUrl}
              consoleUrl={c.baseUrl}
              value={keys[c.id] ?? ""}
              onChange={(v) => {
                setKeys((prev) => ({ ...prev, [c.id]: v }))
                setTestStatus((prev) => ({ ...prev, [c.id]: { kind: "idle" } }))
              }}
              revealed={reveal[c.id] ?? false}
              onToggleReveal={() =>
                setReveal((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
              }
              testStatus={testStatus[c.id] ?? { kind: "idle" }}
              onTest={() => handleTestKey(c.id as ProviderId)}
              onPersistNow={() => void saveSettingsNow({ notifyError: true })}
              onRemove={() => setConfirmRemoveCustomId(c.id)}
            />
          ))}

          {/* Available providers — collapsed by default. The toggle row
            * shows the count so users know how much they're hiding. */}
          {(() => {
            const available = BUILTIN_PROVIDERS.filter(
              (p) => !activeProviderIds.has(p.id),
            )
            if (available.length === 0) return null
            return (
              <>
                <button
                  type="button"
                  className="pa-disclosure"
                  onClick={() => setShowAvailable((v) => !v)}
                  aria-expanded={showAvailable}
                >
                  <span>
                    {showAvailable
                      ? t("settings.providersHide")
                      : t("settings.providersShowMore", {
                          n: available.length,
                        })}
                  </span>
                  <span aria-hidden>{showAvailable ? "▴" : "▾"}</span>
                </button>
                {showAvailable &&
                  available.map((p) => (
                    <ProviderKeyRow
                      key={p.id}
                      providerId={p.id}
                      providerName={p.name}
                      providerDescription={p.description}
                      consoleUrl={p.consoleUrl}
                      value={keys[p.id] ?? ""}
                      onChange={(v) => {
                        setKeys((prev) => ({ ...prev, [p.id]: v }))
                        setTestStatus((prev) => ({
                          ...prev,
                          [p.id]: { kind: "idle" },
                        }))
                      }}
                      revealed={reveal[p.id] ?? false}
                      onToggleReveal={() =>
                        setReveal((prev) => ({
                          ...prev,
                          [p.id]: !prev[p.id],
                        }))
                      }
                      testStatus={testStatus[p.id] ?? { kind: "idle" }}
                      onTest={() => handleTestKey(p.id)}
                      onPersistNow={() =>
                        void saveSettingsNow({ notifyError: true })
                      }
                    />
                  ))}
              </>
            )
          })()}

          {!showAddCustom && (
            <button
              type="button"
              onClick={() => setShowAddCustom(true)}
              style={{ width: "auto", alignSelf: "flex-start", padding: "0 12px" }}
            >
              {t("settings.addCustomProvider")}
            </button>
          )}

          {showAddCustom && (
            <div className="pa-card">
              <span className="pa-section-title">
                {t("settings.customProviderTitle")}
              </span>
              <p className="pa-section-helper">
                {t("settings.customProviderHelper")}
              </p>
              <label className="pa-label">
                {t("settings.customProviderName")}
                <input
                  className="pa-input"
                  type="text"
                  value={customDraft.name}
                  onChange={(e) =>
                    setCustomDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder={t("settings.customProviderNamePlaceholder")}
                />
              </label>
              <label className="pa-label">
                {t("settings.customProviderBaseUrl")}
                <input
                  className="pa-input"
                  type="url"
                  value={customDraft.baseUrl}
                  onChange={(e) =>
                    setCustomDraft((d) => ({ ...d, baseUrl: e.target.value }))
                  }
                  placeholder={t("settings.customProviderBaseUrlPlaceholder")}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="pa-label">
                {t("settings.customProviderModelIds")}
                <input
                  className="pa-input"
                  type="text"
                  value={customDraft.modelIds}
                  onChange={(e) =>
                    setCustomDraft((d) => ({ ...d, modelIds: e.target.value }))
                  }
                  placeholder={t("settings.customProviderModelIdsPlaceholder")}
                  spellCheck={false}
                />
              </label>
              <div className="pa-row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="pa-button-primary"
                  onClick={saveCustomProvider}
                  style={{ width: "auto", padding: "0 12px" }}
                >
                  {t("settings.customProviderSave")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCustom(false)
                    setCustomDraft(EMPTY_DRAFT)
                  }}
                  style={{ width: "auto", padding: "0 12px" }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="pa-section">
          <span className="pa-section-title">
            {t("settings.brandVoiceTitle")}
            <HelpIcon termId="brandVoice" />
          </span>
          <p className="pa-section-helper">{t("settings.brandVoiceHelper")}</p>
          <textarea
            className="pa-textarea"
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            onBlur={() => void saveSettingsNow({ notifyError: true })}
            rows={3}
            placeholder={t("settings.brandVoicePlaceholder")}
          />
        </section>

        <hr />

        <section className="pa-section">
          <span className="pa-section-title">
            {t("settings.quickStartResetTitle")}
          </span>
          <p className="pa-section-helper">
            {t("settings.quickStartResetHelper")}
          </p>
          <button
            type="button"
            onClick={resetQuickStart}
            style={{ width: "auto", alignSelf: "flex-start", padding: "0 12px" }}
          >
            {t("settings.quickStartResetButton")}
          </button>
        </section>

        <hr />

        <section className="pa-section">
          <span className="pa-section-title">
            {t("settings.installedTitle")}
            <HelpIcon termId="fenced" />
          </span>
          <div className="pa-row-spread">
            <span
              className="pa-pill"
              data-tone={installed ? "success" : undefined}
            >
              {installed
                ? t("settings.installedYes")
                : t("settings.installedNo")}
            </span>
            <button
              type="button"
              className="pa-button-danger"
              onClick={() => setConfirmRemoveSchemaOpen(true)}
              disabled={!installed}
              style={{ flex: "0 0 auto", width: "auto", padding: "0 12px" }}
            >
              {t("settings.removeAll")}
            </button>
          </div>
          <p className="pa-section-helper">{t("settings.removeAllHelper")}</p>
        </section>
      </div>

      <ConfirmDialog
        open={confirmRemoveSchemaOpen}
        message={t("common.confirmRemoveAll")}
        confirmLabel={t("settings.removeAll")}
        destructive
        onConfirm={performRemoveSchema}
        onCancel={() => setConfirmRemoveSchemaOpen(false)}
      />

      <ConfirmDialog
        open={confirmRemoveCustomId !== null}
        message={t("settings.customProviderRemoveConfirm")}
        confirmLabel={t("settings.customProviderRemove")}
        destructive
        onConfirm={() => {
          if (confirmRemoveCustomId) void removeCustomProvider(confirmRemoveCustomId)
        }}
        onCancel={() => setConfirmRemoveCustomId(null)}
      />

      <div className="pa-footer">
        <span
          className="pa-pill pa-footer-status"
          data-tone={
            autosaveStatus === "saved"
              ? "success"
              : autosaveStatus === "error" || autosaveStatus === "dirty"
                ? "warning"
                : "accent"
          }
        >
          {autosaveStatus === "loading"
            ? t("settings.autoSaveLoading")
            : autosaveStatus === "saving"
              ? t("settings.autoSaveSaving")
              : autosaveStatus === "dirty"
                ? t("settings.autoSaveUnsaved")
                : autosaveStatus === "error"
                  ? t("settings.autoSaveError")
                  : t("settings.autoSaveSaved")}
        </span>
        <button
          type="button"
          className="pa-button-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDiscardCustomOpen}
        message={t("settings.customProviderDiscardConfirm")}
        confirmLabel={t("settings.customProviderDiscard")}
        destructive
        onConfirm={() => void discardCustomDraftAndBack()}
        onCancel={() => setConfirmDiscardCustomOpen(false)}
      />
    </>
  )
}

function ProviderKeyRow({
  providerName,
  providerDescription,
  consoleUrl,
  value,
  onChange,
  revealed,
  onToggleReveal,
  onTest,
  onPersistNow,
  testStatus,
  onRemove,
}: {
  providerId: ProviderId
  providerName: string
  providerDescription: string
  consoleUrl: string
  value: string
  onChange: (v: string) => void
  revealed: boolean
  onToggleReveal: () => void
  /**
   * Probe this provider with the currently-typed key. The button is
   * disabled when the field is empty so users can't fire useless requests.
   */
  onTest: () => void
  onPersistNow: () => void
  testStatus: TestStatus
  onRemove?: () => void
}) {
  const { t } = useI18n()
  const testing = testStatus.kind === "testing"
  const disabled = testing || !value.trim()
  return (
    <div className="pa-card">
      <div className="pa-row-spread">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{providerName}</span>
          <span className="pa-section-helper" style={{ fontSize: 11 }}>
            {providerDescription}
          </span>
        </div>
        <div className="pa-row" style={{ gap: 6 }}>
          <a
            href={consoleUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="pa-pill"
            style={{ textDecoration: "none" }}
          >
            {t("settings.providerGetKey")} ↗
          </a>
          {onRemove && (
            <button
              type="button"
              className="pa-button-danger"
              onClick={onRemove}
              style={{ width: "auto", padding: "0 8px", fontSize: 11 }}
            >
              {t("settings.customProviderRemove")}
            </button>
          )}
        </div>
      </div>
      <div className="pa-row">
        <input
          className="pa-input"
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onPersistNow}
          placeholder={t("settings.providerKeyPlaceholder", {
            provider: providerName,
          })}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="pa-button-icon"
          onClick={onToggleReveal}
          aria-label={revealed ? t("common.hide") : t("common.show")}
        >
          {revealed ? t("common.hide") : t("common.show")}
        </button>
        <button
          type="button"
          className="pa-button-icon"
          onClick={onTest}
          disabled={disabled}
          aria-label={t("settings.testKey")}
          title={t("settings.testKey")}
          style={{ minWidth: 60 }}
        >
          {testing ? t("settings.testing") : t("settings.testKey")}
        </button>
      </div>
      {/* Inline status row — only renders after first test attempt. The
       * full error message is shown on hover via title; the inline pill
       * keeps just enough context that designers don't need to open a
       * dev-tools console. */}
      {testStatus.kind === "ok" && (
        <span className="pa-pill" data-tone="success">
          ✓ {t("settings.testKeyOk")}
        </span>
      )}
      {testStatus.kind === "error" && (
        <span
          className="pa-pill"
          data-tone="warning"
          title={testStatus.message}
        >
          ✗ {t("settings.testKeyFail")} — {truncate(testStatus.message, 80)}
        </span>
      )}
    </div>
  )
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value
}
