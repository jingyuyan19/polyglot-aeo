# Framer Community Review Remediation Plan

Last updated: 2026-07-08

## Scope

Restore Framer Community eligibility for the plugins that received `Automated Security Review` emails from `creators@framer.com`.

This plan intentionally excludes growth work, social posting, Creem checkout routing, Netlify site work, and unrelated product improvements. Those resume only after the review blockers below are cleared.

## 2026-07-07 Execution Checkpoint

This checkpoint supersedes the 2026-07-06 package hashes below. The 2026-07-06 Marketplace uploads remain useful history, but the current source now contains additional remediation work. Upload the fresh `plugin.zip` files below before sending final follow-up replies.

### Fresh Package Artifacts

| Plugin | Fresh zip | SHA256 | Status |
| --- | --- | --- | --- |
| Polyglot AEO | `/Users/jimmyjing/Developer/NewFramerPlugin/plugin.zip` | `6134efc44bfc678bb0dec33c016ee54b7127a5795e0390a8c0ddf0857d985e9f` | Uploaded and restored |
| Ally Auditor | `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/plugin.zip` | `54e5ae214ef953947d3813f74934c522f812daccffa188458f53d3a56a8d1bc9` | Uploaded and reinstated |
| Loka Localization Hub | `/Users/jimmyjing/Documents/LokaFramerPlugin/plugin.zip` | `80478d9fb974f66025f09ea5eedd04a9c144499953db2766e2b6f554e6fd62c0` | Uploaded and reinstated |
| Gaode Maps Assistant | `/Users/jimmyjing/Documents/GaoDeFramerPlugin/plugin.zip` | `ee075f1c741839b707ebbf979df399cf1f42e471afac1c7ddfd46b557bdd0ee1` | Uploaded and restored |

### Fresh Todos

- [x] Polyglot AEO: remove runtime remote schema rules loading and bundle rules inside the plugin.
- [x] Polyglot AEO: remove the public website schema rules endpoint/header references and rebuild `polyglotaeo-web/out`.
- [x] Polyglot AEO: verify no source or exported site reference remains for `schema-rules-v1`, `VITE_SCHEMA_RULES_URL`, `fetchRemoteSchemaRules`, `remote-rules`, or `polyglotaeo.com/schema`.
- [x] Ally Auditor: require explicit selected-image consent before third-party AI upload.
- [x] Ally Auditor: process selected image uploads sequentially and keep API key/settings in browser-local storage, not Framer shared plugin data.
- [x] Ally Auditor: permission-check `setAttributes` before applying alt text and surface apply errors to users.
- [x] Ally Auditor: harden local storage helpers for settings, license, audit history, and ignore rules.
- [x] Loka Localization Hub: make canvas preview prepare/apply based on selected text layers by default; all-text preview requires explicit opt-in and confirmation.
- [x] Loka Localization Hub: permission-check `TextNode.setText`; reset only touches nodes modified by the confirmed preview.
- [x] Loka Localization Hub: keep published components scoped to `[data-loka-scope]` by default and replace remaining silent catches with warnings.
- [x] Gaode Maps Assistant: serialize generated component values as safe JS literals and add external AMap script load fallback UI.
- [x] Gaode Maps Assistant: guard local storage reads/writes/removes for plugin UI, i18n, and license cache.
- [x] Polyglot build/test/pack completed.
- [x] Ally build/pack completed.
- [x] Loka build/pack completed.
- [x] Gaode build/pack completed.
- [x] Fresh upload bundle created at `/Users/jimmyjing/Developer/NewFramerPlugin/framer-upload-bundle-2026-07-07`.
- [x] Upload/reply runbook created at `/Users/jimmyjing/Developer/NewFramerPlugin/docs/FRAMER-UPLOAD-AND-REPLY-2026-07-07.md`.
- [x] Gmail checked on 2026-07-07: Polyglot has one remaining remote schema-rules blocker; Ally and Loka received more specific second-round blockers; Gaode received recommendations that do not affect current publication status.
- [x] Browser automation attempted on 2026-07-07 but blocked: Chrome MCP timed out, no Chrome DevTools port was available, and macOS UI click automation hung.
- [x] User manually uploaded the fresh packages to Framer Marketplace in this order: Polyglot, Loka, Ally, Gaode.
- [x] Reply sent to Polyglot review thread; Gmail sent message ID `19f3ccaf389bc0b5`.
- [x] Reply sent to Loka review thread; Gmail sent message ID `19f3ccb3dd2388a5`.
- [x] Reply sent to Ally review thread; Gmail sent message ID `19f3ccb879e91590`.
- [x] Reply sent to Gaode review thread; Gmail sent message ID `19f3ccbebceb7529`.
- [x] Framer restored Polyglot AEO to Community; Gmail confirmation message ID `19f3de2d4ba68904`.
- [x] Framer reinstated Loka Localization Hub with latest changes and it is live again; Gmail confirmation message ID `19f3de559899cfb5`.
- [x] Framer reinstated Ally Auditor with latest changes and it is live again; Gmail confirmation message ID `19f3de5a24b9de3b`.
- [x] Framer restored/restored-in-progress Gaode Maps Assistant to Community; Gmail confirmation message ID `19f3de28a83a22fa`.

