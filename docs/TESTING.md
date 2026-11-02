# Polyglot AEO — 测试指南

> 三层测试金字塔。先跑前两层（自动），再上手动。
>
> **总耗时**：自动层 < 1 分钟，手动层 ~12 分钟。

```
        ╱╲
       ╱  ╲   层 3：手动 UI 测试           ← ~10 分钟
      ╱    ╲  在 Framer 里点点看
     ╱──────╲
    ╱        ╲ 层 2：Live API 测试          ← ~30 秒，需 API key
   ╱          ╲ 验证每个 provider 协议正确
  ╱────────────╲
       ╱              ╲ 层 1：单元测试             ← ~2 秒，479 个用例
╱                ╲ 纯逻辑，无网络
──────────────────
```

**核心原则**：上一层全过了才进下一层。下层挂了，上层不用看。

---

## 层 1：单元测试（自动，~2 秒）

**什么时候跑**：每次 commit 前；或者改完代码立刻跑。

```bash
npm test
```

预期：

```
 Test Files  24 passed (24)
      Tests  479 passed (479)
```

覆盖什么：
- **Custom Code fence 安全**（27 个用例）— 最关键的"不丢用户代码"逻辑
- **Provider Registry**（30 个用例）— 9 个 provider 配置 + 自定义 provider 实例化 + 价格估算 + JSON 解析（含 `<think>` 块剥离）
- **Schema Proposal**（21 个用例）— AI JSON 归一化、kind 同义词识别、低置信度回退、Q&A 过滤、价格强转
- **Proposal edit helpers**（18 个用例）— Reset 深克隆 originalInputs、isEdited JSON 等值、FAQ 加 / 删 / 改保留邻行引用、删最后一题被拒
- **Translation quality**（14 个用例）— extractTranslatableText 跨 schema kind、looksUntranslated 双字段 byte-equal 检测、单字段 fallback、8 字符最小长度防误报、空内容真空通过
- **Route stack**（13 个用例）— push 去重 top、pop 空栈不崩、Dashboard→Schema→Settings→Back 落回 Schema 的回归路径
- **composeUrl**（10 个用例）— `:slug` / `[slug]` 双语法替换、多段 placeholder、`/blog/:slug` 不会被 `://` 误匹配
- **Initial provider auto-pick**（8 个用例）— 已配 Key 优先、preferred 失效时 fallback 到首个已配、零 Key 时尊重 stored choice
- **Snapshot diff**（8 个用例）— 增/改/删/未变 4 类分类、空快照初装、不需要重装的零差检测
- **Bulk install**（7 个用例）— enabled 过滤、locale URL 前缀化、翻译覆盖、覆盖时仍重写 canonicalUrl
- **Onboarding 进度**（8 个用例）— Quick Start 5 步状态机

**红 = 立刻停下修，不能 push**。

---

## 层 2：Live API 测试（半自动，~30 秒，需 API key）

**什么时候跑**：
- 改了任何 `src/lib/ai/providers/*.ts`
- 想验证某家 provider 的 endpoint / 协议没变（比如怀疑 MiniMax 改了 base URL）
- 准备发版前

每个 provider 独立，**没设环境变量的就跳过**，所以你只需要为你想验证的那家准备 key。

### 怎么跑

```bash
# 单家：MiniMax 国内
MINIMAX_CN_KEY=<redacted-minimax-key> npm run test:live

# 多家一起：导出 → 跑
export ANTHROPIC_KEY=<redacted-anthropic-key>
export DEEPSEEK_KEY=<redacted-deepseek-key>
export MINIMAX_CN_KEY=<redacted-minimax-key>
npm run test:live
```

**支持的环境变量**：

