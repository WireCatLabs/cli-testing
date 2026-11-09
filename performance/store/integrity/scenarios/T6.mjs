import { copyFileSync, existsSync, renameSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { mail, serve, store, tg } from "./mix.mjs"

// What another program does to the store's own files while cli-core has them open. Not a cli-core action: the run
// shows what each costs and whether cli-core notices. `--variant wal|shm|swap`, read from the environment.
const VARIANT = process.env.T6_VARIANT ?? "wal"

export const scenario = {
  why: `-${VARIANT === "swap" ? "wal replaced by another store's -wal" : `${VARIANT} deleted`} while writers have the store open`,
  seconds: 45,
  ...store,
  writers: [serve, { ...tg, after: 200 }, { ...mail, after: 400 }],
}

export const drive = async ({ store: path, runDir, note, sleep }) => {
  await sleep(15_000)
  const size = (file) => (existsSync(file) ? statSync(file).size : null)
  if (VARIANT === "swap") {
    const other = join(runDir, "other.db")
    const db = new DatabaseSync(other)
    db.exec(
      "PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE t(x); INSERT INTO t VALUES (1), (2)",
    )
    copyFileSync(`${other}-wal`, `${path}-wal.swap`)
    db.close()
    rmSync(other)
    note({ swap: "-wal", own_bytes: size(`${path}-wal`), other_bytes: size(`${path}-wal.swap`) })
    renameSync(`${path}-wal.swap`, `${path}-wal`)
  } else {
    note({ deleted: `-${VARIANT}`, bytes: size(`${path}-${VARIANT}`) })
    rmSync(`${path}-${VARIANT}`, { force: true })
  }
}
