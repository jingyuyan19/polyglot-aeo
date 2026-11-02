import { useCallback, useEffect, useState } from "react"

import { useLocales } from "./useLocales"
import { readCustomProviders, readProviderKey } from "../lib/ai/client"
import { BUILTIN_PROVIDERS } from "../lib/ai/providers"
import { readInstalledStatus } from "../lib/framer/customCode"
import type { OnboardingSignals } from "../lib/onboarding"
import { readJson, readString, StorageKeys } from "../lib/storage"

export type LoadedOnboardingSignals = OnboardingSignals & {
  loaded: boolean
  refresh: () => void
}

const EMPTY: LoadedOnboardingSignals = {
  localeCount: 0,
  schemaInstalled: false,
  llmsGenerated: false,
  llmsDeployAcknowledged: false,
  hasApiKey: false,
  metaGenerated: false,
  publishedVerifyRan: false,
  loaded: false,
  refresh: () => {},
}

export function useOnboardingSignals(): LoadedOnboardingSignals {
  const { locales } = useLocales()
  const [installed, setInstalled] = useState<{
    installed: boolean
    disabled: boolean
  } | null>(null)
  const [signals, setSignals] = useState<LoadedOnboardingSignals>(EMPTY)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    readInstalledStatus().then(setInstalled)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const customConfigs = await readCustomProviders()
      const allIds = [
        ...BUILTIN_PROVIDERS.map((p) => p.id),
        ...customConfigs.map((c) => c.id),
      ]
      const [keys, lastLlms, lastMeta, lastVerify, deployAck] =
        await Promise.all([
          Promise.all(allIds.map((id) => readProviderKey(id))),
          readJson<unknown>(StorageKeys.LastLlmsTxt, null),
          readJson<unknown>(StorageKeys.LastMetaResults, null),
          readJson<unknown>(StorageKeys.LastPublishedVerify, null),
          readString(StorageKeys.LlmsDeployAcknowledged),
        ])
      if (cancelled) return
      setSignals({
        localeCount: locales.length,
        schemaInstalled: Boolean(installed?.installed),
        llmsGenerated: lastLlms !== null,
        llmsDeployAcknowledged: deployAck === "true",
        hasApiKey: keys.some((k) => Boolean(k)),
        metaGenerated: lastMeta !== null,
        publishedVerifyRan: lastVerify !== null,
        loaded: true,
        refresh,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [locales.length, installed?.installed, refresh, tick])

  return signals.loaded ? signals : { ...signals, refresh }
}