| Provider | 环境变量 | 申请地址 |
|---|---|---|
| Anthropic | `ANTHROPIC_KEY` | https://console.anthropic.com/ |
| OpenAI | `OPENAI_KEY` | https://platform.openai.com/api-keys |
| Google Gemini | `GEMINI_KEY` | https://aistudio.google.com/apikey |
| DeepSeek | `DEEPSEEK_KEY` | https://platform.deepseek.com/ |
| 智谱 GLM | `GLM_KEY` | https://open.bigmodel.cn/ |
| Moonshot Kimi | `MOONSHOT_KEY` | https://platform.moonshot.cn/ |
| 阿里 Qwen | `QWEN_KEY` | https://dashscope.console.aliyun.com/ |
| MiniMax (海外) | `MINIMAX_GLOBAL_KEY` | https://platform.minimax.io/ |
| MiniMax (国内) | `MINIMAX_CN_KEY` | https://platform.minimaxi.com/ |

预期输出：

```
✓ MiniMax 国内 — generates valid meta JSON via MiniMax-M2.7-highspeed  21540ms
- (其他 8 个 skipped)

Test Files  1 passed (1)
     Tests  1 passed | 8 skipped (9)
```

### Live 测试到底测了什么

每个 provider 跑同一个 prompt（一个东京咖啡店的日语 SEO meta 生成请求），断言：
1. ✅ HTTP 请求**成功**（auth 头、base URL、JSON body 全对）
2. ✅ 响应能解析成 `{title, metaDescription, ...}` JSON 结构
3. ✅ token usage（如果 provider 报告）成本估算 **< $1**（防止价格表写错放飞）

**没测**：
- ❌ 文案质量（这是人工评估的事）
- ❌ 速度（thinking 模型本来就慢）
- ❌ CORS（见下文）

### ⚠️ Live 测试的局限：CORS 没覆盖

Live 测试在 **Node.js** 里跑，不存在 CORS。但插件实际跑在 **浏览器 iframe** 里，每个 provider 必须返回 `Access-Control-Allow-Origin` 头才能直接调。

**目前确定支持浏览器直调的**：
- Anthropic（必须加 `anthropic-dangerous-direct-browser-access: true`，已加）
- OpenAI

**可能受 CORS 限制的（需要手动在 Framer 里测）**：
- DeepSeek、GLM、Moonshot、Qwen、MiniMax — 中国 AI provider 历来对浏览器直调态度不一

如果用户报告"在 Node 测试通过但 Framer 里点 Generate 失败 / Network 报错"，**99% 是 CORS**。解决方案见 P0 列表。

### 安全规范（重要）

- ❌ **永远不要**把 API key 写进 `.env`、commit、贴 Slack/邮件
- ✅ 临时 export 到 shell session，关 terminal 自动失效
- ✅ 测试完立刻去 console **revoke 并 rotate** 用过的 key（哪怕是测试 key）
- ✅ Live 测试不会把 key 写进任何文件、不会出现在 dist/ 里、不会在 toast / console.log 里 leak

---

## 层 3：手动 UI 测试（人工，~10 分钟）

**什么时候跑**：层 1 + 层 2 都绿之后；准备发版 / 给客户演示前。

### 准备环境（3 分钟）

你需要：
- macOS 或 Windows，Chrome / Safari / Edge 任一
- 一个 Framer 项目（免费账号即可）
- **建议**：项目里至少配好 2 个 locale（英 + 任意一个非英语言），否则插件价值看不到

装插件：
1. 打开开发者发给你的 Framer 项目链接
2. 顶栏 `Plugins` → 应该已经看到 `Polyglot AEO`
3. 点开 → 弹出右上角小窗（约 320×540px）→ 看到 Dashboard

> 开发版（`npm run dev`）地址是 `https://localhost:5173`，第一次访问浏览器会要求信任本地 HTTPS 证书。

可选但强烈建议：准备**任意一个 provider 的 API key**（用于测 AI Meta 工具）。Claude / GPT / DeepSeek 都行，没有也能跳过这部分测试。

### 3.1 Dashboard + Quick Start

- [ ] 打开插件，看到 `Polyglot AEO` 标题 + 副标题
- [ ] 看到 **Quick Start** 折叠面板，进度条和 `X / 5` 数字
- [ ] 看到 `Project locales` 卡片，列出当前 Framer 项目的所有 locale
- [ ] 默认 locale 旁有蓝色 `DEFAULT` 徽标
- [ ] 点 Quick Start 头部能折叠/展开
- [ ] Quick Start 里 5 个步骤的 action 按钮都能点（点 schema → 进 schema 工具，点 settings → 进 settings 等）
- [ ] **点 Dashboard 任意 tool 卡 → 进入对应工具 → 按 ESC → 回 Dashboard**（键盘导航）

