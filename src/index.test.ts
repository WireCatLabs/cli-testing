import { describe, expect, it } from "vitest"
import { SUITE_GROUPS } from "./index.js"

describe("SUITE_GROUPS", () => {
  it("names each group once", () => {
    expect(new Set(SUITE_GROUPS).size).toBe(SUITE_GROUPS.length)
  })
})
