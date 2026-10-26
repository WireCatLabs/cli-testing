import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { describe, expect, it } from "vitest"
import { runCli } from "./main.js"
import { securityPreflight } from "./preflight.js"
import { type ProcessRunner, TOOL_PINS } from "./runner.js"

const now = () => new Date("2026-10-16T00:00:00Z")
const fixture = () => mkdtempSync(join(tmpdir(), "preflight-"))
const backend =
  (calls: string[], { codeql = true, visibility = "public" } = {}): ProcessRunner =>
  (command, args) => {
    calls.push(`${command} ${args.join(" ")}`)
    if (command === "git" && args.includes("get-url")) {
      const name = basename(args[1] as string)
      return { exit: 0, stdout: `git@github.com:fixture/${name === "cli-messaging" ? "cli-core" : name}.git\n` }
    }
    if (command === "git" && args.includes("rev-parse")) return { exit: 0, stdout: `${"a".repeat(40)}\n` }
    if (command === "gh" && args[0] === "api")
      return args.includes("type")
        ? { exit: codeql ? 0 : 1, stdout: codeql ? "array\n" : "" }
        : { exit: 0, stdout: `${visibility}\n` }
    if (args.length === 1 && (args[0] === "--version" || args[0] === "version"))
      return { exit: 0, stdout: `${TOOL_PINS[command as keyof typeof TOOL_PINS]?.version ?? "synthetic-version"}\n` }
    throw new Error("Preflight attempted a non-preflight operation")
  }

describe("security preflight", () => {
  it("accepts the canonical symlink without scanning source or creating run artifacts", () => {
    const root = fixture(),
      target = join(root, "cli-messaging"),
      alias = join(root, "cli-core"),
      calls: string[] = []
    mkdirSync(target)
    symlinkSync(target, alias)
    const result = runCli(["security", "preflight", alias], { run: backend(calls), now })
    expect(result.exit).toBe(0)
    const report = JSON.parse(result.output)
    expect(report.ready).toBe(true)
    expect(report.baseline).toBe("new")
    expect(report.manualStages).toHaveLength(3)
    expect(calls.some((call) => call.includes("security/scan") || call.startsWith("socket "))).toBe(false)
    const duplicate = securityPreflight([alias, target], { run: backend([]), now })
    expect(duplicate.ready).toBe(false)
    expect(duplicate.checks).toContainEqual(expect.objectContaining({ name: "cli-messaging identity", status: "fail" }))
  })

  it("requires a complete recorded comparison baseline without changing historical records", () => {
    const root = fixture(),
      repo = join(root, "public-repo"),
      previous = join(root, "previous")
    mkdirSync(repo)
    mkdirSync(previous)
    const path = join(previous, "run.json")
    const record = {
      schema: 1,
      suite: "security",
      complete: true,
      observations: [],
      known: [],
      coverage: ['["public-repo","semgrep"]'],
    }
    for (const value of [
      "invalid JSON",
      JSON.stringify({ ...record, complete: false }),
      JSON.stringify({ ...record, coverage: [] }),
      JSON.stringify({ ...record, suite: "agent" }),
    ]) {
      writeFileSync(path, value)
      expect(securityPreflight([repo], { run: backend([]), now, previous }).ready).toBe(false)
      expect(readFileSync(path, "utf8")).toBe(value)
    }
    writeFileSync(path, JSON.stringify(record))
    const ready = securityPreflight([repo], { run: backend([]), now, previous })
    expect(ready.ready).toBe(true)
    expect(ready.baseline).toBe("comparison")
    expect(securityPreflight([repo], { run: backend([]), now, previous: join(root, "missing") }).ready).toBe(false)
  })

  it("reports inaccessible CodeQL and private sources before any scanner runs", () => {
    const root = fixture(),
      repo = join(root, "public-repo")
    mkdirSync(repo)
    const gap = securityPreflight([repo], { run: backend([], { codeql: false }), now })
    expect(gap.ready).toBe(false)
    expect(gap.checks).toContainEqual(expect.objectContaining({ name: "public-repo CodeQL", status: "fail" }))
    const calls: string[] = []
    const privateSource = securityPreflight([repo], { run: backend(calls, { visibility: "private" }), now })
    expect(privateSource.ready).toBe(false)
    expect(calls.some((call) => call.includes("code-scanning"))).toBe(false)
  })

  it("reports missing commands, unsupported pins, young pins and absent checkouts together", () => {
    const root = fixture()
    const result = securityPreflight([join(root, "missing")], {
      run: () => ({ exit: 2, stdout: "unavailable" }),
      now: () => new Date("2026-09-01"),
    })
    expect(result.ready).toBe(false)
    expect(result.checks.filter((check) => check.status === "fail").length).toBeGreaterThan(10)
    expect(securityPreflight([], { run: backend([]), now }).ready).toBe(false)
  })
})
