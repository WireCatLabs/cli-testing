import { mail, random, store, tg } from "./mix.mjs"

const KILLS = 50

export const scenario = {
  why: "kill -9 during a wal_checkpoint(TRUNCATE), as quiesce or memo erase runs one, while writers keep the WAL growing",
  seconds: 120,
  ...store,
  writers: [
    { ...tg, args: { ...tg.args, batch: 200 } },
    { ...tg, after: 200, args: { ...tg.args, batch: 200 } },
    { ...mail, after: 400 },
  ],
}

export const drive = async ({ startWriter, kill, note, sleep, seconds, started }) => {
  for (let i = 0; i < KILLS && Date.now() - started < seconds * 1000 - 5000; i++) {
    const checkpointer = startWriter({ role: "checkpoint", args: { gap: 20 } }, { seconds: 30 })
    let marks = 0
    checkpointer.on("mark", () => marks++)
    await sleep(random(200, 1500))
    kill(checkpointer, "random")
    await checkpointer.exited
    note({ round: i, checkpoints_started: marks })
    await sleep(random(100, 300))
  }
}
