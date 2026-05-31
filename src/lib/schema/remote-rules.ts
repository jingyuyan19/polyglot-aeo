import { readString, StorageKeys, writeString } from "../storage"

const DEFAULT_RULES_URL =
  "https://polyglotaeo.com/schema-rules-v1.json"

export interface RemoteSchemaRules {
  version: string
  allowedSchemaKinds: string[]
  promptVersion: string
}

const BUILTIN_FROZEN: RemoteSchemaRules = {
  version: "builtin",
  allowedSchemaKinds: [
    "WebSite",
    "Organization",
    "WebPage",
    "Article",
    "FAQPage",
    "Product",
    "LocalBusiness",
    "BreadcrumbList",
  ],
  promptVersion: "v2",
}

export function rulesUrl(): string {
  const fromEnv = import.meta.env.VITE_SCHEMA_RULES_URL as string | undefined
  return fromEnv?.trim() || DEFAULT_RULES_URL
}

export async function fetchRemoteSchemaRules(
  isPro: boolean,
): Promise<RemoteSchemaRules> {
  if (!isPro) return BUILTIN_FROZEN

  try {
    const res = await fetch(rulesUrl(), { cache: "no-store" })
    if (!res.ok) return BUILTIN_FROZEN
    const data = (await res.json()) as RemoteSchemaRules
    if (!data.version || !Array.isArray(data.allowedSchemaKinds)) {
      return BUILTIN_FROZEN
    }
    await writeString(StorageKeys.RemoteSchemaRulesVersion, data.version)
    return data
  } catch {
    return BUILTIN_FROZEN
  }
}

export async function readCachedRulesVersion(): Promise<string | null> {
  return readString(StorageKeys.RemoteSchemaRulesVersion)
}

export { BUILTIN_FROZEN }
