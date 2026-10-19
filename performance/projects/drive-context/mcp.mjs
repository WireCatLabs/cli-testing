import assert from "node:assert/strict"
import { spawn } from "node:child_process"

export const checkMcp = async (entry, guard, env, expectedRef) => {
  const child = spawn(process.execPath, ["--import", guard, entry, "mcp"], {
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
  }, 30000)
  try {
    const init = await request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "synthetic-drive-proof", version: "1" },
    })
    assert.equal(init.error, undefined)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
    const answer = await request("tools/call", {
      name: "project_evidence",
      arguments: { project: "COB", source: "drive:primary" },
    })
    assert.equal(answer.result.isError, undefined)
    const body =
      answer.result.structuredContent ?? JSON.parse(answer.result.content.find((one) => one.type === "text").text)
    assert.equal(body.meta.complete, true)
    assert.deepEqual(
      body.item.items.map((item) => item.ref),
      [expectedRef],
    )
    const bad = await request("tools/call", {
      name: "project_evidence",
      arguments: { project: "COB", source: "drive:primary", invented_field: true },
    })
    assert.match(JSON.stringify(bad), /validation_error/)
    assert.match(JSON.stringify(bad), /invented_field/)
  } finally {
    clearTimeout(timer)
    child.stdin.end()
    child.kill()
  }
}
