// node make-store.mjs <path> --core <version> [--messages N] [--emails N] [--notes N] [--vectors yes|no]
//   [--size bytes-per-text] [--ledger file]
// A synthetic store opened through the real openStore, so migrations, FTS triggers and vec0 are cli-core's own.
import { appendFileSync } from "node:fs"
import {
  ACCOUNT,
  args,
  CURRENT,
  embed,
  installCore,
  loadCore,
  MAIL_ACCOUNT,
  messages,
  noteFiles,
  threads,
} from "./lib.mjs"

const opts = args(process.argv.slice(2))
const [path] = opts._
const core = opts.core ?? CURRENT
const total = Number(opts.messages ?? 20000)
const emails = Number(opts.emails ?? 0)
const notes = Number(opts.notes ?? 0)
const withVectors = (opts.vectors ?? "yes") === "yes"
const size = Number(opts.size ?? 600)
const BATCH = 500
// The seed is committed rows too: a damage that eats them counts as lost like any writer's.
const record = (line) =>
  opts.ledger && appendFileSync(opts.ledger, `${JSON.stringify({ at: Date.now(), role: "seed", ...line })}\n`)

installCore(core)
const { openStore } = await loadCore(core, "store/index.js")
const store = await openStore({ path, command: "store-harness", warn: () => {} })
await store.accounts.saveAccount(ACCOUNT, { name: "Harness" })
for (let from = 1; from <= total; from += BATCH) {
  const chatId = `seed-${Math.floor(from / 5000)}`
  const n = Math.min(BATCH, total - from + 1)
  await store.messages.saveMessages(ACCOUNT, chatId, messages(chatId, from, n, size), { via: "harness" })
  record({ table: "messages", chat: chatId, ids: [from, from + n - 1], n })
}
if (emails > 0) {
  const accountId = await store.accounts.saveAccount(MAIL_ACCOUNT, { name: MAIL_ACCOUNT.account })
  for (let from = 1; from <= emails; from += 50) {
    const n = Math.min(50, emails - from + 1)
    await store.mail.saveThreads(threads(accountId, "seed", from, n, size, Date.now()))
    record({ table: "emails", prefix: "seed", ids: [from, from + n - 1], n })
  }
}
if (notes > 0) {
  const folder = await store.notes.addFolder({ name: "harness-seed" })
  for (const file of noteFiles(folder.id, "seed", 1, notes, size)) await store.notes.saveFileNote(file)
  record({ table: "notes", prefix: "seed", ids: [1, notes], n: notes })
}
let vectors = 0
if (withVectors) {
  for (let after = 0; ; ) {
    const page = await embed.messages(store, ACCOUNT, after)
    if (page.n === 0) break
    vectors += page.n
    after = page.after
  }
  for (const kind of ["mail", "notes"])
    for (let page = await embed[kind](store); page.n > 0; page = await embed[kind](store)) vectors += page.n
}
await store.close()
process.stdout.write(`${JSON.stringify({ path, core, messages: total, emails, notes, vectors })}\n`)
