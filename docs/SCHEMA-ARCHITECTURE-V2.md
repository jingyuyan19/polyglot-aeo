# Schema Architecture V2 — Design Doc

**Status**: implemented · **Author**: 内部 · **Date**: 2026-05-07
**Last verified**: 2026-05-29

---

## TL;DR

The current schema generation pipeline (V1) makes **N × M independent AI
calls** that each produce both *page-level content* and *site-level
identity*. Every site-identity field (publisher, author, brand) drifts
across calls and has to be patched post-hoc. We've shipped six rounds
of patches; each new site-identity field will need its own.

**V2** separates **site identity** (one-time, global, cached) from
**per-page content** (per-page, parallel, ephemeral). Identity becomes
consistent **by construction** rather than by patch. We add 5 AI calls
up-front, save ~12% tokens per scan via smaller per-page prompts, and
delete most of the post-hoc normalization machinery.

This document covers the design, migration, fallback chain, persistence,
and out-of-scope items. The core V2 path is implemented in
`src/lib/ai/identity-scan.ts`, `src/lib/schema/identity.ts`,
`src/lib/ai/schema-scan.ts`, and `src/lib/framer/bulk-install.ts`.

---

## 1. Background

### 1.1 What V1 does today

```
                  ┌──────────────────────────────┐
                  │ scanSite()                   │
                  │   → SiteMap (pages + CMS)    │
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ orchestrateScan()            │
                  │   N parallel AI calls        │
                  │   → SchemaProposal[]         │
                  │     (kind + ALL fields)      │  ← publisher,author here
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ orchestrateTranslate()       │
                  │   N × M parallel AI calls    │
                  │   → LocalizedOverrides       │
                  │     (translated ALL fields)  │  ← publisher,author re-translated each call
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ normalizeSiteIdentity()      │  ← post-hoc patches
                  │   walks overrides, rewrites  │     for cross-call consistency
                  │   publisher + author         │
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ bulkInstall() → headEnd      │
                  └──────────────────────────────┘
```

Files (current):

- `src/lib/framer/site-scan.ts` — `scanSite`, `deriveBrandName`
- `src/lib/ai/schema-scan.ts` — `orchestrateScan`, `orchestrateTranslate`
- `src/lib/ai/prompts.ts` — `buildSchemaDetectPrompt`, `buildSchemaTranslatePrompt`
- `src/lib/schema/proposal.ts` — `aiInputsToSchemaInput`, `buildProposal`, placeholder rejection
- `src/lib/schema/site-identity.ts` — `normalizeSiteIdentity`, `resolvePublisherForLocale`, mode-pick author
- `src/lib/framer/bulk-install.ts` — `bulkInstall`, `LocalizedOverrides`

### 1.2 Bug history that motivates V2

Every issue in this list traces back to "independent AI calls have no
shared site context":

| Round | Symptom | Patch added |
|---|---|---|
| 3 | Article publisher = literal `"Site"` | `GENERIC_ORG_PLACEHOLDERS` rejection (Article path) |
| 4 | 5 articles → 4 different publisher names per locale | `resolvePublisherForLocale` + Org name lookup |
| 5 | Brand name leaked into `author` field | `aiAuthorMatchesBrand` rejection guard |
| 6 | Same placeholder author drifted across articles | `pickMode` author + `AUTHOR_PLACEHOLDERS` set |

Each new site-identity-shaped field (e.g. `Organization.foundingDate`,
`Article.copyrightHolder`, `Recipe.recipeCuisine` site-default) would
require its own patch with the same shape: detect drift → introduce
override → write tests. Not extensible.

### 1.3 The structural diagnosis

Site-identity fields are **shared site state**. We've been encoding
shared state into prompts for independent stateless workers and then
trying to converge their outputs after the fact. The cleaner pattern
is to compute shared state once, cache it, and inject it at render
time.

---

## 2. V2 Goals & Non-Goals

### 2.1 Goals

1. **Site-identity consistency by construction.** Fields like
   `publisher.name` and the placeholder `author.name` come from a
   single source of truth, not from N independent AI calls.
2. **Cheaper API**. Translation prompts shrink because they no longer
   carry publisher/author roundtrips; brand-identity is translated
   once per locale, not per (page × locale).
