import { mail, store } from "./mix.mjs"

export const scenario = {
  why: "Contentless FTS5 under concurrency: four mail writers insert and mark deleted, a fifth process runs FTS5 optimize on every full-text table",
  seconds: 90,
  ...store,
  writers: [
    { ...mail, count: 4, args: { ...mail.args, gap: 600 } },
    { role: "optimize", after: 2000, args: { gap: 1500 } },
  ],
}
