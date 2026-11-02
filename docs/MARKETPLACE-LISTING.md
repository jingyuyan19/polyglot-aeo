# Marketplace listing copy

Drop-in copy for the Framer Marketplace submission form. Word counts target
the limits Framer enforces today (subject to update).

---

## Plugin name

**Polyglot AEO**

## Byline (≤ 34 chars)

> Fix multilingual Framer AEO

This is the recommended Framer byline. It is short, direct, and
outcome-led: it names the buyer context (multilingual Framer) and the job
to be done (fix AEO) instead of sounding like a generic SEO utility.

Alternative bylines:

- Multilingual AEO QA for Framer
- Locale readiness QA for Framer
- Launch AEO QA for Framer sites

## Tagline (≤ 60 chars)

> AEO launch QA for multilingual Framer sites.

(Alternative: `Schema, metadata & locale QA for Framer.`)

## Short description (≤ 140 chars)

> Find and fix multilingual Framer gaps: per-locale schema, localized
> metadata, CMS checks, live verification, and optional llms.txt exports.

## Long description

Polyglot AEO is a launch-quality control center for multilingual Framer sites.
It helps agencies and founders find, fix, and verify the AEO gaps that appear
right before handoff: missing per-locale schema, untranslated CMS titles,
weak localized metadata, conflicting locale declarations, and live paths that
were never published. Optional llms.txt exports are available for teams and
tools that choose to use the emerging format.

### Native Framer integration

Every output of Polyglot AEO maps to a first-class Framer feature:

- **JSON-LD schema** → injects directly into your site's Custom Code
  (`headEnd`) via the Plugin SDK. One click installs, one click removes.
  Fenced with HTML comments so we can never overwrite snippets you wrote
  manually (GA, Hotjar, Stripe, etc.).
- **Localized meta** → output you paste straight into Framer's Page Settings
  → SEO panel. No external CMS, no syncing.
- **Optional multilingual llms.txt** → generated client-side as a one-click ZIP,
  ready to drag into Framer's Static Files panel (Framer Pro plan and
  above, [official guide][framer-llms]). Once uploaded, files are served
  at `/llms.txt`, `/llms-{locale}.txt` natively from your domain.
  Framer's Plugin SDK doesn't permit programmatic root-file uploads, so
  the final step is a deliberate manual click — this is by design, and
  we surface a "Open this project in Framer" deep link so you don't have
  to hunt through dashboards.

  Google Search does not use llms.txt, so Polyglot AEO does not present the
  file as a ranking requirement and does not include it in the public readiness
  score. It remains an optional handoff/export workflow for compatible systems.

[framer-llms]: https://www.framer.com/help/articles/llms-txt-framer/

Generic AEO plugins ship one schema for your default locale. Multilingual sites
still need accurate public URLs, language declarations, canonicals, metadata,
and schema that match the visible page. Polyglot AEO multiplies that QA work
across every Framer locale you have, automatically.

### What's inside

**1. AI-driven Schema audit.** Click *Scan site* once. Polyglot AEO walks
every page in your Framer project (including CMS detail pages), picks the
right schema.org type for each (Article, Product, LocalBusiness, FAQPage,
Organization), fills the fields from your on-canvas content, and translates
everything natively into every locale you've enabled — not just an
`inLanguage` tag swap. Each proposal is **editable inline** — fix a typo
in the AI's headline without losing its other fields, or hit *Reset to AI
suggestion* to start over. Filter and search the audit list once you have
20+ pages. **One-click Undo** in the install success toast (30 seconds)
reverts everything if the result isn't what you wanted. Bulk-installs into
Framer's Custom Code in one fenced block. A re-scan button surfaces a diff
(new / updated / removed pages) **and preserves your toggle and edit
choices** across re-scans, so curating once is a permanent investment. A
manual mode is one click away for surgical control or unusual page types.

**2. Optional multilingual llms.txt.** Point at a CMS collection; we generate one
`llms.txt` and one `llms-{locale}.txt` per non-default locale, following the
llmstxt.org spec. **Optional AI auto-translate** fills in CMS items that
lack a localized title — the translation goes into the generated file
only, your CMS rows stay untouched so you can review before promoting.
Items the AI can't validate (wrong-script output, suspected
passthroughs) are reported separately so partial translations don't
leak source content silently. Download all generated files as a single
ZIP and drag-drop into Framer's Files panel — the plugin includes a
deep link to your project to skip the dashboard hunt.

