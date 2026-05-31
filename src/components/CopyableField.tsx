import { useState } from "react"

import { useI18n } from "../i18n"

interface Props {
  /**
   * Small uppercase label rendered above the value (e.g. "TITLE"). Pass
   * undefined when the field already has an external label/header to
   * avoid duplicate text.
   */
  label?: string
  /** The actual value to copy. Multi-line is fine. */
  value: string
}

/**
 * One-click "copy this" field for AI-generated content. Designers will
 * paste these straight into Framer's page settings, so we want the lowest
 * possible friction — no separate "select all" step, no toast prompts,
 * just click → copied.
 *
 * The trailing label flips to "Copied" for ~1.2s as visible confirmation.
 * If the Clipboard API isn't available (older browsers) we fall back to
 * the textarea-select trick before giving up silently.
 */
export function CopyableField({ label, value }: Props) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        // Fallback for environments without async clipboard. Briefly
        // create an offscreen textarea, select, copy, remove.
        const ta = document.createElement("textarea")
        ta.value = value
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // Silently fail — the field is still selectable manually.
    }
  }

  return (
    <button
      type="button"
      className="pa-copyable"
      data-copied={copied}
      onClick={handleCopy}
      aria-label={label ? `${t("common.copy")}: ${label}` : t("common.copy")}
    >
      <span className="pa-copyable-content">
        {label && <span className="pa-copyable-label">{label}</span>}
        <span className="pa-copyable-value">{value}</span>
      </span>
      <span className="pa-copyable-action">
        {copied ? t("common.copied") : t("common.copy")}
      </span>
    </button>
  )
}
