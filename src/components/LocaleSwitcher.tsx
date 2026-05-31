import { useEffect, useRef, useState } from "react"

import {
  AUTO_LOCALE,
  LOCALE_METADATA,
  useI18n,
  type LocalePreference,
  type SupportedLocale,
} from "../i18n"
import { StorageKeys, writeString } from "../lib/storage"

/**
 * Compact globe-icon language switcher. Shows the active locale's short
 * code (EN / 中 / 日) inside the button so users see what's selected at a
 * glance without opening the menu.
 *
 * Lives in the top-right of the Dashboard hero and the TopBar — same
 * component, dropped into both places. Settings still has the canonical
 * full-section selector for users who go looking there.
 */
export function LocaleSwitcher() {
  const { locale: active, preference, detected, setPreference } = useI18n()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Close the menu when clicking outside or pressing Escape. Without this,
  // the popover would persist when the user moves on to another control.
  useEffect(() => {
    if (!open) return
    function handlePointer(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointer)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handlePointer)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  const handleSelect = async (next: LocalePreference) => {
    setPreference(next)
    await writeString(
      StorageKeys.UiLocalePreference,
      next === AUTO_LOCALE ? null : next,
    )
    setOpen(false)
  }

  return (
    <div className="pa-locale-switcher" ref={wrapperRef}>
      <button
        type="button"
        className="pa-locale-switcher-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change plugin language"
        aria-expanded={open}
        title={`UI: ${LOCALE_METADATA[active].nativeName}`}
      >
        <GlobeIcon />
        <span className="pa-locale-switcher-code">{shortCodeFor(active)}</span>
      </button>

      {open && (
        <div className="pa-locale-switcher-menu" role="menu">
          <LocaleOption
            label="Auto"
            sublabel={LOCALE_METADATA[detected].nativeName}
            selected={preference === AUTO_LOCALE}
            onClick={() => handleSelect(AUTO_LOCALE)}
          />
          <div className="pa-locale-switcher-divider" />
          {(Object.keys(LOCALE_METADATA) as SupportedLocale[]).map((code) => (
            <LocaleOption
              key={code}
              label={LOCALE_METADATA[code].nativeName}
              selected={preference === code}
              onClick={() => handleSelect(code)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LocaleOption({
  label,
  sublabel,
  selected,
  onClick,
}: {
  label: string
  /** Optional secondary text shown muted to the right (used for "Auto"). */
  sublabel?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="pa-locale-switcher-item"
      data-selected={selected}
      onClick={onClick}
      role="menuitem"
    >
      <span className="pa-locale-switcher-check">{selected ? "✓" : ""}</span>
      <span className="pa-locale-switcher-label">{label}</span>
      {sublabel && (
        <span className="pa-locale-switcher-sublabel">{sublabel}</span>
      )}
    </button>
  )
}

/**
 * Shortest universal symbol per locale. We keep these to a single
 * character so the button stays compact even at 320px window widths.
 */
function shortCodeFor(locale: SupportedLocale): string {
  switch (locale) {
    case "en":
      return "EN"
    case "zh-CN":
      return "中"
    case "ja":
      return "日"
  }
}

function GlobeIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="6.5"
        cy="6.5"
        r="5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <ellipse
        cx="6.5"
        cy="6.5"
        rx="2"
        ry="5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line
        x1="1.5"
        y1="6.5"
        x2="11.5"
        y2="6.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}
