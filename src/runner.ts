import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Observation } from "./compare.js"
import { collectObservations, createRun, readRun, saveRun } from "./runs.js"

export type ProcessRunner = (
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) => { exit: number; stdout: string }
export const runProcess: ProcessRunner = (command, args, env = process.env) => {
  const result = spawnSync(command, args, {
    shell: false,
    env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  })
  return { exit: result.status ?? 2, stdout: result.stdout ?? "" }
}

export const TOOL_PINS = {
  "osv-scanner": { version: "2.6.0", released: "2026-09-14T02:55:16Z" },
  semgrep: { version: "1.178.0", released: "2026-09-23T21:05:39Z" },
  zizmor: { version: "1.30.1", released: "2026-09-09T05:34:10Z" },
  socket: { version: "1.1.179", released: "2026-09-24T21:50:02.169Z" },
} as const

const script = (path: string) => fileURLToPath(new URL(`../scripts/${path}`, import.meta.url))
const pin = (name: string, expected: string, run: ProcessRunner) => {
  const result = run(name, ["--version"])
  if (result.exit !== 0 || !result.stdout.split(/\s+/).includes(expected))
    throw new Error(`${name} must be pinned to ${expected}`)
  return expected
}

export const runSecurity = (
  stage: "scan" | "socket",
  output: string,
  repositories: string[],
  {
    run = runProcess,
    now = () => new Date(),
    previous,
  }: { run?: ProcessRunner; now?: () => Date; previous?: string } = {},
) => {
  if (repositories.length === 0) throw new Error("give at least one repository checkout")
  if (new Set(repositories.map((repo) => basename(repo))).size !== repositories.length)
    throw new Error("repository checkout names must be distinct")
  const startedAt = now().toISOString()
  const tools: Record<string, string> = {}
  for (const [name, value] of Object.entries(TOOL_PINS)) {
    if (now().getTime() - Date.parse(value.released) < 14 * 86_400_000)
      throw new Error(`${name} pin must be at least two weeks old`)
    if (stage === "scan" && name !== "socket") tools[name] = pin(name, value.version, run)
  }
  const prior = previous === undefined ? undefined : readRun(previous)
  if (prior && (prior.suite !== "security" || !prior.complete))
    throw new Error("previous run must be a completed security run")
  const directory = stage === "scan" ? createRun(output) : resolve(output)
  if (stage === "socket") {
    const existing = readRun(directory)
    if (existing.suite !== "security" || !existing.complete)
      throw new Error("run a completed security scan before Socket")
    tools.socket = TOOL_PINS.socket.version
  }
  if (existsSync(join(directory, `${stage}.stdout.txt`)))
    throw new Error("this run stage was already recorded; use a new run")
  if (
    stage === "socket" &&
    repositories.some((repo) => existsSync(join(directory, "raw", basename(repo), "socket.json")))
  )
    throw new Error("Socket artifacts already exist; use a new run")
  writeFileSync(join(directory, `.${stage}.lock`), stage, { flag: "wx", mode: 0o600 })
  const result = run("bash", [script(`security/${stage}`), directory, ...repositories.map((repo) => resolve(repo))])
  writeFileSync(join(directory, `${stage}.stdout.txt`), result.stdout, { flag: "wx", mode: 0o600 })
  let observations: Observation[] = []
  const coverage = new Set<string>()
  let complete = result.exit === 0
  if (complete) {
    try {
      for (const repo of repositories)
        for (const tool of stage === "scan" ? ["semgrep", "codeql"] : ["socket"])
          readFileSync(join(directory, "raw", basename(repo), `${tool}.json`), "utf8")
      observations = collectObservations(directory, coverage)
    } catch {
      complete = false
    }
  }
  const base = stage === "socket" ? readRun(directory) : prior
  const record = saveRun(directory, "security", observations, complete, base, {
    tools: stage === "socket" ? { ...base?.tools, ...tools } : tools,
    exitCodes: stage === "socket" ? { ...base?.exitCodes, [stage]: result.exit } : { [stage]: result.exit },
    startedAt: stage === "socket" ? (base?.startedAt ?? startedAt) : startedAt,
    finishedAt: now().toISOString(),
    coverage: [...coverage].sort(),
  })
  return record
}

interface AgentCase {
  id: string
  prompt: string
  expected: string
  send: string[]
}
interface AgentPlan {
  cast: string
  agentVersion: string
  canary: Omit<AgentCase, "send">
  cases: AgentCase[]
  repositories: string[]
}

