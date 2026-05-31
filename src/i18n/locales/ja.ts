import type { Translations } from "./en"

/**
 * 日本語 (Japanese).
 *
 * 翻訳原則（重要度順）：
 *
 *   1. **「あなた」を使わない**。UI における第二人称代名詞は英語圏特有の
 *      文化です。日本語 UI では主語省略、または「ご〜」「ユーザー」で代替。
 *      "your site" → 「サイト」（"あなたのサイト"とは書かない）。
 *
 *   2. **「〜することができます」→「〜できます」**。
 *      「〜という〜」「〜のような〜」も極力削る。冗長表現を排除。
 *
 *   3. **30 字を超えたら 2 文に分ける**。日本語の伝統は長文だが、
 *      UI 文案は短文の連続が読みやすい。
 *
 *   4. **テクニカル用語は英語のまま**。schema、locale、JSON-LD、
 *      inLanguage、canonical、BCP-47、llms.txt、OG など。日本の Web
 *      業界はカタカナ + 英語混在が標準。「ロケール」より「locale」。
 *
 *   5. **ブランド名は変更しない**。Polyglot AEO、Framer、ChatGPT、
 *      Perplexity、Claude、Anthropic、OpenAI など。
 *
 *   6. **「です・ます」体で統一**。プロフェッショナル・ツールの慣例。
 *      ただし「〜してください」を多用すると命令口調になるので、UI
 *      指示は「〜できます」「〜します」で淡々と書く。
 *
 *   7. **直訳しない営業フレーズ**。"multiplies your work" を「価値は
 *      locale 数に比例します」と直訳すると堅い。「locale が多いほど
 *      真価を発揮します」のように、日本語として自然な表現を選ぶ。
 */
