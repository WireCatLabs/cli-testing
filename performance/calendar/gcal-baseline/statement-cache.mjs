// Usage: node statement-cache.mjs <gcal checkout> [--timing]
// Gives the checkout's installed cli-core a per-connection prepared-statement cache in its node:sqlite driver, the
// fix this page measures. The file is rewritten, not edited in place: pnpm hard-links it to its global store.
import { readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const core = realpathSync(join(process.argv[2], "node_modules/@wirecat/cli-core"))
const file = join(core, "dist/store/drivers/node-sqlite.js")
const before = readFileSync(file, "utf8")
if (before.includes("const cache = new Map()")) {
  process.stdout.write(`already patched: ${file}\n`)
  process.exit(0)
}
const after = before
  .replace(
    "export const cacheOverNodeSqlite = (database) => {\n    return {",
    "export const cacheOverNodeSqlite = (database) => {\n    const cache = new Map();\n    return {",
  )
  .replace(
    "const statement = database.prepare(sql);",
    "let statement = cache.get(sql);\n" +
      "            if (!statement) {\n" +
      "                statement = database.prepare(sql);\n" +
      "                if (cache.size > 500) cache.clear();\n" +
      "                cache.set(sql, statement);\n" +
      "            }",
  )
const timing = process.argv[3] === "--timing"
// --timing: with BENCH_SQL_PROFILE=<file> set, each statement's total time and count go to that file at exit.
const timed = !timing
  ? after
  : after
      .replace(
        "export const cacheOverNodeSqlite = (database) => {",
        "const SQL_TIME = new Map();\n" +
          'if (process.env.BENCH_SQL_PROFILE) process.on("exit", () => process.getBuiltinModule("node:fs").writeFileSync(' +
          "process.env.BENCH_SQL_PROFILE, JSON.stringify([...SQL_TIME].sort((a, b) => b[1].ms - a[1].ms).slice(0, 20)" +
          '.map(([q, v]) => ({ ms: Math.round(v.ms), n: v.n, q: q.replace(/\\s+/g, " ").slice(0, 160) })), null, 1)));\n' +
          "const timed = (sql, fn) => (...a) => { const t = performance.now(); try { return fn(...a) } finally {" +
          " const c = SQL_TIME.get(sql) ?? { ms: 0, n: 0 }; c.ms += performance.now() - t; c.n++; SQL_TIME.set(sql, c) } };\n" +
          "export const cacheOverNodeSqlite = (database) => {",
      )
      .replace("exec: (sql) => database.exec(sql),", "exec: (sql) => timed(sql, () => database.exec(sql))(),")
      .replace("run: (...parameters) =>", "run: timed(sql, (...parameters) =>")
      .replace("statement.run(...parameters).changes) }),", "statement.run(...parameters).changes) })),")
      .replace(
        "get: (...parameters) => statement.get(...parameters),",
        "get: timed(sql, (...parameters) => statement.get(...parameters)),",
      )
      .replace(
        "all: (...parameters) => statement.all(...parameters),",
        "all: timed(sql, (...parameters) => statement.all(...parameters)),",
      )
if (after === before || !after.includes("cache.get(sql)")) throw new Error(`driver shape changed: ${file}`)
unlinkSync(file)
writeFileSync(file, timed)
process.stdout.write(`patched: ${file}\n`)
