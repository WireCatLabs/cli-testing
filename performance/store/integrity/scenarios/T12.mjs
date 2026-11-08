import { CURRENT } from "../lib.mjs"
import { mail, store, tg } from "./mix.mjs"

// The store is made by 0.593.0 (schema 52). Its writers run while a current writer opens it and migrates it to the
// current schema; then a current writer is killed at random moments of its first open, before any migration has
// finished, on a second fresh store. `--core` is not used: the versions are the point.
const OLD = "0.593.0"

export const scenario = {
  why: "A migration while an older cli-core writes, and kill -9 during a migration",
  seconds: 60,
  ...store,
  storeCore: OLD,
  writers: [
    { ...tg, core: OLD },
    { ...mail, core: OLD, after: 300 },
  ],
}

export const drive = async ({ startWriter, note, sleep }) => {
  await sleep(5000)
  const migrator = startWriter({ ...tg, core: CURRENT }, { seconds: 20 })
  const exit = await migrator.exited
  note({ migrated_by: CURRENT, code: exit.code })
  await sleep(2000)
  const late = startWriter({ ...tg, core: OLD }, { seconds: 10 })
  note({ old_writer_after_migration: OLD, code: (await late.exited).code })
}
