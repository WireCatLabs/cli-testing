import { mail, memo, random, serve, store, tg } from "./mix.mjs"

const ROUNDS = 10

export const scenario = {
  why: "Power cut, first pass: every writer is killed at once, ten times; the page cache survives, so this checks only what kill -9 of all writers does",
  seconds: 120,
  ...store,
  writers: [],
}

export const drive = async ({ startWriter, kill, note, sleep }) => {
  for (let i = 0; i < ROUNDS; i++) {
    const writers = [tg, tg, mail, memo, serve].map((writer) => startWriter(writer, { seconds: 30 }))
    await sleep(random(2000, 6000))
    for (const writer of writers) kill(writer, `round ${i}`)
    await Promise.all(writers.map((writer) => writer.exited))
    note({ round: i })
    await sleep(300)
  }
}
