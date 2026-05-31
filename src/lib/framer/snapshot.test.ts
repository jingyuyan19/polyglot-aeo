import { describe, expect, it } from "vitest"

import type { ScannedPage, SiteMap } from "./site-scan"
import {
  buildSnapshot,
  deriveInstallButtonState,
  diffAgainstSnapshot,
  reconcileSnapshot,
  summarizeInstallDiff,
  type InstallSnapshot,
} from "./snapshot"

function page(id: string, hash: string): ScannedPage {
  return {
    id,
    label: id,
    rawPath: `/${id}`,
    url: `https://acme.com/${id}`,
    isHomepage: false,
    source: "static",
    content: { title: id, description: null, bodyText: hash, headings: [] },
  }
}

function siteMap(...pages: ScannedPage[]): SiteMap {
  return {
    baseUrl: "https://acme.com",
    scannedAt: 0,
    pages,
    partial: false,
    brandName: null,
  }
}

const constHash =
  (table: Record<string, string>) =>
  (p: ScannedPage): string =>
    table[p.id] ?? "default"

describe("buildSnapshot", () => {
  it("collects pageId → sourceHash for enabled proposals only", () => {
    const snap = buildSnapshot(
      [
        { pageId: "a", sourceHash: "h-a" },
        { pageId: "b", sourceHash: "h-b" },
      ],
      ["en-US", "ja-JP"],
    )
    expect(snap.pageHashes).toEqual({ a: "h-a", b: "h-b" })
    expect(snap.locales).toEqual(["en-US", "ja-JP"])
    expect(snap.totalBlocks).toBe(4) // 2 pages × 2 locales
    expect(snap.installedAt).toBeGreaterThan(0)
  })

  it("treats zero locales as a single block per page (default-only install)", () => {
    const snap = buildSnapshot([{ pageId: "a", sourceHash: "x" }], [])
    expect(snap.totalBlocks).toBe(1)
  })

  it("clones locales array (no aliasing)", () => {
    const codes = ["en"]
    const snap = buildSnapshot([], codes)
    codes.push("de")
    expect(snap.locales).toEqual(["en"])
  })
})

describe("diffAgainstSnapshot — no prior snapshot", () => {
  it("treats every page as added when snapshot is null", () => {
    const map = siteMap(page("a", "h1"), page("b", "h2"))
    const diff = diffAgainstSnapshot(map, null, constHash({ a: "h1", b: "h2" }))
    expect(diff.added.length).toBe(2)
    expect(diff.changed.length).toBe(0)
    expect(diff.removed.length).toBe(0)
    expect(diff.needsReinstall).toBe(true)
  })

  it("reports needsReinstall=false when both sitemap and snapshot are empty", () => {
    const diff = diffAgainstSnapshot(siteMap(), null, constHash({}))
    expect(diff.needsReinstall).toBe(false)
  })
})

describe("diffAgainstSnapshot — with prior snapshot", () => {
  const prior: InstallSnapshot = {
    installedAt: 1,
    pageHashes: { a: "h1", b: "h2", c: "h3" },
    locales: ["en"],
    totalBlocks: 3,
  }

  it("classifies unchanged / changed / added / removed correctly", () => {
    // a: same hash → unchanged
    // b: different hash → changed
    // d: not in snapshot → added
    // c: in snapshot but not in current scan → removed
    const map = siteMap(page("a", "h1"), page("b", "h2-NEW"), page("d", "h4"))
    const diff = diffAgainstSnapshot(
      map,
      prior,
      constHash({ a: "h1", b: "h2-NEW", d: "h4" }),
    )
    expect(diff.unchanged.map((p) => p.id)).toEqual(["a"])
    expect(diff.changed.map((p) => p.id)).toEqual(["b"])
    expect(diff.added.map((p) => p.id)).toEqual(["d"])
    expect(diff.removed).toEqual(["c"])
    expect(diff.needsReinstall).toBe(true)
  })

  it("reports needsReinstall=false when nothing changed", () => {
    const map = siteMap(page("a", "h1"), page("b", "h2"), page("c", "h3"))
    const diff = diffAgainstSnapshot(
      map,
      prior,
      constHash({ a: "h1", b: "h2", c: "h3" }),
    )
    expect(diff.needsReinstall).toBe(false)
    expect(diff.unchanged.length).toBe(3)
  })

  it("classifies a single content edit as changed", () => {
    const map = siteMap(page("a", "h1"), page("b", "EDITED"), page("c", "h3"))
    const diff = diffAgainstSnapshot(
      map,
      prior,
      constHash({ a: "h1", b: "EDITED", c: "h3" }),
    )
    expect(diff.changed.length).toBe(1)
    expect(diff.changed[0].id).toBe("b")
    expect(diff.needsReinstall).toBe(true)
  })
})

