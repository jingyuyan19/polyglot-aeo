import type { ScannedPage, SiteMap } from "./site-scan"

/**
 * Persisted record of what's currently installed. Lets us detect on re-scan
 * whether the user's site changed since last install, and if so which pages
 * need their schema re-generated.
 *
 * Stored as JSON under `StorageKeys.SchemaSnapshot`. Bumping the schema of
 * this struct? Add a `version` field and migrate.
 */
export interface InstallSnapshot {
  installedAt: number
  /** Map pageId → sourceHash captured when this was installed. */
  pageHashes: Record<string, string>
  /** BCP-47 codes the user generated for. */
  locales: string[]
  /** Total <script> blocks injected (pages × locales for enabled proposals). */
  totalBlocks: number
}

/**
 * Diff between a freshly-scanned SiteMap and the last InstallSnapshot.
 * Used by the UI to surface badges:
 *   - "New": ScannedPage in `added` — user added a page since last install
 *   - "Updated": in `changed` — user edited content
 *   - "Removed": pageId in `removed` — page was deleted
 *   - "OK": in `unchanged` — already installed, content unchanged
 */
export interface SnapshotDiff {
  added: ScannedPage[]
  changed: ScannedPage[]
  removed: string[]
  unchanged: ScannedPage[]
  /** True iff there's any meaningful change (added/changed/removed > 0). */
  needsReinstall: boolean
}

/**
 * Compute a diff. Pure — no IO. Tested.
 *
 * Algorithm: for each page in the *current* scan, check whether its id
 * existed in the snapshot. Yes + same hash → unchanged. Yes + different hash
 * → changed. No → added. Then any snapshot ids not seen in the current scan
 * are `removed`.
 */
export function diffAgainstSnapshot(
  siteMap: SiteMap,
  snapshot: InstallSnapshot | null,
  hashOf: (page: ScannedPage) => string,
): SnapshotDiff {
  const added: ScannedPage[] = []
  const changed: ScannedPage[] = []
  const unchanged: ScannedPage[] = []
  const seen = new Set<string>()

  if (!snapshot) {
    return {
      added: [...siteMap.pages],
      changed: [],
      removed: [],
      unchanged: [],
      needsReinstall: siteMap.pages.length > 0,
    }
  }

  for (const page of siteMap.pages) {
    seen.add(page.id)
    const prevHash = snapshot.pageHashes[page.id]
    if (prevHash === undefined) {
      added.push(page)
    } else if (prevHash !== hashOf(page)) {
      changed.push(page)
    } else {
      unchanged.push(page)
    }
  }

  const removed: string[] = []
  for (const id of Object.keys(snapshot.pageHashes)) {
    if (!seen.has(id)) removed.push(id)
  }

  return {
    added,
    changed,
    removed,
    unchanged,
    needsReinstall: added.length > 0 || changed.length > 0 || removed.length > 0,
  }
}

/**
 * Decide whether a persisted InstallSnapshot is still trustworthy
 * given the current state of Custom Code. Pure — caller fetches
 * `installed` via {@link readInstalledStatus} (or any equivalent
 * source) so this stays unit-testable without SDK mocks.
 *
 * Three legal outcomes:
 *
 *   1. **Trust the snapshot** — return it unchanged. The fence is
 *      present in `headEnd`, so what we last installed is plausibly
 *      still there.
 *
 *   2. **Drift detected → drop the snapshot** — return `null`. The
 *      user manually cleared the polyglot-aeo block from Custom
 *      Code (Framer's UI lets them do this independently of the
 *      plugin). Keeping the stale snapshot would render "Installed"
 *      pills, "Last installed N blocks" cards, and a lying install
 *      button — all referring to schema that doesn't exist on the
 *      live site.
 *
 *   3. **Nothing to reconcile** — `persisted === null`. We never had
 *      a snapshot, so there's nothing to invalidate. The fence may
 *      or may not exist (a previous user could have installed via
 *      a different plugin instance and we just opened the project),
 *      but that's a separate "discovery" problem we don't try to
 *      solve here.
 *
 * The `installed` arg refers ONLY to the presence of OUR fence
 * marker (`<!-- polyglot-aeo:start -->`). Other tools' content
 * elsewhere in `headEnd` doesn't matter.
 */
