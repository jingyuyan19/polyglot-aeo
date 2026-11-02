import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

import {
  CmsIcon,
  MetaIcon,
  SchemaIcon,
  SettingsIcon,
  VerifyIcon,
} from "../components/icons"

type PreviewModule = "verify" | "meta"
type PreviewSize = "plugin" | "marketplace"

interface Scenario {
  id: string
  label: string
}

const SCENARIOS: Record<PreviewModule, Scenario[]> = {
  verify: [
    { id: "not-ready", label: "Not ready" },
    { id: "clean", label: "Clean handoff" },
  ],
  meta: [
    { id: "single", label: "Single locale" },
    { id: "multi", label: "Multi-locale" },
  ],
}

const SIZE_PRESETS: Record<PreviewSize, { label: string; width: number; height: number }> = {
  plugin: { label: "Plugin panel", width: 420, height: 760 },
  marketplace: { label: "Marketplace shot", width: 840, height: 1500 },
}

export function PreviewApp() {
  const initialState = useMemo(readInitialPreviewState, [])
  const [module, setModule] = useState<PreviewModule>(initialState.module)
  const [scenarioId, setScenarioId] = useState(initialState.scenarioId)
  const [size, setSize] = useState<PreviewSize>(initialState.size)

  useEffect(() => {
    document.documentElement.dataset.framerTheme = "dark"
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set("preview", "1")
    params.set("module", module)
    params.set("scenario", scenarioId)
    params.set("frame", size)
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
  }, [module, scenarioId, size])

  const scenarios = SCENARIOS[module]
  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0],
    [scenarioId, scenarios],
  )
  const preset = SIZE_PRESETS[size]
  const frameStyle = {
    "--pa-preview-width": `${preset.width}px`,
    "--pa-preview-height": `${preset.height}px`,
  } as CSSProperties

  const handleModuleChange = (next: PreviewModule) => {
    setModule(next)
    setScenarioId(SCENARIOS[next][0].id)
  }

  return (
    <main className="pa-preview-shell">
      <aside className="pa-preview-sidebar">
        <div>
          <p className="pa-preview-kicker">Polyglot AEO</p>
          <h1>Preview Lab</h1>
          <p>
            Stable coded mockups for product review. These screens use fixed
            fake data and the plugin visual language, so screenshots stay
            repeatable.
          </p>
        </div>

        <fieldset>
          <legend>Module</legend>
          <SegmentButton
            active={module === "verify"}
            label="Published verifier"
            onClick={() => handleModuleChange("verify")}
          />
          <SegmentButton
            active={module === "meta"}
            label="Meta handoff"
            onClick={() => handleModuleChange("meta")}
          />
        </fieldset>

        <fieldset>
          <legend>Scenario</legend>
          {scenarios.map((scenario) => (
            <SegmentButton
              key={scenario.id}
              active={scenario.id === activeScenario.id}
              label={scenario.label}
              onClick={() => setScenarioId(scenario.id)}
            />
          ))}
        </fieldset>

        <fieldset>
          <legend>Frame</legend>
          {Object.entries(SIZE_PRESETS).map(([key, presetOption]) => (
            <SegmentButton
              key={key}
              active={key === size}
              label={`${presetOption.label} - ${presetOption.width}x${presetOption.height}`}
              onClick={() => setSize(key as PreviewSize)}
            />
          ))}
        </fieldset>

        <div className="pa-preview-note">
          Open with <code>?preview=1</code>. Use browser screenshots or Playwright
          at a fixed viewport for marketplace-ready comparisons.
        </div>
      </aside>

      <section className="pa-preview-stage" aria-label="Preview frame">
        <div className="pa-preview-frame-meta">
          <strong>{activeScenario.label}</strong>
          <span>{preset.label}</span>
        </div>
        <div className="pa-preview-frame" style={frameStyle}>
          {module === "verify" ? (
            <PublishedVerifierPreview scenario={activeScenario.id} />
          ) : (
            <MetaHandoffPreview scenario={activeScenario.id} />
          )}
        </div>
      </section>
    </main>
  )
}

function SegmentButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="pa-preview-segment"
      data-active={active ? "true" : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function readInitialPreviewState(): {
  module: PreviewModule
  scenarioId: string
  size: PreviewSize
} {
  const params = new URLSearchParams(window.location.search)
  const rawModule = params.get("module")
  const module: PreviewModule = rawModule === "meta" ? "meta" : "verify"
  const rawScenario = params.get("scenario")
  const scenarioId =
    rawScenario && SCENARIOS[module].some((scenario) => scenario.id === rawScenario)
      ? rawScenario
      : SCENARIOS[module][0].id
  const rawFrame = params.get("frame")
  const size: PreviewSize = rawFrame === "marketplace" ? "marketplace" : "plugin"
  return { module, scenarioId, size }
}

function PluginChrome({
  title,
  step,
  children,
  footer,
}: {
  title: string
  step: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="pa-preview-plugin">
      <header className="pa-preview-plugin-header">
        <span className="pa-preview-brand">
          <img src="/icon.svg" alt="" />
          <strong>Polyglot AEO (Preview)</strong>
        </span>
        <span aria-hidden="true">x</span>
      </header>
      <nav className="pa-preview-plugin-topbar">
        <button type="button">&lt; Back</button>
        <strong>{title}</strong>
        <span className="pa-preview-plugin-actions">
          <span>EN</span>
          <SettingsIcon size={15} />
        </span>
      </nav>
      <div className="pa-preview-stepbar">
        <span className="pa-preview-dots" aria-hidden="true">
          <i data-active="true" />
          <i />
          <i />
        </span>
        <strong>{step}</strong>
      </div>
      <div className="pa-preview-scroll">{children}</div>
      <footer className="pa-preview-plugin-footer">{footer}</footer>
    </div>
  )
}

function PublishedVerifierPreview({ scenario }: { scenario: string }) {
  const clean = scenario === "clean"
  const summary = clean
    ? {
        score: 96,
        status: "Ready to hand off",
        detail: "0 critical issues - 1 note",
        tone: "success",
        failures: "0",
        llms: "4",
        schema: "72",
        meta: "OK",
      }
    : {
        score: 42,
        status: "Not ready after publish",
        detail: "3 critical issues - 2 warnings",
        tone: "danger",
        failures: "4",
        llms: "1/4",
        schema: "Missing",
        meta: "OK",
      }

  const blockers = clean
    ? []
    : [
        {
          title: "JSON-LD missing on homepage",
          text: "Install schema, publish the site, then run this check again.",
          action: "Open schema audit",
        },
        {
          title: "llms.txt is not live",
          text: "Upload the generated file to Framer Domains -> Files.",
          action: "Open llms.txt guide",
        },
        {
          title: "3 locale llms files returned 404",
          text: "llms-ja.txt, llms-ko.txt, and llms-fr.txt are not reachable yet.",
          action: "View deploy guide",
        },
      ]

  return (
    <PluginChrome
      title="Published-site verifier"
      step="Post-publish QA"
      footer={
        <>
          <button type="button" className="pa-footer-secondary">Copy report</button>
          <button type="button" className="pa-button-primary">Run live check</button>
        </>
      }
    >
      <section className="pa-preview-hero" data-tone={summary.tone}>
        <div className="pa-preview-hero-main">
          <ScoreRing value={summary.score} label="live" tone={summary.tone} />
          <div>
            <p className="pa-preview-kicker">Published QA</p>
            <h2>{summary.status}</h2>
            <strong>{summary.detail}</strong>
            <p>Checked https://studio.example.com after the latest publish.</p>
          </div>
        </div>
        <div className="pa-preview-metrics">
          <Metric icon={<VerifyIcon />} value={summary.failures} label="live failures" />
          <Metric icon={<LlmsIconLite />} value={summary.llms} label="llms files live" />
          <Metric icon={<SchemaIcon />} value={summary.schema} label="schema blocks" />
          <Metric icon={<MetaIcon />} value={summary.meta} label="meta description" />
        </div>
      </section>

      <section className="pa-preview-card">
        <div className="pa-preview-section-head">
          <h3>{clean ? "Passed checks" : "Fix before handoff"}</h3>
          <span>{clean ? "5 passed" : `${blockers.length} blockers`}</span>
        </div>
        <div className="pa-preview-result-list">
          {clean ? (
            <>
              <ResultRow state="pass" title="Homepage reachable" detail="Fetched HTML with HTTP 200." />
              <ResultRow state="pass" title="JSON-LD present" detail="Found Organization and Article schema with inLanguage." />
              <ResultRow state="pass" title="llms paths reachable" detail="Default and locale-specific files are live." />
              <ResultRow state="warn" title="Meta description is short" detail="Acceptable, but a stronger localized description may improve snippets." />
            </>
          ) : (
            blockers.map((blocker) => (
              <ResultRow
                key={blocker.title}
                state="fail"
                title={blocker.title}
                detail={blocker.text}
                action={blocker.action}
              />
            ))
          )}
        </div>
      </section>

      {!clean && (
        <section className="pa-preview-card">
          <div className="pa-preview-section-head">
            <h3>Passed</h3>
            <span>2 checks</span>
          </div>
          <ResultRow state="pass" title="Homepage reachable" detail="Fetched homepage HTML with HTTP 200." />
          <ResultRow state="pass" title="Meta description present" detail="Found a meta description tag." />
        </section>
      )}
    </PluginChrome>
  )
}

function MetaHandoffPreview({ scenario }: { scenario: string }) {
  const multi = scenario === "multi"
  const locales = multi ? ["en", "ja", "ko", "fr"] : ["en"]

  return (
    <PluginChrome
      title="Meta copy generator"
      step="3/3 - Copy to Framer"
      footer={
        <>
          <button type="button" className="pa-footer-secondary">Back</button>
          <button type="button" className="pa-button-primary">Finish handoff</button>
        </>
      }
    >
      <section className="pa-preview-hero" data-tone="accent">
        <p className="pa-preview-kicker">Copy handoff</p>
        <h2>Copy meta into Framer</h2>
        <p>
          Copy one locale, paste it into Page settings, then move to the next
          language.
        </p>
        <div className="pa-preview-metrics pa-preview-metrics--three">
          <Metric icon={<MetaIcon />} value="Home" label="page" />
          <Metric icon={<LocaleGlyph value={locales[0]} />} value={locales[0]} label="current locale" />
          <Metric icon={<VerifyIcon />} value={multi ? "1/4" : "0/1"} label="copied" />
        </div>
        <div className="pa-preview-action-row">
          <button type="button" className="pa-button-primary">Copy all fields</button>
          <button type="button" className="pa-footer-secondary">Show canvas</button>
        </div>
      </section>

      {multi && (
        <div className="pa-preview-locale-tabs">
          {locales.map((locale, index) => (
            <button key={locale} type="button" data-active={index === 1 ? "true" : undefined}>
              {locale}
            </button>
          ))}
        </div>
      )}

      <section className="pa-preview-card pa-preview-copy-card">
        <div className="pa-preview-section-head">
          <h3>{multi ? "Japanese" : "English"}</h3>
          <span>No issues</span>
        </div>
        <FieldRow label="Title" count="53 chars" value="Digital Design Studio | UX/UI, Branding & Development" />
        <FieldRow
          label="Meta description"
          count="133 chars"
          value="We craft high-converting digital designs that drive real results. Our studio delivers UX/UI, branding, and development."
          multiline
        />
        <details className="pa-preview-fold">
          <summary>Open Graph & Twitter</summary>
          <FieldRow label="OG title" count="48 chars" value="Digital design that turns strategy into launch-ready brands" multiline />
        </details>
      </section>

      <details className="pa-preview-card pa-preview-help">
        <summary>Need help pasting into Framer?</summary>
        <ol>
          <li>Switch to the target locale in the Framer canvas top bar.</li>
          <li>Open the page settings from the Pages list.</li>
          <li>Paste Title, Page Description, and social fields.</li>
        </ol>
      </details>
    </PluginChrome>
  )
}

function ScoreRing({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: string
}) {
  return (
    <div
      className="pa-preview-score-ring"
      data-tone={tone}
      style={{ "--pa-preview-score": `${value}%` } as CSSProperties}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function Metric({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: string
  label: string
}) {
  return (
    <div className="pa-preview-metric">
      {icon}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  )
}

function ResultRow({
  state,
  title,
  detail,
  action,
}: {
  state: "pass" | "fail" | "warn"
  title: string
  detail: string
  action?: string
}) {
  return (
    <div className="pa-preview-result" data-state={state}>
      <span className="pa-preview-result-marker" aria-hidden="true">
        {state === "pass" ? "OK" : state === "fail" ? "!" : "?"}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        {action && <button type="button">{action}{" ->"}</button>}
      </div>
    </div>
  )
}

function FieldRow({
  label,
  count,
  value,
  multiline,
}: {
  label: string
  count: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="pa-preview-field">
      <div>
        <span>{label}</span>
        <small>{count}</small>
      </div>
      <button type="button" data-multiline={multiline ? "true" : undefined}>
        <strong>{value}</strong>
        <span>Copy</span>
      </button>
    </div>
  )
}

function LocaleGlyph({ value }: { value: string }) {
  return <span className="pa-preview-locale-glyph">{value}</span>
}

function LlmsIconLite() {
  return <CmsIcon size={16} />
}