describe("summarizeInstallDiff", () => {
  // This is the install-EFFECT diff (what bulk-install will physically
  // do), distinct from the site-EFFECT diff (`diffAgainstSnapshot`).
  // The label and the truth must agree, otherwise the install button
  // overpromises — see the "1 added but disabled" production bug.

  const SNAPSHOT: InstallSnapshot = {
    installedAt: 1,
    pageHashes: { a: "h1", b: "h2", c: "h3" },
    locales: ["en"],
    totalBlocks: 3,
  }

  it("treats every enabled proposal as added when snapshot is null", () => {
    const summary = summarizeInstallDiff(
      [
        { pageId: "x", sourceHash: "hx" },
        { pageId: "y", sourceHash: "hy" },
      ],
      null,
    )
    expect(summary.added).toBe(2)
    expect(summary.changed).toBe(0)
    expect(summary.removed).toBe(0)
    expect(summary.hasChanges).toBe(true)
  })

  it("reports no changes when nothing is enabled and there's no snapshot", () => {
    const summary = summarizeInstallDiff([], null)
    expect(summary.hasChanges).toBe(false)
  })

  it("classifies enabled proposals against the snapshot's hashes", () => {
    // a: same hash → unchanged
    // b: different hash → changed
    // d: not in snapshot → added
    // c: in snapshot but not enabled → removed
    const summary = summarizeInstallDiff(
      [
        { pageId: "a", sourceHash: "h1" },
        { pageId: "b", sourceHash: "h2-NEW" },
        { pageId: "d", sourceHash: "hd" },
      ],
      SNAPSHOT,
    )
    expect(summary.unchanged).toBe(1)
    expect(summary.changed).toBe(1)
    expect(summary.added).toBe(1)
    expect(summary.removed).toBe(1)
    expect(summary.hasChanges).toBe(true)
  })

  it("hasChanges = false when enabled set matches the snapshot exactly", () => {
    // Re-install scenario: identical enabled set, identical hashes.
    // Click is a deliberate force-rewrite, not an update.
    const summary = summarizeInstallDiff(
      [
        { pageId: "a", sourceHash: "h1" },
        { pageId: "b", sourceHash: "h2" },
        { pageId: "c", sourceHash: "h3" },
      ],
      SNAPSHOT,
    )
    expect(summary.added).toBe(0)
    expect(summary.changed).toBe(0)
    expect(summary.removed).toBe(0)
    expect(summary.unchanged).toBe(3)
    expect(summary.hasChanges).toBe(false)
  })

  it("regression: disabled proposal not counted as added", () => {
    // The bug this whole subsystem exists to prevent. A user installs
    // 3 enabled proposals; later a re-scan finds a 4th page (e.g. a
    // Collection landing) which our safety-net auto-disables. The
    // SITE diff says "1 added"; the INSTALL diff must say "0 changes"
    // because the disabled page won't be installed and clicking the
    // button will be a no-op force-rewrite.
    const summary = summarizeInstallDiff(
      [
        { pageId: "a", sourceHash: "h1" },
        { pageId: "b", sourceHash: "h2" },
        { pageId: "c", sourceHash: "h3" },
        // Note: the new "/blog" page is intentionally NOT in this
        // enabled list — it represents a disabled proposal.
      ],
      SNAPSHOT,
    )
    expect(summary.hasChanges).toBe(false)
  })

  it("classifies a previously-enabled-now-disabled proposal as removed", () => {
    // User toggled "c" off. Snapshot still has it; install will
    // purge it. The button copy must surface this so the user
    // doesn't lose installed schema by mistake.
    const summary = summarizeInstallDiff(
      [
        { pageId: "a", sourceHash: "h1" },
        { pageId: "b", sourceHash: "h2" },
      ],
      SNAPSHOT,
    )
    expect(summary.removed).toBe(1)
    expect(summary.hasChanges).toBe(true)
  })
})