## Current Mail Evidence

- Ally Auditor review email: 2026-07-06 10:43 UTC, Gmail message `19f37067f16f706d`
- Loka Localization Hub review email: 2026-07-06 10:45 UTC, Gmail message `19f3708b9fba1e04`
- Gaode Maps Assistant review email: 2026-07-06 14:12 UTC, Gmail message `19f37c5e3f236bc5`
- Polyglot AEO restore confirmation: 2026-06-29 13:36 UTC, Gmail message `19f1398855d38202`
- Polyglot AEO visibility guidance: 2026-07-01 14:29 UTC, Gmail message `19f1e15b266439b4`
- Polyglot AEO latest restore confirmation: 2026-07-07, Gmail message `19f3de2d4ba68904`
- Loka Localization Hub latest restore confirmation: 2026-07-07, Gmail message `19f3de559899cfb5`
- Ally Auditor latest restore confirmation: 2026-07-07, Gmail message `19f3de5a24b9de3b`
- Gaode Maps Assistant latest restore confirmation: 2026-07-07, Gmail message `19f3de28a83a22fa`

## Repositories And Commands

### Ally Auditor

- Root: `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor`
- Build: `npm run build`
- Pack: `npm run pack`
- Key scan:
  - `rg "setPluginData|getPluginData|base64|toDataURL|OpenAI|Anthropic|Gemini" src`

### Loka Localization Hub

- Root: `/Users/jimmyjing/Documents/LokaFramerPlugin`
- Build: `npm run build`
- Pack: `npm run pack`
- Key scan:
  - `rg "document.body|MutationObserver|createTreeWalker|setPluginData|getPluginData" code-components src dist`

### Gaode Maps Assistant

- Root: `/Users/jimmyjing/Documents/GaoDeFramerPlugin`
- Build: `npm run build`
- Pack: `npm run pack`
- Key scan:
  - `rg "alert\\(|innerHTML|href=|src=|localStorage|setPluginData|getPluginData" src component dist`

## Priority Order

1. Ally Auditor: highest risk because it involves project image content, external AI providers, API keys, and shared plugin data.
2. Loka Localization Hub: global DOM scanning/mutation behavior can affect unrelated Framer/editor content.
3. Gaode Maps Assistant: generated component HTML safety and sandbox-compatible error handling.

## Global Done Criteria

Each plugin is done only when all of these are complete:

- Source code addresses every blocker from the Framer email.
- Build succeeds.
- Package generation succeeds.
- Risk scan has no unhandled blocker matches.
- New Framer Marketplace version is uploaded.
- A reply is sent to the matching Framer review email summarizing the fixes.
- Gmail is checked for restore confirmation or additional review feedback.

## Ally Auditor Implementation Plan

### Framer Blockers

- Project images are converted to base64 and sent to external AI providers for alt-text generation.
- User-specific data is stored in shared Framer plugin data:
  - settings
  - ignore rules
  - audit history
  - onboarding state
  - API keys
- Shared plugin data should be limited to intentionally shared project state, with permissions, size limits, and error handling.

### Files

- `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/src/utils/storage.ts`
- `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/src/utils/auditHistory.ts`
- `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/src/utils/ignoreRules.ts`
- `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/src/ai/altTextGenerator.ts`
- `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/src/App.tsx`
- `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/src/ui/SettingsPanel.tsx`
- `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/src/ui/Onboarding.tsx`

### Todos

