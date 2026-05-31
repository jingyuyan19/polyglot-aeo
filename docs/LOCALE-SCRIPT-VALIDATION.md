# Locale script validation

Polyglot AEO validates AI-generated translations **after** each call. Script checks are pure heuristics (no second AI pass) and live in [`src/lib/locale-script/`](../src/lib/locale-script/).

## Layers

| Layer | What it catches | Locales |
|-------|------------------|---------|
| **A — Cross-script** | Hangul in `ja`, kana in `ko`, Cyrillic in CJK, etc. | `ja`, `ko`, `zh`, `ar`, `ru`/`uk`/`bg` |
| **B — Han glyphs** | Wrong codepoints for target locale (OpenCC-derived maps) | `ja`, `zh-CN`, `zh-TW` |
| **C — Latin embed** | Lowercase English runs ≥5 chars inside CJK prose | `ja`, `ko`, `zh` |
| **D — Untranslated** | Byte-equal headline+description vs source (`translation-quality.ts`) | All |

Layer B replaced the hand-maintained `CHINESE_ONLY_KANJI` denylist. Maps are generated from [OpenCC](https://github.com/BYVoid/OpenCC) via `opencc-js` at build time only — **not** shipped as a runtime dependency.

## Regenerating maps

```bash
npm run generate:locale-maps
```

Writes:

- `src/lib/locale-script/data/cn-to-jp.json` — simplified → JP shinjitai (single-char)
- `src/lib/locale-script/data/tw-to-jp.json` — traditional / kyujitai → JP
- `src/lib/locale-script/data/cn-to-tw.json` — simplified → TW (for `zh-TW` targets)
- `src/lib/locale-script/data/tw-to-cn.json` — traditional → CN (for `zh-CN` targets)
- `src/lib/locale-script/data/ja-phrases.json` — multi-char phrases (longest-first match)
- `src/lib/locale-script/data/metadata.json` — OpenCC version + counts
- `src/lib/locale-script/prompt-samples.ts` — examples synced into AI prompts

CI / pre-build:

```bash
npm run check:locale-maps   # regenerate + fail if git diff
```

`prebuild` runs `generate:locale-maps` automatically.

## Public API

```ts
import {
  validateLocaleScript,
  requireTargetScript,
  findHanGlyphViolations,
} from "../lib/locale-script"
```

- **`validateLocaleScript`** — lenient (short Latin brands OK for `ja`; kanji-only Japanese OK when Layer B passes)
- **`requireTargetScript`** — strict (no long Latin passthrough for `ja`; accepts kana or valid kanji; used for `defaultAuthor`, meta `title`)

## `mixed-script` in the UI

When Layer A/B/C fails, cells are marked `reason: "mixed-script"`. Common causes:

1. Simplified Chinese in Japanese (`网` → should be `網`)
2. Traditional / kyujitai in Japanese (`獨` → should be `独`)
3. Korean or Cyrillic bleed
4. Untranslated lowercase English (`design` mid-sentence)

Legitimate Japanese that shares a glyph with Chinese (e.g. `断` in `決断`) is **not** in the maps — only OpenCC pairs where the source codepoint differs from the JP expectation are flagged.

## Upgrading OpenCC

1. Bump `opencc-js` in `package.json`
2. `npm run generate:locale-maps`
3. `npm test` and `npm run check:locale-maps`
4. Review `metadata.json` count deltas
