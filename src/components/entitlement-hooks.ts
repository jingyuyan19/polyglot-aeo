import { createContext, useContext } from "react"

import { upgradeReasonForFeature } from "../lib/license/entitlements"
import type {
  EntitlementContext,
  Feature,
  FeatureContext,
} from "../lib/license/types"

export const EntitlementCtx = createContext<EntitlementContext | null>(null)

export function useEntitlement(): EntitlementContext {
  const ctx = useContext(EntitlementCtx)
  if (!ctx) {
    throw new Error("useEntitlement must be used within EntitlementProvider")
  }
  return ctx
}

/** Gate helper: returns false and opens upgrade when blocked. */
export function useFeatureGate() {
  const ent = useEntitlement()
  return {
    tier: ent.tier,
    isPro: ent.tier === "pro",
    check(feature: Feature, ctx?: FeatureContext): boolean {
      if (ent.canUse(feature, ctx)) return true
      ent.requestUpgrade(upgradeReasonForFeature(feature))
      return false
    },
  }
}
