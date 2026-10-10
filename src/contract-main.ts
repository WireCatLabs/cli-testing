#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { type ContractPlan, runContracts } from "./contracts.js"

export const contractMain = async (args = process.argv.slice(2)) => {
  const [file, option] = args
  if (!file || args.length > 2 || (option && option !== "--update"))
    throw new Error("usage: cli-contract <plan.json> [--update]")
  const path = resolve(file)
  const plan = JSON.parse(readFileSync(path, "utf8")) as ContractPlan
  if (plan.command === "node") plan.command = process.execPath
  if (plan.args)
    plan.args = plan.args.map((arg) =>
      arg.startsWith("./") || arg.startsWith("../") ? resolve(dirname(path), arg) : arg,
    )
  const report = await runContracts(plan, { path: dirname(path), update: option === "--update" })
  process.stdout.write(`${JSON.stringify(report)}\n`)
  return report.passed ? 0 : 1
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await contractMain()
  } catch {
    process.stderr.write('{"error":"contract setup failed"}\n')
    process.exitCode = 2
  }
}
