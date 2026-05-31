import { framer } from "framer-plugin"

/**
 * Open the current Framer project in the browser (Pro listing trust).
 * Falls back to the generic projects hub when project info is unavailable.
 */
export async function openCurrentFramerProject(): Promise<void> {
  try {
    const info = await framer.getProjectInfo()
    const url = `https://framer.com/projects/${info.id}`
    window.open(url, "_blank", "noopener,noreferrer")
  } catch {
    window.open("https://framer.com/projects/", "_blank", "noopener,noreferrer")
  }
}

export async function getCurrentProjectId(): Promise<string | null> {
  try {
    const info = await framer.getProjectInfo()
    return info.id
  } catch {
    return null
  }
}