export const ja: Translations = {
  common: {
    back: "戻る",
    save: "保存",
    saving: "保存中…",
    cancel: "キャンセル",
    close: "閉じる",
    generate: "生成",
    generating: "生成中…",
    install: "インストール",
    installing: "インストール中…",
    copy: "コピー",
    download: "ダウンロード",
    remove: "削除",
    show: "表示",
    hide: "非表示",
    none: "なし",
    chars: "{n} 文字",
    apiKeyMissing: "API キー未設定",
    apiKeyMissingHelper: "設定で API キーを追加すると使えます。",
    default: "デフォルト",
    confirmDiscardChanges:
      "未保存の編集があります。Schema タイプを切り替えると破棄されます。続けますか？",
    confirmRemoveAll:
      "Polyglot AEO が Custom Code に注入した schema をすべて削除しますか？手動で追加したコードはそのまま残ります。",
    helpClose: "説明を閉じる",
    helpOpen: "説明を表示",
    aiSettingsTitle: "AI 設定",
    openSettings: "設定を開く",
    copied: "コピーしました",
  },

  help: {
    aeo: "Answer Engine Optimization。AI 検索エンジン（ChatGPT、Perplexity、Claude、Google AI Overviews）向けの SEO で、従来の Google SEO とは別物です。AI の回答に引用される回数が指標になります。",
    inLanguage:
      "schema.org のプロパティで、ページの言語を AI クローラーに伝えます。これがないと、日本語の質問に対して英語ページが引用されたり、検索結果から完全に外れたりします。",
    bcp47:
      "BCP-47 は IETF の言語コード標準です（en-US、zh-CN、ja-JP など）。Schema.org と llms.txt はこの形式が必須。Polyglot AEO が Framer の locale コードを自動変換するので、手動対応は不要です。",
    byok:
      "Bring Your Own Key（自分のキーを使う方式）。Anthropic、OpenAI などの API キーをご自身で用意します。Polyglot AEO はリクエストを中継しません —— キーは端末内のみに保存され、呼び出しは AI プロバイダーへ直送、料金もプロバイダーに直接支払います（通常 1 ページあたり数円）。",
    canonicalUrl:
      "ページの正式な URL を 1 つに定めるためのもの。検索エンジンと AI クローラーは重複排除と引用先決定にこれを使います。多言語サイトでは言語ごとに canonical を分けるのが一般的です（例：/about と /ja/about）。",
    llmsTxt:
      "LLM 向けの robots.txt のような存在 —— サイト構造を AI クローラーに伝えるテキストファイルです。Polyglot AEO は言語ごとに 1 ファイルずつ出力し、各言語が独立にインデックスされるようにします。",
    fenced:
      "Polyglot AEO が Framer の Custom Code に注入する内容は、すべて HTML コメント（polyglot-aeo:start / :end）で囲まれます。アンインストール時は囲み内のみ削除 —— 手動で追加したスクリプト（GA、Hotjar、Stripe）はそのまま保持されます。",
    brandVoice:
      "AI にローカライズ meta を生成させるときに渡す短いスタイル指示。具体的なほど効きます。「自信、技術的、簡潔。'you' を使い 'your business' は使わない」のほうが「プロフェッショナルでフレンドリー」より 10 倍効果的です。",
  },

  dashboard: {
    subtitle:
      "ChatGPT、Perplexity、Claude、Google AI Overviews にすべての言語で引用されるサイトへ。",
    subtitleSecondary:
      "Framer に最適化 —— Schema は Custom Code に自動注入、Meta は各ページの Title / Page Description に貼り付け、llms.txt は Framer Static Files で配信。",
    statusInstalled: "Schema インストール済み",
    statusDisabled: "Schema 無効化中",
    statusNotInstalled: "未インストール",
    localesTitle: "プロジェクトの言語",
    localesActive: "{n} 件有効",
    localesNone: "なし",
    localesEmpty:
      "追加の言語がまだありません。単一言語でも使えますが、このプラグインは多言語サイト向けです。Framer の Localization パネルで言語を追加してください。",
    localesAddCta: "Framer の多言語ドキュメントを開く",
    healthTitle: "AEO 準備状況",
    healthScore: "{score}%",
    healthSchemaDone: "Schema はインストール済み",
    healthSchemaTodo: "言語別 Schema をインストール",
    healthLlmsDone: "llms.txt は生成済み",
    healthLlmsTodo: "llms.txt を生成",
    healthMetaDone: "Meta 文案を生成済み",
    healthMetaTodoFree: "Meta を試し生成（デフォルト言語）",
    healthMetaTodoPro: "Meta 文案を生成",
    healthMetaHint:
      "API キーを入れただけでは完了しません。Meta AI で一度生成するとチェックされます。",
    healthKeyDone: "API キー設定済み",
    healthKeyTodo: "API キーを設定",
    healthLocalesDone: "すべての言語が利用可能",
    healthLocalesTodo: "Pro で全言語を解放",
    openControl: "コントロールセンターを開く",
    reportDownload: "クライアントレポートをダウンロード",
    toolsTitle: "ツール",
    controlTool: "AEO コントロールセンター",
    controlToolDesc:
      "公開前の問題、CMS の多言語ギャップ、公開後の検証を一か所で確認。",
    schemaTool: "言語別 Schema",
    schemaToolDesc:
      "Article、Product、LocalBusiness、FAQ などの JSON-LD を言語ごとに生成。inLanguage も自動で正しく設定されます。",
    llmsTool: "多言語 llms.txt",
    llmsToolDesc:
      "CMS をスキャンし、言語ごとに llms.txt を出力。AI クローラーが各言語を理解しやすくなります。",
    cmsGapsTool: "CMS 多言語ギャップ",
    cmsGapsToolDesc:
      "ローカライズ済みタイトル、概要、slug、重複 CMS タイトルを検出します。",
    metaTool: "Meta 文案生成",
    metaToolDesc:
      "各言語向けに title・description・OG・Twitter をネイティブ表現で生成。直訳ではなく書き直します。",
    verifyTool: "公開サイト検証",
    verifyToolDesc:
      "公開後にホームページ、JSON-LD、meta description、llms.txt を確認します。",
    settingsTool: "設定",
    settingsToolDesc: "API キー、ブランドボイス、インストール状態。",
    whyTitle: "なぜ言語別の Schema が必要？",
    whyBody:
      "Google の指針では、各言語版のページに対応する {code} 付きの JSON-LD を置くべきとされています。AI 検索はこの情報で、ユーザーがその言語で質問したときにどの版を引用するか決めます。一般的な AEO プラグインはデフォルト言語用の schema しか出しませんが、Polyglot AEO はすべての言語に正しいバリアントを生成します。",
    quickStartTitle: "クイックスタート",
    quickStartProgress: "{done} / {total}",
    quickStartAllDone: "すべて準備完了",
    quickStartDismiss: "閉じる",
    quickStartCollapse: "折りたたむ",
    quickStartExpand: "展開",
    quickStartSteps: {
      addLocalesTitle: "Framer に言語を追加",
      addLocalesDesc:
        "言語が多いほどこのプラグインの価値が上がります。Framer の Localization パネルで、デフォルト以外の言語を 1 つ追加してください。",
      addLocalesAction: "ドキュメントを開く",
      installSchemaTitle: "言語別 Schema をインストール",
      installSchemaDesc:
        "Schema タイプを選び、内容を入力するだけ。各言語用の JSON-LD が site head に自動注入されます。",
      installSchemaAction: "Schema を開く",
      generateLlmsTitle: "llms.txt ファイルを生成",
      generateLlmsDesc:
        "ChatGPT、Perplexity、Claude にサイトの「言語マップ」を渡し、各言語をどう辿ればよいかを伝えます。",
      generateLlmsAction: "llms.txt を開く",
      addApiKeyTitle: "AI API キーを追加（任意）",
      addApiKeyDesc:
        "AI Schema 監査と Meta 文案生成が使えるようになります。右上の歯車からキーを管理できます。Claude または GPT-4o-mini がおすすめです。",
      addApiKeyAction: "設定を開く",
      verifyTitle: "Google Rich Results Test で検証",
      verifyDesc:
        "サイト URL を Google 公式バリデーターに貼り付けて、AI 検索エンジンから schema が正しく見えているか確認します。",
      verifyAction: "バリデーターを開く",
    },
  },

  control: {
    title: "AEO コントロールセンター",
    readiness: "公開準備度",
    scanning: "スキャン中…",
    rescan: "再スキャン",
    downloadReport: "レポートをダウンロード",
    summary: "重大 {critical} · 警告 {warning} · メモ {info}",
    issuesTitle: "公開ブロッカー",
    noIssues: "公開ブロッカーは見つかりません。次回公開後に公開サイト検証を実行してください。",
    severity: {
      critical: "重大",
      warning: "警告",
      info: "メモ",
    },
    issue: {
      schema_missing: {
        title: "言語別 schema が未インストール",
        body: "公開前に JSON-LD をインストールし、AI が各ページを理解できるようにしてください。",
      },
      schema_disabled: {
        title: "インストール済み schema が無効",
        body: "Framer Custom Code が無効なため、クローラーは Polyglot AEO ブロックを見られません。",
      },
      llms_missing: {
        title: "llms.txt が未生成",
        body: "まずデフォルト言語のファイルを生成し、Pro で各言語版を生成できます。",
      },
      meta_missing: {
        title: "Meta 文案が未生成",
        body: "公開前に、各言語向けの title / description を少なくとも 1 セット生成してください。",
      },
      api_key_missing: {
        title: "API キーが未設定",
        body: "API キーを設定すると、AI 監査・ローカライズ・再試行が使えます。",
      },
      multi_locale_locked: {
        title: "プロジェクトに {count} 言語あるが Pro 未有効",
        body: "無料版はギャップを表示します。Pro では各言語の AEO アセットを生成・インストールできます。",
      },
      cms_locale_gaps: {
        title: "{count} 件の CMS ローカライズギャップ",
        body: "ローカライズ済みタイトルや概要がないと、llms.txt の項目がスキップされ schema も弱くなります。",
      },
      cms_duplicate_titles: {
        title: "{count} 行の CMS タイトル重複",
        body: "重複タイトルは、AI クローラーが別レコードを曖昧な 1 件として扱う原因になります。",
      },
      published_failures: {
        title: "{count} 件の公開サイト検証が失敗",
        body: "納品前に検証を実行し、live URL を修正してください。",
      },
    },
    cmsTitle: "CMS 多言語ギャップ",
    cmsCollections: "{n} collections",
    cmsSummary:
      "タイトル欠落 {titles} · 概要欠落 {summaries} · slug 欠落 {slugs} · 重複タイトル行 {duplicates}",
    cmsLocaleLine:
      "{locale}: タイトル {titles}, 概要 {summaries}, slug {slugs}",
    cmsDuplicates: "{n} 重複グループ",
    cmsNoGaps: "CMS 多言語ギャップは見つかりません。",
    openCmsGaps: "CMS ギャップ",
    openVerifier: "公開サイトを検証",
    fixPrimary: "schema を修正",
  },

  cmsGaps: {
    title: "CMS 多言語ギャップ",
    summaryTitle: "ギャップ概要",
    detailsTitle: "Collection 詳細",
    rows: "{n} 行",
    fields: "フィールド: title = {title}, summary = {summary}",
    downloadCsv: "CSV をダウンロード",
    empty: "CMS Collection が見つかりません。",
  },

  verify: {
    title: "公開サイト検証",
    siteUrl: "公開サイト URL",
    helper:
      "公開後に実行します。一部のサイトはプラグイン内ブラウザからの取得をブロックするため、その場合は手動チェックリストとして使ってください。",
    run: "公開サイトを検証",
    running: "検証中…",
    results: "結果",
    homepage: "ホームページ到達",
    homepageOk: "ホームページ HTML を HTTP {status} で取得しました。",
    homepageBlocked:
      "プラグイン内ブラウザからホームページを読み取れませんでした。URL を手動で開き、ソースを確認してください。",
    schema: "JSON-LD あり",
    schemaOk: "ホームページに有効な JSON-LD script が {n} 件見つかりました。",
    schemaParseWarning: "{n} 件の JSON-LD script を解析できませんでした。",
    schemaMissing: "ホームページ HTML に JSON-LD script が見つかりません。",
    schemaUnknown: "ホームページ HTML を読めないためスキップしました。",
    inLanguage: "inLanguage あり",
    inLanguageOk: "言語マーカー: {languages}",
    inLanguageMissing: "解析した JSON-LD に inLanguage が見つかりません。",
    meta: "Meta description あり",
    metaOk: "meta description タグが見つかりました。",
    metaMissing: "ホームページ HTML に meta description タグが見つかりません。",
    metaUnknown: "ホームページ HTML を読めないためスキップしました。",
    llms: "llms.txt 到達",
    llmsLocale: "{locale} llms ファイル",
    llmsOk: "/llms.txt が HTTP {status} を返しました。",
    llmsLocaleOk: "/{filename} が HTTP {status} を返しました。",
    llmsLocaleMissing: "/{filename} に到達できません。",
    llmsMissing: "/llms.txt に到達できません。Framer Static Files にアップロードして再公開してください。",
  },

  schema: {
    title: "Locale 別 Schema",
    audit: {
      title: "Schema · AI 監査",
      heroTitle: "AI が全ページの Schema を提案",
      heroBody:
        "Polyglot AEO が Framer プロジェクトをスキャンし、各ページに最適な Schema タイプを判定。フィールドを抽出し、有効な各言語向けに本格的に翻訳します（inLanguage の書き換えだけではありません）。",
      providerLabel: "AI プロバイダー",
      modelLabel: "モデル",
      translateContentLabel: "全言語にコンテンツを翻訳",
      translateContentHelper:
        "デフォルト以外の言語でも headline・description・本文をネイティブに生成します。inLanguage だけでは足りない、本物のローカライズ JSON-LD を出力します（少額の AI 費用が発生）。",
      aiNeeded: "AI スキャンを使うには「設定」で API キーを登録してください。",
      scanButton: "サイトをスキャン",
      rescan: "再スキャン",
      scanning: "サイトをスキャン中…",
      scanProgress: "{current} / {total}",
      translateProgress: "翻訳中 {current} / {total}",
      scanCalls: "スキャン呼び出し",
      translateCalls: "翻訳呼び出し",
      scanFailed: "スキャン失敗：{error}",
      scanEmpty: "この Framer プロジェクトに公開対象のページがありません。",
      partial: "一部のページを読み取れませんでした。再スキャンしてください。",
      scanSummary: "{n} ページをスキャンしました。",
      snapshotTitle: "前回のインストール",
      snapshotInstalledAt:
        "{time} · {locales} 言語 · 計 {n} ブロック",
      snapshotChanges: "{n} 件 変更あり",
      snapshotAdded: "{n} 件 新規",
      snapshotRemoved: "{n} 件 削除",
      snapshotUpToDate: "最新の状態",
      snapshotRescanHint:
        "前回インストールしてからの変更を検出するには再スキャンしてください。",
      snapshotSessionListHint:
        "提案リストはこのパネルを開いている間だけ保持されます。戻ったあとは下の「サイトをスキャン」で復元してください。インストール済みの JSON-LD は変わりません。",
      snapshotResetByDrift:
        "Custom Code から polyglot-aeo ブロックが消えています — インストール記録をリセットしました。",
      identityCardTitle: "ブランド情報",
      identityCardSubtitle:
        "すべてのスキーマの発行者と著者表示に使用されます。",
      identityCardDeriving: "ブランド情報を検出中…",
      identityCardLowConfidence:
        "AI の確信度が低めです — インストール前にブランド名を確認してください。",
      identityCardSourceAi: "AI 自動検出",
      identityCardSourceFallback: "ホスト名フォールバック",
      identityCardSourceUserEdit: "手動設定",
      identityCardEdit: "編集",
      identityCardSave: "保存",
      identityCardCancel: "キャンセル",
      identityCardBrandLabel: "ブランド名",
      identityCardAuthorLabel: "既定の著者表示",
      identityCardLogoLabel: "ロゴ URL",
      identityCardUrlLabel: "サイト URL",
      identityCardTranslationsCount: "{n} 言語に翻訳済み",
      identityCardNoTranslations:
        "次回のスキャン時に他の言語へ翻訳します。",
      identityPartialTranslate:
        "{n} 言語のブランド情報を翻訳できませんでした。インストール時はソース言語のブランド名が使用されます。",
      proposalsTitle: "提案された Schema",
      proposalsCount: "有効 {enabled} / {total}",
      proposalConfidence: "信頼度 {n}%",
      proposalLowConfidence: "信頼度が低いです。内容をご確認ください。",
      proposalAiError:
        "AI がこのページを解析できませんでした。デフォルトで無効化しています。",
      proposalReviewBadge: "要確認",
      translationWarning: "{n} 件のセルを再翻訳してください。",
      translationHealthTitle: "翻訳の品質",
      translationHealthBody:
        "{n} 件の（ページ × 言語）がインストール後も未翻訳のままです。下のフッターから同じ／より強いモデルで再試行してください。",
      translationHealthAutoRetryNote:
        "各セルは翻訳中にすでに 1 回自動再試行済み（強化プロンプト）です。ここに表示されているのは 2 回とも失敗したセルです。",
      translationHealthFooterHint:
        "下の項目をタップすると該当ページのプレビューへ移動します。「次の問題」で順に確認できます。内容を確認したらフッターまたはカードから再翻訳してください。",
      translationHealthIssueListTitle: "問題一覧",
      translationHealthLocaleSummary: "言語別",
      nextIssue: "次の問題 ({current}/{total})",
      footerRetryHint:
        "すべてのブロックをフル再インストールします。失敗セルだけ直す場合は先に「再翻訳」をお試しください。",
      footerRetryLabel: "{n} 件を再翻訳",
      footerReinstallShort: "再インストール",
      footerInstallShort: "インストール",
      footerUpdateInstallShort: "更新インストール",
      footerInstallTitle:
        "{n} ブロック · {proposals} ページ × {locales} 言語",
      footerReinstallTitle:
        "{n} ブロック · {proposals} ページ × {locales} 言語。{hint}",
      installSuccessWithUntranslated:
        "未翻訳のセルが {n} 件残っています。下または通知から「再翻訳」を実行してください。",
      installToastRetry: "{n} 件を再翻訳",
      installUndoInPanel: "インストールを元に戻す",
      cardUntranslated: "再翻訳が必要：{locales}",
      cardRetry: "再翻訳 ({n})",
      cardRetrying: "翻訳中…",
      cardRetryHint: "このページで失敗した言語だけを再翻訳して再インストールします。",
      retryFailed: "{n} 件のセルを再翻訳",
      retryFailedBusy: "再翻訳中…",
      retryAllOk: "{n} 件すべて翻訳成功。再インストールしました。",
      retryPartial: "{recovered} 件回復、残り {remaining} 件は未翻訳。",
      previewToggle: "JSON-LD をプレビュー",
      previewToggleTranslated: "ロケール別にプレビュー",
      previewLocaleTabs: "ロケールプレビュー",
      untranslatedReasonPillMixedScript: "文字種が不一致",
      untranslatedReasonPillNoContentChange: "未翻訳の可能性",
      untranslatedReasonPillAiError: "AI エラー",
      untranslatedReasonHintMixedScript:
        "見出しまたは説明に、このロケールに合わない文字が残っています。説明が英語のまま、簡体字が混ざる、小文字の英単語（design、launch など）が残るケースが多いです。再翻訳するか、下のフィールドを手動で修正してください。",
      untranslatedReasonHintNoContentChange:
        "見出しと説明がデフォルト言語と完全に同じです。AI が英語をそのまま返したのに inLanguage だけこのロケールになっています。より強いモデルで再翻訳するか、Framer で手動翻訳してください。",
      untranslatedReasonHintAiError:
        "AI の応答が欠落しているか JSON として無効でした。再翻訳するか、フィールドを手動で入力してください。",
      enableAll: "すべて有効",
      disableAll: "すべて無効",
      filterSearchPlaceholder: "URL またはページ名で検索…",
      filterNoMatch: "条件に一致する提案がありません。",
      filter: {
        all: "すべて",
        new: "新規",
        changed: "変更",
        disabled: "無効",
        needsRetranslate: "要再翻訳",
      },
      badgeNew: "New",
      badgeChanged: "変更",
      badgeInstalled: "インストール済み",
      installAllButton:
        "{n} ブロックをインストール（{proposals} ページ × {locales} 言語）",
      reinstallButton:
        "{n} ブロックを再インストール（{proposals} ページ × {locales} 言語）",
      reinstallButtonHint:
        "前回のインストールから内容に変更はありません。クリックすると Custom Code 上の schema を強制的に書き直します。",
      updateInstallButton: "更新インストール（{summary}）",
      updateInstallButtonHint: "差分に従って再インストールします：{summary}。",
      diffFragmentAdded: "{n} 件 新規",
      diffFragmentChanged: "{n} 件 変更",
      diffFragmentRemoved: "{n} 件 削除",
      installSuccess:
        "{pages} ページに {blocks} 件の JSON-LD ブロックをインストールしました。",
      installSuccessWithPreserved:
        "{blocks} 件の JSON-LD ブロックをインストールしました。既存の Custom Code {bytes} バイトはそのまま保持されています。",
      installFailed: "インストール失敗：{error}",
      installUndo: "元に戻す",
      installUndoDone: "インストール前の Custom Code に復元しました。",
      installUndoFailed: "復元失敗：{error}",
      editorOpen: "フィールドを編集",
      editorHelper:
        "この {kind} スキーマを微調整します。保存すれば次回のインストールから反映されます。種類自体を変更する場合は手動モードへ。",
      editorReset: "AI の提案に戻す",
      editorEdited: "編集済み",
      editorAddRow: "質問を追加",
      editorRemoveRow: "削除",
      manualLink: "手動モードを使う",
      timeJustNow: "たった今",
      timeMinutesAgo: "{n} 分前",
      timeHoursAgo: "{n} 時間前",
      timeDaysAgo: "{n} 日前",
    },
    manual: {
      title: "Schema · 手動モード",
      backToAudit: "AI 監査に戻る",
      helper:
        "Schema を手作業で 1 件作成します。AI が拾えない特殊なページタイプに使ってください。",
    },
    schemaTypeTitle: "Schema タイプ",
    sourceContentTitle: "ソースコンテンツ（デフォルト言語）",
    localesTitle: "生成する言語",
    localesClear: "クリア（{n}）",
    localesSelectAll: "全選択（{n}）",
    localesPartial: "{n} / {total} 選択中",
    previewTitle: "プレビュー",
    previewMultilingualHelper:
      "Schema ツールは元のテキストを各言語にそのまま複製します（差分は inLanguage と @id のみ）。文章を翻訳したい場合は、インストール前に Meta 文案生成ツールで作成してください。",
    previewEmpty: "上で言語を 1 つ以上選んでください。",
    installButton: "{n} 個の block をインストール",
    installButtonPlural: "{n} 個の block をインストール",
    installSuccess: "Custom Code に {n} 個の schema block をインストールしました。",
    installSuccessWithPreserved:
      "{n} 個の schema block をインストール。既存の Custom Code（{bytes} バイト）は完全に保持されました。",
    installFailed: "インストール失敗：{error}",
    selectLocaleWarning: "言語を 1 つ以上選んでください。",
    kinds: {
      Article: "Article",
      ArticleHelper: "ブログ、ニュース、長文。AI Overviews 引用に最も効きます。",
      Product: "Product",
      ProductHelper: "EC 商品。価格、ブランド、評価などを含めます。",
      LocalBusiness: "Local Business",
      LocalBusinessHelper:
        "店舗、レストラン、エージェンシー。Google Maps とローカル AI 回答に表示されます。",
      FAQPage: "FAQ Page",
      FAQPageHelper:
        "AEO で最もレバレッジが高いタイプ。ChatGPT と Perplexity が直接引用します。",
      Organization: "Organization",
      OrganizationHelper:
        "ブランドアイデンティティ。サイトルートに 1 度追加するだけでグローバルに認識されます。",
    },
    fields: {
      canonicalUrl: "Canonical URL",
      headline: "見出し",
      description: "説明",
      image: "画像 URL",
      author: "著者",
      publisher: "発行者",
      datePublished: "公開日",
      name: "名前",
      brand: "ブランド",
      sku: "SKU",
      price: "価格",
      currency: "通貨",
      businessName: "店舗名",
      telephone: "電話",
      streetAddress: "住所",
      city: "市区町村",
      countryIso: "国（ISO コード）",
      question: "質問 {n}",
      answer: "回答",
      addQuestion: "+ 質問を追加",
      removeQuestion: "この質問を削除",
      siteUrl: "サイト URL",
      logoUrl: "ロゴ URL",
      sameAs: "ソーシャル URL（カンマ区切り）",
    },
  },

  llms: {
    title: "多言語 llms.txt",
    siteInfoTitle: "サイト情報",
    siteName: "サイト名",
    siteNamePlaceholder: "Acme Studio",
    siteSummary: "1 行サマリー",
    siteSummaryPlaceholder:
      "Acme はデザイナー向けツールを作るグローバルプロダクトスタジオ。",
    baseUrl: "ベース URL",
    baseUrlPlaceholder: "https://acme.com",
    localizedPathsLabel:
      "デフォルト以外の言語にスラッグを前置（Framer 標準）",
    longDescription: "ロングディスクリプション",
    longDescriptionOptional: "（任意）",
    longDescriptionHelper:
      "短い段落 + 箇条書きの組み合わせ。「> 一行サマリー」と最初の「##」のあいだに入ります。Framer 公式 llms.txt と同じ構造です。",
    longDescriptionPlaceholder:
      "ここに導入段落を書きます。\n\n主な特徴：\n- 要点 1\n- 要点 2\n- 要点 3",
    longSuggestHint:
      "サイト名・サマリー・スキャンしたページを材料に、AI に Framer 風のロングディスクリプションを書かせます。",
    longSuggestPanelHelperGenerate:
      "重視してほしい点（対象者、強み、差別化ポイント）を伝えてもいいですし、空欄でも OK です。サイト名と検出したページが事実の足場になります。",
    longSuggestPanelHelperOptimize:
      "強調してほしい点を伝えてください。元の意図と要点は保ちつつ、AEO に効く密度に整えます。",
    longSuggestKeywordsPlaceholder:
      "例：技術的な強みを推す、対象は product-led スタートアップ…",
    suggestAppliedLong: "ロングディスクリプションを更新しました。",
    aiPanelHeader: "AI アシスタント · {field}",
    aiPanelKeywordsLabel: "AI に強調してほしい点は？（任意）",
    cmsSourceTitle: "CMS ソース（任意）",
    collectionLabel: "Collection",
    collectionNone: "— 使わない（サイトサマリーのみ） —",
    collectionLoading: "読み込み中…",
    collectionRefresh: "更新",
    collectionEmptyHelper:
      "この Framer プロジェクトには CMS Collection がありません。Framer 左側の CMS パネルで新規作成（例：ブログ記事、商品）してから「更新」を押してください。Collection なしでも OK —— 言語ごとにサイト概要だけの llms.txt が生成されます。",
    collectionMultiHelper:
      "セクションにしたい Collection をすべてチェックしてください。チェック順に「## 名前」セクションとしてファイルに出力されます。",
    collectionItemCount: "{n} 件",
    collectionFieldsAuto: "フィールド：{title} / {summary}",
    collectionFieldsAutoTitleOnly: "フィールド：{title}（サマリーなし）",
    collectionFieldsOverride: "フィールド：{title} / {summary}（カスタム）",
    collectionFieldsOverrideTitleOnly:
      "フィールド：{title}（カスタム、サマリーなし）",
    collectionFieldsMissing:
      "タイトルフィールドを自動検出できませんでした。選択してください。",
    collectionFieldsCustomize: "フィールドをカスタマイズ",
    collectionFieldsCustomizeOpen: "フィールドを編集中",
    collectionFieldsResetAuto: "自動検出に戻す",
    titleField: "タイトルフィールド",
    summaryField: "サマリーフィールド",
    skippedDefaultHelperGeneric:
      "これらの行のタイトルが読み込めません。Collection の「フィールドをカスタマイズ」から別のフィールドを選ぶか、Framer の CMS でタイトルを入れてください。",
    duplicateTitlesPill: "タイトル重複 {n} 件",
    duplicateTitlesHelper:
      "複数の CMS 行が同じタイトルを共有しています。AI エンジンはラベルで重複排除するので片方が黙って落とされます。Framer の CMS で各行に固有の Title を設定してください。",
    duplicateTitlesSharedBy: "{n} 行で共有",
    duplicateTitlesSlugsLabel: "対象 slug:",
    pagesSourceTitle: "サイトページ",
    pagesSourceHelper:
      "「## Pages」セクションを追加して、静的ページ（About、Services、Contact など）を一覧化します。「スキャン」を押すとプロジェクトのページを読み込みます。",
    pagesSectionTitle: "Pages",
    pagesScan: "ページをスキャン",
    pagesRescan: "再スキャン",
    pagesScanBusy: "スキャン中…",
    pagesScanNeedsBaseUrl: "先にサイトのルート URL を入力してください。",
    pagesScanSuccess: "{n} 件の静的ページが見つかりました。",
    pagesScanFailed: "ページスキャンに失敗：{error}",
    pagesScanPartialPill: "部分スキャン",
    pagesScanPartialHelper:
      "いくつかのページは読み込めませんでした—たいていはロックされた、または未完成のテンプレートです。残りの一覧は問題ありません。",
    pagesNotScannedYet:
      "「スキャン」を押してプロジェクトの静的ページを読み込みます。CMS テンプレートとホームは既定でスキップ — 一覧が出たら追加でチェックできます。",
    pagesEmpty:
      "静的ページが見つかりません。（CMS Collection に紐づくページは、上の「CMS ソース」から追加します。）",
    pagesHomepageBadge: "ホーム",
    aiTranslatingPages: "{locale} 向けに {n} 件のページを翻訳中…",
    aiTranslatingLongDescription: "{locale} 向けにロングディスクリプションを翻訳中…",
    longDescriptionFlagPill: "ロングディスクリプションが未ローカライズ",
    longDescriptionFlagHintMixedScript:
      "AI が訳したロングディスクリプションに対象 locale と異なるスクリプトが混入していたため、デフォルト locale 版を残しました。より強いモデルで再試行してください。",
    longDescriptionFlagHintUntranslated:
      "AI が長文を綺麗に翻訳できなかったため、デフォルト locale 版を残しました。より強いモデルで再試行するか、この locale 用のテキストを手書きしてください。",
    generatedTitle: "生成済みファイル",
    generateButton: "{n} 個のファイルを生成",
    generateButtonPlural: "{n} 個のファイルを生成",
    uploadHelper:
      "各ファイルをホスティング層の対応するパスにアップロードしてください（例：{default}、{localized}）。",
    deployTitle: "Framer サイトへのデプロイ方法",
    deployPlanBadge: "Framer Pro+ が必要",
    deployStepDownload:
      "上の各ファイルで「ダウンロード」を押してローカルに保存（または「コピー」で他所に貼り付け）。",
    deployStepFramer:
      "Framer Dashboard → 左側 Domains → ご自身のドメイン → Files タブで、各ファイルをルートパスにアップロード。",
    deployStepFramerLink: "Framer 公式ガイドを見る →",
    deployStepPublish:
      "サイトを Publish。/llms.txt、/llms-zh-cn.txt などのパスから配信が開始されます。",
    deployOtherHosting:
      "Static Files は Framer Pro+ プランの機能です。Basic／Free プランで llms.txt を配信するには、独自ホスティング（カスタムドメインの前段に Cloudflare Workers を置くなど）で {default}、{localized} に配置する必要があります。",
    setSiteFirst: "先にサイト名とベース URL を入力してください。",
    generationFailed: "生成失敗：{error}",
    configSaveFailed: "下書きを保存できませんでした。離れる前に再試行してください。",
    copySuccess: "コピーしました。",
    generateSuccess: "{n} 個のファイルを生成しました。",
    skippedLocalizedPill: "{n} 件をスキップ",
    skippedLocalizedHelper:
      "{locale} のタイトルが未翻訳の項目はスキップしました。Framer の CMS で翻訳を追加してから、再生成してください。",
    skippedDefaultPill: "タイトルがない CMS 行 {n} 件",
    skippedDefaultHelper:
      "フィールド「{field}」を読み取れませんでした。タイトルフィールド名が CMS の実際のフィールドと一致しているか確認してください。",
    aiTranslateTitle: "AI 自動翻訳（任意）",
    aiTranslateToggle: "未翻訳の項目を AI で翻訳する",
    aiTranslateHelper:
      "ローカライズ済みタイトルのない CMS 項目を、選択した AI モデルに翻訳してもらいます。翻訳結果は生成される llms.txt にのみ反映され、CMS の元データは変更されません。",
    aiProviderKeyMissing:
      "自動翻訳を使うには、設定で {provider} の API キーを追加してください。",
    aiTranslatingProgress: "{locale} の {n} 件を翻訳中…",
    aiTranslatingHeader: "{locale} のサイト概要を翻訳中…",
    headerFlagPill: "サイト概要が未ローカライズ",
    headerFlagHintMixedScript:
      "AI が翻訳した概要に対象ロケールの文字種が混在していたため、元の概要をそのまま使っています。ファイル冒頭の「Language: ja」と概要の言語が一致しないので、より強力なモデルを試すか、概要をニュートラルな言い回しに書き直してください。",
    headerFlagHintUntranslated:
      "AI がサイト概要を適切に翻訳できなかったため、元の概要を残しています。冒頭のロケール表示と概要の言語が一致しないので、より強力なモデルを試すか、ロケールごとに手書きしてください。",
    aiCostEstimate:
      "AI コスト上限の見積もり：~${cost}（全 CMS 項目を翻訳すると仮定）。",
    aiFailedPill: "AI が翻訳できなかった項目 {n} 件",
    aiFailedHelper:
      "AI の出力が品質チェックを通過しませんでした。上の「再試行」ボタンで強化済みのプロンプトでもう一度実行できます。あるいはより強いモデルに切り替えるか、手動で訳してください。",
    aiFailedReasonMixedScript: "文字種が不一致",
    aiFailedReasonUntranslated: "未翻訳の可能性",
    aiFailedReasonParseFailed: "AI 応答の解析失敗",
    regenerateLocale: "再試行",
    regenerateLocaleBusy: "再生成中…",
    regenerateLocaleHint:
      "{locale} のファイルだけ AI 翻訳を再実行します。失敗した項目はもう一度試行され、他のロケールは影響を受けません。",
    regenerateLocaleSuccess: "{locale} を再生成しました。すべてのチェックに合格。",
    regenerateLocaleStillFailed:
      "{locale} を再生成しましたが、品質チェックに合格しない項目が残っています。より強いモデルをお試しください。",
    regenerateLocaleNotFound:
      "そのロケールが見つかりません。代わりに全ファイル生成をお試しください。",
    downloadAll: "まとめて ZIP ダウンロード（{n} ファイル）",
    downloadAllHint:
      "生成した llms.txt をまとめて 1 つの ZIP にします。Framer の Files パネルにそのままドラッグすれば一括アップロードできます。",
    downloadAllSuccess: "{n} 個のファイルを ZIP でダウンロードしました。",
    deployStepOpenProject: "Framer ダッシュボードを開く →",
    suggestGenerate: "✨ AI で生成",
    suggestOptimize: "✨ AI で最適化",
    suggestHint:
      "AI に AEO 向けの簡潔なサイト概要を書かせます。「使用する」を押すまで既存の内容は上書きされません。",
    suggestPanelHelperGenerate:
      "AI に重視してほしい点（ターゲット、カテゴリ、提供価値）があれば書いてください。空欄でもブランド名から書き起こせます。",
    suggestPanelHelperOptimize:
      "AI に強調してほしい点があれば指定してください。意味は保ったまま、表現だけ引き締めます。",
    suggestKeywordsPlaceholder:
      "例：プロダクト主導のスタートアップ向けブランディングスタジオ、4年の実績...",
    suggestGenerateAction: "提案を生成",
    suggestOptimizeAction: "下書きを最適化",
    suggestRetry: "もう一度試す",
    suggestUse: "使用する",
    suggestBusy: "AI に問い合わせ中…",
    suggestApplied: "サイト概要を更新しました。",
    suggestResultTitle: "AI の提案",
    suggestLowQualityPill: "信頼度低",
    suggestLowQualityHint:
      "出力が品質チェックを通過しませんでした（デフォルトロケールの文字種が不一致、または下書きとほぼ同一）。そのまま使えますが、より強力なモデルを試すのを推奨します。",
    suggestFailed: "AI 提案に失敗：{error}",
    suggestNoDefaultLocale: "デフォルトロケールが見つかりません。Framer プロジェクトに少なくとも 1 つのロケールを設定してください。",
    suggestNeedsSiteName: "まずサイト名を入力してください。AI はこれを主要な手がかりにします。",
    suggestModelHint:
      "ヒント：一行サマリの生成には、推論を行わない高速モデル（Claude Haiku、GPT-4o-mini、DeepSeek-V3、GLM-4-Plus など）で十分です。Thinking 系モデルは内部推論にトークンを多く使い、回答に到達する前に打ち切られることがあります。",
    stepNavLabel: "llms.txt の手順",
    step: {
      setup: "サイト情報",
      sources: "コンテンツソース",
      review: "生成結果",
      deploy: "デプロイ",
    },
    stepNext: "次へ",
    stepBack: "戻る",
    stepGenerate: "{n} 個のファイルを生成",
    goToDeploy: "次へ：デプロイ",
    backToReview: "結果に戻る",
    reviewFileCount: "{n} 個のファイル",
    reviewLocaleNeedsAttention: "{locale} 要確認（CMS {n} 件）",
    reviewLocaleTabs: "生成ファイルのロケール",
    reviewEmpty: "ファイルを生成すると、ここに結果が表示されます。",
    reviewNoIssues: "このロケールに問題はありません。",
    issuesTitle: "問題",
    previewTitle: "プレビュー",
    configChangedHint:
      "前回の生成以降に設定が変わりました。ファイルを更新するには再生成してください。",
    regenerateAll: "すべて再生成",
    setupOptionalTitle: "オプション",
    setupAiEnabled: "オン",
    stepProgress: "{current}/{total} · {label}",
    sourcesTitle: "コンテンツソース",
    cmsFoldSummary: "CMS · {n} 件選択",
    pagesFoldSummary: "ページ · {n} 件選択",
    showMoreCollections: "+ あと {n} 件の Collection",
  },

  meta: {
    title: "Meta 文案生成",
    sourceTitle: "ソースページ",
    pageFlowIntro:
      "プロジェクトからページを読み込み、1 つ選び、内容を確認してから生成に進みます。",
    pageFlowTitle: "ページ設定の手順",
    pageFlowLoad: "プロジェクトからページを読み込む",
    pageFlowLoadDone: "ページを読み込み済み",
    pageFlowLoadHint:
      "Framer の静的ページ一覧を取得します。URL を手入力する必要はありません。",
    pageFlowSelect: "対象ページを選ぶ",
    pageFlowSelectDone: "選択済み：{title}",
    pageFlowSelectHint:
      "選ぶとページのテキストが「ページコンテキスト」に入ります。",
    pageFlowSelectPlaceholder: "ページを選択…",
    pageFlowManual: "読み込まず手入力する",
    pageFlowManualDone: "手入力",
    pageFlowBackToPick: "プロジェクトから選び直す",
    pageFlowRescan: "一覧を再読み込み",
    pageFlowContent: "ページ情報を確認",
    pageFlowContentHint:
      "概要は編集できます。コンテキスト入力後に ✨ AI 補完が使えます。",
    pageFlowSelectedPage: "対象：{title}（{path}）",
    pageContentLoading: "ページを読み込み中…",
    stepNextNeedLoad: "先にプロジェクトからページを読み込んでください。",
    stepNextNeedSelect: "ページを選ぶか、手入力に切り替えてください。",
    stepNextNeedContext: "ページコンテキストを入力してから次へ進んでください。",
    generateNeedKey:
      "設定で {provider} の API キーを追加するか、キー設定済みのプロバイダーを選んでください。",
    stepNavLabel: "Meta ワークフローのステップ",
    step: {
      page: "ページ",
      generate: "生成",
      review: "Framer にコピー",
    },
    stepNext: "次へ",
    stepBack: "戻る",
    stepProgress: "{current}/{total} · {label}",
    reviewIntro:
      "各言語のタイトル・説明・SNS タグは下にあります。Framer はプラグインから書き込めないため、言語ごとにページ設定へ貼り付けてください。",
    reviewDone: "完了",
    sessionRestored:
      "前回生成した Meta を復元しました。Framer へのコピーを続けられます。",
    applyNotSeoTab: "「SEO」メニューも、F メニュー内の Page settings もありません",
    applySiteVsPage:
      "F → Site settings の一覧（General、Custom Code など）はサイト全体用です。ページ別 Meta はキャンバス左の Pages リストから開きます（次の手順）。General の Title/Description はデフォルトであり、言語別の文案の代わりにはなりません。",
    applyPageFallback: "対象ページ",
    applyStepOpenPagePanel:
      "ページ「{page}」の設定を開く（上部に Title と Page Description）。",
    applyStepOpenPagePanelHow:
      "プラグインを閉じるか小さくする → 左の Pages アイコン → リストでページ（例 Home）にホバー → ⋯ → Settings。Title と Page Description はそのパネル上部です。",
    applyStepFieldMapping:
      "プラグインの Title → Framer の Title、Meta description → Page Description。OG/Twitter は同じパネルのソーシャル欄へ。",
    applyStepFramerMetaDocs: "Framer 公式：ページのタイトルと説明 →",
    setupOptionalTitle: "任意",
    pickPage: "ページ",
    pickPageManual: "手動入力のみ",
    scanPages: "プロジェクトからページを読み込む",
    scanningPages: "ページをスキャン中…",
    pagesScanPartial: "一部のページを読み取れませんでした。リストが不完全な場合があります。",
    noStaticPages: "静的ページが見つかりません。コンテキストを手動で入力してください。",
    pageLoadFailed: "ページ内容を読み取れませんでした。手動で編集してください。",
    homepageBadge: "ホーム",
    suggestPageTypeHint: "コンテキストからページタイプを提案",
    pageTypeHelper:
      "空欄のまま ✨ 推定、または手入力（例：Landing page）。Meta 生成時に使います。",
    pageTypeHomeHint:
      "ホームは多くの場合 Landing page です。✨ でコンテキストから推定するか、別タイプを手入力してください。",
    suggestHint: "ページコンテキストから AI でこの項目を入力",
    suggestHintInfer: "コンテキストから推定",
    suggestHintImprove: "現在の値をコンテキストで改善",
    suggestAction: "AI",
    suggestActionInfer: "推定",
    suggestActionImprove: "改善",
    suggestSameBadge: "現在と同じ",
    suggestSameAsCurrent:
      "AI も現在の入力（{value}）で問題ないと判断しました。置き換え不要です。",
    suggestSameDismiss: "了解",
    suggestSameApplied: "すでに同じ値です。",
    suggestRetryFresh: "再推定",
    suggestChangeFrom: "変更案：{from} → {to}",
    suggestNewValue: "提案：",
    suggestBusy: "AI 生成中…",
    suggestUse: "使用する",
    suggestRetry: "再試行",
    suggestNeedsContext:
      "先にページコンテキストを入力してください。AI が読む内容が必要です。",
    suggestNoDefaultLocale:
      "デフォルト言語がありません。Framer で少なくとも 1 つの言語を追加してください。",
    suggestFailed: "AI 提案に失敗：{error}",
    suggestApplied: "フィールドを更新しました。",
    pageType: "ページタイプ",
    pageTypePlaceholder: "ランディングページ、ブログ記事、商品ページ…",
    pageContext: "ページコンテキスト",
    pageContextPlaceholder:
      "見出し + 1〜2 段落で、このページが何をするのか、誰向けか、なぜ重要かを記述。",
    primaryKeyword: "メインキーワード（任意）",
    primaryKeywordPlaceholder: "multilingual SEO plugin",
    brandVoice: "ブランドボイス（任意）",
    brandVoicePlaceholder: "自信、技術的、簡潔",
    providerTitle: "AI プロバイダー",
    modelTitle: "モデル",
    providerClaude: "Claude",
    providerOpenAi: "GPT-4o-mini",
    providerKeyMissing: "設定で {provider} の API キーを追加してください。",
    estimatedCost: "推定コスト",
    generateReady: "{n} 言語分の Meta 生成の準備ができました。",
    resultsTitle: "結果",
    reviewLocaleCount: "{n} 言語",
    reviewLocalesNeedAttention: "{locales} は要確認",
    reviewLocaleTabs: "Meta を生成した言語",
    reviewEmpty: "生成後にここで結果を確認できます。",
    fieldGroupSearch: "検索",
    fieldGroupSocial: "Open Graph と Twitter",
    copyAll: "すべてのフィールドをコピー",
    copyAllSuccess: "この言語の全フィールドをコピーしました。",
    copyAllFailed: "コピーできませんでした。手動で選択してコピーしてください。",
    lengthSoftPill: "長め（{max}）",
    lengthSoftHint: "Google はおおよそ {max} 文字で切り詰めることが多いです。短くすることを検討してください。",
    addContextWarning: "ページコンテキストを入力してください。",
    setKeyWarning: "設定で API キーを追加してください。",
    generateButton: "{n} 言語分を生成",
    generateButtonPlural: "{n} 言語分を生成",
    generatingProgress: "生成中… {current} / {total}",
    generateCancelled: "生成をキャンセルしました。",
    generatedSuccess: "{n} 言語分の Meta を生成しました。",
    generatedSuccessWithIssues:
      "{n} 言語分の Meta を生成しました。{issues} 言語は再試行が必要かもしれません。",
    regenerate: "再生成",
    regenerateAll: "すべて再生成",
    regenerateOne: "この言語だけ再生成",
    regenerating: "再生成中…",
    configChangedHint:
      "前回の生成以降にページコンテキストが変わりました。再生成して結果を更新してください。",
    applyTitle: "Framer で適用",
    applyStepLocale:
      "Framer 上部バーで対象言語に切り替えます（地球アイコン / 言語ピッカー）。",
    applyStepLocaleLink: "Framer ローカライズガイド",
    applyStepPage: "このページの設定を開く（Title + Page Description）。",
    applyStepPageWithPath: "{path} のページ設定を開く（Title + Page Description）。",
    applyStepCopyBelow:
      "下で言語タブを選び、各フィールドをコピー（またはすべてコピー）。",
    applyStepRepeatLocales:
      "すべての言語で同じ手順を繰り返し、問題なければ公開します。",
    applyStepPublish: "各言語を確認したらサイトを公開します。",
    applyStepOpenProject: "Framer プロジェクトを開く",
    applyHelper:
      "Framer はまだプラグインからページ SEO を書き込めません。言語ごとにページ設定へ貼り付けてください。",
    fields: {
      title: "Title",
      metaDescription: "Meta description",
      ogTitle: "OG title",
      ogDescription: "OG description",
      twitterTitle: "Twitter title",
      twitterDescription: "Twitter description",
    },
    qualityIssuePill: "⚠ {n} 件の問題",
    qualityIssueHint:
      "翻訳に問題がありそうです。再生成で再試行するか、下のフィールドを手動で編集してください。",
    qualityUntranslatedPill: "未翻訳の可能性",
    qualityUntranslatedHelper:
      "meta description が原文と一致しています。AI が翻訳していない可能性が高いので、再生成するか、より高性能なモデルに切り替えてください。",
    qualityParseFailedPill: "解析失敗",
    qualityParseFailedHelper:
      "AI の応答が有効な meta JSON ではありませんでした。再生成するかモデルを変更してください。",
    qualityMixedScriptPill: "文字種が不一致",
    qualityMixedScriptHint:
      "対象 locale の文字種と一致していません（例: 日本語 locale なのにラテン文字のみ）。翻訳失敗のサインです。",
  },

  settings: {
    title: "設定",
    apiKeysTitle: "AI プロバイダー（BYOK）",
    apiKeysHelper:
      "Polyglot AEO はキーを見ません。各プロバイダーのキーは現在の Framer プロジェクトの plugin data にのみ保存され、生成時はブラウザから直接プロバイダーへ送信、料金もプロバイダー通常価格で直接決済されます。",
    providerKeyPlaceholder: "{provider} の API キー",
    providerGetKey: "キーを取得",
    providersShowMore: "他のプロバイダー {n} 件を表示",
    providersHide: "他のプロバイダーを隠す",
    testKey: "テスト",
    testing: "テスト中…",
    testKeyOk: "接続成功",
    testKeyFail: "失敗",
    testKeyEmpty: "先にキーを入力",
    addCustomProvider: "+ カスタムプロバイダーを追加",
    customProviderTitle: "カスタム OpenAI 互換プロバイダー",
    customProviderHelper:
      "OpenAI 互換のエンドポイントなら何でも使えます —— Together、Groq、Ollama、LiteLLM、vLLM、社内ゲートウェイなど。Polyglot AEO は標準の /chat/completions リクエストを送ります。",
    customProviderName: "表示名",
    customProviderNamePlaceholder: "プライベート LLM",
    customProviderBaseUrl: "Base URL",
    customProviderBaseUrlPlaceholder:
      "https://api.example.com/v1（/chat/completions が置かれるパスの前まで）",
    customProviderModelIds: "モデル ID（カンマ区切り）",
    customProviderModelIdsPlaceholder: "llama-3.3-70b, mixtral-8x22b",
    customProviderSave: "プロバイダーを保存",
    customProviderRemove: "削除",
    customProviderSaved: "カスタムプロバイダーを保存しました。",
    customProviderRemoved: "カスタムプロバイダーを削除しました。",
    customProviderInvalid:
      "表示名、Base URL、モデル ID（最低 1 つ）を入力してください。",
    customProviderRemoveConfirm:
      "このカスタムプロバイダーを削除しますか？関連する API キーも一緒に削除され、元に戻せません。",
    customProviderDiscardConfirm:
      "このカスタムプロバイダーの下書きを破棄しますか？API キーとブランドボイスの変更は自動保存済みです。",
    customProviderDiscard: "下書きを破棄",
    anthropicKey: "Anthropic API キー",
    openaiKey: "OpenAI API キー",
    brandVoiceTitle: "ブランドボイス",
    brandVoiceHelper: "すべての locale に適用されます。任意ですが推奨。",
    brandVoicePlaceholder:
      "自信、技術的、簡潔。「you」を使い「your business」は使わない。「シナジー」「活用」のような空虚な言葉は避ける。",
    languageTitle: "プラグインの言語",
    languageHelper:
      "プラグインの表示言語。サイトのコンテンツ言語とは別です。",
    languageAuto: "自動（{detected}）",
    quickStartResetTitle: "クイックスタート",
    quickStartResetHelper:
      "Dashboard でオンボーディングチェックリストを再表示します。",
    quickStartResetButton: "クイックスタートを表示",
    quickStartResetDone: "クイックスタートを再有効化しました。",
    installedTitle: "インストール済み Schema",
    installedYes: "インストール済み",
    installedNo: "未インストール",
    removeAll: "すべて削除",
    removeAllHelper:
      "Polyglot AEO が注入したブロックのみ削除します。手動で追加したコードや他プラグインのコードはそのまま残ります。",
    saveSuccess: "設定を保存しました。",
    autoSaveLoading: "読み込み中…",
    autoSaveUnsaved: "自動保存中…",
    autoSaveSaving: "保存中…",
    autoSaveSaved: "保存済み",
    autoSaveError: "設定を保存できませんでした。",
    removeSuccess: "Custom Code から schema を削除しました。",
    removeSuccessWithPreserved:
      "Schema を削除。既存のユーザーコード（{bytes} バイト）は完全に保持されました。",
  },

  license: {
    proBadge: "Pro",
    settingsTitle: "Polyglot AEO Pro",
    settingsHelper:
      "Creem ライセンスをこの Framer プロジェクトで有効化。Pro は 1 サイト 1 アクティベーション。",
    billingModeLabel: "チェックアウトとライセンス環境",
    productionMode: "本番",
    testMode: "テスト",
    productionModeHelper:
      "本番決済と本番ライセンス。Marketplace 用ビルドではこのモードを使用します。",
    testModeHelper:
      "Sandbox 決済とテストライセンス。実課金なしで全フローをテストできます。",
    keyLabel: "ライセンスキー",
    keyPlaceholder: "pa_live_…",
    activate: "有効化",
    activating: "有効化中…",
    activateSuccess: "このプロジェクトで Pro を有効化しました。",
    activateFailed: "有効化できませんでした。キーを確認してください。",
    getPro: "Pro を購入",
    comparePlans: "Free と Pro を比較",
    activeKey: "有効: {hint}",
    refresh: "ライセンスを再確認",
    validating: "確認中…",
    deactivate: "ライセンスを削除",
    upgrade: {
      title: "Pro にアップグレード",
      generic:
        "多言語 schema、Meta 文案、言語別 llms.txt、無制限インストールを解放。",
      multi_locale:
        "複数言語を検出しました。Pro で各言語向けの schema・Meta・llms を生成できます。",
      schema_install_limit:
        "無料版は AI schema インストール最大 5 ページ。Pro は無制限。",
      schema_install_all: "全ページの一括有効化・インストールは Pro の機能です。",
      schema_translate: "言語別 schema 翻訳には Pro が必要です。",
      llms_generate:
        "AI による llms.txt 生成には Pro が必要です。無料版はデフォルト言語の編集・コピーが可能。",
      llms_multi_locale:
        "追加言語の llms ファイル（llms-ja.txt 等）には Pro が必要です。",
      llms_ai_translate: "llms.txt の AI 翻訳には Pro が必要です。",
      meta_generate:
        "無料版はデフォルト言語で Meta を 3 回試せます。Pro では全言語を一括生成できます。",
      schema_audit_persist:
        "Pro ではインストール履歴と差分をセッションをまたいで保持します。",
      remote_schema_rules:
        "Pro にはプラグイン更新に合わせたルール・テンプレートの改善が含まれます。",
      generic_pro: "Pro で多言語 AEO の一連の流れを使い切れます。",
      bulletLocales:
        "各言語にネイティブな schema + Meta + llms（inLanguage の書き換えだけではない）",
      bulletQuality: "公開前の AI 品質チェックで翻訳ミスを抑える",
      bulletAgency: "クライアント 1 サイトで月 $19 はすぐ回収しやすい",
      ctaLabel: "Pro にアップグレード",
      ctaPrice: "月額 $19",
      pricingHint: "年額 $190（約 17% OFF）。返金は polyglotaeo.com を参照。",
    },
    dashboardLocaleBanner:
      "このプロジェクトは {count} 言語。Pro で各言語の schema・Meta・llms を解放できます。",
    dashboardLocaleFree: "無料版はデフォルト言語のみ（{code}）。",
    freeInstallQuota: "Free AI schema {used}/{max} ページ",
  },

  shortcuts: {
    title: "キーボードショートカット",
    helper: "? を押せばいつでも再表示できます。",
    back: "前の画面へ戻る",
    submit: "メインアクションを実行（生成 / インストール）",
    help: "このリストを表示",
  },
}
