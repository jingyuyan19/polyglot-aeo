interface IconProps {
  size?: number
}

const baseProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  "aria-hidden": true,
})

export function SchemaIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path
        d="M3 4h10M3 8h7M3 12h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="13" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

export function LlmsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path
        d="M4 3.5h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5.5 6.5h5M5.5 9h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MetaIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path
        d="M8 2.5l1.5 3 3 .5-2.2 2.2.5 3L8 9.7l-2.8 1.5.5-3L3.5 6l3-.5L8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ControlIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path
        d="M3 4h10v8H3V4Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5.5 7h2M5.5 9.5h5M5.5 11h3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CmsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path
        d="M4 3.5h8a1 1 0 0 1 1 1v2.5H3V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3 7h10v5.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M6 9.5h4M6 11h2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function VerifyIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path
        d="M3.2 8.2l2.6 2.6 7-7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 14.2A6.2 6.2 0 1 1 13.7 5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Setup guide — re-open the onboarding wizard. */
export function OnboardingIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path
        d="M4 2.5h8v2H4v-2ZM3 6.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 9h2M5.5 11.5h5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HelpCircleIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.25 6.15A2 2 0 0 1 8.08 4.8c1.05 0 1.82.66 1.82 1.55 0 .7-.39 1.12-1.03 1.55-.58.39-.77.62-.77 1.15v.15"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.05" cy="11.45" r=".65" fill="currentColor" />
    </svg>
  )
}

export function SettingsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M13.5 8a5.5 5.5 0 0 0-.07-.85l1.4-1.07-1.5-2.6-1.65.5a5.5 5.5 0 0 0-1.47-.85L9.5 1.5h-3l-.7 1.63a5.5 5.5 0 0 0-1.47.85l-1.65-.5-1.5 2.6 1.4 1.07A5.5 5.5 0 0 0 2.5 8c0 .29.02.57.07.85L1.18 9.92l1.5 2.6 1.65-.5c.43.34.93.62 1.47.85L6.5 14.5h3l.7-1.63a5.5 5.5 0 0 0 1.47-.85l1.65.5 1.5-2.6-1.4-1.07c.05-.28.07-.56.07-.85Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronRightIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M5 2.5L9.5 7L5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