### 3.2 Schema 工具 — AI 审查（默认路径）

- [ ] 点 `Per-locale schema` → 默认进入 **AI 审查** 视图（`Schema · AI Audit`）
- [ ] 看到 hero 卡片：标题 + 一段说明
- [ ] **AI provider** 区域显示当前选中的 provider + model 下拉
- [ ] **「把内容翻译进每一种 locale」** 复选框默认勾选
- [ ] 没有 API key 时底部 `Scan site` 按钮 disabled，上方有黄色 `No API key` pill 提示
- [ ] 进 Settings 添加任意 provider key → 回 Schema → 按钮可点
- [ ] 点 `Scan site` → 看到 `Scanning your site…` 提示
- [ ] 进入 AI 调用阶段 → 进度条显示 `X / N`，每条进度提示当前页面 label
- [ ] 完成后底部弹出 toast `Scanned N pages.`，下方出现 **Proposed schemas** 列表
- [ ] 列表里每张卡显示：page label、URL、AI 提议的 kind、置信度 pill、AI 给出的 rationale
- [ ] **置信度 ≥ 70% → success（绿）pill；40–69% → warning（黄）pill；< 40% → 默认灰**
- [ ] 低置信度的卡默认 **未勾选**（`enabled=false`），并显示「请人工复核」
- [ ] 点 `Preview JSON-LD` → 展开当前 proposal 的完整 JSON-LD
- [ ] 点 `Enable all` / `Disable all` 批量切换勾选状态
- [ ] 单独点某张卡上的复选框 → 立刻在底部按钮里看到 `Install N blocks (P pages × L locales)` 数字变化
- [ ] 把翻译复选框关掉 → cost estimate 数字立刻减少（少了翻译调用）
- [ ] 点 `Install N blocks` → 如果开了翻译，先看到 `Translating X / Y` 阶段进度条，然后 `Installing…`，最后 toast `Installed N JSON-LD blocks across M pages`
- [ ] 回 Dashboard → 顶部 status pill 变成 `Schema installed`（绿色）

### 3.2.1 Install Undo（30 秒可逆）

- [ ] 点 Install 之后，**toast 上有 `Undo` 按钮**（约 30 秒不消失）
- [ ] 趁 toast 还在 → 点 `Undo`
- [ ] 立刻看到第二条 toast `Reverted to previous Custom Code state.`
- [ ] 进 Framer `Site Settings → Custom Code → End of <head>` → **整段已恢复到安装前的样子**（包括之前的 fence 块、之前的用户代码全部还原）
- [ ] 重新 Install 一次 → toast 出现 → **不点 Undo，等 30s 让它自然消失** → 状态保持已安装
- [ ] **关键**：Install 前手动加一行 `<script>console.log("user")</script>` → Install → 点 Undo → 验证用户代码完整保留

### 3.2.2 Re-scan + diff + 状态保留

- [ ] 装好后回 Schema 视图 → 顶部出现 **Last installed** 卡片，显示「刚刚 · N blocks across M locales」
- [ ] 点底部 `Re-scan` → 重新跑一遍扫描
- [ ] 列表里所有页面应显示 `Installed`（绿）pill 且置于「up to date」状态
- [ ] **回 Framer 改动一个页面的 H1 文字** → 回插件再 `Re-scan` → 该页面卡变成 `Updated`（黄）pill
- [ ] **回 Framer 新增一个 page** → `Re-scan` → 新页面卡显示 `New`（紫）pill
- [ ] 顶部快照卡用对应 pill 汇总：`{n} new` / `{n} changed` / `{n} removed`
- [ ] **关键 —— 状态保留**：随便禁用 3 张卡（取消勾选）→ 点 `Re-scan` → **被禁用的 3 张仍是禁用状态**，不会被重置
- [ ] 再次点 `Install` → 重新生成全部 block，snapshot 时间戳更新

