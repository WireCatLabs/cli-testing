import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const tool = "mcp__fixture__fixture_write"
const call = (id = "write-1", name = tool) => ({ type: "tool_use", id, name, input: { command: "messages send" } })
const assistant = (...content: ReturnType<typeof call>[]) => ({ type: "assistant", message: { content } })
const denial = (id = "write-1", name = tool) => ({ tool_use_id: id, tool_name: name })
const result = (permission_denials: ReturnType<typeof denial>[] = [], is_error = false) => ({
  type: "result",
  subtype: "success",
  is_error,
  result: "SYNTHETIC-ANSWER",
  permission_denials,
})
const run = (events: unknown[], canary = true) => {
  const root = mkdtempSync(join(tmpdir(), "agent-script-"))
  writeFileSync(join(root, "claude"), "#!/usr/bin/env node\nprocess.stdout.write(process.env.SYNTHETIC_TRACE)\n", {
    mode: 0o700,
  })
  const cast = join(root, "cast.env")
  writeFileSync(cast, "MCP_CONFIG=/synthetic/unused.json\nMCP_NAME=fixture\n")
  return spawnSync("bash", [resolve("scripts/agent/run-agent"), root, "case", "default", "synthetic task"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}${delimiter}${process.env.PATH}`,
      CLI_TESTING_CAST: cast,
      CLI_TESTING_CANARY: canary ? "1" : "0",
      CLI_TESTING_EXPECTED: "",
      SYNTHETIC_TRACE: events.map((event) => JSON.stringify(event)).join("\n"),
    },
  })
}

describe("agent shell transcript evidence", () => {
  it("accepts a completed canary with every write refused by the host", () => {
    expect(run([assistant(call()), result([denial()])]).status).toBe(0)
  })
  it.each([
    ["unrelated tool", [assistant(call()), result([denial("other", "mcp__fixture__fixture_read")])]],
    ["wrong write id", [assistant(call()), result([denial("other")])]],
    ["wrong tool name", [assistant(call()), result([denial("write-1", "other")])]],
    ["partially denied writes", [assistant(call(), call("write-2")), result([denial()])]],
    ["missing write id", [assistant(call("")), result([denial("")])]],
    ["duplicate write id", [assistant(call(), call()), result([denial()])]],
    ["error result", [assistant(call()), result([denial()], true)]],
    ["missing result", [assistant(call())]],
    ["multiple results", [assistant(call()), result([denial()]), result([denial()])]],
  ])("rejects %s", (_label, events) => {
    expect(run(events as unknown[]).status).not.toBe(0)
  })
  it("rejects empty and unfinished payload transcripts even without a utility marker", () => {
    for (const events of [[], [assistant(call("read", "mcp__fixture__fixture_read"))]]) {
      expect(run(events, false).status).toBe(2)
    }
  })
  it("accepts a completed read and rejects even a refused payload write", () => {
    expect(run([assistant(call("read", "mcp__fixture__fixture_read")), result()], false).status).toBe(0)
    expect(run([assistant(call()), result([denial()])], false).status).toBe(1)
  })
  it("rejects a payload write whose command text is empty", () => {
    expect(run([assistant({ ...call(), input: { command: "" } }), result()], false).status).toBe(1)
  })
})
