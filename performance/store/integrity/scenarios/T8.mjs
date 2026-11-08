import { homedir } from "node:os"
import { join } from "node:path"
import { mail, memo, store, tg } from "./mix.mjs"

const NODE_22 = process.env.NODE_22 ?? join(homedir(), ".nvm", "versions", "node", "v22.23.2", "bin", "node")

export const scenario = {
  why: "Two more SQLite builds writing the same file: a tg writer on Node 22.23.2 and the sqlite3 shell 3.46.1 inserting rows itself, next to Node 24 writers",
  seconds: 90,
  ...store,
  writers: [
    tg,
    { ...tg, node: NODE_22, after: 200 },
    { ...mail, after: 400 },
    { ...memo, node: NODE_22, after: 600 },
    { role: "sqlite3-write", after: 800, args: { batch: 50, gap: 700 } },
  ],
}
