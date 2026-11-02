/**
 * DEPLOY.md bundled into the llms.txt ZIP for offline handoff.
 */
export function buildLlmsDeployReadme(options: {
  siteName: string
  baseUrl: string
  filenames: string[]
  framerStaticFilesUrl: string
}): string {
  const files =
    options.filenames.length > 0
      ? options.filenames.map((f) => `- \`${f}\` → \`/${f}\``).join("\n")
      : "- (no files in this export)"

  return `# Deploy llms.txt on Framer

Site: ${options.siteName}
Base URL: ${options.baseUrl}

## Steps

1. Unzip this archive.
2. In Framer: **Domains → your domain → Files** (Framer Pro+ required).
3. Upload each file to the **site root** (not inside a folder):

${files}

4. **Publish** the site so \`/llms.txt\` and locale variants go live.
5. In Polyglot AEO: run **Published-site verifier** to confirm HTTP 200 on each path.

## Framer guide

${options.framerStaticFilesUrl}

## Notes

- Polyglot AEO cannot upload root files via the Plugin SDK — manual upload is required.
- Meta tags are pasted per page in Framer Page settings (Title / Page Description).
- JSON-LD is installed via Polyglot AEO → Schema → Install (Custom Code).
`
}