### 3.2.3 Inline edit proposal（编辑 AI 提议字段）

- [ ] 任意一张卡上点 `Edit fields` 链接
- [ ] 卡片下方展开内联编辑器（左侧带 tint 色条，浅底色）
- [ ] 头部说明文字带当前 schema kind（如 "Tweak this Article schema..."）
- [ ] 字段按 kind 渲染：
  - Article → headline / description / image / author / publisher / datePublished
  - Product → name / description / brand / image / sku / price / currency
  - LocalBusiness → name / description / phone / address / city / country
  - FAQPage → 多行 question/answer 编辑器，可加 / 删问题
  - Organization → name / url / description / logo / 社交 URL（逗号分隔）
- [ ] 改任意字段 → 点 `Save` → 编辑器关闭 → **卡片显示黄色 `Edited` pill**
- [ ] 重新点 `Edit fields` → 字段保留刚才的修改值
- [ ] 点 `Reset to AI suggestion` → 字段恢复 AI 原始建议 → Save → `Edited` pill 消失
- [ ] 点 `Cancel` → 不保存改动
- [ ] 点 `Preview JSON-LD` → JSON-LD 反映**最新的编辑结果**
- [ ] FAQPage：测加问题（点 `+ Add question`）+ 删问题（点 `Remove`，最后一个问题不能删）
- [ ] **关键 —— 编辑 + Re-scan 智能合并**：编辑一个 page 的 headline → 回 Framer **不动该页面内容** → Re-scan → **编辑保留**；如果改了该页面的 H1 → Re-scan → 编辑被替换为 AI 新建议（同时该 page 显示 `Changed` pill）

### 3.2.4 过滤/搜索 proposal 列表

> 项目页面 ≥ 6 时才会显示过滤行。少于 6 跳过此节。

- [ ] 看到 search 输入框 + 4 个 segment（All / New / Changed / Disabled）
- [ ] 在 search 框输入页面 URL 的部分（如 `blog`）→ 列表实时过滤
- [ ] 在 search 框输入页面 label 的部分 → 同样能匹配
- [ ] 清空 search → 全部显示
- [ ] 点 `New` → 只显示新增页面（首次扫描时为空，需先安装一次再 Re-scan + 改内容）
- [ ] 点 `Changed` → 只显示内容变了的页面
- [ ] 点 `Disabled` → 只显示被禁用的页面
- [ ] 过滤结果为空 → 显示 `No proposals match your filter.` 文案
- [ ] **关键**：过滤期间点 `Enable all` / `Disable all` → 作用于**全部** proposal（不仅仅是过滤可见的），符合用户意图

### 3.2.5 Schema 工具 — 手动模式（旧路径，回退用）

- [ ] 在 AI 审查视图底部点 `Switch to manual mode →`
- [ ] 进入 `Schema · Manual mode`，看到 5 个 schema 类型 chip 横排
- [ ] 切到 `Article` → 表单变成 Article 字段
- [ ] **填几个 Article 字段 → 切回 FAQPage → 再切回 Article → 填的内容还在**（per-kind drafts）
- [ ] **Canonical URL 输入非法值（如 `not-a-url`）→ 输入框边框变橙色**（软警告，不阻塞）
- [ ] 点 `Install N blocks` → toast 提示成功
- [ ] 顶部点 `← Back to AI audit` 返回审查视图，之前 AI 提议的列表仍在

### 3.3 关键安全测试 ⚠️（必测）

> 这一组如果有任何一项失败，**立刻停止并联系开发者**。这是数据丢失级别的 bug。
>
> 注：层 1 的 27 个 fence 单测已经覆盖了这逻辑；这里是端到端验证，确保 Framer SDK 的实际行为也符合我们的假设。

