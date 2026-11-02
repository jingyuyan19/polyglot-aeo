# Release checklist — Polyglot AEO v1.0

Last updated: 2026-06-22

## Submission stance

- Marketplace pricing: **Free tier** + **Pro subscription** (Creem on polyglotaeo.com).
- AI cost model: managed AI through the Cloudflare Worker; provider keys stay server-side, and browser calls only Polyglot AEO endpoints.
- License: Creem dynamic checkout + Cloudflare Worker (`api/`) — see [CREEM-LICENSING.md](./CREEM-LICENSING.md).

## Automated gates

- [x] Unit tests: 50 files / 602 tests.
- [x] TypeScript strict typecheck.
- [x] ESLint with zero warnings.
- [x] Production Vite build.
- [x] Marketplace zip created as `plugin.zip`.
- [x] Plugin package check confirms `plugin.zip` contains the `/go/checkout/`
      tracking bridge and is newer than `dist/`.

## Framer marketplace gates

Based on the 2026 Framer publishing docs and current `framer.json`:

- [x] `framer.json` exists and uses `modes: ["canvas"]`.
- [x] Plugin name and icon are production-ready.
- [x] Core flows have automated coverage.
- [ ] Creem sandbox: purchase → activate key → Pro unlock → cancel → downgrade.
- [ ] Creem dashboard: enable License Key Management on monthly/yearly products, activation limit = 1.
- [ ] Manual test in Framer with a real multi-locale project (Free + Pro paths).
- [ ] Manual light-mode and dark-mode UI pass.
- [ ] Manual Dashboard pass: AEO Health Score, AEO Control Center, CMS Gap Manager, client report download, published-site verifier.
- [ ] Worker live AI smoke test with MiniMax M3 and a Pro license.
- [ ] Browser network pass confirming no direct AI-provider requests leave the plugin.

## Manual acceptance pass

Run `docs/TESTING.md` layer 3 before upload. Minimum v1.0 sign-off:

- Dashboard: locales, Quick Start, navigation, shortcuts.
- Schema AI Audit: scan, identity card, inline edit, install, undo, re-scan diff.
- Manual Schema: create/install/remove one schema block.
- llms.txt: scan CMS, generate, download ZIP, verify filenames.
- Meta AI: generate all locales, per-locale regenerate, copy fields.
- Settings: license activation, managed AI disclosure, brand voice, UI locale switch.

## Upload

1. Rebuild from a clean dependency install.
2. Run `npm run pack` or equivalent Framer plugin tools pack command.
3. Run `pnpm release:plugin-check`; it must pass before upload.
4. Run `pnpm release:marketplace-brief`; use the generated
   `.tmp/framer-marketplace-update.md` for the upload path, package hash, and
   Changes text.
5. Upload `plugin.zip` from the public plugin page: **More options → New
   Version**.
6. Use `docs/MARKETPLACE-LISTING.md` copy; Marketplace price = Free, Pro via in-plugin upgrade.

## Netlify production deploy guardrail

Do not use `polyglotaeo-web` production deploys for iterative copy, form,
tracking, checkout, or preflight debugging. The 2026-06-30 launch work ran 20
successful production deploys in one Asia/Shanghai day, which consumed the full
300-credit Netlify Free allowance at 15 credits per production deploy.

Use local builds and preview/branch deploys while iterating. Batch production
changes into a single final deploy only after local build, checkout-origin,
tracking freshness, and marketplace preflight checks are ready.

## Current upload note

The 2026-06-30 package routes in-plugin Upgrade clicks through
`https://polyglotaeo.com/go/checkout/` before the Worker/Creem checkout. Upload
the newly generated `plugin.zip` so live users emit `checkout_click` events with
plan, Pro gate reason, project id, and UTM attribution.
