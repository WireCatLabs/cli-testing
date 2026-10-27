// node --import ./resolves.mjs ...: counts module resolutions by kind of specifier, and the most resolved bare ones.
import { registerHooks } from "node:module"

const counts = { relative: 0, bare: 0, builtin: 0, other: 0 }
const bare = new Map()
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".")) counts.relative++
    else if (specifier.startsWith("node:")) counts.builtin++
    else if (/^[@a-z]/i.test(specifier)) {
      counts.bare++
      bare.set(specifier, (bare.get(specifier) ?? 0) + 1)
    } else counts.other++
    return next(specifier, context)
  },
})
process.on("exit", () => {
  const top = [...bare].sort((a, b) => b[1] - a[1]).slice(0, 12)
  process.stderr.write(`${JSON.stringify({ ...counts, distinct_bare: bare.size, top })}\n`)
})