3. **Cacheable**. The site-identity bundle survives across re-scans,
   re-installs, and plugin reloads — re-scan only re-runs per-page
   work unless brand changes.
4. **Extensible**. Adding a new site-level field (e.g. publisher
   logo URL, default author bio) is one entry in `SiteIdentity`,
   not a new normalization layer.
5. **User-visible**. The user can review and override the derived
   identity in one place before installing — much better UX than
   per-card editing for fields that should be uniform.

### 2.2 Non-goals

- Replacing per-page parallelism. Per-page calls stay; they're the
  right granularity for content extraction.
- Removing `normalizeSiteIdentity`. It stays as a defense-in-depth
  belt for AI stochasticity, just thinner.
- Building a translation memory or full glossary system (separate
  P2 follow-up; see §11).
- Changing the bulk-install / customCode merge semantics.
- Changing how proposals are persisted to Framer plugin data (they
  still aren't — 4 KB combined budget). Within one panel session,
  `siteMap` + proposals live in an App-level in-memory cache restored
  after Back / Settings (see `lib/schema/audit-session.ts`).

---

## 3. V2 Architecture

### 3.1 High-level data flow

```
                  ┌──────────────────────────────┐
                  │ scanSite() — UNCHANGED       │
                  └──────────────┬───────────────┘
                                 ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Phase 0: deriveSiteIdentity(siteMap, ai)         1 AI call      │
   │   Picks identity-rich pages (homepage, about,    cached         │
   │   footer-y content) → AI extracts brand fields   plugin-data    │
   │   → SiteIdentity { brandName, defaultAuthor,                    │
   │     defaultPublisher, organizationDescription }                 │
   └─────────────────────────────┬───────────────────────────────────┘
                                 ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Phase 0.5: translateSiteIdentity(identity, locales, ai)         │
   │   M parallel AI calls (one per non-default locale)              │
   │   → SiteIdentityTranslations: Record<localeCode, SiteIdentity>  │
   │   cached                                                         │
   └─────────────────────────────┬───────────────────────────────────┘
                                 ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Phase 1: orchestrateScan(siteMap, identity, ai)                 │
   │   N parallel AI calls (modified prompt — no publisher/author)   │
   │   → SchemaProposal[] (kind + content fields only)               │
   └─────────────────────────────┬───────────────────────────────────┘
                                 ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Phase 2: orchestrateTranslate(proposals, locales, ai)           │
   │   N × M parallel AI calls (modified prompt — no publisher/author)│
   │   → LocalizedOverrides (translated content fields only)         │
   └─────────────────────────────┬───────────────────────────────────┘
                                 ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Render: bulkInstall(proposals, overrides, identityTranslations) │
   │   For each (proposal × locale), assemble JSON-LD by:            │
   │     • content fields ← per-page override                        │
   │     • publisher/author ← identityTranslations[locale]           │
   │     • URL ← localizedUrlFor() (unchanged)                       │
   └─────────────────────────────┬───────────────────────────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ injectIntoHeadEnd() — UNCHANGED│
                  └──────────────────────────────┘
```

### 3.2 Phase responsibilities & invariants

| Phase | Role | Cardinality | Persisted? | Re-runs when |
|---|---|---|---|---|
| Scan | Enumerate pages/CMS | 0 AI calls | No (in-memory) | User clicks Re-scan |
| 0 | Identity extraction | 1 AI call | **Yes** (`SiteIdentity`) | Brand inputs change OR user invalidates OR confidence < threshold |
| 0.5 | Identity translation | M AI calls | **Yes** (`SiteIdentityTranslations`) | Phase 0 re-runs OR new locale appears |
| 1 | Per-page proposal | N AI calls | No | Each Re-scan |
| 2 | Per-page translation | N × M AI calls | No (held in `lastTranslations`) | Each Install |
| Install | Render + inject | 0 AI calls | Snapshot persisted | Each Install |

**Invariant**: every site-identity field rendered into JSON-LD reads
from `SiteIdentityTranslations[locale]` directly. Per-page proposals
**must not** carry publisher/author/etc. for site-default identities
through Phase 1/2. (Real bylines, when present, are page-level and
travel through the per-page path; see §6.)

---

## 4. Detailed Design

### 4.1 Type design

```ts
// src/lib/schema/identity.ts (new file)

/**
 * Site-wide identity fields used across many JSON-LD blocks.
 * Derived once per site (Phase 0), translated once per locale
 * (Phase 0.5), then injected at render time. Persisted across
 * plugin reloads.
 *
 * Compact by design — must round-trip through Framer's plugin
 * data store (2 KB per key, 4 KB combined). Conservative budget:
 * ~250 bytes per locale × ~5 locales = 1.25 KB total.
 */
export interface SiteIdentity {
  /** Display name for Organization.name and Article.publisher.name. */
  brandName: string

  /** Generic byline for Articles without a real author. */
  defaultAuthor: string

  /** Optional Organization description for the about/home page schema. */
  organizationDescription?: string

  /**
   * Confidence in the AI-derived values, 0..1. Below 0.5 we
   * surface a "Review brand identity" prompt before installing.
   * 1.0 means the user typed it themselves.
   */
  confidence: number

  /**
   * Provenance — drives UI ("AI-derived" badge, "Edited" badge,
   * fallback warnings) and decides whether to invalidate cached
   * translations on re-scan.
   */
  source: "ai" | "hostname-fallback" | "user-edit"

  /** When this identity was last computed; used for stale checks. */
  derivedAt: number
}

export type SiteIdentityTranslations = Record<
  string, // locale code
  Pick<SiteIdentity, "brandName" | "defaultAuthor" | "organizationDescription">
>

export interface SiteIdentityBundle {
  identity: SiteIdentity
  translations: SiteIdentityTranslations
  /** Hash of the input pages used in Phase 0 — drives staleness. */
  sourceHash: string
}
```

### 4.2 Phase 0 — `deriveSiteIdentity`

```ts
export async function deriveSiteIdentity(
  siteMap: SiteMap,
  ai: AiCredentials,
): Promise<SiteIdentity>
```

**Input selection**: pick the smallest set of pages that maximises
identity signal. Heuristics:

1. Homepage (always; identified via `siteMap.pages[i].isHomepage`).
2. Pages whose path matches `/about`, `/company`, `/team`, `/contact`
   (case-insensitive, normalized).
3. CMS landing pages (`collectionLanding === true`) — sometimes
   the only place a brand line lives.

Cap at 3 pages, ~6 KB total content, to keep the Phase 0 prompt
focused and cheap.

**AI prompt** (system + user):

```
SYSTEM:
You extract a website's brand identity from a small set of
representative pages. Output a strict JSON object with these
fields:
  brandName              required, 1–60 chars
  defaultAuthor          optional, 1–60 chars; default "Editorial Team"
  organizationDescription optional, 1–280 chars
  confidence             0..1

Rules:
  • brandName = the site's display name as it would appear in
    a header/logo. NOT a generic placeholder ("Site", "Website",
    "Organization", "Brand", "Company"). NOT the page title.
  • defaultAuthor = a generic byline for articles without a
    specific author. If pages show real author names, omit this
    field — we'll keep "Editorial Team" as a placeholder.
  • Reject clearly-template content (e.g. "Hello World",
    "Lorem ipsum", "Your Site").
  • Confidence reflects how much the input pages anchored the
    identity. 0.9+ = explicit branding. 0.4 = guessed from URL.

USER:
Pages:
  1. {path}: {title}
     {bodyText excerpt ≤ 1200 chars}
  2. ...

Hostname-derived fallback (use only if pages have no signal):
  brandName: {deriveBrandName(hostname)}

Return JSON.
```

**Fallback chain** (in `deriveSiteIdentity`):

```
 1. AI succeeds + confidence ≥ 0.5
    → use AI values; source: "ai"
 2. AI succeeds + confidence < 0.5
    → use AI values; source: "ai"; surface "low-confidence" warning
      to user before install
 3. AI succeeds but rejects all candidates as templates/placeholders
    → use hostname-derived brandName + literal defaults;
      source: "hostname-fallback"
 4. AI fails / network error
    → same as case 3
 5. AI returns brandName = generic placeholder
    → fall through resolveOrgLikeName() chain we already have;
      source: "hostname-fallback"
```

### 4.3 Phase 0.5 — `translateSiteIdentity`

```ts
export async function translateSiteIdentity(
  identity: SiteIdentity,
  targetLocales: LocaleInfo[], // non-default only
  ai: AiCredentials,
): Promise<SiteIdentityTranslations>
```

**Strategy**: M parallel calls (one per locale). Each call has a
tiny payload (~150 tokens in, ~150 tokens out) and a strict prompt:

```
SYSTEM:
Translate brand identity into {targetLanguage}. Preserve proper
nouns where appropriate (Acme stays Acme; "Editorial Team" can
become a natural locale equivalent).

Output JSON:
  brandName              required
  defaultAuthor          optional
  organizationDescription optional

Rules:
  • Do NOT translate registered trademarks or company names that
    are typically left in the source language (Apple, Sony…).
  • Output MUST be in {targetLanguage}; mixed-script output is
    rejected (we validate and re-prompt).

USER:
Source identity:
  brandName: "{identity.brandName}"
  defaultAuthor: "{identity.defaultAuthor}"
  organizationDescription: "{identity.organizationDescription}"
```

**Validation** (post-AI, pure):

```ts
function validateLocaleScript(text: string, locale: string): boolean
```

Returns false when output's character set obviously doesn't match
the locale (e.g. Han chars in `nl` text, simplified-CN glyphs in `ja`).
Implementation: [`src/lib/locale-script/`](../src/lib/locale-script/) —
Layer A (cross-script) + **Layer B (OpenCC-derived glyph maps)** +
Layer C (embedded Latin). See [LOCALE-SCRIPT-VALIDATION.md](./LOCALE-SCRIPT-VALIDATION.md).
Failures get re-prompted once; second failure → keep source-language
value, mark cell untranslated.

**Idempotency**: storing per-locale results means adding a new locale
runs Phase 0.5 only for the new locale. Removing a locale from the
project: keep the cached translation (cheap; doesn't break anything;
cleaned up next time the user clicks "Reset identity").

### 4.4 Phase 1 — `orchestrateScan` (modified)

The function signature gains one parameter:

```ts
export async function orchestrateScan(
  params: OrchestrateScanParams & { identity: SiteIdentity },
)
```

**Prompt change** (`buildSchemaDetectPrompt`):

- Add a new section: `Site identity (do NOT echo into your output)`:
  ```
  brandName: {identity.brandName}
  defaultAuthor: {identity.defaultAuthor}
  ```
- Change Article schema instructions:
  > For Article, output `headline`, `description`, `image`, dates.
  > **Do NOT output `author` or `publisher`** — the system injects
  > those from site identity.
- Same for Organization: do NOT output `name` (use the system's
  identity); output description, contactPoint, sameAs only.

**`aiInputsToSchemaInput` change**:

When `kind === "Article"`, ignore any AI-returned `author` /
`publisher` fields entirely. The page-level proposal stops carrying
them. The `ArticleInput` type keeps the fields (still legal to
override per-page), they just default to `"__site-identity__"`
sentinel that bulk-install resolves at render time.

Alternative: add a `ResolvedArticleInput` shape with `publisher` and
`author` filled in, computed at render time. We keep `ArticleInput`
unchanged but downstream code treats empty/sentinel as "use site
identity". (Less typing churn; preferred.)

### 4.5 Phase 2 — `orchestrateTranslate` (modified)

Same prompt-shrink treatment:

- Translation prompt **drops** `publisher` and `author` fields from
  both input and output schemas.
- Output payload shrinks ~25% (varies by kind).
- Same `validateLocaleScript` validation as Phase 0.5.

`LocalizedOverrides[pageId][localeCode]` carries content fields only.

### 4.6 Render-time injection

`bulk-install` gains an `identityTranslations` parameter:

```ts
export interface BulkInstallParams {
  proposals: SchemaProposal[]
  locales: LocaleInfo[]
  defaultLocale: LocaleInfo
  translations?: LocalizedOverrides
  identity: SiteIdentity
  identityTranslations: SiteIdentityTranslations
}
```

For each (proposal, locale), the JSON-LD assembly logic:

```ts
function resolveArticleInput(
  proposal: SchemaProposal,
  locale: LocaleInfo,
  overrides: LocalizedOverrides,
  identity: SiteIdentity,
  identityTranslations: SiteIdentityTranslations,
): ArticleInput {
  const base = locale.isDefault
    ? proposal.inputs as ArticleInput
    : (overrides[proposal.pageId]?.[locale.code] as ArticleInput)
        ?? proposal.inputs as ArticleInput

  // Site-identity injection: per-locale identity wins; falls back
  // to default-locale identity if the locale wasn't translated.
  const localeIdentity = locale.isDefault
    ? identity
    : identityTranslations[locale.code] ?? identity

  return {
    ...base,
    // Per-page override sentinel: if the user typed a real byline,
    // it sticks. If it's empty/sentinel, identity wins.
    authorName:
      base.authorName && base.authorName !== "__site-identity__"
        ? base.authorName
        : localeIdentity.defaultAuthor,
    publisherName: localeIdentity.brandName,
  }
}
```

This is the only place that knows about the publisher/author
fallback. Once it's correct here, no normalization layer exists
downstream.

### 4.7 `normalizeSiteIdentity` after V2

Stays as **defense-in-depth**, slimmer:

- The `pickMode` author logic is **deleted** (placeholders no longer
  travel through translation).
- The publisher mode-pick logic is **deleted** (publisher comes from
  identity translations, not per-page).
- Only branding remains: defensively re-check that the assembled
  Article publisher matches the site identity for that locale, log
  a warning if not (helps catch bugs in the render-time injector).

Net deletion: roughly half the file + ~half the tests in
`site-identity.test.ts`. A meaningful cleanup.

---

## 5. Persistence

### 5.1 Storage keys

Repurpose the already-reserved `OrganizationDefaults` key (currently
unused, see `src/lib/storage.ts` line 287) into the new identity
storage. Two persisted blobs:

| Key | Type | Size estimate |
|---|---|---|
| `identity` (rename from `OrganizationDefaults`) | `SiteIdentity` | ~250 B |
| `identity-translations` (new) | `SiteIdentityTranslations` | ~250 B × M ≤ 1.5 KB |
| `identity-source-hash` (new) | string | ~64 B |

Combined: well under 2 KB even with 6 locales. Doesn't threaten the
4 KB combined budget.

### 5.2 Staleness rules

`identity.derivedAt` + `identity-source-hash` together drive
freshness. On Re-scan:

1. Compute `currentHash = hash(homepage + about + footer pages content)`.
2. If `currentHash === storedHash` and `source === "ai"`: reuse
   identity + translations (no AI calls).
3. If hashes differ: re-run Phase 0; compare new identity to stored.
   - If `brandName` unchanged: keep translations.
   - If `brandName` changed: invalidate translations, re-run Phase 0.5.
4. If `source === "user-edit"`: NEVER auto-invalidate. User edits
   are sticky until the user explicitly clicks "Reset identity".

### 5.3 Migration (V1 → V2 plugin data)

V1 plugin data has no identity. On first V2 mount:

```
if (no stored identity) {
  // We need it before Phase 1 can run, so trigger Phase 0 on next
  // Re-scan. Until then, fall back to hostname-derived identity
  // (instant, no AI call) so the user can still browse the audit
  // view immediately. The Install button stays disabled until
  // identity confidence ≥ 0.5 OR the user clicks "Use this anyway".
  setIdentity(hostnameFallbackIdentity(hostname))
}
```

V1 `InstallSnapshot` doesn't reference identity — it's keyed on
page hashes + locale list. Snapshots from V1 remain valid; V2 just
lays a richer identity on top of the same install record.

---

## 6. UI Surface

### 6.1 Where SiteIdentity lives

Three placement options, ranked:

#### **Option A (recommended)**: top of the audit view, below the hero card

```
┌──────────────────────────────────────────────┐
│ [back]   Schema · AI Audit          [⚙][🌐]  │
├──────────────────────────────────────────────┤
│  AI auto-proposes Schema for every page      │
│  ...                                          │
├──────────────────────────────────────────────┤
│  📍 Site identity                              │
│  Brand: Acme              [✏️]                │
│  Default author: Editorial Team [✏️]          │
│  ⚡ AI-derived · 95% confidence                │
│  [Translate to 4 locales →]                   │
├──────────────────────────────────────────────┤
│  Page proposals (32) ...                      │
└──────────────────────────────────────────────┘
```

- Pros: visible at the moment they matter (before install); inline
  edit doesn't require a route change; collapses after first run.
- Cons: takes vertical space.
- Mitigation: collapse by default after first scan (`>` chevron
  reveals it).

#### Option B: Settings page

- Pros: out of the way; matches "global config" mental model.
- Cons: users won't discover it; first-time identity drift produces
  a confusing audit before the user thinks to look in Settings.
- Verdict: use Settings only as a secondary edit surface.

#### Option C: First-run-only modal

- Pros: forces the user to confirm identity before any cost is paid.
- Cons: yet another modal; locks the user out of browsing the audit
  view; bad if AI Phase 0 fails (the modal becomes a wall).
- Verdict: rejected.

**Conclusion**: Option A primary, Option B as secondary deep-edit.

### 6.2 Identity confidence states

| Confidence | UI state |
|---|---|
| ≥ 0.8 | Compact card, "AI-derived ✓" pill, no warning |
| 0.5 – 0.8 | Same card, amber "Confirm before install" hint |
| < 0.5 | Card expanded by default, red "Review identity" CTA, install button disabled until user confirms or edits |
| `source === "user-edit"` | Card shows "Edited" pill, no warning regardless of original confidence |
| `source === "hostname-fallback"` | Card expanded, gray "AI couldn't determine — using hostname" hint |

### 6.3 Edit affordance

Click ✏️ → inline edit (text input). Save updates `SiteIdentity`,
sets `source: "user-edit"`, invalidates `SiteIdentityTranslations`,
prompts user to re-translate (one click, M AI calls).

---

## 7. Migration Plan

Plan A — **paranoid incremental** (recommended). Plan B — **clean cutover**.

### 7.1 Plan A: incremental, behind a feature flag

Steps, each independently shippable & reversible:

1. **Add types + storage** (`identity.ts`, storage keys). No behavior
   change. Tests for type round-trip.
2. **Implement Phase 0 + tests** (`deriveSiteIdentity`). Don't call
   it yet. Unit tests with mocked AI.
3. **Implement Phase 0.5 + tests** (`translateSiteIdentity`). Same.
4. **Wire Phase 0/0.5 into `handleScan`** under a feature flag
   `EnableIdentityV2`. Default off. UI card hidden.
5. **Render-time injector**: rewrite `bulkInstall` to read identity
   when flag on, fall back to per-page when flag off. New unit
   tests cover both branches.
6. **Phase 1/2 prompt change** behind same flag. Old prompt path
   stays for flag-off.
7. **UI card** behind same flag.
8. **Internal dogfood** for 1–2 days.
9. **Flip the flag on** in a release. Watch for support reports.
10. **Delete the V1 path** + the prompt-version branches + old
    normalizeSiteIdentity author mode-pick code.

Pros: rollback is `flag = false`. Cons: code carries both paths
for ~2 weeks.

### 7.2 Plan B: cutover

Skip the feature flag. Test thoroughly, ship, monitor.

Pros: less code, faster. Cons: harder rollback (have to revert).
Verdict: choose Plan A for first-time architecture changes; Plan B
for follow-ups.

---

## 8. Failure Modes & Defenses

| Failure | Detection | Defense |
|---|---|---|
| Phase 0 AI fails (network/timeout) | `try/catch` in `deriveSiteIdentity` | Hostname-derived identity (instant, no AI). User notified. Re-derive button visible. |
| Phase 0 returns garbage JSON | `aiInputsToSchemaInput`-style parse | Same as above |
| Phase 0 returns valid JSON but `confidence < 0.5` | Field check | Warning banner, install button disabled until confirmed |
| Phase 0.5 fails for one locale | Per-locale `try/catch` | Use default-locale identity for that locale; mark in `untranslated` |
| Mixed-script translation | `validateLocaleScript` post-AI | Re-prompt once; second failure → keep source identity |
| User changes brand name in V2, V1 install snapshot still in CC | `reconcileSnapshot` (already exists) | Snapshot drift handling unchanged |
| User adds new locale post-install | locale-set diff at install time | Trigger Phase 0.5 only for the new locale |
| Plugin data corruption (key but invalid value) | `readJson` returns `null` on parse fail | Treat as "no identity" → trigger Phase 0 on next scan |

---

## 9. Cost & Performance

### 9.1 AI call cost (per full scan, fresh project)

Assume 32 pages, 4 non-default locales, mid-tier model
(~$0.50 per 1M input, $1.50 per 1M output).

| | V1 | V2 (cold) | V2 (cached) |
|---|---|---|---|
| Phase 0 calls | – | 1 | 0 |
| Phase 0.5 calls | – | 4 | 0 |
| Phase 1 calls | 32 | 32 | 32 |
| Phase 2 calls | 128 | 128 | 128 |
| **Total calls** | 160 | 165 | 160 |
| Tokens | ~218 K | ~191 K | ~186 K |
| Estimated $ | $0.27 | $0.24 | $0.23 |

V2 cold path is 5 calls more but ~12% fewer tokens (Phase 1/2
prompts shrink because publisher/author no longer round-trip).
V2 warm path beats V1 on every dimension.

### 9.2 Wall-clock time

Phase 0 + 0.5 add roughly 2 sequential AI rounds (Phase 0 must
finish before 0.5 starts). Estimate +4–8 seconds for the cold path
on first scan; near-zero on cached re-scans.

User perception: cold-path scan today is ~30–60 seconds; +5–8
seconds is barely noticeable, especially since the new "Site
identity" card pops up first and gives the user something to read.

### 9.3 Plugin data budget

| | V1 | V2 |
|---|---|---|
| `InstallSnapshot` | ~400 B | ~400 B (unchanged) |
| `identity` | – | ~250 B |
| `identity-translations` (5 locales) | – | ~1.25 KB |
| `identity-source-hash` | – | ~64 B |
| Other (UI prefs, brand voice…) | ~400 B | ~400 B |
| **Combined** | ~800 B | ~2.4 KB |

Headroom: ~1.6 KB before hitting the 4 KB cap. Acceptable.

---

## 10. Quality Plan

### 10.1 New unit-test surfaces

- `deriveSiteIdentity`:
  - Happy path with mocked AI returning valid JSON
  - AI fails → hostname-fallback path
  - Low confidence → confidence flag set, no exception
  - AI returns generic placeholder → falls through to fallback
  - Page selection picks homepage + about
  - Empty siteMap → hostname-fallback only
- `translateSiteIdentity`:
  - Happy path
  - Per-locale failure isolation
  - Mixed-script validation rejects bad output
  - Empty target locales → empty result
- `bulkInstall` (modified):
  - Identity injection for default locale
  - Identity injection for non-default locale (uses translations)
  - Per-page override beats identity (real byline case)
  - Missing translation for one locale → falls back to default identity
- `normalizeSiteIdentity` (slimmed):
  - Defense-in-depth pass still rewrites publisher when render-time
    bug ships a wrong value (regression catch)

### 10.2 Integration test

End-to-end with mocked AI:
1. Mock Phase 0 → returns brandName="Acme"
2. Mock Phase 0.5 → returns "Acme JA", "Acme NL", etc.
3. Mock Phase 1 → 5 article proposals, no publisher/author
4. Mock Phase 2 → translated headlines/descriptions
5. Run bulkInstall (in-memory) → verify the assembled JSON-LD has
   correct per-locale publisher.name across all 5 articles in all 4
   locales (zero drift).

### 10.3 Manual QA checklist (post-merge)

Add to `docs/TESTING.md`:
- Fresh scan: identity card appears with AI badge
- Edit identity → Save → JSON-LD reflects edit on next install
- Add a locale → only Phase 0.5 runs for the new locale
- Change brandName → identity translations re-run
- Network kill during Phase 0 → falls back to hostname

---

## 11. Out of Scope (Future Work)

Sized for separate proposals:

| ID | Description | Rough size |
|---|---|---|
| **P1 — Output script validation** | `validateLocaleScript` for ALL translated content fields, not just identity. Detects "了你的" mixed-script artifacts. | 0.5 day |
| **P2 — User-editable glossary** | `Settings → Glossary` panel: list of terms + per-locale translations. Injected into every translation prompt as authoritative. | 1.5 days |
| **P3 — Per-locale model override** | Settings: "Use {provider} for {locale}". Routes calls based on locale family (CJK vs European). | 1 day |
| **P4 — Translation memory** | Cache (proposal-content-hash, locale) → translated value. Skip re-translation when content unchanged. | 1 day |
| **P5 — Identity from sitemap.xml** | Fetch and parse the project's published `sitemap.xml` to add canonical URLs and `lastmod` dates. | 0.5 day |

These are **independent** of V2; V2 just makes them easier.

---

## 12. Open Questions (for review)

Each blocks a specific design decision; please answer before
implementation starts.

1. **Q-1: Identity ownership of `Article.publisher.url` and `.logo`?**
   The user's site has a single Organization page (with logo). Should
   `Article.publisher.url` always equal the Organization's url, and
   `.logo` always equal the Organization's logo? My recommendation:
   yes, treat them as site-identity fields too. Cost: 2 more fields
   in `SiteIdentity`. Benefit: same "by construction" consistency.

2. **Q-2: Should the identity card be visible during Phase 0?**
   I.e. show a skeleton "Detecting brand identity…" card with a
   spinner so the user sees Phase 0 happening, OR hide it until
   Phase 0 completes? My recommendation: skeleton-with-spinner; tells
   the user something is happening.

3. **Q-3: Sentinel value for "use site identity"?**
   Internal sentinel string like `"__site-identity__"` is brittle
   (collision with a real author named that). Alternatives:
   - Add `useSiteIdentity: boolean` field to `ArticleInput`.
   - Use `null` (requires changing the type from `string` to `string | null`).

   My recommendation: change type to `string | null`. Slight
   migration churn but cleaner semantics.

4. **Q-4: Phase 0 model strength.**
   Identity extraction is short-context but high-stakes for
   consistency. Worth nudging users toward a stronger model for
   Phase 0 specifically (e.g. if user has both `gpt-4` and
   `gpt-4-mini`, prefer `gpt-4` for Phase 0)? Risks user confusion.
   My recommendation: NO — use whatever provider/model is configured.
   Phase 0 is short enough that mid-tier handles it.

5. **Q-5: Backward-compat horizon.**
   How long do we keep the V1 code path alive behind the flag?
   Suggest: 2 weeks of dogfood, 2 weeks of public release with
   flag flippable, then delete V1.

6. **Q-6: Telemetry.**
   We don't currently emit telemetry. If we did, what would help
   us validate V2 — distribution of identity confidence, drift
   incidents caught by `normalizeSiteIdentity` defense-in-depth?
   Out of scope for V2 itself; design doc only.

---

## 13. Implementation Status

Historical decision log:

- [x] Approved V2 architecture.
- [x] Shipped direct cutover path; no public V1 feature flag remains.
- [x] Implemented Phase 0/0.5 identity extraction + translation.
- [x] Implemented render-time identity injection in bulk install.
- [x] Implemented prompt changes and regression tests.

Implemented breakdown:

| Step | Hours | Reversible? |
|---|---|---|
| Types + storage + migration scaffold | 2 | Yes |
| Phase 0 implementation + tests | 3 | Yes |
| Phase 0.5 implementation + tests | 2 | Yes |
| `bulkInstall` render-time injector + tests | 3 | Yes (flag) |
| Phase 1/2 prompt changes + tests | 2 | Yes (flag) |
| UI identity card | 3 | Yes (flag) |
| Integration test | 1 | n/a |
| Doc updates | 0.5 | n/a |
| QA dogfood | 1 (calendar, not engineering) | n/a |
| Delete V1 path after dogfood | 1 | n/a |
| **Total engineering** | **16h** | |
| **Total calendar (incl. dogfood)** | **~3 days** | |

---

*End of design doc. See sibling docs `TESTING.md`, `LAUNCH-PLAN.md`,
`I18N.md` for context on adjacent surfaces.*
