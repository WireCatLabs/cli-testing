// Measures cli-core's store version 39 on a synthetic store: the migration, the first drain after it, and
// `notes({ search })` before (instr(lower)) and after (trigrams).
// usage: node upgrade.mjs <cli-core checkout with dist/> <scratch dir> [scale]
import { mkdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { text } from "./gen.mjs"

const [, , core, dir, scaleArg] = process.argv
const scale = Number(scaleArg ?? 1)
const { openStore } = await import(join(core, "dist/store/store.js"))
const { openCache } = await import(join(core, "dist/store/open.js"))
const { drainNoteIndex } = await import(join(core, "dist/store/sqlite/note-index.js"))
const { stemmerCache } = await import(join(core, "dist/store/sqlite/stems.js"))

rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const path = join(dir, "wirecat.db")
const out = (o) => console.log(JSON.stringify({ scale, ...o }))
const size = () => ["", "-wal"].reduce((n, s) => n + (statSync(path + s, { throwIfNoEntry: false })?.size ?? 0), 0)
const ms = (t0) => Math.round(performance.now() - t0)
const drain = async () => {
  const db = await openCache(path)
  const t0 = performance.now()
  const n = drainNoteIndex(db, stemmerCache())
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  db.close()
  return { rows: n, ms: ms(t0) }
}

const notes = 20000 * scale
const documents = 2000 * scale
let store = await openStore({ path })
const folder = await store.notes.addFolder({ name: "Synthetic" })
let t0 = performance.now()
for (let i = 1; i <= notes; i++) await store.notes.addNote({ text: text(i, 2048, 1) })
for (let i = 1; i <= documents; i++)
  await store.notes.saveFileNote({
    folderId: folder.id,
    path: `d${i}.md`,
    title: `d${i}`,
    text: text(i, 50 * 1024, 2),
    contentHash: `h${i}`,
  })
out({ step: "fill", notes, documents, ms: ms(t0) })
await store.close()
out({ step: "first drain", ...(await drain()), bytes: size() })

const QUERIES = [
  ["rare Cyrillic", "тартус"],
  ["rare Cyrillic, upper case", "ТАРТУСС"],
  ["infix Cyrillic", "артусск"],
  ["infix Latin", "BERNET"],
  ["two words", "договор аренды"],
  ["ё in query, е in text", "ёлкин"],
  ["common 3 chars", "про"],
  ["infix in ~80% of notes", "ельцу"],
  ["absent", "щюфыжд"],
]
const timeQueries = async (label, run) => {
  for (const [name, q] of QUERIES) {
    const times = []
    let found
    for (let i = 0; i < 6; i++) {
      const t = performance.now()
      found = await run(q)
      if (i > 0) times.push(performance.now() - t)
    }
    times.sort((a, b) => a - b)
    out({ step: label, query: name, q, found, p50: +times[2].toFixed(2), max: +times.at(-1).toFixed(2) })
  }
}

// Today's SQL, as notes.ts ran it before version 39, over the same rows.
{
  const db = await openCache(path)
  const docs = db.prepare(
    "SELECT d.id FROM documents d WHERE d.deleted_at IS NULL AND coalesce(json_extract(d.metadata, '$.catalog.active'), 1)=1 " +
      "AND instr(lower(coalesce(d.body, '')), lower(?)) > 0 ORDER BY d.created_at DESC, d.id DESC LIMIT 51",
  )
  const own = db.prepare(
    "SELECT n.id FROM notes n WHERE n.deleted_at IS NULL AND instr(lower(n.body), lower(?)) > 0 ORDER BY n.created_at DESC, n.id DESC LIMIT 51",
  )
  await timeQueries("before (instr lower)", (q) => docs.all(q).length + own.all(q).length)
  db.close()
}

store = await openStore({ path })
await timeQueries("after (trigrams)", async (q) => (await store.notes.notes({ search: q, limit: 50 })).items.length)
await store.close()

// Back to version 38, as a store a 0.485.0 build left, then the upgrade.
{
  const db = await openCache(path)
  db.exec(`DROP TRIGGER note_trigrams_bd; DROP TRIGGER document_trigrams_bd; DROP TABLE note_trigrams;
    DROP TABLE document_trigrams; DELETE FROM search_index_state WHERE name IN ('note_trigrams', 'document_trigrams');
    DELETE FROM schema_migrations WHERE version >= 39; VACUUM;`)
  db.close()
}
out({ step: "at version 38", bytes: size() })
t0 = performance.now()
store = await openStore({ path })
out({ step: "migration 39 (openStore)", ms: ms(t0) })
await timeQueries(
  "queued, before the drain (fallback)",
  async (q) => (await store.notes.notes({ search: q, limit: 50 })).items.length,
)
await store.close()
out({ step: "drain after upgrade", ...(await drain()), bytes: size() })
store = await openStore({ path })
await timeQueries(
  "after upgrade drain (trigrams)",
  async (q) => (await store.notes.notes({ search: q, limit: 50 })).items.length,
)
await store.close()
rmSync(dir, { recursive: true, force: true })
