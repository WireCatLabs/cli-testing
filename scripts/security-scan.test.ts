import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync(
    "git",
    ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  )
  if (result.status !== 0) throw new Error(result.stderr)
}

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "security-scan-")),
    bin = join(root, "bin")
  mkdirSync(bin)
  const executable = (name: string, body: string) =>
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o700 })
  executable("osv-scanner", 'echo "{}"')
  executable("zizmor", 'echo "[]"')
  executable("gh", 'case "$*" in *code-scanning/alerts*) echo "[[]]" ;; *) echo synthetic ;; esac')
  executable(
    "semgrep",
    `case "$PWD" in */broken) exit 2 ;; esac
echo '{"results":[],"errors":[{"type":"Internal matching error","level":"warn","rule_id":"synthetic.rule","path":"ci.yml"}],"paths":{"scanned":["a.js"]}}'`,
  )
  const checkout = (name: string) => {
    const origin = join(root, "origin", name),
      path = join(root, name)
    mkdirSync(origin, { recursive: true })
    git(origin, "init", "-q", "-b", "main")
    writeFileSync(join(origin, "a.js"), "export const a = 1\n")
    writeFileSync(join(origin, ".semgrepignore"), "# synthetic\nfixtures/\n")
    mkdirSync(join(origin, ".github"))
    writeFileSync(join(origin, ".github/ci.yml"), "on: push\n")
    git(origin, "add", ".")
    git(origin, "commit", "-q", "-m", "fixture")
    git(root, "clone", "-q", origin, path)
    return path
  }
  return { root, bin, repositories: [checkout("broken"), checkout("good")] }
}

describe("security scan", () => {
  it("records a failed repository, scans the rest, then exits 1", () => {
    const { root, bin, repositories } = fixture()
    const run = join(root, "run")
    const result = spawnSync("bash", [resolve("scripts/security/scan"), run, ...repositories], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("failed: broken semgrep")
    expect(existsSync(join(run, "raw/good/semgrep.json"))).toBe(true)
    expect(existsSync(join(run, "raw/broken/semgrep.json"))).toBe(false)
    const scope = readFileSync(join(run, "SCOPE.md"), "utf8")
    expect(scope).toContain("- broken semgrep exit=1")
    expect(scope).toContain("- broken zizmor exit=0")
    expect(scope).toContain("- good semgrep exit=0")
    expect(scope).toContain("- good semgrep ignores fixtures/")
    expect(scope).toContain("- good semgrep gap synthetic.rule ci.yml")
    expect(scope).toContain("- good codeql open_alerts=0")
  })
})
