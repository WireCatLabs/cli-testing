import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { delimiter, extname, join, resolve } from "node:path"

export const INSTALL_PINS = { npm: "11.17.0", pnpm: "12.11.2", bun: "1.3.14", publint: "0.3.25" } as const
export type InstallManager = "npm" | "pnpm" | "bun"
export interface InstallTool {
  name: string
  package: string
  version: string
  tarball: string
  command: string
  afterInstall: string[]
  documentation: string
}
export interface InstallPlan {
  reason: string
  tools: InstallTool[]
  managers: InstallManager[]
}
export interface InstallProcess {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}
export interface InstallOutput {
  exit: number
  stdout: string
  stderr: string
}
export interface InstallRow {
  tool: string
  manager: InstallManager
  passed: boolean
  warnings: string[]
  stages: { stage: string; command: string; args: string[]; result: InstallOutput }[]
}

// Windows .cmd launchers require cmd.exe; reject expansion syntax before constructing its command line.
export function installProcess(input: InstallProcess): InstallOutput {
  let command = input.command
  let args = input.args
  if (process.platform === "win32") {
    if (!/[\\/]/.test(command)) {
      const extensions = extname(command) ? [""] : (input.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
      command =
        (input.env.PATH ?? "")
          .split(delimiter)
          .filter(Boolean)
          .flatMap((directory) => extensions.map((extension) => join(directory, `${command}${extension}`)))
          .find((candidate) => existsSync(candidate)) ?? command
    }
    const quoted = [command, ...args].map((arg) => {
      if (/["\r\n%!]/.test(arg)) throw new Error("unsupported Windows command argument")
      return `"${arg}"`
    })
    command = input.env.ComSpec ?? "cmd.exe"
    args = ["/d", "/s", "/c", `"${quoted.join(" ")}"`]
  }
  const result = spawnSync(command, args, {
    cwd: input.cwd,
    env: input.env,
    encoding: "utf8",
    windowsVerbatimArguments: process.platform === "win32",
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  })
  return {
    exit: result.status ?? 2,
    stdout: result.stdout ?? "",
    stderr: `${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`,
  }
}

function environment(home: string, bin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "appdata"),
    LOCALAPPDATA: join(home, "localappdata"),
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    XDG_CACHE_HOME: join(home, "cache"),
    MESSAGING_STORE: join(home, "wirecat.db"),
    WIRECAT_STATE_DIR: join(home, "wirecat-state"),
    PNPM_HOME: bin,
    BUN_INSTALL: join(home, "bun"),
    BUN_INSTALL_BIN: bin,
    BUN_INSTALL_GLOBAL_DIR: join(home, "bun-global"),
    NPM_CONFIG_USERCONFIG: join(home, "npm-user-config"),
    NPM_CONFIG_GLOBALCONFIG: join(home, "npm-global-config"),
    NPM_CONFIG_CACHE: join(home, "npm-cache"),
    CI: "true",
    NO_COLOR: "1",
  }
  for (const key of ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP", "TMPDIR"])
    if (process.env[key]) env[key] = process.env[key]
  for (const prefix of ["MAX", "TG", "WA", "MEMO", "ZM", "DRIVE", "CLI_MESSAGING"])
    for (const kind of ["CONFIG", "STATE", "CACHE"]) env[`${prefix}_${kind}_DIR`] = join(home, prefix, kind)
  writeFileSync(env.NPM_CONFIG_USERCONFIG as string, "")
  writeFileSync(env.NPM_CONFIG_GLOBALCONFIG as string, "")
  return env
}

export function runInstallSuite(
  plan: InstallPlan,
  output: string,
  {
    run = installProcess,
    now = () => new Date(),
  }: {
    run?: (input: InstallProcess) => InstallOutput
    now?: () => Date
  } = {},
) {
  if (!plan.reason?.trim() || !plan.tools?.length || !plan.managers?.length)
    throw new Error("install plan needs a reason, tools and managers")
  if (
    new Set(plan.managers).size !== plan.managers.length ||
    plan.managers.some((manager) => !["npm", "pnpm", "bun"].includes(manager))
  )
    throw new Error("install managers must be distinct npm, pnpm or bun entries")
  const names = new Set<string>()
  for (const tool of plan.tools) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(tool.name) ||
      !/^[a-z][a-z0-9-]*$/.test(tool.command) ||
      !/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(tool.package) ||
      !/^\d+\.\d+\.\d+$/.test(tool.version) ||
      !tool.documentation ||
      !tool.afterInstall?.length ||
      names.has(tool.name)
    )
      throw new Error("install tool needs distinct name, package, version, binary and documented follow-up")
    names.add(tool.name)
    if (!existsSync(resolve(tool.tarball))) throw new Error(`missing tarball for ${tool.name}`)
  }
  const directory = resolve(output)
  mkdirSync(directory, { recursive: true })
  // A recorded run is immutable; interrupted runs keep their inputs and stage logs.
  writeFileSync(join(directory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" })
  const rows: InstallRow[] = []
  const startedAt = now().toISOString()
  for (const tool of plan.tools) {
    for (const manager of plan.managers) {
      const cwd = join(directory, `${tool.name}-${manager}`)
      const home = join(cwd, "home")
      const prefix = join(cwd, "prefix")
      const bin =
        manager === "npm" && process.platform !== "win32"
          ? join(prefix, "bin")
          : manager === "pnpm"
            ? join(cwd, "pnpm", "bin")
            : join(cwd, "bin")
      const launcherDir = manager === "npm" && process.platform === "win32" ? prefix : bin
      mkdirSync(home, { recursive: true })
      mkdirSync(launcherDir, { recursive: true })
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ private: true }))
      const env = environment(home, launcherDir)
      // Bun searches upward for a manifest unless its global directory already has one.
      mkdirSync(env.BUN_INSTALL_GLOBAL_DIR as string, { recursive: true })
      writeFileSync(join(env.BUN_INSTALL_GLOBAL_DIR as string, "package.json"), JSON.stringify({ private: true }))
      if (manager === "pnpm") env.PNPM_HOME = join(cwd, "pnpm")
      const row: InstallRow = { tool: tool.name, manager, passed: true, warnings: [], stages: [] }
      const stage = (name: string, command: string, args: string[], expected?: string) => {
        let result: InstallOutput
        try {
          result = run({ command, args, cwd, env })
        } catch (error) {
          result = { exit: 2, stdout: "", stderr: String(error) }
        }
        row.stages.push({ stage: name, command, args, result })
        for (const line of `${result.stdout}\n${result.stderr}`.split(/\r?\n/))
          if (/warn|allow-scripts|blocked|ignored.*scripts|GLOBAL_BIN_DIR_NOT_IN_PATH/i.test(line))
            row.warnings.push(line)
        const passed = result.exit === 0 && (expected === undefined || result.stdout.trim() === expected)
        row.passed &&= passed
        writeFileSync(join(cwd, "stages.json"), `${JSON.stringify(row, null, 2)}\n`)
        return passed
      }
      const tarball = resolve(tool.tarball)
      if (
        stage("manager-version", manager, ["--version"], INSTALL_PINS[manager]) &&
        stage("publint-version", "publint", ["--version"], `publint, ${INSTALL_PINS.publint}`) &&
        stage("publint", "publint", [tarball])
      ) {
        const args =
          manager === "npm" ? ["install", "--global", "--prefix", prefix, tarball] : ["add", "--global", tarball]
        if (stage("install", manager, args)) {
          const candidates =
            process.platform === "win32" ? [`${tool.command}.cmd`, `${tool.command}.exe`] : [tool.command]
          const binary =
            candidates.map((name) => join(launcherDir, name)).find((path) => existsSync(path)) ??
            join(launcherDir, tool.command)
          if (!existsSync(binary)) {
            row.passed = false
            row.stages.push({
              stage: "binary",
              command: binary,
              args: [],
              result: { exit: 1, stdout: "", stderr: "global binary missing" },
            })
          } else if (stage("binary-version", binary, ["--version"], tool.version)) {
            stage("after-install", binary, tool.afterInstall)
          }
        }
      }
      rows.push(row)
      writeFileSync(join(cwd, "stages.json"), `${JSON.stringify(row, null, 2)}\n`)
    }
  }
  const report = {
    suite: "ux",
    reason: plan.reason,
    startedAt,
    finishedAt: now().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    pins: INSTALL_PINS,
    tarballs: plan.tools.map((tool) => ({
      tool: tool.name,
      package: tool.package,
      version: tool.version,
      sha256: createHash("sha256")
        .update(readFileSync(resolve(tool.tarball)))
        .digest("hex"),
    })),
    passed: rows.every((row) => row.passed),
    rows,
  }
  writeFileSync(join(directory, "install.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
  return report
}