export function reconcileSnapshot(
  persisted: InstallSnapshot | null,
  installed: boolean,
): { snapshot: InstallSnapshot | null; drift: boolean } {
  if (persisted === null) {
    return { snapshot: null, drift: false }
  }
  if (!installed) {
    return { snapshot: null, drift: true }
  }
  return { snapshot: persisted, drift: false }
}

/**
 * Build a fresh snapshot from a list of proposals + locales + per-page hash.
 * Caller writes this to storage after a successful install.
 */
export function buildSnapshot(
  enabledProposals: Array<{ pageId: string; sourceHash: string }>,
  locales: string[],
): InstallSnapshot {
  const pageHashes: Record<string, string> = {}
  for (const p of enabledProposals) {
    pageHashes[p.pageId] = p.sourceHash
  }
  return {
    installedAt: Date.now(),
    pageHashes,
    locales: [...locales],
    totalBlocks: enabledProposals.length * Math.max(locales.length, 1),
  }
}

/**
 * Discriminated state of the primary install button. The button's label
 * and tooltip are 100% derived from this — see SchemaAuditView's footer.
 *
 * Why a separate ADT rather than inlining ternaries in JSX:
 *
 *   1. The four states have meaningfully different copy and we want
 *      i18n keys to be statically discoverable (one key per state).
 *   2. Easy to unit-test without rendering React.
 *   3. Lets us add a "last-install summary" tooltip per state without
 *      branching on (snapshot, diff, enabledCount) in three places.
 *
 * - `first-install`: no prior snapshot. Default verb is "Install".
 * - `reinstall`:     snapshot exists AND diff says nothing changed (or
 *                    diff isn't available because there's no in-memory
 *                    site map but the user clicked install anyway).
 *                    Useful as a force-rewrite when Custom Code got
 *                    out of sync with the snapshot externally.
 * - `update`:        snapshot exists AND diff detected real changes
 *                    (added/changed/removed). Label includes the diff
 *                    counts so the user knows what's about to change.
 * - `disabled`:      no enabled proposals. The button is rendered but
 *                    can't fire — we still want it visible so the
 *                    audit feels complete (versus "where did the
 *                    button go?").
 */
export type InstallButtonState =
  | {
      kind: "first-install"
      totalBlocks: number
      proposalCount: number
      localeCount: number
    }
  | {
      kind: "reinstall"
      totalBlocks: number
      proposalCount: number
      localeCount: number
    }
  | {
      kind: "update"
      added: number
      changed: number
      removed: number
    }
  | {
      kind: "disabled"
      reason: "no-proposals"
    }

/**
 * Summary of how the NEXT bulk-install would change Custom Code, given
 * the user's current selection of enabled proposals.
 *
 * NOT the same as `diffAgainstSnapshot`'s `SnapshotDiff`:
 *
 *   - {@link diffAgainstSnapshot} answers "what changed on the SITE
 *     between the last install and today?" — used by the snapshot
 *     summary card to surface a "1 new page" badge so users discover
 *     pages they may want to enable.
 *
 *   - {@link summarizeInstallDiff} answers "if I click Install RIGHT
 *     NOW, what will physically change in Custom Code?" — used by
 *     the install button label so it never lies about the effect of
 *     the click.
 *
 * The two views can disagree, and that disagreement is the entire
 * point of having both. Concrete example from production: a fresh
 * scan finds `/blog` (a Collection landing page); our safety-net
 * auto-disables it. SnapshotDiff says "1 added"; install-diff says
 * "0 changes" because the disabled proposal won't be installed.
 * Without this split, the button reads "Update install (1 new)"
 * and then performs zero work — a UX bug.
 */
