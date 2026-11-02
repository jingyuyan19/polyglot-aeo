# Framer Upload And Reply Runbook - 2026-07-07

## Current Status

Resolved status:

- User manually uploaded all four fresh zip packages on 2026-07-07.
- Replies were sent to the matching Framer review threads after upload.
- Framer replied that all four resources have been restored/reinstated and are live again.

Earlier browser automation note:

- Chrome MCP times out while naming/claiming the session.
- Chrome has no local DevTools debugging port.
- macOS UI click automation via System Events is blocked/hanging.

## Sent Reply Log

| Plugin | Replied to latest message id | Sent Gmail message id |
| --- | --- | --- |
| Polyglot AEO | `19f3c46d37ecfce5` | `19f3ccaf389bc0b5` |
| Loka Localization Hub | `19f3c078c7202992` | `19f3ccb3dd2388a5` |
| Ally Auditor | `19f3c14c4113dfe4` | `19f3ccb879e91590` |
| Gaode Maps Assistant | `19f3bff2acaeaff4` | `19f3ccbebceb7529` |

## Restore Confirmation Log

| Plugin | Framer confirmation message id | Result |
| --- | --- | --- |
| Polyglot AEO | `19f3de2d4ba68904` | Restored to Community: `https://www.framer.com/community/resources/plugins/polyglot-aeo` |
| Loka Localization Hub | `19f3de559899cfb5` | Reinstated with latest changes and live again |
| Ally Auditor | `19f3de5a24b9de3b` | Reinstated with latest changes and live again |
| Gaode Maps Assistant | `19f3de28a83a22fa` | Restoring/restored to Community: `https://www.framer.com/community/resources/plugins/gaode-maps-assistant` |

## Upload Bundle

Folder:

`/Users/jimmyjing/Developer/NewFramerPlugin/framer-upload-bundle-2026-07-07`

Files:

| Order | Plugin | File | SHA256 |
| --- | --- | --- | --- |
| 1 | Polyglot AEO | `01-polyglot-aeo-plugin.zip` | `6134efc44bfc678bb0dec33c016ee54b7127a5795e0390a8c0ddf0857d985e9f` |
| 2 | Loka Localization Hub | `02-loka-localization-hub-plugin.zip` | `80478d9fb974f66025f09ea5eedd04a9c144499953db2766e2b6f554e6fd62c0` |
| 3 | Ally Auditor | `03-ally-auditor-plugin.zip` | `54e5ae214ef953947d3813f74934c522f812daccffa188458f53d3a56a8d1bc9` |
| 4 | Gaode Maps Assistant | `04-gaode-maps-plugin.zip` | `ee075f1c741839b707ebbf979df399cf1f42e471afac1c7ddfd46b557bdd0ee1` |

## Manual Upload Steps

1. Open the owner-facing Community Marketplace plugin page, not the Creator Space dashboard list.
2. Use the plugin detail page three-dot menu.
3. Choose `New Version`.
4. Upload the matching zip from the upload bundle folder.
5. Submit the new version.
6. After Framer confirms submission, send the matching Gmail reply below.

Owner update entry:

`https://www.framer.com/community/marketplace/plugins/`

Direct plugin pages:

- Polyglot AEO: `https://www.framer.com/community/marketplace/plugins/polyglot-aeo/`
- Loka - Localization Hub: `https://www.framer.com/community/marketplace/plugins/loka-localization-hub/`
- Ally Auditor: `https://www.framer.com/community/marketplace/plugins/ally-auditor/`
- Gaode Maps Assistant: `https://www.framer.com/community/marketplace/plugins/gaode-maps-assistant/`

Priority:

1. Polyglot AEO: required, newest Framer blocker.
2. Loka Localization Hub: required, second review still has blockers.
3. Ally Auditor: required, second review still has blockers.
4. Gaode Maps Assistant: optional/recommended, current publication status should not be blocked, but the fresh package addresses the recommendations.

## Required Listing / UI Disclosure Copy

Use the English copy below in Framer Marketplace fields where relevant. Do not overstate compliance guarantees.

### Polyglot AEO

Marketplace description addendum:

```text
Polyglot AEO uses bundled schema-audit rules that ship with the reviewed plugin package. The plugin does not fetch mutable schema rules from a remote endpoint at runtime.

AI-assisted features are handled through the managed Polyglot AEO backend. Users do not enter third-party AI provider API keys into the Marketplace plugin.

Before applying generated structured data or Custom Code changes, users can review the proposed output and confirm the site-wide changes.
```

New Version notes:

```text
Removed runtime remote schema-rules loading. Schema-audit rules are now bundled with the plugin package, and related remote rules endpoint references were removed.
```

### Loka - Localization Hub

Marketplace description addendum:

```text
Loka translates explicitly managed content. Published-site text replacement is scoped to target containers, defaulting to elements marked with [data-loka-scope]. It does not scan or rewrite arbitrary page text unless the user intentionally configures a target selector.

Canvas preview uses a review-before-apply workflow. By default, preview changes target selected text layers. Applying changes to all matching text layers requires explicit opt-in and confirmation.

Protected Framer actions such as creating code files, inserting components, and updating text layers check permissions before running and show clear feedback if the action cannot be completed.
```

In-plugin helper copy:

```text
For safest results, add data-loka-scope to the container whose text should be translated. Loka only scans the configured target selector on the published site.
```

Preview confirmation copy:

```text
Review the text layers below before applying this locale preview. Only the listed layers will be changed. All-text preview requires explicit opt-in.
```

New Version notes:

```text
Added selected-layer-first preview, explicit all-text confirmation, permission checks for text updates, scoped published-site translation roots, and clearer error handling.
```

### Ally Auditor

Marketplace description addendum:

