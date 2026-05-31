import { describe, expect, it } from "vitest"

import cnToJp from "./data/cn-to-jp.json"
import metadata from "./data/metadata.json"
import {
  findHanGlyphViolations,
  hasHanGlyphViolations,
  hasLatinEmbeddedInCjk,
  requireTargetScript,
  stripQuotedRegions,
  validateLocaleScript,
} from "./index"

describe("OpenCC glyph maps", () => {
  it("has expected scale and key regression pairs", () => {
    const meta = metadata as { entryCounts: Record<string, number> }
    expect(meta.entryCounts.cnToJp).toBeGreaterThan(3000)
    expect(meta.entryCounts.twToJp).toBeGreaterThan(300)
    const map = cnToJp as Record<string, string>
    expect(map["网"]).toBe("網")
    expect(map["选"]).toBe("選")
    expect(map["断"]).toBeUndefined()
  })
})

// ---------- validateLocaleScript ----------

describe("validateLocaleScript", () => {
  // Regression target: AI bleeds Chinese characters into Japanese
  // output ("キャンバスとレイヤー了你的の改善"). The validator catches
  // mostly-wrong-script output without false-positiving on legit
  // proper-noun loanwords.

  it("accepts Japanese with hiragana", () => {
    expect(validateLocaleScript("これは日本語です", "ja")).toBe(true)
  })

  it("accepts short Latin brand names in Japanese context", () => {
    // "Acme" or "iPhone" should pass even in a `ja` context — they
    // shouldn't be translated. Only LONG mostly-Latin Japanese
    // strings (a translation that didn't happen) should fail.
    expect(validateLocaleScript("Acme", "ja")).toBe(true)
  })

  it("accepts kanji-only Japanese when glyphs pass Layer B", () => {
    expect(validateLocaleScript("利用規約", "ja")).toBe(true)
    expect(validateLocaleScript("会社概要", "ja")).toBe(true)
  })

  it("rejects simplified-Chinese Han in Japanese via glyph map (no kana needed)", () => {
    expect(validateLocaleScript("我们的网站很棒非常好用", "ja")).toBe(false)
  })

  it("accepts Chinese with Han characters", () => {
    expect(validateLocaleScript("我们的网站", "zh-CN")).toBe(true)
  })

  it("rejects Chinese dominated by hiragana (locale confusion)", () => {
    expect(validateLocaleScript("こんにちは", "zh-CN")).toBe(false)
  })

  it("accepts Korean with hangul", () => {
    expect(validateLocaleScript("안녕하세요", "ko")).toBe(true)
  })

  it("does not reject Latin-script locales (en, nl, tr, de, …)", () => {
    // These locales have too many proper-noun loanwords to apply
    // a script gate without false positives. We only validate
    // CJK + Arabic + Cyrillic.
    expect(validateLocaleScript("Welcome to our site", "en-US")).toBe(true)
    expect(validateLocaleScript("Welkom op onze site", "nl")).toBe(true)
    expect(validateLocaleScript("Hoş geldiniz", "tr")).toBe(true)
  })

  it("rejects empty or whitespace-only input", () => {
    expect(validateLocaleScript("", "ja")).toBe(false)
    expect(validateLocaleScript("   ", "ja")).toBe(false)
  })

  // ---------- Cross-script CJK pollution (regression targets) ----------
  //
  // Each of the following came from a real plugin install. The OLD
  // validator passed all of them because they had ANY hiragana
  // (so the "if hiragana > 0 → true" rule fired). The strengthened
  // validator hard-rejects them by detecting foreign-script bleed.

  it("rejects Korean characters in Japanese output", () => {
    // Real failure: privacy-policy description came back as
    // "プライバシー 관련 문의처 정보를 제공하는 개인정보 보호정책".
    // 60% Japanese, 30% Korean — the OLD validator passed because
    // the hiragana count was non-zero.
    expect(
      validateLocaleScript(
        "プライバシー 관련 문의처 정보를 제공하는 개인정보 보호정책",
        "ja",
      ),
    ).toBe(false)
  })

  it("rejects Chinese-only kanji bleed in Japanese (网站 / 选择)", () => {
    // Real failures observed mid-prose:
    //   "初心者の网站建设" — Chinese 网 in JA
    //   "デザイン的选择"  — Chinese 选 in JA
    //   "决策が高くつく"  — Chinese 决 in JA
    // Each has plenty of hiragana but a single CN-only kanji is
    // enough to mark the whole cell as polluted.
    expect(validateLocaleScript("初心者の网站建设について", "ja")).toBe(false)
    expect(validateLocaleScript("デザイン的选择は重要です", "ja")).toBe(false)
    expect(validateLocaleScript("决策が高くつくと感じる", "ja")).toBe(false)
  })

  it("rejects Japanese kana in Korean output", () => {
    // KO never legitimately uses hiragana/katakana. If they appear,
    // the AI confused Japanese and Korean — fail closed.
    expect(validateLocaleScript("プライバシー 안녕하세요", "ko")).toBe(false)
    expect(validateLocaleScript("의 카타カナ 출력", "ko")).toBe(false)
  })

  it("rejects Korean characters in Chinese output", () => {
    // The mirror case of the JA bug: hangul in zh-CN means AI
    // bled Korean script into Chinese.
    expect(validateLocaleScript("我们的网站 매우 좋습니다", "zh-CN")).toBe(
      false,
    )
  })

  // ---------- Sanity: legitimate prose still passes ----------

  it("accepts Japanese prose with normal kanji and kana mixed", () => {
    // Regression guard: don't false-positive on real Japanese.
    // 重要 / 説明 / 解説 are real JP kanji and must stay accepted.
    expect(
      validateLocaleScript(
        "デザインの重要性について解説します。",
        "ja",
      ),
    ).toBe(true)
  })

  it("accepts 決断 and other common JP compounds that use 断 (regression: denylisted 断)", () => {
    // User report 2026-05: valid JA blog translation flagged mixed-script
    // because CHINESE_ONLY_KANJI contained 断 — shared JP/CN form used in
    // 決断 / 中断 / 判断. Only simplified 诊 (诊断) should be denied.
    const headline = "視聴者と真につながるウェブサイトの作り方"
    const description =
      "初めてのウェブサイト作成は大変に思えるかもしれません。デザインの選択からコンテンツ計画に至るまで、すべての決断が重要に感じられます。ツールや専門用語、デザイン原則に不慣れなため、自分の選択に自信が持てなくなることもあるでしょう。しかし実際には、段階的なアプローチを取れば、プロセスを簡略化し、真に効果的なものを作り上げることができます。"
    expect(validateLocaleScript(headline, "ja")).toBe(true)
    expect(validateLocaleScript(description, "ja")).toBe(true)
    expect(hasHanGlyphViolations(description, "ja")).toBe(false)
  })

  it("accepts Korean prose with hangul + occasional hanja", () => {
    // Korean writers do sometimes mix in hanja for disambiguation
    // ("漢字" in Korean text). Don't reject those.
    expect(validateLocaleScript("우리의 웹사이트는 좋습니다", "ko")).toBe(true)
  })

  // ---------- Cyrillic contamination (regression target) ----------
  //
  // Real failure pulled from a generated llms-ja.txt: the AI emitted
  // "ユーザー視点の сайте design を" — Russian "сайте" mid-prose. The
  // string had hiragana so the OLD validator returned true. Modern JA
  // never uses Cyrillic — any presence is unambiguous AI confusion.

  it("rejects Cyrillic characters in Japanese output", () => {
    expect(
      validateLocaleScript(
        "ユーザー視点の сайте design を決めるトレンド",
        "ja",
      ),
    ).toBe(false)
  })

  it("rejects Cyrillic in Korean output", () => {
    expect(validateLocaleScript("우리의 веб 사이트", "ko")).toBe(false)
  })

  it("rejects Cyrillic in Chinese output", () => {
    expect(validateLocaleScript("我们的 веб 网站", "zh-CN")).toBe(false)
  })

  // ---------- Embedded-Latin contamination (regression target) ----------
  //
  // Pulled from generated llms-ja.txt and llms-ko.txt:
  //   - ".launchした軌跡"            (English `.launch` mid-JP-prose)
  //   - "Responsive Designが重要"   (English term left untranslated)
  //   - "광채 피부관리 브랜드 identity"  (English tail in KO phrase)
  //   - "秘诀"                       (simplified-CN 诀 — caught by
  //                                  CHINESE_ONLY_KANJI expansion)
  //
  // The OLD validator passed these because the strings contained
  // target-script chars (hiragana/hangul). The strengthened version
  // hard-rejects sizable Latin runs that aren't inside brand quotes.

  it("rejects English `.launch` embedded in Japanese prose", () => {
    // Code-style token with `.` joiner — letters all lowercase →
    // contamination signal fires.
    expect(
      validateLocaleScript(
        "のウェブサイトをゼロからリデザインして.launchした軌跡",
        "ja",
      ),
    ).toBe(false)
  })

  it("rejects lowercase English word embedded in Japanese prose", () => {
    // "design" / "launch" — common English nouns the AI failed to
    // transliterate (should be デザイン / ローンチ in JP). All-
    // lowercase Latin = contamination signal.
    expect(
      validateLocaleScript("サイト designを決める", "ja"),
    ).toBe(false)
  })

  it("rejects untranslated lowercase English tail in Korean prose", () => {
    expect(
      validateLocaleScript("광채 피부관리 브랜드 identity", "ko"),
    ).toBe(false)
  })

  it("rejects 秘诀 in Japanese (simplified-CN 诀 — JP form is 訣)", () => {
    expect(validateLocaleScript("コンバージョンの秘诀", "ja")).toBe(false)
  })

  it("does NOT flag CapitalizedWords embedded in JA prose (brand-name heuristic)", () => {
    // Documents the known trade-off: "Responsive Design" /
    // "iPhone" / "MacBook" pass through even when AI ought to have
    // transliterated them. Catching capitalized Latin would
    // false-positive on every brand-prefixed JA marketing line
    // ("LYNIQはデザインスタジオ", "Polyglot AEO で…", "Framer
    // プラグインで…"), which is a much worse UX than letting an
    // occasional industry term slip through. Lowercase-only is the
    // discriminator.
    expect(
      validateLocaleScript("Responsive Designが今や重要な理由", "ja"),
    ).toBe(true)
    expect(
      validateLocaleScript("iPhoneのアプリ開発", "ja"),
    ).toBe(true)
  })

  // ---------- Brand-quote allowlist (no false positives) ----------
  //
  // The contamination check strips bracketed regions before scanning
  // so legit branded patterns pass:

  it("accepts brand names inside 「」 corner brackets in JP prose", () => {
    // "「Radiant skincare」ブランドアイデンティティ" — the brand is
    // intentionally Latin and quoted; only the suffix is Japanese.
    // Must pass.
    expect(
      validateLocaleScript(
        "「Radiant skincare」ブランドアイデンティティ",
        "ja",
      ),
    ).toBe(true)
    expect(validateLocaleScript("「Vero」アプリ開発", "ja")).toBe(true)
  })

  it("accepts brand names inside (parens) in CJK prose", () => {
    // Half-width and full-width parens both mark "this is a brand
    // / loanword reference, leave it alone".
    expect(validateLocaleScript("(Vero) アプリ開発", "ja")).toBe(true)
    expect(validateLocaleScript("（Vero）アプリ開発", "ja")).toBe(true)
  })

  it("accepts short Latin abbreviations (URL / Web / SEO) inline", () => {
    // ≤4 chars is below the contamination threshold. Common in
    // real Japanese tech writing where "URL" / "Web" / "SEO" stay
    // English. Don't false-positive.
    expect(validateLocaleScript("URLを確認してください", "ja")).toBe(true)
    expect(validateLocaleScript("Webサイトの設計", "ja")).toBe(true)
    expect(validateLocaleScript("SEO対策の基本", "ja")).toBe(true)
  })

  it("accepts 4-char unquoted brand names below the contamination threshold", () => {
    // Vero / Apex / Nike / Sony — designers may forget brand quotes
    // for short names. Threshold is 5+ to avoid false-positiving.
    expect(validateLocaleScript("Vero アプリ開発", "ja")).toBe(true)
    expect(validateLocaleScript("Apex 클럽", "ko")).toBe(true)
  })

  it("accepts multi-word Latin brand lines before Korean (Apex clothing Co.)", () => {
    const headline = "Apex clothing Co. 리브랜딩"
    const description = "친환경 의류 브랜드의 대담한 새 디자인."
    expect(hasLatinEmbeddedInCjk(headline)).toBe(false)
    expect(validateLocaleScript(headline, "ko")).toBe(true)
    expect(validateLocaleScript(description, "ko")).toBe(true)
  })
})

