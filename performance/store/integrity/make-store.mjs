// node make-store.mjs <path> --core <version> [--messages N] [--size bytes-per-text]
// A synthetic store opened through the real openStore, so migrations, FTS triggers and vec0 are cli-core's own.
import { ACCOUNT, args, installCore, loadCore, messages } from "./lib.mjs"

const opts = args(process.argv.slice(2))
const [path] = opts._
const core = opts.core ?? "0.608.0"
const total = Number(opts.messages ?? 20000)
const size = Number(opts.size ?? 600)
const BATCH = 500

installCore(core)
const { openStore } = await loadCore(core, "store/index.js")
const store = await openStore({ path, command: "store-harness", warn: () => {} })
await store.accounts.saveAccount(ACCOUNT, { name: "Harness" })
for (let from = 1; from <= total; from += BATCH) {
  const chatId = `seed-${Math.floor(from / 5000)}`
  await store.messages.saveMessages(ACCOUNT, chatId, messages(chatId, from, Math.min(BATCH, total - from + 1), size), {
    via: "harness",
  })
}
await store.close()
process.stdout.write(`${JSON.stringify({ path, core, messages: total })}\n`)
