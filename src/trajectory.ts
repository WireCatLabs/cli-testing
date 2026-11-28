import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { assertJson } from "./contract-state.js"

export type CallStatus = "ok" | "error" | "denied" | "unanswered"

export interface ToolCall {
  id: string
  name: string
  input: unknown
  turn: number
  status: CallStatus
}

export interface Transcript {
  calls: ToolCall[]
  turns: number
}

export interface CallMatcher {
  tool: string
  input?: unknown
  status?: CallStatus
  turn?: number
}

export type TrajectoryCheck =
  | { called: CallMatcher; min?: number; max?: number }
  | { sequence: CallMatcher[]; exact?: boolean }
  | { calls: { min?: number; max?: number } }

export interface TrajectoryResult {
  passed: boolean
  turns: number
  calls: number
  checks: { index: number; passed: boolean; reason?: string }[]
}

const STATUSES: readonly CallStatus[] = ["ok", "error", "denied", "unanswered"]

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const blocks = (event: Record<string, unknown>): Record<string, unknown>[] => {
  const content = record(event.message)?.content
  return Array.isArray(content) ? content.map(record).filter((block) => block !== undefined) : []
}

// Claude Code stream-json: each user message ends with its own `result` event, so the count of results seen
// before a call is the turn it belongs to. A host refusal shows up both as a `permission_denied` system event
// and in that turn's `permission_denials`; either one marks the call denied.
export const readTranscript = (jsonl: string): Transcript => {
  const calls: ToolCall[] = []
  const failed = new Set<string>()
  const answered = new Set<string>()
  const denied = new Set<string>()
  let turns = 0
  let last: unknown
  for (const [index, line] of jsonl.split("\n").entries()) {
    if (line.trim() === "") continue
    let event: Record<string, unknown> | undefined
    try {
      event = record(JSON.parse(line))
    } catch {
      throw new Error(`transcript line ${index + 1} is not JSON`)
    }
    if (!event) throw new Error(`transcript line ${index + 1} is not a JSON object`)
    last = event.type
    // Calls a subagent makes carry the id of the call that started it; the path checked is the main agent's.
    if (typeof event.parent_tool_use_id === "string") continue
    if (event.type === "assistant")
      for (const block of blocks(event))
        if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string")
          calls.push({ id: block.id, name: block.name, input: block.input ?? {}, turn: turns, status: "ok" })
    if (event.type === "user")
      for (const block of blocks(event))
        if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
          answered.add(block.tool_use_id)
          if (block.is_error === true) failed.add(block.tool_use_id)
        }
    if (event.type === "system" && event.subtype === "permission_denied" && typeof event.tool_use_id === "string")
      denied.add(event.tool_use_id)
    if (event.type === "result") {
      turns += 1
      if (Array.isArray(event.permission_denials))
        for (const denial of event.permission_denials) {
          const id = record(denial)?.tool_use_id
          if (typeof id === "string") denied.add(id)
        }
    }
  }
  // A run cut off before its final result could pass "no write" on missing evidence.
  if (last !== "result") throw new Error("transcript has no final result; the run did not finish")
  for (const call of calls)
    call.status = denied.has(call.id)
      ? "denied"
      : failed.has(call.id)
        ? "error"
        : answered.has(call.id)
          ? "ok"
          : "unanswered"
  return { calls, turns }
}

const glob = (pattern: string) =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  )

const matches = (call: ToolCall, matcher: CallMatcher): boolean => {
  if (!glob(matcher.tool).test(call.name)) return false
  if (matcher.status !== undefined && call.status !== matcher.status) return false
  if (matcher.turn !== undefined && call.turn !== matcher.turn) return false
  if (matcher.input === undefined) return true
  try {
    assertJson(call.input, matcher.input, new Map())
    return true
  } catch {
    return false
  }
}

const describe = (matcher: CallMatcher) =>
  [
    matcher.tool,
    matcher.input === undefined ? "" : " with the given input",
    matcher.status === undefined ? "" : `, ${matcher.status}`,
    matcher.turn === undefined ? "" : `, in turn ${matcher.turn}`,
  ].join("")

