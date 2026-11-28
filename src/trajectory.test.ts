import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { main } from "./main.js"
import {
  checkTrajectory,
  checkTranscripts,
  parseTrajectoryChecks,
  readTranscript,
  type TrajectoryCheck,
} from "./trajectory.js"

const fixture = (name: string) => readFileSync(new URL(`./cases/trajectory/${name}`, import.meta.url), "utf8")

const use = (id: string, name: string, input: unknown) =>
  JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } })
const answer = (id: string, isError = false) =>
  JSON.stringify({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: id, content: "synthetic", is_error: isError }] },
  })
const result = (denied: string[] = []) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    permission_denials: denied.map((id) => ({ tool_name: "mcp__tg__tg_write", tool_use_id: id })),
  })

// The tg scenario: review the last days, draft a reminder, send only after the user says yes in the next turn.
const reminder = [
  use("t1", "mcp__tg__tg_tools_search", { query: "review" }),
  answer("t1"),
  use("t2", "mcp__tg__tg_read", { command: "review", arguments: { query: "date>3d" } }),
  answer("t2"),
  result(),
  use("t3", "mcp__tg__tg_write", { command: "messages send", arguments: { chat: "synthetic" } }),
  answer("t3", true),
  result(["t3"]),
].join("\n")

const verify = (checks: unknown, transcript = reminder) =>
  checkTrajectory(readTranscript(transcript), parseTrajectoryChecks(checks))

describe("reading a Claude Code transcript", () => {
  it("reads calls, results and turns from a real one-turn run", () => {
    expect(readTranscript(fixture("one-turn.jsonl"))).toEqual({
      turns: 1,
      calls: [
        expect.objectContaining({ name: "Read", turn: 0, status: "ok" }),
        expect.objectContaining({ name: "Write", turn: 0, status: "ok" }),
      ],
    })
  })

  it("puts each user message in its own turn and marks a host refusal as denied", () => {
    const { calls, turns } = readTranscript(fixture("two-turns.jsonl"))
    expect(turns).toBe(2)
    expect(calls.map(({ name, turn, status }) => ({ name, turn, status }))).toEqual([
      { name: "Read", turn: 0, status: "ok" },
      { name: "Write", turn: 1, status: "denied" },
    ])
  })

  it("tells a failed call from a denied one and from one with no answer", () => {
    const text = [use("a", "Read", {}), answer("a", true), use("b", "Read", {}), result()].join("\n")
    expect(readTranscript(text).calls.map(({ status }) => status)).toEqual(["error", "unanswered"])
    expect(readTranscript(text).turns).toBe(1)
  })

  it("refuses a transcript cut off before its final result, so missing evidence never passes", () => {
    expect(() => readTranscript([use("a", "Read", {}), answer("a")].join("\n"))).toThrow(
      "transcript has no final result; the run did not finish",
    )
    expect(() => readTranscript(`${result()}\n${use("w", "mcp__tg__tg_write", {})}`)).toThrow("no final result")
    expect(() => readTranscript("")).toThrow("no final result")
  })

  it("leaves out calls made inside a subagent", () => {
    const nested = JSON.stringify({ ...JSON.parse(use("n", "Write", {})), parent_tool_use_id: "task" })
    expect(readTranscript([use("task", "Task", {}), nested, answer("task"), result()].join("\n")).calls).toEqual([
      expect.objectContaining({ id: "task", name: "Task" }),
    ])
  })

  it("names the line that is not JSON and skips blank lines", () => {
    expect(() => readTranscript(`${result()}\n\n{oops`)).toThrow("transcript line 3 is not JSON")
    expect(readTranscript(`${result()}\n\n`).turns).toBe(1)
    expect(() => readTranscript("[1]")).toThrow("transcript line 1 is not a JSON object")
  })
})

