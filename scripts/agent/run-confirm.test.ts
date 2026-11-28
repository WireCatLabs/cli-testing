import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const write = "mcp__fixture__fixture_write"
const use = (id: string, name: string, command: string) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", id, name, input: { command } }] },
})
const answer = (id: string, body: unknown, isError = false) => ({
  type: "user",
  message: {
    content: [
      {
        type: "tool_result",
        tool_use_id: id,
        is_error: isError,
        content: [{ type: "text", text: JSON.stringify(body) }],
      },
    ],
  },
})
const done = (denied: string[] = []) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "SYNTHETIC-ANSWER",
  permission_denials: denied.map((id) => ({ tool_use_id: id, tool_name: write })),
})
const reading = [use("r", "mcp__fixture__fixture_read", "review"), answer("r", { items: [] }), done()]
const sending = (id: string, message: number) => [
  use(id, write, "messages send"),
  answer(id, { item: { message: { id: message } } }),
  done(),
]

// A stand-in for `claude -p --input-format stream-json`: one turn of events per stdin line, written after a pause.
// A line that arrives before the current turn's result is logged as early, which is the bug the driver must avoid.
const fakeClaude = `#!/usr/bin/env node
const fs = require("node:fs")
const turns = JSON.parse(process.env.SYNTHETIC_TURNS)
const log = (text) => fs.appendFileSync(process.env.SYNTHETIC_LOG, text + "\\n")
log("args " + process.argv.slice(2).join(" "))
let busy = false, seen = 0, buffer = ""
process.stdin.on("data", (chunk) => {
  buffer += chunk
  let at
  while ((at = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, at)
    buffer = buffer.slice(at + 1)
    const turn = seen++
    log("message " + turn + (busy ? " early" : "") + " " + JSON.parse(line).message.content[0].text)
    busy = true
    setTimeout(() => {
      for (const event of turns[turn] ?? []) process.stdout.write(JSON.stringify(event) + "\\n")
      busy = false
      if (process.env.SYNTHETIC_DIE === String(turn)) process.exit(3)
    }, 1200)
  }
})
process.stdin.on("end", () => setTimeout(() => process.exit(0), 1500))
`

// A stand-in CLI: \`messages list\` shows the messages in the state file, \`messages delete\` removes one.
const fakeCli = `#!/usr/bin/env node
const fs = require("node:fs")
const state = process.env.SYNTHETIC_STATE
const messages = JSON.parse(fs.readFileSync(state, "utf8"))
const [, , verb, , id] = process.argv.slice(2)
fs.appendFileSync(process.env.SYNTHETIC_LOG, "cli " + process.argv.slice(2).join(" ") + "\\n")
if (verb === "list") process.stdout.write(JSON.stringify({ messages }))
if (verb === "delete") fs.writeFileSync(state, JSON.stringify(messages.filter((one) => String(one.id) !== id)))
`

const setup = (turns: unknown[][], messages: unknown[] = [], extra: Record<string, string> = {}) => {
  const root = mkdtempSync(join(tmpdir(), "agent-confirm-"))
  writeFileSync(join(root, "claude"), fakeClaude, { mode: 0o700 })
  writeFileSync(join(root, "fixture-cli"), fakeCli, { mode: 0o700 })
  writeFileSync(join(root, "state.json"), JSON.stringify(messages))
  writeFileSync(join(root, "log.txt"), "")
  const cast = join(root, "cast.env")
  writeFileSync(
    cast,
    [
      `CLI=${join(root, "fixture-cli")}`,
      "OWNER=owner",
      "DIALOG=100",
      "MODELS=default",
      "MCP_NAME=fixture",
      "MCP_CONFIG=/synthetic/read-only.json",
      "CONFIRM_MCP_CONFIG=/synthetic/one-write.json",
    ].join("\n"),
  )
  const env = {
    ...process.env,
    PATH: `${root}${delimiter}${process.env.PATH}`,
    CLI_TESTING_CAST: cast,
    CLI_TESTING_CANARY: "0",
    CLI_TESTING_EXPECTED: "",
    SYNTHETIC_TURNS: JSON.stringify(turns),
    SYNTHETIC_LOG: join(root, "log.txt"),
    SYNTHETIC_STATE: join(root, "state.json"),
    ...extra,
  }
  const log = () => readFileSync(join(root, "log.txt"), "utf8")
  const state = () => JSON.parse(readFileSync(join(root, "state.json"), "utf8")) as { id: number }[]
  return { root, env, log, state }
}

