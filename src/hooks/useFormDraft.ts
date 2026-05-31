import { useEffect, useRef, useState } from "react"

import { readJson, writeJson } from "../lib/storage"

interface Options {
  /** Plugin-data key used to persist this draft. Pick a stable, unique id. */
  storageKey: string
  /** Initial value used until the persisted draft (if any) is loaded. */
  initialValue: () => unknown
  /** Debounce delay in milliseconds. Defaults to 1500ms. */
  debounceMs?: number
}

/**
 * Generic form-draft auto-save hook.
 *
 * Loads the persisted draft from plugin data on mount; saves the latest
 * value back on every change with debouncing so we don't pummel
 * `setPluginData` on every keystroke.
 *
 * Returns `[value, setValue, status]` mirroring `useState`, plus a status
 * field the UI can use to render "Saved" / "Saving…" / "Restored draft"
 * indicators.
 *
 * NOTE: this hook persists the entire form value as JSON. Don't put
 * anything sensitive (API keys, secrets) in here — those go through
 * `readString` / `writeString` with their own dedicated keys.
 */
export function useFormDraft<T>(options: Options): {
  value: T
  setValue: (next: T | ((prev: T) => T)) => void
  status: "loading" | "ready" | "saving" | "saved"
  /** True when the on-mount load found a previously-saved draft. */
  restored: boolean
} {
  const { storageKey, initialValue, debounceMs = 1500 } = options

  const [value, setRawValue] = useState<T>(() => initialValue() as T)
  const [status, setStatus] = useState<
    "loading" | "ready" | "saving" | "saved"
  >("loading")
  const [restored, setRestored] = useState(false)

  // Load the persisted draft on mount. If none exists, fall back to
  // initialValue() (already in state) and skip writing back — we don't
  // want to immediately persist a default the user may not even touch.
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    readJson<T | null>(storageKey, null).then((draft) => {
      if (cancelled) return
      if (draft !== null) {
        setRawValue(draft)
        setRestored(true)
      }
      hasLoadedRef.current = true
      setStatus("ready")
    })
    return () => {
      cancelled = true
    }
    // We deliberately ignore changes to storageKey after mount — switching
    // the key mid-session would be a code bug, not a runtime case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced auto-save. Restarts the timer on every value change so we
  // only write once the user stops typing.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!hasLoadedRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setStatus("saving")
    timerRef.current = setTimeout(() => {
      void writeJson(storageKey, value).then(() => {
        setStatus("saved")
      })
    }, debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, storageKey, debounceMs])

  return {
    value,
    setValue: setRawValue,
    status,
    restored,
  }
}
