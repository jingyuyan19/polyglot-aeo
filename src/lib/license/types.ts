/** Subscription tier exposed to the plugin UI and gates. */
export type Tier = "free" | "pro"

/** Creem environment used for checkout and license validation. */
export type BillingMode = "production" | "test"

/** Features gated between Free and Pro (see docs/PRICING.md). */
export type Feature =
  | "schema_translate"
  | "schema_install_unlimited"
  | "schema_install_all"
  | "llms_multi_locale"
  | "llms_ai_translate"
  | "llms_generate"
  | "meta_generate"
  | "meta_ai_suggest"
  | "schema_audit_persist"
  | "remote_schema_rules"
  | "custom_openai_endpoint"

export type UpgradeReason =
  | "multi_locale"
  | "schema_install_limit"
  | "schema_install_all"
  | "schema_translate"
  | "llms_generate"
  | "llms_multi_locale"
  | "llms_ai_translate"
  | "meta_generate"
  | "schema_audit_persist"
  | "remote_schema_rules"
  | "generic_pro"

export interface LicenseRecord {
  /** Full license key (plugin data is project-scoped). */
  key: string
  /** Creem activation instance id returned by `/licenses/activate`. */
  instanceId: string
  /** Framer project id used only for display/checkout attribution. */
  projectId?: string
  /** Creem environment this license belongs to. */
  billingMode?: BillingMode
  tier: Tier
  /** Unix ms — last successful validate or activate. */
  validatedAt: number
  /** Unix ms — server-suggested re-check; offline grace until then. */
  cacheExpiresAt: number
  /** Masked key for UI, e.g. `pa_live_••••••••1234`. */
  keyHint: string
}

export interface EntitlementContext {
  tier: Tier
  billingMode: BillingMode
  license: LicenseRecord | null
  loading: boolean
  /** True when validate is in flight. */
  validating: boolean
  lastError: string | null
  refresh: () => Promise<void>
  setBillingMode: (mode: BillingMode) => Promise<void>
  activate: (key: string) => Promise<{ ok: boolean; error?: string }>
  deactivate: () => Promise<void>
  requestUpgrade: (reason: UpgradeReason) => void
  canUse: (feature: Feature, ctx?: FeatureContext) => boolean
}

export interface FeatureContext {
  localeCount?: number
  /** User is acting on a non-default locale. */
  nonDefaultLocale?: boolean
  /** Number of free-tier Meta AI generation actions already used. */
  metaGenerateCount?: number
  /** Distinct page ids that would be installed after this action. */
  installPageCount?: number
  /** Enabling all proposals in one click. */
  enableAll?: boolean
}

export interface ActivateResponse {
  ok: boolean
  tier?: Tier
  expiresAt?: number
  /** Creem may return a canonical instance id; store for validate. */
  instance_id?: string
  error?: string
}

export interface ValidateResponse {
  ok: boolean
  tier?: Tier
  expiresAt?: number
  error?: string
}

export interface DeactivateResponse {
  ok: boolean
  tier?: Tier
  error?: string
}