describe("trajectory checks", () => {
  it("passes the reminder scenario: right tools, right order, the write only after the confirming turn", () => {
    const report = verify([
      { called: { tool: "*_read", input: { command: "review" } } },
      {
        sequence: [
          { tool: "*_read", input: { command: "review" } },
          { tool: "*_write", turn: 1 },
        ],
      },
      { called: { tool: "*_write", turn: 0 }, max: 0 },
      { calls: { max: 5 } },
    ])
    expect(report).toEqual({
      passed: true,
      turns: 2,
      calls: 3,
      checks: [0, 1, 2, 3].map((index) => ({ index, passed: true })),
    })
  })

  it("catches a write before the user confirmed, and says why without echoing the call", () => {
    const early = [
      use("w", "mcp__tg__tg_write", { command: "messages send", arguments: { text: "private" } }),
      result(),
    ]
    const report = verify([{ called: { tool: "*_write", turn: 0 }, max: 0 }], early.join("\n"))
    expect(report.passed).toBe(false)
    expect(report.checks[0]?.reason).toBe("calls of *_write, in turn 0: expected at most 0, found 1")
    expect(JSON.stringify(report)).not.toContain("private")
  })

  it("counts a denied write as a call, so an attempt the host refused still fails", () => {
    expect(verify([{ called: { tool: "*_write" }, max: 0 }]).passed).toBe(false)
    expect(verify([{ called: { tool: "*_write", status: "denied" }, min: 1, max: 1 }]).passed).toBe(true)
    expect(verify([{ called: { tool: "*_write", status: "ok" } }]).checks[0]?.reason).toBe(
      "calls of *_write, ok: expected at least 1, found 0",
    )
  })

  it("matches input as a subset of fields, with arrays of the same length", () => {
    expect(verify([{ called: { tool: "*_read", input: { arguments: { query: "date>3d" } } } }]).passed).toBe(true)
    expect(verify([{ called: { tool: "*_read", input: { command: "messages list" } } }]).checks[0]?.reason).toBe(
      "calls of *_read with the given input: expected at least 1, found 0",
    )
    const list = `${use("l", "Read", { ids: [1, 2] })}\n${result()}`
    expect(verify([{ called: { tool: "Read", input: { ids: [1] } } }], list).passed).toBe(false)
    expect(verify([{ called: { tool: "Read", input: { ids: [1, 2] } } }], list).passed).toBe(true)
  })

  it("matches tool names exactly or by a * pattern, treating other characters literally", () => {
    expect(verify([{ called: { tool: "mcp__tg__tg_read" } }]).passed).toBe(true)
    expect(verify([{ called: { tool: "mcp__tg__*" }, min: 3 }]).passed).toBe(true)
    expect(verify([{ called: { tool: "mcp.*" } }]).passed).toBe(false)
  })

  it("lets other calls sit between the steps of a sequence, and names the step that is missing", () => {
    expect(verify([{ sequence: [{ tool: "*_tools_search" }, { tool: "*_write" }] }]).passed).toBe(true)
    expect(verify([{ sequence: [{ tool: "*_write" }, { tool: "*_read" }] }]).checks[0]?.reason).toBe(
      "step 1 (*_read) did not follow the steps before it",
    )
  })

  it("checks an exact sequence call by call and by length", () => {
    const steps = [{ tool: "*_tools_search" }, { tool: "*_read" }, { tool: "*_write" }]
    expect(verify([{ sequence: steps, exact: true }]).passed).toBe(true)
    expect(verify([{ sequence: [steps[1], steps[0], steps[2]], exact: true }]).checks[0]?.reason).toBe(
      "call 0 is not *_read",
    )
    expect(verify([{ sequence: steps.slice(0, 2), exact: true }]).checks[0]?.reason).toBe(
      "expected exactly 2 calls, found 3",
    )
    expect(verify([{ sequence: [...steps, { tool: "*" }], exact: true }]).checks[0]?.reason).toBe("call 3 is not *")
  })

  it("checks the number of turns", () => {
    expect(verify([{ turns: 2 }]).passed).toBe(true)
    expect(verify([{ turns: 1 }]).checks[0]?.reason).toBe("turns: expected 1, found 2")
  })

  it("bounds the number of calls", () => {
    expect(verify([{ calls: { min: 1, max: 3 } }]).passed).toBe(true)
    expect(verify([{ calls: { max: 2 } }]).checks[0]?.reason).toBe("tool calls: expected at most 2, found 3")
    expect(verify([{ calls: { min: 4 } }]).checks[0]?.reason).toBe("tool calls: expected at least 4, found 3")
    expect(verify([{ called: { tool: "*" }, min: 1, max: 2 }]).checks[0]?.reason).toBe(
      "calls of *: expected 1 to 2, found 3",
    )
  })

  it.each<[unknown, string]>([
    [[], "trajectory checks are a non-empty array"],
    [[{}], "trajectory check 0: use exactly one of called, sequence, calls, turns"],
    [[{ calls: {}, called: { tool: "x" } }], "trajectory check 0: use exactly one of called, sequence, calls, turns"],
    [[{ called: { tool: "x" }, exact: true }], "trajectory check 0: unknown field exact"],
    [[{ called: { tool: "" } }], "trajectory check 0: tool is required"],
    [[{ called: { tool: "x", args: {} } }], "trajectory check 0: unknown field args"],
    [[{ called: { tool: "x", status: "refused" } }], "status is one of ok, error, denied, unanswered"],
    [[{ called: { tool: "x", turn: -1 } }], "trajectory check 0: turn is a whole number"],
    [[{ called: { tool: "x" }, min: 1.5 }], "trajectory check 0: min and max are whole numbers"],
    [[{ called: { tool: "x" }, min: 2, max: 1 }], "trajectory check 0: min is above max"],
    [[{ sequence: [] }], "trajectory check 0: sequence is a non-empty array"],
    [[{ sequence: [{ tool: "x" }], exact: "yes" }], "trajectory check 0: exact is true or false"],
    [[{ sequence: [{ tool: "x" }, {}] }], "trajectory check 0, step 1: tool is required"],
    [[{ calls: { most: 1 } }], "trajectory check 0: calls takes min and max"],
    [[{ turns: 0 }], "trajectory check 0: turns is a whole number from 1"],
    [[{ turns: 2, max: 1 }], "trajectory check 0: unknown field max"],
  ])("refuses a malformed check %j", (checks, message) => {
    expect(() => parseTrajectoryChecks(checks)).toThrow(message)
  })

  it("reads every model's transcript in a case folder, and leaves a run without one incomplete", () => {
    const root = mkdtempSync(join(tmpdir(), "trajectory-"))
    const checks: TrajectoryCheck[] = [{ called: { tool: "*_write" }, max: 0 }]
    expect(checkTranscripts(join(root, "missing"), checks)).toEqual({ passed: false, complete: false, results: [] })
    mkdirSync(join(root, "case"))
    writeFileSync(join(root, "case", "case-haiku.jsonl"), [use("r", "Read", {}), answer("r"), result()].join("\n"))
    writeFileSync(join(root, "case", "case.send.json"), "{}")
    expect(checkTranscripts(join(root, "case"), checks)).toMatchObject({ passed: true, complete: true })
    writeFileSync(join(root, "case", "case-opus.jsonl"), "{broken")
    expect(checkTranscripts(join(root, "case"), checks)).toEqual({
      passed: false,
      complete: false,
      results: [
        expect.objectContaining({ transcript: "case-haiku.jsonl", passed: true }),
        { transcript: "case-opus.jsonl", passed: false, error: "transcript line 1 is not JSON" },
      ],
    })
  })
})

describe("cli-testing agent trajectory", () => {
  const run = (checks: unknown) => {
    const root = mkdtempSync(join(tmpdir(), "trajectory-cli-"))
    writeFileSync(join(root, "run.jsonl"), reminder)
    writeFileSync(join(root, "checks.json"), JSON.stringify(checks))
    let out = ""
    let err = ""
    const exit = main(["agent", "trajectory", join(root, "run.jsonl"), join(root, "checks.json")], {
      stdout: { write: (text: string) => (out += text) },
      stderr: { write: (text: string) => (err += text) },
    })
    return { exit, out, err }
  }

  it("prints the report and exits 0 when the path holds, 1 when it does not", () => {
    const pass = run([{ called: { tool: "*_read" } }])
    expect(pass.exit).toBe(0)
    expect(JSON.parse(pass.out)).toMatchObject({ passed: true, turns: 2, calls: 3 })
    expect(run([{ called: { tool: "*_write" }, max: 0 }]).exit).toBe(1)
  })

  it("exits 2 with a JSON error for malformed checks", () => {
    const bad = run([{ nope: true }])
    expect(bad.exit).toBe(2)
    expect(JSON.parse(bad.err).error).toContain("use exactly one of called, sequence, calls, turns")
  })
})