- [ ] 进 Framer：`Site Settings → General → Custom Code → End of <head> tag`
- [ ] **手动**在里面加一行：`<script>console.log("user-test")</script>`
- [ ] 保存，回插件 → Schema 工具 → Install
- [ ] **再次打开 `End of <head> tag` → 确认你那行 `console.log` 还在**
- [ ] 在它下面应该有一段 `<!-- polyglot-aeo:start -->` ... `<!-- polyglot-aeo:end -->` 的内容
- [ ] 进插件 Settings → `Remove all` → 弹出确认对话框 → 点 Remove all
- [ ] 再次打开 `End of <head> tag` → **确认你那行 `console.log` 仍然在，fence 包裹的内容已被移除**

### 3.4 llms.txt 工具

- [ ] 进入 `Multilingual llms.txt`
- [ ] Site name / summary / base URL 三个字段都能填
- [ ] **填完关插件再开 → 内容自动恢复**（auto-draft）
- [ ] 不填 site name 直接点 Generate → toast 提示 "Set site name and base URL first"
- [ ] **Collection 下拉**：项目无 CMS 时，下拉只有"— 不使用 —"，下方显示"建议去 CMS 面板新建"的帮助文字 + 「刷新」按钮
- [ ] **Collection 下拉**：项目有 CMS 时，下拉列出所有 Collection（含 itemCount），右上角「刷新」按钮可点
- [ ] 填完 → Generate → 看到 N 个文件（N = locale 数量）
- [ ] 第一个文件名是 `llms.txt`，其他是 `llms-zh-cn.txt` / `llms-ja-jp.txt` 等
- [ ] 每个文件能 Copy（toast 提示 Copied）和 Download（弹出下载框）
- [ ] 文件内容包含 `# {site name}` + `> {summary}` + 当前 locale 的链接列表
- [ ] **生成成功后**，文件下方显示「如何部署到 Framer 站点」指引卡片，右上角带「需 Framer Pro+」紫色 pill
- [ ] 卡片里的「查看 Framer 官方教程 →」链接点击后**新标签页**打开 https://www.framer.com/help/articles/llms-txt-framer/
- [ ] 卡片底部显示 fallback 提示（CDN / Cloudflare Workers 等替代部署方案）

### 3.4.1 端到端验证（Framer Pro+ 用户专属）

> 此项需要 **Framer Pro 或更高计划** 的项目。Free / Basic 用户跳过此节。

- [ ] 按指引下载 llms.txt + llms-{locale}.txt 文件
- [ ] 打开 Framer Dashboard → 左侧 Domains → 选你的域名 → Files tab
- [ ] 点 + 按钮上传 llms.txt，路径留空（根路径），文件名 `llms.txt`
- [ ] 重复上传 llms-zh-cn.txt 等 locale 变体
- [ ] Publish 站点
- [ ] 浏览器访问 `https://your-domain.com/llms.txt` → 看到 Markdown 文本（content-type 应为 text/plain）
- [ ] 同上验证 `https://your-domain.com/llms-zh-cn.txt`
- [ ] 把两个 URL 各喂给 ChatGPT 问"What's at this URL?"，验证 AI 能正确解析内容

### 3.5 AI Meta 工具（需要至少一个 provider key）

> 没有任何 API key 就跳过这一节。

