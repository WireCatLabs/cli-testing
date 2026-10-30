import { fold, open, runtime } from "./db.mjs"

const db = await open(":memory:")
const v = db.prepare("select sqlite_version() v").get().v
db.exec(`
  CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT, body_folded TEXT);
  CREATE VIRTUAL TABLE tri USING fts5(body, content='notes', content_rowid='id', tokenize='trigram');
  CREATE VIRTUAL TABLE tri_d USING fts5(body, content='notes', content_rowid='id', tokenize='trigram remove_diacritics 1');
  CREATE VIRTUAL TABLE words USING fts5(body, content='notes', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
`)
const cases = [
  ["Встреча в ТАРТУСЕ завтра", "тартус"],
  ["встреча в тартусе завтра", "ТАРТУС"],
  ["Переподстроение системы", "подстро"],
  ["Переподстроение системы", "ПОДСТРО"],
  ["KUBERNETES cluster", "bernet"],
  ["Ёлкин Пётр", "елкин"],
  ["Елкин Петр", "ёлкин"],
  ["Йошкар-Ола", "иошкар"],
  ["café crème", "cafe"],
  ["ΣΟΦΟΣ άνθρωπος", "σοφος"],
  ["ΣΟΦΟΣ", "σοφοσ"],
  ["STRASSE", "straße"],
  ["Їжак", "їжак"],
  ["ԱՐՄԵՆԻԱ", "արմեն"],
  ["İstanbul", "istanbul"],
  ["50% off_now", "50%"],
  ["50 percent offXnow", "f_n"],
  ['he said "hi" there', '"hi"'],
  ["Ян", "ян"],
  ["Ян Петров", "я"],
  ["abc", "ab"],
]
const ins = db.prepare("INSERT INTO notes(id, body, body_folded) VALUES (?, ?, ?)")
for (const [i, [body]] of cases.entries()) ins.run(i + 1, body, fold(body))
for (const t of ["tri", "tri_d", "words"]) db.exec(`INSERT INTO ${t}(${t}) VALUES('rebuild')`)

const hit = (sql, ...args) => {
  try {
    return db
      .prepare(sql)
      .all(...args)
      .map((r) => r.id)
  } catch (e) {
    return `ERR ${e.message.slice(0, 60)}`
  }
}
const q = (s) => `"${s.replace(/"/g, '""')}"`
const rows = []
cases.forEach(([body, query], i) => {
  const id = i + 1
  const has = (r) => (typeof r === "string" ? r : r.includes(id) ? "y" : "n")
  rows.push({
    body,
    query,
    "instr(lower)": has(hit("SELECT id FROM notes WHERE instr(lower(body), lower(?))>0", query)),
    "B instr(fold)": has(hit("SELECT id FROM notes WHERE instr(body_folded, ?)>0", fold(query))),
    "A MATCH": has(hit("SELECT rowid id FROM tri WHERE tri MATCH ?", q(query))),
    "A LIKE": has(hit("SELECT rowid id FROM tri WHERE body LIKE ?", `%${query}%`)),
    "A_d MATCH": has(hit("SELECT rowid id FROM tri_d WHERE tri_d MATCH ?", q(query))),
    "A_d MATCH fold(q)": has(hit("SELECT rowid id FROM tri_d WHERE tri_d MATCH ?", q(fold(query)))),
    "C word*": has(hit("SELECT rowid id FROM words WHERE words MATCH ?", `${q(query)}*`)),
  })
})
console.log(`# ${runtime}, SQLite ${v}`)
console.table(rows)
// Does LIKE on the trigram table use the index, and what does a <3 char pattern do?
for (const pat of ["%тартус%", "%ян%"]) {
  console.log(
    pat,
    db
      .prepare("EXPLAIN QUERY PLAN SELECT rowid FROM tri WHERE body LIKE ?")
      .all(pat)
      .map((r) => r.detail)
      .join(" | "),
  )
}
