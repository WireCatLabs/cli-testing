// Usage: node bench.mjs <cli-core checkout with dist> <rows>
// Synthetic data only. Times name filters on `attachments`: lower() as before version 8, the folded copy after.
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"

const [core, rowsArg = "100000"] = process.argv.slice(2)
const rows = Number(rowsArg)
const load = (path) => import(pathToFileURL(join(core, "dist", path)).href)
const { openStore } = await load("store/index.js")
const { fillFolded } = await load("store/sqlite/folded.js")
const { fold } = await load("store/normalize.js")

const path = join(mkdtempSync(join(tmpdir(), "folded-bench-")), "wirecat.db")
await (await openStore({ path })).close()
const db = new DatabaseSync(path)

const words = ["Отчёт", "ОТЧЁТ", "отчет", "Café", "CAFÉ", "Ölçü", "Résumé", "ΣΟΦΙΑ", "plan", "Budget", "Ёлка", "Книга"]
let seed = 7
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const pick = () => words[Math.floor(random() * words.length)]
const insert = db.prepare(
  "INSERT INTO attachments (attachable_type, attachable_id, position, kind, name, created_at, updated_at) VALUES ('message', ?, 0, 'file', ?, 0, 0)",
)
db.exec("BEGIN")
for (let i = 1; i <= rows; i++)
  insert.run(i, i === 1 ? "Отчёт Café 1.pdf" : i === 2 ? "Plan Budget 2.pdf" : `${pick()} ${pick()} ${i}.pdf`)
db.exec("COMMIT")

const fillStart = performance.now()
db.exec("BEGIN")
const filled = fillFolded({ prepare: (sql) => db.prepare(sql), exec: (sql) => db.exec(sql), close() {} })
db.exec("COMMIT")
const fillMs = performance.now() - fillStart

const time = (sql, value) => {
  const statement = db.prepare(`SELECT count(*) AS n FROM attachments WHERE ${sql}`)
  const runs = []
  let n = 0
  for (let round = 0; round < 11; round++) {
    const start = performance.now()
    n = Number(statement.get(value).n)
    runs.push(performance.now() - start)
  }
  runs.sort((a, b) => a - b)
  return { ms: runs[5].toFixed(2), matched: n }
}

const cases = [
  ["exact name, typed as stored", 'name:"Отчёт Café 1.pdf"', "Отчёт Café 1.pdf"],
  ["exact name, ASCII only", 'name:"plan budget 2.pdf"', "plan budget 2.pdf"],
  ["prefix in another case", "name:ОТЧЁТ*", "ОТЧЁТ*"],
  ["prefix with an accent dropped", "name:cafe*", "cafe*"],
  ["contains", "name:*книга*", "*книга*"],
]
const like = (value) =>
  value
    .toLowerCase()
    .replace(/[\\%_]/g, "\\$&")
    .replaceAll("*", "%")
    .replaceAll("?", "_")
const result = []
for (const [label, query, value] of cases) {
  const wildcard = value.includes("*")
  const before = wildcard
    ? time("IFNULL((lower(name) LIKE ? ESCAPE '\\'), 0)", like(value))
    : time("IFNULL((lower(name) = ?), 0)", value.toLowerCase())
  const after = wildcard
    ? time("(name_folded IS NOT NULL AND name_folded GLOB ?)", fold(value))
    : time("(name_folded IS NOT NULL AND name_folded = ?)", fold(value))
  result.push({
    case: label,
    query,
    before_ms: before.ms,
    before_matched: before.matched,
    after_ms: after.ms,
    after_matched: after.matched,
  })
}
process.stdout.write(
  `${JSON.stringify({ rows, filled, fill_ms: fillMs.toFixed(0), node: process.version, result }, null, 2)}\n`,
)
db.close()