- [ ] 进入 `AI localized meta`
- [ ] **Provider 下拉**有 9 个内置 + 你加的自定义 provider
- [ ] **切换 Provider**，下面的 **Model 下拉**会自动更新到该 provider 的模型列表
- [ ] 每个 model 选项右边显示价格 `$0.14/$0.28/M` 和速度 badge（fast/balanced/smart/cheap）
- [ ] 选完 provider + model → 下方显示 `Est. cost: ~$0.0008 (3 × ~$0.0003)`
- [ ] 没填该 provider 的 API key 时，底部按钮 disabled，上方有 `No API key` 黄色 pill
- [ ] **进 Settings → 找到对应 provider 卡片 → 填 key → 保存 → 回 Meta → 按钮可点了**
- [ ] 填 page context（至少 1 段话）
- [ ] 点 `Generate for N locales` → 看到逐个 locale 出结果（thinking 模型 ~20s/locale，普通模型 ~3s/locale）
- [ ] 每个结果显示 Title / Meta description / OG title / OG description / Twitter title / Twitter description，旁边有字符数 pill
- [ ] **每个 locale 的 title 是真正的本地语言**，不是机器直译（中文不应该出现 "你好世界" 这种生硬翻译）
- [ ] 总成本 pill 显示 `~$0.00XX`
- [ ] **Click-to-copy（重点）**：把鼠标悬停在生成的 Title 字段上 → 边框轻微变色 → **点击字段** → 字段内容写入剪贴板 → 字段右侧 `Copy` 标签变成 `Copied` 并保持约 1.2 秒
- [ ] 试着把复制结果粘贴到 Framer 页面 SEO 面板 → 内容完整、无前缀干扰
- [ ] **每条 locale 卡片右上角有 `↻ Regenerate` 按钮**
- [ ] 点某一条的 Regenerate → 该卡片显示 `Regenerating…` 字样，**其他 locale 的结果不动** → 几秒后该 locale 替换为新结果
- [ ] regenerate 进行中 → 其他卡片的 Regenerate 按钮全部 disabled（一次只允许重做一个）
- [ ] **关插件再开 → 表单内容（pageContext / pageType / brand voice / 选中的 provider+model）自动恢复**
- [ ] **brand voice 在 Meta 视图改一下 → 进 Settings → brand voice 同步更新了**
- [ ] **CORS 检查（重要）**：用一个非 Anthropic / OpenAI 的 provider 测一次。如果 toast 报"network error" 或 console 红字 `CORS policy: No 'Access-Control-Allow-Origin'`，记下来报 P0

### 3.6 Settings — Provider 管理

- [ ] Plugin language 下拉能切换 `Auto / English / 简体中文 / 日本語`
- [ ] **切到中文 → 整个插件界面变中文**（Dashboard、Schema、Llms、Meta、Settings 全部）
- [ ] 切回 Auto → 跟随浏览器/系统语言

**API keys 区域（重点）**：

- [ ] **首次打开（无任何 key）**：直接看到一行虚线边框的 `Show 9 more providers ▾` 折叠按钮
- [ ] 点击展开 → 9 张 provider 卡片出现：Anthropic、OpenAI、Gemini、DeepSeek、智谱 GLM、Moonshot Kimi、阿里 Qwen、MiniMax (Global)、MiniMax 国内
- [ ] 每张卡片上：provider 名 + 描述 + `Get key ↗` 链接（点击新窗口打开 console）
- [ ] **MiniMax (Global)** 链接到 `platform.minimax.io`，**MiniMax 国内** 链接到 `platform.minimaxi.com`
- [ ] 每张卡片上的输入框点 `Show` 切换明文/掩码
- [ ] 填一个 key → 点底部 `Save` → toast 提示成功
- [ ] 关插件再开 → key 还在 → **该 provider 自动展开在 Active 区**，剩余的折叠成 `Show 8 more providers ▾`
- [ ] 在折叠区里给某个 provider 输入 key → 编辑期间该卡片**不会跳到 Active 区**（避免输入时卡片乱跳）
- [ ] **Test 按钮（重点）**：
  - [ ] 卡片输入 key 之后，密钥框右侧的 `Test` 按钮才可点（空 key 时 disabled）
  - [ ] 点 `Test` → 按钮文字变 `Testing…`
  - [ ] **正确 key**：几秒后出现绿色 `✓ Connected` pill
  - [ ] **错误 key**（故意打错几个字符）：出现黄色 `✗ Failed — <错误信息>` pill，hover 看完整错误
  - [ ] 编辑 key 任意字符 → pill 立刻消失（状态重置）
  - [ ] Test 期间 `Test` 按钮 disabled，不会重复触发
- [ ] **添加自定义 provider**：点 `+ Add custom provider`
  - [ ] 表单弹出：Display name / Base URL / Model ids（逗号分隔）
  - [ ] 不填名字直接点 Save → toast 提示 "Please fill in display name, base URL..."
  - [ ] 填好（比如 Together AI：`https://api.together.xyz/v1` + `meta-llama/Llama-3.3-70B-Instruct-Turbo`）→ Save → toast "Custom provider saved"
  - [ ] **自定义 provider 总在 Active 区**（不会被折叠）
  - [ ] 自定义 provider 也有 Test 按钮 → 测一下 → 验证连通
  - [ ] 卡片列表多了一个，点 `Remove` → 弹出确认对话框 → 确认 → 移除（key 也一并清除）
  - [ ] 回 Meta 工具 → Provider 下拉里看得到刚加的自定义 provider

