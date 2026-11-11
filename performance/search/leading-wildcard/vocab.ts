// What `*word*` costs when a search reads every word of the index: a synthetic FTS5 table of N distinct words, its
// fts5vocab listing, and cli-core's own wildcard automaton over each word, as the query compiler does.
//
//   node vocab.ts <cli-core checkout with dist/>
//
// Results: README.md. Nothing here opens the owner's store.

import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"

const [root] = process.argv.slice(2)
if (!root) throw new Error("usage: node vocab.ts <cli-core checkout with dist/>")
const { compileAutomaton, wildcardPattern } = await import(
  pathToFileURL(join(root, "dist/search/lucene/automaton.js")).href
)

const range = (from: string, to: string) =>
  Array.from({ length: (to.codePointAt(0) ?? 0) - (from.codePointAt(0) ?? 0) + 1 }, (_, at) =>
    String.fromCodePoint((from.codePointAt(0) ?? 0) + at),
  )
const letters = [...range("а", "я"), ...range("a", "z")]
let seed = 7
const random = () => {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 2 ** 32
}

for (const unique of [100_000, 300_000, 1_000_000]) {
  const db = new DatabaseSync(":memory:")
  db.exec(
    "CREATE VIRTUAL TABLE w USING fts5(normalized_text, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2', prefix='3');" +
      "CREATE VIRTUAL TABLE v USING fts5vocab(w, 'col')",
  )
  const words: string[] = []
  for (let i = 0; i < unique; i++) {
    let word = ""
    const length = 4 + Math.floor(random() * 9)
    for (let j = 0; j < length; j++) word += letters[Math.floor(random() * letters.length)]
    words.push(word)
  }
  words[unique >> 1] = "переотчетность"
  const insert = db.prepare("INSERT INTO w(rowid, normalized_text) VALUES (?, ?)")
  db.exec("BEGIN")
  for (let i = 0; i < unique; i += 20) insert.run(i + 1, words.slice(i, i + 20).join(" "))
  db.exec("COMMIT")
  for (const query of ["*отчет*", "*ость", "отч*"]) {
    const automaton = compileAutomaton(wildcardPattern(query))
    const started = performance.now()
    const rows = db.prepare("SELECT term FROM v WHERE col='normalized_text'").all()
    const scanned = performance.now()
    const hits = rows.filter(({ term }) => automaton.test(String(term), { work: 0, maxWork: 1e12 })).length
    const tested = performance.now()
    process.stdout.write(
      `${[unique, rows.length, query, Math.round(scanned - started), Math.round(tested - scanned), hits].join("\t")}\n`,
    )
  }
}
