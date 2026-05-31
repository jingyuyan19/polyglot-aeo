/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LICENSE_API_BASE?: string
  readonly VITE_CREEM_CHECKOUT_MONTHLY?: string
  readonly VITE_CREEM_CHECKOUT_YEARLY?: string
  readonly VITE_CREEM_TEST_MODE?: string
  readonly VITE_DEV_PRO?: string
  readonly VITE_SCHEMA_RULES_URL?: string
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
