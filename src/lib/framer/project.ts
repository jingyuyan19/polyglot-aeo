import { framer } from "framer-plugin"

import { FRAMER_PROJECTS_HUB } from "../links"

/**
 * `getProjectInfo().id` is a 64-char privacy hash — Framer docs state it
 * cannot be used to open the project in the browser.
 */
export function isHashedFramerProjectId(id: string): boolean {
  return /^[a-f0-9]{64}$/i.test(id)
}

/** Open the projects dashboard (safe fallback when no editor URL is available). */
export function openFramerProjectsHub(): void {
  window.open(FRAMER_PROJECTS_HUB, "_blank", "noopener,noreferrer")
}

/**
 * Minimize the plugin so the user can use Pages / page settings on the canvas.
 * The plugin only runs inside the editor — there is no valid deep link to reopen it.
 */
export async function focusFramerEditorCanvas(): Promise<void> {
  try {
    await framer.hideUI()
  } catch {
    // hideUI may be unavailable in some modes; caller still shows guidance
  }
}

/**
 * @deprecated Use {@link openFramerProjectsHub} or {@link focusFramerEditorCanvas}.
 */
export async function openCurrentFramerProject(): Promise<void> {
  openFramerProjectsHub()
}

export async function getCurrentProjectId(): Promise<string | null> {
  try {
    const info = await framer.getProjectInfo()
    return info.id
  } catch {
    return null
  }
}
