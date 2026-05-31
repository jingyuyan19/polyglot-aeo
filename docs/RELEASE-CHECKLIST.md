# Release checklist — Polyglot AEO v1.0

Last updated: 2026-05-29

## Submission stance

- Marketplace pricing: **Free tier** + **Pro subscription** (Creem on polyglotaeo.com).
- AI cost model: BYOK; keys stay in Framer plugin data and provider calls happen from the browser.
- License: Creem dynamic checkout + Cloudflare Worker (`api/`) — see [CREEM-LICENSING.md](./CREEM-LICENSING.md).

## Automated gates

- [x] Unit tests: 36 files / 548 tests.
- [x] TypeScript strict typecheck.
- [x] ESLint with zero warnings.
- [x] Production Vite build.
- [x] Marketplace zip created as `plugin.zip`.

## Framer marketplace gates

Based on the 2026 Framer publishing docs:

- [x] `framer.json` exists and uses `modes: ["canvas"]`.
- [x] Plugin name and icon are production-ready.
- [x] Core flows have automated coverage.
- [ ] Creem sandbox: purchase → activate key → Pro unlock → cancel → downgrade.
- [ ] Creem dashboard: enable License Key Management on monthly/yearly products, activation limit = 1.
- [ ] Manual test in Framer with a real multi-locale project (Free + Pro paths).
- [ ] Manual light-mode and dark-mode UI pass.
- [ ] Manual Dashboard pass: AEO Health Score, AEO Control Center, CMS Gap Manager, client report download, published-site verifier.
- [ ] Browser CORS pass with at least Anthropic and OpenAI keys.
- [ ] Optional live provider sweep for non-browser providers before listing them as recommended.

## Manual acceptance pass

Run `docs/TESTING.md` layer 3 before upload. Minimum v1.0 sign-off:

- Dashboard: locales, Quick Start, navigation, shortcuts.
- Schema AI Audit: scan, identity card, inline edit, install, undo, re-scan diff.
- Manual Schema: create/install/remove one schema block.
- llms.txt: scan CMS, generate, download ZIP, verify filenames.
- Meta AI: generate all locales, per-locale regenerate, copy fields.
- Settings: provider save/test, custom provider CRUD, UI locale switch.

## Upload

1. Rebuild from a clean dependency install.
2. Run `npm run pack` or equivalent Framer plugin tools pack command.
3. Upload `plugin.zip` in the Framer Marketplace dashboard.
4. Use `docs/MARKETPLACE-LISTING.md` copy; Marketplace price = Free, Pro via in-plugin upgrade.
