import { execFileSync } from "node:child_process"
import { copyFileSync } from "node:fs"
import { join } from "node:path"
import { mail, serve, store, tg } from "./mix.mjs"

// A sync client that resolves a conflict by putting back the copy it took earlier, the way rsync replaces a file:
// a new file renamed over the old one. Scaled down from a minute to 10 s.
export const scenario = {
  why: "A sync folder: rsync puts back over the live store the copy of the db file taken 10 s earlier",
  seconds: 40,
  ...store,
  writers: [serve, { ...tg, after: 200 }, { ...mail, after: 400 }],
}

export const drive = async ({ store: path, runDir, note, sleep }) => {
  await sleep(5000)
  const copy = join(runDir, "synced-copy.db")
  copyFileSync(path, copy)
  note({ copied: "db" })
  await sleep(10_000)
  execFileSync("rsync", ["--times", copy, path])
  note({ rsync: "db" })
}
