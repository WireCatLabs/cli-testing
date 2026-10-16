import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

const [coreArgument, pathArgument] = process.argv.slice(2)
if (!coreArgument || !pathArgument) throw new Error("usage: seed-synthetic.mjs <built core checkout> <new store path>")
const core = resolve(coreArgument)
const path = resolve(pathArgument)
if (existsSync(path)) throw new Error("the synthetic fixture must be a new file")
const { openStore } = await import(`${core}/dist/store/index.js`)
const sandbox = dirname(path)
const store = await openStore({
  path,
  env: {
    HOME: join(sandbox, "home"),
    XDG_CONFIG_HOME: join(sandbox, "config"),
    XDG_STATE_HOME: join(sandbox, "state"),
    XDG_CACHE_HOME: join(sandbox, "cache"),
    WIRECAT_STATE_DIR: join(sandbox, "state"),
    MESSAGING_STORE: path,
    NODE_ENV: "test",
  },
})
try {
  const id = await store.accounts.saveAccount(
    { provider: "example-mail", account: "synthetic@example.com" },
    { name: "Synthetic" },
  )
  for (let index = 0; index < 600; index++) {
    await store.mail.saveThread({
      accountId: id,
      externalId: `thread-${index}`,
      now: 1000,
      emails: [
        {
          externalId: `mail-${index}`,
          subject: `Synthetic budget ${index}`,
          from: { address: "sender@example.com", name: "Kai Sample" },
          sentAt: 1000,
          bodyText: `Synthetic Harbour Observatory draft ${index}. ${"The fictional budget supports a November launch. ".repeat(30)}`,
        },
      ],
    })
  }
  await store.mail.chunksToEmbed("synthetic-index-model", { limit: 1 })
} finally {
  await store.close()
}
const raw = new DatabaseSync(path)
try {
  const insert = raw.prepare(
    "INSERT INTO embeddings (model,content_hash,dims,vector,created_at,updated_at) VALUES ('synthetic-profile',?,384,?,1000,1000)",
  )
  const vector = Buffer.alloc(384 * 4)
  raw.exec("BEGIN")
  for (let index = 0; index < 10000; index++)
    insert.run(createHash("sha256").update(`synthetic-vector-${index}`).digest("hex"), vector)
  raw.exec("COMMIT")
  raw.exec("UPDATE emails SET body_text=NULL WHERE id IN (SELECT id FROM emails ORDER BY id LIMIT 300)")
  raw.exec(
    "INSERT OR IGNORE INTO email_index_pending (indexable_type,id) SELECT 'email_thread',email_thread_id FROM emails WHERE body_text IS NULL",
  )
  process.stdout.write(
    `${JSON.stringify({ fixture: "synthetic-only", ...raw.prepare("SELECT (SELECT count(*) FROM emails) emails,(SELECT count(*) FROM email_threads) threads,(SELECT count(*) FROM embeddings) vectors,(SELECT count(*) FROM chunks) chunks,(SELECT count(*) FROM email_index_pending WHERE indexable_type='email_thread') queued_threads").get() })}\n`,
  )
} finally {
  raw.close()
}
