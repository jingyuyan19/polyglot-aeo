# AI localized Meta

Generate native SEO title, meta description, Open Graph, and Twitter tags per Framer locale. Output is **copy-paste** into Framer Page settings (the Plugin SDK cannot write page SEO).

## Workflow (4 steps)

1. **Page** — Pick a static page (optional) to auto-fill context, or paste manually. Use **✨ AI** on page type, primary keyword, or brand voice to fill from context (requires API key in Settings).
2. **Generate** — Choose AI provider (folded by default), estimate cost, generate for all locales (up to 3 concurrent API calls). Cancel supported while running.
3. **Results** — Locale tabs, quality flags, SEO length hints (~60 title / ~155 description), copy per field or **Copy all**.
4. **Apply** — Steps to switch locale in Framer, open Page settings → SEO, paste, publish.

## Quality checks

| Flag | Meaning |
|------|---------|
| Parse failed | AI JSON missing `title` and `metaDescription` |
| Likely untranslated | `metaDescription` byte-matches source context sample |
| Wrong script | Field text not in target locale script (non-default locales) |

Default locale skips translation checks.

## Persistence

- Form draft: `draft-meta` (page context, provider, selected page id).
- Last results: `last-meta-results` when draft signature matches (avoids stale copy after context edits).

## Code map

- Orchestrator: `src/views/MetaAiView.tsx`
- Steps: `src/views/meta/*`
- Prompt: `src/lib/ai/prompts.ts` (`buildMetaPrompt`)
- Parse: `src/lib/ai/meta-parse.ts`
- Quality: `src/lib/ai/meta-quality.ts`
- Page context builder: `src/lib/meta/page-context.ts`
