// Times what a scheduled memo sync does to mail on a store copy: the index drain, then embedding with e5-small.
// usage: node profile.mjs <cli-core dir> <store copy> <threads to keep pending> <chunks to embed>
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"

const [coreDir, storePath, keepArg, embedArg] = process.argv.slice(2)
const keep = Number(keepArg ?? 300)
const toEmbed = Number(embedArg ?? 64)

const raw = new DatabaseSync(storePath)
const pending = raw.prepare("SELECT indexable_type t, count(*) n FROM email_index_pending GROUP BY 1").all()
raw.exec(`DELETE FROM email_index_pending WHERE indexable_type = 'email_thread'
  AND id NOT IN (SELECT id FROM email_index_pending WHERE indexable_type = 'email_thread' ORDER BY id LIMIT ${keep})`)
const sample = raw
  .prepare(`SELECT count(*) threads,
    sum((SELECT count(*) FROM emails e WHERE e.email_thread_id = p.id)) emails,
    sum((SELECT count(*) FROM emails e WHERE e.email_thread_id = p.id AND e.body_text IS NOT NULL)) withText
  FROM email_index_pending p WHERE indexable_type = 'email_thread'`)
  .get()
const sizes = raw
  .prepare("SELECT (SELECT count(*) FROM embeddings) embeddings, (SELECT count(*) FROM chunks) chunks")
  .get()
raw.close()

const { openStore } = await import(`${coreDir}/dist/store/index.js`)
const { embedMail } = await import(`${coreDir}/dist/services/index.js`)
const store = await openStore({ path: storePath, env: process.env })

let t = performance.now()
await store.mail.chunksToEmbed("e5-small", { limit: 1 })
const drainMs = performance.now() - t

t = performance.now()
await store.mail.chunksToEmbed("e5-small", { limit: 64 })
const listMs = performance.now() - t

t = performance.now()
const done = toEmbed === 0 ? { embedded: 0 } : await embedMail(store, { maxChunks: toEmbed, env: process.env })
const embedMs = performance.now() - t
await store.close()
const after = new DatabaseSync(storePath)
const pendingAfter = after.prepare("SELECT count(*) n FROM email_index_pending").get().n
after.close()

process.stdout.write(
  `${JSON.stringify(
    {
      pending_before: pending,
      sample,
      sizes,
      drain_ms: Math.round(drainMs),
      drain_ms_per_thread: sample.threads ? +(drainMs / sample.threads).toFixed(1) : null,
      list_batch_ms: Math.round(listMs),
      pending_after: pendingAfter,
      embedding_skipped: toEmbed === 0,
      embedded: done.embedded,
      embed_ms: Math.round(embedMs),
      embed_ms_per_chunk: done.embedded ? +(embedMs / done.embedded).toFixed(1) : null,
    },
    null,
    1,
  )}\n`,
)
