import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { Observation, RunRecord } from "./compare.js"
import { scannerObservations } from "./observations.js"

export const readRun = (directory: string): RunRecord => {
  if (!existsSync(join(directory, "run.json"))) {
    const scope = readFileSync(join(directory, "SCOPE.md"), "utf8")
    const codes = [...scope.matchAll(/^- \S+ (\S+) exit=(\d+)$/gm)]
    const allowed: Record<string, number[]> = {
      "osv-scanner": [0, 1],
      semgrep: [0],
      zizmor: [0, 11, 12, 13, 14],
      socket: [0],
    }
    const coverage = new Set<string>()
    const observations = collectObservations(directory, coverage)
    return {
      schema: 1,
      suite: "security",
      observations,
      known: observations.map(({ id }) => id),
      coverage: [...coverage].sort(),
      complete:
        scope.includes("## Tool exit codes") &&
        codes.length > 0 &&
        codes.every((match) => allowed[match[1] ?? ""]?.includes(Number(match[2])) === true),
    }
  }
  const value = JSON.parse(readFileSync(join(directory, "run.json"), "utf8")) as RunRecord
  if (
    value.schema !== 1 ||
    typeof value.suite !== "string" ||
    typeof value.complete !== "boolean" ||
    !Array.isArray(value.observations) ||
    !value.observations.every((row) => typeof row?.id === "string") ||
    !Array.isArray(value.known) ||
    !value.known.every((id) => typeof id === "string")
  )
    throw new Error("invalid run record")
  return value
}

export const collectObservations = (directory: string, coverage?: Set<string>): Observation[] => {
  const observations: Observation[] = []
  for (const repo of readdirSync(join(directory, "raw"), { withFileTypes: true })) {
    if (!repo.isDirectory() || repo.isSymbolicLink()) continue
    for (const file of readdirSync(join(directory, "raw", repo.name), { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue
      const tool = file.name.slice(0, -5)
      coverage?.add(JSON.stringify([repo.name, tool]))
      const raw = readFileSync(join(directory, "raw", repo.name, file.name), "utf8")
      let value: unknown
      try {
        value = JSON.parse(raw)
      } catch {
        if (tool !== "codeql") throw new Error("invalid scanner JSON")
        value = raw
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      }
      observations.push(...scannerObservations(repo.name, tool, value))
    }
  }
  return observations
}

export const createRun = (directory: string): string => {
  const output = resolve(directory)
  mkdirSync(dirname(output), { recursive: true })
  let ancestor = realpathSync(dirname(output))
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(ancestor, "package.json"), "utf8")) as { name?: string }
      if (pkg.name === "@wirecat/cli-testing")
        throw new Error("run results belong outside the public cli-testing repository")
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error)) throw error
    }
    if (existsSync(join(ancestor, ".git"))) break
    const parent = dirname(ancestor)
    if (parent === ancestor) break
    ancestor = parent
  }
  mkdirSync(output, { mode: 0o700 })
  mkdirSync(join(output, "raw"), { mode: 0o700 })
  writeFileSync(
    join(output, "REPORT.md"),
    "# Run report\n\nScanner observations require manual review; completion is not a security verdict.\n",
    { flag: "wx", mode: 0o600 },
  )
  return output
}

export const saveRun = (
  directory: string,
  suite: string,
  observations: Observation[],
  complete: boolean,
  previous?: RunRecord,
  details: {
    tools: Record<string, string>
    exitCodes: Record<string, number>
    startedAt: string
    finishedAt: string
    coverage?: string[]
  } = {
    tools: {},
    exitCodes: {},
    startedAt: "",
    finishedAt: "",
  },
): RunRecord => {
  const record: RunRecord = {
    schema: 1,
    suite,
    observations,
    known: [...new Set([...(previous?.known ?? []), ...observations.map(({ id }) => id)])].sort(),
    complete,
  }
  writeFileSync(join(directory, "run.json"), `${JSON.stringify({ ...record, ...details }, null, 2)}\n`, { mode: 0o600 })
  writeFileSync(
    join(directory, "REPORT.md"),
    `\n## ${suite}\n\nStatus: ${complete ? "completed" : "incomplete"}. Observations: ${observations.length}.\n`,
    { flag: "a", mode: 0o600 },
  )
  return { ...record, ...details }
}