describe("deriveInstallButtonState", () => {
  // Built atop summarizeInstallDiff — these tests verify the
  // discriminated-union mapping and precedence ordering. They
  // intentionally exercise the same scenarios so a future bug in
  // either function fails loudly with a meaningful name.

  const SNAPSHOT: InstallSnapshot = {
    installedAt: 1,
    pageHashes: { a: "h1", b: "h2", c: "h3" },
    locales: ["en", "ja"],
    totalBlocks: 6,
  }

  it("returns disabled when no proposals are enabled", () => {
    // Disabled MUST take precedence so we never compute totalBlocks
    // off zero proposals. We still surface an explicit reason so a
    // future tooltip can explain why the button can't fire.
    const state = deriveInstallButtonState({
      enabledProposals: [],
      localeCount: 4,
      snapshot: SNAPSHOT,
    })
    expect(state.kind).toBe("disabled")
    if (state.kind === "disabled") {
      expect(state.reason).toBe("no-proposals")
    }
  })

  it("returns first-install when there's no snapshot yet", () => {
    const enabled = Array.from({ length: 6 }, (_, i) => ({
      pageId: `p${i}`,
      sourceHash: `h${i}`,
    }))
    const state = deriveInstallButtonState({
      enabledProposals: enabled,
      localeCount: 4,
      snapshot: null,
    })
    expect(state.kind).toBe("first-install")
    if (state.kind === "first-install") {
      expect(state.totalBlocks).toBe(24) // 6 × 4
      expect(state.proposalCount).toBe(6)
      expect(state.localeCount).toBe(4)
    }
  })

  it("returns reinstall when snapshot exists and enabled set is unchanged", () => {
    // Same content as last install — a click is a deliberate force
    // rewrite (e.g. the user manually edited Custom Code and wants
    // the plugin's block back). Wording shifts to "Re-install".
    const state = deriveInstallButtonState({
      enabledProposals: [
        { pageId: "a", sourceHash: "h1" },
        { pageId: "b", sourceHash: "h2" },
        { pageId: "c", sourceHash: "h3" },
      ],
      localeCount: 2,
      snapshot: SNAPSHOT,
    })
    expect(state.kind).toBe("reinstall")
    if (state.kind === "reinstall") {
      expect(state.totalBlocks).toBe(6) // 3 × 2
    }
  })

  it("regression: 'disabled new page' yields reinstall, not update", () => {
    // Production bug we're closing here: snapshot has 3 pages, the
    // re-scan finds a 4th but our safety-net disabled it. The button
    // used to read "Update install (1 new)" then perform zero work.
    // Now it MUST read "Re-install" because that's what actually
    // happens when the user clicks.
    const state = deriveInstallButtonState({
      enabledProposals: [
        { pageId: "a", sourceHash: "h1" },
        { pageId: "b", sourceHash: "h2" },
        { pageId: "c", sourceHash: "h3" },
        // /blog (disabled by collection-landing safety net) is NOT here
      ],
      localeCount: 4,
      snapshot: SNAPSHOT,
    })
    expect(state.kind).toBe("reinstall")
  })

  it("returns update when an enabled proposal has different content hash", () => {
    const state = deriveInstallButtonState({
      enabledProposals: [
        { pageId: "a", sourceHash: "h1-EDITED" },
        { pageId: "b", sourceHash: "h2" },
        { pageId: "c", sourceHash: "h3" },
      ],
      localeCount: 4,
      snapshot: SNAPSHOT,
    })
    expect(state.kind).toBe("update")
    if (state.kind === "update") {
      expect(state.added).toBe(0)
      expect(state.changed).toBe(1)
      expect(state.removed).toBe(0)
    }
  })

  it("returns update with full counts when added/changed/removed all happen", () => {
    const state = deriveInstallButtonState({
      enabledProposals: [
        { pageId: "a", sourceHash: "h1" }, // unchanged
        { pageId: "b", sourceHash: "h2-NEW" }, // changed
        { pageId: "x", sourceHash: "hx" }, // added
        { pageId: "y", sourceHash: "hy" }, // added
        // c is missing -> removed
      ],
      localeCount: 2,
      snapshot: SNAPSHOT,
    })
    expect(state.kind).toBe("update")
    if (state.kind === "update") {
      expect(state.added).toBe(2)
      expect(state.changed).toBe(1)
      expect(state.removed).toBe(1)
    }
  })

  it("update precedence: a single 'removed' (user toggled off) flips to update", () => {
    // Even with no adds/changes, if the user disabled a previously-
    // installed proposal we MUST tell them clicking install will
    // purge that schema — silently re-installing is unsafe.
    const state = deriveInstallButtonState({
      enabledProposals: [
        { pageId: "a", sourceHash: "h1" },
        { pageId: "b", sourceHash: "h2" },
        // c is missing -> removed
      ],
      localeCount: 1,
      snapshot: SNAPSHOT,
    })
    expect(state.kind).toBe("update")
    if (state.kind === "update") {
      expect(state.removed).toBe(1)
    }
  })

  it("computes totalBlocks correctly when localeCount is zero", () => {
    // Defensive: localeCount must clamp to >= 1 so a single-locale
    // project never produces a "0 blocks" install label.
    const state = deriveInstallButtonState({
      enabledProposals: [
        { pageId: "a", sourceHash: "ha" },
        { pageId: "b", sourceHash: "hb" },
        { pageId: "c", sourceHash: "hc" },
      ],
      localeCount: 0,
      snapshot: null,
    })
    if (state.kind !== "first-install") throw new Error("expected first-install")
    expect(state.totalBlocks).toBe(3)
  })

  it("disabled wins over a non-trivial install diff (precedence test)", () => {
    // Even when there's a snapshot AND the enabled set differs from
    // it (here: zero enabled vs 3 in snapshot — meaning install
    // would purge everything), if the user has unchecked every
    // proposal we MUST report disabled. The bulk-install handler
    // refuses an empty enabled set, so promising "purge 3" would
    // be a lie too.
    const state = deriveInstallButtonState({
      enabledProposals: [],
      localeCount: 4,
      snapshot: SNAPSHOT,
    })
    expect(state.kind).toBe("disabled")
  })
})