**其他区域**：

- [ ] Brand voice 多行文本框
- [ ] Quick Start 区域有 `Show quick start` 按钮 → 点 → toast 提示已开启 → 回 Dashboard 看到 Quick Start 又出现了
- [ ] Installed schema 显示状态（Installed/Not installed）+ Remove all 按钮（schema 没装时 disabled）

### 3.7 i18n 多语言切换

- [ ] Settings → Plugin language → 切到 `简体中文`
- [ ] 整个 UI 立刻变中文，无需刷新
- [ ] 进每个工具：Dashboard 中文 ✓、Schema 中文 ✓、llms.txt 中文 ✓、Meta 中文 ✓、Settings 中文 ✓
- [ ] 切到 `日本語` → 同上
- [ ] **? 帮助图标点开**：每个 ? 弹出的说明文字也是当前 UI 语言
- [ ] 关闭插件再打开 → 语言选择被记住

### 3.8 键盘 + Help 图标 + 顶部齿轮

**Help 图标（行内说明）**：

- [ ] Dashboard `Why per-locale schema?` 旁有 `?` 图标 → 点开看到行内说明 → 再点关闭
- [ ] Schema 工具 `Source content` 旁有 `?`
- [ ] Settings `AI providers (BYOK)` 旁有 `?`

**顶部齿轮 / Settings 快捷入口**：

- [ ] Dashboard hero 右上角的图标群从左到右：locale 切换器 → `?` 帮助按钮 → 齿轮（Settings）
- [ ] **任何 tool view 的 TopBar 右上角**也有同款齿轮（不在 Dashboard 时不再有 `?`，由全局快捷键代替）
- [ ] 在 Schema audit 里点齿轮 → 跳进 Settings
- [ ] 在 Settings 点 `← Back` → **回到 Schema audit**（不是回 Dashboard）
- [ ] 路由栈正确性：Dashboard → Schema → Settings → Back → Back → 落回 Dashboard

**全局键盘快捷键**：

- [ ] 任何 view 里按 ESC → 返回上一级（Dashboard / 或上一个 tool view）
- [ ] **输入框聚焦时按 ESC 不应触发返回**，应该是清空字段
- [ ] Schema 手动模式填完 → 按 `Cmd+Enter` (Mac) 或 `Ctrl+Enter` (Win) → 触发 Install
- [ ] Meta 工具同样 `Cmd/Ctrl+Enter` 触发 Generate

**`?` 快捷键说明叠层**：

- [ ] 在任何 view 按 `?` → 弹出黑色半透明遮罩 + 居中卡片，标题 `Keyboard shortcuts`
- [ ] 列表显示 3 行：`Esc` / `⌘ + ↵`（Mac）或 `Ctrl + ↵`（Win）/ `?`，每行带描述
- [ ] **Mac 上显示 `⌘`，Windows / Linux 上显示 `Ctrl`**
- [ ] 点遮罩空白处 → 关闭
- [ ] 按 ESC → 关闭
- [ ] Dashboard hero 上点 `?` icon → 也能打开同一个叠层
- [ ] **在输入框 / textarea 聚焦时按 `?` → 不应该弹出叠层**（让用户能正常打 `?` 字符）

---

## 已知行为 / 不是 bug

