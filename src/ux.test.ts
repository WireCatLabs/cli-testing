import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { runCli } from "./main.js"
import { INSTALL_PINS, type InstallPlan, type InstallProcess, installProcess, runInstallSuite } from "./ux.js"

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "install-test-"))
  const tarball = join(root, "fixture.tgz")
  writeFileSync(tarball, "synthetic packed artifact")
  const plan: InstallPlan = {
    reason: "Verify installation isolation and failure reporting",
    managers: ["npm", "pnpm", "bun"],
    tools: [
      {
        name: "fixture",
        command: "fixture",
        package: "@example/fixture",
        version: "1.0.0",
        tarball,
        afterInstall: ["--help"],
        documentation: "https://example.test/install",
      },
    ],
  }
  return { plan, output: join(root, "run") }
}
const success = (input: InstallProcess) => {
  const manager = input.command as keyof typeof INSTALL_PINS
  if (input.args[0] === "--version")
    return {
      exit: 0,
      stdout: `${manager === "publint" ? "publint, " : ""}${INSTALL_PINS[manager] ?? "1.0.0"}\n`,
      stderr: "",
    }
  if (input.args.includes("--global")) {
    const binary = join(
      (input.env.PATH as string).split(delimiter)[0] as string,
      `fixture${process.platform === "win32" ? ".cmd" : ""}`,
    )
    mkdirSync(dirname(binary), { recursive: true })
    writeFileSync(binary, "fixture launcher")
  }
  return { exit: 0, stdout: "", stderr: "" }
}

describe("packed install suite", () => {
  it("records all manager rows, warnings, hashes and isolated environments without failing on warnings", () => {
    const { plan, output } = fixture()
    const inputs: InstallProcess[] = []
    const report = runInstallSuite(plan, output, {
      now: () => new Date("2026-10-24T00:00:00Z"),
      run: (input) => {
        inputs.push(input)
        const result = success(input)
        if (input.args.includes("--global")) result.stderr = "WARN allow-scripts blocked\nGLOBAL_BIN_DIR_NOT_IN_PATH"
        return result
      },
    })
    expect(report.passed).toBe(true)
    expect(report.rows).toHaveLength(3)
    expect(report.rows.every((row) => row.warnings.length === 2)).toBe(true)
    expect(report.tarballs[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
    for (const input of inputs) {
      expect(JSON.parse(readFileSync(join(input.cwd, "package.json"), "utf8")).private).toBe(true)
      expect(
        JSON.parse(readFileSync(join(input.env.BUN_INSTALL_GLOBAL_DIR as string, "package.json"), "utf8")).private,
      ).toBe(true)
      expect(input.env.HOME).toContain(output)
      expect(input.env.MESSAGING_STORE).toContain(output)
      expect(input.env.MAX_PROFILE).toBeUndefined()
      expect(input.env.TG_API_HASH).toBeUndefined()
      expect(input.env.NPM_CONFIG_USERCONFIG).toContain(output)
    }
    expect(JSON.parse(readFileSync(join(output, "install.json"), "utf8")).passed).toBe(true)
    expect(() => runInstallSuite(plan, output, { run: success })).toThrow()
  })
  it.each(["manager-version", "publint-version", "publint", "install", "binary-version", "after-install"])(
    "fails on %s and still records remaining managers",
    (failed) => {
      const { plan, output } = fixture()
      let count = 0
      const stageIndex = [
        "manager-version",
        "publint-version",
        "publint",
        "install",
        "binary-version",
        "after-install",
      ].indexOf(failed)
      const report = runInstallSuite(plan, output, {
        run: (input) => {
          const index = count++
          if (index === stageIndex) return { exit: 1, stdout: "", stderr: "synthetic failure" }
          return success(input)
        },
      })
      expect(report.passed).toBe(false)
      expect(report.rows[0]?.stages.at(-1)?.stage).toBe(failed)
      expect(report.rows[1]?.passed).toBe(true)
    },
  )
  it("fails a wrong tool version, absent launcher and thrown process", () => {
    for (const kind of ["version", "missing", "throw"] as const) {
      const { plan, output } = fixture()
      const report = runInstallSuite(plan, output, {
        run: (input) => {
          if (kind === "throw") throw new Error("failed process")
          if (kind === "missing" && input.args.includes("--global")) return { exit: 0, stdout: "", stderr: "" }
          const result = success(input)
          if (kind === "version" && input.args[0] === "--version") result.stdout = "wrong"
          return result
        },
      })
      expect(report.passed).toBe(false)
    }
  })
  it("rejects incomplete plans, duplicate tools/managers, invalid managers and missing tarballs", () => {
    const { plan, output } = fixture()
    for (const bad of [
      { ...plan, reason: "" },
      { ...plan, tools: [] },
      { ...plan, managers: [] },
      { ...plan, managers: ["npm", "npm"] },
      { ...plan, managers: ["unknown"] },
      { ...plan, tools: [...plan.tools, ...plan.tools] },
      { ...plan, tools: [{ ...plan.tools[0], tarball: "missing-artifact.tgz" }] },
      { ...plan, tools: [{ ...plan.tools[0], command: "bad;binary" }] },
    ])
      expect(() => runInstallSuite(bad as InstallPlan, output)).toThrow()
  })
  it("runs an actual bounded child and captures launch failure", () => {
    const { output } = fixture()
    mkdirSync(output)
    expect(
      installProcess({
        command: process.execPath,
        args: ["-e", "console.error('diagnostic & text'); process.exit(3)"],
        cwd: output,
        env: process.env,
      }),
    ).toMatchObject({ exit: 3, stderr: "diagnostic & text\n" })
    expect(
      installProcess({ command: "wirecat-missing-install-executable", args: [], cwd: output, env: process.env }).exit,
    ).not.toBe(0)
  })
})

afterEach(() => vi.unstubAllGlobals())
it("routes the ux command and prints every row with a failing exit when needed", () => {
  for (const pass of [true, false]) {
    const { plan, output } = fixture()
    const planPath = join(dirname(output), "plan.json")
    writeFileSync(planPath, JSON.stringify(plan))
    const result = runCli(["ux", "install", output, planPath], {
      installRun: pass ? success : () => ({ exit: 1, stdout: "", stderr: "failed" }),
    })
    expect(result.exit).toBe(pass ? 0 : 1)
    expect(result.output.trim().split("\n")).toHaveLength(3)
  }
})
it("handles Windows prefix launchers and rejects shell expansion", () => {
  vi.stubGlobal("process", { ...process, platform: "win32" })
  const { plan, output } = fixture()
  expect(runInstallSuite(plan, output, { run: success }).passed).toBe(true)
  for (const command of ["bad%PATH%", "bad!name", 'bad"name', "bad\nname"]) {
    expect(() => installProcess({ command, args: [], cwd: output, env: {} })).toThrow("unsupported Windows")
  }
  expect(
    installProcess({ command: "wirecat-missing-install-executable", args: [], cwd: output, env: {} }).exit,
  ).not.toBe(0)
})
