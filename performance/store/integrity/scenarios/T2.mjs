import { mail, memo, store, tg } from "./mix.mjs"

export const scenario = {
  why: "Concurrent writers that write like the real CLIs, table by table: tg pages of messages, mail slices of threads with deletions, memo one file note per transaction, each with its embed step",
  seconds: 120,
  ...store,
  writers: [
    { ...tg, count: 2 },
    { ...mail, count: 2, after: 300 },
    { ...memo, after: 600 },
    { role: "reader", after: 900, args: { gap: 700 } },
  ],
}
