export type HanGlyphKind = "simplified" | "traditional"

export interface HanGlyphViolation {
  found: string
  expected: string
  kind: HanGlyphKind
}

export interface JaPhraseViolation {
  found: string
  expected: string
  kind: HanGlyphKind
}
