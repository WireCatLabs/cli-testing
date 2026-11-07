import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { argsFor, argumentsFor, openContractTools, type ToolAnswer, type ToolSession } from "./contract-deny.js"
import { type ContractPlan, runContracts } from "./contracts.js"

const fixtures = mkdtempSync(join(tmpdir(), "contract-deny-"))
afterAll(() => rmSync(fixtures, { recursive: true, force: true }))

const TREE = {
  commands: [
    {
      path: ["comments"],
      commands: [
        {
          path: ["comments", "list"],
          effects: { remote: "read" },
          examples: ["fake personal comments list --json=id"],
        },
        {
          path: ["comments", "create"],
          effects: { remote: "write" },
          examples: [
            'fake personal comments create --text "Looks good" --dry-run',
            'fake personal comments create --text "Looks good"',
          ],
        },
      ],
    },
    { path: ["doctor"], effects: { remote: "read" } },
    { path: ["mcp", "serve"], effects: { remote: "write" }, lifetime: "persistent" },
  ],
}

/** A CLI that answers what the deny check asks; `honours` false is bitrix24-cli's bug: deny ignored, request sent. */
const fakeCli = (honours: boolean) => {
  const file = join(fixtures, `fake-${honours}.cjs`)
  writeFileSync(
    file,
    `const fs = require("node:fs")
const path = require("node:path")
const args = process.argv.slice(2).filter((a) => a !== "--no-input")
const config = path.join(process.env.XDG_CONFIG_HOME, "fake", "config.json")
const out = (v) => process.stdout.write(JSON.stringify(v) + "\\n")
if (args[0] === "commands") out(${JSON.stringify(TREE)})
else if (args[2] === "serve") {
  const tools = ["fake_read", "fake_write"].map((name) => ({ name, inputSchema: { type: "object" } }))
  require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
    const { id, method, params } = JSON.parse(line)
    if (id === undefined) return
    const refusal = { error: { code: ${honours} ? "permission_error" : "validation_error" } }
    const result =
      method === "initialize"
        ? { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } }
        : method === "tools/list"
          ? { tools }
          : method === "tools/call"
            ? { isError: true, content: [{ type: "text", text: JSON.stringify(refusal) }] }
            : {}
    out({ jsonrpc: "2.0", id, result })
  })
} else if (args[1] === "config") out({ item: { config_file: config } })
else {
  const words = args.slice(1).filter((a) => !a.startsWith("-"))
  const key = words[0] === "doctor" ? null : words.slice(0, 2).join(".")
  if (args.includes("--dry-run")) out({ item: { permission: { key } } })
  else {
    const levels = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, "utf8")).profiles.personal.permissions : {}
    if (${honours} && levels[key] === "deny") {
      process.stderr.write(JSON.stringify({ error: { code: "permission_error" } }) + "\\n")
      process.exit(5)
    }
    try { fetch("https://comments.example.invalid") } catch {}
    process.exit(4)
  }
}
`,
  )
  return file
}

const plan = (file: string): ContractPlan => ({
  command: process.execPath,
  args: [file],
  cases: [{ id: "discovery", args: ["commands", "--json"], exit: 0, stream: "stdout", kind: "json" }],
  deny: { profile: "personal" },
})

const session = (
  answers: (call: { command: string; arguments: unknown }, tool: string) => ToolAnswer,
  found: { command: string; writes: boolean }[] = [],
): ToolSession => ({
  tools: ["fake_read", "fake_tools_search", "fake_write"],
  call: async ({ name, arguments: given }) =>
    name === "fake_tools_search"
      ? { isError: false, body: { items: found } }
      : answers(given as { command: string; arguments: unknown }, name),
  close: async () => {},
})
const refused = { isError: true, body: { error: { code: "permission_error" } } }