describe("hasHanGlyphViolations", () => {
  it("flags simplified-CN glyphs in Japanese (网 / 选 / 决)", () => {
    expect(hasHanGlyphViolations("网站", "ja")).toBe(true)
    expect(hasHanGlyphViolations("选择", "ja")).toBe(true)
    expect(hasHanGlyphViolations("决策", "ja")).toBe(true)
    const v = findHanGlyphViolations("网站", "ja")[0]
    expect(v?.found).toBe("网")
    expect(v?.expected).toBe("網")
  })

  it("does not flag legitimate Japanese kanji or shared 断", () => {
    expect(hasHanGlyphViolations("国学", "ja")).toBe(false)
    expect(hasHanGlyphViolations("当然", "ja")).toBe(false)
    expect(hasHanGlyphViolations("図書館", "ja")).toBe(false)
    expect(hasHanGlyphViolations("協業", "ja")).toBe(false)
    expect(hasHanGlyphViolations("すべての決断が重要", "ja")).toBe(false)
  })

  it("flags traditional forms with JP shinjitai equivalents", () => {
    expect(hasHanGlyphViolations("獨立系スタジオ", "ja")).toBe(true)
    expect(hasHanGlyphViolations("独立系スタジオ", "ja")).toBe(false)
  })

  it("flags simplified in zh-TW target", () => {
    expect(hasHanGlyphViolations("我们的网站", "zh-TW")).toBe(true)
    expect(hasHanGlyphViolations("我們的網站", "zh-TW")).toBe(false)
  })

  it("flags traditional in zh-CN target", () => {
    expect(hasHanGlyphViolations("我們的網站", "zh-CN")).toBe(true)
    expect(hasHanGlyphViolations("我们的网站", "zh-CN")).toBe(false)
  })
})

