import { defineConfig } from "vitest/config"

/**
 * Two test tiers, separated by filename suffix:
 *
 *   *.test.ts       — pure unit tests. No network, no API keys, runs in
 *                     <1s. These run on `npm test` and in CI on every commit.
 *
 *   *.live.test.ts  — live-API integration tests. Each test reads its key
 *                     from an env var and self-skips when the var is empty,
 *                     so it's safe to run with whichever subset of provider
 *                     keys you happen to have. Run via `npm run test:live`.
 *
 * Keeping them separate prevents two failure modes:
 *   1. Slow / flaky live calls polluting the fast unit-test loop.
 *   2. CI accidentally running paid API calls or leaking keys.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/*.live.test.ts", "node_modules/**"],
    environment: "node",
  },
})
