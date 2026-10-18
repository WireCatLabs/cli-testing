// Counts the modules one import loads, by package. Run from a consumer checkout:
//   node --import <this file> --input-type=module -e "await import('@wirecat/cli-core/cli')"
import { registerHooks } from "node:module"

const seen = new Map()
registerHooks({
  load(url, context, next) {
    const m = url.match(/node_modules\/\.pnpm\/[^/]+\/node_modules\/((@[^/]+\/)?[^/]+)/)
    const key = m ? m[1] : url.split(":")[0]
    seen.set(key, (seen.get(key) ?? 0) + 1)
    return next(url, context)
  },
})
process.on("exit", () => {
  const rows = [...seen].sort((a, b) => b[1] - a[1])
  const total = rows.reduce((sum, [, n]) => sum + n, 0)
  process.stdout.write(`modules ${total}\n`)
  for (const [key, n] of rows.slice(0, 15)) process.stdout.write(`${n} ${key}\n`)
})
