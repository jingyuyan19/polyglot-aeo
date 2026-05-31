import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { buildCheckoutUrl } from "../lib/license/api"
import { canUseFeature } from "../lib/license/entitlements"
import { fetchRemoteSchemaRules } from "../lib/schema/remote-rules"
import {
  activateLicenseForProject,
  deactivateLicenseForProject,
  refreshLicenseTier,
  resolveBillingMode,
  resolveProjectInstanceId,
  setLicenseBillingMode,
} from "../lib/license/service"
import { clearLicenseRecord } from "../lib/license/storage"
import { EntitlementCtx } from "./entitlement-hooks"
import type {
  EntitlementContext,
  Feature,
  FeatureContext,
  LicenseRecord,
  BillingMode,
  Tier,
  UpgradeReason,
} from "../lib/license/types"

interface Props {
  children: ReactNode
  onUpgradeRequest: (reason: UpgradeReason, checkoutUrl: string) => void
  onTierReady?: (isPro: boolean) => void
}

export function EntitlementProvider({
  children,
  onUpgradeRequest,
  onTierReady,
}: Props) {
  const [tier, setTier] = useState<Tier>("free")
  const [license, setLicense] = useState<LicenseRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [billingMode, setBillingModeState] =
    useState<BillingMode>("production")

  const refresh = useCallback(async () => {
    setValidating(true)
    setLastError(null)
    try {
      const result = await refreshLicenseTier({ force: true })
      setTier(result.tier)
      setLicense(result.record)
      if (result.error) setLastError(result.error)
    } finally {
      setValidating(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void resolveProjectInstanceId().then(setProjectId)
    void (async () => {
      const mode = await resolveBillingMode()
      setBillingModeState(mode)
      const result = await refreshLicenseTier()
      setTier(result.tier)
      setLicense(result.record)
      if (result.error) setLastError(result.error)
      setLoading(false)
      onTierReady?.(result.tier === "pro")
    })()
  }, [onTierReady])

  const setBillingMode = useCallback(
    async (mode: BillingMode) => {
      setValidating(true)
      setLastError(null)
      try {
        const ok = await setLicenseBillingMode(mode)
        if (!ok) {
          setLastError("Could not save billing environment")
          return
        }
        setBillingModeState(mode)
        const result = await refreshLicenseTier({ force: true })
        setTier(result.tier)
        setLicense(result.record)
        if (result.error) setLastError(result.error)
        onTierReady?.(result.tier === "pro")
      } finally {
        setValidating(false)
        setLoading(false)
      }
    },
    [onTierReady],
  )

  useEffect(() => {
    if (!loading && tier === "pro") {
      onTierReady?.(true)
      void fetchRemoteSchemaRules(true)
    }
  }, [loading, tier, onTierReady])

  const activate = useCallback(async (key: string) => {
    setValidating(true)
    setLastError(null)
    try {
      const result = await activateLicenseForProject(key)
      if (!result.ok) {
        setLastError(result.error ?? "Activation failed")
        return result
      }
      await refresh()
      return { ok: true }
    } finally {
      setValidating(false)
    }
  }, [refresh])

  const deactivate = useCallback(async () => {
    setValidating(true)
    setLastError(null)
    try {
      if (license) {
        const result = await deactivateLicenseForProject(license)
        if (!result.ok) {
          setLastError(result.error ?? "Could not deactivate license")
        }
      }
      await clearLicenseRecord(billingMode)
      setLicense(null)
      setTier("free")
    } finally {
      setValidating(false)
    }
  }, [billingMode, license])

  const requestUpgrade = useCallback(
    (reason: UpgradeReason) => {
      onUpgradeRequest(
        reason,
        buildCheckoutUrl("monthly", projectId, billingMode),
      )
    },
    [billingMode, onUpgradeRequest, projectId],
  )

  const canUse = useCallback(
    (feature: Feature, ctx?: FeatureContext) => {
      if (!canUseFeature(tier, feature, ctx)) return false
      return true
    },
    [tier],
  )

  const value = useMemo<EntitlementContext>(
    () => ({
      tier,
      billingMode,
      license,
      loading,
      validating,
      lastError,
      refresh,
      setBillingMode,
      activate,
      deactivate,
      requestUpgrade,
      canUse,
    }),
    [
      tier,
      billingMode,
      license,
      loading,
      validating,
      lastError,
      refresh,
      setBillingMode,
      activate,
      deactivate,
      requestUpgrade,
      canUse,
    ],
  )

  return (
    <EntitlementCtx.Provider value={value}>{children}</EntitlementCtx.Provider>
  )
}
