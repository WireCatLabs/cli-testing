import { DatabaseSync } from "node:sqlite"
import { CURRENT } from "../lib.mjs"
import { random, store, tg } from "./mix.mjs"

const OLD = "0.593.0"
const KILLS = 20

export const scenario = {
  why: "kill -9 of a current cli-core during its first open of a 0.593.0 store, the open that migrates it",
  seconds: 90,
  ...store,
  messages: 20000,
  storeCore: OLD,
  writers: [],
}

const schema = (path) => {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    return db.prepare("SELECT max(version) AS v FROM schema_migrations").get().v
  } finally {
    db.close()
  }
}

// Each kill lands on the 1st to 3rd BEGIN IMMEDIATE of the open, plus up to 20 ms; a migration killed midway rolls
// back, so the next round migrates again, until one gets through.
export const drive = async ({ store: path, startWriter, kill, note }) => {
  for (let i = 0; i < KILLS; i++) {
    const writer = startWriter({ ...tg, core: CURRENT, args: { ...tg.args, mark: "yes" } }, { seconds: 10 })
    const target = 1 + Math.floor(Math.random() * 3)
    let begins = 0
    const why = await new Promise((resolve) => {
      writer.on("mark", (mark) => {
        if (mark === "begin" && ++begins === target) setTimeout(() => resolve(`begin ${target}`), random(0, 20))
      })
      setTimeout(() => resolve("2 s"), 2000)
      writer.exited.then(() => resolve("exited"))
    })
    kill(writer, why)
    await writer.exited
    note({ round: i, at: why, schema: schema(path) })
  }
  const last = startWriter({ ...tg, core: CURRENT }, { seconds: 5 })
  note({ final_open: (await last.exited).code, schema: schema(path) })
}
