// Preload with `node --import <this>`: counts every ESM/CJS module loaded and prints a per-package tally on exit.

import { appendFileSync, writeSync } from "node:fs"
import { registerHooks } from "node:module"

const seen = new Map()
registerHooks({
  load(url, context, next) {
    const out = next(url, context)
    if (url.startsWith("file:")) {
      const m = url.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)\//)
      const pkg = m ? m[1] : "(app)"
      const size = out.source ? out.source.length : 0
      const cur = seen.get(pkg) ?? { files: 0, bytes: 0 }
      seen.set(pkg, { files: cur.files + 1, bytes: cur.bytes + size })
    }
    return out
  },
})
process.on("exit", () => {
  const rows = [...seen].sort((a, b) => b[1].bytes - a[1].bytes)
  const total = rows.reduce((s, [, v]) => ({ files: s.files + v.files, bytes: s.bytes + v.bytes }), {
    files: 0,
    bytes: 0,
  })
  const out = process.env.COUNT_OUT
  const text = JSON.stringify({ total, top: rows.slice(0, 15).map(([k, v]) => ({ pkg: k, ...v })) })
  if (out) appendFileSync(out, `${text}\n`)
  else writeSync(2, `${text}\n`)
})