```text
Ally Auditor can optionally use third-party AI providers such as OpenAI, Anthropic, Gemini, or an OpenAI-compatible endpoint to generate alt-text suggestions for selected images.

AI image processing is opt-in. The plugin only uploads images that the user explicitly selects and confirms. Selected image content is encoded and sent to the configured third-party AI provider for alt-text generation using the user's locally stored API key.

API keys, AI provider settings, onboarding state, audit history, and ignored-issue preferences are stored locally in the user's browser. They are not stored in Framer shared plugin data.

The normal accessibility audit flow works without sending image content to an external AI provider.
```

In-plugin AI consent copy:

```text
Selected image content will be sent to your configured AI provider for alt-text generation. Only the images selected in this step will be uploaded. Continue only if you are allowed to share this project content with that provider.
```

Settings helper copy:

```text
Your API key is stored locally in this browser and is used only to call your selected AI provider. It is not saved to Framer shared plugin data or Ally Auditor servers.
```

New Version notes:

```text
Added explicit selected-image AI consent, local-only user settings/API key storage, sequential selected-image upload, permission checks for alt-text application, and clearer storage/error handling.
```

### Gaode Maps Assistant

Marketplace description addendum:

```text
Gaode Maps Assistant generates Framer code components that load the official AMap/Gaode Maps JavaScript SDK at runtime. Map rendering depends on that external SDK and the user's own AMap API Key and Security Code.

Generated component values are serialized safely before being inserted into component source. User-visible labels, info-window text, image URLs, and links are sanitized or validated before use.

API credentials are stored locally in the user's browser for convenience and can be cleared from the plugin UI. If the AMap script fails to load, generated components show inline fallback messaging instead of blocking browser dialogs.
```

In-plugin credential helper copy:

```text
Your AMap API Key and Security Code are stored locally in this browser. Use Clear Saved Credentials to remove them from local storage.
```

Generated component dependency copy:

```text
This component loads the AMap/Gaode Maps JavaScript SDK at runtime. If the SDK cannot load or the credentials are invalid, the map will show an inline error message.
```

New Version notes:

```text
Safely serialized generated component values, added AMap script load fallback UI, guarded local credential/license storage, and improved permission-aware component insertion.
```

## Gmail Threads

- Polyglot latest message id: `19f3c46d37ecfce5`
- Ally latest message id: `19f3c14c4113dfe4`
- Loka latest message id: `19f3c078c7202992`
- Gaode latest message id: `19f3bff2acaeaff4`

## Reply: Polyglot AEO

Subject: `Re: Automated Security Review`

Body:

```text
Hey Community Team,

Thanks for the follow-up. I have published a new version of Polyglot AEO with the remaining schema-rules issue addressed.

Changes in this version:

- Runtime loading of schema rules from a remote URL has been removed.
- Schema rules are now bundled directly with the plugin submission.
- The old remote rules loader and VITE_SCHEMA_RULES_URL override were removed from the plugin source.
- The public schema-rules endpoint and related website/header/docs references were removed.
- The plugin no longer changes schema-audit behavior based on a mutable remote schema-rules response.

Build and package verification completed successfully, including typecheck, test, build, plugin pack, and release package checks.

Please review and restore the plugin to the Community when ready.

Best,
Jimmy
```

## Reply: Loka Localization Hub

Subject: `Re: Automated Security Review`

Body:

```text
Hey Community Team,

Thanks for the detailed follow-up. I have published a new version of Loka - Localization Hub with the additional requested fixes.

Changes in this version:

- Canvas preview is now a prepare/review/apply flow instead of immediate bulk updates.
- Preview targets selected text layers by default.
- All-text preview requires an explicit opt-in and a confirmation step before any TextNode.setText calls are made.
- TextNode.setText is permission-checked before applying or resetting preview changes.
- Reset only touches text nodes that were modified by the confirmed preview.
- Generated published-site components remain scoped to explicit target roots, defaulting to [data-loka-scope].
- Remaining silent catch blocks in the generated component sources were replaced with diagnostic warnings.

The fresh package has been rebuilt and submitted through Framer Marketplace.

Please review and restore the plugin when ready.

Best,
Jimmy
```

## Reply: Ally Auditor

Subject: `Re: Automated Security Review`

Body:

```text
Hey Community Team,

Thanks for the follow-up. I have published a new version of Ally Auditor with the requested updates.

Changes in this version:

- AI alt-text generation requires explicit consent before selected image content is uploaded to the configured third-party AI provider.
- Only images selected by the user are processed.
- Image uploads are processed sequentially to keep the transfer explicit and bounded.
- API keys and user-specific settings remain in browser-local storage, not Framer shared plugin data.
- Settings, license state, audit history, and ignore rules now use guarded local storage helpers with clear failure handling.
- Applying generated alt text now checks setAttributes permission before writing and surfaces apply errors to the user.
- Marketplace-facing privacy/terms copy discloses the selected-image AI upload behavior and local API key storage.

The fresh package has been rebuilt and submitted through Framer Marketplace.

Please review and restore the plugin when ready.

Best,
Jimmy
```

## Reply: Gaode Maps Assistant

Subject: `Re: Automated Security Review`

Body:

```text
Hey Community Team,

Thanks for the recommendations. I have published a new version of Gaode Maps Assistant addressing the items from your follow-up.

Changes in this version:

- Generated component values are serialized as safe JavaScript literals before insertion into generated source.
- External AMap script loading now has inline fallback UI when the script cannot be loaded.
- Plugin UI, language, and license local storage reads/writes/removes are guarded and recover gracefully if storage is unavailable.
- Protected component creation/insertion paths remain permission-checked before use.

The fresh package has been rebuilt and submitted through Framer Marketplace.

Best,
Jimmy
```
