import { describe, expect, it } from "vitest"

import {
  countPublishedVerificationFailures,
  type PublishedVerificationCheck,
} from "./run-published-verification"

describe("countPublishedVerificationFailures", () => {
  it("counts fail and warn, not pass", () => {
    const checks: PublishedVerificationCheck[] = [
      { id: "homepage", status: "pass" },
      { id: "schema", status: "fail" },
      { id: "llms:llms.txt", status: "warn" },
    ]
    expect(countPublishedVerificationFailures(checks)).toBe(2)
  })
})
