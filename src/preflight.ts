import { existsSync, realpathSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { type ProcessRunner, runProcess, TOOL_PINS } from "./runner.js"
import { readRun } from "./runs.js"

export interface PreflightCheck {
  name: string
  status: "pass" | "fail"
  detail: string
}

export const securityPreflight = (
  repositories: string[],
  {
    run = runProcess,
    now = () => new Date(),
    previous,
  }: { run?: ProcessRunner; now?: () => Date; previous?: string } = {},
) => {
  const checks: PreflightCheck[] = []
  const add = (name: string, passed: boolean, detail: string) =>
    checks.push({ name, status: passed ? "pass" : "fail", detail })
  for (const [name, args] of [
    ["git", ["--version"]],
    ["bash", ["--version"]],
    ["node", ["--version"]],
    ["pnpm", ["--version"]],
    ["gh", ["--version"]],
    ["jq", ["--version"]],
    ["gitleaks", ["version"]],
  ] as const)
    add(name, run(name, [...args]).exit === 0, "command must be available; record its version in SCOPE.md")

  for (const [name, pin] of Object.entries(TOOL_PINS)) {
    const oldEnough = now().getTime() - Date.parse(pin.released) >= 14 * 86_400_000
    add(`${name} pin age`, oldEnough, `${pin.version} must be at least two weeks old`)
    if (name === "socket") continue
    const version = run(name, ["--version"])
    add(name, version.exit === 0 && version.stdout.split(/\s+/).includes(pin.version), `requires ${pin.version}`)
  }

  add("repositories", repositories.length > 0, "supply the public repository checkouts explicitly")
  const physical = new Set<string>()
  const names = new Set<string>()
  for (const repository of repositories) {
    const path = resolve(repository)
    const name = basename(path)
    let target: string
    try {
      target = realpathSync(path)
    } catch {
      add(path, false, "checkout directory does not exist")
      continue
    }
    const distinct = !physical.has(target) && !names.has(name)
    physical.add(target)
    names.add(name)
    add(`${name} identity`, distinct, "scan each physical checkout once, with distinct folder names")
    const remote = run("git", ["-C", path, "remote", "get-url", "origin"])
    const slug = remote.stdout
      .trim()
      .match(/^(?:git@github\.com:|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1]
    const head = run("git", ["-C", path, "rev-parse", "--verify", "origin/main^{commit}"])
    add(`${name} main`, head.exit === 0 && /^[0-9a-f]{40}\s*$/.test(head.stdout), "fetch origin/main before the scan")
    const identified = remote.exit === 0 && slug !== undefined
    add(`${name} origin`, identified, `${slug ?? "unrecognized origin"}; use stable distinct checkout names`)
    if (!identified || slug === undefined) continue
    const metadata = run("gh", ["api", `repos/${slug}`, "--jq", ".visibility"])
    add(
      `${name} access`,
      metadata.exit === 0 && metadata.stdout.trim() === "public",
      "only public source repositories go to scanners",
    )
    if (metadata.exit !== 0 || metadata.stdout.trim() !== "public") continue
    const codeql = run("gh", ["api", `repos/${slug}/code-scanning/alerts?per_page=1`, "--jq", "type"])
    add(
      `${name} CodeQL`,
      codeql.exit === 0 && codeql.stdout.trim() === "array",
      "unavailable analysis is a coverage gap, never zero findings",
    )
  }

  if (previous !== undefined) {
    let valid = false
    try {
      if (existsSync(join(previous, "run.json"))) {
        const record = readRun(previous)
        valid =
          record.suite === "security" &&
          record.complete &&
          Array.isArray(record.coverage) &&
          record.coverage.length > 0 &&
          record.coverage.every((item) => typeof item === "string")
      }
    } catch {
      valid = false
    }
    add(
      "previous run",
      valid,
      "requires a complete security run.json with recorded coverage; otherwise start a new baseline without --previous",
    )
  }

  return {
    ready: checks.every((check) => check.status === "pass"),
    baseline: previous === undefined ? "new" : "comparison",
    checks,
    manualStages: [
      "Socket uses the pinned CLI through pnpm; verify authentication in the owner's terminal before source upload",
      "Record manual review, false-positive verification, full-history secret-scan coverage and limitations separately",
      "Live A7 requires owner-approved accounts, chats and payloads; preflight grants no live authorization",
    ],
  }
}
