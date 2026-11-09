// Does an agent do as well with the short MCP answer schema as with the full one? One memo MCP server over stdio on a
// synthetic store; the two arms differ only in the output schema shown for memo_read and memo_write.
//
//   node eval.mjs --memo <memo.js> --store <copy of a memo root> --mcp-client <@modelcontextprotocol/client dir> \
//     [--arms short,full] [--repeats 1] [--max-usd 1] [--only q01,page-12] > results/run.json
//
// The Anthropic key is read from the keyring in this process (service cli-memo, account anthropic) and never printed.
// The Messages API tool object has no output-schema field, so each arm puts its schema at the end of the tool's
// description: this models a client that shows outputSchema to the model. A client that drops it sees no difference.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const here = dirname(fileURLToPath(import.meta.url))
const { values } = parseArgs({
  options: {
    memo: { type: "string" },
    store: { type: "string" },
    "mcp-client": { type: "string" },
    arms: { type: "string", default: "short,full" },
    repeats: { type: "string", default: "1" },
    "max-usd": { type: "string", default: "1" },
    only: { type: "string" },
  },
})
const MODEL = "claude-haiku-5-5"
const PRICE = { input: 0.1e-6, output: 0.5e-6 }
const MAX_TURNS = 8
const RESULT_CHARS = 12_000
const tasks = JSON.parse(readFileSync(join(here, "tasks.json"), "utf8")).filter(
  (task) => !values.only || values.only.split(",").includes(task.id),
)
const listings = JSON.parse(readFileSync(join(here, "listings.json"), "utf8"))

const key = (() => {
  try {
    return execFileSync("secret-tool", ["lookup", "service", "cli-memo", "account", "anthropic"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim()
  } catch {
    return ""
  }
})()
if (!key) throw new Error("no Anthropic key in the keyring; nothing was sent")

const { Client } = await import(join(values["mcp-client"], "dist/index.mjs"))
const { StdioClientTransport } = await import(join(values["mcp-client"], "dist/stdio.mjs"))
const root = values.store
const home = join(root, "home")
const env = {
  PATH: process.env.PATH,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_STATE_HOME: join(home, ".local/state"),
  XDG_DATA_HOME: join(home, ".local/share"),
  XDG_CACHE_HOME: join(home, ".cache"),
  MEMO_CONFIG_DIR: join(root, "memo-config"),
  MEMO_STATE_DIR: join(root, "memo-state"),
  MEMO_CACHE_DIR: join(root, "memo-cache"),
  WIRECAT_STATE_DIR: join(root, "wirecat-state"),
  WIRECAT_CONFIG_DIR: join(root, "wirecat-config"),
  MEMO_NO_UPDATE_CHECK: "1",
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
  TZ: "UTC",
  MEMO_EMBEDDING_MODEL: "embeddinggemma",
}
const client = new Client({ name: "listing-eval", version: "0" })
await client.connect(
  new StdioClientTransport({ command: "node", args: [values.memo, "mcp", "serve"], env, stderr: "ignore" }),
)
const { tools } = await client.listTools()
const system = `${client.getInstructions() ?? ""}\n\nWhen you have the answer, end with one line: ANSWER: <answer>.`

const toolsFor = (arm) =>
  tools.map((tool) => {
    const output = tool.outputSchema && (listings[arm][tool.name] ?? tool.outputSchema)
    return {
      name: tool.name,
      description: output ? `${tool.description}\n\nOutput schema: ${JSON.stringify(output)}` : tool.description,
      input_schema: tool.inputSchema,
    }
  })

let spent = 0
const maxUsd = Number(values["max-usd"])
const ask = async (body) => {
  if (spent >= maxUsd) throw new Error(`cost cap of $${maxUsd} reached`)
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch((error) => (attempt < 4 ? undefined : Promise.reject(error)))
    if (!response || ((response.status === 429 || response.status >= 500) && attempt < 4)) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
      continue
    }
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}))
      throw new Error(`Anthropic answered ${response.status}: ${error?.type ?? ""} ${error?.message ?? ""}`)
    }
    const answer = await response.json()
    spent += answer.usage.input_tokens * PRICE.input + answer.usage.output_tokens * PRICE.output
    return answer
  }
}

const normal = (text) => text.toLowerCase().replace(/\s+/g, " ").trim()
const score = (task, final, writes) => {
  if (task.write) {
    return writes.some(
      ({ command, args }) =>
        normal(command) === task.write.command &&
        Object.entries(task.write.args ?? {}).every(([name, value]) => normal(String(args[name] ?? "")) === value) &&
        (!task.write.text || JSON.stringify(args).includes(task.write.text)),
    )
  }
  const line = normal(final.split("\n").findLast((one) => /answer:/i.test(one)) ?? "")
  return task.answers.some((expected) => line.includes(normal(expected)))
}

const runTask = async (task, arm) => {
  const listed = toolsFor(arm)
  const messages = [{ role: "user", content: task.prompt }]
  const writes = []
  let calls = 0
  let input = 0
  let output = 0
  let final = ""
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const answer = await ask({ model: MODEL, max_tokens: 1024, system, tools: listed, messages })
    input += answer.usage.input_tokens
    output += answer.usage.output_tokens
    messages.push({ role: "assistant", content: answer.content })
    const uses = answer.content.filter((block) => block.type === "tool_use")
    final = answer.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
    if (uses.length === 0) break
    const results = []
    for (const use of uses) {
      calls++
      if (use.name.endsWith("_write"))
        writes.push({ command: use.input.command ?? "", args: use.input.arguments ?? {} })
      const result = await client.callTool({ name: use.name, arguments: use.input })
      const text = (result.content ?? []).map((part) => part.text ?? "").join("\n")
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: text.slice(0, RESULT_CHARS),
        ...(result.isError ? { is_error: true } : {}),
      })
    }
    messages.push({ role: "user", content: results })
  }
  return {
    id: task.id,
    kind: task.kind,
    arm,
    ok: score(task, final, writes),
    calls,
    input,
    output,
    final: final.slice(-200),
  }
}

const arms = values.arms.split(",")
const runs = []
for (let repeat = 0; repeat < Number(values.repeats); repeat++)
  for (const task of tasks)
    for (const arm of arms) {
      const run = { repeat, ...(await runTask(task, arm)) }
      runs.push(run)
      process.stderr.write(
        `${run.id} ${arm} ${run.ok ? "ok" : "FAIL"} calls=${run.calls} in=${run.input} $${spent.toFixed(3)}\n`,
      )
    }
await client.close()

const summary = Object.fromEntries(
  arms.map((arm) => {
    const mine = runs.filter((run) => run.arm === arm)
    const sum = (field) => mine.reduce((total, run) => total + run[field], 0)
    return [
      arm,
      {
        tasks: mine.length,
        ok: mine.filter((run) => run.ok).length,
        tool_calls: sum("calls"),
        input_tokens: sum("input"),
        output_tokens: sum("output"),
        listing_chars: JSON.stringify(toolsFor(arm)).length,
      },
    ]
  }),
)
const report = { model: MODEL, max_turns: MAX_TURNS, result_chars: RESULT_CHARS, spent_usd: spent, summary, runs }
process.stdout.write(`${JSON.stringify(report, null, 1)}\n`)
