import type { BillingMode } from "./types"

/**
 * Test checkout is useful for local QA but should never leak into the
 * Marketplace build unless we explicitly opt in.
 */
export function canUseTestBillingMode(): boolean {
  return (
    import.meta.env.VITE_CREEM_TEST_MODE === "true" ||
    import.meta.env.VITE_SHOW_BILLING_TEST_MODE === "true"
  )
}

export function defaultBillingMode(): BillingMode {
  return canUseTestBillingMode() &&
    import.meta.env.VITE_CREEM_TEST_MODE === "true"
    ? "test"
    : "production"
}

export function normalizeBillingMode(
  mode: BillingMode | null | undefined,
): BillingMode {
  if (mode === "test" && canUseTestBillingMode()) return "test"
  return "production"
}

export function isBillingTestMode(mode?: BillingMode): boolean {
  return normalizeBillingMode(mode ?? defaultBillingMode()) === "test"
}
