import { mail, memo, store, tg } from "./mix.mjs"
import { scenario as t1 } from "./T1.mjs"

// T1 with the role writers in place of the generic sync ones, so the damage and the recovery can be counted per
// table (BUG-627).
export const scenario = {
  ...t1,
  ...store,
  messages: 20000,
  why: "The 2026-11-06 incident with writers that write like tg, mail and memo, so lost rows can be counted per table",
  writers: [
    t1.writers[0],
    { ...tg, after: 1000 },
    { ...mail, after: 1000 },
    { ...memo, after: 1000 },
    t1.writers.find((writer) => writer.role === "sqlite3"),
  ],
}
