/**
 * SSRF-safe URL checks for published-site verification.
 * Keep in sync with `api/worker.js` (`isAllowedVerifyUrl`).
 */
export function isPublicHttpsUrl(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  if (parsed.username || parsed.password) return false

  const host = parsed.hostname.toLowerCase()
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return false
  }
  if (host.startsWith("[") && host.endsWith("]")) return false
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") {
    return false
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) return false

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [, a, b] = ipv4.map(Number)
    if (a === 10) return false
    if (a === 127) return false
    if (a === 0) return false
    if (a === 169 && b === 254) return false
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
  }

  return true
}
