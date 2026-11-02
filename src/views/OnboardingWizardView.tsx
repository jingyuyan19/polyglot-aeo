import { framer } from "framer-plugin"
import { useCallback, useEffect, useState } from "react"

import { LocaleSwitcher } from "../components/LocaleSwitcher"
import { ModalOverlay } from "../components/ModalOverlay"
import { WizardAiSetupPanel } from "../components/WizardAiSetupPanel"
import { WizardProjectSnapshot } from "../components/WizardProjectSnapshot"
import { useOnboardingSignals } from "../hooks/useOnboardingSignals"
import { useI18n, type TranslationKey } from "../i18n"
import {
  clampScreenIndex,
  getResumeScreenIndex,
  getReviewStartIndex,
  WIZARD_SCREEN_COUNT,
  wizardScreenAt,
  type WizardScreenId,
} from "../lib/onboarding-wizard"
import { readString, StorageKeys, writeString } from "../lib/storage"

interface Props {
  onClose: () => void
  reviewMode: boolean
  onOpenSettings?: () => void
}

export function OnboardingWizardView({
  onClose,
  reviewMode,
  onOpenSettings,
}: Props) {
  const { t } = useI18n()
  const signals = useOnboardingSignals()
  const [screenIndex, setScreenIndex] = useState(0)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!signals.loaded || initialized) return
    let cancelled = false
    void (async () => {
      const stored = await readString(StorageKeys.OnboardingWizardLastScreen)
      const parsed = stored ? Number.parseInt(stored, 10) : NaN
      const fromStorage = Number.isFinite(parsed)
        ? clampScreenIndex(parsed)
        : null
      const start = reviewMode
        ? getReviewStartIndex()
        : (fromStorage ?? getResumeScreenIndex(signals))
      if (!cancelled) {
        setScreenIndex(start)
        setInitialized(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signals.loaded, initialized, reviewMode, signals])

  const persistScreen = useCallback((index: number) => {
    void writeString(StorageKeys.OnboardingWizardLastScreen, String(index))
  }, [])

  const screenId = wizardScreenAt(screenIndex)

  const goNext = useCallback(() => {
    const next = clampScreenIndex(screenIndex + 1)
    setScreenIndex(next)
    persistScreen(next)
  }, [persistScreen, screenIndex])

  const goBack = useCallback(() => {
    if (screenIndex === 0) {
      onClose()
      return
    }
    const prev = clampScreenIndex(screenIndex - 1)
    setScreenIndex(prev)
    persistScreen(prev)
  }, [onClose, persistScreen, screenIndex])

  const completeWizard = useCallback(async () => {
    await Promise.all([
      writeString(StorageKeys.OnboardingWizardCompleted, "true"),
      writeString(StorageKeys.OnboardingWizardSkippedAll, null),
      writeString(StorageKeys.OnboardingDismissed, null),
      writeString(StorageKeys.OnboardingWizardLastScreen, null),
    ])
    framer.notify(t("wizard.completeNotify"), { variant: "success" })
    onClose()
  }, [onClose, t])

  const skipAllFromWelcome = useCallback(async () => {
    await Promise.all([
      writeString(StorageKeys.OnboardingWizardCompleted, "true"),
      writeString(StorageKeys.OnboardingWizardSkippedAll, "true"),
      writeString(StorageKeys.OnboardingWizardLastScreen, null),
    ])
    onClose()
  }, [onClose])

  const handlePrimary = useCallback(() => {
    switch (screenId) {
      case "welcome":
        goNext()
        break
      case "aiSetup":
        goNext()
        break
      case "done":
        void completeWizard()
        break
    }
  }, [completeWizard, goNext, screenId])

  const primaryLabel = primaryCtaKey(screenId)

  return (
    <ModalOverlay className="pa-wizard-overlay" role="dialog" aria-modal>
      <div className="pa-wizard-dialog">
        <div className="pa-wizard-progress">
          <div className="pa-wizard-progress-top">
            <span className="pa-wizard-progress-label">
              {t("wizard.stepOf", {
                current: screenIndex + 1,
                total: WIZARD_SCREEN_COUNT,
              })}
            </span>
            <LocaleSwitcher />
          </div>
          <div
            className="pa-quickstart-progress-bar"
            role="progressbar"
            aria-valuenow={screenIndex + 1}
            aria-valuemin={1}
            aria-valuemax={WIZARD_SCREEN_COUNT}
          >
            <div
              className="pa-quickstart-progress-fill"
              style={{
                width: `${((screenIndex + 1) / WIZARD_SCREEN_COUNT) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="pa-wizard-dialog-body">
          <WizardScreenContent
            screenId={screenId}
            signals={signals}
            onKeySaved={() => signals.refresh()}
            onAutoAdvance={goNext}
            onOpenSettings={onOpenSettings}
          />
        </div>

        <footer className="pa-wizard-footer">
          <button
            type="button"
            className="pa-wizard-footer-link"
            onClick={goBack}
          >
            {screenIndex === 0 ? t("common.close") : t("common.back")}
          </button>
          <div className="pa-wizard-footer-actions">
            {screenId === "welcome" && (
              <button
                type="button"
                className="pa-wizard-footer-link"
                onClick={() => void skipAllFromWelcome()}
              >
                {t("wizard.skipAll")}
              </button>
            )}
            <button
              type="button"
              className="pa-button-primary"
              onClick={handlePrimary}
            >
              {t(primaryLabel)}
            </button>
          </div>
        </footer>
      </div>
    </ModalOverlay>
  )
}

function primaryCtaKey(screenId: WizardScreenId): TranslationKey {
  switch (screenId) {
    case "welcome":
      return "wizard.cta.getStarted"
    case "aiSetup":
      return "wizard.cta.continue"
    case "done":
      return "wizard.cta.openDashboard"
  }
}

function WizardScreenContent({
  screenId,
  signals,
  onKeySaved,
  onAutoAdvance,
  onOpenSettings,
}: {
  screenId: WizardScreenId
  signals: ReturnType<typeof useOnboardingSignals>
  onKeySaved: () => void
  onAutoAdvance: () => void
  onOpenSettings?: () => void
}) {
  const { t } = useI18n()
  const titleKey = `wizard.screens.${screenId}.title` as TranslationKey
  const bodyKey = `wizard.screens.${screenId}.body` as TranslationKey

  return (
    <div className="pa-wizard-screen">
      <h2 className="pa-wizard-screen-title">{t(titleKey)}</h2>
      <p className="pa-wizard-screen-body">{t(bodyKey)}</p>
      {screenId === "welcome" && (
        <WizardProjectSnapshot
          signals={{
            localeCount: signals.localeCount,
            schemaInstalled: signals.schemaInstalled,
          }}
        />
      )}
      {screenId === "aiSetup" && (
        <WizardAiSetupPanel
          onKeySaved={onKeySaved}
          onSavedAndTested={onAutoAdvance}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  )
}
