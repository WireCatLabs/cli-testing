import { existsSync, statSync } from "node:fs"
import { mail, store, tg } from "./mix.mjs"

// A measurement, not a break: how far the WAL grows while one reader keeps a read transaction open. 30 s without
// the reader, then 30 s with it.
export const scenario = {
  why: "WAL growth while a long query_only reader holds a read transaction and writers checkpoint",
  seconds: 70,
  ...store,
  writers: [tg, { ...tg, after: 150 }, { ...mail, after: 300 }],
}

const samples = []

export const drive = async ({ store: path, startWriter, note, sleep, started }) => {
  const sample = setInterval(() => {
    const wal = `${path}-wal`
    samples.push({ t: Date.now() - started, wal: existsSync(wal) ? statSync(wal).size : 0 })
  }, 250)
  await sleep(32_000)
  note({ reader: "start" })
  const reader = startWriter({ role: "long-read", args: { "hold-s": 30 } }, { seconds: 31 })
  await reader.exited
  note({ reader: "end" })
  clearInterval(sample)
}

export const after = async ({ events }) => {
  const start = events.find((event) => event.reader === "start")?.at_ms ?? Infinity
  const max = (list) => Math.max(0, ...list.map((sample) => sample.wal))
  const mb = (bytes) => Math.round((bytes / 2 ** 20) * 10) / 10
  return {
    wal_max_mb_without_reader: mb(max(samples.filter((sample) => sample.t < start))),
    wal_max_mb_with_reader: mb(max(samples.filter((sample) => sample.t >= start))),
    samples: samples.length,
  }
}
