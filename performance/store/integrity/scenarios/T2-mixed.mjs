import { mail, memo, store, tg } from "./mix.mjs"

// The versions the CLIs had on 2026-11-06 next to the current one, each with its own write pattern. The store is
// made by the oldest, so the newer ones migrate it on their first open, as an upgrade of one CLI does.
export const scenario = {
  why: "T2 with mixed cli-core versions in one run: tg on 0.593.0, mail on 0.608.0, memo on the current one",
  seconds: 120,
  ...store,
  storeCore: "0.593.0",
  writers: [
    { ...tg, core: "0.593.0" },
    { ...mail, core: "0.608.0", after: 300 },
    { ...memo, after: 600 },
    { role: "reader", core: "0.593.0", after: 900, args: { gap: 700 } },
  ],
}
