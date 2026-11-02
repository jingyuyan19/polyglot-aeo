import { useId, useState } from "react"

import { useI18n, type TranslationKey } from "../i18n"

interface Props {
  /** Term id from the i18n `help.*` namespace, e.g. "aeo" or "managedAi". */
  termId: HelpTermId
  /** Optional accessible label override; defaults to "Show help". */
  ariaLabel?: string
}

/**
 * Available help term ids. Hard-coding this union (rather than deriving from
 * `Translations`) gives us a tight per-call autocomplete with zero runtime
 * cost, and forces a deliberate addition step when introducing a new term:
 *   1. Add the entry to `help.<id>` in every locale.
 *   2. Add the id here.
 *   3. Use it via <HelpIcon termId="..." />.
 */
export type HelpTermId =
  | "aeo"
  | "inLanguage"
  | "bcp47"
  | "managedAi"
  | "canonicalUrl"
  | "llmsTxt"
  | "fenced"
  | "brandVoice"
  | "perLocaleSchema"

/**
 * A clickable (?) icon. Click expands an inline panel with the term's
 * definition; click again or click outside (handled by the panel's
 * own dismiss button) to collapse.
 *
 * Why click + inline panel instead of hover tooltip:
 *   - Framer plugin window is narrow (~320px). A hovering tooltip
 *     would clip outside the iframe, requiring portals + edge detection.
 *   - Hover-only content is invisible to keyboard, touch, and assistive
 *     tech users. Click reveal works for everyone.
 *   - "I needed to know what this means" deserves a stable, scrollable
 *     panel — not a 1.5-second-delayed bubble that disappears on mouseout.
 */
export function HelpIcon({ termId, ariaLabel }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const buttonId = useId()

  const label = ariaLabel ?? (open ? t("common.helpClose") : t("common.helpOpen"))

  return (
    <span className="pa-help">
      <button
        id={buttonId}
        type="button"
        className="pa-help-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle
            cx="6"
            cy="6"
            r="5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
          <text
            x="6"
            y="8.5"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="600"
            fill="currentColor"
          >
            ?
          </text>
        </svg>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="pa-help-panel"
        >
          {t(`help.${termId}` as TranslationKey)}
        </div>
      )}
    </span>
  )
}
