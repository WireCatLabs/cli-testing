import { mail, memo, random, store, tg } from "./mix.mjs"

const KILLS = 50

export const scenario = {
  why: "kill -9 inside BEGIN IMMEDIATE: half the kills just before COMMIT, half at a random moment after BEGIN, while other writers go on",
  seconds: 150,
  ...store,
  writers: [mail, { ...memo, after: 500 }],
}

// A tg writer with big pages, so a transaction spills pages into the WAL before its commit. The writer marks a batch,
// BEGIN and COMMIT on stdout; the kill lands on the batch's COMMIT, or a random 0–40 ms after its BEGIN.
export const drive = async ({ startWriter, kill, note, sleep, seconds, started }) => {
  for (let i = 0; i < KILLS && Date.now() - started < seconds * 1000 - 5000; i++) {
    const atCommit = i % 2 === 0
    const writer = startWriter(
      {
        ...tg,
        args: {
          ...tg.args,
          batch: 400,
          batches: 1000,
          gap: 0,
          mark: "yes",
          ...(atCommit ? { hold: "commit", "hold-ms": 300 } : {}),
        },
      },
      { seconds: 60 },
    )
    const seen = await new Promise((resolve) => {
      let armed = false
      writer.on("mark", (mark) => {
        if (mark === "batch") armed = true
        if (atCommit && armed && mark === "commit") resolve(mark)
        if (!atCommit && armed && mark === "begin") setTimeout(() => resolve("begin+random"), random(0, 40))
      })
      writer.exited.then(() => resolve("exited"))
    })
    kill(writer, seen)
    await writer.exited
    note({ round: i, at: seen })
    await sleep(random(100, 400))
  }
}
