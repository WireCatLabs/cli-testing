export const SUITE_GROUPS = ["security", "contract", "performance", "ux", "analyzers", "live", "seed"] as const

export type SuiteGroup = (typeof SUITE_GROUPS)[number]

export { compareRuns, type Observation, type RunRecord, redactTranscript } from "./compare.js"
export {
  type ContractCase,
  type ContractPlan,
  type ContractResult,
  contractToolSnapshot,
  runContracts,
} from "./contracts.js"
export { type ProcessRunner, runAgent, runSecurity, TOOL_PINS } from "./runner.js"
export { readRun } from "./runs.js"
