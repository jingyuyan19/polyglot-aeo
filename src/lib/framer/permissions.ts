import { framer } from "framer-plugin"

/**
 * Framer plugin permission utilities.
 *
 * Background: the plugin SDK marks certain APIs (like `setPluginData` and
 * `setCustomCode`) as "protected" — calls to them require an explicit
 * `framer.isAllowedTo(...)` check first. Without one, dev builds emit a
 * console error AND a toast: "Invoking protected message type ... without
 * checking permissions first". Production builds silently allow the call
 * (today) but the SDK contract suggests this may be enforced later.
 *
 * Two reasons we care:
 *   1. The dev-toast pollutes the editor UI on every edit. Plugin
 *      reviewers (and our users in dev mode) see warnings that look
 *      like errors. Bad first impression.
 *   2. If a Framer admin restricts plugin permissions, our calls fail
 *      silently. We need to surface that to the user — silent settings
 *      loss / silent install failure is worse than a clear error.
 *
 * Strategy:
 *   - Call {@link registerProtectedMethodChecks} once on plugin mount.
 *     This pre-registers every protected method we ever use so the
 *     SDK's "checked-set" is satisfied — no more dev warnings.
 *   - Storage helpers and Custom Code helpers gate their writes via
 *     `framer.isAllowedTo(...)`. Storage write denials are silent
 *     (best-effort); Custom Code denials throw with an actionable
 *     error message.
 */

/**
 * Protected methods this plugin actually uses. Listed explicitly so
 * the type system tells us exactly what surface needs guards. Adding
 * a new protected call site requires adding the method here first.
 */
export type ProtectedMethodWeUse = "setPluginData" | "setCustomCode"

/**
 * One-shot bootstrap. Call once on plugin mount (before any
 * `setPluginData` / `setCustomCode` invocations) so the SDK's
 * "checked-set" includes our methods. Subsequent calls don't trigger
 * the dev-mode warning toast.
 *
 * Also returns the current allowed/denied state so callers can decide
 * to disable UI affordances at startup if needed — e.g. dim the Save
 * button when the plugin lacks `setPluginData` permission.
 */
export function registerProtectedMethodChecks(): {
  setPluginData: boolean
  setCustomCode: boolean
} {
  // Single call registers BOTH methods in the SDK's checked-set.
  framer.isAllowedTo("setPluginData", "setCustomCode")
  // Re-query individually so the booleans are correct (the multi-arg
  // form returns ALL-true rather than per-method state).
  return {
    setPluginData: framer.isAllowedTo("setPluginData"),
    setCustomCode: framer.isAllowedTo("setCustomCode"),
  }
}

/**
 * Re-export for ergonomics: callers prefer `isAllowedTo("setPluginData")`
 * to importing `framer` just for this. Identical behavior.
 */
export function isAllowedTo(method: ProtectedMethodWeUse): boolean {
  return framer.isAllowedTo(method)
}
