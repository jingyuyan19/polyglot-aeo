import { useState } from "react"

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
    const ta = document.createElement("textarea")
    ta.value = value
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function ClipboardIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

interface Props {
  text: string
  /** Tooltip and aria-label (e.g. localized "Copy"). */
  label: string
  onCopied?: () => void
}

/** Compact icon button for copying arbitrary text (JSON previews, etc.). */
export function CopyIconButton({ text, label, onCopied }: Props) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    setCopied(true)
    onCopied?.()
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      className="pa-copy-icon-btn"
      data-copied={copied}
      onClick={handleClick}
      title={label}
      aria-label={label}
    >
      {copied ? <CheckIcon /> : <ClipboardIcon />}
    </button>
  )
}