describe("requireTargetScript", () => {
  // Strict variant: drops the ≤16-char Latin escape hatch so
  // generic-placeholder fields like `defaultAuthor` can't sneak
  // through without being translated. This is what catches the
  // "Editorial Team" survives into ja-JP bug.

  it("rejects a Latin string that the lenient validator accepts (ja)", () => {
    // Same input, two answers — by design.
    expect(validateLocaleScript("Editorial Team", "ja")).toBe(true)
    expect(requireTargetScript("Editorial Team", "ja")).toBe(false)
  })

  it("accepts text that's actually in the target script", () => {
    expect(requireTargetScript("編集チーム", "ja")).toBe(true)
    expect(requireTargetScript("利用規約", "ja")).toBe(true)
    expect(requireTargetScript("編集部", "ja")).toBe(true)
    expect(requireTargetScript("편집팀", "ko")).toBe(true)
    expect(requireTargetScript("我们", "zh-CN")).toBe(true)
    expect(requireTargetScript("Редакция", "ru")).toBe(true)
    expect(requireTargetScript("هيئة", "ar")).toBe(true)
  })

  it("rejects empty / whitespace input", () => {
    expect(requireTargetScript("", "ja")).toBe(false)
    expect(requireTargetScript("   ", "ko")).toBe(false)
  })

  it("inherits cross-script pollution rejection from validateLocaleScript", () => {
    // Korean-in-JA, Chinese-only-kanji-in-JA → still rejected
    // (strict-mode adds the "must have native script" rule on
    // top, doesn't loosen the cross-script rules).
    expect(requireTargetScript("プライバシー 관련", "ja")).toBe(false)
    expect(requireTargetScript("の网站建设", "ja")).toBe(false)
  })

  it("is permissive for Latin-script locales (en/fr/es/…)", () => {
    // For Latin targets there's no "wrong script" failure mode —
    // strict and lenient must agree, otherwise we'd refuse every
    // legitimate English/French/etc translation.
    expect(requireTargetScript("Editorial Team", "en-US")).toBe(true)
    expect(requireTargetScript("Rédaction", "fr")).toBe(true)
    expect(requireTargetScript("Equipo editorial", "es")).toBe(true)
  })

  it("inherits Cyrillic + lowercase-Latin contamination rejection", () => {
    // The strict variant must also catch the new contamination
    // signals — otherwise schema-scan and other strict-mode callers
    // would silently accept polluted JA/KO/ZH translations even
    // when they have native script chars present.
    expect(
      requireTargetScript("ユーザー視点の сайте を決める", "ja"),
    ).toBe(false)
    expect(
      requireTargetScript("リデザインして.launchした軌跡", "ja"),
    ).toBe(false)
    expect(
      requireTargetScript("광채 피부관리 브랜드 identity", "ko"),
    ).toBe(false)
  })
})

