import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it, vi } from "vitest"
import { contractMain, resolvePrevious, runTool, type Tool } from "./contract-main.js"

afterEach(() => vi.restoreAllMocks())

const fixture = () => {
  const script = join(tmpdir(), "contract-cli-fixture.mjs")
  const plan = join(tmpdir(), "contract-plan.json")
  writeFileSync(script, 'process.stdout.write("{}")')
  writeFileSync(
    plan,
    JSON.stringify({
      command: "node",
      args: ["./contract-cli-fixture.mjs"],
      cases: [{ id: "fixture", args: [], exit: 0, kind: "json", stream: "stdout", snapshot: "cli-output.snap" }],
    }),
  )
  return plan
}

it("runs a file-based plan, resolves the Node entry point, and updates snapshots only explicitly", async () => {
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  const plan = fixture()
  expect(await contractMain([plan, "--update"])).toBe(0)
  expect(readFileSync(join(tmpdir(), "cli-output.snap"), "utf8")).toBe("{}")
  expect(await contractMain([plan])).toBe(0)
  expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"passed":true'))
  writeFileSync(join(tmpdir(), "cli-output.snap"), "changed")
  expect(await contractMain([plan])).toBe(1)
})

it("rejects incomplete or unknown arguments and malformed plans", async () => {
  for (const args of [[], ["file", "--unknown"], ["file", "--update", "extra"]])
    await expect(contractMain(args)).rejects.toThrow("usage:")
  await expect(contractMain([join(tmpdir(), "missing-plan.json")])).rejects.toThrow()
  const plan = fixture()
  writeFileSync(plan, "bad JSON")
  await expect(contractMain([plan])).rejects.toThrow()
  writeFileSync(
    plan,
    JSON.stringify({
      command: process.execPath,
      cases: [{ id: "fixture", args: ["-e", 'process.stdout.write("[]")'], exit: 0, kind: "json", stream: "stdout" }],
    }),
  )
  vi.spyOn(process.stdout, "write").mockReturnValue(true)
  expect(await contractMain([plan])).toBe(0)
})

it.each(["success", "failure"])("the executable entry point returns a machine-readable %s", async (mode) => {
  const saved = process.argv
  const exit = process.exitCode
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  const diagnostic = vi.spyOn(process.stderr, "write").mockReturnValue(true)
  const source = fileURLToPath(new URL("./contract-main.ts", import.meta.url))
  try {
    process.argv = [process.execPath, source, ...(mode === "success" ? [fixture(), "--update"] : [])]
    vi.resetModules()
    await import("./contract-main.js")
    expect(process.exitCode).toBe(mode === "success" ? 0 : 2)
    if (mode === "success") expect(output).toHaveBeenCalledWith(expect.stringContaining('"passed":true'))
    else expect(diagnostic).toHaveBeenCalledWith('{"error":"contract setup failed"}\n')
  } finally {
    process.argv = saved
    process.exitCode = exit
  }
})

const repository = (version = "1.4.0") => {
  const root = mkdtempSync(join(tmpdir(), "previous-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@wirecat/synthetic-cli", version }))
  mkdirSync(join(root, "contracts"))
  return root
}

const registry = (
  versions: unknown,
  bin: unknown = { synthetic: "dist/main.js", "wcat-synthetic": "dist/main.js" },
) => {
  const calls: string[][] = []
  const tool: Tool = (command, args) => {
    calls.push([command, ...args])
    if (command === "npm") return JSON.stringify(versions)
    const prefix = args[args.indexOf("--dir") + 1] as string
    const { dependencies } = JSON.parse(readFileSync(join(prefix, "package.json"), "utf8"))
    const [[name, version]] = Object.entries(dependencies) as [[string, string]]
    const target = join(prefix, "node_modules", name)
    mkdirSync(join(target, "dist"), { recursive: true })
    writeFileSync(join(target, "package.json"), JSON.stringify({ name, version, bin }))
    writeFileSync(join(target, "dist", "main.js"), `process.stdout.write(${JSON.stringify(version)})`)
    return ""
  }
  return { tool, calls }
}

it("installs the newest published release not above the candidate's version once, and pins its executable", () => {
  const root = repository()
  const { tool, calls } = registry(["1.2.0", "1.3.9", "1.4.0", "1.4.1", "1.5.0-beta.1", "1.10.0"])
  const first = resolvePrevious(join(root, "contracts"), {}, tool)
  expect(first.version).toBe("1.4.0")
  expect(first.entry).toMatch(/@wirecat\+synthetic-cli@1\.4\.0\/node_modules\/@wirecat\/synthetic-cli\/dist\/main\.js$/)
  const prefix = calls[1]?.[calls[1].indexOf("--dir") + 1] as string
  expect(readFileSync(join(prefix, "pnpm-workspace.yaml"), "utf8")).toContain('"@wirecat/synthetic-cli"')
  expect(calls.map(([command]) => command)).toEqual(["npm", "pnpm"])
  expect(resolvePrevious(join(root, "contracts"), {}, tool)).toEqual(first)
  expect(calls.map(([command]) => command)).toEqual(["npm", "pnpm", "npm"])
})

it("refuses a previous version it cannot choose without guessing", () => {
  const contracts = join(repository("1.0.0"), "contracts")
  expect(() => resolvePrevious(contracts, {}, registry(["1.0.1"]).tool)).toThrow("no published version")
  const bins = { one: "dist/main.js", two: "dist/other.js" }
  expect(() => resolvePrevious(contracts, {}, registry("1.0.0", bins).tool)).toThrow("previous.bin")
  const named = join(repository("1.0.0"), "contracts")
  expect(resolvePrevious(named, { bin: "one" }, registry("1.0.0", bins).tool).entry).toMatch(/main\.js$/)
  expect(() => resolvePrevious(named, { bin: "three" }, registry("1.0.0", bins).tool)).toThrow("no executable")
  const unnamed = mkdtempSync(join(tmpdir(), "previous-"))
  writeFileSync(join(unnamed, "package.json"), JSON.stringify({ name: "synthetic" }))
  expect(() => resolvePrevious(unnamed, {}, registry([]).tool)).toThrow("exact version")
  expect(() => resolvePrevious("/", {}, registry([]).tool)).toThrow("no package.json")
  const single = join(repository("2.0.0"), "contracts")
  expect(resolvePrevious(single, {}, registry("2.0.0", "dist/main.js").tool).entry).toMatch(/main\.js$/)
})

it("runs npm and pnpm without a shell and turns their failure into a setup error", () => {
  expect(runTool("npm", ["--version"])).toMatch(/^\d+\./)
  expect(() => runTool("npm", ["wirecat-no-such-command"])).toThrow("npm wirecat-no-such-command failed")
})

it("runs an upgrade plan from the resolved release and reports its version", async () => {
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  const root = repository()
  const plan = join(root, "contracts", "upgrade.json")
  writeFileSync(
    plan,
    JSON.stringify({
      command: "node",
      previous: {},
      cases: [{ id: "old", args: ["-e", 'process.stdout.write("{}")'], exit: 0, kind: "json", stream: "stdout" }],
    }),
  )
  expect(await contractMain([plan], registry(["1.3.0"]).tool)).toBe(0)
  expect(output).toHaveBeenLastCalledWith(expect.stringMatching(/"previous-version","passed":true.*"previous":"1.3.0"/))
  const half = JSON.parse(readFileSync(plan, "utf8"))
  writeFileSync(plan, JSON.stringify({ ...half, previous: { version: "1.3.0" } }))
  expect(await contractMain([plan], registry(["1.3.0"]).tool)).toBe(1)
})