- 单 locale 项目里只能生成 1 份 schema/llms.txt — by design，插件价值在多语言项目
- Schema 工具的 Preview 里非默认 locale 的文本字段（headline、description）和默认 locale 完全相同 —— 只有 `inLanguage` 和 `@id` 不同。**这是 v0.1 行为**，要真正翻译文案请用 AI Meta 工具
- Custom Code 里 fence 包裹的 JSON-LD 内容**不会被 Framer Live Preview 渲染**，必须 Publish 后在线上页面查看（用浏览器 View Source 或 Google Rich Results Test）
- Brand voice 在 Settings 和 Meta 工具里是**同一份内容**，改任一处会同步
- Auto-draft 有 1.5 秒 debounce，连续打字时不会立刻保存，停 1.5 秒后才写入
- Plugin window 最小 300×460，再小会有 layout 问题
- macOS 上首次 dev 模式启动需要 `sudo` 输入密码（mkcert 信任本地 CA），生产环境用户无感
- **Thinking 模型（DeepSeek R1、Kimi K2 Thinking、MiniMax M2.7 等）单次调用 ~20-60 秒**，因为它们要先内部推理再输出。同一家的 `-highspeed` / Flash / non-thinking 变体快 10 倍但质量略低
- **DeepSeek 旧 model id**（`deepseek-chat`、`deepseek-reasoner`）将在 **2026-07-24 弃用**；插件已默认用 V4 系列
- **Moonshot 早期 K2 preview**（`kimi-k2-0905-preview` 等）将在 **2026-05-25 停服**；插件只暴露 K2.6 / K2.5
- **llms.txt 部署需要 Framer Pro+**：插件能在所有 Framer 计划上生成文件，但部署必须走 [Framer Static Files](https://www.framer.com/help/articles/static-files/)（Pro $30/mo 起）。Free / Basic 用户能下载文件但无法在 `*.framer.website` 子域上服务它们
- **生成的文件不持久化**：`llms.txt` 文件正文只活在插件 React state 里，关闭插件后消失（表单配置会保留）。这是 by design——文件可以从 CMS + 配置随时重算，存内容会冗余还容易过时

---

## 报告 bug 的模板

```
## 环境
- OS: [macOS 14.5 / Windows 11 / ...]
- 浏览器: [Chrome 130 / Safari 17 / ...]
- Framer 项目 locale 数量: [3]
- 插件 UI 语言: [Auto (en) / zh-CN / ja]
- 用的 AI Provider + Model: [MiniMax 国内 / MiniMax-M2.7-highspeed]

## 我做了什么
1. [逐步描述操作，越具体越好]
2. ...

## 我期望发生什么
...

## 实际发生了什么
[附截图最好]

## 截图 / 控制台报错 / Network 标签报错
[拖拽截图 / 贴 console error / 贴 Network 失败的 response body]
```

> Console 怎么看：插件窗口 → 右键 `Inspect` → `Console` tab。如果有红色报错，截图或复制全文。Network tab 同步看，特别是 `chat/completions` 那条请求的状态码和响应。

---

## 优先级提醒

**P0（立刻报告，停止其他测试）**：
- Custom Code 里你手动加的代码消失（最严重，触发是数据丢失）
- **Install Undo 点了之后 Custom Code 没回到安装前状态**（数据级 bug，违反承诺）
- **Re-scan 抹掉用户的 toggle 选择或 inline 编辑**（curation 工作丢失）
- 安装/卸载 schema 后 Framer 项目崩溃或无法保存
- 插件窗口白屏 / 完全不响应
- API key 在 toast / console / network response 里以明文出现
- **任何 provider 在 Framer 里报 CORS 错误但 Node live test 通过**（说明协议对但浏览器被拦了，需要 proxy）

**P1（继续测试，但当天报告）**：
- 任意工具点击后没反应
- 切换 UI 语言后界面残留另一种语言
- Schema preview 的 `inLanguage` 值和 locale 不匹配
- AI Meta 输出的不是目标语言
- 价格估算明显不对（比如 $0.0001 显示成 $1）
- 自定义 provider 保存后下次打开消失
- **Test 按钮明明 key 正确却报 Failed**（误判，影响信任）
- **Click-to-copy 复制内容里混入额外字符**（用户粘贴到 SEO 面板会脏）
- **齿轮跳进 Settings 后 Back 没回到原 view**（路由栈坏了）

**P2（攒一起报）**：
- 文案错别字、翻译不自然
- 间距 / 颜色 / 对齐问题
- 帮助图标说明不准确
- Provider 描述文字过时

---

谢谢你帮忙测！有任何困惑直接问开发者，不要自己猜。
