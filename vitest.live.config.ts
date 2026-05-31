import { defineConfig } from "vitest/config"

/**
 * Live-API test config. Picks up only `*.live.test.ts` files and gives them
 * a longer timeout because real network round-trips to OpenAI / Anthropic /
 * MiniMax / etc. routinely take 5–15 seconds for a single completion.
 *
 * Each test inside a live file is responsible for skipping itself when its
 * env var is missing — see `src/lib/ai/providers/providers.live.test.ts`
 * for the canonical pattern.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.live.test.ts"],
    environment: "node",
    // Some 2026-era reasoning models (MiniMax M-series, DeepSeek R1,
    // Kimi K2 Thinking) routinely take 20-60s for a single completion
    // because they emit a long internal chain-of-thought. 90s gives
    // headroom without masking real hangs.
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
})
