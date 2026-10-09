#!/usr/bin/env node
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { compareRuns } from "./compare.js"
import { type ProcessRunner, runAgent, runSecurity } from "./runner.js"
import { readRun } from "./runs.js"

export const HELP = `cli-testing security scan <output> <checkout>... [--previous <run>]
cli-testing security socket <output> <checkout>...
cli-testing agent <output> <plan.json> --live [--previous <run>]
cli-testing compare <suite> <run-a> <run-b>

Results belong in a private run directory. Agent runs require an approved test cast.
`

export const runCli = (argv: string[], deps: { run?: ProcessRunner; now?: () => Date } = {}) => {
  const { values, positionals: args } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { help: { type: "boolean", short: "h" }, live: { type: "boolean" }, previous: { type: "string" } },
  })
  if (values.help || args.length === 0) return { exit: 0, output: HELP }
  if (args[0] === "compare" && args.length === 4) {
    const [, suite, before, after] = args as [string, string, string, string]
    return { exit: 0, output: `${JSON.stringify(compareRuns(suite, readRun(before), readRun(after)))}\n` }
  }
  if (args[0] === "security" && ["scan", "socket"].includes(args[1] ?? "") && args.length >= 4) {
    const record = runSecurity(args[1] as "scan" | "socket", args[2] as string, args.slice(3), {
      ...deps,
      ...(values.previous === undefined ? {} : { previous: values.previous }),
    })
    return { exit: record.complete ? 0 : 1, output: `${JSON.stringify(record)}\n` }
  }
  if (args[0] === "agent" && args.length === 3) {
    const record = runAgent(args[1] as string, args[2] as string, {
      ...deps,
      live: values.live === true,
      ...(values.previous === undefined ? {} : { previous: values.previous }),
    })
    return { exit: record.complete && record.observations.length === 0 ? 0 : 1, output: `${JSON.stringify(record)}\n` }
  }
  throw new Error("unknown command or missing arguments; use --help")
}

export const main = (
  argv = process.argv.slice(2),
  deps: {
    run?: ProcessRunner
    now?: () => Date
    stdout?: { write(text: string): unknown }
    stderr?: { write(text: string): unknown }
  } = {},
): number => {
  try {
    const result = runCli(argv, deps)
    ;(deps.stdout ?? process.stdout).write(result.output)
    return result.exit
  } catch (error) {
    ;(deps.stderr ?? process.stderr).write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
    )
    return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
