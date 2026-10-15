import assert from "node:assert/strict"
import { createRequire, syncBuiltinESMExports } from "node:module"

const origin = new URL(process.env.DRIVE_TEST_MODEL_ORIGIN).origin
assert.equal(new URL(origin).hostname, "127.0.0.1")
const require = createRequire(`${process.env.DRIVE_TEST_PACKAGE}/package.json`)
const deny = () => {
  throw new Error("Unexpected network/browser/keyring access")
}
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.origin !== origin || url.pathname !== "/v1/chat/completions" || init?.method !== "POST") deny()
  return originalFetch(input, { ...init, redirect: "error" })
}
for (const name of ["node:http", "node:https"]) {
  const module = require(name)
  module.request = deny
  module.get = deny
}
for (const name of ["exec", "execFile", "spawn", "fork", "execSync", "execFileSync", "spawnSync"])
  require("node:child_process")[name] = deny
syncBuiltinESMExports()
const baseRequire = createRequire(require.resolve("@wirecat/cli-base"))
const keyring = baseRequire.resolve("@napi-rs/keyring")
require.cache[keyring] = {
  id: keyring,
  filename: keyring,
  loaded: true,
  exports: {
    Entry: class {
      constructor() {
        deny()
      }
    },
  },
}