- [x] Replace settings persistence with local-only storage.
- [x] Replace onboarding persistence with local-only storage.
- [x] Replace audit history persistence with local-only storage.
- [x] Replace ignore rules persistence with local-only storage.
- [x] Remove shared plugin data writes for user-private data.
- [x] Add clear local data controls for API/settings.
- [x] Require explicit user consent before any image is loaded, downscaled, encoded, or sent to an AI provider.
- [x] Prefer per-run or per-image consent text that identifies the selected provider.
- [x] Keep the audit-only flow usable without AI image upload.
- [x] Build and scan.
- [x] Upload new Framer version.
- [x] Reply to Framer with exact remediation summary.

### Implementation Notes

- Use `localStorage` for persistent user preferences and API keys unless a specific setting should expire with the browser session.
- Keep Framer shared plugin data out of the default path for private user state.
- If any shared plugin data remains, document why it is intentionally project-shared and enforce a small payload limit.
- Consent must happen before `loadBitmap()`, `downscaleToBase64()`, `dataUrlToBase64()`, or `generateAltText()`.

## Loka Localization Hub Implementation Plan

### Framer Blockers

- Generated components scan and rewrite text nodes across `document.body`.
- Generated components observe `document.body` and rescan all text nodes after DOM changes.
- Submitted plugin appears to be a large compiled bundle; Framer requested readable source or unminified source for review.

### Files

- `/Users/jimmyjing/Documents/LokaFramerPlugin/code-components/LocalizationProvider.tsx`
- `/Users/jimmyjing/Documents/LokaFramerPlugin/code-components/LanguageSwitcher.tsx`
- `/Users/jimmyjing/Documents/LokaFramerPlugin/code-components/TranslatedText.tsx`
- `/Users/jimmyjing/Documents/LokaFramerPlugin/vite.config.ts`
- `/Users/jimmyjing/Documents/LokaFramerPlugin/package.json`

### Todos

- [x] Replace `walkTextNodes(document.body, ...)` with explicit scoped root selection.
- [x] Use a clear opt-in boundary such as `[data-loka-scope]`, a component-owned container, or a configurable target selector.
- [x] Do not rewrite text outside the selected scope.
- [x] Replace `MutationObserver.observe(document.body, { subtree: true })` with observation of the selected scope only.
- [x] Debounce or batch remapping, target 150-250 ms.
- [x] Remove `document.body.style.opacity` writes; if needed, apply loading/opacity only inside the Loka scope.
- [x] Add safe behavior when no scope exists: no global fallback unless the user explicitly opted into global mode with clear boundaries.
- [x] Include readable source or unminified review artifacts in the package.
- [x] Build and scan.
- [x] Upload new Framer version.
- [x] Reply to Framer with exact remediation summary.

### Implementation Notes

- The safest review path is to make Loka operate only on explicit target containers.
- Avoid a silent global fallback. Framer specifically objected to global reads/writes.
- If backward compatibility is needed, expose a clearly named opt-in prop and explain boundaries in code comments.

## Gaode Maps Assistant Implementation Plan

### Framer Blockers

- Generated component code inserts user-provided fields directly into HTML strings.
- Marker labels, info titles, content, images, and links need escaping/sanitization.
- Image and link URLs should be validated against safe protocols such as `https:`.
- Generated component templates use `alert()`, which is unsupported in Framer sandbox.
- API credentials are stored in `localStorage`; Framer recommends clearer remove controls, shorter-lived storage consideration, and avoiding longer persistence than needed.

### Files

- `/Users/jimmyjing/Documents/GaoDeFramerPlugin/src/App.tsx`
- `/Users/jimmyjing/Documents/GaoDeFramerPlugin/src/i18n.ts`
- `/Users/jimmyjing/Documents/GaoDeFramerPlugin/src/license.ts`
- `/Users/jimmyjing/Documents/GaoDeFramerPlugin/component/GaodeMap.tsx`

### Todos

- [x] Add generated-component helper `escapeHtml(value)`.
- [x] Apply escaping to marker labels, search-result labels, info titles, info content, and link text.
- [x] Add generated-component helper `safeUrl(value, allowedProtocols)`.
- [x] Restrict image URLs and custom icon URLs to `https:`.
- [x] Restrict link URLs to `https:`.
- [x] Add `rel="noopener noreferrer"` for generated external links.
- [x] Replace all generated `alert()` calls with inline, non-blocking status messages inside the iframe.
- [x] Add UI control to clear saved API key and security code.
- [x] Consider storing API credentials in `sessionStorage` only if it does not break normal user workflow; otherwise keep `localStorage` with explicit clear control.
- [x] Build and scan.
- [x] Upload new Framer version.
- [x] Reply to Framer with exact remediation summary.

