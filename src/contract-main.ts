#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { type ContractPlan, runContracts } from "./contracts.js"

interface PreviousPlan {
  entry?: string
  version?: string
  bin?: string
}
interface PackageJson {
  name?: string
  version?: string
  bin?: string | Record<string, string>
}
export interface ResolvedPrevious {
  entry: string
  version: string
}
export type Tool = (command: "npm" | "pnpm", args: string[]) => string

export class ContractSetupError extends Error {}

const EXACT = /^\d+\.\d+\.\d+$/
const PACKAGE = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

export const runTool: Tool = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300_000,
  })
  if (result.status !== 0)
    throw new ContractSetupError(`${command} ${args[0]} failed while fetching the previous version`)
  return result.stdout
}

const readPackage = (path: string) => JSON.parse(readFileSync(path, "utf8")) as PackageJson

const packageAbove = (directory: string): { root: string; manifest: PackageJson } => {
  for (let current = directory; ; current = dirname(current)) {
    const path = join(current, "package.json")
    if (existsSync(path)) return { root: current, manifest: readPackage(path) }
    if (dirname(current) === current) throw new ContractSetupError("no package.json above the plan")
  }
}

const compare = (a: string, b: string) => {
  const [x, y] = [a, b].map((version) => version.split(".").map(Number)) as [number[], number[]]
  return x.reduce((order, part, index) => order || part - (y[index] as number), 0)
}

const entryOf = (manifest: PackageJson, bin: string | undefined) => {
  if (typeof manifest.bin === "string") return manifest.bin
  const bins = manifest.bin ?? {}
  if (bin) {
    if (!Object.hasOwn(bins, bin)) throw new ContractSetupError(`the previous version has no executable ${bin}`)
    return bins[bin] as string
  }
  const targets = [...new Set(Object.values(bins))]
  if (targets.length !== 1) throw new ContractSetupError("name the executable with previous.bin")
  return targets[0] as string
}

/** The newest published release not above the candidate's version, installed once into the repository's cache. */
export const resolvePrevious = (planDirectory: string, previous: PreviousPlan, tool: Tool = runTool) => {
  const { root, manifest } = packageAbove(planDirectory)
  const { name, version } = manifest
  if (!name || !PACKAGE.test(name) || !version || !EXACT.test(version))
    throw new ContractSetupError("package.json needs a name and an exact version")
  const published = JSON.parse(tool("npm", ["view", name, "versions", "--json"])) as unknown
  const chosen = (Array.isArray(published) ? published : [published])
    .filter((item): item is string => typeof item === "string" && EXACT.test(item) && compare(item, version) <= 0)
    .sort(compare)
    .at(-1)
  if (!chosen) throw new ContractSetupError(`no published version of ${name} at or below ${version}`)
  const prefix = join(
    root,
    "node_modules",
    ".cache",
    "wirecat-contract-previous",
    `${name.replace("/", "+")}@${chosen}`,
  )
  const installed = join(prefix, "node_modules", name, "package.json")
  if (!existsSync(installed) || readPackage(installed).version !== chosen) {
    mkdirSync(prefix, { recursive: true })
    writeFileSync(join(prefix, "package.json"), JSON.stringify({ private: true, dependencies: { [name]: chosen } }))
    // Its own workspace, so pnpm does not join the CLI's; same-day WireCat releases pass the release-age gate.
    writeFileSync(
      join(prefix, "pnpm-workspace.yaml"),
      `packages:\n  - .\nminimumReleaseAgeExclude:\n  - "@wirecat/*"\n  - ${JSON.stringify(name)}\n`,
    )
    tool("pnpm", ["install", "--dir", prefix, "--ignore-scripts", "--no-frozen-lockfile", "--silent"])
  }
  return { entry: resolve(dirname(installed), entryOf(readPackage(installed), previous.bin)), version: chosen }
}

export const contractMain = async (args = process.argv.slice(2), tool?: Tool) => {
  const [file, option] = args
  if (!file || args.length > 2 || (option && option !== "--update"))
    throw new Error("usage: cli-contract <plan.json> [--update]")
  const path = resolve(file)
  const plan = JSON.parse(readFileSync(path, "utf8")) as Omit<ContractPlan, "previous"> & { previous?: PreviousPlan }
  if (plan.command === "node") plan.command = process.execPath
  if (plan.args)
    plan.args = plan.args.map((arg) =>
      arg.startsWith("./") || arg.startsWith("../") ? resolve(dirname(path), arg) : arg,
    )
  for (const item of plan.cases) if (item.entry) item.entry = resolve(dirname(path), item.entry)
  const given = plan.previous
  const previous: ResolvedPrevious | undefined = !given
    ? undefined
    : given.entry === undefined && given.version === undefined
      ? resolvePrevious(dirname(path), given, tool)
      : { entry: resolve(dirname(path), given.entry ?? ""), version: given.version ?? "" }
  const { previous: _given, ...rest } = plan
  const report = await runContracts(
    { ...rest, ...(previous ? { previous } : {}) },
    { path: dirname(path), update: option === "--update" },
  )
  process.stdout.write(`${JSON.stringify(previous ? { ...report, previous: previous.version } : report)}\n`)
  return report.passed ? 0 : 1
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await contractMain()
  } catch (error) {
    const reason = error instanceof ContractSetupError ? error.message : "contract setup failed"
    process.stderr.write(`${JSON.stringify({ error: reason })}\n`)
    process.exitCode = 2
  }
}