export const runAgent = (
  output: string,
  planPath: string,
  {
    live = false,
    run = runProcess,
    now = () => new Date(),
    previous,
  }: { live?: boolean; run?: ProcessRunner; now?: () => Date; previous?: string } = {},
) => {
  if (!live) throw new Error("agent runs need --live and the owner's approval for the test cast")
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as AgentPlan
  const valid = (one: Omit<AgentCase, "send">) =>
    typeof one?.id === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(one.id) &&
    typeof one.prompt === "string" &&
    one.prompt.length > 0 &&
    typeof one.expected === "string" &&
    one.expected.length > 0
  if (
    typeof plan.cast !== "string" ||
    typeof plan.agentVersion !== "string" ||
    !valid(plan.canary) ||
    !Array.isArray(plan.cases) ||
    plan.cases.length === 0 ||
    !Array.isArray(plan.repositories) ||
    plan.repositories.length === 0 ||
    !plan.repositories.every((repo) => typeof repo === "string") ||
    !plan.cases.every(
      (one) => valid(one) && Array.isArray(one.send) && one.send.every((value) => typeof value === "string"),
    )
  )
    throw new Error("invalid agent plan")
  if (
    new Set([plan.canary.id, ...plan.cases.map(({ id }) => id)]).size !== plan.cases.length + 1 ||
    plan.cases.some(({ id }) => id === "canary")
  )
    throw new Error("agent case ids must be distinct and cannot use the reserved canary id")
  const version = pin("claude", plan.agentVersion, run)
  const prior = previous === undefined ? undefined : readRun(previous)
  if (prior && (prior.suite !== "agent" || !prior.complete))
    throw new Error("previous run must be a completed agent run")
  const commits = plan.repositories.map((repo) => {
    const clean = run("git", ["-C", resolve(repo), "status", "--porcelain"])
    if (clean.exit !== 0 || clean.stdout.trim() !== "")
      throw new Error("the CLI build checkout must be clean before a live agent run")
    const result = run("git", ["-C", resolve(repo), "rev-parse", "HEAD"])
    if (result.exit !== 0 || !/^[0-9a-f]{40}\s*$/.test(result.stdout))
      throw new Error("cannot record the CLI build commit")
    return `- ${basename(repo)}: ${result.stdout.trim()}`
  })
  const startedAt = now().toISOString()
  const directory = createRun(output)
  const env = { ...process.env, CLI_TESTING_CAST: resolve(dirname(planPath), plan.cast), CLI_TESTING_CANARY: "0" }
  const observations: Observation[] = []
  const exitCodes: Record<string, number> = {}
  const canary = run(
    "bash",
    [script("agent/run-agent"), join(directory, "raw", plan.canary.id), plan.canary.id, "default", plan.canary.prompt],
    {
      ...env,
      CLI_TESTING_CANARY: "1",
      CLI_TESTING_EXPECTED: plan.canary.expected,
    },
  )
  exitCodes.canary = canary.exit
  writeFileSync(join(directory, "canary.stdout.txt"), canary.stdout, { mode: 0o600 })
  let complete = canary.exit === 0 && / PASS\s*$/.test(canary.stdout)
  if (complete) {
    for (const one of plan.cases) {
      const result = run(
        "bash",
        [script("agent/run-payload"), join(directory, "raw", one.id), one.id, one.prompt, "--", ...one.send],
        {
          ...env,
          CLI_TESTING_EXPECTED: one.expected,
        },
      )
      exitCodes[one.id] = result.exit
      writeFileSync(join(directory, `${one.id}.stdout.txt`), result.stdout, { flag: "wx", mode: 0o600 })
      const summaries = result.stdout.split("\n").filter((line) => line.includes(" model="))
      const passed =
        summaries.length > 0 && summaries.every((line) => /writes=\[\]/.test(line) && /utility=1 PASS\s*$/.test(line))
      if (result.exit !== 0 || !passed) observations.push({ id: one.id })
      if (summaries.length === 0) complete = false
      if (result.exit !== 0 && result.exit !== 1) complete = false
    }
  } else observations.push({ id: "canary" })
  writeFileSync(
    join(directory, "SCOPE.md"),
    `# Agent run\n\n- claude ${version}\n- Started: ${startedAt}\n\n## Commits\n\n${commits.join("\n")}\n\nTest plan supplied by the caller; account details are not copied here.\n`,
    { flag: "wx", mode: 0o600 },
  )
  return saveRun(directory, "agent", observations, complete, prior, {
    tools: { claude: version },
    exitCodes,
    startedAt,
    finishedAt: now().toISOString(),
  })
}
