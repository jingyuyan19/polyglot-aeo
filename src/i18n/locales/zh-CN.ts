import type { Translations } from "./en"

/**
 * 简体中文 (Simplified Chinese).
 *
 * 本地化原则（顺序 = 重要性）：
 *
 *   1. **删第二人称**。UI 文案里"你的"几乎都是冗余。
 *      "你的网站" → "网站"；"你提供 Key" → "用自己的 Key"。
 *
 *   2. **断长句 + 强动词**。英文一句 ≈ 中文两句短。每句 ≤ 25 字。
 *      "把工作量乘以 locale 数量" → "多语言项目越多，越值"。
 *      "进行配置" → "配置"；"使其能够实现" → "让它能"。
 *
 *   3. **保留英文技术术语**。schema / locale / JSON-LD / OG / inLanguage /
 *      canonical / BCP-47 / llms.txt — 中文技术圈对英文术语认知度
 *      远高于强行翻译（"答案引擎优化"反而陌生）。
 *
 *   4. **品牌名一律不译**。Polyglot AEO / Framer / ChatGPT / Perplexity /
 *      Claude / Anthropic / OpenAI 等。
 *
 *   5. **不直译营销修辞**。原文 "Get cited by..." 不译为"被…引用"，
 *      译为"让 ChatGPT... 引用你"，主动调性更符合中文工具产品。
 *      原文 "multiplies your work" 不译为"乘以工作量"（听起来像负担），
 *      译为"locale 越多，越值"（强调投入产出比）。
 *
 *   6. **完整中文标点**。「，。：；！？」全角；前后不留半角空格，
 *      但中英混排时数字/英文术语前后留半角空格（"安装 {n} 个 block"）。
 *
 *   7. **与 Loka / Ally / Gaode 的中文沟通语气一致** — 简洁、技术、不浮夸，
 *      不堆砌"赋能"、"打通"、"闭环"等空话。
 */