**3. AI Localized Meta.** Generate title, meta description, Open Graph, and
Twitter card text in every locale. Our prompts encode language-specific SEO
rules — German 55-char limits, Japanese rewriting (not translation),
Mexican vs Castilian vocabulary, Brazilian vs European Portuguese — so output
reads native, not machine-translated. Every generated field is
**click-to-copy** so designers can paste straight into Framer's SEO panel
without selecting text. **Per-locale regenerate** lets you redo just the
Japanese version if it's off, without spending tokens on the seven other
locales that came out fine the first time.

**4. Managed AI with quota protection.** AI generation runs through Polyglot
AEO's backend using a server-held MiniMax M3 connection, active license
validation, short-lived session tokens, and usage quotas. Users do not paste
third-party AI provider keys into the plugin, and the plugin does not call AI
providers directly from the browser.

**5. Plugin UI in English / 简体中文 / 日本語.** The plugin interface itself
is fully localized — not just the output. Auto-detects from your browser,
override in settings.

### Designer-friendly by construction

A few details that compound into significantly less friction over a project's
lifetime:

- **Settings always one tap away.** Gear icon in the top-right of every
  view jumps into Settings without losing your current view's state — review
  licensing or managed-AI status, hit Back, and resume where you left off.
- **Drafts persist across sessions.** Every form (Schema manual mode, Meta
  AI inputs, Brand voice) auto-saves with 1.5s debounce. Close the plugin
  mid-edit, reopen tomorrow, content is exactly where you left it.
- **Re-scan never destroys curation.** Disable 3 proposals, edit a
  headline on a fourth, click Re-scan — your three disabled stay disabled,
  and the edited headline survives if the page content didn't change. New
  pages get the AI's defaults, changed pages surface a diff badge.
- **30-second Undo on Install.** Mass-installs JSON-LD across 70+ blocks
  and realised something's off? The success toast carries an *Undo* button
  for 30 seconds that reverts the entire Custom Code slot byte-for-byte.
- **Managed AI stays understandable.** Marketplace builds show one managed
  provider and explain the Free/Pro boundary without asking users to paste a
  third-party API key into the plugin.
- **Keyboard parity with native apps.** `Esc` to go back. `Cmd/Ctrl+Enter`
  to fire the primary action. `?` for the full shortcut list — no need to
  remember.
- **AEO Control Center.** The dashboard turns schema, Meta, locale coverage, API
  keys, CMS gaps, locale coverage, and Pro unlock state into a visible
  readiness score with launch blockers.
- **CMS Localization Gap Manager.** Scan title, summary, slug, and duplicate
  title gaps before they leak into public metadata or schema.
- **Published-site verifier.** After publish, check the live homepage,
  parse JSON-LD, confirm `inLanguage`, and verify public locale signals. Optional
  llms files are reported separately from the readiness score.
- **Client report export.** Agencies can download a Markdown report that
  summarizes the site's AEO readiness for handoff.

### Why this exists

Multilingual Framer launches have more public failure points than a
default-locale scan reveals: one locale can canonicalize to another, hreflang
sets can drift, schema language can conflict with visible copy, and CMS metadata
can remain duplicated after translation. Polyglot AEO turns those checks into a
repeatable inside-Framer workflow.

