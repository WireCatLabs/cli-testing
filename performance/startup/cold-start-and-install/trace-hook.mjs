import { writeFileSync } from "node:fs"
import { registerHooks } from "node:module"

const out = process.env.TRACE_OUT
const loaded = new Set()

// registerHooks sees both import and require, so ESM and CommonJS packages are counted the same way.
registerHooks({
  load(url, context, nextLoad) {
    loaded.add(url)
    return nextLoad(url, context)
  },
})

const dlopen = process.dlopen
process.dlopen = (module, filename, ...rest) => {
  loaded.add(`native:${filename}`)
  return dlopen.call(process, module, filename, ...rest)
}

process.on("exit", () => {
  writeFileSync(out, JSON.stringify([...loaded]))
})