export const zhCN: Translations = {
  common: {
    back: "返回",
    save: "保存",
    saving: "保存中…",
    cancel: "取消",
    close: "关闭",
    generate: "生成",
    generating: "生成中…",
    install: "安装",
    installing: "安装中…",
    copy: "复制",
    download: "下载",
    remove: "移除",
    show: "显示",
    hide: "隐藏",
    none: "无",
    chars: "{n} 字符",
    apiKeyMissing: "未配置 API Key",
    apiKeyMissingHelper: "请先在设置里添加 API Key。",
    default: "默认",
    confirmDiscardChanges:
      "有未保存的修改。切换 schema 类型会丢弃这些内容。要继续吗？",
    confirmRemoveAll:
      "把这个站点 Custom Code 里 Polyglot AEO 注入的所有 schema 全部移除？手动写入的代码不会受影响。",
    helpClose: "关闭说明",
    helpOpen: "查看说明",
    aiSettingsTitle: "AI 设置",
    openSettings: "打开设置",
    copied: "已复制",
  },

  help: {
    aeo: "Answer Engine Optimization。面向 AI 搜索引擎（ChatGPT、Perplexity、Claude、Google AI Overviews）的 SEO，跟传统 Google SEO 是两回事。衡量标准是被 AI 答案引用的次数。",
    inLanguage:
      "schema.org 的一个属性，告诉 AI 爬虫这个页面是用哪种语言写的。没有这个标记，AI 可能在用户用日语提问时引用英文页面 —— 或者干脆把你跳过。",
    bcp47:
      "BCP-47 是 IETF 的语言代码标准，比如 en-US、zh-CN、ja-JP。Schema.org 和 llms.txt 都要求用这个格式。Polyglot AEO 会自动把 Framer 的 locale 代码转换好，不用手动处理。",
    byok:
      "Bring Your Own Key（自带密钥）。用自己的 API Key（Anthropic、OpenAI 等）调用 AI。Polyglot AEO 不做中转 —— Key 只存在你本地，请求直发到 AI 提供方，按提供方原价计费（通常每页几分钱）。",
    canonicalUrl:
      "页面的唯一官方 URL。搜索引擎和 AI 爬虫用它做去重，决定引用哪个版本。多语言站点里，每种语言一般有各自的 canonical（比如 /about 和 /zh/about）。",
    llmsTxt:
      "给 LLM 用的 robots.txt —— 一份纯文本文件，告诉 AI 爬虫站点的结构。Polyglot AEO 按语言各输出一份，方便各语言独立索引。",
    fenced:
      "Polyglot AEO 注入到 Framer Custom Code 的所有内容都会用 HTML 注释（polyglot-aeo:start / :end）包起来。卸载只会移除这对注释里的部分 —— 手写的脚本（GA、Hotjar、Stripe）一字不动。",
    brandVoice:
      "一段简短的写作风格描述，会传给 AI 用于生成本地化 meta。越具体越好：「自信、技术、简洁；用 you 而非 your business」比「专业友好」效果好十倍。",
  },

  dashboard: {
    subtitle:
      "让 ChatGPT、Perplexity、Claude、Google AI Overviews 在每种语言里都引用你的网站。",
    subtitleSecondary:
      "为 Framer 而生 —— Schema 自动注入 Custom Code、Meta 粘贴到页面 Title / Page Description、llms.txt 通过 Framer Static Files 部署。",
    statusInstalled: "Schema 已安装",
    statusDisabled: "Schema 已禁用",
    statusNotInstalled: "未安装",
    localesTitle: "项目语言",
    localesActive: "{n} 个已启用",
    localesNone: "无",
    localesEmpty:
      "还没添加其他语言。单语言站点也能用，多语言才是插件的主场。请到 Framer 本地化面板添加语言。",
    localesAddCta: "查看 Framer 多语言文档",
    healthTitle: "AEO 就绪度",
    healthScore: "{score}%",
    healthSchemaDone: "Schema 已安装",
    healthSchemaTodo: "安装多语言 Schema",
    healthLlmsDone: "llms.txt 已生成",
    healthLlmsTodo: "生成 llms.txt",
    healthMetaDone: "Meta 文案已生成",
    healthMetaTodoFree: "试生成 Meta（默认语言）",
    healthMetaTodoPro: "生成 Meta 文案",
    healthMetaHint:
      "连上 API Key 只表示能用 AI，还需在 Meta AI 里完成一次生成才会打勾。",
    healthKeyDone: "API Key 已配置",
    healthKeyTodo: "配置 API Key",
    healthLocalesDone: "所有语言已解锁",
    healthLocalesTodo: "升级 Pro 解锁全部语言",
    openControl: "打开控制台",
    reportDownload: "下载客户报告",
    toolsTitle: "工具",
    controlTool: "AEO 控制台",
    controlToolDesc:
      "上线前检查、CMS 翻译缺口、发布后验证，集中在一处。",
    schemaTool: "多语言 Schema",
    schemaToolDesc:
      "为 Article、Product、LocalBusiness、FAQ 等生成 JSON-LD，每种语言一份，inLanguage 自动正确。",
    llmsTool: "多语言 llms.txt",
    llmsToolDesc:
      "读取 CMS，按语言生成 llms.txt，方便 AI 爬虫索引各语言版本。",
    cmsGapsTool: "CMS 多语言缺口",
    cmsGapsToolDesc:
      "找出缺失的本地化标题、摘要、slug 和重复 CMS 标题。",
    metaTool: "Meta 文案生成",
    metaToolDesc:
      "为各语言生成地道的标题、描述、OG 与 Twitter 标签，按当地表达重写而非直译。",
    verifyTool: "上线验证",
    verifyToolDesc:
      "发布后检查首页、JSON-LD、meta description 和 llms.txt 是否真的在线。",
    settingsTool: "设置",
    settingsToolDesc: "API Key、品牌语调、安装状态。",
    whyTitle: "为什么需要按语言生成 Schema？",
    whyBody:
      "Google 建议：每种语言页面都应有独立 JSON-LD，并标注对应 {code}。AI 搜索据此决定在用户用某种语言提问时引用哪一版。多数 AEO 插件只给默认语言一份 schema，Polyglot AEO 为每种语言生成正确变体。",
    quickStartTitle: "快速开始",
    quickStartProgress: "{done} / {total}",
    quickStartAllDone: "全部就绪",
    quickStartDismiss: "关闭",
    quickStartCollapse: "收起",
    quickStartExpand: "展开",
    quickStartSteps: {
      addLocalesTitle: "在 Framer 添加语言",
      addLocalesDesc:
        "语言越多，插件价值越大。请在 Framer 本地化面板至少添加一种非默认语言。",
      addLocalesAction: "查看文档",
      installSchemaTitle: "安装多语言 Schema",
      installSchemaDesc:
        "选择 schema 类型并填写内容，每种语言各一份 JSON-LD，自动写入站点 head。",
      installSchemaAction: "打开 Schema",
      generateLlmsTitle: "生成 llms.txt 文件",
      generateLlmsDesc:
        "给 ChatGPT、Perplexity、Claude 一份「导航地图」，让它们看懂你站点的每种语言。",
      generateLlmsAction: "打开 llms.txt",
      addApiKeyTitle: "添加 AI API Key（可选）",
      addApiKeyDesc:
        "解锁 AI Schema 审查和本地化 Meta。任何视图右上角齿轮 icon 都能直达密钥管理。推荐 Claude 或 GPT-4o-mini。",
      addApiKeyAction: "打开设置",
      verifyTitle: "用 Google Rich Results Test 验证",
      verifyDesc:
        "把站点 URL 粘到 Google 官方校验工具，确认 AI 搜索引擎能正确读到 schema。",
      verifyAction: "打开校验工具",
    },
  },

  control: {
    title: "AEO 控制台",
    readiness: "上线准备度",
    scanning: "扫描中…",
    rescan: "重新扫描",
    downloadReport: "下载报告",
    summary: "{critical} 个关键问题 · {warning} 个警告 · {info} 个提示",
    issuesTitle: "上线阻塞项",
    noIssues: "暂未发现上线阻塞项。下次发布后请运行上线验证。",
    severity: {
      critical: "关键",
      warning: "警告",
      info: "提示",
    },
    issue: {
      schema_missing: {
        title: "多语言 schema 尚未安装",
        body: "上线前安装 JSON-LD，让 AI 系统能理解每个页面。",
      },
      schema_disabled: {
        title: "已安装 schema 处于禁用状态",
        body: "Framer Custom Code 被禁用，爬虫看不到 Polyglot AEO block。",
      },
      llms_missing: {
        title: "还没有生成 llms.txt",
        body: "先生成默认语言文件，Pro 可继续生成各语言版本。",
      },
      meta_missing: {
        title: "尚未生成 Meta 文案",
        body: "上线前请至少生成一组各语言的标题与描述。",
      },
      api_key_missing: {
        title: "尚未配置 API Key",
        body: "配置 API Key 后才能使用 AI 审查、本地化与重试。",
      },
      multi_locale_locked: {
        title: "项目有 {count} 种语言，尚未开通 Pro",
        body: "免费版可查看缺口；Pro 可为每种语言安装并生成完整 AEO 资产。",
      },
      cms_locale_gaps: {
        title: "{count} 个 CMS 本地化缺口",
        body: "缺少本地化标题或摘要会导致 llms.txt 跳过条目，schema 质量也更弱。",
      },
      cms_duplicate_titles: {
        title: "{count} 行 CMS 标题重复",
        body: "重复标题会让 AI 爬虫把不同记录折叠成一个模糊条目。",
      },
      published_failures: {
        title: "{count} 个上线验证失败",
        body: "交付前请运行上线验证并修复 live URL。",
      },
    },
    cmsTitle: "CMS 多语言缺口",
    cmsCollections: "{n} 个 collection",
    cmsSummary:
      "{titles} 个标题缺失 · {summaries} 个摘要缺失 · {slugs} 个 slug 缺失 · {duplicates} 行标题重复",
    cmsLocaleLine:
      "{locale}: {titles} 标题，{summaries} 摘要，{slugs} slug",
    cmsDuplicates: "{n} 组重复",
    cmsNoGaps: "没有发现 CMS 多语言缺口。",
    openCmsGaps: "CMS 缺口",
    openVerifier: "验证线上站点",
    fixPrimary: "修复 schema",
  },

  cmsGaps: {
    title: "CMS 多语言缺口",
    summaryTitle: "缺口摘要",
    detailsTitle: "Collection 明细",
    rows: "{n} 行",
    fields: "字段：标题 = {title}，摘要 = {summary}",
    downloadCsv: "下载 CSV",
    empty: "没有找到 CMS Collection。",
  },

  verify: {
    title: "上线验证",
    siteUrl: "已发布站点 URL",
    helper:
      "发布后运行。部分站点会阻止插件浏览器读取页面；遇到这种情况时，把结果当作手动检查清单。",
    run: "验证已发布站点",
    running: "验证中…",
    results: "结果",
    homepage: "首页可访问",
    homepageOk: "已读取首页 HTML，HTTP {status}。",
    homepageBlocked:
      "插件浏览器无法读取首页。请手动打开 URL 并检查页面源码。",
    schema: "JSON-LD 存在",
    schemaOk: "首页里找到了 {n} 个有效 JSON-LD script。",
    schemaParseWarning: "{n} 个 JSON-LD script 无法解析。",
    schemaMissing: "首页 HTML 里没有找到 JSON-LD script。",
    schemaUnknown: "首页 HTML 不可读，已跳过。",
    inLanguage: "inLanguage 存在",
    inLanguageOk: "找到语言标记：{languages}。",
    inLanguageMissing: "解析后的 JSON-LD 里没有找到 inLanguage。",
    meta: "Meta description 存在",
    metaOk: "找到了 meta description 标签。",
    metaMissing: "首页 HTML 里没有找到 meta description 标签。",
    metaUnknown: "首页 HTML 不可读，已跳过。",
    llms: "llms.txt 可访问",
    llmsLocale: "{locale} llms 文件",
    llmsOk: "/llms.txt 返回 HTTP {status}。",
    llmsLocaleOk: "/{filename} 返回 HTTP {status}。",
    llmsLocaleMissing: "/{filename} 不可访问。",
    llmsMissing: "/llms.txt 不可访问。请上传到 Framer Static Files 并重新发布。",
  },

  schema: {
    title: "多语言 Schema",
    audit: {
      title: "Schema · AI 审查",
      heroTitle: "AI 自动为每个页面提议 Schema",
      heroBody:
        "Polyglot AEO 会扫描 Framer 站点，自动判定每页适合的 Schema 类型，抽取字段，并按已启用的各语言真正翻译，而不只改 inLanguage。",
      providerLabel: "AI 提供商",
      modelLabel: "模型",
      translateContentLabel: "把内容翻译到各语言",
      translateContentHelper:
        "为非默认语言生成地道的 headline、description、body，而不只改 inLanguage。会有一点 AI 费用，但能得到真正本地化的 JSON-LD。",
      aiNeeded: "请先在「设置」里添加 AI API 密钥，才能启用 AI 扫描。",
      scanButton: "扫描站点",
      rescan: "重新扫描",
      scanning: "正在扫描站点…",
      scanProgress: "{current} / {total}",
      translateProgress: "正在翻译 {current} / {total}",
      scanCalls: "次扫描调用",
      translateCalls: "次翻译调用",
      scanFailed: "扫描失败：{error}",
      scanEmpty: "这个 Framer 项目里没有可发布的页面。",
      partial: "部分页面读取失败，可重新扫描重试。",
      scanSummary: "已扫描 {n} 个页面。",
      snapshotTitle: "上次安装",
      snapshotInstalledAt:
        "{time} · {locales} 种语言，共 {n} 块",
      snapshotChanges: "{n} 个有变更",
      snapshotAdded: "{n} 个新增",
      snapshotRemoved: "{n} 个已删除",
      snapshotUpToDate: "已是最新",
      snapshotRescanHint: "重新扫描以检测自上次安装以来的内容变化。",
      snapshotSessionListHint:
        "审查列表仅在本轮打开插件期间保留；返回后需点下方「扫描站点」恢复。已安装的 JSON-LD 不受影响。",
      snapshotResetByDrift:
        "Custom Code 中已不存在 polyglot-aeo 块——已重置安装记录。",
      identityCardTitle: "品牌身份",
      identityCardSubtitle: "用于所有 Schema 的发布方和作者署名。",
      identityCardDeriving: "正在识别品牌身份…",
      identityCardLowConfidence:
        "AI 信心不足，建议先确认品牌名再安装。",
      identityCardSourceAi: "AI 自动识别",
      identityCardSourceFallback: "域名兜底",
      identityCardSourceUserEdit: "手动设置",
      identityCardEdit: "编辑",
      identityCardSave: "保存",
      identityCardCancel: "取消",
      identityCardBrandLabel: "品牌名",
      identityCardAuthorLabel: "默认作者署名",
      identityCardLogoLabel: "Logo URL",
      identityCardUrlLabel: "站点 URL",
      identityCardTranslationsCount: "已为 {n} 个语种翻译",
      identityCardNoTranslations: "下次扫描时将为非默认语种翻译品牌身份。",
      identityPartialTranslate:
        "{n} 个语种的品牌身份未翻译成功，安装时将使用源语言品牌名。",
      proposalsTitle: "提议的 Schema",
      proposalsCount: "已启用 {enabled} / {total}",
      proposalConfidence: "置信度 {n}%",
      proposalLowConfidence: "置信度偏低，请人工复核。",
      proposalAiError: "AI 未能分析该页面，已默认禁用。可手动启用或复核。",
      proposalReviewBadge: "建议审查",
      translationWarning: "{n} 个格子需要重译。",
      translationHealthTitle: "翻译质量",
      translationHealthBody:
        "{n} 个（页面 × 语言）仍未译好。请用底部按钮，换相同或更强模型重译。",
      translationHealthAutoRetryNote:
        "每个格子在翻译过程中已自动重试 1 次（强化 prompt）；此处是连续两次都未通过的格子。",
      translationHealthFooterHint:
        "点击下方条目可跳转到对应页面的预览；也可用「下一项问题」逐项查看。确认后再用底部或卡片上的「重译」。",
      translationHealthIssueListTitle: "问题列表",
      translationHealthLocaleSummary: "按语言汇总",
      nextIssue: "下一项问题 ({current}/{total})",
      footerRetryHint:
        "全量重新安装所有块。建议先点「重译」只处理漏译格子。",
      footerRetryLabel: "重译 {n} 格",
      footerReinstallShort: "重新安装",
      footerInstallShort: "安装",
      footerUpdateInstallShort: "更新安装",
      footerInstallTitle:
        "{n} 块 · {proposals} 页 × {locales} 种语言",
      footerReinstallTitle:
        "{n} 块 · {proposals} 页 × {locales} 种语言。{hint}",
      installSuccessWithUntranslated:
        "仍有 {n} 个格子需要翻译——请在下方或通知里点「重译」。",
      installToastRetry: "重译 {n} 个格子",
      installUndoInPanel: "撤销安装",
      cardUntranslated: "需重译：{locales}",
      cardRetry: "重译 ({n})",
      cardRetrying: "翻译中…",
      cardRetryHint: "只重译本页未译好的语言并重新安装。",
      retryFailed: "重译 {n} 个漏译格子",
      retryFailedBusy: "重译中…",
      retryAllOk: "{n} 个全部翻译成功，已重装。",
      retryPartial: "恢复 {recovered} 个，仍有 {remaining} 个未译。",
      previewToggle: "预览 JSON-LD",
      previewToggleTranslated: "按语言预览译文",
      previewLocaleTabs: "语言预览",
      untranslatedReasonPillMixedScript: "字符脚本不对",
      untranslatedReasonPillNoContentChange: "疑似未翻译",
      untranslatedReasonPillAiError: "AI 返回错误",
      untranslatedReasonHintMixedScript:
        "标题或描述里仍有不符合目标语言的文字——例如描述仍是英文、日文里夹了简体字，或留下未译的英文词（如 design、launch）。请重译或手动改下面字段。",
      untranslatedReasonHintNoContentChange:
        "标题和描述与默认语言完全一致——AI 原样返回英文，但 inLanguage 标成了该语言。请换更强模型重译，或在 Framer 里手改。",
      untranslatedReasonHintAiError:
        "AI 返回的内容无法解析（缺字段或 JSON 无效）。请重译或手动填写字段。",
      enableAll: "全部启用",
      disableAll: "全部禁用",
      filterSearchPlaceholder: "按 URL 或页面名搜索…",
      filterNoMatch: "没有匹配的提议。",
      filter: {
        all: "全部",
        new: "新增",
        changed: "改动",
        disabled: "已禁用",
        needsRetranslate: "需重译",
      },
      badgeNew: "新增",
      badgeChanged: "已变更",
      badgeInstalled: "已安装",
      installAllButton:
        "安装 {n} 块（{proposals} 页 × {locales} 种语言）",
      reinstallButton:
        "重新安装 {n} 块（{proposals} 页 × {locales} 种语言）",
      reinstallButtonHint:
        "自上次安装以来没有内容变化。点击仍可强制重写 Custom Code 中的 schema。",
      updateInstallButton: "更新安装（{summary}）",
      updateInstallButtonHint: "按变更重新安装：{summary}。",
      diffFragmentAdded: "{n} 新增",
      diffFragmentChanged: "{n} 变更",
      diffFragmentRemoved: "{n} 删除",
      installSuccess:
        "已安装 {blocks} 块 JSON-LD，覆盖 {pages} 个页面。",
      installSuccessWithPreserved:
        "已安装 {blocks} 块 JSON-LD。原有 Custom Code 中的 {bytes} 字节已保留。",
      installFailed: "安装失败：{error}",
      installUndo: "撤销",
      installUndoDone: "已恢复到安装前的 Custom Code。",
      installUndoFailed: "撤销失败：{error}",
      editorOpen: "编辑字段",
      editorHelper:
        "微调这条 {kind} schema。保存后下次安装生效。如果要换成别的 schema 类型，请切到手动模式。",
      editorReset: "恢复 AI 建议",
      editorEdited: "已编辑",
      editorAddRow: "添加问题",
      editorRemoveRow: "删除",
      manualLink: "或使用手动模式",
      timeJustNow: "刚刚",
      timeMinutesAgo: "{n} 分钟前",
      timeHoursAgo: "{n} 小时前",
      timeDaysAgo: "{n} 天前",
    },
    manual: {
      title: "Schema · 手动模式",
      backToAudit: "返回 AI 审查",
      helper: "手动构造单个 Schema。适合 AI 没识别到的特殊页面类型。",
    },
    schemaTypeTitle: "Schema 类型",
    sourceContentTitle: "源内容（默认语言）",
    localesTitle: "目标语言",
    localesClear: "清空（{n}）",
    localesSelectAll: "全选（{n}）",
    localesPartial: "已选 {n} / {total}",
    previewTitle: "预览",
    previewMultilingualHelper:
      "Schema 工具只把源文本复制到各语言——仅 inLanguage 和 @id 不同。要把文案真正译成各语言，安装前请先用 Meta 文案生成工具。",
    previewEmpty: "请在上方至少选一种语言。",
    installButton: "安装 {n} 个 block",
    installButtonPlural: "安装 {n} 个 block",
    installSuccess: "已向 Custom Code 注入 {n} 个 schema block。",
    installSuccessWithPreserved:
      "已注入 {n} 个 schema block。原 Custom Code 中 {bytes} 字节用户代码完整保留。",
    installFailed: "安装失败：{error}",
    selectLocaleWarning: "请至少选一种语言。",
    kinds: {
      Article: "Article",
      ArticleHelper: "博客、新闻、长文。冲击 AI Overviews 引用最有效。",
      Product: "Product",
      ProductHelper: "电商商品，含价格、品牌、评分。",
      LocalBusiness: "Local Business",
      LocalBusinessHelper:
        "门店、餐厅、机构。会出现在 Google Maps 和本地 AI 回答里。",
      FAQPage: "FAQ Page",
      FAQPageHelper: "AEO 杠杆最高的类型 —— ChatGPT、Perplexity 直接引用。",
      Organization: "Organization",
      OrganizationHelper:
        "品牌身份。在站点根级别加一次就够了，全局生效。",
    },
    fields: {
      canonicalUrl: "Canonical URL",
      headline: "标题",
      description: "描述",
      image: "图片 URL",
      author: "作者",
      publisher: "发布方",
      datePublished: "发布日期",
      name: "名称",
      brand: "品牌",
      sku: "SKU",
      price: "价格",
      currency: "币种",
      businessName: "门店名称",
      telephone: "电话",
      streetAddress: "街道地址",
      city: "城市",
      countryIso: "国家（ISO 代码）",
      question: "问题 {n}",
      answer: "答案",
      addQuestion: "+ 添加问题",
      removeQuestion: "删除该问题",
      siteUrl: "网站 URL",
      logoUrl: "Logo URL",
      sameAs: "社交账号（用逗号分隔）",
    },
  },

  llms: {
    title: "多语言 llms.txt",
    siteInfoTitle: "网站信息",
    siteName: "网站名称",
    siteNamePlaceholder: "Acme Studio",
    siteSummary: "一句话简介",
    siteSummaryPlaceholder: "Acme 是一家面向设计师的全球产品工作室。",
    baseUrl: "网站根 URL",
    baseUrlPlaceholder: "https://acme.com",
    localizedPathsLabel: "为非默认语言加路径前缀（Framer 默认）",
    longDescription: "长描述",
    longDescriptionOptional: "（可选）",
    longDescriptionHelper:
      "一个短段落 + 一组要点列表。出现在「> 一句话简介」和第一个「##」小标题之间，结构参考 Framer 自己的 llms.txt。",
    longDescriptionPlaceholder:
      "在这里写一段简短的开场介绍。\n\n核心能力：\n- 要点 1\n- 要点 2\n- 要点 3",
    longSuggestHint:
      "让 AI 基于你的站点名、简介和已扫描的页面，生成一段 Framer 风格的长描述。",
    longSuggestPanelHelperGenerate:
      "可以告诉 AI 要侧重什么（受众、核心能力、差异化点）。站点名和扫描到的页面会作为事实依据。",
    longSuggestPanelHelperOptimize:
      "可以告诉 AI 要强调什么。我们会保留你的原意和要点，只是把措辞收紧、补足成 AEO 友好的密度。",
    longSuggestKeywordsPlaceholder:
      "例如：侧重技术能力、受众是 product-led 创业公司…",
    suggestAppliedLong: "长描述已更新。",
    aiPanelHeader: "AI 助手 · {field}",
    aiPanelKeywordsLabel: "想让 AI 侧重什么？（可选）",
    cmsSourceTitle: "CMS 数据源（可选）",
    collectionLabel: "Collection",
    collectionNone: "— 不使用（仅写入站点简介） —",
    collectionLoading: "加载中…",
    collectionRefresh: "刷新",
    collectionEmptyHelper:
      "当前 Framer 项目里没有 CMS Collection。去 Framer 左侧 CMS 面板新建（如「博客文章」「商品」），再点刷新。不用 Collection 也行——每种语言会生成一份只含站点简介的 llms.txt。",
    collectionMultiHelper:
      "勾选要作为小节的 Collection。每勾一个，就在文件里多一个「## 名称」小节，顺序按勾选顺序来。",
    collectionItemCount: "{n} 条",
    collectionFieldsAuto: "字段：{title} / {summary}",
    collectionFieldsAutoTitleOnly: "字段：{title}（无摘要）",
    collectionFieldsOverride: "字段：{title} / {summary}（自定义）",
    collectionFieldsOverrideTitleOnly: "字段：{title}（自定义，无摘要）",
    collectionFieldsMissing: "未识别到标题字段，请手动选择。",
    collectionFieldsCustomize: "自定义字段",
    collectionFieldsCustomizeOpen: "正在自定义字段",
    collectionFieldsResetAuto: "恢复自动识别",
    titleField: "标题字段",
    summaryField: "摘要字段",
    skippedDefaultHelperGeneric:
      "读不到这些行的标题字段。可以在该 Collection 的「自定义字段」里改个字段名，或在 Framer CMS 里把这些行的标题补上。",
    duplicateTitlesPill: "{n} 个标题重复",
    duplicateTitlesHelper:
      "多条 CMS 数据共用了同一个标题。AI 引擎会按标签去重，把其中一条悄悄丢弃 —— 建议回 Framer CMS 给每条记录起个独一无二的 Title。",
    duplicateTitlesSharedBy: "{n} 条共用",
    duplicateTitlesSlugsLabel: "涉及路径：",
    pagesSourceTitle: "站点页面",
    pagesSourceHelper:
      "添加一个「## Pages」小节，列出你的静态页面（关于、服务、联系等）。点「扫描」让插件读取项目里的页面。",
    pagesSectionTitle: "Pages",
    pagesScan: "扫描页面",
    pagesRescan: "重新扫描",
    pagesScanBusy: "扫描中…",
    pagesScanNeedsBaseUrl: "请先填站点根 URL。",
    pagesScanSuccess: "找到 {n} 个静态页面。",
    pagesScanFailed: "扫描失败：{error}",
    pagesScanPartialPill: "部分扫描",
    pagesScanPartialHelper:
      "有几个页面读不到——一般是锁定的或者还没填好的模板。剩下的列表是好的。",
    pagesNotScannedYet:
      "点「扫描」加载项目的静态页面。我们默认跳过 CMS 模板和首页——列表出来后再勾你要加的页面。",
    pagesEmpty:
      "没有找到静态页面。（绑定 CMS Collection 的页面通过上面的 CMS 数据源添加。）",
    pagesHomepageBadge: "首页",
    aiTranslatingPages: "正在翻译 {locale} 的 {n} 个页面…",
    aiTranslatingLongDescription: "正在翻译 {locale} 的长描述…",
    longDescriptionFlagPill: "长描述未本地化",
    longDescriptionFlagHintMixedScript:
      "AI 翻译的长描述混入了错误字符，已保留默认语言版本。可换更强模型再试。",
    longDescriptionFlagHintUntranslated:
      "AI 未能完整翻译长描述，已保留默认语言版本。可换更强模型，或手动为该语言撰写。",
    generatedTitle: "已生成文件",
    generateButton: "生成 {n} 个文件",
    generateButtonPlural: "生成 {n} 个文件",
    uploadHelper:
      "把文件上传到 Hosting 层对应路径（比如 {default}、{localized}）。",
    deployTitle: "如何部署到 Framer 站点",
    deployPlanBadge: "需 Framer Pro+",
    deployStepDownload:
      "上面每个文件点「下载」拿到本地（或「复制」直接粘贴到别处）。",
    deployStepFramer:
      "打开 Framer Dashboard → 左侧栏 Domains → 选你的域名 → Files 标签，把每个文件上传到根路径。",
    deployStepFramerLink: "查看 Framer 官方教程 →",
    deployStepPublish:
      "重新 Publish 站点。文件会在 /llms.txt、/llms-zh-cn.txt 等路径开始服务。",
    deployOtherHosting:
      "Static Files 是 Framer Pro+ 计划独享。Basic / Free 用户要部署 llms.txt，需自己搭代理（比如 Cloudflare Workers 套在你的自定义域名前），把文件放到 {default}、{localized} 路径。",
    setSiteFirst: "先填网站名称和根 URL。",
    generationFailed: "生成失败：{error}",
    configSaveFailed: "草稿保存失败，请重试后再离开。",
    copySuccess: "已复制。",
    generateSuccess: "已生成 {n} 个文件。",
    skippedLocalizedPill: "跳过 {n} 个条目",
    skippedLocalizedHelper:
      "{locale} 中没有翻译标题的条目已被跳过——请在 Framer 的 CMS 里补上译文，然后重新生成。",
    skippedDefaultPill: "{n} 行没有标题",
    skippedDefaultHelper:
      "读不到字段「{field}」。请检查标题字段名是否和 CMS 里的真实字段一致。",
    aiTranslateTitle: "AI 自动翻译（可选）",
    aiTranslateToggle: "用 AI 翻译缺失的条目",
    aiTranslateHelper:
      "某种语言未填本地化标题时，可用所选 AI 模型代为翻译。译文只写入生成的 llms.txt，**不会写回** CMS。",
    aiProviderKeyMissing: "请在设置里为 {provider} 添加 API key 才能启用自动翻译。",
    aiTranslatingProgress: "正在翻译 {locale} 的 {n} 个条目…",
    aiTranslatingHeader: "正在翻译 {locale} 的站点描述…",
    headerFlagPill: "站点描述未本地化",
    headerFlagHintMixedScript:
      "AI 翻译的描述里夹了错误的脚本（比如日文文件里出现中文），所以保留了你原版的描述。文件头会写「Language: ja」但描述还是原语言——可以换更强的模型，或者把源描述改成更通用的措辞。",
    headerFlagHintUntranslated:
      "AI 未能完整翻译站点描述，已保留原文。文件头语言可能与正文不符——可换更强模型，或为各语言手写描述。",
    aiCostEstimate: "预估 AI 成本上限：~${cost}（按每个 CMS 条目都要翻译估）。",
    aiFailedPill: "{n} 个条目 AI 翻译失败",
    aiFailedHelper:
      "AI 返回的内容没通过质量检查。可点击上方「重试」按钮用我们强化过的 prompt 再跑一次；也可以换个更强的模型，或者手动翻译这些条目。",
    aiFailedReasonMixedScript: "字符脚本不对",
    aiFailedReasonUntranslated: "疑似未翻译",
    aiFailedReasonParseFailed: "AI 响应解析失败",
    regenerateLocale: "重试",
    regenerateLocaleBusy: "重新生成中…",
    regenerateLocaleHint:
      "仅对 {locale} 重跑 AI 翻译。失败条目会再试一次，其他语言不受影响。",
    regenerateLocaleSuccess: "{locale} 已重新生成，全部检查通过。",
    regenerateLocaleStillFailed:
      "{locale} 已重新生成，但仍有条目没通过质量检查，建议换更强的模型。",
    regenerateLocaleNotFound: "找不到该语言，请改用「生成全部」。",
    downloadAll: "打包下载（{n} 个文件）",
    downloadAllHint:
      "把所有生成的 llms.txt 打成一个 ZIP——直接拖到 Framer 的 Files 面板就能一次上传。",
    downloadAllSuccess: "已下载 {n} 个文件的 ZIP 包。",
    deployStepOpenProject: "打开 Framer Dashboard →",
    suggestGenerate: "✨ AI 一键生成",
    suggestOptimize: "✨ AI 一键优化",
    suggestHint:
      "让 AI 帮你写一句更紧凑、更适合 AEO 的站点描述。除非你点「使用」，否则不会覆盖现有内容。",
    suggestPanelHelperGenerate:
      "可以告诉 AI 要侧重什么（目标用户、品类、核心价值）。也可以留空——品牌名就够它发挥了。",
    suggestPanelHelperOptimize:
      "可以告诉 AI 要强调什么。我们会保留原意，只是把措辞收紧。",
    suggestKeywordsPlaceholder:
      "例如：面向独立产品的品牌设计工作室、4 年作品...",
    suggestGenerateAction: "生成建议",
    suggestOptimizeAction: "优化我的草稿",
    suggestRetry: "再来一次",
    suggestUse: "使用",
    suggestBusy: "AI 思考中…",
    suggestApplied: "站点描述已更新。",
    suggestResultTitle: "AI 建议",
    suggestLowQualityPill: "置信度低",
    suggestLowQualityHint:
      "输出未通过质检（默认语言字符不对，或与草稿几乎相同）。仍可使用，但建议换更强模型再试。",
    suggestFailed: "AI 建议失败：{error}",
    suggestNoDefaultLocale: "未找到默认语言，请先在 Framer 项目中至少添加一种语言。",
    suggestNeedsSiteName: "请先填站点名——AI 拿这个作为主要信号。",
    suggestModelHint:
      "提示：写一句话简介，用普通的快模型就够了（Claude Haiku、GPT-4o-mini、DeepSeek-V3、GLM-4-Plus 都行）。Thinking 模型会先在内部思考、占用大量 token，可能还没写出答案就被截断。",
    stepNavLabel: "llms.txt 步骤",
    step: {
      setup: "站点信息",
      sources: "内容来源",
      review: "生成结果",
      deploy: "部署",
    },
    stepNext: "下一步",
    stepBack: "上一步",
    stepGenerate: "生成 {n} 个文件",
    goToDeploy: "下一步：部署",
    backToReview: "返回结果",
    reviewFileCount: "{n} 个文件",
    reviewLocaleNeedsAttention: "{locale} 需关注（{n} 条 CMS）",
    reviewLocaleTabs: "生成文件语言",
    reviewEmpty: "生成文件后可在此查看结果。",
    reviewNoIssues: "该语言无问题。",
    issuesTitle: "问题",
    previewTitle: "预览",
    configChangedHint: "配置已改，建议重新生成以更新文件。",
    regenerateAll: "重新生成全部",
    setupOptionalTitle: "可选",
    setupAiEnabled: "已开启",
    stepProgress: "{current}/{total} · {label}",
    sourcesTitle: "内容来源",
    cmsFoldSummary: "CMS · 已选 {n} 个",
    pagesFoldSummary: "页面 · 已选 {n} 个",
    showMoreCollections: "+ 还有 {n} 个 Collection",
  },

  meta: {
    title: "Meta 文案生成",
    sourceTitle: "源页面",
    pageFlowIntro: "先从项目加载页面并选中一页，确认内容后再进入生成。",
    pageFlowTitle: "页面设置步骤",
    pageFlowLoad: "从项目加载页面",
    pageFlowLoadDone: "页面已加载",
    pageFlowLoadHint: "读取 Framer 静态页面列表，无需手抄 URL。",
    pageFlowSelect: "选择要优化的页面",
    pageFlowSelectDone: "已选：{title}",
    pageFlowSelectHint: "选中后会把页面文字填入「页面上下文」。",
    pageFlowSelectPlaceholder: "请选择页面…",
    pageFlowManual: "不加载，手动填写",
    pageFlowManualDone: "手动填写",
    pageFlowBackToPick: "改从项目选择页面",
    pageFlowRescan: "重新加载列表",
    pageFlowContent: "确认页面信息",
    pageFlowContentHint: "可编辑摘要。填好「页面上下文」后，才能用 ✨ AI 补全。",
    pageFlowSelectedPage: "当前页面：{title}（{path}）",
    pageContentLoading: "正在读取页面…",
    stepNextNeedLoad: "请先加载项目页面。",
    stepNextNeedSelect: "请选择页面，或改用手动填写。",
    stepNextNeedContext: "请填写页面上下文后再继续。",
    generateNeedKey:
      "请在设置中为 {provider} 添加 API Key，或改用已配置 Key 的提供商。",
    stepNavLabel: "Meta 流程步骤",
    step: {
      page: "页面",
      generate: "生成",
      review: "复制到 Framer",
    },
    stepNext: "下一步",
    stepBack: "上一步",
    stepProgress: "{current}/{total} · {label}",
    reviewIntro:
      "下方是按语言生成的标题、描述与社交标签。Framer 暂不允许插件写入，请按语言粘贴到对应页面的设置里。",
    reviewDone: "完成",
    sessionRestored: "已恢复上次生成的 Meta，可继续复制到 Framer。",
    applyNotSeoTab: "没有「SEO」菜单；也没有 Page settings 子菜单",
    applySiteVsPage:
      "你截图里 F → Site settings 只有 General、Custom Code 等，那是整站设置。单页 Meta 要从画布左侧 Pages 列表进（见下一步）。General 里的 Title/Description 是整站默认，不能代替各语言各页的文案。",
    applyPageFallback: "目标页面",
    applyStepOpenPagePanel:
      "打开页面「{page}」的设置面板（顶部是 Title、Page Description）。",
    applyStepOpenPagePanelHow:
      "先关掉或缩小本插件。左侧点 Pages 图标 → 在列表里悬停「Home」（或你的页面名）→ 点 ⋯ → Settings。弹出面板最上方就是 Title 与 Page Description。",
    applyStepFieldMapping:
      "插件 Title → Framer 的 Title；Meta description → Page Description。OG/Twitter 贴在同页的社交预览区域。",
    applyStepFramerMetaDocs: "Framer 官方：页面标题与描述 →",
    setupOptionalTitle: "可选",
    pickPage: "页面",
    pickPageManual: "仅手动填写上下文",
    scanPages: "从项目加载页面",
    scanningPages: "正在扫描页面…",
    pagesScanPartial: "部分页面无法读取，列表可能不完整。",
    noStaticPages: "未找到静态页面，请手动粘贴上下文。",
    pageLoadFailed: "无法读取页面内容，请手动编辑上下文。",
    homepageBadge: "首页",
    suggestPageTypeHint: "根据上下文建议页面类型",
    pageTypeHelper:
      "可留空后点 ✨ 推断，或手动填写（如 Landing page）。生成 Meta 时会用到。",
    pageTypeHomeHint:
      "首页通常是 Landing page。可点 ✨ 根据页面上下文推断，或手动改成其他类型。",
    suggestHint: "根据页面上下文用 AI 填充此字段",
    suggestHintInfer: "根据页面上下文推断",
    suggestHintImprove: "在现有内容基础上优化",
    suggestAction: "AI",
    suggestActionInfer: "推断",
    suggestActionImprove: "优化",
    suggestSameBadge: "与当前一致",
    suggestSameAsCurrent:
      "AI 认为当前填写已合适（{value}），无需替换，可直接进入下一步。",
    suggestSameDismiss: "知道了",
    suggestSameApplied: "已是当前值，无需修改。",
    suggestRetryFresh: "重新推断",
    suggestChangeFrom: "建议修改：{from} → {to}",
    suggestNewValue: "建议填写：",
    suggestBusy: "AI 生成中…",
    suggestUse: "使用",
    suggestRetry: "重试",
    suggestNeedsContext: "请先填写页面上下文，AI 需要可读内容。",
    suggestNoDefaultLocale: "未找到默认 locale，请在 Framer 中至少添加一种语言。",
    suggestFailed: "AI 建议失败：{error}",
    suggestApplied: "已更新字段。",
    pageType: "页面类型",
    pageTypePlaceholder: "Landing 页、博客文章、商品页…",
    pageContext: "页面上下文",
    pageContextPlaceholder:
      "标题 + 1-2 段简介：这页面做什么，给谁看，为什么重要。",
    primaryKeyword: "主关键词（可选）",
    primaryKeywordPlaceholder: "multilingual SEO plugin",
    brandVoice: "品牌语调（可选）",
    brandVoicePlaceholder: "自信、技术、简洁",
    providerTitle: "AI 提供方",
    modelTitle: "模型",
    providerClaude: "Claude",
    providerOpenAi: "GPT-4o-mini",
    providerKeyMissing: "请先在设置里配置 {provider} 的 API Key。",
    estimatedCost: "预估费用",
    generateReady: "准备为 {n} 种语言生成 Meta。",
    resultsTitle: "结果",
    reviewLocaleCount: "{n} 种语言",
    reviewLocalesNeedAttention: "{locales} 需关注",
    reviewLocaleTabs: "已生成 Meta 的语言",
    reviewEmpty: "生成后在此查看结果。",
    fieldGroupSearch: "搜索",
    fieldGroupSocial: "Open Graph 与 Twitter",
    copyAll: "复制全部字段",
    copyAllSuccess: "已复制该语言的全部字段。",
    copyAllFailed: "复制失败，请手动选择复制。",
    lengthSoftPill: "偏长（{max}）",
    lengthSoftHint: "Google 常在约 {max} 字符处截断，可考虑缩短。",
    addContextWarning: "先把页面上下文填上。",
    setKeyWarning: "请先在设置里添加 API Key。",
    generateButton: "为 {n} 种语言生成",
    generateButtonPlural: "为 {n} 种语言生成",
    generatingProgress: "生成中… {current} / {total}",
    generateCancelled: "已取消生成。",
    generatedSuccess: "已为 {n} 种语言生成 Meta。",
    generatedSuccessWithIssues:
      "已为 {n} 种语言生成 Meta，其中 {issues} 种可能需要重试。",
    regenerate: "重新生成",
    regenerateAll: "全部重新生成",
    regenerateOne: "仅重新生成此语言",
    regenerating: "重新生成中…",
    configChangedHint: "页面上下文已变更，请重新生成以更新结果。",
    applyTitle: "在 Framer 中应用",
    applyStepLocale: "在 Framer 顶部栏切换到目标语言（地球/语言切换）。",
    applyStepLocaleLink: "Framer 本地化指南",
    applyStepPage: "打开该页的页面设置（Title + Page Description）。",
    applyStepPageWithPath: "打开 {path} 的页面设置（Title + Page Description）。",
    applyStepCopyBelow: "在下方选择语言标签，逐字段复制（或点「复制全部」）。",
    applyStepRepeatLocales: "每种语言重复一遍，确认后发布站点。",
    applyStepPublish: "各语言确认无误后发布站点。",
    applyStepOpenProject: "打开 Framer 项目",
    applyHelper:
      "Framer 暂不允许插件写入页面 SEO，请按语言将内容粘贴到页面设置。",
    fields: {
      title: "Title",
      metaDescription: "Meta description",
      ogTitle: "OG title",
      ogDescription: "OG description",
      twitterTitle: "Twitter title",
      twitterDescription: "Twitter description",
    },
    qualityIssuePill: "⚠ {n} 个问题",
    qualityIssueHint: "检测到疑似翻译问题。点击重新生成可以重试，也可以手动编辑下方字段。",
    qualityUntranslatedPill: "疑似未翻译",
    qualityUntranslatedHelper:
      "Meta 描述与原文一致——AI 可能没有真正翻译。可以重新生成，或切换到能力更强的模型。",
    qualityParseFailedPill: "解析失败",
    qualityParseFailedHelper:
      "AI 返回的不是有效的 meta JSON。请重新生成或更换模型。",
    qualityMixedScriptPill: "字符脚本不对",
    qualityMixedScriptHint:
      "该字段字符与目标语言不符（例如日文页出现纯英文）。通常是翻译失败。",
  },

  settings: {
    title: "设置",
    apiKeysTitle: "AI 提供方（BYOK）",
    apiKeysHelper:
      "Polyglot AEO 看不到任何 Key。每个提供方的 Key 仅保存在当前 Framer 项目的插件数据里，生成时直接从浏览器发到对应提供方，按提供方原价计费。",
    providerKeyPlaceholder: "{provider} 的 API Key",
    providerGetKey: "获取 Key",
    providersShowMore: "显示其他 {n} 个提供方",
    providersHide: "收起其他提供方",
    testKey: "测试",
    testing: "测试中…",
    testKeyOk: "已连通",
    testKeyFail: "失败",
    testKeyEmpty: "先填入 key",
    addCustomProvider: "+ 添加自定义提供方",
    customProviderTitle: "自定义 OpenAI 兼容提供方",
    customProviderHelper:
      "支持任何 OpenAI 兼容端点 —— Together、Groq、Ollama、LiteLLM、vLLM、企业内部网关等。Polyglot AEO 发标准的 /chat/completions 请求。",
    customProviderName: "显示名称",
    customProviderNamePlaceholder: "我的私有 LLM",
    customProviderBaseUrl: "Base URL",
    customProviderBaseUrlPlaceholder:
      "https://api.example.com/v1（/chat/completions 的前缀路径）",
    customProviderModelIds: "模型 ID（逗号分隔）",
    customProviderModelIdsPlaceholder: "llama-3.3-70b, mixtral-8x22b",
    customProviderSave: "保存提供方",
    customProviderRemove: "移除",
    customProviderSaved: "自定义提供方已保存。",
    customProviderRemoved: "自定义提供方已移除。",
    customProviderInvalid: "请填写显示名称、Base URL 和至少一个模型 ID。",
    customProviderRemoveConfirm:
      "移除这个自定义提供方？关联的 API Key 也会一并清除，无法撤销。",
    customProviderDiscardConfirm:
      "放弃这个自定义提供方草稿？API Key 和品牌语调的修改已自动保存。",
    customProviderDiscard: "放弃草稿",
    anthropicKey: "Anthropic API Key",
    openaiKey: "OpenAI API Key",
    brandVoiceTitle: "品牌语调",
    brandVoiceHelper: "对所有语言生效。可选，但建议填写。",
    brandVoicePlaceholder:
      "自信、技术、简洁。用 'you' 而非 'your business'。避开 'unleash'、'leverage'、'synergy' 这类空话。",
    languageTitle: "插件语言",
    languageHelper: "插件界面显示语言，与站点内容语言无关。",
    languageAuto: "自动（{detected}）",
    quickStartResetTitle: "快速开始",
    quickStartResetHelper: "在 Dashboard 重新显示新手引导清单。",
    quickStartResetButton: "显示快速开始",
    quickStartResetDone: "快速开始已重新开启。",
    installedTitle: "已安装的 Schema",
    installedYes: "已安装",
    installedNo: "未安装",
    removeAll: "全部移除",
    removeAllHelper:
      "只移除 Polyglot AEO 自己注入的内容。手动添加的或其他插件的 Custom Code 不会动。",
    saveSuccess: "设置已保存。",
    autoSaveLoading: "读取中…",
    autoSaveUnsaved: "自动保存中…",
    autoSaveSaving: "保存中…",
    autoSaveSaved: "已保存",
    autoSaveError: "设置保存失败。",
    removeSuccess: "已从 Custom Code 移除 schema。",
    removeSuccessWithPreserved: "已移除 schema。{bytes} 字节用户代码完整保留。",
  },

  license: {
    proBadge: "Pro",
    settingsTitle: "Polyglot AEO Pro",
    settingsHelper:
      "在此 Framer 项目中激活 Creem 许可证。Pro 每个站点 1 次激活。",
    billingModeLabel: "结账与许可证环境",
    productionMode: "正式",
    testMode: "测试",
    productionModeHelper: "真实付款与正式许可证，上架版本请用此项。",
    testModeHelper: "沙盒付款与测试许可证，可完整走通流程，不会真实扣款。",
    keyLabel: "许可证密钥",
    keyPlaceholder: "pa_live_…",
    activate: "激活",
    activating: "激活中…",
    activateSuccess: "已为此项目激活 Pro。",
    activateFailed: "无法激活，请检查密钥后重试。",
    getPro: "购买 Pro",
    comparePlans: "对比 Free 与 Pro",
    activeKey: "已激活：{hint}",
    refresh: "重新验证",
    validating: "验证中…",
    deactivate: "移除许可证",
    upgrade: {
      title: "升级到 Pro",
      generic:
        "解锁多语言 schema、Meta 文案、各语言 llms.txt 与无限安装。",
      multi_locale:
        "检测到多种语言。Pro 可为每种语言生成原生 schema、Meta 与 llms。",
      schema_install_limit:
        "免费版最多 AI 安装 5 个页面，Pro 不限。",
      schema_install_all: "一键启用或安装全站页面需 Pro。",
      schema_translate: "按语言翻译 schema 内容需 Pro。",
      llms_generate:
        "AI 生成 llms.txt 需 Pro；免费版仍可编辑并复制默认语言稿。",
      llms_multi_locale: "其他语言的 llms 文件（如 llms-ja.txt）需 Pro。",
      llms_ai_translate: "llms.txt 的 AI 翻译需 Pro。",
      meta_generate:
        "免费版默认语言可试生成 Meta 3 次；Pro 可批量生成全部语言。",
      schema_audit_persist: "Pro 可跨会话保留安装记录与变更对比。",
      remote_schema_rules: "Pro 随版本更新获得最新规则与模板。",
      generic_pro: "用 Pro 跑通完整的多语言 AEO 流程。",
      bulletLocales: "每种语言各一套 schema、Meta、llms，不是只改 inLanguage",
      bulletQuality: "上线前 AI 质检，降低翻译翻车风险",
      bulletAgency: "接一个客户站，$19/月 就回本",
      ctaLabel: "升级到 Pro",
      ctaPrice: "$19/月",
      pricingHint: "或 $190/年（约省 17%）。退款政策见 polyglotaeo.com。",
    },
    dashboardLocaleBanner:
      "本项目有 {count} 种语言。升级 Pro 可解锁各语言的 schema、Meta 与 llms。",
    dashboardLocaleFree: "免费版仅默认语言（{code}）。",
    freeInstallQuota: "免费版 AI Schema 已用 {used}/{max} 页",
  },

  shortcuts: {
    title: "快捷键",
    helper: "随时按 ? 再次打开本面板。",
    back: "返回上一级",
    submit: "执行主操作（生成 / 安装）",
    help: "显示此列表",
  },
}
