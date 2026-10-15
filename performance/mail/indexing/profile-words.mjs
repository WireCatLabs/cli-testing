// Times the word index for emails with text: queues N of them as a fresh import would, then drains.
// usage: node profile-words.mjs <cli-core dir> <store copy> <emails>
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"

const [coreDir, storePath, nArg] = process.argv.slice(2)
const n = Number(nArg ?? 300)
const raw = new DatabaseSync(storePath)
raw.exec("DELETE FROM email_index_pending")
raw.exec(`INSERT INTO email_index_pending (indexable_type, id)
  SELECT 'email', id FROM emails WHERE body_text IS NOT NULL ORDER BY id DESC LIMIT ${n}`)
const chars = raw
  .prepare(`SELECT sum(length(body_text)) c FROM emails WHERE id IN
  (SELECT id FROM email_index_pending WHERE indexable_type = 'email')`)
  .get().c
raw.close()
const { openStore } = await import(`${coreDir}/dist/store/index.js`)
const store = await openStore({ path: storePath, env: process.env })
const t = performance.now()
await store.mail.chunksToEmbed("e5-small", { limit: 1 })
const ms = performance.now() - t
await store.close()
const after = new DatabaseSync(storePath)
const left = after.prepare("SELECT count(*) c FROM email_index_pending").get().c
after.close()
process.stdout.write(
  `${JSON.stringify({ emails: n, text_chars: chars, drain_ms: Math.round(ms), ms_per_email: +(ms / n).toFixed(1), left })}\n`,
)
