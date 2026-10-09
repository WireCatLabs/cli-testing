import { describe, expect, it } from "vitest"
import { compareRuns, type RunRecord, redactTranscript } from "./compare.js"

const record = (ids: string[], known = ids): RunRecord => ({
  schema: 1,
  suite: "security",
  observations: ids.map((id) => ({ id })),
  known,
  complete: true,
})

describe("run comparison", () => {
  it("distinguishes new, fixed, recurring and unchanged observations without duplicates", () => {
    expect(
      compareRuns(
        "security",
        record(["fixed", "same"], ["fixed", "same", "back"]),
        record(["same", "new", "back", "new"]),
      ),
    ).toEqual({
      new: ["new"],
      fixed: ["fixed"],
      cameBack: ["back"],
      unchanged: ["same"],
    })
    expect(compareRuns("security", record([]), record([]))).toEqual({ new: [], fixed: [], cameBack: [], unchanged: [] })
  })
  it("cannot interpret missing or failed evidence as a fix", () => {
    const valid = record([])
    for (const invalid of [
      { ...valid, schema: 2 },
      { ...valid, suite: "agent" },
      { ...valid, complete: false },
    ]) {
      expect(() => compareRuns("security", invalid as RunRecord, valid)).toThrow()
      expect(() => compareRuns("security", valid, invalid as RunRecord)).toThrow()
    }
  })
  it("refuses a comparison that drops a repository or scanner stage", () => {
    expect(() =>
      compareRuns(
        "security",
        { ...record([]), coverage: ["fixture:scan", "fixture:socket"] },
        { ...record([]), coverage: ["fixture:scan"] },
      ),
    ).toThrow("coverage must match")
    expect(() => compareRuns("security", { ...record([]), coverage: ["fixture:scan"] }, record([]))).toThrow(
      "coverage must match",
    )
    expect(
      compareRuns("security", { ...record([]), coverage: ["b", "a"] }, { ...record([]), coverage: ["a", "b"] }).fixed,
    ).toEqual([])
  })
  it("redacts transcript roots and generated identifiers before file snapshots", async () => {
    const transcript = "root=/synthetic-root/checkout\r\nid=11111111-2222-3333-4444-555555555555\r\n"
    const result = redactTranscript(transcript, ["/synthetic-root", "/synthetic-root/checkout"])
    await expect(result).toMatchFileSnapshot("cases/redactions/stdout.snap")
    expect(redactTranscript("unchanged")).toBe("unchanged")
    expect(() => redactTranscript("text", [""])).toThrow("cannot be empty")
  })
})
