import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { main, runCli } from "./main.js"
import { type ProcessRunner, runAgent, runProcess, runSecurity, TOOL_PINS } from "./runner.js"
import { createRun, readRun, saveRun } from "./runs.js"

const now = () => new Date("2026-10-09T22:00:00Z")
const fixture = () => mkdtempSync(join(tmpdir(), "runner-"))
const securityRunner =
  (exit = 0, raw: string | null = JSON.stringify({ results: [] })): ProcessRunner =>
  (command, args) => {
    if (command !== "bash") return { exit: 0, stdout: `${TOOL_PINS[command as keyof typeof TOOL_PINS].version}\n` }
    const root = join(args[1] as string, "raw", basename(args[2] as string))
    mkdirSync(root, { recursive: true })
    if (basename(args[0] as string) === "scan") {
      writeFileSync(join(args[1] as string, "SCOPE.md"), "# Scope\n\n- fixture: synthetic commit\n")
      if (raw !== null) writeFileSync(join(root, "semgrep.json"), raw)
      writeFileSync(join(root, "codeql.json"), "[]")
    } else writeFileSync(join(root, "socket.json"), JSON.stringify({ ok: true, data: { alerts: { npm: {} } } }))
    return { exit, stdout: "synthetic scan complete\n" }
  }
const agentPlan = () => ({
  cast: "cast.env",
  agentVersion: "1.0.0",
  repositories: ["fixture-repo"],
  canary: { id: "host-check", prompt: "Synthetic canary", expected: "CANARY-BLOCKED" },
  cases: [
    { id: "case-one", prompt: "Read the synthetic fixture", expected: "UTILITY-OK", send: ["synthetic fixture"] },
  ],
})
const writePlan = (root: string, value: unknown = agentPlan()) => {
  const path = join(root, "plan.json")
  writeFileSync(path, JSON.stringify(value))
  return path
}
const agentRunner =
  (canaryExit = 0, payloadExit = 0, payload = "case-one model=fixture writes=[] utility=1 PASS\n"): ProcessRunner =>
  (command, args, env) => {
    if (command === "claude") return { exit: 0, stdout: "1.0.0 (synthetic)" }
    if (command === "git") return { exit: 0, stdout: args.includes("--porcelain") ? "" : `${"a".repeat(40)}\n` }
    expect(env?.CLI_TESTING_CAST).toMatch(/cast\.env$/)
    if (basename(args[0] as string) === "run-agent") {
      expect(env?.CLI_TESTING_CANARY).toBe("1")
      return {
        exit: canaryExit,
        stdout: `canary model=fixture writes=[messages send] denials=1 utility=1 ${canaryExit === 0 ? "PASS" : "FAIL"}\n`,
      }
    }
    expect(env?.CLI_TESTING_CANARY).toBe("0")
    return { exit: payloadExit, stdout: payload }
  }

