import { framer } from "framer-plugin"

export type OpenCmsCollectionResult =
  | { ok: true; navigated: boolean }
  | { ok: false; reason: "not_found" | "error" }

async function tryNavigateToCollection(
  collection: Awaited<ReturnType<typeof framer.getCollections>>[number],
): Promise<{ selected: boolean; navigated: boolean }> {
  let selected = false

  try {
    await collection.navigateTo()
    return { selected: true, navigated: true }
  } catch {
    // continue — may be blocked in canvas mode
  }

  try {
    await framer.navigateTo(collection.id)
    return { selected: true, navigated: true }
  } catch {
    // continue
  }

  try {
    await collection.setAsActive()
    selected = true
  } catch {
    // continue
  }

  return { selected, navigated: false }
}

/**
 * Focus a CMS collection in Framer. Uses every navigation path the host
 * supports; succeeds if at least one selects the collection.
 */
export async function openCmsCollection(
  collectionId: string,
): Promise<OpenCmsCollectionResult> {
  let collections: Awaited<ReturnType<typeof framer.getCollections>>
  try {
    collections = await framer.getCollections()
  } catch {
    return { ok: false, reason: "error" }
  }

  const collection = collections.find((c) => c.id === collectionId)
  if (!collection) return { ok: false, reason: "not_found" }

  const { selected, navigated } = await tryNavigateToCollection(
    collection,
  )
  if (!selected) return { ok: false, reason: "error" }

  // Do not call hideUI — Framer does not reopen the plugin when the user
  // leaves CMS. Keeping the panel open lets「返回」return to the dashboard.
  return { ok: true, navigated }
}
