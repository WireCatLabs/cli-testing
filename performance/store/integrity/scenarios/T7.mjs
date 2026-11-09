import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { check } from "../check.mjs"
import { mail, memo, store, tg } from "./mix.mjs"

export const scenario = {
  why: "Copies of the store taken while writers write: cp of the db alone, cp of db+wal+shm, sqlite3 .backup, VACUUM INTO, store backup; is each copy a whole store?",
  seconds: 40,
  ...store,
  writers: [tg, { ...tg, after: 150 }, { ...mail, after: 300 }, { ...memo, after: 450 }],
}

const copies = {
  "cp-db": (path, dir) => copyFileSync(path, join(dir, "wirecat.db")),
  "cp-db-wal-shm": (path, dir) => {
    for (const part of ["", "-wal", "-shm"])
      if (existsSync(path + part)) copyFileSync(path + part, join(dir, `wirecat.db${part}`))
  },
  "sqlite3-backup": (path, dir) =>
    execFileSync("sqlite3", ["-cmd", ".timeout 5000", path, `.backup '${join(dir, "wirecat.db")}'`]),
  "vacuum-into": (path, dir) =>
    execFileSync(process.execPath, [
      "-e",
      `const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(${JSON.stringify(path)});db.exec("PRAGMA busy_timeout=5000");db.prepare("VACUUM INTO ?").run(${JSON.stringify(join(dir, "wirecat.db"))});db.close()`,
    ]),
}

const results = []

export const drive = async ({ store: path, runDir, note, sleep, command }) => {
  await sleep(10_000)
  for (const [name, take] of Object.entries(copies)) {
    const dir = join(runDir, "copies", name)
    mkdirSync(dir, { recursive: true })
    const at = Date.now()
    try {
      take(path, dir)
      results.push({ name, dir, at, ms: Date.now() - at })
    } catch (error) {
      results.push({ name, at, error: String(error.message).slice(0, 300) })
    }
    await sleep(2000)
  }
  const dir = join(runDir, "copies", "store-backup")
  mkdirSync(dir, { recursive: true })
  const at = Date.now()
  const out = await command(["store", "backup", join(dir, "wirecat.db")])
  results.push({ name: "store-backup", dir, at, ms: Date.now() - at, code: out.code })
  note({ copies: results.length })
}

// Each copy is checked on its own, after the writers stopped; the ledger is cut at the moment the copy began, so a
// committed row older than the copy that the copy lacks counts as missing. The copies are removed after the check.
export const after = async ({ ledgers }) => {
  const out = {}
  for (const copy of results) {
    if (!copy.dir) {
      out[copy.name] = { error: copy.error }
      continue
    }
    const checks = await check(join(copy.dir, "wirecat.db"), ledgers, { before: copy.at - 1000 })
    out[copy.name] = {
      ms: copy.ms,
      bytes: statSync(join(copy.dir, "wirecat.db")).size,
      verdict: checks.verdict,
      quick_check: checks.quick_check?.ok,
      fts: checks.fts?.ok,
      vec: checks.vec?.ok,
      ledger: checks.ledger && { missing: checks.ledger.missing, partial: checks.ledger.partial },
      open: checks.open,
    }
    rmSync(copy.dir, { recursive: true })
  }
  return out
}