Framer themselves shipped an [AEO scanner](https://www.framer.com/aeo) in
2026. Their scanner offers an ecosystem-level diagnosis; Polyglot AEO focuses
on multilingual implementation and handoff: locale-specific schema, metadata,
CMS gap checks, optional llms exports, and published-site verification.

### Pairs perfectly with

- **Loka Localization Hub** — manage translations in Google Sheets; let
  Polyglot AEO add the AEO layer on top.
- **Ally Auditor** — pair multilingual launch QA with a separate,
  non-certifying accessibility QA pass before handoff.

### Pricing

**Free to install** from the Framer Marketplace. The **Free tier** is useful
before you pay: run the Control Center, preview CMS/localization gaps, install
up to five schema pages, create manual schema for any page count, and generate a
single optional default-locale `llms.txt`. AI generation is included in Pro through
Polyglot AEO managed AI; users do not paste provider keys into the plugin.

**Pro** ($19/mo or $190/yr via [polyglotaeo.com](https://polyglotaeo.com))
unlocks the full multilingual QA loop: every locale, Meta AI generation,
optional per-locale llms files, unlimited schema installs with translation, quality
checks, install history, published-site verification, and client-ready reports.
One Creem license activation per Framer project.

### Framer plan compatibility

Polyglot AEO works with **all Framer plans**, but each Framer plan unlocks
a different set of our features (because Framer itself gates the underlying
publishing capabilities):

| Polyglot AEO feature | Framer Free | Framer Basic ($10) | Framer Pro+ ($30+) |
|---|---|---|---|
| Per-locale JSON-LD (Custom Code injection) | ✅ | ✅ | ✅ |
| AI localized meta (paste into SEO panel) | ✅ | ✅ | ✅ |
| Optional multilingual llms.txt — **deployment via Framer Static Files** | ❌ | ❌ | ✅ |
| Multiple locales themselves (Framer's locale add-on) | ❌ (1 free trial locale) | ❌ | ✅ ($20/locale add-on) |

**Best fit**: Framer Pro+ users with the Multiple Locales add-on. They unlock
every feature and gain the most leverage from per-locale variants.

Basic / Free Framer users can still benefit from Polyglot AEO's Schema and
Meta tools on a single-locale site — the multilingual variants will simply
collapse to one locale until they upgrade their Framer plan.

### What it isn't

Polyglot AEO is not a translation tool. It will not translate your CMS body
content — for that, use Loka or Weglot. It generates SEO metadata and
structured data in each locale you already have configured in Framer.

## Categories

- Primary: **SEO**
- Secondary: **Localization**, **AI**

## Tags

`aeo`, `seo`, `schema-markup`, `json-ld`, `multilingual`, `i18n`,
`structured-data`, `llms-txt`, `localization`, `hreflang`, `metadata`

## Pricing model in Marketplace

Marketplace pricing field: **Free** (with in-plugin upgrade to Pro subscription)

Checkout and license activation: Creem on polyglotaeo.com — see
[CREEM-LICENSING.md](./CREEM-LICENSING.md).

## Cover image — copy direction

A 16:9 hero image showing:
- Left: a stylized Framer canvas with a globe and 6 locale chips (en-US,
  zh-CN, de-DE, ja-JP, es-MX, ar-SA)
- Right: a public readiness report showing canonical, hreflang, schema, and
  metadata checks across the same locale set
- Bottom right: the Polyglot AEO wordmark + tagline

Color: deep indigo `#0B0F19` background, `#7C5CFF` accent (matches in-app
brand).

## Demo video — script outline (60 seconds)

0:00 — Open Framer site with 14 pages (5 static + 9 CMS posts) and 5 locales.
        Empty Custom Code.
0:04 — Open Polyglot AEO. Dashboard shows 5 locales + 14 pages auto-detected.
        Quick gear-icon hover in the top-right.
0:08 — Tap Schema → land in AI Audit view. Click *Scan site*.
0:12 — Progress bar fills: 14 pages analyzed in ~10 seconds. Audit list
        renders — every page tagged with its proposed schema kind and a
        confidence score.
0:22 — Translation phase fires automatically: 14 × 4 = 56 native rewrites,
        ~20 seconds.
0:26 — **Click "Edit fields" on one card** → inline editor expands → tweak
        the AI's headline → Save. Card now shows an *Edited* pill.
0:32 — Click *Install 70 blocks (14 pages × 5 locales)*. Toast: "Installed
        70 JSON-LD blocks across 14 pages."  **An *Undo* button appears
        in the toast** (lingers 30s).
0:38 — **Tap Re-scan** → re-runs detection. The card we edited keeps its
        edit; another page (we changed the H1 on canvas) shows a yellow
        *Changed* pill.
0:44 — Tap Meta AI → paste page intro → click Generate.
0:48 — Results render. Hover over a generated title → click → "Copied"
        flashes. Click *↻ Regenerate* on just the Japanese row.
0:54 — Cut to the published-site verifier showing locale checks pass against
        the production domain.
0:60 — Logo + "Polyglot AEO — verify every locale".
