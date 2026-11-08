// node recover.mjs <run folder> [--core <version>] — runs cli-core's `store recover run` (recoverStore) on a copy of
// the broken store a run kept, then the harness checks on the result. The kept file is never written to.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { check } from "./check.mjs"
import { args, installCore, loadCore } from "./lib.mjs"

const opts = args(process.argv.slice(2))
const [runDir] = opts._
const core = opts.core ?? "0.608.0"
const kept = join(runDir, "kept")
if (!existsSync(join(kept, "wirecat.db"))) throw new Error(`${runDir} kept no broken store`)

installCore(core)
const { recoverStore } = await loadCore(core, "store/recover.js")
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dir = join(runDir, `recover-${core}-${stamp}`)
mkdirSync(dir)
const store = join(dir, "wirecat.db")
for (const part of ["", "-wal", "-shm"])
  if (existsSync(join(kept, `wirecat.db${part}`))) copyFileSync(join(kept, `wirecat.db${part}`), store + part)

const ledgers = readdirSync(join(runDir, "ledgers"))
  .filter((file) => file.endsWith(".jsonl"))
  .map((file) => join(runDir, "ledgers", file))
const before = JSON.parse(readFileSync(join(runDir, "result.json"), "utf8"))
let recovery
try {
  recovery = await recoverStore({ path: store, command: "harness" })
} catch (error) {
  recovery = { error: String(error.message), reason: error.details?.reason ?? null }
}
const after = await check(store, ledgers)
const result = {
  run: runDir,
  core,
  broken_verdict: before.verdict,
  recovery: recovery.error
    ? recovery
    : {
        sqlite3: recovery.sqlite3,
        seconds: recovery.seconds,
        lost: recovery.lost,
        copy_errors: recovery.copyErrors,
        health_ok: recovery.health.ok,
      },
  after: {
    // The run's own writer errors would mark every recovered store broke; only the file's checks count here.
    verdict:
      !after.quick_check?.ok || !after.integrity_check?.ok || !after.fts?.ok
        ? "broke"
        : after.ledger.missing > 0
          ? "lost"
          : "ok",
    quick_check: after.quick_check?.ok,
    integrity_check: after.integrity_check?.ok,
    fts: after.fts,
    ledger: after.ledger,
  },
}
writeFileSync(join(dir, "result.json"), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(result)}\n`)
