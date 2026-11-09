import { statSync } from "node:fs"
import { mail, store, tg } from "./mix.mjs"

// No root for a small tmpfs, so the disk is "full" for one process: RLIMIT_FSIZE a little above the store's size.
// Node ignores SIGXFSZ, so a write past the limit fails with EFBIG and SQLite answers SQLITE_FULL.
export const scenario = {
  why: "Disk full for one writer: its file-size limit is 2 MB above the store, while two other writers go on",
  seconds: 60,
  ...store,
  writers: [tg, { ...mail, after: 300 }],
}

export const drive = async ({ store: path, startWriter, note, sleep }) => {
  for (let i = 0; i < 5; i++) {
    await sleep(3000)
    const limit = statSync(path).size + 2 * 2 ** 20
    const writer = startWriter(
      {
        ...tg,
        wrap: (node) => ["prlimit", [`--fsize=${limit}:${limit}`, node]],
        args: { ...tg.args, batch: 400, gap: 0, "trace-errors": "yes" },
      },
      { seconds: 15 },
    )
    const exit = await writer.exited
    note({ round: i, limit, code: exit.code, signal: exit.signal })
  }
}
