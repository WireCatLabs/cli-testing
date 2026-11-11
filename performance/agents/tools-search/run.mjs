// Asks a real `memo mcp serve` the 13 command phrases and 13 task phrases of the CRM relationships scenario, and
// records where memo_tools_search puts the command each one is about. Runs in a throwaway home with an empty store
// and no keyring: the search reads only the command catalogue.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const [prefix, output] = process.argv.slice(2)
assert.ok(prefix && output, "run.mjs INSTALLED_PREFIX OUTPUT_JSON")
const memoPackage = join(resolve(prefix), "node_modules/@wirecat/cli-memo")
const memoBin = join(memoPackage, "dist/bin/memo.js")
const versionOf = (name) =>
  JSON.parse(readFileSync(join(resolve(prefix), "node_modules/@wirecat", name, "package.json"), "utf8")).version
const coreVersion = (() => {
  try {
    return JSON.parse(readFileSync(join(memoPackage, "node_modules/@wirecat/cli-core/package.json"), "utf8")).version
  } catch {
    return versionOf("cli-core")
  }
})()

// The phrases are check 12's in ../../crm/relationships/run.mjs: a short one, then a task in an agent's words.
const PHRASES = {
  "organizations context": ["organization context", "a client company's people, deals and money"],
  "deals context": ["deal context", "everything about one deal: people, stages, invoices"],
  "leads context": ["lead context", "one lead with its people and history"],
  "deals update": ["deal project", "set the project a deal belongs to"],
  "relationships list": ["relationships", "who reports to whom"],
  "relationships add": ["add relationship", "record that a person reports to another"],
  "relationships end": ["end relationship", "say a relationship ended"],
  "organizations list": ["organizations", "list client organizations"],
  context: ["person context", "one person's companies and deals"],
  "groups list": ["account groups", "which accounts are in the work group"],
  "groups add": ["add account to group", "put an account in a group"],
  "groups remove": ["remove account group", "take an account out of a group"],
  "groups move": ["move account groups", "move an account to another group"],
}

const root = mkdtempSync(join(tmpdir(), "tools-search-"))
const env = {
  PATH: process.env.PATH,
  HOME: root,
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_DATA_HOME: join(root, "data"),
  XDG_CACHE_HOME: join(root, "cache"),
  XDG_STATE_HOME: join(root, "state"),
  MESSAGING_STORE: join(root, "store.db"),
  MEMO_CONFIG_DIR: join(root, "memo-config"),
  MEMO_STATE_DIR: join(root, "memo-state"),
  MEMO_NO_UPDATE_CHECK: "1",
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
  TMPDIR: root,
}

const child = spawn(process.execPath, [memoBin, "mcp", "serve"], { env, stdio: ["pipe", "pipe", "pipe"] })
const waiting = new Map()
let buffer = ""
let id = 0
child.stdout.on("data", (data) => {
  buffer += data
  for (let newline = buffer.indexOf("\n"); newline !== -1; newline = buffer.indexOf("\n")) {
    const answer = JSON.parse(buffer.slice(0, newline))
    buffer = buffer.slice(newline + 1)
    waiting.get(answer.id)?.(answer)
    waiting.delete(answer.id)
  }
})
const request = (method, params) =>
  new Promise((done) => {
    const key = ++id
    waiting.set(key, done)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: key, method, params })}\n`)
  })

try {
  await request("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "synthetic-tools-search", version: "1" },
  })
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
  const rows = []
  for (const [command, [short, task]] of Object.entries(PHRASES))
    for (const [form, query] of [
      ["short", short],
      ["task", task],
    ]) {
      const answer = await request("tools/call", { name: "memo_tools_search", arguments: { query } })
      const body =
        answer.result.structuredContent ?? JSON.parse(answer.result.content.find((one) => one.type === "text").text)
      const found = body.items.map((one) => one.command)
      rows.push({ command, form, query, rank: found.indexOf(command), shown: found.length, top: found.slice(0, 3) })
    }
  const tally = (form) => {
    const mine = rows.filter((row) => row.form === form)
    return {
      found: mine.filter(({ rank }) => rank !== -1).length,
      top1: mine.filter(({ rank }) => rank === 0).length,
      top3: mine.filter(({ rank }) => rank !== -1 && rank < 3).length,
      of: mine.length,
    }
  }
  const result = {
    node: process.version,
    memo: versionOf("cli-memo"),
    cli_core: coreVersion,
    short: tally("short"),
    task: tally("task"),
    rows,
  }
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(
    `memo ${result.memo}: short ${JSON.stringify(result.short)}, task ${JSON.stringify(result.task)}\n`,
  )
} finally {
  // The server waits for its client to hang up; closing its input is that.
  child.stdin.end()
  child.kill()
}
