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
    apiKeyMissing: "Managed AI unavailable",
    apiKeyMissingHelper: "Activate Pro to enable AI generation.",
    default: "Default",
    confirmDiscardChanges:
      "You have unsaved edits. Switching schema type will discard them. Continue?",
    confirmRemoveAll:
      "Remove all Polyglot AEO–injected schema from this site's Custom Code? Your own snippets will be left untouched.",
    helpClose: "Close help",
    helpOpen: "Show help",
    aiSettingsTitle: "AI settings",
    openSettings: "Open settings",
    uiLanguage: "Change plugin language",
    uiLanguageTitle: "Plugin language: {name}",
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
    managedAi: "Managed AI generation runs through Polyglot AEO's backend. Model credentials stay on the server, requests require an active Pro license, and usage is protected by short-lived session tokens plus quotas.",
    canonicalUrl:
      "The single official URL for this page. Search engines and AI crawlers use it to deduplicate and decide which version to cite. For multilingual pages, each locale typically has its own canonical (e.g. /about and /zh/about).",
    llmsTxt:
      "A standardized text file (like robots.txt for LLMs) that summarizes your site's structure for AI crawlers. Polyglot AEO outputs one llms.txt per locale so each language is indexed independently.",
    fenced:
      "Polyglot AEO wraps everything it injects into Framer's Custom Code in HTML comment fences (polyglot-aeo:start / :end). On uninstall, only fenced blocks are removed — your manually-added scripts (GA, Hotjar, Stripe) stay intact.",
    brandVoice:
      "A short style guide passed to the AI when generating localized meta. Keep it specific: 'confident, technical, concise; we say \"you\" not \"your business\"' beats 'professional and friendly'.",
    perLocaleSchema:
      "Google's official guidance: each language version of a page should ship its own JSON-LD with a matching inLanguage value. AI search engines use this to decide which locale to cite when a user asks in that language. Generic AEO plugins ship one schema for the default locale — Polyglot AEO produces correct variants for every locale.",
  },

  dashboard: {
    subtitle:
      "Pre-launch and post-publish AEO QA for multilingual Framer sites.",
    subtitleSecondary:
      "Schema in Custom Code · Meta for Page settings · llms.txt via Static Files.",
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
    healthKeyDone: "Managed AI is ready",
    healthKeyTodo: "Activate Pro for managed AI",
    healthLocalesDone: "All locales are unlocked",
    healthLocalesTodo: "Unlock every locale with Pro",
    openControl: "Open control center",
    reportDownload: "Download client report",
    stackTitle: "Works with your Framer stack",
    stackBadge: "3-step workflow",
    stackIntro:
      "Diagnose first, translate body copy, then ship per-locale AEO assets here.",
    stackScannerRole: "Step 1 · Diagnose",
    stackScannerLink: "Framer AEO scanner",
    stackScannerDesc: "Site-wide AEO check — see what to fix.",
    stackLokaRole: "Step 2 · Body copy",
    stackLokaLink: "Loka Localization Hub",
    stackLokaDesc: "Manage translations in Google Sheets.",
    stackPolyglotRole: "Step 3 · AEO",
    stackPolyglotDesc:
      "Generate and install Schema, llms.txt, and paste-ready meta. Body copy stays in Loka.",
    toolsTitle: "Tools",
    controlTool: "AEO control center",
    controlToolDesc:
      "Prioritized fixes for schema, CMS gaps, meta, llms.txt, and live checks.",
    schemaTool: "Per-locale schema",
    schemaToolDesc: "Install one JSON-LD variant per locale.",
    llmsTool: "Multilingual llms.txt",
    llmsToolDesc: "Generate one crawl file per locale.",
    cmsGapsTool: "CMS localization gaps",
    cmsGapsToolDesc:
      "Find missing titles, summaries, slugs, and duplicate rows.",
    metaTool: "Meta copy generator",
    metaToolDesc: "Rewrite titles and descriptions per language.",
    verifyTool: "Published-site verifier",
    verifyToolDesc: "Check schema, meta, and llms.txt on the live site.",
    settingsTool: "Settings",
    settingsToolDesc: "License, managed AI, brand voice.",
    launchChecklistTitle: "Launch checklist",
    launchChecklistControlHint:
      "Full readiness score (CMS gaps + live checks) lives in the AEO control center.",
    localesShow: "Show locale list",
    localesHide: "Hide locale list",
    localesMore: "+{n} more",
    proBannerPlan: "Free",
    proBannerTitle: "Free audits every gap",
    proBannerBody:
      "Pro unlocks generation and installation for all {count} locale variants.",
    proBannerAction: "Unlock all locales",
    quickStartTitle: "Quick start",
    quickStartProgress: "{done} of {total}",
    quickStartCoreProgress: "{done} of {total} core",
    quickStartNext: "Next",
    quickStartNextUp: "Next up",
    quickStartAllDone: "You're all set",
    quickStartDismiss: "Dismiss",
    quickStartCollapse: "Collapse",
    quickStartExpand: "Expand",
    quickStartSteps: {
      addLocalesTitle: "Add locales in Framer",
      addLocalesDesc:
        "Best with 2+ locales. Single-locale sites can still finish Schema and llms.txt first.",
      addLocalesAction: "Open docs",
      installSchemaTitle: "Install per-locale schema",
      installSchemaDesc:
        "Pick a schema type, fill in source content, and inject one JSON-LD block per locale into your site head.",
      installSchemaAction: "Open Schema",
      generateLlmsTitle: "Generate llms.txt files",
      generateLlmsDesc:
        "Tell ChatGPT, Perplexity, and Claude how to crawl every language of your site.",
      generateLlmsAction: "Open llms.txt",
      deployLlmsTitle: "Upload llms.txt to Framer",
      deployLlmsDesc:
        "Download the ZIP, upload files to Domains → Files (site root), then publish. DEPLOY.md is inside the ZIP.",
      deployLlmsAction: "Open llms.txt",
      addApiKeyTitle: "Managed AI is included with Pro",
      addApiKeyDesc:
        "AI Schema audit and Localized Meta run through Polyglot's backend. Activate Pro in Settings; no provider credential is entered in the plugin.",
      addApiKeyAction: "Open settings",
      generateMetaTitle: "Generate meta copy (optional)",
      generateMetaDesc:
        "Native titles and descriptions per locale — paste into Framer Page settings.",
      generateMetaAction: "Open Meta",
      verifyPublishedTitle: "Verify published site",
      verifyPublishedDesc:
        "After publishing, check homepage HTML, JSON-LD, meta, and llms.txt paths from inside the plugin.",
      verifyPublishedAction: "Run verifier",
    },
  },

  control: {
    title: "AEO control center",
    readiness: "Readiness",
    readinessHint:
      "Checks localized CMS content, schema coverage, llms.txt, meta copy, and published-site verification.",
    scanning: "Scanning…",
    rescan: "Rescan",
    downloadReport: "Download report",
    scanFailed:
      "Scan could not finish. Try Rescan, or check your Pro license in Settings. {error}",
    verifyRescanNote:
      "Rescan runs a live HTTP check (homepage, JSON-LD, llms paths) when a publish URL is available.",
    verifyNoProxy:
      "Your browser may block reading the live site directly, so a “failed” live check does not always mean the site is broken. Open the paths manually to confirm.",
    liveVerifySkipped:
      "No publish URL yet — live checks skipped. Publish the site or set the base URL in llms.txt setup, then Rescan.",
    liveVerifySummary:
      "Last live check ({time}): {failures} failed on {url}. Open Published-site verifier for details.",
    liveVerifyCompact: "Last check: {failures} live checks failed on {url}.",
    cmsGapCountExplain:
      "Titles and summaries affect the launch score. Slugs are shown so every locale can still publish clean URLs.",
    summary: "{critical} critical · {warning} warnings · {info} notes",
    status: {
      blocked: "Not ready for launch",
      needsWork: "Needs fixes before launch",
      readyWithNotes: "Ready with notes",
      ready: "Ready to launch",
    },
    metricLaunchBlockers: "Critical blockers",
    metricCmsGaps: "CMS title/summary gaps",
    metricLocales: "Locales",
    metricLiveFailures: "Live check failures",
    issuesTitle: "Launch blockers",
    taskQueueTitle: "Next launch tasks",
    taskQueueHelper:
      "Work these from top to bottom. Each fix routes to the exact Polyglot AEO tool that removes the blocker.",
    taskStep: "Task {n}",
    noIssues:
      "No launch blockers found. Run the published-site verifier after your next publish.",
    severity: {
      critical: "Critical",
      warning: "Warning",
      info: "Note",
    },
    issue: {
      schema_missing: {
        title: "Per-locale schema is not installed",
        body: "Install JSON-LD before launch so AI systems can understand each page.",
        action: "Open schema audit",
      },
      schema_disabled: {
        title: "Installed schema is disabled",
        body: "Framer Custom Code is disabled, so crawlers will not see Polyglot AEO blocks.",
        action: "Re-enable schema",
      },
      llms_missing: {
        title: "llms.txt has not been generated",
        body: "Generate the default file, then use Pro for every locale variant.",
        action: "Generate llms.txt",
      },
      meta_missing: {
        title: "Meta copy not generated yet",
        body: "Generate at least one set of titles and descriptions per language before launch.",
        action: "Generate meta copy",
      },
      api_key_missing: {
        title: "Managed AI is not available",
        body: "Activate Pro to unlock audit, localization, and retry workflows.",
        action: "Open license settings",
      },
      multi_locale_locked: {
        title: "{count} locales detected, Pro unlocks full coverage",
        body: "Free shows the gaps. Pro generates and installs native AEO assets for every locale.",
        action: "Unlock all locales",
      },
      cms_locale_gaps: {
        title: "{count} CMS title or summary gaps",
        body: "Counts missing localized CMS titles and summaries only (not slugs). Fix in Framer CMS so llms.txt and schema stay complete per locale.",
        action: "Open CMS gaps",
      },
      cms_duplicate_titles: {
        title: "{count} duplicate CMS title rows",
        body: "Duplicate titles make AI crawlers collapse separate records into one ambiguous entry.",
        action: "Review duplicate titles",
      },
      published_failures: {
        title: "{count} published-site checks failed",
        body: "Run verifier and fix live URLs before handing off the site.",
        action: "Open live verifier",
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
    runVerifier: "Run verifier",
    proBadge: "Optional",
    proCoverageTitle: "Full coverage for {count} locales",
    proCoverageBody:
      "Keep auditing free. Upgrade when you want generation and installation for every locale variant.",
    proCoverageAction: "Upgrade for all locales",
  },

  cmsGaps: {
    title: "CMS localization gaps",
    summaryTitle: "Gap summary",
    detailsTitle: "Collection details",
    rows: "{n} rows",
    fields: "Fields: title = {title}, summary = {summary}",
    summaryHint:
      "Titles and summaries affect launch readiness. Slugs are URL hygiene, shown separately so every locale can still ship clean URLs.",
    fieldTitles: "titles",
    fieldSummaries: "summaries",
    fieldSlugs: "slugs",
    fieldTitle: "title",
    fieldSummary: "summary",
    fieldSlug: "slug",
    fieldContent: "content",
    needsLocalized: "Needs localized {fields} in {locales}.",
    collectionClean: "No localized CMS gaps found in this collection.",
    rowIssueCount: "{n} affected rows",
    showFixes: "Show fixes",
    localeFixCount: "{locale} needs {count} fixes",
    localeFixBreakdown:
      "{locale}: {titles} titles · {summaries} summaries · {slugs} slugs",
    moreLocales: "+ {n} more locales",
    duplicateFixCount: "{n} duplicate title groups need unique titles",
    openCollectionAction: "Open {name} CMS",
    metricTitles: "titles",
    metricSummaries: "summaries",
    metricLaunchBlockers: "title/summary blockers",
    metricRowFixes: "affected CMS rows",
    metricSlugs: "slugs",
    metricDuplicates: "duplicates",
    downloadCsv: "Download CSV",
    empty: "No CMS collections found.",
    detailsHint:
      "Open a collection, fix the listed rows in Framer CMS, then rescan.",
    csvHint:
      "CSV export now includes row id, title, default slug, locale, missing fields, and duplicate-title flags for handoff.",
    manualHint:
      "Project Owners can edit CMS. If tapping does not open the panel, use the CMS icon in Framer’s left sidebar and pick the same collection (canvas plugins sometimes only select it).",
    rowIssuesTitle: "Rows to fix",
    defaultSlug: "Slug: /{slug}",
    moreRowIssues: "+ {n} more row fixes in the CSV",
    duplicateRowsTitle: "Duplicate titles",
    duplicateRowsShared: "{n} rows share this title",
    moreDuplicateGroups: "+ {n} more duplicate groups in the CSV",
    openInFramer: "Open {name} in Framer CMS",
    opened:
      "Opened {name} in Framer CMS. The plugin panel stays open — use Back to return to the dashboard.",
    openedSelectOnly:
      "Selected {name}. Open the CMS tab in Framer’s left sidebar if the panel is not visible.",
    openManualSteps:
      "Could not switch views automatically. In Framer: open CMS in the left sidebar → select「{name}」→ edit ja / ko / fr fields.",
  },

  verify: {
    title: "Published-site verifier",
    ringLabel: "LIVE",
    heroEyebrow: "Published QA",
    statusIdle: "Ready to verify",
    statusReady: "Ready to hand off",
    statusWarnings: "Ready with warnings",
    statusNotReady: "Not ready for handoff",
    summaryLine: "{fail} failed · {warn} warnings · {pass} passed",
    emptySummaryLine: "Homepage · schema · meta · llms paths",
    heroBody:
      "Checks the live homepage, JSON-LD, meta description, and every llms.txt path after publishing.",
    metricFailures: "live failures",
    metricLlms: "llms files",
    metricSchema: "JSON-LD",
    metricMeta: "Meta description",
    metricOk: "OK",
    metricReview: "Review",
    siteUrl: "Published site URL",
    helperShort:
      "Use the public production URL after publishing. Re-run after uploading llms.txt files or reinstalling schema.",
    helper:
      "Run after publishing. Fetches go through the Polyglot server (same base as the License API). Upload llms.txt to Framer Static Files and publish before checking paths.",
    run: "Verify published site",
    runShort: "Verify",
    rerun: "Re-verify",
    running: "Verifying…",
    results: "Results",
    copyReport: "Copy report",
    downloadReport: "Download report",
    reportCopied: "Published-site report copied.",
    reportDownloaded: "Published-site report downloaded.",
    verifyFailed: "Verification failed: {error}",
    lastChecked: "Last check: {time} on {url}.",
    beforeRunTitle: "What this verifies",
    beforeRunBody:
      "Use this right before handoff. It confirms that Framer has actually published the AEO assets you generated inside the plugin.",
    checkHomepage: "Homepage HTML",
    checkSchema: "JSON-LD script",
    checkMeta: "Meta description",
    checkLlms: "llms.txt paths",
    fixFirst: "Fix before handoff",
    passedChecks: "Passed checks",
    openTool: "Open tool",
    openSchemaAudit: "Open schema audit",
    openLlmsGenerator: "Open llms.txt generator",
    openMetaGenerator: "Open meta generator",
    homepage: "Homepage reachable",
    homepageOk: "Fetched homepage HTML with HTTP {status}.",
    homepageBlocked:
      "Could not read the homepage. Open the URL manually and inspect source.",
    homepageBlockedNoProxy:
      "The browser blocked reading this site. Open the URL in a browser to check it manually.",
    homepageHttpError: "Homepage returned HTTP {status}; HTML was not parsed.",
    invalidUrl: "Enter a public site URL starting with https://.",
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
    llmsFetchBlocked:
      "Could not read /{filename} (cross-origin). Configure the Worker proxy and retry, or open the path in a browser.",
    llmsLocale404:
      "/{filename} returned 404. Upload the file under Framer → Domains → Files and publish again.",
    llmsHttpError: "/{filename} returned HTTP {status}.",
    llmsMissing:
      "/llms.txt returned 404. Upload it in Framer Static Files and publish again.",
    proxyHint:
      "Live-site checks need the Polyglot verification service, which this build cannot reach. A failed check here is a browser limit, not proof your files are missing.",
    proxyHintTitle: "Live-site checks unavailable",
  },

  schema: {
    title: "Per-locale schema",
    audit: {
      title: "Schema · AI Audit",
      heroTitle: "Let AI propose schemas for every page",
      heroBody:
        "Polyglot AEO scans your Framer project, picks the right schema kind for each page, fills the fields from your content, and translates everything into every locale you've set up.",
      wizardTimeHint:
        "First scan usually takes 3–5 minutes depending on site size.",
      providerLabel: "AI provider",
      modelLabel: "Model",
      auditSetupTitle: "Audit setup",
      auditSetupEyebrow: "Readiness",
      auditSetupSnapshotEyebrow: "Installed",
      auditSetupHelper:
        "Scan coverage, review risk, locale assets, and estimated AI cost before installing.",
      auditSetupSnapshotHelper:
        "Installed JSON-LD is intact. Scan again to rebuild the review queue and compare it with current Framer content.",
      summaryScanning: "Scanning…",
      summaryNeedsReview: "Review before install",
      summaryReady: "Ready to install",
      summaryNoInstallable: "No installable schemas",
      summaryInstalled: "Installed snapshot",
      summaryNotScanned: "Not scanned yet",
      summaryLine: "{enabled} enabled · {review} need review",
      summarySnapshotLine: "{blocks} installed blocks · {locales} locales",
      summaryEmptyLine: "Activate Pro, then scan to build the proposal queue.",
      blocksRingLabel: "blocks",
      installedBlocksMetric: "installed blocks",
      localeVariantsMetric: "locales",
      reviewQueueMetric: "scan to rebuild",
      scanNeededMetricValue: "—",
      enabledPagesMetric: "enabled pages",
      estimatedCostMetric: "est. cost",
      translateContentLabel: "Translate content into every locale",
      translateContentHelper:
        "Generates a fully native headline, description, and body for each non-default locale instead of just changing the inLanguage tag. Adds a small AI cost but produces real localized JSON-LD.",
      aiNeeded: "Activate Pro in Settings to enable the AI scan.",
      scanButton: "Scan site",
      scanButtonPro: "Scan with Pro",
      rescan: "Re-scan",
      scanning: "Scanning your site…",
      scanProgress: "{current} of {total}",
      translateProgress: "Translating {current} of {total}",
      progressSiteTitle: "Reading Framer project",
      progressSiteHelper:
        "Loading pages, CMS rows, locales, and existing installed schema blocks.",
      progressAiTitle: "Calling AI for schema proposals",
      progressAiHelper:
        "The model is classifying pages and drafting JSON-LD. Free or subscription plans may pause under load.",
      progressTranslateTitle: "Localizing schema content",
      progressTranslateHelper:
        "Generating native headlines, descriptions, and body text for each non-default locale.",
      progressCurrentItem: "Current item",
      progressProvider: "Provider",
      progressModel: "Model",
      progressCalls: "Progress",
      progressPreparing: "Preparing",
      progressReadingFramer: "Reading project data",
      progressWaitingForProvider: "Waiting for provider response",
      progressSlowTitle: "Taking longer than usual",
      progressSlowHelper:
        "This usually means provider rate limits, low balance, a slow model, or a large page. To debug, open Settings → Test key, switch to a faster model, or turn off locale translation and re-scan.",
      homepageLabel: "Homepage",
      scanCalls: "scan calls",
      translateCalls: "translation calls",
      scanFailed: "Scan failed: {error}",
      scanEmpty: "No pages found in this Framer project.",
      partial: "Some pages couldn't be read. Re-scan to retry.",
      scanSummary: "Scanned {n} pages.",
      snapshotTitle: "Last installed",
      snapshotInstalledAt: "{time} · {n} blocks across {locales} locales",
      snapshotChanges: "{n} changed",
      snapshotAdded: "{n} new",
      snapshotRemoved: "{n} removed",
      snapshotUpToDate: "Up to date",
      snapshotNeedsUpdate: "Needs update",
      snapshotRescanHint:
        "Re-scan to detect content changes since the last install.",
      snapshotSessionListHint:
        "The proposal list is kept only while this plugin panel stays open. Tap Scan site below to restore it — installed JSON-LD is unchanged.",
      snapshotRestoreHintShort:
        "Scan again to restore the proposal queue. Installed JSON-LD is unchanged.",
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
      identityCardTranslationsCount: "Translated for {n} locales",
      identityCardNoTranslations:
        "Will translate for non-default locales on next scan.",
      identityPartialTranslate:
        "Couldn't translate brand identity for {n} locales. Those will use the source-language brand at install time.",
      proposalsTitle: "Proposed schemas",
      proposalsCount: "{enabled} of {total} enabled",
      reviewQueueSummary: "{enabled} enabled · {review} need review",
      installScope: "{n} blocks · {proposals} pages × {locales} locales",
      installScopeWithReview:
        "{n} blocks · {proposals} pages × {locales} locales · {review} need review",
      installScopeDisabled: "Enable at least one proposal to install.",
      proposalConfidence: "{n}% confidence",
      proposalLowConfidence: "Low confidence — please review.",
      proposalAiError:
        "AI couldn't analyze this page. Disabled by default — review or enable manually.",
      proposalAiProviderBilling:
        "AI provider blocked the scan. Add credits or switch providers, then re-scan.",
      proposalAiErrorNoResponse:
        "The model returned empty or invalid JSON. Re-scan, or check Managed AI status in Settings.",
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
      footerInstallSelected: "Install {n} selected",
      footerReinstallSelected: "Re-install {n} selected",
      footerUpdateSelected: "Update {n} selected",
      footerInstallTitle: "{n} blocks · {proposals} pages × {locales} locales",
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
      enableAll: "Enable ready",
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
      updateInstallButtonHint: "Re-install with changes: {summary}.",
      // Diff fragments — joined with " · " by the UI (e.g. "3 new · 2 changed").
      // Keep each fragment short (<=12 chars in English) so the joined
      // label still fits in narrow plugin panels.
      diffFragmentAdded: "{n} new",
      diffFragmentChanged: "{n} changed",
      diffFragmentRemoved: "{n} removed",
      installSuccess: "Installed {blocks} JSON-LD blocks across {pages} pages.",
      installSuccessWithPreserved:
        "Installed {blocks} JSON-LD blocks. {bytes} bytes of your existing Custom Code were preserved.",
      installFailed: "Install failed: {error}",
      installUndo: "Undo",
      installUndoDone: "Reverted to previous Custom Code state.",
      installUndoFailed: "Undo failed: {error}",
      editorOpen: "Edit fields",
      editorReview: "Review fields",
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
      ArticleHelper:
        "Blog posts, news, long-form content. Best for AI Overviews citations.",
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
    wizardTimeHint: "About 3–5 minutes for setup, sources, and generate.",
    setupHeroEyebrow: "Setup",
    setupHeroTitle: "Describe the site once. Generate every locale from it.",
    setupHeroBody:
      "This profile becomes the top of each llms.txt file, before CMS and page sections.",
    outputFilesLabel: "Files that will be generated",
    outputFilesMore: "+{n} more",
    setupFilesMetric: "{n} files",
    setupFilesMetricHelper: "one per locale",
    setupTimeMetric: "3–5 min",
    setupTimeMetricHelper: "setup to generate",
    siteProfileTitle: "Site profile",
    setupAutoSaveBadge: "Draft saved",
    setupEditHint: "Edit",
    aiRefine: "AI refine",
    outputPreviewTitle: "Output preview",
    outputPreviewHelper:
      "The file header is ready. Next, choose which CMS collections and static pages should appear as sections.",
    outputPreviewReady: "Ready",
    outputNextTitle: "Next: choose content sources",
    outputNextBody:
      "Add CMS collections and static pages as separate sections in the generated files.",
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
    aiPanelHeader: "AI refine · {field}",
    aiPanelKeywordsLabel: "What should the AI emphasize? (optional)",
    aiQuickLabel: "Quick AI directions",
    aiQuickTighter: "Make tighter",
    aiQuickTighterInstruction: "Make it shorter and tighter",
    aiQuickAeo: "More AEO-friendly",
    aiQuickAeoInstruction: "Make it clearer for answer engines and AI crawlers",
    aiQuickBrand: "More brand voice",
    aiQuickBrandInstruction: "Make the tone more distinctive and brand-specific",
    aiAdvancedSettings: "Advanced AI settings",
    aiResultCurrent: "Current",
    aiResultSuggested: "Suggested",
    aiKeepOriginal: "Keep original",
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
    deployFileReady: "1 file ready",
    deployFilesReady: "{n} files ready",
    deployFilesLabel: "Generated llms.txt files",
    deployStepDownload:
      "Download or copy each generated file from the Results step.",
    deployStepFramer:
      "In your Framer dashboard, open Domains → your domain → Files tab, then upload each file at the root path.",
    deployStepFramerLink: "See Framer's official guide →",
    deployStepPublish:
      "Publish your site. The files become available at /llms.txt and each generated locale path.",
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
      'Couldn\'t read the field "{field}" on these rows. Check the title field name matches a real CMS field.',
    aiTranslateTitle: "AI auto-translate (optional)",
    aiTranslateToggle: "Translate missing items with AI",
    aiTranslateHelper:
      "When a CMS item has no localized title for a locale, Polyglot AEO can ask your chosen AI model to translate it. The translation goes into the generated llms.txt file only — your CMS rows are not modified.",
    aiTranslateProTitle: "Native AI translation for every locale",
    aiTranslateProHelper:
      "Free keeps showing the gaps. Pro can fill missing llms.txt entries with AI before generation.",
    aiTranslateUnlock: "Upgrade",
    aiProviderKeyMissing:
      "Activate Pro in Settings to enable auto-translate with {provider}.",
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
    suggestUseAnyway: "Use anyway",
    suggestNotUsable: "Not useful",
    suggestNotUsableHint:
      "This suggestion is too close to the original or failed quality checks. Try again or switch models.",
    suggestBusy: "Asking the AI…",
    suggestApplied: "Site summary updated.",
    suggestResultTitle: "AI suggestion",
    suggestLowQualityPill: "Low confidence",
    suggestLowQualityHint:
      "The output didn't pass our quality checks. Try again with a stronger instruction, or switch to a stronger model.",
    suggestNoChangeHint:
      "The model returned almost the same wording, so this is not a useful optimization. Try again, add a stronger direction, or switch models.",
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
    stepNextSources: "Next: Content sources",
    stepBack: "Back",
    stepGenerate: "Generate {n} files",
    stepGenerateDefault: "Generate default llms.txt",
    goToDeploy: "Next: Deploy",
    backToReview: "Back to results",
    deployDone: "Done",
    reviewFileCountOne: "1 file",
    reviewFileCount: "{n} files",
    reviewLocaleNeedsAttention: "{locale} needs attention ({n} CMS items)",
    reviewLocaleNeedsAttentionNoCount: "{locale} needs attention",
    reviewLocaleTabs: "Generated file locales",
    reviewEmpty: "Generate files to see results here.",
    reviewNoIssues: "No issues for this locale.",
    issuesTitle: "Issues",
    previewTitle: "Preview",
    configChangedHint:
      "Settings changed since the last generation. Regenerate to refresh your files.",
    regenerateAll: "Regenerate all",
    regenerateDefault: "Regenerate default",
    setupOptionalTitle: "Optional",
    setupAiEnabled: "On",
    stepProgress: "{current}/{total} · {label}",
    sourcesTitle: "Content sources",
    sourcesSelectedPill: "{n} selected",
    sourcesHeroTitle: "Choose what each file includes",
    sourcesHeroBody:
      "Selected CMS collections and pages become sections in every generated locale file.",
    freePlanPill: "Free",
    freeDefaultGenerateHint:
      "Free generates llms.txt only. Pro unlocks all {n} locale files.",
    multiLocaleProTitle: "Free generates the default file first",
    multiLocaleProHelper:
      "This project has multiple locales. Generate llms.txt now; Pro unlocks llms-ja.txt, llms-ko.txt, and every other locale with native AI translation.",
    multiLocaleProAction: "Unlock locale files",
    collectionShortHelper:
      "Selected collections become ## sections, in this order.",
    pagesShortHelper:
      "Add static pages such as About, Services, Contact, and Support.",
    pagesLoadedHelper:
      "{n} static page(s) loaded. Re-scan only if your Framer page list changed.",
    pagesRememberedHelper:
      "{n} selected page(s) remembered. Re-scan to restore their current names and paths.",
    pagesRememberedNotLoaded:
      "Your previous page selection is saved, but this session has not loaded the page list yet. Re-scan before generating so the file uses current page titles and URLs.",
    cmsFoldSummary: "CMS · {n} selected",
    pagesFoldSummary: "Pages · {n} selected",
    showMoreCollections: "+ {n} more collections",
  },

  meta: {
    title: "Meta copy generator",
    sourceTitle: "Source page",
    setupHeroEyebrow: "Setup",
    setupHeroTitle: "Describe one page. Generate meta for every locale.",
    setupHeroBody:
      "This page profile becomes localized titles, descriptions, and social preview copy.",
    setupFiles: "Generated meta fields",
    setupFileDefault: "Title",
    setupFileSearch: "Description",
    setupFileSocial: "OG/Twitter",
    setupLocaleOne: "1 locale",
    setupLocaleMany: "{n} locales",
    setupLocalesStat: "locales",
    setupContextStat: "context words",
    sourceProject: "Project page",
    sourceManual: "Manual context",
    sourceProjectReady: "Project pages loaded",
    sourceProjectSelected: "Project page · {title}",
    sourceCurrent: "Source",
    contextThinTitle: "Context is very short",
    contextThinBody:
      "Add who this page is for, what it offers, and why it matters so generated meta is specific.",
    utilityPageTitle: "This looks like a utility page",
    utilityPageBody:
      "404, privacy, and legal pages usually do not need marketing meta. You can continue, but a service or landing page is better for testing quality.",
    aiModelTitle: "AI model",
    aiModelBody:
      "Used for ✨ Improve on this step and localized generation on the next step.",
    outputPreviewTitle: "Output preview",
    outputReady: "Ready",
    outputNeedsContext: "Needs context",
    outputPreviewBody:
      "Next, choose provider/model and generate localized search and social fields.",
    outputNextTitle: "Next: generate meta",
    outputNextBody: "Create copy for {n} locale(s) from this page profile.",
    outputNextBodyOne: "Create copy for 1 locale from this page profile.",
    pageFlowIntro:
      "Load a page from your project, pick one, then review the content before generating meta.",
    pageFlowTitle: "Page setup steps",
    pageFlowLoad: "Load pages from project",
    pageFlowLoadDone: "Pages loaded",
    pageFlowLoadShort: "Load",
    pageFlowLoadDoneShort: "Loaded",
    pageFlowLoadHint:
      "We read your Framer static pages so you can pick one — no need to paste URLs by hand.",
    pageFlowSelect: "Choose a page",
    pageFlowSelectDone: "Selected: {title}",
    pageFlowSelectShort: "Pick",
    pageFlowSelectDoneShort: "Selected",
    pageFlowSelectHint:
      "Pick the page you want meta copy for. We'll pull its text into context.",
    pageFlowSelectPlaceholder: "Select a page…",
    pageFlowManual: "Enter context manually instead",
    pageFlowManualDone: "Manual entry",
    pageFlowManualDoneShort: "Manual",
    pageFlowBackToPick: "Pick from project instead",
    pageFlowRescan: "Reload page list",
    pageFlowContent: "Review page info",
    pageFlowContentShort: "Review",
    pageFlowContentHint:
      "Edit the summary if needed. ✨ AI fill works after page context is ready.",
    pageFlowSelectedPage: "Working on {title} ({path})",
    pageContentLoading: "Reading page…",
    stepNextNeedLoad: "Load pages from the project first.",
    stepNextNeedSelect: "Choose a page, or switch to manual entry.",
    stepNextNeedContext: "Add page context before continuing.",
    stepNextLoadFirst: "Load pages first",
    stepNextSelectFirst: "Choose a page first",
    stepNextAddContext: "Add page context first",
    generateNeedKey:
      "Activate Pro in Settings to generate with {provider}.",
    stepNavLabel: "Meta workflow steps",
    step: {
      page: "Page",
      generate: "Generate",
      review: "Copy to Framer",
    },
    stepNext: "Next",
    stepNextGenerate: "Next: Generate meta",
    stepBack: "Back",
    stepProgress: "{current}/{total} · {label}",
    reviewHeroEyebrow: "Copy handoff",
    reviewHeroTitle: "Copy this locale into Framer",
    reviewHeroBody:
      "Copy the generated fields, show the canvas, then paste them into this page’s settings for the current locale.",
    reviewCurrentPage: "Page",
    reviewCurrentLocale: "Locale",
    reviewCopiedProgressLabel: "Copied",
    reviewCopiedProgress: "{done} of {total} locales",
    copyAllFields: "Copy all for this locale",
    copyAllFieldsDone: "Copied",
    copyAllFieldsAgain: "Copy again",
    openFramerSettings: "Show Framer canvas",
    applyFoldTitle: "Need help pasting into Framer?",
    reviewMoreActions: "Downloads and regenerate",
    copyFieldsTitle: "Fields to copy",
    localeCopied: "Locale copied",
    finishHandoff: "Finish handoff",
    finishUncopiedConfirm:
      "Only {done} of {total} locale(s) are marked copied. Finish anyway?",
    regenerateAllConfirm:
      "Regenerate all locales? This replaces the current generated copy.",
    reviewIntro:
      "Framer does not let plugins write page SEO yet. Paste these values into Page settings for each locale.",
    reviewDone: "Done",
    sessionRestored:
      "Restored your last generated meta — continue copying into Framer.",
    sessionRestoredStale:
      "Restored your last results. Step 1 inputs changed — double-check before pasting into Framer.",
    applyNotSeoTab: "There is no SEO menu in the F menu",
    applySiteVsPage:
      "F → Site settings is site-wide. Per-page meta opens from the canvas Pages list, and must be pasted once per locale.",
    applyPageFallback: "your page",
    applyStepOpenPagePanel:
      "Open settings for “{page}” — fields at the top: Title and Page Description.",
    applyStepOpenPagePanelHow:
      "Minimize this plugin. In the left Pages list, hover the page → ⋯ → Settings.",
    applyStepFieldMapping:
      "Paste plugin Title → Framer Title; Meta description → Page Description. OG/Twitter fields go in the social section on the same panel.",
    applyStepFramerMetaDocs: "Framer: page titles & descriptions →",
    setupOptionalTitle: "Optional",
    pickPage: "Page",
    pickPageManual: "Manual context only",
    scanPages: "Load pages from project",
    scanningPages: "Scanning pages…",
    pagesScanPartial:
      "Some pages could not be read — the list may be incomplete.",
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
      "AI agrees with what you already have ({value}). No need to replace — use Next when you're ready.",
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
    providerKeyMissing: "Activate Pro in Settings to use {provider}.",
    estimatedCost: "Est. cost",
    estimatedCostListedOne:
      "Estimate (listed rates): ~${total} (1 locale × ~{tokensIn}+{tokensOut} tokens)",
    estimatedCostListed:
      "Estimate (listed rates): ~${total} ({n} locales × ~{tokensIn}+{tokensOut} tokens each)",
    estimatedCostConsoleUpper:
      "DeepSeek console upper ref.: ~${total} (cache-miss rates; actual may be lower)",
    estimatedCostDisclaimer:
      "Reference only. Step 1 infer/improve, regenerations, and other tools are extra. Billed amount is on your provider dashboard.",
    reviewCostDisclaimer:
      "Sum of this run’s API tokens × listed model rates — may differ from your invoice.",
    reviewCostDisclaimerDeepSeek:
      "Sum of API tokens × listed rates. DeepSeek CNY bills are often higher (cache miss, infer calls, other features).",
    generateReadyOne: "Ready to generate meta for 1 locale.",
    generateReady: "Ready to generate meta for {n} locales.",
    generateHeroEyebrow: "Generate",
    generateHeroTitle: "Generate localized meta copy.",
    generateHeroHelper:
      "Review the source context, provider, and estimated cost before asking AI to write search and social fields.",
    generateMetricLocales: "locales",
    generateMetricContext: "context chars",
    generateMetricProvider: "provider",
    generateMetricCost: "est. cost",
    generateContextPreviewTitle: "Source context",
    generateContextReady: "Ready",
    generateContextDraft: "Needs context",
    generateContextPreviewEmpty:
      "Add page context first so generated meta can be specific.",
    generateReviewHelper:
      "Next, create copy for {locales} locale(s) using {provider}.",
    generateAiSettingsTitle: "AI settings",
    resultsTitle: "Results",
    reviewLocaleCountOne: "1 locale",
    reviewLocaleCount: "{n} locales",
    reviewLocalesNeedAttention: "{locales} need attention",
    reviewLocaleTabs: "Generated meta locales",
    reviewEmpty: "Generate meta to see results here.",
    fieldGroupSearch: "Search",
    fieldGroupSocial: "Open Graph & Twitter",
    downloadLocale: "Download this locale (.txt)",
    downloadAll: "Download all ({n})",
    downloadAllHint: "ZIP with one .txt per locale — easy to paste into Framer",
    downloadSuccess: "Downloaded Meta text for this locale.",
    downloadAllSuccess: "Downloaded ZIP with {n} locale file(s).",
    lengthSoftPill: "Long ({max})",
    lengthSoftHint:
      "Google often truncates around {max} characters — consider shortening.",
    addContextWarning: "Add some page context first.",
    setKeyWarning: "Activate Pro in Settings first.",
    generateButton: "Generate for {n} locale",
    generateButtonPlural: "Generate for {n} locales",
    generatingProgress: "Generating… {current}/{total}",
    generateProgressTitle: "Calling AI for meta copy",
    generateProgressHelper:
      "The model is writing localized titles, descriptions, and social fields. Provider plans may pause under load.",
    generateProgressCurrentLocale: "Current locale",
    generateProgressProvider: "Provider",
    generateProgressModel: "Model",
    generateProgressCount: "Progress",
    generateProgressPreparing: "Preparing…",
    generateProgressSlowTitle: "Taking longer than usual",
    generateProgressSlowHelper:
      "This usually means provider rate limits, low balance, a slow model, or a large page. To debug, open Settings → Test key, switch to a faster model, shorten page context, or retry.",
    generateCancelled: "Generation cancelled.",
    generatedSuccessOne: "Generated meta for 1 locale.",
    generatedSuccess: "Generated meta for {n} locales.",
    generatedSuccessWithIssuesOne:
      "Generated meta for 1 locale. It may need a retry.",
    generatedSuccessWithIssues:
      "Generated meta for {n} locales. {issues} locale(s) may need a retry.",
    regenerate: "Regenerate",
    regenerateAll: "Regenerate all",
    regenerateOne: "Regenerate this locale only",
    regenerating: "Regenerating…",
    configChangedHint:
      "Page context changed since the last generation. Regenerate to refresh results.",
    applyTitle: "Apply in Framer",
    applyStepLocale:
      "In Framer, switch to the target language in the top bar (globe / locale picker).",
    applyStepLocaleLink: "Framer localization guide",
    applyStepPage: "Open this page’s settings (Title + Page Description).",
    applyStepPageWithPath:
      "Open settings for {path} (Title + Page Description).",
    applyStepCopyBelow:
      "Use Copy all above, or copy individual fields below.",
    applyStepRepeatLocales:
      "Do the same for every language, then publish the site.",
    applyStepPublish: "Publish the site when every locale looks good.",
    applyStepOpenProject: "Show canvas (minimize plugin)",
    openProjectEditorHint:
      "You're already in this Framer project. Use Pages on the left → ⋯ → Settings for page meta, then paste the fields below.",
    applyHelper:
      "Framer does not let plugins write page SEO yet — paste these values into Page settings per locale.",
    applyFriction:
      "Expect manual steps: switch locale in the canvas bar → open each page’s Title / Page Description → paste → publish. Polyglot saves your generated copy between sessions.",
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
    apiKeysTitle: "Managed AI",
    apiKeysHelper:
      "AI generation runs through Polyglot AEO's backend with license checks, short-lived session tokens, and quota limits.",
    managedAiTitle: "Managed AI",
    managedAiHelper:
      "AI generation runs through Polyglot AEO's backend with your active Pro license, short-lived session tokens, and usage quotas.",
    managedAiProvider: "Polyglot Managed AI · MiniMax M3",
    providerKeyPlaceholder: "Managed credential for {provider}",
    providerGetKey: "Provider details",
    providersShowMore: "Show {n} more providers",
    providersHide: "Hide additional providers",
    testKey: "Test",
    testing: "Testing…",
    testKeyOk: "Connected",
    testKeyFail: "Failed",
    testKeyEmpty: "Managed AI is not available",
    addCustomProvider: "+ Add managed provider",
    customProviderTitle: "Managed provider",
    customProviderHelper:
      "Marketplace builds use Polyglot Managed AI so generation stays server-side and quota controlled.",
    customProviderName: "Display name",
    customProviderNamePlaceholder: "Managed provider",
    customProviderBaseUrl: "Base URL",
    customProviderBaseUrlPlaceholder:
      "Managed server endpoint",
    customProviderModelIds: "Model ids (comma-separated)",
    customProviderModelIdsPlaceholder: "llama-3.3-70b, mixtral-8x22b",
    customProviderSave: "Save provider",
    customProviderRemove: "Remove",
    customProviderSaved: "Custom provider saved.",
    customProviderRemoved: "Custom provider removed.",
    customProviderInvalid:
      "Please fill in display name, base URL, and at least one model id.",
    customProviderRemoveConfirm:
      "Remove this managed provider record? This cannot be undone.",
    customProviderDiscardConfirm:
      "Discard this managed provider draft? Brand voice changes have been autosaved.",
    customProviderDiscard: "Discard draft",
    anthropicKey: "Legacy Anthropic credential",
    openaiKey: "Legacy OpenAI credential",
    brandVoiceTitle: "Brand voice",
    brandVoiceHelper: "Applied to every locale. Optional but recommended.",
    brandVoicePlaceholder:
      "Confident, technical, concise. We use 'you', not 'your business'. We avoid buzzwords.",
    languageTitle: "Plugin language",
    languageHelper:
      "The language of the Polyglot AEO interface itself. Independent of your project's content locales.",
    languageAuto: "Auto ({detected})",
    quickStartResetTitle: "Quick start",
    quickStartResetHelper: "Re-show the onboarding checklist on the dashboard.",
    quickStartResetButton: "Show quick start",
    quickStartResetDone: "Quick start re-enabled.",
    restartWizardTitle: "Setup guide",
    restartWizardHelper:
      "Open the step-by-step wizard again from the dashboard (clipboard icon next to Settings).",
    restartWizardButton: "Reset setup guide",
    restartWizardDone:
      "Setup guide will open automatically next time you open the plugin (until you finish or skip it).",
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
    activeKey: "Pro active · license ending {hint}",
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
      schema_translate: "Translating schema content per locale requires Pro.",
      llms_generate:
        "AI llms.txt generation requires Pro. You can still edit and copy a default-locale draft on Free.",
      llms_multi_locale:
        "Free generates the default llms.txt. Pro unlocks one llms file per locale with native AI translation.",
      llms_ai_translate: "AI translation for llms.txt requires Pro.",
      meta_generate:
        "Free includes 3 default-locale Meta AI samples. Pro unlocks bulk generation across every locale.",
      schema_audit_persist:
        "Pro keeps install history and diff context across sessions.",
      remote_schema_rules:
        "Pro includes shipped quality updates as the plugin evolves.",
      generic_pro: "Unlock the full multilingual AEO workflow with Pro.",
      bulletLocales:
        "Native schema + meta + llms per locale — not just inLanguage tags",
      bulletQuality: "AI quality checks before you ship translations",
      bulletAgency: "One client site pays for itself at $19/mo",
      ctaLabel: "Upgrade to Pro",
      ctaPrice: "$19 per month",
      monthlyPlanLabel: "Monthly",
      monthlyPlanPrice: "$19 / month",
      monthlyPlanHelper: "Flexible billing for one project.",
      monthlyPlanCta: "Start monthly checkout →",
      yearlyPlanLabel: "Yearly",
      yearlyPlanPrice: "$190 / year",
      yearlyPlanHelper: "Two months free. Best for launch retainers.",
      yearlyPlanCta: "Start yearly checkout →",
      yearlyBadge: "Save 17%",
      pricingHint:
        "14-day refund per polyglotaeo.com. License key arrives by email.",
    },
    dashboardLocaleBanner:
      "This project has {count} locales. Pro unlocks per-locale schema, Meta, and llms.",
    dashboardLocaleFree: "Using default locale only on Free ({code}).",
    freeInstallQuota: "{used}/{max} AI schema pages on Free",
  },

  wizard: {
    reopen: "Setup guide",
    stepOf: "Step {current} of {total}",
    exit: "Exit",
    skipAll: "Maybe later",
    skipManualOnly: "Manual schema only",
    completeNotify: "Setup complete",
    cta: {
      getStarted: "Get started",
      continue: "Continue",
      saveAndContinue: "Save & continue",
      continueWithoutAi: "Continue without AI",
      openDashboard: "Open launch checklist",
    },
    screens: {
      welcome: {
        title: "Welcome to Polyglot AEO",
        body: "Turn your multilingual Framer launch into an AEO control center: per-locale schema, llms.txt, meta, CMS gaps, and published-site checks. One minute of setup, then follow the launch checklist.",
      },
      aiSetup: {
        title: "Start with a free project check",
        body: "Open the Control Center first. It can surface locale, CMS, schema, and published-site gaps before you use any AI generation.",
      },
      done: {
        title: "You're set up",
        body: "Open the launch checklist and review the first visible project gap. Add managed generation only when the free checks show work worth automating.",
      },
    },
    snapshot: {
      projectLabel: "This project",
      locales: "{count} locales",
      schemaInstalled: "Schema installed",
      schemaNotInstalled: "Schema not installed",
      aiConnected: "AI connected",
      aiNotConnected: "Managed AI optional",
      addLocales: "Add locales in Framer",
    },
    firstRun: {
      freeLabel: "Free",
      freeTitle: "Review project readiness",
      freeBody: "Inspect locale coverage, CMS gaps, existing schema, and published-site checks without activating Pro.",
      proLabel: "Optional Pro",
      readyLabel: "Pro ready",
      proTitle: "Generate with managed AI",
      proBody: "Pro adds server-side schema, metadata, and localized generation with license checks and usage quotas.",
      noKey:
        "Model credentials stay on Polyglot AEO's backend and are never received or stored by the plugin.",
    },
    aiProviderLabel: "Provider",
    aiKeyLabel: "Managed AI",
    aiKeyPlaceholder: "Handled by Polyglot AEO",
    aiTest: "Test",
    aiTesting: "Testing…",
    aiSave: "Save & test",
    aiConnected: "Managed AI ready",
    aiMoreProviders: "Managed AI settings",
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
