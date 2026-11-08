export const scenario = {
  why: "The 2026-11-06 incident: a long-lived process opens the store a second time while short runs and a sqlite3 shell open and close it",
  seconds: 60,
  messages: 20000,
  writers: [
    { role: "serve", args: { batch: 20, gap: 300, "reopen-every": 10 } },
    { role: "sync", count: 3, after: 1000, args: { batch: 50, gap: 1500 } },
    { role: "sqlite3", after: 2000, args: { gap: 3000 } },
  ],
}
