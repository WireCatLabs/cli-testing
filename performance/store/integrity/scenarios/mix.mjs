// The writers most scenarios share: one of each real CLI's write pattern, at a pace that crosses an auto-checkpoint
// every few seconds on a small store.
export const tg = { role: "tg", args: { batch: 100, batches: 3, gap: 800 } }
export const mail = { role: "mail", args: { batch: 50, batches: 2, gap: 1000, "trace-errors": "yes" } }
export const memo = { role: "memo", args: { batch: 20, batches: 2, gap: 1500, "trace-errors": "yes" } }
// A long-lived process that never opens the store a second time: `serve` as it is after P2.
export const serve = { role: "serve", args: { batch: 20, gap: 300, "reopen-every": 1_000_000 } }
export const store = { messages: 5000, emails: 1000, notes: 200 }

export const random = (from, to) => from + Math.random() * (to - from)
export const exited = (handle) => handle.exited
