import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { argsFor, argumentsFor, type ToolAnswer, type ToolSession } from "./contract-deny.js"
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
else if (args[1] === "config") out({ item: { config_file: config } })
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

const session = (answers: (call: { command: string; arguments: unknown }) => ToolAnswer): ToolSession => ({
  tools: ["fake_read", "fake_tools_search", "fake_write"],
  call: async ({ arguments: given }) => answers(given as { command: string; arguments: unknown }),
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