## Execution Log

- [x] 2026-07-06: Gmail reviewed; Framer review blockers identified for Ally, Loka, and Gaode.
- [x] 2026-07-06: Persistent remediation plan created.
- [x] 2026-07-06: Ally Auditor shared plugin data usage removed from source; private user state now uses localStorage.
- [x] 2026-07-06: Ally Auditor AI alt-text flow now requires explicit in-plugin per-image consent before image loading/base64/provider upload.
- [x] 2026-07-06: Ally Auditor `npm run build` succeeded.
- [x] 2026-07-06: Ally Auditor `npm run pack` succeeded and generated `/Users/jimmyjing/Documents/AllyFramerPlugin/ally-a11y-auditor/plugin.zip`.
- [x] 2026-07-06: Ally Auditor Version 2 was submitted to Framer Marketplace based on the confirmed manual upload flow.
- [x] 2026-07-06: Replied to the Ally Auditor Framer review thread with remediation summary; Gmail sent message ID `19f37f62f777f3f5`.
- [x] 2026-07-06: Loka generated components now use a configurable `targetSelector` defaulting to `[data-loka-scope]`, with no `document.body` text scan/observer in source.
- [x] 2026-07-06: Loka observer remapping is scoped and debounced.
- [x] 2026-07-06: Loka build is unminified with sourcemap for reviewability.
- [x] 2026-07-06: Loka `npm run build` succeeded.
- [x] 2026-07-06: Loka `npm run pack` succeeded and generated `/Users/jimmyjing/Documents/LokaFramerPlugin/plugin.zip`.
- [x] 2026-07-06: Loka clean zip verified: 5 files, SHA256 `60fee2b9c4a1e93084c9af1323c3ba0c6833d3112664800658b33007575d11f3`.
- [x] 2026-07-06: Loka Version 2 submitted to Framer Marketplace; page confirmed `New version submitted successfully.`
- [x] 2026-07-06: Replied to the Loka Framer review thread with remediation summary; Gmail sent message ID `19f37f4d9f8ebae3`.
- [x] 2026-07-06: Gaode generated components now escape user-visible text and validate image/link/custom icon URLs against `https:`.
- [x] 2026-07-06: Gaode generated `alert()` calls replaced with iframe-local status messages.
- [x] 2026-07-06: Gaode plugin UI now has an explicit clear saved API credentials control; empty API/security fields remove localStorage values.
- [x] 2026-07-06: Gaode standalone `component/GaodeMap.tsx` updated to match generated-code sanitization patterns, although it is not included by `tsconfig`.
- [x] 2026-07-06: Gaode `npm run build` succeeded.
- [x] 2026-07-06: Gaode `npm run pack` succeeded and generated `/Users/jimmyjing/Documents/GaoDeFramerPlugin/plugin.zip`.
- [x] 2026-07-06: Gaode clean zip verified: 6 files, SHA256 `f3d3415c9903cb6270938643776dbedf36093f52bbf7699348bd422f54c2b736`.
- [x] 2026-07-06: Gaode Version 2 submitted to Framer Marketplace; page confirmed `New version submitted successfully.`
- [x] 2026-07-06: Replied to the Gaode Framer review thread with remediation summary; Gmail sent message ID `19f37f0547c7a35d`.
- [x] 2026-07-06: Ally audit-only flow verified in source: normal scan calls `runFullAudit()` directly, while image loading/base64/provider upload is reachable only after the separate AI Fix and consent flow.
- [x] 2026-07-06: Gmail checked after all three submissions; no Framer restore confirmation or additional Framer review feedback found yet.
- [x] 2026-07-06: Creem Loka compliance thread checked; no newer reply found after our 2026-07-06 12:09 UTC remediation response.
- [x] 2026-07-06: Loka checkout path verified: `getloka.dev` pages contain no direct `creem.io` payment links, the uploaded `plugin.zip` contains only `https://getloka.dev/go/checkout/` as the purchase bridge, and the Worker returns 403 for direct/no-origin or unapproved-origin GET `/checkout-session` requests.
- [x] Ally Auditor package uploaded.
- [x] Loka implementation started.
- [x] Loka package uploaded.
- [x] Gaode implementation started.
- [x] Gaode package uploaded.
- [x] 2026-07-08: Framer restore confirmations checked; all four reviewed plugins are restored/reinstated or explicitly being restored by Framer.