describe("stripQuotedRegions", () => {
  // Pure helper isolation tests. The contamination check uses this
  // to avoid false-positiving on intentionally-Latin brand names
  // inside Japanese-style brackets.

  it("strips full-width corner brackets 「...」 (JP brand quotes)", () => {
    expect(stripQuotedRegions("「Radiant skincare」ブランド")).toBe(
      "ブランド",
    )
  })

  it("strips white corner brackets 『...』 (JP work titles)", () => {
    expect(stripQuotedRegions("『Vero』アプリ開発")).toBe("アプリ開発")
  })

  it("strips full-width parens （...）", () => {
    expect(stripQuotedRegions("これは（example）です")).toBe("これはです")
  })

  it("strips half-width parens (...) and ASCII / typographic quotes", () => {
    expect(stripQuotedRegions("Vero (a brand) here")).toBe("Vero  here")
    expect(stripQuotedRegions('say "hello" world')).toBe("say  world")
    expect(stripQuotedRegions("\u201chi\u201d there")).toBe(" there")
  })

  it("strips square brackets [...] (markdown-style)", () => {
    expect(stripQuotedRegions("foo [link] bar")).toBe("foo  bar")
  })

  it("leaves text untouched when no brackets present", () => {
    expect(stripQuotedRegions("plain text")).toBe("plain text")
    expect(stripQuotedRegions("")).toBe("")
  })
})

