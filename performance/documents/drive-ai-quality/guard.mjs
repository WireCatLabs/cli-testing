import childProcess from "node:child_process"
import { syncBuiltinESMExports } from "node:module"

const original = globalThis.fetch
// The experiment sends only its synthetic cases to one explicitly selected model endpoint.
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.origin !== "https://api.deepseek.com" || url.pathname !== "/chat/completions")
    throw new Error("quality network guard refused endpoint")
  return original(input, options)
}
for (const method of ["spawn", "exec", "execFile", "spawnSync", "execSync", "execFileSync"])
  childProcess[method] = () => {
    throw new Error("quality process guard: no browser or keyring")
  }
syncBuiltinESMExports()
