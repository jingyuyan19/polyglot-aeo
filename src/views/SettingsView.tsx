import { framer } from "framer-plugin"
import { useCallback, useEffect, useRef, useState } from "react"

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
import { clearAllInjected, readInstalledStatus } from "../lib/framer/customCode"
import { readString, StorageKeys, writeString } from "../lib/storage"
import { LicenseSettingsSection } from "./LicenseSettingsSection"

interface Props {
  onBack: () => void
}

type AutosaveStatus = "loading" | "saved" | "dirty" | "saving" | "error"

function settingsSignature(brandVoice: string): string {
  return JSON.stringify({
    brandVoice: brandVoice.trim() || null,
  })
}

export function SettingsView({ onBack }: Props) {
  const { t, preference, detected, setPreference } = useI18n()

  const [brandVoice, setBrandVoice] = useState("")
  const [installed, setInstalled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autosaveStatus, setAutosaveStatus] =
    useState<AutosaveStatus>("loading")
  const [confirmRemoveSchemaOpen, setConfirmRemoveSchemaOpen] = useState(false)

  const loadedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSignatureRef = useRef("")
  const latestSettingsRef = useRef({ brandVoice: "" })

  useEffect(() => {
    latestSettingsRef.current = { brandVoice }
  }, [brandVoice])

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
      const signature = settingsSignature(snapshot.brandVoice)
      if (signature === lastSavedSignatureRef.current) {
        setAutosaveStatus("saved")
        if (options.notifySuccess) {
          framer.notify(t("settings.saveSuccess"), { variant: "success" })
        }
        return true
      }

      setAutosaveStatus("saving")
      try {
        await writeString(
          StorageKeys.BrandVoice,
          snapshot.brandVoice.trim() || null,
        )

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
      const [voice, status] = await Promise.all([
        readString(StorageKeys.BrandVoice),
        readInstalledStatus(),
      ])
      const loadedBrandVoice = voice ?? ""
      setBrandVoice(loadedBrandVoice)
      setInstalled(status.installed)
      lastSavedSignatureRef.current = settingsSignature(loadedBrandVoice)
      latestSettingsRef.current = { brandVoice: loadedBrandVoice }
      loadedRef.current = true
      setAutosaveStatus("saved")
    })()
  }, [])

  useEffect(() => {
    if (!loadedRef.current) return
    const signature = settingsSignature(brandVoice)
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
  }, [brandVoice, saveSettingsNow])

  const save = async () => {
    setSaving(true)
    try {
      await saveSettingsNow({ notifySuccess: true, notifyError: true })
    } finally {
      setSaving(false)
    }
  }

  const handleBack = async () => {
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

  const resetQuickStart = async () => {
    await writeString(StorageKeys.OnboardingDismissed, null)
    framer.notify(t("settings.quickStartResetDone"), { variant: "success" })
  }

  const restartWizard = async () => {
    await Promise.all([
      writeString(StorageKeys.OnboardingWizardCompleted, null),
      writeString(StorageKeys.OnboardingWizardSkippedAll, null),
      writeString(StorageKeys.OnboardingWizardLastScreen, null),
      writeString(StorageKeys.OnboardingDismissed, null),
    ])
    framer.notify(t("settings.restartWizardDone"), { variant: "success" })
  }

  return (
    <>
      <TopBar title={t("settings.title")} onBack={() => void handleBack()} />
      <div className="pa-scroll pa-scroll--with-footer">
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
                {LOCALE_METADATA[code].nativeName} -{" "}
                {LOCALE_METADATA[code].englishName}
              </option>
            ))}
          </select>
        </section>

        <LicenseSettingsSection />

        <section className="pa-section">
          <span className="pa-section-title">
            {t("settings.managedAiTitle")}
          </span>
          <p className="pa-section-helper">
            {t("settings.managedAiHelper")}
          </p>
          <span className="pa-pill" data-tone="success">
            {t("settings.managedAiProvider")}
          </span>
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

        <section className="pa-section">
          <span className="pa-section-title">
            {t("settings.restartWizardTitle")}
          </span>
          <p className="pa-section-helper">
            {t("settings.restartWizardHelper")}
          </p>
          <button
            type="button"
            onClick={() => void restartWizard()}
            style={{ width: "auto", alignSelf: "flex-start", padding: "0 12px" }}
          >
            {t("settings.restartWizardButton")}
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
    </>
  )
}
