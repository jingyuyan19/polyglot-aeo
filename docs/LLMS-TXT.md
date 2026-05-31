# llms.txt quality checks

Polyglot AEO generates one `llms.txt` (or `llms-{locale}.txt`) per Framer locale. When **AI auto-translate** is enabled, translated CMS rows pass a lightweight quality gate before they are written into the file.

## Title-first policy

| Field | On failure |
|-------|------------|
| **Title** | The row is omitted from that locale’s file (`aiFailed` or `skipped`). Passthrough English on CJK locales is labeled **looks untranslated**, not mixed-script. |
| **Summary** | The AI summary is dropped for that locale only. The generator falls back to the default-locale summary when rendering the bullet (same pattern as short optional CMS fields). |

This keeps `## Project` / `## Article` sections populated when only titles localize successfully, instead of dropping the whole row because the summary stayed in English.

## UI

- **Wizard**: Site info → Content sources → Generate → Results (per-locale tabs, merged issues list, collapsed preview) → Deploy (once).
- **Deduped alerts**: Rows that failed AI translation are not also counted under “skipped (missing localized title)”.
- **AI failure reasons**: `疑似未翻译` = model returned English (or byte-equal passthrough); `AI 响应解析失败` = JSON could not be parsed (common when the provider’s `json_object` mode conflicts with a bare-array prompt — we now request `{ "items": [...] }`).

## Tests

- `src/lib/ai/llms-translate.test.ts` — `acceptTranslatedItem`, CJK passthrough labeling
- `src/lib/llms/generator.test.ts` — summary fallback when localized summary is empty
