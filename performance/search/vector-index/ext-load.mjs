// usage: node|bun ext-load.mjs [custom libsqlite3 path, Bun only]
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const vecPath = require("sqlite-vec").getLoadablePath()
const isBun = "Bun" in globalThis
const runtime = isBun ? `bun ${Bun.version}` : `node ${process.version}`
const custom = process.argv[2]
const print = (line) => process.stdout.write(`${line}\n`)
const report = (step, ok, detail) => print(JSON.stringify({ runtime, custom: custom ?? null, step, ok, detail }))
const probe = (run) => {
  try {
    report("sqlite", true, run("select sqlite_version() v").v)
    const omit = run(
      "select count(*) n from pragma_compile_options where compile_options like 'OMIT_LOAD_EXTENSION%'",
    ).n
    report("compiled-without-OMIT_LOAD_EXTENSION", omit === 0, omit)
  } catch (error) {
    report("sqlite", false, error.message)
  }
}
const check = (db, run, exec) => {
  try {
    db.loadExtension(vecPath)
    exec("create virtual table t using vec0(kind text partition key, e float[4])")
    exec("insert into t(rowid, kind, e) values (1, 'message', '[1,0,0,0]'), (2, 'image', '[1,0,0,0]')")
    const hit = run("select rowid, distance from t where e match '[1,0,0,0]' and k = 5 and kind = 'image'")
    report("load vec0 + KNN with partition", true, { vec: run("select vec_version() v").v, hit })
  } catch (error) {
    report("load vec0", false, `${error.code ?? ""} ${error.message}`)
  }
  try {
    exec("create virtual table d using vec0(e float[4] indexed by diskann(neighbor_quantizer=binary))")
    report("diskann index", true, "accepted")
  } catch (error) {
    report("diskann index", false, error.message)
  }
}
if (isBun) {
  const { Database } = await import("bun:sqlite")
  if (custom) {
    try {
      Database.setCustomSQLite(custom)
      report("setCustomSQLite", true, custom)
    } catch (error) {
      report("setCustomSQLite", false, error.message)
    }
  }
  const db = new Database(":memory:")
  const run = (s) => db.query(s).get()
  probe(run)
  check(db, run, (s) => db.exec(s))
} else {
  const { DatabaseSync } = await import("node:sqlite")
  const plain = new DatabaseSync(":memory:")
  try {
    plain.loadExtension(vecPath)
    report("load without allowExtension", true, "loaded")
  } catch (error) {
    report("load without allowExtension", false, `${error.code ?? ""} ${error.message}`)
  }
  let db
  try {
    db = new DatabaseSync(":memory:", { allowExtension: true })
  } catch (error) {
    report("allowExtension option", false, error.message)
    process.exit(0)
  }
  const run = (s) => db.prepare(s).get()
  probe(run)
  check(db, run, (s) => db.exec(s))
}