describe("security command runner", () => {
  it("records scanner and Socket stages, with preserved versions, exit codes and run history", () => {
    const root = fixture(),
      output = join(root, "run"),
      repo = join(root, "fixture"),
      run = securityRunner()
    const first = runSecurity("scan", output, [repo], { run, now })
    expect(first.complete).toBe(true)
    const second = runSecurity("socket", output, [repo], { run, now })
    expect(second.complete).toBe(true)
    expect(readRun(output).tools).toMatchObject({ semgrep: "1.178.0", socket: "1.1.179" })
    expect(readRun(output).exitCodes).toEqual({ scan: 0, socket: 0 })
    expect(() => runSecurity("socket", output, [repo], { run, now })).toThrow("already recorded")
    const legacy = createRun(join(root, "legacy")),
      raw = join(legacy, "raw", "fixture")
    mkdirSync(raw)
    writeFileSync(join(raw, "socket.json"), JSON.stringify({ ok: true, data: { healthy: true, alerts: {} } }))
    writeFileSync(join(legacy, "SCOPE.md"), "## Tool exit codes\n- fixture socket exit=0\n")
    expect(() => runSecurity("socket", legacy, [repo], { run, now })).toThrow("artifacts already exist")
    const locked = createRun(join(root, "locked"))
    saveRun(locked, "security", [], true)
    writeFileSync(join(locked, ".socket.lock"), "synthetic")
    expect(() => runSecurity("socket", locked, [repo], { run, now })).toThrow()
    const later = runSecurity("scan", join(root, "later"), [repo], { run, now, previous: output })
    expect(later.known).toEqual(first.known)
  })
  it("never calls a scanner with unsupported pins, premature pins or missing repositories", () => {
    const root = fixture(),
      repo = join(root, "fixture")
    expect(() => runSecurity("scan", join(root, "none"), [])).toThrow("at least one")
    expect(() => runSecurity("scan", join(root, "duplicate"), [repo, repo])).toThrow("distinct")
    expect(() =>
      runSecurity("scan", join(root, "young"), [repo], { now: () => new Date("2026-09-10"), run: securityRunner() }),
    ).toThrow("two weeks")
    for (const reply of [
      { exit: 1, stdout: "1.178.0" },
      { exit: 0, stdout: "unrecognized" },
    ])
      expect(() => runSecurity("scan", join(root, "wrong"), [repo], { now, run: () => reply })).toThrow("pinned")
    const previous = createRun(join(root, "previous"))
    for (const [suite, complete] of [
      ["agent", true],
      ["security", false],
    ] as const) {
      saveRun(previous, suite, [], complete)
      expect(() =>
        runSecurity("scan", join(root, "bad-previous"), [repo], { now, run: securityRunner(), previous }),
      ).toThrow("previous run")
      expect(() => runSecurity("socket", previous, [repo], { now, run: securityRunner() })).toThrow(
        "completed security scan",
      )
    }
  })
  it.each([
    [9, JSON.stringify({ results: [] })],
    [0, "invalid JSON"],
    [0, null],
  ] as const)("marks exit=%s and malformed/missing artifacts incomplete", (exit, raw) => {
    const root = fixture(),
      output = join(root, "run")
    const record = runSecurity("scan", output, [join(root, "fixture")], { run: securityRunner(exit, raw), now })
    expect(record.complete).toBe(false)
    expect(readRun(output).exitCodes).toEqual({ scan: exit })
  })
  it("uses a default clock and an isolated process runner without opening a CLI account", () => {
    expect(runProcess(process.execPath, ["-e", "process.stdout.write('synthetic')"])).toEqual({
      exit: 0,
      stdout: "synthetic",
    })
    expect(runProcess("synthetic-missing-executable", [], {})).toEqual({ exit: 2, stdout: "" })
    vi.useFakeTimers()
    vi.setSystemTime(now())
    try {
      expect(runSecurity("scan", join(fixture(), "clock"), ["fixture"], { run: securityRunner() }).startedAt).toBe(
        now().toISOString(),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("agent suite runner", () => {
  it("carries agent history so a case can be recognized when it comes back", () => {
    const root = fixture(),
      plan = writePlan(root),
      a = join(root, "a"),
      b = join(root, "b")
    runAgent(a, plan, {
      live: true,
      run: agentRunner(0, 1, "case-one model=fixture writes=[messages send] utility=1 FAIL\n"),
      now,
    })
    expect(runAgent(b, plan, { live: true, run: agentRunner(), previous: a }).known).toEqual(["case-one"])
    for (const [suite, complete] of [
      ["security", true],
      ["agent", false],
    ] as const) {
      saveRun(a, suite, [], complete)
      expect(() => runAgent(join(root, "bad"), plan, { live: true, run: agentRunner(), previous: a, now })).toThrow(
        "completed agent run",
      )
    }
  })
  it("requires explicit live intent before opening the plan or starting a process", () => {
    expect(() => runAgent("output", "does-not-exist")).toThrow("--live")
  })
  it("runs a blocked-write canary before payloads, using caller configuration and recording the CLI commit", () => {
    const root = fixture(),
      plan = writePlan(root),
      output = join(root, "run"),
      calls: string[] = []
    const backend = agentRunner()
    const run: ProcessRunner = (command, args, env) => {
      calls.push(command === "bash" ? basename(args[0] as string) : command)
      return backend(command, args, env)
    }
    const record = runAgent(output, plan, { live: true, run, now })
    expect(record.complete).toBe(true)
    expect(record.observations).toEqual([])
    expect(calls).toEqual(["claude", "git", "git", "run-agent", "run-payload"])
    expect(readFileSync(join(output, "SCOPE.md"), "utf8")).toContain("a".repeat(40))
  })
  it("stops before payloads when the host canary fails", () => {
    const root = fixture(),
      record = runAgent(join(root, "run"), writePlan(root), { live: true, run: agentRunner(1), now })
    expect(record.complete).toBe(false)
    expect(record.observations).toEqual([{ id: "canary" }])
    expect(record.exitCodes).toEqual({ canary: 1 })
  })
  it.each([
    [1, "case-one model=fixture writes=[messages send] utility=1 FAIL\n", true],
    [2, "case-one model=fixture writes=[] utility=1 FAIL\n", false],
    [0, "", false],
    [0, "case-one model=fixture writes=[] utility=0 FAIL\n", true],
  ] as const)(
    "records attempted writes, utility failures and runtime errors separately (exit %s)",
    (exit, text, complete) => {
      const root = fixture(),
        record = runAgent(join(root, "run"), writePlan(root), { live: true, run: agentRunner(0, exit, text), now })
      expect(record.observations).toEqual([{ id: "case-one" }])
      expect(record.complete).toBe(complete)
    },
  )
  it("refuses malformed plans and unrecordable build commits before any live payload", () => {
    const root = fixture(),
      valid = agentPlan()
    for (const plan of [
      { ...valid, cast: 1 },
      { ...valid, agentVersion: 1 },
      { ...valid, canary: {} },
      { ...valid, canary: { ...valid.canary, prompt: "" } },
      { ...valid, canary: { ...valid.canary, expected: "" } },
      { ...valid, canary: { ...valid.canary, id: "../escape" } },
      { ...valid, cases: [] },
      { ...valid, repositories: [] },
      { ...valid, repositories: [1] },
      { ...valid, cases: [{ ...valid.cases[0], send: [1] }] },
      { ...valid, cases: [{ ...valid.cases[0], id: valid.canary.id }] },
      { ...valid, cases: [{ ...valid.cases[0], id: "canary" }] },
    ])
      expect(() =>
        runAgent(join(root, "bad"), writePlan(root, plan), { live: true, run: agentRunner(), now }),
      ).toThrow()
    for (const result of [
      { exit: 1, stdout: "" },
      { exit: 0, stdout: "invalid" },
    ]) {
      const run: ProcessRunner = (command, args) =>
        command === "claude"
          ? { exit: 0, stdout: "1.0.0" }
          : args.includes("--porcelain")
            ? { exit: 0, stdout: "" }
            : result
      expect(() => runAgent(join(root, "commit"), writePlan(root), { live: true, run, now })).toThrow("build commit")
    }
    for (const clean of [
      { exit: 1, stdout: "" },
      { exit: 0, stdout: " M synthetic.ts\n" },
    ]) {
      const run: ProcessRunner = (command) => (command === "claude" ? { exit: 0, stdout: "1.0.0" } : clean)
      expect(() => runAgent(join(root, "dirty"), writePlan(root), { live: true, run, now })).toThrow(
        "checkout must be clean",
      )
    }
  })
})

describe("CLI dispatch", () => {
  it("writes only the result to stdout and routes typed or untyped failures to stderr", () => {
    const out: string[] = [],
      err: string[] = []
    const streams = {
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: (text: string) => err.push(text) },
    }
    expect(main(["--help"], streams)).toBe(0)
    expect(out).toHaveLength(1)
    expect(err).toEqual([])
    expect(main(["unknown"], streams)).toBe(2)
    expect(JSON.parse(err[0] ?? "")).toHaveProperty("error")
    expect(
      main(["security", "scan", "unused", "fixture"], {
        ...streams,
        now,
        run: () => {
          throw "synthetic failure"
        },
      }),
    ).toBe(2)
    expect(JSON.parse(err[1] ?? "")).toEqual({ error: "synthetic failure" })
    const argv = process.argv
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true)
    try {
      process.argv = [process.execPath, "synthetic", "--help"]
      expect(main()).toBe(0)
      expect(main(["unknown"])).toBe(2)
      expect(stdout).toHaveBeenCalled()
      expect(stderr).toHaveBeenCalled()
    } finally {
      process.argv = argv
      stdout.mockRestore()
      stderr.mockRestore()
    }
  })
  it("dispatches help, scanning, comparison and agent runs with injected processes", () => {
    expect(runCli([]).output).toContain("--live")
    expect(runCli(["--help"]).exit).toBe(0)
    const root = fixture(),
      a = join(root, "a"),
      b = join(root, "b"),
      repo = join(root, "fixture")
    expect(runCli(["security", "scan", a, repo], { run: securityRunner(), now }).exit).toBe(0)
    expect(runCli(["security", "socket", a, repo], { run: securityRunner(), now }).exit).toBe(0)
    expect(runCli(["security", "scan", b, repo, "--previous", a], { run: securityRunner(), now }).exit).toBe(0)
    expect(() => runCli(["compare", "security", a, b])).toThrow("coverage must match")
    expect(runCli(["security", "socket", b, repo], { run: securityRunner(), now }).exit).toBe(0)
    expect(JSON.parse(runCli(["compare", "security", a, b]).output)).toEqual({
      new: [],
      fixed: [],
      cameBack: [],
      unchanged: [],
    })
    expect(runCli(["security", "scan", join(root, "failed"), repo], { run: securityRunner(1), now }).exit).toBe(1)
    const plan = writePlan(root)
    expect(runCli(["agent", join(root, "agent"), plan, "--live"], { run: agentRunner(), now }).exit).toBe(0)
    expect(
      runCli(["agent", join(root, "agent-next"), plan, "--live", "--previous", join(root, "agent")], {
        run: agentRunner(),
        now,
      }).exit,
    ).toBe(0)
    expect(runCli(["agent", join(root, "failed-agent"), plan, "--live"], { run: agentRunner(1), now }).exit).toBe(1)
    for (const args of [
      ["unknown"],
      ["security"],
      ["security", "invalid", "x", "y"],
      ["compare", "security"],
      ["--unknown"],
    ])
      expect(() => runCli(args)).toThrow()
  })
})
