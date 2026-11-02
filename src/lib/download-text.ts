const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf])

/** UTF-8 bytes with BOM so Windows Notepad / Excel open CJK correctly. */
export function encodeUtf8TextFile(content: string): Uint8Array {
  const body = new TextEncoder().encode(content)
  const out = new Uint8Array(UTF8_BOM.length + body.length)
  out.set(UTF8_BOM)
  out.set(body, UTF8_BOM.length)
  return out
}

/** Trigger a UTF-8 plain-text download in the plugin iframe. */
export function downloadTextFile(filename: string, content: string): void {
  const bytes = encodeUtf8TextFile(content)
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "text/plain;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
