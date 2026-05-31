import { framer } from "framer-plugin"
import { useEffect, useState } from "react"

import { TopBar } from "../components/TopBar"
import { useI18n } from "../i18n"
import {
  llmsFilenameForLocale,
  verifyJsonLdHtml,
} from "../lib/aeo/published-verifier"
import { getAllLocales } from "../lib/framer/locales"
import { readString, StorageKeys } from "../lib/storage"

interface Props {
  onBack: () => void
  onOpenSettings: () => void
}

type CheckStatus = "pass" | "fail" | "warn"

interface VerifyCheck {
  id: string
  status: CheckStatus
  label: string
  detail: string
}

async function resolvePublishedBaseUrl(): Promise<string> {
  try {
    const info = await framer.getPublishInfo()
    const url = info.production?.url
    if (url) return url.replace(/\/$/, "")
  } catch {
    // fall through to stored llms setup URL
  }
  const stored = await readString(StorageKeys.BaseUrl)
  return stored?.trim().replace(/\/$/, "") || "https://your-site.framer.website"
}

async function fetchText(url: string): Promise<
  | { ok: true; status: number; text: string }
  | { ok: false; status?: number; error: string }
> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    const text = await res.text().catch(() => "")
    if (!res.ok) return { ok: false, status: res.status, error: text }
    return { ok: true, status: res.status, text }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Fetch failed",
    }
  }
}

export function PublishedVerifierView({ onBack, onOpenSettings }: Props) {
  const { t } = useI18n()
  const [baseUrl, setBaseUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<VerifyCheck[]>([])

  useEffect(() => {
    void resolvePublishedBaseUrl().then(setBaseUrl)
  }, [])

  const runVerify = async () => {
    const normalized = baseUrl.trim().replace(/\/$/, "")
    if (!normalized) return
    setBusy(true)
    try {
      const home = await fetchText(normalized)
      const locales = await getAllLocales()
      const next: VerifyCheck[] = []

      if (home.ok) {
        const html = home.text
        const jsonLd = verifyJsonLdHtml(html)
        const hasDescription = /<meta[^>]+name=["']description["']/i.test(html)
        next.push({
          id: "homepage",
          status: "pass",
          label: t("verify.homepage"),
          detail: t("verify.homepageOk", { status: home.status }),
        })
        next.push({
          id: "schema",
          status:
            jsonLd.schemaCount === 0
              ? "fail"
              : jsonLd.parseErrorCount > 0
                ? "warn"
                : "pass",
          label: t("verify.schema"),
          detail:
            jsonLd.schemaCount === 0
              ? t("verify.schemaMissing")
              : jsonLd.parseErrorCount > 0
                ? t("verify.schemaParseWarning", {
                    n: jsonLd.parseErrorCount,
                  })
                : t("verify.schemaOk", { n: jsonLd.schemaCount }),
        })
        next.push({
          id: "inlanguage",
          status: jsonLd.languages.length > 0 ? "pass" : "warn",
          label: t("verify.inLanguage"),
          detail:
            jsonLd.languages.length > 0
              ? t("verify.inLanguageOk", {
                  languages: jsonLd.languages.join(", "),
                })
              : t("verify.inLanguageMissing"),
        })
        next.push({
          id: "meta",
          status: hasDescription ? "pass" : "warn",
          label: t("verify.meta"),
          detail: hasDescription ? t("verify.metaOk") : t("verify.metaMissing"),
        })
      } else {
        next.push({
          id: "homepage",
          status: "warn",
          label: t("verify.homepage"),
          detail: t("verify.homepageBlocked"),
        })
        next.push({
          id: "schema",
          status: "warn",
          label: t("verify.schema"),
          detail: t("verify.schemaUnknown"),
        })
        next.push({
          id: "meta",
          status: "warn",
          label: t("verify.meta"),
          detail: t("verify.metaUnknown"),
        })
      }

      const llmsResults = await Promise.all(
        locales.map(async (locale) => {
          const filename = llmsFilenameForLocale(locale)
          const res = await fetchText(`${normalized}/${filename}`)
          return { locale, filename, res }
        }),
      )
      for (const { locale, filename, res } of llmsResults) {
        next.push({
          id: `llms:${filename}`,
          status: res.ok ? "pass" : locale.isDefault ? "fail" : "warn",
          label: locale.isDefault
            ? t("verify.llms")
            : t("verify.llmsLocale", { locale: locale.code }),
          detail: res.ok
            ? t("verify.llmsLocaleOk", {
                filename,
                status: res.status,
              })
            : t("verify.llmsLocaleMissing", { filename }),
        })
      }

      setChecks(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar
        title={t("verify.title")}
        onBack={onBack}
        onOpenSettings={onOpenSettings}
      />
      <div className="pa-scroll">
        <section className="pa-card">
          <label className="pa-label">
            {t("verify.siteUrl")}
            <input
              className="pa-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
          <p className="pa-section-helper">{t("verify.helper")}</p>
        </section>

        {checks.length > 0 && (
          <section className="pa-card">
            <span className="pa-section-title">{t("verify.results")}</span>
            <div className="pa-health-list">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className="pa-verify-item"
                  data-state={check.status}
                >
                  <span className="pa-health-marker" aria-hidden="true">
                    {check.status === "pass"
                      ? "✓"
                      : check.status === "fail"
                        ? "!"
                        : "?"}
                  </span>
                  <span className="pa-stack">
                    <span className="pa-health-title">{check.label}</span>
                    <span className="pa-section-helper">{check.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="pa-footer">
        <button
          type="button"
          className="pa-button-primary"
          onClick={() => void runVerify()}
          disabled={busy || !baseUrl.trim()}
        >
          {busy ? t("verify.running") : t("verify.run")}
        </button>
      </div>
    </>
  )
}
