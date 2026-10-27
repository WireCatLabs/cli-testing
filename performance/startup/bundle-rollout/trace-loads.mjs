import { appendFileSync } from "node:fs"
import { registerHooks } from "node:module"

const log = process.env.TRACE_LOG
const mine = (url) => typeof url === "string" && url.includes("/@wirecat/")
const note = (line) => {
  try {
    appendFileSync(log, `${new Date().toISOString()} ${process.pid} ${line}\n`)
  } catch {}
}
if (log)
  registerHooks({
    resolve(specifier, context, next) {
      try {
        return next(specifier, context)
      } catch (error) {
        if (mine(context.parentURL)) note(`RESOLVE-FAIL ${error.code} ${specifier} from ${context.parentURL}`)
        throw error
      }
    },
    load(url, context, next) {
      try {
        const result = next(url, context)
        if (mine(url)) note(`load ${url}`)
        return result
      } catch (error) {
        if (mine(url)) note(`LOAD-FAIL ${error.code} ${url}`)
        throw error
      }
    },
  })
