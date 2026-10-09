import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { collectObservations, createRun, readRun, saveRun } from "./runs.js"

const fixture = () => mkdtempSync(join(tmpdir(), "runs-"))

describe("run folders", () => {
  it("reads legacy scanner runs without changing their record, including paginated CodeQL output", () => {
    const root = createRun(join(fixture(), "legacy")),
      repo = join(root, "raw", "fixture")
    mkdirSync(repo)
    writeFileSync(
      join(repo, "codeql.json"),
      '[{"number":1,"rule":{"id":"synthetic-a"}}]\n[{"number":2,"rule":{"id":"synthetic-b"}}]\n',
    )
    const scope =
      "# Scope\n## Tool exit codes\n- fixture osv-scanner exit=1\n- fixture semgrep exit=0\n- fixture zizmor exit=13\n"
    writeFileSync(join(root, "SCOPE.md"), scope)
    expect(readRun(root)).toMatchObject({
      suite: "security",
      complete: true,
      observations: [{ id: expect.any(String) }, { id: expect.any(String) }],
    })
    expect(existsSync(join(root, "run.json"))).toBe(false)
    expect(readFileSync(join(root, "SCOPE.md"), "utf8")).toBe(scope)
    for (const invalid of [
      "# Scope",
      "## Tool exit codes",
      `${scope}- fixture unknown exit=0\n`,
      `${scope}- fixture semgrep exit=2\n`,
    ]) {
      writeFileSync(join(root, "SCOPE.md"), invalid)
      expect(readRun(root).complete).toBe(false)
    }
    writeFileSync(join(repo, "semgrep.json"), "invalid JSON")
    expect(() => collectObservations(root)).toThrow("invalid scanner JSON")
  })
  it("creates a private layout, keeps history and appends a report without erasing manual review", () => {
    const root = fixture(),
      output = createRun(join(root, "nested", "first"))
    expect(existsSync(join(output, "raw"))).toBe(true)
    const first = saveRun(output, "security", [{ id: "synthetic" }], true)
    const next = createRun(join(root, "next"))
    const second = saveRun(next, "security", [], true, first)
    expect(readRun(next)).toEqual(second)
    expect(second.known).toEqual(["synthetic"])
    expect(readFileSync(join(next, "REPORT.md"), "utf8")).toContain("manual review")
    expect(readFileSync(join(next, "REPORT.md"), "utf8")).toContain("completed")
    saveRun(next, "security", [], false, second)
    expect(readFileSync(join(next, "REPORT.md"), "utf8")).toContain("incomplete")
    expect(() => createRun(output)).toThrow()
  })

  it("refuses public output through typed paths and aliases while allowing a private worktree", () => {
    const root = fixture(),
      publicRoot = join(root, "public")
    mkdirSync(publicRoot)
    writeFileSync(join(publicRoot, "package.json"), JSON.stringify({ name: "@wirecat/cli-testing" }))
    const alias = join(root, "alias")
    symlinkSync(publicRoot, alias, "junction")
    for (const path of [publicRoot, alias]) expect(() => createRun(join(path, "report"))).toThrow("public")
    const privateRoot = join(publicRoot, ".worktrees", "private")
    mkdirSync(privateRoot, { recursive: true })
    writeFileSync(join(privateRoot, ".git"), "gitdir: synthetic")
    expect(createRun(join(privateRoot, "run"))).toBe(join(privateRoot, "run"))
    const other = join(root, "other")
    mkdirSync(other)
    writeFileSync(join(other, "package.json"), JSON.stringify({ name: "synthetic-other" }))
    expect(createRun(join(other, "run"))).toBe(join(other, "run"))
    const malformed = join(root, "malformed")
    mkdirSync(malformed)
    writeFileSync(join(malformed, "package.json"), "invalid JSON")
    expect(() => createRun(join(malformed, "run"))).toThrow()
  })

  it("reads only regular scanner JSON files and rejects malformed records", () => {
    const root = createRun(join(fixture(), "run")),
      raw = join(root, "raw"),
      repo = join(raw, "fixture")
    mkdirSync(repo)
    writeFileSync(join(raw, "note.txt"), "synthetic")
    symlinkSync(repo, join(raw, "alias"), "junction")
    mkdirSync(join(repo, "ignored.json"))
    writeFileSync(join(repo, "note.txt"), "synthetic")
    writeFileSync(join(repo, "semgrep.json"), JSON.stringify({ results: [] }))
    symlinkSync(join(repo, "semgrep.json"), join(repo, "alias.json"))
    expect(collectObservations(root)).toEqual([])
    const valid = saveRun(root, "security", [], true)
    for (const value of [
      { ...valid, schema: 2 },
      { ...valid, suite: null },
      { ...valid, complete: 1 },
      { ...valid, observations: null },
      { ...valid, observations: [{}] },
      { ...valid, known: null },
      { ...valid, known: [1] },
    ]) {
      writeFileSync(join(root, "run.json"), JSON.stringify(value))
      expect(() => readRun(root)).toThrow("invalid run record")
    }
  })
})
