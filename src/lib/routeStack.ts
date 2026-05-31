/**
 * Pure helpers for the App-level route stack.
 *
 * The plugin's navigation is depth-aware: opening Settings from inside
 * a tool view should push onto the stack, and Back should pop *one*
 * level so the user lands on the tool they came from — not back at
 * Dashboard. These helpers exist as pure functions so the navigation
 * invariants (no duplicate-of-top, top-of-stack semantics, no crash
 * on empty pop) can be unit-tested without mounting React.
 *
 * The Dashboard is the implicit empty-stack state, NOT a stack
 * element. `topOf([])` returns null and the App component renders
 * Dashboard for that case.
 */

export type ToolRoute =
  | "control"
  | "cms"
  | "schema"
  | "llms"
  | "meta"
  | "verify"
  | "settings"

/**
 * Push a route onto the stack. If the route is already on top, returns
 * the same array (referentially equal) so React's setState bails out
 * without re-rendering. Without this guard, double-clicking the gear
 * icon would deepen the stack and require two Back presses.
 */
export function pushRoute(
  stack: readonly ToolRoute[],
  route: ToolRoute,
): ToolRoute[] {
  if (stack[stack.length - 1] === route) return stack as ToolRoute[]
  return [...stack, route]
}

/**
 * Remove the top entry. Empty stack → empty stack (no crash). Caller
 * is responsible for treating empty as "show Dashboard".
 */
export function popRoute(stack: readonly ToolRoute[]): ToolRoute[] {
  return stack.slice(0, -1)
}

/** Read the current view, or null when the stack is empty (Dashboard). */
export function topOf(stack: readonly ToolRoute[]): ToolRoute | null {
  return stack[stack.length - 1] ?? null
}
