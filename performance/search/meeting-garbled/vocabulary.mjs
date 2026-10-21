// node vocabulary.mjs — a bare node:sqlite index shaped like meeting_words, no cli-core needed

import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"

const editDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let before = new Array(b.length + 1).fill(0)
  let previous = Array.from({ length: b.length + 1 }, (_, at) => at)
  let current = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    let lowest = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2] + 1)
      current[j] = value
      lowest = Math.min(lowest, value)
    }
    if (lowest > max) return max + 1
    ;[before, previous, current] = [previous, current, before]
  }
  return previous[b.length]
}

const rand = Math.random
const syll =
  "ба ве ги до ку ла ми но пе ро са ти ус фа ха це чу ша ще ры ле кор пред при про рас вы на за от об под ст тр гр кр ль ния ство тель ова ина ный ая ое ого ому ые ых".split(
    " ",
  )
const ends = [
  "",
  "а",
  "у",
  "ом",
  "е",
  "ы",
  "ов",
  "ами",
  "ах",
  "ть",
  "л",
  "ла",
  "ли",
  "ет",
  "ют",
  "ий",
  "ая",
  "ое",
  "ого",
  "ему",
]
const lemmas = Array.from({ length: 6000 }, () =>
  Array.from({ length: 2 + Math.floor(rand() * 3) }, () => syll[Math.floor(rand() * syll.length)]).join(""),
)
lemmas.push("риелтор", "циан")
const word = () => {
  const r = Math.floor(rand() ** 1.3 * lemmas.length)
  let w = lemmas[r] + ends[Math.floor(rand() * ends.length)]
  if (rand() < 0.02) {
    const at = Math.floor(rand() * w.length)
    w = w.slice(0, at) + "аеиоуы"[Math.floor(rand() * 6)] + w.slice(at + 1)
  }
  return w
}
const db = new DatabaseSync(":memory:")
db.exec(`CREATE VIRTUAL TABLE meeting_words USING fts5(normalized_text, scope, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2', prefix='3');
CREATE VIRTUAL TABLE meeting_words_vocab USING fts5vocab(meeting_words, 'col');`)
const insert = db.prepare("INSERT INTO meeting_words(rowid,normalized_text,scope) VALUES (?,?,?)")
db.exec("BEGIN")
let rid = 1
for (let m = 0; m < 120; m++)
  for (let c = 0; c < 600; c++) insert.run(rid++ * 4 + 1, Array.from({ length: 15 }, word).join(" "), "transcript")
db.exec("COMMIT")
const distinct = db.prepare("SELECT count(*) n FROM meeting_words_vocab WHERE col='normalized_text'").get().n
process.stdout.write(
  `${[{ rows: rid - 1, distinct }].map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")}\n`,
)

const time = (label, fn, n = 20) => {
  fn()
  const t = performance.now()
  let out
  for (let i = 0; i < n; i++) out = fn()
  process.stdout.write(
    `${[label, ((performance.now() - t) / n).toFixed(2), "ms", out].map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")}\n`,
  )
}
const scanAll = db.prepare("SELECT term, doc FROM meeting_words_vocab WHERE col='normalized_text'")
time("vocab full scan only", () => scanAll.all().length)
for (const q of ["риелтор", "циана", "проверка"]) {
  const max = q.length <= 4 ? 1 : 2
  time(
    `scan + edit distance ${q}`,
    () =>
      scanAll.all().filter((r) => Math.abs(r.term.length - q.length) <= max && editDistance(q, r.term, max) <= max)
        .length,
  )
}
const range = db.prepare("SELECT term, doc FROM meeting_words_vocab WHERE col='normalized_text' AND term>=? AND term<?")
time("range scan циа", () => range.all("циа", "циа\u{10FFFF}").length)

const trigrams = (t) => {
  const p = `  ${t} `
  const s = new Set()
  for (let a = 0; a + 3 <= p.length; a++) s.add(p.slice(a, a + 3))
  return [...s]
}
const t0 = performance.now()
db.exec("CREATE TABLE tri(trigram TEXT, term TEXT, length INT, PRIMARY KEY(trigram,length,term)) WITHOUT ROWID")
const ti = db.prepare("INSERT OR IGNORE INTO tri VALUES (?,?,?)")
db.exec("BEGIN")
for (const { term } of scanAll.all()) for (const g of trigrams(term)) ti.run(g, term, term.length)
db.exec("COMMIT")
process.stdout.write(
  `${["trigram table build", (performance.now() - t0).toFixed(0), "ms"].map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")}\n`,
)
for (const q of ["риелтор", "циана"]) {
  const max = q.length <= 4 ? 1 : 2
  const g = trigrams(q)
  const st = db.prepare(
    `SELECT term, count(*) shared FROM tri WHERE trigram IN (${g.map(() => "?").join(",")}) AND length BETWEEN ? AND ? GROUP BY term ORDER BY shared DESC LIMIT 200`,
  )
  time(
    `trigram ${q}`,
    () => st.all(...g, q.length - max, q.length + max).filter((r) => editDistance(q, r.term, max) <= max).length,
  )
}
