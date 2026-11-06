import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { confinedPath } from "./leaks.js"

/** `deny` in a contract plan: the profile word the CLI takes first, as in `<cli> personal comments list`. */
export interface ContractDeny {
  profile: string
}

export interface DenyProcess {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  timeout: number
}
export interface DenyResult {
  exit: number
  stdout: string
  stderr: string
}
export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}
export interface ToolAnswer {
  isError: boolean
  body: unknown
}
export interface ToolSession {
  tools: string[]
  call: (call: ToolCall) => Promise<ToolAnswer>
  close: () => Promise<void>
}
export interface DenyDependencies {
  run: (process: DenyProcess) => DenyResult
  mcp?: (process: DenyProcess) => Promise<ToolSession>
}
type Check = (id: string, action: () => unknown | Promise<unknown>) => Promise<void>

interface Node {
  path?: string[]
  effects?: { remote?: string }
  lifetime?: string
  mcp?: boolean
  examples?: string[]
  arguments?: { name?: string; required?: boolean }[]
  options?: { flags?: string; mandatory?: boolean }[]
  commands?: Node[]
}
interface Keyed {
  path: string[]
  args: string[]
  key: string
  write: boolean
  mcp: boolean
}

const words = (line: string): string[] =>
  [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(([, double, single, bare]) => double ?? single ?? bare ?? "")

const remoteLeaves = (nodes: Node[]): Node[] =>
  nodes.flatMap((node) =>
    node.commands?.length
      ? remoteLeaves(node.commands)
      : (node.effects?.remote === "read" || node.effects?.remote === "write") && node.lifetime !== "persistent"
        ? [node]
        : [],
  )

/** The words after the command's path in its first example, or a placeholder for each required one. */
export const argsFor = (node: Node): string[] => {
  const path = node.path ?? []
  for (const example of node.examples ?? []) {
    const tokens = words(example)
    const at = tokens.findIndex((_, index) => path.every((word, offset) => tokens[index + offset] === word))
    if (at < 0) continue
    const rest = tokens.slice(at + path.length)
    if (rest.includes("--dry-run")) continue
    return rest.filter((word) => !/^--json(l)?(=|$)/.test(word))
  }
  return [
    ...(node.arguments ?? []).filter((argument) => argument.required).map(() => "x"),
    ...(node.options ?? [])
      .filter((option) => option.mandatory)
      .flatMap((option) => [option.flags?.match(/--[\w-]+/)?.[0] ?? "", "x"]),
  ]
}

const parsed = (text: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const errorOf = (body: unknown): { code?: unknown; details?: { arguments?: unknown } } | undefined => {
  const found = (body as { error?: unknown } | undefined)?.error
  return found && typeof found === "object"
    ? (found as { code?: unknown; details?: { arguments?: unknown } })
    : undefined
}

/** The least each required property of an MCP tool's `arguments` schema needs, so validation lets the call through. */
export const argumentsFor = (schema: unknown): Record<string, unknown> => {
  const { properties = {}, required = [] } = (schema ?? {}) as {
    properties?: Record<string, { type?: string; enum?: unknown[]; minimum?: number; pattern?: string }>
    required?: string[]
  }
  return Object.fromEntries(
    required.map((name) => {
      const property = properties[name] ?? {}
      if (property.enum?.length) return [name, property.enum[0]]
      if (property.type === "integer" || property.type === "number") return [name, property.minimum ?? 1]
      if (property.type === "boolean") return [name, false]
      if (property.type === "array") return [name, []]
      const fits = (value: string) => !property.pattern || new RegExp(property.pattern).test(value)
      return [name, ["x", "1", "x1"].find(fits) ?? "x"]
    }),
  )
}

/**
 * Each command that reaches the service and names a permission key gets `deny` in an empty home: the command line
 * must exit 5 with `permission_error`, and so must a call over `mcp serve`. The guard around each run fails it if
 * anything opened a connection, the keyring or a child process first (WC-PERM-23).
 */
export const runDenyContracts = async (
  deny: ContractDeny,
  invocation: DenyProcess,
  check: Check,
  deps: DenyDependencies,
): Promise<void> => {
  const call = (args: string[]) => deps.run({ ...invocation, args: [...invocation.args, ...args] })
  let keyed: Keyed[] = []
  let config = ""
  const writeConfig = (keys: string[]) => {
    mkdirSync(dirname(config), { recursive: true })
    const permissions = Object.fromEntries(keys.map((key) => [key, "deny"]))
    writeFileSync(config, JSON.stringify({ profiles: { [deny.profile]: { permissions } } }))
  }
  await check("deny-keys", () => {
    const tree = parsed(call(["commands", "--json"]).stdout)
    const leaves = remoteLeaves((tree?.commands as Node[] | undefined) ?? [])
    const shown = parsed(call([deny.profile, "config", "show", "--json"]).stdout)
    const file = (shown?.item as { config_file?: unknown } | undefined)?.config_file
    if (typeof file !== "string") throw new Error("config show --json names no config_file")
    config = confinedPath(invocation.cwd, file)
    keyed = leaves.flatMap((node): Keyed[] => {
      const path = node.path ?? []
      const args = argsFor(node)
      const preview = call([deny.profile, ...path, ...args, "--dry-run", "--json", "--no-input"])
      const key = (parsed(preview.stdout)?.item as { permission?: { key?: unknown } } | undefined)?.permission?.key
      if (typeof key !== "string") return []
      const write = node.effects?.remote === "write"
      return [{ path, args, key, write, mcp: node.mcp !== false && node.lifetime !== "interactive" }]
    })
    if (!keyed.some((command) => !command.write))
      throw new Error("no command that reads the service names a permission key in its --dry-run")
    if (leaves.some((node) => node.effects?.remote === "write") && !keyed.some((command) => command.write))
      throw new Error("no command that writes to the service names a permission key in its --dry-run")
  })
  for (const command of keyed)
    await check(`deny:${command.path.join(" ")}`, () => {
      writeConfig([command.key])
      const result = call([deny.profile, ...command.path, ...command.args, "--json", "--no-input"])
      if (result.exit !== 5) throw new Error(`a deny on ${command.key} exited ${result.exit}, not 5`)
      if (errorOf(parsed(result.stderr))?.code !== "permission_error")
        throw new Error(`a deny on ${command.key} did not answer permission_error`)
      if (result.stdout !== "") throw new Error("a refused command printed on stdout")
    })
  const overMcp = keyed.filter((command) => command.mcp)
  if (!deps.mcp || overMcp.length === 0) return
  const mcp = deps.mcp
  await check("deny-mcp", async () => {
    writeConfig(overMcp.map((command) => command.key))
    const failures: string[] = []
    const session = await mcp({ ...invocation, args: [...invocation.args, deny.profile, "mcp", "serve"] })
    try {
      for (const command of overMcp) {
        const name = session.tools.find((tool) => tool.endsWith(command.write ? "_write" : "_read"))
        if (!name) continue
        const ask = (args: Record<string, unknown>) =>
          session.call({ name, arguments: { command: command.path.join(" "), arguments: args } })
        let answer = await ask({})
        const first = errorOf(answer.body)
        if (first?.code === "validation_error" && first.details?.arguments)
          answer = await ask(argumentsFor(first.details.arguments))
        const code = errorOf(answer.body)?.code
        if (!answer.isError || code !== "permission_error")
          failures.push(`${command.path.join(" ")}: ${String(code ?? "not refused")}`)
      }
    } finally {
      await session.close()
    }
    if (failures.length > 0) throw new Error(`a denied command was not refused over MCP: ${failures.join("; ")}`)
  })
}

export const openContractTools: NonNullable<DenyDependencies["mcp"]> = async (process) => {
  const client = new Client({ name: "wirecat-contract", version: "1" })
  const transport = new StdioClientTransport({ ...process, stderr: "ignore" })
  const options = { timeout: process.timeout }
  try {
    await client.connect(transport, options)
    const tools = (await client.listTools(undefined, options)).tools.map((tool) => tool.name)
    return {
      tools,
      call: async (call) => {
        const answer = await client.callTool(call, options)
        const text = (answer.content as { type?: string; text?: string }[] | undefined)?.find(
          (part) => part.type === "text",
        )?.text
        return { isError: answer.isError === true, body: answer.structuredContent ?? parsed(text ?? "") }
      },
      close: () => client.close(),
    }
  } catch (error) {
    await client.close()
    throw error
  }
}
