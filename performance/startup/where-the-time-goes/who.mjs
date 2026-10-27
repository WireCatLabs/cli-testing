// node --import ./who.mjs ...: prints which file first imports each third-party package (WHO_PACKAGES=a,b,c).
import { registerHooks } from "node:module"

const wanted = (process.env.WHO_PACKAGES ?? "").split(",")
const first = new Map()
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context)
    for (const name of wanted)
      if (!first.has(name) && result.url.includes(`/node_modules/${name}/`))
        first.set(name, `${specifier}  <-  ${(context.parentURL ?? "").replace(/.*node_modules\//, "")}`)
    return result
  },
})
process.on("exit", () => {
  for (const [name, by] of first) process.stderr.write(`${name}: ${by}\n`)
})