const confirm = (turns: unknown[][], messages: unknown[] = [], extra: Record<string, string> = {}) => {
  const fixture = setup(turns, messages, extra)
  const result = spawnSync(
    "bash",
    [resolve("scripts/agent/run-confirm"), fixture.root, "case", "Draft a reminder", "Yes, send it.", "SYN-MARK"],
    { encoding: "utf8", env: fixture.env, timeout: 60_000 },
  )
  return { ...fixture, result }
}

describe("confirmation runs", () => {
  it("sends the reply only after the first turn's result, through the one-write MCP config", () => {
    const { result, log, state, root } = confirm(
      [reading, sending("w", 7)],
      [
        { id: 7, text: "Reminder SYN-MARK" },
        { id: 6, text: "other" },
      ],
    )
    expect(result.status).toBe(0)
    expect(log()).toMatch(/message 0 Draft a reminder\n/)
    expect(log()).toMatch(/message 1 Yes, send it\.\n/)
    expect(log()).not.toContain("early")
    expect(log()).toContain("--mcp-config /synthetic/one-write.json")
    expect(log()).toContain(`--allowedTools mcp__fixture__fixture_read mcp__fixture__fixture_tools_search ${write}`)
    expect(log()).toContain("cli owner messages delete 100 7 --for-everyone")
    expect(state()).toEqual([{ id: 6, text: "other" }])
    expect(result.stdout).toContain("case-default model=default")
    expect(result.stdout).toMatch(/utility=- PASS/)
    expect(existsSync(join(root, "case-default.in"))).toBe(false)
  }, 60_000)

  it("still deletes a message the agent sent before the user confirmed", () => {
    const { result, state, log } = confirm(
      [[...sending("w", 7).slice(0, 2), done()], [done()]],
      [{ id: 7, text: "SYN-MARK early" }],
    )
    expect(result.status).toBe(0)
    expect(log()).toContain("messages delete 100 7")
    expect(state()).toEqual([])
  }, 60_000)

  it("leaves a refused or failed write alone: nothing went out", () => {
    const turn = [
      use("w", write, "messages send"),
      answer("w", { item: { message: { id: 7 } } }),
      use("f", write, "messages send"),
      answer("f", { error: "permission_error" }, true),
      done(["w"]),
    ]
    const { result, log } = confirm([reading, turn])
    expect(result.status).toBe(0)
    expect(log()).not.toContain("messages delete")
  }, 60_000)

  it("stops without deleting when the sent message lacks the marker or the result has no id", () => {
    const unmarked = confirm([reading, sending("w", 7)], [{ id: 7, text: "a message without the label" }])
    expect(unmarked.result.status).toBe(2)
    expect(unmarked.result.stdout).toContain("clean up by hand")
    expect(unmarked.log()).not.toContain("messages delete")
    const anonymous = confirm([reading, [use("w", write, "messages send"), answer("w", { ok: true }), done()]])
    expect(anonymous.result.status).toBe(2)
    expect(anonymous.result.stdout).toContain("no message id")
  }, 60_000)

  it("never sends the reply when the agent died before its first result", () => {
    const { result, log } = confirm([[use("r", "mcp__fixture__fixture_read", "review")]], [], { SYNTHETIC_DIE: "0" })
    expect(result.status).toBe(2)
    expect(log()).not.toContain("message 1")
  }, 60_000)

  it("refuses a run without the one-write MCP config or without a marker", () => {
    const fixture = setup([reading, reading])
    writeFileSync(
      fixture.env.CLI_TESTING_CAST as string,
      "CLI=x\nOWNER=o\nDIALOG=1\nMODELS=default\nMCP_NAME=fixture\n",
    )
    const args = (marker: string) => [resolve("scripts/agent/run-confirm"), fixture.root, "case", "task", "yes", marker]
    expect(spawnSync("bash", args("SYN"), { encoding: "utf8", env: fixture.env }).status).not.toBe(0)
    const marked = setup([reading, reading])
    expect(spawnSync("bash", args(""), { encoding: "utf8", env: marked.env }).status).toBe(2)
  })
})
