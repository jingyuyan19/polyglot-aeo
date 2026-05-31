# Prompt library

The exact prompt templates Polyglot AEO ships with, plus the language-rule
table that powers per-locale heuristics. This file is the single source of
truth for the prompt contracts; the runtime in `src/lib/ai/prompts.ts`
mirrors it. When you tune a prompt, update both.

## Why these prompts work

Generic translation prompts ("translate this title to German") produce
wooden, length-violating, keyword-stripped output. Our prompts:

1. **Refuse literal translation** — instruct the model to *rewrite* in the
   target language for native search behaviour.
2. **Carry language-specific rules** — e.g. German titles must respect
   compound-word length; Japanese titles must rewrite, not transliterate;
   Mexican Spanish must avoid Castilian vocabulary.
3. **Output strictly typed JSON** — never free-form prose. We use
   `response_format: json_object` for OpenAI and a hard system instruction
   for Anthropic.
4. **Encode AEO over SEO** — the system prompt explicitly mentions
   ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews as the
   targets. AI engines reward FAQ-style, self-contained answers; we hand
   the model that frame.

## Language rules table

| Language | Code | Rule |
|---|---|---|
| English | `en` | Title 50–60 chars. Active voice. Avoid em dashes. |
| German | `de` | Title 55 chars max. Avoid 20+ char compound words. Formal `Sie` unless brand voice says otherwise. |
| Japanese | `ja` | Title 30 full-width chars. Rewrite for Japanese reading patterns; never literal-translate. Use 「」 for product names. |
| Simplified Chinese | `zh-CN` | Title 30 chars. Avoid free direct translation; use native idioms. Simplified characters only. |
| Traditional Chinese | `zh-TW` | Title 30 chars. Traditional characters. Taiwan-specific terms (e.g. 軟體 not 软件). |
| French | `fr` | Title 60 chars. `vous` form. Avoid English loanwords when French equivalent exists. |
| Spanish (neutral) | `es` | Title 60 chars. Neutral Spanish. Avoid voseo. |
| Spanish (Mexico) | `es-MX` | Title 60 chars. Mexican vocabulary. Currency in MXN. |
| Spanish (Spain) | `es-ES` | Title 60 chars. Castilian. Use `vosotros` where applicable. |
| Portuguese (Brazil) | `pt-BR` | Title 60 chars. Brazilian Portuguese. Avoid Portugal vocabulary. |
| Korean | `ko` | Title 30 full-width chars. Default to 합니다 form. |
| Arabic | `ar` | Title 60 chars. RTL composition. Modern Standard Arabic unless region specified. |
| Russian | `ru` | Title 60 chars. Avoid English loanwords with established Russian equivalents. |
| Italian | `it` | Title 60 chars. `tu` casual / `Lei` enterprise per brand voice. |

When a locale has no entry, we use a generic fallback: 50–60 char title,
140–160 char description, native rather than translated.

## Meta prompt — system

```
You are a senior multilingual SEO copywriter who writes natively in
{{language}} ({{region}}). You never literally translate; you rewrite for
native search and AI-search behaviour. You optimize for both Google and
AI engines (ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews).

LANGUAGE RULES: {{rules}}
Brand voice: {{voice}}
Primary keyword to include naturally (do NOT stuff): "{{primaryKeyword}}".

OUTPUT FORMAT — return ONLY valid JSON, no prose:
{
  "title": "...",
  "metaDescription": "...",
  "ogTitle": "...",
  "ogDescription": "...",
  "twitterTitle": "...",
  "twitterDescription": "...",
  "primaryKeyword": "...",
  "secondaryKeywords": ["...", "..."]
}
```

## Meta prompt — user

```
Page type: {{pageType}}

Source content (default locale):
"""
{{pageContext}}
"""

Generate the SEO meta in {{language}}.
```

## FAQ prompt — system

```
You generate FAQ Q&A pairs that AI search engines (ChatGPT, Perplexity,
Claude, Gemini) will cite verbatim. You write natively in {{language}},
never as a translation.

LANGUAGE RULES: {{rules}}

QUALITY RULES:
- Each question must be a real question a user would type into an AI
  assistant.
- Each answer must be 40–80 words. Self-contained. No "see above".
- Lead each answer with the direct answer in the first sentence
  (AI engines truncate).
- Include the product/topic name in at least 3 answers (helps brand
  citation).

OUTPUT FORMAT — return ONLY valid JSON:
{
  "questions": [{ "question": "...", "answer": "..." }]
}
```

## Future: Comparison schema prompt (v0.2)

Schema type: `Question` with `Answer.suggestedAnswer` for "X vs Y" pages.
Highly cited by AI engines because users ask comparison questions in their
native language. Reserved for the v0.2 ship.

## Cost calibration (Anthropic Claude Sonnet)

| Operation | Input tokens | Output tokens | Cost USD |
|---|---|---|---|
| Meta gen, 1 locale | ~500 | ~250 | ~$0.0053 |
| Meta gen, 10 locales | 5,000 | 2,500 | ~$0.053 |
| FAQ gen, 1 locale, 6 Q | ~600 | ~600 | ~$0.011 |
| FAQ gen, 10 locales | 6,000 | 6,000 | ~$0.108 |

A typical user generating meta + FAQ for 5 locales spends roughly $0.08 per
page — comfortably under what we'd charge if we resold tokens, which is
exactly why BYOK is the honest move.
