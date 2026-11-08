// node writer.mjs --role <sync|serve|reader|sqlite3> --core <version> --store <path> --ledger <file> [--seconds S]
//   [--batch N] [--size bytes] [--gap ms] [--reopen-every K]
// One line per committed transaction goes to the ledger, after the commit: the oracle the checks reconcile against.
import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { ACCOUNT, args, chatOf, loadCore, messages } from "./lib.mjs"

const opts = args(process.argv.slice(2))
const role = opts.role
const path = opts.store
const deadline = Date.now() + Number(opts.seconds ?? 30) * 1000
const batch = Number(opts.batch ?? 50)
const size = Number(opts.size ?? 600)
const gap = Number(opts.gap ?? 20)
const reopenEvery = Number(opts["reopen-every"] ?? 10)
const chat = chatOf(role, process.pid)
const { openStore } = await loadCore(opts.core, "store/index.js")

const record = (line) =>
  appendFileSync(opts.ledger, `${JSON.stringify({ at: Date.now(), pid: process.pid, role, ...line })}\n`)
const open = (readOnly = false) => openStore({ path, readOnly, command: `harness-${role}`, warn: () => {} })

let next = 1
const write = async (store, via) => {
  const from = next
  await store.messages.saveMessages(ACCOUNT, chat, messages(chat, from, batch, size), { via })
  next += batch
  record({ table: "messages", chat, ids: [from, next - 1], n: batch, via })
}

const roles = {
  // A sync timer: every run is its own open and close, so any of them can be the last closer that checkpoints.
  sync: async () => {
    while (Date.now() < deadline) {
      const store = await open()
      await write(store, "sync")
      await store.close()
      // Jitter, so the short runs drift apart and one of them is, now and then, the only one open.
      await sleep(gap * (0.5 + Math.random()))
    }
  },
  // A long-lived server: one open for its life, and a second open now and then, as `withStore` did before P2.
  serve: async () => {
    const main = await open()
    record({ event: "opened" })
    for (let i = 1; Date.now() < deadline; i++) {
      await write(main, "serve")
      if (i % reopenEvery === 0) {
        const second = await open()
        await write(second, "serve-second")
        await second.close()
      }
      await sleep(gap)
    }
    await main.close()
  },
  // Someone looking at the store with the sqlite3 shell. On this machine its SQLite (3.46.1) deletes -wal and -shm
  // when its close finds no other lock on the database file; Node's 3.53.3 left them in place in the same spot.
  sqlite3: async () => {
    record({ event: "version", sqlite3: execFileSync("sqlite3", ["--version"], { encoding: "utf8" }).split(" ")[0] })
    while (Date.now() < deadline) {
      execFileSync("sqlite3", ["-cmd", ".timeout 5000", path, "SELECT count(*) FROM messages;"], { stdio: "ignore" })
      await sleep(gap * (0.5 + Math.random()))
    }
  },
  reader: async () => {
    while (Date.now() < deadline) {
      const store = await open(true)
      await store.accounts.accounts()
      await store.close()
      // Jitter, so the short runs drift apart and one of them is, now and then, the only one open.
      await sleep(gap * (0.5 + Math.random()))
    }
  },
}

try {
  await roles[role]()
  record({ event: "done" })
} catch (error) {
  record({ event: "error", code: error.code ?? null, message: String(error.message).slice(0, 300) })
  process.exitCode = 1
}
