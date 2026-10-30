import { fold, open, runtime } from "./db.mjs"
import { text } from "./gen.mjs"

const [, , path, phase, scaleArg] = process.argv
const scale = Number(scaleArg ?? 1)
const db = await open(path)
db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-262144")
const normalize = (t) =>
  fold(t)
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
const pages = () => db.prepare("PRAGMA page_count").get().page_count * db.prepare("PRAGMA page_size").get().page_size
const now = () => performance.now()
const out = (o) => console.log(JSON.stringify({ runtime, scale, phase, ...o }))
const CORPORA = [
  { t: "notes", n: 20000 * scale, bytes: 2048, seed: 1 },
  { t: "documents", n: 2000 * scale, bytes: 50 * 1024, seed: 2 },
]
const tx = (fn) => {
  db.exec("BEGIN")
  try {
    fn()
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}
const eachRow = (t, col, fn, batch = 500) => {
  const sel = db.prepare(`SELECT id, ${col} AS body FROM ${t} WHERE id > ? ORDER BY id LIMIT ?`)
  let last = 0
  for (;;) {
    const rows = sel.all(last, batch)
    if (rows.length === 0) break
    tx(() => rows.forEach(fn))
    last = rows.at(-1).id
  }
}
const timed = (label, fn) => {
  const p0 = pages(),
    t0 = now()
  fn()
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  out({ step: label, ms: Math.round(now() - t0), extraBytes: pages() - p0 })
}

const BUILD = {
  base: () => {
    for (const { t, n, bytes, seed } of CORPORA) {
      db.exec(`CREATE TABLE ${t}(id INTEGER PRIMARY KEY, body TEXT, created_at TEXT NOT NULL, deleted_at TEXT);
               CREATE INDEX ${t}_created ON ${t}(created_at)`)
      timed(`insert ${t}`, () => {
        const ins = db.prepare(`INSERT INTO ${t}(id, body, created_at) VALUES (?, ?, ?)`)
        for (let id = 1; id <= n; id += 500)
          tx(() => {
            for (let i = id; i < Math.min(id + 500, n + 1); i++)
              ins.run(i, text(i, bytes, seed), new Date(1.6e12 + i * 6e4).toISOString())
          })
      })
      const s = db.prepare(`SELECT count(*) c, sum(length(CAST(body AS BLOB))) b, sum(length(body)) ch FROM ${t}`).get()
      out({ step: `text ${t}`, rows: s.c, textBytes: s.b, chars: s.ch })
    }
  },
  B: () => {
    for (const { t } of CORPORA)
      timed(`B backfill ${t}`, () => {
        db.exec(`ALTER TABLE ${t} ADD COLUMN body_folded TEXT`)
        const up = db.prepare(`UPDATE ${t} SET body_folded = ? WHERE id = ?`)
        eachRow(t, "body", (r) => up.run(fold(r.body), r.id))
      })
  },
  A: () => {
    for (const { t } of CORPORA)
      timed(`A rebuild ${t}`, () => {
        db.exec(`CREATE VIRTUAL TABLE ${t}_tri USING fts5(body, content='${t}', content_rowid='id', tokenize='trigram');
        CREATE TRIGGER ${t}_tri_ai AFTER INSERT ON ${t} BEGIN INSERT INTO ${t}_tri(rowid, body) VALUES (new.id, new.body); END;
        CREATE TRIGGER ${t}_tri_ad AFTER DELETE ON ${t} BEGIN INSERT INTO ${t}_tri(${t}_tri, rowid, body) VALUES ('delete', old.id, old.body); END;
        CREATE TRIGGER ${t}_tri_au AFTER UPDATE OF body ON ${t} BEGIN
          INSERT INTO ${t}_tri(${t}_tri, rowid, body) VALUES ('delete', old.id, old.body);
          INSERT INTO ${t}_tri(rowid, body) VALUES (new.id, new.body); END;
        INSERT INTO ${t}_tri(${t}_tri) VALUES ('rebuild')`)
      })
  },
  A2: () => {
    for (const { t } of CORPORA)
      timed(`A2 fill ${t}`, () => {
        db.exec(`CREATE VIRTUAL TABLE ${t}_tri2 USING fts5(text, content='', contentless_delete=1, tokenize='trigram')`)
        const ins = db.prepare(`INSERT INTO ${t}_tri2(rowid, text) VALUES (?, ?)`)
        eachRow(t, "body", (r) => ins.run(r.id, normalize(r.body ?? "")))
      })
  },
  C: () => {
    for (const { t } of CORPORA)
      timed(`C fill ${t}`, () => {
        db.exec(
          `CREATE VIRTUAL TABLE ${t}_words USING fts5(text, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2', prefix='3')`,
        )
        const ins = db.prepare(`INSERT INTO ${t}_words(rowid, text) VALUES (?, ?)`)
        eachRow(t, "body", (r) => ins.run(r.id, normalize(r.body ?? "")))
      })
  },
}

const phrase = (q) => `"${q.replace(/"/g, '""')}"`
// Each option: how a user's query becomes [sql condition, bound value]
const OPT = {
  base: { cond: (_t) => `instr(lower(body), lower(?)) > 0`, arg: (q) => q },
  B: { cond: (_t) => `instr(body_folded, ?) > 0`, arg: (q) => fold(q) },
  A: { cond: (t) => `id IN (SELECT rowid FROM ${t}_tri WHERE ${t}_tri MATCH ?)`, arg: (q) => phrase(q) },
  A2: { cond: (t) => `id IN (SELECT rowid FROM ${t}_tri2 WHERE ${t}_tri2 MATCH ?)`, arg: (q) => phrase(normalize(q)) },
  C: {
    cond: (t) => `id IN (SELECT rowid FROM ${t}_words WHERE ${t}_words MATCH ?)`,
    arg: (q) => `${phrase(normalize(q))}*`,
  },
}
const QUERIES = [
  ["rare Cyrillic", "тартус"],
  ["rare Cyrillic, upper case", "ТАРТУСС"],
  ["infix Cyrillic", "артусск"],
  ["infix Latin", "BERNET"],
  ["two words", "договор аренды"],
  ["ё in query, е in text", "ёлкин"],
  ["common 3 chars", "про"],
  ["infix in ~8% of notes", "лиэк"],
  ["infix in ~80% of notes", "ельцу"],
  ["absent", "щюфыжд"],
  ["2 chars", "ян"],
  ["1 char", "щ"],
]

if (phase.startsWith("build:")) BUILD[phase.slice(6)]()

if (phase.startsWith("query:")) {
  const o = OPT[phase.slice(6)]
  const reps = Number(process.env.REPS ?? 7)
  const all = []
  for (const [label, q] of QUERIES) {
    const counts = {},
      times = []
    const stmts = CORPORA.map(({ t }) => [
      t,
      db.prepare(
        `SELECT id FROM ${t} WHERE deleted_at IS NULL AND ${o.cond(t)} ORDER BY created_at DESC, id DESC LIMIT 51`,
      ),
      db.prepare(`SELECT count(*) c FROM ${t} WHERE deleted_at IS NULL AND ${o.cond(t)}`),
    ])
    let err
    try {
      for (const [t, , cnt] of stmts) counts[t] = cnt.get(o.arg(q)).c
      for (let i = 0; i < reps + 1; i++) {
        const t0 = now()
        for (const [, page] of stmts) page.all(o.arg(q))
        if (i > 0) times.push(now() - t0)
      }
    } catch (e) {
      err = e.message.slice(0, 80)
    }
    times.sort((a, b) => a - b)
    all.push(...times)
    out({
      query: label,
      q,
      counts,
      err,
      p50: +times[Math.floor(times.length / 2)]?.toFixed(2),
      max: +times.at(-1)?.toFixed(2),
    })
  }
  all.sort((a, b) => a - b)
  out({
    summary: true,
    p50: +all[Math.floor(all.length * 0.5)].toFixed(2),
    p95: +all[Math.floor(all.length * 0.95)].toFixed(2),
  })
}

if (phase.startsWith("write:")) {
  const opt = phase.slice(6)
  const extra = {
    base: () => {},
    A: () => {},
    B: (t, id, body) => db.prepare(`UPDATE ${t} SET body_folded = ? WHERE id = ?`).run(fold(body), id),
    A2: (t, id, body, update) => {
      if (update) db.prepare(`DELETE FROM ${t}_tri2 WHERE rowid = ?`).run(id)
      db.prepare(`INSERT INTO ${t}_tri2(rowid, text) VALUES (?, ?)`).run(id, normalize(body))
    },
    C: (t, id, body, update) => {
      if (update) db.prepare(`DELETE FROM ${t}_words WHERE rowid = ?`).run(id)
      db.prepare(`INSERT INTO ${t}_words(rowid, text) VALUES (?, ?)`).run(id, normalize(body))
    },
  }[opt]
  for (const { t, bytes, seed } of CORPORA) {
    const k = t === "notes" ? 300 : 40
    const ins = db.prepare(`INSERT INTO ${t}(id, body, created_at) VALUES (?, ?, ?)`)
    const upd = db.prepare(`UPDATE ${t} SET body = ? WHERE id = ?`)
    const bodies = Array.from({ length: k }, (_, i) => text(10_000_000 + i, bytes, seed + 9))
    let t0 = now()
    for (const [i, b] of bodies.entries())
      tx(() => {
        const id = (process.versions.bun ? 6_000_000 : 5_000_000) + i
        ins.run(id, b, new Date().toISOString())
        extra(t, id, b, false)
      })
    const insMs = (now() - t0) / k
    t0 = now()
    for (const [i, b] of bodies.entries())
      tx(() => {
        const id = 1 + i * 13
        upd.run(b, id)
        extra(t, id, b, true)
      })
    const updMs = (now() - t0) / k
    out({ step: `write ${t}`, insertMsPerRow: +insMs.toFixed(2), updateMsPerRow: +updMs.toFixed(2) })
  }
}
db.close()
