import { useI18n } from "../../i18n"
import type { GeneratedLlmsFile } from "./types"

interface Props {
  generated: GeneratedLlmsFile[]
  onDownloadAll: () => void
  onOpenFramerProject: () => void
}

export function LlmsDeployStep({
  generated,
  onDownloadAll,
  onOpenFramerProject,
}: Props) {
  const { t } = useI18n()
  const defaultPath = formatDeployPath("llms.txt")
  const localizedExample =
    generated.find((file) => file.filename !== "llms.txt")?.filename ??
    "llms-<locale>.txt"
  const readyLabel =
    generated.length === 1
      ? t("llms.deployFileReady")
      : t("llms.deployFilesReady", { n: generated.length })

  return (
    <section className="pa-section">
      <span className="pa-section-title">{t("llms.deployTitle")}</span>
      <div className="pa-deploy-guide">
        <div className="pa-deploy-guide-header">
          <span className="pa-deploy-guide-title">
            {readyLabel}
          </span>
          <span className="pa-pill" data-tone="accent">
            {t("llms.deployPlanBadge")}
          </span>
        </div>
        <div className="pa-deploy-file-list" aria-label={t("llms.deployFilesLabel")}>
          {generated.map((file) => (
            <span key={file.filename} className="pa-chip">
              {file.filename}
            </span>
          ))}
        </div>
        <ol className="pa-deploy-guide-steps">
          <li>
            {t("llms.deployStepDownload")}
            {generated.length > 1 && (
              <div className="pa-deploy-action-row">
                <button
                  type="button"
                  className="pa-pill-button"
                  data-tone="accent"
                  onClick={onDownloadAll}
                  title={t("llms.downloadAllHint")}
                >
                  {t("llms.downloadAll", { n: generated.length })}
                </button>
              </div>
            )}
          </li>
          <li>
            {t("llms.deployStepFramer")}
            <div className="pa-deploy-action-row">
              <button
                type="button"
                className="pa-link"
                onClick={onOpenFramerProject}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                {t("llms.deployStepOpenProject")}
              </button>
              <a
                href="https://www.framer.com/help/articles/llms-txt-framer/"
                target="_blank"
                rel="noreferrer noopener"
                className="pa-link"
              >
                {t("llms.deployStepFramerLink")}
              </a>
            </div>
          </li>
          <li>{t("llms.deployStepPublish")}</li>
        </ol>
        <p className="pa-section-helper">
          {t("llms.deployOtherHosting", {
            default: defaultPath,
            localized: formatDeployPath(localizedExample),
          })}
        </p>
      </div>
    </section>
  )
}

function formatDeployPath(filename: string) {
  return `/${filename.replace(/^\/+/, "")}`
}
