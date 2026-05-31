# Polyglot AEO

> A multilingual AEO quality control center for Framer. Prepare every locale
> before launch, verify the published site after launch, and keep CMS gaps from
> leaking into AI search.

Polyglot AEO bridges Framer's localization system with the structured data and
`llms.txt` standards that AI search engines use to decide what to cite. Generic
AEO plugins ship one schema for the default locale; Polyglot AEO produces a
correctly-typed variant for every locale on your project.

## What it does

- **Per-locale JSON-LD** for `Article`, `Product`, `LocalBusiness`, `FAQPage`,
  and `Organization`. Each variant carries the right `inLanguage` value and
  links sister translations via `workTranslation`.
- **Multilingual `llms.txt` generator** that scans Framer CMS collections and
  emits one `llms.txt` (default locale) plus `llms-{locale}.txt` per other
  locale. Items missing a localized title are automatically skipped to avoid
  leaking source-language content into a partial translation.
- **AI Localized Meta** for title, description, OG, and Twitter tags. Prompts
  encode language-specific SEO rules (German title length, Japanese rewriting
  vs literal translation, Mexican vs Castilian vocabulary, …) so output reads
  native, not translated.
- **AEO Health Score + published-site verifier** so designers can see what is
  missing, then confirm the live homepage, JSON-LD, meta description, and
  `/llms.txt` after publishing.
- **AEO Control Center** with launch blockers, CMS localization gaps, issue
  severity, and downloadable client reports.
- **One-click install** into Framer's Custom Code (`headEnd`). Uninstall is
  fenced — Polyglot AEO never touches Custom Code it didn't author.

## Develop

```bash
npm install
npm run dev
```

The dev server starts on **`https://localhost:5173`**. Framer requires HTTPS
for development plugins, which `vite-plugin-mkcert` handles automatically by
generating a local CA the first time you run dev.

> **First-run note (macOS):** mkcert needs `sudo` once to add its root CA to
> your system keychain. Run `npm run dev` in your own Terminal (not from a
> sandboxed agent shell) and enter your password when prompted. Subsequent
> runs are silent.

Then in Framer: enable **Developer Tools** in the Plugin section menu, open
the Plugin menu from the toolbar, and click **Open Development Plugin**.
Point it at `https://localhost:5173`.

## Build & pack

```bash
npm run build  # type-check + production build → dist/
npm run pack   # produce plugin.zip for marketplace submission
```

## Architecture

```
src/
├── App.tsx                   Top-level tabs router
├── views/                    One file per primary tab
│   ├── Dashboard.tsx
│   ├── SchemaView.tsx
│   ├── LlmsTxtView.tsx
│   ├── MetaAiView.tsx
│   └── SettingsView.tsx
├── lib/
│   ├── framer/               Wrappers over framer-plugin SDK
│   │   ├── locales.ts        getAllLocales, BCP-47 normalization
│   │   ├── customCode.ts     Fenced injection, install detection
│   │   └── cms.ts            Collection scanning, locale slug map
│   ├── schema/               JSON-LD generators (one per type)
│   ├── llms/                 llms.txt renderer + CMS section builder
│   ├── ai/                   Provider-agnostic AI client + prompts
│   └── storage.ts            Typed wrapper over plugin data
└── hooks/                    React hooks for locales & collections
```

See `docs/` for marketplace listing copy, release checklist, pricing, and
launch plan.

## License

Proprietary © Polyglot AEO. All rights reserved.