const count = (value: unknown, where: string): number | undefined => {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${where}: min and max are whole numbers`)
  return value as number
}

const bounds = (value: Record<string, unknown>, where: string) => {
  const min = count(value.min, where)
  const max = count(value.max, where)
  if (min !== undefined && max !== undefined && min > max) throw new Error(`${where}: min is above max`)
  return { min, max }
}

const matcher = (value: unknown, where: string): CallMatcher => {
  const one = record(value)
  if (!one || typeof one.tool !== "string" || one.tool.length === 0) throw new Error(`${where}: tool is required`)
  const unknown = Object.keys(one).filter((key) => !["tool", "input", "status", "turn"].includes(key))
  if (unknown.length > 0) throw new Error(`${where}: unknown field ${unknown[0]}`)
  if (one.status !== undefined && !STATUSES.includes(one.status as CallStatus))
    throw new Error(`${where}: status is one of ${STATUSES.join(", ")}`)
  if (one.turn !== undefined && (!Number.isInteger(one.turn) || (one.turn as number) < 0))
    throw new Error(`${where}: turn is a whole number`)
  return one as unknown as CallMatcher
}

export const parseTrajectoryChecks = (value: unknown): TrajectoryCheck[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error("trajectory checks are a non-empty array")
  return value.map((item, index): TrajectoryCheck => {
    const where = `trajectory check ${index}`
    const check = record(item)
    const kinds = check ? ["called", "sequence", "calls"].filter((key) => Object.hasOwn(check, key)) : []
    if (!check || kinds.length !== 1) throw new Error(`${where}: use exactly one of called, sequence, calls`)
    const allowed = { called: ["called", "min", "max"], sequence: ["sequence", "exact"], calls: ["calls"] }[
      kinds[0] as "called" | "sequence" | "calls"
    ]
    const extra = Object.keys(check).filter((key) => !allowed.includes(key))
    if (extra.length > 0) throw new Error(`${where}: unknown field ${extra[0]}`)
    if (check.called !== undefined) {
      const { min, max } = bounds(check, where)
      return {
        called: matcher(check.called, where),
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      }
    }
    if (check.sequence !== undefined) {
      if (!Array.isArray(check.sequence) || check.sequence.length === 0)
        throw new Error(`${where}: sequence is a non-empty array`)
      if (check.exact !== undefined && typeof check.exact !== "boolean")
        throw new Error(`${where}: exact is true or false`)
      return {
        sequence: check.sequence.map((step, at) => matcher(step, `${where}, step ${at}`)),
        ...(check.exact === undefined ? {} : { exact: check.exact }),
      }
    }
    const calls = record(check.calls)
    if (!calls || Object.keys(calls).some((key) => key !== "min" && key !== "max"))
      throw new Error(`${where}: calls takes min and max`)
    const { min, max } = bounds(calls, where)
    return { calls: { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) } }
  })
}

const within = (found: number, min: number | undefined, max: number | undefined) =>
  (min === undefined || found >= min) && (max === undefined || found <= max)

const range = (min: number | undefined, max: number | undefined) =>
  min === undefined ? `at most ${max}` : max === undefined ? `at least ${min}` : `${min} to ${max}`

const runCheck = (calls: ToolCall[], check: TrajectoryCheck): string | undefined => {
  if ("called" in check) {
    const min = check.min === undefined && check.max === undefined ? 1 : check.min
    const found = calls.filter((call) => matches(call, check.called)).length
    return within(found, min, check.max)
      ? undefined
      : `calls of ${describe(check.called)}: expected ${range(min, check.max)}, found ${found}`
  }
  if ("sequence" in check) {
    if (check.exact) {
      const at = check.sequence.findIndex((step, index) => !calls[index] || !matches(calls[index], step))
      if (at !== -1) return `call ${at} is not ${describe(check.sequence[at] as CallMatcher)}`
      return calls.length === check.sequence.length
        ? undefined
        : `expected exactly ${check.sequence.length} calls, found ${calls.length}`
    }
    let next = 0
    for (const call of calls)
      if (next < check.sequence.length && matches(call, check.sequence[next] as CallMatcher)) next++
    return next === check.sequence.length
      ? undefined
      : `step ${next} (${describe(check.sequence[next] as CallMatcher)}) did not follow the steps before it`
  }
  return within(calls.length, check.calls.min, check.calls.max)
    ? undefined
    : `tool calls: expected ${range(check.calls.min, check.calls.max)}, found ${calls.length}`
}

export const checkTrajectory = (transcript: Transcript, checks: TrajectoryCheck[]): TrajectoryResult => {
  const results = checks.map((check, index) => {
    const reason = runCheck(transcript.calls, check)
    return reason === undefined ? { index, passed: true } : { index, passed: false, reason }
  })
  return {
    passed: results.every((one) => one.passed),
    turns: transcript.turns,
    calls: transcript.calls.length,
    checks: results,
  }
}

// One transcript per model: run-payload writes `<case>-<model>.jsonl` into the case's raw folder. No transcript, or
// one that cannot be read, leaves the run incomplete instead of failed, so a comparison cannot count it as fixed.
export const checkTranscripts = (directory: string, checks: TrajectoryCheck[]) => {
  const names = existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith(".jsonl"))
        .sort()
    : []
  let complete = names.length > 0
  const results = names.map((transcript) => {
    try {
      return {
        transcript,
        ...checkTrajectory(readTranscript(readFileSync(join(directory, transcript), "utf8")), checks),
      }
    } catch (error) {
      complete = false
      return { transcript, passed: false, error: (error as Error).message }
    }
  })
  return { passed: names.length > 0 && results.every((one) => one.passed), complete, results }
}