describe("deny contracts", () => {
  it("passes a CLI that refuses each denied command with exit 5, before any request, and over MCP", async () => {
    const asked: unknown[] = []
    const report = await runContracts(plan(fakeCli(true)), {
      toolSession: async () =>
        session((call) => {
          asked.push(call)
          return refused
        }),
    })
    expect(report.results).toEqual([
      { id: "discovery", passed: true },
      { id: "deny-keys", passed: true },
      { id: "deny:comments list", passed: true },
      { id: "deny:comments create", passed: true },
      { id: "deny-mcp", passed: true },
    ])
    expect(asked).toEqual([
      { command: "comments list", arguments: {} },
      { command: "comments create", arguments: {} },
    ])
  })

  it("calls each command with the tool the server's search names, not the one its effects suggest", async () => {
    const tools: string[] = []
    const report = await runContracts(plan(fakeCli(true)), {
      toolSession: async () =>
        session(
          (call, tool) => {
            tools.push(`${call.command} ${tool}`)
            return refused
          },
          [
            { command: "comments list", writes: true },
            { command: "comments create", writes: false },
          ],
        ),
    })
    expect(report.results.find((item) => item.id === "deny-mcp")).toEqual({ id: "deny-mcp", passed: true })
    expect(tools).toEqual(["comments list fake_write", "comments create fake_read"])
  })

  it("calls a real MCP server over stdio, and fails one that does not answer permission_error", async () => {
    const honest = await runContracts(plan(fakeCli(true)))
    expect(honest.results.find((item) => item.id === "deny-mcp")).toEqual({ id: "deny-mcp", passed: true })
    const confused = await runContracts(plan(fakeCli(false)))
    expect(confused.results.find((item) => item.id === "deny-mcp")?.failure).toContain(
      "comments list: validation_error",
    )
  })

  it("fails a CLI whose config show names no file, and one whose writes name no key", async () => {
    const answering = (dryRun: (args: string[]) => string, config = '{"item":{"config_file":"config.json"}}') => ({
      run: (invocation: { args: string[] }) =>
        invocation.args.includes("commands")
          ? { exit: 0, stdout: JSON.stringify(TREE), stderr: "" }
          : invocation.args.includes("config")
            ? { exit: 0, stdout: config, stderr: "" }
            : invocation.args.includes("--dry-run")
              ? { exit: 0, stdout: dryRun(invocation.args), stderr: "" }
              : { exit: 5, stdout: "", stderr: '{"error":{"code":"permission_error"}}' },
    })
    const noFile = await runContracts(
      plan(fakeCli(true)),
      answering(() => "{}", "not json"),
    )
    expect(noFile.results.find((item) => item.id === "deny-keys")?.failure).toContain("no config_file")
    const readsOnly = await runContracts(
      plan(fakeCli(true)),
      answering((args) =>
        JSON.stringify({ item: { permission: { key: args.includes("list") ? "comments.list" : null } } }),
      ),
    )
    expect(readsOnly.results.find((item) => item.id === "deny-keys")?.failure).toContain("no command that writes")
  })

  it("fails a refusal that is not permission_error, or that prints on stdout", async () => {
    const refusing = (stdout: string, stderr: string) => ({
      run: (invocation: { args: string[] }) =>
        invocation.args.includes("commands")
          ? { exit: 0, stdout: JSON.stringify(TREE), stderr: "" }
          : invocation.args.includes("config")
            ? { exit: 0, stdout: '{"item":{"config_file":"config.json"}}', stderr: "" }
            : invocation.args.includes("--dry-run")
              ? { exit: 0, stdout: '{"item":{"permission":{"key":"comments.list"}}}', stderr: "" }
              : { exit: 5, stdout, stderr },
      toolSession: async () => ({ ...session(() => refused), tools: ["fake_read"] }),
    })
    const wrongCode = await runContracts(plan(fakeCli(true)), refusing("", '{"error":{"code":"auth_error"}}'))
    expect(wrongCode.results.find((item) => item.id === "deny:comments list")?.failure).toContain("permission_error")
    const printed = await runContracts(plan(fakeCli(true)), refusing("{}", '{"error":{"code":"permission_error"}}'))
    expect(printed.results.find((item) => item.id === "deny:comments list")?.failure).toContain("stdout")
    expect(printed.results.find((item) => item.id === "deny-mcp")?.passed).toBe(true)
  })

  it("fails an MCP server whose tools it cannot call, and a command whose --dry-run fails", async () => {
    const unnamed = await runContracts(plan(fakeCli(true)), {
      toolSession: async () => ({ ...session(() => refused), tools: ["fake_search"] }),
    })
    expect(unnamed.results.find((item) => item.id === "deny-mcp")?.failure).toContain("no *_read or *_write tool")
    const broken = await runContracts(plan(fakeCli(true)), {
      run: (invocation) =>
        invocation.args.includes("commands")
          ? { exit: 0, stdout: JSON.stringify(TREE), stderr: "" }
          : invocation.args.includes("config")
            ? { exit: 0, stdout: '{"item":{"config_file":"config.json"}}', stderr: "" }
            : { exit: 2, stdout: "", stderr: "{}" },
    })
    expect(broken.results.find((item) => item.id === "deny-keys")?.failure).toContain("--dry-run exited 2")
  })

  it("fails when the MCP server does not start", async () => {
    const dead = { command: process.execPath, args: ["-e", "process.exit(1)"], cwd: fixtures, env: {}, timeout: 2000 }
    await expect(openContractTools(dead)).rejects.toThrow()
  })

  it("fails a CLI that ignores deny and sends the request", async () => {
    const report = await runContracts(plan(fakeCli(false)), { toolSession: async () => session(() => refused) })
    expect(report.passed).toBe(false)
    expect(report.results.find((item) => item.id === "deny:comments list")?.failure).toMatch(
      /exited 4, not 5|attempted network/,
    )
    expect(report.results.find((item) => item.id === "deny:comments create")?.passed).toBe(false)
  })

  it("fails an MCP server that runs a denied command, and one that only ever says validation_error", async () => {
    const answers = [{ isError: false, body: { items: [] } }]
    const runs = await runContracts(plan(fakeCli(true)), {
      toolSession: async () => session(() => answers[0] as ToolAnswer),
    })
    expect(runs.results.find((item) => item.id === "deny-mcp")?.failure).toContain("comments list: not refused")
    const schema = { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"] }
    const invalid = { isError: true, body: { error: { code: "validation_error", details: { arguments: schema } } } }
    const filled: unknown[] = []
    const validating = await runContracts(plan(fakeCli(true)), {
      toolSession: async () =>
        session((call) => {
          filled.push(call.arguments)
          return invalid
        }),
    })
    expect(validating.results.find((item) => item.id === "deny-mcp")?.failure).toContain("validation_error")
    expect(filled).toContainEqual({ text: "x" })
  })

  it("fails when no read names a permission key, as when the program drops the permission table", async () => {
    const empty = await runContracts(plan(fakeCli(true)), {
      run: (invocation) =>
        invocation.args.includes("commands")
          ? { exit: 0, stdout: JSON.stringify(TREE), stderr: "" }
          : invocation.args.includes("config")
            ? { exit: 0, stdout: '{"item":{"config_file":"config.json"}}', stderr: "" }
            : { exit: 0, stdout: '{"item":{"permission":{"key":null}}}', stderr: "" },
    })
    expect(empty.results.find((item) => item.id === "deny-keys")?.failure).toContain("no command that reads")
  })
})

describe("deny arguments", () => {
  it("takes the words after the path from the first example without --dry-run, else a placeholder each", () => {
    const create = TREE.commands[0]?.commands?.[1] ?? {}
    expect(argsFor(create)).toEqual(["--text", "Looks good"])
    expect(argsFor({ path: ["comments", "list"], examples: ["fake personal comments list --json=id"] })).toEqual([])
    expect(
      argsFor({
        path: ["comments", "update"],
        arguments: [{ name: "id", required: true }],
        options: [{ flags: "--text <text>", mandatory: true }, { flags: "--limit <n>" }],
      }),
    ).toEqual(["x", "--text", "x"])
  })

  it("falls back to placeholders when no example names the path, and to nothing when none is required", () => {
    expect(argsFor({ path: ["a", "b"], examples: ["fake a c"], options: [{ flags: "-t", mandatory: true }] })).toEqual([
      "-t",
      "x",
    ])
    expect(argsFor({})).toEqual([])
    expect(argumentsFor(undefined)).toEqual({})
    expect(
      argumentsFor({
        properties: { n: { type: "number" }, tags: { type: "array" }, odd: { type: "string", pattern: "^z$" } },
        required: ["n", "tags", "odd", "missing"],
      }),
    ).toEqual({ n: 1, tags: [], odd: "x", missing: "x" })
  })

  it("fills each required MCP argument from its schema", () => {
    expect(
      argumentsFor({
        properties: {
          id: { type: "string", pattern: "^\\d+$" },
          limit: { type: "integer", minimum: 5 },
          kind: { enum: ["deal", "lead"] },
          all: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["id", "limit", "kind", "all"],
      }),
    ).toEqual({ id: "1", limit: 5, kind: "deal", all: false })
  })
})
