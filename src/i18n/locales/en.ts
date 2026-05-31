/**
 * English source of truth.
 *
 * Every string visible in Polyglot AEO's UI lives here. Other locale files
 * MUST mirror this exact shape — TypeScript enforces it via
 * `Translations = typeof en`. If a translator hasn't filled in a key, the
 * `t()` function falls back to this file at runtime.
 *
 * Keep keys descriptive and grouped by view. Use `{name}` placeholders for
 * runtime interpolation; the `t()` function will substitute them.
 *
 * Intentionally NOT marked `as const` — we want value types to widen to
 * `string` so other locale files can supply their own translations under
 * the same shape. Compile-time key paths come from the structure itself,
 * which is preserved either way.
 */
export const en = {
  common: {
    back: "Back",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    generate: "Generate",
    generating: "Generating…",
    install: "Install",
    installing: "Installing…",
    copy: "Copy",
    download: "Download",
    remove: "Remove",
    show: "Show",
    hide: "Hide",
    none: "None",
    chars: "{n} chars",
    apiKeyMissing: "No API key",
    apiKeyMissingHelper: "Add one in Settings to enable generation.",
    default: "Default",
    confirmDiscardChanges:
      "You have unsaved edits. Switching schema type will discard them. Continue?",
    confirmRemoveAll:
      "Remove all Polyglot AEO–injected schema from this site's Custom Code? Your own snippets will be left untouched.",
    helpClose: "Close help",
    helpOpen: "Show help",
    aiSettingsTitle: "AI settings",
    openSettings: "Open settings",
    copied: "Copied",
  },

  /**
   * Inline help text for technical terms. Each entry shows up under a
   * (?) icon click — never as a hover tooltip. Keep them short (1–3
   * sentences) and concrete. Add new terms here, then reference them
   * via <HelpIcon termId="..." />.
   */
  help: {
    aeo: "Answer Engine Optimization. SEO for AI search engines (ChatGPT, Perplexity, Claude, Google AI Overviews) instead of just classic Google. The currency is being cited inside AI answers.",
    inLanguage:
      "A schema.org property that tells AI crawlers which language a page is written in. Without it, an AI might cite your English page when a user asks in Japanese — or skip you entirely.",
    bcp47:
      "BCP-47 is the IETF standard for language codes like en-US, zh-CN, ja-JP. Schema.org and llms.txt expect this format. Polyglot AEO converts Framer locale codes for you automatically.",
    byok:
      "Bring Your Own Key. You provide your own Anthropic / OpenAI API key. Polyglot AEO never proxies your requests — keys stay on your device and calls go straight to the AI provider, so you only pay direct usage costs (typically pennies per page).",
    canonicalUrl:
      "The single official URL for this page. Search engines and AI crawlers use it to deduplicate and decide which version to cite. For multilingual pages, each locale typically has its own canonical (e.g. /about and /zh/about).",
    llmsTxt:
      "A standardized text file (like robots.txt for LLMs) that summarizes your site's structure for AI crawlers. Polyglot AEO outputs one llms.txt per locale so each language is indexed independently.",
    fenced:
      "Polyglot AEO wraps everything it injects into Framer's Custom Code in HTML comment fences (polyglot-aeo:start / :end). On uninstall, only fenced blocks are removed — your manually-added scripts (GA, Hotjar, Stripe) stay intact.",
    brandVoice:
      "A short style guide passed to the AI when generating localized meta. Keep it specific: 'confident, technical, concise; we say \"you\" not \"your business\"' beats 'professional and friendly'.",
  },

  dashboard: {
    subtitle:
      "Get cited by ChatGPT, Perplexity, Claude & Google AI Overviews — in every language.",
    subtitleSecondary:
      "Built for Framer — Schema auto-injects into Custom Code, Meta pastes into each page’s Title / Page Description, llms.txt deploys via Framer Static Files.",
    statusInstalled: "Schema installed",
    statusDisabled: "Schema disabled",
    statusNotInstalled: "Not installed",
    localesTitle: "Project locales",
    localesActive: "{n} active",
    localesNone: "None",
    localesEmpty:
      "No locales found. Polyglot AEO works on single-locale sites too — it just won't multiply schema variants. Add locales in Framer's Localization panel for the full value.",
    localesAddCta: "Open Framer's localization guide",
    healthTitle: "AEO readiness",
    healthScore: "{score}%",
    healthSchemaDone: "Schema is installed",
    healthSchemaTodo: "Install per-locale schema",
    healthLlmsDone: "llms.txt has been generated",
    healthLlmsTodo: "Generate llms.txt",
    healthMetaDone: "Meta copy generated",
    healthMetaTodoFree: "Try Meta copy (default locale)",
    healthMetaTodoPro: "Generate meta copy",
    healthMetaHint:
      "Connecting an API key isn't enough — generate meta once in Meta AI to complete this step.",
    healthKeyDone: "AI key is connected",
    healthKeyTodo: "Add an AI API key",
    healthLocalesDone: "All locales are unlocked",
    healthLocalesTodo: "Unlock every locale with Pro",
    openControl: "Open control center",
    reportDownload: "Download client report",
    toolsTitle: "Tools",
    controlTool: "AEO control center",
    controlToolDesc:
      "Pre-launch issues, CMS localization gaps, and post-publish checks in one place.",
    schemaTool: "Per-locale schema",
    schemaToolDesc:
      "JSON-LD for Article, Product, LocalBusiness, FAQ & Organization — one variant per locale, with the right inLanguage.",
    llmsTool: "Multilingual llms.txt",
    llmsToolDesc:
      "Scan your CMS, output one llms.txt file per locale so AI crawlers index every language.",
    cmsGapsTool: "CMS localization gaps",
    cmsGapsToolDesc:
      "Find missing localized titles, summaries, slugs, and duplicate CMS titles.",
    metaTool: "Meta copy generator",
    metaToolDesc:
      "Native titles, descriptions, OG & Twitter per language — rewritten, not translated word-for-word.",
    verifyTool: "Published-site verifier",
    verifyToolDesc:
      "Check the live homepage, JSON-LD, meta description, and llms.txt after publishing.",
    settingsTool: "Settings",
    settingsToolDesc: "API keys, brand voice, install status.",
    whyTitle: "Why per-locale schema?",
    whyBody:
      "Google's official guidance: each language version of a page should ship its own JSON-LD with a matching {code} value. AI search engines use this to decide which locale to cite when a user asks in that language. Generic AEO plugins ship one schema for the default locale — Polyglot AEO is the only tool that produces correct variants for every locale.",
    quickStartTitle: "Quick start",
    quickStartProgress: "{done} of {total}",
    quickStartAllDone: "You're all set",
    quickStartDismiss: "Dismiss",
    quickStartCollapse: "Collapse",
    quickStartExpand: "Expand",
    quickStartSteps: {
      addLocalesTitle: "Add locales in Framer",
      addLocalesDesc:
        "Polyglot AEO multiplies your work across every locale. Add at least one non-default locale in Framer's Localization panel.",
      addLocalesAction: "Open docs",
      installSchemaTitle: "Install per-locale schema",
      installSchemaDesc:
        "Pick a schema type, fill in source content, and inject one JSON-LD block per locale into your site head.",
      installSchemaAction: "Open Schema",
      generateLlmsTitle: "Generate llms.txt files",
      generateLlmsDesc:
        "Tell ChatGPT, Perplexity, and Claude how to crawl every language of your site.",
      generateLlmsAction: "Open llms.txt",
      addApiKeyTitle: "Add an AI API key (optional)",
      addApiKeyDesc:
        "Unlocks AI Schema audit and Localized Meta. Tap the gear icon in the top-right at any time to manage keys. Claude or GPT-4o-mini are good defaults.",
      addApiKeyAction: "Open settings",
      verifyTitle: "Verify with Google Rich Results Test",
      verifyDesc:
        "Paste your site URL into Google's official validator to confirm AI search engines see the schema.",
      verifyAction: "Open validator",
    },
  },

  control: {
    title: "AEO control center",
    readiness: "Readiness",
    scanning: "Scanning…",
    rescan: "Rescan",
    downloadReport: "Download report",
    summary: "{critical} critical · {warning} warnings · {info} notes",
    issuesTitle: "Launch blockers",
    noIssues: "No launch blockers found. Run the published-site verifier after your next publish.",
    severity: {
      critical: "Critical",
      warning: "Warning",
      info: "Note",
    },
    issue: {
      schema_missing: {
        title: "Per-locale schema is not installed",
        body: "Install JSON-LD before launch so AI systems can understand each page.",
      },
      schema_disabled: {
        title: "Installed schema is disabled",
        body: "Framer Custom Code is disabled, so crawlers will not see Polyglot AEO blocks.",
      },
      llms_missing: {
        title: "llms.txt has not been generated",
        body: "Generate the default file, then use Pro for every locale variant.",
      },
      meta_missing: {
        title: "Meta copy not generated yet",
        body: "Generate at least one set of titles and descriptions per language before launch.",
      },
      api_key_missing: {
        title: "No AI provider key is connected",
        body: "Add an API key to unlock audit, localization, and retry workflows.",
      },
      multi_locale_locked: {
        title: "{count} locales are present but Pro is not active",
        body: "Free shows the gaps. Pro installs and generates native AEO assets for every locale.",
      },
      cms_locale_gaps: {
        title: "{count} CMS localization gaps",
        body: "Missing localized CMS titles or summaries cause skipped llms.txt entries and weaker schema.",
      },
      cms_duplicate_titles: {
        title: "{count} duplicate CMS title rows",
        body: "Duplicate titles make AI crawlers collapse separate records into one ambiguous entry.",
      },
      published_failures: {
        title: "{count} published-site checks failed",
        body: "Run verifier and fix live URLs before handing off the site.",
      },
    },
    cmsTitle: "CMS localization gaps",
    cmsCollections: "{n} collections",
    cmsSummary:
      "{titles} missing titles · {summaries} missing summaries · {slugs} missing slugs · {duplicates} duplicate-title rows",
    cmsLocaleLine:
      "{locale}: {titles} titles, {summaries} summaries, {slugs} slugs",
    cmsDuplicates: "{n} duplicate groups",
    cmsNoGaps: "No CMS localization gaps found.",
    openCmsGaps: "CMS gaps",
    openVerifier: "Verify live site",
    fixPrimary: "Fix schema",
  },

  cmsGaps: {
    title: "CMS localization gaps",
    summaryTitle: "Gap summary",
    detailsTitle: "Collection details",
    rows: "{n} rows",
    fields: "Fields: title = {title}, summary = {summary}",
    downloadCsv: "Download CSV",
    empty: "No CMS collections found.",
  },

  verify: {
    title: "Published-site verifier",
    siteUrl: "Published site URL",
    helper:
      "Run this after publishing. Some sites block browser fetches; when that happens, use the result as a manual checklist.",
    run: "Verify published site",
    running: "Verifying…",
    results: "Results",
    homepage: "Homepage reachable",
    homepageOk: "Fetched homepage HTML with HTTP {status}.",
    homepageBlocked:
      "Could not read the homepage from the plugin browser. Open the URL manually and inspect source.",
    schema: "JSON-LD present",
    schemaOk: "Found {n} valid JSON-LD script(s) on the homepage.",
    schemaParseWarning: "{n} JSON-LD script(s) could not be parsed.",
    schemaMissing: "No JSON-LD script found on the homepage HTML.",
    schemaUnknown: "Skipped because homepage HTML was not readable.",
    inLanguage: "inLanguage present",
    inLanguageOk: "Found language markers: {languages}.",
    inLanguageMissing: "No inLanguage markers found in parsed JSON-LD.",
    meta: "Meta description present",
    metaOk: "Found a meta description tag.",
    metaMissing: "No meta description tag found on the homepage HTML.",
    metaUnknown: "Skipped because homepage HTML was not readable.",
    llms: "llms.txt reachable",
    llmsLocale: "{locale} llms file",
    llmsOk: "/llms.txt returned HTTP {status}.",
    llmsLocaleOk: "/{filename} returned HTTP {status}.",
    llmsLocaleMissing: "/{filename} was not reachable.",
    llmsMissing: "/llms.txt was not reachable. Upload it in Framer Static Files and publish again.",
  },

  schema: {
    title: "Per-locale schema",
    audit: {
      title: "Schema · AI Audit",
      heroTitle: "Let AI propose schemas for every page",
      heroBody:
        "Polyglot AEO scans your Framer project, picks the right schema kind for each page, fills the fields from your content, and translates everything into every locale you've set up.",
      providerLabel: "AI provider",
      modelLabel: "Model",
      translateContentLabel: "Translate content into every locale",
      translateContentHelper:
        "Generates a fully native headline, description, and body for each non-default locale instead of just changing the inLanguage tag. Adds a small AI cost but produces real localized JSON-LD.",
      aiNeeded: "Add an AI API key in Settings to enable the AI scan.",
      scanButton: "Scan site",
      rescan: "Re-scan",
      scanning: "Scanning your site…",
      scanProgress: "{current} of {total}",
      translateProgress: "Translating {current} of {total}",
      scanCalls: "scan calls",
      translateCalls: "translation calls",
      scanFailed: "Scan failed: {error}",
      scanEmpty: "No pages found in this Framer project.",
      partial: "Some pages couldn't be read. Re-scan to retry.",
      scanSummary: "Scanned {n} pages.",
      snapshotTitle: "Last installed",
      snapshotInstalledAt:
        "{time} · {n} blocks across {locales} locales",
      snapshotChanges: "{n} changed",
      snapshotAdded: "{n} new",
      snapshotRemoved: "{n} removed",
      snapshotUpToDate: "Up to date",
      snapshotRescanHint:
        "Re-scan to detect content changes since the last install.",
      snapshotSessionListHint:
        "The proposal list is kept only while this plugin panel stays open. Tap Scan site below to restore it — installed JSON-LD is unchanged.",
      snapshotResetByDrift:
        "Custom Code no longer contains the polyglot-aeo block — install record reset.",
      identityCardTitle: "Brand identity",
      identityCardSubtitle:
        "Used for publisher and author across all your schema.",
      identityCardDeriving: "Detecting brand identity…",
      identityCardLowConfidence:
        "Low confidence — review the brand name before installing.",
      identityCardSourceAi: "Auto-detected",
      identityCardSourceFallback: "Hostname fallback",
      identityCardSourceUserEdit: "Manually set",
      identityCardEdit: "Edit",
      identityCardSave: "Save",
      identityCardCancel: "Cancel",
      identityCardBrandLabel: "Brand name",
      identityCardAuthorLabel: "Default byline",
      identityCardLogoLabel: "Logo URL",
      identityCardUrlLabel: "Site URL",
      identityCardTranslationsCount:
        "Translated for {n} locales",
      identityCardNoTranslations: "Will translate for non-default locales on next scan.",
      identityPartialTranslate:
        "Couldn't translate brand identity for {n} locales. Those will use the source-language brand at install time.",
      proposalsTitle: "Proposed schemas",
      proposalsCount: "{enabled} of {total} enabled",
      proposalConfidence: "{n}% confidence",
      proposalLowConfidence: "Low confidence — please review.",
      proposalAiError:
        "AI couldn't analyze this page. Disabled by default — review or enable manually.",
      proposalReviewBadge: "Review suggested",
      translationWarning: "{n} cells need re-translation.",
      translationHealthTitle: "Translation health",
      translationHealthBody:
        "{n} (page × locale) cells still look untranslated after install. Re-run with the same or a stronger model using the footer below.",
      translationHealthAutoRetryNote:
        "Each cell was already auto-retried once during translation (reinforced prompt). These are the ones that failed twice.",
      translationHealthFooterHint:
        "Tap an issue below to jump to that page's preview, or use Next issue to step through. Re-translate from the footer or on each card when ready.",
      translationHealthIssueListTitle: "Issues",
      translationHealthLocaleSummary: "By locale",
      nextIssue: "Next issue ({current}/{total})",
      footerRetryHint:
        "Full re-install of every block. Prefer Re-translate first to fix only the failed cells.",
      footerRetryLabel: "Re-translate {n} cells",
      footerReinstallShort: "Re-install",
      footerInstallShort: "Install",
      footerUpdateInstallShort: "Update install",
      footerInstallTitle:
        "{n} blocks · {proposals} pages × {locales} locales",
      footerReinstallTitle:
        "{n} blocks · {proposals} pages × {locales} locales. {hint}",
      installSuccessWithUntranslated:
        "{n} cell(s) still need translation — use Re-translate below or in the toast.",
      installToastRetry: "Re-translate {n} cells",
      installUndoInPanel: "Undo install",
      cardUntranslated: "Needs translation: {locales}",
      cardRetry: "Retry ({n})",
      cardRetrying: "Translating…",
      cardRetryHint:
        "Re-translate just this page's failed locales and reinstall.",
      retryFailed: "Re-translate {n} failed cells",
      retryFailedBusy: "Re-translating…",
      retryAllOk: "All {n} cells translated. Reinstalled.",
      retryPartial: "{recovered} recovered, {remaining} still failing.",
      previewToggle: "Preview JSON-LD",
      previewToggleTranslated: "Preview per locale",
      previewLocaleTabs: "Locale preview",
      untranslatedReasonPillMixedScript: "Wrong script",
      untranslatedReasonPillNoContentChange: "Looks untranslated",
      untranslatedReasonPillAiError: "AI error",
      untranslatedReasonHintMixedScript:
        "Headline or description still contains the wrong writing system for this locale — often the description is still English, has simplified-Chinese characters in Japanese, or leftover lowercase English words (e.g. design, launch). Re-translate or edit the fields below.",
      untranslatedReasonHintNoContentChange:
        "Headline and description are byte-identical to the default locale — the AI returned English unchanged while inLanguage says this locale. Re-translate with a stronger model or translate in Framer.",
      untranslatedReasonHintAiError:
        "The AI response was missing or invalid JSON for this page. Re-translate or fill the fields manually.",
      enableAll: "Enable all",
      disableAll: "Disable all",
      filterSearchPlaceholder: "Search by URL or page name…",
      filterNoMatch: "No proposals match your filter.",
      filter: {
        all: "All",
        new: "New",
        changed: "Changed",
        disabled: "Disabled",
        needsRetranslate: "Needs re-translate",
      },
      badgeNew: "New",
      badgeChanged: "Updated",
      badgeInstalled: "Installed",
      installAllButton:
        "Install {n} blocks ({proposals} pages × {locales} locales)",
      reinstallButton:
        "Re-install {n} blocks ({proposals} pages × {locales} locales)",
      reinstallButtonHint:
        "No content changes detected since the last install. Click to force-rewrite the schema in Custom Code anyway.",
      updateInstallButton: "Update install ({summary})",
      updateInstallButtonHint:
        "Re-install with changes: {summary}.",
      // Diff fragments — joined with " · " by the UI (e.g. "3 new · 2 changed").
      // Keep each fragment short (<=12 chars in English) so the joined
      // label still fits in narrow plugin panels.
      diffFragmentAdded: "{n} new",
      diffFragmentChanged: "{n} changed",
      diffFragmentRemoved: "{n} removed",
      installSuccess:
        "Installed {blocks} JSON-LD blocks across {pages} pages.",
      installSuccessWithPreserved:
        "Installed {blocks} JSON-LD blocks. {bytes} bytes of your existing Custom Code were preserved.",
      installFailed: "Install failed: {error}",
      installUndo: "Undo",
      installUndoDone: "Reverted to previous Custom Code state.",
      installUndoFailed: "Undo failed: {error}",
      editorOpen: "Edit fields",
      editorHelper:
        "Tweak this {kind} schema. Save to apply for the next install. Switch to Manual mode if you need to change the schema kind.",
      editorReset: "Reset to AI suggestion",
      editorEdited: "Edited",
      editorAddRow: "Add question",
      editorRemoveRow: "Remove",
      manualLink: "Or use manual mode",
      timeJustNow: "just now",
      timeMinutesAgo: "{n} min ago",
      timeHoursAgo: "{n} h ago",
      timeDaysAgo: "{n} d ago",
    },
    manual: {
      title: "Schema · Manual mode",
      backToAudit: "Back to AI audit",
      helper:
        "Build a single schema by hand. Use this for unusual page types or when AI auto-detection misses something.",
    },
    schemaTypeTitle: "Schema type",
    sourceContentTitle: "Source content (default locale)",
    localesTitle: "Locales to generate",
    localesClear: "Clear ({n})",
    localesSelectAll: "Select all ({n})",
    localesPartial: "{n} of {total}",
    previewTitle: "Preview",
    previewMultilingualHelper:
      "Text fields are reused across locales — only inLanguage and @id change. Use AI localized meta to translate the source content per locale before installing.",
    previewEmpty: "Select at least one locale above to generate schema.",
    installButton: "Install {n} block",
    installButtonPlural: "Install {n} blocks",
    installSuccess: "Installed {n} schema block(s) into Custom Code.",
    installSuccessWithPreserved:
      "Installed {n} schema block(s). {bytes} bytes of your existing Custom Code were preserved.",
    installFailed: "Install failed: {error}",
    selectLocaleWarning: "Select at least one locale.",
    kinds: {
      Article: "Article",
      ArticleHelper: "Blog posts, news, long-form content. Best for AI Overviews citations.",
      Product: "Product",
      ProductHelper: "Ecommerce items with price, brand, ratings.",
      LocalBusiness: "Local Business",
      LocalBusinessHelper:
        "Stores, restaurants, agencies. Appears in Google Maps & local AI answers.",
      FAQPage: "FAQ Page",
      FAQPageHelper:
        "Highest-leverage type for AEO — directly cited by ChatGPT & Perplexity.",
      Organization: "Organization",
      OrganizationHelper:
        "Brand identity. Add once at the site root for global recognition.",
    },
    fields: {
      canonicalUrl: "Canonical URL",
      headline: "Headline",
      description: "Description",
      image: "Image URL",
      author: "Author",
      publisher: "Publisher",
      datePublished: "Date published",
      name: "Name",
      brand: "Brand",
      sku: "SKU",
      price: "Price",
      currency: "Currency",
      businessName: "Business name",
      telephone: "Phone",
      streetAddress: "Street address",
      city: "City",
      countryIso: "Country (ISO)",
      question: "Question {n}",
      answer: "Answer",
      addQuestion: "+ Add question",
      removeQuestion: "Remove question",
      siteUrl: "Site URL",
      logoUrl: "Logo URL",
      sameAs: "Social profiles (comma-separated)",
    },
  },

  llms: {
    title: "Multilingual llms.txt",
    siteInfoTitle: "Site info",
    siteName: "Site name",
    siteNamePlaceholder: "Acme Studio",
    siteSummary: "One-line summary",
    siteSummaryPlaceholder:
      "Acme is a global product studio building tools for designers.",
    baseUrl: "Base URL",
    baseUrlPlaceholder: "https://acme.com",
    localizedPathsLabel: "Prefix non-default locales with their slug",
    longDescription: "Long description",
    longDescriptionOptional: "(optional)",
    longDescriptionHelper:
      "A short paragraph + bullet list. Sits between the one-line summary and the first ## section, like in Framer's own llms.txt.",
    longDescriptionPlaceholder:
      "Opening paragraph here.\n\nKey features and benefits:\n- Bullet 1\n- Bullet 2\n- Bullet 3",
    longSuggestHint:
      "Use AI to draft a Framer-style long description from your site name, summary, and scanned pages.",
    longSuggestPanelHelperGenerate:
      "Optionally tell the AI what to emphasize (audience, capabilities, differentiators). The site name + scanned pages give it factual scaffolding.",
    longSuggestPanelHelperOptimize:
      "Optionally tell the AI what to emphasize. We'll keep your meaning and bullets, just tighten and expand to AEO density.",
    longSuggestKeywordsPlaceholder:
      "e.g. emphasize the technical capabilities, audience is product-led startups…",
    suggestAppliedLong: "Long description updated.",
    aiPanelHeader: "AI helper · {field}",
    aiPanelKeywordsLabel: "What should the AI emphasize? (optional)",
    cmsSourceTitle: "CMS sources (optional)",
    collectionLabel: "Collection",
    collectionNone: "— None (site summary only) —",
    collectionLoading: "Loading…",
    collectionRefresh: "Refresh",
    collectionEmptyHelper:
      "No CMS Collections in this Framer project. Create one in Framer's CMS panel (e.g. Blog Posts, Products), then click Refresh. Skipping this is fine — you'll get a single llms.txt per locale with just your site summary.",
    collectionMultiHelper:
      "Tick every collection you want as a section. Each becomes its own ## heading in the file, in the order you tick them.",
    collectionItemCount: "{n} item(s)",
    collectionFieldsAuto: "uses {title} / {summary}",
    collectionFieldsAutoTitleOnly: "uses {title} (no summary)",
    collectionFieldsOverride: "uses {title} / {summary} (custom)",
    collectionFieldsOverrideTitleOnly: "uses {title} (custom, no summary)",
    collectionFieldsMissing:
      "Couldn't auto-detect a title field — please pick one.",
    collectionFieldsCustomize: "Customize fields",
    collectionFieldsCustomizeOpen: "Editing fields",
    collectionFieldsResetAuto: "Reset to auto",
    titleField: "Title field",
    summaryField: "Summary field",
    skippedDefaultHelperGeneric:
      "Couldn't read the title field on these rows. Open the section's Customize fields to pick a different field, or fill the missing values in Framer's CMS.",
    duplicateTitlesPill: "{n} duplicate title(s)",
    duplicateTitlesHelper:
      "Multiple CMS rows share the same title. AI engines dedupe by label and silently drop one — fix in Framer's CMS so each row has a unique Title.",
    duplicateTitlesSharedBy: "shared by {n} rows",
    duplicateTitlesSlugsLabel: "Affected slugs:",
    pagesSourceTitle: "Site pages",
    pagesSourceHelper:
      "Add a ## Pages section listing your static pages (About, Services, Contact, etc.). Click Scan to enumerate the project's pages.",
    pagesSectionTitle: "Pages",
    pagesScan: "Scan pages",
    pagesRescan: "Re-scan",
    pagesScanBusy: "Scanning…",
    pagesScanNeedsBaseUrl: "Set the base URL first.",
    pagesScanSuccess: "Found {n} static page(s).",
    pagesScanFailed: "Page scan failed: {error}",
    pagesScanPartialPill: "Partial scan",
    pagesScanPartialHelper:
      "Some pages couldn't be read — usually locked or incomplete templates. The rest of the list is fine.",
    pagesNotScannedYet:
      "Click Scan to load this project's static pages. We skip CMS templates and the homepage by default — you can tick more boxes once the list appears.",
    pagesEmpty:
      "No static pages found. (Pages bound to a CMS collection are added via the CMS sources section above.)",
    pagesHomepageBadge: "Home",
    aiTranslatingPages: "Translating {n} page(s) for {locale}…",
    aiTranslatingLongDescription: "Translating long description for {locale}…",
    longDescriptionFlagPill: "Long description not localized",
    longDescriptionFlagHintMixedScript:
      "The AI's translated long description had wrong-script text for this locale, so we kept your default-locale version. Try a stronger model.",
    longDescriptionFlagHintUntranslated:
      "The AI couldn't translate the long description cleanly, so we kept your default-locale version. Try a stronger model or write a locale-specific version by hand.",
    generatedTitle: "Generated files",
    generateButton: "Generate {n} file",
    generateButtonPlural: "Generate {n} files",
    uploadHelper:
      "Upload each file to the matching path in your hosting layer (e.g. {default}, {localized}).",
    deployTitle: "How to deploy on Framer",
    deployPlanBadge: "Framer Pro+",
    deployStepDownload:
      "Click Download on each file above (or Copy to paste them elsewhere).",
    deployStepFramer:
      "In your Framer dashboard, open Domains → your domain → Files tab, then upload each file at the root path.",
    deployStepFramerLink: "See Framer's official guide →",
    deployStepPublish:
      "Publish your site. The files become available at /llms.txt, /llms-zh-cn.txt, etc.",
    deployOtherHosting:
      "Static Files requires a Framer Pro plan or higher. On Basic/Free, you'd need a custom hosting setup (Cloudflare Workers in front of your domain, etc.) — drop the files at {default}, {localized}.",
    setSiteFirst: "Set site name and base URL first.",
    generationFailed: "Generation failed: {error}",
    configSaveFailed: "Could not save this draft. Try again before leaving.",
    copySuccess: "Copied.",
    generateSuccess: "Generated {n} file(s).",
    skippedLocalizedPill: "{n} item(s) skipped",
    skippedLocalizedHelper:
      "Items missing a localized title for {locale} were skipped — fill them in Framer's CMS, then regenerate.",
    skippedDefaultPill: "{n} CMS row(s) without a title",
    skippedDefaultHelper:
      "Couldn't read the field \"{field}\" on these rows. Check the title field name matches a real CMS field.",
    aiTranslateTitle: "AI auto-translate (optional)",
    aiTranslateToggle: "Translate missing items with AI",
    aiTranslateHelper:
      "When a CMS item has no localized title for a locale, Polyglot AEO can ask your chosen AI model to translate it. The translation goes into the generated llms.txt file only — your CMS rows are not modified.",
    aiProviderKeyMissing:
      "Add an API key for {provider} in Settings to enable auto-translate.",
    aiTranslatingProgress: "Translating {n} item(s) for {locale}…",
    aiTranslatingHeader: "Translating site summary for {locale}…",
    headerFlagPill: "Site summary not localized",
    headerFlagHintMixedScript:
      "The AI's translated summary contained the wrong script for this locale, so we kept your original summary. The locale header (e.g. Language: ja) will contradict the summary's actual language — try a stronger model or rewrite the source summary into language-neutral terms.",
    headerFlagHintUntranslated:
      "The AI couldn't translate the site summary cleanly, so we kept your original. The locale header will contradict the summary's actual language — try a stronger model or write a locale-specific summary by hand.",
    aiCostEstimate:
      "Est. upper-bound AI cost: ~${cost} (assumes every CMS item needs translating).",
    aiFailedPill: "{n} item(s) AI couldn't translate",
    aiFailedHelper:
      "The AI returned text that failed our quality checks. Click Retry above for another pass with our strengthened prompt — or try a stronger model, or fill these items in by hand.",
    aiFailedReasonMixedScript: "wrong script",
    aiFailedReasonUntranslated: "looks untranslated",
    aiFailedReasonParseFailed: "response not parsed",
    regenerateLocale: "Retry",
    regenerateLocaleBusy: "Retrying…",
    regenerateLocaleHint:
      "Re-run AI translation for {locale} only. Items the AI failed on get another pass; the other locales aren't touched.",
    regenerateLocaleSuccess: "Regenerated {locale} — all checks passed.",
    regenerateLocaleStillFailed:
      "Regenerated {locale}, but some items still failed quality checks. Try a stronger model.",
    regenerateLocaleNotFound:
      "Couldn't find that locale. Try regenerating all files instead.",
    downloadAll: "Download all ({n}) as ZIP",
    downloadAllHint:
      "Bundles every generated llms.txt into one .zip — drop it into Framer's Files panel to upload them all at once.",
    downloadAllSuccess: "Downloaded {n} file(s) as ZIP.",
    deployStepOpenProject: "Open Framer dashboard →",
    suggestGenerate: "✨ AI suggest",
    suggestOptimize: "✨ AI optimize",
    suggestHint:
      "Use AI to write a tighter, AEO-friendly site summary. We'll never overwrite your draft without you clicking Use this.",
    suggestPanelHelperGenerate:
      "Optionally tell the AI what to focus on (audience, category, key offering). Or leave blank — the brand name is enough.",
    suggestPanelHelperOptimize:
      "Optionally tell the AI what to emphasize. We'll keep your meaning intact and just tighten the wording.",
    suggestKeywordsPlaceholder:
      "e.g. branding studio for product-led startups, 4 years of work...",
    suggestGenerateAction: "Generate suggestion",
    suggestOptimizeAction: "Optimize my draft",
    suggestRetry: "Try again",
    suggestUse: "Use this",
    suggestBusy: "Asking the AI…",
    suggestApplied: "Site summary updated.",
    suggestResultTitle: "AI suggestion",
    suggestLowQualityPill: "Low confidence",
    suggestLowQualityHint:
      "The output didn't pass our quality checks (wrong script for your default locale, or near-identical to your draft). You can still use it, but consider trying a stronger model.",
    suggestFailed: "AI suggestion failed: {error}",
    suggestNoDefaultLocale:
      "Couldn't determine your default locale — open a Framer project with at least one locale and try again.",
    suggestNeedsSiteName:
      "Add your site name first — the AI uses it as the primary signal.",
    suggestModelHint:
      "Tip: a fast non-reasoning model (Claude Haiku, GPT-4o-mini, DeepSeek-V3, GLM-4-Plus) is enough for a one-line summary — reasoning models spend their token budget thinking and may run out before answering.",
    stepNavLabel: "llms.txt workflow steps",
    step: {
      setup: "Site info",
      sources: "Content sources",
      review: "Results",
      deploy: "Deploy",
    },
    stepNext: "Next",
    stepBack: "Back",
    stepGenerate: "Generate {n} files",
    goToDeploy: "Next: Deploy",
    backToReview: "Back to results",
    reviewFileCount: "{n} files",
    reviewLocaleNeedsAttention: "{locale} needs attention ({n} CMS items)",
    reviewLocaleTabs: "Generated file locales",
    reviewEmpty: "Generate files to see results here.",
    reviewNoIssues: "No issues for this locale.",
    issuesTitle: "Issues",
    previewTitle: "Preview",
    configChangedHint:
      "Settings changed since the last generation. Regenerate to refresh your files.",
    regenerateAll: "Regenerate all",
    setupOptionalTitle: "Optional",
    setupAiEnabled: "On",
    stepProgress: "{current}/{total} · {label}",
    sourcesTitle: "Content sources",
    cmsFoldSummary: "CMS · {n} selected",
    pagesFoldSummary: "Pages · {n} selected",
    showMoreCollections: "+ {n} more collections",
  },

  meta: {
    title: "Meta copy generator",
    sourceTitle: "Source page",
    pageFlowIntro:
      "Load a page from your project, pick one, then review the content before generating meta.",
    pageFlowTitle: "Page setup steps",
    pageFlowLoad: "Load pages from project",
    pageFlowLoadDone: "Pages loaded",
    pageFlowLoadHint:
      "We read your Framer static pages so you can pick one — no need to paste URLs by hand.",
    pageFlowSelect: "Choose a page",
    pageFlowSelectDone: "Selected: {title}",
    pageFlowSelectHint: "Pick the page you want meta copy for. We'll pull its text into context.",
    pageFlowSelectPlaceholder: "Select a page…",
    pageFlowManual: "Enter context manually instead",
    pageFlowManualDone: "Manual entry",
    pageFlowBackToPick: "Pick from project instead",
    pageFlowRescan: "Reload page list",
    pageFlowContent: "Review page info",
    pageFlowContentHint:
      "Edit the summary if needed. ✨ AI fill works after page context is ready.",
    pageFlowSelectedPage: "Working on {title} ({path})",
    pageContentLoading: "Reading page…",
    stepNextNeedLoad: "Load pages from the project first.",
    stepNextNeedSelect: "Choose a page, or switch to manual entry.",
    stepNextNeedContext: "Add page context before continuing.",
    generateNeedKey:
      "Add an API key for {provider} in Settings (or pick a provider that already has a key).",
    stepNavLabel: "Meta workflow steps",
    step: {
      page: "Page",
      generate: "Generate",
      review: "Copy to Framer",
    },
    stepNext: "Next",
    stepBack: "Back",
    stepProgress: "{current}/{total} · {label}",
    reviewIntro:
      "Title, description, and social tags for each language are below. Framer cannot receive SEO from plugins yet — paste them into each page’s settings per locale.",
    reviewDone: "Done",
    sessionRestored: "Restored your last generated meta — continue copying into Framer.",
    applyNotSeoTab: "No “SEO” menu — no “Page settings” in the F menu either",
    applySiteVsPage:
      "The F → Site settings flyout (General, Custom Code, …) is site-wide only. Per-page meta is opened from the Pages list on the canvas (next step). General’s Title/Description is a default, not your per-locale copy.",
    applyPageFallback: "your page",
    applyStepOpenPagePanel:
      "Open settings for “{page}” — fields at the top: Title and Page Description.",
    applyStepOpenPagePanelHow:
      "Close or shrink this plugin. Click the Pages icon on the left → hover your page (e.g. Home) → ⋯ → Settings. Title and Page Description are at the top of that panel.",
    applyStepFieldMapping:
      "Paste plugin Title → Framer Title; Meta description → Page Description. OG/Twitter fields go in the social section on the same panel.",
    applyStepFramerMetaDocs: "Framer: page titles & descriptions →",
    setupOptionalTitle: "Optional",
    pickPage: "Page",
    pickPageManual: "Manual context only",
    scanPages: "Load pages from project",
    scanningPages: "Scanning pages…",
    pagesScanPartial: "Some pages could not be read — the list may be incomplete.",
    noStaticPages: "No static pages found. Paste context manually.",
    pageLoadFailed: "Could not read page content. Edit context manually.",
    homepageBadge: "homepage",
    suggestPageTypeHint: "Suggest page type from context",
    pageTypeHelper:
      "Leave blank and tap ✨ Infer, or type a label (e.g. Landing page). Used when generating meta.",
    pageTypeHomeHint:
      "Home pages are usually Landing page. Use ✨ Infer from your page context, or pick another type.",
    suggestHint: "Fill this field with AI from page context",
    suggestHintInfer: "Infer from page context",
    suggestHintImprove: "Improve the current value using page context",
    suggestAction: "AI",
    suggestActionInfer: "Infer",
    suggestActionImprove: "Improve",
    suggestSameBadge: "Matches current",
    suggestSameAsCurrent:
      "AI agrees with what you already have ({value}). No need to replace — continue to the next step.",
    suggestSameDismiss: "Got it",
    suggestSameApplied: "Already set — no change needed.",
    suggestRetryFresh: "Infer again",
    suggestChangeFrom: "Change: {from} → {to}",
    suggestNewValue: "Suggested value:",
    suggestBusy: "AI…",
    suggestUse: "Use this",
    suggestRetry: "Retry",
    suggestNeedsContext: "Add page context first — AI needs something to read.",
    suggestNoDefaultLocale:
      "No default locale found. Add at least one locale in Framer.",
    suggestFailed: "AI suggestion failed: {error}",
    suggestApplied: "Field updated.",
    pageType: "Page type",
    pageTypePlaceholder: "Landing page, blog post, product page…",
    pageContext: "Page context",
    pageContextPlaceholder:
      "Headline + a paragraph or two summarizing what this page does, who it serves, and why it matters.",
    primaryKeyword: "Primary keyword (optional)",
    primaryKeywordPlaceholder: "multilingual SEO plugin",
    brandVoice: "Brand voice (optional)",
    brandVoicePlaceholder: "Confident, technical, concise",
    providerTitle: "AI provider",
    modelTitle: "Model",
    providerClaude: "Claude",
    providerOpenAi: "GPT-4o-mini",
    providerKeyMissing: "Add an API key for {provider} in Settings to use it.",
    estimatedCost: "Est. cost",
    generateReady: "Ready to generate meta for {n} locales.",
    resultsTitle: "Results",
    reviewLocaleCount: "{n} locales",
    reviewLocalesNeedAttention: "{locales} need attention",
    reviewLocaleTabs: "Generated meta locales",
    reviewEmpty: "Generate meta to see results here.",
    fieldGroupSearch: "Search",
    fieldGroupSocial: "Open Graph & Twitter",
    copyAll: "Copy all fields",
    copyAllSuccess: "Copied all fields for this locale.",
    copyAllFailed: "Could not copy — select and copy manually.",
    lengthSoftPill: "Long ({max})",
    lengthSoftHint: "Google often truncates around {max} characters — consider shortening.",
    addContextWarning: "Add some page context first.",
    setKeyWarning: "Set your API key in Settings first.",
    generateButton: "Generate for {n} locale",
    generateButtonPlural: "Generate for {n} locales",
    generatingProgress: "Generating… {current}/{total}",
    generateCancelled: "Generation cancelled.",
    generatedSuccess: "Generated meta for {n} locales.",
    generatedSuccessWithIssues:
      "Generated meta for {n} locales. {issues} locale(s) may need a retry.",
    regenerate: "Regenerate",
    regenerateAll: "Regenerate all",
    regenerateOne: "Regenerate this locale only",
    regenerating: "Regenerating…",
    configChangedHint:
      "Page context changed since the last generation. Regenerate to refresh results.",
    applyTitle: "Apply in Framer",
    applyStepLocale: "In Framer, switch to the target language in the top bar (globe / locale picker).",
    applyStepLocaleLink: "Framer localization guide",
    applyStepPage: "Open this page’s settings (Title + Page Description).",
    applyStepPageWithPath: "Open settings for {path} (Title + Page Description).",
    applyStepCopyBelow:
      "Below, pick a language tab and copy each field (or Copy all).",
    applyStepRepeatLocales:
      "Do the same for every language, then publish the site.",
    applyStepPublish: "Publish the site when every locale looks good.",
    applyStepOpenProject: "Open Framer project",
    applyHelper:
      "Framer does not let plugins write page SEO yet — paste these values into Page settings per locale.",
    fields: {
      title: "Title",
      metaDescription: "Meta description",
      ogTitle: "OG title",
      ogDescription: "OG description",
      twitterTitle: "Twitter title",
      twitterDescription: "Twitter description",
    },
    qualityIssuePill: "⚠ {n} issue(s)",
    qualityIssueHint:
      "We detected likely translation problems. Click Regenerate to retry, or hand-edit the affected fields below.",
    qualityUntranslatedPill: "Likely untranslated",
    qualityUntranslatedHelper:
      "The meta description matches your source text — the AI probably didn't translate. Try Regenerate or switch to a stronger model.",
    qualityParseFailedPill: "Parse failed",
    qualityParseFailedHelper:
      "The AI response was not valid meta JSON. Try Regenerate or switch model.",
    qualityMixedScriptPill: "Wrong script",
    qualityMixedScriptHint:
      "This field's content isn't in the target locale's script (e.g. Latin output for a Japanese locale). Likely a translation failure.",
  },

  settings: {
    title: "Settings",
    apiKeysTitle: "AI providers (BYOK)",
    apiKeysHelper:
      "Polyglot AEO never sees your keys. Each provider's key is stored only in this Framer project's plugin data and sent directly from your browser to that provider when you generate meta. You only pay each provider's normal API rates.",
    providerKeyPlaceholder: "API key for {provider}",
    providerGetKey: "Get a key",
    providersShowMore: "Show {n} more providers",
    providersHide: "Hide additional providers",
    testKey: "Test",
    testing: "Testing…",
    testKeyOk: "Connected",
    testKeyFail: "Failed",
    testKeyEmpty: "Paste a key first",
    addCustomProvider: "+ Add custom provider",
    customProviderTitle: "Custom OpenAI-compatible provider",
    customProviderHelper:
      "Use any OpenAI-compatible endpoint — Together, Groq, Ollama, LiteLLM, vLLM, an enterprise gateway, etc. Polyglot AEO will send standard /chat/completions requests.",
    customProviderName: "Display name",
    customProviderNamePlaceholder: "My private LLM",
    customProviderBaseUrl: "Base URL",
    customProviderBaseUrlPlaceholder:
      "https://api.example.com/v1 (the URL ending where /chat/completions sits)",
    customProviderModelIds: "Model ids (comma-separated)",
    customProviderModelIdsPlaceholder: "llama-3.3-70b, mixtral-8x22b",
    customProviderSave: "Save provider",
    customProviderRemove: "Remove",
    customProviderSaved: "Custom provider saved.",
    customProviderRemoved: "Custom provider removed.",
    customProviderInvalid:
      "Please fill in display name, base URL, and at least one model id.",
    customProviderRemoveConfirm:
      "Remove this custom provider? Its API key will also be cleared. This cannot be undone.",
    customProviderDiscardConfirm:
      "Discard this custom provider draft? API keys and brand voice changes have been autosaved.",
    customProviderDiscard: "Discard draft",
    anthropicKey: "Anthropic API key",
    openaiKey: "OpenAI API key",
    brandVoiceTitle: "Brand voice",
    brandVoiceHelper: "Applied to every locale. Optional but recommended.",
    brandVoicePlaceholder:
      "Confident, technical, concise. We use 'you', not 'your business'. We avoid buzzwords.",
    languageTitle: "Plugin language",
    languageHelper:
      "The language of the Polyglot AEO interface itself. Independent of your project's content locales.",
    languageAuto: "Auto ({detected})",
    quickStartResetTitle: "Quick start",
    quickStartResetHelper:
      "Re-show the onboarding checklist on the dashboard.",
    quickStartResetButton: "Show quick start",
    quickStartResetDone: "Quick start re-enabled.",
    installedTitle: "Installed schema",
    installedYes: "Installed",
    installedNo: "Not installed",
    removeAll: "Remove all",
    removeAllHelper:
      "This only removes blocks owned by Polyglot AEO. Custom Code added manually or by other plugins is left untouched.",
    saveSuccess: "Settings saved.",
    autoSaveLoading: "Loading…",
    autoSaveUnsaved: "Autosaving…",
    autoSaveSaving: "Saving…",
    autoSaveSaved: "Saved",
    autoSaveError: "Could not save settings.",
    removeSuccess: "Schema removed from Custom Code.",
    removeSuccessWithPreserved:
      "Schema removed. {bytes} bytes of your existing Custom Code were preserved.",
  },

  license: {
    proBadge: "Pro",
    settingsTitle: "Polyglot AEO Pro",
    settingsHelper:
      "Activate your Creem license for this Framer project. One activation per site on Pro.",
    billingModeLabel: "Checkout and license environment",
    productionMode: "Production",
    testMode: "Test",
    productionModeHelper:
      "Real checkout and production licenses. Marketplace builds must use this mode.",
    testModeHelper:
      "Sandbox checkout and test licenses. Use this to test the full flow without real charges.",
    keyLabel: "License key",
    keyPlaceholder: "pa_live_…",
    activate: "Activate",
    activating: "Activating…",
    activateSuccess: "Pro activated for this project.",
    activateFailed: "Could not activate license. Check the key and try again.",
    getPro: "Get Pro",
    comparePlans: "Compare Free vs Pro",
    activeKey: "Active: {hint}",
    refresh: "Re-check license",
    validating: "Checking…",
    deactivate: "Remove license",
    upgrade: {
      title: "Upgrade to Pro",
      generic:
        "Unlock multilingual schema, Meta AI, llms.txt per locale, and unlimited installs.",
      multi_locale:
        "Multiple locales detected. Pro generates native schema, meta, and llms for each language.",
      schema_install_limit:
        "Free includes up to 5 pages of AI schema install. Pro is unlimited.",
      schema_install_all:
        "Enable or install all pages at once is a Pro feature.",
      schema_translate:
        "Translating schema content per locale requires Pro.",
      llms_generate:
        "AI llms.txt generation requires Pro. You can still edit and copy a default-locale draft on Free.",
      llms_multi_locale:
        "Additional locale llms files (llms-ja.txt, etc.) require Pro.",
      llms_ai_translate:
        "AI translation for llms.txt requires Pro.",
      meta_generate:
        "Free includes 3 default-locale Meta AI samples. Pro unlocks bulk generation across every locale.",
      schema_audit_persist:
        "Pro keeps install history and diff context across sessions.",
      remote_schema_rules:
        "Pro includes shipped quality updates as the plugin evolves.",
      generic_pro:
        "Unlock the full multilingual AEO workflow with Pro.",
      bulletLocales:
        "Native schema + meta + llms per locale — not just inLanguage tags",
      bulletQuality: "AI quality checks before you ship translations",
      bulletAgency: "One client site pays for itself at $19/mo",
      ctaLabel: "Upgrade to Pro",
      ctaPrice: "$19 per month",
      pricingHint: "Or $190/year (~17% off). 14-day refund per polyglotaeo.com.",
    },
    dashboardLocaleBanner:
      "This project has {count} locales. Pro unlocks per-locale schema, Meta, and llms.",
    dashboardLocaleFree: "Using default locale only on Free ({code}).",
    freeInstallQuota: "{used}/{max} AI schema pages on Free",
  },

  shortcuts: {
    title: "Keyboard shortcuts",
    helper: "Press ? anytime to bring this back.",
    back: "Go back to the previous view",
    submit: "Run the primary action (Generate / Install)",
    help: "Show this list",
  },
}

export type Translations = typeof en
