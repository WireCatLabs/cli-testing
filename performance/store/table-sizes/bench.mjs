// Usage: node bench.mjs <cli-core checkout with dist> <store file> [warm repeats]
// Works on a copy of the store in a temporary directory, never on the file given, and prints totals only: no table
// name, row count or path, so the output of a run on a real store can be published.
import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"

const [core, source, repeatsArg = "2"] = process.argv.slice(2)
if (!core || !source) {
  process.stderr.write("usage: node bench.mjs <cli-core checkout with dist> <store file> [warm repeats]\n")
  process.exit(2)
}
const load = (entry) => import(pathToFileURL(join(core, "dist", entry)).href)
const { run, settingsFor, storeCommand } = await load("cli/index.js")
const coreRequire = createRequire(join(core, "package.json"))
const { captureStreams } = await import(pathToFileURL(coreRequire.resolve("@wirecat/cli-base")).href)

const repeats = Number(repeatsArg)
const app = { command: "bench", appName: "bench-cli", envPrefix: "BENCH", description: "bench", version: "0.0.0" }
const root = mkdtempSync(join(tmpdir(), "store-table-sizes-"))
const copy = join(root, "store.db")
const env = { BENCH_STATE_DIR: join(root, "state"), BENCH_CONFIG_DIR: join(root, "config"), MESSAGING_STORE: copy }

const seconds = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`)
const timed = async (work) => {
  const start = performance.now()
  const value = await work()
  return { ms: performance.now() - start, value }
}

const cli = async (argv) => {
  const messenger = {
    app,
    provider: "bench",
    resolveSettings: settingsFor(app).resolveSettings,
    connect: async () => {
      throw new Error("the store commands timed here never connect")
    },
    chatArgument: "a chat",
  }
  const streams = captureStreams()
  const code = await run(
    [...argv, "--json"],
    { app, commands: () => [storeCommand(messenger)] },
    {
      streams,
      tty: false,
      env,
    },
  )
  if (code !== 0) throw new Error(`${argv.join(" ")} exited ${code}: ${streams.stderr.join("").slice(0, 300)}`)
  return JSON.parse(streams.stdout[0] ?? "null")
}

const sql = (query) => {
  const database = new DatabaseSync(copy, { readOnly: true })
  try {
    return database.prepare(query).all()
  } finally {
    database.close()
  }
}

// The first implementation's exact query was not kept. Both joins put dbstat on the inner side: with the OR (a table
// or one of its indexes) SQLite cannot hand dbstat the name, so it walks the whole file for every outer row.
const DBSTAT_JOINED_OR = `
  SELECT t.name, sum(d.pgsize) AS bytes
  FROM pragma_table_list AS t JOIN dbstat AS d ON d.aggregate = 1 AND (d.name = t.name
    OR d.name IN (SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = t.name))
  WHERE t.schema = 'main'
  GROUP BY t.name`
const DBSTAT_JOINED_ON_NAME = `
  SELECT s.tbl_name AS name, sum(d.pgsize) AS bytes
  FROM sqlite_schema AS s CROSS JOIN dbstat AS d
  WHERE d.name = s.name AND d.aggregate = 1 AND s.type IN ('table', 'index')
  GROUP BY s.tbl_name`
const DBSTAT_ONCE = "SELECT name, pgsize FROM dbstat WHERE schema = 'main' AND aggregate = 1"
const DBSTAT_GROUPED = "SELECT name, sum(pgsize) AS bytes FROM dbstat GROUP BY name"

const say = (text) => process.stdout.write(`${text}\n`)
const rows = []
const record = (what, pass, ms) => rows.push({ what, pass, ms })

try {
  const copied = await timed(() => {
    copyFileSync(source, copy)
    if (existsSync(`${source}-wal`)) copyFileSync(`${source}-wal`, `${copy}-wal`)
    chmodSync(copy, 0o444)
  })
  record("copy the store", "—", copied.ms)

  const passes = ["first", ...Array.from({ length: repeats }, (_, i) => `warm ${i + 1}`)]
  let shape
  for (const pass of passes) {
    record("store info", pass, (await timed(() => cli(["store", "info"]))).ms)
    const listed = await timed(() => cli(["store", "tables", "list"]))
    record("store tables list", pass, listed.ms)
    shape ??= listed.value.items
    record("store tables list --full", pass, (await timed(() => cli(["store", "tables", "list", "--full"]))).ms)
  }
  for (const pass of passes.slice(0, 2)) {
    record("dbstat read once (as --full does)", pass, (await timed(() => sql(DBSTAT_ONCE))).ms)
    record("dbstat joined on name only", pass, (await timed(() => sql(DBSTAT_JOINED_ON_NAME))).ms)
    if (pass === "first") record("dbstat joined with OR", pass, (await timed(() => sql(DBSTAT_JOINED_OR))).ms)
    record("dbstat GROUP BY name", pass, (await timed(() => sql(DBSTAT_GROUPED))).ms)
    record("PRAGMA quick_check", pass, (await timed(() => sql("PRAGMA quick_check(20)"))).ms)
    record("PRAGMA integrity_check", pass, (await timed(() => sql("PRAGMA integrity_check(20)"))).ms)
    record("store check", pass, (await timed(() => cli(["store", "check"]))).ms)
  }

  for (const [label, query] of [
    ["read once", DBSTAT_ONCE],
    ["joined on name only", DBSTAT_JOINED_ON_NAME],
    ["joined with OR", DBSTAT_JOINED_OR],
  ]) {
    say(
      `Plan, dbstat ${label}:\n${sql(`EXPLAIN QUERY PLAN ${query}`)
        .map((row) => `  ${row.detail}`)
        .join("\n")}`,
    )
  }
  const kinds = Object.groupBy(shape, (table) => table.kind)
  say(`Node ${process.versions.node}, SQLite ${process.versions.sqlite}`)
  say(`Store: ${(statSync(copy).size / 1e9).toFixed(2)} GB, ${shape.length} tables`)
  say(
    Object.entries(kinds)
      .map(([kind, tables]) => `  ${kind}: ${tables.length}`)
      .join("\n"),
  )
  say(`  row counts taken: ${shape.filter((table) => table.rows !== null).length}\n`)
  say("| what | pass | time |\n|---|---|---|")
  for (const { what, pass, ms } of rows) say(`| ${what} | ${pass} | ${seconds(ms)} |`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
