# UI flow

Visual map of how a user moves through Polyglot AEO. Renders in any Markdown
viewer that supports Mermaid (GitHub, VS Code with the Mermaid extension,
etc.).

## High-level navigation

```mermaid
flowchart LR
    Open([User opens plugin]) --> Dashboard
    Dashboard -->|Has API key + locales| Schema
    Dashboard -->|First time| Settings
    Schema -->|Install JSON-LD| Done([Schema in head])
    Dashboard --> Llms
    Llms -->|Generate per-locale| Files([llms.txt files])
    Dashboard --> Meta
    Meta -->|Generate via AI| Results([Per-locale meta])
    Dashboard --> Settings
    Settings -->|Save BYOK keys| Dashboard
```

## Framer-native deployment paths (where each output ends up)

Polyglot AEO is designed so every artifact lands directly in Framer's own
publishing surfaces — users never export code or move to another tool.

```mermaid
flowchart LR
    subgraph PA[Polyglot AEO]
        A1[Schema view]
        A2[Meta view]
        A3[llms.txt view]
    end

    subgraph FR[Framer site]
        B1["Custom Code &lt;head&gt;<br/>(Site Settings)"]
        B2[Page → SEO panel]
        B3["Domain → Files tab<br/>(Static Files, Pro+)"]
    end

    A1 -->|setCustomCode SDK<br/>1 click| B1
    A2 -->|Copy → paste| B2
    A3 -->|Download → upload| B3

    B1 --> Pub([Framer Publish])
    B2 --> Pub
    B3 --> Pub
    Pub --> Live([Live site,<br/>cited by AI engines])
```

**Plan gate**: the `Domain → Files tab` (Framer Static Files) requires
Framer Pro plan or higher. The plugin surfaces this as a "Framer Pro+" pill
on the deploy guide so users aren't surprised. Schema and Meta paths work on
every Framer plan.

## Schema generation flow — AI audit (default path)

The audit flow turns Schema from a per-page form into a site-wide AI agent.
Click **Scan site** once and Polyglot AEO enumerates every page in the
project, picks the right schema kind for each, fills the fields from the
on-canvas content, and (if enabled) translates everything into every
non-default locale before bulk-installing the result.

```mermaid
flowchart TD
    A[Tap Schema tab] --> B[Lands in AI audit]
    B --> C{API key set?}
    C -->|No| Z[Open Settings]
    C -->|Yes| D[Pick AI provider + model]
    D --> E[Click Scan site]
    E --> F[scanSite enumerates WebPageNodes<br/>+ expands CMS detail pages]
    F --> G[Per page: extract title,<br/>headings, body sample]
    G --> H[Bounded-concurrency AI loop:<br/>per page propose kind + fields]
    H --> I[Audit list — one card per page:<br/>kind, confidence, rationale]
    I --> J{Edit selection?}
    J -->|Toggle off low-confidence| I
    J -->|Looks right| K{Translate content<br/>per locale?}
    K -->|Yes default| L[Bounded AI loop:<br/>per proposal × locale rewrite text]
    K -->|No| M[Reuse default-locale text,<br/>only inLanguage differs]
    L --> N[Bulk install:<br/>build N×M JSON-LD blocks<br/>into a single fenced injection]
    M --> N
    N --> O[Save snapshot:<br/>pageId → sourceHash + locales]
    O --> P([Toast: Installed N blocks across M pages])
```

### Re-scan + diff loop

After install, the snapshot lives in plugin data. Re-opening the plugin
later shows a **Last installed** card. Clicking **Re-scan** runs the full
flow again and surfaces changes:

```mermaid
flowchart LR
    A[Click Re-scan] --> B[scanSite again]
    B --> C[diffAgainstSnapshot]
    C --> D{For each page}
    D -->|hash unchanged| E[Show 'Installed' badge]
    D -->|hash differs| F[Show 'Updated' badge]
    D -->|new page| G[Show 'New' badge]
    D -->|page deleted| H[List in 'Removed']
    E --> I[Re-install button replaces<br/>only the changed entries]
    F --> I
    G --> I
    H --> I
```

### Manual mode (legacy / surgical control)

A small **Switch to manual mode** link at the bottom of the audit view
falls back to the original kind-picker form. This stays for power users
who want to add a schema kind the auditor doesn't propose, or to edit a
single page's JSON-LD by hand.

## AI Meta flow

Four-step wizard (see `docs/META-AI.md`):

```mermaid
flowchart TD
    A[Tap Meta AI] --> B[Step1: Pick page or paste context]
    B --> C[Step2: AI settings fold + Generate]
    C --> D{API key?}
    D -->|No| Z[Settings]
    D -->|Yes| E[Parallel locale calls + parse/quality]
    E --> F[Step3: Review tabs + copy fields]
    F --> G[Step4: Apply guide in Framer]
    G --> H([Paste into Page settings per locale])
```

## llms.txt generation + deployment flow

```mermaid
flowchart TD
    A[Tap llms.txt tab] --> B[Fill site name + base URL + summary]
    B --> C{CMS Collection<br/>available?}
    C -->|Yes| D[Pick Collection<br/>+ map title/summary fields]
    C -->|No| E[Site summary only<br/>show Collection-empty hint]
    D --> F[Click Generate N files]
    E --> F
    F --> G[Render llms.txt + llms-{locale}.txt<br/>per locale to React state]
    G --> H[Show generated files<br/>with Copy / Download buttons]
    H --> I[Show 'How to deploy on Framer'<br/>guide with Pro+ badge]
    I --> J[User downloads each file]
    J --> K[Open Framer Dashboard<br/>→ Domains → your domain → Files]
    K --> L[Upload each file at root path]
    L --> M[Publish site]
    M --> N([Files served at /llms.txt,<br/>/llms-zh-cn.txt, ...])
```

The deploy guide is rendered **inline below the generated files**, with a
direct link to Framer's official static-files article. We chose this over
external documentation because the average user who just clicked "Generate"
is mid-task and shouldn't have to leave the plugin to find next steps.

## Install / uninstall safety

```mermaid
flowchart LR
    Install([Install]) --> WrapBlocks
    WrapBlocks[Wrap each locale's JSON-LD<br/>in script tags inside fence comments] --> Inject
    Inject[setCustomCode at headEnd] --> Done
    Done --> StoreSnapshot[Save snapshot to plugin data]

    Uninstall([Uninstall]) --> ReadCustomCode[Read current headEnd HTML]
    ReadCustomCode --> CheckFence{Contains polyglot-aeo fence?}
    CheckFence -->|Yes| ClearOnlyFenced[setCustomCode null at headEnd<br/>only when fence is the entire body]
    CheckFence -->|No| Skip[No-op — never touch user code]
```

The fence guarantees we never delete custom code we didn't author. If a
user mixes Polyglot AEO output with hand-written JSON-LD in the same
location, we surface a notice and require manual cleanup rather than risk
data loss.
