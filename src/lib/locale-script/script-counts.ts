export interface ScriptCounts {
  hiragana: number
  katakana: number
  han: number
  hangul: number
  arabic: number
  cyrillic: number
  latin: number
}

export function scriptCounts(s: string): ScriptCounts {
  const c: ScriptCounts = {
    hiragana: 0,
    katakana: 0,
    han: 0,
    hangul: 0,
    arabic: 0,
    cyrillic: 0,
    latin: 0,
  }
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x3040 && code <= 0x309f) c.hiragana++
    else if (code >= 0x30a0 && code <= 0x30ff) c.katakana++
    else if (
      (code >= 0x3400 && code <= 0x9fff) ||
      (code >= 0x20000 && code <= 0x2ffff)
    )
      c.han++
    else if (code >= 0xac00 && code <= 0xd7af) c.hangul++
    else if (code >= 0x0600 && code <= 0x06ff) c.arabic++
    else if (
      (code >= 0x0400 && code <= 0x04ff) ||
      (code >= 0x0500 && code <= 0x052f)
    )
      c.cyrillic++
    else if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a)
    )
      c.latin++
  }
  return c
}

export function isHanChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0x20000 && code <= 0x2ffff)
  )
}
