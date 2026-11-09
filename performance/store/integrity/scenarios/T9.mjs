import { mkdirSync, symlinkSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { mail, memo, store, tg } from "./mix.mjs"

// The real CLIs agree on one path, but a person or an agent can reach the store through a symlink or a relative
// path. SQLite names -wal and -shm after the path it was given; do all of them still meet on one lock set?
const linkedDir = (path) => {
  const link = join(dirname(dirname(path)), "linked-store")
  try {
    symlinkSync(dirname(path), link)
  } catch {}
  return join(link, "wirecat.db")
}
const linkedFile = (path) => {
  const dir = join(dirname(dirname(path)), "alias")
  mkdirSync(dir, { recursive: true })
  try {
    symlinkSync(path, join(dir, "alias.db"))
  } catch {}
  return join(dir, "alias.db")
}

export const scenario = {
  why: "The same store through a symlinked folder, a symlink to the file and a relative path, with the real path, at once",
  seconds: 90,
  ...store,
  writers: [
    tg,
    { ...tg, after: 200, path: linkedDir },
    { ...mail, after: 400, path: linkedFile },
    { ...memo, after: 600, path: (path) => relative(process.cwd(), path) },
    { role: "sqlite3", after: 800, path: linkedFile, args: { gap: 1500 } },
  ],
}
