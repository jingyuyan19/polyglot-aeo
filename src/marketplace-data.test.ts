import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Pre-upload check for Framer's Marketplace data review, which has rejected
 * plugins for sending site- or project-derived data (hostname, project name,
 * published URL) to external services without strict need.
 */

const SRC = join(__dirname)

function shippedFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return shippedFiles(path)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
    return [path]
  })
}

/** Source with comments removed, so documentation mentioning an API is not a finding. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const files = shippedFiles(SRC).map((path) => ({
  path: relative(SRC, path).split("\\").join("/"),
  content: code(readFileSync(path, "utf8")),
}))

/** Every read of project or publish info, and why it is acceptable. */
const ALLOWED_PROJECT_READS: Record<string, string> = {
  "lib/license/service.ts": "hashed project id: one Pro activation per project",
  "lib/framer/project.ts": "hashed project id, used locally",
  "lib/aeo/run-published-verification.ts": "published URL for the user-run live verification",
  "lib/framer/site-scan.ts": "published URL for the user-run site scan",
  "views/MetaAiView.tsx": "published URL shown and checked when the user runs Meta AI",
}

describe("Marketplace data review", () => {
  it("never reads the plugin host's location, referrer or user agent", () => {
    for (const { path, content } of files) {
      expect(content, path).not.toMatch(
        /window\.location\.(?:hostname|host|href|origin)|document\.referrer|navigator\.userAgent/,
      )
    }
  })

  it("reads project or publish info only in reviewed files", () => {
    const readers = files
      .filter(({ content }) => /framer\.get(?:ProjectInfo|PublishInfo)\(/.test(content))
      .map(({ path }) => path)
    expect(readers.filter((path) => !(path in ALLOWED_PROJECT_READS))).toEqual([])
  })

  it("never reads the Framer project name", () => {
    for (const { path, content } of files) {
      expect(content, path).not.toMatch(/getProjectInfo\(\)[\s\S]{0,240}?\binfo\.name\b/)
    }
  })

  it("checkout links carry no project id", () => {
    const api = files.find(({ path }) => path === "lib/license/api.ts")?.content ?? ""
    const checkout = api.slice(api.indexOf("export function buildCheckoutUrl"), api.indexOf("async function postJson"))
    expect(checkout).toContain("buildDirectCheckoutUrl")
    expect(checkout).not.toMatch(/project_id|projectId/)
  })
})
