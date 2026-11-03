import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import mkcert from "vite-plugin-mkcert"
import framer from "vite-plugin-framer"

/**
 * framer-plugin/framer.css @imports Inter from Google Fonts at runtime.
 * Framer's Marketplace review asks for bundled fonts instead, so drop that
 * import; src/main.tsx loads the bundled @fontsource-variable/inter.
 */
export function stripRemoteFontImport(): Plugin {
  return {
    name: "strip-remote-font-import",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("\\").join("/").includes("framer-plugin/styles/framer.css")) return null
      return code.replace(/@import\s+url\(\s*["']?https:\/\/fonts\.googleapis\.com[^)]*\)\s*;?/g, "")
    },
  }
}

export default defineConfig({
  plugins: [stripRemoteFontImport(), react(), mkcert(), framer()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
})
