// usage: TRACE_OUT=trace.tsv node --import ./graph-hook.mjs <bin.js> --help — one `parent<TAB>child` line per resolved import.

import { appendFileSync } from "node:fs"
import { registerHooks } from "node:module"

const out = process.env.TRACE_OUT
registerHooks({
  resolve(specifier, context, next) {
    const r = next(specifier, context)
    appendFileSync(out, `${context.parentURL ?? "-"}\t${r.url}\n`)
    return r
  },
})
