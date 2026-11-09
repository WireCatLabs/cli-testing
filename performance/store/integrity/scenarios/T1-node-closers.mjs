import { scenario as t1 } from "./T1.mjs"

export const scenario = {
  ...t1,
  why: "T1 without the sqlite3 shell: do Node's own closes delete the WAL a lock-less process still writes into?",
  writers: t1.writers.filter((writer) => writer.role !== "sqlite3"),
}
