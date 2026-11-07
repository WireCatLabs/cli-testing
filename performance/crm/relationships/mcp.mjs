import assert from "node:assert/strict"
import { spawn } from "node:child_process"

const bodyOf = (answer) =>
  answer.result.structuredContent ?? JSON.parse(answer.result.content.find((one) => one.type === "text").text)

/** Asks a real `memo mcp serve` each query, then reads one deal through `memo_read`, as an agent would. */
export const searchTools = async (entry, guard, env, queries, dealRef) => {
  const child = spawn(process.execPath, ["--import", guard, entry, "mcp", "serve"], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  })
  const waiting = new Map()
  let buffer = ""
  let errors = ""
  let id = 0
  child.stderr.on("data", (data) => {
    errors += data
  })
  const failed = (error) => {
    for (const promise of waiting.values()) promise.reject(error)
    waiting.clear()
  }
  child.on("error", failed)
  child.on("exit", (code) => failed(new Error(`MCP exited ${code}: ${errors}`)))
  child.stdout.on("data", (data) => {
    buffer += data
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      const response = JSON.parse(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      const pending = waiting.get(response.id)
      if (pending) {
        waiting.delete(response.id)
        pending.resolve(response)
      }
      newline = buffer.indexOf("\n")
    }
  })
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const key = ++id
      waiting.set(key, { resolve, reject })
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: key, method, params })}\n`)
    })
  const timer = setTimeout(() => {
    failed(new Error("MCP timeout"))
    child.kill()
  }, 60000)
  try {
    const init = await request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "synthetic-crm-relationships", version: "1" },
    })
    assert.equal(init.error, undefined)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
    const results = {}
    for (const query of queries) {
      const answer = await request("tools/call", { name: "memo_tools_search", arguments: { query } })
      assert.equal(answer.result.isError, undefined, `memo_tools_search ${query}`)
      results[query] = bodyOf(answer).items.map((one) => one.command)
    }
    const deal = await request("tools/call", {
      name: "memo_read",
      arguments: { command: "deals context", arguments: { ref: dealRef, brief: true } },
    })
    assert.equal(deal.result.isError, undefined, JSON.stringify(deal.result).slice(0, 400))
    return { results, dealContext: bodyOf(deal).item?.deal?.ref ?? bodyOf(deal).item?.ref ?? null }
  } finally {
    clearTimeout(timer)
    child.stdin.end()
    child.kill()
  }
}
