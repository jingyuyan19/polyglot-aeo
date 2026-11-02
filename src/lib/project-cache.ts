import { getCurrentProjectId } from "./framer/project"
import { readJson, writeJson } from "./storage"

const LOCAL_CACHE_PREFIX = "polyglot-aeo:project-cache:"
const LOCAL_CACHE_VERSION = 1
const DEFAULT_PLUGIN_DATA_MAX_BYTES = 1000

let projectIdPromise: Promise<string> | null = null

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

async function currentProjectScope(): Promise<string> {
  if (!projectIdPromise) {
    projectIdPromise = getCurrentProjectId().then((id) => id ?? "unknown")
  }
  return projectIdPromise
}

async function localCacheKey(key: string): Promise<string> {
  const projectId = await currentProjectScope()
  return `${LOCAL_CACHE_PREFIX}${projectId}:${key}`
}

interface LocalCacheEnvelope<T> {
  version: typeof LOCAL_CACHE_VERSION
  savedAt: number
  value: T
}

function parseEnvelope<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LocalCacheEnvelope<T>>
    if (parsed.version !== LOCAL_CACHE_VERSION || !("value" in parsed)) {
      return null
    }
    return parsed.value as T
  } catch {
    return null
  }
}

export async function readProjectJsonCache<T>(
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const local = parseEnvelope<T>(localStorage.getItem(await localCacheKey(key)))
    if (local !== null) return local
  } catch {
    // Local storage can be disabled. Fall back to Framer plugin data.
  }
  return readJson<T>(key, fallback)
}

export async function writeProjectJsonCache<T>(
  key: string,
  value: T,
  options?: {
    /**
     * Keep plugin-data writes very small. Larger payloads still persist in
     * project-scoped localStorage, but are cleared from Framer's 4 KB budget.
     */
    pluginDataMaxBytes?: number
    clearPluginDataWhenLocalOnly?: boolean
  },
): Promise<boolean> {
  const pluginDataMaxBytes =
    options?.pluginDataMaxBytes ?? DEFAULT_PLUGIN_DATA_MAX_BYTES
  let localOk = false

  try {
    const keyForLocal = await localCacheKey(key)
    if (value === null) {
      localStorage.removeItem(keyForLocal)
      localOk = true
    } else {
      const envelope: LocalCacheEnvelope<T> = {
        version: LOCAL_CACHE_VERSION,
        savedAt: Date.now(),
        value,
      }
      localStorage.setItem(keyForLocal, JSON.stringify(envelope))
      localOk = true
    }
  } catch {
    localOk = false
  }

  const serialized = value === null ? null : JSON.stringify(value)
  const fitsPluginData =
    serialized === null || utf8ByteLength(serialized) <= pluginDataMaxBytes

  if (fitsPluginData) {
    const pluginOk = await writeJson(key, value)
    return localOk || pluginOk
  }

  if (options?.clearPluginDataWhenLocalOnly !== false) {
    void writeJson(key, null)
  }

  return localOk
}
