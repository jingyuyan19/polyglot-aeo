# User friction (Framer platform limits)

Polyglot AEO automates what the Framer Plugin SDK allows. Some steps stay manual by design — document them in support and onboarding so expectations stay aligned with [PRICING.md](./PRICING.md) and the Marketplace listing.

## llms.txt (Framer Pro+ Static Files)

- The plugin **generates** `llms.txt` and per-locale variants; it **cannot** upload files to the site root.
- Users upload via **Domains → Files**, then **Publish**.
- The **Download ZIP** bundle includes `DEPLOY.md` with step-by-step instructions.
- **Published-site verifier** may show HTTP 404 until files are uploaded — that is expected, not a plugin bug.

## Meta (page SEO)

- Framer does not expose an API for plugins to write **Title** / **Page Description** per locale.
- Workflow: generate in Polyglot → switch locale on canvas → open page settings → paste → publish.
- Generated copy is persisted in plugin storage between sessions (`meta/session-persist.ts`).

## CMS localization gaps

- **Control center** counts launch blockers as **missing localized titles + summaries** only. **Slugs** appear in the breakdown but are not added to that blocker count.
- Opening a collection uses `setActiveCollection` + `navigateTo`. We **do not** call `hideUI` — hiding the plugin caused it to close when returning from CMS.
- If Framer does not switch views, users open **CMS** in the left sidebar and pick the same collection name (Owner role required).

## Published-site verification

- Live fetches use the **License Worker** proxy (`GET /verify-fetch`) when `VITE_LICENSE_API_BASE` is set.
- Without the proxy, browser **CORS** may block reads; failures in the plugin do not always mean the live site is broken.
- **AEO control center → Rescan** runs the same checks and feeds `publishedFailureCount` into the readiness score.

## Framer plan limits

- Multiple locales and Static Files require **Framer Pro+** (and locale add-ons). Polyglot cannot raise Framer locale quotas (e.g. “Locale limit exceeded”).

## Complementary tools

- **[Framer AEO scanner](https://www.framer.com/aeo)** — diagnose site-wide issues.
- **Polyglot AEO** — per-locale schema, llms.txt, meta.
- **Loka** — body copy translation; stack with Polyglot for the AEO layer.
