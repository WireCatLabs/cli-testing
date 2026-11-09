import { rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { check } from "../check.mjs"
import { mail, memo, store, tg } from "./mix.mjs"

export const scenario = {
  why: "store backup (VACUUM INTO) five times while four writers write: do the writers wait too long, and is each backup whole?",
  seconds: 60,
  ...store,
  messages: 20000,
  writers: [tg, { ...tg, after: 150 }, { ...mail, after: 300 }, { ...memo, after: 450 }],
}

const backups = []

export const drive = async ({ runDir, command, note, sleep }) => {
  for (let i = 0; i < 5; i++) {
    await sleep(6000)
    const file = join(runDir, `backup-${i}.db`)
    const at = Date.now()
    const out = await command(["store", "backup", file])
    backups.push({ file, at, ms: Date.now() - at, code: out.code })
    note({ backup: i, ms: Date.now() - at, code: out.code })
  }
}

export const after = async ({ ledgers }) => {
  const out = []
  for (const backup of backups) {
    const checks = await check(backup.file, ledgers, { before: backup.at })
    out.push({
      ms: backup.ms,
      code: backup.code,
      bytes: statSync(backup.file).size,
      verdict: checks.verdict,
      quick_check: checks.quick_check?.ok,
      fts: checks.fts?.ok,
      vec: checks.vec?.ok,
      missing_before_start: checks.ledger?.missing,
    })
    rmSync(backup.file)
  }
  return out
}