export interface InstallDiffSummary {
  /** Enabled proposals whose pageId wasn't in the prior snapshot. */
  added: number
  /**
   * Enabled proposals in the snapshot whose `sourceHash` differs from
   * the snapshot's stored hash — content was edited since last install.
   */
  changed: number
  /**
   * pageIds present in the snapshot that are NOT represented by any
   * currently-enabled proposal. Two ways this happens:
   *   1. The page was deleted from the project entirely.
   *   2. The user manually disabled a previously-enabled proposal.
   * Either way, the next install will purge that page's blocks from
   * Custom Code, so we surface it as a meaningful change.
   */
  removed: number
  unchanged: number
  /** True iff at least one of {added, changed, removed} > 0. */
  hasChanges: boolean
}

/**
 * Compute the install-effect diff. Pure, deterministic, no IO.
 *
 * Algorithm:
 *   1. For each enabled proposal: classify against the snapshot's
 *      pageHashes as added/changed/unchanged.
 *   2. For each pageId in the snapshot not seen above: classify as
 *      removed.
 *
 * When `snapshot === null`, every enabled proposal is "added" (this
 * is a first install) and there are no removals.
 */
export function summarizeInstallDiff(
  enabledProposals: ReadonlyArray<{ pageId: string; sourceHash: string }>,
  snapshot: InstallSnapshot | null,
): InstallDiffSummary {
  if (!snapshot) {
    return {
      added: enabledProposals.length,
      changed: 0,
      removed: 0,
      unchanged: 0,
      hasChanges: enabledProposals.length > 0,
    }
  }

  let added = 0
  let changed = 0
  let unchanged = 0
  const seen = new Set<string>()
  for (const p of enabledProposals) {
    seen.add(p.pageId)
    const prevHash = snapshot.pageHashes[p.pageId]
    if (prevHash === undefined) {
      added++
    } else if (prevHash !== p.sourceHash) {
      changed++
    } else {
      unchanged++
    }
  }

  let removed = 0
  for (const id of Object.keys(snapshot.pageHashes)) {
    if (!seen.has(id)) removed++
  }

  return {
    added,
    changed,
    removed,
    unchanged,
    hasChanges: added + changed + removed > 0,
  }
}

export interface DeriveInstallButtonStateInput {
  /**
   * The proposals the user has CURRENTLY enabled. The button state is
   * computed against this exact set — disabled proposals never
   * contribute to the diff so the label can't promise changes that
   * the install won't actually deliver. Caller may pass an empty
   * array; we'll classify that as `disabled`.
   */
  enabledProposals: ReadonlyArray<{ pageId: string; sourceHash: string }>
  localeCount: number
  /** Persisted snapshot of the last successful install, or `null`. */
  snapshot: InstallSnapshot | null
}

/**
 * Derive the install button's state from the current audit context.
 * Pure — no React, no IO. Designed so the React layer can do
 * `installButtonState(...)` once and switch on the discriminant.
 *
 * Decision tree (deliberately ordered by precedence):
 *
 *   1. zero enabled proposals     → disabled. We bail first because
 *      every other branch assumes there's something to install.
 *   2. `snapshot === null`         → first-install.
 *   3. `installDiff.hasChanges`    → update (with the install-effect
 *      diff counts, NOT the full-site diff — see InstallDiffSummary).
 *   4. otherwise                   → reinstall (snapshot exists, the
 *      enabled set hasn't moved, click is a deliberate force-rewrite).
 */
export function deriveInstallButtonState(
  input: DeriveInstallButtonStateInput,
): InstallButtonState {
  if (input.enabledProposals.length === 0) {
    return { kind: "disabled", reason: "no-proposals" }
  }
  const totalBlocks =
    input.enabledProposals.length * Math.max(input.localeCount, 1)

  if (!input.snapshot) {
    return {
      kind: "first-install",
      totalBlocks,
      proposalCount: input.enabledProposals.length,
      localeCount: input.localeCount,
    }
  }

  const installDiff = summarizeInstallDiff(input.enabledProposals, input.snapshot)
  if (installDiff.hasChanges) {
    return {
      kind: "update",
      added: installDiff.added,
      changed: installDiff.changed,
      removed: installDiff.removed,
    }
  }

  return {
    kind: "reinstall",
    totalBlocks,
    proposalCount: input.enabledProposals.length,
    localeCount: input.localeCount,
  }
}
