import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  assertJson,
  type ContractFile,
  type ContractFileCheck,
  checkContractFiles,
  jsonAt,
  seedContractFiles,
  substitute,
} from "./contract-state.js"
import { findLeaks, scanLeaks } from "./leaks.js"

export interface ContractCase {
  id: string
  args: string[]
  exit: number
  stream: "stdout" | "stderr"
  kind: "json" | "text"
  errorCode?: string
  contains?: string
  snapshot?: string
  entry?: string
  previous?: boolean
  json?: unknown
  capture?: Record<string, string>
  files?: ContractFileCheck[]
  allowSensitiveOutput?: boolean
  diagnostic?: string
}
export interface ContractPlan {
  command: string
  args?: string[]
  cases: ContractCase[]
  mcp?: { args: string[]; snapshot: string }
  fixtures?: ContractFile[]
  previous?: { entry: string; version: string }
  canaries?: string[]
  artifacts?: string[]
}
export interface ContractProcess {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  timeout: number
}
export interface ContractResult {
  exit: number
  stdout: string
  stderr: string
}
export interface ContractDependencies {
  run?: (process: ContractProcess) => ContractResult
  tools?: (process: ContractProcess) => Promise<unknown[]>
  update?: boolean
  timeout?: number
  path?: string
}

export const runContractProcess = (process: ContractProcess): ContractResult => {
  const result = spawnSync(process.command, process.args, {
    cwd: process.cwd,
    env: process.env,
    timeout: process.timeout,
    maxBuffer: 8 * 1024 * 1024,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.error || result.signal) throw new Error("contract process failed or exceeded its limit")
  return { exit: result.status ?? 2, stdout: result.stdout, stderr: result.stderr }
}

export const readContractTools = async (process: ContractProcess): Promise<unknown[]> => {
  const client = new Client({ name: "wirecat-contract", version: "1" })
  const transport = new StdioClientTransport({ ...process, stderr: "pipe" })
  // The SDK inherits selected variables even with env supplied; HOME and all profile paths are overridden below.
  transport.stderr?.on("data", () => {})
  const signal = AbortSignal.timeout(process.timeout)
  try {
    await client.connect(transport, { timeout: process.timeout, signal })
    const tools: unknown[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, { timeout: process.timeout, signal })
      tools.push(...page.tools)
      cursor = page.nextCursor
      if (cursor && seen.has(cursor)) throw new Error("MCP pagination repeated a cursor")
      if (cursor) seen.add(cursor)
      if (tools.length > 10000) throw new Error("MCP tool list exceeded its limit")
    } while (cursor)
    return tools
  } finally {
    await client.close()
  }
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    )
  return value
}

