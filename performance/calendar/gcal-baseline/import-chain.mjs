// Preload: prints the import chain that first reaches each module whose URL contains one of CHAIN_OF (comma list).

import { writeSync } from "node:fs"
import { registerHooks } from "node:module"

const wanted = (process.env.CHAIN_OF ?? "").split(",")
const parentOf = new Map()
const short = (url) => url?.replace(/.*node_modules\//, "").replace(/.*\/dist\//, "gcal:dist/")
registerHooks({
  resolve(specifier, context, next) {
    const out = next(specifier, context)
    if (!parentOf.has(out.url)) parentOf.set(out.url, context.parentURL)
    return out
  },
})
process.on("exit", () => {
  for (const want of wanted) {
    const url = [...parentOf.keys()].find((one) => one.includes(want))
    if (!url) {
      writeSync(2, `${want}: not loaded\n`)
      continue
    }
    const chain = []
    for (let cur = url; cur && chain.length < 25; cur = parentOf.get(cur)) chain.push(short(cur))
    writeSync(2, `${want}:\n  ${chain.join("\n  <- ")}\n`)
  }
})