describe("reconcileSnapshot", () => {
  // Covers the "user manually deleted Custom Code" drift detection:
  // every legal {persisted, fence-present} pair must produce the
  // right (snapshot, drift) outcome — wrong answers either silently
  // erase a healthy install record or paint stale "Installed" pills
  // for schema that's no longer on the live site.
  const SNAPSHOT: InstallSnapshot = {
    installedAt: 0,
    pageHashes: { a: "h1" },
    locales: ["en"],
    totalBlocks: 1,
  }

  it("trusts the snapshot when the fence is present", () => {
    const result = reconcileSnapshot(SNAPSHOT, true)
    expect(result.snapshot).toBe(SNAPSHOT)
    expect(result.drift).toBe(false)
  })

  it("drops the snapshot and flags drift when the fence is missing", () => {
    const result = reconcileSnapshot(SNAPSHOT, false)
    expect(result.snapshot).toBeNull()
    expect(result.drift).toBe(true)
  })

  it("returns null without flagging drift when there was nothing persisted", () => {
    const result = reconcileSnapshot(null, false)
    expect(result.snapshot).toBeNull()
    // We never had a snapshot, so we never "drifted" away from one.
    // Flagging drift here would surface a confusing "snapshot reset"
    // toast on first-ever plugin open.
    expect(result.drift).toBe(false)
  })

  it("returns null without flagging drift when persisted is null even if fence happens to be present", () => {
    // A previously-installed fence (left by another plugin instance,
    // a colleague, or a different project session) is irrelevant when
    // we have nothing on file. Discovery of foreign fences is a
    // separate concern — we don't promote them to "our" snapshot.
    const result = reconcileSnapshot(null, true)
    expect(result.snapshot).toBeNull()
    expect(result.drift).toBe(false)
  })
})