export const contractToolSnapshot = (tools: unknown[]): string => {
  const names = new Set<string>()
  const contracts = tools
    .map((value) => {
      if (!value || typeof value !== "object") throw new Error("invalid MCP tool")
      const tool = value as Record<string, unknown>
      if (typeof tool.name !== "string" || !tool.name || names.has(tool.name))
        throw new Error("invalid or duplicate MCP tool name")
      if (
        !tool.inputSchema ||
        typeof tool.inputSchema !== "object" ||
        Array.isArray(tool.inputSchema) ||
        (tool.inputSchema as Record<string, unknown>).type !== "object"
      )
        throw new Error("MCP input schema must describe an object")
      names.add(tool.name)
      return {
        name: tool.name,
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  return `${JSON.stringify(canonical(contracts), null, 2)}\n`
}

const snapshot = (path: string, actual: string, update: boolean, json = false) => {
  if (update) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, actual)
  } else {
    const expected = readFileSync(path, "utf8").replaceAll("\r\n", "\n")
    const normalized = json ? `${JSON.stringify(canonical(JSON.parse(expected)), null, 2)}\n` : expected
    if (normalized !== actual) throw new Error("contract snapshot changed; review the diff before updating it")
  }
}

const GUARD = `const fs = require('node:fs');
const deny = () => { fs.writeFileSync(process.env.WIRECAT_CONTRACT_DENIED, 'denied'); throw new Error('offline contract denied external access'); };
globalThis.fetch = deny;
globalThis.WebSocket = deny;
const Module = require('node:module');
const load = Module._load;
Module._load = function(name, ...args) { if (name.includes('keyring') || name === 'keytar') return deny(); return load.call(this, name, ...args); };
for (const name of ['node:http', 'node:https']) { const transport = require(name); transport.request = transport.get = deny; }
const net = require('node:net'); net.connect = net.createConnection = net.Socket.prototype.connect = deny;
net.Server.prototype.listen = deny;
require('node:tls').connect = deny;
require('node:http2').connect = deny;
const dns = require('node:dns'); dns.lookup = dns.resolve = deny;
for (const transport of [dns, dns.promises]) for (const key of Object.keys(transport)) if (key.startsWith('resolve') || key.startsWith('lookup')) transport[key] = deny;
const dgram = require('node:dgram'); dgram.Socket.prototype.send = dgram.Socket.prototype.bind = deny;
require('node:worker_threads').Worker = deny;
const child = require('node:child_process'); child.spawn = child.exec = child.execFile = child.spawnSync = child.execSync = child.execFileSync = deny;
Module.syncBuiltinESMExports();
`

export const runContracts = async (plan: ContractPlan, deps: ContractDependencies = {}) => {
  if (plan.command !== process.execPath) throw new Error("offline contracts require the current Node executable")
  const timeout = deps.timeout ?? 5000
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw new Error("invalid contract timeout")
  if (
    !plan.command ||
    !Array.isArray(plan.cases) ||
    plan.cases.length === 0 ||
    new Set(plan.cases.map((c) => c.id)).size !== plan.cases.length
  )
    throw new Error("contract plan needs a command and distinct cases")
  const root = mkdtempSync(join(tmpdir(), "wirecat-contract-"))
  const guard = join(root, "guard.cjs")
  const marker = join(root, "denied")
  writeFileSync(guard, GUARD)
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: root,
    USERPROFILE: root,
    APPDATA: join(root, "config"),
    LOCALAPPDATA: join(root, "state"),
    TEMP: root,
    TMPDIR: root,
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_STATE_HOME: join(root, "state"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_RUNTIME_DIR: join(root, "runtime"),
    MESSAGING_STORE: join(root, "store.sqlite"),
    NODE_OPTIONS: `--no-addons --require ${JSON.stringify(guard)}`,
    NODE_NO_WARNINGS: "1",
    WIRECAT_CONTRACT_DENIED: marker,
  }
  for (const app of ["MAX", "TG", "ZM"]) {
    for (const directory of ["CONFIG", "STATE", "CACHE"]) env[`${app}_${directory}_DIR`] = join(root, app, directory)
    env[`${app}_NO_UPDATE_CHECK`] = "1"
  }
  const invocation: ContractProcess = { command: plan.command, args: plan.args ?? [], cwd: root, env, timeout }
  const values = new Map<string, string | number>([["root", root]])
  if (plan.previous) values.set("previousEntry", plan.previous.entry)
  let seeded = new Map<string, string>()
  const results: { id: string; passed: boolean; failure?: string }[] = []
  const check = async (id: string, action: () => unknown | Promise<unknown>) => {
    try {
      await action()
      if (existsSync(marker)) throw new Error("command attempted network, keyring or child-process access")
      results.push({ id, passed: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({
        id,
        passed: false,
        failure: findLeaks(message, plan.canaries).length ? "contract failed; sensitive detail withheld" : message,
      })
    }
  }
  try {
    if (plan.previous)
      await check("previous-version", () => {
        const previous = plan.previous as NonNullable<ContractPlan["previous"]>
        if (!/^\d+\.\d+\.\d+$/.test(previous.version)) throw new Error("previous version must be exact")
        const version = (deps.run ?? runContractProcess)({ ...invocation, args: [previous.entry, "--version"] })
        if (version.exit !== 0 || version.stderr !== "" || version.stdout.trim() !== previous.version)
          throw new Error("previous executable does not match its pinned version")
      })
    seeded = seedContractFiles(root, plan.fixtures ?? [], values)
    for (const item of plan.cases)
      await check(item.id, () => {
        if (item.previous && !plan.previous) throw new Error("previous build is not configured")
        const entry = item.entry ?? (item.previous ? plan.previous?.entry : undefined)
        const result = (deps.run ?? runContractProcess)({
          ...invocation,
          args: [...(entry ? [entry] : invocation.args), ...item.args].map((arg) => substitute(arg, values)),
        })
        if (
          findLeaks(result.stderr, plan.canaries).length ||
          findLeaks(result.stdout, item.allowSensitiveOutput ? [] : plan.canaries).length
        )
          throw new Error("sensitive data detected in command output")
        if (result.exit !== item.exit) throw new Error(`expected exit ${item.exit}, received ${result.exit}`)
        const other = item.stream === "stdout" ? result.stderr : result.stdout
        const expectedOther = item.stream === "stdout" ? (item.diagnostic ?? "") : ""
        if (other.replaceAll("\r\n", "\n") !== expectedOther)
          throw new Error(`unexpected output on ${item.stream === "stdout" ? "stderr" : "stdout"}`)
        const output = result[item.stream].replaceAll("\r\n", "\n")
        if (item.kind === "json") {
          let value: unknown
          try {
            value = JSON.parse(output)
          } catch {
            throw new Error("machine output must contain exactly one JSON value")
          }
          if (!value || typeof value !== "object") throw new Error("machine output must be a JSON object or array")
          if (item.errorCode && (value as { error?: { code?: unknown } }).error?.code !== item.errorCode)
            throw new Error("unexpected structured error code")
          if (item.json !== undefined) assertJson(value, item.json, values)
          for (const [name, pointer] of Object.entries(item.capture ?? {})) {
            if (values.has(name) || !/^[A-Za-z0-9_-]+$/.test(name)) throw new Error("invalid or repeated capture name")
            const captured = jsonAt(value, pointer)
            if (typeof captured !== "string" && typeof captured !== "number")
              throw new Error("captured JSON field must be a string or number")
            values.set(name, captured)
          }
        }
        if (item.contains && !output.includes(item.contains)) throw new Error("expected output fragment missing")
        if (item.snapshot) snapshot(resolve(deps.path ?? ".", item.snapshot), output, deps.update === true)
        checkContractFiles(root, item.files ?? [], seeded, values)
      })
    if (plan.artifacts?.length)
      await check("no-leak-artifacts", () => {
        if (!scanLeaks(root, plan.artifacts ?? [], plan.canaries).passed) throw new Error("sensitive data in artifacts")
      })
    if (plan.mcp)
      await check("mcp-schema", async () => {
        const tools = await (deps.tools ?? readContractTools)({
          ...invocation,
          args: [...invocation.args, ...(plan.mcp?.args ?? [])],
        })
        snapshot(
          resolve(deps.path ?? ".", plan.mcp?.snapshot ?? ""),
          contractToolSnapshot(tools),
          deps.update === true,
          true,
        )
      })
    return { passed: results.every((item) => item.passed), results }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