describe("hasLatinEmbeddedInCjk", () => {
  // The signal that catches ".launchした軌跡" / "광채 ... identity" /
  // "サイト designを..." — lowercase Latin runs inside CJK prose
  // that the AI failed to transliterate. Brand names (uppercase /
  // CamelCase / inside quotes) are intentionally allowed.

  it("flags 5+ char ALL-LOWERCASE Latin runs in CJK prose", () => {
    expect(hasLatinEmbeddedInCjk("リデザインして.launchした")).toBe(true)
    expect(hasLatinEmbeddedInCjk("브랜드 identity")).toBe(true)
    expect(hasLatinEmbeddedInCjk("サイト designを決める")).toBe(true)
  })

  it("does NOT flag CapitalizedWords (brand-name allowlist)", () => {
    // Brand names and capitalized loanwords always have at least
    // one uppercase letter — those pass through. Documenting this
    // explicitly because it's the trade-off that keeps the rule
    // from false-positiving on legitimate JA/KO marketing copy.
    expect(hasLatinEmbeddedInCjk("Designが重要")).toBe(false)
    expect(hasLatinEmbeddedInCjk("Polyglot AEOで自動化")).toBe(false)
    expect(hasLatinEmbeddedInCjk("LYNIQはスタジオです")).toBe(false)
    expect(hasLatinEmbeddedInCjk("iPhoneのアプリ")).toBe(false)
    expect(hasLatinEmbeddedInCjk("Framerプラグイン")).toBe(false)
  })

  it("ignores 4-char or shorter Latin runs (Vero, Apex, URL, SEO)", () => {
    expect(hasLatinEmbeddedInCjk("Vero アプリ")).toBe(false)
    expect(hasLatinEmbeddedInCjk("Apex 클럽")).toBe(false)
    expect(hasLatinEmbeddedInCjk("URLを確認")).toBe(false)
    expect(hasLatinEmbeddedInCjk("SEO対策")).toBe(false)
  })

  it("ignores Latin inside 「」 / 『』 / parens (brand-quoted regions)", () => {
    expect(
      hasLatinEmbeddedInCjk("「Radiant skincare」ブランド"),
    ).toBe(false)
    expect(hasLatinEmbeddedInCjk("『responsive design』が重要")).toBe(
      false,
    )
    expect(hasLatinEmbeddedInCjk("(vero studio) アプリ")).toBe(false)
  })

  it("returns false when no target-script chars present (Latin-only string)", () => {
    // A pure Latin string is the brand-name allowlist case — the
    // length-≤16 escape hatch in validateLocaleScript handles it,
    // and this helper deliberately doesn't fire.
    expect(hasLatinEmbeddedInCjk("Acme")).toBe(false)
    expect(hasLatinEmbeddedInCjk("radiant skincare")).toBe(false)
  })

  it("treats `_` `-` as joiners but NOT `.` (so filenames pass)", () => {
    // `react-router` stays a single 12-char lowercase run via `-`.
    // `.launch` is caught because the regex matches `launch` (6
    // chars) — the leading `.` is irrelevant.
    expect(hasLatinEmbeddedInCjk("した.launch軌跡")).toBe(true)
    expect(hasLatinEmbeddedInCjk("react-routerを使う")).toBe(true)
    // Filename references like `llms.txt` / `tsconfig.json` split
    // at the `.` so each segment stays under the 5-char threshold.
    // This is the regression target: a 2026-05 install reported
    // `llms.txt を一発で生成` was being flagged as contamination.
    expect(hasLatinEmbeddedInCjk("llms.txt を一発で生成")).toBe(false)
  })

  it("respects the configurable minRun threshold", () => {
    // Tighter (3) catches "url" and "web"; looser (8) ignores
    // "design". Production code uses default 5.
    expect(hasLatinEmbeddedInCjk("urlを確認", 3)).toBe(true)
    expect(hasLatinEmbeddedInCjk("designを変える", 8)).toBe(false)
  })

  it("does not flag lowercase words in a capitalized brand line", () => {
    expect(hasLatinEmbeddedInCjk("Apex clothing Co. 리브랜딩")).toBe(false)
    expect(hasLatinEmbeddedInCjk("Radiant skincare 브랜드")).toBe(false)
  })
})
